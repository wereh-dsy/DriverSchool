import { mkdirSync, writeFileSync } from 'node:fs';
import * as T from 'three';
import { createVehiclePhysicsConfig, getVehicleDescriptor, getNextVehicleId } from '../src/vehicle/VehicleCatalog';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { VehicleDynamics, type VehicleSnapshot } from '../src/vehicle/physics/VehicleDynamics';
import { VehicleAerodynamics } from '../src/vehicle/physics/VehicleAerodynamics';
import { Engine } from '../src/vehicle/physics/Engine';
import { ICEHeatState } from '../src/vehicle/powertrain/ICEHeatState';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { VehicleLighting } from '../src/vehicle/visual/VehicleLighting';
import { wheelLocalPosition, VEHICLE_WHEEL_IDS } from '../src/vehicle/VehicleDimensions';
import { calculateEngineAudioMix } from '../src/audio/EngineAudio';
import { JESKO_ATTACK_AUDIO_PROFILE } from '../src/audio/JeskoAttackAudioProfile';
import { Gearbox } from '../src/vehicle/physics/Gearbox';
import { LightSpeedTransmission } from '../src/vehicle/transmission/LightSpeedTransmission';
import type { TransmissionContext } from '../src/vehicle/transmission/TransmissionSystem';
import { vehicleViewModel } from '../src/game/GameUIViewModels';

const dt=1/120, neutral=createNeutralVehicleInputState(), c=createVehiclePhysicsConfig('koenigsegg-jesko-attack');
let assertions=0; const errors:string[]=[];
const assert=(ok:boolean,message:string)=>{assertions++;if(!ok)errors.push(message);};
const make=(speed=0,gear:1|2|3|4|5|6|7|8|9=1,selector:'D'|'N'|'R'='D')=>new VehicleDynamics(structuredClone(c),
  {speed,gear,driveSelector:selector,engineRPM:speed?Math.max(1000,speed/c.wheelRadius*c.transmission.gearRatios[gear]!*2.77*30/Math.PI):1000});
const health=(s:VehicleSnapshot,label:string)=>{
  assert(!s.recoveredFromInvalidState,`${label}: no invalid-state recovery`);
  assert(s.chassis.safetyInterventions===0,`${label}: no chassis safety intervention`);
  assert(Number.isFinite(s.speed+s.yaw+s.chassis.pitch+s.chassis.roll),`${label}: finite state`);
};
assert(getNextVehicleId('xiaomi-su7-max-2026')==='koenigsegg-jesko-attack','registered in F5/menu order');
const menu=vehicleViewModel(getVehicleDescriptor('koenigsegg-jesko-attack'));
assert(menu.transmission==='9LST'&&menu.power==='955 kW','menu shows LST and published net rating');
assert(c.transmission.type==='LST'&&!c.transmission.dct&&!c.transmission.cvt,'independent LST topology');
const detached=createVehiclePhysicsConfig('koenigsegg-jesko-attack');
detached.transmission.lst!.shiftStrategy.map=[];
assert(c.transmission.lst!.shiftStrategy.map.length===4,'spawn shift calibration ownership');
const engine=new Engine(c.engine);let peakKW=0,peakNm=0;
for(let rpm=1000;rpm<=8500;rpm+=10){const net=engine.getTorqueAtRPM(rpm)-24;peakKW=Math.max(peakKW,net*rpm*Math.PI/30/1000);peakNm=Math.max(peakNm,net);}
assert(Math.abs(peakKW-955)<1&&Math.abs(peakNm-1500)<1,'1280 bhp / 1500 Nm independent anchors, no power overshoot');
const boost=[];
for(const rpm of [2700,5100,7800]) {
  const e=new Engine(c.engine);e.reset(rpm);let maxBoost=0;
  for(let n=0;n<600;n++) {e.currentRPM=rpm;e.updateThrottle(1,dt);const load=e.availableDriveTorque;e.integrate(dt,load);maxBoost=Math.max(maxBoost,e.boostPressureBar);}
  boost.push({rpm,boostBar:maxBoost,netNm:e.availableDriveTorque,kW:e.availableDriveTorque*rpm*Math.PI/30/1000});
}
assert(boost[2]!.kW>940&&boost[2]!.kW<957,'turbo reaches full-load power at 7800 rpm');

