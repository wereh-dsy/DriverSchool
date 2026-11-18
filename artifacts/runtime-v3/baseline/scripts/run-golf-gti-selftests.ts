import { runGolfGTISelfTest } from '../src/vehicle/visual/GolfGTI.selftest';
import { runDrivingSceneDisplaySelfTest } from '../src/vehicle/visual/DrivingSceneDisplayContext.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runGolfGTIAccessSelfTest } from '../src/vehicle/visual/GolfGTIAccess.selftest';
import { runVehicleInteractionSelfTest } from '../src/vehicle/interaction/VehicleInteraction.selftest';
console.log(JSON.stringify({golf:runGolfGTISelfTest(),access:runGolfGTIAccessSelfTest(),interaction:runVehicleInteractionSelfTest(),sharedDisplay:runDrivingSceneDisplaySelfTest(),lighting:runVehicleLightingSelfTest()},null,2));
