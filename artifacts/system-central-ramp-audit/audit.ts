// Read-only, targeted diagnostic. Run: node artifacts/system-central-ramp-audit/run.mjs
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {roadPoints,roadEdges,sampleAt,polylineLength} from '../../src/world/city/geometry';
import {buildCityRoadNetwork} from '../../src/world/city/CityRoadNetwork';
import {roadEdgeChains} from '../../src/world/city/RoadEdgeChain';
import {makePavementSegments,clipPavementFootprints} from '../../src/editor/ElevationSeams';
import {rampProfile} from '../../src/editor/RampProfileAudit';
import {project,bounds,EditorSpatialIndex} from '../../src/editor/EditorGeometry';
import {CityGround} from '../../src/world/city/CityGround';
import {SectorManager} from '../../src/world/city/SectorManager';
import {VehicleDynamics} from '../../src/vehicle/physics/VehicleDynamics';
import {VehicleContactSystem} from '../../src/vehicle/physics/VehicleContactSystem';
import {createRoadSUVPhysicsConfig} from '../../src/vehicle/config/roadSUVPhysicsConfig';
import {createNeutralVehicleInputState} from '../../src/input/VehicleInputState';
import {WHEEL_IDS} from '../../src/vehicle/physics/WheelContact';
import {roadPavementTriangle} from '../../src/world/city/RoadPavementSurface';
const dir='artifacts/system-central-ramp-audit/',source='src/world/regional/regional-main.json',raw=fs.readFileSync(source,'utf8'),map=JSON.parse(raw),hash=createHash('sha256').update(raw).digest('hex');
const write=(name:string,value:any)=>fs.writeFileSync(dir+name,JSON.stringify(value,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v,2)+'\n');
const roads=new Map<string,any>(map.roads.map((r:any)=>[r.id,r])),seeds:any[]=map.roads.filter((r:any)=>r.groupId==='system-central'||r.id.startsWith('system-central:'));
const seedIds=new Set(seeds.map(r=>r.id)),network=buildCityRoadNetwork(map),connections=network.routing!.connections;
const pathCache=new Map<string,any[]>(),path=(r:any)=>{let p=pathCache.get(r.id);if(!p){p=roadPoints(r);pathCache.set(r.id,p);}return p;};
const length=(r:any)=>polylineLength(path(r)),point=(e:any)=>path(roads.get(e.roadId))[e.end==='start'?0:path(roads.get(e.roadId)).length-1];
const dist=(a:any,b:any)=>Math.hypot(a.x-b.x,a.z-b.z),angle=(a:any,b:any)=>Math.acos(Math.max(-1,Math.min(1,a.x*b.x+a.z*b.z)))*180/Math.PI;
const at=(r:any,s:number,offset=0)=>{const a=sampleAt(path(r),Math.max(0,Math.min(length(r),s)));return {point:{x:a.point.x-a.tangent.z*offset,y:a.point.y,z:a.point.z+a.tangent.x*offset},tangent:a.tangent};};
const mainFamily=(id:string)=>id.startsWith('ew-eb')?'ew-eb':id.startsWith('ew-wb')?'ew-wb':id.startsWith('ns-nb')||id.startsWith('ns-tunnel:northbound')?'ns-nb':id.startsWith('ns-sb')||id.startsWith('ns-tunnel:southbound')?'ns-sb':null;
const area=bounds(seeds.flatMap(path),60),inArea=(r:any)=>{const b=bounds(path(r),Math.max(-roadEdges(r).left,roadEdges(r).right));return b.minX<=area.maxX&&b.maxX>=area.minX&&b.minZ<=area.maxZ&&b.maxZ>=area.minZ;};
const ids=new Set<string>(seeds.map(r=>r.id));
// Scope mainline children spatially, then take full endpoint clusters and explicit transition references.
for(const r of map.roads)if(mainFamily(r.id)&&inArea(r))ids.add(r.id);
for(const n of network.endpointNodes)if(n.ends.some(e=>seedIds.has(e.roadId)))for(const e of n.ends)ids.add(e.roadId);
let changed=true;while(changed){changed=false;for(const r of map.roads)if(r.highwayTransition&&[r.id,r.highwayTransition.mainRoadId,r.highwayTransition.decisionId].some(id=>ids.has(id))&&!ids.has(r.id)){ids.add(r.id);changed=true;}}
const scoped=map.roads.filter((r:any)=>ids.has(r.id)),contextIds=new Set(ids);
for(const r of map.roads)if(inArea(r))contextIds.add(r.id);
// One nonrecursive fringe preserves matching cross-section frames at scope boundaries.
for(const n of network.endpointNodes)if(n.ends.some(e=>ids.has(e.roadId)))for(const e of n.ends)contextIds.add(e.roadId);
const local={...map,roads:map.roads.filter((r:any)=>contextIds.has(r.id)),roadLinks:map.roadLinks.filter((l:any)=>contextIds.has(l.from.roadId)&&contextIds.has(l.to.roadId)),intersections:map.intersections.filter((j:any)=>j.connections.every((e:any)=>contextIds.has(e.roadId)))};
const chains=roadEdgeChains(local),segments=makePavementSegments(local),byRoad=new Map<string,any[]>();
const supportIndex=new EditorSpatialIndex(24);
segments.forEach((s,i)=>supportIndex.set(String(i),s.box));
for(const s of segments){const list=byRoad.get(s.road.id)??[];list.push(s);byRoad.set(s.road.id,list);}
const visual=new Map<string,any[]>();
for(const r of local.roads){const edges=roadEdges(r),a=chains.edge(r,edges.left),b=chains.edge(r,edges.right),planes:any[]=[];for(let i=1;i<a.length;i++)for(const tri of [[a[i-1],b[i-1],a[i]],[b[i-1],b[i],a[i]]]){if(Math.abs((tri[1].x-tri[0].x)*(tri[2].z-tri[0].z)-(tri[1].z-tri[0].z)*(tri[2].x-tri[0].x))>1e-8)planes.push(roadPavementTriangle(tri[0],tri[1],tri[2],1));}visual.set(r.id,planes);}
const supportAt=(p:any)=>supportIndex.query({minX:p.x-.001,maxX:p.x+.001,minZ:p.z-.001,maxZ:p.z+.001}).map(i=>segments[Number(i)]).filter(s=>s.surface.contains(0)(p.x,p.z));
function samplesAt(r:any,s:number,offset:number){const a=at(r,s,offset);return {s,offset,...a.point,candidates:supportAt(a.point).map(v=>({roadId:v.road.id,height:v.surface.heightAt(a.point.x,a.point.z),segment:v.index,deltaY:v.surface.heightAt(a.point.x,a.point.z)-a.point.y!})),visual:local.roads.flatMap((q:any)=>(visual.get(q.id)??[]).filter(v=>v.contains(0)(a.point.x,a.point.z)).map(v=>({roadId:q.id,height:v.heightAt(a.point.x,a.point.z)})))};}
function endpointGrade(r:any,end:string,d:number){const l=length(r),a=end==='start'?0:Math.max(0,l-d),b=end==='start'?Math.min(l,d):l;return (at(r,b).point.y!-at(r,a).point.y!)/(b-a);}
function interfaceRow(r:any,end:'start'|'end'){
 const links=map.roadLinks.filter((l:any)=>[l.from,l.to].some(e=>e.roadId===r.id&&e.end===end));
 const node=network.endpointNodes.find(n=>n.ends.some(e=>e.roadId===r.id&&e.end===end));
 const ends=node?.ends.filter(e=>e.roadId!==r.id)??[];
 const direct=links.map((l:any)=>l.from.roadId===r.id?l.to:l.from),hostEnd=direct.find((e:any)=>mainFamily(e.roadId))??direct[0],host=hostEnd?roads.get(hostEnd.roadId):undefined;
 if(!host)return {rampId:r.id,end,links,ends,topologyConnected:false,error:'missing host'};
 const p=point({roadId:r.id,end}),q=point(hostEnd),rp=path(r),hp=path(host),u=end==='start'?at(r,0).tangent:at(r,length(r)).tangent,v=hostEnd.end==='end'?at(host,length(host)).tangent:at(host,0).tangent;
 const routes=end==='start'?connections.filter(c=>c.toRoadId===r.id&&c.toEnd===end):connections.filter(c=>c.fromRoadId===r.id&&c.fromEnd===end);
 const hostRoutes=routes.filter(c=>end==='start'?ends.some(e=>e.roadId===c.fromRoadId):ends.some(e=>e.roadId===c.toRoadId));
 const stations=[0,.1,.25,.5,1,2,3,5,10,20,30,40,50],traces=[{name:'center',offset:0},{name:'left-wheel',offset:-.835},{name:'right-wheel',offset:.835},{name:'lane-left',offset:-r.laneWidth/2},{name:'lane-right',offset:r.laneWidth/2},{name:'pavement-left',offset:roadEdges(r).left},{name:'pavement-right',offset:roadEdges(r).right}];
 const probes=traces.map(t=>({trace:t.name,offset:t.offset,samples:stations.map(d=>samplesAt(r,end==='start'?d:length(r)-d,t.offset))}));
 const overlaps:any[]=[];for(const a of byRoad.get(r.id)??[]){if(end==='start'?a.start>60:a.start+a.length<length(r)-60)continue;for(const e of ends){if(seedIds.has(e.roadId))continue;for(const b of byRoad.get(e.roadId)??[]){if(a.box.minX>b.box.maxX||a.box.maxX<b.box.minX||a.box.minZ>b.box.maxZ||a.box.maxZ<b.box.minZ)continue;const poly=clipPavementFootprints(a.polygon,b.polygon);if(poly.length<3)continue;const ar=Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.x*q.z-q.x*p.z;},0))/2;if(ar<1e-5)continue;const ds=poly.map(p=>a.surface.heightAt(p.x,p.z)-b.surface.heightAt(p.x,p.z));overlaps.push({hostId:e.roadId,rampSegment:a.index,mainSegment:b.index,area:ar,minDeltaY:Math.min(...ds),maxDeltaY:Math.max(...ds),polygon:poly,station:a.start});}}}
 const crossGap=(offset:number)=>{const own=chains.edge(r,offset)[end==='start'?0:rp.length-1],edgeA=chains.edge(host,-host.laneCount*host.laneWidth/2)[hostEnd.end==='start'?0:hp.length-1],edgeB=chains.edge(host,host.laneCount*host.laneWidth/2)[hostEnd.end==='start'?0:hp.length-1];return project([edgeA,edgeB],own).distance;};
 const pavementGap=(offset:number)=>{const own=chains.edge(r,offset)[end==='start'?0:rp.length-1],e=roadEdges(host),a=chains.edge(host,e.left)[hostEnd.end==='start'?0:hp.length-1],b=chains.edge(host,e.right)[hostEnd.end==='start'?0:hp.length-1];return project([a,b],own).distance;};
 return {rampId:r.id,end,kind:end==='start'?'exit/split':'entry/merge',linkIds:links.map((l:any)=>l.id),hostEndpoint:hostEnd,endpointCluster:ends,mainlinePoint:q,rampPoint:p,xzGap:dist(p,q),deltaY:p.y!-q.y!,tangentAngleDegrees:angle(u,v),laneEdgeGap:Math.max(crossGap(-r.laneWidth/2),crossGap(r.laneWidth/2)),pavementEdgeGap:Math.max(pavementGap(roadEdges(r).left),pavementGap(roadEdges(r).right)),topologyConnected:hostRoutes.length>0,routingEdges:hostRoutes,laneConnections:network.laneConnections.filter(c=>c.fromLaneId.startsWith(r.id+':')||c.toLaneId.startsWith(r.id+':')),connectionPorts:map.connectionPorts.filter((p:any)=>p.endpoint.roadId===r.id||ends.some(e=>e.roadId===p.endpoint.roadId)),grades:[5,10,20,40].map(d=>({distance:d,ramp:endpointGrade(r,end,d),host:endpointGrade(host,hostEnd.end,d),break:Math.abs(endpointGrade(r,end,d)-endpointGrade(host,hostEnd.end,d))})),verticalTangentBreak:Math.abs(u.y!-v.y!),probes,overlaps,overlapSummary:{area:overlaps.reduce((s,o)=>s+o.area,0),maxHeightConflict:Math.max(0,...overlaps.map(o=>Math.max(Math.abs(o.minDeltaY),Math.abs(o.maxDeltaY)))),stationMin:overlaps.length?Math.min(...overlaps.map(o=>o.station)):null,stationMax:overlaps.length?Math.max(...overlaps.map(o=>o.station)):null}};
}
const interfaces=seeds.flatMap(r=>[interfaceRow(r,'start'),interfaceRow(r,'end')]);
console.log(JSON.stringify({phase:'static',ramps:seeds.length,scopedRoads:scoped.length,contextRoads:local.roads.length,interfaces:interfaces.map((r:any)=>({r:r.rampId,e:r.end,gap:r.xzGap,dy:r.deltaY,angle:r.tangentAngleDegrees,break:r.verticalTangentBreak,overlap:r.overlapSummary?.maxHeightConflict}))}));
write('connection-audit.json',{source,hash,area,interfaces:interfaces.map(({probes,overlaps,...r}:any)=>r),scopedLinks:map.roadLinks.filter((l:any)=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),targetedNavigation:{passed:interfaces.every((i:any)=>i.topologyConnected),edgesChecked:interfaces.length}});
write('elevation-audit.json',{source,hash,interfaces:interfaces.map((r:any)=>({rampId:r.rampId,end:r.end,mainlineSurfaceY:r.mainlinePoint?.y,rampSurfaceY:r.rampPoint?.y,deltaY:r.deltaY,grades:r.grades,verticalTangentBreak:r.verticalTangentBreak,overlapSummary:r.overlapSummary})),profiles:seeds.map(rampProfile)});
write('pavement-support-audit.json',{source,hash,method:'Exact RoadEdgeChain visual triangles (without +0.024m rendering offset) and runtime RoadPavementSurface/triangle footprints; samples are geometry probes, not forced vehicle positions.',interfaces:interfaces.map((r:any)=>({rampId:r.rampId,end:r.end,probes:r.probes,overlaps:r.overlaps,summary:r.overlapSummary}))});
const inventory={source,hash,mapVersion:map.version,area,rampCount:seeds.length,ramps:seeds.map(r=>({id:r.id,from:interfaces.find((i:any)=>i.rampId===r.id&&i.end==='start')?.hostEndpoint,to:interfaces.find((i:any)=>i.rampId===r.id&&i.end==='end')?.hostEndpoint,kind:r.id.endsWith('-semi')?'semi-direct':'right-turn',length:length(r),metadataParents:map.editing.corridors.filter((c:any)=>c.roadIds.includes(r.id)).map((c:any)=>c.id)})),mainlines:['ew-eb','ew-wb','ns-nb','ns-sb'].map(f=>({family:f,children:scoped.filter((r:any)=>mainFamily(r.id)===f).map((r:any)=>({id:r.id,start:path(r)[0],end:path(r).at(-1),lanes:r.laneCount,transition:r.highwayTransition??null}))})),derivedRoads:scoped.filter((r:any)=>!seedIds.has(r.id)).map((r:any)=>({id:r.id,family:mainFamily(r.id),highwayTransition:r.highwayTransition??null,links:map.roadLinks.filter((l:any)=>l.from.roadId===r.id||l.to.roadId===r.id)})),nearbySurfaceRoads:map.roads.filter((r:any)=>!contextIds.has(r.id)&&inArea(r)).map((r:any)=>({id:r.id,groupId:r.groupId,roadClass:r.roadClass,topologyToCentral:map.roadLinks.filter((l:any)=>(l.from.roadId===r.id&&ids.has(l.to.roadId))||(l.to.roadId===r.id&&ids.has(l.from.roadId)))})),transitions:scoped.filter((r:any)=>r.highwayTransition).map((r:any)=>({id:r.id,...r.highwayTransition})),notes:'Parent families are inferred from authored IDs only for reporting. No acceleration/deceleration road is invented when highwayTransition metadata is absent. Fringe roads are context only; other interchanges are not audited.'};
write('ramp-inventory.json',inventory);
// Full ramp bodies are geometry-only probes; intentional unlinked over/underpasses
// are kept as crossings and never promoted into routing edges.
const bodyRows=seeds.map(r=>{const p=rampProfile(r),samples:any[]=[];for(let s=0;s<=length(r);s+=2)for(const offset of [-r.laneWidth/2,-.835,0,.835,r.laneWidth/2]){const a=at(r,s,offset).point,candidates=supportAt(a).map(v=>({roadId:v.road.id,y:v.surface.heightAt(a.x,a.z),segment:v.index})),own=candidates.filter(c=>c.roadId===r.id),near=candidates.filter(c=>c.roadId!==r.id&&Math.abs(c.y-a.y!)<5.5);if(!own.length||near.some(c=>Math.abs(c.y-a.y!)>.04))samples.push({station:s,offset,point:a,ownSupport:own.length,candidates:near});}return {rampId:r.id,length:length(r),sampleStep:2,shortSegments:p.segments.filter(s=>s.length<1),gradeBreaks:p.breaks.filter(b=>b.gradeBreak>=.04),sharpNodes:p.breaks.filter(b=>b.radius!==null&&b.radius<35),maxGrade:p.maxGrade,minRadius:p.minRadius,samples};});
write('ramp-body-geometry.json',{source,hash,rows:bodyRows});