const launch=make();let s=launch.getSnapshot(),zero100:number|null=null,zero200:number|null=null;
let maxRearSlip=0,tcsTicks=0,maxFrontTorque=0,first100SlipSum=0,slipSamples=0,shiftTicks=0;
const shifts:{time:number;gear:unknown;rpm:number;speedKmh:number}[]=[];
let lastGear=s.transmission.currentPhysicalGear;
let maximumRPM=0,maximumSlipAbove20=0,severeSlipSeconds=0;
for(let n=0;n<2400;n++) {
  s=launch.stepFixed(dt,{...neutral,throttle:1});health(s,'WOT');
  maxFrontTorque=Math.max(maxFrontTorque,Math.abs(s.wheels.frontLeft.driveTorque),Math.abs(s.wheels.frontRight.driveTorque));
  const slip=Math.max(Math.abs(s.wheels.rearLeft.slipRatio),Math.abs(s.wheels.rearRight.slipRatio));
  maxRearSlip=Math.max(maxRearSlip,slip);
  maximumRPM=Math.max(maximumRPM,s.rpm??0);
  if(s.speedKmh>20){maximumSlipAbove20=Math.max(maximumSlipAbove20,slip);if(slip>.5)severeSlipSeconds+=dt;}
  if(s.speedKmh>20&&s.speedKmh<100){first100SlipSum+=slip;slipSamples++;}
  if(s.driverAssists.tcsActive)tcsTicks++;
  if(s.transmission.shiftInProgress)shiftTicks++;
  if(s.transmission.currentPhysicalGear!==lastGear){lastGear=s.transmission.currentPhysicalGear;shifts.push({time:(n+1)*dt,gear:lastGear,rpm:s.rpm!,speedKmh:s.speedKmh});}
  if(zero100===null&&s.speedKmh>=100)zero100=(n+1)*dt;
  if(zero200===null&&s.speedKmh>=200)zero200=(n+1)*dt;
}
assert(zero100!==null&&zero100>2&&zero100<6,'dry 0-100 physically plausible');
assert(zero200!==null&&zero200<14,'dry 0-200 reaches wide power band');
assert(maxFrontTorque===0,'RWD: front wheels never receive drive torque');
assert(tcsTicks>0&&first100SlipSum/Math.max(1,slipSamples)<.55,'TCS controls rear launch slip');
assert(shifts.length>=4&&shiftTicks>0,'consecutive automatic upshifts');
assert(shifts.every((v,i)=>typeof v.gear==='number'&&(i===0||v.gear>(shifts[i-1]!.gear as number))),'WOT launch must not hunt up/down gears');
const acceleration={zero100,zero200,speedAfter20sKmh:s.speedKmh,maxRearSlip,mean20to100Slip:first100SlipSum/Math.max(1,slipSamples),
  maximumRPM,maximumSlipAbove20,severeSlipSeconds,tcsTicks,maxFrontTorque,shifts,thermal:s.powertrain.ice?.thermal};

