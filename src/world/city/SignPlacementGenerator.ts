import { roadFunction, isControlledAccessRoad } from './RoadClassification';
import type { CityMapData, CityPoint, CityRoad, RoadEndpoint } from './CityMapData';
import type { RoadSignDefinition, RoadSignDestination } from './RoadSignData';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { polylineLength, roadEdges, roadPoints, rotatePoint, sampleAt } from './geometry';
import { RoadClearance } from './RoadClearance';
import { ROAD_SIGN_POST_Z,signDimensions } from './RoadSignTemplates';
import {roadPiers} from './RoadInfrastructure';
import { optimizeFastRoadSigns, isSafetySign } from '../regional/FastRoadSignPlacement';

export interface SignDecision {
 id:string;nodeId:string;incoming:RoadEndpoint;outgoing:RoadEndpoint[];
 expressway:boolean;crossroad:boolean;destinations:RoadSignDestination[];
}
interface Direction {x:number;z:number}
const canEnter=(r:CityRoad,end:RoadEndpoint['end'])=>r.travelDirection==='two-way'||(r.travelDirection==='forward')===(end==='end');
const canLeave=(r:CityRoad,end:RoadEndpoint['end'])=>r.travelDirection==='two-way'||(r.travelDirection==='forward')===(end==='start');
const isFast=isControlledAccessRoad;
/** Only logical roads, links and junctions participate. No helper meshes. */
export function signDecisionNodes(map:CityMapData):SignDecision[] {
 const roads=new Map(map.roads.map(r=>[r.id,r])),paths=new Map(map.roads.map(r=>[r.id,roadPoints(r)]));
 const network=buildCityRoadNetwork(map);
 const nodes=[...map.intersections.map(j=>({id:j.id,ends:j.connections.map(c=>({roadId:c.roadId,end:c.end}))})),...network.endpointNodes.filter(n=>n.ends.length>1)];
 const nodeAt=new Map<string,typeof nodes[number]>();for(const n of nodes)for(const e of n.ends)nodeAt.set(e.roadId+':'+e.end,n);
 const outward=(e:RoadEndpoint):Direction=>{const p=paths.get(e.roadId)!,a=e.end==='start'?p[0]!:p.at(-1)!,b=e.end==='start'?p[1]!:p.at(-2)!,l=Math.hypot(b.x-a.x,b.z-a.z);return{x:(b.x-a.x)/l,z:(b.z-a.z)/l};};
 const nameFor=(e:RoadEndpoint):string=>{
  const queue=[e],seen=new Set<string>();
  while(queue.length) {
   const a=queue.shift()!,key=a.roadId+':'+a.end;if(seen.has(key))continue;seen.add(key);
   const r=roads.get(a.roadId)!;if(r.displayName!==''&&r.roadNameId&&map.roadNames?.[r.roadNameId])return r.roadNameId;
   const end=a.end==='start'?'end':'start',n=nodeAt.get(r.id+':'+end);
   if(n)queue.push(...n.ends.filter(b=>b.roadId!==r.id&&canLeave(roads.get(b.roadId)!,b.end)));
  }
  const r=roads.get(e.roadId)!,id=r.district==='west'?'west-district':r.district==='east'?'east-district':r.district==='north'?'north-district':r.district==='south'?'south-district':'city-center';
  return id;
 };
 const destinationRoad=(e:RoadEndpoint):RoadEndpoint=>{
  const queue=[e],seen=new Set<string>();
  while(queue.length){const current=queue.shift()!,key=current.roadId+':'+current.end;if(seen.has(key))continue;seen.add(key);const r=roads.get(current.roadId)!;
   if(r.displayName!==''&&r.roadNameId&&map.roadNames?.[r.roadNameId]&&!r.gore&&!r.highwayTransition&&roadFunction(r)!=='ramp')return current;
   const node=nodeAt.get(r.id+':'+(current.end==='start'?'end':'start'));if(node)queue.push(...node.ends.filter(next=>next.roadId!==r.id&&canLeave(roads.get(next.roadId)!,next.end)));
  }return e;
 };
 const result:SignDecision[]=[];
 for(const n of nodes)for(const incoming of n.ends) {
  const r=roads.get(incoming.roadId)!;if(!canEnter(r,incoming.end))continue;
  const back=outward(incoming),t={x:-back.x,z:-back.z};
  const outgoing=n.ends.filter(e=>e.roadId!==r.id&&canLeave(roads.get(e.roadId)!,e.end)).filter(e=>{const o=outward(e);return t.x*o.x+t.z*o.z>-.85;});
  if(outgoing.length<2)continue;
  const expressway=isFast(r),major=roadFunction(r)==='arterial'||roadFunction(r)==='collector'&&r.laneCount>=4;
  if(!expressway&&!major)continue;
  const crossroad=n.ends.length===4&&outgoing.length===3&&outgoing.some(e=>{const o=outward(e);return t.x*o.x+t.z*o.z>.94;});
  const destinations=outgoing.map(e=>{
   const o=outward(e),angle=Math.atan2(t.x*o.z-t.z*o.x,t.x*o.x+t.z*o.z);
   const receiving=destinationRoad(e),travel=outward(receiving),roadNameId=nameFor(receiving),exit=roadFunction(r)==='expressway'&&roadFunction(roads.get(e.roadId)!)==='ramp';
   const directionId=map.roadNames?.[roadNameId]?.kind==='expressway'?(Math.abs(travel.x)>Math.abs(travel.z)?travel.x>0?'east-ring':'west-ring':travel.z>0?'south-ring':'north-ring'):undefined;
   const path=paths.get(e.roadId)!,q=sampleAt(e.end==='start'?path:[...path].reverse(),Math.min(20,polylineLength(path))).point,start=e.end==='start'?path[0]!:path.at(-1)!,side=(q.x-start.x)*-t.z+(q.z-start.z)*t.x;
   return {roadNameId,directionId,arrow:exit?side<-.1?'exit-left':'exit-right':Math.abs(angle)<.3?'straight':angle>0?'right':'left'} as RoadSignDestination;
  });
  result.push({id:n.id+'|'+r.id+'|'+incoming.end,nodeId:n.id,incoming,outgoing,expressway,crossroad,destinations});
 }
 // A normal major crossroad needs one street-name board. Directional forks have
 // separate approaching directions; expressway forks always retain both stages.
 return result.filter(d=>!d.crossroad||d.expressway||result.filter(a=>a.nodeId===d.nodeId&&a.crossroad&&!a.expressway).sort((a,b)=>roads.get(b.incoming.roadId)!.laneCount-roads.get(a.incoming.roadId)!.laneCount||polylineLength(paths.get(b.incoming.roadId)!)-polylineLength(paths.get(a.incoming.roadId)!))[0]===d);
}
/** Generates and places a requirement for every relevant graph approach. Upstream
 * stationing traverses continuation segments, so tiny segments do not lose signs. */
