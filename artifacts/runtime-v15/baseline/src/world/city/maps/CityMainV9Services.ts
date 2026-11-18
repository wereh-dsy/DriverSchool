import type {CityMapData,CityPoint} from '../CityMapData';
import {sampleAt,polylineLength} from '../geometry';
import {deleteObject,connectRoads} from '../MapAPI';
import {attachLaneV8} from './CityMainV8Roads';
import {regionalMetadataV8} from './CityMainV8Regional';
import {ease} from '../presets/BackbonePresets';

/** Move the existing paired service facilities to the open outer trunk sections. */
export function servicesV9(map:CityMapData):void{
 const moved=[];
 for(const id of ['regional:chenjiang-service','regional:beiling-parking']){
  const service=structuredClone(map.regional!.highways!.services.find(s=>s.id===id)!),structure=structuredClone(map.regional!.structures.find(s=>s.id===id)!),route=map.regional!.routes.find(r=>r.id===service.highway)!,path=route.centerline;
  let oldStation=0,best=Infinity,distance=0;for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((service.position.x-a.x)*dx+(service.position.z-a.z)*dz)/(L*L))),gap=Math.hypot(service.position.x-a.x-dx*t,service.position.z-a.z-dz*t);if(gap<best){best=gap;oldStation=distance+t*L;}distance+=L;}
  const old=sampleAt(path,oldStation),station=polylineLength(path)-(service.highway==='G17'?1400:6200),next=sampleAt(path,station);
  const transform=(p:CityPoint):CityPoint=>{const dx=p.x-old.point.x,dz=p.z-old.point.z,along=dx*old.tangent.x+dz*old.tangent.z,side=-dx*old.tangent.z+dz*old.tangent.x,s=sampleAt(path,station+along);return{x:s.point.x-s.tangent.z*side,y:(next.point.y??0)+(p.y??0)-(old.point.y??0),z:s.point.z+s.tangent.x*side};};
  const roads=map.roads.filter(r=>r.id.startsWith(id+':')&&/:(off|local|on):(-?1)$/.test(r.id)).map(r=>({...structuredClone(r),centerline:r.centerline.map(transform)})),objects=map.objects.filter(o=>o.id.startsWith(id+':')).map(o=>({...structuredClone(o),position:transform(o.position),rotation:o.rotation+Math.atan2(next.tangent.x,next.tangent.z)-Math.atan2(old.tangent.x,old.tangent.z)}));
  map.regional!.structures=map.regional!.structures.filter(s=>s.id!==id);map.regional!.exits=map.regional!.exits.filter(s=>s.id!==id);map.regional!.highways!.services=map.regional!.highways!.services.filter(s=>s.id!==id);map.regional!.highways!.exits=map.regional!.highways!.exits.filter(s=>s.id!==id);
  for(const r of [...map.roads.filter(r=>r.id.startsWith(id+':'))])deleteObject(map,r.id);
  map.objects=map.objects.filter(o=>!o.id.startsWith(id+':'));regionalMetadataV8(map);
  map.roads.push(...roads);map.objects.push(...objects);
  for(const sign of [1,-1]){const off=roads.find(r=>r.id===id+':off:'+sign)!,local=roads.find(r=>r.id===id+':local:'+sign)!,on=roads.find(r=>r.id===id+':on:'+sign)!;
   attachLaneV8(map,off,'start',r=>r.roadNameId===route.id&&r.laneCount>=2&&!r.gore&&!r.highwayTransition&&r.id.includes(sign===1?':out':':in'));
   connectRoads(map,{roadId:off.id,end:'end'},{roadId:local.id,end:'start'});connectRoads(map,{roadId:local.id,end:'end'},{roadId:on.id,end:'start'});
   attachLaneV8(map,on,'end',r=>r.roadNameId===route.id&&r.laneCount>=2&&!r.gore&&!r.highwayTransition&&r.id.includes(sign===1?':out':':in'));
   for(const r of [off,on]){const sy=r.centerline[0]!.y??0,ey=r.centerline.at(-1)!.y??0,L=polylineLength(r.centerline);let d=0;for(let i=0;i<r.centerline.length;i++){if(i)d+=Math.hypot(r.centerline[i]!.x-r.centerline[i-1]!.x,r.centerline[i]!.z-r.centerline[i-1]!.z);r.centerline[i]!.y=sy+(ey-sy)*ease((d-25)/(L-50));}}
  }
  service.position=transform(service.position);service.roadIds=roads.map(r=>r.id);structure.center=transform(structure.center);structure.roadIds=[...service.roadIds];map.regional!.structures.push(structure);map.regional!.highways!.services.push(service);regionalMetadataV8(map);
  moved.push({id,name:service.name,from:old.point,to:next.point,station});
 }
 map.environment.metadata={...map.environment.metadata,v9MovedServices:JSON.stringify(moved)};
}
