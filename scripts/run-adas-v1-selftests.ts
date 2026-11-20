import { runADASV1SelfTests } from '../src/vehicle/adas/ADASSystem.selftest';
import { runVehicleInputSystemSelfTest } from '../src/input/VehicleInputSystem.selftest';

const inputResult = runVehicleInputSystemSelfTest();
const adasResult = runADASV1SelfTests();

console.log(
  JSON.stringify(
    {
      inputSelfTest: inputResult,
      adasV1: {
        passed: adasResult.passed,
        total: adasResult.total,
        performance: adasResult.performance,
        scenarios: adasResult.scenarios,
      },
    },
    null,
    2,
  ),
);