const low=make();for(let n=0;n<960;n++){s=low.stepFixed(dt,{...neutral,throttle:.16});health(s,'low pedal');}
assert(s.speedKmh>5&&s.engineRunning===true,'light-pedal start, no stall');
const lowSpeed={after8sKmh:s.speedKmh,rpm:s.rpm};
const brake=make(200/3.6,6);let brakeTime=0,brakeDistance=0,absTicks=0,downshifts=0;
lastGear=brake.getSnapshot().gear;
for(let n=0;n<960;n++) {
  const previous=brake.speed;s=brake.stepFixed(dt,{...neutral,brake:1});health(s,'braking');
  brakeDistance+=(Math.abs(previous)+Math.abs(s.speed))*.5*dt;brakeTime=(n+1)*dt;
  if(s.driverAssists.absActive)absTicks++;
  if(s.transmission.currentPhysicalGear!==lastGear){lastGear=s.transmission.currentPhysicalGear;downshifts++;}
  if(s.speed<.1)break;
}
assert(s.speed<.1&&brakeTime<7&&absTicks>0,'200-0 service braking through ABS');
assert(downshifts>=3,'continuous protected downshifts during braking');

const gearbox=new Gearbox(c.transmission),lst=new LightSpeedTransmission(gearbox,c.wheelRadius);
const context:TransmissionContext={dt,engineAngularVelocity:2500*Math.PI/30,engineRPM:2500,engineRunning:true,
  engineInertia:.19,idleRPM:1000,stallRPM:580,redlineRPM:8500,availableEngineTorque:350,
  throttle:.2,brake:0,vehicleSpeed:150/3.6,drivenWheelAngularVelocity:150/3.6/.36,
  drivenWheelInertia:7.4,drivenWheelReactionTorque:100};
lst.reset(8,'D');for(let n=0;n<90;n++)lst.prepare(context);
context.throttle=1;let jumped=false,jumpDuration=0;
for(let n=0;n<20;n++){lst.prepare(context);lst.update(context);const t=lst.getSnapshot();if(t.shiftInProgress)jumpDuration+=dt;if((t.currentPhysicalGear as number)<6)jumped=true;}
assert(jumped&&jumpDuration>=.025&&jumpDuration<.06,'UPOD direct multi-gear change has no odd/even penalty');
lst.reset(2,'D');context.vehicleSpeed=70;context.drivenWheelAngularVelocity=70/.36;context.engineRPM=8000;
lst.requestManualSelection(-1);lst.prepare(context);
assert(lst.getSnapshot().manualSelectionRejectedReason!==null,'unsafe manual downshift rejected');
assert(!lst.requestSelector('P',20,0,1)&&!lst.requestSelector('R',20,0,1),'moving P/reverse rejected');
lst.reset(5,'D');context.vehicleSpeed=45;context.drivenWheelAngularVelocity=45/.36;context.engineRPM=5850;
context.engineAngularVelocity=context.engineRPM*Math.PI/30;context.throttle=.4;
for(let n=0;n<120;n++) {
  lst.prepare(context);const out=lst.update(context),snap=lst.getSnapshot();
  assert(Math.abs(out.drivenWheelTorque-out.engineLoadTorque*snap.currentRatio*2.77*.94)<1e-8,'coupling/final drive torque balance');
}
const reverse=make(0,1,'R');for(let n=0;n<360;n++){s=reverse.stepFixed(dt,{...neutral,throttle:.18});health(s,'reverse');}
assert(s.speed<-.5,'reverse physical torque and selector integration');

