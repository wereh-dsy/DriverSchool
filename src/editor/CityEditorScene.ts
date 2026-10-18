import * as THREE from 'three';
import type { CityMapData, CityRoad, CityIntersection, CityObject, CityPoint } from '../world/city/CityMapData';
import { createSubject3Materials } from '../world/subject3/materials';
import { RoadBuilder } from '../world/city/RoadBuilder';
import { IntersectionBuilder } from '../world/city/IntersectionBuilder';
import { PrefabRegistry } from '../world/city/PrefabRegistry';
import { CityTrafficSignals } from '../world/city/CityTrafficSignals';
import { RoadSignRenderer } from '../world/city/RoadSignRenderer';
import type { RoadSignDefinition } from '../world/city/RoadSignData';
import { bounds, overlaps, roadPoints, parallelPath } from './EditorGeometry';
import type { CityEditingKernel } from './CityEditingKernel';
import type { EditSummary } from './EditorCommands';

/** Editor-only scene cache. No CityGround, physics graph or navigation rebuild during editing. */
export class CityEditorScene {
  readonly root = new THREE.Group();
  readonly ghost = new THREE.Group();
  readonly overlay = new THREE.Group();
  private readonly materials = createSubject3Materials();
  private readonly prefabs = new PrefabRegistry(this.materials);
  private readonly entries = new Map<string,{root:THREE.Group;signals?:CityTrafficSignals;object:boolean}>();
  private readonly versions=new Map<string,object>();
  private readonly geometryRefs=new Map<THREE.BufferGeometry,number>();
  private readonly batches=new Map<string,readonly (CityObject|RoadSignDefinition)[]>();
  private readonly overview = new THREE.Group();
  private overviewEntries = new Map<string,THREE.Line>();
  private overviewVersions=new Map<string,CityRoad>();
  private signs:RoadSignRenderer;
  get pickTargets():THREE.Object3D[]{return[...this.entries.values()].map(e=>e.root);}
  constructor(private readonly kernel:CityEditingKernel) {this.signs=new RoadSignRenderer(kernel.data.roadNames??{}); this.root.add(this.overview,this.ghost,this.overlay); this.reset(); }
  private disposeEntry(id:string):void {
    const entry=this.entries.get(id);if(!entry)return;
    entry.signals?.dispose(); const geometries=new Set<THREE.BufferGeometry>();
    entry.root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(!entry.object&&o instanceof THREE.Mesh)geometries.add(o.geometry);});
    for(const geometry of geometries){const count=(this.geometryRefs.get(geometry)??1)-1;if(count<=0){geometry.dispose();this.geometryRefs.delete(geometry);}else this.geometryRefs.set(geometry,count);}entry.root.removeFromParent();this.entries.delete(id);this.batches.delete(id);
    this.versions.delete(id);
  }
  static clear(group:THREE.Group):void {group.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});group.clear();}
  private retainGeometry(root:THREE.Group):void {const geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});for(const geometry of geometries)this.geometryRefs.set(geometry,(this.geometryRefs.get(geometry)??0)+1);}
  private updateOverview(id:string):void {
    const old=this.overviewEntries.get(id);if(old){old.geometry.dispose();(old.material as THREE.Material).dispose();old.removeFromParent();this.overviewEntries.delete(id);}
    const road=this.kernel.data.roads.find(r=>r.id===id);this.overviewVersions.delete(id);if(road){const line=this.line(roadPoints(road),0x5a7682,0.07);this.overview.add(line);this.overviewEntries.set(id,line);this.overviewVersions.set(id,road);}
  }
  reset():void {for(const id of [...this.entries.keys()])this.disposeEntry(id);CityEditorScene.clear(this.overview);this.overviewEntries.clear();for(const r of this.kernel.data.roads)this.updateOverview(r.id);}
  reconcile():void {
    const map=this.kernel.data,next=new Map([...map.roads,...map.intersections,...map.objects,...map.signs??[]].map(e=>[e.id,e]));
    const changed=new Set([...this.versions].filter(([id,e])=>next.get(id)!==e).map(([id])=>id));
    for(const[id,r]of this.overviewVersions)if(next.get(id)!==r)changed.add(id);
    for(const[id,items]of this.batches)if(items.some(e=>next.get(e.id)!==e))changed.add(id);
    for(const id of this.overviewEntries.keys())if(!next.has(id))changed.add(id);
    for(const id of changed){this.disposeEntry(id);this.updateOverview(id);}
    for(const r of map.roads)if(!this.overviewEntries.has(r.id))this.updateOverview(r.id);
    if(this.signs.names!==map.roadNames){for(const id of [...this.batches.keys()])if(id.startsWith('signs:'))this.disposeEntry(id);this.signs.dispose();this.signs=new RoadSignRenderer(map.roadNames??{});}
  }
  update(summary:EditSummary):void {
    if(this.signs.names!==this.kernel.data.roadNames){for(const id of [...this.batches.keys()])if(id.startsWith('signs:'))this.disposeEntry(id);this.signs.dispose();this.signs=new RoadSignRenderer(this.kernel.data.roadNames??{});}
    const ids=new Set([...summary.created,...summary.modified,...summary.deleted]);
    if(summary.area)for(const r of this.kernel.findRoads({bbox:summary.area,limit:10000}))ids.add(r.id);
    for(const id of ids){this.disposeEntry(id);this.updateOverview(id);}
    for(const[id,items]of [...this.batches])if(items.some(e=>ids.has(e.id)))this.disposeEntry(id);
    CityEditorScene.clear(this.ghost);
  }
  populate(center:THREE.Vector3,radius:number):void {
    const area=bounds([{x:center.x,z:center.z}],radius),map=this.kernel.data;
    const roads=this.kernel.findRoads({bbox:area,limit:2000});const ids=new Set(roads.map(r=>r.id));
    const junctions=map.intersections.filter(j=>overlaps(bounds([j.position],80),area));
    const objects=map.objects.filter(o=>overlaps(bounds([o.position],40),area));
    const signs=(map.signs??[]).filter(s=>overlaps(bounds([s.position],30),area));
    const batches=new Map<string,(CityObject|RoadSignDefinition)[]>();
    for(const e of [...objects,...signs]){const key=`${'prefabId'in e?'objects':'signs'}:${Math.floor(e.position.x/250)},${Math.floor(e.position.z/250)}`;let items=batches.get(key);if(!items)batches.set(key,items=[]);items.push(e);}
    for(const j of junctions)ids.add(j.id);for(const id of batches.keys())ids.add(id);
    for(const id of [...this.entries.keys()])if(!ids.has(id))this.disposeEntry(id);
    const missing=roads.filter(r=>!this.entries.has(r.id));
    let builder:RoadBuilder|undefined;
    if(missing.length){
      const localIds=new Set(roads.map(r=>r.id));
      const seeds=new Set(localIds);
      for(const link of map.roadLinks??[])if(seeds.has(link.from.roadId)||seeds.has(link.to.roadId)){localIds.add(link.from.roadId);localIds.add(link.to.roadId);}
      const js=map.intersections.filter(j=>j.connections.some(c=>localIds.has(c.roadId)));for(const j of js)for(const c of j.connections)localIds.add(c.roadId);
      const local={...map,roads:map.roads.filter(r=>localIds.has(r.id)),intersections:js,objects:[],roadLinks:(map.roadLinks??[]).filter(l=>localIds.has(l.from.roadId)&&localIds.has(l.to.roadId)),connectionPorts:[]} as CityMapData;
      builder=new RoadBuilder(this.materials,local);
    }
    for(const brief of roads)if(!this.entries.has(brief.id)){
      const r=map.roads.find(r=>r.id===brief.id)!,root=builder!.build(r);this.retainGeometry(root);root.userData.editorId=r.id;this.root.add(root);this.entries.set(r.id,{root,object:false});
    }
    for(const j of junctions)if(!this.entries.has(j.id)){
      const local={...map,roads:map.roads.filter(r=>j.connections.some(c=>c.roadId===r.id)),intersections:[j]};
      const signals=new CityTrafficSignals(local),root=new IntersectionBuilder(local,this.materials).build(j,signals,0);root.add(signals.root);this.retainGeometry(root);root.userData.editorId=j.id;this.root.add(root);this.entries.set(j.id,{root,signals,object:false});
    }
    for(const[id,items]of batches){const old=this.batches.get(id);if(old&&old.length===items.length&&old.every((e,i)=>e===items[i]))continue;this.disposeEntry(id);const root=id.startsWith('objects:')?this.prefabs.buildInstances(items as CityObject[]):this.signs.buildInstances(items as RoadSignDefinition[]);this.root.add(root);this.entries.set(id,{root,object:true});this.batches.set(id,items);}
    this.signs.retainContents(signs);
    for(const e of [...map.roads,...junctions,...objects,...signs])if(this.entries.has(e.id))this.versions.set(e.id,e);
  }
  line(points:readonly CityPoint[],color:number,lift=0.4,opacity=1):THREE.Line {
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x,(p.y??0)+lift,p.z))),new THREE.LineBasicMaterial({color,depthTest:false,transparent:opacity<1,opacity}));
  }
  marker(p:CityPoint,color:number,radius=1.8):THREE.Mesh {
    const dot=new THREE.Mesh(new THREE.SphereGeometry(radius,10,6),new THREE.MeshBasicMaterial({color,depthTest:false}));dot.position.set(p.x,(p.y??0)+1,p.z);dot.renderOrder=30;return dot;
  }
  showGhost(data:{roads:CityRoad[];intersections:CityIntersection[];objects:CityObject[];signs?:RoadSignDefinition[]},valid=true):void {
    CityEditorScene.clear(this.ghost);const color=valid?0x63edb5:0xff765e;
    for(const r of data.roads){
      const left=parallelPath(r,-r.laneCount*r.laneWidth/2),right=parallelPath(r,r.laneCount*r.laneWidth/2),vertices:number[]=[];
      for(let i=1;i<left.length;i++)for(const p of [left[i-1]!,right[i-1]!,left[i]!,right[i-1]!,right[i]!,left[i]!])vertices.push(p.x,(p.y??0)+0.2,p.z);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
      this.ghost.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.45,side:THREE.DoubleSide,depthWrite:false})),this.line(left,color),this.line(right,color));
      for(const p of [r.centerline[0]!,r.centerline.at(-1)!]){this.ghost.add(this.line([{...p,y:0},p],color));}
    }
    for(const j of data.intersections){const outline=j.pavementFootprint?.map(p=>({x:p.x+j.position.x,y:(p.y??0)+(j.position.y??0),z:p.z+j.position.z}));if(outline)this.ghost.add(this.line([...outline,outline[0]!],color));else this.ghost.add(this.marker(j.position,color,5));}
    for(const o of data.objects)this.ghost.add(this.marker(o.position,color,5));
    for(const s of data.signs??[]){this.ghost.add(this.marker(s.position,color,3));const h={x:s.position.x-Math.sin(s.heading)*12,y:s.position.y,z:s.position.z-Math.cos(s.heading)*12};this.ghost.add(this.line([s.position,h],color));}
  }
  updateSignals(dt:number):void {for(const e of this.entries.values())e.signals?.update(dt);}
  dispose():void {for(const id of [...this.entries.keys()])this.disposeEntry(id);CityEditorScene.clear(this.overview);CityEditorScene.clear(this.overlay);CityEditorScene.clear(this.ghost);this.signs.dispose();this.prefabs.dispose();for(const m of Object.values(this.materials))m.dispose();this.root.clear();}
}
