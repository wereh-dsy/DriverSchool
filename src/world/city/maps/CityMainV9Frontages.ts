import type {CityMapData,CityPoint,CityRoad,RoadEndpoint,IntersectionPort} from '../CityMapData';
import {buildCityRoadNetwork} from '../CityRoadNetwork';
import {deleteObject,connectRoads,splitRoadAtPoint} from '../MapAPI';
import {portDirection,rotatePoint,roadPoints,polylineLength} from '../geometry';
import {expandPreset} from '../presets/InfrastructurePresets';
import {ease} from '../presets/BackbonePresets';
import {attachLaneV8,laneLandingV8,retireV8,finishJunctionsV8} from './CityMainV8Roads';
import {attachV62Endpoint} from './CityMainV62Access';
import {connectUrbanSkeleton} from './CityMainUrbanConnections';
const isFrontage=(r:CityRoad)=>r.travelDirection==='two-way'&&(r.roadNameId?.startsWith('v8-ew-frontage')||r.roadNameId?.startsWith('v8-ns-frontage'));
const axis=(r:CityRoad)=>r.roadNameId!.startsWith('v8-ew-')?'ew':'ns';
const main=(r:CityRoad)=>r.laneCount===3&&!r.gore&&!r.highwayTransition;

export function dividedFrontagesV9(map:CityMapData):void{
 retireV8(map,r=>r.id.startsWith('v8-ew-access:')||r.id.startsWith('v8-ns-access:'));
 // End the frontage at a usable cross street rather than leaving a one-way stub.
 const network=buildCityRoadNetwork(map);
 for(const r of [...map.roads.filter(isFrontage)])if(network.endpointNodes.some(n=>n.ends.length===1&&n.ends[0]!.roadId===r.id))deleteObject(map,r.id);
 const originals=map.roads.filter(isFrontage),ids=new Set(originals.map(r=>r.id)),oldRoads=new Map(map.roads.map(r=>[r.id,r])),pairs=new Map<string,CityRoad[]>(),links=map.roadLinks!;
 const center=(p:CityPoint,a:string)=>{if(a==='ns')return {...p,x:0};const eb=laneLandingV8(map,p,r=>main(r)&&r.id.startsWith('ew-eb')),wb=laneLandingV8(map,p,r=>main(r)&&r.id.startsWith('ew-wb'));return {...p,z:(eb.z+wb.z)/2};};
 for(const old of originals){const a=axis(old),name=a==='ew'?'v9-chengjing-road':'v9-wangchuan-road';pairs.set(old.id,[1,-1].map(sign=>{
  const r=structuredClone(old);r.id=old.id+(sign===1?'-forward':'-reverse');r.type='urban_2lane';r.laneCount=2;r.laneWidth=3.5;r.travelDirection=sign===1?'forward':'reverse';r.speedLimit=40;r.roadNameId=name;r.groupId='v9-divided-frontages';r.elevationMode='custom';delete r.elevation;delete r.displayName;
  r.centerline=roadPoints(old).map(p=>{const c={...center(p,a),y:-.024},plaza=a==='ew'?sign*48*ease((p.x+550)/300)*(1-ease((p.x-(sign===1?700:430))/300)):0,nsWidth=34+30*ease((p.z+1100)/250)*(1-ease((p.z-500)/300));return a==='ew'?{...c,z:c.z+sign*34+plaza}:{...c,x:-sign*nsWidth};});return r;
 }));}
 map.roads=[...map.roads.filter(r=>!ids.has(r.id)),...[...pairs.values()].flat()];
 map.roadNames!['v9-chengjing-road']={primaryText:'承景路',secondaryText:'Chengjing Rd.',kind:'urban'};map.roadNames!['v9-wangchuan-road']={primaryText:'望川路',secondaryText:'Wangchuan Rd.',kind:'urban'};
 const move=(r:CityRoad,end:'start'|'end',target:CityPoint)=>{const points=r.centerline,ordered=end==='start'?points:[...points].reverse(),before=ordered.map(p=>({...p})),delta={x:target.x-before[0]!.x,z:target.z-before[0]!.z,y:(target.y??0)-(before[0]!.y??0)};let d=0;const span=polylineLength(points);
  for(let i=0;i<ordered.length;i++){if(i)d+=Math.hypot(before[i]!.x-before[i-1]!.x,before[i]!.z-before[i-1]!.z);const w=Math.max(0,1-d/span);ordered[i]!.x+=delta.x*w;ordered[i]!.z+=delta.z*w;ordered[i]!.y=(before[i]!.y??0)+delta.y*w;}r.centerline=end==='start'?ordered:ordered.reverse();};
 const ports:IntersectionPort[]=['north','east','south','west','extra','extra2'];
 for(const j of map.intersections.filter(j=>j.connections.some(c=>ids.has(c.roadId)))){
  const a=axis(oldRoads.get(j.connections.find(c=>ids.has(c.roadId))!.roadId)!),next=center(j.position,a),arms=j.connections.flatMap(c=>{let d=rotatePoint(portDirection(j,c.port),j.rotation);if(ids.has(c.roadId)){const r=oldRoads.get(c.roadId)!,p=r.centerline[c.end==='start'?0:r.centerline.length-1]!,q=r.centerline[c.end==='start'?1:r.centerline.length-2]!,sign=Math.sign(a==='ew'?q.x-p.x:q.z-p.z);d=a==='ew'?{x:sign,z:0}:{x:0,z:sign};return pairs.get(c.roadId)!.map(r=>({roadId:r.id,end:c.end,d,frontage:true}));}return [{roadId:c.roadId,end:c.end,d,frontage:false}];});
  j.position=next;j.rotation=0;j.type=arms.length===6?'divided_cross':arms.length===5?'irregular':arms.length===3?'t_4lane':'cross_6lane';j.connections=[];j.portAngles={};j.approachOffsets={};delete j.pavementHeights;delete j.pavementFootprint;delete j.approaches;delete j.markingFootprint;j.channelized=false;
  const available=arms.length===3?['north','east','west'] as IntersectionPort[]:ports;
  arms.forEach((arm,i)=>{const port=available[i]!,r=map.roads.find(r=>r.id===arm.roadId)!,p=r.centerline[arm.end==='start'?0:r.centerline.length-1]!,d=arm.d;
   const h=arm.frontage?17.5:a==='ns'?84:54,offset=arm.frontage?(a==='ew'?{x:d.x*h,z:p.z-next.z}:{x:p.x-next.x,z:d.z*h}):{x:d.x*h,z:d.z*h};
   j.portAngles![port]=Math.atan2(d.x,-d.z);j.approachOffsets![port]={...offset,y:0};j.connections.push({roadId:r.id,end:arm.end,port});move(r,arm.end,{x:next.x+offset.x,y:next.y,z:next.z+offset.z});
  });
  j.signals={...j.signals,profile:'lane-countdown',headHeight:7.2};
 }
 const endpoint=(e:RoadEndpoint)=>{const r=map.roads.find(r=>r.id===e.roadId)!;return r.centerline[e.end==='start'?0:r.centerline.length-1]!;},incoming=(e:RoadEndpoint)=>{const r=map.roads.find(r=>r.id===e.roadId)!;return r.travelDirection==='two-way'||(r.travelDirection==='forward')===(e.end==='end');},outgoing=(e:RoadEndpoint)=>{const r=map.roads.find(r=>r.id===e.roadId)!;return r.travelDirection==='two-way'||(r.travelDirection==='forward')===(e.end==='start');};
 map.roadLinks=links.filter(l=>!ids.has(l.from.roadId)&&!ids.has(l.to.roadId));
 for(const l of links.filter(l=>ids.has(l.from.roadId)||ids.has(l.to.roadId))){const options=(e:RoadEndpoint)=>ids.has(e.roadId)?pairs.get(e.roadId)!.map(r=>({roadId:r.id,end:e.end})):[e];
  for(const x of options(l.from))for(const y of options(l.to)){if(!(incoming(x)&&outgoing(y)||incoming(y)&&outgoing(x)))continue;
   if(!ids.has(l.from.roadId))move(map.roads.find(r=>r.id===x.roadId)!,x.end,endpoint(y));else if(!ids.has(l.to.roadId))move(map.roads.find(r=>r.id===y.roadId)!,y.end,endpoint(x));
   const p=endpoint(x),q=endpoint(y);if(Math.hypot(p.x-q.x,p.z-q.z)<.2)map.roadLinks!.push({id:l.id+'-'+x.roadId+'-'+y.roadId,from:x,to:y});
  }
 }
 map.connectionPorts=map.connectionPorts!.filter(p=>!ids.has(p.endpoint.roadId));
 for(const l of map.environment.landmarks??[])l.roadIds=l.roadIds.flatMap(id=>pairs.get(id)?.map(r=>r.id)??[id]);
 for(const r of map.roads){if(r.roadNameId?.startsWith('v8-ew-frontage'))r.roadNameId='v9-chengjing-road';if(r.roadNameId?.startsWith('v8-ns-frontage'))r.roadNameId='v9-wangchuan-road';}
 // The west-side southbound approach joins the west square entrance, staying
 // outside the central interchange's rising north-to-east ramp.
 const entry=map.roads.find(r=>r.id==='v8-ns-frontage-north-entry')!;
 map.roadLinks=map.roadLinks!.filter(l=>!(l.from.roadId===entry.id&&l.from.end==='end'||l.to.roadId===entry.id&&l.to.end==='end'));deleteObject(map,'v8-century-square:entry');
 for(const l of map.environment.landmarks??[])l.roadIds=l.roadIds.map(id=>id==='v8-century-square:entry'?entry.id:id);
 entry.centerline=[entry.centerline[0]!,{x:-75,y:-.024,z:-270},{x:-80,y:-.024,z:-180},{x:-80,y:-.024,z:-70}];finishJunctionsV8(map,true);attachLaneV8(map,entry,'end',r=>r.id==='v8-century-square:entry-2');
 // The eastern pair ends before the expressway descends to its boundary tie-in.
 const east=map.roads.filter(r=>r.roadNameId==='v9-chengjing-road'&&r.id.endsWith('-forward')).sort((a,b)=>b.centerline.at(-1)!.x-a.centerline.at(-1)!.x)[0]!,back=map.roads.find(r=>r.id===east.id.replace(/-forward$/,'-reverse'))!;
 for(const r of [east,back]){move(r,'end',{x:2600,y:-.024,z:r.centerline.at(-1)!.z});for(const p of r.centerline)p.y=-.024;}
 const south=east.centerline.at(-1)!,north=back.centerline.at(-1)!,cap:CityRoad={...structuredClone(east),id:'v9-chengjing-east-turn',travelDirection:'forward',centerline:Array.from({length:17},(_,i)=>{const t=i*Math.PI/16;return {x:2600+34*Math.sin(t),y:-.024,z:(south.z+north.z)/2+(south.z-north.z)/2*Math.cos(t)};})};map.roads.push(cap);connectRoads(map,{roadId:east.id,end:'end'},{roadId:cap.id,end:'start'});connectRoads(map,{roadId:cap.id,end:'end'},{roadId:back.id,end:'end'});
 // Westbound frontage uses the northern edge of the square, with two ordinary
 // yield junctions linking the north entry/exit instead of crossing flyovers.
 const obsolete=new Set(['v8-ew-frontage-west-exit','v8-ew-frontage-east-entry','v8-century-square:exit-2','v8-century-square:entry-4']);for(const id of obsolete)deleteObject(map,id);
 const west=map.roads.find(r=>r.id==='v8-ew-frontage-west-split-split-split-split-reverse')!,eastReverse=map.roads.find(r=>r.id==='v8-ew-frontage-east-reverse')!,bypass:CityRoad={...structuredClone(eastReverse),id:'v9-century-north-road',groupId:'v8-century-square',centerline:[west.centerline.at(-1)!,{x:-210,y:-.024,z:-240},{x:430,y:-.024,z:-240},eastReverse.centerline[0]!]};map.roads.push(bypass);
 for(const l of map.environment.landmarks??[])l.roadIds=l.roadIds.map(id=>obsolete.has(id)?bypass.id:id);
 connectRoads(map,{roadId:west.id,end:'end'},{roadId:bypass.id,end:'start'});connectRoads(map,{roadId:bypass.id,end:'end'},{roadId:eastReverse.id,end:'start'});
 const oldJunctions=new Set(map.intersections.map(j=>j.id));connectUrbanSkeleton(map,[bypass,entry,map.roads.find(r=>r.id==='v8-century-square:exit')!]);const newJunctions=map.intersections.filter(j=>!oldJunctions.has(j.id));for(const j of newJunctions)j.signalized=false;finishJunctionsV8({...map,intersections:newJunctions},true);
}

