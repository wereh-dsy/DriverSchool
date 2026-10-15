import { AccelerationTest, type AccelerationSample } from './AccelerationTest';

const ice = (speed = 0, fuelUsedL = 0, acceleration = 5, lateralVelocity = 0): AccelerationSample =>
  ({ speed, lateralVelocity, acceleration, fuel: { fuelUsedL }, powertrain: { kind: 'ICE' } });
const ev = (speed = 0, energyUsedKWh = 0, energyRecoveredKWh = 0, acceleration = 4): AccelerationSample =>
  ({ speed, lateralVelocity: 0, acceleration, powertrain: { kind: 'EV', ev: { energyUsedKWh, energyRecoveredKWh } } });

export function runAccelerationTestSelfTest(): Record<string, boolean> {
  const assert = (condition: boolean, message: string): void => { if (!condition) throw new Error(`Acceleration test: ${message}`); };
  const close = (actual: number | null, expected: number, message: string): void =>
    assert(actual !== null && Math.abs(actual - expected) < 1e-8, message);
  const dt = 1 / 120;
  const guard = new AccelerationTest();
  assert(!guard.arm(ice(1), 0) && !guard.arm(ice(-1), 0) && !guard.arm(ice(0, 0, 0, 1), 0), 'must be stationary in both axes');
  assert(guard.arm(ice(), 0.8), 'held throttle can arm but must first release');
  guard.update(dt, ice(), ice(0, 1), 0.8, true);
  assert(guard.state.phase === 'ARMED' && guard.state.current.elapsedSeconds === 0 && guard.state.waitingForRelease, 'held pedal must not start timing');
  guard.update(dt, ice(0, 1), ice(0, 2), 0, false);
  assert(guard.state.waitingForRelease, 'filtered menu controls must not count as releasing the pedal');
  guard.update(dt, ice(0, 2), ice(0, 3), 0.01, true);
  guard.update(dt, ice(0, 3), ice(0, 4), 0.04, true);
  assert(guard.state.phase === 'ARMED' && !guard.state.waitingForRelease, 'release and press thresholds should reject pedal noise');
  guard.update(dt, ice(0, 4), ice(0.1, 4.0001), 0.5, true);
  assert(guard.state.phase === 'RUNNING', 'next pedal press starts the clock before the first driven step');
  close(guard.state.current.elapsedSeconds, dt, 'include the triggering physics step');
  close(guard.state.current.fuelUsedL, 0.0001, 'exclude fuel burned while waiting');

  const hundred = new AccelerationTest();
  assert(hundred.arm(ice(0, 10), 0), 'arm ICE');
  let before = ice(0, 10);
  for (let step = 1; step <= 1000 && hundred.state.phase !== 'COMPLETED'; step++) {
    const after = ice(step * 5 * dt, 10 + step * 0.003 * dt);
    hundred.update(dt, before, after, 1, true); before = after;
  }
  assert(hundred.state.phase === 'COMPLETED' && hundred.state.to100 !== null && hundred.state.to200 === null, '100 mode must finish at 100');
  const t100 = (100 / 3.6) / 5;
  close(hundred.state.to100!.elapsedSeconds, t100, 'interpolate 100 crossing within a 120 Hz step');
  close(hundred.state.to100!.fuelUsedL, t100 * 0.003, 'interpolate fuel at the same threshold');
  close(hundred.state.current.elapsedSeconds, t100, 'total must end at the threshold');
  close(hundred.state.current.peakAcceleration, 5, 'peak from physical longitudinal acceleration');
  assert(hundred.state.current.energyUsedKWh === null, 'ICE must not invent electrical energy');
  hundred.update(10, before, ice(100, 100, 100), 1, true);
  close(hundred.state.current.elapsedSeconds, t100, 'finished result must freeze');
  assert(!hundred.arm(ice(1), 0) && hundred.state.to100 !== null, 'failed re-arm must retain completed result');

  const twoHundred = new AccelerationTest();
  assert(twoHundred.arm(ev(0, 8, 2), 0, 200), 'arm EV 200');
  let previous = ev(0, 8, 2), record100 = twoHundred.state.to100;
  for (let step = 1; step < 2000 && twoHundred.state.phase !== 'COMPLETED'; step++) {
    const after = ev(step * 4 * dt, 8 + step * 0.04 * dt, 2 + step * 0.002 * dt, step > 1000 ? 7 : 4);
    twoHundred.update(dt, previous, after, 1, true); previous = after;
    if (twoHundred.state.to100 && record100 === null) record100 = twoHundred.state.to100;
  }
  const t200 = (200 / 3.6) / 4;
  assert(twoHundred.state.phase === 'COMPLETED' && twoHundred.state.to100 === record100 && twoHundred.state.to200 !== null, 'retain independent 100 split while continuing to 200');
  close(record100!.elapsedSeconds, t200 / 2, 'EV 100 time');
  close(twoHundred.state.to200!.elapsedSeconds, t200, 'EV 200 time');
  close(record100!.energyUsedKWh, t200 / 2 * 0.04, '100 energy must freeze');
  close(twoHundred.state.to200!.energyUsedKWh, t200 * 0.04, 'gross pack consumption');
  close(twoHundred.state.to200!.energyRecoveredKWh, t200 * 0.002, 'pack recovery uses same interval');
  close(record100!.peakAcceleration, 4, 'later peak must not overwrite 100 split');
  close(twoHundred.state.to200!.peakAcceleration, 7, '200 peak includes later acceleration');
  assert(twoHundred.state.current.fuelUsedL === null, 'EV must not invent fuel');

  const leap = new AccelerationTest(); leap.arm(ice(), 0, 200);
  leap.update(0.1, ice(), ice(60, 0.1), 1, true);
  close(leap.state.to100!.elapsedSeconds, 0.1 * (100 / 3.6) / 60, 'both thresholds in one step: 100');
  close(leap.state.to200!.elapsedSeconds, 0.1 * (200 / 3.6) / 60, 'both thresholds in one step: 200');
  close(leap.state.to100!.fuelUsedL, 0.1 * (100 / 3.6) / 60, 'both thresholds have independent energy fractions');

  const interrupted = new AccelerationTest(); interrupted.arm(ice(), 0, 200);
  interrupted.update(1, ice(), ice(30, 0.1), 1, true);
  const saved = interrupted.state.to100;
  interrupted.update(5, ice(30, 0.1), ice(60, 1, 1000), 1, false);
  assert(interrupted.state.phase === 'INTERRUPTED' && interrupted.state.to100 === saved && interrupted.state.to200 === null, 'menu/background interruption preserves completed split only');
  close(interrupted.state.current.elapsedSeconds, 1, 'inactive time and energy must not count');
  assert(interrupted.arm(ice(), 0, 200) && interrupted.state.to100 === null, 'stationary re-arm clears the old run');
  interrupted.update(dt, ice(), ice(0.1), 1, true);
  interrupted.stop(); assert(interrupted.state.phase === 'STOPPED', 'manual finish for vehicles unable to reach target');
  interrupted.arm(ice(), 0); interrupted.update(dt, ice(0.2), ice(0.3), 1, true);
  assert(interrupted.state.phase === 'INTERRUPTED', 'rolling before pedal press must invalidate a standing start');
  interrupted.arm(ice(), 0); interrupted.update(dt, ice(), ice(-1), 1, true);
  assert(interrupted.state.phase === 'INTERRUPTED' && interrupted.state.to100 === null, 'reverse is not a 0-100 run');
  interrupted.arm(ice(), 0); interrupted.update(dt, ice(), ice(30, 1, 1000), 1, true, true);
  assert(interrupted.state.phase === 'INTERRUPTED' && interrupted.state.to100 === null && interrupted.state.current.peakAcceleration === 0, 'collision corrections must not create a time or peak');
  interrupted.arm(ice(0, 1), 0); interrupted.update(dt, ice(0, 1), ice(1, 0), 1, true);
  assert(interrupted.state.phase === 'INTERRUPTED', 'reset consumption counter must not produce a false result');
  interrupted.arm(ice(), 0); interrupted.update(dt, ice(), ice(NaN), 1, true);
  assert(interrupted.state.phase === 'INTERRUPTED', 'invalid telemetry rejected');
  interrupted.arm(ice(), 0); interrupted.update(dt, ice(), ev(1), 1, true);
  assert(interrupted.state.phase === 'INTERRUPTED', 'powertrain switch rejected');
  const missing: AccelerationSample = { speed: 0, lateralVelocity: 0, acceleration: 0, powertrain: { kind: 'EV' } };
  interrupted.arm(missing, 0); interrupted.update(dt, missing, { ...missing, speed: 1 }, 1, true);
  assert(interrupted.state.current.energyUsedKWh === null && interrupted.state.current.energyRecoveredKWh === null, 'missing telemetry stays unavailable');
  return { stationaryArming: true, pedalEdgeAndHysteresis: true, noIdleConsumption: true, fixedStepTiming: true,
    thresholdInterpolation: true, fuelAccounting: true, electricAccounting: true, independentSplits: true,
    frozenResults: true, peakAcceleration: true, manualStopAndRearm: true, menuAndBackground: true,
    reverseAndRolling: true, collisionAndLifecycle: true, invalidCountersAndMissingData: true };
}
