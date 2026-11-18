import { runBMW530LiSelfTest } from '../src/vehicle/visual/BMW530Li.selftest';
import { runMirrorGeometrySelfTest } from '../src/camera/MirrorSystem.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runDrivingSceneDisplaySelfTest } from '../src/vehicle/visual/DrivingSceneDisplayContext.selftest';
console.log(JSON.stringify({ bmw: runBMW530LiSelfTest(), mirrors: runMirrorGeometrySelfTest(),
  lighting: runVehicleLightingSelfTest(), drivingScene: runDrivingSceneDisplaySelfTest() }, null, 2));
