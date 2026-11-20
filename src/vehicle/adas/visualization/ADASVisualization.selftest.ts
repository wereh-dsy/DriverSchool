import { PerspectiveCamera, Vector2, Vector3 } from 'three';
import type { DrivingGround } from '../../../world/DrivingGround';
import { VEHICLE_RENDER_LAYERS } from '../../visual/VehicleRenderLayers';
import type { StaticCollider } from '../../physics/CollisionSystem';
import {
  createEmptyPathSample,
  createEmptyUpcomingJunction,
  createEmptyAdjacentClearance,
  type ADASObstacleAssessment,
  type ADASPlanSnapshot,
  type ADASStatusSnapshot,
  type ADASTrafficRuleDecision,
  type ADASVehicleState,
  type TrafficActorSnapshot,
} from '../ADASTypes';
import { ADASHudOverlay } from '../ADASHudOverlay';
import { ADASVisualizationExtractor, type ADASVisualizationInput } from './ADASVisualizationExtractor';
import { ADASWorldRenderer } from './ADASWorldRenderer';
import { DEFAULT_ADAS_VISUALIZATION_CONFIG } from './ADASVisualizationConfig';

function makeBaseInput(): ADASVisualizationInput {
  const samples = Array.from({ length: 80 }, (_, i) => {
    const s = createEmptyPathSample();
    s.s = i * 1.5;
    s.x = 0;
    s.y = 0;
    s.z = -i * 1.5;
    s.yaw = 0;
    s.laneWidth = 3.5;
    s.approachLaneCount = 2;
    return s;
  });

  const plan: ADASPlanSnapshot = {
    valid: true,
    degraded: false,
    unavailableReason: '',
    derivedLaneGeometry: false,
    confidence: 1,
    sampleCount: 80,
    samples,
    egoSampleIndex: 2,
    egoS: 3.0,
    lateralOffsetM: 0,
    headingErrorRad: 0,
    currentRoadId: 'road-1',
    currentRoadName: '主干道',
    currentLaneId: 'lane-0',
    currentLaneIndex: 0,
    currentApproachLaneIndex: 0,
    currentApproachLaneCount: 2,
    currentLaneWidth: 3.5,
    leftBoundary: 'solid',
    rightBoundary: 'dashed',
    currentSpeedLimitMps: 80 / 3.6,
    speedLimitEstimated: false,
    remainingRouteDistanceM: 500,
    maneuver: 'FOLLOW_LANE',
    desiredTurnSignal: null,
    inJunction: false,
    nearJunctionSolidZone: false,
    upcomingJunction: createEmptyUpcomingJunction(),
    laneChange: {
      active: false,
      reason: 'none',
      direction: null,
      fromLaneIndex: 0,
      toLaneIndex: 0,
      phase: 'idle',
      elapsedSeconds: 0,
      durationSeconds: 3.2,
      signalLeadSeconds: 1.8,
      lateralDeltaM: 0,
    },
    overtaking: {
      active: false,
      phase: 'none',
      targetActorId: '',
      originalLaneIndex: 0,
      passingLaneIndex: 0,
      elapsedSeconds: 0,
      passedElapsedSeconds: 0,
      leadSpeedSnapshotMps: 0,
      overtakeTargetSpeedMps: 0,
    },
    routeVersion: 1,
  };

  const obstacle: ADASObstacleAssessment = {
    valid: true,
    dataReliable: true,
    actorCount: 0,
    hasLeadActor: false,
    leadActorId: '',
    leadActorKind: 'none',
    leadIsStatic: false,
    leadX: 0,
    leadY: 0,
    leadZ: 0,
    leadYaw: 0,
    leadWidth: 1.9,
    leadLength: 4.5,
    leadHeight: 1.5,
    leadInCorridor: false,
    leadMotionDirection: 'none',
    leadGapM: Infinity,
    leadSpeedMps: Infinity,
    closingSpeedMps: 0,
    ttcSeconds: Infinity,
    cutInDetected: false,
    junctionBlocked: false,
    roadBlocked: false,
    allowSolidBypass: false,
    targetSpeedMps: Infinity,
    avoidanceTargetSpeedMps: Infinity,
    canEvadeWithoutStopping: false,
    overtakeRecommended: false,
    overtakeDirection: null,
    overtakeActorId: '',
    overtakenActorFound: false,
    overtakenActorBehindGapM: -Infinity,
    overtakenActorX: 0,
    overtakenActorY: 0,
    overtakenActorZ: 0,
    overtakenActorYaw: 0,
    overtakenActorWidth: 1.9,
    overtakenActorLength: 4.5,
    overtakenActorHeight: 1.5,
    overtakenActorKind: 'none',
    stopDistanceM: Infinity,
    emergencyBraking: false,
    emergencyBrakeDemand: 0,
    avoidanceRequest: 'none',
    leftLane: createEmptyAdjacentClearance(),
    rightLane: createEmptyAdjacentClearance(),
    reason: '',
  };

  const rules: ADASTrafficRuleDecision = {
    signalDecision: 'NONE',
    signalColor: 'none',
    mustStop: false,
    stopDistanceM: Infinity,
    speedLimitMps: 80 / 3.6,
    speedLimitEstimated: false,
    curveAndTurnSpeedCapMps: 80 / 3.6,
    arrivalSpeedCapMps: Infinity,
    targetSpeedMps: 80 / 3.6,
    reason: '',
  };

  const status: ADASStatusSnapshot = {
    enabled: true,
    state: 'CRUISE',
    previousState: 'CRUISE',
    maneuver: 'FOLLOW_LANE',
    targetSpeedKmh: 80,
    speedLimitKmh: 80,
    speedLimitEstimated: false,
    currentRoadName: '主干道',
    currentLaneIndex: 0,
    approachLaneIndex: 0,
    approachLaneCount: 2,
    desiredTurnSignal: null,
    signalDecision: 'NONE',
    signalColor: 'none',
    leadGapM: null,
    ttcSeconds: null,
    driverSteeringOverride: false,
    driverAccelerationOverride: false,
    driverBrakeOverride: false,
    degraded: false,
    reason: '正常巡航保持',
    performance: {
      lastStepMs: 0.04,
      avgStepMs: 0.04,
      lastPlannerMs: 0.08,
      lastPerceptionMs: 0.1,
      plannerUpdates: 1,
      perceptionUpdates: 1,
    },
  };

  const vehicle: ADASVehicleState = {
    x: 0,
    y: 0,
    z: -3.0,
    yaw: 0,
    speed: 22,
    lateralVelocity: 0,
    yawRate: 0,
    acceleration: 0,
    steeringAngle: 0,
    steeringWheelAngle: 0,
    throttle: 0.2,
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

  const camera = new PerspectiveCamera(62, 16 / 9, 0.025, 2500);
  camera.position.set(-0.35, 1.32, -2.7);
  camera.lookAt(0, 1.2, -50);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  return {
    dt: 0.05,
    visible: true,
    enabled: true,
    status,
    plan,
    obstacle,
    rules,
    vehicle,
    samplesApproachLane: 0,
    theme: 'DAY',
    camera,
    viewportWidth: 1280,
    viewportHeight: 720,
    capabilities: { acc: true, lka: true, lcc: true, cruiseControl: true },
  };
}

export function runADASVisualizationSelfTests(): {
  passed: boolean;
  assertions: number;
  tests: string[];
} {
  let assertions = 0;
  const tests: string[] = [];
  const check = (cond: boolean, msg: string) => {
    assertions++;
    if (!cond) throw new Error(`ADASVisualization selftest failed: ${msg}`);
  };

  const extractor = new ADASVisualizationExtractor();
  const renderer = new ADASWorldRenderer();
  const hud = new ADASHudOverlay(null);

  // 1. Clean ordinary cruise & normal curve deceleration
  {
    const input = makeBaseInput();
    const hudState = extractor.updateHudState(input);
    const pkt = extractor.buildWorldPacket(input);
    check(hudState.visible && hudState.enabled, 'HUD edge state active');
    check(hudState.subFeatures === 'ACC · LKA', 'Compact subFeatures label');
    check(hudState.maneuverPhrase === '' && hudState.hazardText === '', 'Clean HUD during ordinary cruise');
    check(!pkt.ribbonActive && pkt.sampleCount === 0, 'Ribbon hidden during ordinary cruise');
    check(!pkt.target.active, 'No target brackets on empty cruise');

    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'DECELERATING';
    check(!extractor.buildWorldPacket(input).ribbonActive, 'Ribbon hidden on normal curve deceleration');
    tests.push('Ordinary cruise & normal curves stay clean');
  }

  // 2. Normal car-following: ribbon hidden, single target bracket + unobstructed projected distance
  {
    const input = makeBaseInput();
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'FOLLOW';
    Object.assign(input.obstacle, {
      hasLeadActor: true,
      leadActorId: 'car-1',
      leadActorKind: 'vehicle',
      leadX: 0,
      leadY: 0,
      leadZ: -38,
      leadGapM: 32.5,
      leadSpeedMps: 18,
      ttcSeconds: 8,
    });
    const hudState = extractor.updateHudState(input);
    const pkt = extractor.buildWorldPacket(input);
    check(!pkt.ribbonActive, 'Ribbon stays hidden during normal car-following');
    check(hudState.maneuverPhrase === '', 'No maneuver pill during calm follow');
    check(pkt.target.active && pkt.target.kind === 'follow', 'Single target corner bracket active during follow');
    check(hudState.targetTag.visible && hudState.targetTag.label === '33 m', `Follow distance tag shown (${hudState.targetTag.label})`);
    tests.push('Car-following shows single target & distance without ribbon');
  }

  // 3. Lane change + fade-in + exact S-curve trajectory + completion fade-out
  {
    const base3 = makeBaseInput();
    const input: ADASVisualizationInput = {
      ...base3,
      vehicle: { ...base3.vehicle, speed: 14 },
    };
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'PREPARING_LANE_CHANGE';
    Object.assign(input.plan.laneChange, {
      active: true,
      reason: 'navigation',
      direction: 'right',
      fromLaneIndex: 0,
      toLaneIndex: 1,
      phase: 'signaling',
      elapsedSeconds: 0.2,
      signalLeadSeconds: 1.8,
      durationSeconds: 3.0,
      lateralDeltaM: 3.5,
    });
    const hudState = extractor.updateHudState(input);
    const pkt = extractor.buildWorldPacket(input);
    check(pkt.ribbonActive && pkt.sampleCount > 15, 'Ribbon activates during lane-change signaling');
    check(hudState.maneuverPhrase === '准备右变道' && hudState.maneuverDirection === 'right', 'Short lane-change phrase');
    const lastIdx = (pkt.sampleCount - 1) * 3;
    check(Math.abs(pkt.points[lastIdx]! - 3.5) < 0.25, `Far end of S-curve ribbon shifts to target lane (+3.5m), got ${pkt.points[lastIdx]}`);

    renderer.applyPacket(pkt);
    for (let i = 0; i < 6; i++) renderer.update(0.06, 'DAY', input.vehicle.x, input.vehicle.z, input.vehicle.yaw);
    check((renderer.root.children[0] as { visible: boolean }).visible, 'Ribbon mesh fades in cleanly');

    // Cancel / complete -> smooth fade out
    input.plan.laneChange.active = false;
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'CRUISE';
    const donePkt = extractor.buildWorldPacket(input);
    check(!donePkt.ribbonActive, 'Completed lane change turns ribbon target off');
    renderer.applyPacket(donePkt);
    for (let i = 0; i < 12; i++) renderer.update(0.06, 'DAY', input.vehicle.x, input.vehicle.z, input.vehicle.yaw);
    check(!(renderer.root.children[0] as { visible: boolean }).visible, 'Ribbon fades out cleanly after completion');
    tests.push('Lane change S-curve trajectory & smooth fade lifecycle');
  }

  // 4. Overtaking, Turns, Ramps & Route Replan
  {
    const input = makeBaseInput();
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'LANE_CHANGING';
    Object.assign(input.plan.overtaking, {
      active: true,
      phase: 'changing_out',
      targetActorId: 'slow-1',
      originalLaneIndex: 1,
      passingLaneIndex: 0,
    });
    Object.assign(input.obstacle, {
      overtakenActorFound: true,
      overtakenActorBehindGapM: -18,
      overtakenActorX: 0,
      overtakenActorY: 0,
      overtakenActorZ: -24,
      overtakenActorWidth: 2.0,
      overtakenActorLength: 4.6,
      overtakenActorHeight: 1.55,
    });
    Object.assign(input.plan.laneChange, {
      active: true,
      reason: 'obstacle',
      direction: 'left',
      fromLaneIndex: 1,
      toLaneIndex: 0,
      phase: 'executing',
      elapsedSeconds: 1.0,
      durationSeconds: 3.0,
      lateralDeltaM: -3.5,
    });
    const otHud = extractor.updateHudState(input);
    const otPkt = extractor.buildWorldPacket(input);
    check(otPkt.ribbonActive && otPkt.trigger === 'overtaking', 'Overtaking activates ribbon');
    check(otPkt.target.active && otPkt.target.kind === 'overtake', 'Overtaking highlights target car');
    check(otHud.maneuverPhrase === '正在超车', 'Short overtaking phrase');

    // Ramp exit & Turn
    input.plan.overtaking.active = false;
    input.plan.laneChange.active = false;
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'RAMP_EXIT';
    (input.plan as { maneuver: ADASPlanSnapshot['maneuver'] }).maneuver = 'EXIT_RAMP';
    check(extractor.buildWorldPacket(input).trigger === 'ramp' && extractor.updateHudState(input).maneuverPhrase === '驶出匝道', 'Ramp exit triggers visualization');

    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'INTERSECTION';
    (input.plan as { maneuver: ADASPlanSnapshot['maneuver'] }).maneuver = 'TURN_RIGHT';
    check(extractor.buildWorldPacket(input).trigger === 'turn' && extractor.updateHudState(input).maneuverPhrase === '即将右转', 'Intersection turn triggers visualization');

    // Replan temporary pulse
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'CRUISE';
    (input.plan as { maneuver: ADASPlanSnapshot['maneuver'] }).maneuver = 'FOLLOW_LANE';
    (input.plan as { routeVersion: number }).routeVersion = 2;
    const repHud = extractor.updateHudState(input);
    const repPkt = extractor.buildWorldPacket(input);
    check(repPkt.ribbonActive && repPkt.trigger === 'replan' && repHud.maneuverPhrase === '已重规划路径', 'Route replan shows new trajectory');
    for (let i = 0; i < 60; i++) extractor.updateHudState({ ...input, dt: 0.05 });
    check(!extractor.buildWorldPacket(input).ribbonActive, 'Replan pulse expires automatically back to clean cruise');
    tests.push('Overtaking, ramps, turns, and route replan triggers');
  }

  // 5. Hazard immediate snap & restrained danger alert
  {
    const input = makeBaseInput();
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'EMERGENCY_BRAKING';
    Object.assign(input.obstacle, {
      hasLeadActor: true,
      leadActorId: 'cutin-1',
      leadX: 0,
      leadY: 0,
      leadZ: -15,
      leadGapM: 10,
      emergencyBraking: true,
    });
    const hHud = extractor.updateHudState(input);
    const hPkt = extractor.buildWorldPacket(input);
    check(hPkt.ribbonActive && hPkt.urgent && hPkt.tone === 'hazard', 'Hazard sets urgent flag and hazard tone');
    check(hHud.hazardText.includes('紧急制动') && hHud.hazardTone === 'hazard', 'Hazard notice shown only for emergency');
    renderer.applyPacket(hPkt);
    renderer.update(0.001, 'DAY', input.vehicle.x, input.vehicle.z, input.vehicle.yaw);
    check((renderer.root.children[0] as { visible: boolean }).visible, 'Hazard snaps ribbon visible immediately without fade delay');
    tests.push('Emergency braking instant update & hazard notice');
  }

  // 6. Road slope/elevation conformance & Z-fighting / mirror layer isolation
  {
    const input = makeBaseInput();
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'PREPARING_LANE_CHANGE';
    input.plan.laneChange.active = true;
    input.plan.laneChange.direction = 'left';
    input.plan.laneChange.phase = 'signaling';
    input.plan.laneChange.lateralDeltaM = -3.5;
    const mockGround = {
      getRoadHeightAt: (_x: number, z: number) => 2.0 + Math.abs(z) * 0.08,
      sampleRoadSurface: (_x: number, z: number) => ({
        height: 2.0 + Math.abs(z) * 0.08,
        normal: new Vector3(0, 0.9968, -0.0797).normalize(),
        gradient: new Vector2(0, 0.08),
        grade: 0.08,
      }),
    } as unknown as DrivingGround;
    const slopedInput: ADASVisualizationInput = { ...input, ground: mockGround };
    const sPkt = extractor.buildWorldPacket(slopedInput);
    const firstY = sPkt.points[1]!;
    const lastY = sPkt.points[(sPkt.sampleCount - 1) * 3 + 1]!;
    check(lastY > firstY + 4.0, `Ribbon conforms to upward slope (${firstY.toFixed(2)} -> ${lastY.toFixed(2)})`);
    renderer.applyPacket(sPkt);
    const ribbonMesh = renderer.root.children[0]!;
    check(ribbonMesh.layers.isEnabled(VEHICLE_RENDER_LAYERS.DEBUG) && !ribbonMesh.layers.isEnabled(VEHICLE_RENDER_LAYERS.WORLD), 'Placed on DEBUG layer so rear mirrors exclude AR overlays');
    tests.push('Road slope/elevation conformance & mirror layer isolation');
  }

  // 7. Occlusion test for projected screen target tag
  {
    const input = makeBaseInput();
    (input.status as { state: ADASStatusSnapshot['state'] }).state = 'FOLLOW';
    Object.assign(input.obstacle, {
      hasLeadActor: true,
      leadActorId: 'far-car',
      leadX: 0,
      leadY: 0,
      leadZ: -60,
      leadGapM: 54,
      leadHeight: 1.5,
    });
    const wallCollider: StaticCollider = {
      id: 'wall-blocker',
      type: 'building',
      center: { x: 0, z: -28 },
      halfWidth: 4,
      halfLength: 2,
      yaw: 0,
      corners: [],
      minHeight: 0,
      maxHeight: 5,
    };
    const clearTag = extractor.updateHudState(input).targetTag.visible;
    const blockedTag = extractor.updateHudState({ ...input, colliders: [wallCollider] }).targetTag.visible;
    check(clearTag && !blockedTag, 'Screen target tag hides when occluded by static structure');

    const closeActor: TrafficActorSnapshot = {
      id: 'blocker-bus',
      kind: 'vehicle',
      x: 0,
      y: 0,
      z: -24,
      yaw: 0,
      speed: 10,
      vx: 0,
      vz: -10,
      length: 8,
      width: 2.4,
      height: 3.4,
      confidence: 1,
      timestamp: 0,
    };
    const actorBlocked = extractor.updateHudState({ ...input, actors: [closeActor], actorCount: 1 }).targetTag.visible;
    check(!actorBlocked, 'Screen target tag hides when occluded by closer tall vehicle');
    tests.push('Target occlusion gating (static structures & closer vehicles)');
  }

  // 8. Day/Night themes + Multi-vehicle width + Multi-camera FOV/Aspect
  {
    const narrowBase = makeBaseInput();
    const narrow: ADASVisualizationInput = {
      ...narrowBase,
      vehicle: { ...narrowBase.vehicle, vehicleWidth: 1.65, vehicleLength: 3.9 },
    };
    narrow.plan.laneChange.active = true;
    narrow.plan.laneChange.phase = 'signaling';
    narrow.plan.laneChange.direction = 'left';
    narrow.plan.laneChange.lateralDeltaM = -3.2;

    const wideBase = makeBaseInput();
    const wide: ADASVisualizationInput = {
      ...wideBase,
      vehicle: { ...wideBase.vehicle, vehicleWidth: 2.3, vehicleLength: 5.4 },
    };
    wide.plan.laneChange.active = true;
    wide.plan.laneChange.phase = 'signaling';
    wide.plan.laneChange.direction = 'left';
    wide.plan.laneChange.lateralDeltaM = -3.5;

    const nPkt = extractor.buildWorldPacket(narrow);
    const wPkt = extractor.buildWorldPacket(wide);
    check(
      nPkt.widthM >= DEFAULT_ADAS_VISUALIZATION_CONFIG.ribbon.minWidthM &&
        wPkt.widthM <= DEFAULT_ADAS_VISUALIZATION_CONFIG.ribbon.maxWidthM &&
        wPkt.widthM > nPkt.widthM,
      `Ribbon width scales with vehicle dimensions (${nPkt.widthM.toFixed(2)}m < ${wPkt.widthM.toFixed(2)}m)`,
    );
    check(
      DEFAULT_ADAS_VISUALIZATION_CONFIG.themes.NIGHT.normal.fillAlpha <
        DEFAULT_ADAS_VISUALIZATION_CONFIG.themes.DAY.normal.fillAlpha,
      'Night theme dims ribbon fill opacity cleanly',
    );

    // Camera aspect/FOV adaptation check
    const ultrawideCam = new PerspectiveCamera(75, 21 / 9, 0.025, 2500);
    ultrawideCam.position.set(0.4, 1.55, -2.5);
    ultrawideCam.lookAt(0, 1.2, -50);
    ultrawideCam.updateMatrixWorld();
    ultrawideCam.updateProjectionMatrix();
    const followWid = makeBaseInput();
    (followWid.status as { state: ADASStatusSnapshot['state'] }).state = 'FOLLOW';
    Object.assign(followWid.obstacle, { hasLeadActor: true, leadActorId: 'c2', leadZ: -35, leadGapM: 30 });
    const uwHud = extractor.updateHudState({ ...followWid, camera: ultrawideCam, viewportWidth: 2560, viewportHeight: 1080 });
    check(uwHud.targetTag.visible && uwHud.targetTag.x > 1000 && uwHud.targetTag.x < 1600, 'Adapts to 21:9 FOV and eye position');
    tests.push('Day/Night dimming, vehicle width scaling, and FOV/aspect adaptation');
  }

  hud.dispose();
  renderer.dispose();
  return { passed: true, assertions, tests };
}
