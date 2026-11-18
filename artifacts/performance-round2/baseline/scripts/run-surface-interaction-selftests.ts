import { mkdirSync, writeFileSync } from 'node:fs';
import { runSurfaceInteractionSelfTest } from '../src/vehicle/physics/SurfaceInteraction.selftest';
import { runWheelContactSelfTest } from '../src/vehicle/physics/WheelContact.selftest';
import { runWheelRotationSelfTest } from '../src/vehicle/physics/WheelRotationSystem.selftest';
import { runTyreThermalPressureSelfTest } from '../src/vehicle/physics/TyreThermalPressure.selftest';
import { runDriverAssistSelfTest } from '../src/vehicle/physics/DriverAssistSystem.selftest';
import { runESCAWDSelfTest } from '../src/vehicle/physics/ESCAWD.selftest';

const checks = { surface: runSurfaceInteractionSelfTest, wheelContact: runWheelContactSelfTest,
  wheelRotation: runWheelRotationSelfTest, thermalPressure: runTyreThermalPressureSelfTest,
  driverAssists: runDriverAssistSelfTest, escAWD: runESCAWDSelfTest };
const results: Record<string, unknown> = {};
let failed = false;
for (const [name, run] of Object.entries(checks)) {
  try { results[name] = run(); console.log(`PASS ${name}`); }
  catch (error) { failed = true; results[name] = { error: String(error) }; console.error(`FAIL ${name}: ${String(error)}`); }
}
mkdirSync('artifacts/surface-interaction-v1', { recursive: true });
writeFileSync('artifacts/surface-interaction-v1/targeted-results.json', JSON.stringify(results, null, 2));
if (failed) process.exitCode = 1;
else console.log(JSON.stringify(results.surface, null, 2));
