import { createDefaultVehiclePhysicsConfig } from '../config/defaultVehiclePhysicsConfig';
import { createExecutiveSedanPhysicsConfig } from '../config/executiveSedanPhysicsConfig';
import { createMercedesE300LPhysicsConfig } from '../config/mercedesE300LPhysicsConfig';
import { createTaycan4SPhysicsConfig } from '../config/taycan4SPhysicsConfig';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import type { Powertrain } from '../powertrain/Powertrain';
import { WHEEL_IDS } from '../physics/WheelContact';
import { BaseControlCalibration } from './BaseControlCalibration';
import { resolveControlCalibration, HardSafetyEnvelope } from './VehicleControlCalibration';
import { AdaptiveDriverLayer } from './adaptive/AdaptiveDriverLayer';
import { DriverProfileStore } from './adaptive/DriverProfileStore';
import { createNeutralDriverProfile } from './adaptive/DriverProfile';
import { VehicleControlSystem } from './VehicleControlSystem';

/** Focused schema/calibration/allocation checks. No automated driving or feel tuning. */
export function runVehicleControlCalibrationSelfTest(): { assertions: number } {
  let assertions = 0;
  const assert = (ok: boolean, label: string): void => { assertions++; if (!ok) throw new Error(`Control calibration: ${label}`); };
  const dt = 1 / 120, a = 'executive-lwb-2t', b = 'mercedes-e300l-v214';
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
  const store = new DriverProfileStore(storage), old = createNeutralDriverProfile();
  old.sampleDuration = 1000; old.throttleAggressiveness = .9;
  entries.set('drivergame.driver-profile.v1', JSON.stringify({ version: 1, profile: old }));
  assert(store.load(a).sampleDuration === 0 && store.load(b).sampleDuration === 0, 'v1 global data cannot seed v2 vehicles');
  store.save(old, a);
  const layer = new AdaptiveDriverLayer(store, a), vehicle = new VehicleControlSystem(createExecutiveSedanPhysicsConfig());
  const source = new VehicleDynamics().getSnapshot().wheels;
  const state = vehicle.estimator.update(dt, 15, 0, 1, 0, 0, 0, source);
  const input = { throttle: .7, brake: 0, steering: .1 }, flags = { absActive: false, tcsActive: false, escActive: false };
  layer.setEnabled(true); layer.update(dt, input, state, flags, true);
  const learnedA = layer.profile.sampleDuration;
  layer.selectVehicle(b);
  assert(layer.profile.sampleDuration === 0 && layer.profile.confidence === 0 && layer.calibration.throttleExponent === 1,
    'switch A to B loads B and drops A applied offsets');
  layer.update(dt, input, state, flags, true); layer.persist();
  assert(store.load(a).sampleDuration === learnedA && store.load(b).sampleDuration === dt, 'A/B learning is isolated');
  layer.selectVehicle(a); layer.resetProfile();
  assert(layer.enabled && layer.profile.sampleDuration === 0 && store.load(a).confidence === 0 && store.load(b).sampleDuration === dt,
    'Reset A preserves B and global ON');
  layer.setEnabled(false); layer.update(dt, input, state, flags, true); layer.selectVehicle(b); layer.update(dt, input, state, flags, true);
  assert(layer.profile.sampleDuration === dt && store.load(a).sampleDuration === 0, 'OFF does not update either vehicle');
  layer.setEnabled(true); layer.update(dt, input, state, flags, true); layer.persist();
  assert(layer.profile.sampleDuration === 2 * dt && new AdaptiveDriverLayer(store, b).profile.sampleDuration === 2 * dt,
    'ON/recreation restores the current vehicle history');
  const fallback = createDefaultVehiclePhysicsConfig();
  delete fallback.controlCalibration; delete fallback.driverAids.tcs; delete fallback.driverAids.esc;
  const base = resolveControlCalibration(fallback);
  assert(base.tcs.slipMultiplier === BaseControlCalibration.tcs.slipMultiplier && base.throttle.pedalExponent === 1, 'missing vehicle calibration falls back');
  const audi = createExecutiveSedanPhysicsConfig(), mercedes = createMercedesE300LPhysicsConfig();
  const normal = resolveControlCalibration(audi, 'NORMAL'), sport = resolveControlCalibration(audi, 'SPORT');
  assert(resolveControlCalibration(mercedes, 'NORMAL').throttle.pedalExponent > normal.throttle.pedalExponent, 'vehicle baselines are distinct');
  assert(sport.throttle.pedalExponent < normal.throttle.pedalExponent && sport.esc.yawErrorThreshold > normal.esc.yawErrorThreshold &&
    sport.throttle.adaptiveAuthority < normal.throttle.adaptiveAuthority, 'mode overrides merge and bound learning authority');
  fallback.controlCalibration = { throttle: { pedalExponent: .01, torqueSmoothingSeconds: 10 },
    tcs: { slipMultiplier: 100 }, esc: { sideslipThreshold: 100 }, drivetrain: { rateLimit: 100 } };
  const bounded = resolveControlCalibration(fallback);
  assert(bounded.throttle.pedalExponent === HardSafetyEnvelope.minimumPedalExponent && bounded.throttle.torqueSmoothingSeconds === HardSafetyEnvelope.maximumSmoothingSeconds &&
    bounded.esc.sideslipThreshold <= .18 && bounded.tcs.slipMultiplier <= 1.8 && bounded.drivetrain.rateLimit <= HardSafetyEnvelope.maximumAxleRatioRate,
    'hard guardrails constrain authored calibration');
  const awd = vehicle.awd!;
  for (const id of WHEEL_IDS) Object.assign(state.wheels[id], { grounded: true, normalLoad: 3500,
    longitudinalVelocity: 15, linearSurfaceSpeed: 15, longitudinalSlipRatio: 0 });
  const start = awd.rearTorqueSplit;
  state.wheels.frontLeft.longitudinalSlipRatio = .8;
  let smooth = true, finite = true;
  for (let i = 0; i < 60; i++) {
    const previous = awd.rearTorqueSplit;
    awd.update(dt, state, .4, true);
    smooth &&= Math.abs(awd.rearTorqueSplit - previous) <= vehicle.calibration.drivetrain.rateLimit * dt + 1e-12;
    finite &&= Number.isFinite(awd.rearTorqueSplit) && Math.abs(awd.frontAxleTorqueRatio + awd.rearAxleTorqueRatio - 1) < 1e-12;
  }
  assert(finite && smooth && awd.rearTorqueSplit > start && awd.rearTorqueSplit <= audi.awd!.maximumRearTorqueSplit!, 'front slip moves bounded, rate-limited torque rearward');
  awd.reset(); state.wheels.frontLeft.longitudinalSlipRatio = 0; state.wheels.rearLeft.longitudinalSlipRatio = .8;
  for (let i = 0; i < 60; i++) awd.update(dt, state, .4, true);
  assert(awd.rearTorqueSplit < start && awd.rearTorqueSplit >= vehicle.calibration.drivetrain.minimumRearRatio, 'rear slip moves torque forward');
  const wheelSpin = { ...source, frontLeft: { ...source.frontLeft, grounded: true, normalLoad: 3500,
    longitudinalSpeed: 10, angularVelocity: 20 / audi.wheelRadius, slipRatio: .7 } };
  vehicle.reset(true); vehicle.updateTraction(dt, wheelSpin, 1, true, true);
  assert(vehicle.differentialBrakeTorques[0]! > 0 && vehicle.differentialBrakeTorques[1] === 0 && vehicle.engineTorqueFactor < 1,
    'generic EDL brakes the overspeed wheel; severe TCS retains final torque authority');
  const beforeSwitch = vehicle.awd!.rearTorqueSplit;
  vehicle.setDriveMode('SPORT');
  assert(vehicle.awd!.rearTorqueSplit === beforeSwitch && vehicle.esc.brakeTorques.length === 4, 'mode changes retain AWD state and shared ESC wiring');
  // One fixed-step wiring smoke check each, not a driving simulation or a physics suite.
  for (const config of [audi, createTaycan4SPhysicsConfig()]) {
    const car = new VehicleDynamics<Powertrain>(config, { speed: 10, driveSelector: 'D', vehicleOperational: true });
    const snapshot = car.stepFixed(dt, { ...createNeutralVehicleInputState(), throttle: .4 });
    assert(Number.isFinite(snapshot.speed) && car.vehicleControl.arbitrator.request.frontAxleTorqueRatio !== undefined &&
      car.vehicleControl.arbitrator.request.rearAxleTorqueRatio !== undefined &&
      Object.values(snapshot.wheels).every(w => Number.isFinite(w.driveTorque) && Number.isFinite(w.appliedBrakeTorque)), 'ICE/EV actuator request wiring is finite');
  }
  return { assertions };
}
