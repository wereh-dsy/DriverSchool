import { Group, Mesh, MeshBasicMaterial, Vector2, Vector3 } from 'three';
import type { DrivingGround } from '../DrivingGround';
import { SURFACE_MATERIALS, surfaceResponseAliases, type RoadSurfaceSample } from '../SurfaceMaterial';
import { createSubject3Materials } from '../subject3/materials';
import type { CityMapData, CityPoint } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { junctionExtent, roadEdges, rotatePoint } from './geometry';
import { PrefabRegistry } from './PrefabRegistry';
import { SectorManager, type SectorOptions } from './SectorManager';
import { roadStructureColliders } from './RoadInfrastructure';
import { roadSignColliders } from './RoadSignTemplates';

import { runtimeRoadClearance } from './RoadClearance';
import { cityGroundGeometry } from './CityGroundGeometry';
import {junctionSurfaceContains,junctionSurfaceHeight,compileJunctionSurface} from './JunctionSurface';
import { roadPavementSurface,roadPavementTriangle } from './RoadPavementSurface';
import {roadEdgeChains} from './RoadEdgeChain';
import { createStaticOBBCollider } from '../../vehicle/physics/CollisionSystem';
import { RegionalDebug } from '../regional/RegionalDebug';
import type { CityResourceTiming, CityRuntimeData } from './CityRuntimeData';

