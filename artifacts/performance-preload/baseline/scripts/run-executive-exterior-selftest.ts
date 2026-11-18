import { runExecutiveExteriorSelfTest } from '../src/vehicle/visual/ExecutiveExterior.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runVehicleStructureSelfTest } from '../src/vehicle/visual/VehicleStructure.selftest';
console.log(JSON.stringify({ exterior: runExecutiveExteriorSelfTest(), lighting: runVehicleLightingSelfTest(), structure: runVehicleStructureSelfTest() }, null, 2));
