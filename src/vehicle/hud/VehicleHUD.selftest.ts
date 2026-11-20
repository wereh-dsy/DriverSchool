import { Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { createStaticOBBCollider } from '../physics/CollisionSystem';
import type { VehicleRuntimeSnapshot } from '../physics';
import { VEHICLE_IDS, getVehicleDescriptor } from '../VehicleCatalog';
import { VehicleVisual } from '../visual/VehicleVisual';
import { DriverCamera } from '../../camera/DriverCamera';
import type { NavigationState } from '../../world/navigation/NavigationController';
import type {
  ADASObstacleAssessment,
  ADASPlanSnapshot,
  ADASStatusSnapshot,
  ADASTrafficRuleDecision,
  ADASVehicleState,
  TrafficActorSnapshot,
} from '../adas/ADASTypes';
import { createEmptyPathSample, createEmptyUpcomingJunction } from '../adas/ADASTypes';
import { ADASWorldRenderer } from '../adas/visualization/ADASWorldRenderer';
import { VEHICLE_RENDER_LAYERS } from '../visual/VehicleRenderLayers';
import { computeHUDPlaneCenterY } from './VehicleHUDProfile';
import { VehicleHUDSystem } from './VehicleHUDSystem';
import { WindshieldHUDPlane } from './WindshieldHUDPlane';
import type { VehicleHUDFrameInput } from './VehicleHUDTypes';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`VehicleHUD V1.1 selftest failed: ${msg}`);
}

function makeBaseStatus(): ADASStatusSnapshot {
  return {
    enabled: false,
    state: 'OFF',
    previousState: 'OFF',
    maneuver: 'FOLLOW_LANE',
    targetSpeedKmh: 0,
    speedLimitKmh: 60,
    speedLimitEstimated: false,
    currentRoadName: '滨海大道',
    currentLaneIndex: 2,
    approachLaneIndex: 0,
    approachLaneCount: 3,
    desiredTurnSignal: null,
    signalDecision: 'NONE',
    signalColor: 'none',
    leadGapM: null,
    ttcSeconds: null,
    driverSteeringOverride: false,
    driverAccelerationOverride: false,
    driverBrakeOverride: false,
    degraded: false,
    overtakingPhase: 'none',
    drivingMode: 'FREE_DRIVING',
    controlAuthority: 'SYSTEM',
    stopOrigin: 'NONE',
    requestNavReroute: false,
    collisionLocked: false,
    blockedRecoveryPhase: 'NONE',
    reverseDistanceRemainingM: 0,
    reason: '',
    performance: { avgStepMs: 0, lastStepMs: 0, lastPlannerMs: 0, lastPerceptionMs: 0, plannerUpdates: 0, perceptionUpdates: 0 },
  };
}

function makeBasePlan(): ADASPlanSnapshot {
  const samples = Array.from({ length: 80 }, () => createEmptyPathSample());
  for (let i = 0; i < 40; i++) {
    const sp = samples[i]!;
    sp.s = i * 2.5;
    sp.x = 0;
    sp.y = 0;
    sp.z = -i * 2.5;
    sp.yaw = 0;
    sp.speedLimitMps = 60 / 3.6;
  }
  return {
    valid: true,
    degraded: false,
    unavailableReason: '',
    derivedLaneGeometry: false,
    confidence: 1,
    sampleCount: 40,
    samples,
    egoSampleIndex: 0,
    egoS: 0,
    lateralOffsetM: 0,
    headingErrorRad: 0,
    currentRoadId: 'test-road',
    currentRoadName: '滨海大道',
    currentRoadType: 'urban',
    currentLaneId: 'test-road:lane:2',
    currentLaneIndex: 2,
    currentApproachLaneIndex: 0,
    currentApproachLaneCount: 3,
    currentLaneWidth: 3.5,
    leftBoundary: 'solid',
    rightBoundary: 'dashed',
    currentSpeedLimitMps: 60 / 3.6,
    speedLimitEstimated: false,
    remainingRouteDistanceM: 400,
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
      durationSeconds: 3.5,
      signalLeadSeconds: 0.7,
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
    drivingMode: 'FREE_DRIVING',
    degradationLevel: 0,
    awaitingJunctionIntent: false,
    driverPreferredTurn: null,
    activeIntent: 'NONE',
    requestNavReroute: false,
  };
}

