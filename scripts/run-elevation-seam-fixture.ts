import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CityGround} from '../src/world/city/CityGround';
import type {CityMapData,CityRoad} from '../src/world/city/CityMapData';
import {VehicleDynamics} from '../src/vehicle/physics/VehicleDynamics';
import {VehicleContactSystem} from '../src/vehicle/physics/VehicleContactSystem';
import {createTeslaModel3PhysicsConfig} from '../src/vehicle/config/teslaModel3PhysicsConfig';
import {createNeutralVehicleInputState} from '../src/input/VehicleInputState';
import {VehiclePhysicsBlackBox} from '../src/vehicle/diagnostics/VehiclePhysicsBlackBox';
import {WHEEL_IDS} from '../src/vehicle/physics/WheelContact';

const dir='artifacts/map-elevation-seam-audit',original:CityMapData=JSON.parse(fs.readFileSync(dir+'/original-local-map.json','utf8')),source:CityMapData=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8'));
const ids=new Set(original.roads.map(r=>r.id)),current={...original,version:source.version,roads:source.roads.filter(r=>ids.has(r.id))};
function grades(road:CityRoad){
  const p=road.centerline,g=p.slice(1).map((v,i)=>((v.y??0)-(p[i]!.y??0))/Math.hypot(v.x-p[i]!.x,v.z-p[i]!.z));
  return {roadId:road.id,maxGrade:Math.max(...g.map(Math.abs)),maxGradeBreak:Math.max(...g.slice(1).map((v,i)=>Math.abs(v-g[i]!)))};
}
function probe(map:CityMapData){
  const ground=new CityGround(map,{editor:true});let maxGap=0,minDot=1,samples=0;
  try{
    for(let z=2105;z<=2175;z+=.5)for(let x=2181;x<=2251;x+=.5){
      const q=ground.debugSurfaceCandidates(x,z,.6).candidates.filter(c=>c.roadId&&ids.has(c.roadId)&&c.distance<1e-6);
      for(const a of q)for(const b of q)if(a.roadId!==b.roadId){samples++;maxGap=Math.max(maxGap,Math.abs(a.height-b.height));minDot=Math.min(minDot,a.normal.x*b.normal.x+a.normal.y*b.normal.y+a.normal.z*b.normal.z);}
    }
    return {samples,maxOverlapHeightMismatch:maxGap,minNormalDot:minDot,grades:map.roads.map(grades)};
  }finally{ground.dispose();}
}
function replay(map:CityMapData,reverse:boolean,label:string){
  const ground=new CityGround(map,{editor:true}),config=createTeslaModel3PhysicsConfig(),dt=1/120,speed=20/3.6;
  const car=new VehicleDynamics(config,{x:reverse?2223:2207,z:2140,yaw:reverse?Math.PI/2:-Math.PI/2,speed,driveSelector:'N',engineRunning:false});
  const adapter=new VehicleContactSystem(ground,config);adapter.collisionSystem.setColliders([]);adapter.synchronize(car);
  const box=new VehiclePhysicsBlackBox({mapId:map.id,mapName:map.name,mapVersion:map.version,vehicleId:'tesla-model-3-rwd',vehicleConfigVersion:2,buildVersion:label});box.arm();adapter.blackBox=box;
  const neutral=createNeutralVehicleInputState();let state=car.getSnapshot(),steps=0,maxSurfaceStep=0,switches=0,airborneTransitions=0,minGrounded=4;
  const last=new Map<string,{height:number;road?:string;grounded:boolean}>();
  try{
    for(;steps<600&&(reverse?state.x>2207:state.x<2223);steps++){
      car.speed=speed;state=adapter.step(dt,neutral,car);
      let grounded=0;
      for(const id of WHEEL_IDS){const c=adapter.wheelContacts![id],g=state.wheels[id].grounded!==false,previous=last.get(id);
        if(g)grounded++;
        if(previous){if(previous.grounded&&!g)airborneTransitions++;
          if(previous.road!==c.reference?.roadId){switches++;maxSurfaceStep=Math.max(maxSurfaceStep,Math.abs(c.height-previous.height));}}
        last.set(id,{height:c.height,road:c.reference?.roadId,grounded:g});
      }
      minGrounded=Math.min(minGrounded,grounded);
    }
    box.requestManualTrigger();adapter.step(dt,neutral,car);box.freezeInterrupted('short map seam replay complete');
    const trace=box.createExport(),heightJumpEvents=trace.events.filter(e=>e.type==='surface-height-jump'||(e.detail as {heightJump?:boolean})?.heightJump).length;
    fs.writeFileSync(`${dir}/${label}-${reverse?'west':'east'}-blackbox.json`,JSON.stringify(trace));
    return {direction:reverse?'west':'east',steps,durationSeconds:steps*dt,fromX:reverse?2223:2207,toX:state.x,z:state.z,surfaceSwitches:switches,maxSurfaceStep,heightJumpEvents,airborneTransitions,minGrounded,rejectedSamples:adapter.supportContinuity.rejectedSamples};
  }finally{ground.dispose();}
}
const before=probe(original),after=probe(current),beforeReplay=[false,true].map(r=>replay(original,r,'before')),afterReplay=[false,true].map(r=>replay(current,r,'after'));
const result={valid:false,scope:'local physical CityGround overlap probe and two 16m contact replays at 20km/h; solid barriers disabled to isolate pavement support',before,after,beforeReplay,afterReplay};
fs.writeFileSync(dir+'/fixture-regression.json',JSON.stringify(result,null,2));
assert(before.maxOverlapHeightMismatch>.12&&before.minNormalDot>.9999,'retains real incident geometry');
assert(after.samples>0&&after.maxOverlapHeightMismatch<.01,'overlap mismatch below 1cm');
for(const a of after.grades){const b=before.grades.find(b=>b.roadId===a.roadId)!;assert(a.maxGrade<=b.maxGrade+.002&&a.maxGradeBreak<=b.maxGradeBreak+.002,'no new profile grade spike');}
assert(beforeReplay.some(r=>r.maxSurfaceStep>.12&&r.surfaceSwitches>0),'baseline replay crosses anomalous surface transition');
assert(afterReplay.every(r=>r.surfaceSwitches>0&&r.maxSurfaceStep<.01&&r.heightJumpEvents===0&&r.airborneTransitions===0&&r.minGrounded===4),'repaired replay has no height jump or airborne seam transition');
result.valid=true;fs.writeFileSync(dir+'/fixture-regression.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
