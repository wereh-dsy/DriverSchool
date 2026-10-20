import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createDefaultVehiclePhysicsConfig } from '../config';
import { createWheelContactBuffer, WHEEL_IDS, type WheelContactSet, type WheelId } from './WheelContact';
import { VehicleDynamics } from './VehicleDynamics';

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
    const mutable = contacts as unknown as Record<WheelId, { height: number }>;
    for (const id of WHEEL_IDS) mutable[id].height = heights[id] ?? 0;
    return contacts;
  };
  const createCar = (): VehicleDynamics => new VehicleDynamics(config,
    { gear: 'N', engineRunning: false, driveSelector: 'N' });

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
  for (let i = 0; i < 480; i++) {
    landing = landingCar.stepFixed(dt, neutral, { wheelContacts: lowGround });
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

  return { passed: true, assertions, restHeight, landingCompression: maximumCompression,
    freeFallSpeed: falling.chassis.verticalVelocity };
}
