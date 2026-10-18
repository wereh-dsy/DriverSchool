import type {CityMapData,CityPoint,CityRoad,RoadEndpoint} from '../CityMapData';
import {connectRoads,deleteObject} from '../MapAPI';
import {roadPoints,polylineLength,sampleAt,syncConnections,refreshPortPoses} from '../geometry';
import {addV61Street,cityV61Snap} from './CityMainV61Corridors';
import {trimCityJunctionApproaches,connectUrbanSkeleton} from './CityMainUrbanConnections';
import {setJunctionPavementFootprint} from '../JunctionSurface';
import {attachV62Endpoint} from './CityMainV62Access';
export const groundV8=(x:number,z:number,y=-.024):CityPoint=>({x,y,z});
export const ordinaryV8=(r:CityRoad)=>!r.id.startsWith('regional:')&&r.travelDirection==='two-way'&&r.type!=='highway'&&!r.structure?.enclosure;
let urbanLinkV8=0;
export function streetV8(map:CityMapData,id:string,name:string,points:CityPoint[],lanes=4,district='qinghe'):CityRoad {
 const r=addV61Street(map,id,name,points,lanes);r.district=district;r.groupId='v8-streets';return r;
}
export function snapV8(map:CityMapData,p:CityPoint,name:string,junctionSpacing=45):CityPoint{return cityV61Snap(map,p,r=>r.roadNameId===name&&ordinaryV8(r),junctionSpacing);}
export function connectStreetV8(map:CityMapData,r:CityRoad):void{
 const inView=(q:CityRoad)=>!q.id.startsWith('regional:')||q.id.startsWith('regional:v8:'),roads=map.roads.filter(inView),ids=new Set(roads.map(q=>q.id));
 const view:CityMapData={...map,regional:undefined,environment:{...map.environment,landmarks:map.environment.landmarks?.filter(l=>l.roadIds.length>0&&l.roadIds.every(id=>ids.has(id)))},roads,intersections:map.intersections.filter(j=>!j.id.startsWith('regional:')),objects:[],roadLinks:map.roadLinks!.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),connectionPorts:map.connectionPorts!.filter(p=>ids.has(p.endpoint.roadId))},oldLinks=new Set(view.roadLinks!.map(l=>l.id));
 const path=roadPoints(r),box={minX:Math.min(...path.map(p=>p.x))-1,maxX:Math.max(...path.map(p=>p.x))+1,minZ:Math.min(...path.map(p=>p.z))-1,maxZ:Math.max(...path.map(p=>p.z))+1};
 const neighbours=roads.filter(q=>q!==r&&ordinaryV8(q)&&q.centerline.some((p,i,a)=>i>0&&Math.max(p.x,a[i-1]!.x)>=box.minX&&Math.min(p.x,a[i-1]!.x)<=box.maxX&&Math.max(p.z,a[i-1]!.z)>=box.minZ&&Math.min(p.z,a[i-1]!.z)<=box.maxZ));
 for(const neighbour of neighbours){const family=view.roads.filter(q=>q.id===r.id||q.id.startsWith(r.id+'-split')),junctions=new Set(view.intersections.map(j=>j.id));
  const tolerance=r.roadNameId==='v8-shanghai-road'&&neighbour.id.startsWith('v4-west-offset')?6:neighbour.groupId==='diamond-east'?2:.2;
  connectUrbanSkeleton(view,[...family,view.roads.find(q=>q.id===neighbour.id)!],tolerance);finishJunctionsV8({...view,intersections:view.intersections.filter(j=>!junctions.has(j.id))},true);}
 map.roads=[...map.roads.filter(q=>!inView(q)),...view.roads];map.intersections=[...map.intersections.filter(j=>j.id.startsWith('regional:')),...view.intersections];
 const usedLinks=new Set(map.roadLinks!.map(l=>l.id));for(const l of view.roadLinks!)if(!oldLinks.has(l.id)){do{l.id='v8-urban-link-'+urbanLinkV8++;}while(usedLinks.has(l.id));usedLinks.add(l.id);}
 map.roadLinks=[...map.roadLinks!.filter(l=>!ids.has(l.from.roadId)||!ids.has(l.to.roadId)),...view.roadLinks!];map.connectionPorts=[...map.connectionPorts!.filter(p=>!ids.has(p.endpoint.roadId)),...view.connectionPorts!];syncConnections(map);
 for(const l of view.environment.landmarks??[]){const original=map.environment.landmarks!.find(q=>q.id===l.id)!;original.roadIds=l.roadIds;}
}
export function finishJunctionsV8(map:CityMapData,smoothMovedApproaches=false):void{
 syncConnections(map);trimCityJunctionApproaches(map,false);refreshPortPoses(map);
 if(smoothMovedApproaches)for(const j of map.intersections.filter(j=>!j.id.startsWith('regional:')))for(const c of j.connections){
  const r=map.roads.find(r=>r.id===c.roadId)!,path=r.centerline,ordered=c.end==='start'?path:[...path].reverse();
  while(ordered.length>2&&Math.hypot(ordered[1]!.x-ordered[0]!.x,ordered[1]!.z-ordered[0]!.z)<12)ordered.splice(1,1);
  const original=ordered.map(p=>({...p}));let d=0;
  for(let i=1;i<ordered.length-1;i++){d+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);if(d>=60)break;const t=d/60,w=t*t*(3-2*t);ordered[i]!.y=(ordered[0]!.y??0)+((original[i]!.y??0)-(ordered[0]!.y??0))*w;}
  // A short approach can have a second, unchanged landing inside that 60m
  // window. Bound this local blend from both ends, rather than leaving a step.
  const L=polylineLength(ordered),a=ordered[0]!.y??0,b=ordered.at(-1)!.y??0;let station=0;
  for(let i=1;i<ordered.length-1;i++){station+=Math.hypot(ordered[i]!.x-ordered[i-1]!.x,ordered[i]!.z-ordered[i-1]!.z);ordered[i]!.y=Math.max(a-.1*station,b-.1*(L-station),Math.min(ordered[i]!.y??0,a+.1*station,b+.1*(L-station)));}
  r.centerline=c.end==='start'?ordered:ordered.reverse();
 }
 for(const j of map.intersections)setJunctionPavementFootprint(j,map);
}
/** Remove a complete superseded access family, including its obsolete terminals. */
export function retireV8(map:CityMapData,match:(r:CityRoad)=>boolean):void{
 const ids=new Set(map.roads.filter(match).map(r=>r.id));
 for(const id of ids)deleteObject(map,id);
 for(const j of [...map.intersections])if(j.connections.length<3){
  const arms=j.connections.map(c=>({roadId:c.roadId,end:c.end}));deleteObject(map,j.id);
  if(arms.length===2){const p={...j.position};for(const e of arms){const r=map.roads.find(r=>r.id===e.roadId)!;const path=roadPoints(r);if(e.end==='start')path.unshift({...p});else path.push({...p});r.centerline=path;}connectRoads(map,arms[0]!,arms[1]!);}
  if(arms.length===1)extendEndpointV8(map,arms[0]!,{...j.position});
 }
 for(const l of map.environment.landmarks??[])l.roadIds=l.roadIds.filter(id=>!ids.has(id));
}
/** Project only onto a selected carriageway, then explicitly split/link that lane. */
export function laneLandingV8(map:CityMapData,p:CityPoint,match:(r:CityRoad)=>boolean):CityPoint {
 let distance=Infinity,result:CityPoint|undefined;
 for(const r of map.roads.filter(match))for(let i=1;i<r.centerline.length;i++){
  const a=r.centerline[i-1]!,b=r.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz))),q={x:a.x+dx*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+dz*t},d=Math.hypot(p.x-q.x,p.z-q.z);
  if(d<distance){distance=d;result=q;}
 }return result!;
}
export function attachLaneV8(map:CityMapData,r:CityRoad,end:'start'|'end',match:(r:CityRoad)=>boolean):void {
 const path=r.centerline,p=path[end==='start'?0:path.length-1]!,target=laneLandingV8(map,p,match),delta={x:target.x-p.x,y:(target.y??0)-(p.y??0),z:target.z-p.z},original=path.map(q=>({...q})),length=polylineLength(path);let station=0;
 for(let i=0;i<path.length;i++){
  if(i)station+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);
  const d=end==='start'?station:length-station,t=Math.max(0,1-d/120),w=t*t*(3-2*t);path[i]!.x+=delta.x*w;path[i]!.z+=delta.z*w;path[i]!.y=(original[i]!.y??0)+delta.y*w;
 }
 Object.assign(path[end==='start'?0:path.length-1]!,target);
 for(const e of attachV62Endpoint(map,target,match).filter(e=>e.end===(end==='start'?'end':'start')))connectRoads(map,end==='start'?e:{roadId:r.id,end},end==='start'?{roadId:r.id,end}:e);
}
export function connectEndsV8(map:CityMapData,a:RoadEndpoint,b:RoadEndpoint):void{connectRoads(map,a,b);}
export function simplifyV8(map:CityMapData):void {
 for(const r of map.roads.filter(r=>!r.id.startsWith('regional:')||r.id.startsWith('regional:v8:'))){
  const result:CityPoint[]=[];
  for(const p of roadPoints(r)){
   if(result.length>=2){const a=result.at(-2)!,b=result.at(-1)!,dx=p.x-a.x,dz=p.z-a.z,d=Math.hypot(dx,dz),t=((b.x-a.x)*dx+(b.z-a.z)*dz)/(d*d);if(d<=12&&t>0&&t<1&&Math.abs((b.x-a.x)*dz-(b.z-a.z)*dx)/d<.01&&Math.abs((b.y??0)-(a.y??0)-t*((p.y??0)-(a.y??0)))<.002)result.pop();}
   result.push(p);
  }r.centerline=result;
 }
}
export function extendEndpointV8(map:CityMapData,e:RoadEndpoint,p:CityPoint):void{
 const r=map.roads.find(r=>r.id===e.roadId)!,path=roadPoints(r);if(e.end==='start')path.unshift(p);else path.push(p);r.centerline=path;
}
export {polylineLength,roadPoints,sampleAt};
