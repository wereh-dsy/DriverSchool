import { Euler, Group, Vector3 } from 'three';
import { DriverCamera } from '../../camera/DriverCamera';
import { createDefaultVehiclePhysicsConfig, type VehicleChassisConfig } from '../config';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import type { DrivingGround } from '../../world/DrivingGround';
import { sampleGroundGeometry, surfaceResponseAliases, SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import { wheelLocalPosition } from '../VehicleDimensions';
import { chassisBodyPose } from './WheelPhysicsState';
import { VehicleDynamics, type VehicleSnapshot } from './VehicleDynamics';
import { VehicleContactSystem } from './VehicleContactSystem';
import { WHEEL_IDS, createWheelContactBuffer } from './WheelContact';

const DT = 1 / 120;
const neutral = createNeutralVehicleInputState();
export function chassisGeometryValid(state: VehicleSnapshot, config: VehicleChassisConfig): boolean {
  const body = chassisBodyPose(state.chassis, 0, state.yaw);
  return WHEEL_IDS.every(id => {
    const w = state.wheels[id], g = w.geometry!, local = wheelLocalPosition(config, id);
    const mount = new Vector3(local.x, config.wheelRadius + config.suspension.restLength - w.suspensionRestCompression, local.z)
      .applyEuler(new Euler(body.pitch, state.yaw, body.roll, 'YXZ'))
      .add(new Vector3(state.x + body.offsetX, body.y, state.z + body.offsetZ));
    const center = new Vector3().copy(g.attachmentWorldPosition).addScaledVector(new Vector3().copy(g.suspensionAxis), g.suspensionLength);
    return mount.distanceTo(g.attachmentWorldPosition) < 1e-8 && center.distanceTo(w.worldPosition) < 1e-8 &&
      center.distanceTo(g.wheelCenterWorld) < 1e-8 && g.suspensionLength >= g.minSuspensionLength - 1e-9 &&
      g.suspensionLength <= g.maxSuspensionLength + 1e-9 && g.penetration < 1e-6 &&
      (w.grounded || (w.normalLoad === 0 && w.longitudinalForce === 0 && w.lateralForce === 0));
  });
}

/** A prescribed ground-force boundary, bypassing only the tyre producer in mechanical tests. */
export function chassisForceFixture(config = createDefaultVehiclePhysicsConfig(), longitudinal = 0, lateral = 0) {
  const car = new VehicleDynamics(config, { gear: 'N', driveSelector: 'N', engineRunning: false });
  const integrate = car.chassisMotion.integrate.bind(car.chassisMotion);
  car.chassisMotion.integrate = (h, x, z, yaw, frame, tyres, front, rear) => integrate(h, x, z, yaw, frame,
    Object.fromEntries(WHEEL_IDS.map(id => [id, { ...tyres[id], longitudinalForce: longitudinal,
      lateralForce: lateral, rollingResistanceForce: 0 }])) as unknown as typeof tyres, front, rear);
  return car;
}

export function runHighSpeedChassisRamp(speedKmh: number, refinement?: 2 | 4) {
  const config = createDefaultVehiclePhysicsConfig(), startZ = config.wheelBase * .5 + .15;
  const ground = { colliders: [], spawnPose: { position: new Vector3(0, .04, startZ), yawRadians: 0 },
    worldBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    sampleRoadSurface: (x: number, z: number) => ({ ...sampleGroundGeometry((_x, pz) => Math.max(0, -pz) * .35, x, z),
      ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt) }) } as unknown as DrivingGround;
  const car = new VehicleDynamics(config, { z: startZ, speed: speedKmh / 3.6, gear: 'N', driveSelector: 'N', engineRunning: false });
  const adapter = new VehicleContactSystem(ground, config);
  adapter.synchronize(car);
  if (refinement) {
    const step = car.stepFixed.bind(car);
    car.stepFixed = (h, input, environment) => step(h, input, { ...environment, contactMicrosteps: refinement });
  }
  const observed = car as unknown as { resolvePenetration(): boolean }, resolve = observed.resolvePenetration.bind(car);
  let stepCorrection = 0, maximumCorrection = 0, totalCorrection = 0, integratedMotion = 0;
  let elapsed = 0, explainedMotion = 0;
  const integrate = car.chassisMotion.integrate.bind(car.chassisMotion);
  car.chassisMotion.integrate = (...args) => {
    integrate(...args); elapsed += args[0]; explainedMotion += car.chassisMotion.velocity * args[0];
  };
  observed.resolvePenetration = () => { const y = car.chassisY, result = resolve(); stepCorrection += car.chassisY - y; return result; };
  const rows = [];
  let previous = car.getSnapshot(), valid = true, maxAcceleration = 0, maxForce = 0, maxVelocity = 0, maxMicrosteps = 1;
  for (let i = 0; i < 48; i++) {
    stepCorrection = 0;
    elapsed = 0; explainedMotion = 0;
    const state = adapter.step(DT, neutral, car), dy = state.chassis.chassisY - previous.chassis.chassisY;
    maximumCorrection = Math.max(maximumCorrection, stepCorrection); totalCorrection += stepCorrection;
    integratedMotion += Math.abs(dy - stepCorrection);
    valid &&= chassisGeometryValid(state, config) && Object.values(state.chassis).every(v => typeof v !== 'number' || Number.isFinite(v));
    valid &&= Math.abs(elapsed - DT) < 1e-12 && Math.abs(dy - stepCorrection - explainedMotion) < 1e-8;
    maxAcceleration = Math.max(maxAcceleration, Math.abs(state.chassis.verticalAcceleration));
    maxVelocity = Math.max(maxVelocity, state.chassis.verticalVelocity);
    maxMicrosteps = Math.max(maxMicrosteps, state.chassis.contactMicrosteps!);
    for (const id of WHEEL_IDS) maxForce = Math.max(maxForce, state.wheels[id].normalLoad);
    rows.push({ step: i + 1, y: car.chassisY, dy, velocity: car.verticalVelocity, acceleration: car.verticalAcceleration,
      pitch: state.chassis.pitch, pitchRate: state.chassis.pitchAngularVelocity!, roll: state.chassis.roll,
      rollRate: state.chassis.rollAngularVelocity!, correction: stepCorrection, microsteps: state.chassis.contactMicrosteps!,
      grounded: state.chassis.groundedWheels, wheels: Object.fromEntries(WHEEL_IDS.map(id => { const w = state.wheels[id];
        return [id, { spring: w.springForce, damper: w.damperForce, bump: w.bumpStopForce!, bar: w.antiRollForce!,
          stop: w.contactForce!, Fz: w.normalLoad, Fx: w.longitudinalForce, Fy: w.lateralForce,
          compressionVelocity: w.suspensionVelocity, length: w.suspensionLength!, grounded: w.grounded! }]; })) });
    previous = state;
  }
  return { speedKmh, refinement, valid, maximumCorrection, totalCorrection, integratedMotion,
    maxAcceleration, maxForce, maxVelocity, maxMicrosteps, safety: car.chassisMotion.safetyInterventions,
    finalY: car.chassisY, finalVelocity: car.verticalVelocity, finalPitchRate: car.chassisMotion.pitchAngularVelocity, rows };
}

