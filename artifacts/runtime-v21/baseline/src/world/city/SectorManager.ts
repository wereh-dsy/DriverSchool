import { drain } from '../../loading/Loading';
import type { RuntimeCoordinator, RuntimeTaskHandle } from '../../game/runtime/RuntimeCoordinator';
import { roadFunction } from './RoadClassification';
import { Box3, BufferAttribute, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Material, Matrix4, Mesh, Sphere, Vector3, type Camera, type Object3D, type Texture } from 'three';
import type { CityIntersection, CityMapData, CityObject, CityRoad } from './CityMapData';
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
import {prepareRoadEdgeChainsSteps, roadEdgeChains} from './RoadEdgeChain';
import {roadGeometryCompilationCacheSteps} from './RoadGeometryTrialCache';
import {compileMidRoadVisual} from './MidRoadVisual';
import { RegionalStreaming, type StreamingSelection, type StreamingTier } from '../regional/RegionalStreaming';
import { prepareRegionalTerrainSamplerSteps, RegionalTerrain } from '../regional/RegionalTerrain';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VisualStreamingWorker } from './VisualStreamingWorker';
import {visualBatchKey, importVisualGeometry, type CompiledRoadVisual, type TerrainVisualData, type VisualGeometryData } from './VisualStreamingData';
import { RegionalBackgroundBatches } from '../regional/RegionalBackgroundBatches';
import { WorldRenderClusters } from '../render/WorldRenderClusters';
import { cityGroundSectorGeometrySteps } from './CityGroundGeometry';
import {RegionalTerrainClearance} from '../regional/RegionalTerrainClearance';
import { roadCriticalObject, type RoadVisualManifest } from './RoadVisualCompleteness';