function makeBaseObstacle(): ADASObstacleAssessment {
  const emptySide = {
    exists: true,
    boundaryCrossable: true,
    routeCompatible: true,
    safe: true,
    minGapM: Infinity,
    minTTCSeconds: Infinity,
    frontGapM: Infinity,
    frontSpeedMps: 0,
    rearGapM: Infinity,
    blockReason: '',
  };
  return {
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
    leadWidth: 0,
    leadLength: 0,
    leadHeight: 0,
    leadInCorridor: false,
    leadMotionDirection: 'none',
    leadGapM: Infinity,
    leadSpeedMps: 0,
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
    overtakenActorBehindGapM: Infinity,
    overtakenActorX: 0,
    overtakenActorY: 0,
    overtakenActorZ: 0,
    overtakenActorYaw: 0,
    overtakenActorWidth: 0,
    overtakenActorLength: 0,
    overtakenActorHeight: 0,
    overtakenActorKind: 'none',
    stopDistanceM: Infinity,
    emergencyBraking: false,
    emergencyBrakeDemand: 0,
    avoidanceRequest: 'none',
    leftLane: { ...emptySide },
    rightLane: { ...emptySide },
    reason: '',
  };
}

function makeBaseRules(): ADASTrafficRuleDecision {
  return {
    signalDecision: 'NONE',
    signalColor: 'none',
    mustStop: false,
    stopDistanceM: Infinity,
    speedLimitMps: 60 / 3.6,
    speedLimitEstimated: false,
    curveAndTurnSpeedCapMps: Infinity,
    arrivalSpeedCapMps: Infinity,
    targetSpeedMps: 60 / 3.6,
    reason: '限速',
  };
}

function makeBaseVehicle(): ADASVehicleState {
  return {
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
    throttle: 0.2,
    brake: 0,
    wheelBase: 2.75,
    vehicleWidth: 1.88,
    vehicleLength: 4.75,
    steeringConfig: getVehicleDescriptor('xiaomi-su7-max-2026').physicsConfig.steering,
    vehicleOperational: true,
    driveAvailable: true,
    forwardGear: true,
    reverseGear: false,
    neutralGear: false,
    parkingBrakeActive: false,
    autoHoldHolding: false,
    suspended: false,
    collision: { collided: false, deltaSpeedMps: 0, contacts: [] },
  };
}

function makeCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(62, 16 / 9, 0.05, 500);
  cam.position.set(0, 1.35, 0.2);
  cam.lookAt(0, 1.25, -30);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

function makeRuntimeSnap(opts: {
  speed?: number;
  gear?: string | number | null;
  selectedMode?: 'P' | 'R' | 'N' | 'D' | null;
  manualSelectionActive?: boolean;
  physGear?: number;
  fuelRange?: number;
  evRange?: number;
} = {}): VehicleRuntimeSnapshot {
  const snap = {
    speed: opts.speed ?? 15,
    gear: opts.gear ?? 'D',
    transmission: {
      type: 'AUTOMATIC',
      selectedMode: opts.selectedMode ?? 'D',
      manualSelectionActive: opts.manualSelectionActive ?? false,
      currentPhysicalGear: opts.physGear ?? 4,
      targetGear: opts.physGear ?? 4,
      shifting: false,
      shiftProgress: 0,
    },
    fuel: opts.fuelRange !== undefined ? { estimatedRangeKm: opts.fuelRange } : undefined,
    powertrain: opts.evRange !== undefined ? { ev: { estimatedRangeKm: opts.evRange } } : {},
  };
  return snap as unknown as VehicleRuntimeSnapshot;
}

