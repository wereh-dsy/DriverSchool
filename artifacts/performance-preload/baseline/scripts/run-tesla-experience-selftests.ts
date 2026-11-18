import { runTeslaExperienceSelfTest } from '../src/vehicle/visual/TeslaExperience.selftest';
import { runElectricPowertrainSelfTest } from '../src/vehicle/powertrain/ElectricPowertrain.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runRearParkingProximitySelfTest } from '../src/vehicle/control/RearParkingProximity.selftest';
import { runTeslaModel3VisualSelfTest } from '../src/vehicle/visual/TeslaModel3Visual.selftest';
console.log(JSON.stringify({ experience:runTeslaExperienceSelfTest(), lighting:runVehicleLightingSelfTest(), proximity:runRearParkingProximitySelfTest(), electric:runElectricPowertrainSelfTest(), visual:runTeslaModel3VisualSelfTest() },null,2));
