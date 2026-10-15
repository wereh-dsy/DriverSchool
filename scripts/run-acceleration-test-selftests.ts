import { runAccelerationTestSelfTest } from '../src/experimental/acceleration/AccelerationTest.selftest';
import { runAccelerationRunDiagnosticsSelfTest } from '../src/experimental/acceleration/AccelerationRunDiagnostics.selftest';
console.log(JSON.stringify({ measurement: runAccelerationTestSelfTest(), diagnostics: runAccelerationRunDiagnosticsSelfTest() }, null, 2));
