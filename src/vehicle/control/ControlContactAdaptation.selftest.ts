import { createExecutiveSedanPhysicsConfig } from '../config/executiveSedanPhysicsConfig';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { BrakeSystem } from '../physics/BrakeSystem';
import { createWheelContactBuffer, WHEEL_IDS, type WheelId } from '../physics/WheelContact';
import type { WheelPhysicsStateSet } from '../physics/WheelPhysicsState';
import { VehicleControlSystem } from './VehicleControlSystem';

/** Synthetic raw observations only: no road driving, physical solver calibration or benchmark. */
export function runControlContactAdaptationSelfTest(): { assertions: number } {
  let assertions = 0;
  const assert = (ok: boolean, label: string): void => { assertions++; if (!ok) throw new Error(`Contact control: ${label}`); };
  const config = createExecutiveSedanPhysicsConfig(), dt = 1 / 120;
  const physical = new VehicleDynamics(config).getSnapshot().wheels;
  const control = new VehicleControlSystem(config), brakes = new BrakeSystem(config.brakes);
  control.setOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true });
  control.reset(true);
  const contacts = createWheelContactBuffer();
  const chassis = { y: .2, velocity: .3, acceleration: -1, pitch: .08, roll: -.05,
    pitchAngularVelocity: .2, rollAngularVelocity: -.3 };
  const observations = (loads = [3500, 3500, 3500, 3500], slips = [0, 0, 0, 0], hop = false): WheelPhysicsStateSet => {
    const result = {} as Record<WheelId, WheelPhysicsStateSet[WheelId]>;
    for (let i = 0; i < 4; i++) {
      const id = WHEEL_IDS[i]!, source = physical[id];
      result[id] = { ...source, grounded: loads[i]! > 0, normalLoad: loads[i]!, estimatedFriction: 1,
        longitudinalSpeed: 20, angularVelocity: 20 * (1 + slips[i]!) / config.wheelRadius, slipRatio: slips[i]!, lateralForce: 0,
        geometry: { ...source.geometry!, unsprungPosition: .3, unsprungVelocity: hop && i === 0 ? .8 : 0,
          unsprungAcceleration: hop && i === 0 ? 100 : 0, tyreCompression: .015,
          tyreCompressionVelocity: hop && i === 0 ? .5 : 0, effectiveRadius: config.wheelRadius * .92 } };
    }
    return result;
  };
  const sample = (wheels: WheelPhysicsStateSet, yaw = 0, steering = 0, lateral = 0): void => {
    control.estimator.update(dt, 20, lateral, 0, 0, yaw, steering, wheels, contacts, chassis);
    control.updateDriverIntent(dt, .6, brakes.brakeInput, steering, true, false);
    control.updateTraction(dt, wheels, .6, true, true, true, contacts, true);
    const capacities = WHEEL_IDS.map(id => Math.max(0, wheels[id].normalLoad));
    control.updateStabilityState(dt, capacities, capacities);
    control.resolveServiceBrakes(dt, brakes, capacities, 'both');
  };
  const steady = observations();
  control.adaptive.setEnabled(true);
  for (let i = 0; i < 12; i++) sample(steady);
  const state = control.estimator.state, w = state.wheels.frontLeft;
  assert(state.pitch === chassis.pitch && state.rollRate === chassis.rollAngularVelocity && state.chassisY === chassis.y,
    'actual chassis attitude/rates/heave are observable');
  assert(w.unsprungPosition === .3 && w.tyreCompression === .015 && w.effectiveRadius === config.wheelRadius * .92 &&
    w.wheelLinearSurfaceSpeed === w.wheelAngularVelocity * config.wheelRadius, 'radial geometry is separate from the solver rolling/slip radius');
  const learned = control.adaptive.profile.sampleDuration;
  const positiveSpike = observations([500, 3500, 3500, 3500], [.95, 0, 0, 0], true);
  const beforeSplit = control.awd!.rearTorqueSplit;
  sample(positiveSpike);
  assert(positiveSpike.frontLeft.normalLoad === 500 && w.rawNormalLoad === 500 && w.estimatedControlNormalLoad > 500,
    'raw Fz remains untouched and separate from its short control estimate');
  assert(!control.getSnapshot().tcsActive && control.engineTorqueFactor > .98 && control.tractionBrakeTorques.every(t => t === 0),
    'one wheel-hop slip spike cannot produce strong road TCS or wheel braking');
  assert(Math.abs(control.awd!.rearTorqueSplit - beforeSplit) <= control.calibration.drivetrain.rateLimit * dt + 1e-12,
    'a hop cannot jump AWD distribution');
  assert(control.adaptive.profile.sampleDuration === learned, 'contact transient is excluded from learned intervention statistics');
  for (let i = 0; i < 12; i++) sample(steady);
  brakes.brakeInput = 1;
  sample(observations([500, 3500, 3500, 3500], [-.95, 0, 0, 0], true));
  assert(!control.getSnapshot().absActive && control.pressures[0] === 1, 'one braking slip spike does not start ABS pumping');
  assert(control.regenerativeTorqueLimit(0) === 0, 'raw impending lock still releases regen in the same step');
  for (let i = 0; i < 12; i++) sample(steady);
  for (let i = 0; i < 24; i++) sample(observations([3500, 3500, 3500, 3500], [-.8, 0, 0, 0]));
  assert(control.getSnapshot().absActive && control.pressures[0]! < .5 && control.pressures[1] === 1,
    'sustained loaded lock still releases only its ABS channel');
  brakes.coordinator.requestWheel(0, 'traction', 10000);
  const resolved = brakes.getWheelTorques('frontLeft');
  assert(resolved.appliedBrakeTorque === resolved.requestedBrakeTorque * control.pressures[0]!, 'late service demand cannot bypass final ABS modulation');
  control.reset(true); brakes.reset();
  for (let i = 0; i < 12; i++) sample(steady);
  for (let i = 0; i < 36; i++) sample(observations([3500, 3500, 3500, 3500], [.7, 0, 0, 0]));
  assert(control.getSnapshot().tcsActive && control.engineTorqueFactor < .8 && control.differentialBrakeTorques[0]! > 0,
    'sustained loaded spin still escalates through EDL/TCS');
  control.reset(true);
  const airborne = observations([0, 3500, 3500, 3500], [1, 0, 0, 0], true);
  for (let i = 0; i < 20; i++) sample(airborne);
  assert(w.estimatedLongitudinalSlip === 0 && w.estimatedControlNormalLoad === 0 &&
    control.tractionBrakeTorques[0] === 0 && !control.getSnapshot().tcsActive && control.engineTorqueFactor < 1,
    'free-wheel overspeed protection is separate from road TCS and cannot request airborne brakes');
  control.reset(true);
  for (let i = 0; i < 12; i++) sample(steady);
  (contacts.frontLeft as { supportValid?: boolean }).supportValid = false;
  sample(steady);
  assert(w.rawNormalLoad === 3500 && w.contactState === 'support-rejected' && !w.grounded && w.safeLongitudinalCapacity === 0,
    'rejected support has no authority even if an old raw observation still carries load');
  brakes.brakeInput = 1; brakes.coordinator.requestWheel(0, 'esc', 10000);
  assert(brakes.getWheelTorques('frontLeft').requestedBrakeTorque === 0 && control.regenerativeTorqueLimit(0) === 0,
    'all service sources and regen obey rejected contact capacity');
  (contacts.frontLeft as { supportValid?: boolean }).supportValid = true;
  sample(steady);
  assert(w.contactState === 'landing' && !w.roadContactReady && w.driveSlipDuration === 0, 'landing starts new slip evidence instead of reusing airborne slip');
  for (let i = 0; i < 12; i++) sample(steady);
  const transferred = observations([5500, 4500, 1000, 1000]);
  for (let i = 0; i < 6; i++) sample(transferred);
  assert(w.estimatedControlNormalLoad > 5000, 'genuine load transfer is followed within 50 ms');
  for (let i = 0; i < 12; i++) sample(transferred);
  assert(WHEEL_IDS.reduce((sum, id) => sum + state.wheels[id].rawNormalLoad, 0) === 12000 && control.frontBrakeBias > .8,
    'EBD follows real axle Fz without renormalizing total load to mg');
  control.reset(true);
  for (let i = 0; i < 40; i++) sample(observations([0, 3500, 3500, 3500]), -.9, .03, -4);
  assert(control.esc.brakeTorques[0] === 0 && control.esc.brakeTorques[2]! > 0,
    'ESC chooses a loaded alternative when the preferred outside-front wheel is airborne');
  const authority = control.esc.brakeTorques[2]!;
  chassis.rollAngularVelocity = 4;
  sample(observations([0, 3500, 3500, 3500]), -.9, .03, -4);
  assert(control.esc.brakeTorques[2]! <= authority && state.yawRate === -.9 && state.pitch === chassis.pitch,
    'real attitude rates bound ESC brake authority without writing body motion');
  assert(WHEEL_IDS.every(id => { const wheel = state.wheels[id]; return Number.isFinite(wheel.estimatedLongitudinalSlip) &&
    Number.isFinite(wheel.estimatedControlNormalLoad) && Number.isFinite(wheel.safeLongitudinalCapacity); }), 'all control estimates remain finite');
  return { assertions };
}
