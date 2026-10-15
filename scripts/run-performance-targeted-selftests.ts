import { runPowertrainBoundarySelfTest } from '../src/vehicle/powertrain/Powertrain.selftest';
import { runTractionPerformanceSelfTest } from '../src/vehicle/physics/TractionPerformance.selftest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { runDriverAssistSelfTest } from '../src/vehicle/physics/DriverAssistSystem.selftest';
import { runESCAWDSelfTest } from '../src/vehicle/physics/ESCAWD.selftest';
import { runWheelRotationSelfTest } from '../src/vehicle/physics/WheelRotationSystem.selftest';
import { runSurfaceInteractionSelfTest } from '../src/vehicle/physics/SurfaceInteraction.selftest';
import { runFourWheelPhysicsSelfTest } from '../src/vehicle/physics/FourWheelPhysics.selftest';
import { runVehicleDynamicsSelfTest } from '../src/vehicle/physics/VehicleDynamics.selftest';
import { runVehiclePlatformSelfTest } from '../src/vehicle/physics/VehiclePlatform.selftest';
import { runFerrari458SelfTest } from '../src/vehicle/physics/Ferrari458.selftest';
import { runTransmissionBackendSelfTest, runTransmissionVehicleSelfTest, runTransmissionShiftSelfTest } from '../src/vehicle/transmission/Transmission.selftest';
import { runCVTSelfTest } from '../src/vehicle/transmission/cvt/CVTTransmission.selftest';
import { runElectricPowertrainSelfTest } from '../src/vehicle/powertrain/ElectricPowertrain.selftest';
import { runEVPlatformV2SelfTest } from '../src/vehicle/powertrain/EVPlatformV2.selftest';
const checks = { powertrainBoundary: runPowertrainBoundarySelfTest, tractionPerformance: runTractionPerformanceSelfTest, driverAssists: runDriverAssistSelfTest, escAWD: runESCAWDSelfTest, wheel: runWheelRotationSelfTest,
  surface: runSurfaceInteractionSelfTest, fourWheel: runFourWheelPhysicsSelfTest, dynamics: runVehicleDynamicsSelfTest,
  platform: runVehiclePlatformSelfTest, ferrari: runFerrari458SelfTest, transmissionBackend: runTransmissionBackendSelfTest,
  transmissionVehicle: runTransmissionVehicleSelfTest, transmissionShift: runTransmissionShiftSelfTest,
  cvt: runCVTSelfTest, ev: runElectricPowertrainSelfTest, evV2: runEVPlatformV2SelfTest };
const results = {};
for (const [name, run] of Object.entries(checks)) {
  try { results[name] = run(); console.log(`PASS ${name}`); }
  catch (error) { results[name] = { error: String(error) }; console.error(`FAIL ${name}: ${error}`); process.exitCode = 1; }
}
mkdirSync('artifacts/performance-tcs', { recursive: true });
writeFileSync('artifacts/performance-tcs/targeted-results.json', JSON.stringify(results, null, 2));
