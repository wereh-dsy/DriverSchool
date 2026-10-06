import { createDefaultVehiclePhysicsConfig } from '../config';
import { BrakeSystem } from './BrakeSystem';
import { WheelRotationSystem, type WheelRotationInput } from './WheelRotationSystem';

/** Small numerical/API regression; no handling optimisation or long driving runs. */
export function runWheelRotationSelfTest() {
  const config = createDefaultVehiclePhysicsConfig();
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions++;
    if (!condition) throw new Error(`Wheel rotation self-test failed: ${message}`);
  };
  const input = (changes: Partial<WheelRotationInput> = {}): WheelRotationInput => ({
    longitudinalSpeed: 0, lateralSpeed: 0, driveTorque: 0, brakeTorque: 0,
    handbrakeTorque: 0, normalLoad: 3000, surfaceLongitudinalGrip: 1, ...changes,
  });
  const system = new WheelRotationSystem(config.tires, config.wheelRadius);
  const dt = 1 / 120;
  let stationary = system.getSnapshot('frontLeft');
  for (let i = 0; i < 30; i++) stationary = system.updateWheel('frontLeft', dt, input({ brakeTorque: 1800 }));
  assert(stationary.angularVelocity === 0 && stationary.longitudinalForce === 0,
    'brake at rest cannot create reverse rotation or chassis force');
  const driven = system.updateWheel('frontLeft', dt, input({ driveTorque: 650 }));
  assert(driven.angularVelocity > 0 && driven.slipRatio > 0 && driven.longitudinalForce > 0,
    'drive torque creates positive persistent wheel spin and tyre force at rest');
  assert(system.getSnapshot('frontRight').angularVelocity === 0, 'wheel states are independent');
  const forceBalance = 650 / config.wheelRadius + driven.rotationalInertiaForce;
  assert(Math.abs(forceBalance - driven.longitudinalForce) < 0.001, 'tyre force closes rotational torque balance');
  const angle = driven.rotationAngle;
  system.constrainAngularVelocity('frontLeft', 0, 0, 0);
  assert(system.getSnapshot('frontLeft').rotationAngle === angle, 'explicit contact correction preserves spin phase');
  assert(system.getSnapshot('frontLeft').longitudinalSpeed === 0 && system.getSnapshot('frontLeft').slipRatio === 0,
    'explicit velocity correction synchronises speed and slip diagnostics');

  system.reset();
  const held = system.updateWheel('frontLeft', dt, input({ brakeTorque: 700, staticLongitudinalForce: 1100 }));
  assert(held.staticContact && held.angularVelocity === 0 && held.slipRatio === 0 && held.longitudinalForce === 1100,
    'capacity-checked static friction holds hill force without needing creep/slip');
  assert(Math.abs(held.brakeReactionTorque + 1100 * config.wheelRadius) < 1e-10,
    'stationary hill support has matching bounded brake reaction torque');
  const unavailable = system.updateWheel('frontRight', dt, input({ brakeTorque: 10, staticLongitudinalForce: 1100 }));
  assert(!unavailable.staticContact && unavailable.longitudinalForce === 0,
    'insufficient applied torque cannot invent a static parking hold');
  const noGrip = system.updateWheel('rearRight', dt, input({ handbrakeTorque: 700,
    surfaceLongitudinalGrip: .1, staticLongitudinalForce: 1100 }));
  assert(!noGrip.staticContact, 'static contact cannot exceed available surface grip');
  system.reset(8);
  const moving = system.updateWheel('rearLeft', dt, input({ longitudinalSpeed: 8,
    brakeTorque: 3000, staticLongitudinalForce: 100 }));
  assert(!moving.staticContact, 'moving braking never uses the near-rest static branch');

  system.reset(20);
  let locked = system.getSnapshot('frontLeft');
  for (let i = 0; i < 30; i++) locked = system.updateWheel('frontLeft', dt,
    input({ longitudinalSpeed: 20, brakeTorque: 3000 }));
  assert(locked.angularVelocity === 0 && locked.slipRatio < -.9 && locked.longitudinalForce < 0,
    'heavy brake can lock a wheel while chassis is moving; no ABS modulation');
  assert(Math.abs(locked.longitudinalForce) <= config.tires.longitudinalGrip * 3000,
    'locked tyre stays within its surface/load grip limit');
  assert(Math.abs(locked.brakeReactionTorque) < 3000,
    'static brake reaction is bounded by requested torque, not a brake-pressure pulse');
  const unlocked = system.updateWheel('frontLeft', dt, input({ longitudinalSpeed: 20 }));
  assert(unlocked.angularVelocity > 0, 'releasing brake allows tyre reaction to spin wheel back up');

  system.reset(-10);
  let reverse = system.getSnapshot('rearLeft');
  for (let i = 0; i < 12; i++) reverse = system.updateWheel('rearLeft', dt,
    input({ longitudinalSpeed: -10, handbrakeTorque: 3000 }));
  assert(reverse.angularVelocity <= 0 && reverse.longitudinalForce > 0,
    'reverse braking opposes reverse motion without creating positive wheel rotation');
  system.reset();
  const reverseDrive = system.updateWheel('rearRight', dt, input({ driveTorque: -650 }));
  assert(reverseDrive.angularVelocity < 0 && reverseDrive.longitudinalForce < 0,
    'reverse propulsion preserves signed torque/force/slip');

  // Probe the exact same slip curve without integrating to check peak continuity.
  const probe = (ratio: number): number => {
    const omega = (1 + ratio) * 10 / config.wheelRadius;
    system.constrainAngularVelocity('frontRight', omega);
    return system.updateWheel('frontRight', 0, input({ longitudinalSpeed: 10 })).longitudinalForce;
  };
  const peakRatio = config.tires.peakSlipRatio / (1 - config.tires.peakSlipRatio);
  const peak = probe(peakRatio);
  assert(Math.abs(probe(0)) < 1e-8, 'zero longitudinal slip has zero tyre force');
  assert(Math.abs(probe(peakRatio - 1e-5) - probe(peakRatio + 1e-5)) < 0.01,
    'slip peak joins continuously');
  assert(peak > config.tires.longitudinalGrip * 3000 * .999 && probe(2) < peak && probe(2) > peak * .8,
    'slip curve reaches load-limited peak then has mild falloff');
  for (const speed of [-.01, 0, .01]) {
    system.reset(speed);
    const state = system.updateWheel('frontLeft', dt, input({ longitudinalSpeed: speed, driveTorque: 200 }));
    assert(Object.values(state).every(v => typeof v !== 'number' || Number.isFinite(v)), 'low-speed reference keeps every state finite');
  }
  system.reset();
  let unloaded = system.getSnapshot('frontLeft');
  for (let i = 0; i < 6; i++) unloaded = system.updateWheel('frontLeft', dt, input({ normalLoad: 0, driveTorque: 120 }));
  assert(unloaded.angularVelocity > 0 && unloaded.longitudinalForce === 0,
    'unloaded wheel retains torque-driven rotation but cannot create tyre force');

  const brakes = new BrakeSystem(config.brakes);
  brakes.update(1, .5, 1);
  const torques = [brakes.getWheelTorques('frontLeft'), brakes.getWheelTorques('frontRight'),
    brakes.getWheelTorques('rearLeft'), brakes.getWheelTorques('rearRight')] as const;
  assert(torques.every(t => t.appliedBrakeTorque === t.requestedBrakeTorque &&
    t.appliedHandbrakeTorque === t.requestedHandbrakeTorque), 'brake requested torque equals applied torque without modulation');
  const frontTotal = torques[0].requestedBrakeTorque + torques[1].requestedBrakeTorque;
  const rearTotal = torques[2].requestedBrakeTorque + torques[3].requestedBrakeTorque;
  assert(Math.abs(frontTotal / (frontTotal + rearTotal) - config.brakes.frontBrakeBias) < 1e-12,
    'service torques use front/rear hydraulic bias and equal axle-side split');
  assert(torques[0].requestedHandbrakeTorque === 0 && torques[1].requestedHandbrakeTorque === 0 &&
    torques[2].requestedHandbrakeTorque > 0 && torques[2].requestedHandbrakeTorque === torques[3].requestedHandbrakeTorque,
    'handbrake feeds rear corners only');
  brakes.reset();
  brakes.update(.05, 1);
  const pressureApplied = brakes.brakeInput;
  brakes.update(.05, 0);
  assert(pressureApplied > 0 && brakes.brakeInput < pressureApplied,
    'separate apply/release responses operate on curved pedal demand');
  return { assertions, lockedWheelSlip: locked.slipRatio, reverseWheelForce: reverse.longitudinalForce };
}
