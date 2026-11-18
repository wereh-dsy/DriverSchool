import {
  createBarrierColliders,
  createStaticOBBCollider,
  createVehicleOBB,
  VehicleCollisionSystem,
  type CollisionPose,
} from './CollisionSystem';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`CollisionSystem self-test failed: ${message}`);
};

const dimensions = { length: 4.48, width: 1.79, height: 1.5 };

export interface CollisionSystemSelfTestResult {
  sweptFrontalStopPassed: boolean;
  frontalStoppedZ: number;
  glancingSlideSpeed: number;
  glancingSlidePassed: boolean;
  persistentWallPositionSpread: number;
  persistentWallPassed: boolean;
  sustainedGrazingSpeed: number;
  sustainedGrazingPassed: boolean;
  impactReentryPassed: boolean;
  exposedRailEndPassed: boolean;
  rotatedFootprintPassed: boolean;
  wallExitPassed: boolean;
  buildingCornerPassed: boolean;
  verticalSeparationPassed: boolean;
}

export const runCollisionSystemSelfTest = (): CollisionSystemSelfTestResult => {
  const frontal = new VehicleCollisionSystem(createBarrierColliders({
    id: 'front-rail', start: { x: -30, z: -8 }, end: { x: 30, z: -8 }, thickness: 0.1,
    minHeight: 0.4, maxHeight: 0.72,
  }));
  const frontalHit = frontal.resolve({
    previousPose: { x: 0, z: 0, yaw: 0 }, pose: { x: 0, z: -30, yaw: 0 },
    velocity: { x: 0, z: -60 }, dimensions, dt: 0.5,
  });
  const sweptFrontalStopPassed = frontalHit.collided && frontalHit.pose.z > -5.773 &&
    Math.hypot(frontalHit.velocity.x, frontalHit.velocity.z) < 0.01 && frontalHit.pose.yaw === 0;
  assert(sweptFrontalStopPassed, 'a swept 30 m frontal motion must stop before a thin rail, without bounce or yaw');

  // Two separately authored visual beam groups meet at z=35; their shared
  // terminal caps must disappear just like subdivisions within either group.
  const wall = new VehicleCollisionSystem([
    ...createBarrierColliders({
      id: 'side-rail-a', start: { x: 0, z: -120 }, end: { x: 0, z: 35 }, thickness: 0.1,
    }),
    ...createBarrierColliders({
      id: 'side-rail-b', start: { x: 0, z: 35 }, end: { x: 0, z: 120 }, thickness: 0.1,
    }),
  ]);
  const glance = wall.resolve({
    previousPose: { x: -3, z: 2, yaw: 0 }, pose: { x: 1, z: -12, yaw: 0 },
    velocity: { x: 8, z: -28 }, dimensions, dt: 0.5,
  });
  const glancingSlideSpeed = Math.hypot(glance.velocity.x, glance.velocity.z);
  const glancingSlidePassed = glance.collided && glance.pose.x < -0.915 &&
    Math.abs(glance.velocity.x) < 0.01 && glance.velocity.z < -1 && glancingSlideSpeed < 20;
  assert(glancingSlidePassed, 'an oblique hit must retain modest tangent motion and remove inward motion');

  let persistentPose: CollisionPose = { x: -0.918, z: 20, yaw: 0 };
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumSlideSpeed = Number.POSITIVE_INFINITY;
  for (let index = 0; index < 600; index += 1) {
    const result = wall.resolve({
      previousPose: persistentPose,
      pose: { ...persistentPose, x: persistentPose.x + 0.001, z: persistentPose.z - 0.02 },
      velocity: { x: 0.12, z: -2.4 }, dimensions, dt: 1 / 120,
    });
    persistentPose = result.pose;
    minimumX = Math.min(minimumX, persistentPose.x);
    maximumX = Math.max(maximumX, persistentPose.x);
    minimumSlideSpeed = Math.min(minimumSlideSpeed, -result.velocity.z);
  }
  const persistentWallPositionSpread = maximumX - minimumX;
  const persistentWallPassed = persistentWallPositionSpread < 1e-8 && persistentPose.x <= -0.9149 &&
    minimumSlideSpeed > 2.3 && persistentPose.z < 8.1;
  assert(persistentWallPassed, 'continuous small inward throttle must not buzz, stick, or drain tangent motion across rail seams');

  wall.reset();
  let grazingPose: CollisionPose = {
    x: -(0.865 * Math.cos(0.25) + 2.18 * Math.sin(0.25) + 0.053),
    z: 48, yaw: -0.25,
  };
  let tangentSpeed = 10;
  let firstContactSpeed = 0;
  for (let index = 0; index < 360; index += 1) {
    // A body pointed partly into the rail continually regains an inward
    // velocity from tire slip correction. This must not count as 360 impacts.
    const result = wall.resolve({
      previousPose: grazingPose,
      pose: { ...grazingPose, x: grazingPose.x + 0.9 / 120, z: grazingPose.z - tangentSpeed / 120 },
      velocity: { x: 0.9, z: -tangentSpeed }, dimensions, dt: 1 / 120,
    });
    grazingPose = result.pose;
    tangentSpeed = -result.velocity.z;
    if (index === 0) firstContactSpeed = tangentSpeed;
  }
  const sustainedGrazingSpeed = tangentSpeed;
  const sustainedGrazingPassed = firstContactSpeed > 5 &&
    sustainedGrazingSpeed > firstContactSpeed * 0.98 && grazingPose.z < 30;
  assert(sustainedGrazingPassed, `ongoing high-inward scrape must damp the first impact only, retaining tangent motion across rail seams (first ${firstContactSpeed}, final ${sustainedGrazingSpeed}, z ${grazingPose.z})`);

  // A true departure clears the scrape after the short gap. A subsequent hit
  // should once again receive impact damping, rather than remaining immune.
  wall.resolve({
    previousPose: grazingPose, pose: { ...grazingPose, x: -8 },
    velocity: { x: -10, z: 0 }, dimensions, dt: 0.25,
  });
  const secondImpact = wall.resolve({
    previousPose: { x: -8, z: grazingPose.z, yaw: 0 },
    pose: { x: 1, z: grazingPose.z - 4, yaw: 0 },
    velocity: { x: 18, z: -8 }, dimensions, dt: 0.5,
  });
  const impactReentryPassed = secondImpact.collided && Math.abs(secondImpact.velocity.z) < 1;
  assert(impactReentryPassed, 'a separate impact after leaving the wall must receive strong entry damping again');

  wall.reset();
  const terminalHit = wall.resolve({
    previousPose: { x: 0, z: -130, yaw: Math.PI },
    pose: { x: 0, z: -110, yaw: Math.PI },
    velocity: { x: 0, z: 40 }, dimensions, dt: 0.5,
  });
  const exposedRailEndPassed = terminalHit.collided && terminalHit.pose.z < -122.18 &&
    Math.hypot(terminalHit.velocity.x, terminalHit.velocity.z) < 0.01;
  assert(exposedRailEndPassed, 'the true exposed end of a guardrail must remain solid after suppressing internal caps');

  const exit = wall.resolve({
    previousPose: persistentPose, pose: { ...persistentPose, x: persistentPose.x - 0.5 },
    velocity: { x: -2, z: 0 }, dimensions, dt: 0.25,
  });
  const wallExitPassed = !exit.collided && exit.pose.x < -1.4 && exit.velocity.x === -2;
  assert(wallExitPassed, 'a driver moving away must exit immediately rather than remain attached to the wall');

  const rotatedDimensions = createVehicleOBB({ x: 0, z: 0, yaw: Math.PI / 2 }, dimensions);
  const stoppedRotated = wall.resolve({
    previousPose: { x: -5, z: 0, yaw: Math.PI / 2 }, pose: { x: 2, z: 0, yaw: Math.PI / 2 },
    velocity: { x: 20, z: 0 }, dimensions, dt: 0.35,
  });
  const rotatedFootprintPassed = Math.abs(rotatedDimensions.corners[0]!.x + 2.18) < 1e-9 &&
    stoppedRotated.pose.x < -2.23 && stoppedRotated.pose.x > -2.25 &&
    Math.abs(stoppedRotated.pose.yaw - Math.PI / 2) < 1e-9;
  assert(rotatedFootprintPassed, 'a 90 degree car must contact with its length, not a world-axis width box');

  const building = new VehicleCollisionSystem([createStaticOBBCollider({
    id: 'block', x: 0, z: 0, width: 8, length: 12, type: 'building', minHeight: 0, maxHeight: 5,
  })]);
  const buildingHit = building.resolve({
    previousPose: { x: -8, z: -11, yaw: -Math.PI / 4 },
    pose: { x: -2, z: -4, yaw: -Math.PI / 4 }, velocity: { x: 12, z: 14 }, dimensions, dt: 0.5,
  });
  const buildingCornerPassed = buildingHit.collided && buildingHit.vehicleOBB.corners.every((corner) =>
    corner.x <= -4 || corner.x >= 4 || corner.z <= -6 || corner.z >= 6,
  ) && Math.hypot(buildingHit.velocity.x, buildingHit.velocity.z) < 7;
  assert(buildingCornerPassed, 'building corners must push the complete rotated footprint outside safely');

  const overhead = frontal.resolve({
    previousPose: { x: 0, z: 0, yaw: 0, y: 5 }, pose: { x: 0, z: -30, yaw: 0, y: 5 },
    velocity: { x: 0, z: -60 }, dimensions, dt: 0.5,
  });
  const verticalSeparationPassed = !overhead.collided && Math.abs(overhead.pose.z + 30) < 1e-9 && overhead.pose.y === 5;
  assert(verticalSeparationPassed, 'bounded rail heights must not collide with a separate elevated road');
  return {
    sweptFrontalStopPassed, frontalStoppedZ: frontalHit.pose.z, glancingSlideSpeed, glancingSlidePassed,
    persistentWallPositionSpread, persistentWallPassed, sustainedGrazingSpeed, sustainedGrazingPassed,
    impactReentryPassed, exposedRailEndPassed, rotatedFootprintPassed, wallExitPassed,
    buildingCornerPassed, verticalSeparationPassed,
  };
};
