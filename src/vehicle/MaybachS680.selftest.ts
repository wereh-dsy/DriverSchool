import * as T from 'three';
import { createVehiclePhysicsConfig, getVehicleDescriptor, getNextVehicleId } from './VehicleCatalog';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { SteeringSystem } from './physics/SteeringSystem';
import { VehicleVisual } from './visual/VehicleVisual';
import { VehicleAssetRegistry } from './visual/VehicleAssetRegistry';
import { MaybachS680CenterDisplay } from './visual/MaybachS680Displays';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import { WHEEL_IDS, sampleWheelContacts } from './physics/WheelContact';
import { SURFACE_MATERIALS } from '../world/SurfaceMaterial';
import { calculateEngineAudioMix } from '../audio/EngineAudio';
import { MAYBACH_S680_AUDIO_PROFILE } from '../audio/MaybachS680AudioProfile';
import { AUDI_A6L_AUDIO_PROFILE, BMW_530LI_AUDIO_PROFILE, MERCEDES_EXECUTIVE_AUDIO_PROFILE } from '../audio/VehicleAudioProfile';
import { ICEHeatState } from './powertrain/ICEHeatState';
import { Engine } from './physics/Engine';
import { AutomaticTransmissionSystem } from './transmission/automatic/AutomaticTransmissionSystem';
import { Gearbox } from './physics/Gearbox';
import type { TransmissionContext } from './transmission/TransmissionSystem';

