import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CityGround} from '../src/world/city/CityGround';
import {SectorManager} from '../src/world/city/SectorManager';
import {compileCityRuntimeData} from '../src/world/city/CityRuntimeData';
import {buildCityRoadNetwork} from '../src/world/city/CityRoadNetwork';
import {roadPoints,sampleAt,polylineLength} from '../src/world/city/geometry';
import {project} from '../src/editor/EditorGeometry';
import {VehicleDynamics} from '../src/vehicle/physics/VehicleDynamics';
import {VehicleContactSystem} from '../src/vehicle/physics/VehicleContactSystem';
import {VehiclePhysicsBlackBox} from '../src/vehicle/diagnostics/VehiclePhysicsBlackBox';
import {createRoadSUVPhysicsConfig} from '../src/vehicle/config/roadSUVPhysicsConfig';
import {createTeslaModel3PhysicsConfig} from '../src/vehicle/config/teslaModel3PhysicsConfig';
import {createNeutralVehicleInputState} from '../src/input/VehicleInputState';
import {WHEEL_IDS} from '../src/vehicle/physics/WheelContact';
import {runWheelSupportContinuitySelfTest} from '../src/vehicle/physics/WheelSupportContinuity.selftest';
import {runNavigationSelfTest} from '../src/world/navigation/Navigation.selftest';
const dir='artifacts/v488-full-rollback/',sourceText=fs.readFileSync('src/world/regional/regional-main.json','utf8'),source=JSON.parse(sourceText),runtime=compileCityRuntimeData(source),map=runtime.map,dt=1/120;
const save=(f:string,v:unknown)=>fs.writeFileSync(dir+f,JSON.stringify(v,null,2)+'\n'),roadId='regional:G17:out:split306:lane64';
// Authoring harness only: do not publish GPU sectors during a short physics run.
// All selected roads remain complete, normalized by the production compiler.
SectorManager.prototype.updatePosition=()=>false;
function local(x:number,z:number,y:number){
 const ids=new Set(map.roads.filter(r=>project(roadPoints(r),{x,z}).distance<90).map(r=>r.id));
 for(let n=0;n<2;n++){for(const l of map.roadLinks??[])if(ids.has(l.from.roadId)||ids.has(l.to.roadId)){ids.add(l.from.roadId);ids.add(l.to.roadId);}for(const j of map.intersections)if(j.connections.some(c=>ids.has(c.roadId)))j.connections.forEach(c=>ids.add(c.roadId));}
 const roads=map.roads.filter(r=>ids.has(r.id)),m={...map,roads,intersections:map.intersections.filter(j=>j.connections.every(c=>ids.has(c.roadId))),roadLinks:map.roadLinks?.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),objects:map.objects.filter(o=>Math.hypot(o.position.x-x,o.position.z-z)<150),signs:map.signs?.filter(s=>Math.hypot(s.position.x-x,s.position.z-z)<150),environment:{...map.environment,spawnPoints:[{id:'rollback',position:{x,y,z},rotation:-Math.PI/2}]}};
 return new CityGround(m,{runtime:{map:m,roadNetwork:buildCityRoadNetwork(m)}});
}
function drive(name:string,options:{x:number;z:number;y:number;yaw:number;speed:number;length:number;roadId:string;east?:boolean}){
 const ground=local(options.x,options.z,options.y),config=options.east?createTeslaModel3PhysicsConfig():createRoadSUVPhysicsConfig(),car=new VehicleDynamics(config,{x:options.x,z:options.z,yaw:options.yaw,driveSelector:'N',engineRunning:false}),adapter=new VehicleContactSystem(ground,config),controls=createNeutralVehicleInputState(),box=new VehiclePhysicsBlackBox({mapId:map.id,mapName:map.name,mapVersion:map.version,vehicleId:options.east?'tesla-model-3-rwd':'road-suv-v6-8at',vehicleConfigVersion:2,buildVersion:'v486-pure-rollback'});
 car.chassisY=options.y;adapter.synchronize(car);let recovery=0;const resolve=car.resolvePenetration.bind(car);car.resolvePenetration=()=>{const y=car.chassisY,result=resolve();recovery+=Math.abs(car.chassisY-y);return result;};
 let state=car.getSnapshot();const seen=Object.fromEntries(WHEEL_IDS.map(id=>[id,new Set<number>()])) as Record<string,Set<number>>,seams:any[]=[],samples:any[]=[],prior=new Map<string,number>(),grounded=new Map<string,boolean>();
 let minGrounded=4,airborneTicks=0,transitions=0,peakImpulse=0,peakAY=0,sumAY=0,recoveries=0,peakFz=0,rampSeen=false,mainlineAfterRamp=0,invalidABA=0;const roads=new Map<string,{current?:string;previous?:string;tick:number;height:number}>();
 const ramp=map.roads.find(r=>r.id==='system-east:E-to-S-turbine')!;
 try{
  for(let i=0;i<120;i++)state=adapter.step(dt,controls,car);
  const warmupRejections=adapter.supportContinuity.rejectedSamples,rejectionStart=warmupRejections;box.arm();adapter.blackBox=box;car.speed=options.speed/3.6;
  for(const id of WHEEL_IDS)grounded.set(id,state.wheels[id].grounded!==false);
  const ticks=options.east?800:Math.ceil(options.length/(options.speed/3.6)/dt);
  for(let tick=0;tick<ticks;tick++){
   car.speed=options.speed/3.6;
   if(options.east&&state.x<2640){const targetX=state.x-8;let targetZ=ramp.centerline.at(-1)!.z;for(let i=1;i<ramp.centerline.length;i++){const a=ramp.centerline[i-1]!,b=ramp.centerline[i]!;if(b.x<=targetX){const t=Math.max(0,Math.min(1,(targetX-a.x)/(b.x-a.x)));targetZ=a.z+(b.z-a.z)*t;break;}}const desired=Math.atan2(8,-(targetZ-state.z)),error=Math.atan2(Math.sin(desired-state.yaw),Math.cos(desired-state.yaw));controls.steering=Math.max(-1,Math.min(1,-error*2.5+state.yawRate*.4));}
   state=adapter.step(dt,controls,car);let count=0;peakAY=Math.max(peakAY,Math.abs(car.verticalAcceleration));sumAY+=car.verticalAcceleration**2;
   for(const id of WHEEL_IDS){const c=adapter.wheelContacts![id],g=state.wheels[id].grounded!==false,s=c.reference?.segmentIndex,r=c.reference?.roadId;if(g)count++;if(g!==grounded.get(id))transitions++;grounded.set(id,g);peakFz=Math.max(peakFz,state.wheels[id].normalLoad);if(r===options.roadId&&s!==undefined){seen[id].add(s);const p=prior.get(id);if(p!==s)seams.push({tick,wheel:id,from:p,to:s,x:c.x,z:c.z,height:c.height,normal:c.normal,grounded:g,rejected:c.supportValid===false,rejectionReason:c.rejectionReason});prior.set(id,s);}
    const h=roads.get(id)??{tick:-100,height:c.height};if(r!==h.current){if(r===h.previous&&tick-h.tick<=3&&Math.abs(c.height-h.height)>.1)invalidABA++;h.previous=h.current;h.current=r;h.tick=tick;}h.height=c.height;roads.set(id,h);
   }
   minGrounded=Math.min(minGrounded,count);if(count===0)airborneTicks++;peakImpulse=Math.max(peakImpulse,...car.chassisMotion.contactImpulses);if(state.recoveredFromInvalidState)recoveries++;
   if(options.east&&state.x<2580){const ids=WHEEL_IDS.map(id=>adapter.wheelContacts![id].reference?.roadId);if(ids.every(id=>id===ramp.id))rampSeen=true;if(rampSeen&&ids.some(id=>id!==ramp.id))mainlineAfterRamp++;}
   samples.push({tick,x:state.x,z:state.z,aY:car.verticalAcceleration,grounded:count,wheels:WHEEL_IDS.map(id=>{const c=adapter.wheelContacts![id];return {id,road:c.reference?.roadId,segment:c.reference?.segmentIndex,height:c.height,supportValid:c.supportValid,rejection:c.rejectionReason,grounded:state.wheels[id].grounded,Fz:state.wheels[id].normalLoad};})});
   if(options.east&&state.x<2570)break;
  }
  box.requestManualTrigger();adapter.step(dt,controls,car);box.freezeInterrupted('pure v486 rollback short regression');const trace=box.createExport();save(name+'-blackbox.json',trace);
  const rejection=adapter.supportContinuity.rejectedSamples-rejectionStart,seam17to18=WHEEL_IDS.every(id=>seen[id].has(17)&&seen[id].has(18)),row={name,mapVersion:map.version,vehicleId:options.east?'tesla-model-3-rwd':'road-suv-v6-8at',roadId:options.roadId,options,protocol:'Production normalized complete local roads and real colliders; prescribed longitudinal speed, free vertical/pitch/roll dynamics; no support override; 120-tick static settling; GPU sector publication disabled in harness only.',warmupRejections,ticks:samples.length,seconds:samples.length*dt,seam17to18,minGrounded,airborneTicks,groundedTransitions:transitions,rejection,peakImpulse,safety:car.chassisMotion.safetyInterventions,recovery,nonFiniteRecovery:recoveries,peakAY,rmsAY:Math.sqrt(sumAY/samples.length),peakFz,seams,rampSeen,mainlineAfterRamp,invalidABA,passed:rejection===0&&minGrounded===4&&peakImpulse===0&&car.chassisMotion.safetyInterventions===0&&recovery===0&&recoveries===0&&(!name.startsWith('G17')||seam17to18)&&(!options.east||rampSeen&&mainlineAfterRamp===0&&invalidABA===0),samples};save(name+'.json',row);console.log(JSON.stringify({...row,samples:undefined,seams:seams.filter(s=>s.from===17&&s.to===18)}));return row;
 }finally{ground.dispose();}
}
const bbNames=['vehicle-blackbox-20261022-231949.json','vehicle-blackbox-20261022-231858.json'];
const bb=bbNames.map(name=>{const text=fs.readFileSync('C:/Users/dsy/Downloads/'+name,'utf8'),x=JSON.parse(text),strings=x.dictionaries.strings,event=x.events.find((e:any)=>e.type==='support-candidate-rejected'&&strings[e.detail.road]===roadId),f=x.frames.find((f:any)=>f.step===event.step);return {file:name,sha256:createHash('sha256').update(text).digest('hex'),metadata:x.metadata,incident:event,pose:{x:f.worldPositionX,z:f.worldPositionZ,yaw:f.yaw,speedKph:f.speed*3.6},groundedMin:Math.min(...x.frames.filter((f:any)=>f.worldPositionX>3415&&f.worldPositionX<3445).map((f:any)=>f.groundedMask))};});save('input-blackbox-evidence.json',bb);
const rows=bb.map((b,i)=>drive('G17-17-18-'+(i+1),{x:3410,z:b.pose.z,y:0,yaw:b.pose.yaw,speed:b.pose.speedKph,length:36,roadId}));
// East A-B-A is run by the wrapper with its established approach/spawn protocol.
// Do not force a zero world-Y spawn at this elevated incident.
for(const [id,name,speed]of [['regional:G17:out','highway-flat',100],['regional:v3:G38-extension2:in:10','expressway-elevated-flat',90]] as const){let road=map.roads.find(r=>r.id===id);if(!road&&name==='expressway-elevated-flat')road=map.roads.find(r=>r.roadClass==='expressway'&&r.centerline.length>1&&r.centerline.every(p=>(p.y??0)>5&&Math.abs((p.y??0)-(r.centerline[0]!.y??0))<.0001)&&polylineLength(roadPoints(r))>100);if(!road)throw new Error('Missing flat fixture '+id);const p=roadPoints(road),f=sampleAt(p,Math.min(30,polylineLength(p)*.25)),offset=(.5-road.laneCount/2)*road.laneWidth;rows.push(drive(name,{x:f.point.x-f.tangent.z*offset,z:f.point.z+f.tangent.x*offset,y:f.point.y??0,yaw:Math.atan2(-f.tangent.x,-f.tangent.z),speed,length:28,roadId:road.id}));}
const support=runWheelSupportContinuitySelfTest(),navigation=runNavigationSelfTest();save('targeted-tests.json',{support,navigation,sourceHash:createHash('sha256').update(sourceText).digest('hex')});save('runtime-regression.json',{mapVersion:map.version,complete:true,allRequestedCasesPassed:rows.every(r=>r.passed),sourceHash:createHash('sha256').update(sourceText).digest('hex'),rows:rows.map(({samples,...r})=>r),policy:'If pure rollback still reproduces the incident, preserve exact v486 data and report separately; never repair it in this rollback task.'});console.log(JSON.stringify({support,navigation,regressions:rows.filter(r=>!r.passed).map(r=>r.name)}));
