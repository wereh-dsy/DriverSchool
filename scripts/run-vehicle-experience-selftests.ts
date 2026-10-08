import { runVehicleExperienceSelfTest, runCruiseVehicleExperienceSelfTest } from '../src/vehicle/physics/VehicleExperience.selftest';
console.log(JSON.stringify({ experience: runVehicleExperienceSelfTest(), cruise: runCruiseVehicleExperienceSelfTest() }, null, 2));
