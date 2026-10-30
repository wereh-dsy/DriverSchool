import { readFileSync,writeFileSync } from 'node:fs';
import { runVehicleAerodynamicsSelfTest } from '../src/vehicle/physics/VehicleAerodynamics.selftest';
import { runChassisDynamicsSelfTest } from '../src/vehicle/physics/ChassisDynamics.selftest';
import { runUnsprungWheelDynamicsSelfTest } from '../src/vehicle/physics/UnsprungWheelDynamics.selftest';
import { runSU7MaxSelfTest } from '../src/vehicle/SU7Max.selftest';
import { createVehiclePhysicsConfig } from '../src/vehicle/VehicleCatalog';
import { VehicleAerodynamics } from '../src/vehicle/physics/VehicleAerodynamics';
import { measureSU7Aerodynamics,measureLegacyAero } from './measure-su7-aerodynamics';

const directory='artifacts/su7-aerodynamics';
const before=JSON.parse(readFileSync(`${directory}/before.json`,'utf8')) as {
  su7:ReturnType<typeof measureSU7Aerodynamics>;legacy:ReturnType<typeof measureLegacyAero>};
const after=JSON.parse(readFileSync(`${directory}/after.json`,'utf8')) as typeof before;
let comparisons=0;
function assert(ok:boolean,message:string){comparisons++;if(!ok)throw Error('SU7 aero comparison: '+message);}
assert(after.su7.calibrationExceptAeroSHA256===before.su7.calibrationExceptAeroSHA256,'mass/power/battery/tyres/aids unchanged');
assert(JSON.stringify(before.legacy)===JSON.stringify(after.legacy),'three legacy trajectories and loads exactly unchanged');
assert(after.su7.zeroTo100Seconds>=before.su7.zeroTo100Seconds-1/120&&after.su7.zeroTo100Seconds<before.su7.zeroTo100Seconds+.05,'no artificial acceleration improvement');
assert(after.su7.topSpeedKmh<before.su7.topSpeedKmh&&after.su7.topSpeedKmh>260&&after.su7.lastSecondTopChangeKmh<.01,'power/drag equilibrium below safety clamp');
assert(after.su7.coastAfter5sKmh<before.su7.coastAfter5sKmh&&after.su7.brakeAfter3sKmh<before.su7.brakeAfter3sKmh,'drag and actual loads affect coast/braking');
const c=createVehiclePhysicsConfig('xiaomi-su7-max-2026');
for(let i=0;i<after.su7.loads.length;i++) {
  const a=after.su7.loads[i]!,b=before.su7.loads[i]!;
  const expectedTotal=c.mass*c.gravity-a.frontAeroN-a.rearAeroN;
  assert(Math.abs(a.frontLoadN+a.rearLoadN-expectedTotal)<1,'normal reactions balance weight plus aero, not double load');
  if(a.targetKmh>90) {
    assert(a.rearAeroN<b.rearAeroN&&Math.abs(a.frontAeroN-b.frontAeroN)<.001,'wing changes rear lift only');
    assert(Math.abs((a.rearLoadN-b.rearLoadN)+(a.rearAeroN-b.rearAeroN))<1,'rear downforce becomes real rear wheel reactions');
    assert(Math.abs(a.pitch-b.pitch)<.003&&Math.abs(a.heave-b.heave)<.004,'limited pitch and spring compression change');
  } else assert(JSON.stringify(a)===JSON.stringify(b),'low-speed behavior unchanged');
}
for(const s of after.su7.stability)assert(!s.recovered&&s.safety===0&&s.minWheelLoad>0&&s.maxRoll<.03&&s.maxSlip<.04,'stable '+s.name);
const candidates=[-.030,-.045,-.060].map(delta=>{
  const aero=new VehicleAerodynamics({...c.aero,activeSpoiler:{...c.aero.activeSpoiler!,rearLiftCoefficientDelta:delta}});
  for(let n=0;n<600;n++)aero.update(1/120,200/3.6);
  return {rearLiftCoefficientDelta:delta,rearAeroN:aero.rearVerticalForce,dragN:aero.dragForce};
});
const result={aerodynamics:runVehicleAerodynamicsSelfTest(),comparisons,candidates,
  su7:runSU7MaxSelfTest(),chassis:runChassisDynamicsSelfTest(),unsprung:runUnsprungWheelDynamicsSelfTest()};
writeFileSync(`${directory}/selftest-results.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
