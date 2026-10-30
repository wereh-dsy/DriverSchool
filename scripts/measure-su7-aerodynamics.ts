import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createVehiclePhysicsConfig } from '../src/vehicle/VehicleCatalog';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { ElectricPowertrain } from '../src/vehicle/powertrain/ElectricPowertrain';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import type { ElectricVehiclePhysicsConfig } from '../src/vehicle/config/ElectricVehiclePhysicsConfig';
import type { Powertrain } from '../src/vehicle/powertrain/Powertrain';

const dt=1/120,input=createNeutralVehicleInputState();
export function measureSU7Aerodynamics(c:ElectricVehiclePhysicsConfig) {
  const make=(speed=0,selector:'D'|'N'='D')=>new VehicleDynamics<ElectricPowertrain>(structuredClone(c),{speed,stateOfCharge:.8,driveSelector:selector});
  const launch=make();launch.cycleDriveMode();let zeroTo100Seconds=Infinity;
  for(let n=0;n<1200;n++){const s=launch.stepFixed(dt,{...input,throttle:1});if(s.speedKmh>=100){zeroTo100Seconds=(n+1)*dt;break;}}
  const top=make(65);let previousTop=0;
  for(let n=0;n<4800;n++){if(n===4680)previousTop=top.speed*3.6;top.stepFixed(dt,{...input,throttle:1});}
  const topState=top.getSnapshot();
  const coast=make(200/3.6);for(let n=0;n<600;n++)coast.stepFixed(dt,input);
  const brake=make(200/3.6);for(let n=0;n<360;n++)brake.stepFixed(dt,{...input,brake:1});
  const loads=[10,100,200,265].map(kmh=>{
    const target=kmh/3.6,car=make(target,'N');let s=car.getSnapshot();
    // A longitudinal dynamometer actuator holds the speed through real forces.
    // It never assigns speed/pose or overwrites a tyre's normal reaction.
    for(let n=0;n<960;n++) {
      const actuator=-s.forces.aerodynamicDragForce-s.forces.rollingResistanceForce+(target-car.speed)*c.mass*2;
      s=car.stepFixed(dt,input,{externalLongitudinalForce:actuator});
    }
    return {targetKmh:kmh,speedKmh:s.speedKmh,dragN:s.forces.aerodynamicDragForce,
      frontAeroN:s.frontAeroVerticalForce,rearAeroN:s.rearAeroVerticalForce,
      frontLoadN:s.wheels.frontLeft.normalLoad+s.wheels.frontRight.normalLoad,
      rearLoadN:s.wheels.rearLeft.normalLoad+s.wheels.rearRight.normalLoad,
      pitch:s.chassis.pitch,heave:s.chassis.chassisY,verticalAcceleration:s.chassis.verticalAcceleration};
  });
  const stability=['high-speed-turn','continuous-lane-change'].map(name=>{
    const car=make(180/3.6);let maxRoll=0,maxPitch=0,maxSlip=0,maxYaw=0,minWheelLoad=Infinity,recovered=false,safety=0;
    for(let n=0;n<1200;n++) {
      const t=n*dt,steering=name==='high-speed-turn'?(t<2?0:t<5?.045:0):.06*Math.sin(Math.PI*t);
      const s=car.stepFixed(dt,{...input,steering,throttle:.25});
      maxRoll=Math.max(maxRoll,Math.abs(s.chassis.roll));maxPitch=Math.max(maxPitch,Math.abs(s.chassis.pitch));
      maxSlip=Math.max(maxSlip,Math.abs(s.bodySlipAngle));maxYaw=Math.max(maxYaw,Math.abs(s.yawRate));
      minWheelLoad=Math.min(minWheelLoad,...Object.values(s.wheels).map(w=>w.normalLoad));
      recovered ||= s.recoveredFromInvalidState;safety=Math.max(safety,s.chassis.safetyInterventions);
    }
    return {name,maxRoll,maxPitch,maxSlip,maxYaw,minWheelLoad,recovered,safety};
  });
  const {aero:_aero,...unchanged}=c;
  return {calibrationExceptAeroSHA256:createHash('sha256').update(JSON.stringify(unchanged)).digest('hex'),
    zeroTo100Seconds,topSpeedKmh:top.speed*3.6,lastSecondTopChangeKmh:top.speed*3.6-previousTop,
    topMotorPowerKW:(topState.powertrain.ev!.frontDriveUnit!.mechanicalPower+topState.powertrain.ev!.rearDriveUnit!.mechanicalPower)/1000,
    topPackPowerKW:topState.powertrain.ev!.batteryPowerKw,coastAfter5sKmh:coast.speed*3.6,brakeAfter3sKmh:brake.speed*3.6,loads,stability};
}
export function measureLegacyAero() {
  return ['tesla-model-3-rwd','porsche-taycan-4s','family-sedan'].map(id=>{
    const c=createVehiclePhysicsConfig(id as Parameters<typeof createVehiclePhysicsConfig>[0]);
    const car=new VehicleDynamics<Powertrain>(c,{speed:45,driveSelector:'N',gear:'N'});
    let s=car.getSnapshot();for(let n=0;n<600;n++)s=car.stepFixed(dt,input);
    return {id,speed:s.speed,yaw:s.yaw,pitch:s.chassis.pitch,roll:s.chassis.roll,dragN:s.forces.aerodynamicDragForce,
      frontAeroN:s.frontAeroVerticalForce,rearAeroN:s.rearAeroVerticalForce,
      loads:Object.values(s.wheels).map(w=>w.normalLoad)};
  });
}
if(process.argv.some(arg=>arg.startsWith('--phase='))) {
  const phase=process.argv.find(arg=>arg.startsWith('--phase='))!.slice(8);
  if(phase!=='before'&&phase!=='after')throw Error('phase must be before or after');
  const result={su7:measureSU7Aerodynamics(createVehiclePhysicsConfig('xiaomi-su7-max-2026')),legacy:measureLegacyAero()};
  mkdirSync('artifacts/su7-aerodynamics',{recursive:true});
  writeFileSync(`artifacts/su7-aerodynamics/${phase}.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
