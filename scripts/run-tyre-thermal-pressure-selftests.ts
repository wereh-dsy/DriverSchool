import { mkdirSync, writeFileSync } from 'node:fs';
import { runTyreThermalPressureSelfTest } from '../src/vehicle/physics/TyreThermalPressure.selftest';
import { runTPMSDisplaysSelfTest } from '../src/vehicle/visual/TPMSDisplays.selftest';
import { runWheelRotationSelfTest } from '../src/vehicle/physics/WheelRotationSystem.selftest';
import { runTyreDifferentialSelfTest } from '../src/vehicle/physics/TyreDifferential.selftest';
import { runFourWheelPhysicsSelfTest } from '../src/vehicle/physics/FourWheelPhysics.selftest';
const result = { thermalPressure: runTyreThermalPressureSelfTest(), tpmsDisplays: runTPMSDisplaysSelfTest(),
  wheelRotation: runWheelRotationSelfTest(), tyreDifferential: runTyreDifferentialSelfTest(), fourWheel: runFourWheelPhysicsSelfTest() };
mkdirSync('artifacts/tyre-thermal-pressure-v1', { recursive: true });
writeFileSync('artifacts/tyre-thermal-pressure-v1/test-results.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