const loads=[0,100,200,250,290,350,420].map(kmh=>{
  const car=make(kmh/3.6,1,'N');let sample=car.getSnapshot();
  for(let n=0;n<960;n++) {
    const force=-sample.forces.aerodynamicDragForce-sample.forces.rollingResistanceForce+(kmh/3.6-car.speed)*1420*2;
    sample=car.stepFixed(dt,neutral,{externalLongitudinalForce:force});health(sample,'axle load dyno');
  }
  const front=sample.wheels.frontLeft.normalLoad+sample.wheels.frontRight.normalLoad;
  const rear=sample.wheels.rearLeft.normalLoad+sample.wheels.rearRight.normalLoad;
  const downforce=-(sample.frontAeroVerticalForce+sample.rearAeroVerticalForce);
  assert(Math.abs(front+rear-(sample.effectiveVehicleMass*c.gravity+downforce))<3,'axle reactions balance weight plus aero once at '+kmh);
  assert(front>0&&rear>0&&downforce<=1400*9.80665+.01,'positive axle loads and physical aero ceiling at '+kmh);
  if(kmh===250||kmh===290)assert(Math.abs(downforce/9.80665-(kmh===250?700:1000))<2,'official aero anchor '+kmh);
  return {kmh,frontN:front,rearN:rear,frontAeroN:sample.frontAeroVerticalForce,rearAeroN:sample.rearAeroVerticalForce,
    downforceKgf:downforce/9.80665,pitch:sample.chassis.pitch,heave:sample.chassis.chassisY};
});
const aero=new VehicleAerodynamics(c.aero);let maxActuatorStep=0;
for(let n=0;n<1200;n++) {
  const old=aero.spoilerDeployment;aero.update(dt,(n%2?169.99:170.01)/3.6,0,n>600?1:0,3);
  maxActuatorStep=Math.max(maxActuatorStep,Math.abs(aero.spoilerDeployment-old));
}
assert(maxActuatorStep<=3*dt,'continuous front/rear aero actuator at speed/brake transitions');
const stability=['high-speed-turn','continuous-lane-change'].map(name=>{
  const car=make(250/3.6,7);let minLoad=Infinity,maxRoll=0,maxSlip=0,maxYaw=0,maxTransfer=0,minSpeedKmh=250;
  for(let n=0;n<960;n++) {
    const time=n*dt,steering=name==='high-speed-turn'?(time>1&&time<5?.07:0):.085*Math.sin(Math.PI*time*.75);
    const q=car.stepFixed(dt,{...neutral,throttle:.3,steering});health(q,name);
    minLoad=Math.min(minLoad,...Object.values(q.wheels).map(w=>w.normalLoad));maxRoll=Math.max(maxRoll,Math.abs(q.chassis.roll));
    maxSlip=Math.max(maxSlip,Math.abs(q.bodySlipAngle));maxYaw=Math.max(maxYaw,Math.abs(q.yawRate));
    maxTransfer=Math.max(maxTransfer,Math.abs(q.wheels.frontLeft.normalLoad-q.wheels.frontRight.normalLoad));
    minSpeedKmh=Math.min(minSpeedKmh,q.speedKmh);
  }
  assert(minLoad>0&&maxSlip<.15&&maxRoll<.08,'bounded real high-speed response: '+name);
  assert(maxTransfer>50&&maxYaw>.01,'steering produces real yaw and load transfer: '+name);
  return {name,minSpeedKmh,minLoad,maxRoll,maxSlip,maxYaw,maxTransfer};
});
const thermal=new ICEHeatState(c.engine.thermal!);const initial=thermal.temperatureC;
for(let n=0;n<120*600;n++)thermal.update(dt,955000*thermal.torqueFactor,10,40);
const hot={temperatureC:thermal.temperatureC,torqueFactor:thermal.torqueFactor};
for(let n=0;n<120*240;n++)thermal.update(dt,0,40,20);
assert(hot.torqueFactor<1&&hot.torqueFactor>=.40&&hot.temperatureC<145&&thermal.temperatureC<hot.temperatureC,'heat-based derating and physical cooldown');
const audioLoad=calculateEngineAudioMix(7800,1,{profile:JESKO_ATTACK_AUDIO_PROFILE,engineCharacter:c.engine,engineLoad:1,boostPressureBar:1.7});
const audioNoBoost=calculateEngineAudioMix(7800,1,{profile:JESKO_ATTACK_AUDIO_PROFILE,engineCharacter:c.engine,engineLoad:1,boostPressureBar:0});
assert(audioLoad.firingHz===520&&audioLoad.turbo>audioNoBoost.turbo,'flat-plane V8 firing density and actual boost sound');

