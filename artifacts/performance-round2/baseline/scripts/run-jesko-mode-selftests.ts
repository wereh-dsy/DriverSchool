import {writeFileSync} from 'node:fs';
import {createJeskoAttackPhysicsConfig} from '../src/vehicle/config/jeskoAttackPhysicsConfig';
import {VehicleDynamics} from '../src/vehicle/physics/VehicleDynamics';
import {createNeutralVehicleInputState} from '../src/input/VehicleInputState';
const dt=1/120,input={...createNeutralVehicleInputState(),throttle:.40};
const results=[];
for(const mode of ['NORMAL','WET','SPORT','RACE'] as const){
 const c=createJeskoAttackPhysicsConfig(),car=new VehicleDynamics(c,{speed:80/3.6,gear:4,driveSelector:'D',engineRPM:4200});
 for(let n=0;n<4&&car.driveMode!==mode;n++)car.cycleDriveMode();
 const peak=JSON.stringify(c.engine.torqueCurve),mapped=car.driverThrottleCommand(.40);
 let snapshot=car.getSnapshot(),shifts=0,previous=snapshot.gear;
 for(let n=0;n<720;n++){
  snapshot=car.stepFixed(dt,input);if(snapshot.gear!==previous)shifts++;previous=snapshot.gear;
  if(snapshot.recoveredFromInvalidState)throw Error(mode+' invalid physics');
 }
 if(peak!==JSON.stringify(c.engine.torqueCurve)||!snapshot.driverAssists.absEnabled||!snapshot.driverAssists.tractionControlEnabled||!snapshot.driverAssists.stabilityControlEnabled)
  throw Error(mode+' power curve/aids changed');
 results.push({mode,mappedPedal:mapped,speedKmh:snapshot.speedKmh,gear:snapshot.gear,shifts,
   damping:car.suspension.getSnapshot().dampingMultiplier,
   shiftAt30Percent:c.transmission.lst!.shiftStrategy.map[1]!.upshiftRPM,
   tcsSlip:car.driverAssists.calibration.tcs.slipMultiplier});
}
const wet=results[1]!,comfort=results[0]!,sport=results[2]!,track=results[3]!;
if(!(wet.mappedPedal<comfort.mappedPedal&&comfort.mappedPedal<sport.mappedPedal&&sport.mappedPedal<track.mappedPedal))throw Error('pedal ordering');
if(!(track.shiftAt30Percent>sport.shiftAt30Percent&&wet.tcsSlip<track.tcsSlip&&track.damping>comfort.damping))throw Error('independent mode differences');
writeFileSync('artifacts/jesko-cockpit/mode-results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));