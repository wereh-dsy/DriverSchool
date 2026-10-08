import { createDefaultVehiclePhysicsConfig, createSportsCoupePhysicsConfig } from '../config';
import { Engine } from './Engine';
import { rpmToRadiansPerSecond, radiansPerSecondToRPM } from './math';

/** Direct torque-accounting checks, without driving loops or tuning. */
export function runEngineTorqueSelfTest(): { assertions: number } {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Engine torque: ${message}`);
  };
  const near = (actual: number, expected: number, tolerance = 1e-8): boolean =>
    Math.abs(actual - expected) <= tolerance;

  for (const vehicle of [createDefaultVehiclePhysicsConfig(), createSportsCoupePhysicsConfig()]) {
    const config = vehicle.engine;
    const engine = new Engine(config);
    engine.reset(3_000);
    engine.throttle = 1;
    const full = engine.getTorqueSample();
    assert(near(full.combustionTorque, engine.availableTorque), 'full throttle retains full-load curve torque');
    assert(near(full.mechanicalFrictionTorque, config.engineFrictionTorque), 'mechanical friction persists at full throttle');
    assert(full.pumpingLossTorque === 0, 'full throttle removes pumping drag, not mechanical drag');
    assert(near(full.netCrankTorque, full.combustionTorque - full.mechanicalFrictionTorque), 'loaded throttle torque subtracts friction');

    engine.throttle = 0.25;
    const part = engine.getTorqueSample();
    const exponent = config.partThrottleExponent ?? 1;
    assert(near(part.combustionTorque, engine.availableTorque * 0.25 ** exponent), 'part throttle exponent drives combustion only');
    assert(part.combustionTorque > engine.availableTorque * 0.18, 'preset curve preserves useful early-pedal response');
    assert(near(part.mechanicalFrictionTorque, full.mechanicalFrictionTorque), 'friction is unchanged by throttle');
    assert(part.pumpingLossTorque > full.pumpingLossTorque, 'pumping drag increases as throttle closes');

    engine.throttle = 0;
    const closed = engine.getTorqueSample();
    const normalizedRPM = (3_000 - config.idleRPM) / (config.redlineRPM - config.idleRPM);
    assert(near(closed.engineBrakingTorque, config.engineFrictionTorque + config.engineBrakingStrength * normalizedRPM), 'closed-throttle drag preserves existing curve');
    assert(closed.pumpingLossTorque > part.pumpingLossTorque, 'closed-throttle pumping drag is highest');
    assert(near(closed.engineBrakingTorque, closed.mechanicalFrictionTorque + closed.pumpingLossTorque), 'legacy engine braking observation sums independent losses');
    assert(near(closed.netCrankTorque, closed.combustionTorque + closed.idleControlTorque + closed.revHangTorque -
      closed.mechanicalFrictionTorque - closed.pumpingLossTorque), 'crank torque accounting is explicit');

    engine.throttle = 0.5;
    const load = 30;
    const dt = 1 / 120;
    const before = engine.currentRPM;
    const integratedSample = engine.integrate(dt, load)!;
    const torque = integratedSample.netCrankTorque;
    const expected = radiansPerSecondToRPM(rpmToRadiansPerSecond(before) +
      (torque - load) / engine.rotationalInertia * dt);
    assert(near(engine.currentRPM, expected), 'inertia integration subtracts external clutch load exactly once');

    engine.reset();
    const idle = engine.getTorqueSample();
    assert(near(idle.idleControlTorque, idle.engineBrakingTorque), 'torque governor balances loss at target idle');
    engine.integrate(dt, 0);
    assert(near(engine.currentRPM, config.idleRPM, .1), 'idle holds with torque, not an RPM clamp');
    engine.integrate(0.1, 500);
    assert(!engine.isRunning, 'finite idle torque remains stallable under crank load');
    assert(Object.values(engine.getTorqueSample()).every(value => value === 0), 'stopped engine reports no generated or loss torque');

    engine.reset(config.revLimiterRPM + 1);
    engine.throttle = 1;
    engine.integrate(dt, 0);
    const limited = engine.getTorqueSample();
    assert(engine.isOnLimiter && limited.combustionTorque === 0, 'existing fuel cut still removes combustion');
    assert(limited.mechanicalFrictionTorque > 0 && limited.netCrankTorque < 0, 'fuel cut does not erase crank friction');
  }
  return { assertions };
}