export function generateTopologySigns(map:CityMapData):RoadSignDefinition[] {
 const roads=new Map(map.roads.map(r=>[r.id,r])),paths=new Map(map.roads.map(r=>[r.id,roadPoints(r)])),clearance=new RoadClearance(map);
 const network=buildCityRoadNetwork(map),allNodes=[...map.intersections.map(j=>({id:j.id,ends:j.connections})),...network.endpointNodes];
 const piers=map.roads.flatMap(r=>roadPiers(r,map,clearance));
 const nodes=new Map<string,typeof allNodes[number]>();for(const n of allNodes)for(const e of n.ends)nodes.set(e.roadId+':'+e.end,n);
 const decisions=signDecisionNodes(map),signs:RoadSignDefinition[]=[],missing:string[]=[],oldSigns=new Map((map.signs??[]).flatMap(s=>(s.decisionIds??[]).map(id=>[id+':'+s.type,s] as const)));
 const trace=(e:RoadEndpoint,distance:number):{road:CityRoad;point:CityPoint;t:Direction;direction:'forward'|'reverse';distance:number;station:number}|undefined=>{
  let endpoint=e,remaining=distance,traveled=0;const seen=new Set<string>();
  while(!seen.has(endpoint.roadId+':'+endpoint.end)) {
   seen.add(endpoint.roadId+':'+endpoint.end);const r=roads.get(endpoint.roadId)!,p=paths.get(r.id)!,length=polylineLength(p);
   if(remaining<=length){const station=endpoint.end==='end'?length-remaining:remaining,s=sampleAt(p,station),sign=endpoint.end==='end'?1:-1;return{road:r,point:s.point,t:{x:s.tangent.x*sign,z:s.tangent.z*sign},direction:sign===1?'forward':'reverse',distance:traveled+remaining,station};}
   const other=endpoint.end==='end'?'start':'end',n=nodes.get(r.id+':'+other);
   if(!n)return undefined;
   const candidates=n.ends.filter(b=>b.roadId!==r.id&&canEnter(roads.get(b.roadId)!,b.end)&&isFast(roads.get(b.roadId)!)===isFast(r));
   // Crossing a different urban decision would point at the wrong junction.
   const here=sampleAt(p,other==='start'?0:length).tangent,sg=other==='start'?1:-1;
   const sorted=candidates.map(b=>{const q=paths.get(b.roadId)!,s=sampleAt(q,b.end==='end'?polylineLength(q):0),ds=b.end==='end'?1:-1;return{b,dot:(s.tangent.x*here.x+s.tangent.z*here.z)*sg*ds};}).sort((a,b)=>b.dot-a.dot);
   if(!sorted.length||sorted[0]!.dot<(isFast(r)?.8:length<55?.35:.96))return undefined;
   remaining-=length;traveled+=length;endpoint=sorted[0]!.b;
  }return undefined;
 };
 const safe=(s:RoadSignDefinition)=>{
  const dims=signDimensions(s.template,s.size,s.postOffset),y=s.position.y??0;
  const at=(x:number,z=0)=>{const p=rotatePoint({x,z},s.heading);return{x:s.position.x+p.x,y,z:s.position.z+p.z};},postAt=(x:number)=>at(x,ROAD_SIGN_POST_Z),postY=s.postBaseY??y;
  if(dims.posts.some(x=>clearance.roadAt(postAt(x),.45,postY-.3,y+dims.poleTop,undefined,undefined,s.postOffset!==undefined)||s.postOffset!==undefined&&clearance.roadAt(postAt(x),.45,postY-.3,y+dims.poleTop,s.roadId)||clearance.junctionAt(postAt(x),1,postY-.3,y+dims.poleTop)))return false;
  if([-dims.width/2,0,dims.width/2].some(x=>clearance.roadAt(at(x),.15,y+dims.bottom-.3,y+dims.bottom+dims.height+.2)))return false;
  if(dims.posts.some(x=>piers.some(p=>postY<p.height&&Math.hypot(postAt(x).x-p.position.x,postAt(x).z-p.position.z)<1)))return false;
  // Reserve sight space around existing furniture and around previously generated
  // boards. This is placement exclusion, never a physics collision solver.
  if(map.objects.some(o=>!['green_strip','hardscape','embankment'].includes(o.prefabId)&&Math.abs((o.position.y??0)-y)<10&&Math.hypot(o.position.x-s.position.x,o.position.z-s.position.z)<dims.width/2+3))return false;
  if(signs.some(o=>Math.abs((o.position.y??0)-y)<6&&Math.hypot(o.position.x-s.position.x,o.position.z-s.position.z)<(signDimensions(o.template,o.size).width+dims.width)/2+3))return false;
  return true;
 };
 for(const decision of decisions) {
  const incoming=roads.get(decision.incoming.roadId)!;
  const requests=decision.expressway?[{type:'EXPRESSWAY_ADVANCE' as const,wanted:roadFunction(incoming)==='expressway'?260:120},{type:'EXPRESSWAY_DIVERGE' as const,wanted:30}]:[{type:decision.crossroad?'ROAD_NAME' as const:'URBAN_DIRECTION' as const,wanted:85}];
  let previousDistance=Infinity;
  for(const request of requests) {
   let placed=false;
   const candidates=request.type==='EXPRESSWAY_DIVERGE'?[30,40,20,50,12,60]:[request.wanted,request.wanted*.8,request.wanted*.6,request.wanted*.4,request.wanted*.25,request.wanted+40,request.wanted+80,12,8];
   for(const d of candidates) {
    if(request.type==='EXPRESSWAY_DIVERGE'&&previousDistance-d<28)continue;
    const s=trace(decision.incoming,d);if(!s)continue;
    const heading=Math.atan2(-s.t.x,-s.t.z),edges=roadEdges(s.road),right=s.direction==='forward'?edges.right:-edges.left;
    for(const template of s.road.structure?.enclosure&&s.road.structure.enclosure.kind!=='cutting'?['ceiling'] as const:['gantry'] as const) {
     const size=decision.destinations.length>2?'large':'medium';
     for(const extra of [0]) {
      const q=rotatePoint({x:extra,z:0},heading);
      const sign:RoadSignDefinition={id:oldSigns.get(decision.id+':'+request.type)?.id??'topology-sign:'+decision.id+':'+request.type,type:request.type,template,size,roadId:s.road.id,position:{x:s.point.x+q.x,y:s.point.y??0,z:s.point.z+q.z},heading,laneDirection:s.direction,destinations:decision.destinations,language:'zh-CN',advanceMetres:s.distance,stationMetres:s.station,decisionIds:[decision.id],incomingRoadId:decision.incoming.roadId,outgoingRoadIds:decision.outgoing.map(e=>e.roadId),postOffset:template==='gantry'?Math.max(s.road.laneCount*s.road.laneWidth/2+.65,right+(s.road.sidewalk?.enabled?s.road.sidewalk.width:0)+1):undefined,approachRoadNameId:s.road.displayName===''?undefined:s.road.roadNameId};
      // CityGround's existing terrain is a flat plane at -0.04 m. A roadside
      // fallback outside an elevated deck therefore needs a ground foundation.
      if(template==='gantry'&&(s.point.y??0)>.5)sign.postBaseY=0;
      if(!safe(sign))continue;
      signs.push(sign);placed=true;previousDistance=d;break;
     }if(placed)break;
    }if(placed)break;
   }
   if(!placed)missing.push(decision.id+':'+request.type);
  }
 }
 map.environment.metadata={...map.environment.metadata,signGeneration:'topology-v5',navigationSignCount:String(signs.length),signDecisionApproaches:String(decisions.length),signExpresswayDecisions:String(decisions.filter(d=>d.expressway).length),signMissingRequirements:JSON.stringify(missing)};
 map.signs=signs;
 optimizeFastRoadSigns(map);
 map.environment.metadata.navigationSignCount=String(map.signs.filter(s=>!isSafetySign(s)).length);
 return map.signs;
}
