import { createNeutralVehicleInputState, type VehicleInputState } from '../../input/VehicleInputState';
import { SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import { VEHICLE_CATALOG } from '../VehicleCatalog';
import { cloneVehiclePhysicsConfig } from '../config';
import { wheelLocalPosition } from '../VehicleDimensions';
import { SuspensionSystem } from './SuspensionSystem';
import { VehicleDynamics, type VehicleSnapshot } from './VehicleDynamics';
import { WHEEL_IDS, type WheelContactSet } from './WheelContact';

const DT = 1 / 120;
const input = (overrides: Partial<VehicleInputState> = {}): VehicleInputState => ({
  ...createNeutralVehicleInputState(), ...overrides,
});

/** Shipping presets, observable corner forces and conservative body attitudes. */
export function runFourWheelPhysicsSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => {
    assertions++;
    if (!ok) throw new Error(`Four-wheel physics self-test failed: ${message}`);
  };
  const telemetry = [];
  const brakingPitch: number[] = [];
  const cornerRoll: number[] = [];
  // These are the established MT pedal/axle baselines, not selector tests.
  // Automatic powertrains have their own creep/shift/stop acceptance suite.
  for (const vehicle of VEHICLE_CATALOG.filter(v => (v.physicsConfig.transmission.type ?? 'MANUAL') === 'MANUAL')) {
    const config = vehicle.physicsConfig;
    const label = vehicle.id;
    const weight = config.mass * config.gravity;
    const front = ['frontLeft', 'frontRight'] as const;
    const rear = ['rearLeft', 'rearRight'] as const;
    const contacts = (rightGrass = false, bump = 0): WheelContactSet => Object.fromEntries(WHEEL_IDS.map(id => {
      const local = wheelLocalPosition(config, id);
      return [id, { ...SURFACE_MATERIALS[rightGrass && id.endsWith('Right') ? 'grass' : 'asphalt'],
        id, x: local.x, z: local.z, height: id === 'frontRight' ? bump : 0,
        normal: { x: 0, y: 1, z: 0 } }];
    })) as unknown as WheelContactSet;
    const validate = (s: VehicleSnapshot) => {
      assert(Object.values(s.wheels).every(w => Object.values(w).every(v => typeof v !== 'number' || Number.isFinite(v))), `${label}: finite corner states`);
      const total = Object.values(s.wheels).reduce((n, w) => n + w.normalLoad, 0);
      assert(Math.abs(total - weight) < 1e-6, `${label}: four loads conserve supported weight`);
      for (const id of WHEEL_IDS) {
        const w = s.wheels[id];
        assert(w.normalLoad > 0 && w.suspensionCompression >= 0 && w.suspensionCompression < config.suspension.restLength,
          `${label}/${id}: positive load and bounded spring travel`);
      }
      assert(Math.abs(s.chassis.pitch) <= .065 && Math.abs(s.chassis.roll) <= .075 && Math.abs(s.chassis.rideOffset) < .08,
        `${label}: restrained supported body attitude`);
    };
    // Both adapters and future hardware still enter through VehicleInputState.
    const powered = new VehicleDynamics(config, { speed: 12, gear: 2, engineRPM: 2400, clutchEngagement: 1,
      controlMode: 'manual-clutch' });
    let drive = powered.getSnapshot();
    for (let i = 0; i < 60; i++) drive = powered.stepFixed(DT,
      input({ controlMode: 'manual-clutch', clutchPedal: 0, throttle: .65 }), { wheelContacts: contacts() });
    const driven = config.drivetrainType === 'FWD' ? front : rear;
    const undriven = config.drivetrainType === 'FWD' ? rear : front;
    assert(driven.every(id => drive.wheels[id].driveForce > 100 && drive.wheels[id].driveTorque > 0), `${label}: torque reaches correct axle`);
    assert(undriven.every(id => drive.wheels[id].driveForce === 0 && drive.wheels[id].driveTorque === 0), `${label}: undriven axle has no propulsion`);
    assert(Math.abs(drive.wheels[driven[0]].driveTorque - drive.wheels[driven[1]].driveTorque) < 1e-9, `${label}: axle torque split is 50/50`);
    validate(drive);
    const decelerating = new VehicleDynamics(config, { speed: 18, gear: 'N' });
    let brake = decelerating.getSnapshot();
    for (let i = 0; i < 90; i++) {
      brake = decelerating.stepFixed(DT, input({ brake: .3 }), { wheelContacts: contacts() });
      validate(brake);
    }
    const frontTorque = front.reduce((n, id) => n + brake.wheels[id].brakeTorque, 0);
    const rearTorque = rear.reduce((n, id) => n + brake.wheels[id].brakeTorque, 0);
    assert(Math.abs(frontTorque / (frontTorque + rearTorque) - config.brakes.frontBrakeBias) < 1e-10,
      `${label}: hydraulic brake torque follows authored bias`);
    assert(WHEEL_IDS.every(id => brake.wheels[id].brakeForce < 0 && brake.wheels[id].handbrakeForce === 0), `${label}: service braking acts on all four tyres`);
    assert(brake.wheels.frontLeft.normalLoad + brake.wheels.frontRight.normalLoad > weight * config.frontWeightBias,
      `${label}: braking loads front axle`);
    assert(brake.chassis.pitch < -.002, `${label}: braking compresses nose`);
    brakingPitch.push(Math.abs(brake.chassis.pitch));
    const corner = new VehicleDynamics(config, { speed: 14, gear: 'N' });
    let turn = corner.getSnapshot();
    for (let i = 0; i < 180; i++) {
      turn = corner.stepFixed(DT, input({ steering: .3 }), { wheelContacts: contacts() });
      validate(turn);
    }
    assert(turn.wheels.frontLeft.normalLoad + turn.wheels.rearLeft.normalLoad > turn.wheels.frontRight.normalLoad + turn.wheels.rearRight.normalLoad,
      `${label}: right turn loads outside left tyres`);
    assert(turn.chassis.roll > .003, `${label}: outside suspension compresses`);
    cornerRoll.push(Math.abs(turn.chassis.roll));
    assert(turn.forces.clutchTorque === 0 && turn.forces.engineBrakingForce === 0,
      `${label}: neutral steering scrub is not engine braking`);
    const brakeCorner = new VehicleDynamics(config, { speed: 14, gear: 'N' });
    for (let i = 0; i < 180; i++) brakeCorner.stepFixed(DT, input({ steering: .3, brake: .25 }), { wheelContacts: contacts() });
    assert(Math.abs(brakeCorner.yaw) > Math.abs(turn.yaw) * .6 && brakeCorner.speed < turn.speed - 1,
      `${label}: moderate braking retains practical turn authority`);
    const parking = new VehicleDynamics(config, { speed: 12, gear: 'N' });
    let park = parking.getSnapshot();
    for (let i = 0; i < 75; i++) park = parking.stepFixed(DT, input({ handbrake: 1, steering: .35 }), { wheelContacts: contacts() });
    assert(front.every(id => park.wheels[id].handbrakeTorque === 0 && park.wheels[id].handbrakeForce === 0), `${label}: handbrake never brakes front tyres`);
    assert(rear.every(id => park.wheels[id].handbrakeTorque > 500 && park.wheels[id].handbrakeForce < 0), `${label}: parking brake acts on rear corners`);
    // Mechanical rear locking, not the obsolete artificial yaw-gain knob.
    const changed = cloneVehiclePhysicsConfig(config);
    changed.steering.handbrakeOversteerGain = 100;
    const noArtificial = new VehicleDynamics(changed, { speed: 12, gear: 'N' });
    for (let i = 0; i < 75; i++) noArtificial.stepFixed(DT, input({ handbrake: 1, steering: .35 }), { wheelContacts: contacts() });
    assert(Math.abs(noArtificial.yaw - parking.yaw) < 1e-12, `${label}: no add-oversteer shortcut`);
    const split = new VehicleDynamics(config, { speed: 12, gear: 'N' });
    let mixed = split.getSnapshot();
    for (let i = 0; i < 120; i++) mixed = split.stepFixed(DT, input(), { wheelContacts: contacts(true) });
    assert(mixed.wheels.frontRight.surfaceType === 'grass' && mixed.wheels.frontLeft.surfaceType === 'asphalt', `${label}: surface metadata remains per corner`);
    assert(Math.abs(mixed.wheels.frontRight.rollingResistanceForce) > Math.abs(mixed.wheels.frontLeft.rollingResistanceForce) * 2,
      `${label}: grass creates asymmetric tyre drag`);
    assert(mixed.yaw < 0 && Math.abs(mixed.yaw) < .08, `${label}: split contact creates mild drag yaw`);
    const spring = new SuspensionSystem(config);
    let suspended = spring.getSnapshot();
    for (let i = 0; i < 240; i++) suspended = spring.update(DT, { longitudinalAcceleration: 0, lateralAcceleration: 0, contacts: contacts() });
    assert(Math.abs(suspended.chassis.pitch) + Math.abs(suspended.chassis.roll) + Math.abs(suspended.chassis.rideOffset) < 1e-12,
      `${label}: resting flat suspension has no oscillation`);
    for (let i = 0; i < 24; i++) suspended = spring.update(DT, { longitudinalAcceleration: 0, lateralAcceleration: 0, contacts: contacts(false, .04) });
    assert(suspended.wheels.frontRight.compression > suspended.wheels.frontLeft.compression + .005,
      `${label}: a corner bump enters its spring, not a camera shake`);
    assert(suspended.chassis.terrainPitch > .005 && suspended.chassis.terrainRoll > .01,
      `${label}: flat-topped single-wheel bump retains its support-plane attitude`);
    for (let i = 0; i < 480; i++) suspended = spring.update(DT, { longitudinalAcceleration: 0, lateralAcceleration: 0, contacts: contacts() });
    assert(Math.abs(suspended.chassis.roll) < 1e-5 && Math.abs(suspended.wheels.frontRight.compressionVelocity) < 1e-4,
      `${label}: suspension bump decays without lingering jitter`);
    spring.reset();
    for (let i = 0; i < 240; i++) suspended = spring.update(DT, { longitudinalAcceleration: 3, lateralAcceleration: 0 });
    assert(suspended.chassis.pitch > .003 && suspended.wheels.rearLeft.normalLoad > weight * (1 - config.frontWeightBias) * .5,
      `${label}: acceleration loads rear and raises nose`);
    const spring120 = new SuspensionSystem(config);
    const spring60 = new SuspensionSystem(config);
    for (let i = 0; i < 48; i++) spring120.update(DT, { longitudinalAcceleration: -4, lateralAcceleration: 2 });
    for (let i = 0; i < 24; i++) spring60.update(DT * 2, { longitudinalAcceleration: -4, lateralAcceleration: 2 });
    assert(Math.abs(spring120.getSnapshot().chassis.pitch - spring60.getSnapshot().chassis.pitch) < 1e-12 &&
      Math.abs(spring120.getSnapshot().chassis.roll - spring60.getSnapshot().chassis.roll) < 1e-12,
      `${label}: larger caller dt is subdivided, not discarded`);
    // Parking and reversing cover the low-speed denominator and both sign conventions.
    for (const speed of [0, .2, 1.5, -1.5]) {
      const slow = new VehicleDynamics(config, { speed, gear: 'N' });
      for (let i = 0; i < 240; i++) {
        const s = slow.stepFixed(DT, input({ steering: speed === 0 ? 0 : .65 }), { wheelContacts: contacts() });
        validate(s);
        assert(Math.abs(s.yawRate) < .7 && Math.abs(s.lateralVelocity) < .5, `${label}: low-speed response is bounded`);
      }
      if (speed === 0) assert(Math.abs(slow.x) + Math.abs(slow.z) + Math.abs(slow.yaw) < 1e-12, `${label}: stationary car cannot wander`);
      if (speed < 0) assert(slow.yaw > 0 && slow.z > 0, `${label}: reverse turn is spatially correct`);
    }
    const hill = new VehicleDynamics(config);
    hill.requestGear(1);
    const grade = .1;
    const hillBase = contacts();
    const hillContacts = Object.fromEntries(WHEEL_IDS.map(id => {
      const local = wheelLocalPosition(config, id);
      return [id, { ...hillBase[id], height: -local.z * grade,
        normal: { x: 0, y: 1 / Math.hypot(1, grade), z: grade / Math.hypot(1, grade) } }];
    })) as unknown as WheelContactSet;
    let hillMaximumRPM = 0;
    for (let i = 0; i < 840; i++) {
      const s = hill.stepFixed(DT, input({ throttle: .75 }), { wheelContacts: hillContacts });
      hillMaximumRPM = Math.max(hillMaximumRPM, s.rpm);
      assert(s.engineRunning && Number.isFinite(s.speed) && Math.abs(s.chassis.roll) < 1e-9,
        `${label}: a straight 10% hill launch must not stall or shake sideways`);
    }
    assert(hill.speed > 1.5 && hill.z < -3, `${label}: Normal clutch must climb, not free-rev at a speed-only bite point`);
    telemetry.push({ vehicle: label, drivenAxle: config.drivetrainType, brakeBias: frontTorque / (frontTorque + rearTorque),
      brakingPitchDegrees: brake.chassis.pitch * 180 / Math.PI, cornerRollDegrees: turn.chassis.roll * 180 / Math.PI,
      splitYawDegrees: mixed.yaw * 180 / Math.PI, cornerSpeedKmh: turn.speedKmh,
      hillLaunchSpeedKmh: hill.speed * 3.6, hillMaximumRPM });
  }
  assert(brakingPitch[1]! < brakingPitch[0]!, 'GT has less braking pitch than the family sedan');
  assert(cornerRoll[1]! < cornerRoll[0]!, 'GT has less roll than the softer family sedan');
  return { assertions, scenarios: telemetry, restStable: true, rearOnlyHandbrake: true, preservedPowertrain: true };
}
