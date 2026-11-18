import { drain } from '../../loading/Loading';
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
import {sampleRibbonPolyline} from '../subject3/geometry';
import {continuousRibbon} from './ContinuousRoadGeometry';
import {roadEdgeChains} from './RoadEdgeChain';
import {compileMidRoadVisual} from './MidRoadVisual';
import { RegionalStreaming, type StreamingSelection, type StreamingTier } from '../regional/RegionalStreaming';
import { RegionalTerrain } from '../regional/RegionalTerrain';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VisualStreamingWorker } from './VisualStreamingWorker';
import {visualBatchKey, importVisualGeometry, type CompiledRoadVisual, type TerrainVisualData, type VisualGeometryData } from './VisualStreamingData';
import { RegionalBackgroundBatches } from '../regional/RegionalBackgroundBatches';
import { FogVisibility } from './FogVisibility';
import { cityGroundSectorGeometrySteps } from './CityGroundGeometry';
import {RegionalTerrainClearance} from '../regional/RegionalTerrainClearance';

interface GeometryPlan { positions: number[]; normals: number[]; uvs: number[]; material: Material; castShadow:boolean;receiveShadow:boolean; chunks?: VisualGeometryData[] }
interface InstancePlan { geometry: BufferGeometry; material: Material; matrices: Matrix4[]; lamp: boolean;castShadow:boolean;receiveShadow:boolean }
interface SectorPlan { surfaces: Map<string, GeometryPlan>; instances: Map<string, InstancePlan>; intersections: CityIntersection[]; objects: CityObject[];signs:RoadSignDefinition[];roads:Set<CityRoad>;barrierTriangles:number }
interface PublicationJob { tier: StreamingTier; root: Group; task: Generator<void>; built?: boolean; warmed?: boolean; preparation?: Promise<unknown> }
interface RoadResidency {bytes:number;surfaces:{sector:SectorPlan;batchKey:string;data:VisualGeometryData;barriers:number}[];instances:{sector:SectorPlan;batchKey:string;matrices:Matrix4[]}[]}
export interface SectorOptions { loadRadius?: number; editor?: boolean; deferred?: boolean; roadGeometryTrial?: import('./RoadGeometryTrial').RoadGeometryTrialSelection; roadGeometryDiagnostics?:boolean; visualCache?:{maxRoads:number;maxBytes:number} }
export class SectorManager {
  readonly visualTerrainClearance?:RegionalTerrainClearance;
  private readonly roadResidency=new Map<string,RoadResidency>();
  private readonly visualCacheBudget:{maxRoads:number;maxBytes:number};
  private roadResidencyBytes=0;
  private roadTrimPending=false;
  private readonly protectedRoads=new Set<string>();
  private cacheEvictions=0;
  private duplicateReplies=0;
  private readonly publicationSamples:{key:string;tier:StreamingTier;activeMs:number;maxStepMs:number;elapsedMs:number}[]=[];
  private readonly publicationTiming=new Map<string,{started:number;active:number;maxStep:number}>();
  private maxUpdateMs=0;
  readonly root = new Group();
  readonly active = new Map<string, Group>();
  private readonly plans = new Map<string, SectorPlan>();
  private readonly infrastructureGeometry = new Set<BufferGeometry>();
  private readonly intersectionBuilder: IntersectionBuilder;
  readonly signRenderer:RoadSignRenderer;
  readonly signals: CityTrafficSignals;
  private currentX = Infinity;
  private currentZ = Infinity;
  private roadBuilder?:RoadBuilder;
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
  readonly streamsGround: boolean;
  private readonly spawnGroundKeys = new Set<string>();
  private groundSelection='';
  private spawnGroundReadyMs?: number;
  private groundBuildMs=0;
  private maxGroundStepMs=0;
  private readonly visualWorker?: VisualStreamingWorker;
  private readonly requestedRoads = new Set<string>();
  private readonly requestedTerrain = new Set<string>();
  private readonly terrainData = new Map<string, TerrainVisualData>();
  private readonly receivedRoads: CompiledRoadVisual[] = [];
  private installation?: Generator<void>;
  private installingRoad?: string;
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
  private resourcesReleased=false;
  public setResourcePreparation(prepare: (texture: Texture) => void, warmup?: (root: Group) => Promise<unknown>): void {
    this.prepareTexture = prepare; this.prepareRoot = warmup;
  }
  public setVisualObserver(observer: (root: Object3D, added: boolean) => void): void { this.visualObserver = observer; }
  public get loadingError(): Error | undefined { return this.preparationError ?? this.visualWorker?.error; }
  public get spawnReady(): boolean { return !this.streamsGround || !!this.debugState &&
    this.activeTiers.get(this.debugState.currentSector) === 'near' && [...this.spawnGroundKeys].every(key=>this.activeTiers.get(key)==='near'); }
  get groundStatistics() {return {activeSectors:this.active.size,spawnReadyMs:this.spawnGroundReadyMs,buildActiveMs:this.groundBuildMs,maxSingleBuildStepMs:this.maxGroundStepMs};}
  /** Compact pull-based statistics: no per-frame console output. */
  get loadStatistics(){
    const roads=new Set<CityRoad>();let signs=0,barrierTriangles=0;
    for(const key of this.active.keys())if(this.activeTiers.get(key)==='near'){const plan=this.plans.get(key);plan?.roads.forEach(r=>roads.add(r));signs+=plan?.signs.length??0;barrierTriangles+=plan?.barrierTriangles??0;}
    return {sectorCount:this.active.size,totalSectors:this.streaming?.sectors.size??this.plans.size,roadCount:roads.size,compiledRoadCount:this.compiled.size,signCount:signs,barrierCount:Math.ceil(barrierTriangles/4),backgroundSectors:this.backgroundBuilt,backgroundBatches:this.backgroundBatches.count,constructorMs:this.constructorMs,publicationMs:this.publicationMs,worker:this.visualWorker?.timings,firstVisibleMs:this.firstVisibleMs,firstLoadMs:this.firstReadyMs};
  }
  get visualStatistics(){return {disposed:this.disposed,resourcesReleased:this.resourcesReleased,cachedRoads:this.roadResidency.size,cachedRoadBytes:this.roadResidencyBytes,cacheBudget:this.visualCacheBudget,cacheEvictions:this.cacheEvictions,duplicateReplies:this.duplicateReplies,terrainEntries:this.terrainData.size,instanceTemplates:this.instanceGeometry.size,maxUpdateMs:this.maxUpdateMs,publications:this.publicationSamples,worker:this.visualWorker?.state};}
  readonly loadRadius: number;
  get ready():boolean {return this.pending.every(key=>this.active.has(key));}
  constructor(readonly map: CityMapData, private readonly materials: Subject3Materials, readonly prefabs: PrefabRegistry, options: SectorOptions = {}) {
    this.streamsGround=!!map.regional&&!options.editor;
    this.loadRadius = Math.max(0, Math.floor(options.loadRadius ?? 1));
    this.visualCacheBudget=options.visualCache??{maxRoads:128,maxBytes:32*1024*1024};
    this.intersectionBuilder = new IntersectionBuilder(map, materials);
    this.visualTerrainClearance=new RegionalTerrainClearance(map);
    this.signRenderer=new RoadSignRenderer(map.roadNames??{});
    this.signals = new CityTrafficSignals(map);
    this.root.add(this.signals.root);
    if(map.regional){this.streaming=new RegionalStreaming(map);this.terrain=new RegionalTerrain(map,this.visualTerrainClearance);}
    if (map.regional && !options.editor && typeof Worker !== 'undefined') {
      this.visualWorker = new VisualStreamingWorker(map, data => this.receivedRoads.push(data), data => {
        this.groundBuildMs+=data.groundBuildMs??0;this.maxGroundStepMs=Math.max(this.maxGroundStepMs,data.maxGroundStepMs??0);
        this.requestedTerrain.delete(data.key + ':' + data.tier); this.terrainData.set(data.key + ':' + data.tier, data);
      }, undefined,options.roadGeometryDiagnostics);
    }
    this.initialization = this.initialize(options);
    if (!options.deferred) drain(this.initialization);
  }
  private readonly initialization: Generator<void>;
  public prepareSteps(): Generator<void> { return this.initialization; }
  private *initialize(options: SectorOptions): Generator<void> {
    const map = this.map, prefabs = this.prefabs;
    // Compile only CPU plans. Runtime GPU meshes exist only in active sectors.
    for (const road of map.roads) {
      yield;
      if(this.streaming){const points=roadPoints(road),edges=roadEdges(road);for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,margin=Math.max(-edges.left,edges.right)+Math.abs(road.structure?.barrierOffset??0)+12;for(let x=Math.floor((Math.min(a.x,b.x)-margin)/map.sectorSize);x<=Math.floor((Math.max(a.x,b.x)+margin)/map.sectorSize);x++)for(let z=Math.floor((Math.min(a.z,b.z)-margin)/map.sectorSize);z<=Math.floor((Math.max(a.z,b.z)+margin)/map.sectorSize);z++)this.plan(`${x},${z}`).roads.add(road);}}
      else this.compileRoad(road);
    }
    for (const j of map.intersections) { this.plan(this.key(j.position.x, j.position.z)).intersections.push(j); yield; }
    for (const o of map.objects) { this.plan(this.key(o.position.x, o.position.z)).objects.push(o); yield; }
    for(const sign of map.signs??[])this.plan(this.key(sign.position.x,sign.position.z)).signs.push(sign);
    if(this.terrain&&this.streaming){
      // The entire far envelope is coarse and batched into two meshes, never a dense giant terrain.
      // Far land is scheduled after nearby roads, rather than constructing every
      // sector before the first playable frame. Each batch owns its geometry.
      this.backgroundPending=[...this.streaming.sectors];
      const silhouettes:BufferGeometry[]=[];
      for(const route of map.regional!.routes){yield;const samples=sampleRibbonPolyline(route.centerline,80),width=route.lanes*3.75+5,edge=(side:number)=>samples.map(s=>({x:s.point.x-s.tangent.z*side*width,y:s.point.y??0,z:s.point.z+s.tangent.x*side*width})),geometry=continuousRibbon(edge(-1),edge(1),.024);if(geometry){const colors=new Float32Array(geometry.getAttribute('position').count*3);colors.fill(.16);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));this.terrain!.drapeSilhouette(geometry,'far');silhouettes.push(geometry);}}
      for(const road of map.roads.filter(r=>!r.id.startsWith('regional:')&&roadFunction(r)==='expressway'&&r.laneCount>=3&&!r.gore)){const edges=roadEdges(road),chain=roadEdgeChains(map),geometry=continuousRibbon(chain.edge(road,edges.left),chain.edge(road,edges.right),.024);if(geometry){const colors=new Float32Array(geometry.getAttribute('position').count*3);colors.fill(.16);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));this.terrain!.drapeSilhouette(geometry,'far');silhouettes.push(geometry);}}
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
      this.roadBuilder??=new RoadBuilder(this.materials,this.map);
      const group = this.roadBuilder.build(road); group.updateMatrixWorld(true);
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        if (object instanceof InstancedMesh) {
          this.infrastructureGeometry.add(object.geometry);
          const matrix = new Matrix4(), position = new Vector3();
          for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld); position.setFromMatrixPosition(matrix);
            const sector = this.plan(this.key(position.x, position.z));
            const batchKey=visualBatchKey(object.geometry.uuid+'|'+(object.material as Material).uuid,object.castShadow,object.receiveShadow);
            let plan = sector.instances.get(batchKey);
            if (!plan) { plan = { geometry: object.geometry, material: object.material as Material, matrices: [], lamp: object.userData.environmentLamp === true,castShadow:object.castShadow,receiveShadow:object.receiveShadow }; sector.instances.set(batchKey, plan); }
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
          const batchKey=visualBatchKey(material.uuid,object.castShadow,object.receiveShadow);
          let plan = sector.surfaces.get(batchKey);
          if (!plan) { plan = { positions: [], normals: [], uvs: [], material,castShadow:object.castShadow,receiveShadow:object.receiveShadow }; sector.surfaces.set(batchKey, plan); }
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
  /** Physics borrows the existing sector membership, independently of visual residency. */
  roadsForSector(key: string): ReadonlySet<CityRoad> | undefined { return this.plans.get(key)?.roads; }
  sectorKey(x: number, z: number): string { return this.key(x,z); }
  updatePosition(x: number, z: number,yaw=0,speed=0): boolean {
    if (this.disposed || this.loadingError) return false;
    if(this.streamsGround) {
      const size=this.map.sectorSize,radius=size*.6;
      const minX=Math.floor((x-radius)/size),maxX=Math.floor((x+radius)/size),minZ=Math.floor((z-radius)/size),maxZ=Math.floor((z+radius)/size),signature=`${minX},${maxX},${minZ},${maxZ}`;
      if(signature!==this.groundSelection) {
        this.groundSelection=signature;this.spawnGroundKeys.clear();
        for(let sx=minX;sx<=maxX;sx++)for(let sz=minZ;sz<=maxZ;sz++){const key=`${sx},${sz}`;if(this.streaming!.sectors.has(key))this.spawnGroundKeys.add(key);}
      }
    }
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
  private *receiveRoad(data: CompiledRoadVisual): Generator<void> {
    if(this.compiled.has(data.id)){this.duplicateReplies++;this.requestedRoads.delete(data.id);return;}
    const resident:RoadResidency={bytes:0,surfaces:[],instances:[]};
    const palette = this.materials as unknown as Record<string, Material>;
    for (const p of data.surfaces) {
      yield;
      const sector = this.plan(p.key), material = palette[p.material]!;
      const batchKey=visualBatchKey(material.uuid,p.castShadow??false,p.receiveShadow??true);
      let plan = sector.surfaces.get(batchKey);
      if (!plan) { plan = { positions: [], normals: [], uvs: [], material, chunks: [],castShadow:p.castShadow??false,receiveShadow:p.receiveShadow??true }; sector.surfaces.set(batchKey, plan); }
      plan.chunks!.push(p.geometry); sector.barrierTriangles += p.barrierTriangles;
      resident.surfaces.push({sector,batchKey,data:p.geometry,barriers:p.barrierTriangles});resident.bytes+=p.geometry.position.byteLength+p.geometry.normal.byteLength+(p.geometry.uv?.byteLength??0)+(p.geometry.index?.byteLength??0);
    }
    for (const p of data.instances) {
      if (p.geometry) { const geometry = importVisualGeometry(p.geometry); this.instanceGeometry.set(p.geometryId, geometry); this.infrastructureGeometry.add(geometry); }
      const geometry = this.instanceGeometry.get(p.geometryId)!; const sector = this.plan(p.key);
      const batchKey=visualBatchKey(geometry.uuid+'|'+p.material,p.castShadow??true,p.receiveShadow??true);
      let plan = sector.instances.get(batchKey);
      if (!plan) { plan = { geometry, material: palette[p.material]!, matrices: [], lamp: p.lamp,castShadow:p.castShadow??true,receiveShadow:p.receiveShadow??true }; sector.instances.set(batchKey, plan); }
      const matrices:Matrix4[]=[];
      for (let i = 0; i < p.matrices.length; i += 16) {if(i%1024===0)yield;const matrix=new Matrix4().fromArray(p.matrices,i);plan.matrices.push(matrix);matrices.push(matrix);}
      resident.instances.push({sector,batchKey,matrices});resident.bytes+=matrices.length*128;
    }
    this.compiled.add(data.id); this.requestedRoads.delete(data.id);
    this.roadResidency.set(data.id,resident);this.roadResidencyBytes+=resident.bytes;this.roadTrimPending=true;
  }
  private requestRoad(road: CityRoad, priority: number): void {
    const cached=this.roadResidency.get(road.id);if(cached){this.roadResidency.delete(road.id);this.roadResidency.set(road.id,cached);}
    if (this.compiled.has(road.id)||this.installingRoad===road.id||this.receivedRoads.some(data=>data.id===road.id)) return;
    this.requestedRoads.add(road.id); this.visualWorker!.request('road:' + road.id, { kind: 'road', id: road.id }, priority);
  }
  private trimRoadResidency():void{
    if(!this.roadTrimPending)return;
    this.roadTrimPending=false;
    if(this.roadResidency.size<=this.visualCacheBudget.maxRoads&&this.roadResidencyBytes<=this.visualCacheBudget.maxBytes)return;
    const protectedIds=new Set(this.protectedRoads);
    // A downgrading/retiring sector may still borrow its CPU plan while shader
    // preparation completes. Never evict a contributing road under publication.
    for(const [key,tier]of this.activeTiers)if(tier==='near')for(const road of this.plans.get(key)?.roads??[])protectedIds.add(road.id);
    for(const [key,job]of this.publications)if(job.tier==='near')for(const road of this.plans.get(key)?.roads??[])protectedIds.add(road.id);
    let evicted=0;
    for(const [id,resident]of this.roadResidency){
      if(this.roadResidency.size<=this.visualCacheBudget.maxRoads&&this.roadResidencyBytes<=this.visualCacheBudget.maxBytes||evicted>=4)break;
      if(protectedIds.has(id))continue;
      for(const {sector,batchKey,data,barriers}of resident.surfaces){const plan=sector.surfaces.get(batchKey)!;plan.chunks=plan.chunks!.filter(c=>c!==data);sector.barrierTriangles-=barriers;if(!plan.chunks.length&&!plan.positions.length)sector.surfaces.delete(batchKey);}
      for(const {sector,batchKey,matrices}of resident.instances){const plan=sector.instances.get(batchKey)!,owned=new Set(matrices);plan.matrices=plan.matrices.filter(m=>!owned.has(m));if(!plan.matrices.length)sector.instances.delete(batchKey);}
      this.roadResidencyBytes-=resident.bytes;this.roadResidency.delete(id);this.compiled.delete(id);this.cacheEvictions++;evicted++;
    }
    this.roadTrimPending=evicted===4;
  }
  private requestTerrain(key: string, tier: StreamingTier, priority: number): TerrainVisualData | undefined {
    const id = key + ':' + tier, data = this.terrainData.get(id);
    if (!data && !this.requestedTerrain.has(id)) { this.requestedTerrain.add(id); this.visualWorker!.request(id, { kind: 'terrain', key, tier, roadIds: tier === 'mid' ? [...this.plans.get(key)?.roads ?? []].map(r => r.id) : undefined }, priority); }
    return data;
  }
  private *mergeSurfaceSteps(p: GeometryPlan): Generator<void,BufferGeometry> {
    const chunks = p.chunks!, size = chunks.reduce((n, c) => n + c.position.length, 0), positions = new Float32Array(size), normals = new Float32Array(size), uvs = new Float32Array(size / 3 * 2);
    const bounds = new Box3(),indices=new Uint32Array(chunks.reduce((n,c)=>n+(c.index?.length??c.position.length/3),0));let at=0,indexAt=0;
    for (const c of chunks) {
      yield;
      positions.set(c.position, at); normals.set(c.normal, at); if (c.uv) uvs.set(c.uv, at / 3 * 2); at += c.position.length;
      const base=(at-c.position.length)/3,count=c.index?.length??c.position.length/3;for(let i=0;i<count;i++){if(i%4096===0)yield;indices[indexAt++]=base+(c.index?c.index[i]!:i);}
      bounds.union(new Box3(new Vector3(c.bounds[0], c.bounds[1], c.bounds[2]), new Vector3(c.bounds[3], c.bounds[4], c.bounds[5])));
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setAttribute('normal', new BufferAttribute(normals, 3)); geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setIndex(new BufferAttribute(indices,1));
    geometry.boundingBox = bounds; geometry.boundingSphere = bounds.getBoundingSphere(new Sphere());
    return geometry;
  }
  private *buildPublication(key: string, tier: StreamingTier, root: Group, terrain: TerrainVisualData): Generator<void> {
    const plan = this.plans.get(key);
    for(const data of terrain.ground??[]) {const mesh=new Mesh(importVisualGeometry(data),this.materials.grass);mesh.receiveShadow=true;root.add(mesh);yield;}
    root.add(this.terrain!.fromCompiled(terrain)); yield;
    if (tier === 'mid') {
      if (terrain.roadSurface) { root.add(new Mesh(importVisualGeometry(terrain.roadSurface), this.materials.asphalt)); yield; }
    } else {
      for (const p of plan?.surfaces.values() ?? []) { const mesh = new Mesh(yield* this.mergeSurfaceSteps(p), p.material); mesh.castShadow=p.castShadow;mesh.receiveShadow=p.receiveShadow; root.add(mesh); yield; }
      for (const p of plan?.instances.values() ?? []) { const mesh = new InstancedMesh(p.geometry, p.material, p.matrices.length); mesh.castShadow=p.castShadow;mesh.receiveShadow=p.receiveShadow; mesh.userData.environmentLamp = p.lamp; p.matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.computeBoundingSphere(); root.add(mesh); yield; }
      for (const j of plan?.intersections ?? []) {
        const count = this.signals.root.children.length;
        root.add(yield* this.intersectionBuilder.buildSteps(j, this.signals, this.map.intersections.indexOf(j)));
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
      this.roadTrimPending=true;
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
      this.protectedRoads.clear();for(const road of this.preloadRoads)this.protectedRoads.add(road.id);
      const wantedTerrain=new Set<string>();
      for(const key of this.pending){const tier=this.debugState.tiers.get(key)!;wantedTerrain.add(key+':'+tier);if(tier==='near')for(const road of this.plans.get(key)?.roads??[])this.protectedRoads.add(road.id);}
      for(const key of this.visualWorker!.retainRequests(this.protectedRoads,wantedTerrain)){
        if(key.startsWith('road:'))this.requestedRoads.delete(key.slice(5));else this.requestedTerrain.delete(key);
      }
      for (const key of this.active.keys()) if (!this.debugState.tiers.has(key) || this.debugState.tiers.get(key) === 'far') { this.unload(key); changed = true; }
      for (const [key, job] of this.publications) if (this.debugState.tiers.get(key) !== job.tier) {
        job.task.return(undefined); this.publications.delete(key);
        this.publicationTiming.delete(key);
        if (job.preparation) this.retiring.push({ key, job }); else this.disposePublication(key, job.root);
      }
      const city = this.map.regional!.cityBounds; this.skyline.visible = Math.hypot(x - (city.minX + city.maxX) / 2, z - (city.minZ + city.maxZ) / 2) > 2700;
    }
    // Worker replies only enqueue data. Main-thread installation shares one small frame budget.
    if(!this.installation&&this.receivedRoads.length) {const road=this.receivedRoads.shift()!;this.installingRoad=road.id;this.installation=this.receiveRoad(road);}
    while(this.installation&&performance.now()-started<3) {
      if(this.installation.next().done){this.installation=undefined;this.installingRoad=undefined;}
    }
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
      this.publicationTiming.set(key,{started:performance.now(),active:0,maxStep:0});
    }
    let steps = 0;
    for (const [key, job] of this.publications) {
      if (steps >= 128 || performance.now() - started >= 3) break;
      if (job.preparation) continue;
      while(!job.built&&steps<128&&performance.now()-started<3) { const buildStarted = performance.now(); job.built = job.task.next().done === true; const elapsed=performance.now()-buildStarted;this.publicationMs +=elapsed;const timing=this.publicationTiming.get(key);if(timing){timing.active+=elapsed;timing.maxStep=Math.max(timing.maxStep,elapsed);}steps++; }
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
        const timing=this.publicationTiming.get(key);if(timing){this.publicationSamples.push({key,tier:job.tier,activeMs:timing.active,maxStepMs:timing.maxStep,elapsedMs:performance.now()-timing.started});if(this.publicationSamples.length>512)this.publicationSamples.shift();this.publicationTiming.delete(key);}
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
      data.geometries.forEach((g, i) => this.backgroundBatches.append(key, i, g, this.terrain!.materialFor('far', i,key)));
      for(const g of data.ground??[])this.backgroundBatches.append(key,2,g,this.terrain!.farLand);
      this.backgroundBuilt++; backgroundSteps++;
    }
    if (this.backgroundPending.length) {
      // Bound non-interruptible background work so new foreground requests can win sooner.
      const keys = this.backgroundPending.slice(0, 2).filter(key => !this.terrainData.has(key + ':far') && !this.requestedTerrain.has(key + ':far'));
      if (keys.length) { keys.forEach(key => this.requestedTerrain.add(key + ':far')); this.visualWorker!.request('background:' + keys[0], { kind: 'background', keys }, 10000); }
    }
    while (this.terrainData.size > 96) { const id = [...this.terrainData.keys()].find(id => !this.publications.has(id.slice(0, id.lastIndexOf(':')))); if (!id) break; this.terrainData.delete(id); }
    this.visualWorker!.advance();
    if(performance.now()-started<3)this.trimRoadResidency();
    if (changed) this.trimSignCache();
    if (this.firstVisibleMs === undefined && this.active.has(current)) this.firstVisibleMs = performance.now() - this.loadStarted;
    if (this.firstReadyMs === undefined && this.ready) this.firstReadyMs = performance.now() - this.loadStarted;
    if(this.spawnGroundReadyMs===undefined&&this.spawnReady) {
      this.spawnGroundReadyMs=performance.now()-this.loadStarted;
      performance.mark('loading:spawnGroundReady');
      performance.measure('ground:spawnReady',{start:this.loadStarted,end:performance.now(),detail:this.groundStatistics});
    }
    this.maxUpdateMs=Math.max(this.maxUpdateMs,performance.now()-started);return changed;
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
      if(this.streamsGround)for(const geometry of drain(cityGroundSectorGeometrySteps(this.map,key,this.map.sectorSize/8,this.visualTerrainClearance))) {
        const colors=new Float32Array(geometry.getAttribute('position').count*3),color=this.materials.grass.color;
        for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
        geometry.setAttribute('color',new Float32BufferAttribute(colors,3));chunk.add(new Mesh(geometry,this.terrain.farLand));
      }
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
    if(this.streamsGround) for(const geometry of drain(cityGroundSectorGeometrySteps(this.map,key,20,this.visualTerrainClearance))) {
      const mesh=new Mesh(geometry,this.materials.grass);mesh.receiveShadow=true;root.add(mesh);
    }
    if(this.terrain)root.add(this.terrain.build(key,tier));
    if(tier==='mid'){
      if(plan){
        const surface=compileMidRoadVisual(key,[...plan.roads],this.map,this.terrain!);if(surface)root.add(new Mesh(importVisualGeometry(surface),this.materials.asphalt));
        root.add(this.prefabs.buildInstances(plan.objects.filter(o=>['industrial','office','residential_mid'].includes(o.prefabId)||o.prefabId==='tree'&&o.id.length%4===0)));
      }
      this.activeTiers.set(key,tier);this.active.set(key,root);this.root.add(root);this.terrain?.setActive(key,true);this.visualObserver?.(root,true);return;
    }
    for (const p of plan?.surfaces.values()??[]) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(p.positions, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(p.normals, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(p.uvs, 2));
      const mesh = new Mesh(geometry, p.material);mesh.castShadow=p.castShadow;mesh.receiveShadow=p.receiveShadow;root.add(mesh);
    }
    for (const p of plan?.instances.values()??[]) {
      const mesh = new InstancedMesh(p.geometry, p.material, p.matrices.length); mesh.castShadow=p.castShadow;mesh.receiveShadow=p.receiveShadow; mesh.userData.environmentLamp = p.lamp;
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
    this.roadTrimPending=true;
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
    this.roadResidency.clear();this.roadResidencyBytes=0;this.protectedRoads.clear();this.publicationTiming.clear();this.publicationSamples.length=0;
    this.installation?.return(undefined);this.installation=undefined;this.installingRoad=undefined;
    for(const [key,job] of this.publications){job.task.return(undefined);this.disposePublication(key,job.root);}
    for(const {key,job} of this.retiring)this.disposePublication(key,job.root);
    this.retiring.length=0;this.publications.clear();this.terrainData.clear();this.receivedRoads.length=0;this.instanceGeometry.clear();
    for (const key of this.active.keys()) this.unload(key);
    this.signals.dispose();
    for (const geometry of this.infrastructureGeometry) geometry.dispose(); this.infrastructureGeometry.clear();
    this.signRenderer.dispose();this.background.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});this.backgroundBatches.dispose();
    this.skyline.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});this.terrain?.dispose(); this.root.clear(); this.plans.clear();this.resourcesReleased=true;
  }
}
