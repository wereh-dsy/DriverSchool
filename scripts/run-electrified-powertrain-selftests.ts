import { runElectrifiedPowertrainSelfTest } from '../src/vehicle/powertrain/ElectrifiedPowertrain.selftest';
import { runEngineTorqueSelfTest } from '../src/vehicle/physics/EngineTorque.selftest';
import { runEngineTurboSelfTest } from '../src/vehicle/physics/EngineTurbo.selftest';
import { runDriverAssistSelfTest } from '../src/vehicle/physics/DriverAssistSystem.selftest';
console.log(JSON.stringify({ electrified: runElectrifiedPowertrainSelfTest(),
  engineTorque: runEngineTorqueSelfTest(), turbo: runEngineTurboSelfTest(),
  brakeAbsTcs: runDriverAssistSelfTest() }, null, 2));