interface SurfaceArea { reference?: import('../SurfaceMaterial').SurfaceReference; contains(x: number, z: number): boolean; pavement: boolean; heightAt(x: number, z: number): number; extensionAt?: (x: number, z: number) => number; gx: number; gz: number; roadId?: string; segmentIndex?: number }
export interface SurfaceQueryDebug {
  x: number; z: number; referenceHeight: number; chosen: string | null;
  candidates: { id: string; roadId?: string; segmentIndex?: number; segmentId?: string; height: number; normal: {x:number;y:number;z:number};
    distance: number; score: number; accepted: boolean; reason?: string }[];
}
export class CityGround implements DrivingGround {
  readonly root = new Group();
  readonly data: CityMapData;
  readonly metadata;
  readonly worldBounds;
  readonly spawnPose;
  readonly roadNetwork;
  readonly colliders;
  readonly sectors: SectorManager;
  get trafficSignals(): import('../navigation/TrafficSignalState').TrafficSignalProvider { return this.sectors.signals; }
  private readonly materials = { ...createSubject3Materials(), tunnelLight: new MeshBasicMaterial({color:0xffefd0}) };
  private readonly prefabs = new PrefabRegistry(this.materials);
  private readonly surfaces = new Map<string, SurfaceArea[]>();
  private readonly editor: boolean;
  private referenceHeight = 0;
  private surfaceSequence = 0;
  private readonly terrainReference = { surfaceId: 'terrain' };
  /** Optional diagnostics only; normal sampling allocates no candidate records. */
  public surfaceQueryObserver?: (query: SurfaceQueryDebug) => void;
  private readonly regionalDebug?:RegionalDebug;
  private readonly loadStarted=performance.now();
  readonly initializationMs: Record<string, number> = {};
  resourceTiming?: CityResourceTiming;
  private readonly milestones: Record<string, number> = {};
  markLoadMilestone(name: 'firstRender' | 'playable'): void {
    if (this.milestones[name] !== undefined) return;
    const started = this.resourceTiming?.startedAt ?? this.loadStarted;
    this.milestones[name] = performance.now() - started;
    performance.measure(`city:${name}`, { start: started, end: performance.now() });
    if (name === 'playable' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('cityProfile') === '1') console.info('City startup', this.loadStatistics);
  }
  private sectorStartOffset=0;
  get visualReady(): boolean { return this.sectors.spawnReady; }
  get visualLoadingError(): Error | undefined { return this.sectors.loadingError; }
  setVisualResourcePreparation(prepare: (texture: import('three').Texture) => void,
    warmup?: (root: Group) => Promise<unknown>): void { this.sectors.setResourcePreparation(prepare, warmup); }
  setVisualObserver(observer: (root: import('three').Object3D, added: boolean) => void): void { this.sectors.setVisualObserver(observer); }
  updateVisualVisibility(eye: Vector3, fogFar: number, cameras: readonly import('three').Camera[]): void { this.sectors.updateVisibility(eye, fogFar, cameras); }
  get loadStatistics(){const stats=this.sectors.loadStatistics;return {...stats,initializationMs:this.initializationMs,resource:this.resourceTiming,milestones:this.milestones,firstVisibleMs:stats.firstVisibleMs===undefined?undefined:this.sectorStartOffset+stats.firstVisibleMs,firstLoadMs:stats.firstLoadMs===undefined?undefined:this.sectorStartOffset+stats.firstLoadMs};}
  constructor(data: unknown, options: SectorOptions & { spawnId?: string; runtime?: CityRuntimeData } = {}) {
    let stage = performance.now();
    const measured = (name: string) => { const now = performance.now(); this.initializationMs[name] = now - stage; performance.measure(`city:${name}`, {start:stage,end:now}); stage = now; };
    this.data = options.runtime?.map ?? loadCityMap(data); this.editor = options.editor ?? false;
    measured('loadCityMap');
    if(this.data.regional){this.materials.asphalt.polygonOffset=true;this.materials.asphalt.polygonOffsetFactor=-1;this.materials.asphalt.polygonOffsetUnits=-1;}
    this.worldBounds = this.data.bounds;
    this.metadata = { id: this.data.id, version: this.data.version, displayName: this.data.name, description: 'Data-driven City Map' };
    this.roadNetwork = options.runtime?.roadNetwork ?? buildCityRoadNetwork(this.data);
    measured('roadNetwork');
    this.root.name = this.data.name; this.root.userData.renderCategory = 'WORLD';
    const groundAreas=this.data.regional?[this.data.regional.cityBounds,...this.data.regional.cityExtensions??[]]:[this.data.bounds];
    for(const bounds of groundAreas){const base = new Mesh(cityGroundGeometry(this.data,bounds), this.materials.grass);base.receiveShadow = true;this.root.add(base);}
    measured('groundGeometry');
    this.sectorStartOffset=performance.now()-this.loadStarted;
    this.sectors = new SectorManager(this.data, this.materials, this.prefabs, options); this.root.add(this.sectors.root);
    measured('sectorManager');
    const clearance = runtimeRoadClearance(this.data);
    measured('clearanceIndex');
    this.colliders = [...this.data.objects.flatMap(o => { const c = this.prefabs.collider(o); return c ? [c] : []; }), ...this.data.roads.flatMap(r => roadStructureColliders(r, this.data, clearance)),...(this.data.signs??[]).flatMap(roadSignColliders)];
    for(const j of this.data.intersections.filter(j=>j.channelized))for(const sign of [-1,1]) {
      const h=junctionExtent(j,this.data),q=rotatePoint({x:sign*(h-2.5),z:sign*(h-2.5)},j.rotation);
      this.colliders.push(createStaticOBBCollider({id:j.id+':island:'+sign,x:j.position.x+q.x,z:j.position.z+q.z,width:2,length:2,yaw:j.rotation,minHeight:j.position.y??0,maxHeight:(j.position.y??0)+0.18,type:'obstacle'}));
    }
    measured('colliders');
    const junctionMasks=new Map(this.data.intersections.filter(j=>j.pavementFootprint).map(j=>[j.id,compileJunctionSurface(j)]));
    const sourceRoads = new Map(this.data.roads.map(r => [r.id, r]));
    for (const road of this.roadNetwork.segments) {
      const source = sourceRoads.get(road.id)!;
      const edges = roadEdges(source);
      const sidewalk = source.sidewalk?.enabled ? source.sidewalk.width : 0;
      const masks=[road.startIntersectionId,road.endIntersectionId].flatMap(id=>id&&junctionMasks.has(id)?[junctionMasks.get(id)!]:[]);
      if(source.pavementSurface==='ribbon'){
        const chain=roadEdgeChains(this.data);
        for(const extra of sidewalk?[0,sidewalk]:[0]){
        const left=chain.edge(source,edges.left-extra),right=chain.edge(source,edges.right+extra);
        for(let i=1;i<left.length;i++)for(const [k,triangle]of [[left[i-1]!,right[i-1]!,left[i]!],[right[i-1]!,right[i]!,left[i]!]].entries()){
          const [a,b,c]=triangle as [CityPoint,CityPoint,CityPoint];if(Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))<1e-8)continue;
          const plane=roadPavementTriangle(a,b,c,Math.hypot(left[i]!.x-left[i-1]!.x,left[i]!.z-left[i-1]!.z),masks);
          this.addArea({minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)},
            {roadId:road.id,segmentIndex:(i-1)*2+k,pavement:extra>0,...plane,contains:plane.contains(0)});
        }}
        continue;
      }
      for (let i = 1; i < road.centerline.length; i++) {
        const a = road.centerline[i - 1]!, c = road.centerline[i]!;
        const {heightAt,extensionAt,contains,gx,gz}=roadPavementSurface(a,c,edges,
          i===1&&!!road.startIntersectionId,i===road.centerline.length-1&&!!road.endIntersectionId,masks);
        const margin = Math.max(-edges.left, edges.right) + sidewalk;
        const bounds = { minX: Math.min(a.x, c.x) - margin, maxX: Math.max(a.x, c.x) + margin, minZ: Math.min(a.z, c.z) - margin, maxZ: Math.max(a.z, c.z) + margin };
        this.addArea(bounds, { roadId: road.id, segmentIndex: i - 1, contains: contains(0), pavement: false, heightAt, extensionAt, gx, gz });
        if (sidewalk) this.addArea(bounds, { roadId: road.id, segmentIndex: i - 1, contains: contains(sidewalk), pavement: true, heightAt, extensionAt, gx, gz });
      }
    }
    for (const j of this.data.intersections) {
      if(j.pavementFootprint){
        const outline=j.pavementFootprint.map(p=>rotatePoint(p,j.rotation)),base=j.position.y??0;
        for(let i=0;i<outline.length;i++){
          const a=outline[i]!,b=outline[(i+1)%outline.length]!,den=a.x*b.z-a.z*b.x;if(Math.abs(den)<1e-8)continue;
          const gx=((a.y??0)*b.z-(b.y??0)*a.z)/den,gz=(a.x*(b.y??0)-b.x*(a.y??0))/den;
          this.addArea({minX:j.position.x+Math.min(0,a.x,b.x),maxX:j.position.x+Math.max(0,a.x,b.x),minZ:j.position.z+Math.min(0,a.z,b.z),maxZ:j.position.z+Math.max(0,a.z,b.z)},{pavement:false,gx,gz,heightAt:(x,z)=>base+gx*(x-j.position.x)+gz*(z-j.position.z),contains:(x,z)=>{const qx=x-j.position.x,qz=z-j.position.z,u=(qx*b.z-qz*b.x)/den,v=(a.x*qz-a.z*qx)/den;return u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6;}});
        }
        continue;
      }
      const h = junctionExtent(j, this.data), extent = h * (Math.abs(Math.cos(j.rotation)) + Math.abs(Math.sin(j.rotation)));
      this.addArea({ minX: j.position.x - extent, maxX: j.position.x + extent, minZ: j.position.z - extent, maxZ: j.position.z + extent }, {
        pavement: false, heightAt: (x,z) => junctionSurfaceHeight(j,{x,z}), gx: 0, gz: 0, contains: (x, z) => junctionSurfaceContains(j,this.data,{x,z}),
      });
    }
    for (const o of this.data.objects) if (o.prefabId === 'parking') {
      const w = 15 * (o.scale?.x ?? 1), d = 12 * (o.scale?.z ?? 1), e = Math.hypot(w, d);
      this.addArea({ minX: o.position.x - e, maxX: o.position.x + e, minZ: o.position.z - e, maxZ: o.position.z + e }, { pavement: false, heightAt: () => o.position.y ?? 0, gx: 0, gz: 0,
        contains: (x, z) => { const p = rotatePoint({ x: x - o.position.x, z: z - o.position.z }, -o.rotation); return Math.abs(p.x) <= w && Math.abs(p.z) <= d; } });
    }
    measured('surfaceIndex');
    const authored = this.data.environment.spawnPoints.find(s=>s.id===options.spawnId) ?? this.data.environment.spawnPoints[0]!;
    this.referenceHeight = authored.position.y ?? 0;
    let spawn: CityPoint = authored.position;
    // Empty maps can be previewed; playable maps get a safe on-road fallback.
    if (this.sampleRoadSurface(spawn.x, spawn.z).surfaceType !== 'asphalt' && this.roadNetwork.segments.length) {
      const road = this.roadNetwork.segments[0]!, a = road.centerline[0]!, c = road.centerline[1]!;
      const dx = c.x - a.x, dz = c.z - a.z, length = Math.hypot(dx, dz);
      spawn = { x: (a.x + c.x) / 2 - dz / length * road.laneWidth / 2, y: ((a.y ?? 0) + (c.y ?? 0)) / 2, z: (a.z + c.z) / 2 + dx / length * road.laneWidth / 2 };
      this.referenceHeight = spawn.y ?? 0;
    }
    this.spawnPose = { position: new Vector3(spawn.x, this.getRoadHeightAt(spawn.x, spawn.z) + 0.04, spawn.z), yawRadians: authored.rotation };
    if (!this.editor) this.sectors.updatePosition(spawn.x, spawn.z);
    if(this.data.regional&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('regionalDebug')==='1')this.regionalDebug=new RegionalDebug(this.sectors);
    measured('spawnPreparation');
  }
  private addArea(b: DrivingGround['worldBounds'], area: SurfaceArea): void {
    const segmentId = area.roadId === undefined ? undefined : `${area.roadId}:${area.segmentIndex ?? 0}`;
    area.reference = { roadId: area.roadId, segmentId,
      surfaceId: `${segmentId ?? `junction:${this.surfaceSequence++}`}:${area.pavement ? 'sidewalk' : 'road'}` };
    const size = this.data.sectorSize;
    for (let x = Math.floor(b.minX / size); x <= Math.floor(b.maxX / size); x++) for (let z = Math.floor(b.minZ / size); z <= Math.floor(b.maxZ / size); z++) {
      const key = `${x},${z}`, bucket = this.surfaces.get(key) ?? []; bucket.push(area); this.surfaces.set(key, bucket);
    }
  }
  sampleRoadSurface(x: number, z: number, direction: { x: number; y: number } = { x: 0, y: -1 }, referenceHeight = this.referenceHeight,
    observer = this.surfaceQueryObserver, support?: import('../SurfaceMaterial').SurfaceSupportHint): RoadSurfaceSample {
    const areas = this.surfaces.get(`${Math.floor(x / this.data.sectorSize)},${Math.floor(z / this.data.sectorSize)}`);
    let selected: SurfaceArea | undefined, best = Infinity, height = 0;
    const candidates: SurfaceQueryDebug['candidates'] | undefined = observer ? [] : undefined;
    if (areas) for (const area of areas) if (area.contains(x, z)) {
      const y = area.heightAt(x, z), delta = Math.abs(y - referenceHeight);
      const extension = area.extensionAt?.(x, z) ?? 0;
      const length = Math.hypot(area.gx, 1, area.gz);
      const normalDot = support ? (-area.gx * support.normal.x + support.normal.y - area.gz * support.normal.z) / length : 1;
      // End caps still fill seams, but cannot keep an old segment after its
      // centreline ends. Adjacent segments on the same road share preference.
      const continuous = support?.reference && support.previousReachable && extension < .02 &&
        delta <= support.heightTolerance && normalDot > .85;
      const preferred = continuous && (area.reference?.surfaceId === support.reference?.surfaceId ||
        area.roadId !== undefined && area.roadId === support.reference?.roadId);
      const score = delta + extension * 10 + (area.pavement ? 0.2 : 0) -
        (preferred ? support!.withinTick ? support!.heightTolerance : .04 : 0) +
        (area.reference?.surfaceId === support?.transientSurface ? support!.heightTolerance : 0);
      if (candidates) { const length = Math.hypot(area.gx, 1, area.gz);
        candidates.push({id: area.reference!.surfaceId,
          roadId:area.roadId,segmentIndex:area.segmentIndex,segmentId:area.reference?.segmentId,height:y,normal:{x:-area.gx/length,y:1/length,z:-area.gz/length},
          distance:area.extensionAt?.(x,z) ?? 0,score,accepted:delta<=1.75,
          reason:delta>1.75 ? 'outside-support-height-envelope' : 'eligible-score-ranked'}); }
      // A nearby support plane follows continuous ramps; a distant upper deck cannot capture a ground vehicle.
      if (delta > 1.75) continue;
      // Segment end caps fill bend seams but must not hold a car at the previous ramp sample's height.
      if (score < best) { best = score; selected = area; height = y; }
    }
    if (candidates) {
      for (const candidate of candidates) if (candidate.accepted) {
        candidate.reason = candidate.id === selected?.reference?.surfaceId ? 'selected-lowest-score' : 'higher-score';
      }
      observer!({x,z,referenceHeight,candidates,chosen:selected?.reference?.surfaceId ?? null});
    }
    const terrain=this.sectors.terrain?.sampler;
    if(!selected&&terrain)height=terrain.heightAt(x,z);
    const gx = selected?.gx ?? (terrain?(terrain.heightAt(x+.5,z)-terrain.heightAt(x-.5,z)):0), gz = selected?.gz ?? (terrain?(terrain.heightAt(x,z+.5)-terrain.heightAt(x,z-.5)):0), length = Math.hypot(direction.x, direction.y) || 1;
    return { reference: selected?.reference ?? this.terrainReference, referenceHeight,
      height, gradient: new Vector2(gx, gz), normal: new Vector3(-gx, 1, -gz).normalize(), grade: (gx * direction.x + gz * direction.y) / length,
      ...surfaceResponseAliases(SURFACE_MATERIALS[selected ? selected.pavement ? 'concrete' : 'asphalt' : 'grass']) };
  }
  sampleRoadSurfaceForSupport(x: number, z: number, hint: import('../SurfaceMaterial').SurfaceSupportHint): RoadSurfaceSample {
    return this.sampleRoadSurface(x, z, undefined, hint.height, this.surfaceQueryObserver, hint);
  }
  debugSurfaceCandidates(x: number, z: number, referenceHeight: number): SurfaceQueryDebug {
    let result!: SurfaceQueryDebug;
    this.sampleRoadSurface(x, z, undefined, referenceHeight, query => { result = query; });
    return result;
  }
  getRoadHeightAt(x: number, z: number): number { return this.sampleRoadSurface(x, z).height; }
  getRoadPitchAt(x: number, z: number, yaw: number): number { return Math.atan(this.sampleRoadSurface(x, z, { x: -Math.sin(yaw), y: -Math.cos(yaw) }).grade); }
  setSurfaceReferenceHeight(height: number): void { this.referenceHeight = height; }
  update(dt: number): void { this.sectors.update(dt); }
  updatePlayerPosition(x: number, z: number,yaw=0,speed=0): boolean {
    const changed=!this.editor&&this.sectors.updatePosition(x,z,yaw,speed);this.regionalDebug?.update();return changed;
  }
  dispose(): void {
    this.regionalDebug?.dispose();
    this.sectors.dispose(() => {
      this.prefabs.dispose();
      this.root.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
      for (const material of Object.values(this.materials)) material.dispose();
      this.root.clear();
    });
  }
}
