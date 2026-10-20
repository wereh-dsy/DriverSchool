import { createDefaultVehiclePhysicsConfig } from '../config';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { BrakeTorqueCoordinator } from '../physics/BrakeTorqueCoordinator';
import { WHEEL_IDS } from '../physics/WheelContact';
import { VehicleControlSystem } from './VehicleControlSystem';
import { AdaptiveDriverLayer } from './adaptive/AdaptiveDriverLayer';
import { DriverProfileStore } from './adaptive/DriverProfileStore';
import { createNeutralDriverProfile } from './adaptive/DriverProfile';

/** Small control-boundary checks, no driving simulation or subjective tuning. */
export function runVehicleControlSystemSelfTest(): { assertions: number } {
  let assertions = 0;
  const assert = (ok: boolean, label: string): void => { assertions++; if (!ok) throw new Error(`Vehicle control: ${label}`); };
  const dt = 1 / 120, config = createDefaultVehiclePhysicsConfig();
  const wheels = new VehicleDynamics(config).getSnapshot().wheels;
  const control = new VehicleControlSystem(config);
  control.setOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true });
  control.reset(true);
  const state = control.estimator.update(dt, 0, 0, 0, 0, 0, 0, {
    ...wheels, frontLeft: { ...wheels.frontLeft, slipRatio: NaN, angularVelocity: 0, longitudinalSpeed: 0 },
  });
  assert(state.wheels.frontLeft.longitudinalSlipRatio === 0 && Number.isFinite(state.estimatedSideslipAngle), 'finite stationary fallback');
  const airborne = { ...wheels, frontLeft: { ...wheels.frontLeft, grounded: false, normalLoad: 0, longitudinalSpeed: 10, slipRatio: -.9 } };
  control.updateBrakes(dt, 10, 1, airborne, [0, 3000, 3000, 3000]);
  assert(!state.wheels.frontLeft.grounded && control.pressures[0] === 1, 'airborne wheel is not a locked road contact');
  const locked = { ...wheels, frontLeft: { ...wheels.frontLeft, grounded: true, normalLoad: 3500, longitudinalSpeed: 10, slipRatio: -.9 } };
  for (let i = 0; i < 30; i++) control.updateBrakes(dt, 10, 1, locked, [4000, 4000, 1500, 1500]);
  assert(control.pressures[0]! < .5 && control.pressures[1] === 1 && control.pressures.every(Number.isFinite), 'independent finite ABS pressure');
  assert(control.frontBrakeBias > config.brakes.frontBrakeBias, 'EBD follows dynamic axle capacity');
  control.updateBrakes(dt, .2, 1, locked, [4000, 4000, 1500, 1500]);
  assert(control.pressures.every(p => p === 1), 'ABS low-speed exit');
  const mild = { ...wheels, frontLeft: { ...wheels.frontLeft, grounded: true, normalLoad: 3500,
    longitudinalSpeed: 10, angularVelocity: 12.5 / config.wheelRadius, slipRatio: .2 } };
  control.reset(true);
  for (let i = 0; i < 10; i++) control.updateTraction(dt, mild, 1, true, true);
  assert(control.tractionBrakeTorques[0]! > 0 && control.engineTorqueFactor === 1, 'mild spin brakes the wheel before torque limiting');
  for (let i = 0; i < 60; i++) control.updateTraction(dt, mild, 1, true, true);
  assert(control.engineTorqueFactor < 1, 'persistent spin requests progressive torque reduction');
  const factor = control.engineTorqueFactor;
  for (let i = 0; i < 10; i++) control.updateTraction(dt, wheels, 1, true, true);
  assert(control.engineTorqueFactor > factor && control.engineTorqueFactor < 1, 'torque recovery is gradual');
  control.reset(true);
  const nonDriven = { ...wheels, rearLeft: { ...mild.frontLeft, id: 'rearLeft' as const, slipRatio: .9 } };
  for (let i = 0; i < 30; i++) control.updateTraction(dt, nonDriven, 1, true, true);
  assert(control.engineTorqueFactor === 1 && control.tractionBrakeTorques.every(t => t === 0), 'non-driven wheel cannot trigger TCS');
  const coordinator = new BrakeTorqueCoordinator();
  coordinator.requestBase(0, 200, 75);
  control.arbitrator.submitBrakes(coordinator, [100, 0, 0, 0], [50, 0, 0, 0]);
  const delivery = coordinator.resolve(0, 300, .2);
  assert(delivery.requestedBrakeTorque === 300 && delivery.appliedBrakeTorque === 60 && delivery.appliedHandbrakeTorque === 75,
    'additive requests saturate hardware before final ABS; mechanical parking is separate');
  coordinator.requestWheel(0, 'esc', 500);
  assert(coordinator.resolve(0, 300, .2).appliedBrakeTorque === 60, 'late service request cannot overwrite ABS authority');
  for (const sign of [-1, 1]) {
    control.reset(true);
    for (const id of WHEEL_IDS) Object.assign(state.wheels[id], { grounded: true, normalLoad: 3500, lateralForce: 0 });
    state.longitudinalVelocity = 20; state.steeringAngle = sign * .03; state.yawRate = -sign * .9;
    state.estimatedSideslipAngle = -sign * .2;
    for (let i = 0; i < 60; i++) control.updateStabilityState(dt, [4000, 4000, 3000, 3000], [4000, 4000, 3000, 3000]);
    assert(control.esc.brakeTorques[sign > 0 ? 0 : 1]! > 0 && control.esc.yawMomentRequest * sign > 0 && control.esc.torqueFactor < 1,
      'ESC brake lever opposes excess yaw in both directions');
  }
  let saved: string | null = null;
  const store = new DriverProfileStore({ getItem: () => saved, setItem: (_key, value) => { saved = value; }, removeItem: () => { saved = null; } });
  const profile = createNeutralDriverProfile();
  Object.assign(profile, { throttleAggressiveness: .9, accelerationPreference: .9, sampleDuration: 1200 });
  store.save(profile);
  const adaptive = new AdaptiveDriverLayer(store), intent = { throttle: .6, brake: .2, steering: .1 };
  const flags = { absActive: false, tcsActive: false, escActive: false };
  adaptive.setEnabled(true);
  for (let i = 0; i < 180; i++) adaptive.update(dt, intent, state, flags, false);
  const learnedExponent = adaptive.calibration.throttleExponent;
  assert(learnedExponent < .95, 'confident profile applies bounded soft mapping');
  adaptive.update(dt, intent, state, flags, true);
  const duration = adaptive.profile.sampleDuration;
  adaptive.setEnabled(false);
  const retained = saved;
  adaptive.update(dt, intent, state, flags, true);
  assert(adaptive.profile.sampleDuration === duration && saved === retained && saved !== null, 'OFF stops learning and retains storage');
  assert(adaptive.calibration.throttleExponent > learnedExponent && adaptive.calibration.throttleExponent < 1, 'OFF blends application toward factory');
  for (let i = 0; i < 240; i++) adaptive.update(dt, intent, state, flags, true);
  assert(Math.abs(adaptive.calibration.throttleExponent - 1) < .003, 'OFF reaches baseline without erasing profile');
  adaptive.setEnabled(true); adaptive.update(dt, intent, state, flags, true);
  assert(adaptive.profile.sampleDuration > duration, 'ON resumes existing learning');
  assert(new AdaptiveDriverLayer(store).profile.sampleDuration === duration, 'stored profile restores across instances');
  const beforeReset = adaptive.calibration.throttleExponent;
  adaptive.resetProfile();
  assert(saved === null && adaptive.enabled && adaptive.profile.confidence === 0 && adaptive.profile.throttleAggressiveness === .5,
    'Reset clears persisted and long-term state, preserving ON');
  assert(adaptive.calibration.throttleExponent === beforeReset, 'Reset does not jump applied parameters');
  adaptive.update(dt, intent, state, flags, true);
  assert(adaptive.profile.sampleDuration === dt && adaptive.profile.confidence < .001, 'Reset starts fresh with low confidence');
  return { assertions };
}