// Headless structure/visibility checks use real Three meshes; browser render is separate.
const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:1,height:1,
  getContext:()=>new Proxy({}, {get:(_t,key)=>key==='measureText'?()=>({width:20}):key==='createLinearGradient'||key==='createRadialGradient'
    ?()=>({addColorStop:()=>{}}):()=>{},set:()=>true})})}});
let visual:VehicleVisual|undefined,lighting:VehicleLighting|undefined;let bounds:number[]=[];
try {
  const v=getVehicleDescriptor('koenigsegg-jesko-attack').visualConfig;visual=new VehicleVisual(v);lighting=new VehicleLighting(visual);
  visual.root.updateMatrixWorld(true);bounds=visual.getVisualBodyBounds().getSize(new T.Vector3()).toArray();
  assert(bounds[0]!<=2.03001&&bounds[2]!<=4.62601&&bounds[1]!<=1.21001,'exterior matches collision envelope');
  for(const name of ['Jesko active rear wing','Jesko active front flaps','Jesko driver carbon bucket shell','Jesko passenger carbon bucket shell','LST compact selector panel'])
    assert(!!visual.root.getObjectByName(name),'authored part '+name);
  assert(!visual.root.getObjectByName('Rear bench back')&&!visual.root.getObjectByName('Ferrari steering wheel badge'),'two-seat independent cabin');
  for(const id of VEHICLE_WHEEL_IDS) {
    const p=wheelLocalPosition(v.dimensions,id),pivot=visual.wheelPivots[id];
    assert(pivot.position.distanceTo(new T.Vector3(p.x,p.y-(v.staticBodyOffsetY??0),p.z))<1e-9,'wheel geometry datum '+id);
  }
  const eye=new T.Vector3(...v.driverEyePosition),ray=new T.Raycaster();ray.layers.enableAll();
  const opaque:T.Mesh[]=[];visual.root.traverse(o=>{if(o instanceof T.Mesh){const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.every(m=>!m.transparent))opaque.push(o);}});
  for(const direction of [[0,0,-1],[.15,0,-1],[-.15,0,-1]]) {
    ray.set(eye,new T.Vector3(...direction as [number,number,number]).normalize());ray.far=3;
    assert(ray.intersectObjects(opaque,false).length===0,'forward eye sightline '+direction);
  }
  const face=visual.root.getObjectByName('Jesko digital instrument face')!;
  const target=face.getWorldPosition(new T.Vector3());ray.set(eye,target.clone().sub(eye).normalize());ray.far=eye.distanceTo(target)-.005;
  assert(ray.intersectObjects(opaque.filter(o=>!visual!.cockpitRoot.instrumentCluster.getObjectById(o.id)),false).length===0,'tach/gear central face visible from driver eye');
  const second=new VehicleVisual(v);const a=visual.root.getObjectByName('Jesko continuous widebody arch shell') as T.Mesh;
  const b=second.root.getObjectByName('Jesko continuous widebody arch shell') as T.Mesh;
  assert(a.material!==b.material,'paint materials owned by each instance');second.dispose();
  visual.updateInstruments({speedKmh:290,rpm:7800,gear:'D7',activeSpoilerDeployment:1});visual.root.updateMatrixWorld(true);
  assert(visual.getVisualBodyBounds().getSize(new T.Vector3()).y<=1.21001,'fully deployed wing remains in the declared height envelope');
} finally {lighting?.dispose();visual?.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
const report={assertions,errors,power:{peakKW,peakNm,boost},acceleration,lowSpeed,braking:{brakeTime,brakeDistance,absTicks,downshifts},
  lst:{jumped,jumpDuration},loads,stability,maxActuatorStep,thermal:{initial,...hot,cooldownC:thermal.temperatureC},visual:{bounds}};
mkdirSync('artifacts/jesko-attack',{recursive:true});writeFileSync('artifacts/jesko-attack/selftest-results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(errors.length)throw Error(errors.length+' Jesko assertions failed');
