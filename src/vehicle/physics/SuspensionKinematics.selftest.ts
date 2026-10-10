import { createDefaultVehiclePhysicsConfig } from '../config';
import { VEHICLE_CATALOG } from '../VehicleCatalog';
import { SuspensionSystem, type SuspensionStep } from './SuspensionSystem';
import { WheelRotationSystem, type WheelRotationInput } from './WheelRotationSystem';
import { VehicleDynamics } from './VehicleDynamics';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { WHEEL_IDS } from './WheelContact';

export function runSuspensionKinematicsSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Suspension kinematics: ${message}`); };
  const close = (a: number, b: number, tolerance = 1e-8) => Math.abs(a - b) <= tolerance;
  const config = createDefaultVehiclePhysicsConfig(), k = config.suspension.kinematics!;
  const suspension = new SuspensionSystem(config), rest = suspension.getSnapshot();
  for (const id of WHEEL_IDS) {
    const axle = id.startsWith('front') ? k.front : k.rear;
    assert(close(rest.wheels[id].camberAngle, axle.staticCamber) && close(rest.wheels[id].toeAngle, axle.staticToe), `${id}: static alignment is relative to loaded rest`);
  }
  const settle = (system: SuspensionSystem, step: SuspensionStep) => {
    for (let i = 0; i < 600; i++) system.update(1 / 120, step);
    return system.getSnapshot();
  };
  const corner = settle(suspension, { longitudinalAcceleration: -4, lateralAcceleration: 4 });
  for (const id of WHEEL_IDS) {
    const wheel = corner.wheels[id], axle = id.startsWith('front') ? k.front : k.rear;
    const delta = wheel.compression - wheel.restCompression;
    assert(close(wheel.camberAngle, axle.staticCamber + axle.camberGainPerMeter * delta), `${id}: camber gain uses actual travel`);
    assert(close(wheel.toeAngle, axle.staticToe + axle.bumpToeGainPerMeter * delta), `${id}: bump toe uses actual travel`);
    assert(Number.isFinite(wheel.camberAngle) && Math.abs(wheel.camberAngle) < .15, `${id}: travel-bounded finite camber`);
  }
  assert(corner.wheels.frontLeft.camberAngle < rest.wheels.frontLeft.camberAngle, 'compressed outside wheel gains negative camber');
  assert(corner.wheels.frontRight.camberAngle > corner.wheels.frontLeft.camberAngle, 'extension and compression produce different camber');
  const absent = createDefaultVehiclePhysicsConfig(); absent.suspension.kinematics = undefined;
  const zero = createDefaultVehiclePhysicsConfig();
  for (const axle of Object.values(zero.suspension.kinematics!)) Object.assign(axle, { staticCamber: 0, camberGainPerMeter: 0, staticToe: 0, bumpToeGainPerMeter: 0, antiDiveRatio: 0, antiSquatRatio: 0 });
  const legacy = settle(new SuspensionSystem(absent), { longitudinalAcceleration: -3, lateralAcceleration: 2 });
  const neutral = settle(new SuspensionSystem(zero), { longitudinalAcceleration: -3, lateralAcceleration: 2 });
  assert(JSON.stringify(legacy) === JSON.stringify(neutral), 'all-zero alignment exactly preserves legacy suspension');
  const metadata = structuredClone(zero); metadata.suspension.kinematics!.front.topology = 'DOUBLE_WISHBONE';
  assert(JSON.stringify(settle(new SuspensionSystem(metadata), { longitudinalAcceleration: -3, lateralAcceleration: 2 })) === JSON.stringify(neutral), 'topology name alone never injects a physics bonus');
  const anti = structuredClone(zero); anti.suspension.kinematics!.front.antiDiveRatio = .75;
  const dive0 = settle(new SuspensionSystem(zero), { longitudinalAcceleration: -5, lateralAcceleration: 0 });
  const dive1 = settle(new SuspensionSystem(anti), { longitudinalAcceleration: -5, lateralAcceleration: 0 });
  assert(Math.abs(dive1.chassis.pitch) < Math.abs(dive0.chassis.pitch), 'anti dive reduces actual spring-driven pitch');
  assert(close(dive0.wheels.frontLeft.normalLoad, dive1.wheels.frontLeft.normalLoad, .01), 'anti dive retains physical front axle load transfer');
  const squat0 = structuredClone(zero); squat0.drivetrainType = squat0.drivetrainLayout = 'RWD'; squat0.frontTorqueSplit = 0; squat0.rearTorqueSplit = 1;
  const squat1 = structuredClone(squat0); squat1.suspension.kinematics!.rear.antiSquatRatio = .75;
  const s0 = settle(new SuspensionSystem(squat0), { longitudinalAcceleration: 4, lateralAcceleration: 0 });
  const s1 = settle(new SuspensionSystem(squat1), { longitudinalAcceleration: 4, lateralAcceleration: 0 });
  assert(Math.abs(s1.chassis.pitch) < Math.abs(s0.chassis.pitch), 'anti squat reduces driven rear spring travel');
  assert(close(s1.wheels.rearLeft.normalLoad, s0.wheels.rearLeft.normalLoad, .01), 'anti squat retains m ax h/L rear transfer');
  assert(close(Object.values(s1.wheels).reduce((sum, w) => sum + w.normalLoad, 0), squat1.mass * squat1.gravity), 'anti geometry conserves total support');
  const input: WheelRotationInput = { longitudinalSpeed: 15, lateralSpeed: 0, driveTorque: 0, brakeTorque: 0,
    handbrakeTorque: 0, normalLoad: 3500, staticNormalLoad: 3500, surfaceLongitudinalGrip: 1, surfaceLateralGrip: 1 };
  const tyre = new WheelRotationSystem(config.tires, config.wheelRadius); tyre.reset(15);
  const left = tyre.updateWheel('frontLeft', 1 / 120, { ...input, camberAngle: -.02 });
  const right = tyre.updateWheel('frontRight', 1 / 120, { ...input, camberAngle: .02 });
  assert(left.lateralForce > 0 && right.lateralForce < 0 && close(left.lateralForce, -right.lateralForce), 'negative normalized camber is mirrored and thrust cancels on a straight');
  for (const grip of [1, .25]) for (const camber of [-.1, 0, .1]) {
    tyre.reset(15);
    const w = tyre.updateWheel('frontLeft', 1 / 120, { ...input, lateralSpeed: 5, driveTorque: 2400,
      surfaceLongitudinalGrip: grip, surfaceLateralGrip: grip, camberAngle: camber });
    assert(w.gripUsage <= 1 + 1e-8 && Math.abs(w.lateralForce) <= w.lateralForceLimit + 1e-8, 'camber remains inside wet/dry combined budget');
  }
  const toeConfig = structuredClone(zero);
  toeConfig.suspension.kinematics!.front.staticToe = .012; toeConfig.suspension.kinematics!.rear.staticToe = .008;
  const car = new VehicleDynamics(toeConfig, { speed: 15, gear: 'N' });
  const snap = car.stepFixed(1 / 120, createNeutralVehicleInputState());
  assert(snap.wheels.frontLeft.steeringAngle > 0 && snap.wheels.frontRight.steeringAngle < 0 && snap.wheels.rearLeft.steeringAngle > 0 && snap.wheels.rearRight.steeringAngle < 0, 'positive toe-in changes actual four-wheel headings with mirrored signs');
  assert(snap.wheels.frontLeft.slipAngle * snap.wheels.frontRight.slipAngle < 0, 'toe enters physical slip, not only rendering');
  assert(Math.abs(snap.yawRate) < 1e-6, 'symmetric toe does not create spurious yaw');
  assert(VEHICLE_CATALOG.every(v => v.physicsConfig.suspension.kinematics !== undefined), 'all nine vehicles explicitly calibrated');
  return { assertions, cases: 11, calibratedVehicles: VEHICLE_CATALOG.length };
}
