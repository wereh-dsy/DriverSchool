import { runBMW530FrontCabinSelfTest } from '../src/vehicle/visual/BMW530FrontCabin.selftest';
import { runDrivingSceneDisplaySelfTest } from '../src/vehicle/visual/DrivingSceneDisplayContext.selftest';
console.log(JSON.stringify({bmwFrontCabin:runBMW530FrontCabinSelfTest(),drivingScene:runDrivingSceneDisplaySelfTest()},null,2));