/** Bounded new-model acceptance; no historical artifacts or full-suite runner. */
export function runMaybachS680SelfTest() {
  const dt=1/120,neutral=createNeutralVehicleInputState();
  let checks=0;const assert=(ok:boolean,message:string)=>{checks++;if(!ok)throw new Error('Maybach S680: '+message);};
  const id='mercedes-maybach-s680-z223',descriptor=getVehicleDescriptor(id),c=createVehiclePhysicsConfig(id);
  assert(getNextVehicleId('mercedes-e300l-v214')===id&&c.engine.cylinderCount===12&&!c.mildHybrid,'catalog, V12, no hybrid');
  assert(c.engine.torqueCurve.every(p=>p.torque<=900)&&Math.abs(Math.max(...c.engine.torqueCurve.map(p=>p.rpm*p.torque*Math.PI/30))-450000)<1000,'900 Nm / 450 kW crank envelope');
  const dyno:Record<string,number>={};
  for(const rpm of [2000,4000,5500]){
    const engine=new Engine(c.engine);engine.reset(rpm,true);
    for(let n=0;n<480;n++){
      engine.currentRPM=rpm;engine.updateThrottle(1,dt);engine.integrate(dt,engine.getTorqueSample().netCrankTorque);
    }
    engine.currentRPM=rpm;dyno[rpm]=engine.getTorqueSample().netCrankTorque;
    assert(Math.abs(dyno[rpm]!-engine.getTorqueAtRPM(rpm))<4,'published net crank output after real friction at '+rpm+' rpm');
  }
  assert(dyno[5500]!*5500*Math.PI/30<=451000,'no power inflation to meet acceleration target');
  const copy=createVehiclePhysicsConfig(id);copy.steering.rearAxle!.maximumAngle=0;copy.transmission.automatic!.thermal!.derateStartC=0;
  assert(createVehiclePhysicsConfig(id).steering.rearAxle!.maximumAngle>0&&createVehiclePhysicsConfig(id).transmission.automatic!.thermal!.derateStartC===125,'detached calibration copies');
  const cold=new VehicleDynamics(createVehiclePhysicsConfig(id),{engineRunning:false,gear:'N',driveSelector:'P'});
  assert(cold.requestEngineStart(),'cold start accepted');let coldState=cold.getSnapshot();
  for(let n=0;n<840;n++)coldState=cold.stepFixed(dt,neutral);
  assert(coldState.engineRunning===true&&Math.abs(coldState.rpm-650)<100&&!coldState.recoveredFromInvalidState,'cold crank catches and settles to idle');
  const stopGo=new VehicleDynamics(createVehiclePhysicsConfig(id),{gear:1,driveSelector:'D'});
  let creep=0,stops=true;
  for(let cycle=0;cycle<3;cycle++){
    for(let n=0;n<480;n++){const s=stopGo.stepFixed(dt,{...neutral,throttle:cycle===0?0:.14});creep=Math.max(creep,s.speed);}
    for(let n=0;n<360;n++)stopGo.stepFixed(dt,{...neutral,brake:.6});
    const s=stopGo.getSnapshot();stops&&=Math.abs(s.speed)<.12&&s.engineRunning===true&&!s.recoveredFromInvalidState;
  }
  assert(creep>.15&&creep<12&&stops,'physical creep and repeated stops retain smooth idle');
  const modes:Record<string,unknown>={};
  for(const mode of ['NORMAL','SPORT','MAYBACH'] as const){
    const car=new VehicleDynamics(createVehiclePhysicsConfig(id),{gear:1,driveSelector:'D'});
    while(car.driveMode!==mode)car.cycleDriveMode();
    let finite=true,maximumJerk=0,previousAcceleration=0,shifts=0,lastGear=car.getSnapshot().gear;
    let peak:unknown;let minimumSplit=1,maximumSplit=0;const shiftSpeeds:number[]=[];
    for(let n=0;n<1920;n++){
      const s=car.stepFixed(dt,{...neutral,throttle:Math.min(.48,n/240*.48)});
      if(n===100)assert(s.gear===(mode==='MAYBACH'?2:1),mode+' mode-specific physical launch gear');
      finite&&=Number.isFinite(s.speed)&&Number.isFinite(s.rpm)&&!s.recoveredFromInvalidState;
      if(Math.abs(s.acceleration-previousAcceleration)/dt>maximumJerk){maximumJerk=Math.abs(s.acceleration-previousAcceleration)/dt;peak={n,speed:s.speedKmh,rpm:s.rpm,gear:s.gear,acceleration:s.acceleration,previousAcceleration,trans:s.transmission};}previousAcceleration=s.acceleration;
      if(s.gear!==lastGear){shifts++;shiftSpeeds.push(s.speedKmh);lastGear=s.gear;}
      const front=s.wheels.frontLeft.driveTorque+s.wheels.frontRight.driveTorque;
      const rear=s.wheels.rearLeft.driveTorque+s.wheels.rearRight.driveTorque;
      if(front+rear>20){const share=rear/(front+rear);minimumSplit=Math.min(minimumSplit,share);maximumSplit=Math.max(maximumSplit,share);}
    }
    const s=car.getSnapshot();
    assert(finite&&s.speedKmh>35&&shifts>=2&&maximumJerk<(mode==='SPORT'?25:mode==='MAYBACH'?12:15),mode+' gradual launch/shift stability '+JSON.stringify({finite,speed:s.speedKmh,shifts,maximumJerk,peak}));
    assert(Math.abs(minimumSplit-.69)<.005&&Math.abs(maximumSplit-.69)<.005,mode+' physical full-time axle split');
    modes[mode]={speedKmh:s.speedKmh,shifts,shiftSpeeds,maximumJerk};
  }
  const rack=new SteeringSystem(c.steering,c.wheelBase,c.frontTrackWidth);
  for(let n=0;n<600;n++)rack.update(dt,.8,2);const low=rack.rearRoadWheelAngle,frontLow=rack.steeringAngle;
  for(let n=0;n<600;n++)rack.update(dt,.8,36);const high=rack.rearRoadWheelAngle;
  assert(low<0&&high>0&&Math.abs(low)<=4.5*Math.PI/180,'bounded counter-phase and same-phase rear rack');
  const radius=c.wheelBase/(Math.tan(frontLow)-Math.tan(low)),withoutRear=c.wheelBase/Math.tan(frontLow);
  assert(radius<withoutRear*.9,'rear steering reduces kinematic turning radius');
  const accelerationCar=new VehicleDynamics(createVehiclePhysicsConfig(id),{gear:1,driveSelector:'D'});
  let zeroTo100=0,maximumAcceleration=0;
  for(let n=0;n<2400;n++){
    const s=accelerationCar.stepFixed(dt,{...neutral,throttle:1});
    if(!zeroTo100&&s.speedKmh>=100)zeroTo100=(n+1)*dt;
    maximumAcceleration=Math.max(maximumAcceleration,s.acceleration);
  }
  assert(zeroTo100>=4.35&&zeroTo100<=4.85&&accelerationCar.getSnapshot().speedKmh>150,'V12 full-load acceleration tracks 4.5 s reference without rollout');
  const fullModeTimes:Record<string,number>={NORMAL:zeroTo100};
  for(const mode of ['SPORT','MAYBACH'] as const){
    const car=new VehicleDynamics(createVehiclePhysicsConfig(id),{gear:1,driveSelector:'D'});
    while(car.driveMode!==mode)car.cycleDriveMode();
    for(let n=0;n<1200;n++)if(car.stepFixed(dt,{...neutral,throttle:1}).speedKmh>=100){fullModeTimes[mode]=(n+1)*dt;break;}
    assert(fullModeTimes[mode]!>0&&fullModeTimes[mode]!<7,mode+' full-load response remains available');
  }
  assert(fullModeTimes.SPORT!<=zeroTo100+.1&&fullModeTimes.MAYBACH!>zeroTo100,'mode response differences persist at full pedal');
  let brakePitch=0;
  for(let n=0;n<1200;n++){
    const s=accelerationCar.stepFixed(dt,{...neutral,brake:.65});brakePitch=Math.max(brakePitch,Math.abs(s.chassis.pitch));
  }
  assert(Math.abs(accelerationCar.getSnapshot().speed)<.12&&brakePitch>.002&&brakePitch<.15,'service braking stops the car with real restrained pitch');
  const cruise=new VehicleDynamics(createVehiclePhysicsConfig(id),{speed:36,engineRPM:1400,gear:9,driveSelector:'D'});
  let stable=true,maxRoll=0,maxPitch=0;
  for(let n=0;n<1440;n++){
    const s=cruise.stepFixed(dt,{...neutral,throttle:.23,steering:n>600&&n<840?.025:0});
    stable&&=!s.recoveredFromInvalidState&&Object.values(s.wheels).every(w=>Number.isFinite(w.normalLoad)&&w.normalLoad>=0);
    maxRoll=Math.max(maxRoll,Math.abs(s.chassis.roll));maxPitch=Math.max(maxPitch,Math.abs(s.chassis.pitch));
  }
  assert(stable&&maxRoll<.15&&maxPitch<.15,'highway body/tyre stability');
  assert(cruise.suspension.rideHeightTarget===.130,'delayed highway air suspension lowering');
  const bumps:Record<string,unknown>={};
  for(const mode of ['NORMAL','SPORT','MAYBACH'] as const){
    const car=new VehicleDynamics(createVehiclePhysicsConfig(id),{speed:3,gear:'N',driveSelector:'N',z:5});
    while(car.driveMode!==mode)car.cycleDriveMode();
    let peakAcceleration=0,peakPitch=0,peakRoll=0,finite=true,peakSpringDelta=0;
    for(let n=0;n<1440;n++){
      const ground={sampleRoadSurface(x:number,z:number){
        const a=Math.exp(-((z/.65)**2)),side=x<0?1:.65;
        const slope=-2*z/(.65*.65)*.045*a*side;
        const norm=Math.hypot(1,slope);
        return {...SURFACE_MATERIALS.asphalt,height:.045*a*side,gradient:new T.Vector2(0,slope),grade:Math.atan(slope),gripMultiplier:1,rollingResistanceMultiplier:1,normal:new T.Vector3(0,1/norm,-slope/norm)};
      }};
      const contacts=sampleWheelContacts(ground,{x:car.x,z:car.z,yaw:car.yaw},c);
      const s=car.stepFixed(dt,neutral,{wheelContacts:contacts});
      peakAcceleration=Math.max(peakAcceleration,Math.abs(s.chassis.verticalAcceleration));
      peakPitch=Math.max(peakPitch,Math.abs(s.chassis.pitch));peakRoll=Math.max(peakRoll,Math.abs(s.chassis.roll));
      peakSpringDelta=Math.max(peakSpringDelta,Math.abs(s.wheels.frontLeft.suspensionCompression-s.wheels.rearLeft.suspensionCompression));
      finite&&=!s.recoveredFromInvalidState&&Object.values(s.wheels).every(w=>Number.isFinite(w.normalLoad));
    }
    const s=car.getSnapshot(),load=Object.values(s.wheels).reduce((sum,w)=>sum+w.normalLoad,0);
    assert(finite&&peakSpringDelta>.003&&peakAcceleration<30&&peakPitch<.15&&peakRoll<.12,mode+' physical bump response');
    assert(WHEEL_IDS.every(id=>s.wheels[id].grounded)&&Math.abs(load-s.effectiveVehicleMass*c.gravity)<s.effectiveVehicleMass*c.gravity*.08,mode+' recovered four-wheel load support');
    bumps[mode]={peakAcceleration,peakPitch,peakRoll,rideOffset:s.chassis.rideOffset,load};
  }
  const heat=new ICEHeatState(c.engine.thermal!);
  for(let n=0;n<3600;n++)heat.update(1,450000,0,20);
  assert(heat.temperatureC>115&&heat.torqueFactor<1,'V12 stationary heat soak derates physical torque');
  const context:TransmissionContext={dt:1/120,engineAngularVelocity:300,engineRPM:2865,engineRunning:true,
    engineInertia:1,idleRPM:650,stallRPM:350,redlineRPM:6200,availableEngineTorque:850,throttle:.8,
    brake:0,vehicleSpeed:0,drivenWheelAngularVelocity:0};
  // Accelerated ATF fixture changes heat capacity only, preserving real loss calculation.
  const hotConfig={...c.transmission.automatic!,thermal:{...c.transmission.automatic!.thermal!,heatCapacityJPerK:1000}};
  const hot=new AutomaticTransmissionSystem(new Gearbox(c.transmission),hotConfig,c.wheelRadius);hot.reset(1,'D');
  let limit=1;for(let n=0;n<480;n++){limit=hot.prepare(context).throttleScale;hot.update(context);}
  assert(hot.getSnapshot().thermal!.temperatureC>125&&limit<1,'ATF slip loss heating and normal-path throttle protection');
  const inside=calculateEngineAudioMix(2000,.4,{engineLoad:.4,vehicleSpeed:30,engineCharacter:c.engine,profile:MAYBACH_S680_AUDIO_PROFILE,cockpit:true});
  const outside=calculateEngineAudioMix(2000,.4,{engineLoad:.4,vehicleSpeed:30,engineCharacter:c.engine,profile:MAYBACH_S680_AUDIO_PROFILE,cockpit:false});
  assert(inside.firingHz===200&&outside.firingHz===200&&outside.exhaust>inside.exhaust*3&&inside.exhaustCutoffHz<outside.exhaustCutoffHz&&inside.cabinLowpassHz===1350&&outside.cabinLowpassHz===20000,'V12 firing density and distinct interior/exterior spectra');
  for(const profile of [AUDI_A6L_AUDIO_PROFILE,MERCEDES_EXECUTIVE_AUDIO_PROFILE,BMW_530LI_AUDIO_PROFILE]){
    const executive=calculateEngineAudioMix(2000,.4,{engineLoad:.4,vehicleSpeed:30,profile,cockpit:true});
    assert(inside.exhaust<executive.exhaust&&inside.road<executive.road&&inside.wind<executive.wind,'quietest executive cabin mix');
  }
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),strings:string[]=[];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>{
    const context=new Proxy<Record<string,unknown>>({}, {get(target,key:string){
      if(key in target)return target[key];if(key==='fillText')return (s:string)=>strings.push(s);
      if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop:()=>{}});
      if(key==='measureText')return (s:string)=>({width:s.length*12});return ()=>{};
    },set(target,key:string,value){target[key]=value;return true;}});
    return {width:0,height:0,getContext:()=>context};
  }}});
  const registry=new VehicleAssetRegistry();let visual:VehicleVisual|undefined,second:VehicleVisual|undefined;
  let meshes=0,vertices=0;
  try{
    visual=new VehicleVisual(descriptor.visualConfig,registry);second=new VehicleVisual(descriptor.visualConfig,registry);
    const required=['Maybach vertical waterfall grille','Maybach standing bonnet star','Maybach live portrait centre navigation screen',
      'Maybach live instrument face','Rear left executive independent cushion','Rear right executive reclining sculpted back',
      'Maybach continuous waterfall console and display support','Maybach integrated instrument pedestal',
      'Driver live rear navigation screen','Front passenger live rear navigation screen','Maybach full length rear centre console'];
    assert(required.every(name=>!!visual!.root.getObjectByName(name)),'complete independent Z223 exterior/HMI/rear furniture');
    const face=(name:string)=>visual!.root.getObjectByName(name) as T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>;
    const center=face('Maybach live portrait centre navigation screen'),instrument=face('Maybach live instrument face'),glass=face('Maybach centre display black glass bezel');
    assert(center.material!==instrument.material&&center.material!==glass.material&&instrument.material!==glass.material,'screen/instrument/glass material isolation');
    const other=second.root.getObjectByName(center.name) as T.Mesh;
    assert(center.material!==other.material&&center.material.map!==(other.material as T.MeshPhysicalMaterial).map,'display isolation across instances');
    visual.root.traverse(o=>{if(o instanceof T.Mesh){meshes++;const p=o.geometry.getAttribute('position');vertices+=p.count;
      for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)))throw new Error('non-finite Maybach mesh '+o.name);}});
    assert(meshes<330&&vertices<220000,'texture-first bounded mesh/vertex budget');
    visual.updateInstruments({speedKmh:88,rpm:1800,gear:'D7',driveMode:'MAYBACH',ignitionOn:true,engineRunning:true,
      fuelLevel:.65,coolantTemperatureC:92,indicators:{autoHold:true}},1);
    assert(strings.includes('MAYBACH')&&strings.includes('88')&&strings.includes('D7')&&strings.includes('92 °C'),'dedicated instrument and portrait HMI draw live telemetry');
    assert(strings.includes('V12  ·  WELCOME'),'designed ignition welcome retains live driving readings');
    const lit=visual.root.getObjectByName('Front Maybach indirect footwell illumination') as T.PointLight;
    assert(lit.intensity>0,'ignition welcome illuminates indirect cabin lighting');
    for(let n=0;n<180;n++)visual.updateInstruments({speedKmh:0,rpm:0,gear:'P',ignitionOn:false},dt);
    assert(lit.intensity<.0001&&center.material.emissiveIntensity===0,'shutdown extinguishes screens and smoothly fades ambient lighting');
    const display=new MaybachS680CenterDisplay();display.update({speedKmh:0,rpm:650,gear:'P'},1);
    assert(display.canvas.width===768&&display.canvas.height===1024&&display.click(new T.Vector2(.5,.13))&&display.page==='vehicle','portrait screen aspect and matching tab hit region');
    const clickOff=new MaybachS680CenterDisplay();clickOff.update({speedKmh:0,rpm:0,gear:'P',ignitionOn:false},1);
    assert(!clickOff.click(new T.Vector2(.5,.13)),'ignition-off screens cannot take commands');
    display.texture.dispose();display.rearTexture.dispose();clickOff.texture.dispose();clickOff.rearTexture.dispose();
  }finally{visual?.dispose();second?.dispose();registry.dispose();if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else Reflect.deleteProperty(globalThis,'document');}
  return {checks,coldIdleRPM:coldState.rpm,creepPeakMps:creep,modes,bumps,performance:{zeroTo100,fullModeTimes,dyno,maximumAcceleration,brakePitch},rearSteering:{low,high,radius,withoutRear},
    highway:{maxRoll,maxPitch},audio:{inside,outside},geometry:{meshes,vertices}};
}
