import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createDefaultVehiclePhysicsConfig, createSportsCoupePhysicsConfig,
  createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig } from '../config';
import { OpenDifferential } from './OpenDifferential';
import { TyreGripModel } from './TyreGripModel';
import { VehicleDynamics } from './VehicleDynamics';
import { WheelRotationSystem } from './WheelRotationSystem';

/** Short scalar/connection checks only; tuning and driving feel remain user-led. */
export function runTyreDifferentialSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++;
    if (!ok) throw new Error(`Tyre/differential self-test failed: ${message}`);
  };
  const config = createDefaultVehiclePhysicsConfig();
  const tyre = new TyreGripModel(config.tires);
  const limit = 3000;
  const stiffness = limit / config.tires.peakSlipAngle * 1.5;
  assert(tyre.longitudinalForce(0, limit) === 0 && tyre.lateralForce(0, stiffness, limit) === 0, 'zero slip has zero dynamic force');
  assert(tyre.longitudinalForce(config.tires.peakSlipRatio, limit) === limit, 'longitudinal peak follows configured slip');
  assert(Math.abs(tyre.lateralForce(config.tires.peakSlipAngle, stiffness, limit) + limit) < 1e-8,
    'lateral peak follows configured angle');
  for (const sign of [-1, 1]) {
    const fx = tyre.longitudinalForce(sign * config.tires.peakSlipRatio * 5, limit);
    const fy = tyre.lateralForce(sign * config.tires.peakSlipAngle * 5, stiffness, limit);
    assert(sign * fx > limit * .8 && -sign * fy > limit * .8, 'post-peak plateau is restrained with correct force signs');
  }
  for (const t of [0, .2, .8, .99999, 1, 1.00001, 2, 8]) {
    const fx = tyre.longitudinalForce(t * config.tires.peakSlipRatio, limit);
    const fy = tyre.lateralForce(t * config.tires.peakSlipAngle, stiffness, limit);
    assert(Number.isFinite(fx) && Number.isFinite(fy) && Math.abs(fx) <= limit && Math.abs(fy) <= limit,
      'curve probes remain finite and load bounded');
  }
  assert(Math.abs(tyre.lateralForce(config.tires.peakSlipAngle - 1e-6, stiffness, limit) -
    tyre.lateralForce(config.tires.peakSlipAngle + 1e-6, stiffness, limit)) < .01, 'lateral peak joins continuously');
  const small = 1e-7;
  assert(Math.abs(tyre.lateralForce(small, stiffness, limit) / small + stiffness) < 1,
    'normal-region lateral slope preserves cornering stiffness');
  assert(tyre.loadFactor(6000, 3000) < 1 && tyre.loadFactor(1500, 3000) > 1,
    'mild load sensitivity is relative to each static load');
  assert(tyre.combinedScale(0, limit, limit, limit) === 1 && tyre.combinedScale(limit, 0, limit, limit) === 1,
    'single-axis peak is unchanged');
  assert(tyre.combinedScale(limit * .4, limit * .6, limit, limit) === 1, 'moderate braking and steering retain authority');
  for (const x of [0, .3, .8, 1]) for (const y of [0, .4, .9, 1]) {
    const scale = tyre.combinedScale(x * limit, y * limit, limit, limit);
    assert(tyre.usage(x * limit * scale, y * limit * scale, limit, limit) <= 1 + 1e-9,
      'longitudinal and lateral share a finite budget');
  }
  assert(tyre.combinedScale(limit, limit, limit, limit) < .9, 'strong cornering reduces longitudinal force as well as lateral force');

  const diff = new OpenDifferential('front');
  diff.distributeTorque(1400);
  assert(diff.leftTorque === 700 && diff.rightTorque === 700, 'carrier splits torque equally without grip bias');
  assert(diff.updateSpeeds(20, 80) === 50, 'carrier is the average of independent wheel speeds');
  diff.distributeTorque(-1200);
  assert(diff.leftTorque === -600 && diff.rightTorque === -600 && diff.updateSpeeds(-30, -50) === -40,
    'reverse preserves signed torque and carrier speed');

  const wheels = new WheelRotationSystem(config.tires, config.wheelRadius);
  wheels.reset(10);
  diff.distributeTorque(1400);
  const dt = 1 / 120;
  for (let i = 0; i < 72; i++) {
    for (const id of ['frontLeft', 'frontRight'] as const) wheels.updateWheel(id, dt, {
      longitudinalSpeed: 10, lateralSpeed: 0, normalLoad: 3000, staticNormalLoad: 3000,
      driveTorque: id === 'frontLeft' ? diff.leftTorque : diff.rightTorque,
      brakeTorque: 0, handbrakeTorque: 0, surfaceLongitudinalGrip: id === 'frontLeft' ? 1 : .55,
    });
  }
  const left = wheels.getSnapshot('frontLeft'); const right = wheels.getSnapshot('frontRight');
  assert(right.angularVelocity > left.angularVelocity * 1.5 && right.slipRatio > left.slipRatio,
    'low-grip side spins independently without locking the high-grip wheel');
  assert(right.longitudinalForce < left.longitudinalForce * .8,
    'split surface loses axle traction through actual tyre forces, not a surface penalty');
  const splitTraction = left.longitudinalForce + right.longitudinalForce;
  wheels.reset(10);
  for (let i = 0; i < 72; i++) for (const id of ['frontLeft', 'frontRight'] as const) wheels.updateWheel(id, dt, {
    longitudinalSpeed: 10, lateralSpeed: 0, normalLoad: 3000, staticNormalLoad: 3000,
    driveTorque: 700, brakeTorque: 0, handbrakeTorque: 0, surfaceLongitudinalGrip: 1,
  });
  const asphaltTraction = wheels.getSnapshot('frontLeft').longitudinalForce + wheels.getSnapshot('frontRight').longitudinalForce;
  assert(splitTraction < asphaltTraction * .85, 'single low-grip driven wheel meaningfully reduces axle traction');
  wheels.reset(10);
  wheels.constrainAngularVelocity('frontLeft', 10 / config.wheelRadius);
  wheels.constrainAngularVelocity('frontRight', 12 / config.wheelRadius);
  for (let i = 0; i < 12; i++) {
    for (const id of ['frontLeft', 'frontRight'] as const) wheels.updateWheel(id, dt, {
      longitudinalSpeed: id === 'frontLeft' ? 10 : 12, lateralSpeed: 0, normalLoad: 3000,
      driveTorque: 0, brakeTorque: 0, handbrakeTorque: 0, surfaceLongitudinalGrip: 1,
    });
  }
  assert(wheels.getAngularVelocity('frontRight') > wheels.getAngularVelocity('frontLeft'),
    'different turning contact speeds retain different rolling wheel speeds');

  for (const preset of [config, createSportsCoupePhysicsConfig(), createTest6ATVehiclePhysicsConfig(), createTest7DCTVehiclePhysicsConfig()]) {
    const car = new VehicleDynamics(preset, { speed: 10, gear: 2, engineRPM: 2500, clutchEngagement: 1,
      controlMode: 'manual-clutch', driveSelector: 'D' });
    const front = preset.drivetrainType === 'FWD';
    car.wheelRotation.constrainAngularVelocity(front ? 'frontLeft' : 'rearLeft', 20);
    car.wheelRotation.constrainAngularVelocity(front ? 'frontRight' : 'rearRight', 80);
    assert(car.getSnapshot().differential.carrierAngularVelocity === 50, 'vehicle carrier uses actual driven wheel states');
    car.reset({ speed: 10, gear: 2, engineRPM: 2500, clutchEngagement: 1, controlMode: 'manual-clutch', driveSelector: 'D' });
    let snapshot = car.getSnapshot();
    for (let i = 0; i < 60; i++) snapshot = car.stepFixed(dt, {
      ...createNeutralVehicleInputState(), throttle: .5, controlMode: 'manual-clutch', clutchPedal: 0, steering: .1,
    });
    const a = snapshot.wheels[front ? 'frontLeft' : 'rearLeft'];
    const b = snapshot.wheels[front ? 'frontRight' : 'rearRight'];
    assert(snapshot.differential.axle === (front ? 'front' : 'rear') &&
      (snapshot.differential.type === 'lsd' ? Math.abs(a.driveTorque + b.driveTorque - snapshot.differential.inputTorque) < 1e-9 : a.driveTorque === b.driveTorque),
      'powertrains route conserving torque through the configured axle carrier');
    assert(snapshot.wheels[front ? 'rearLeft' : 'frontLeft'].driveTorque === 0 &&
      snapshot.wheels[front ? 'rearRight' : 'frontRight'].driveTorque === 0, 'non-driven axle never receives propulsion');
    assert(Math.abs(snapshot.differential.carrierAngularVelocity - (a.angularVelocity + b.angularVelocity) / 2) < 1e-9,
      'snapshot carrier stays aligned with current independent wheel states');
    assert(Object.values(snapshot.wheels).every(w => Object.values(w).every(v => typeof v !== 'number' || Number.isFinite(v))),
      'short driving connection check has no NaN/Infinity');
    car.reset();
    assert(car.getSnapshot().differential.inputTorque === 0, 'reset clears previous carrier torque');
  }
  return { assertions, splitTraction, asphaltTraction, splitWheelSpeedRatio: right.angularVelocity / left.angularVelocity };
}
