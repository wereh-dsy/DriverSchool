import {createVehiclePhysicsConfig} from '../../src/vehicle/VehicleCatalog';
import {VehicleDynamics} from '../../src/vehicle/physics/VehicleDynamics';
import {createNeutralVehicleInputState} from '../../src/input/VehicleInputState';
const c=createVehiclePhysicsConfig('executive-lwb-2t'),input=createNeutralVehicleInputState(),car=new VehicleDynamics(c,{engineRunning:false,vehicleOperational:false,driveAvailable:false,currentFuelL:30,gear:'N',driveSelector:'N'});
let s=car.getSnapshot(),before=s;
for(let n=0;n<2400;n++){before=s;s=car.stepFixed(1/120,input);}
console.log(JSON.stringify({beforeMass:before.effectiveVehicleMass,mass:s.effectiveVehicleMass,fuel:s.fuel,engine:s.engineRunning,speed:s.speedKmh,chassis:s.chassis,load:Object.values(s.wheels).reduce((v,w)=>v+w.normalLoad,0),massG:before.effectiveVehicleMass*c.gravity,suspension:(car as any).suspension.getSnapshot()},null,2));
