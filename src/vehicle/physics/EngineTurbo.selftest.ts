import {
  cloneVehiclePhysicsConfig, createDefaultVehiclePhysicsConfig,
  createSportsCoupePhysicsConfig, createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig,
} from '../config';
import { Engine } from './Engine';
import { Turbocharger } from './Turbocharger';

/** Fast scalar bench checks, not driving/tuning runs. Held RPM emulates a load bench. */
export function runEngineTurboSelfTest(): {
  assertions: number; lowRPMBoostBar: number; fullBoostBar: number;
  loadedTurboSpeed: number; cruisingTurboSpeed: number; retainedAfterBriefLift: number;
} {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Turbocharger: ${message}`);
  };
  const config = createTest7DCTVehiclePhysicsConfig();
  const turboConfig = config.engine.turbo!;
  const tick = 1 / 120;
  const shaftBench = (rpm: number, throttle: number, load: number, seconds: number): Turbocharger => {
    const turbo = new Turbocharger(turboConfig);
    for (let i = 0; i < seconds * 120; i += 1) turbo.update(tick, rpm, throttle, throttle ** config.engine.partThrottleExponent,
      load, 250, true);
    return turbo;
  };
  const low = shaftBench(1100, 1, 250, 4);
  const loaded = shaftBench(2500, 1, 250, 4);
  const cruise = shaftBench(2500, 0.22, 45, 4);
  const freeRev = shaftBench(2500, 1, 0, 0.4);
  const heavy = shaftBench(2500, 1, 250, 0.4);
  assert(low.manifoldPressure - 1 < 0.5, 'low-RPM boost stays modest');
  assert(loaded.manifoldPressure > 1.9 && loaded.manifoldPressure <= turboConfig.maxPressureRatio, 'useful capped full boost');
  assert(loaded.turboSpeed > cruise.turboSpeed + 0.25, 'equal RPM has load/throttle-dependent spool');
  assert(heavy.turboSpeed > freeRev.turboSpeed + 0.1, 'equal RPM AND throttle have explicit load-dependent spool');
  assert(loaded.wastegateOpening > 0, 'actual pressure opens wastegate');
  const firstTick = new Turbocharger(turboConfig);
  firstTick.update(tick, 2500, 1, 1, 250, 250, true);
  assert(firstTick.turboSpeed < heavy.turboSpeed * 0.2 && firstTick.manifoldPressure < 1.02, 'spool is not an instantaneous RPM curve');

  const before = loaded.turboSpeed;
  for (let i = 0; i < 24; i += 1) loaded.update(tick, 2500, 0, 0, 0, 250, true);
  const retained = loaded.turboSpeed;
  assert(retained > before * 0.8 && retained < before, 'brief lift naturally retains rotor inertia');
  assert(loaded.manifoldPressure < 1.05, 'closed throttle dumps manifold pressure while shaft still turns');
  const cold = new Turbocharger(turboConfig);
  for (let i = 0; i < 24; i += 1) {
    loaded.update(tick, 2500, 1, 1, 250, 250, true);
    cold.update(tick, 2500, 1, 1, 250, 250, true);
  }
  assert(loaded.manifoldPressure > cold.manifoldPressure + 0.2, 'quick reapplication fills sooner than a cold turbo');
  for (let i = 0; i < 1200; i += 1) loaded.update(tick, 2500, 0, 0, 0, 250, true);
  assert(loaded.turboSpeed < 0.04 && loaded.manifoldPressure < 1.001, 'long lift decays speed and boost');

  const engine = new Engine(config.engine);
  engine.reset(2500);
  engine.throttle = 1;
  const unspooled = engine.getTorqueSample();
  assert(unspooled.combustionTorque < engine.getTorqueAtRPM(2500) * 0.65, 'engine starts on base curve, not full-boost envelope');
  for (let i = 0; i < 480; i += 1) {
    engine.currentRPM = 2500;
    engine.integrate(tick, 240);
    const torque = engine.getTorqueSample();
    const debug = engine.getTurboSnapshot();
    assert(Number.isFinite(torque.netCrankTorque) && Number.isFinite(debug.turboSpeed) &&
      Number.isFinite(debug.manifoldPressureBar), 'continuous finite engine integration');
    assert(torque.combustionTorque <= engine.getTorqueAtRPM(engine.currentRPM) + 1e-8, 'existing full-boost envelope remains a ceiling');
  }
  const fullBoost = engine.getTurboSnapshot();
  assert(fullBoost.availableTorque > 240, 'middle-speed torque can reach existing envelope');
  const pressureBeforeRead = fullBoost.manifoldPressureBar, speedBeforeRead = fullBoost.turboSpeed;
  engine.getTorqueSample(); engine.getTorqueSample(); engine.getTurboSnapshot();
  assert(engine.getTurboSnapshot().manifoldPressureBar === pressureBeforeRead &&
    engine.getTurboSnapshot().turboSpeed === speedBeforeRead, 'torque/debug reads never advance states');
  engine.throttle = 0;
  assert(engine.getTorqueSample().combustionTorque === 0 && engine.getTorqueSample().netCrankTorque < 0,
    'hot rotating turbo cannot produce lift-off positive combustion torque');
  engine.throttle = 0.5;
  assert(Math.abs(engine.getTorqueSample().combustionTorque -
    engine.availableTorque * 0.5 ** config.engine.partThrottleExponent) < 1e-8, 'part-throttle mapping stays separate');
  engine.reset(config.engine.revLimiterRPM + 1);
  engine.throttle = 1;
  engine.integrate(tick, 0);
  assert(engine.isOnLimiter && engine.getTorqueSample().combustionTorque === 0, 'limiter still cuts fuel');
  engine.stop();
  assert(Object.values(engine.getTorqueSample()).every((value) => value === 0), 'stopped engine torque path unchanged');
  engine.reset();
  assert(engine.getTurboSnapshot().turboSpeed === 0 && engine.getTurboSnapshot().boostPressureBar === 0, 'reset removes state across respawn/vehicle switch');

  const cloned = cloneVehiclePhysicsConfig(config);
  cloned.engine.turbo!.baseTorqueCurve[0]!.torque += 5;
  assert(config.engine.turbo!.baseTorqueCurve[0]!.torque === 75, 'turbo configuration and base curve clone independently');
  // Existing NA MT, GT and 6AT remain on the exact same path, including an
  // explicitly disabled turbo preset. Compare deterministic engine trajectories.
  for (const vehicle of [createDefaultVehiclePhysicsConfig(), createSportsCoupePhysicsConfig(), createTest6ATVehiclePhysicsConfig()]) {
    const ordinary = new Engine(vehicle.engine);
    const disabled = new Engine({ ...vehicle.engine, turbo: { ...turboConfig, enabled: false } });
    assert(!ordinary.getTurboSnapshot().enabled && !disabled.getTurboSnapshot().enabled, 'NA remains disabled');
    for (let i = 0; i < 240; i += 1) {
      const throttle = i < 90 ? 0.6 : i < 150 ? 0.2 : 0;
      ordinary.updateThrottle(throttle, tick); disabled.updateThrottle(throttle, tick);
      ordinary.integrate(tick, 20); disabled.integrate(tick, 20);
      assert(ordinary.currentRPM === disabled.currentRPM &&
        ordinary.getTorqueSample().netCrankTorque === disabled.getTorqueSample().netCrankTorque,
        'NA torque, inertia, losses and governor do not depend on turbo presence');
    }
  }
  const invalid = new Turbocharger(turboConfig);
  invalid.turboSpeed = NaN; invalid.manifoldPressure = Infinity;
  invalid.update(tick, NaN, NaN, Infinity, NaN, Infinity, true);
  assert(Number.isFinite(invalid.turboSpeed) && Number.isFinite(invalid.manifoldPressure), 'invalid state/input recovery');
  invalid.update(NaN, 2500, 1, 1, 250, 250, true);
  invalid.update(Infinity, 2500, 1, 1, 250, 250, true);
  invalid.update(1e6, 2500, 1, 1, 250, 250, true);
  assert(invalid.turboSpeed >= 0 && invalid.turboSpeed <= 1 &&
    invalid.manifoldPressure >= 1 && invalid.manifoldPressure <= turboConfig.maxPressureRatio, 'bounded shaft and pressure');
  return {
    assertions, lowRPMBoostBar: low.manifoldPressure - 1, fullBoostBar: fullBoost.boostPressureBar,
    loadedTurboSpeed: before, cruisingTurboSpeed: cruise.turboSpeed, retainedAfterBriefLift: retained / before,
  };
}
