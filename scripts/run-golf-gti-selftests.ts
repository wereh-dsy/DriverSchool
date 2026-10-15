import { runGolfGTISelfTest } from '../src/vehicle/visual/GolfGTI.selftest';
import { runDrivingSceneDisplaySelfTest } from '../src/vehicle/visual/DrivingSceneDisplayContext.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
console.log(JSON.stringify({golf:runGolfGTISelfTest(),sharedDisplay:runDrivingSceneDisplaySelfTest(),lighting:runVehicleLightingSelfTest()},null,2));
