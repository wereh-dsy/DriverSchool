import { writeFileSync, mkdirSync } from 'node:fs';
import { runEVPlatformV2SelfTest } from '../src/vehicle/powertrain/EVPlatformV2.selftest';
import { runElectricPowertrainSelfTest } from '../src/vehicle/powertrain/ElectricPowertrain.selftest';
import { runDriverAssistSelfTest } from '../src/vehicle/physics/DriverAssistSystem.selftest';
import { runESCAWDSelfTest } from '../src/vehicle/physics/ESCAWD.selftest';

const results = { evPlatformV2: runEVPlatformV2SelfTest(), model3Regression: runElectricPowertrainSelfTest(),
  brakeAbsTcs: runDriverAssistSelfTest(), brakeEscAwdCompatibility: runESCAWDSelfTest() };
mkdirSync('artifacts/ev-platform-v2', { recursive: true });
writeFileSync('artifacts/ev-platform-v2/test-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
