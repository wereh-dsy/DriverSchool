import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Material, Matrix4, Mesh, Vector3 } from 'three';
import type { CityIntersection, CityMapData, CityObject, CityRoad } from './CityMapData';
import type { Subject3Materials } from '../subject3/materials';
import { Subject3TrafficSignals } from '../subject3/trafficSignals';
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

interface GeometryPlan { positions: number[]; normals: number[]; uvs: number[]; material: Material }
interface InstancePlan { geometry: BufferGeometry; material: Material; matrices: Matrix4[]; lamp: boolean }
interface SectorPlan { surfaces: Map<Material, GeometryPlan>; instances: Map<BufferGeometry, InstancePlan>; intersections: CityIntersection[]; objects: CityObject[];signs:RoadSignDefinition[];roads:Set<CityRoad> }
export interface SectorOptions { loadRadius?: number; editor?: boolean }
export class SectorManager {
  readonly root = new Group();
  readonly active = new Map<string, Group>();
  private readonly plans = new Map<string, SectorPlan>();
  private readonly infrastructureGeometry = new Set<BufferGeometry>();
  private readonly intersectionBuilder: IntersectionBuilder;
  readonly signRenderer:RoadSignRenderer;
  readonly signals: Subject3TrafficSignals;
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
  readonly loadRadius: number;
  get ready():boolean {return this.pending.every(key=>this.active.has(key));}
  constructor(readonly map: CityMapData, private readonly materials: Subject3Materials, readonly prefabs: PrefabRegistry, options: SectorOptions = {}) {
    this.loadRadius = Math.max(0, Math.floor(options.loadRadius ?? 1));
    this.intersectionBuilder = new IntersectionBuilder(map, materials);
    this.signRenderer=new RoadSignRenderer(map.roadNames??{});
    this.signals = new Subject3TrafficSignals(map.intersections.length, map.intersections.map(j => j.signals?.offsetSeconds ?? 0), { greenSeconds: 25, amberSeconds: 3, allRedSeconds: 2 });
    this.root.add(this.signals.root);
    this.roadBuilder = new RoadBuilder(materials, map);
    if(map.regional){this.streaming=new RegionalStreaming(map);this.terrain=new RegionalTerrain(map);}
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
      const batches=new Map<Material,BufferGeometry[]>();
      for(const key of this.streaming.sectors){const chunk=this.terrain.build(key,'far');chunk.traverse(o=>{if(o instanceof Mesh){const material=o.material as Material,list=batches.get(material)??[];list.push(o.geometry);batches.set(material,list);}});}
      for(const [material,geometries]of batches){const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(geometry)this.background.add(new Mesh(geometry,material));}
      const silhouettes:BufferGeometry[]=[];
      for(const route of map.regional!.routes){const geometry=createStripGeometry(route.centerline,()=>0,{innerOffset:-route.lanes*3.75-5,outerOffset:route.lanes*3.75+5,yOffset:.024,maximumSpacing:80});if(geometry){const colors=new Float32Array(geometry.getAttribute('position').count*3);colors.fill(.16);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));this.terrain!.drapeSilhouette(geometry,'far');silhouettes.push(geometry);}}
      for(const road of map.roads.filter(r=>!r.id.startsWith('regional:')&&r.type==='highway'&&r.laneCount>=3&&!r.gore)){const edges=roadEdges(road),geometry=createStripGeometry(roadPoints(road),()=>0,{innerOffset:edges.left,outerOffset:edges.right,yOffset:.024,maximumSpacing:80});if(geometry){const colors=new Float32Array(geometry.getAttribute('position').count*3);colors.fill(.16);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));this.terrain!.drapeSilhouette(geometry,'far');silhouettes.push(geometry);}}
      if(silhouettes.length){const geometry=mergeGeometries(silhouettes);silhouettes.forEach(g=>g.dispose());if(geometry)this.background.add(new Mesh(geometry,this.terrain.farRoad));}
      const forests:BufferGeometry[]=[];
      map.objects.filter(o=>o.id.startsWith('regional:')&&o.prefabId==='tree').filter((_,i)=>i%10===0).forEach(o=>{const geometry=new CylinderGeometry(0,14,12,5).toNonIndexed();geometry.translate(o.position.x,(o.position.y??0)+6,o.position.z);const colors=new Float32Array(geometry.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=.24;colors[i+1]=.35;colors[i+2]=.2;}geometry.setAttribute('color',new Float32BufferAttribute(colors,3));forests.push(geometry);});
      if(forests.length){const geometry=mergeGeometries(forests);forests.forEach(g=>g.dispose());if(geometry)this.background.add(new Mesh(geometry,this.terrain.farLand));}
      this.skyline.add(prefabs.buildInstances(map.objects.filter(o=>!o.id.startsWith('regional:')&&['office','residential_mid','industrial'].includes(o.prefabId))));
      this.root.add(this.background,this.skyline);
    }
    if (options.editor) {for(const road of map.roads)this.compileRoad(road);for (const key of this.plans.keys()) this.load(key);}
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
    if (!plan) { plan = { surfaces: new Map(), instances: new Map(), intersections: [], objects: [],signs:[],roads:new Set() }; this.plans.set(key, plan); }
    return plan;
  }
  updatePosition(x: number, z: number,yaw=0,speed=0): boolean {
    if(this.streaming)return this.updateRegional(x,z,yaw,speed);
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
  private updateRegional(x:number,z:number,yaw:number,speed:number):boolean {
    const signature=`${Math.floor(x/100)},${Math.floor(z/100)},${Math.round(yaw*12/Math.PI)},${Math.round(speed/5)}`;
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
    for(const road of this.preloadRoads){if(this.compiled.has(road.id))continue;if(budget<=0){if(changed)this.trimSignCache();return changed;}this.compileRoad(road);budget--;}
    for(const key of this.pending){
      const plan=this.plans.get(key),tier=this.debugState!.tiers.get(key)!;
      if(this.active.has(key))continue;
      // Mid carries a simplified pavement, building and forest massing; no detailed compile.
      if(tier==='near')for(const road of plan?.roads??[]){if(this.compiled.has(road.id))continue;if(budget<=0){if(changed)this.trimSignCache();return changed;}this.compileRoad(road);budget--;}
      this.load(key,tier);changed=true;
    }
    if(changed)this.trimSignCache();return changed;
  }
  private trimSignCache():void {const signs:RoadSignDefinition[]=[];for(const key of this.active.keys())if(this.activeTiers.get(key)==='near')signs.push(...this.plans.get(key)?.signs??[]);this.signRenderer.retainContents(signs);}
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
      this.activeTiers.set(key,tier);this.active.set(key,root);this.root.add(root);this.terrain?.setActive(key,true);return;
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
  }
  private unload(key: string): void {
    const root = this.active.get(key); if (!root) return;
    for (const j of this.plans.get(key)?.intersections??[]) this.signals.removeHeadsForJunction(this.map.intersections.indexOf(j));
    root.traverse(o => {
      if (o instanceof InstancedMesh) o.dispose(); // Template geometry/materials belong to the registry.
      else if (o instanceof Mesh) o.geometry.dispose();
    });
    root.removeFromParent(); this.active.delete(key);this.activeTiers.delete(key);this.terrain?.setActive(key,false);
  }
  update(dt: number): void { this.signals.update(dt); }
  dispose(): void { for (const key of this.active.keys()) this.unload(key); for (const geometry of this.infrastructureGeometry) geometry.dispose(); this.infrastructureGeometry.clear();this.signRenderer.dispose();this.background.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});this.skyline.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});this.terrain?.dispose(); this.root.clear(); this.plans.clear(); }
}