export function runChassisDynamicsSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw Error('Phase 2 chassis: ' + message); };
  const settle = (car: VehicleDynamics) => { let s = car.getSnapshot(); for (let i = 0; i < 720; i++) s = car.stepFixed(DT, neutral); return s; };
  const config = createDefaultVehiclePhysicsConfig(), rest = settle(chassisForceFixture(config));
  const sum = (s: VehicleSnapshot, ids: readonly typeof WHEEL_IDS[number][]) => ids.reduce((v, id) => v + s.wheels[id].normalLoad, 0);
  assert(rest.chassis.groundedWheels === 4 && Math.abs(sum(rest, WHEEL_IDS) - rest.effectiveVehicleMass * config.gravity) < 1 &&
    Math.abs(rest.chassis.verticalVelocity) < .001 && Math.abs(rest.chassis.pitchAngularVelocity!) < .001 &&
    Math.abs(rest.chassis.rollAngularVelocity!) < .001, 'flat sprung-body equilibrium conserves weight and settles all three rates');
  const brake = settle(chassisForceFixture(config, -1000)), squat = settle(chassisForceFixture(config, 1000));
  assert(brake.chassis.pitch < 0 && squat.chassis.pitch > 0 &&
    sum(brake, ['frontLeft', 'frontRight']) > sum(rest, ['frontLeft', 'frontRight']) &&
    sum(brake, ['rearLeft', 'rearRight']) < sum(rest, ['rearLeft', 'rearRight']), 'ground tyre forces create dive/squat and suspension load redistribution');
  const noBarConfig = structuredClone(config);
  noBarConfig.suspension.antiRollStiffnessFront = noBarConfig.suspension.antiRollStiffnessRear = 0;
  const corner = settle(chassisForceFixture(config, 0, 1000)), noBar = settle(chassisForceFixture(noBarConfig, 0, 1000));
  assert(corner.chassis.roll > 0 && sum(corner, ['frontLeft', 'rearLeft']) > sum(corner, ['frontRight', 'rearRight']) &&
    Math.abs(corner.chassis.roll) < Math.abs(noBar.chassis.roll) &&
    Math.abs(corner.wheels.frontLeft.antiRollForce! + corner.wheels.frontRight.antiRollForce!) < 1e-8,
  'lateral ground force rolls outward; equal/opposite ARB reactions reduce travel difference without adding heave');
  const flying = chassisForceFixture(), contacts = createWheelContactBuffer();
  flying.syncWheelContacts(contacts); flying.chassisMotion.pitchAngularVelocity = .4; flying.chassisMotion.rollAngularVelocity = -.3;
  const startPitch = flying.chassisMotion.pitch, startRoll = flying.chassisMotion.roll;
  for (const id of WHEEL_IDS) Object.assign(contacts[id], { height: -100 });
  let air = flying.getSnapshot(); for (let i = 0; i < 24; i++) air = flying.stepFixed(DT, neutral, { wheelContacts: contacts });
  assert(air.chassis.groundedWheels === 0 && Math.abs(air.chassis.pitch - startPitch - .4 * DT * 24) < 1e-9 &&
    Math.abs(air.chassis.roll - startRoll + .3 * DT * 24) < 1e-9 && chassisGeometryValid(air, config),
  'airborne retains angular momentum, gravity and attached zero-force wheels without terrain authority');
  const landing = chassisForceFixture(); landing.syncWheelContacts(createWheelContactBuffer());
  const lowered = createWheelContactBuffer();
  for (const id of WHEEL_IDS) Object.assign(lowered[id], { height: id.endsWith('Right') ? -.3 : -.7 });
  let landed = landing.getSnapshot(), landingTorque = 0, maxAngleStep = 0;
  for (let i = 0; i < 100; i++) { const p = landed.chassis.roll; landed = landing.stepFixed(DT, neutral, { wheelContacts: lowered });
    landingTorque = Math.max(landingTorque, Math.abs(landed.chassis.rollTorque!)); maxAngleStep = Math.max(maxAngleStep, Math.abs(landed.chassis.roll - p)); }
  assert(landingTorque > 100 && maxAngleStep < .08 && chassisGeometryValid(landed, config), 'uneven landing rotates through corner torque instead of snapping to terrain');
  const noseLanding = chassisForceFixture(), noseGround = createWheelContactBuffer();
  noseLanding.syncWheelContacts(createWheelContactBuffer());
  for (const id of WHEEL_IDS) Object.assign(noseGround[id], { height: id.startsWith('front') ? -.3 : -.7 });
  let noseResponse = false;
  for (let i = 0; i < 60; i++) {
    const state = noseLanding.stepFixed(DT, neutral, { wheelContacts: noseGround });
    noseResponse ||= state.chassis.pitchTorque! > 100 && state.chassis.pitchAngularVelocity! > .001;
  }
  assert(noseResponse && noseLanding.chassisMotion.safetyInterventions === 0,
    'front-axle-first landing produces positive pitch torque/rate instead of resetting angular velocity');
  const ramps = [80, 100, 120, 140].map(speed => runHighSpeedChassisRamp(speed));
  assert(ramps.every(r => r.valid && r.safety === 0 && r.maximumCorrection < .01 &&
    r.totalCorrection < r.integratedMotion * .1 && r.maxMicrosteps > 1), 'all ramp speeds retain geometry and residual-only correction with adaptive contact');
  const two = runHighSpeedChassisRamp(140, 2), four = runHighSpeedChassisRamp(140, 4);
  assert(Math.abs(two.finalY - four.finalY) < .15 && Math.abs(two.finalVelocity - four.finalVelocity) < .8 &&
    Math.abs(two.finalPitchRate - four.finalPitchRate) < .1 && Math.max(two.maxForce, four.maxForce) / Math.min(two.maxForce, four.maxForce) < 1.4,
  '2-to-4 refinement converges in displacement, launch velocity, pitch rate and step-averaged peak reaction');
  const mountResponse = (hz: number) => {
    const camera = new DriverCamera({ driverEyePosition: { x: 0, y: 1, z: 0 } }), root = new Group();
    camera.update(root, 0);
    root.position.y = .2; root.rotation.set(.08, .4, .05, 'YXZ');
    camera.update(root, 1 / hz);
    const first = camera.camera.position.y;
    for (let i = 1; i < hz / 2; i++) camera.update(root, 1 / hz);
    return { first, y: camera.camera.position.y, pitch: new Euler().setFromQuaternion(camera.camera.quaternion, 'YXZ').x };
  };
  const camera60 = mountResponse(60), camera120 = mountResponse(120);
  assert(camera60.first > 1 && camera60.first < camera60.y && Math.abs(camera60.y - camera120.y) < 1e-8 &&
    Math.abs(camera60.pitch - .08) < 1e-6, 'seat mount filters the onset, retains real pitch and converges independently of render rate');
  return { assertions, restLoad: sum(rest, WHEEL_IDS), brakePitch: brake.chassis.pitch, cornerRoll: corner.chassis.roll,
    noBarRoll: noBar.chassis.roll, landingTorque, maxAngleStep,
    ramps: ramps.map(({ rows: _rows, ...summary }) => summary), convergence: { two: { ...two, rows: undefined }, four: { ...four, rows: undefined } } };
}
