import { Scene } from 'three';
import { VehicleCollisionSystem } from '../../physics/CollisionSystem';
import { SCENARIO_CATEGORY_LABELS, SCENARIO_DEBUGGER_PRESETS } from './ScenarioDebuggerPresets';
import { ScenarioDebugger } from './ScenarioDebugger';
import type { ADASVehicleState, TrafficActorSnapshot } from '../ADASTypes';

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(`ScenarioDebugger selftest failed: ${msg}`);
}

export function runScenarioDebuggerSelfTests(): { passed: boolean; assertions: number; tests: string[] } {
  let assertions = 0;
  const tests: string[] = [];

  const scene = new Scene();
  const mockEgo: ADASVehicleState = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 15,
    lateralVelocity: 0,
    yawRate: 0,
    acceleration: 0,
    steeringAngle: 0,
    steeringWheelAngle: 0,
    throttle: 0.3,
    brake: 0,
    wheelBase: 2.8,
    vehicleWidth: 1.9,
    vehicleLength: 4.8,
    steeringConfig: {
      maxRoadWheelAngle: 0.56,
      steeringWheelLock: 9.4,
      steeringRatio: 15,
      highSpeedReferenceSpeed: 18,
      highSpeedMinimumAuthority: 0.22,
    },
    vehicleOperational: true,
    driveAvailable: true,
    forwardGear: true,
    parkingBrakeActive: false,
    autoHoldHolding: false,
    suspended: false,
  };

  const mockGround: any = {
    getRoadHeightAt: (_x: number, _z: number) => 0.1,
    laneGraph: undefined,
  };

  const sdb = new ScenarioDebugger(scene, () => mockEgo, () => mockGround);

  // Test 1: Zero overhead when empty
  const buffer: TrafficActorSnapshot[] = Array.from({ length: 8 }, () => ({
    id: '',
    kind: 'vehicle',
    x: 0, y: 0, z: 0, yaw: 0, speed: 0, vx: 0, vz: 0,
    length: 0, width: 0, height: 0, confidence: 0, timestamp: 0,
  }));
  const count0 = sdb.queryNearbyActors(0, 0, 0, 100, buffer);
  assert(count0 === 0, 'Must return 0 when no actors spawned');
  assertions++;
  tests.push('Zero overhead when empty');

  // Test 2: Spawning static vehicle
  const r1 = sdb.spawn({
    type: 'vehicle',
    motionMode: 'static',
    positionMode: 'road-relative',
    forwardDistanceM: 50,
    laneOffset: 0,
    lateralOffsetM: 0,
    speedKmh: 0,
    targetSpeedKmh: 0,
    behavior: 'constant',
    behaviorDelayS: 0,
    targetLaneChange: 'none',
    randomSeed: 1,
  });
  assert(r1.success && r1.actor, `Failed to spawn static vehicle: ${r1.error}`);
  assert(r1.actor.motionMode === 'static', 'Must be static motionMode');
  assert(r1.actor.z < -45, `Expected forward z < -45, got ${r1.actor.z}`);
  assertions += 3;
  tests.push('Spawn static vehicle road-relative');

  // Test 3: Spawning dynamic pedestrian
  const r2 = sdb.spawn({
    type: 'pedestrian',
    motionMode: 'dynamic',
    positionMode: 'road-relative',
    forwardDistanceM: 30,
    laneOffset: 1,
    lateralOffsetM: 0,
    speedKmh: 6,
    targetSpeedKmh: 6,
    behavior: 'constant',
    behaviorDelayS: 0,
    targetLaneChange: 'none',
    randomSeed: 2,
  });
  assert(r2.success && r2.actor, `Failed to spawn pedestrian: ${r2.error}`);
  assert(r2.actor.kind === 'pedestrian', 'Kind must be pedestrian');
  assertions += 2;
  tests.push('Spawn dynamic pedestrian');

  // Test 4: Collision overlap detection
  const rOverlap = sdb.spawn({
    type: 'vehicle',
    motionMode: 'static',
    positionMode: 'road-relative',
    forwardDistanceM: 50, // overlaps r1!
    laneOffset: 0,
    lateralOffsetM: 0,
    speedKmh: 0,
    targetSpeedKmh: 0,
    behavior: 'constant',
    behaviorDelayS: 0,
    targetLaneChange: 'none',
    randomSeed: 3,
  });
  assert(!rOverlap.success, 'Must reject spawn that overlaps existing actor');
  assertions++;
  tests.push('Spatial collision overlap protection');

  // Test 5: TrafficActorProvider contract verification
  const countActive = sdb.queryNearbyActors(0, 0, 0, 100, buffer);
  assert(countActive === 2, `Expected 2 actors populated, got ${countActive}`);
  assert(buffer[0]!.isStatic === true, 'r1 must be reported as static');
  assert(buffer[1]!.isDynamic === true, 'r2 must be reported as dynamic');
  assertions += 3;
  tests.push('TrafficActorProvider snapshot integration');

  // Test 6: Dynamic behavior trigger (sudden-brake)
  const rBrake = sdb.spawn({
    type: 'vehicle',
    motionMode: 'dynamic',
    positionMode: 'road-relative',
    forwardDistanceM: 20,
    laneOffset: -1,
    lateralOffsetM: 0,
    speedKmh: 50,
    targetSpeedKmh: 50,
    behavior: 'sudden-brake',
    behaviorDelayS: 0.1,
    targetLaneChange: 'none',
    randomSeed: 4,
  });
  assert(rBrake.success && rBrake.actor, 'Failed to spawn braking actor');
  const initialSpeed = rBrake.actor.speed;
  assert(initialSpeed > 10, 'Initial speed must be > 10 m/s');
  // Step simulation for 0.3s
  sdb.update(0.15);
  sdb.update(0.15);
  assert(rBrake.actor.behaviorTriggered === true, 'Behavior should be triggered after delay');
  assert(rBrake.actor.targetSpeed === 0, 'Target speed must be set to 0 for sudden-brake');
  assert(rBrake.actor.speed < initialSpeed, 'Speed should have started decelerating');
  assertions += 5;
  tests.push('Dynamic sudden-brake behavior');

  // Test 7: Cut-in behavior lateral displacement
  const rCutin = sdb.spawn({
    type: 'vehicle',
    motionMode: 'dynamic',
    positionMode: 'road-relative',
    forwardDistanceM: 70,
    laneOffset: 1,
    lateralOffsetM: 0,
    speedKmh: 40,
    targetSpeedKmh: 40,
    behavior: 'cut-in',
    behaviorDelayS: 0.05,
    targetLaneChange: 'left',
    randomSeed: 5,
  });
  assert(rCutin.success && rCutin.actor, 'Failed to spawn cut-in actor');
  const initX = rCutin.actor.x;
  sdb.update(0.1);
  sdb.update(0.2);
  assert(rCutin.actor.x < initX, `Expected actor to move laterally left, initX=${initX}, now=${rCutin.actor.x}`);
  assertions += 2;
  tests.push('Cut-in lateral displacement');

  // Test 8: Auto-cleanup beyond distance
  sdb.autoCleanupDistanceM = 60;
  // Step with ego staying at 0,0, but actors at > 60m should be cleaned up
  sdb.update(0.05);
  const statusAfterCleanup = sdb.getStatus();
  assert(statusAfterCleanup.activeActorCount < 4, 'Actors beyond cleanup distance must be removed');
  assertions++;
  tests.push('Distance auto-cleanup');

  // Test 9: Clear all and disposal
  sdb.clearAll();
  assert(sdb.getStatus().activeActorCount === 0, 'ClearAll must empty all actors');
  assertions++;
  tests.push('Clear all and disposal');

  // Test 10: All 26 presets across 5 categories & multi-actor spawn
  sdb.autoCleanupDistanceM = 200;
  assert(SCENARIO_CATEGORY_LABELS.length === 5, 'Expected 5 scenario categories');
  assert(SCENARIO_DEBUGGER_PRESETS.length >= 26, `Expected >= 26 presets, got ${SCENARIO_DEBUGGER_PRESETS.length}`);
  const ghostRes = sdb.spawnPresetById('vru-ghost-peek', true);
  assert(ghostRes.successCount === 2, `Ghost peek preset must spawn 2 actors, got ${ghostRes.successCount}`);
  assert(sdb.activeCount === 2, 'Active count must match preset actor count');
  const multiBlock = sdb.spawnPresetById('obs-multi-lane-block', true);
  assert(multiBlock.successCount === 3, 'Multi-lane block preset must spawn 3 actors');
  assertions += 5;
  tests.push('Categorized 26 presets & composite preset spawning');

  // Test 11: Dynamic speed scaling from road speed limit and ego speed
  const urbanGround: any = {
    getRoadHeightAt: () => 0,
    roadNetwork: { segments: [{ id: 'city-road', speedLimit: 40, roadType: 'urban', laneWidth: 3.5 }] },
  };
  const hwyGround: any = {
    getRoadHeightAt: () => 0,
    roadNetwork: { segments: [{ id: 'hwy-road', speedLimit: 120, roadType: 'highway', laneWidth: 3.75 }] },
  };
  let curGround = urbanGround;
  const dynEgo: ADASVehicleState = { ...mockEgo, speed: 36 / 3.6 };
  const sdbDyn = new ScenarioDebugger(scene, () => dynEgo, () => curGround);

  sdbDyn.spawnPresetById('lead-slow', true);
  const urbanSlowKmh = sdbDyn.getStatus().actors[0]!.speedKmh;

  curGround = hwyGround;
  dynEgo.speed = 108 / 3.6;
  sdbDyn.spawnPresetById('lead-slow', true);
  const hwySlowKmh = sdbDyn.getStatus().actors[0]!.speedKmh;
  assert(hwySlowKmh > urbanSlowKmh + 25, `Highway slow vehicle (${hwySlowKmh}) must scale above urban (${urbanSlowKmh})`);

  sdbDyn.spawnPresetById('interact-rear-fast', true);
  const rearFastKmh = sdbDyn.getStatus().actors.find((a) => a.distanceToEgoM > 0 && a.laneOffset === 1)!.speedKmh;
  assert(rearFastKmh > 120, `Rear fast approach on 120km/h highway must exceed 120 km/h, got ${rearFastKmh}`);
  assertions += 2;
  tests.push('Dynamic vehicle speed scaling by road limit & ego speed');

  // Test 12: Pause / Resume / Reset scenario lifecycle
  sdbDyn.pause();
  const xBeforePause = sdbDyn.getStatus().actors[0]!.x;
  const zBeforePause = sdbDyn.getStatus().actors[0]!.z;
  sdbDyn.update(0.5);
  assert(
    sdbDyn.getStatus().actors[0]!.x === xBeforePause && sdbDyn.getStatus().actors[0]!.z === zBeforePause,
    'Paused scenario must freeze actor kinematics',
  );
  sdbDyn.resume();
  sdbDyn.update(0.5);
  assert(sdbDyn.getStatus().actors[0]!.z !== zBeforePause, 'Resumed scenario must advance actor kinematics');
  const resetRes = sdbDyn.resetCurrentScenario();
  assert(resetRes.success && resetRes.count === 2, 'Reset current scenario must restore last spawned actors');
  assertions += 3;
  tests.push('Pause / resume / reset scenario lifecycle');

  // Test 13: Live parameter updateActor & OBB collider / perception consistency
  const leadId = sdbDyn.getStatus().actors[0]!.id;
  const updRes = sdbDyn.updateActor(leadId, {
    type: 'vehicle',
    motionMode: 'dynamic',
    positionMode: 'road-relative',
    forwardDistanceM: 4.0,
    laneOffset: 0,
    lateralOffsetM: 0,
    speedKmh: 36,
    targetSpeedKmh: 36,
    behavior: 'constant',
    behaviorDelayS: 0,
    targetLaneChange: 'none',
    randomSeed: 7,
    dimensions: { length: 5.0, width: 2.2, height: 1.8 },
  });
  assert(updRes.success, `Live updateActor failed: ${updRes.error}`);
  const editedStatus = sdbDyn.getStatus().actors.find((a) => a.id === leadId)!;
  const extraCols = sdbDyn.getNearbyColliders({ x: dynEgo.x, z: dynEgo.z }, 80);
  const leadCol = extraCols.find((c) => c.id === leadId);
  assert(editedStatus.width === 2.2 && leadCol !== undefined && leadCol.halfWidth === 1.1, 'Live edit must sync OBB collider width');

  const perceptionBuf: TrafficActorSnapshot[] = Array.from({ length: 4 }, () => ({
    id: '', kind: 'vehicle', x: 0, y: 0, z: 0, yaw: 0, speed: 0, vx: 0, vz: 0,
    length: 0, width: 0, height: 0, confidence: 0, timestamp: 0,
  }));
  const pCount = sdbDyn.queryNearbyActors(dynEgo.x, dynEgo.y, dynEgo.z, 80, perceptionBuf);
  const pLead = perceptionBuf.slice(0, pCount).find((a) => a.id === leadId);
  assert(pLead !== undefined && pLead.predictedTrajectory?.length === 6, 'Dynamic actor must populate 6-point predictedTrajectory');

  // Test 14: Physical VehicleCollisionSystem resolution against ScenarioDebugger OBB colliders
  const collSys = new VehicleCollisionSystem([]);
  assert(leadCol !== undefined, 'getNearbyColliders must expose spawned actor OBB');
  const colRes = collSys.resolve({
    dt: 1 / 120,
    previousPose: { x: dynEgo.x, z: dynEgo.z, yaw: dynEgo.yaw },
    pose: { x: editedStatus.x, z: editedStatus.z, yaw: dynEgo.yaw },
    velocity: { x: 0, z: -10 },
    dimensions: { length: 4.8, width: 1.9, height: 1.5 },
    extraColliders: extraCols,
  });
  assert(colRes.collided && colRes.contacts.some((c) => c.colliderId === leadId), 'Physical VehicleCollisionSystem must resolve OBB collision with spawned debug actor');
  assertions += 5;
  tests.push('Live updateActor & physics-perception-OBB consistency');

  sdbDyn.dispose();
  sdb.dispose();

  return { passed: true, assertions, tests };
}
