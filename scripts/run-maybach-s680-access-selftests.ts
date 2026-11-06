import { runMaybachS680AccessSelfTest } from '../src/vehicle/MaybachS680Access.selftest';
import { runVehicleInteractionSelfTest } from '../src/vehicle/interaction/VehicleInteraction.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';

console.log(JSON.stringify({maybachAccess: runMaybachS680AccessSelfTest(),
  sharedInteraction: runVehicleInteractionSelfTest(), lighting: runVehicleLightingSelfTest()}, null, 2));
