import { roadFunction } from './RoadClassification';
import { Box3, BufferAttribute, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Material, Matrix4, Mesh, Sphere, Vector3, type Camera, type Object3D, type Texture } from 'three';
import { PREFAB_IDS, type CityIntersection, type CityMapData, type CityObject, type CityRoad } from './CityMapData';
import type { Subject3Materials } from '../subject3/materials';
import { CityTrafficSignals } from './CityTrafficSignals';
import { RoadBuilder } from './RoadBuilder';
import { IntersectionBuilder } from './IntersectionBuilder';
import { PrefabRegistry } from './PrefabRegistry';
import { RoadSignRenderer } from './RoadSignRenderer';
import type { RoadSignDefinition } from './RoadSignData';
import { roadPoints, roadEdges } from './geometry';
import { createStripGeometry } from '../subject3/geometry';
import { RegionalStreaming, type StreamingSelection, type StreamingTier } from '../regional/RegionalStreaming';
import { RegionalTerrain } from '../regional/RegionalTerrain';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VisualStreamingWorker } from './VisualStreamingWorker';
import { importVisualGeometry, type CompiledRoadVisual, type TerrainVisualData, type VisualGeometryData } from './VisualStreamingData';
import { RegionalBackgroundBatches } from '../regional/RegionalBackgroundBatches';
import { FogVisibility } from './FogVisibility';

