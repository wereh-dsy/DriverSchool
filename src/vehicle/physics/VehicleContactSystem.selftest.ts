import {
  createNeutralVehicleInputState,
  type VehicleInputState,
} from '../../input/VehicleInputState';
import type { DrivingGround } from '../../world/DrivingGround';
import { DrivingTestTrack } from '../../world/DrivingTestTrack';
import { CircuitGround } from '../../world/circuit/CircuitGround';
import { Subject2Ground } from '../../world/subject2/Subject2Ground';
import { VEHICLE_CATALOG, type VehicleDescriptor } from '../VehicleCatalog';
import {
  createVehicleOBB,
  type CollisionOBB,
  type CollisionPoint2,
  type StaticCollider,
} from './CollisionSystem';
import { VehicleContactSystem } from './VehicleContactSystem';
import { VehicleDynamics, type VehicleSnapshot } from './VehicleDynamics';
import { sampleWheelContacts, wheelContactsAsArray } from './WheelContact';

const DT = 1 / 120;
const input = (values: Partial<VehicleInputState> = {}): VehicleInputState => ({
  ...createNeutralVehicleInputState(), ...values,
});

interface TestPose { readonly x: number; readonly z: number; readonly yaw: number }

interface MapScenario {
  readonly ground: DrivingGround;
  readonly asphalt: TestPose;
  readonly grass: TestPose;
  readonly surfaceTransition: TestPose;
  readonly split: TestPose;
  readonly grassSplit: TestPose;
  readonly railReference: CollisionPoint2;
  /** Direction from the authored rail toward the driving area. */
  readonly interior: CollisionPoint2;
}

export interface VehicleContactMapTelemetry {
  readonly mapId: string;
  readonly vehicleId: string;
  readonly asphaltTurnDegrees: number;
  readonly brakeSteeringRatio: number;
  readonly asphaltCoastDeceleration: number;
  readonly grassCoastDeceleration: number;
  readonly grassBrakingDeceleration: number;
  readonly maximumGrassSpeedStep: number;
  readonly maximumSurfaceTransitionSpeedStep: number;
  readonly splitYawDegrees: number;
  readonly splitGripDifference: number;
  readonly frontalStopSpeed: number;
  readonly frontalContacts: number;
  readonly obliquePostImpactSpeed: number;
  readonly obliqueContacts: number;
  readonly reverseEscapeDistance: number;
  readonly maximumCollisionStep: number;
  readonly maximumPenetration: number;
}

export interface VehicleContactSystemSelfTestResult {
  readonly assertions: number;
  readonly scenarios: readonly VehicleContactMapTelemetry[];
}

/**
 * Integration acceptance runs with the shipping maps, shipping vehicle presets
 * and the same 120 Hz scene-contact adapter used by the game. No coefficients
 * are replaced by a special test calibration.
 */