export function runVehicleHUDV11SelfTests(): { passed: number; total: number; avgUpdateUs: number } {
  let checks = 0;
  const check = (cond: boolean, msg: string) => {
    assert(cond, msg);
    checks++;
  };

  const hud = new VehicleHUDSystem();
  const baseInput = (): VehicleHUDFrameInput => ({
    dt: 1 / 60,
    visible: true,
    vehicleId: 'xiaomi-su7-max-2026',
    ignitionOn: true,
    snapshot: makeRuntimeSnap({ speed: 20, selectedMode: 'D', evRange: 485 }),
    sharedSpeedLimitKmh: 60,
    navigationState: null,
    headLookYawRad: 0,
    headLookPitchRad: 0,
    bodyPitchRad: 0.01,
    bodyRollRad: -0.005,
    adasEnabled: false,
    adasStatus: makeBaseStatus(),
    adasPlan: makeBasePlan(),
    adasObstacle: makeBaseObstacle(),
    adasRules: makeBaseRules(),
    adasVehicle: makeBaseVehicle(),
    samplesApproachLane: 0,
    theme: 'DAY',
    rainIntensity: 0,
    fogIntensity: 0,
    wetness: 0,
    ground: null,
    camera: makeCamera(),
    viewportWidth: 1280,
    viewportHeight: 720,
    actors: [],
    actorCount: 0,
  });

  // 1. ADAS OFF regular HUD: displays speed, overspeed limit, actual gear, EV range; zero ADAS ON/OFF/ACC/LKA clutter
  {
    const st = hud.updateHUDState(baseInput());
    check(st.visible === true, 'Vehicle HUD visible even when ADAS is OFF');
    check(st.info.speedKmh === 72, `Expected 72 km/h, got ${st.info.speedKmh}`);
    check(st.info.speedLimitKmh === 60 && st.info.overspeed && st.info.overspeedSeverity === 'severe', 'Expected severe overspeed at 72 vs 60 limit');
    check(st.info.gearLabel === 'D', `Expected gear D, got ${st.info.gearLabel}`);
    check(st.info.rangeKind === 'ev' && st.info.rangeLabel === '485 km', `Expected EV range 485 km, got ${st.info.rangeLabel}`);
    check(st.warning === null && !st.maneuver.visible, 'No ADAS warning or maneuver clutter when ADAS is OFF');
    check(st.navigation.active === false, 'Navigation hidden when idle');

    // Verify zero ADAS ribbon when ADAS is OFF
    const pkt = hud.buildWorldPacket(baseInput());
    check(pkt.ribbonActive === false, 'Road path ribbon must remain OFF when ADAS is OFF');
  }

  // 2. Manual/Sports transmission & Hybrid + missing speed limit/range graceful '—' fallback
  {
    const inp = baseInput();
    inp.vehicleId = 'byd-qin-plus-dmi-210-2026';
    inp.sharedSpeedLimitKmh = null;
    (inp.adasPlan as { speedLimitEstimated: boolean }).speedLimitEstimated = true;
    inp.snapshot = makeRuntimeSnap({ speed: 12, selectedMode: 'D', manualSelectionActive: true, physGear: 3, fuelRange: 420, evRange: 110 });
    const st = hud.updateHUDState(inp);
    check(st.info.speedLimitKmh === null && !st.info.overspeed, 'Null speed limit when unavailable');
    check(st.info.gearLabel === 'M3', `Expected M3, got ${st.info.gearLabel}`);
    check(st.info.rangeKind === 'hybrid' && st.info.rangeLabel === '530 km', `Expected hybrid combined range 530 km, got ${st.info.rangeLabel}`);

    const noRangeInp = baseInput();
    noRangeInp.snapshot = makeRuntimeSnap({ speed: 0, selectedMode: 'P' });
    const noRangeSt = hud.updateHUDState(noRangeInp);
    check(noRangeSt.info.gearLabel === 'P' && noRangeSt.info.rangeLabel === '—', 'Expected P gear and — range when fuel/ev telemetry absent');
  }

  // 3. Compact Navigation Display during active route & junction lane guidance
  {
    const inp = baseInput();
    inp.navigationState = {
      version: 2,
      status: 'navigating',
      route: null,
      remainingDistance: 2400,
      remainingSeconds: 180,
      maneuverDistance: 214,
      instruction: '前方右转进入世纪大道',
      symbol: '↱',
      nextRoad: '世纪大道',
      waypointIndex: 0,
    } as NavigationState;
    inp.adasPlan.upcomingJunction.valid = true;
    inp.adasPlan.upcomingJunction.turnDirection = 'right';
    inp.adasPlan.upcomingJunction.approachLaneCount = 3;
    inp.adasPlan.upcomingJunction.approachLaneIndex = 2;
    inp.adasPlan.upcomingJunction.distanceToJunctionEntryM = 200;
    const st = hud.updateHUDState(inp);
    check(st.navigation.active && st.navigation.distanceText === '210 m', `Expected compact rounded nav dist 210 m, got ${st.navigation.distanceText}`);
    check(st.navigation.showLanes && st.navigation.lanes.length === 3 && st.navigation.lanes[2]!.recommended, 'Expected lane 2 recommended for right turn');
  }

  // 4. Traffic Awareness gating: ignores distant non-conflicting vehicles, highlights lead + fast rear LR approacher
  {
    const farCar: TrafficActorSnapshot = {
      id: 'far-car', kind: 'vehicle', x: 3.5, y: 0, z: -180, yaw: 0, speed: 15, vx: 0, vz: -15,
      length: 4.5, width: 1.85, height: 1.5, confidence: 1, timestamp: 0,
    };
    const leadCar: TrafficActorSnapshot = {
      id: 'lead-car', kind: 'vehicle', x: 0.1, y: 0, z: -28, yaw: 0, speed: 10, vx: 0, vz: -10,
      length: 4.5, width: 1.85, height: 1.5, confidence: 1, timestamp: 0,
    };
    const fastRearLeft: TrafficActorSnapshot = {
      id: 'rear-left-fast', kind: 'vehicle', x: -3.5, y: 0, z: 26, yaw: 0, speed: 22, vx: 0, vz: -22,
      length: 4.5, width: 1.85, height: 1.5, confidence: 1, timestamp: 0,
    };
    const inp = baseInput();
    (inp.adasVehicle as { speed: number }).speed = 16;
    (inp.adasObstacle as { hasLeadActor: boolean }).hasLeadActor = true;
    (inp.adasObstacle as { leadActorId: string }).leadActorId = 'lead-car';
    inp.actors = [farCar, leadCar, fastRearLeft];
    inp.actorCount = 3;
    const st = hud.updateHUDState(inp);
    check(st.annotations.some(a => a.id === 'lead-car' && a.slot === 'front'), 'Lead car should be annotated');
    check(st.annotations.some(a => a.id === 'rear-left-fast' && a.slot === 'LR' && (a.tone === 'caution' || a.tone === 'hazard')), 'Fast rear-left approacher should get amber/red LR warning annotation');
    check(!st.annotations.some(a => a.id === 'far-car'), 'Distant unrelated car must NOT clutter HUD');
  }

  // 5. Static roadway obstacles + Occlusion test
  {
    const cone: TrafficActorSnapshot = {
      id: 'cone-1', kind: 'static-obstacle', x: 0.4, y: 0, z: -22, yaw: 0, speed: 0, vx: 0, vz: 0,
      length: 0.5, width: 0.5, height: 0.75, confidence: 1, timestamp: 0, isStatic: true,
    };
    const behindWallCone: TrafficActorSnapshot = {
      id: 'cone-occluded', kind: 'static-obstacle', x: 0.2, y: 0, z: -55, yaw: 0, speed: 0, vx: 0, vz: 0,
      length: 0.5, width: 0.5, height: 0.75, confidence: 1, timestamp: 0, isStatic: true,
    };
    const wallCollider = createStaticOBBCollider({
      id: 'opaque-truck-wall', type: 'wall', x: 0.2, z: -38, width: 4, length: 2, minHeight: 0, maxHeight: 2.5,
    });
    const inp = baseInput();
    inp.actors = [cone, behindWallCone];
    inp.actorCount = 2;
    inp.colliders = [wallCollider];
    const st = hud.updateHUDState(inp);
    check(st.annotations.some(a => a.id === 'cone-1' && a.shortTag.includes('锥桶')), 'Visible static cone must be annotated');
    check(!st.annotations.some(a => a.id === 'cone-occluded'), 'Occluded target behind collider must be hidden');
  }

  // 6. Pedestrian prediction: moving crossing pedestrian produces ground trajectory & conflict risk; static uncertain does not fabricate line
  {
    const movingPed: TrafficActorSnapshot = {
      id: 'ped-crossing', kind: 'pedestrian', x: -3.2, y: 0, z: -24, yaw: Math.PI * 0.5, speed: 2.1, vx: 2.1, vz: 0,
      length: 0.6, width: 0.6, height: 1.72, confidence: 0.92, timestamp: 0,
    };
    const uncertainStaticPed: TrafficActorSnapshot = {
      id: 'ped-static', kind: 'pedestrian', x: 6.0, y: 0, z: -30, yaw: 0, speed: 0.05, vx: 0.05, vz: 0,
      length: 0.6, width: 0.6, height: 1.72, confidence: 0.25, timestamp: 0, isStatic: true,
    };
    const inp = baseInput();
    inp.actors = [movingPed, uncertainStaticPed];
    inp.actorCount = 2;
    const st = hud.updateHUDState(inp);
    const crossingTraj = st.pedestrianTrajectories.find(t => t.actorId === 'ped-crossing');
    check(crossingTraj !== undefined && crossingTraj.moving && crossingTraj.hasConflict && crossingTraj.points.length >= 6, 'Moving crossing pedestrian must emit trajectory with conflict detection');
    check(!st.pedestrianTrajectories.some(t => t.actorId === 'ped-static'), 'Stationary/uncertain pedestrian must NOT fabricate trajectory line');

    const pkt = hud.buildWorldPacket(inp);
    check(Boolean(pkt.pedestrianPaths && pkt.pedestrianPaths.length === 1 && pkt.pedestrianPaths[0]!.hasConflict), 'World packet must carry pedestrian prediction trajectory');
  }

  // 7. World Renderer integration (V1.3): verify vehicle ground marks, static obstacle footprint, pedestrian ring/trail, & world callouts stay on DEBUG layer
  {
    const wr = new ADASWorldRenderer();
    const inp = baseInput();
    inp.adasEnabled = true;
    (inp.adasStatus as { enabled: boolean }).enabled = true;
    (inp.adasStatus as { state: ADASStatusSnapshot['state'] }).state = 'LANE_CHANGING';
    inp.adasPlan.laneChange.active = true;
    inp.adasPlan.laneChange.direction = 'left';
    inp.actors = [
      { id: 'v-lead', kind: 'vehicle', x: 0, y: 0, z: -26, yaw: 0, speed: 12, vx: 0, vz: -12, length: 4.5, width: 1.85, height: 1.5, confidence: 1, timestamp: 0 },
      { id: 'obs-cone', kind: 'static-obstacle', x: 0.3, y: 0, z: -18, yaw: 0, speed: 0, vx: 0, vz: 0, length: 0.6, width: 0.6, height: 0.75, confidence: 1, timestamp: 0, isStatic: true },
      { id: 'ped-1', kind: 'pedestrian', x: -2.6, y: 0, z: -20, yaw: 0, speed: 1.8, vx: 1.8, vz: 0, length: 0.6, width: 0.6, height: 1.7, confidence: 0.9, timestamp: 0 },
    ];
    inp.actorCount = 3;
    hud.updateHUDState(inp);
    const pkt = hud.buildWorldPacket(inp);
    check(pkt.ribbonActive === true, 'Ribbon active during ADAS lane change');
    check(pkt.target.category === 'lead', 'Lead target category populated');
    check(Boolean(pkt.extraTargets?.some(t => t.category === 'static-obstacle') && pkt.extraTargets?.some(t => t.category === 'pedestrian')), 'Extra world targets carry static-obstacle and pedestrian categories');
    wr.applyPacket(pkt);
    wr.update(0.2, 'DAY', 0, 0, 0);
    check(wr.root.layers.mask === (1 << VEHICLE_RENDER_LAYERS.DEBUG), 'ADASWorldRenderer stays isolated on DEBUG layer (mirrors clean)');
    wr.dispose();
  }

  // 8. Calm cruise with ADAS ON keeps road ribbon hidden; Day/Night/Rain themes & all 18 vehicle profiles stay valid
  {
    const calmInp = baseInput();
    calmInp.adasEnabled = true;
    (calmInp.adasStatus as { enabled: boolean }).enabled = true;
    (calmInp.adasStatus as { state: ADASStatusSnapshot['state'] }).state = 'CRUISE';
    const calmPkt = hud.buildWorldPacket(calmInp);
    check(calmPkt.ribbonActive === false, 'Ribbon must stay hidden during calm cruise');

    for (const vid of VEHICLE_IDS) {
      calmInp.vehicleId = vid;
      const st = hud.updateHUDState(calmInp);
      const p = st.profile;
      check(
        p.vehicleId === vid &&
          st.opticalScale > 0.7 &&
          p.virtualDistanceM >= 2.0 &&
          p.planeHeightM >= 0.09 &&
          p.minCenterYM <= p.defaultCenterYM &&
          p.defaultCenterYM <= p.maxCenterYM,
        `Invalid HUD 3D virtual plane profile for ${vid}`,
      );
    }

    calmInp.theme = 'NIGHT';
    calmInp.rainIntensity = 0.85;
    const nightRain = hud.updateHUDState(calmInp);
    check(nightRain.palette.time === 'NIGHT' && nightRain.palette.highContrastWeather, 'Night rain theme must elevate contrast cleanly');
  }

  // 8b. V1.3 3D Virtual-Imaging Windshield HUD (A6L calibration + all vehicles cockpit clearance, head-look invariance, height -5..+5)
  {
    const needsDoc = typeof document === 'undefined';
    if (needsDoc) {
      const ctxProxy = new Proxy({} as CanvasRenderingContext2D, {
        get: (_target, key: string) =>
          key === 'measureText'
            ? (value: string) => ({ width: value.length * 12 })
            : key.startsWith('create')
              ? () => ({ addColorStop: () => {} })
              : () => {},
        set: () => true,
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { createElement: () => ({ width: 1, height: 1, getContext: () => ctxProxy }) },
      });
    }
    try {
      const a6lCfg = getVehicleDescriptor('executive-lwb-2t').visualConfig;
      const a6lVisual = new VehicleVisual(a6lCfg);
      const hudPlane = new WindshieldHUDPlane();
      hudPlane.attachToVehicle(a6lVisual.root, 'executive-lwb-2t');
      a6lVisual.root.updateMatrixWorld(true);

      check(hudPlane.mesh.layers.mask === (1 << VEHICLE_RENDER_LAYERS.INTERIOR), 'WindshieldHUDPlane must sit strictly on INTERIOR layer (hidden from mirrors & exterior cam)');
      check(hudPlane.mesh.parent === a6lVisual.root, 'WindshieldHUDPlane must be bound to vehicle root coordinate space');

      const a6lInp = baseInput();
      a6lInp.vehicleId = 'executive-lwb-2t';
      a6lInp.hudHeightLevel = 0;
      const pkt0 = hud.buildWorldPacket(a6lInp);
      check(Boolean(pkt0.windshieldHud && pkt0.windshieldHud.visible), 'Packet must carry windshieldHud payload even in non-ADAS regular drive');
      hudPlane.update(pkt0.windshieldHud, true);
      const yLevel0 = hudPlane.mesh.position.y;
      const profA6L = hud.updateHUDState(a6lInp).profile;

      // Height -5..+5 adjusts 3D virtual plane Y cleanly inside windshield bounds without affecting world AR markers
      a6lInp.hudHeightLevel = -5;
      const pktMin = hud.buildWorldPacket(a6lInp);
      hudPlane.update(pktMin.windshieldHud, true);
      const yMin = hudPlane.mesh.position.y;

      a6lInp.hudHeightLevel = 5;
      const pktMax = hud.buildWorldPacket(a6lInp);
      hudPlane.update(pktMax.windshieldHud, true);
      const yMax = hudPlane.mesh.position.y;

      check(yMin < yLevel0 && yLevel0 < yMax, `HUD height levels -5..+5 must smoothly shift 3D virtual plane Y (${yMin.toFixed(3)} < ${yLevel0.toFixed(3)} < ${yMax.toFixed(3)})`);
      check(yMin >= profA6L.minCenterYM - 1e-4 && yMax <= profA6L.maxCenterYM + 1e-4, 'HUD height clamping must respect windshield bounds');
      check(pktMin.sampleCount === pkt0.sampleCount && pktMin.target.y === pkt0.target.y, 'HUD height adjustment must NOT move world-space path/target markers');

      // Raycast sightline clearance check on A6L: eye -> virtual HUD center/lower/upper must not hit opaque cabin/hood meshes
      a6lVisual.root.updateMatrixWorld(true);
      const opaqueMeshes: Mesh[] = [];
      a6lVisual.root.traverse((obj) => {
        if (obj instanceof Mesh && obj !== hudPlane.mesh) {
          const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          const isGlass =
            obj.userData.vehicleBodyPart === 'glass' ||
            (mat && 'transparent' in mat && mat.transparent && 'opacity' in mat && (mat.opacity as number) < 0.7);
          if (!isGlass) opaqueMeshes.push(obj);
        }
      });
      const eyeVec = new Vector3(...a6lCfg.driverEyePosition);
      const ray = new Raycaster();
      for (const lvl of [-5, 0, 5] as const) {
        const cy = computeHUDPlaneCenterY(profA6L, lvl);
        for (const [dx, dy] of [[0, 0], [-0.14, 0], [0.14, 0], [0, -0.055], [0, 0.055]] as const) {
          const targetPt = new Vector3(profA6L.centerXM + dx, cy + dy, profA6L.centerZM);
          const dir = targetPt.clone().sub(eyeVec);
          const distToHud = dir.length();
          ray.set(eyeVec, dir.normalize());
          ray.near = 0.05;
          ray.far = distToHud - 0.02;
          const hits = ray.intersectObjects(opaqueMeshes, false);
          check(hits.length === 0, `A6L sightline ray blocked at level=${lvl} offset=(${dx},${dy}) by ${hits[0]?.object.name ?? 'mesh'}`);
        }
      }

      // Head rotation check: rotating DriverCamera 55 deg right keeps plane attached to vehicle forward axis (leaves center FOV naturally)
      const dCam = new DriverCamera({ driverEyePosition: a6lCfg.driverEyePosition, aspect: 16 / 9, fov: 62 });
      dCam.setHeadLookTarget(-0.95, 0);
      dCam.update(a6lVisual.root, 1.0);
      const ndcLookAway = hudPlane.mesh.position.clone().project(dCam.camera);
      check(Math.abs(ndcLookAway.x) > 0.85, `Turning head sideways must naturally shift 3D HUD out of central view (ndcX=${ndcLookAway.x.toFixed(2)})`);

      hudPlane.dispose();
      a6lVisual.dispose();
    } finally {
      if (needsDoc) delete (globalThis as Record<string, unknown>).document;
    }
  }

  // 9. Benchmark updateHUDState + buildWorldPacket overhead
  const benchInp = baseInput();
  benchInp.actors = Array.from({ length: 6 }, (_, idx) => ({
    id: `bench-${idx}`,
    kind: idx % 3 === 0 ? 'pedestrian' : 'vehicle',
    x: (idx % 2 === 0 ? -1 : 1) * 2.2,
    y: 0,
    z: -15 - idx * 8,
    yaw: 0,
    speed: idx % 3 === 0 ? 1.5 : 14,
    vx: idx % 3 === 0 ? 1.2 : 0,
    vz: idx % 3 === 0 ? 0 : -14,
    length: 4,
    width: 1.8,
    height: 1.5,
    confidence: 0.9,
    timestamp: 0,
  }));
  benchInp.actorCount = benchInp.actors.length;
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) {
    hud.updateHUDState(benchInp);
    hud.buildWorldPacket(benchInp);
  }
  const avgUpdateUs = ((performance.now() - t0) / 600) * 1000;
  check(avgUpdateUs < 350, `HUD per-frame CPU budget exceeded: ${avgUpdateUs.toFixed(1)} us`);

  return { passed: checks, total: checks, avgUpdateUs: +avgUpdateUs.toFixed(1) };
}
