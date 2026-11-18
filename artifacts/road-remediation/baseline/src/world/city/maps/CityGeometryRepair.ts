import type { CityMapData } from '../CityMapData';
import { polylineLength, roadPoints, sampleAt } from '../geometry';
import { splitRoadAtPoint } from '../MapAPI';
import { bezierPoints } from '../presets/BackbonePresets';

export const CITY_CLEARANCE_REPAIR_ROADS=['direct-north:on-1','direct-north:off-1','direct-north:on--1','direct-north:off--1'] as const;
export const REGIONAL_CLEARANCE_REPAIR_ROADS=['regional:nangang:on:1','regional:nangang:off:-1','regional:nangang:local:1','regional:nangang:local:-1'] as const;

/** Build a reviewable copy of the four north feeders and the relocated Nangang
 * access corridor. All other roads and city endpoint anchors remain unchanged. */
export function cityGeometryRepairCandidate(source:CityMapData):CityMapData {
  const map=structuredClone(source),allowed=new Set<string>([...CITY_CLEARANCE_REPAIR_ROADS,...REGIONAL_CLEARANCE_REPAIR_ROADS]);
  for(const id of CITY_CLEARANCE_REPAIR_ROADS){
    const road=map.roads.find(r=>r.id===id);if(!road)throw new Error('Missing repair road '+id);
    const path=roadPoints(road),a=path[0]!,b=path.at(-1)!,alongX=Math.abs(b.x-a.x)>Math.abs(b.z-a.z),span=Math.abs(alongX?b.x-a.x:b.z-a.z),transition=40;
    if(span<150||span>400||Math.abs((a.y??0)-(b.y??0))>8.01)throw new Error('Unexpected access geometry '+id);
    const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
    road.centerline=path.map((_,i)=>{
      const t=i/(path.length-1),d=t*span,lateral=d<transition?.5*ease(d/transition):d>span-transition?.5+.5*ease((d-span+transition)/transition):.5;
      const y=(a.y??0)+((b.y??0)-(a.y??0))*Math.max(0,Math.min(1,(d-transition)/(span-2*transition)));
      return{x:a.x+(b.x-a.x)*(alongX?t:lateral),y,z:a.z+(b.z-a.z)*(alongX?lateral:t)};
    });road.curve='polyline';road.elevationMode='custom';
    road.centerline[0]=structuredClone(source.roads.find(r=>r.id===id)!.centerline[0]!);road.centerline[road.centerline.length-1]=structuredClone(source.roads.find(r=>r.id===id)!.centerline.at(-1)!);
  }
  if(map.regional)for(const id of relocateNangangAccess(map))allowed.add(id);
  if(map.regional)for(const [id,reach,offset]of [['regional:lingang:S-to-E-right',80,6],['regional:lingang:E-to-N-right',80,6],['regional:v3:chenjiang-foldback',280,12]] as const){
    const road=map.roads.find(r=>r.id===id)!;allowed.add(id);
    // Separate the measured shoulders earlier, leaving enough length for a 6%
    // vertical transition without moving anchors or the central interchange.
    const path=roadPoints(road),length=polylineLength(path);let station=0;
    road.centerline=path.map((p,i,a)=>{if(i)station+=Math.hypot(p.x-a[i-1]!.x,p.z-a[i-1]!.z);const distance=Math.min(station,length-station),span=id==='regional:v3:chenjiang-foldback'&&station<length/2?400:reach,amount=id==='regional:v3:chenjiang-foldback'&&station<length/2?24:offset,extra=distance<span?amount*Math.sin(Math.PI*distance/span)**2:0,frame=sampleAt(path,station);return i===0||i===a.length-1?p:{...p,x:p.x-frame.tangent.z*extra,z:p.z+frame.tangent.x*extra};});
  }
  for(const before of source.roads){const after=map.roads.find(r=>r.id===before.id)!;
    if(!allowed.has(before.id)&&JSON.stringify(before)!==JSON.stringify(after))throw new Error('Unexpected road mutation '+before.id);
    if(!REGIONAL_CLEARANCE_REPAIR_ROADS.includes(before.id as typeof REGIONAL_CLEARANCE_REPAIR_ROADS[number])&&!map.regional?.routes.some(route=>route.id==='S26'&&route.roadIds.includes(before.id)))for(const index of [0,-1])if(JSON.stringify(before.centerline.at(index))!==JSON.stringify(after.centerline.at(index)))throw new Error('Endpoint changed '+before.id);
  }
  if(!map.regional&&JSON.stringify(map.roadLinks)!==JSON.stringify(source.roadLinks)||JSON.stringify(map.intersections)!==JSON.stringify(source.intersections))throw new Error('Unexpected topology change by clearance repair');
  map.environment.metadata={...map.environment.metadata,geometryClearanceRepair:'1',geometryClearanceRoads:JSON.stringify([...allowed].filter(id=>map.roads.some(r=>r.id===id)))};
  return map;
}

function relocateNangangAccess(map:CityMapData):string[]{
  const changed:string[]=[],savedSigns=map.signs;map.signs=[];
  for(const [id,mainX,dir]of [['regional:nangang:on:1',-8.625,1],['regional:nangang:off:-1',8.625,-1]] as const){
    const point={x:mainX,y:0,z:2790},main=map.roads.find(r=>r.type==='highway'&&!r.highwayTransition&&r.roadNameId==='S26'&&r.centerline.some((p,i,a)=>i>0&&Math.min(a[i-1]!.z,p.z)<2790&&Math.max(a[i-1]!.z,p.z)>2790&&Math.abs(p.x-mainX)<.1));
    if(!main)throw new Error('Missing continuous S26 join for '+id);
    const oldPath=roadPoints(main),split=splitRoadAtPoint(map,main.id,point,{baseName:id+':main-continuation'}),splitStation=polylineLength(roadPoints(split.before));changed.push(split.before.id,split.after.id);
    for(const route of [...map.regional!.routes,...map.regional!.highways!.routes])if(route.roadIds.includes(main.id))route.roadIds.splice(route.roadIds.indexOf(main.id)+1,0,split.after.id);
    for(const structure of map.regional!.structures)if(structure.roadIds.includes(main.id))structure.roadIds.push(split.after.id);
    for(const sign of savedSigns??[])if(sign.roadId===main.id&&(sign.stationMetres??0)>splitStation){sign.roadId=split.after.id;sign.stationMetres=sign.stationMetres!-splitStation;}
    if(Math.abs(polylineLength(roadPoints(split.before))+polylineLength(roadPoints(split.after))-polylineLength(oldPath))>1e-6)throw new Error('S26 centreline changed');
    const road=map.roads.find(r=>r.id===id)!,local=map.roads.find(r=>r.id==='regional:nangang:local:'+dir)!,localPoint={x:dir*-105,y:0,z:2690};
    local.centerline[dir===1?local.centerline.length-1:0]=localPoint;
    const a=dir===1?localPoint:point,b=dir===1?point:localPoint,chord=Math.hypot(b.x-a.x,b.z-a.z)/3;
    road.centerline=bezierPoints(a,{x:a.x,y:0,z:a.z+dir*chord},{x:b.x,y:0,z:b.z-dir*chord},b);road.curve='polyline';road.elevationMode='custom';road.designProfile='urban';road.speedLimit=40;
    for(const link of map.roadLinks!)if(dir===1?link.from.roadId===id&&link.from.end==='end':link.to.roadId===id&&link.to.end==='start'){
      if(dir===1)link.to={...split.to};else link.from={...split.from};
    }
    changed.push(road.id,local.id);
  }
  map.signs=savedSigns;return changed;
}
