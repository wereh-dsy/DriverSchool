import type {CityMapData,RoadEndpoint,IntersectionPort} from '../CityMapData';
import {buildCityRoadNetwork} from '../CityRoadNetwork';
import {deleteObject} from '../MapAPI';
import {roadPoints,polylineLength} from '../geometry';
import {ease} from '../presets/BackbonePresets';
/** Retire merge cuts and unused short tails left by the changed city connections. */
export function continuityV8(map:CityMapData):void{
 const merged:string[]=[],tails:string[]=[];let changed=true;
 const key=(e:RoadEndpoint)=>e.roadId+':'+e.end;
 while(changed){changed=false;const network=buildCityRoadNetwork(map);
  for(const short of map.roads.filter(r=>!r.id.startsWith('regional:')&&r.travelDirection==='two-way'&&polylineLength(roadPoints(r))<10)){
   const nodes=network.endpointNodes.filter(n=>n.ends.some(e=>e.roadId===short.id));
   const node=nodes.find(n=>n.ends.length===2&&n.ends.some(e=>{const r=map.roads.find(r=>r.id===e.roadId)!;return r!==short&&r.travelDirection==='two-way'&&r.roadNameId===short.roadNameId&&r.laneCount===short.laneCount;}));
   if(node){
    const a=node.ends.find(e=>e.roadId!==short.id)!,b=node.ends.find(e=>e.roadId===short.id)!,keep=map.roads.find(r=>r.id===a.roadId)!,aa=roadPoints(keep),bb=roadPoints(short),left=a.end==='end'?aa:aa.reverse(),right=b.end==='start'?bb:bb.reverse(),internal=new Set([key(a),key(b)]),farA:RoadEndpoint={roadId:a.roadId,end:a.end==='start'?'end':'start'},farB:RoadEndpoint={roadId:b.roadId,end:b.end==='start'?'end':'start'};
    map.roadLinks=map.roadLinks!.filter(l=>!internal.has(key(l.from))&&!internal.has(key(l.to)));map.connectionPorts=map.connectionPorts!.filter(p=>!internal.has(key(p.endpoint)));
    const remap=(e:RoadEndpoint)=>{if(key(e)===key(farA)){e.roadId=keep.id;e.end='start';}else if(key(e)===key(farB)){e.roadId=keep.id;e.end='end';}};
    for(const j of map.intersections)for(const c of j.connections)remap(c);for(const l of map.roadLinks!)for(const e of [l.from,l.to])remap(e);for(const p of map.connectionPorts!)remap(p.endpoint);
    keep.centerline=[...left,...right.slice(1)];for(const l of map.environment.landmarks??[])l.roadIds=[...new Set(l.roadIds.map(id=>id===short.id?keep.id:id))];deleteObject(map,short.id);merged.push(short.id);changed=true;break;
   }
   const owned=map.intersections.filter(j=>j.connections.some(c=>c.roadId===short.id));
   if(owned.length===1&&nodes.some(n=>n.ends.length===1)){
    const j=owned[0]!;deleteObject(map,short.id);tails.push(short.id);
    if(j.connections.length===3){const angles=j.connections.map(c=>j.portAngles?.[c.port]??0),ports:IntersectionPort[]=['north','east','west'];j.type='t_4lane';j.portAngles={};j.connections.forEach((c,i)=>{c.port=ports[i]!;j.portAngles![c.port]=angles[i]!;});}
    changed=true;break;
   }
  }
 }
 const north=map.roads.find(r=>r.id==='v4-north');
 if(north&&polylineLength(roadPoints(north))<10){
  const node=buildCityRoadNetwork(map).endpointNodes.find(n=>n.ends.some(e=>e.roadId===north.id&&e.end==='start'))!;
  for(const c of node.ends){const r=map.roads.find(r=>r.id===c.roadId)!,path=r.centerline,ordered=c.end==='start'?path:[...path].reverse(),original=ordered.map(p=>({...p})),length=polylineLength(ordered);let station=0;
   for(let i=0;i<ordered.length;i++){if(i)station+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);ordered[i]!.x-=20*(1-ease(station/Math.min(100,length)));}
  }
 }
 map.environment.metadata={...map.environment.metadata,v8Continuity:JSON.stringify({merged,tails})};
}
