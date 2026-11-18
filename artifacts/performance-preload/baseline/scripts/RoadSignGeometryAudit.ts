import {InstancedMesh,Matrix4,Vector3} from 'three';
import type {CityMapData} from '../src/world/city/CityMapData';
import type {RoadSignDefinition} from '../src/world/city/RoadSignData';
import {RoadSignRenderer} from '../src/world/city/RoadSignRenderer';
import {makePavementSegments} from '../src/editor/ElevationSeams';
import {bounds,EditorSpatialIndex} from '../src/editor/EditorGeometry';
import {RoadClearance} from '../src/world/city/RoadClearance';
type V={x:number;y:number;z:number};
type Solid={vertices:V[];normals:V[];edges:V[];roadId?:string;kind?:string;floorAt?:(x:number,z:number)=>number};
const sub=(a:V,b:V):V=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),cross=(a:V,b:V):V=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}),dot=(a:V,b:V)=>a.x*b.x+a.y*b.y+a.z*b.z;
function intersects(a:Solid,b:Solid){
 const axes=[...a.normals,...b.normals,...a.edges.flatMap(u=>b.edges.map(v=>cross(u,v)))];
 for(const axis of axes){const length=Math.hypot(axis.x,axis.y,axis.z);if(length<1e-8)continue;let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;for(const v of a.vertices){const p=dot(v,axis);amin=Math.min(amin,p);amax=Math.max(amax,p);}for(const v of b.vertices){const p=dot(v,axis);bmin=Math.min(bmin,p);bmax=Math.max(bmax,p);}if(amax<=bmin+.025*length||bmax<=amin+.025*length)return false;
 }return true;
}
/** Authoring-only SAT against actual rendered posts, trusses, feet and hangers.
 * No sign geometry is reimplemented here: instance matrices come from renderer. */
export class RoadSignGeometryAudit {
 private readonly renderer:RoadSignRenderer;
 private readonly slabs:Solid[]=[];
 private readonly index=new EditorSpatialIndex(64);
 private readonly clearance:RoadClearance;
 private readonly adjacent=new Map<string,Set<string>>();
 constructor(map:CityMapData){
  this.clearance=new RoadClearance(map);
  const link=(a:string,b:string)=>{const list=this.adjacent.get(a)??new Set<string>();list.add(b);this.adjacent.set(a,list);};
  for(const l of map.roadLinks??[]){link(l.from.roadId,l.to.roadId);link(l.to.roadId,l.from.roadId);}
  for(const r of map.roads)if(r.highwayTransition)for(const id of [r.highwayTransition.mainRoadId,r.highwayTransition.decisionId]){link(r.id,id);link(id,r.id);}
  this.renderer=new RoadSignRenderer(map.roadNames??{},()=>null);
  const rendered={...map,roads:map.roads.map(r=>({...r,pavementSurface:'ribbon' as const}))};
  for(const s of makePavementSegments(rendered)){
   const outline=s.polygon;if(outline.length!==3)continue;
   for(const roof of [false,...(s.road.structure?.enclosure&&s.road.structure.enclosure.kind!=='cutting'?[true]:[])]){
    const y=roof?s.road.structure!.enclosure!.clearance:0,low=roof?y:-.65,high=roof?y+.65:.024,base=outline.map(p=>({...p,y:s.surface.heightAt(p.x,p.z)})),vertices=[...base.map(p=>({...p,y:p.y+low})),...base.map(p=>({...p,y:p.y+high}))],up={x:0,y:1,z:0},edges=[sub(base[1]!,base[0]!),sub(base[2]!,base[1]!),sub(base[0]!,base[2]!),up],normal={x:-s.surface.gx,y:1,z:-s.surface.gz},solid={vertices,edges,normals:[normal,...edges.slice(0,3).map(v=>cross(v,up))],roadId:s.road.id,kind:roof?'ENCLOSURE_ROOF':'ROAD_SLAB'};
    this.index.set(String(this.slabs.length),s.box);this.slabs.push({...solid,floorAt:s.surface.heightAt});
   }
  }
 }
 check(sign:RoadSignDefinition){
  const root=this.renderer.buildInstances([sign]),matrix=new Matrix4(),hits:any[]=[],attachments:any[]=[];let parts=0;
  const nearby=new Set([sign.roadId]);for(let n=0;n<4;n++)for(const id of [...nearby])for(const next of this.adjacent.get(id)??[])nearby.add(next);
  root.traverse(object=>{if(!(object instanceof InstancedMesh)||object.geometry.type==='PlaneGeometry')return;object.geometry.computeBoundingBox();const box=object.geometry.boundingBox!;
   for(let i=0;i<object.count;i++){object.getMatrixAt(i,matrix);parts++;const vertices:V[]=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new Vector3(x,y,z).applyMatrix4(matrix);vertices.push({x:p.x,y:p.y,z:p.z});}const e=matrix.elements,edges=[{x:e[0]!,y:e[1]!,z:e[2]!},{x:e[4]!,y:e[5]!,z:e[6]!},{x:e[8]!,y:e[9]!,z:e[10]!}],solid={vertices,edges,normals:[cross(edges[1]!,edges[2]!),cross(edges[2]!,edges[0]!),cross(edges[0]!,edges[1]!)]};
    for(const id of this.index.query(bounds(vertices))){const slab=this.slabs[+id]!;if(intersects(solid,slab)&&!hits.some(h=>h.roadId===slab.roadId&&h.kind===slab.kind)){
      const minDepth=Math.min(...vertices.map(v=>v.y-slab.floorAt!(v.x,v.z))),centre={x:(Math.min(...vertices.map(v=>v.x))+Math.max(...vertices.map(v=>v.x)))/2,z:(Math.min(...vertices.map(v=>v.z))+Math.max(...vertices.map(v=>v.z)))/2},y=slab.floorAt!(centre.x,centre.z),radius=Math.max(...vertices.map(v=>Math.hypot(v.x-centre.x,v.z-centre.z))),onShoulder=!this.clearance.roadAt(centre,radius,y-.3,y+.3,undefined,undefined,true),foundation=slab.kind==='ROAD_SLAB'&&minDepth>=-.60&&nearby.has(slab.roadId!)&&onShoulder;
      const witness={roadId:slab.roadId,kind:slab.kind,part:parts,partBounds:{...bounds(vertices),minY:Math.min(...vertices.map(v=>v.y)),maxY:Math.max(...vertices.map(v=>v.y))}};
      if(foundation)attachments.push({...witness,classification:'INTENTIONAL_SHOULDER_FOUNDATION',minimumDepth:minDepth,explicitTopologyRelated:true,liveCarriagewaysClear:true});else hits.push(witness);
    }}
   }object.dispose();
  });return {id:sign.id,roadId:sign.roadId,parts,valid:!hits.length,hits,attachments};
 }
 dispose(){this.renderer.dispose();}
}
