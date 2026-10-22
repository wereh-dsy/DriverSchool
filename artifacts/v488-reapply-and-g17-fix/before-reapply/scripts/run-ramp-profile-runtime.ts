import fs from 'node:fs';
import type {CityMapData} from '../src/world/city/CityMapData';
import {newCityMap} from '../src/world/city/CityMapData';
import {CityGround} from '../src/world/city/CityGround';
import {buildCityRoadNetwork} from '../src/world/city/CityRoadNetwork';
import {roadPoints,sampleAt,polylineLength} from '../src/world/city/geometry';
import {bounds,project} from '../src/editor/EditorGeometry';
import {VehicleDynamics} from '../src/vehicle/physics/VehicleDynamics';
import {VehicleContactSystem} from '../src/vehicle/physics/VehicleContactSystem';
import {createTaycan4SPhysicsConfig} from '../src/vehicle/config/taycan4SPhysicsConfig';
import {createNeutralVehicleInputState} from '../src/input/VehicleInputState';
import {WHEEL_IDS} from '../src/vehicle/physics/WheelContact';
import {BlackBoxTriggerThresholds} from '../src/vehicle/diagnostics/BlackBoxTriggerThresholds';

const dirArg=process.argv.indexOf('--dir'),planArg=process.argv.indexOf('--plan-file'),dir=dirArg<0?'artifacts/ramp-profile-audit':process.argv[dirArg+1]!,before:CityMapData=JSON.parse(fs.readFileSync(dir+'/before-map.json','utf8')),after:CityMapData=JSON.parse(fs.readFileSync(dir+'/candidate-map.json','utf8'));
const plans:any[]=JSON.parse(fs.readFileSync(dir+'/'+(planArg<0?'repair-plans.json':process.argv[planArg+1]),'utf8')),limitArg=process.argv.indexOf('--limit'),selected=limitArg<0?plans:plans.slice(0,Number(process.argv[limitArg+1]));
const roadArg=process.argv.indexOf('--road'),speedArg=process.argv.indexOf('--speed'),lengthArg=process.argv.indexOf('--length');
const replayLength=lengthArg<0?14:Number(process.argv[lengthArg+1]),outputName=roadArg<0?'runtime-regression.json':(speedArg<0?'runtime-road-':'runtime-highway-')+process.argv[roadArg+1]!.replace(/[^a-zA-Z0-9-]/g,'_')+'.json';
if(roadArg>=0){const match=selected.filter(p=>p.roadId===process.argv[roadArg+1]);if(match.length!==1)throw new Error('Unknown replay road');selected.splice(0,selected.length,...match);}
function localMap(map:CityMapData,x:number,z:number){
  const near=map.roads.filter(r=>project(roadPoints(r),{x,z}).distance<45),ids=new Set(near.map(r=>r.id));
  // Preserve complete authored junctions and explicit road continuations around
  // the replay. No recropped centreline or rederived junction footprints.
  for(const j of map.intersections)if(j.connections.some(c=>ids.has(c.roadId)))for(const c of j.connections)ids.add(c.roadId);
  for(const r of map.roads)if(ids.has(r.id)&&r.highwayTransition){ids.add(r.highwayTransition.mainRoadId);ids.add(r.highwayTransition.decisionId);}
  const roads=map.roads.filter(r=>ids.has(r.id));
  return {...newCityMap(),id:map.id,version:map.version,roadNames:map.roadNames,roads,roadLinks:map.roadLinks?.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),intersections:map.intersections.filter(j=>j.connections.every(c=>ids.has(c.roadId))),bounds:bounds(roads.flatMap(roadPoints),20),environment:{districts:[],metadata:map.environment.metadata,spawnPoints:[{id:'audit',position:{x,y:0,z},rotation:0}]}};
}
function drive(map:CityMapData,plan:any){
  const road=map.roads.find(r=>r.id===plan.roadId)!,path=roadPoints(road),length=polylineLength(path);
  const worst=plan.profile?.reduce((a:any,p:any)=>Math.abs(p.after-p.before)>Math.abs(a.after-a.before)?p:a);
  const station=plan.focusFraction!==undefined?length*plan.focusFraction:worst?.station??plan.before.breaks.reduce((a:any,p:any)=>p.gradeBreak>a.gradeBreak?p:a,{station:length/2,gradeBreak:0}).station;
  const startStation=Math.max(0,Math.min(length-replayLength,station-replayLength/2)),start=sampleAt(path,startStation),x=start.point.x,z=start.point.z;
  const local=localMap(map,x,z),ground=new CityGround(local,{editor:true,runtime:{map:local,roadNetwork:buildCityRoadNetwork(local)}}),config=createTaycan4SPhysicsConfig(),car=new VehicleDynamics(config,{x,z,yaw:Math.atan2(-start.tangent.x,-start.tangent.z),driveSelector:'N'}),adapter=new VehicleContactSystem(ground,config),input=createNeutralVehicleInputState();
  adapter.collisionSystem.setColliders([]);ground.spawnPose.position.set(x,(start.point.y??0)+.04,z);car.chassisY=start.point.y??0;adapter.synchronize(car);
  const dt=1/120,speed=speedArg>=0?Number(process.argv[speedArg+1])/3.6:plan.speedKph!==undefined?plan.speedKph/3.6:Math.max(1.4,Math.min(30/3.6,Math.sqrt(Math.max(1,plan.before.minRadius??200)*1.3))),ticks=Math.min(480,Math.ceil(Math.min(replayLength,length-startStation)/speed/dt));
  let state=car.getSnapshot(),sumAY=0,peakAY=0,pitchRate=0,rollRate=0,impulse=0,transitions=0,minGrounded=4,fullBump=0,bumpStopEntries=0,tracking=0;
  const previousStop=new Map(WHEEL_IDS.map(id=>[id,false])),previousRoad=new Map<string,string>(),previousHeight=new Map<string,number>();let supportSwitches=0,largeHeightSwitches=0;
  const grounded=new Map(WHEEL_IDS.map(id=>[id,state.wheels[id].grounded!==false])),previousBump=new Map(WHEEL_IDS.map(id=>[id,false])),classes:Record<string,number>={},reasons:Record<string,number>={},samples:any[]=[];
  try{
    for(let i=0;i<60;i++)adapter.step(dt,input,car);
    state=car.getSnapshot();const h=sampleAt(path,Math.min(length,startStation+1)).point.y??0;car.verticalVelocity=(h-(start.point.y??0))*speed;
    const rejectionStart=adapter.supportContinuity.rejectedSamples;
    for(let i=0;i<ticks;i++){
      car.speed=speed;const hit=project(path,state),target=sampleAt(path,Math.min(length,hit.along+Math.max(3,speed*.65))).point,desired=Math.atan2(-(target.x-state.x),-(target.z-state.z)),error=Math.atan2(Math.sin(desired-state.yaw),Math.cos(desired-state.yaw));input.steering=Math.max(-1,Math.min(1,-error*2.8+state.yawRate*.4));
      state=adapter.step(dt,input,car);tracking=Math.max(tracking,hit.distance);const ay=car.verticalAcceleration;sumAY+=ay*ay;peakAY=Math.max(peakAY,Math.abs(ay));pitchRate=Math.max(pitchRate,Math.abs(state.chassis.pitchAngularVelocity??0));rollRate=Math.max(rollRate,Math.abs(state.chassis.rollAngularVelocity??0));impulse=Math.max(impulse,...car.chassisMotion.contactImpulses);
      const vertical=car.suspension.getVerticalSnapshot();
      let count=0;for(const id of WHEEL_IDS){const w=state.wheels[id],c=adapter.wheelContacts![id],g=w.grounded!==false,corner=vertical.wheels[id],bump=corner.grounded&&corner.suspensionLength<=corner.minSuspensionLength+BlackBoxTriggerThresholds.fullBumpTolerance,stop=(w.bumpStopForce??0)>0,roadId=c.reference?.roadId;if(roadId&&previousRoad.has(id)&&roadId!==previousRoad.get(id)){supportSwitches++;if(Math.abs(c.height-(previousHeight.get(id)??c.height))>.25)largeHeightSwitches++;}if(roadId)previousRoad.set(id,roadId);previousHeight.set(id,c.height);if(g)count++;if(g!==grounded.get(id))transitions++;grounded.set(id,g);if(bump&&!previousBump.get(id))fullBump++;previousBump.set(id,bump);if(stop&&!previousStop.get(id))bumpStopEntries++;previousStop.set(id,stop);const cls=c.candidateLayerClass??'none';classes[cls]=(classes[cls]??0)+1;if(c.supportValid===false){const r=c.rejectionReason??'unknown';reasons[r]=(reasons[r]??0)+1;}}
      minGrounded=Math.min(minGrounded,count);
      if(i%12===0||i===ticks-1)samples.push({tick:i,x:state.x,z:state.z,aY:ay,wheels:Object.fromEntries(WHEEL_IDS.map(id=>{const c=adapter.wheelContacts![id],w=state.wheels[id];return [id,{road:c.reference?.roadId,surface:c.reference?.surfaceId,height:c.height,predicted:c.predictedSurfaceHeight,layer:c.candidateLayerClass,continuity:c.supportSelectionReason,rejected:c.supportValid===false,rejectionReason:c.rejectionReason,grounded:w.grounded,impulse:car.chassisMotion.contactImpulses[WHEEL_IDS.indexOf(id)]}];}))});
    }
    return {roadId:road.id,startStation,focusStation:station,length:Math.min(replayLength,length-startStation),seconds:ticks*dt,speedKph:speed*3.6,rmsAY:Math.sqrt(sumAY/ticks),peakAY,pitchRate,rollRate,fullBump,bumpStopEntries,transitions,minGrounded,supportSwitches,largeHeightSwitches,rejections:adapter.supportContinuity.rejectedSamples-rejectionStart,mechanicalImpulse:impulse,safety:car.chassisMotion.safetyInterventions,maxTrackingError:tracking,layerClasses:classes,rejectionReasons:reasons,samples};
  }finally{ground.dispose();}
}
const results:any[]=process.argv.includes('--resume')?JSON.parse(fs.readFileSync(dir+'/runtime-regression.json','utf8')).rows:[];
const checkpoints=dir+'/runtime-checkpoints/'+outputName;fs.mkdirSync(checkpoints,{recursive:true});
for(const [i,p]of selected.entries()){
  if(i<results.length){if(results[i].roadId!==p.roadId)throw new Error('Replay resume inventory changed');continue;}
  const checkpoint=checkpoints+'/'+String(i).padStart(4,'0')+'.json';
  if(process.argv.includes('--resume')&&fs.existsSync(checkpoint)){const saved=JSON.parse(fs.readFileSync(checkpoint,'utf8'));if(saved.roadId!==p.roadId)throw new Error('Replay checkpoint inventory changed');results.push(saved);continue;}
  const b=drive(before,p),a=drive(after,p),regressions:string[]=[];
  if(a.maxTrackingError>1.5)regressions.push('path tracking exceeded 1.5m; short steering replay inconclusive');
  if(a.mechanicalImpulse>Math.max(1,b.mechanicalImpulse*1.1))regressions.push('mechanical impulse worsened');
  if(a.safety>b.safety)regressions.push('new safety intervention');
  if(a.peakAY>b.peakAY*1.25+1||a.rmsAY>b.rmsAY*1.25+.2)regressions.push('vertical response worsened');
  if(a.transitions>b.transitions+2||a.rejections>b.rejections+4)regressions.push('contact continuity worsened');
  const row={roadId:p.roadId,category:p.category,before:b,after:a,regressions};results.push(row);fs.writeFileSync(checkpoint,JSON.stringify(row));
  if(i%10===0||i===selected.length-1)console.log(JSON.stringify({done:i+1,total:selected.length,flagged:results.filter(r=>r.regressions.length).length}));
}
const temporary=dir+'/'+outputName+'.next';
fs.writeFileSync(temporary,JSON.stringify({scope:'Paired short integrated four-wheel replays at each changed road; speed prescribed, steering and vertical dynamics integrated, solid barriers excluded. Not a whole-corridor driving certification.',complete:results.length===selected.length,rows:results},null,2));fs.renameSync(temporary,dir+'/'+outputName);