export function runVehicleContactSystemSelfTest(): VehicleContactSystemSelfTestResult {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Vehicle-contact integration self-test failed: ${message}`);
  };
  const road = new DrivingTestTrack({ shadows: false, treeCount: 0 });
  const circuit = new CircuitGround({ shadows: false });
  const subject2 = new Subject2Ground({ shadows: false });
  const scenarios: readonly MapScenario[] = [
    {
      ground: road,
      asphalt: { x: 0, z: 95, yaw: 0 },
      grass: { x: -100, z: -100, yaw: 0 },
      surfaceTransition: { x: 3, z: 95, yaw: -Math.PI * 0.5 },
      split: { x: road.roadWidth * 0.5, z: 95, yaw: 0 },
      grassSplit: { x: road.shoulderWidth * 0.5 + 0.6, z: 95, yaw: 0 },
      railReference: { x: 7.35, z: -300 }, interior: { x: -1, z: 0 },
    },
    {
      ground: circuit,
      asphalt: { x: -172.5, z: -150, yaw: 0 },
      grass: { x: -215, z: -150, yaw: 0 },
      surfaceTransition: { x: -172.5 + circuit.config.trackWidth * 0.5 - 2.75, z: -150, yaw: -Math.PI * 0.5 },
      split: { x: -172.5 + circuit.config.trackWidth * 0.5, z: -150, yaw: 0 },
      grassSplit: { x: -172.5 + circuit.config.trackWidth * 0.5 + circuit.config.shoulderWidth + 0.6, z: -150, yaw: 0 },
      railReference: { x: -172.5 - circuit.config.trackWidth * 0.5 - circuit.config.barrierOffset, z: -160 },
      interior: { x: 1, z: 0 },
    },
    {
      ground: subject2,
      asphalt: { x: -79, z: 41, yaw: -Math.PI * 0.5 },
      grass: { x: 75, z: 45, yaw: 0 },
      surfaceTransition: { x: -83, z: 33, yaw: 0 },
      split: { x: -79, z: 41 + subject2.config.waitingArea.width * 0.5, yaw: -Math.PI * 0.5 },
      grassSplit: { x: -79, z: 41 + subject2.config.waitingArea.width * 0.5 + 1.8, yaw: -Math.PI * 0.5 },
      railReference: { x: subject2.config.site.length * 0.5, z: 0 }, interior: { x: -1, z: 0 },
    },
  ];
  const telemetry: VehicleContactMapTelemetry[] = [];
  try {
    for (const scenario of scenarios) {
      assert(scenario.ground.colliders.length > 0, `${scenario.ground.metadata.id} must have authored static obstacles`);
      for (const vehicle of VEHICLE_CATALOG.filter(v => (v.physicsConfig.transmission.type ?? 'MANUAL') === 'MANUAL')) {
        const config = vehicle.physicsConfig;
        const label = `${scenario.ground.metadata.id}/${vehicle.id}`;
        const visualDimensions = vehicle.visualConfig.collisionDimensions;
        const expectedBodyHalfLength = (visualDimensions.length - 0.12) * 0.5;
        const expectedBodyHalfWidth = (visualDimensions.width - 0.06) * 0.5;
        for (const yaw of [0, Math.PI * 0.5]) {
          const box = createVehicleOBB({ x: 0, z: 0, yaw }, visualDimensions);
          const extentX = Math.max(...box.corners.map((corner) => Math.abs(corner.x)));
          const extentZ = Math.max(...box.corners.map((corner) => Math.abs(corner.z)));
          const expectedX = yaw === 0 ? expectedBodyHalfWidth : expectedBodyHalfLength;
          const expectedZ = yaw === 0 ? expectedBodyHalfLength : expectedBodyHalfWidth;
          assert(Math.abs(extentX - expectedX) < 1e-9, `${label}: rotated OBB width/length must use the visual envelope with the 0.06/0.12 m body allowance`);
          assert(Math.abs(extentZ - expectedZ) < 1e-9, `${label}: rotated OBB must exchange world extents instead of remaining an AABB`);
        }
        const asphaltContacts = sampleWheelContacts(scenario.ground, scenario.asphalt, config);
        assert(wheelContactsAsArray(asphaltContacts).every((wheel) => wheel.surfaceType === 'asphalt' && wheel.lateralGrip > 0.99), `${label}: asphalt steering test must start with four paved contacts`);
        const normalTurn = runDrive(scenario, vehicle, scenario.asphalt, 12, 1.2, input({ steering: 0.3 }));
        const brakeTurn = runDrive(scenario, vehicle, scenario.asphalt, 12, 1.2, input({ steering: 0.3, brake: 0.27 }));
        const asphaltTurn = Math.abs(angleDelta(normalTurn.final.yaw, scenario.asphalt.yaw));
        const brakeSteeringRatio = Math.abs(angleDelta(brakeTurn.final.yaw, scenario.asphalt.yaw)) / Math.max(1e-6, asphaltTurn);
        assert(asphaltTurn > 0.13 && asphaltTurn < 0.8, `${label}: normal 43 km/h asphalt turn must be clear and controllable (${asphaltTurn})`);
        assert(brakeSteeringRatio > 0.58 && brakeSteeringRatio < 1.5, `${label}: moderate braking must retain steering authority (${brakeSteeringRatio})`);
        assert(brakeTurn.final.speed < normalTurn.final.speed - 1, `${label}: braking must actually slow the car while it turns`);
        assert(normalTurn.contacts === 0 && brakeTurn.contacts === 0, `${label}: steering check must not be influenced by a barrier`);

        const asphaltCoast = runDrive(scenario, vehicle, scenario.asphalt, 10, 1.5, input());
        const grassCoast = runDrive(scenario, vehicle, scenario.grass, 10, 1.5, input());
        const asphaltCoastDeceleration = (10 - asphaltCoast.final.speed) / 1.5;
        const grassCoastDeceleration = (10 - grassCoast.final.speed) / 1.5;
        assert(grassCoast.grassSteps === grassCoast.steps, `${label}: coast comparison must remain fully on grass`);
        assert(grassCoastDeceleration > asphaltCoastDeceleration + 0.1, `${label}: grass must slow naturally through stronger rolling drag`);
        assert(grassCoast.maximumSpeedStep < 0.025 && grassCoast.final.speed > 8, `${label}: grass coast must contain no abrupt speed correction`);
        assert(grassCoast.contacts === 0, `${label}: grass must not act as a collider`);
        assert(grassCoast.minimumRollingDrag > asphaltCoast.maximumRollingDrag * 1.7, `${label}: off-road coast must use the tyre rolling-resistance force`);
        const pavedBrake = runDrive(scenario, vehicle, scenario.asphalt, 12, 0.8, input({ brake: 1 }));
        const grassBrake = runDrive(scenario, vehicle, scenario.grass, 12, 0.8, input({ brake: 1 }));
        const grassBrakingDeceleration = (12 - grassBrake.final.speed) / 0.8;
        assert(grassBrake.final.speed > pavedBrake.final.speed + 0.5, `${label}: loose grass must reduce maximum braking grip`);
        assert(grassBrake.contacts === 0 && grassBrake.final.speed > 4, `${label}: grass braking must decelerate through tyres without acting as a stop zone`);
        assert(wheelContactsAsArray(sampleWheelContacts(scenario.ground, scenario.surfaceTransition, config)).every((wheel) => wheel.surfaceType === 'asphalt'), `${label}: boundary traversal must start on paved road`);
        const transition = runDrive(scenario, vehicle, scenario.surfaceTransition, 6, 1.1, input());
        assert(wheelContactsAsArray(sampleWheelContacts(scenario.ground, transition.final, config)).every((wheel) => wheel.surfaceType === 'grass'), `${label}: boundary traversal must reach grass with all four wheels`);
        assert(transition.contacts === 0 && transition.maximumSpeedStep < 0.025, `${label}: actual asphalt-to-grass crossing must not force a speed jump`);

        const splitContacts = sampleWheelContacts(scenario.ground, scenario.split, config);
        const leftGrip = (splitContacts.frontLeft.lateralGrip + splitContacts.rearLeft.lateralGrip) * 0.5;
        const rightGrip = (splitContacts.frontRight.lateralGrip + splitContacts.rearRight.lateralGrip) * 0.5;
        const splitGripDifference = Math.abs(leftGrip - rightGrip);
        assert(splitGripDifference > 0.11, `${label}: a real road edge must give the two sides different grip`);
        const grassSplitContacts = wheelContactsAsArray(sampleWheelContacts(scenario.ground, scenario.grassSplit, config));
        assert(grassSplitContacts.some((wheel) => wheel.surfaceType === 'grass') && grassSplitContacts.some((wheel) => wheel.surfaceType !== 'grass'), `${label}: grass transition must leave independent mixed wheel contacts`);
        const splitDrive = runDrive(scenario, vehicle, scenario.split, 10, 1.4, input());
        const splitYawDegrees = angleDelta(splitDrive.final.yaw, scenario.split.yaw) * 180 / Math.PI;
        assert(Math.abs(splitYawDegrees) > 0.001 && Math.abs(splitYawDegrees) < 4, `${label}: split rolling drag must cause mild, stable yaw (${splitYawDegrees})`);
        assert(splitDrive.contacts === 0 && splitDrive.maximumSpeedStep < 0.04, `${label}: road-edge transition must not jerk or collide`);

        const rail = nearestRail(scenario.ground.colliders, scenario.railReference);
        assert(rail !== undefined, `${label}: collision check must target an actual authored guardrail`);
        if (rail === undefined) continue;
        assert(Math.hypot(rail.center.x - scenario.railReference.x, rail.center.z - scenario.railReference.z) < 4.5, `${label}: selected collision geometry must match the intended visible rail`);
        const frontal = runBarrierImpact(scenario, vehicle, rail, false, assert, label);
        const oblique = runBarrierImpact(scenario, vehicle, rail, true, assert, label);
        assert(frontal.contactCount > 0 && frontal.impactSpeed < 0.15, `${label}: a 65 km/h frontal rail impact must basically stop`);
        assert(oblique.contactCount > 0 && oblique.impactSpeed > 0.5 && oblique.impactSpeed < 14, `${label}: an oblique rail impact must preserve modest tangent travel`);
        assert(frontal.escapeDistance > 0.6 && oblique.escapeDistance > 0.6, `${label}: ordinary reverse/throttle input must release the vehicle from contact (frontal ${frontal.escapeDistance}, oblique ${oblique.escapeDistance})`);
        telemetry.push({
          mapId: scenario.ground.metadata.id, vehicleId: vehicle.id,
          asphaltTurnDegrees: asphaltTurn * 180 / Math.PI, brakeSteeringRatio,
          asphaltCoastDeceleration, grassCoastDeceleration,
          grassBrakingDeceleration,
          maximumGrassSpeedStep: grassCoast.maximumSpeedStep,
          maximumSurfaceTransitionSpeedStep: transition.maximumSpeedStep,
          splitYawDegrees, splitGripDifference,
          frontalStopSpeed: frontal.impactSpeed, frontalContacts: frontal.contactCount,
          obliquePostImpactSpeed: oblique.impactSpeed, obliqueContacts: oblique.contactCount,
          reverseEscapeDistance: Math.min(frontal.escapeDistance, oblique.escapeDistance),
          maximumCollisionStep: Math.max(frontal.maximumStep, oblique.maximumStep),
          maximumPenetration: Math.max(frontal.maximumPenetration, oblique.maximumPenetration),
        });
      }
    }
    return { assertions, scenarios: telemetry };
  } finally {
    road.dispose(); circuit.dispose(); subject2.dispose();
  }
}

interface DriveTelemetry {
  readonly final: VehicleSnapshot;
  readonly steps: number;
  readonly contacts: number;
  readonly grassSteps: number;
  readonly maximumSpeedStep: number;
  readonly minimumRollingDrag: number;
  readonly maximumRollingDrag: number;
}

function runDrive(
  scenario: MapScenario,
  vehicle: VehicleDescriptor,
  pose: TestPose,
  speed: number,
  seconds: number,
  controls: VehicleInputState,
): DriveTelemetry {
  const config = vehicle.physicsConfig;
  const dynamics = new VehicleDynamics(config, { ...pose, speed, gear: 'N' });
  const adapter = new VehicleContactSystem(scenario.ground, vehicle.visualConfig.collisionDimensions);
  const steps = Math.round(seconds / DT);
  let contacts = 0;
  let grassSteps = 0;
  let maximumSpeedStep = 0;
  let minimumRollingDrag = Number.POSITIVE_INFINITY;
  let maximumRollingDrag = 0;
  for (let step = 0; step < steps; step += 1) {
    const previousSpeed = dynamics.speed;
    const snapshot = adapter.step(DT, controls, dynamics);
    if (!finiteSnapshot(snapshot)) throw new Error('Contact integration produced invalid pose or velocity');
    if (adapter.collision?.collided === true) contacts += 1;
    if (adapter.wheelContacts !== null && wheelContactsAsArray(adapter.wheelContacts).every((wheel) => wheel.surfaceType === 'grass')) grassSteps += 1;
    maximumSpeedStep = Math.max(maximumSpeedStep, Math.abs(snapshot.speed - previousSpeed));
    const rollingDrag = Math.abs(snapshot.forces.rollingResistanceForce);
    minimumRollingDrag = Math.min(minimumRollingDrag, rollingDrag);
    maximumRollingDrag = Math.max(maximumRollingDrag, rollingDrag);
  }
  return { final: dynamics.getSnapshot(), steps, contacts, grassSteps, maximumSpeedStep, minimumRollingDrag, maximumRollingDrag };
}

interface ImpactTelemetry {
  readonly impactSpeed: number;
  readonly contactCount: number;
  readonly escapeDistance: number;
  readonly maximumStep: number;
  readonly maximumPenetration: number;
}

function runBarrierImpact(
  scenario: MapScenario,
  vehicle: VehicleDescriptor,
  rail: StaticCollider,
  oblique: boolean,
  assert: (condition: boolean, message: string) => void,
  label: string,
): ImpactTelemetry {
  const config = vehicle.physicsConfig;
  const collisionDimensions = vehicle.visualConfig.collisionDimensions;
  const normal = scenario.interior;
  const inwardFraction = oblique ? 0.42 : 1;
  const tangentFraction = oblique ? Math.sqrt(1 - inwardFraction * inwardFraction) : 0;
  const forward = { x: -normal.x * inwardFraction, z: -tangentFraction };
  const yaw = Math.atan2(-forward.x, -forward.z);
  const start = { x: rail.center.x + normal.x * 5, z: rail.center.z, yaw };
  const dynamics = new VehicleDynamics(config, { ...start, speed: 18, gear: 'N' });
  const adapter = new VehicleContactSystem(scenario.ground, collisionDimensions);
  let contactCount = 0;
  let impactSpeed = Number.NaN;
  let maximumStep = 0;
  let maximumPenetration = 0;
  let contactPosition: CollisionPoint2 | undefined;
  const inspect = (snapshot: VehicleSnapshot, previous: VehicleSnapshot): void => {
    assert(finiteSnapshot(snapshot) && !snapshot.recoveredFromInvalidState, `${label}: collision state must remain finite without emergency recovery`);
    const stepDistance = Math.hypot(snapshot.x - previous.x, snapshot.z - previous.z);
    maximumStep = Math.max(maximumStep, stepDistance);
    assert(stepDistance < 0.35, `${label}: a fixed-step impact must not teleport the vehicle (${stepDistance})`);
    const body = createVehicleOBB(snapshot, collisionDimensions);
    const height = scenario.ground.getRoadHeightAt(snapshot.x, snapshot.z);
    for (const obstacle of adapter.collision?.nearbyColliders ?? []) {
      if (height + collisionDimensions.height < obstacle.minHeight || height > obstacle.maxHeight) continue;
      maximumPenetration = Math.max(maximumPenetration, penetrationDepth(body, obstacle));
    }
    assert(maximumPenetration < 0.005, `${label}: corrected visual footprint must remain outside authored solids (${maximumPenetration})`);
    assert(Math.abs(angleDelta(snapshot.yaw, start.yaw)) < 0.08, `${label}: a barrier must not induce a large yaw kick`);
    if (adapter.collision?.collided === true) {
      contactCount += 1;
      const velocity = {
        x: -Math.sin(snapshot.yaw) * snapshot.speed + Math.cos(snapshot.yaw) * snapshot.lateralVelocity,
        z: -Math.cos(snapshot.yaw) * snapshot.speed - Math.sin(snapshot.yaw) * snapshot.lateralVelocity,
      };
      for (const contact of adapter.collision.contacts) {
        assert(velocity.x * contact.normal.x + velocity.z * contact.normal.z > -0.015, `${label}: corrected contact velocity must not point inward into the wall`);
      }
      if (contactPosition === undefined) {
        contactPosition = { x: snapshot.x, z: snapshot.z };
        impactSpeed = Math.hypot(snapshot.speed, snapshot.lateralVelocity);
      }
    }
  };
  // Coasting into the actual rail isolates the barrier response from throttle.
  for (let step = 0; step < 100 && contactPosition === undefined; step += 1) {
    const previous = dynamics.getSnapshot();
    inspect(adapter.step(DT, input(), dynamics), previous);
  }
  assert(contactPosition !== undefined, `${label}: intended approach must hit the authored rail`);
  if (contactPosition === undefined) return { impactSpeed, contactCount, escapeDistance: 0, maximumStep, maximumPenetration };
  // Repeated modest throttle into the rail must not jitter or tunnel through it.
  dynamics.requestGear(1);
  for (let step = 0; step < 120; step += 1) {
    const previous = dynamics.getSnapshot();
    inspect(adapter.step(DT, input({ throttle: 0.38 }), dynamics), previous);
  }
  // Respect the production reverse-speed lockout: stop a glancing slide first.
  for (let step = 0; step < 180; step += 1) {
    const previous = dynamics.getSnapshot();
    inspect(adapter.step(DT, input({ brake: 0.75 }), dynamics), previous);
  }
  const held = dynamics.getSnapshot();
  dynamics.requestGear('R');
  for (let step = 0; step < 420; step += 1) {
    const previous = dynamics.getSnapshot();
    inspect(adapter.step(DT, input({ throttle: 0.5 }), dynamics), previous);
  }
  const final = dynamics.getSnapshot();
  const escapeDistance = (final.x - held.x) * normal.x + (final.z - held.z) * normal.z;
  return { impactSpeed, contactCount, escapeDistance, maximumStep, maximumPenetration };
}

function nearestRail(colliders: readonly StaticCollider[], reference: CollisionPoint2): StaticCollider | undefined {
  return colliders.filter((collider) => collider.type === 'guardrail').reduce<StaticCollider | undefined>((nearest, collider) => {
    if (nearest === undefined) return collider;
    const distance = (point: CollisionPoint2): number => (point.x - reference.x) ** 2 + (point.z - reference.z) ** 2;
    return distance(collider.center) < distance(nearest.center) ? collider : nearest;
  }, undefined);
}

function finiteSnapshot(snapshot: VehicleSnapshot): boolean {
  return [snapshot.x, snapshot.z, snapshot.yaw, snapshot.speed, snapshot.yawRate, snapshot.lateralVelocity, snapshot.rpm].every(Number.isFinite);
}

function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Independent geometric separation check, including rotation and entire body extents. */
function penetrationDepth(a: CollisionOBB, b: CollisionOBB): number {
  const axes = [
    { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) },
    { x: Math.sin(a.yaw), z: Math.cos(a.yaw) },
    { x: Math.cos(b.yaw), z: -Math.sin(b.yaw) },
    { x: Math.sin(b.yaw), z: Math.cos(b.yaw) },
  ];
  let smallest = Number.POSITIVE_INFINITY;
  for (const axis of axes) {
    const project = (corners: readonly CollisionPoint2[]): readonly [number, number] => {
      const values = corners.map((corner) => corner.x * axis.x + corner.z * axis.z);
      return [Math.min(...values), Math.max(...values)];
    };
    const [aMin, aMax] = project(a.corners);
    const [bMin, bMax] = project(b.corners);
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap <= 0) return 0;
    smallest = Math.min(smallest, overlap);
  }
  return smallest;
}
