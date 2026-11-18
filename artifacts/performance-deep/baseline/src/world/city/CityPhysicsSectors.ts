import { nextPaint } from '../../loading/Loading';
import type { StaticCollider } from '../../vehicle/physics/CollisionSystem';
import type { CityRoad } from './CityMapData';
import type { SectorManager } from './SectorManager';
import { runtimeRoadClearance } from './RoadClearance';
import { roadStructureColliderSteps } from './RoadInfrastructure';

interface RoadJob { task: Generator<StaticCollider|void>; colliders: StaticCollider[]; ready: boolean }
/** Physics residency over SectorManager's existing road membership and sector IDs.
 * Whole road primitives stay intact, including rails across sector boundaries.
 * Surface support/topology remain global and do not depend on visual residency. */
export class CityPhysicsSectors {
  private readonly jobs = new Map<CityRoad, RoadJob>();
  private active = new Set<string>();
  private wanted: CityRoad[] = [];
  private required = new Set<CityRoad>();
  private guardRoads = new Set<CityRoad>();
  private published: RoadJob[] = [];
  private signature = '';
  private selectedAt = -Infinity;
  private safeCells = '';
  private dirty = false;
  private disposed = false;
  private readonly order: Map<CityRoad, number>;
  readonly activeRadius: number;
  readonly preloadRadius: number;
  private forwardMetres = 0;
  private buildActiveMs = 0;
  private maxBatchMs = 0;
  private maxSingleBuildStepMs = 0;
  private synchronousFallbacks = 0;
  private completedRoads = 0;
  constructor(private readonly sectors: SectorManager, private readonly publish: (roads: readonly StaticCollider[][]) => void) {
    const size = sectors.map.sectorSize;
    this.activeRadius = size * .6;
    this.preloadRadius = this.activeRadius + size;
    this.order = new Map(sectors.map.roads.map((r,i) => [r,i]));
  }
  private keys(x: number, z: number, radius: number): string[] {
    const size = this.sectors.map.sectorSize, keys: string[] = [];
    for (let sx=Math.floor((x-radius)/size); sx<=Math.floor((x+radius)/size); sx++)
      for (let sz=Math.floor((z-radius)/size); sz<=Math.floor((z+radius)/size); sz++) keys.push(`${sx},${sz}`);
    return keys;
  }
  private roads(keys: Iterable<string>): Set<CityRoad> {
    const roads = new Set<CityRoad>();
    for (const key of keys) for (const road of this.sectors.roadsForSector(key) ?? []) roads.add(road);
    return roads;
  }
  select(x: number, z: number, vx=0, vz=0): void {
    const now=performance.now(), size=this.sectors.map.sectorSize;
    const signature=this.sectors.sectorKey(x,z);
    if (signature===this.signature && now-this.selectedAt<200) return;
    this.signature=signature; this.selectedAt=now;
    this.active=new Set(this.keys(x,z,this.activeRadius)); this.required=this.roads(this.active);
    this.dirty=true;
    const speed=Math.hypot(vx,vz), fx=speed>.1?vx/speed:0, fz=speed>.1?vz/speed:0;
    this.forwardMetres=Math.min(size*4,speed*12);
    const preload=new Set(this.keys(x,z,this.preloadRadius));
    // A conservative swept corridor, including reverse and lateral motion.
    for(let d=0;d<=this.forwardMetres;d+=size*.5)
      for(const key of this.keys(x+fx*d,z+fz*d,this.activeRadius)) preload.add(key);
    for(const key of this.keys(x+fx*this.forwardMetres,z+fz*this.forwardMetres,this.activeRadius)) preload.add(key);
    const wanted=this.roads(preload);
    this.wanted=[...wanted].sort((a,b)=>Number(this.required.has(b))-Number(this.required.has(a)) ||
      this.distance(a,x,z,fx,fz)-this.distance(b,x,z,fx,fz));
    // Geometric hysteresis: keep two extra sector rings before releasing roads.
    const retained=this.roads(this.keys(x,z,this.preloadRadius+size*2));
    for(const road of wanted) retained.add(road);
    for(const [road,job] of this.jobs) if(!retained.has(road)) {
      job.task.return(undefined); this.jobs.delete(road); if(job.ready) this.dirty=true;
    }
    this.safeCells='';
  }
  private distance(road: CityRoad,x:number,z:number,fx:number,fz:number): number {
    let best=Infinity;
    for(const p of road.centerline) {const dx=p.x-x,dz=p.z-z;best=Math.min(best,Math.hypot(dx,dz)-Math.max(0,dx*fx+dz*fz)*.4);}
    return best;
  }
  private job(road: CityRoad): RoadJob {
    let job=this.jobs.get(road);
    if(!job) {job={task:roadStructureColliderSteps(road,this.sectors.map,runtimeRoadClearance(this.sectors.map)),colliders:[],ready:false};this.jobs.set(road,job);}
    return job;
  }
  private step(job: RoadJob): void {
    const started=performance.now();
    const next=job.task.next();
    this.maxSingleBuildStepMs=Math.max(this.maxSingleBuildStepMs,performance.now()-started);
    if(next.done) {job.ready=true;this.dirty=true;this.completedRoads++;}
    else if(next.value) job.colliders.push(next.value);
  }
  private commit(): void {
    if(!this.dirty) return;
    const roads=new Set([...this.required,...this.guardRoads]);
    const jobs=[...roads].sort((a,b)=>this.order.get(a)!-this.order.get(b)!).map(r=>this.jobs.get(r)).filter((j):j is RoadJob=>!!j?.ready);
    // Warm-cache completion must not rebuild the active contact spatial index.
    if(jobs.length!==this.published.length || jobs.some((job,i)=>job!==this.published[i])) {
      this.publish(jobs.map(j=>j.colliders));this.published=jobs;
    }
    this.dirty=false;
  }
  advance(budgetMs=3, requiredOnly=false): void {
    if(this.disposed) return;
    const started=performance.now();
    for(const road of requiredOnly?this.required:this.wanted) {
      const job=this.job(road);
      while(!job.ready) { this.step(job); if(performance.now()-started>=budgetMs) {this.finishBatch(started);return;} }
    }
    this.finishBatch(started);
  }
  private finishBatch(started:number): void {
    this.commit(); const elapsed=performance.now()-started;
    this.buildActiveMs+=elapsed;this.maxBatchMs=Math.max(this.maxBatchMs,elapsed);
  }
  async prepareSpawn(x:number,z:number,yaw:number): Promise<void> {
    this.select(x,z,-Math.sin(yaw),-Math.cos(yaw));
    const started=performance.now();
    while([...this.required].some(road=>!this.jobs.get(road)?.ready)) {this.advance(5,true);await nextPaint();}
    this.commit();
    performance.mark('loading:spawnPhysicsReady');
    performance.measure('physics:spawnReady',{start:started,end:performance.now(),detail:this.statistics});
  }
  /** Before every physical sweep: finish only missing roads in the swept guard.
   * No speed/pose correction or invented wall. The usual path is four floor ops.
   * Surface support is global, so loading can never turn a road into grass/void. */
  ensure(x:number,z:number,vx:number,vz:number,dt:number,bodyRadius:number): void {
    if(this.disposed) return;
    this.select(x,z,vx,vz);
    const size=this.sectors.map.sectorSize, radius=bodyRadius+Math.hypot(vx,vz)*Math.max(0,dt)*2+4;
    const minX=Math.floor((x-radius)/size),maxX=Math.floor((x+radius)/size),minZ=Math.floor((z-radius)/size),maxZ=Math.floor((z+radius)/size);
    const cells=`${minX},${maxX},${minZ},${maxZ}`;
    if(cells===this.safeCells) return;
    this.guardRoads.clear();this.dirty=true;
    const started=performance.now();let fallback=false;
    for(let sx=minX;sx<=maxX;sx++) for(let sz=minZ;sz<=maxZ;sz++) for(const road of this.sectors.roadsForSector(`${sx},${sz}`)??[]) {
      this.guardRoads.add(road);
      const job=this.job(road);if(!job.ready) fallback=true;
      while(!job.ready) this.step(job);
    }
    if(fallback) this.synchronousFallbacks++;
    this.finishBatch(started); this.safeCells=cells;
  }
  get statistics() {
    let readySectors=0,cachedColliders=0;
    for(const key of this.active) if([...this.sectors.roadsForSector(key)??[]].every(r=>this.jobs.get(r)?.ready)) readySectors++;
    for(const job of this.jobs.values()) if(job.ready) cachedColliders+=job.colliders.length;
    const colliders=this.published.reduce((sum,j)=>sum+j.colliders.length,0);
    return {activeSectors:readySectors,requestedActiveSectors:this.active.size,readySectors,cachedRoads:this.jobs.size,totalRoads:this.sectors.map.roads.length,completedRoads:this.completedRoads,colliders,cachedColliders,activeRadius:this.activeRadius,preloadRadius:this.preloadRadius,forwardMetres:this.forwardMetres,colliderBuildActiveMs:this.buildActiveMs,maxBatchMs:this.maxBatchMs,maxSingleBuildStepMs:this.maxSingleBuildStepMs,synchronousFallbacks:this.synchronousFallbacks};
  }
  dispose(): void {this.disposed=true;for(const job of this.jobs.values())job.task.return(undefined);this.jobs.clear();this.wanted=[];this.required.clear();this.guardRoads.clear();this.published=[];this.active.clear();}
}
