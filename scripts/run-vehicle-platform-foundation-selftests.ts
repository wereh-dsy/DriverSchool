import { runVehiclePlatformFoundationSelfTest } from '../src/vehicle/VehiclePlatformFoundation.selftest';
import { runVehiclePlatformSelfTest } from '../src/vehicle/physics/VehiclePlatform.selftest';
import { runVehicleCatalogSelfTest } from '../src/vehicle/VehicleCatalog.selftest';
import { runBMW530LiSelfTest } from '../src/vehicle/visual/BMW530Li.selftest';
import { runBMW530FrontCabinSelfTest } from '../src/vehicle/visual/BMW530FrontCabin.selftest';
import { runTeslaExperienceSelfTest } from '../src/vehicle/visual/TeslaExperience.selftest';
import { runDrivingSceneDisplaySelfTest } from '../src/vehicle/visual/DrivingSceneDisplayContext.selftest';
import { runInstrumentClusterLayoutSelfTest } from '../src/vehicle/visual/InstrumentCluster.selftest';
import { runMirrorGeometrySelfTest } from '../src/camera/MirrorSystem.selftest';
import { runVehicleVisualDimensionsSelfTest } from '../src/vehicle/visual/VehicleVisualDimensions.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runExecutivePolishSelfTest } from '../src/vehicle/physics/ExecutivePolish.selftest';

console.log(JSON.stringify({foundation:await runVehiclePlatformFoundationSelfTest(),platform:runVehiclePlatformSelfTest(),
  catalog:runVehicleCatalogSelfTest(),bmw:runBMW530LiSelfTest(),bmwCabin:runBMW530FrontCabinSelfTest(),
  tesla:runTeslaExperienceSelfTest(),sceneData:runDrivingSceneDisplaySelfTest(),instruments:runInstrumentClusterLayoutSelfTest(),
  mirrors:runMirrorGeometrySelfTest(),dimensions:runVehicleVisualDimensionsSelfTest(),lighting:runVehicleLightingSelfTest(),
  audi:runExecutivePolishSelfTest()},null,2));
