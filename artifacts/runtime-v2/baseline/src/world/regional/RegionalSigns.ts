import type { CityMapData, CityPoint, CityRoad } from '../city/CityMapData';
import type { RoadSignDefinition } from '../city/RoadSignData';
import { polylineLength, sampleAt } from '../city/geometry';
import { generateHighwaySigns } from './HighwaySigns';

const destinations:Record<string,[string,string]>={G17:['东临 / 滨河','市中心'],G38:['北岭 / 青岭','市中心'],G4516:['山海 / 东南新区','市中心'],S26:['南港 / 临港','市中心'],S37:['西川 / 河湾','市中心'],S68:['东原 / 南港','青岭 / 北岭'],S89:['东南新区 / 山海','西川 / 河湾']};
function closest(roads:CityRoad[],q:CityPoint):{road:CityRoad;station:number} {
  let best=Infinity,result={road:roads[0]!,station:0};
  for(const road of roads){let station=0;for(let i=1;i<road.centerline.length;i++){const a=road.centerline[i-1]!,b=road.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.z-a.z)*dz)/(l*l))),d=Math.hypot(q.x-a.x-dx*t,q.z-a.z-dz*t);if(d<best){best=d;result={road,station:station+t*l};}station+=l;}}
  return result;
}
/** Walk continuous directed mainline links so advance boards can cross authoring splits. */
export function upstreamStation(map:CityMapData,road:CityRoad,station:number):{road:CityRoad;station:number} {
  const visited=new Set<string>();
  while(station<0&&!visited.has(road.id)){
    visited.add(road.id);const previous=map.roadLinks?.find(l=>l.to.roadId===road.id&&l.to.end==='start'&&l.from.end==='end'&&map.roads.find(r=>r.id===l.from.roadId)?.roadNameId===road.roadNameId);
    if(!previous)break;road=map.roads.find(r=>r.id===previous.from.roadId)!;station+=polylineLength(road.centerline);
  }
  return {road,station:Math.max(0,station)};
}
export function generateRegionalSigns(map:CityMapData):void {
  if(map.regional?.highways){generateHighwaySigns(map);return;}
  const region=map.regional!,names=map.roadNames!;
  for(const [id,[outgoing,incoming]] of Object.entries(destinations)){names[`${id}:forward`]={primaryText:outgoing,kind:'destination'};names[`${id}:reverse`]={primaryText:incoming,kind:'destination'};}
  const board=(road:CityRoad,station:number,id:string,type:RoadSignDefinition['type'],interchangeId?:string,target?:string,advanceMetres?:number)=>{
    const location=upstreamStation(map,road,station),s=sampleAt(location.road.centerline,location.station),direction=road.id.includes(':in')?'reverse':'forward',shoulder=road.laneCount*road.laneWidth/2+(road.shoulders?.right??2)+.2;
    const sign:RoadSignDefinition={id,type,template:type==='RAMP_CONFIRMATION'?'ramp-confirmation':'gantry',size:type==='RAMP_CONFIRMATION'?'medium':'large',roadId:location.road.id,position:{...s.point},heading:Math.atan2(-s.tangent.x,-s.tangent.z),laneDirection:'forward',language:'zh-CN',interchangeId,advanceMetres,stationMetres:location.station,postOffset:shoulder,
      destinations:[{roadNameId:road.roadNameId!,directionId:`${road.roadNameId}:${direction}`,arrow:'straight'},...(target?[{roadNameId:target,arrow:'exit-right' as const,distanceMetres:advanceMetres}]:[])]};
    if(type==='RAMP_CONFIRMATION'){sign.position.x-=s.tangent.z*(shoulder+2);sign.position.z+=s.tangent.x*(shoulder+2);sign.postOffset=undefined;}
    map.signs!.push(sign);
  };
  const ramps=map.roads.filter(r=>r.id.startsWith('regional:')&&r.gore?.start);
  for(const ramp of ramps){
    const sourceLink=map.roadLinks!.find(l=>l.to.roadId===ramp.id&&l.to.end==='start');if(!sourceLink)continue;
    const source=map.roads.find(r=>r.id===sourceLink.from.roadId)!;
    const structure=region.structures.find(s=>s.roadIds.includes(ramp.id));
    const exit=region.exits.find(s=>s.roadIds.includes(ramp.id));
    const target=structure?.routes.find(id=>id!==source.roadNameId)??exit?.id??structure?.id??ramp.roadNameId;
    const interchange=structure?.id??exit?.id;
    for(const distance of [500,200,35])board(source,polylineLength(source.centerline)-distance,`${ramp.id}:sign:${distance}`,distance===35?'EXPRESSWAY_DIVERGE':'EXPRESSWAY_ADVANCE',interchange,target,distance);
    // Route of a turning ramp is the route it enters, derived from its receiving link.
    const destinationLink=map.roadLinks!.find(l=>l.from.roadId===ramp.id&&l.from.end==='end');
    if(destinationLink){const receiving=map.roads.find(r=>r.id===destinationLink.to.roadId)!;if(receiving.roadNameId){ramp.roadNameId=receiving.roadNameId;board(ramp,Math.min(140,polylineLength(ramp.centerline)*.7),`${ramp.id}:confirm`,'RAMP_CONFIRMATION');}}
  }
  for(const route of region.routes)for(const direction of [':out',':in']){
    const roads=route.roadIds.map(id=>map.roads.find(r=>r.id===id)!).filter(r=>r.id.includes(direction));
    for(let station=500;station<polylineLength(route.centerline);station+=1600){const q=sampleAt(route.centerline,station).point,location=closest(roads,q);board(location.road,location.station,`regional:${route.id}:${direction}:route:${station}`,'RAMP_CONFIRMATION');}
  }
}
