import type {CityMapData,CityRoad,CityPoint} from '../CityMapData';
import {expandPreset} from '../presets/InfrastructurePresets';
import {connectRoads,detachRoadEndpoint} from '../MapAPI';
import {polylineLength,rotatePoint,sampleAt} from '../geometry';
import {bezierPoints,ease} from '../presets/BackbonePresets';
import {streetV8,groundV8,connectStreetV8,retireV8,attachLaneV8,laneLandingV8} from './CityMainV8Roads';
const mainline=(r:CityRoad)=>r.laneCount===3&&!r.gore&&!r.highwayTransition;
export function compactSoutheastV8(map:CityMapData):void{
 // Retain the two outward right turns. The other directions use the ring,
 // eliminating the cloverleaf loops and unused motorway tail inside the city.
 retireV8(map,r=>r.groupId==='peripheral-interchange'&&r.id.endsWith('-loop'));
 const ramps=map.roads.filter(r=>r.groupId==='peripheral-interchange'),landing=Math.min(...ramps.flatMap(r=>[r.centerline[0]!,r.centerline.at(-1)!]).filter(p=>p.x>2800).map(p=>p.x));
 retireV8(map,r=>r.id.startsWith('intercity-')&&Math.min(...r.centerline.map(p=>p.x))<landing-20);
 map.environment.metadata={...map.environment.metadata,v8Southeast:'Two outside directional ramps; ring provides the remaining movements. No inward cloverleaf loops or blind motorway tail.'};
}
export function retireAccessV8(map:CityMapData):void{
 retireV8(map,r=>r.groupId==='diamond-west'||r.groupId==='diamond-east'&&(!!r.gore||r.type==='ramp_1')||r.groupId?.startsWith('direct-')===true||r.groupId==='v6-campus-access'||r.id.startsWith('urban-direct-')||r.id.startsWith('v61-ew-')||r.id.startsWith('v61-ns-')||r.id.startsWith('v62-qinghe-')||r.id.startsWith('v62-nancheng-'));
 for(const r of map.roads.filter(r=>r.groupId==='diamond-east')){r.roadNameId='v8-jinhua-street';r.roadClass='arterial';}map.roadNames!['v8-jinhua-street']={primaryText:'锦华大街',secondaryText:'Jinhua St.',kind:'urban'};
 const spine=['diamond-east:west-local','diamond-east:local-link','diamond-east:east-local'].map(id=>map.roads.find(r=>r.id===id)!);
 const kept=spine[0]!,removed=new Set(spine.slice(1).map(r=>r.id));kept.centerline=spine.flatMap((r,i)=>i?r.centerline.slice(1):r.centerline);
 // The removed ramps no longer need a raised local landing. Keep the two
 // external ends and ease just this former landing into the ground street.
 const L=polylineLength(kept.centerline),startY=kept.centerline[0]!.y??0,endY=kept.centerline.at(-1)!.y??0;let d=0;
 for(let i=0;i<kept.centerline.length;i++){if(i)d+=Math.hypot(kept.centerline[i]!.x-kept.centerline[i-1]!.x,kept.centerline[i]!.z-kept.centerline[i-1]!.z);kept.centerline[i]!.y=Math.max(0,startY-.04*d,endY-.04*(L-d));}
 for(const l of map.roadLinks!){for(const e of [l.from,l.to])if(e.roadId===spine[2]!.id&&e.end==='end')e.roadId=kept.id;}
 map.roadLinks=map.roadLinks!.filter(l=>!removed.has(l.from.roadId)&&!removed.has(l.to.roadId)&&l.from.roadId!==l.to.roadId);
 for(const p of map.connectionPorts!)if(p.endpoint.roadId===spine[2]!.id&&p.endpoint.end==='end')p.endpoint.roadId=kept.id;
 map.connectionPorts=map.connectionPorts!.filter(p=>!removed.has(p.endpoint.roadId));map.roads=map.roads.filter(r=>!removed.has(r.id));
 // The port boulevard is an ordinary street, not another expressway system.
 retireV8(map,r=>r.groupId==='east-main-aux'||r.roadNameId==='v6-port-frontage'||r.id.startsWith('urban-east-frontage-access'));
 retireV8(map,r=>['v4-access-6','v4-access-7','v4-access-8','v6-west-station-access'].includes(r.id));
 // Replace the former diamond's residual local spine as one ordinary street;
 // keeping its disconnected fragments would duplicate the new civic boundary road.
 retireV8(map,r=>r.id.startsWith('urban-diamond-west')||/^v4-access-(9|13|14)(-|$)/.test(r.id));
}
export function plazaClearanceV8(map:CityMapData):void{
 const r=map.roads.find(r=>r.id==='system-central:W-to-S-right')!;
 detachRoadEndpoint(map,{roadId:r.id,end:'start'});let station=0;const original=r.centerline.map(p=>({...p}));
 for(let i=0;i<r.centerline.length;i++){if(i)station+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);r.centerline[i]!.x-=60*(1-ease(station/220));}
 attachLaneV8(map,r,'start',q=>mainline(q)&&q.roadNameId==='east-west-expressway'&&q.id.startsWith('ew-eb'));
}
export function frontagesV8(map:CityMapData):void{
 const center={x:110,y:-.024,z:-75},plaza=expandPreset('roundabout',{groupId:'v8-century-square',position:center,rampRadius:100,rampLaneCount:1});
 for(const r of plaza.roads){r.roadNameId='v8-century-square';r.displayName='';r.district='jincheng';r.speedLimit=25;r.streetlights=false;r.structure={barrierEnabled:false,piersEnabled:false,barrierOffset:0};r.shoulders={left:0,right:0};r.decorationProfile='collector';}
 map.roads.push(...plaza.roads);map.roadLinks!.push(...plaza.roadLinks);
 map.roadNames!['v8-century-square']={primaryText:'新世纪广场',secondaryText:'New Century Square',kind:'urban'};
 const branches=[
  {id:'v8-ew-frontage-west',name:'东西快速辅路',a:groundV8(-2000,-75),b:groundV8(-210,-75),direction:'West',end:'end' as const},
  {id:'v8-ew-frontage-east',name:'东西快速辅路',a:groundV8(430,-75),b:groundV8(2850,-75),direction:'East',end:'start' as const},
  {id:'v8-ns-frontage-north',name:'南北快速辅路',a:groundV8(110,-3100),b:groundV8(110,-395),direction:'North',end:'end' as const},
  {id:'v8-ns-frontage-south',name:'南北快速辅路',a:groundV8(110,245),b:groundV8(110,2850),direction:'South',end:'start' as const},
 ];
 for(const branch of branches){
  const r=streetV8(map,branch.id,branch.name,[branch.a,branch.b],4,branch.direction==='West'?'qinghe':'jincheng');r.groupId='v8-frontages';
  const fork=branch.end==='start'?branch.a:branch.b;
  for(const input of [true,false]){
   const port=plaza.connectionPorts.find(p=>p.label===branch.direction+(input?' In':' Out'))!,road=map.roads.find(r=>r.id===port.endpoint.roadId)!,at=road.centerline[port.endpoint.end==='start'?0:road.centerline.length-1]!,near=road.centerline[port.endpoint.end==='start'?1:road.centerline.length-2]!,distance=Math.hypot(at.x-near.x,at.z-near.z),t={x:(at.x-near.x)/distance,z:(at.z-near.z)/distance};
   const path=input?bezierPoints(fork,{...fork,x:fork.x+(at.x-fork.x)*.5,z:fork.z+(at.z-fork.z)*.5},{...at,x:at.x+t.x*25,z:at.z+t.z*25},at):bezierPoints(at,{...at,x:at.x+t.x*25,z:at.z+t.z*25},{...fork,x:fork.x+(at.x-fork.x)*.5,z:fork.z+(at.z-fork.z)*.5},fork);
   const connector:CityRoad={...road,id:branch.id+(input?'-entry':'-exit'),centerline:path,groupId:'v8-century-square',gore:undefined};map.roads.push(connector);
   connectRoads(map,input?{roadId:r.id,end:branch.end}:{roadId:road.id,end:port.endpoint.end},input?{roadId:connector.id,end:'start'}:{roadId:connector.id,end:'start'});
   connectRoads(map,{roadId:connector.id,end:'end'},input?{roadId:road.id,end:port.endpoint.end}:{roadId:r.id,end:branch.end});
  }
  connectStreetV8(map,r);
 }
 map.objects.push({id:'v8-century-plaza',prefabId:'hardscape',position:groundV8(110,-75,-.02),rotation:0,scale:{x:3.5,y:1,z:3.5},groupId:'v8-century-square',district:'jincheng'},
 {id:'v8-century-garden',prefabId:'green_strip',position:groundV8(110,-75,.02),rotation:0,scale:{x:4.5,y:1,z:5},groupId:'v8-century-square',district:'jincheng'});
 for(let i=0;i<12;i++){const a=i*Math.PI/6;map.objects.push({id:'v8-century-tree-'+i,prefabId:'tree',position:groundV8(110+72*Math.cos(a),-75+60*Math.sin(a),0),rotation:0,groupId:'v8-century-square',district:'jincheng'});}
 map.environment.landmarks!.push({id:'new-century-square',name:'新世纪广场',position:center,roadIds:plaza.roads.map(r=>r.id)});
 const port=streetV8(map,'v8-tonggang-avenue','通港大道',[groundV8(400,1220),groundV8(1200,1250),groundV8(2100,1260),groundV8(3250,1370)],4,'tonggang');connectStreetV8(map,port);
}
/** Selected production side-access movements, away from the central plaza. */
export function localExpresswayAccessV8(map:CityMapData):void{
 for(const config of [{axis:'ew',group:'v8-ew-access',on:true,intended:1350,span:60,frontage:'v8-ew-frontage-east'},{axis:'ew',group:'v8-ew-access',on:false,intended:1350,span:60,frontage:'v8-ew-frontage-east'},{axis:'ns',group:'v8-ns-access',on:false,intended:-1760,span:0,frontage:'v8-ns-frontage-north'}]){
  const axis=config.axis,eastWest=axis==='ew',name=eastWest?'east-west-expressway':'north-south-expressway',sign=eastWest?-1:1,rotation=eastWest?Math.PI/2:0;
  const intended=config.intended,frontage=config.frontage;
  let chosen=intended,best=-Infinity;
  for(let offset=-config.span;offset<=config.span;offset+=20){const station=intended+offset,p=eastWest?groundV8(station,-75):groundV8(110,station),distance=Math.min(...map.intersections.filter(j=>j.connections.some(c=>map.roads.find(r=>r.id===c.roadId)!.roadNameId===frontage)).map(j=>Math.hypot(j.position.x-p.x,j.position.z-p.z)));if(distance>best){best=distance;chosen=station;}}
  const eb=laneLandingV8(map,{x:chosen,z:-150},r=>mainline(r)&&r.id.startsWith('ew-eb')),wb=laneLandingV8(map,{x:chosen,z:-150},r=>mainline(r)&&r.id.startsWith('ew-wb')),center=eastWest?{x:chosen,y:0,z:(eb.z+wb.z)/2}:{x:0,y:0,z:chosen},height=(offset:number)=>laneLandingV8(map,eastWest?{x:center.x+offset,z:center.z}:{x:center.x,z:center.z+offset},r=>mainline(r)&&r.roadNameId===name).y??0;
  const stamp=expandPreset('urban_side_access',{groupId:config.group,position:center,rotation,length:900,mainElevation:eastWest?8:0,mainProfile:Array.from({length:181},(_,i)=>({offset:-900+i*10,height:height(-900+i*10)})),profileInterpolation:'linear'});
  const selected=stamp.roads.filter(r=>r.id.endsWith((config.on?'on-':'off-')+sign));
  for(const r of selected){
   const terminal=eastWest?groundV8(center.x,-75):groundV8(110,center.z),on=r.id.includes(':on-'),end=on?'start':'end',path=r.centerline,original=path.map(p=>({...p})),old=original[end==='start'?0:original.length-1]!,length=polylineLength(path);let d=0;
   for(let i=0;i<path.length;i++){if(i)d+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);const w=1-ease((end==='start'?d:length-d)/200);path[i]!.x+=(terminal.x-old.x)*w;path[i]!.z+=(terminal.z-old.z)*w;path[i]!.y=(path[i]!.y??0)+((terminal.y??0)-(old.y??0))*w;}
   if(!eastWest&&!on){const before=path.map(p=>({...p}));let station=0;for(let i=0;i<path.length;i++){if(i)station+=Math.hypot(before[i]!.x-before[i-1]!.x,before[i]!.z-before[i-1]!.z);path[i]!.z+=40*(1-ease(station/220));}}
   r.roadNameId=name;r.type='ramp_1';r.district=eastWest?'xixing':'nancheng';map.roads.push(r);
   attachLaneV8(map,r,on?'end':'start',q=>mainline(q)&&q.roadNameId===name&&q.id.startsWith(eastWest?'ew-eb':'ns-nb'));
   const family=map.roads.filter(q=>q.roadNameId===frontage),near=laneLandingV8(map,terminal,q=>family.includes(q));Object.assign(path[end==='start'?0:path.length-1]!,near);
   // A single unsignalized merge node on the continuous two-way frontage.
   const road=family.find(q=>q.centerline.some(p=>Math.hypot(p.x-near.x,p.z-near.z)<.1));void road;
   const {attachV62Endpoint}=accessHelpers;
   const peers=attachV62Endpoint(map,near,q=>q.roadNameId===frontage);
   for(const e of peers)if(e.end===(on?'end':'start'))connectRoads(map,on?e:{roadId:r.id,end},on?{roadId:r.id,end}:e);
  }
  map.environment.metadata={...map.environment.metadata,[config.group+'Station']:String(chosen),[config.group+'JunctionDistance']:String(best)};
 }
}
import * as accessHelpers from './CityMainV62Access';
/** Ring exits feed one perpendicular under-bridge connector, then the city street. */
export function ringAccessV8(map:CityMapData):void{
 // Existing west/south ring sections are at grade. Give the two new
 // perpendicular streets an actual bridge, with five-percent mainline slopes.
 for(const center of [groundV8(-1975,900),groundV8(1050,2368)])for(const r of map.roads.filter(r=>mainline(r)&&r.roadNameId==='ring-expressway')){
  for(const p of r.centerline)p.y=Math.max(p.y??0,8-.05*Math.max(0,Math.hypot(p.x-center.x,p.z-center.z)-50));
  r.elevationMode='custom';delete r.elevation;
 }
 const ring=map.roads.filter(r=>mainline(r)&&r.roadNameId==='ring-expressway'),ordered=[ring.find(r=>r.id==='ring-cw-0')!];
 while(Math.hypot(ordered.at(-1)!.centerline.at(-1)!.x-ordered[0]!.centerline[0]!.x,ordered.at(-1)!.centerline.at(-1)!.z-ordered[0]!.centerline[0]!.z)>.1){const p=ordered.at(-1)!.centerline.at(-1)!;ordered.push(ring.find(r=>!ordered.includes(r)&&Math.hypot(r.centerline[0]!.x-p.x,r.centerline[0]!.z-p.z)<.1)!);}
 const path=ordered.flatMap((r,i)=>i?r.centerline.slice(1):r.centerline),length=polylineLength(path),clockwiseIds=new Set(ordered.map(r=>r.id)),frame=(station:number)=>sampleAt(path,(station%length+length)%length);
 const stationAt=(p:CityPoint)=>{let best=Infinity,result=0,station=0;for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(L*L))),d=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);if(d<best){best=d;result=station+t*L;}station+=L;}return result;};
 for(const item of [
  {id:'west',center:groundV8(-1995,900),rotation:0,sign:1,name:'西环桥下路',end:groundV8(-1730,900)},
  {id:'north',center:groundV8(1250,-1770),rotation:Math.PI/2,sign:-1,name:'北环桥下路',end:groundV8(1250,-1260)},
  {id:'south',center:groundV8(1050,2260),rotation:Math.PI/2,sign:1,name:'南环桥下路',end:groundV8(1050,1950)},
 ]){
  const clockwise=(r:CityRoad)=>clockwiseIds.has(r.id)||[...clockwiseIds].some(id=>r.id.startsWith(id+'-split')),station=stationAt(item.center),at=frame(station),center=at.point,stamp=expandPreset('urban_side_access',{groupId:'v8-ring-'+item.id,position:{...center,y:0},rotation:item.rotation,length:1100,mainElevation:center.y??8,mainProfile:Array.from({length:121},(_,i)=>({offset:-600+i*10,height:frame(station-item.sign*(-600+i*10)).point.y??0})),profileInterpolation:'linear'}),selected=stamp.roads.filter(r=>r.id.endsWith('on-'+item.sign)||r.id.endsWith('off-'+item.sign));
  for(const r of selected)r.centerline=r.centerline.map(p=>{const local=rotatePoint({x:p.x-center.x,z:p.z-center.z},-item.rotation),f=frame(station-item.sign*local.z),side=item.sign*local.x-8.125;return {x:f.point.x-f.tangent.z*side,y:p.y,z:f.point.z+f.tangent.x*side};});
  const terminal=groundV8(center.x-at.tangent.z*30,center.z+at.tangent.x*30),crossStart=groundV8(center.x+at.tangent.z*95,center.z-at.tangent.x*95);
  const street=streetV8(map,'v8-ring-'+item.id+'-cross',item.name,[crossStart,terminal,item.end],2,item.id==='west'?'xixing':item.id==='north'?'xinghu':'tonggang');connectStreetV8(map,street);
  for(const r of selected){r.roadNameId='ring-expressway';r.type='ramp_1';map.roads.push(r);const on=r.id.includes(':on-'),end=on?'start':'end';Object.assign(r.centerline[end==='start'?0:r.centerline.length-1]!,terminal);attachLaneV8(map,r,on?'end':'start',clockwise);
   for(const e of accessHelpers.attachV62Endpoint(map,terminal,q=>q.roadNameId===street.roadNameId).filter(e=>e.end===(on?'end':'start')))connectRoads(map,on?e:{roadId:r.id,end},on?{roadId:r.id,end}:e);
  }
 }
}
