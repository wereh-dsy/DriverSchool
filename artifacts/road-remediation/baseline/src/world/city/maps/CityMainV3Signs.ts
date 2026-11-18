import type { CityMapData,CityPoint,CityRoad } from '../CityMapData';
import { buildCityRoadNetwork } from '../CityRoadNetwork';
import { roadPoints,polylineLength,sampleAt,roadEdges,rotatePoint } from '../geometry';
import { RoadClearance } from '../RoadClearance';
import { signDimensions } from '../RoadSignTemplates';
import type { RoadSignDefinition,RoadSignDestination,RoadSignTemplate } from '../RoadSignData';

const main=(r:CityRoad)=>r.laneCount===3&&r.speedLimit>=80;
export function placeCityMainV3Signs(map:CityMapData):void {
  const network=buildCityRoadNetwork(map),clearance=new RoadClearance(map),roads=new Map(map.roads.map(r=>[r.id,r]));map.signs=[];
  const incoming=(id:string)=>network.connectivity.filter(n=>n.outgoingRoadIds.includes(id)).flatMap(n=>n.incomingRoadIds).map(id=>roads.get(id)!).find(main);
  const outgoing=(id:string)=>network.connectivity.filter(n=>n.incomingRoadIds.includes(id)).flatMap(n=>n.outgoingRoadIds).map(id=>roads.get(id)!).find(main);
  function backward(road:CityRoad,d:number):{road:CityRoad;point:CityPoint;tangent:CityPoint;actual:number} {
    let remaining=d,current=road;const seen=new Set<string>();
    while(remaining>polylineLength(roadPoints(current))&&!seen.has(current.id)) {
      seen.add(current.id);remaining-=polylineLength(roadPoints(current));const next=incoming(current.id);if(!next){remaining=0;break;}current=next;
    }
    const sample=sampleAt(roadPoints(current),Math.max(0,polylineLength(roadPoints(current))-remaining));return {...sample,road:current,actual:d};
  }
  const direction=(r:CityRoad,t:CityPoint)=>r.roadNameId==='ring-expressway'?(Math.abs(t.x)>Math.abs(t.z)?t.x>0?'east-ring':'west-ring':t.z<0?'north-ring':'south-ring'):r.roadNameId==='north-south-expressway'?(t.z<0?'north-district':'south-district'):r.roadNameId==='intercity-east-expressway'?(t.x>0?'intercity-outbound':'city-center'):(t.x>0?'east-district':'west-district');
  function put(id:string,type:RoadSignDefinition['type'],template:RoadSignTemplate,sample:{road:CityRoad;point:CityPoint;tangent:CityPoint},destinations:RoadSignDestination[],interchangeId?:string,advanceMetres?:number) {
    const size:RoadSignDefinition['size']=template==='gantry'?'large':type==='URBAN_DIRECTION'||type==='EXPRESSWAY_ADVANCE'||type==='EXPRESSWAY_DIVERGE'?'medium':'small';
    const heading=Math.atan2(-sample.tangent.x,-sample.tangent.z),t=signDimensions(template,size),edge=roadEdges(sample.road),sign:RoadSignDefinition={id,type,template,size,roadId:sample.road.id,position:{...sample.point},heading,laneDirection:'forward',destinations,interchangeId,language:'zh-CN',advanceMetres};
    const offset=template==='gantry'?0:edge.right+t.width/2+2.4;
    const delta=rotatePoint({x:offset,z:0},heading);sign.position.x+=delta.x;sign.position.z+=delta.z;
    const permitted=()=>{
      for(const x of t.posts){const q=rotatePoint({x,z:0},heading),p={x:sign.position.x+q.x,z:sign.position.z+q.z};if(clearance.roadAt(p,0.9,(sign.position.y??0)-1.5,(sign.position.y??0)+t.poleTop))return false;}
      for(const x of [-t.width/2,0,t.width/2]){const q=rotatePoint({x,z:0},heading),p={x:sign.position.x+q.x,z:sign.position.z+q.z};if(clearance.roadAt(p,0.2,(sign.position.y??0)+t.bottom-0.5,(sign.position.y??0)+t.bottom+t.height+0.5))return false;}
      return true;
    };
    if(!permitted())return false;
    map.signs!.push(sign);return true;
  }
  for(const group of ['central','east','north','west','south','intercity']) {
    const groupId=group==='intercity'?'peripheral-interchange':'system-'+group,ramps=map.roads.filter(r=>r.groupId===groupId&&r.gore),hub=group==='intercity'?'intercity-hub':group+'-hub';
    const approaches=new Map<string,CityRoad[]>();
    for(const ramp of ramps) {
      const entry=incoming(ramp.id),exit=outgoing(ramp.id);if(!entry||!exit||!exit.roadNameId)throw new Error('Missing sign movement connectivity '+ramp.id);
      const start=sampleAt(roadPoints(ramp),0),end=sampleAt(roadPoints(ramp),polylineLength(roadPoints(ramp)));ramp.roadNameId=exit.roadNameId;
      const key=start.tangent.x.toFixed(0)+','+start.tangent.z.toFixed(0),list=approaches.get(key)??[];list.push(ramp);approaches.set(key,list);
      const destination:RoadSignDestination={roadNameId:exit.roadNameId,directionId:direction(exit,end.tangent),arrow:'straight'};
      let placed=false;for(const d of [70,90,110,130,150]){if(d>polylineLength(roadPoints(ramp))-30)continue;const sample=sampleAt(roadPoints(ramp),d);if(put(ramp.id+':confirmation','RAMP_CONFIRMATION','ramp-confirmation',{...sample,road:ramp},[destination])){placed=true;break;}}
      if(!placed)throw new Error('No safe confirmation location '+ramp.id);
    }
    for(const [key,list] of approaches) {
      const directionT=sampleAt(roadPoints(list[0]!),0).tangent;
      const anchor=list.reduce((a,b)=>{const p=a.centerline[0]!,q=b.centerline[0]!;return p.x*directionT.x+p.z*directionT.z<q.x*directionT.x+q.z*directionT.z?a:b;}),entry=incoming(anchor.id)!;
      const stay:RoadSignDestination={roadNameId:entry.roadNameId!,directionId:direction(entry,directionT),arrow:'straight'};
      const turns=list.map(r=>{const exit=outgoing(r.id)!,t=sampleAt(roadPoints(r),polylineLength(roadPoints(r))).tangent;return {roadNameId:exit.roadNameId!,directionId:direction(exit,t),arrow:'exit-right' as const};});
      for(const [type,distance] of [['EXPRESSWAY_ADVANCE',300],['EXPRESSWAY_DIVERGE',100]] as const) {
        let placed=false;
        for(const delta of [0,15,-15,30,-30,45,-45]) {
          const sample=backward(entry,distance+delta),id=groupId+':'+key+':'+type;
          if(put(id,type,'gantry',sample,[stay,...turns].slice(0,3),hub,distance+delta)||put(id,type,'dual-post',sample,[stay,...turns].slice(0,3),hub,distance+delta)){placed=true;break;}
        }
        if(!placed)throw new Error('No safe approach sign '+groupId+':'+key+':'+type);
      }
    }
    const ramp=ramps.find(r=>r.id.endsWith('-right'))??ramps[0]!;let named=false;
    for(const d of [60,80,100,120,140,160]){if(d>=polylineLength(roadPoints(ramp))-15)continue;const s=sampleAt(roadPoints(ramp),d);if(put(groupId+':name','INTERCHANGE_NAME','single-post',{...s,road:ramp},[{roadNameId:hub,arrow:'straight'}])){named=true;break;}}
    if(!named)throw new Error('No safe interchange name '+groupId);
  }
  // Major ordinary junctions get approach signs and road-name plaques; local streets stay unlabelled.
  for(const j of map.intersections) {
    const named=j.connections.map(c=>({c,r:roads.get(c.roadId)!})).filter(({r})=>r.roadNameId&&map.roadNames![r.roadNameId]?.kind==='urban');
    if(new Set(named.map(a=>a.r.roadNameId)).size<2)continue;
    for(const {r,c} of named) {
      if(r.travelDirection!=='two-way'&&c.end==='start')continue;
      const length=polylineLength(roadPoints(r));if(length<70)continue;
      const s=sampleAt(roadPoints(r),c.end==='end'?length-55:55);
      if(c.end==='start')s.tangent={x:-s.tangent.x,z:-s.tangent.z,y:-(s.tangent.y??0)};
      const targets=[...new Set(named.filter(a=>a.r!==r).map(a=>a.r.roadNameId!))].slice(0,2).map(id=>({roadNameId:id,arrow:'straight' as const}));
      const count=map.signs!.length;
      put(j.id+':'+c.port+':direction','URBAN_DIRECTION','dual-post',{...s,road:r},targets);
      if(map.signs!.length>count){const plaque=structuredClone(map.signs!.at(-1)!);plaque.id=j.id+':'+c.port+':name';plaque.type='ROAD_NAME';plaque.template='urban-name';plaque.size='small';plaque.destinations=[{roadNameId:r.roadNameId!,arrow:'straight'}];plaque.position.x-=s.tangent.x*12;plaque.position.z-=s.tangent.z*12;plaque.laneDirection=c.end==='start'?'reverse':'forward';map.signs!.push(plaque);map.signs![count]!.laneDirection=plaque.laneDirection;}
    }
  }
  map.environment.metadata!.navigationSignCount=String(map.signs.length);
}
