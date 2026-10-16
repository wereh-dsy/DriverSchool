import { runExecutiveCabinSelfTest } from '../src/vehicle/visual/ExecutiveCabin.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runVehicleStructureSelfTest } from '../src/vehicle/visual/VehicleStructure.selftest';
import { runDriverViewSelfTest } from '../src/vehicle/visual/DriverView.selftest';
console.log(JSON.stringify({ cabin: runExecutiveCabinSelfTest(), lighting: runVehicleLightingSelfTest(),
  structure: runVehicleStructureSelfTest(), driverView: runDriverViewSelfTest() }, null, 2));
