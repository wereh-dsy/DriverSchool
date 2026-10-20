import { Vector3 } from 'three';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import type { DrivingGround } from '../../world/DrivingGround';
import { sampleGroundGeometry, SURFACE_MATERIALS, surfaceResponseAliases } from '../../world/SurfaceMaterial';
import { createDefaultVehiclePhysicsConfig } from '../config';
import { wheelLocalPosition } from '../VehicleDimensions';
import { createWheelContactBuffer, sampleWheelContacts, WHEEL_IDS, type WheelContactSet, type WheelId } from './WheelContact';
import { VehicleContactSystem } from './VehicleContactSystem';
import { VehicleDynamics, type VehicleSnapshot } from './VehicleDynamics';
import { SuspensionSystem } from './SuspensionSystem';
import { chassisGeometryValid, runChassisDynamicsSelfTest } from './ChassisDynamics.selftest';
import { chassisBodyPose } from './WheelPhysicsState';

/** Phase 1 heave/contact regression: gravity, reach, landing and partial contact. */
export function runVerticalDynamicsSelfTest() {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Vertical dynamics: ${message}`);
  };
  const dt = 1 / 120;
  const neutral = createNeutralVehicleInputState();
  const config = createDefaultVehiclePhysicsConfig();
  const contactsAt = (heights: Partial<Record<WheelId, number>> = {}): WheelContactSet => {
    const contacts = createWheelContactBuffer();
    for (const id of WHEEL_IDS) {
      const local = wheelLocalPosition(config, id);
      Object.assign(contacts[id], { x: local.x, z: local.z, height: heights[id] ?? 0 });
    }
    return contacts;
  };
  const createCar = (): VehicleDynamics => new VehicleDynamics(config,
    { gear: 'N', engineRunning: false, driveSelector: 'N' });
  const geometryValid = (state: VehicleSnapshot): boolean => chassisGeometryValid(state, config);

  // A: flat rest is a real equilibrium, not a kinematic snap.
  const resting = createCar();
  resting.syncWheelContacts(contactsAt());
  const restHeight = resting.chassisY;
  let maximumRestSpeed = 0;
  let maximumRestDeviation = 0;
  let restState = resting.getSnapshot();
  for (let i = 0; i < 600; i++) {
    restState = resting.stepFixed(dt, neutral, { wheelContacts: contactsAt() });
    maximumRestSpeed = Math.max(maximumRestSpeed, Math.abs(restState.chassis.verticalVelocity));
    maximumRestDeviation = Math.max(maximumRestDeviation, Math.abs(restState.chassis.chassisY - restHeight));
  }
  assert(restState.chassis.groundedWheels === 4, 'flat ground keeps four wheels grounded');
  assert(maximumRestSpeed < 0.02 && maximumRestDeviation < 0.01,
    `flat rest does not oscillate (v ${maximumRestSpeed.toFixed(4)}, dy ${maximumRestDeviation.toFixed(4)})`);
  assert(WHEEL_IDS.every(id => restState.wheels[id].normalLoad > 0), 'flat rest keeps normal load');
  assert(geometryValid(restState), 'flat-rest geometry shares the chassis attachment and bounded strut');

  // B: surface far below suspension reach -> full free fall, zero tyre load.
  const fallingCar = createCar();
  fallingCar.syncWheelContacts(contactsAt());
  const farBelow = contactsAt(Object.fromEntries(WHEEL_IDS.map(id => [id, -20])) as Record<WheelId, number>);
  let falling = fallingCar.getSnapshot();
  for (let i = 0; i < 60; i++) {
    falling = fallingCar.stepFixed(dt, neutral, { wheelContacts: farBelow });
    assert(WHEEL_IDS.every(id => falling.wheels[id].normalLoad === 0 &&
      falling.wheels[id].longitudinalForce === 0 && falling.wheels[id].lateralForce === 0),
    'airborne wheel has no road force');
  }
  assert(falling.chassis.groundedWheels === 0, 'free fall reports zero grounded wheels');
  assert(falling.chassis.verticalVelocity < -1 && falling.chassis.chassisY < -0.5,
    'gravity integrates heave velocity and position');
  assert(Math.abs(falling.chassis.verticalAcceleration + config.gravity) < 0.1,
    'free-fall acceleration is gravity');
  assert(falling.wheels.frontLeft.worldPosition.y > -20 + config.wheelRadius,
    'airborne wheel hangs near full extension instead of the road');
  assert(geometryValid(falling) && WHEEL_IDS.every(id => {
    const g = falling.wheels[id].geometry!;
    return Math.abs(g.suspensionLength - g.maxSuspensionLength) < 1e-9;
  }), 'airborne wheels stay attached at maximum extension without chasing the surface');

  // C: landing compresses the spring, then rebounds without a hard snap.
  const landingCar = createCar();
  landingCar.syncWheelContacts(contactsAt());
  const lowGround = contactsAt(Object.fromEntries(WHEEL_IDS.map(id => [id, -0.4])) as Record<WheelId, number>);
  let landing = landingCar.getSnapshot();
  let previousY = landing.chassis.chassisY;
  let maximumStep = 0;
  let airborneSeen = false;
  let groundedAfterFall = false;
  let maximumCompression = 0;
  let reboundSeen = false;
  let landingGeometryValid = true;
  for (let i = 0; i < 480; i++) {
    landing = landingCar.stepFixed(dt, neutral, { wheelContacts: lowGround });
    landingGeometryValid &&= geometryValid(landing);
    maximumStep = Math.max(maximumStep, Math.abs(landing.chassis.chassisY - previousY));
    previousY = landing.chassis.chassisY;
    airborneSeen ||= landing.chassis.groundedWheels === 0;
    groundedAfterFall ||= airborneSeen && landing.chassis.groundedWheels === 4;
    maximumCompression = Math.max(maximumCompression,
      Math.max(...WHEEL_IDS.map(id => landing.wheels[id].suspensionCompression)));
    reboundSeen ||= groundedAfterFall && landing.chassis.verticalVelocity > 0.02;
  }
  assert(airborneSeen && groundedAfterFall, 'falling car becomes airborne and then lands');
  assert(maximumStep < 0.2, `landing never teleports to ride height (max step ${maximumStep.toFixed(3)}m)`);
  assert(maximumCompression > config.suspension.suspensionTravel * 0.05,
    'landing actually compresses the suspension');
  assert(reboundSeen, 'damper/spring rebound follows landing compression');
  assert(Math.abs(landing.chassis.verticalVelocity) < 0.05 &&
    Math.abs(landing.chassis.chassisY + 0.4) < 0.03, 'landing settles at the new surface height');
  assert(landingGeometryValid, 'every landing step keeps the wheel inside its attachment travel');

  // D: surface drop-away makes one axle airborne while the other still supports.
  const axleCar = createCar();
  axleCar.syncWheelContacts(contactsAt());
  const frontDrop = contactsAt({ frontLeft: -1.5, frontRight: -1.5 });
  let axle = axleCar.getSnapshot();
  for (let i = 0; i < 24; i++) axle = axleCar.stepFixed(dt, neutral, { wheelContacts: frontDrop });
  assert(axle.wheels.frontLeft.grounded === false && axle.wheels.frontRight.grounded === false,
    'drop-away axle is airborne');
  assert(axle.wheels.rearLeft.grounded === true && axle.wheels.rearRight.grounded === true,
    'remaining axle keeps contact');
  assert(axle.wheels.frontLeft.normalLoad === 0 && axle.wheels.frontRight.normalLoad === 0,
    'dropped axle carries no normal load');

  // E: a single unsupported wheel cannot receive load or tyre force.
  const singleCar = createCar();
  singleCar.syncWheelContacts(contactsAt());
  const singleDrop = contactsAt({ frontLeft: -1 });
  let single = singleCar.getSnapshot();
  for (let i = 0; i < 12; i++) single = singleCar.stepFixed(dt, neutral, { wheelContacts: singleDrop });
  assert(single.chassis.groundedWheels === 3, 'one-wheel drop reports three grounded wheels');
  assert(single.wheels.frontLeft.grounded === false && single.wheels.frontLeft.normalLoad === 0 &&
    single.wheels.frontLeft.longitudinalForce === 0 && single.wheels.frontLeft.lateralForce === 0,
  'single airborne wheel has zero load and zero road force');
  assert(WHEEL_IDS.filter(id => id !== 'frontLeft').every(id => single.wheels[id].grounded === true &&
    single.wheels[id].normalLoad > 0), 'grounded wheels retain valid load');
  assert(geometryValid(single), 'partial airborne wheels share the final body frame');

  // A final surface refresh must update contact/forces as well as visual centres.
  singleCar.syncWheelContacts(contactsAt({ frontLeft: -1, frontRight: -1, rearLeft: -1 }));
  const oneSupported = singleCar.getSnapshot();
  assert(oneSupported.chassis.groundedWheels === 1 && geometryValid(oneSupported) &&
    WHEEL_IDS.filter(id => id !== 'rearRight').every(id => !oneSupported.wheels[id].grounded &&
      oneSupported.wheels[id].normalLoad === 0 && oneSupported.wheels[id].longitudinalForce === 0 &&
      oneSupported.wheels[id].lateralForce === 0), 'final refresh immediately publishes one-wheel support and zero airborne forces');

  const bumpCar = createCar();
  bumpCar.syncWheelContacts(contactsAt());
  bumpCar.verticalVelocity = -6;
  bumpCar.syncWheelContacts(contactsAt(Object.fromEntries(WHEEL_IDS.map(id => [id, .5]))));
  const bump = bumpCar.getSnapshot();
  assert(geometryValid(bump) && WHEEL_IDS.every(id => {
    const g = bump.wheels[id].geometry!;
    return Math.abs(g.suspensionLength - g.minSuspensionLength) < 1e-9 && g.penetration < 1e-8;
  }), 'full bump clamps the strut and corrects the chassis before publishing the wheel');
  assert(bump.chassis.chassisY > 0 && bump.chassis.verticalVelocity < 0 && bump.chassis.verticalVelocity > -6,
    'full-bump safety lifts only for penetration and dissipates, rather than resets, falling velocity');

  const slopeCar = createCar();
  slopeCar.setPose(0, 0, .6);
  const slope = { sampleRoadSurface: (x: number, z: number) => ({
    ...sampleGroundGeometry((px, pz) => .45 * px - .25 * pz, x, z),
    ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt),
  }) };
  slopeCar.syncWheelContacts(sampleWheelContacts(slope, slopeCar.getSnapshot(), config));
  let sloped = slopeCar.getSnapshot();
  for (let i = 0; i < 24; i++) sloped = slopeCar.stepFixed(dt, neutral,
    { wheelContacts: sampleWheelContacts(slope, sloped, config) });
  assert(geometryValid(sloped) && sloped.chassis.groundedWheels > 0 && WHEEL_IDS.every(id => {
    const g = sloped.wheels[id].geometry!;
    return new Vector3().copy(g.wheelCenterWorld).sub(g.surfacePoint).dot(g.surfaceNormal) >= config.wheelRadius - 1e-7;
  }), 'banked slope contact uses normal distance and the actual yaw/pitch/roll attachment transform');

  // Contact-only two-deck fixture, without loading a map or its validation suites.
  let referenceHeight = 0;
  const layeredGround = {
    colliders: [], spawnPose: { position: { y: .04 } },
    worldBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    setSurfaceReferenceHeight: (height: number) => { referenceHeight = height; },
    sampleRoadSurface: (x: number, z: number) => ({
      ...sampleGroundGeometry(() => referenceHeight > 1.5 ? 3 : 0, x, z),
      ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt),
    }),
  } as unknown as DrivingGround;
  const layerCar = createCar(), adapter = new VehicleContactSystem(layeredGround, config);
  adapter.synchronize(layerCar);
  layerCar.chassisY = 3.04;
  const layered = adapter.step(dt, neutral, layerCar);
  assert(geometryValid(layered) && referenceHeight > 3 &&
    WHEEL_IDS.every(id => adapter.wheelContacts![id].height === 3),
  'layer selection/cache follows current chassis height instead of the stale lower support plane');

  // A missing corner must not alias the other slope into terrain attitude.
  const planeContacts = contactsAt();
  for (const id of WHEEL_IDS) Object.assign(planeContacts[id], {
    height: -.11 * planeContacts[id].z + .19 * planeContacts[id].x,
  });
  const planeSpring = new SuspensionSystem(config);
  const planeFrame = planeSpring.getVerticalSnapshot();
  planeSpring.synchronizeGroundGeometry(planeContacts, { ...planeFrame,
    wheels: { ...planeFrame.wheels,
      frontLeft: { ...planeFrame.wheels.frontLeft, grounded: false },
      frontRight: { ...planeFrame.wheels.frontRight, grounded: true },
      rearLeft: { ...planeFrame.wheels.rearLeft, grounded: true },
      rearRight: { ...planeFrame.wheels.rearRight, grounded: true } } });
  const partialPlane = planeSpring.getChassisSnapshot();
  assert(Math.abs(Math.tan(partialPlane.terrainPitch) - .11) < .001 &&
    Math.abs(Math.tan(partialPlane.terrainRoll) - .19) < 1e-9,
  'three-wheel support separates longitudinal grade from crossfall instead of rotating mounts into the road');

  const phase2 = runChassisDynamicsSelfTest();
  assertions += phase2.assertions;
  const ramps = phase2.ramps;
  assert(ramps.every(r => r.valid), 'all ramp steps retain physical pose, travel and airborne zero-force invariants');
  assert(ramps.every(r => r.maximumCorrection < .01 && r.totalCorrection < r.integratedMotion * .1),
    'ramp position safety remains residual to integrated sprung-body motion');

  // Exercise the scene-backed path at rest, on drop-away, and through landing.
  let floor = 0, verticalPasses = 0, sceneQueries = 0, sceneValid = true, sceneAirborne = false, sceneLanded = false;
  const sceneGround = { ...layeredGround, sampleRoadSurface: (x: number, z: number) => {
    sceneQueries++;
    return { ...sampleGroundGeometry(() => floor, x, z), ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt) };
  } };
  const sceneCar = createCar(), sceneAdapter = new VehicleContactSystem(sceneGround, config);
  sceneAdapter.synchronize(sceneCar);
  const sceneUpdate = sceneCar.suspension.updateVertical.bind(sceneCar.suspension);
  sceneCar.suspension.updateVertical = (h, step) => { verticalPasses++; return sceneUpdate(h, step); };
  for (let i = 0; i < 24; i++) {
    verticalPasses = 0; sceneQueries = 0;
    const state = sceneAdapter.step(dt, neutral, sceneCar);
    sceneValid &&= verticalPasses === 1 && sceneQueries === 4 &&
      Math.abs(state.chassis.chassisY) < .01 && geometryValid(state);
  }
  floor = -.4;
  for (let i = 0; i < 240; i++) {
    const before = sceneCar.verticalVelocity;
    const state = sceneAdapter.step(dt, neutral, sceneCar);
    sceneValid &&= geometryValid(state);
    if (state.chassis.groundedWheels === 0) {
      sceneAirborne = true;
      sceneValid &&= Math.abs(state.chassis.verticalVelocity - before + config.gravity * dt) < 1e-8 &&
        WHEEL_IDS.every(id => state.wheels[id].normalLoad === 0 && state.wheels[id].longitudinalForce === 0 &&
          state.wheels[id].lateralForce === 0);
    } else sceneLanded ||= sceneAirborne;
  }
  assert(sceneValid && sceneAirborne && sceneLanded && Math.abs(sceneCar.chassisY - floor) < .03,
    'scene solver stays 1x on flat; drop-away stays attached with true gravity/zero road force, then lands and settles');

  // All support masks share one fixed-step attitude budget, regardless of the
  // number of contact refreshes. Underconstrained axes retain their last value.
  let attitudeValid = true;
  const attitude = new SuspensionSystem(config);
  for (const mask of [15, 7, 3, 5, 9, 1, 0, 1, 5, 7, 15]) {
    const frame = attitude.getVerticalSnapshot();
    const contact = contactsAt();
    for (let i = 0; i < 4; i++) {
      const id = WHEEL_IDS[i]!;
      Object.assign(contact[id], { height: -.5 * contact[id].z + .4 * contact[id].x });
      Object.assign(frame.wheels[id], { grounded: !!(mask & (1 << i)) });
    }
    attitude.setDynamicPose(.3, .2);
    for (let i = 0; i < 6; i++) attitude.synchronizeGroundGeometry(contact, frame);
    const after = attitude.getChassisSnapshot(), body = chassisBodyPose(after);
    attitudeValid &&= body.pitch === .3 && body.roll === .2;

  }
  assert(attitudeValid, '0/1/2/3/4 terrain reference updates never override absolute dynamic body attitude');

  const tilted = createCar();
  tilted.syncWheelContacts(contactsAt());
  tilted.chassisMotion.pitch = .72; tilted.chassisMotion.roll = .68;
  const deep = contactsAt(Object.fromEntries(WHEEL_IDS.map(id => [id, -100])));
  let tiltState = tilted.getSnapshot();
  let tiltValid = true;
  for (let i = 0; i < 8; i++) {
    tiltState = tilted.stepFixed(dt, neutral, { wheelContacts: deep });
    tiltValid &&= geometryValid(tiltState) && tiltState.chassis.groundedWheels === 0 &&
      Math.abs(tiltState.chassis.pitch - .72) < 1e-12 && Math.abs(tiltState.chassis.roll - .68) < 1e-12;
  }
  assert(tiltValid, 'large combined pitch/roll preserves attachment travel and airborne attitude despite surfaces far below');

  return { passed: true, assertions, restHeight, landingCompression: maximumCompression,
    freeFallSpeed: falling.chassis.verticalVelocity, ramps, phase2 };
}