/** Two on/off pairs per axis, with each ramp merging into its own carriageway. */
export function frontageAccessV9(map:CityMapData):Set<string>{
 const ramps=new Set<string>();
 // Open the southern tunnel approach where the new ramps meet the depressed
 // mainline. The covered central section keeps its original roof and portals.
 for(const id of ['ns-tunnel:northbound','ns-tunnel:southbound']){const r=map.roads.find(r=>r.id===id)!,split=splitRoadAtPoint(map,id,{x:r.centerline[0]!.x,y:-8,z:900});for(const q of [split.before,split.after])if(q.centerline.every(p=>p.z>=900-.01))q.structure!.enclosure!.kind='cutting';}
 const anchors=buildCityRoadNetwork(map).endpointNodes;
 for(const a of ['ew','ns'])for(const sign of [-1,1]){
  const intended=a==='ew'?1370:1250,near=anchors.find(n=>n.ends.some(e=>map.roads.find(r=>r.id===e.roadId)?.roadNameId===(a==='ew'?'v9-chengjing-road':'v9-wangchuan-road'))&&Math.abs((a==='ew'?n.position.x:n.position.z)-intended)<20),station=near?(a==='ew'?near.position.x:near.position.z):intended,name=a==='ew'?'east-west-expressway':'north-south-expressway',center=a==='ew'?{x:station,y:0,z:(laneLandingV8(map,{x:station,z:-150},r=>main(r)&&r.id.startsWith('ew-eb')).z+laneLandingV8(map,{x:station,z:-150},r=>main(r)&&r.id.startsWith('ew-wb')).z)/2}:{x:0,y:0,z:station},rotation=a==='ew'?Math.PI/2:0;
  const match=(r:CityRoad)=>main(r)&&(a==='ew'?r.id.startsWith(sign<0?'ew-eb':'ew-wb'):r.roadNameId===name&&((r.centerline.at(-1)!.z-r.centerline[0]!.z)<0)===(sign>0));
  const stamp=expandPreset('urban_side_access',{groupId:`v9-${a}-${sign}`,position:center,rotation,length:900,mainElevation:a==='ew'?8:0});
  for(const r of stamp.roads.filter(r=>r.id.endsWith('on-'+sign)||r.id.endsWith('off-'+sign))){const on=r.id.includes(':on-'),end=on?'start':'end',frontage=(q:CityRoad)=>q.roadNameId===(a==='ew'?'v9-chengjing-road':'v9-wangchuan-road')&&q.travelDirection===(a==='ew'?(sign<0?'forward':'reverse'):(sign>0?'reverse':'forward'));
   const target=laneLandingV8(map,a==='ew'?{x:station,z:center.z-sign*34}:{x:sign*34,z:station},frontage),path=r.centerline,before=path.map(p=>({...p})),L=polylineLength(path),old=path[end==='start'?0:path.length-1]!,delta={x:target.x-old.x,y:(target.y??0)-(old.y??0),z:target.z-old.z};let d=0;
   for(let i=0;i<path.length;i++){if(i)d+=Math.hypot(before[i]!.x-before[i-1]!.x,before[i]!.z-before[i-1]!.z);const w=1-ease((end==='start'?d:L-d)/160);path[i]!.x+=delta.x*w;path[i]!.z+=delta.z*w;path[i]!.y=(before[i]!.y??0)+delta.y*w;}
   Object.assign(path[end==='start'?0:path.length-1]!,target);r.type='ramp_1';r.roadNameId=name;r.groupId='v9-frontage-access';r.structure={...r.structure,piersEnabled:true};map.roads.push(r);ramps.add(r.id);
   const mainEnd=path[on?path.length-1:0]!,projected=laneLandingV8(map,mainEnd,match),existing=map.roads.filter(match).flatMap(q=>[q.centerline[0]!,q.centerline.at(-1)!]).find(p=>Math.hypot(p.x-projected.x,p.z-projected.z)<1);if(existing)Object.assign(mainEnd,existing);
   attachLaneV8(map,r,on?'end':'start',match);
   const length=polylineLength(path),sy=path[0]!.y??0,ey=path.at(-1)!.y??0;let profileStation=0;for(let i=0;i<path.length;i++){if(i)profileStation+=Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z);path[i]!.y=sy+(ey-sy)*ease((profileStation-25)/(length-50));}
   for(const e of attachV62Endpoint(map,target,frontage).filter(e=>e.end===((sign<0)===on?'end':'start')))connectRoads(map,on?e:{roadId:r.id,end},on?{roadId:r.id,end}:e);
  }
 }
 return ramps;
}
