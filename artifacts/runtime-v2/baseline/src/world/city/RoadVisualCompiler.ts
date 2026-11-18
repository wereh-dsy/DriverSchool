import { drain } from '../../loading/Loading';
import { BufferAttribute, BufferGeometry, InstancedMesh, Material, Matrix4, Mesh, Vector3, type MeshBasicMaterial } from 'three';
import type { CityMapData } from './CityMapData';
import { RoadBuilder } from './RoadBuilder';
import { exportVisualGeometry, type CompiledRoadVisual } from './VisualStreamingData';
import type { Subject3Materials } from '../subject3/materials';
import type { RoadGeometryTrialSelection } from './RoadGeometryTrial';
import {indexRoadGeometrySteps} from './ContinuousRoadGeometry';

/** Uses exactly the existing authored builder; only visual CPU output crosses the worker boundary. */
export class RoadVisualCompiler {
  lastMetrics?:{phases:Record<string,number>;temporaryBytes:number;outputBytes:number;geometryTypes:Record<string,number>;geometryObjects:Record<string,number>};
  get cacheStatistics(){return this.builder.geometryCacheStatistics;}
  private readonly builder: RoadBuilder;
  private readonly roads: Map<string, CityMapData['roads'][number]>;
  private readonly names = new Map<Material, string>();
  private readonly exportedInstances = new Set<string>();
  public constructor(private readonly map: CityMapData, materials: Subject3Materials & { tunnelLight: MeshBasicMaterial }, _selection?: RoadGeometryTrialSelection,private readonly diagnostics=false) {
    this.builder = new RoadBuilder(materials, map); this.roads = new Map(map.roads.map(r => [r.id, r]));
    for (const [name, material] of Object.entries(materials)) this.names.set(material, name);
  }
  public compile(id: string): CompiledRoadVisual { return drain(this.compileSteps(id)); }
  public *compileSteps(id: string): Generator<void,CompiledRoadVisual> {
    const road = this.roads.get(id); if (!road) throw new Error(`Unknown visual road ${id}`);
    const metrics={phases:{} as Record<string,number>,temporaryBytes:0,outputBytes:0,geometryTypes:{} as Record<string,number>,geometryObjects:{} as Record<string,number>},trace={phase:'pavement'},task=this.builder.buildSteps(road,this.diagnostics?trace:undefined);
    let group:ReturnType<RoadBuilder['build']>;
    for(;;){const phase=trace.phase,before=this.diagnostics?performance.now():0,step=task.next();if(this.diagnostics)metrics.phases[phase]=(metrics.phases[phase]??0)+performance.now()-before;if(step.done){group=step.value;break;}yield;}
    group.updateMatrixWorld(true);
    interface Chunk {position:Float32Array;normal:Float32Array;uv:Float32Array;at:number}
    interface Batch {key:string;material:string;chunks:Chunk[];vertices:number;barrierTriangles:number;castShadow:boolean;receiveShadow:boolean}
    interface Partition {batch:Batch;count:number;id:number;chunk?:Chunk}
    const surfaces = new Map<string,Batch>();
    const instances = new Map<string, CompiledRoadVisual['instances'][number] & { values: number[] }>();
    const newInstanceIds = new Set<string>();
    const matrix = new Matrix4(), position = new Vector3();
    const key = (x: number, z: number) => `${Math.floor(x / this.map.sectorSize)},${Math.floor(z / this.map.sectorSize)}`;
    const meshes:Mesh[]=[];group.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
    for(const o of meshes) {
      yield;
      const material = this.names.get(o.material as Material);
      if (!material) throw new Error(`Unregistered road visual material on ${id}`);
      const geometryKind=(o.userData.roadStructureKind as string|undefined)??(o.userData.markingOwner?'marking':o.name||'surface'),multiplicity=o instanceof InstancedMesh?o.count:1;metrics.geometryTypes[geometryKind]=(metrics.geometryTypes[geometryKind]??0)+(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3*multiplicity;metrics.geometryObjects[geometryKind]=(metrics.geometryObjects[geometryKind]??0)+multiplicity;
      if (o instanceof InstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, matrix); matrix.premultiply(o.matrixWorld); position.setFromMatrixPosition(matrix);
          const sector = key(position.x, position.z), batchKey = sector + '|' + o.geometry.uuid+'|'+material+'|'+Number(o.castShadow)+Number(o.receiveShadow);
          let batch = instances.get(batchKey);
          if (!batch) {
            const geometryId = o.geometry.uuid;
            batch = { key: sector, material, geometryId, matrices: new Float32Array(), values: [], lamp: o.userData.environmentLamp === true,castShadow:o.castShadow,receiveShadow:o.receiveShadow,kind:o.userData.roadStructureKind };
            if (!this.exportedInstances.has(geometryId) && !newInstanceIds.has(geometryId)) {
              batch.geometry = exportVisualGeometry(o.geometry);
              newInstanceIds.add(geometryId);
            }
            instances.set(batchKey, batch);
          }
          batch.values.push(...matrix.elements);
        }
        o.dispose(); continue;
      }
      // Owned non-instance source attributes can be transformed directly. Shared
      // templates use the branch above and immutable pavement caches own copies.
      const geometry = o.geometry; geometry.applyMatrix4(o.matrixWorld);
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      const index=geometry.index,count=index?.count??p.count,ids=new Uint32Array(count/3),local=new Map<string,Partition>(),partitions:Partition[]=[];
      metrics.temporaryBytes+=ids.byteLength;
      let started=performance.now();
      for (let i = 0; i < count; i += 3) {
        if(i%384===0){metrics.phases.partition=(metrics.phases.partition??0)+performance.now()-started;yield;started=performance.now();}
        const va=index?index.getX(i):i,vb=index?index.getX(i+1):i+1,vc=index?index.getX(i+2):i+2;
        const sector = key((p.getX(va) + p.getX(vb) + p.getX(vc)) / 3, (p.getZ(va) + p.getZ(vb) + p.getZ(vc)) / 3);
        const batchKey = sector + '|' + material+'|'+Number(o.castShadow)+Number(o.receiveShadow);
        let b = surfaces.get(batchKey);
        if (!b) { b = { key: sector, material, chunks:[],vertices:0, barrierTriangles: 0,castShadow:o.castShadow,receiveShadow:o.receiveShadow }; surfaces.set(batchKey, b); }
        let partition=local.get(batchKey);if(!partition){partition={batch:b,count:0,id:partitions.length};local.set(batchKey,partition);partitions.push(partition);}ids[i/3]=partition.id;partition.count+=3;b.vertices+=3;
        if (o.name === 'road barrier') b.barrierTriangles++;
      }
      metrics.phases.partition=(metrics.phases.partition??0)+performance.now()-started;
      for(const part of partitions){const c:Chunk={position:new Float32Array(part.count*3),normal:new Float32Array(part.count*3),uv:new Float32Array(part.count*2),at:0};part.chunk=c;part.batch.chunks.push(c);metrics.temporaryBytes+=c.position.byteLength+c.normal.byteLength+c.uv.byteLength;}
      started=performance.now();
      for(let i=0;i<count;i+=3){
        if(i%384===0){metrics.phases.copy=(metrics.phases.copy??0)+performance.now()-started;yield;started=performance.now();}const chunk=partitions[ids[i/3]!]!.chunk!;
        for (let j = i; j < i + 3; j++) {
          const v=index?index.getX(j):j,at=chunk.at;chunk.position[at*3]=p.getX(v);chunk.position[at*3+1]=p.getY(v);chunk.position[at*3+2]=p.getZ(v);chunk.normal[at*3]=n.getX(v);chunk.normal[at*3+1]=n.getY(v);chunk.normal[at*3+2]=n.getZ(v);chunk.uv[at*2]=uv?.getX(v)??0;chunk.uv[at*2+1]=uv?.getY(v)??0;chunk.at++;
        }
      }
      metrics.phases.copy=(metrics.phases.copy??0)+performance.now()-started;
      geometry.dispose();o.removeFromParent();
    }
    const result:CompiledRoadVisual['surfaces']=[];
    for(const b of surfaces.values()){
      yield;const started=performance.now(),positions=new Float32Array(b.vertices*3),normals=new Float32Array(positions.length),uvs=new Float32Array(b.vertices*2);let at=0;
      for(const c of b.chunks){positions.set(c.position,at*3);normals.set(c.normal,at*3);uvs.set(c.uv,at*2);at+=c.at;}
      const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(positions,3));g.setAttribute('normal',new BufferAttribute(normals,3));g.setAttribute('uv',new BufferAttribute(uvs,2));
      const indexed=yield* indexRoadGeometrySteps(g),geometry=exportVisualGeometry(indexed,false);indexed.dispose();result.push({key:b.key,material:b.material,geometry,barrierTriangles:b.barrierTriangles,castShadow:b.castShadow,receiveShadow:b.receiveShadow});b.chunks.length=0;
      metrics.outputBytes+=geometry.position.byteLength+geometry.normal.byteLength+(geometry.uv?.byteLength??0)+(geometry.index?.byteLength??0);metrics.phases.export=(metrics.phases.export??0)+performance.now()-started;
    }
    // An interrupted generator never promises templates the consumer did not receive.
    for (const id of newInstanceIds) this.exportedInstances.add(id);
    this.lastMetrics=metrics;
    return {id,geometrySystem:'continuous-v5',surfaces:result,instances:[...instances.values()].map(({values,...b})=>({...b,matrices:new Float32Array(values)}))};
  }
}
