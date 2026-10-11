import type {CityMapData,CityPoint,CityRoad,RoadEndpoint} from './CityMapData';
import {polylineLength,roadPoints} from './geometry';
import {sampleRibbonPolyline} from '../subject3/geometry';
import {BufferGeometry,Float32BufferAttribute} from 'three';
import {roadEdges} from './geometry';

export interface RoadEdgeCorridor {id:string;roadIds:string[];points:CityPoint[];length:number}
/** Load-time logical edge chains. Only explicitly linked, compatible continuations
 * join. Forks open by pavement exclusion rather than by arbitrary end trimming. */
export class RoadEdgeChains {
 readonly corridors:RoadEdgeCorridor[]=[];
 private readonly frames=new Map<string,{point:CityPoint;tangent:{x:number;z:number}}[]>();
 private readonly starts=new Map<string,{distance:number;reverse:boolean}>();
 private readonly neighbours=new Map<string,RoadEndpoint>();
 private readonly roads:Map<string,CityRoad>;
 private readonly continuationIds=new Map<string,ReadonlySet<string>>();
 constructor(map:CityMapData) {
  const roads=new Map(map.roads.map(r=>[r.id,r])),paths=new Map(map.roads.map(r=>[r.id,roadPoints(r)]));
  this.roads=roads;
  const key=(e:RoadEndpoint)=>e.roadId+':'+e.end;
  const groups:RoadEndpoint[][]=[];
  for(const link of map.roadLinks??[]) {
   const a=groups.find(g=>g.some(e=>key(e)===key(link.from))),b=groups.find(g=>g.some(e=>key(e)===key(link.to)));
   if(a&&b&&a!==b){a.push(...b);groups.splice(groups.indexOf(b),1);}else if(a&&!b)a.push(link.to);else if(b&&!a)b.push(link.from);else if(!a&&!b)groups.push([link.from,link.to]);
  }
  const neighbour=new Map<string,RoadEndpoint>();
  const out=(e:RoadEndpoint)=>{const p=paths.get(e.roadId)!,a=e.end==='start'?p[0]!:p.at(-1)!,b=e.end==='start'?p[1]!:p.at(-2)!,l=Math.hypot(b.x-a.x,b.z-a.z);return{x:(b.x-a.x)/l,z:(b.z-a.z)/l};};
  for(const g of groups)for(const a of g) {
   const r=roads.get(a.roadId)!,p=paths.get(r.id)![a.end==='start'?0:paths.get(r.id)!.length-1]!,u=out(a);
   const matches=g.filter(b=>b.roadId!==r.id).filter(b=>{const s=roads.get(b.roadId)!,v=out(b),q=paths.get(s.id)![b.end==='start'?0:paths.get(s.id)!.length-1]!;
    return r.laneCount===s.laneCount&&r.laneWidth===s.laneWidth&&JSON.stringify(r.shoulders)===JSON.stringify(s.shoulders)&&r.structure?.barrierEnabled===s.structure?.barrierEnabled&&Math.hypot(p.x-q.x,p.z-q.z)<.06&&Math.abs((p.y??0)-(q.y??0))<.02&&u.x*v.x+u.z*v.z<-.95;});
   if(matches.length===1)neighbour.set(key(a),matches[0]!);
  }
  for(const [id,end] of neighbour)this.neighbours.set(id,end);
  const seen=new Set<string>();
  for(const seed of map.roads) {
   if(seen.has(seed.id))continue;
   let begin:RoadEndpoint={roadId:seed.id,end:'start'};const searched=new Set<string>();
   // Find the outer end before walking the whole corridor; closed rings start at
   // a stable road ID and retain their closing tangent below.
   while(neighbour.has(key(begin))&&!searched.has(begin.roadId)){searched.add(begin.roadId);const a=neighbour.get(key(begin))!;begin={roadId:a.roadId,end:a.end==='start'?'end':'start'};}
   const parts:{r:CityRoad;reverse:boolean;start:number;end:number}[]=[],points:CityPoint[]=[];
   let current=begin,distance=0;
   while(!seen.has(current.roadId)) {
    const r=roads.get(current.roadId)!,reverse=current.end==='end',p=reverse?[...paths.get(r.id)!].reverse():paths.get(r.id)!;
    const start=points.length?points.length-1:0;points.push(...(points.length?p.slice(1):p));
    parts.push({r,reverse,start,end:points.length-1});this.starts.set(r.id,{distance,reverse});distance+=polylineLength(p);seen.add(r.id);
    const next=neighbour.get(key({roadId:r.id,end:reverse?'start':'end'}));if(!next)break;current=next;
   }
   const frames=sampleRibbonPolyline(points,Infinity);
   if(points.length>3&&Math.hypot(points[0]!.x-points.at(-1)!.x,points[0]!.z-points.at(-1)!.z)<.06){const p=points[0]!,a=points.at(-2)!,b=points[1]!,al=Math.hypot(p.x-a.x,p.z-a.z),bl=Math.hypot(b.x-p.x,b.z-p.z),u={x:(p.x-a.x)/al,z:(p.z-a.z)/al},v={x:(b.x-p.x)/bl,z:(b.z-p.z)/bl},divisor=Math.max(.25,1+u.x*v.x+u.z*v.z),t={x:(u.x+v.x)/divisor,z:(u.z+v.z)/divisor};frames[0]!.tangent=t;frames.at(-1)!.tangent=t;}
   for(const part of parts) {
    const f=frames.slice(part.start,part.end+1);
    this.frames.set(part.r.id,part.reverse?f.reverse().map(a=>({point:a.point,tangent:{x:-a.tangent.x,z:-a.tangent.z}})):f);
   }
   this.corridors.push({id:'edge:'+parts[0]!.r.id,roadIds:parts.map(p=>p.r.id),points,length:distance});
   const ids=new Set(parts.map(p=>p.r.id));for(const id of ids)this.continuationIds.set(id,ids);
  }
 }
 continuations(roadId:string):ReadonlySet<string>{return this.continuationIds.get(roadId)??new Set([roadId]);}
 edge(road:CityRoad,offset:number,yOffset=0):CityPoint[] {
  return (this.frames.get(road.id)??sampleRibbonPolyline(roadPoints(road),Infinity)).map(f=>({x:f.point.x-f.tangent.z*offset,y:(f.point.y??0)+yOffset,z:f.point.z+f.tangent.x*offset}));
 }
 /** Structure offsets may differ at a tunnel portal. Blend both sections to a
  * common wall/rail endpoint while keeping the drivable pavement edge fixed. */
 barrierEdge(road:CityRoad,side:number):CityPoint[] {
  const frames=this.frames.get(road.id)!,own=road.structure?.barrierOffset??0,edges=roadEdges(road),length=polylineLength(frames.map(f=>f.point));
  const joined=(end:'start'|'end')=>{const e=this.neighbours.get(road.id+':'+end);return e?(own+(this.roads.get(e.roadId)!.structure?.barrierOffset??0))/2:own;};
  const start=joined('start'),end=joined('end');let d=0;
  return frames.map((f,i)=>{if(i)d+=Math.hypot(f.point.x-frames[i-1]!.point.x,f.point.z-frames[i-1]!.point.z);const span=Math.min(30,length/2),extra=own+(start-own)*Math.max(0,1-d/span)+(end-own)*Math.max(0,1-(length-d)/span),offset=(side<0?edges.left:edges.right)+side*extra;return{x:f.point.x-f.tangent.z*offset,y:f.point.y??0,z:f.point.z+f.tangent.x*offset};});
 }
 /** Sampling phase shared across continued road IDs, avoiding paired lamps at seams. */
 firstStation(road:CityRoad,spacing:number,phase=spacing/2):number {
  const start=this.starts.get(road.id);if(!start)return phase;
  const d=((phase-start.distance)%spacing+spacing)%spacing;
  return start.reverse?((start.distance+polylineLength(roadPoints(road))-phase)%spacing+spacing)%spacing:d;
 }
}
const cache=new WeakMap<CityMapData,RoadEdgeChains>();
export function roadEdgeChains(map:CityMapData):RoadEdgeChains {let c=cache.get(map);if(!c){c=new RoadEdgeChains(map);cache.set(map,c);}return c;}
/** Two edges share the corridor's frame, including at road-ID seams. */
export function roadEdgeStrip(road:CityRoad,map:CityMapData,left:number,right:number,yOffset:number):BufferGeometry {
 const chain=roadEdgeChains(map),a=chain.edge(road,left,yOffset),b=chain.edge(road,right,yOffset),positions:number[]=[],uv:number[]=[],indices:number[]=[];let d=0;
 for(let i=0;i<a.length;i++){if(i)d+=Math.hypot(a[i]!.x-a[i-1]!.x,a[i]!.z-a[i-1]!.z);positions.push(a[i]!.x,a[i]!.y??0,a[i]!.z,b[i]!.x,b[i]!.y??0,b[i]!.z);uv.push(0,d,1,d);if(i<a.length-1){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
