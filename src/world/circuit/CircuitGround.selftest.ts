import * as THREE from 'three';
import { createNeutralVehicleInputState, type VehicleInputState } from '../../input/VehicleInputState';
import { VehicleDynamics } from '../../vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../../vehicle/physics/VehicleContactSystem';
import { getVehicleDescriptor, type VehicleDescriptor } from '../../vehicle/VehicleCatalog';
import { CircuitGround } from './CircuitGround';

export interface CircuitGroundSelfTestResult {
  readonly assertions: number;
  readonly lapLength: number;
  readonly mainStraightLength: number;
  readonly cornerCount: number;
  readonly minimumCornerRadius: number;
  readonly maximumCornerRadius: number;
  readonly closureGap: number;
  readonly seamTangentDot: number;
  readonly maximumGripStep: number;
  readonly maximumRollingResistanceStep: number;
  readonly markingVertices: number;
  readonly markingClearanceError: number;
  readonly closedRibbonCount: number;
  readonly maximumRibbonJoinGap: number;
  readonly simulatedLaps: number;
  readonly simulationSeconds: number;
  readonly maximumFollowerError: number;
  readonly meanFollowerError: number;
  readonly maximumSpeedKmh: number;
  readonly meanSpeedKmh: number;
  readonly sportsLaps: number;
  readonly sportsMaximumFollowerError: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const wrapAngle = (angle: number): number => {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
};

const modularDistance = (from: number, to: number, length: number): number =>
  THREE.MathUtils.euclideanModulo(to - from, length);

const makeInput = (overrides: Partial<VehicleInputState> = {}): VehicleInputState => ({
  ...createNeutralVehicleInputState('normal'),
  ...overrides,
});

/**
 * Geometry and repeat-lap regression coverage. The follower deliberately uses
 * the shipping sedan VehicleDynamics; it is test code only and does not add AI,
 * checkpoints, timing or race state to the game.
 */
export function runCircuitGroundSelfTest(): CircuitGroundSelfTestResult {
  const ground = new CircuitGround({ shadows: false });
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Circuit-ground self-test failed: ${message}`);
  };

  try {
    const metadata = ground.metadata;
    const route = metadata.routeCenterline;
    const first = route[0]!;
    const last = route[route.length - 1]!;
    const closureGap = Math.hypot(last.x - first.x, last.z - first.z);
    const seamTangentDot = last.tangentX * first.tangentX + last.tangentZ * first.tangentZ;
    assert(metadata.closedRoute, 'route metadata must declare an intentional closed loop');
    assert(closureGap < 1e-9, 'published route centerline must close exactly');
    assert(seamTangentDot > 0.999_999, 'route tangent must be continuous at the seam');
    assert(
      metadata.lapLength >= ground.config.lapLengthRange[0] &&
      metadata.lapLength <= ground.config.lapLengthRange[1],
      'lap length must remain inside the authored 1.2–1.8 km range',
    );
    assert(
      Math.abs(metadata.lapLength - ground.config.lapLengthTarget) < 80,
      'lap length should remain close to the 1.56 km target',
    );
    assert(metadata.trackWidth >= 8 && metadata.trackWidth <= 10, 'asphalt must be 8–10 m wide');
    assert(
      metadata.barrierOffset > metadata.shoulderWidth + 4,
      'guardrail must leave a meaningful grass runoff beyond the shoulder',
    );
    assert(
      metadata.mainStraightLength >= ground.config.mainStraightMinimumLength,
      'usable main straight must remain long enough for multi-gear acceleration',
    );

    const cornerSections = metadata.sections.filter((section) => section.kind !== 'straight');
    const radii = cornerSections.map((section) => section.radius ?? Number.POSITIVE_INFINITY);
    const minimumCornerRadius = Math.min(...radii);
    const maximumCornerRadius = Math.max(...radii);
    assert(cornerSections.length >= 4 && cornerSections.length <= 6, 'track must keep only 4–6 major corners');
    assert(minimumCornerRadius >= 42, 'tightest bend must remain forgiving for the road car');
    assert(maximumCornerRadius >= 100, 'layout must retain broad, flowing corners');
    assert(radii.filter((radius) => radius < 60).length === 1, 'only one bend may demand notable braking');
    assert(
      cornerSections.filter((section) => section.kind === 'gentle-left').length === 1,
      'route should retain one clear, gentle left bend',
    );
    for (const point of route) {
      assert(
        Math.abs(Math.hypot(point.tangentX, point.tangentZ) - 1) < 2e-5,
        'published route tangents must stay normalized',
      );
    }

    const mainPoint = ground.routeCurve.getPointAt(0.07);
    const mainTangent = ground.routeCurve.getTangentAt(0.07).normalize();
    const right = new THREE.Vector2(-mainTangent.z, mainTangent.x);
    const sampleAtOffset = (offset: number) => ground.sampleRoadSurface(
      mainPoint.x + right.x * offset,
      mainPoint.z + right.y * offset,
    );
    const asphalt = sampleAtOffset(0);
    const shoulder = sampleAtOffset(metadata.trackWidth * 0.5 + 1.05);
    const grass = sampleAtOffset(metadata.trackWidth * 0.5 + metadata.shoulderWidth + 2);
    assert(Math.abs(asphalt.gripMultiplier - 1) < 1e-9, 'centre asphalt response must remain exact');
    assert(shoulder.gripMultiplier < asphalt.gripMultiplier, 'shoulder must reduce grip progressively');
    assert(grass.gripMultiplier < shoulder.gripMultiplier, 'grass must provide the lowest grip');
    assert(
      grass.rollingResistanceMultiplier > shoulder.rollingResistanceMultiplier,
      'grass must add more rolling resistance than the shoulder',
    );

    let maximumGripStep = 0;
    let maximumRollingResistanceStep = 0;
    let previous = sampleAtOffset(metadata.trackWidth * 0.5 - 0.3);
    for (let offset = -0.25; offset <= metadata.shoulderWidth + 2.2; offset += 0.04) {
      const sample = sampleAtOffset(metadata.trackWidth * 0.5 + offset);
      maximumGripStep = Math.max(maximumGripStep, Math.abs(sample.gripMultiplier - previous.gripMultiplier));
      maximumRollingResistanceStep = Math.max(
        maximumRollingResistanceStep,
        Math.abs(sample.rollingResistanceMultiplier - previous.rollingResistanceMultiplier),
      );
      previous = sample;
    }
    assert(maximumGripStep < 0.025, 'asphalt/shoulder/grass grip must not have a sharp step');
    assert(maximumRollingResistanceStep < 0.11, 'rolling resistance must transition smoothly');

    const markings = ground.getRoadMarkingDiagnostics();
    assert(markings.vertexCount > 8_000, 'edge lines must be densely sampled around the full lap');
    assert(markings.maximumClearanceError < 2e-5, 'markings must stay in contact with the road plane');
    assert(markings.maximumJoinGap < 1e-8, 'closed edge-line subdivisions must not develop gaps');

    // Measure the GPU-facing Float32 position buffers independently instead
    // of trusting diagnostic metadata. This covers asphalt, shoulder and both
    // edge lines and catches endpoint tangent drift at the closed seam.
    let closedRibbonCount = 0;
    let maximumRibbonJoinGap = 0;
    ground.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.geometry.userData.circuitClosedRibbon !== true) {
        return;
      }
      const positions = object.geometry.getAttribute('position');
      assert(positions.count >= 4, `${object.name} must contain a first and final vertex ring`);
      const finalRingStart = positions.count - 2;
      let joinGap = 0;
      for (let side = 0; side < 2; side += 1) {
        joinGap = Math.max(joinGap, Math.hypot(
          positions.getX(side) - positions.getX(finalRingStart + side),
          positions.getY(side) - positions.getY(finalRingStart + side),
          positions.getZ(side) - positions.getZ(finalRingStart + side),
        ));
      }
      const recordedJoinGap = object.geometry.userData.maximumJoinGap;
      assert(
        typeof recordedJoinGap === 'number' && Math.abs(recordedJoinGap - joinGap) < 1e-12,
        `${object.name} must publish its measured vertex-buffer join gap`,
      );
      closedRibbonCount += 1;
      maximumRibbonJoinGap = Math.max(maximumRibbonJoinGap, joinGap);
    });
    assert(closedRibbonCount === 4, 'shoulder, asphalt and both edge lines must be closed ribbons');
    assert(maximumRibbonJoinGap < 1e-8, 'all rendered circuit ribbons must close without a seam gap');

    const follower = runTwoLapFollower(ground);
    assert(follower.laps >= 2, 'shipping sedan must complete at least two continuous laps');
    assert(
      follower.maximumError < metadata.trackWidth * 0.5,
      `centreline follower must remain on asphalt for the full two-lap run (got ${follower.maximumError.toFixed(2)} m)`,
    );
    assert(
      follower.meanError < 1.7,
      `mean two-lap line error must remain comfortably inside the lane (got ${follower.meanError.toFixed(2)} m)`,
    );
    assert(follower.maximumSpeedKmh > 72, 'main straight must support a clear multi-gear high-speed run');
    assert(follower.meanSpeedKmh > 38, 'layout must sustain an easy, continuous driving rhythm');
    const sportsFollower = runTwoLapFollower(ground, getVehicleDescriptor('sport-coupe'));
    assert(sportsFollower.laps >= 2 && sportsFollower.maximumError < metadata.trackWidth * .5,
      `shipping GT must complete two laps on asphalt (${sportsFollower.laps} laps, ${sportsFollower.maximumError.toFixed(2)} m)`);

    return {
      assertions,
      lapLength: metadata.lapLength,
      mainStraightLength: metadata.mainStraightLength,
      cornerCount: cornerSections.length,
      minimumCornerRadius,
      maximumCornerRadius,
      closureGap,
      seamTangentDot,
      maximumGripStep,
      maximumRollingResistanceStep,
      markingVertices: markings.vertexCount,
      markingClearanceError: markings.maximumClearanceError,
      closedRibbonCount,
      maximumRibbonJoinGap,
      simulatedLaps: follower.laps,
      simulationSeconds: follower.seconds,
      maximumFollowerError: follower.maximumError,
      meanFollowerError: follower.meanError,
      maximumSpeedKmh: follower.maximumSpeedKmh,
      meanSpeedKmh: follower.meanSpeedKmh,
      sportsLaps: sportsFollower.laps,
      sportsMaximumFollowerError: sportsFollower.maximumError,
    };
  } finally {
    ground.dispose();
  }
}

interface FollowerResult {
  readonly laps: number;
  readonly seconds: number;
  readonly maximumError: number;
  readonly meanError: number;
  readonly maximumSpeedKmh: number;
  readonly meanSpeedKmh: number;
}

const runTwoLapFollower = (ground: CircuitGround, vehicle: VehicleDescriptor = getVehicleDescriptor('family-sedan')): FollowerResult => {
  const route = ground.metadata.routeCenterline.slice(0, -1);
  const routeSpacing = ground.metadata.lapLength / route.length;
  const dynamics = new VehicleDynamics(vehicle.physicsConfig, {
    x: ground.spawnPose.position.x,
    z: ground.spawnPose.position.z,
    yaw: ground.spawnPose.yawRadians,
    gear: 'N',
    clutchEngagement: 0,
    controlMode: 'normal',
  });
  dynamics.requestGear(1);
  const contactSystem = new VehicleContactSystem(ground, vehicle.visualConfig.collisionDimensions);
  const dt = 1 / 120;
  const maximumSteps = 120 * 250;
  let nearestIndex = 0;
  let previousIndex = 0;
  let completedLaps = 0;
  let maximumError = 0;
  let errorSum = 0;
  let speedSum = 0;
  let maximumSpeedKmh = 0;
  let samples = 0;
  let shiftCooldown = 0;
  let steps = 0;

  const findNearest = (x: number, z: number, centreIndex: number): number => {
    let bestIndex = centreIndex;
    let bestSquared = Number.POSITIVE_INFINITY;
    const searchRadius = 45;
    for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
      const index = THREE.MathUtils.euclideanModulo(centreIndex + offset, route.length);
      const point = route[index]!;
      const squared = (x - point.x) ** 2 + (z - point.z) ** 2;
      if (squared < bestSquared) {
        bestSquared = squared;
        bestIndex = index;
      }
    }
    return bestIndex;
  };

  nearestIndex = route.reduce((best, point, index) => {
    const bestPoint = route[best]!;
    return (dynamics.x - point.x) ** 2 + (dynamics.z - point.z) ** 2 <
      (dynamics.x - bestPoint.x) ** 2 + (dynamics.z - bestPoint.z) ** 2 ? index : best;
  }, 0);
  previousIndex = nearestIndex;

  for (; steps < maximumSteps && completedLaps < 2; steps += 1) {
    const snapshot = dynamics.getSnapshot();
    nearestIndex = findNearest(snapshot.x, snapshot.z, nearestIndex);
    if (previousIndex > route.length * 0.82 && nearestIndex < route.length * 0.18) {
      completedLaps += 1;
    }
    previousIndex = nearestIndex;
    const nearest = route[nearestIndex]!;
    const error = Math.hypot(snapshot.x - nearest.x, snapshot.z - nearest.z);
    maximumError = Math.max(maximumError, error);
    errorSum += error;
    speedSum += snapshot.speedKmh;
    maximumSpeedKmh = Math.max(maximumSpeedKmh, snapshot.speedKmh);
    samples += 1;

    const currentDistance = nearest.distance;
    let upcomingRadius = Number.POSITIVE_INFINITY;
    for (const section of ground.metadata.sections) {
      if (section.radius === undefined) continue;
      const distanceAhead = modularDistance(currentDistance, section.startDistance, ground.metadata.lapLength);
      if (distanceAhead < 145 || (
        currentDistance >= section.startDistance && currentDistance <= section.endDistance
      )) {
        upcomingRadius = Math.min(upcomingRadius, section.radius);
      }
    }
    const targetSpeedKmh = upcomingRadius < 55
      ? 36
      : upcomingRadius < 82
        ? 62
        : upcomingRadius < 102
          ? 72
          : upcomingRadius < Number.POSITIVE_INFINITY
            ? 80
            : 98;
    const lookaheadMetres = clamp(13 + Math.abs(snapshot.speed) * 0.62, 14, 31);
    const lookaheadIndex = THREE.MathUtils.euclideanModulo(
      nearestIndex + Math.round(lookaheadMetres / routeSpacing),
      route.length,
    );
    const target = route[lookaheadIndex]!;
    const desiredYaw = Math.atan2(-(target.x - snapshot.x), -(target.z - snapshot.z));
    // Follow the direction of travel, including ordinary body slip. Comparing
    // only body yaw made this test driver over-correct after a braking corner.
    const headingError = wrapAngle(desiredYaw - (snapshot.yaw - snapshot.bodySlipAngle));
    const steering = clamp(-headingError * 1.55, -1, 1);
    const speedError = targetSpeedKmh - snapshot.speedKmh;
    const brake = speedError < -7 ? clamp((-speedError - 4) / 22, 0, 0.72) : 0;
    const throttle = brake > 0
      ? 0
      : speedError > 12
        ? 0.78
        : speedError > 3
          ? 0.48
          : 0.2;
    shiftCooldown = Math.max(0, shiftCooldown - dt);
    const shiftThresholds: Readonly<Record<number, number>> = { 1: 24, 2: 43, 3: 67, 4: 91 };
    const numericGear = typeof snapshot.gear === 'number' ? snapshot.gear : 0;
    const shiftUp = numericGear > 0 && numericGear < 5 && shiftCooldown <= 0 &&
      snapshot.speedKmh > (shiftThresholds[numericGear] ?? Number.POSITIVE_INFINITY);
    if (shiftUp) shiftCooldown = 1.15;
    contactSystem.step(dt, makeInput({ throttle, brake, steering, shiftUp }), dynamics);
  }

  return {
    laps: completedLaps,
    seconds: steps * dt,
    maximumError,
    meanError: errorSum / Math.max(1, samples),
    maximumSpeedKmh,
    meanSpeedKmh: speedSum / Math.max(1, samples),
  };
};