interface GeometryPlan { positions: number[]; normals: number[]; uvs: number[]; material: Material; castShadow:boolean;receiveShadow:boolean; chunks?: VisualGeometryData[] }
interface InstancePlan { geometry: BufferGeometry; material: Material; matrices: Matrix4[]; packedMatrices?: Float32Array[]; lamp: boolean;castShadow:boolean;receiveShadow:boolean }
interface SectorPlan { surfaces: Map<string, GeometryPlan>; instances: Map<string, InstancePlan>; intersections: CityIntersection[]; objects: CityObject[];criticalObjects:CityObject[];decorations:CityObject[];midDecorations:CityObject[];signs:RoadSignDefinition[];roads:Set<CityRoad>;barrierTriangles:number }
interface PublicationJob { tier: StreamingTier; root: Group; task: Generator<void>; built?: boolean; warmed?: boolean; preparation?: Promise<unknown>;proxy?:boolean;supplement?:boolean }
interface DecorationJob {owner:Group;tier:StreamingTier;job:PublicationJob}
interface RoadResidency {bytes:number;surfaces:{sector:SectorPlan;batchKey:string;data:VisualGeometryData;barriers:number}[];instances:{sector:SectorPlan;batchKey:string;matrices:Float32Array}[]}
export interface SectorOptions { loadRadius?: number; editor?: boolean; deferred?: boolean; roadGeometryTrial?: import('./RoadGeometryTrial').RoadGeometryTrialSelection; roadGeometryDiagnostics?:boolean; visualCache?:{maxRoads:number;maxBytes:number} }
export class SectorManager {
  readonly visualTerrainClearance?:RegionalTerrainClearance;
  private readonly roadResidency=new Map<string,RoadResidency>();
  private readonly visualCacheBudget:{maxRoads:number;maxBytes:number};
  private roadResidencyBytes=0;
  private roadTrimPending=false;
  private readonly protectedRoads=new Set<string>();
  private readonly recipeBudgetBytes = 42 * 1024 * 1024;
  private pinnedRoadBytes = 0;
  private readonly retiringKeys = new Set<string>();
  private readonly nearDowngradeAt = new Map<string, number>();
  private nextTierRefresh = Infinity;
  private runtime?: RuntimeCoordinator;
  private maintenance?:RuntimeTaskHandle;
  setRuntimeCoordinator(runtime: RuntimeCoordinator): void {
    this.runtime = runtime;
    this.visualWorker?.setRuntimeCoordinator(runtime);
  }
  runtimeState() {
    return { sector:this.debugState?.currentSector,active:this.active.size,publishing:this.publications.size,
      retiring:this.retiring.length,roads:this.roadResidencyBytes,terrain:this.terrainCacheBytes,
      backgroundPages:this.backgroundBatches.count,worker:this.visualWorker?.queueState,
      incompleteVisible:this.incompleteVisible.size,decorationJobs:this.decorations.size,releasing:this.releases.length };
  }
  private cacheEvictions=0;
  private duplicateReplies=0;
  private readonly publicationSamples:{key:string;tier:StreamingTier;activeMs:number;maxStepMs:number;elapsedMs:number}[]=[];
  private readonly publicationTiming=new Map<string,{started:number;active:number;maxStep:number}>();
  private maxUpdateMs=0;
  readonly root = new Group();
  readonly active = new Map<string, Group>();
  private readonly plans = new Map<string, SectorPlan>();
  private readonly infrastructureGeometry = new Set<BufferGeometry>();
  private intersectionBuilder!: IntersectionBuilder;
  readonly signRenderer:RoadSignRenderer;
  readonly signals: CityTrafficSignals;
  private currentX = Infinity;
  private currentZ = Infinity;
  private roadBuilder?:RoadBuilder;
  private readonly compiled=new Set<string>();
  private readonly activeTiers=new Map<string,StreamingTier>();
  readonly streaming?:RegionalStreaming;
  terrain?:RegionalTerrain;
  debugState?:StreamingSelection;
  private readonly background=new Group();
  private readonly skyline=new Group();
  private skylineEnabled=false;
  private skylineRequired=false;
  private skylineWarmed=false;
  private skylinePreparation?:Promise<void>;
  private selectionSignature='';
  private pending:string[]=[];
  private preloadRoads:CityRoad[]=[];
  private backgroundPending:string[]=[];
  private backgroundBuilt=0;
  private backgroundRange=2500;
  private readonly backgroundWanted=new Set<string>();
  private readonly backgroundResident=new Map<string,Set<string>>();
  private readonly loadStarted=performance.now();
  private firstReadyMs:number|undefined;
  private firstVisibleMs:number|undefined;
  private constructorMs=0;
  private publicationMs=0;
  readonly streamsGround: boolean;
  private readonly spawnGroundKeys = new Set<string>();
  private initialPreparing=false;
  private initialScope?:{tiers:Map<string,StreamingTier>;background:Set<string>;roads:Set<string>;preparedRoads:Set<string>};
  private groundSelection='';
  private spawnGroundReadyMs?: number;
  private groundBuildMs=0;
  private maxGroundStepMs=0;
  private readonly visualWorker?: VisualStreamingWorker;
  private readonly requestedRoads = new Set<string>();
  private readonly requestedTerrain = new Set<string>();
  private readonly terrainData = new Map<string, TerrainVisualData>();
  private readonly terrainBytes=new Map<string,number>();
  private terrainCacheBytes=0;
  private readonly terrainCacheBudget=48*1024*1024;
  private terrainCacheEvictions=0;
  private staleTerrainReplies=0;
  private readonly receivedRoads: CompiledRoadVisual[] = [];
  private installation?: Generator<void>;
  private installingRoad?: string;
  private readonly instanceGeometry = new Map<string, BufferGeometry>();
  private readonly publications = new Map<string, PublicationJob>();
  private readonly decorations=new Map<string,DecorationJob>();
  private readonly decorated=new WeakSet<Group>();
  private readonly incompleteVisible=new Map<string,number>();
  private readonly visibleRoadDemand=new Map<string,number>();
  private readonly supplements=new Set<string>();
  private roadComplete(key:string):boolean{return this.activeTiers.get(key)==='near'||this.active.get(key)?.userData.roadManifest?.complete===true;}
  private tierReady(key:string,tier:StreamingTier):boolean{return this.activeTiers.get(key)===tier||tier==='near'&&this.supplements.has(key)&&this.roadComplete(key);}
  private readonly completenessSamples:{key:string;delayMs:number;manifest:RoadVisualManifest}[]=[];
  private readonly requestedAt=new Map<string,number>();
  private referenceHeight?:number;
  private signTrimPending=false;
  private maintenanceStage=0;
  private signTrimTask?:Generator<void>;
  private signRevision=0;
  private readonly decorationTasks=new Map<string,RuntimeTaskHandle>();
  private readonly releases:{key:string;tier?:StreamingTier;root:Group;task:Generator<void>}[]=[];
  private terrainTrim?:IterableIterator<[string,TerrainVisualData]>;
  private terrainTrimRemaining=0;
  private roadTrimTask?:Generator<void>;
  private selectionVersion=0;
  private readonly retiring: { key: string; job: PublicationJob }[] = [];
  private readonly backgroundBatches:RegionalBackgroundBatches;
  private backgroundPreparation?:Promise<void>;
  private backgroundWarmed=false;
  private readonly fogVisibility = new WorldRenderClusters();
  public updateVisibility(eye: Vector3, fogFar: number, cameras: readonly Camera[]): void {
    let reach=fogFar;
    if(Number.isFinite(fogFar))for(const camera of cameras){
      const e=camera.projectionMatrix.elements;
      if((camera as Camera&{isPerspectiveCamera?:boolean}).isPerspectiveCamera&&Math.abs(e[0]!)>1e-8&&Math.abs(e[5]!)>1e-8){
        const horizontal=(1+Math.abs(e[8]!))/Math.abs(e[0]!),vertical=(1+Math.abs(e[9]!))/Math.abs(e[5]!);
        reach=Math.max(reach,fogFar*Math.hypot(1,horizontal,vertical));
      }
    }
    const range=Number.isFinite(reach)?Math.max(2500,Math.ceil((reach+this.map.sectorSize*2)/500)*500):Infinity;
    // Include wide/off-axis mirror frusta, with a full-sector hysteresis ring.
    if(range>this.backgroundRange||range+500<this.backgroundRange){this.backgroundRange=range;this.selectionSignature='';}
    this.fogVisibility.configure(eye, fogFar, cameras);
    this.fogVisibility.update(this.backgroundBatches.root);
    if(this.backgroundWarmed||!this.prepareRoot)this.fogVisibility.update(this.background);else this.background.visible=false;
    this.skyline.visible=this.skylineEnabled;
    if(this.skylineEnabled&&(!this.visualWorker||this.skylineWarmed||!this.prepareRoot))this.fogVisibility.update(this.skyline);else this.skyline.visible=false;
    for (const [key,root] of this.active) {
      this.fogVisibility.update(root);
      if(!root.visible||root.userData.roadBounds&&!this.fogVisibility.roadBoxVisible(root.userData.roadBounds)){
        this.incompleteVisible.delete(key);
        const seen=this.visibleRoadDemand.get(key);
        if(seen!==undefined&&performance.now()-seen>1000){this.visibleRoadDemand.delete(key);this.selectionSignature='';}
        continue;
      }
      if((this.plans.get(key)?.roads.size??0)>0&&(this.activeTiers.get(key)==='mid'||this.visibleRoadDemand.has(key))){
        if(!this.visibleRoadDemand.has(key))this.selectionSignature='';
        this.visibleRoadDemand.set(key,performance.now());
      }
      if(this.runtime&&!this.runtime.driving){this.incompleteVisible.delete(key);continue;}
      if(this.debugState?.tiers.get(key)==='near'&&!this.roadComplete(key)&&!this.incompleteVisible.has(key))
        this.incompleteVisible.set(key,performance.now());
    }
  }
  private prepareTexture?: (texture: Texture) => void;
  private prepareRoot?: (root: Group) => Promise<unknown>;
  private visualObserver?: (root: Object3D, added: boolean) => void;
  private preparationError?: Error;
  private disposed = false;
  private resourcesReleased=false;
  public setResourcePreparation(prepare: (texture: Texture) => void, warmup?: (root: Group) => Promise<unknown>): void {
    this.prepareTexture = prepare; this.prepareRoot = warmup;
    if(warmup)this.backgroundBatches.setPreparation(root=>this.fogVisibility.prepareExternal(root,this.runtime,warmup));
  }
  public beginInitialPreparation():void {if(!this.visualWorker)return;this.initialPreparing=true;this.initialScope=undefined;this.selectionSignature='';}
  public finishInitialPreparation():void {
    this.initialPreparing=false;this.initialScope=undefined;this.selectionSignature='';
  }
  get initialProgress(){
    const scope=this.initialScope;if(!scope)return undefined;let generated=0,published=0,background=0;
    for(const[key,tier]of scope.tiers){const active=tier==='near'?this.roadComplete(key):this.activeTiers.get(key)===tier;if(active)published++;if(active||this.publications.get(key)?.tier===tier)generated++;}
    for(const key of scope.background)if(this.hasPublishedBackground(key))background++;
    const compiled = scope.preparedRoads.size;
    const task=this.visualWorker?.state.inFlight;
    return{regionDone:compiled+generated+background,regionTotal:scope.roads.size+scope.tiers.size+scope.background.size,gpuDone:published+(this.skylineRequired&&this.skylineWarmed?1:0)+(this.backgroundWarmed?1:0)+(background===scope.background.size&&this.backgroundBatches.ready?1:0),gpuTotal:scope.tiers.size+2+(this.skylineRequired?1:0),resource:task?.startsWith('road:')?'道路与交叉口':task?.startsWith('background:')?'周边地形':task?'地形与区域资源':'区域装配与发布'};
  }
  public setVisualObserver(observer: (root: Object3D, added: boolean) => void): void { this.visualObserver = observer; }
  public get loadingError(): Error | undefined { return this.preparationError ?? this.backgroundBatches.error??this.visualWorker?.error; }
  public get spawnReady(): boolean {if(this.initialPreparing){const p=this.initialProgress;return !!p&&p.regionDone===p.regionTotal&&p.gpuDone===p.gpuTotal&&[...this.visibleRoadDemand.keys()].every(key=>this.roadComplete(key));}return !this.streamsGround || (!this.prepareRoot||this.backgroundWarmed) && !!this.debugState &&
    this.activeTiers.get(this.debugState.currentSector) === 'near' && [...this.spawnGroundKeys].every(key=>this.activeTiers.get(key)==='near'); }
  get groundStatistics() {return {activeSectors:this.active.size,spawnReadyMs:this.spawnGroundReadyMs,buildActiveMs:this.groundBuildMs,maxSingleBuildStepMs:this.maxGroundStepMs};}
  /** Compact pull-based statistics: no per-frame console output. */
  get loadStatistics(){
    const roads=new Set<CityRoad>();let signs=0,barrierTriangles=0;
    for(const key of this.active.keys())if(this.activeTiers.get(key)==='near'){const plan=this.plans.get(key);plan?.roads.forEach(r=>roads.add(r));signs+=plan?.signs.length??0;barrierTriangles+=plan?.barrierTriangles??0;}
    return {sectorCount:this.active.size,totalSectors:this.streaming?.sectors.size??this.plans.size,roadCount:roads.size,compiledRoadCount:this.compiled.size,signCount:signs,barrierCount:Math.ceil(barrierTriangles/4),backgroundSectors:this.backgroundBuilt,backgroundBatches:this.backgroundBatches.count,constructorMs:this.constructorMs,publicationMs:this.publicationMs,worker:this.visualWorker?.timings,firstVisibleMs:this.firstVisibleMs,firstLoadMs:this.firstReadyMs};
  }
  get visualStatistics(){
    let borrowedTerrainBytes = 0;
    for (const [id, data] of this.terrainData) {
      if (this.terrainInUse(data)) borrowedTerrainBytes += this.terrainBytes.get(id)!;
    }
    return {worldRendering:this.fogVisibility.statistics,disposed:this.disposed,resourcesReleased:this.resourcesReleased,cachedRoads:this.roadResidency.size,cachedRoadBytes:this.roadResidencyBytes,cacheBudget:this.visualCacheBudget,recipeBudgetBytes:this.recipeBudgetBytes,pinnedRoadBytes:this.pinnedRoadBytes,borrowedTerrainBytes,cacheEvictions:this.cacheEvictions,duplicateReplies:this.duplicateReplies,terrainEntries:this.terrainData.size,terrainCacheBytes:this.terrainCacheBytes,terrainCacheBudget:this.terrainCacheBudget,terrainCacheEvictions:this.terrainCacheEvictions,staleTerrainReplies:this.staleTerrainReplies,background:this.backgroundBatches.statistics,initial:this.initialProgress,instanceTemplates:this.instanceGeometry.size,maxUpdateMs:this.maxUpdateMs,publications:this.publicationSamples,worker:this.visualWorker?.state};
  }
  readonly loadRadius: number;
  get ready():boolean {return this.pending.every(key=>this.active.has(key));}
  constructor(readonly map: CityMapData, private readonly materials: Subject3Materials, readonly prefabs: PrefabRegistry, options: SectorOptions = {}) {
    this.backgroundBatches=new RegionalBackgroundBatches(map.sectorSize,this.fogVisibility.resources);
    this.backgroundBatches.setObserver((mesh,added)=>this.fogVisibility.attachExternal(this.backgroundBatches.root,mesh,added));
    this.streamsGround=!!map.regional&&!options.editor;
    this.loadRadius = Math.max(0, Math.floor(options.loadRadius ?? 1));
    this.visualCacheBudget=options.visualCache??{maxRoads:128,maxBytes:32*1024*1024};
    this.visualTerrainClearance=new RegionalTerrainClearance(map,undefined,true);
    this.signRenderer=new RoadSignRenderer(map.roadNames??{});
    this.signals = new CityTrafficSignals(map);
    this.root.add(this.signals.root);
    if(map.regional)this.streaming=new RegionalStreaming(map);
    if (map.regional && !options.editor && typeof Worker !== 'undefined') {
      this.visualWorker = new VisualStreamingWorker(map, data => {
        if (this.debugState && !this.protectedRoads.has(data.id)) {
          for (const part of data.instances) this.receiveInstanceTemplate(part);
          this.requestedRoads.delete(data.id);
          return;
        }
        this.receivedRoads.push(data);
      }, data => {
        this.groundBuildMs+=data.groundBuildMs??0;this.maxGroundStepMs=Math.max(this.maxGroundStepMs,data.maxGroundStepMs??0);
        this.requestedTerrain.delete(data.key + ':' + data.tier);
        if(data.tier==='far'&&!this.needsBackground(data.key))return;
        if(data.tier!=='far'&&this.debugState&&this.debugState.tiers.get(data.key)!==data.tier&&
          !(data.tier==='mid'&&this.debugState.tiers.get(data.key)==='near'&&this.activeTiers.get(data.key)!=='near')){this.staleTerrainReplies++;return;}
        this.cacheTerrain(data);
      }, undefined,options.roadGeometryDiagnostics, key => {
        if (key.startsWith('road:')) this.requestedRoads.delete(key.slice(5));
        else if (key.startsWith('background:')) this.requestedTerrain.delete(key.slice(11) + ':far');
        else this.requestedTerrain.delete(key);
      });
    }
    this.initialization = this.initialize(options);
    if (!options.deferred) drain(this.initialization);
  }
  private readonly initialization: Generator<void>;
  public prepareSteps(): Generator<void> { return this.initialization; }
  private *initialize(options: SectorOptions): Generator<void> {
    const map = this.map, prefabs = this.prefabs;
    const cache = yield* roadGeometryCompilationCacheSteps(map);
    this.intersectionBuilder = new IntersectionBuilder(map, this.materials, undefined, cache);
    yield* prepareRoadEdgeChainsSteps(map);
    yield* this.visualTerrainClearance!.prepareSteps();
    if (map.regional) {
      yield* prepareRegionalTerrainSamplerSteps(map);
      this.terrain = new RegionalTerrain(map, this.visualTerrainClearance);
    }
    // Compile only CPU plans. Runtime GPU meshes exist only in active sectors.
    for (const road of map.roads) {
      yield;
      if(this.streaming){const points=roadPoints(road),edges=roadEdges(road);this.streaming.corridor.register(road,points);for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,margin=Math.max(-edges.left,edges.right)+Math.abs(road.structure?.barrierOffset??0)+12;for(let x=Math.floor((Math.min(a.x,b.x)-margin)/map.sectorSize);x<=Math.floor((Math.max(a.x,b.x)+margin)/map.sectorSize);x++)for(let z=Math.floor((Math.min(a.z,b.z)-margin)/map.sectorSize);z<=Math.floor((Math.max(a.z,b.z)+margin)/map.sectorSize);z++)this.plan(`${x},${z}`).roads.add(road);}}
      else this.compileRoad(road);
    }
    for (const j of map.intersections) { this.plan(this.key(j.position.x, j.position.z)).intersections.push(j); yield; }
    for (const o of map.objects) {
      const plan=this.plan(this.key(o.position.x,o.position.z));plan.objects.push(o);
      if(roadCriticalObject(o))plan.criticalObjects.push(o);
      else{
        plan.decorations.push(o);
        if(['industrial','office','residential_mid'].includes(o.prefabId)||o.prefabId==='tree'&&o.id.length%4===0)plan.midDecorations.push(o);
      }
      yield;
    }
    for(const sign of map.signs??[]){this.plan(this.key(sign.position.x,sign.position.z)).signs.push(sign);yield;}
    if(this.terrain&&this.streaming){
      // The entire far envelope is coarse and batched into two meshes, never a dense giant terrain.
      // Far land is scheduled after nearby roads, rather than constructing every
      // sector before the first playable frame. Each batch owns its geometry.
      this.backgroundPending=[...this.streaming.sectors];
      const silhouettes:BufferGeometry[]=[];
      for(const route of map.regional!.routes){yield;const samples=sampleRibbonPolyline(route.centerline,80),width=route.lanes*3.75+5,edge=(side:number)=>samples.map(s=>({x:s.point.x-s.tangent.z*side*width,y:s.point.y??0,z:s.point.z+s.tangent.x*side*width})),geometry=continuousRibbon(edge(-1),edge(1),.024);if(geometry){const colors=new Float32Array(geometry.getAttribute('position').count*3);colors.fill(.16);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));this.terrain!.drapeSilhouette(geometry,'far');silhouettes.push(geometry);}}
      for(const road of map.roads.filter(r=>!r.id.startsWith('regional:')&&roadFunction(r)==='expressway'&&r.laneCount>=3&&!r.gore)){yield;const edges=roadEdges(road),chain=roadEdgeChains(map),geometry=continuousRibbon(chain.edge(road,edges.left),chain.edge(road,edges.right),.024);if(geometry){const colors=new Float32Array(geometry.getAttribute('position').count*3);colors.fill(.16);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));this.terrain!.drapeSilhouette(geometry,'far');silhouettes.push(geometry);}}
      if(silhouettes.length){const geometry=mergeGeometries(silhouettes);silhouettes.forEach(g=>g.dispose());if(geometry)this.background.add(new Mesh(geometry,this.terrain.farRoad));}
      const forests:BufferGeometry[]=[];
      map.objects.filter(o=>o.id.startsWith('regional:')&&o.prefabId==='tree').filter((_,i)=>i%10===0).forEach(o=>{const geometry=new CylinderGeometry(0,14,12,5).toNonIndexed();geometry.translate(o.position.x,(o.position.y??0)+6,o.position.z);const colors=new Float32Array(geometry.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=.24;colors[i+1]=.35;colors[i+2]=.2;}geometry.setAttribute('color',new Float32BufferAttribute(colors,3));forests.push(geometry);});
      if(forests.length){const geometry=mergeGeometries(forests);forests.forEach(g=>g.dispose());if(geometry)this.background.add(new Mesh(geometry,this.terrain.farLand));}
      yield* this.fogVisibility.prepareSteps(this.background);
      this.skyline.add(yield* prefabs.buildInstanceSteps(map.objects.filter(o=>!o.id.startsWith('regional:')&&['office','residential_mid','industrial'].includes(o.prefabId)),'far'));
      yield* this.fogVisibility.prepareSteps(this.skyline);
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
    if (!plan) { plan = { surfaces: new Map(), instances: new Map(), intersections: [], objects: [],criticalObjects:[],decorations:[],midDecorations:[],signs:[],roads:new Set(),barrierTriangles:0 }; this.plans.set(key, plan); }
    return plan;
  }
  /** Physics borrows the existing sector membership, independently of visual residency. */
  roadsForSector(key: string): ReadonlySet<CityRoad> | undefined { return this.plans.get(key)?.roads; }
  sectorKey(x: number, z: number): string { return this.key(x,z); }
  updatePosition(x: number, z: number,yaw=0,speed=0,frameMs?:number,height?:number): boolean {
    this.referenceHeight=height;
    if (this.disposed || this.loadingError) return false;
    if(this.streamsGround) {
      const size=this.map.sectorSize,radius=size*.6;
      const minX=Math.floor((x-radius)/size),maxX=Math.floor((x+radius)/size),minZ=Math.floor((z-radius)/size),maxZ=Math.floor((z+radius)/size),signature=`${minX},${maxX},${minZ},${maxZ}`;
      if(signature!==this.groundSelection) {
        this.groundSelection=signature;this.spawnGroundKeys.clear();
        for(let sx=minX;sx<=maxX;sx++)for(let sz=minZ;sz<=maxZ;sz++){const key=`${sx},${sz}`;if(this.streaming!.sectors.has(key))this.spawnGroundKeys.add(key);}
      }
    }
    if (this.visualWorker) return this.updateWorkerVisuals(x, z, yaw, speed, frameMs);
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
      this.receiveInstanceTemplate(p);
      const geometry = this.instanceGeometry.get(p.geometryId)!; const sector = this.plan(p.key);
      const batchKey=visualBatchKey(geometry.uuid+'|'+p.material,p.castShadow??true,p.receiveShadow??true);
      let plan = sector.instances.get(batchKey);
      if (!plan) { plan = { geometry, material: palette[p.material]!, matrices: [], packedMatrices: [], lamp: p.lamp,castShadow:p.castShadow??true,receiveShadow:p.receiveShadow??true }; sector.instances.set(batchKey, plan); }
      plan.packedMatrices!.push(p.matrices);
      resident.instances.push({sector,batchKey,matrices:p.matrices});
      resident.bytes += p.matrices.byteLength;
      yield;
    }
    this.compiled.add(data.id); this.requestedRoads.delete(data.id);
    if (this.initialScope?.roads.has(data.id)) this.initialScope.preparedRoads.add(data.id);
    this.roadResidency.set(data.id,resident);this.roadResidencyBytes+=resident.bytes;this.roadTrimPending=true;
  }
  private receiveInstanceTemplate(part: CompiledRoadVisual['instances'][number]): void {
    if (!part.geometry || this.instanceGeometry.has(part.geometryId)) return;
    const geometry = importVisualGeometry(part.geometry);
    this.instanceGeometry.set(part.geometryId, geometry);
    this.infrastructureGeometry.add(geometry);
  }
  private requestRoad(road: CityRoad, priority: number): void {
    if (this.compiled.has(road.id)||this.installingRoad===road.id||this.receivedRoads.some(data=>data.id===road.id)) return;
    this.requestedRoads.add(road.id); this.visualWorker!.request('road:' + road.id, { kind: 'road', id: road.id }, priority);
  }
  private *trimRoadSteps():Generator<void>{
    if(!this.roadTrimPending)return;
    this.roadTrimPending=false;
    const version=this.selectionVersion;
    const protectedIds = new Set<string>();
    // Built roots own their assembled buffers. Only unassembled near sectors
    // still need a road's recipe, including roots currently yielding in build.
    for (const key of this.pending) {
      yield;
      if (this.debugState?.tiers.get(key) !== 'near' || this.tierReady(key,'near') || this.publications.get(key)?.built) continue;
      for (const road of this.plans.get(key)?.roads ?? []) protectedIds.add(road.id);
    }
    this.pinnedRoadBytes = 0;
    for (const id of protectedIds) this.pinnedRoadBytes += this.roadResidency.get(id)?.bytes ?? 0;
    const withinBudget = () => this.roadResidency.size <= this.visualCacheBudget.maxRoads &&
      this.roadResidencyBytes <= this.visualCacheBudget.maxBytes &&
      this.roadResidencyBytes + this.terrainCacheBytes <= this.recipeBudgetBytes;
    let evicted=0;
    for(const [id,resident]of this.roadResidency){
      yield;
      if(version!==this.selectionVersion){this.roadTrimPending=true;return;}
      if(withinBudget()||evicted>=4)break;
      if(protectedIds.has(id))continue;
      this.roadResidencyBytes-=resident.bytes;this.roadResidency.delete(id);this.compiled.delete(id);this.cacheEvictions++;evicted++;
      for(const {sector,batchKey,data,barriers}of resident.surfaces){
        const plan=sector.surfaces.get(batchKey);
        if(plan){plan.chunks=plan.chunks!.filter(c=>c!==data);sector.barrierTriangles-=barriers;if(!plan.chunks.length&&!plan.positions.length)sector.surfaces.delete(batchKey);}
        yield;
      }
      for(const {sector,batchKey,matrices}of resident.instances){
        const plan=sector.instances.get(batchKey);
        if(plan){plan.packedMatrices=plan.packedMatrices!.filter(chunk=>chunk!==matrices);if(!plan.packedMatrices.length)sector.instances.delete(batchKey);}
        yield;
      }
    }
    if(evicted===4)this.roadTrimPending=true;
  }
  private trimRoadResidency():void{drain(this.trimRoadSteps());}
  private requestTerrain(key: string, tier: StreamingTier, priority: number): TerrainVisualData | undefined {
    const id = key + ':' + tier, data = this.terrainData.get(id);
    if(data){this.terrainData.delete(id);this.terrainData.set(id,data);}
    if (!data && !this.requestedTerrain.has(id)) { this.requestedTerrain.add(id); this.visualWorker!.request(id, { kind: 'terrain', key, tier, roadIds: tier === 'mid' ? [...this.plans.get(key)?.roads ?? []].map(r => r.id) : undefined }, priority); }
    return data;
  }
  private cacheTerrain(data:TerrainVisualData):void{
    const id=data.key+':'+data.tier,parts=[...data.geometries,...data.ground??[],...data.roadSurface?[data.roadSurface]:[]];let bytes=0;
    for(const p of parts)bytes+=p.position.byteLength+p.normal.byteLength+(p.uv?.byteLength??0)+(p.color?.byteLength??0)+(p.index?.byteLength??0);
    this.discardTerrain(id);this.terrainData.set(id,data);this.terrainBytes.set(id,bytes);this.terrainCacheBytes+=bytes;
    this.roadTrimPending = true;
  }
  private discardTerrain(id:string):void{this.terrainCacheBytes-=this.terrainBytes.get(id)??0;this.terrainBytes.delete(id);this.terrainData.delete(id);}
  private terrainInUse(data:TerrainVisualData):boolean {
    return this.activeTiers.get(data.key) === data.tier || this.publications.get(data.key)?.tier === data.tier ||
      this.retiring.some(entry => entry.key === data.key && entry.job.tier === data.tier)||
      this.releases.some(entry=>entry.key===data.key&&entry.tier===data.tier);
  }
  private trimTerrainCache(deadline=Infinity):void{
    const withinBudget = () => this.terrainData.size <= 96 && this.terrainCacheBytes <= this.terrainCacheBudget &&
      this.roadResidencyBytes + this.terrainCacheBytes <= this.recipeBudgetBytes;
    if(withinBudget()){this.terrainTrim=undefined;return;}
    if(!this.terrainTrim){this.terrainTrim=this.terrainData.entries();this.terrainTrimRemaining=this.terrainData.size;}
    let scanned=0;
    while(this.terrainTrimRemaining-->0&&scanned++<8&&performance.now()<deadline){
      const next=this.terrainTrim.next();if(next.done){this.terrainTrim=undefined;return;}
      const[id,data]=next.value;
      if(withinBudget()){this.terrainTrim=undefined;return;}
      // Active meshes borrow the arrays. Keep their cache entry, and never evict
      // an unpublished result while an asynchronous preparation borrows it.
      if(this.terrainInUse(data)||(data.tier==='far'?this.needsBackground(data.key):this.debugState?.tiers.get(data.key)===data.tier))continue;
      this.discardTerrain(id);this.terrainCacheEvictions++;
    }
    if(this.terrainTrimRemaining<=0)this.terrainTrim=undefined;
  }
  private *mergeSurfaceSteps(p: GeometryPlan): Generator<void,BufferGeometry> {
    const chunks = p.chunks!.slice(), size = chunks.reduce((n, c) => n + c.position.length, 0), positions = new Float32Array(size), normals = new Float32Array(size), uvs = new Float32Array(size / 3 * 2);
    const count = chunks.reduce((n,c)=>n+(c.index?.length??c.position.length/3),0);
    const bounds = new Box3(), indices = size / 3 <= 65536 ? new Uint16Array(count) : new Uint32Array(count);
    let at=0,indexAt=0;
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
  private *buildPublication(key: string, tier: StreamingTier, root: Group, terrain?: TerrainVisualData,supplement=false): Generator<void> {
    root.userData.streamingTier=tier;
    const plan = this.plans.get(key);
    if(!supplement&&terrain){
      for(const data of terrain.ground??[]) {const mesh=new Mesh(importVisualGeometry(data),this.materials.grass);mesh.receiveShadow=true;root.add(mesh);yield;}
      root.add(this.terrain!.fromCompiled(terrain));yield;
    }
    if (tier === 'mid') {
      if (terrain?.roadSurface) {
        root.add(new Mesh(importVisualGeometry(terrain.roadSurface), this.materials.asphalt));
        root.userData.roadBounds=new Box3(new Vector3().fromArray(terrain.roadSurface.bounds),new Vector3().fromArray(terrain.roadSurface.bounds,3));
        yield;
      }
    } else {
      for (const p of plan?.surfaces.values() ?? []) {
        if(supplement&&(p.material===this.materials.asphalt||p.material===this.materials.sidewalk))continue;
        const mesh = new Mesh(yield* this.mergeSurfaceSteps(p), p.material); mesh.castShadow=p.castShadow;mesh.receiveShadow=p.receiveShadow;
        mesh.userData.roadCritical=p.material!==this.materials.asphalt&&p.material!==this.materials.sidewalk;
        root.add(mesh); yield;
      }
      for (const p of plan?.instances.values() ?? []) {
        const chunks = p.packedMatrices ?? [];
        const count = chunks.reduce((sum, chunk) => sum + chunk.length / 16, 0);
        const mesh = new InstancedMesh(p.geometry, p.material, count);
        mesh.castShadow = p.castShadow;
        mesh.receiveShadow = p.receiveShadow;
        mesh.userData.environmentLamp = p.lamp;
        mesh.userData.roadCritical=true;
        let offset = 0;
        for (const chunk of chunks) {
          mesh.instanceMatrix.array.set(chunk, offset);
          offset += chunk.length;
          yield;
        }
        mesh.computeBoundingSphere();
        root.add(mesh);
        yield;
      }
      for (const j of plan?.intersections ?? []) {
        const count = this.signals.root.children.length;
        const junction=yield* this.intersectionBuilder.buildSteps(j, this.signals, this.map.intersections.indexOf(j));
        junction.userData.roadCritical=true;root.add(junction);
        // Signal heads belong to this publication, including when it is cancelled.
        for (const head of this.signals.root.children.slice(count)){head.userData.roadCritical=true;head.userData.worldDynamic=true;root.add(head);}
        yield;
      }
    }
    const objects = tier === 'near' ? this.runtime?plan?.criticalObjects??[]:plan?.objects??[] : this.runtime?[]:plan?.midDecorations??[];
    const objectRoot=yield* this.prefabs.buildInstanceSteps(objects);
    objectRoot.userData.roadCritical=tier==='near';root.add(objectRoot);
    if (tier === 'near') {
      for (const sign of plan?.signs ?? []) { const material=this.signRenderer.materialFor(sign);if(!this.prepareRoot&&material.map)this.prepareTexture?.(material.map);yield; }
      const signs=this.signRenderer.buildInstances(plan?.signs ?? []);signs.userData.roadCritical=true;root.add(signs);yield;
    }
    root.updateMatrixWorld(true); root.traverse(o => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; });
    yield* this.fogVisibility.prepareSteps(root);
    root.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});
    if(tier==='near'){
      root.userData.roadManifest=this.manifest(key);
      root.userData.roadManifest.complete=true;
    }
  }
  private manifest(key:string):RoadVisualManifest {
    const plan=this.plans.get(key);
    let markings=0;
    for(const surface of plan?.surfaces.values()??[])if(surface.material===this.materials.whitePaint||surface.material===this.materials.yellowPaint)markings++;
    return{roadIds:[...plan?.roads??[]].map(road=>road.id),surfaceBatches:plan?.surfaces.size??0,markingBatches:markings,
      barrierTriangles:plan?.barrierTriangles??0,infrastructureBatches:plan?.instances.size??0,signs:plan?.signs.length??0,
      signalizedJunctions:plan?.intersections.filter(junction=>junction.signalized).length??0,criticalObjects:plan?.criticalObjects.length??0,complete:false};
  }
  private *buildDecoration(key:string,tier:StreamingTier,root:Group):Generator<void>{
    const plan=this.plans.get(key),objects=tier==='near'?plan?.decorations??[]:plan?.midDecorations??[];
    root.add(yield* this.prefabs.buildInstanceSteps(objects));
    root.updateMatrixWorld(true);root.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});
    yield* this.fogVisibility.prepareSteps(root);
  }
  private scheduleDecorations():void{
    if(!this.runtime)return;
    for(const [key,entry]of this.decorations){
      if(this.active.get(key)===entry.owner)continue;
      entry.job.root.userData.streamingWarmupCancelled=true;
      entry.job.task.return(undefined);
      this.decorationTasks.get(key)?.cancel();this.decorationTasks.delete(key);
      this.decorations.delete(key);
      if(entry.job.preparation)this.retiring.push({key,job:entry.job});
      else this.disposePublication(key,entry.job.root);
    }
    let created=0;
    for(const [key,owner]of this.active){
      if(created>=2)break;
      if(this.decorated.has(owner)||this.decorations.has(key))continue;
      const tier=this.activeTiers.get(key)!;
      const root=new Group();root.name=`City decoration ${key}`;root.userData.streamingPriority=20000;
      const job:PublicationJob={tier,root,task:this.buildDecoration(key,tier,root)},entry={owner,tier,job};
      this.decorations.set(key,entry);created++;
      const handle=this.runtime.enqueue({
        id:'decoration:'+key,phase:'background',priority:()=> 'decoration',
        valid:()=>!this.disposed&&this.active.get(key)===owner,
        ready:()=>!job.preparation,
        step:deadline=>{
          if(job.preparation)return false;
          let steps=0;
          while(!job.built&&steps++<16&&performance.now()<deadline)job.built=job.task.next().done===true;
          if(!job.built)return false;
          if(!job.warmed&&this.prepareRoot){
            job.preparation=Promise.resolve(this.prepareRoot(root)).then(()=>{job.warmed=true;job.preparation=undefined;},
              error=>{this.preparationError=error instanceof Error?error:new Error(String(error));job.preparation=undefined;});
            return false;
          }
          if(this.active.get(key)!==owner)return true;
          owner.add(root);this.fogVisibility.includePrepared(owner,root);this.visualObserver?.(root,true);
          this.decorated.add(owner);this.decorations.delete(key);this.decorationTasks.delete(key);
          return true;
        },
      });
      this.decorationTasks.set(key,handle);
      void handle.done.catch(error=>{this.preparationError=error instanceof Error?error:new Error(String(error));});
    }
  }
  get completenessStatistics(){
    let forwardTotal=0,forwardReady=0;
    for(const key of this.debugState?.corridor?.keys()??[]){
      if(!this.streaming?.sectors.has(key))continue;
      forwardTotal++;if(this.roadComplete(key))forwardReady++;
    }
    return{forwardTotal,forwardReady,incompleteVisible:[...this.incompleteVisible].map(([key,since])=>({key,delayMs:performance.now()-since})),
      completed:this.completenessSamples,preparationSeconds:this.debugState?.preparationSeconds,lookaheadMetres:this.debugState?.lookaheadMetres,
      active:[...this.active].filter(([key])=>this.roadComplete(key)).map(([key,root])=>({key,manifest:root.userData.roadManifest}))};
  }
  private updateWorkerVisuals(x: number, z: number, yaw: number, speed: number, _frameMs?: number): boolean {
    const started = performance.now(), signature = `${this.key(x,z)}:${Math.floor(x / 100)},${Math.floor(z / 100)},${Math.round(yaw * 12 / Math.PI)},${Math.round(speed / 5)}`;
    const budget = this.runtime ? Math.min(this.initialPreparing ? 6 : 3, this.runtime.remainingMs) : 3;
    if(this.prepareRoot&&!this.backgroundWarmed&&!this.backgroundPreparation){
      const proxy=new Group(),geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,0,1],3));geometry.setAttribute('normal',new Float32BufferAttribute([0,1,0,0,1,0,0,1,0],3));geometry.setAttribute('color',new Float32BufferAttribute([1,1,1,1,1,1,1,1,1],3));
      proxy.children.push(...this.background.children,...this.terrain!.backgroundMaterials.map(m=>new Mesh(geometry,m)));
      proxy.name='基础远景材质';proxy.userData.streamingPriority=5000;
      this.background.visible=false;
      this.backgroundPreparation=this.prepareRoot(proxy).then(()=>{if(!this.disposed){this.backgroundWarmed=true;this.background.visible=true;}},error=>{this.preparationError=error instanceof Error?error:new Error(String(error));}).finally(()=>{proxy.children=[];geometry.dispose();});
    }
    let changed = false;
    if (signature !== this.selectionSignature || started >= this.nextTierRefresh) {
      this.selectionVersion++;
      this.selectionSignature = signature;
      this.debugState = this.streaming!.select(x, z, yaw, speed,this.referenceHeight);
      this.supplements.clear();
      for(const key of this.visibleRoadDemand.keys()){
        if(this.debugState.tiers.get(key)==='mid')this.supplements.add(key);
        this.debugState.tiers.set(key,'near');
      }
      this.nextTierRefresh = Infinity;
      for (const [key, tier] of this.activeTiers) {
        if (this.initialPreparing || tier !== 'near' || this.debugState.tiers.get(key) !== 'mid') {
          this.nearDowngradeAt.delete(key);
          continue;
        }
        const until = this.nearDowngradeAt.get(key) ?? started + 1500;
        this.nearDowngradeAt.set(key, until);
        if (started < until) {
          this.debugState.tiers.set(key, 'near');
          this.nextTierRefresh = Math.min(this.nextTierRefresh, until);
        }
      }
      this.roadTrimPending=true;
      const distances = new Map<string, number>();
      this.pending = [];
      for (const [key, tier] of this.debugState.tiers) if (tier !== 'far') {
        const [sx, sz] = key.split(',').map(Number),radial=Math.hypot((sx!+.5)*this.map.sectorSize-x,(sz!+.5)*this.map.sectorSize-z);
        const forward=this.debugState.corridor?.get(key);
        this.pending.push(key);distances.set(key,(key===this.debugState.currentSector?-10000:this.visibleRoadDemand.has(key)?radial-3000:forward===undefined?radial+600:forward)+(tier==='mid'?10000:0));
        if(tier==='near'&&!this.requestedAt.has(key)&&!this.tierReady(key,'near'))this.requestedAt.set(key,started);
      }
      this.pending.sort((a, b) => distances.get(a)! - distances.get(b)!);
      this.selectBackground(x,z);
      if(this.initialPreparing){
        const scope=this.initialScope??={tiers:new Map(),background:new Set(),roads:new Set(),preparedRoads:new Set()};
        for(const key of this.pending){const tier=this.debugState.tiers.get(key)!;scope.tiers.set(key,tier);if(tier==='near')for(const road of this.plans.get(key)?.roads??[]){scope.roads.add(road.id);if(this.compiled.has(road.id)||this.tierReady(key,'near'))scope.preparedRoads.add(road.id);}}
        for(const key of this.backgroundWanted){const[sx,sz]=key.split(',').map(Number),dx=Math.max(0,Math.abs((sx!+.5)*this.map.sectorSize-x)-this.map.sectorSize/2),dz=Math.max(0,Math.abs((sz!+.5)*this.map.sectorSize-z)-this.map.sectorSize/2);if(this.needsBackground(key)&&Math.hypot(dx,dz)<=1800)scope.background.add(key);}
      }
      this.protectedRoads.clear();
      const wantedTerrain=new Set<string>();
      for(const key of this.backgroundWanted)if(this.needsBackground(key))wantedTerrain.add(key+':far');
      for(const key of this.pending){const tier=this.debugState.tiers.get(key)!;wantedTerrain.add(key+':'+tier);if(tier==='near'){if(!this.active.has(key))wantedTerrain.add(key+':mid');for(const road of this.plans.get(key)?.roads??[])this.protectedRoads.add(road.id);}}
      for(const key of this.visualWorker!.retainRequests(this.protectedRoads,wantedTerrain)){
        if(key.startsWith('road:'))this.requestedRoads.delete(key.slice(5));else this.requestedTerrain.delete(key);
      }
      const roadPriorities=new Map<string,number>();
      for(let index=0;index<this.pending.length;index++){
        const key=this.pending[index]!,priority=key===this.debugState.currentSector?0:this.visibleRoadDemand.has(key)?2:10+index;
        if(this.debugState.tiers.get(key)==='near')for(const road of this.plans.get(key)?.roads??[])
          roadPriorities.set(road.id,Math.min(roadPriorities.get(road.id)??Infinity,priority));
        this.visualWorker!.setPriority(key+':near',key===this.debugState.currentSector?1:200+index);
      }
      for(const[id,priority]of roadPriorities)this.visualWorker!.setPriority('road:'+id,priority);
      this.retiringKeys.clear();
      for (const key of this.active.keys()) if (!this.debugState.tiers.has(key) || this.debugState.tiers.get(key) === 'far') this.retiringKeys.add(key);
      for (const [key, job] of this.publications) if (this.debugState.tiers.get(key) !== job.tier&&!(job.proxy&&this.debugState.tiers.get(key)==='near')) {
        job.root.userData.streamingWarmupCancelled=true;
        job.task.return(undefined); this.publications.delete(key);
        this.publicationTiming.delete(key);
        if (job.preparation) this.retiring.push({ key, job }); else this.disposePublication(key, job.root);
      }
      const city = this.map.regional!.cityBounds,cityDistance=Math.hypot(x - (city.minX + city.maxX) / 2, z - (city.minZ + city.maxZ) / 2);
      this.skylineEnabled=cityDistance>2700;this.skylineRequired=cityDistance>1900;
      for(const key of this.requestedAt.keys())if(this.debugState.tiers.get(key)!=='near')this.requestedAt.delete(key);
    }
    if(this.skylineRequired&&this.prepareRoot&&!this.skylineWarmed&&!this.skylinePreparation){
      const proxy=new Group();proxy.name='城市 HLOD 代理';proxy.children.push(...this.skyline.children);proxy.userData.streamingPriority=()=>this.skylineEnabled?100:5000;
      this.skylinePreparation=this.prepareRoot(proxy).then(()=>{this.skylineWarmed=true;},error=>{this.preparationError=error instanceof Error?error:new Error(String(error));}).finally(()=>{proxy.children=[];});
    }
    for (const key of this.retiringKeys) {
      if (this.backgroundWanted.has(key) && !this.hasPublishedBackground(key)) continue;
      this.retiringKeys.delete(key);
      this.unload(key);
      changed = true;
      break;
    }
    // Worker replies only enqueue data. Main-thread installation shares one small frame budget.
    if(!this.installation&&this.receivedRoads.length) {const road=this.receivedRoads.shift()!;this.installingRoad=road.id;this.installation=this.receiveRoad(road);}
    while(this.installation&&performance.now()-started<budget) {
      if(this.installation.next().done){this.installation=undefined;this.installingRoad=undefined;}
    }
    const current = this.debugState!.currentSector;
    if (!this.tierReady(current,'near') && !this.publications.get(current)?.built) {
      for (const road of this.plans.get(current)?.roads ?? []) this.requestRoad(road, 0);
    }
    let candidates = 0;
    for (let index = -1; index < this.pending.length; index++) {
      const key = index < 0 ? current : this.pending[index]!;
      if (index >= 0 && key === current) continue;
      const tier = this.debugState!.tiers.get(key) ?? 'near';
      if (this.tierReady(key,tier) || this.publications.has(key)) continue;
      if (++candidates > 4) break;
      const plan = this.plans.get(key);
      if (tier === 'near') {
        for (const road of plan?.roads ?? []) this.requestRoad(road, key === current ? 0 : this.visibleRoadDemand.has(key)?2:10 + candidates);
        if ([...plan?.roads ?? []].some(r => !this.compiled.has(r.id))) {
          if(!this.active.has(key)){
            const proxy=this.requestTerrain(key,'mid',key===current?-2:5+candidates);
            if(proxy){
              const root=new Group();root.name=`Road base proxy ${key}`;root.userData.streamingPriority=key===current?0:100;
              this.publications.set(key,{tier:'mid',proxy:true,root,task:this.buildPublication(key,'mid',root,proxy)});
              this.signRevision++;
              this.publicationTiming.set(key,{started:performance.now(),active:0,maxStep:0});
            }
          }
          continue;
        }
      }
      const supplement=tier==='near'&&this.supplements.has(key)&&this.activeTiers.get(key)==='mid';
      const terrain = supplement?undefined:this.requestTerrain(key, tier, key === current ? 1 : 200 + candidates);
      if (!terrain&&!supplement) continue;
      if (tier === 'near') for (const road of plan?.roads ?? []) {
        const recipe = this.roadResidency.get(road.id);
        if (recipe) { this.roadResidency.delete(road.id); this.roadResidency.set(road.id, recipe); }
      }
      const root = new Group(); root.name = `City sector ${key}`;
      root.userData.streamingPriority=()=>key===this.debugState?.currentSector?0:this.visibleRoadDemand.has(key)?5:tier==='near'?(this.debugState?.corridor?.get(key)??Infinity)<1000?20:100:1000;
      this.publications.set(key, { tier, root,supplement, task: this.buildPublication(key, tier, root, terrain,supplement) });
      this.signRevision++;
      this.publicationTiming.set(key,{started:performance.now(),active:0,maxStep:0});
    }
    let steps = 0, published = 0;
    for (const [key, job] of [...this.publications].sort((a,b)=>(a[0]===current?-1:b[0]===current?1:0))) {
      if (steps >= 128 || performance.now() - started >= budget || published >= (this.initialPreparing ? 3 : 1)) break;
      if (job.preparation) continue;
      while(!job.built&&steps<128&&performance.now()-started<budget) { const buildStarted = performance.now(); job.built = job.task.next().done === true; const elapsed=performance.now()-buildStarted;this.publicationMs +=elapsed;const timing=this.publicationTiming.get(key);if(timing){timing.active+=elapsed;timing.maxStep=Math.max(timing.maxStep,elapsed);}steps++; }
      if (job.built && !job.warmed) {
        if (this.prepareRoot) {
          job.preparation = Promise.resolve().then(() => this.prepareRoot!(job.root)).then(() => { job.warmed = true; job.preparation = undefined; }, error => {
            this.preparationError = error instanceof Error ? error : new Error(String(error)); job.preparation = undefined;
          });
          continue;
        }
        job.warmed = true;
      }
      if (job.built && job.warmed) {
        if(job.supplement){
          const owner=this.active.get(key)!;
          job.root.userData.roadCritical=true;
          owner.add(job.root);owner.userData.roadManifest=job.root.userData.roadManifest;
          this.fogVisibility.includePrepared(owner,job.root);
        } else {
          // A distance downgrade replaces terrain/base detail, not road safety.
          // Transfer already-warmed GPU resources rather than destroy and compile
          // the same markings, rails and signs again when the player turns back.
          const previous=this.active.get(key);
          if(job.tier==='mid'&&previous?.userData.roadManifest?.complete){
            for(const child of [...previous.children])if(child.userData.roadCritical){
              this.visualObserver?.(child,false);job.root.add(child);
            }
            job.root.userData.roadManifest=previous.userData.roadManifest;
            this.fogVisibility.transfer(job.root,previous);
          }
          if (this.active.has(key)) this.unload(key);
          this.fogVisibility.publish(key,job.root);
          this.active.set(key, job.root); this.activeTiers.set(key, job.tier); this.root.add(job.root); this.terrain!.setActive(key, true);
        }
        this.visualObserver?.(job.root, true);
        this.publications.delete(key); changed = true; published++; this.roadTrimPending = true;
        this.signTrimPending=true;this.signRevision++;
        if(job.tier==='near'){
          const requested=this.requestedAt.get(key);
          if(requested!==undefined){this.streaming!.corridor.observePreparation(performance.now()-requested);this.requestedAt.delete(key);}
          const since=this.incompleteVisible.get(key);
          this.completenessSamples.push({key,delayMs:since===undefined?0:performance.now()-since,manifest:job.root.userData.roadManifest});
          if(this.completenessSamples.length>256)this.completenessSamples.shift();
          this.incompleteVisible.delete(key);
        }
        const timing=this.publicationTiming.get(key);if(timing){this.publicationSamples.push({key,tier:job.tier,activeMs:timing.active,maxStepMs:timing.maxStep,elapsedMs:performance.now()-timing.started});if(this.publicationSamples.length>512)this.publicationSamples.shift();this.publicationTiming.delete(key);}
      }
    }
    // Never dispose materials/geometries while compileAsync still borrows them.
    const retired = this.retiring.findIndex(entry => !entry.job.preparation);
    if (retired >= 0 && performance.now() - started < budget) {
      const entry = this.retiring.splice(retired, 1)[0]!; this.disposePublication(entry.key, entry.job.root);
    }
    // Amortize worker/frame round trips without concentrating main-thread publication.
    let backgroundSteps = 0;
    while ((!this.prepareRoot||this.backgroundWarmed)&&this.backgroundBatches.canAccept&&performance.now() - started < budget && this.backgroundPending.length && backgroundSteps < 4) {
      const key = this.backgroundPending[0]!, data = this.terrainData.get(key + ':far');
      if(this.initialPreparing&&!this.initialScope?.background.has(key))break;
      if (!data) break;
      this.backgroundPending.shift(); this.discardTerrain(key + ':far');
      data.geometries.forEach((g, i) => this.backgroundBatches.append(key, i, g, this.terrain!.materialFor('far', i,key)));
      for(const g of data.ground??[])this.backgroundBatches.append(key,2,g,this.terrain!.farLand);
      const group=this.backgroundBatches.bucketFor(key);
      let resident=this.backgroundResident.get(group);if(!resident){resident=new Set();this.backgroundResident.set(group,resident);}resident.add(key);
      this.backgroundBuilt++; backgroundSteps++;
    }
    if (performance.now() - started < budget) this.backgroundBatches.advance(this.initialPreparing);
    if (this.backgroundPending.length&&this.backgroundBatches.canAccept&&!this.visualWorker!.hasForegroundWork) {
      // Bound non-interruptible background work so new foreground requests can win sooner.
        const key = this.backgroundPending.find(key => (!this.initialPreparing||this.initialScope?.background.has(key))&&!this.terrainData.has(key + ':far') && !this.requestedTerrain.has(key + ':far'));
        if (key) {
          this.requestedTerrain.add(key + ':far');
          this.visualWorker!.request('background:' + key, { kind: 'background', keys: [key] }, 10000);
        }
    }
    this.visualWorker!.advance();
    if(this.runtime && this.maintenance?.state!=='queued') {
      this.maintenance=this.runtime.enqueue({
        id:'world:cache',phase:'maintenance',priority:()=>this.fogVisibility.resources.underPressure||this.releases.length>8||this.roadResidencyBytes+this.terrainCacheBytes>this.recipeBudgetBytes?'gpu':'maintenance',valid:()=>!this.disposed,
        step:deadline=>{this.advanceMaintenance(deadline);return true;},
      });
      void this.maintenance.done.catch(error=>{this.preparationError=error instanceof Error?error:new Error(String(error));});
    } else if(!this.runtime) {this.trimTerrainCache();if(performance.now()-started<budget)this.trimRoadResidency();}
    if(changed)this.signTrimPending=true;
    this.scheduleDecorations();
    if (this.firstVisibleMs === undefined && this.active.has(current)) this.firstVisibleMs = performance.now() - this.loadStarted;
    if (this.firstReadyMs === undefined && this.ready) this.firstReadyMs = performance.now() - this.loadStarted;
    if(this.spawnGroundReadyMs===undefined&&this.spawnReady) {
      this.spawnGroundReadyMs=performance.now()-this.loadStarted;
      performance.mark('loading:spawnGroundReady');
      performance.measure('ground:spawnReady',{start:this.loadStarted,end:performance.now(),detail:this.groundStatistics});
    }
    this.maxUpdateMs=Math.max(this.maxUpdateMs,performance.now()-started);return changed;
  }
  private *releaseRootSteps(root:Group):Generator<void>{
    const stack:Object3D[]=[root];
    while(stack.length){
      const object=stack.pop()!;
      for(const child of object.children)stack.push(child);
      if(object instanceof InstancedMesh)object.dispose();
      else if(object instanceof Mesh){if(object.userData.worldGeometryLease)this.fogVisibility.resources.release(object.geometry);else object.geometry.dispose();}
      yield;
    }
    root.clear();
  }
  private disposeVisualRoot(root: Group,key=''): void {
    root.removeFromParent();
    const task=this.releaseRootSteps(root);
    if(this.disposed)drain(task);
    else this.releases.push({key,tier:root.userData.streamingTier,root,task});
  }
  private disposePublication(key: string, root: Group): void {
    for (const j of this.plans.get(key)?.intersections ?? []) this.signals.removeHeadsForJunction(this.map.intersections.indexOf(j), root);
    this.disposeVisualRoot(root,key);
    if(this.debugState?.tiers.get(key)!=='near')this.visibleRoadDemand.delete(key);
    this.signRevision++;this.signTrimPending=true;
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
      const city=this.map.regional!.cityBounds;this.skylineEnabled=Math.hypot(x-(city.minX+city.maxX)/2,z-(city.minZ+city.maxZ)/2)>2700;
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
  private selectBackground(x:number,z:number):void {
    const size=this.map.sectorSize,bounds=this.map.regional!.terrainBounds,range=this.backgroundRange;
    const minX=Math.max(Math.floor(bounds.minX/size),Number.isFinite(range)?Math.floor((x-range-size)/size):-Infinity),maxX=Math.min(Math.floor((bounds.maxX-.001)/size),Number.isFinite(range)?Math.floor((x+range+size)/size):Infinity);
    const minZ=Math.max(Math.floor(bounds.minZ/size),Number.isFinite(range)?Math.floor((z-range-size)/size):-Infinity),maxZ=Math.min(Math.floor((bounds.maxZ-.001)/size),Number.isFinite(range)?Math.floor((z+range+size)/size):Infinity);
    const groups=new Set<string>(),pending:{key:string;distance:number}[]=[];this.backgroundWanted.clear();
    for(let sx=minX;sx<=maxX;sx++)for(let sz=minZ;sz<=maxZ;sz++){
      const distance=Math.hypot(Math.max(0,Math.abs((sx+.5)*size-x)-size/2),Math.max(0,Math.abs((sz+.5)*size-z)-size/2));
      if(distance>range)continue;const key=`${sx},${sz}`,group=this.backgroundBatches.bucketFor(key);
      this.backgroundWanted.add(key);
      groups.add(group);
      if (this.needsBackground(key) && !this.backgroundResident.get(group)?.has(key)) pending.push({key,distance});
    }
    this.backgroundBatches.retainGroups(groups);
    for(const group of this.backgroundResident.keys())if(!groups.has(group))this.backgroundResident.delete(group);
    for(const key of this.terrainData.keys())if(key.endsWith(':far')&&!this.needsBackground(key.slice(0,-4)))this.discardTerrain(key);
    pending.sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key));this.backgroundPending=pending.map(p=>p.key);
  }
  private needsBackground(key: string): boolean {
    const tier = this.debugState?.tiers.get(key);
    return this.backgroundWanted.has(key) && (tier === 'far' || tier === undefined);
  }
  private hasPublishedBackground(key: string): boolean {
    if (this.backgroundBatches.isPending(key)) return false;
    return this.backgroundResident.get(this.backgroundBatches.bucketFor(key))?.has(key) ?? false;
  }
  private *trimSignSteps():Generator<void>{
    const version=this.signRevision,wanted=new Set<string>();
    const keys=new Set<string>();
    for(const key of this.active.keys())if(this.roadComplete(key))keys.add(key);
    for(const[key,job]of this.publications)if(job.tier==='near')keys.add(key);
    for(const entry of this.retiring)if(entry.job.tier==='near')keys.add(entry.key);
    for(const entry of this.releases)if(entry.tier==='near')keys.add(entry.key);
    for(const key of keys)for(const sign of this.plans.get(key)?.signs??[]){wanted.add(this.signRenderer.contentKey(sign));yield;}
    if(version!==this.signRevision)return;
    yield* this.signRenderer.retainContentKeysSteps(wanted,()=>version===this.signRevision);
    if(version===this.signRevision)this.signTrimPending=false;
  }
  private trimSignCache():void{drain(this.trimSignSteps());}
  private advanceMaintenance(deadline:number):void{
    const until=Math.min(deadline,performance.now()+.6);
    this.fogVisibility.resources.releaseExpired(until);
    switch(this.releases.length>8?0:this.maintenanceStage++%4){
      case 0:{
        let steps=0;
        while(this.releases.length&&steps++<24&&performance.now()<until){
          if(this.releases[0]!.task.next().done){this.releases.shift();this.signTrimPending=true;this.signRevision++;}
        }
        this.backgroundBatches.releaseExpired(until);
        break;
      }
      case 1:{
        this.roadTrimTask??=this.trimRoadSteps();
        for(let steps=0;steps<24&&performance.now()<until;steps++)if(this.roadTrimTask.next().done){this.roadTrimTask=undefined;break;}
        break;
      }
      case 2:this.trimTerrainCache(until);break;
      case 3:{
        if(!this.signTrimPending)break;
        this.signTrimTask??=this.trimSignSteps();
        for(let steps=0;steps<16&&performance.now()<until;steps++)if(this.signTrimTask.next().done){this.signTrimTask=undefined;break;}
      }
    }
  }
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
    this.nearDowngradeAt.delete(key);
    const root = this.active.get(key); if (!root) return;
    this.fogVisibility.unpublish(key,root);
    this.visualObserver?.(root,false);
    for (const j of this.plans.get(key)?.intersections??[]) this.signals.removeHeadsForJunction(this.map.intersections.indexOf(j), this.visualWorker ? root : undefined);
    this.disposeVisualRoot(root,key);
    if(this.debugState?.tiers.get(key)!=='near')this.visibleRoadDemand.delete(key);
    this.signRevision++;this.signTrimPending=true;
    this.active.delete(key);this.activeTiers.delete(key);this.terrain?.setActive(key,false);
  }
  update(dt: number): void { this.signals.update(dt);this.signals.root.updateWorldMatrix(true,true); }
  dispose(afterRelease?: () => void): void {
    if (this.disposed) return;
    this.maintenance?.cancel();
    this.disposed = true; this.visualWorker?.dispose(); this.root.removeFromParent();
    for(const handle of this.decorationTasks.values())handle.cancel();
    for(const {job}of this.decorations.values())job.root.userData.streamingWarmupCancelled=true;
    this.backgroundBatches.cancel();
    const pending = [...this.publications.values(), ...this.retiring.map(entry => entry.job)]
      .flatMap(job => job.preparation ? [job.preparation] : []);
    if(this.backgroundPreparation)pending.push(this.backgroundPreparation);
    if(this.skylinePreparation)pending.push(this.skylinePreparation);
    if(this.backgroundBatches.pendingPreparation)pending.push(this.backgroundBatches.pendingPreparation);
    for(const {job}of this.decorations.values())if(job.preparation)pending.push(job.preparation);
    const release = () => { this.releaseResources(); afterRelease?.(); };
    if (pending.length) void Promise.allSettled(pending).then(release);
    else release();
  }
  private releaseResources(): void {
    for(const {job}of this.decorations.values()){job.task.return(undefined);this.disposeVisualRoot(job.root);}
    this.decorations.clear();this.decorationTasks.clear();
    for(const entry of this.releases)drain(entry.task);
    this.releases.length=0;this.requestedAt.clear();this.incompleteVisible.clear();this.visibleRoadDemand.clear();
    this.roadTrimTask?.return(undefined);this.roadTrimTask=undefined;
    this.signTrimTask?.return(undefined);this.signTrimTask=undefined;this.terrainTrim=undefined;
    this.backgroundWanted.clear();this.backgroundResident.clear();this.backgroundPending.length=0;
    this.roadResidency.clear();this.roadResidencyBytes=0;this.protectedRoads.clear();this.publicationTiming.clear();this.publicationSamples.length=0;
    this.pinnedRoadBytes = 0;
    this.retiringKeys.clear();
    this.nearDowngradeAt.clear();
    this.installation?.return(undefined);this.installation=undefined;this.installingRoad=undefined;
    for(const [key,job] of this.publications){job.task.return(undefined);this.disposePublication(key,job.root);}
    for(const {key,job} of this.retiring)this.disposePublication(key,job.root);
    this.retiring.length=0;this.publications.clear();this.terrainData.clear();this.terrainBytes.clear();this.terrainCacheBytes=0;this.receivedRoads.length=0;this.instanceGeometry.clear();
    for (const key of this.active.keys()) this.unload(key);
    this.signals.dispose();
    for (const geometry of this.infrastructureGeometry) geometry.dispose(); this.infrastructureGeometry.clear();
    this.signRenderer.dispose();drain(this.releaseRootSteps(this.background));this.backgroundBatches.dispose();
    drain(this.releaseRootSteps(this.skyline));
    this.fogVisibility.dispose();
    this.terrain?.dispose(); this.root.clear(); this.plans.clear();this.resourcesReleased=true;
  }
}
