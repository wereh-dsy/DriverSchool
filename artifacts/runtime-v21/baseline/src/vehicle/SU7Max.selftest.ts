import * as T from 'three';
import { createVehiclePhysicsConfig, getVehicleDescriptor, VEHICLE_CATALOG } from './VehicleCatalog';
import { validateVehiclePlatformConfig } from './config/validateVehiclePlatformConfig';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { ElectricPowertrain } from './powertrain/ElectricPowertrain';
import { BatteryPack } from './powertrain/BatteryPack';
import { ElectricMotor } from './powertrain/ElectricMotor';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import { VehicleVisual } from './visual/VehicleVisual';
import { VehicleAssetRegistry } from './visual/VehicleAssetRegistry';
import { VehicleLighting } from './visual/VehicleLighting';
import { VEHICLE_WHEEL_IDS, localWheelPositions } from './VehicleDimensions';
import type { PowertrainUpdateContext } from './powertrain/Powertrain';
import { createWheelContactBuffer } from './physics/WheelContact';
import { SURFACE_MATERIALS } from '../world/SurfaceMaterial';

/** Only SU7 fixtures are simulated; no fleet/full-platform suite. */
export function runSU7MaxSelfTest() {
  let assertions=0;
  const assert=(condition:boolean,label:string)=>{assertions++;if(!condition)throw Error('SU7 Max: '+label);};
  const dt=1/120,id='xiaomi-su7-max-2026',descriptor=getVehicleDescriptor(id),c=createVehiclePhysicsConfig(id);
  validateVehiclePlatformConfig(c,descriptor.visualConfig);
  assert(VEHICLE_CATALOG.some(v=>v.id===id),'selectable catalog entry');
  assert(!('engine' in c)&&!('fuel' in c)&&!('clutch' in c),'no ICE hardware');
  const cap=descriptor.capabilities;
  assert(cap.awd&&cap.multiMotor&&!cap.evMultiSpeed&&cap.airSuspension&&cap.adaptiveDamping,'installed topology');
  assert(cap.abs&&cap.ebd&&cap.tcs&&cap.esc&&cap.electronicParkingBrake&&cap.autoHold,'normal safety and hold paths');
  const units=c.driveUnits!;
  assert(units.reduce((s,u)=>s+u.motor.maxDrivePower,0)===508000,'508 kW aggregate shaft ceiling');
  assert(units.reduce((s,u)=>s+u.motor.maxDriveTorque,0)===866,'866 Nm aggregate rotor ceiling');
  assert(units.every(u=>!('type' in u.transmission)),'both axles single speed');
  const detached=createVehiclePhysicsConfig(id);detached.driveUnits![0]!.motor.maxDriveTorque=1;
  assert(createVehiclePhysicsConfig(id).driveUnits![0]!.motor.maxDriveTorque===338,'deep spawn isolation');
  const front=new ElectricMotor(units[0]!.motor),rear=new ElectricMotor(units[1]!.motor);
  assert(front.efficiency(20)<rear.efficiency(20),'induction surrogate has greater light-load loss');
  front.setShaftSpeed(900);rear.setShaftSpeed(900);
  assert(Math.abs(front.driveLimit(Infinity)*900-220000)<1&&Math.abs(rear.driveLimit(Infinity)*900-288000)<1,'consistent base speed and constant power');
  const battery=new BatteryPack(c.battery),nominal=battery.availableDischargePower,regen=battery.availableChargePower;
  battery.setStateOfCharge(1);assert(battery.availableChargePower===0,'full SOC rejects regen');
  assert(Math.abs(battery.openCircuitVoltage-897)<1,'897 V peak, not nominal voltage');
  battery.setStateOfCharge(.02);assert(battery.availableDischargePower<nominal*.1,'low SOC derating');
  battery.setStateOfCharge(.8);battery.thermal!.temperature=-10;
  assert(battery.availableDischargePower<nominal&&battery.availableChargePower<regen*.15,'cold pack charge/discharge limits');
  battery.thermal!.temperature=66;assert(battery.availableDischargePower<nominal*.5,'hot pack derating');
  const coldPower=front.availablePower;front.thermal!.temperature=137;
  assert(front.availablePower<coldPower&&front.availablePower===front.config.continuousPower,'motor heat reduces peak to continuous rating');
  const input=createNeutralVehicleInputState();
  const car=(speed=0,soc=.8)=>new VehicleDynamics<ElectricPowertrain>(createVehiclePhysicsConfig(id),{speed,stateOfCharge:soc,driveSelector:'D'});
  const p=new ElectricPowertrain(c);p.reset({driveSelector:'D'});
  const ctx:PowertrainUpdateContext={dt,vehicleSpeed:28,vehicleLateralSpeed:0,throttle:1,brake:0,
    drivenWheelAngularVelocity:28/c.wheelRadius,torqueLimitFactor:1,clutchPedal:0,driveMode:'SPORT'};
  for(let n=0;n<120;n++){p.prepare(ctx);p.update(ctx);p.finishStep(28);}
  const ev=p.getSnapshot().ev!;
  const shaftPowerKW=(ev.frontDriveUnit!.mechanicalPower+ev.rearDriveUnit!.mechanicalPower)/1000;
  assert(shaftPowerKW>500&&shaftPowerKW<=508.01,`combined shaft power ceiling: ${shaftPowerKW}`);
  assert(ev.batteryPowerKw>shaftPowerKW&&ev.batteryPowerKw<=c.battery.maxDischargePower/1000+.1,'shared pack funds both motors plus losses');
  p.frontDriveUnit!.inverter.thermal.temperature=145;
  const hotFront=p.frontDriveUnit!.powerLimit;
  assert(hotFront<units[0]!.motor.maxDrivePower&&p.rearDriveUnit!.powerLimit>270000,'independent inverter thermal limits');
  const selector=new VehicleDynamics<ElectricPowertrain>(createVehiclePhysicsConfig(id),{driveSelector:'P'});
  assert(selector.requestDriveSelector('D',1),'brake interlocked D request');
  assert(selector.powertrain.frontDriveUnit!.transmission.mode==='D'&&selector.powertrain.rearDriveUnit!.transmission.mode==='D','both units follow selector');
  const launch=car();launch.cycleDriveMode();let zeroTo100=Infinity,maxSideslip=0;
  for(let n=0;n<960;n++) {
    const s=launch.stepFixed(dt,{...input,throttle:1});
    assert(!s.recoveredFromInvalidState,'finite physical acceleration');
    maxSideslip=Math.max(maxSideslip,Math.abs(s.lateralVelocity));
    if(s.speedKmh>=100){zeroTo100=(n+1)*dt;break;}
  }
  assert(zeroTo100>2.85&&zeroTo100<3.45,`physical 0–100 target near OEM 3.08 s, measured ${zeroTo100}`);
  assert(maxSideslip<.05,'straight launch does not generate spurious lateral motion');
  const top=car(65);
  for(let n=0;n<4800;n++){const s=top.stepFixed(dt,{...input,throttle:1});assert(!s.recoveredFromInvalidState,'finite top speed');}
  const topSpeed=top.speed*3.6;
  assert(topSpeed>259&&topSpeed<271,`physical top speed near 265 km/h, measured ${topSpeed}`);
  assert(top.speed<c.safety.maxForwardSpeed-5,'motor envelope, not safety clamp, limits top speed');
  const brake=car(25),startEnergy=brake.powertrain.battery.remainingEnergyKWh;
  for(let n=0;n<180;n++)brake.stepFixed(dt,{...input,brake:.35});
  assert(brake.speed<22&&brake.powertrain.battery.remainingEnergyKWh>startEnergy,'hydraulic blending recovers physical energy');
  const locked=new ElectricPowertrain(c);locked.reset({driveSelector:'D'});
  const bctx={...ctx,throttle:0,brake:.7,totalServiceBrakeTorque:6000,frontAxleBrakeTorque:3000,rearAxleBrakeTorque:3000};
  for(let n=0;n<30;n++){locked.prepare(bctx);locked.update(bctx);locked.finishStep(28);}
  assert(locked.axleOutput.regenerativeWheelTorque!==0,'regen before ABS intervention');
  locked.limitAxleRegeneration(0,0);
  assert(locked.frontDriveUnit!.motor.deliveredDriveTorque===0&&locked.rearDriveUnit!.motor.deliveredDriveTorque===0,'same-step ABS authority on both motors');
  const normal=car(15),sport=car(15);sport.cycleDriveMode();
  let maxRoll=0;
  for(let n=0;n<240;n++){
    const a=normal.stepFixed(dt,{...input,steering:.15,throttle:.10});
    const b=sport.stepFixed(dt,{...input,steering:.15,throttle:.10});
    assert(!a.recoveredFromInvalidState&&!b.recoveredFromInvalidState,'finite corner and suspension response');
    maxRoll=Math.max(maxRoll,Math.abs(b.chassis.roll));
  }
  assert(maxRoll>.001&&maxRoll<.16,'nonzero bounded physical roll');
  const sportChassis=sport.getSnapshot().chassis,normalChassis=normal.getSnapshot().chassis;
  assert(sportChassis.rideOffset<normalChassis.rideOffset,'sport air suspension changes physical rest height smoothly');
  assert(sport.suspension.getSnapshot().dampingMultiplier>normal.suspension.getSnapshot().dampingMultiplier*1.2,'CDC sport damping changes actual dampers');
  const wet=createWheelContactBuffer();
  for(const wheel of VEHICLE_WHEEL_IDS)Object.assign(wet[wheel],SURFACE_MATERIALS['wet-asphalt']);
  const wetLaunch=car(),wetBrake=car(25);let tcsSeen=false,absSeen=false;
  // Allow three seconds for a 90 km/h wet-road stop; a two-second window
  // incorrectly demanded dry-road deceleration from this lower-mu surface.
  for(let n=0;n<360;n++){
    const drive=wetLaunch.stepFixed(dt,{...input,throttle:1},{wheelContacts:wet});
    const stop=wetBrake.stepFixed(dt,{...input,brake:1},{wheelContacts:wet});
    assert(!drive.recoveredFromInvalidState&&!stop.recoveredFromInvalidState,'wet traction/braking remain finite');
    tcsSeen ||= drive.driverAssists.tcsActive;absSeen ||= stop.driverAssists.absActive;
  }
  assert(tcsSeen&&absSeen,'wet asphalt exercises real TCS and ABS');
  assert(wetLaunch.speed>2&&wetBrake.speed<12,`wet traction/braking: launch ${wetLaunch.speed} m/s, brake ${wetBrake.speed} m/s`);
  const metrics={zeroTo100Seconds:zeroTo100,topSpeedKmh:topSpeed,maxRollRadians:maxRoll,
    shaftPowerKW,packPowerKW:ev.batteryPowerKw,accelerationEnergyKWh:launch.powertrain.getSnapshot().ev!.energyUsedKWh};
  // Canvas fallback tests geometry/resource contracts only, never visual appearance.
  const needsDocument=typeof document==='undefined';
  if(needsDocument)Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:1,height:1,getContext:()=>null})}});
  const assets=new VehicleAssetRegistry(),visual=new VehicleVisual(descriptor.visualConfig,assets),other=new VehicleVisual(descriptor.visualConfig,assets);
  const lighting=new VehicleLighting(visual);
  try {
    const anchors=localWheelPositions(c),offset=descriptor.visualConfig.staticBodyOffsetY??0;
    for(const wheel of VEHICLE_WHEEL_IDS){const pos=visual.wheelPivots[wheel].position,a=anchors[wheel];
      assert(Math.hypot(pos.x-a.x,pos.y+offset-a.y,pos.z-a.z)<1e-7,'wheel/collision datum '+wheel);}
    for(const name of ['SU7 panoramic glass roof','SU7 continuous halo tail lamp','Left SU7 waterdrop DRL','SU7 game-adapted driver instrument','SU7 16.1 inch centre display','SU7 steering wheel rim'])
      assert(!!visual.root.getObjectByName(name),'dedicated exterior/cabin '+name);
    const mesh=(v:VehicleVisual,name:string)=>v.root.getObjectByName(name) as T.Mesh;
    const map=mesh(visual,'SU7 isolated navigation display').material;
    assert(map!==mesh(visual,'SU7 sculpted upper dashboard').material&&map!==mesh(other,'SU7 isolated navigation display').material,'navigation and instances own isolated materials');
    assert(mesh(visual,'SU7 rear diffuser').material!==mesh(other,'SU7 rear diffuser').material,'cached static geometry clones mutable materials');
    const spoiler=visual.root.getObjectByName('SU7 electric spoiler')!,baseY=spoiler.position.y;
    visual.updateInstruments({speedKmh:110,rpm:0,gear:'D',activeSpoilerDeployment:1},1);
    assert(spoiler.position.y>baseY+.09,'electric spoiler deploys');
    visual.updateInstruments({speedKmh:60,rpm:0,gear:'D',activeSpoilerDeployment:0},2);
    assert(spoiler.position.y<baseY+.01,'electric spoiler retracts with hysteresis');
    let triangles=0,invalid=0;
    visual.root.traverse(o=>{if(o instanceof T.Mesh){const p=o.geometry.getAttribute('position');triangles+=(o.geometry.index?.count??p.count)/3;
      for(let n=0;n<p.count;n++)if(!Number.isFinite(p.getX(n)+p.getY(n)+p.getZ(n)))invalid++;}});
    assert(invalid===0&&triangles<80000,'bounded finite geometry');
    const bodyBounds=new T.Box3();visual.exteriorRoot.updateMatrixWorld(true);
    visual.exteriorRoot.traverse(o=>{if(o instanceof T.Mesh&&!o.userData.wheelId){
      o.geometry.computeBoundingBox();bodyBounds.union(o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});
    assert(bodyBounds.max.z-bodyBounds.min.z<c.length*1.01,'exterior length remains inside collision datum tolerance');
    return {assertions,...metrics,triangles};
  } finally {lighting.dispose();visual.dispose();other.dispose();assets.dispose();if(needsDocument)Reflect.deleteProperty(globalThis,'document');}
}