interface GeometryPlan { positions: number[]; normals: number[]; uvs: number[]; material: Material; chunks?: VisualGeometryData[] }
interface InstancePlan { geometry: BufferGeometry; material: Material; matrices: Matrix4[]; lamp: boolean }
interface SectorPlan { surfaces: Map<Material, GeometryPlan>; instances: Map<BufferGeometry, InstancePlan>; intersections: CityIntersection[]; objects: CityObject[];signs:RoadSignDefinition[];roads:Set<CityRoad>;barrierTriangles:number }
interface PublicationJob { tier: StreamingTier; root: Group; task: Generator<void>; built?: boolean; warmed?: boolean; preparation?: Promise<unknown> }
export interface SectorOptions { loadRadius?: number; editor?: boolean }
export class SectorManager {
  readonly root = new Group();
  readonly active = new Map<string, Group>();
  private readonly plans = new Map<string, SectorPlan>();
  private readonly infrastructureGeometry = new Set<BufferGeometry>();
  private readonly intersectionBuilder: IntersectionBuilder;
  readonly signRenderer:RoadSignRenderer;
  readonly signals: CityTrafficSignals;
  private currentX = Infinity;
  private currentZ = Infinity;
  private readonly roadBuilder:RoadBuilder;
  private readonly compiled=new Set<string>();
  private readonly activeTiers=new Map<string,StreamingTier>();
  readonly streaming?:RegionalStreaming;
  readonly terrain?:RegionalTerrain;
  debugState?:StreamingSelection;
  private readonly background=new Group();
  private readonly skyline=new Group();
  private selectionSignature='';
  private pending:string[]=[];
  private preloadRoads:CityRoad[]=[];
  private backgroundPending:string[]=[];
  private backgroundBuilt=0;
  private backgroundOrdered = false;
  private readonly loadStarted=performance.now();
  private firstReadyMs:number|undefined;
  private firstVisibleMs:number|undefined;
  private constructorMs=0;
  private publicationMs=0;
  private readonly visualWorker?: VisualStreamingWorker;
  private readonly requestedRoads = new Set<string>();
  private readonly requestedTerrain = new Set<string>();
  private readonly terrainData = new Map<string, TerrainVisualData>();
  private readonly receivedRoads: CompiledRoadVisual[] = [];
  private readonly instanceGeometry = new Map<string, BufferGeometry>();
  private readonly publications = new Map<string, PublicationJob>();
  private readonly retiring: { key: string; job: PublicationJob }[] = [];
  private readonly backgroundBatches = new RegionalBackgroundBatches();
  private readonly fogVisibility = new FogVisibility();
  public updateVisibility(eye: Vector3, fogFar: number, cameras: readonly Camera[]): void {
    this.fogVisibility.configure(eye, fogFar, cameras);
    for (const root of this.active.values()) this.fogVisibility.update(root);
  }
  private prepareTexture?: (texture: Texture) => void;
  private prepareRoot?: (root: Group) => Promise<unknown>;
  private visualObserver?: (root: Object3D, added: boolean) => void;
  private preparationError?: Error;
  private disposed = false;
  public setResourcePreparation(prepare: (texture: Texture) => void, warmup?: (root: Group) => Promise<unknown>): void {
    this.prepareTexture = prepare; this.prepareRoot = warmup;
  }
  public setVisualObserver(observer: (root: Object3D, added: boolean) => void): void { this.visualObserver = observer; }
  public get loadingError(): Error | undefined { return this.preparationError ?? this.visualWorker?.error; }
  public get spawnReady(): boolean { return !this.visualWorker || !!this.debugState && this.activeTiers.get(this.debugState.currentSector) === 'near'; }
  /** Compact pull-based statistics: no per-frame console output. */
  get loadStatistics(){
    const roads=new Set<CityRoad>();let signs=0,barrierTriangles=0;
    for(const key of this.active.keys())if(this.activeTiers.get(key)==='near'){const plan=this.plans.get(key);plan?.roads.forEach(r=>roads.add(r));signs+=plan?.signs.length??0;barrierTriangles+=plan?.barrierTriangles??0;}
    return {sectorCount:this.active.size,totalSectors:this.streaming?.sectors.size??this.plans.size,roadCount:roads.size,compiledRoadCount:this.compiled.size,signCount:signs,barrierCount:Math.ceil(barrierTriangles/4),backgroundSectors:this.backgroundBuilt,backgroundBatches:this.backgroundBatches.count,constructorMs:this.constructorMs,publicationMs:this.publicationMs,worker:this.visualWorker?.timings,firstVisibleMs:this.firstVisibleMs,firstLoadMs:this.firstReadyMs};
  }
  readonly loadRadius: number;
  get ready():boolean {return this.pending.every(key=>this.active.has(key));}
  constructor(readonly map: CityMapData, private readonly materials: Subject3Materials, readonly prefabs: PrefabRegistry, options: SectorOptions = {}) {
    this.loadRadius = Math.max(0, Math.floor(options.loadRadius ?? 1));
    this.intersectionBuilder = new IntersectionBuilder(map, materials);
    this.signRenderer=new RoadSignRenderer(map.roadNames??{});
    this.signals = new CityTrafficSignals(map);
    this.root.add(this.signals.root);
    this.roadBuilder = new RoadBuilder(materials, map);
    if(map.regional){this.streaming=new RegionalStreaming(map);this.terrain=new RegionalTerrain(map);}
    if (map.regional && !options.editor && typeof Worker !== 'undefined') {
      this.visualWorker = new VisualStreamingWorker(map, data => this.receivedRoads.push(data), data => {
        this.requestedTerrain.delete(data.key + ':' + data.tier); this.terrainData.set(data.key + ':' + data.tier, data);
      });
    }
    // Compile only CPU plans. Runtime GPU meshes exist only in active sectors.
    for (const road of map.roads) {
      if(this.streaming){const points=roadPoints(road);for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,margin=road.laneCount*road.laneWidth/2+6;for(let x=Math.floor((Math.min(a.x,b.x)-margin)/map.sectorSize);x<=Math.floor((Math.max(a.x,b.x)+margin)/map.sectorSize);x++)for(let z=Math.floor((Math.min(a.z,b.z)-margin)/map.sectorSize);z<=Math.floor((Math.max(a.z,b.z)+margin)/map.sectorSize);z++)this.plan(`${x},${z}`).roads.add(road);}}
      else this.compileRoad(road);
    }
    for (const j of map.intersections) this.plan(this.key(j.position.x, j.position.z)).intersections.push(j);
    for (const o of map.objects) this.plan(this.key(o.position.x, o.position.z)).objects.push(o);
    for(const sign of map.signs??[])this.plan(this.key(sign.position.x,sign.position.z)).signs.push(sign);
    if(this.terrain&&this.streaming){
      // The entire far envelope is coarse and batched into two meshes, never a dense giant terrain.
      // Far land is scheduled after nearby roads, rather than constructing every
      // sector before the first playable frame. Each batch owns its geometry.
      this.backgroundPending=[...this.streaming.sectors];
      const silhouettes:BufferGeometry[]=[];
      for(const route of map.regional!.routes){const geometry=createStripGeometry(route.centerline,()=>0,{innerOffset:-route.lanes*3.75-5,outerOffset:route.lanes*3.75+5,yOffset:.024,maximumSpacing:80});if(geometry){const colors=new Float32Array(geometry.getAttribute('position').count*3);colors.fill(.16);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));this.terrain!.drapeSilhouette(geometry,'far');silhouettes.push(geometry);}}
      for(const road of map.roads.filter(r=>!r.id.startsWith('regional:')&&roadFunction(r)==='expressway'&&r.laneCount>=3&&!r.gore)){const edges=roadEdges(road),geometry=createStripGeometry(roadPoints(road),()=>0,{innerOffset:edges.left,outerOffset:edges.right,yOffset:.024,maximumSpacing:80});if(geometry){const colors=new Float32Array(geometry.getAttribute('position').count*3);colors.fill(.16);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));this.terrain!.drapeSilhouette(geometry,'far');silhouettes.push(geometry);}}
      if(silhouettes.length){const geometry=mergeGeometries(silhouettes);silhouettes.forEach(g=>g.dispose());if(geometry)this.background.add(new Mesh(geometry,this.terrain.farRoad));}
      const forests:BufferGeometry[]=[];
      map.objects.filter(o=>o.id.startsWith('regional:')&&o.prefabId==='tree').filter((_,i)=>i%10===0).forEach(o=>{const geometry=new CylinderGeometry(0,14,12,5).toNonIndexed();geometry.translate(o.position.x,(o.position.y??0)+6,o.position.z);const colors=new Float32Array(geometry.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=.24;colors[i+1]=.35;colors[i+2]=.2;}geometry.setAttribute('color',new Float32BufferAttribute(colors,3));forests.push(geometry);});
      if(forests.length){const geometry=mergeGeometries(forests);forests.forEach(g=>g.dispose());if(geometry)this.background.add(new Mesh(geometry,this.terrain.farLand));}
      this.skyline.add(prefabs.buildInstances(map.objects.filter(o=>!o.id.startsWith('regional:')&&['office','residential_mid','industrial'].includes(o.prefabId))));
      this.root.add(this.background,this.skyline,this.backgroundBatches.root);
    }
    if (options.editor) {for(const road of map.roads)this.compileRoad(road);for (const key of this.plans.keys()) this.load(key);}
    this.constructorMs=performance.now()-this.loadStarted;
  }
  private compileRoad(road:CityRoad):void {
      if(this.compiled.has(road.id))return;this.compiled.add(road.id);
      const group = this.roadBuilder.build(road); group.updateMatrixWorld(true);
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        if (object instanceof InstancedMesh) {
          this.infrastructureGeometry.add(object.geometry);
          const matrix = new Matrix4(), position = new Vector3();
          for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld); position.setFromMatrixPosition(matrix);
            const sector = this.plan(this.key(position.x, position.z));
            let plan = sector.instances.get(object.geometry);
            if (!plan) { plan = { geometry: object.geometry, material: object.material as Material, matrices: [], lamp: object.userData.environmentLamp === true }; sector.instances.set(object.geometry, plan); }
            plan.matrices.push(matrix.clone());
          }
          object.dispose(); return;
        }
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uvs = geometry.getAttribute('uv');
        const material = object.material as Material;
        for (let i = 0; i < positions.count; i += 3) {
          const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
          const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
          const sector = this.plan(this.key(x, z));
          if(object.name==='road barrier')sector.barrierTriangles++;
          let plan = sector.surfaces.get(material);
          if (!plan) { plan = { positions: [], normals: [], uvs: [], material }; sector.surfaces.set(material, plan); }
          for (let v = i; v < i + 3; v++) {
            plan.positions.push(positions.getX(v), positions.getY(v), positions.getZ(v));
            plan.normals.push(normals.getX(v), normals.getY(v), normals.getZ(v));
            plan.uvs.push(uvs?.getX(v) ?? 0, uvs?.getY(v) ?? 0);
          }
        }
        geometry.dispose(); object.geometry.dispose();
      });
  }
  private key(x: number, z: number): string { return `${Math.floor(x / this.map.sectorSize)},${Math.floor(z / this.map.sectorSize)}`; }
  private plan(key: string): SectorPlan {
    let plan = this.plans.get(key);
    if (!plan) { plan = { surfaces: new Map(), instances: new Map(), intersections: [], objects: [],signs:[],roads:new Set(),barrierTriangles:0 }; this.plans.set(key, plan); }
    return plan;
  }
  updatePosition(x: number, z: number,yaw=0,speed=0): boolean {
    if (this.disposed || this.loadingError) return false;
    if (this.visualWorker) return this.updateWorkerVisuals(x, z, yaw, speed);
    if(this.streaming){const changed=this.updateRegional(x,z,yaw,speed);this.advanceBackground(x,z);if(this.firstVisibleMs===undefined&&this.active.has(this.streaming.key(x,z)))this.firstVisibleMs=performance.now()-this.loadStarted;if(this.firstReadyMs===undefined&&this.ready)this.firstReadyMs=performance.now()-this.loadStarted;return changed;}
    const sx = Math.floor(x / this.map.sectorSize), sz = Math.floor(z / this.map.sectorSize);
    if (sx === this.currentX && sz === this.currentZ) return false;
    this.currentX = sx; this.currentZ = sz;
    const wanted = new Set<string>();
    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) for (let dz = -this.loadRadius; dz <= this.loadRadius; dz++) {
      const key = `${sx + dx},${sz + dz}`; wanted.add(key); this.load(key);
    }
    for (const key of this.active.keys()) if (!wanted.has(key)) this.unload(key);
    return true;
  }
  private receiveRoad(data: CompiledRoadVisual): void {
    const palette = this.materials as unknown as Record<string, Material>;
    for (const p of data.surfaces) {
      const sector = this.plan(p.key), material = palette[p.material]!;
      let plan = sector.surfaces.get(material);
      if (!plan) { plan = { positions: [], normals: [], uvs: [], material, chunks: [] }; sector.surfaces.set(material, plan); }
      plan.chunks!.push(p.geometry); sector.barrierTriangles += p.barrierTriangles;
    }
    for (const p of data.instances) {
      if (p.geometry) { const geometry = importVisualGeometry(p.geometry); this.instanceGeometry.set(p.geometryId, geometry); this.infrastructureGeometry.add(geometry); }
      const geometry = this.instanceGeometry.get(p.geometryId)!; const sector = this.plan(p.key);
      let plan = sector.instances.get(geometry);
      if (!plan) { plan = { geometry, material: palette[p.material]!, matrices: [], lamp: p.lamp }; sector.instances.set(geometry, plan); }
      for (let i = 0; i < p.matrices.length; i += 16) plan.matrices.push(new Matrix4().fromArray(p.matrices, i));
    }
    this.compiled.add(data.id); this.requestedRoads.delete(data.id);
  }
  private requestRoad(road: CityRoad, priority: number): void {
    if (this.compiled.has(road.id)) return;
    this.requestedRoads.add(road.id); this.visualWorker!.request('road:' + road.id, { kind: 'road', id: road.id }, priority);
  }
  private requestTerrain(key: string, tier: StreamingTier, priority: number): TerrainVisualData | undefined {
    const id = key + ':' + tier, data = this.terrainData.get(id);
    if (!data && !this.requestedTerrain.has(id)) { this.requestedTerrain.add(id); this.visualWorker!.request(id, { kind: 'terrain', key, tier, roadIds: tier === 'mid' ? [...this.plans.get(key)?.roads ?? []].map(r => r.id) : undefined }, priority); }
    return data;
  }
  private mergeSurface(p: GeometryPlan): BufferGeometry {
    const chunks = p.chunks!, size = chunks.reduce((n, c) => n + c.position.length, 0), positions = new Float32Array(size), normals = new Float32Array(size), uvs = new Float32Array(size / 3 * 2);
    const bounds = new Box3(); let at = 0;
    for (const c of chunks) {
      positions.set(c.position, at); normals.set(c.normal, at); if (c.uv) uvs.set(c.uv, at / 3 * 2); at += c.position.length;
      bounds.union(new Box3(new Vector3(c.bounds[0], c.bounds[1], c.bounds[2]), new Vector3(c.bounds[3], c.bounds[4], c.bounds[5])));
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setAttribute('normal', new BufferAttribute(normals, 3)); geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.boundingBox = bounds; geometry.boundingSphere = bounds.getBoundingSphere(new Sphere());
    return geometry;
  }
  private *buildPublication(key: string, tier: StreamingTier, root: Group, terrain: TerrainVisualData): Generator<void> {
    const plan = this.plans.get(key);
    root.add(this.terrain!.fromCompiled(terrain)); yield;
    if (tier === 'mid') {
      if (terrain.roadSurface) { root.add(new Mesh(importVisualGeometry(terrain.roadSurface), this.materials.asphalt)); yield; }
    } else {
      for (const p of plan?.surfaces.values() ?? []) { const mesh = new Mesh(this.mergeSurface(p), p.material); mesh.receiveShadow = true; root.add(mesh); yield; }
      for (const p of plan?.instances.values() ?? []) { const mesh = new InstancedMesh(p.geometry, p.material, p.matrices.length); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.environmentLamp = p.lamp; p.matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere(); root.add(mesh); yield; }
      for (const j of plan?.intersections ?? []) {
        const count = this.signals.root.children.length;
        root.add(this.intersectionBuilder.build(j, this.signals, this.map.intersections.indexOf(j)));
        // Signal heads belong to this publication, including when it is cancelled.
        for (const head of this.signals.root.children.slice(count)) root.add(head);
        yield;
      }
    }
    const objects = tier === 'mid' ? plan?.objects.filter(o => ['industrial', 'office', 'residential_mid'].includes(o.prefabId) || o.prefabId === 'tree' && o.id.length % 4 === 0) ?? [] : plan?.objects ?? [];
    for (const id of PREFAB_IDS) { const selected = objects.filter(o => o.prefabId === id); if (selected.length) { root.add(this.prefabs.buildInstances(selected)); yield; } }
    if (tier === 'near') {
      for (const sign of plan?.signs ?? []) {
        const material = this.signRenderer.materialFor(sign); yield;
        if (material.map) { this.prepareTexture?.(material.map); yield; }
      }
      root.add(this.signRenderer.buildInstances(plan?.signs ?? [])); yield;
    }
    root.updateMatrixWorld(true); root.traverse(o => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; });
  }
  private updateWorkerVisuals(x: number, z: number, yaw: number, speed: number): boolean {
    const started = performance.now(), signature = `${this.key(x,z)}:${Math.floor(x / 100)},${Math.floor(z / 100)},${Math.round(yaw * 12 / Math.PI)},${Math.round(speed / 5)}`;
    let changed = false;
    if (signature !== this.selectionSignature) {
      this.selectionSignature = signature; this.debugState = this.streaming!.select(x, z, yaw, speed);
      const distances = new Map<string, number>();
      this.pending = [];
      for (const [key, tier] of this.debugState.tiers) if (tier !== 'far') { const [sx, sz] = key.split(',').map(Number); this.pending.push(key); distances.set(key, Math.hypot((sx! + .5) * this.map.sectorSize - x, (sz! + .5) * this.map.sectorSize - z) + (tier === 'mid' ? 2500 : 0)); }
      this.pending.sort((a, b) => distances.get(a)! - distances.get(b)!);
      if (!this.backgroundOrdered) {
        this.backgroundOrdered = true;
        const distances = new Map(this.backgroundPending.map(key => { const [sx, sz] = key.split(',').map(Number); return [key, Math.hypot((sx! + .5) * this.map.sectorSize - x, (sz! + .5) * this.map.sectorSize - z)] as const; }));
        this.backgroundPending.sort((a, b) => distances.get(a)! - distances.get(b)!);
      }
      const ids = new Set<string>();
      for (const id of this.debugState.structures) { const s = this.map.regional!.structures.find(s => s.id === id)!; for (const rid of s.roadIds) ids.add(rid); for (const route of this.map.regional!.routes) if (s.routes.includes(route.id)) for (const rid of route.roadIds) { const r = this.map.roads.find(r => r.id === rid)!; if (r.centerline.some(p => Math.hypot(p.x - s.center.x, p.z - s.center.z) < s.radius)) ids.add(rid); } }
      this.preloadRoads = this.map.roads.filter(r => ids.has(r.id));
      for (const key of this.active.keys()) if (!this.debugState.tiers.has(key) || this.debugState.tiers.get(key) === 'far') { this.unload(key); changed = true; }
      for (const [key, job] of this.publications) if (this.debugState.tiers.get(key) !== job.tier) {
        job.task.return(undefined); this.publications.delete(key);
        if (job.preparation) this.retiring.push({ key, job }); else this.disposePublication(key, job.root);
      }
      const city = this.map.regional!.cityBounds; this.skyline.visible = Math.hypot(x - (city.minX + city.maxX) / 2, z - (city.minZ + city.maxZ) / 2) > 2700;
    }
    // Worker replies only enqueue data. Main-thread installation shares one small frame budget.
    if (this.receivedRoads.length) this.receiveRoad(this.receivedRoads.shift()!);
    const current = this.debugState!.currentSector;
    for (const road of this.plans.get(current)?.roads ?? []) this.requestRoad(road, 0);
    for (const road of this.preloadRoads) this.requestRoad(road, 100);
    let candidates = 0;
    for (let index = -1; index < this.pending.length; index++) {
      const key = index < 0 ? current : this.pending[index]!;
      if (index >= 0 && key === current) continue;
      const tier = this.debugState!.tiers.get(key) ?? 'near';
      if (this.activeTiers.get(key) === tier || this.publications.has(key)) continue;
      if (++candidates > 4) break;
      const plan = this.plans.get(key);
      if (tier === 'near') { for (const road of plan?.roads ?? []) this.requestRoad(road, key === current ? 0 : 50 + candidates); if ([...plan?.roads ?? []].some(r => !this.compiled.has(r.id))) continue; }
      const terrain = this.requestTerrain(key, tier, key === current ? 1 : 200 + candidates);
      if (!terrain) continue;
      if (tier === 'near' && key !== current && this.preloadRoads.some(r => !this.compiled.has(r.id))) continue;
      const root = new Group(); root.name = `City sector ${key}`;
      this.publications.set(key, { tier, root, task: this.buildPublication(key, tier, root, terrain) });
    }
    let steps = 0;
    for (const [key, job] of this.publications) {
      if (steps >= 2 || performance.now() - started >= 3) break;
      if (job.preparation) continue;
      if (!job.built) { const buildStarted = performance.now(); job.built = job.task.next().done === true; this.publicationMs += performance.now() - buildStarted; steps++; }
      if (job.built && !job.warmed) {
        if (this.prepareRoot) {
          const warmupStarted = performance.now();
          job.preparation = Promise.resolve().then(() => this.prepareRoot!(job.root)).then(() => { performance.measure('city:sectorWarmup', {start:warmupStarted,end:performance.now()}); job.warmed = true; job.preparation = undefined; }, error => {
            this.preparationError = error instanceof Error ? error : new Error(String(error)); job.preparation = undefined;
          });
          continue;
        }
        job.warmed = true;
      }
      if (job.built && job.warmed) {
        if (this.active.has(key)) this.unload(key);
        this.active.set(key, job.root); this.activeTiers.set(key, job.tier); this.root.add(job.root); this.terrain!.setActive(key, true);
        this.visualObserver?.(job.root, true);
        this.publications.delete(key); changed = true;
      }
    }
    // Never dispose materials/geometries while compileAsync still borrows them.
    const retired = this.retiring.findIndex(entry => !entry.job.preparation);
    if (retired >= 0 && performance.now() - started < 3) {
      const entry = this.retiring.splice(retired, 1)[0]!; this.disposePublication(entry.key, entry.job.root);
    }
    // Amortize worker/frame round trips without concentrating main-thread publication.
    let backgroundSteps = 0;
    while (performance.now() - started < 3 && this.backgroundPending.length && backgroundSteps < 4) {
      const key = this.backgroundPending[0]!, data = this.terrainData.get(key + ':far');
      if (!data) break;
      this.backgroundPending.shift(); this.terrainData.delete(key + ':far');
      data.geometries.forEach((g, i) => this.backgroundBatches.append(key, i, g, this.terrain!.materialFor('far', i)));
      this.backgroundBuilt++; backgroundSteps++;
    }
    if (this.backgroundPending.length) {
      const keys = this.backgroundPending.slice(0, 8).filter(key => !this.terrainData.has(key + ':far') && !this.requestedTerrain.has(key + ':far'));
      if (keys.length) { keys.forEach(key => this.requestedTerrain.add(key + ':far')); this.visualWorker!.request('background:' + keys[0], { kind: 'background', keys }, 10000); }
    }
    while (this.terrainData.size > 96) { const id = [...this.terrainData.keys()].find(id => !this.publications.has(id.slice(0, id.lastIndexOf(':')))); if (!id) break; this.terrainData.delete(id); }
    this.visualWorker!.advance();
    if (changed) this.trimSignCache();
    if (this.firstVisibleMs === undefined && this.active.has(current)) this.firstVisibleMs = performance.now() - this.loadStarted;
    if (this.firstReadyMs === undefined && this.ready) this.firstReadyMs = performance.now() - this.loadStarted;
    return changed;
  }
  private disposeVisualRoot(root: Group): void {
    root.traverse(o => { if (o instanceof InstancedMesh) o.dispose(); else if (o instanceof Mesh) o.geometry.dispose(); }); root.removeFromParent();
  }
  private disposePublication(key: string, root: Group): void {
    for (const j of this.plans.get(key)?.intersections ?? []) this.signals.removeHeadsForJunction(this.map.intersections.indexOf(j), root);
    this.disposeVisualRoot(root);
  }
  private updateRegional(x:number,z:number,yaw:number,speed:number):boolean {
    const frameStarted=performance.now();let published=0;
    const signature=`${this.key(x,z)}:${Math.floor(x/100)},${Math.floor(z/100)},${Math.round(yaw*12/Math.PI)},${Math.round(speed/5)}`;
    let changed=false;
    if(signature!==this.selectionSignature){
      this.selectionSignature=signature;this.debugState=this.streaming!.select(x,z,yaw,speed);
      const ids=new Set<string>();
      for(const id of this.debugState.structures){const structure=this.map.regional!.structures.find(s=>s.id===id)!;structure.roadIds.forEach(rid=>ids.add(rid));for(const route of this.map.regional!.routes.filter(r=>structure.routes.includes(r.id)))for(const rid of route.roadIds){const road=this.map.roads.find(r=>r.id===rid)!;if(road.centerline.some(p=>Math.hypot(p.x-structure.center.x,p.z-structure.center.z)<structure.radius))ids.add(rid);}}
      this.preloadRoads=[...ids].map(id=>this.map.roads.find(r=>r.id===id)!);
      this.pending=[...this.debugState.tiers].filter(([,tier])=>tier!=='far').map(([key])=>key).sort((a,b)=>{const priority=(key:string)=>{const [sx,sz]=key.split(',').map(Number);return Math.hypot((sx!+.5)*this.map.sectorSize-x,(sz!+.5)*this.map.sectorSize-z)+(this.debugState!.tiers.get(key)==='mid'?2500:0);};return priority(a)-priority(b);});
      for(const key of this.active.keys()){const tier=this.debugState.tiers.get(key);if(!tier||tier==='far'||tier!==this.activeTiers.get(key)){this.unload(key);changed=true;}}
      const city=this.map.regional!.cityBounds;this.skyline.visible=Math.hypot(x-(city.minX+city.maxX)/2,z-(city.minZ+city.maxZ)/2)>2700;
    }
    let budget=4;
    // Compile complete structural packs before publishing any of their new
    // sectors. A preload is not merely a set of partially visible ramp pieces.
    // Publish the player's own sector first; remote structural packs then fill
    // in before their other near sectors become visible.
    const currentKey=this.debugState!.currentSector;
    if(!this.active.has(currentKey)){
      for(const road of this.plans.get(currentKey)?.roads??[]){if(this.compiled.has(road.id))continue;if(budget<=0)return changed;this.compileRoad(road);budget--;}
      this.load(currentKey,'near');changed=true;published++;
    }
    for(const road of this.preloadRoads){if(this.compiled.has(road.id))continue;if(budget<=0||performance.now()-frameStarted>8){if(changed)this.trimSignCache();return changed;}this.compileRoad(road);budget--;}
    for(const key of this.pending){
      const plan=this.plans.get(key),tier=this.debugState!.tiers.get(key)!;
      if(this.active.has(key))continue;
      if(published>=2||performance.now()-frameStarted>8){if(changed)this.trimSignCache();return changed;}
      // Mid carries a simplified pavement, building and forest massing; no detailed compile.
      if(tier==='near')for(const road of plan?.roads??[]){if(this.compiled.has(road.id))continue;if(budget<=0){if(changed)this.trimSignCache();return changed;}this.compileRoad(road);budget--;}
      this.load(key,tier);changed=true;published++;
    }
    if(changed)this.trimSignCache();return changed;
  }
  private advanceBackground(x:number,z:number):void {
    if(!this.terrain||!this.backgroundPending.length)return;
    if(this.backgroundBuilt===0)this.backgroundPending.sort((a,b)=>{const distance=(key:string)=>{const [sx,sz]=key.split(',').map(Number);return Math.hypot((sx!+.5)*this.map.sectorSize-x,(sz!+.5)*this.map.sectorSize-z);};return distance(a)-distance(b);});
    const batches=new Map<Material,BufferGeometry[]>(),started=performance.now();
    for(let i=0;i<8&&this.backgroundPending.length;i++){
      const key=this.backgroundPending.shift()!,chunk=this.terrain.build(key,'far');this.backgroundBuilt++;
      chunk.traverse(o=>{if(o instanceof Mesh){const material=o.material as Material,list=batches.get(material)??[];list.push(o.geometry);batches.set(material,list);}});
      if(performance.now()-started>3)break;
    }
    for(const [material,geometries]of batches){const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(geometry)this.background.add(new Mesh(geometry,material));}
  }
  private trimSignCache():void {const signs:RoadSignDefinition[]=[];for(const key of this.active.keys())if(this.activeTiers.get(key)==='near')signs.push(...this.plans.get(key)?.signs??[]);for(const [key,job]of this.publications)if(job.tier==='near')signs.push(...this.plans.get(key)?.signs??[]);for(const {key,job}of this.retiring)if(job.tier==='near')signs.push(...this.plans.get(key)?.signs??[]);this.signRenderer.retainContents(signs);}
  private load(key: string,tier:StreamingTier='near'): void {
    if (this.active.has(key)) return;
    const plan = this.plans.get(key); if (!plan&&!this.terrain) return;
    const root = new Group(); root.name = `City sector ${key}`;
    if(this.terrain)root.add(this.terrain.build(key,tier));
    if(tier==='mid'){
      if(plan){
        const ribbons:BufferGeometry[]=[];
        for(const road of plan.roads){if(road.laneCount<2)continue;const points=roadPoints(road),edges=roadEdges(road);let section:typeof points=[];const flush=()=>{if(section.length>1){const geometry=createStripGeometry(section,()=>0,{innerOffset:edges.left,outerOffset:edges.right,yOffset:.023,maximumSpacing:50});if(geometry){this.terrain!.drapeSilhouette(geometry,'mid');ribbons.push(geometry);}}section=[];};for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!;if(this.key((a.x+b.x)/2,(a.z+b.z)/2)!==key){flush();continue;}if(!section.length)section.push(a);section.push(b);}flush();}
        if(ribbons.length){const geometry=mergeGeometries(ribbons);ribbons.forEach(g=>g.dispose());if(geometry)root.add(new Mesh(geometry,this.materials.asphalt));}
        root.add(this.prefabs.buildInstances(plan.objects.filter(o=>['industrial','office','residential_mid'].includes(o.prefabId)||o.prefabId==='tree'&&o.id.length%4===0)));
      }
      this.activeTiers.set(key,tier);this.active.set(key,root);this.root.add(root);this.terrain?.setActive(key,true);this.visualObserver?.(root,true);return;
    }
    for (const p of plan?.surfaces.values()??[]) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(p.positions, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(p.normals, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(p.uvs, 2));
      const mesh = new Mesh(geometry, p.material); mesh.receiveShadow = true; root.add(mesh);
    }
    for (const p of plan?.instances.values()??[]) {
      const mesh = new InstancedMesh(p.geometry, p.material, p.matrices.length); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.environmentLamp = p.lamp;
      p.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.computeBoundingSphere(); root.add(mesh);
    }
    for (const j of plan?.intersections??[]) root.add(this.intersectionBuilder.build(j, this.signals, this.map.intersections.indexOf(j)));
    root.add(this.prefabs.buildInstances(plan?.objects??[]));
    root.add(this.signRenderer.buildInstances(plan?.signs??[]));
    this.activeTiers.set(key,tier);
    this.active.set(key, root); this.root.add(root);
    this.terrain?.setActive(key,true);
    this.visualObserver?.(root,true);
  }
  private unload(key: string): void {
    const root = this.active.get(key); if (!root) return;
    this.visualObserver?.(root,false);
    for (const j of this.plans.get(key)?.intersections??[]) this.signals.removeHeadsForJunction(this.map.intersections.indexOf(j), this.visualWorker ? root : undefined);
    root.traverse(o => {
      if (o instanceof InstancedMesh) o.dispose(); // Template geometry/materials belong to the registry.
      else if (o instanceof Mesh) o.geometry.dispose();
    });
    root.removeFromParent(); this.active.delete(key);this.activeTiers.delete(key);this.terrain?.setActive(key,false);
  }
  update(dt: number): void { this.signals.update(dt); }
  dispose(afterRelease?: () => void): void {
    if (this.disposed) return;
    this.disposed = true; this.visualWorker?.dispose(); this.root.removeFromParent();
    const pending = [...this.publications.values(), ...this.retiring.map(entry => entry.job)]
      .flatMap(job => job.preparation ? [job.preparation] : []);
    const release = () => { this.releaseResources(); afterRelease?.(); };
    if (pending.length) void Promise.allSettled(pending).then(release);
    else release();
  }
  private releaseResources(): void {
    for(const [key,job] of this.publications){job.task.return(undefined);this.disposePublication(key,job.root);}
    for(const {key,job} of this.retiring)this.disposePublication(key,job.root);
    this.retiring.length=0;this.publications.clear();this.terrainData.clear();this.receivedRoads.length=0;this.instanceGeometry.clear();
    for (const key of this.active.keys()) this.unload(key);
    this.signals.dispose();
    for (const geometry of this.infrastructureGeometry) geometry.dispose(); this.infrastructureGeometry.clear();
    this.signRenderer.dispose();this.background.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});this.backgroundBatches.dispose();
    this.skyline.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});this.terrain?.dispose(); this.root.clear(); this.plans.clear();
  }
}
