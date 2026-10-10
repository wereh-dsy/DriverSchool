import { cloneVehiclePhysicsConfig, createDefaultVehiclePhysicsConfig, type VehiclePhysicsConfig } from '../config';
import { createVehiclePhysicsConfig, ICE_VEHICLE_CATALOG } from '../VehicleCatalog';
import { centerOfMassOffsetZ, wheelLocalPosition } from '../VehicleDimensions';
import { DriverCamera } from '../../camera/DriverCamera';
import { Group, Object3D, Vector2, Vector3 } from 'three';
import type { DrivingGround } from '../../world/DrivingGround';
import { RearParkingProximity } from '../control/RearParkingProximity';
import { createStaticOBBCollider, createVehicleOBB } from './CollisionSystem';
import { sampleWheelContacts, WHEEL_IDS } from './WheelContact';
import { SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { SuspensionSystem } from './SuspensionSystem';
import { TyreGripModel } from './TyreGripModel';
import { VehicleDynamics } from './VehicleDynamics';
import { VehicleContactSystem } from './VehicleContactSystem';

export function runVehicleLayoutSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Vehicle layout: ${message}`); };
  const config = createDefaultVehiclePhysicsConfig();
  const near = (actual: number, expected: number, message: string) => assert(Math.abs(actual - expected) < 1e-9, message);
  const dt = 1 / 120, neutral = createNeutralVehicleInputState();
  const cgWorld = (pose: { x: number; z: number; yaw: number }, cgLocalZ: number) => ({
    x: pose.x + Math.sin(pose.yaw) * cgLocalZ,
    z: pose.z + Math.cos(pose.yaw) * cgLocalZ,
  });
  const slope = {
    sampleRoadSurface(x: number, z: number) {
      return { ...SURFACE_MATERIALS.asphalt, height: .06 * x + .08 * z,
        gradient: new Vector2(.06, .08), normal: new Vector3(-.06, 1, -.08).normalize(),
        grade: 0, gripMultiplier: 1, rollingResistanceMultiplier: 1 };
    },
  };
  const ground: DrivingGround = { ...slope, root: new Group(), colliders: [],
    spawnPose: { position: new Vector3(12, 0, -8), yawRadians: .3 },
    worldBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    metadata: { id: 'reference-slope-fixture', version: 1, displayName: 'Reference slope', description: 'Contact reference fixture' },
    getRoadHeightAt: (x, z) => .06 * x + .08 * z, getRoadPitchAt: () => 0, dispose: () => {} };
  for (const bias of [.5, .62, .42]) {
    const c = { ...createDefaultVehiclePhysicsConfig(), frontWeightBias: bias };
    c.driverAids.stabilityControlEnabled = false;
    const cgLocalZ = centerOfMassOffsetZ(c);
    near(cgLocalZ, c.wheelBase * (.5 - bias), 'CG offset from sole mass distribution');
    assert(bias === .5 ? cgLocalZ === 0 : bias > .5 ? cgLocalZ < 0 : cgLocalZ > 0, 'CG moves toward heavier axle');
    const car = new VehicleDynamics(c, { x: 12, z: -8, yaw: .3, speed: 15, gear: 'N' });
    near(car.x, 12, 'body spawn x unchanged'); near(car.z, -8, 'body spawn z unchanged');
    const cgBeforeRotation = cgWorld(car, cgLocalZ);
    car.yaw += Math.PI / 2;
    near(car.x, cgBeforeRotation.x - Math.sin(car.yaw) * cgLocalZ, '90-degree body offset rotates about CG in x');
    near(car.z, cgBeforeRotation.z - Math.cos(car.yaw) * cgLocalZ, '90-degree body offset rotates about CG in z');
    car.setPose(12, -8, Math.PI / 2, 15);
    near(cgWorld(car, cgLocalZ).x, 12 + cgLocalZ, '90-degree forward/rearward offset lies along world X');
    near(car.x, 12, 'body-to-CG round trip x'); near(car.z, -8, 'body-to-CG round trip z');
    car.yawRate = .35; car.lateralVelocity = .8;
    const before = car.getSnapshot(), cgBefore = cgWorld(before, cgLocalZ);
    const after = car.stepFixed(dt, neutral);
    const cgAfter = cgWorld(after, cgLocalZ);
    const averageSpeed = (before.speed + after.speed) * .5, middleYaw = before.yaw + after.yawRate * dt * .5;
    near(cgAfter.x - cgBefore.x, (-Math.sin(middleYaw) * averageSpeed + Math.cos(middleYaw) * after.lateralVelocity) * dt,
      'integrate CG x, not axle midpoint, during yaw');
    near(cgAfter.z - cgBefore.z, (-Math.cos(middleYaw) * averageSpeed - Math.sin(middleYaw) * after.lateralVelocity) * dt,
      'integrate CG z, not axle midpoint, during yaw');
    let yawMoment = 0;
    for (const id of WHEEL_IDS) {
      const wheel = after.wheels[id], local = wheelLocalPosition(c, id), leverZ = local.z - cgLocalZ;
      const forward = before.speed + before.yawRate * local.x;
      const right = before.lateralVelocity + before.yawRate * leverZ;
      const cosine = Math.cos(wheel.steeringAngle), sine = Math.sin(wheel.steeringAngle);
      near(wheel.longitudinalSpeed, forward * cosine + right * sine, `${id}: CG rigid-body forward point velocity`);
      near(wheel.lateralSpeed, right * cosine - forward * sine, `${id}: CG rigid-body lateral point velocity`);
      const longitudinal = wheel.longitudinalForce + wheel.rollingResistanceForce;
      yawMoment += local.x * (longitudinal * cosine - wheel.lateralForce * sine) +
        leverZ * (longitudinal * sine + wheel.lateralForce * cosine);
    }
    const damping = c.tires.lateralSlipRecoveryRate * .18 * before.yawRate;
    const yawAcceleration = yawMoment / c.yawInertia * Math.max(.05, c.steering.yawResponseScale) - damping;
    near(after.yawRate, before.yawRate + Math.max(-5, Math.min(5, yawAcceleration)) * dt, 'yaw moment uses CG lever and configured inertia');
    const adapter = new VehicleContactSystem(ground, c);
    const contactPose = adapter.step(dt, neutral, car), contactVelocity = adapter.collision!.velocity;
    const bodySideAfterContact = contactPose.lateralVelocity - contactPose.yawRate * cgLocalZ;
    near(contactVelocity.x, -Math.sin(contactPose.yaw) * contactPose.speed + Math.cos(contactPose.yaw) * bodySideAfterContact,
      'scene collision adapter supplies body-origin velocity x');
    near(contactVelocity.z, -Math.cos(contactPose.yaw) * contactPose.speed - Math.sin(contactPose.yaw) * bodySideAfterContact,
      'scene collision adapter supplies body-origin velocity z');
    for (const id of WHEEL_IDS) {
      const wheel = contactPose.wheels[id];
      near(wheel.worldPosition.y - c.wheelRadius, ground.getRoadHeightAt(wheel.worldPosition.x, wheel.worldPosition.z),
        `${id}: final contact height follows derived wheel world position`);
    }
    // Collision velocities describe the body point, then convert back to CG.
    const bodySide = .8 - .35 * cgLocalZ, yaw = contactPose.yaw;
    const corrected = car.applyContactCorrection({ x: 3, z: 7, yawRate: .35,
      velocityX: -Math.sin(yaw) * 15 + Math.cos(yaw) * bodySide,
      velocityZ: -Math.cos(yaw) * 15 - Math.sin(yaw) * bodySide });
    near(corrected.lateralVelocity, .8, 'collision body-point velocity restores CG velocity');
    near(corrected.x, 3, 'collision retains body pose x'); near(corrected.z, 7, 'collision retains body pose z');
    car.reset({ x: 12, z: -8, yaw: .3 });
    const atRest = car.stepFixed(dt, neutral);
    near(atRest.x, 12, 'reset has no visual position jump'); near(atRest.z, -8, 'reset z has no jump');
    near(atRest.lateralVelocity, 0, 'no initial lateral artifact');
    car.x = NaN; car.yaw = NaN;
    const recovered = car.stepFixed(dt, neutral);
    assert(recovered.recoveredFromInvalidState, 'invalid CG/yaw recovery');
    near(recovered.x, 12, 'recover authoritative CG even with invalid yaw');
  }
  const axleLoads = (c: VehiclePhysicsConfig, acceleration = 0) => {
    const suspension = new SuspensionSystem(c);
    for (let i = 0; i < 240; i++) suspension.update(1 / 120, { longitudinalAcceleration: acceleration, lateralAcceleration: 0 });
    const w = suspension.getSnapshot().wheels;
    return { front: w.frontLeft.normalLoad + w.frontRight.normalLoad, rear: w.rearLeft.normalLoad + w.rearRight.normalLoad };
  };
  const front = axleLoads(config);
  const mr = { ...config, enginePlacement: 'MID' as const, frontWeightBias: .42,
    drivetrainType: 'RWD' as const, drivetrainLayout: 'RWD' as const, frontTorqueSplit: 0, rearTorqueSplit: 1 };
  const rear = axleLoads(mr);
  validateVehiclePlatformConfig(mr);
  assert(front.front > front.rear && rear.rear > rear.front, 'FWD/MR static distribution');
  assert(Math.abs(front.front / (config.mass * config.gravity) - .62) < 1e-6, 'front share controls suspension initialization');
  assert(Math.abs(rear.front / (config.mass * config.gravity) - .42) < 1e-6, 'same geometry, rearward CG reduces front load');
  assert(axleLoads(mr, 4).rear > rear.rear && axleLoads(mr, -4).front > rear.front, 'acceleration/reverse braking transfer directions');
  const accelerated = axleLoads(mr, 4);
  const transfer = config.mass * 4 * config.centerOfMassHeight / config.wheelBase;
  assert(Math.abs(accelerated.rear - rear.rear - transfer) < transfer * .02, 'transfer is m*a*h/L');
  const rr = { ...mr, enginePlacement: 'REAR' as const, frontWeightBias: .38, yawInertia: 2900 };
  validateVehiclePlatformConfig(rr);
  assert(axleLoads(rr).rear > axleLoads(rr).front && rr.yawInertia > mr.yawInertia, 'RR supports independent polar inertia');
  const invalid = { ...mr, frontWeightBias: .65 };
  let rejected = false;
  try { validateVehiclePlatformConfig(invalid); } catch { rejected = true; }
  assert(rejected, 'implausible MID calibration rejected');
  validateVehiclePlatformConfig({ ...invalid, layoutCalibrationNote: 'Deliberate front ballast fixture' });
  const yaw = (inertia: number, placement: VehiclePhysicsConfig['enginePlacement']) => {
    const c = { ...config, yawInertia: inertia, enginePlacement: placement, layoutCalibrationNote: 'Identical mass properties metadata isolation fixture' };
    c.driverAids = { ...config.driverAids, stabilityControlEnabled: false };
    const car = new VehicleDynamics(c, { speed: 15, gear: 'N' });
    car.steering.update(1, .12, 15);
    const state = car.stepFixed(1 / 120, { ...createNeutralVehicleInputState(), steering: .12 });
    return { rate: state.yawRate, steeringAngle: state.steeringAngle,
      wheelForces: WHEEL_IDS.map(id => [state.wheels[id].longitudinalForce, state.wheels[id].lateralForce]) };
  };
  const low = yaw(1800, 'FRONT'), high = yaw(3600, 'FRONT');
  assert(Math.abs(low.rate) > Math.abs(high.rate) * 1.8, 'equivalent tyre moment responds through configured yaw inertia');
  const metadata = yaw(1800, 'MID');
  assert(Math.abs(metadata.rate - low.rate) < 1e-12, 'placement alone has no handling gain');
  near(metadata.steeringAngle, low.steeringAngle, 'placement metadata does not change steering');
  assert(JSON.stringify(metadata.wheelForces) === JSON.stringify(low.wheelForces), 'placement metadata does not change tyre grip forces');
  const grip = new TyreGripModel(config.tires), reference = config.mass * config.gravity / 4;
  assert(grip.loadFactor(reference * 1.2, reference) < 1 &&
    reference * 1.2 * grip.loadFactor(reference * 1.2, reference) < reference * 1.2, 'load-sensitive force is sublinear');
  for (const car of ICE_VEHICLE_CATALOG) {
    validateVehiclePlatformConfig(car.physicsConfig);
    const loads = axleLoads(car.physicsConfig);
    assert(Math.abs(loads.front / (loads.front + loads.rear) - car.physicsConfig.frontWeightBias) < 1e-6, `${car.id}: suspension matches mass distribution`);
    const dynamics = new VehicleDynamics(cloneVehiclePhysicsConfig(car.physicsConfig), { x: 12, z: -8, yaw: Math.PI / 2 });
    const pose = dynamics.stepFixed(dt, neutral);
    near(pose.x, 12, `${car.id}: first-step spawn x`); near(pose.z, -8, `${car.id}: first-step spawn z`);
    assert(!pose.recoveredFromInvalidState && pose.lateralVelocity === 0, `${car.id}: finite spawn without lateral artifact`);
    const samples = sampleWheelContacts(slope, pose, dynamics.config);
    for (const id of WHEEL_IDS) {
      const local = wheelLocalPosition(car.visualConfig.dimensions, id);
      near(pose.wheels[id].worldPosition.x, 12 + local.z, `${car.id}/${id}: visual wheel x matches physics`);
      near(pose.wheels[id].worldPosition.z, -8 - local.x, `${car.id}/${id}: visual wheel z matches physics`);
      near(samples[id].x, pose.wheels[id].worldPosition.x, `${car.id}/${id}: terrain sample x`);
      near(samples[id].z, pose.wheels[id].worldPosition.z, `${car.id}/${id}: terrain sample z`);
      near(samples[id].height, .06 * samples[id].x + .08 * samples[id].z, `${car.id}/${id}: slope at real wheel`);
    }
    const box = createVehicleOBB(pose, car.visualConfig.collisionDimensions);
    near(box.center.x, 12, `${car.id}: collision body center x`); near(box.center.z, -8, `${car.id}: collision body center z`);
    const root = new Object3D(); root.position.set(pose.x, 0, pose.z); root.rotation.y = pose.yaw;
    const eye = car.visualConfig.driverEyePosition;
    const camera = new DriverCamera({ driverEyePosition: new Vector3(...eye) });
    camera.update(root);
    near(camera.camera.position.x, 12 + eye[2], `${car.id}: camera stays at body anchor`);
    near(camera.camera.position.z, -8 - eye[0], `${car.id}: camera z anchor`);
    for (const mirror of [car.visualConfig.leftMirrorTransform, car.visualConfig.rightMirrorTransform]) {
      const world = root.localToWorld(new Vector3(...mirror.position));
      near(world.x, 12 + mirror.position[2], `${car.id}: mirror stays at body anchor`);
      near(world.z, -8 - mirror.position[0], `${car.id}: mirror z anchor`);
    }
    const rearBumperX = 12 + car.visualConfig.dimensions.length / 2;
    const wall = createStaticOBBCollider({ id: 'rear-wall', x: rearBumperX + 1.1, z: -8, width: .2, length: 4 });
    const sensors = new RearParkingProximity();
    const parking = sensors.update({ ...pose, y: 0, ...car.visualConfig.dimensions }, true, [wall]);
    near(parking.nearestDistanceM ?? NaN, 1, `${car.id}: sensors start at rear bumper`);
    dynamics.reset({ x: 12, z: -8, yaw: 0, speed: 15, gear: 'N', driveSelector: 'N' });
    const turned = dynamics.stepFixed(dt, { ...neutral, steering: .2 });
    assert(Number.isFinite(turned.yawRate) && turned.yawRate !== 0, `${car.id}: steering works with CG reference`);
  }
  const ferrari = createVehiclePhysicsConfig('ferrari-458-italia');
  assert(Object.values(ferrari.driveModes!).every(mode => mode.accelerationRearTorqueSplit === undefined), 'RWD modes omit AWD split');
  const mode = ferrari.driveModes!.SPORT!;
  let invalidModeRejected = false;
  try { validateVehiclePlatformConfig({ ...ferrari, driveModes: { SPORT: { ...mode, accelerationRearTorqueSplit: 1 } },
    driveModeOrder: ['SPORT'] }); } catch { invalidModeRejected = true; }
  assert(invalidModeRejected, 'non-AWD mode torque split rejected by config validator');
  const awd = createVehiclePhysicsConfig('executive-lwb-2t');
  const awdCar = new VehicleDynamics(awd);
  awdCar.cycleDriveMode();
  near(awd.awd!.accelerationRearTorqueSplit!, awd.driveModes!.SPORT!.accelerationRearTorqueSplit!, 'AWD mode split applied');
  awd.driveModes = { ...awd.driveModes, NORMAL: { ...awd.driveModes!.NORMAL!, accelerationRearTorqueSplit: undefined } };
  awdCar.cycleDriveMode();
  const previousSplit = awd.awd!.accelerationRearTorqueSplit!;
  awdCar.cycleDriveMode();
  near(awd.awd!.accelerationRearTorqueSplit!, previousSplit, 'omitted AWD mode split preserves current calibration');
  return { assertions, front, rear, accelerated };
}
