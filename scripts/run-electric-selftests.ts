import { runSuspensionKinematicsSelfTest } from '../src/vehicle/physics/SuspensionKinematics.selftest';
import { runElectricPowertrainSelfTest } from '../src/vehicle/powertrain/ElectricPowertrain.selftest';
import { runTeslaModel3VisualSelfTest } from '../src/vehicle/visual/TeslaModel3Visual.selftest';

console.log(JSON.stringify({ suspension: runSuspensionKinematicsSelfTest(), electric: runElectricPowertrainSelfTest(),
  visual: runTeslaModel3VisualSelfTest() }, null, 2));
