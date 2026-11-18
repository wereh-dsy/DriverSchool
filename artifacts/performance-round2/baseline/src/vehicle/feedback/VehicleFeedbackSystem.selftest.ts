import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { DEFAULT_VEHICLE_PHYSICS_CONFIG, SPORTS_COUPE_PHYSICS_CONFIG } from '../config';
import { VehicleFeedbackSystem, type VehicleFeedbackSnapshot } from './VehicleFeedbackSystem';

export function runVehicleFeedbackSelfTest(): Record<string, number | boolean> {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Vehicle feedback self-test: ${message}`);
  };
  const initial = new VehicleDynamics().getSnapshot();
  const make = (overrides: Partial<VehicleFeedbackSnapshot> = {}): VehicleFeedbackSnapshot => ({
    ...initial, ...overrides,
  });
  const idle = new VehicleFeedbackSystem(); idle.reset(initial);
  const legacyIdle = new VehicleFeedbackSystem({ idleVibrationStrength: 1 }); legacyIdle.reset(initial);
  let maximumIdleOffset = 0;
  for (let step = 0; step < 240; step += 1) {
    const state = idle.update(1 / 120, initial);
    assert(state.continuousRumble.weak === 0 && state.continuousRumble.strong === 0,
      'steady idle must not drive either gamepad motor');
    const legacyState = legacyIdle.update(1 / 120, initial);
    assert(legacyState.continuousRumble.weak === 0 && legacyState.continuousRumble.strong === 0,
      'an old idle-strength setting must not re-enable gamepad idle rumble');
    assert(state.hapticPulses.length === 0, 'steady idle must not generate events');
    maximumIdleOffset = Math.max(maximumIdleOffset, Math.abs(state.cockpitOffset.y));
  }
  assert(maximumIdleOffset > 0.0001 && maximumIdleOffset < 0.0003, 'idle cockpit displacement should be submillimetre');
  for (let step = 0; step < 120; step += 1) idle.update(1 / 120, make({ rpm: 3_000 }));
  const rpmUp = idle.state;
  assert(rpmUp.continuousRumble.weak === 0 && rpmUp.idleVibrationIntensity === 0, 'visual idle motion should disappear well above idle');
  const loaded = make({ gear: 1, speed: 0.4, rpm: 750, clutchEngagement: 0.72,
    controlMode: 'manual-clutch', clutchPedal: 0.28,
    forces: { ...initial.forces, clutchTorque: 75, clutchSlipAngularVelocity: 65 },
    transmission: { type: 'MANUAL', engineLoadTorque: 75 } });
  const judder = new VehicleFeedbackSystem(); judder.reset(loaded);
  const replica = new VehicleFeedbackSystem(); replica.reset(loaded);
  let maximumOffset = 0;
  for (let step = 0; step < 240; step += 1) {
    const state = judder.update(1 / 120, loaded); const deterministic = replica.update(1 / 120, loaded);
    assert(state.cockpitOffset.y === deterministic.cockpitOffset.y && state.cockpitOffset.z === deterministic.cockpitOffset.z,
      'identical state sequences must produce identical periodic feedback, not random shake');
    maximumOffset = Math.max(maximumOffset, Math.abs(state.cockpitOffset.y), Math.abs(state.cockpitOffset.z));
  }
  assert(judder.state.clutchJudderIntensity > 0.1 && judder.state.drivetrainVibrationIntensity > 0.2 && maximumOffset < 0.003,
    'loaded low-RPM clutch should judder clearly but not disturb mirror/parking observations');
  const near = new VehicleFeedbackSystem(); near.reset(loaded);
  for (let step = 0; step < 120; step += 1) near.update(1 / 120, { ...loaded, rpm: 600 });
  assert(near.state.drivetrainVibrationIntensity >= judder.state.drivetrainVibrationIntensity,
    'judder should strengthen towards stall, not weaken');
  const automatic = new VehicleFeedbackSystem(); automatic.reset(loaded);
  for (let step = 0; step < 120; step += 1) automatic.update(1 / 120, { ...loaded,
    transmission: { type: 'TORQUE_CONVERTER_AT', engineLoadTorque: 75 } });
  assert(automatic.state.drivetrainVibrationIntensity === 0, 'torque converter AT must never receive manual clutch judder');
  const settle = (snapshot: VehicleFeedbackSnapshot): VehicleFeedbackSystem => {
    const observer = new VehicleFeedbackSystem(); observer.reset(snapshot);
    for (let step = 0; step < 120; step += 1) observer.update(1 / 120, snapshot);
    return observer;
  };
  const automaticClutch = settle({ ...loaded, controlMode: 'normal', rpm: initial.idleRPM,
    speed: 0, clutchEngagement: 0.5, forces: { ...loaded.forces, clutchTorque: 150 } });
  assert(automaticClutch.state.clutchJudderIntensity === 0
    && automaticClutch.state.nearStallVibrationIntensity === 0
    && automaticClutch.state.continuousRumble.weak === 0,
  'normal automatic-clutch launch/stop must remain smooth despite internal bite modulation');
  const abnormalAuto = settle({ ...loaded, controlMode: 'normal', rpm: 540, clutchEngagement: 0.5,
    forces: { ...loaded.forces, clutchTorque: 240 } });
  assert(abnormalAuto.state.drivetrainVibrationIntensity > 0 && abnormalAuto.state.continuousRumble.weak < 0.08
    && abnormalAuto.state.continuousRumble.strong < 0.025,
  'automatic clutch may give only a small cue for abnormal high-load, low-RPM slip');
  const dct = new VehicleFeedbackSystem(); dct.reset(loaded);
  for (let step = 0; step < 120; step += 1) dct.update(1 / 120, { ...loaded,
    transmission: { type: 'DCT', engineLoadTorque: 75, dct: { clutchAEngagement: 0.72, clutchBEngagement: 0 } } });
  assert(dct.state.drivetrainVibrationIntensity < judder.state.drivetrainVibrationIntensity * 0.15,
    'DCT low-speed feedback should be far weaker than manual clutch judder');
  const neutral = settle({ ...loaded, gear: 'N', rpm: 540, speed: 0 });
  assert(neutral.state.clutchJudderIntensity === 0 && neutral.state.nearStallVibrationIntensity === 0
    && neutral.state.continuousRumble.strong === 0 && neutral.state.continuousRumble.weak === 0,
  'neutral low RPM must not rumble or receive clutch or near-stall judder');
  const opened = settle({ ...loaded, clutchEngagement: 0, clutchPedal: 1, rpm: 540, speed: 0 });
  assert(opened.state.clutchJudderIntensity === 0 && opened.state.nearStallVibrationIntensity === 0,
    'fully open clutch must remove both load-driven layers even with stale load/slip samples');
  const coupled = settle({ ...loaded, clutchEngagement: 1, clutchPedal: 0, rpm: 1_200, speed: 5 / 3.6 });
  assert(coupled.state.factors.partialClutchFactor === 0 && coupled.state.drivetrainVibrationIntensity === 0
    && coupled.state.continuousRumble.weak === 0 && coupled.state.continuousRumble.strong === 0,
  'fully coupled normal driving at 5 km/h must not vibrate because of speed');
  const noSlip = settle({ ...loaded, rpm: initial.idleRPM, forces: { ...loaded.forces, clutchSlipAngularVelocity: 0 } });
  const noLoad = settle({ ...loaded, forces: { ...loaded.forces, clutchTorque: 0 } });
  assert(noSlip.state.clutchJudderIntensity === 0 && noLoad.state.drivetrainVibrationIntensity === 0,
    'partial engagement needs actual slip and transmitted load');
  const walking = settle({ ...loaded, speed: 10 / 3.6 });
  const stationary = settle({ ...loaded, speed: 0 });
  assert(walking.state.factors.judderTarget === stationary.state.factors.judderTarget,
    '0 and 10 km/h must have the same mechanical judder demand; speed is only a higher-speed fade');
  const bite = settle({ ...loaded, rpm: initial.idleRPM, clutchEngagement: 0.5, clutchPedal: 0.5,
    forces: { ...loaded.forces, clutchTorque: 75 } });
  const heavy = settle({ ...loaded, rpm: 740, clutchEngagement: 0.5, clutchPedal: 0.5,
    forces: { ...loaded.forces, clutchTorque: 150 } });
  const imminent = settle({ ...loaded, rpm: 510, clutchEngagement: 0.5, clutchPedal: 0.5,
    forces: { ...loaded.forces, clutchTorque: 175 } });
  assert(bite.state.nearStallVibrationIntensity === 0 && bite.state.continuousRumble.weak >= 0.05
    && bite.state.continuousRumble.weak <= 0.15,
  'ordinary loaded bite at steady idle should be a light, distinct layer');
  assert(heavy.state.drivetrainVibrationIntensity > bite.state.drivetrainVibrationIntensity
    && imminent.state.nearStallVibrationIntensity > heavy.state.nearStallVibrationIntensity
    && imminent.state.continuousRumble.weak >= 0.2 && imminent.state.continuousRumble.weak <= 0.35
    && imminent.state.continuousRumble.strong >= 0.05 && imminent.state.continuousRumble.strong <= 0.15,
  'insufficient throttle/heavy load and near stall must form progressively stronger, bounded layers');
  const lockedNearStall = settle({ ...loaded, rpm: 510, clutchEngagement: 1, clutchPedal: 0,
    forces: { ...loaded.forces, clutchTorque: 175 } });
  assert(lockedNearStall.state.clutchJudderIntensity === 0 && lockedNearStall.state.nearStallVibrationIntensity > 0.8,
    'near-stall feedback must remain independent of the partial-clutch curve');
  const pressedPedal = { ...loaded, rpm: 510, clutchPedal: 1 };
  for (let step = 0; step < 24; step += 1) imminent.update(1 / 120, pressedPedal);
  assert(imminent.state.drivetrainVibrationIntensity < 0.01,
    'pressing the pedal must release clutch and near-stall feedback rapidly before pressure plate catches up');
  const calibrated = new VehicleFeedbackSystem();
  calibrated.setVehicleConfig({ engine: DEFAULT_VEHICLE_PHYSICS_CONFIG.engine,
    clutch: { ...DEFAULT_VEHICLE_PHYSICS_CONFIG.clutch, bitePointStart: 0.7, bitePointEnd: 0.25 } });
  calibrated.update(1 / 120, { ...loaded, clutchEngagement: 0.3, clutchPedal: 0.7 });
  assert(calibrated.state.factors.partialClutchFactor === 0, 'calibrated bite start must be zero');
  calibrated.update(1 / 120, { ...loaded, clutchEngagement: 0.525, clutchPedal: 0.475 });
  assert(calibrated.state.factors.partialClutchFactor > 0.999, 'calibrated middle bite must peak');
  calibrated.update(1 / 120, { ...loaded, clutchEngagement: 0.75, clutchPedal: 0.25 });
  assert(calibrated.state.factors.partialClutchFactor === 0, 'calibrated bite end must return to zero');
  const sedanFactors = bite.state.factors;
  calibrated.setVehicleConfig(SPORTS_COUPE_PHYSICS_CONFIG);
  calibrated.reset();
  calibrated.update(1 / 120, { ...loaded, idleRPM: SPORTS_COUPE_PHYSICS_CONFIG.engine.idleRPM,
    rpm: SPORTS_COUPE_PHYSICS_CONFIG.engine.idleRPM, clutchEngagement: 0.5, clutchPedal: 0.5,
    forces: { ...loaded.forces, clutchTorque: 75 / 285 * 610 } });
  assert(Math.abs(calibrated.state.factors.clutchLoad - sedanFactors.clutchLoad) < 1e-9
    && Math.abs(calibrated.state.factors.lowRPMFactor - sedanFactors.lowRPMFactor) < 1e-9,
  'sedan/GT load and RPM factors must scale with actual vehicle capacity, idle, and stall calibration');
  const off = { ...loaded, engineRunning: false, rpm: 0 };
  const stall = judder.update(1 / 120, off);
  assert(stall.hapticPulses.filter(pulse => pulse.kind === 'stall').length === 1, 'running-to-stalled must produce exactly one event');
  assert(stall.hapticPulses[0]!.strong >= 0.3 && stall.hapticPulses[0]!.strong <= 0.5
    && stall.hapticPulses[0]!.durationMs <= 170, 'stall must use one short, bounded pulse');
  assert(stall.continuousRumble.weak === 0 && stall.drivetrainVibrationIntensity === 0, 'idle/judder must stop immediately after stall');
  for (let step = 0; step < 120; step += 1) assert(judder.update(1 / 120, off).hapticPulses.length === 0, 'stalled state retriggered its pulse');
  judder.reset(off);
  assert(judder.update(1 / 120, off).hapticPulses.length === 0, 'explicit ignition rebase must not produce a stall edge');

  const collision = new VehicleFeedbackSystem(); collision.reset(initial);
  let impactCount = 0;
  const contact = { collided: true, contacts: [{ inwardSpeed: 8 }] };
  for (let step = 0; step < 360; step += 1) impactCount += collision.update(1 / 120, initial, contact).hapticPulses.filter(pulse => pulse.kind === 'collision').length;
  assert(impactCount === 1, 'pushing/scraping the same wall continuously must not repeatedly buzz');
  for (let step = 0; step < 24; step += 1) collision.update(1 / 120, initial, { collided: false, contacts: [] });
  assert(collision.update(1 / 120, initial, contact).hapticPulses.some(pulse => pulse.kind === 'collision'),
    'a separate re-entry impact after clearing the wall must generate an event');
  collision.reset(initial);
  assert(collision.update(1 / 120, initial, { collided: true, contacts: [{ inwardSpeed: 0 }] }).hapticPulses.length === 0,
    'pure penetration repair with no impact speed must not rumble');

  const reengage = (closeRate: number, mismatch: number): number => {
    const observer = new VehicleFeedbackSystem();
    const open = make({ gear: 2, speed: 8, clutchEngagement: 0.4, acceleration: 0,
      forces: { ...initial.forces, clutchTorque: 0, clutchSlipAngularVelocity: mismatch } });
    observer.reset(open);
    return observer.update(1 / 120, { ...open, clutchEngagement: 0.4 + closeRate / 120,
      acceleration: closeRate * 0.8, forces: { ...open.forces, clutchTorque: 100 } }).drivetrainJoltIntensity;
  };
  const matched = reengage(2.5, 1); const mismatched = reengage(2.5, 150); const gentle = reengage(0.15, 150);
  assert(mismatched > matched * 2 && mismatched > gentle * 2,
    'actual slip mismatch and engagement rate must distinguish gentle/matched and rough re-engagement');
  const lash = new VehicleFeedbackSystem(); const lashSnapshot = { ...loaded, rpm: 3_000 };
  lash.reset(lashSnapshot);
  const lashState = lash.update(1 / 120, lashSnapshot, null, { drivetrainLashJolt: -0.06 });
  assert(lashState.hapticPulses.some(pulse => pulse.kind === 'jolt') && lashState.cockpitOffset.z < 0,
    'optional signed lash impulse must reuse the existing jolt pulse and cockpit spring');
  const driving = new VehicleDynamics(); const observer = new VehicleFeedbackSystem(); observer.reset(driving.getSnapshot());
  const controls = { ...createNeutralVehicleInputState(), throttle: 0.3 };
  driving.requestGear(1);
  let normalLaunchPulseCount = 0;
  for (let step = 0; step < 720; step += 1) {
    const snapshot = driving.stepFixed(1 / 120, controls);
    const before = JSON.stringify(snapshot);
    const state = observer.update(1 / 120, snapshot);
    assert(JSON.stringify(snapshot) === before, 'feedback mutated real physics state');
    assert(Math.abs(state.cockpitOffset.y) < 0.003 && Math.abs(state.cockpitOffset.z) < 0.008,
      'normal launch feedback exceeded its small relative cockpit envelope');
    normalLaunchPulseCount += state.hapticPulses.filter(pulse => pulse.kind === 'jolt').length;
  }
  assert(normalLaunchPulseCount <= 3, 'normal automatic-clutch launch generated repeated scripted shocks');
  return { assertions, maximumIdleOffset, maximumJudderOffset: maximumOffset,
    manualJudderIntensity: near.state.drivetrainVibrationIntensity, automaticJudderIntensity: automatic.state.drivetrainVibrationIntensity,
    normalAutoClutchIntensity: automaticClutch.state.drivetrainVibrationIntensity,
    abnormalAutoClutchIntensity: abnormalAuto.state.drivetrainVibrationIntensity,
    matchedJolt: matched, mismatchedJolt: mismatched, gentleJolt: gentle,
    continuousWallPulseCount: impactCount, normalLaunchPulseCount, doesNotMutatePhysics: true };
}