// Omit graphics publication only. CityGround support construction, all four wheel
// selection, suspension, chassis integration, road barriers and object colliders are unchanged.
SectorManager.prototype.prepareSteps=function*(){};
SectorManager.prototype.updatePosition=()=>false;
(SectorManager.prototype as any).initialize=function*(){};
function replay(r:any,end:'start'|'end',iface:any){
 const host=roads.get(iface.hostEndpoint.roadId),cluster=iface.endpointCluster.filter((e:any)=>mainFamily(e.roadId));
 const incoming=end==='start'?host:r,outgoing=end==='start'?r:host;
 // Normal outer traffic lane approaches the centerline-attached ramp over 40m.
 // This is an explicit intended lane-change path, never a pose/height constraint.
 const inLength=length(incoming),outLength=length(outgoing),route:any[]=[];
 const laneOffset=(q:any)=>q.laneCount>1?(q.laneCount-1)*q.laneWidth/2:0;
 for(let s=Math.max(0,inLength-40);s<inLength;s+=.5){const remain=inLength-s,off=laneOffset(incoming)*Math.min(1,remain/35);route.push(at(incoming,s,off).point);}
 const join=at(incoming,inLength).point;route.push(join);
 // Preserve a disconnected endpoint as a real gap, rather than welding the map.
 const start=at(outgoing,0).point;if(dist(join,start)>1e-6)route.push(start);
 const outgoingMetres=end==='start'?Math.min(110,outLength):Math.min(45,outLength);
 const actualJoinStation=polylineLength(route);
 for(let s=.5;s<=outgoingMetres;s+=.5){const off=laneOffset(outgoing)*Math.min(1,s/35);route.push(at(outgoing,s,off).point);}
 const replayArea=bounds(route,65),near=(q:any)=>{const b=bounds(path(q),15);return b.minX<replayArea.maxX&&b.maxX>replayArea.minX&&b.minZ<replayArea.maxZ&&b.maxZ>replayArea.minZ;},keep=new Set<string>(map.roads.filter(near).map((q:any)=>q.id));
 for(const n of network.endpointNodes)if(n.ends.some(e=>keep.has(e.roadId)))for(const e of n.ends)keep.add(e.roadId);
 for(const j of map.intersections)if(j.connections.some((e:any)=>keep.has(e.roadId)))for(const e of j.connections)keep.add(e.roadId);
 const p=route[0],first=sampleAt(route,0),runtimeMap={...map,roads:map.roads.filter((q:any)=>keep.has(q.id)),roadLinks:map.roadLinks.filter((l:any)=>keep.has(l.from.roadId)&&keep.has(l.to.roadId)),connectionPorts:map.connectionPorts.filter((p:any)=>keep.has(p.endpoint.roadId)),intersections:map.intersections.filter((j:any)=>j.connections.every((e:any)=>keep.has(e.roadId))),objects:map.objects.filter((o:any)=>o.position.x>=replayArea.minX&&o.position.x<=replayArea.maxX&&o.position.z>=replayArea.minZ&&o.position.z<=replayArea.maxZ),signs:(map.signs??[]).filter((o:any)=>o.position.x>=replayArea.minX&&o.position.x<=replayArea.maxX&&o.position.z>=replayArea.minZ&&o.position.z<=replayArea.maxZ),bounds:replayArea,environment:{...map.environment,districts:[],spawnPoints:[{id:'audit',position:p,rotation:Math.atan2(-first.tangent.x,-first.tangent.z)}]}};
 const ground=new CityGround(runtimeMap,{runtime:{map:runtimeMap,roadNetwork:buildCityRoadNetwork(runtimeMap)}}),config=createRoadSUVPhysicsConfig(),car=new VehicleDynamics(config,{x:p.x,z:p.z,yaw:Math.atan2(-first.tangent.x,-first.tangent.z),driveSelector:'D',vehicleOperational:true,engineRunning:true}),adapter=new VehicleContactSystem(ground,config),input=createNeutralVehicleInputState();
 car.chassisY=p.y;adapter.synchronize(car);let state=car.getSnapshot();const dt=1/120,speed=30/3.6;
 const rows:any[]=[],switches:any[]=[],previous=new Map<string,any>();let peakAY=0,peakPitch=0,peakRoll=0,impulse=0,minGrounded=4,tracking=0,allAir=0,zeroCandidate=0,rejected=0,requiredMin=Infinity,requiredMax=-Infinity,furthest=0,collisionTicks=0,maxCollisionDelta=0;
 const rejectionReasons:Record<string,number>={},candidateRejections:Record<string,number>={},layers:Record<string,number>={};
 let tickCandidates:any[]=[],stopReason='time-limit';ground.surfaceQueryObserver=q=>{tickCandidates.push(q);};
 try{
  input.brake=1;for(let i=0;i<120;i++)adapter.step(dt,input,car);input.brake=0;state=car.getSnapshot();
  const rejectedStart=adapter.supportContinuity.rejectedSamples;
  // Initial velocity is set once. During traversal only normal steering/throttle/brake are supplied.
  car.speed=speed;car.verticalVelocity=first.tangent.y!*speed;
  for(let i=0;i<2880;i++){
   const hit=project(route,state),target=sampleAt(route,Math.min(polylineLength(route),hit.along+Math.max(3,Math.abs(state.speed)*.65))).point,desired=Math.atan2(-(target.x-state.x),-(target.z-state.z)),error=Math.atan2(Math.sin(desired-state.yaw),Math.cos(desired-state.yaw));
   input.steering=Math.max(-1,Math.min(1,-error*2.8+state.yawRate*.4));input.throttle=Math.max(0,Math.min(.4,(speed-state.speed)*.15));input.brake=Math.max(0,Math.min(.3,(state.speed-speed)*.2));
   tickCandidates=[];state=adapter.step(dt,input,car);const vertical=car.suspension.getVerticalSnapshot();let grounded=0;
   const wheels=Object.fromEntries(WHEEL_IDS.map((id,index)=>{const c=adapter.wheelContacts![id],w=state.wheels[id],g=vertical.wheels[id],queries=tickCandidates.filter(q=>Math.hypot(q.x-c.x,q.z-c.z)<.15),query=queries.at(-1),count=query?.candidates.length??null;if(count===0)zeroCandidate++;if(w.grounded!==false)grounded++;if(c.supportValid===false){rejected++;const reason=c.rejectionReason??'unknown';rejectionReasons[reason]=(rejectionReasons[reason]??0)+1;}for(const v of query?.candidates??[])if(!v.accepted)candidateRejections[v.reason]=(candidateRejections[v.reason]??0)+1;const layer=c.candidateLayerClass??'none';layers[layer]=(layers[layer]??0)+1;requiredMin=Math.min(requiredMin,g.requiredLength);requiredMax=Math.max(requiredMax,g.requiredLength);const prev=previous.get(id),owner=c.reference?.roadId??null;if(prev&&prev.owner!==owner)switches.push({tick:i,wheel:id,from:prev.owner,to:owner,heightStep:c.height-prev.height,x:c.x,z:c.z,valid:c.supportValid,reason:c.rejectionReason});previous.set(id,{owner,height:c.height});impulse=Math.max(impulse,car.chassisMotion.contactImpulses[index]);return [id,{grounded:w.grounded,owner,surface:c.reference?.surfaceId,height:c.height,candidateCount:count,layer,valid:c.supportValid,rejection:c.rejectionReason??null,selection:c.supportSelectionReason,requiredLength:g.requiredLength,mechanicalImpulse:car.chassisMotion.contactImpulses[index]}];}));
   peakAY=Math.max(peakAY,Math.abs(car.verticalAcceleration));peakPitch=Math.max(peakPitch,Math.abs(state.chassis.pitchAngularVelocity??0));peakRoll=Math.max(peakRoll,Math.abs(state.chassis.rollAngularVelocity??0));minGrounded=Math.min(minGrounded,grounded);if(grounded===0)allAir++;tracking=Math.max(tracking,hit.distance);furthest=Math.max(furthest,hit.along);
   if(adapter.collision?.collided){collisionTicks++;maxCollisionDelta=Math.max(maxCollisionDelta,...adapter.collision.contacts.map(c=>c.inwardSpeed));}
   if(i%12===0||grounded<4||i===2879)rows.push({tick:i,station:hit.along,x:state.x,z:state.z,chassisY:car.chassisY,speed:state.speed,tracking:hit.distance,aY:car.verticalAcceleration,pitchRate:state.chassis.pitchAngularVelocity,rollRate:state.chassis.rollAngularVelocity,collision:adapter.collision?.contacts,wheels});
   if(hit.along>=polylineLength(route)-3){stopReason='route-end';break;}
   if(allAir>60||Math.abs(car.chassisY-sampleAt(route,hit.along).point.y!)>8){stopReason='sustained-support-loss';break;}
  }
  const final=rows.at(-1),finalExpectedHeight=sampleAt(route,furthest).point.y!,finalOwners=[...new Set(Object.values(final.wheels).map((w:any)=>w.owner))],expectedTarget=end==='start'?r.id:host.id;
  const validTarget=finalOwners.includes(expectedTarget)&&Object.values(final.wheels).every((w:any)=>w.valid!==false&&w.grounded!==false)&&Math.abs(car.chassisY-finalExpectedHeight)<.5;
  return {rampId:r.id,end,incoming:incoming.id,outgoing:outgoing.id,route,contextRoadCount:runtimeMap.roads.length,vehicle:'roadSUV',dt,speedKph:30,seconds:(rows.at(-1)?.tick??0)*dt,initialization:'1s stationary settling in D with brake; initial longitudinal and grade velocity once; all subsequent pose, speed, height, pitch and roll integrated without snapping',colliders:'authored objects/signs and generated road structure colliders included; original regional terrain and landforms preserved',stopReason,peakAY,peakPitchRate:peakPitch,peakRollRate:peakRoll,mechanicalImpulse:impulse,minGrounded,allAirTicks:allAir,zeroCandidateSamples:zeroCandidate,rejectedSamples:rejected,supportRejections:adapter.supportContinuity.rejectedSamples-rejectedStart,rejectionReasons,candidateRejections,layers,requiredLengthRange:[requiredMin,requiredMax],maxTrackingError:tracking,furthestStation:furthest,joinStation:actualJoinStation,completed:furthest>=polylineLength(route)-4,finalOwners,expectedTarget,finalHeightError:car.chassisY-finalExpectedHeight,targetFootprintCandidateObserved:finalOwners.includes(expectedTarget),targetOwnershipReached:validTarget,collisionTicks,maxCollisionDelta,safetyInterventions:car.chassisMotion.safetyInterventions,surfaceSwitches:switches,samples:rows};
 }finally{ground.dispose();}
}
if(!process.argv.includes('--static-only')){
 const replays:any[]=[];
 for(const r of seeds)for(const end of ['start','end'] as const){const file='replay-'+r.id.replace(/[^a-zA-Z0-9-]/g,'_')+'-'+end+'.json';let row:any;if(process.argv.includes('--resume')&&fs.existsSync(dir+file))row=JSON.parse(fs.readFileSync(dir+file,'utf8'));else {row=replay(r,end,interfaces.find((i:any)=>i.rampId===r.id&&i.end===end));write(file,row);}replays.push(row);console.log(JSON.stringify({phase:'replay',ramp:r.id,end,completed:row.completed,tracking:row.maxTrackingError,grounded:row.minGrounded,air:row.allAirTicks,aY:row.peakAY,impulse:row.mechanicalImpulse,collisionTicks:row.collisionTicks,rejections:row.rejectionReasons}));}
 write('runtime-short-replay.json',{source,hash,complete:replays.length===seeds.length*2,scope:'16 short split/merge traversals; actual support, suspension and chassis at 120Hz. One initial speed; no forced pose or road-height snapping. Graphics publication omitted only. Steering tracking failures remain inconclusive, not attributed to map without geometry evidence.',rows:replays});
}
write('source-state.json',{source,hash,mapVersion:map.version,mapUnchanged:createHash('sha256').update(fs.readFileSync(source)).digest('hex')===hash,productSourceChanges:false,generatedAt:new Date().toISOString()});
