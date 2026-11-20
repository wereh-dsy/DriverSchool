import type { VehicleInputState } from '../../input/VehicleInputState';
import { DriverOverrideController } from './DriverOverrideController';
import { ExceptionRecoveryController, type ExceptionControlDirectives } from './ExceptionRecoveryController';
import { LaneFollowingController } from './LaneFollowingController';
import { LocalTrajectoryPlanner } from './LocalTrajectoryPlanner';
import { ObstacleAvoidanceController } from './ObstacleAvoidanceController';
import { RouteLanePlanner } from './RouteLanePlanner';
import { SpeedController } from './SpeedController';
import { TrafficRuleController } from './TrafficRuleController';
import { VehicleControlAdapter, type ActiveTurnLampState } from './VehicleControlAdapter';
import {
  clampADAS,
  createEmptyBrakeAttribution,
  DEFAULT_ADAS_CONFIG,
  type ADASBrakeAttribution,
  type ADASConfig,
  type ADASDriverInputSnapshot,
  type ADASPerformanceMetrics,
  type ADASState,
  type ADASStatusSnapshot,
  type ADASStopOrigin,
  type ADASVehicleState,
  type ADASWorldContext,
  type TrafficActorProvider,
  type TurnSignalRequest,
} from './ADASTypes';

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Independent ADAS V1 Navigation-Assisted Driving Controller.
 * Coordinates multi-rate planning (10 Hz), perception & traffic rules (20 Hz),
 * and lightweight 120 Hz lateral/longitudinal/safety control & driver arbitration.
 * Never mutates vehicle dynamics parameters or map/loading systems.
 */
export class ADASController {
  public readonly config: ADASConfig;
  public readonly planner = new RouteLanePlanner();
  public readonly localPlanner = new LocalTrajectoryPlanner();
  public readonly trafficRules = new TrafficRuleController();
  public readonly obstacleAvoidance = new ObstacleAvoidanceController();
  public readonly driverOverride = new DriverOverrideController();
  public readonly exceptionRecovery = new ExceptionRecoveryController();
  public readonly laneFollower = new LaneFollowingController();
  public readonly speedController = new SpeedController();
  public readonly controlAdapter = new VehicleControlAdapter();

  private enabled = false;
  private state: ADASState = 'OFF';
  private previousState: ADASState = 'OFF';
  private stateDwellTime = 0;
  private initElapsed = 0;
  private plannerTimer = Infinity;
  private perceptionTimer = Infinity;
  private externalActorProvider?: TrafficActorProvider;
  private lastRouteVersion = -1;
  private activeOvertakeCeilingMps = Infinity;
  private prevManualSignalSeen: TurnSignalRequest = null;
  private activeStopOrigin: ADASStopOrigin = 'NONE';

  // Pre-allocated scratch structs (zero 120 Hz heap allocations)
  private readonly driverSnapshot: ADASDriverInputSnapshot = {
    steering: 0,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    leftIndicatorEdge: false,
    rightIndicatorEdge: false,
    hazardEdge: false,
    leftSignalActive: false,
    rightSignalActive: false,
    hazardActive: false,
    adasToggleEdge: false,
  };

  private readonly perf: ADASPerformanceMetrics = {
    lastStepMs: 0,
    avgStepMs: 0,
    lastPlannerMs: 0,
    lastPerceptionMs: 0,
    plannerUpdates: 0,
    perceptionUpdates: 0,
  };

  private readonly brakeAttribution: ADASBrakeAttribution = createEmptyBrakeAttribution();

  public readonly status: ADASStatusSnapshot = {
    enabled: false,
    state: 'OFF',
    previousState: 'OFF',
    maneuver: 'FOLLOW_LANE',
    targetSpeedKmh: 0,
    speedLimitKmh: 0,
    speedLimitEstimated: false,
    currentRoadName: '',
    currentLaneIndex: 0,
    approachLaneIndex: 0,
    approachLaneCount: 1,
    desiredTurnSignal: null,
    signalDecision: 'NONE',
    signalColor: 'none',
    leadGapM: null,
    ttcSeconds: null,
    driverSteeringOverride: false,
    driverAccelerationOverride: false,
    driverBrakeOverride: false,
    degraded: false,
    brakeAttribution: this.brakeAttribution,
    collisionLocked: false,
    collisionTargetLabel: '',
    hazardRequested: false,
    blockedRecoveryPhase: 'NONE',
    reverseDistanceRemainingM: 0,
    drivingMode: 'NAVIGATION',
    controlAuthority: 'SYSTEM',
    driverIntent: 'NONE',
    stopOrigin: 'NONE',
    requestNavReroute: false,
    reason: '',
    performance: this.perf,
  };

  public constructor(config: Partial<ADASConfig> = {}) {
    this.config = {
      ...DEFAULT_ADAS_CONFIG,
      ...config,
      defaultSpeedLimitKmh: {
        ...DEFAULT_ADAS_CONFIG.defaultSpeedLimitKmh,
        ...config.defaultSpeedLimitKmh,
      },
    };
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public get currentState(): ADASState {
    return this.state;
  }

  /** True whenever ADAS is actively issuing vehicle steering or longitudinal commands. */
  public get isControlling(): boolean {
    return (
      this.enabled &&
      this.state !== 'OFF' &&
      this.state !== 'UNAVAILABLE' &&
      this.state !== 'INITIALIZING' &&
      this.state !== 'COLLISION_HANDOVER'
    );
  }

  /** True whenever ADAS is actively executing a maneuver that should suppress navigation rerouting. */
  public get isManeuvering(): boolean {
    return (
      this.planner.snapshot.driverPreferredTurn !== null ||
      this.planner.snapshot.requestNavReroute === true ||
      this.state === 'LANE_CHANGE' ||
      this.state === 'PREPARING_LANE_CHANGE' ||
      this.state === 'LANE_CHANGING' ||
      this.state === 'AVOIDANCE' ||
      this.state === 'INTERSECTION' ||
      this.state === 'RAMP_ENTRY' ||
      this.state === 'RAMP_EXIT' ||
      this.state === 'ROAD_BLOCKED' ||
      this.state === 'UNMARKED_ROAD' ||
      this.state === 'BLOCKED_REVERSE' ||
      this.state === 'BLOCKED_REVERSE_STOP' ||
      this.state === 'BLOCKED_FORWARD_AVOIDANCE'
    );
  }

  /** Plug-in hook for future AI traffic actor providers. */
  public setTrafficActorProvider(provider: TrafficActorProvider | undefined): void {
    this.externalActorProvider = provider;
  }

  public toggle(currentThrottle = 0): boolean {
    this.setEnabled(!this.enabled, currentThrottle);
    return this.enabled;
  }

  public setEnabled(enabled: boolean, currentThrottle = 0): void {
    // Do not allow canceling mandatory collision stop/park sequence until COLLISION_HANDOVER completes
    if (this.exceptionRecovery.isCollisionStopHoldInProgress) {
      return;
    }
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.exceptionRecovery.clearCollisionLockOnDriverEnable();
      this.transitionTo('INITIALIZING');
      this.initElapsed = 0;
      this.plannerTimer = Infinity;
      this.perceptionTimer = Infinity;
      this.activeOvertakeCeilingMps = Infinity;
      this.driverOverride.reset();
      this.laneFollower.reset();
      this.speedController.reset();
      this.speedController.syncBumpless(currentThrottle);
      this.trafficRules.reset();
      this.obstacleAvoidance.reset();
      this.localPlanner.reset();
      this.planner.reset();
      this.status.enabled = true;
      this.status.collisionLocked = false;
      this.status.collisionTargetLabel = '';
      this.status.hazardRequested = false;
      this.status.blockedRecoveryPhase = 'NONE';
      this.status.reverseDistanceRemainingM = 0;
      this.status.reason = '正在初始化 ADAS...';
    } else {
      this.transitionTo('OFF');
      this.planner.reset();
      this.localPlanner.reset();
      this.trafficRules.reset();
      this.obstacleAvoidance.reset();
      this.driverOverride.reset();
      this.laneFollower.reset();
      this.speedController.reset();
      this.exceptionRecovery.resetBlockedOnly();
      this.resetBrakeAttribution();
      this.status.enabled = false;
      this.status.reason = '';
    }
  }

  /** Full reset (vehicle change, map change, respawn, menu exit). */
  public reset(): void {
    this.enabled = false;
    this.transitionTo('OFF');
    this.initElapsed = 0;
    this.plannerTimer = Infinity;
    this.perceptionTimer = Infinity;
    this.lastRouteVersion = -1;
    this.activeOvertakeCeilingMps = Infinity;
    this.prevManualSignalSeen = null;
    this.activeStopOrigin = 'NONE';
    this.planner.reset();
    this.localPlanner.reset();
    this.trafficRules.reset();
    this.obstacleAvoidance.reset();
    this.driverOverride.reset();
    this.exceptionRecovery.resetAll();
    this.laneFollower.reset();
    this.speedController.reset();
    this.controlAdapter.reset();
    this.resetBrakeAttribution();
    this.status.enabled = false;
    this.status.collisionLocked = false;
    this.status.collisionTargetLabel = '';
    this.status.hazardRequested = false;
    this.status.blockedRecoveryPhase = 'NONE';
    this.status.reverseDistanceRemainingM = 0;
    this.status.reason = '';
  }

  /**
   * 120 Hz fixed-step update.
   * Returns a VehicleInputState routed through the normal VehicleDynamics / Lighting pipeline.
   */
  public step(
    dt: number,
    driverInput: Readonly<VehicleInputState>,
    vehicle: Readonly<ADASVehicleState>,
    world: ADASWorldContext,
    lamps: Readonly<ActiveTurnLampState>,
  ): VehicleInputState {
    const stepStart = nowMs();
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 120;

    // Consume ADAS long-press Y toggle edge cleanly
    if (driverInput.adasToggle === true) {
      this.toggle(vehicle.throttle);
    }

    // Populate pre-allocated driver snapshot
    const ds = this.driverSnapshot;
    ds.steering = driverInput.steering;
    ds.throttle = driverInput.throttle;
    ds.brake = driverInput.brake;
    ds.handbrake = driverInput.handbrake;
    ds.leftIndicatorEdge = driverInput.leftIndicator;
    ds.rightIndicatorEdge = driverInput.rightIndicator;
    ds.hazardEdge = driverInput.hazard;
    ds.leftSignalActive = lamps.leftSignalActive;
    ds.rightSignalActive = lamps.rightSignalActive;
    ds.hazardActive = lamps.hazardActive;
    ds.adasToggleEdge = driverInput.adasToggle === true;

    if (!this.enabled) {
      if (this.exceptionRecovery.isCollisionLocked) {
        const label = this.exceptionRecovery.currentCollisionTargetLabel;
        const lockReason =
          this.exceptionRecovery.directives.reason ||
          (label
            ? `碰撞停车（${label}）· 双闪开启 · ADAS 已解除，请接管`
            : '碰撞停车 · 双闪开启 · ADAS 已解除，请接管');
        this.transitionTo('COLLISION_HANDOVER');
        this.syncStatus('COLLISION_HANDOVER', lockReason);
      } else {
        const keepAbortReason = this.state === 'OFF' && this.status.reason.includes('驾驶员已接管');
        this.transitionTo('OFF');
        this.syncStatus('OFF', keepAbortReason ? this.status.reason : '');
      }
      return this.controlAdapter.apply(
        driverInput,
        false,
        this.laneFollower.command,
        this.speedController.command,
        this.driverOverride.state,
        null,
        lamps,
        false,
      );
    }

    // 0. Highest priority: physical collision response overrides all normal ADAS & recovery states
    const collisionDir = this.exceptionRecovery.stepCollision(safeDt, this.enabled, vehicle);
    if (collisionDir.active) {
      this.planner.reset();
      this.laneFollower.reset();
      this.speedController.reset();
      if (collisionDir.shouldLockDisableAdas) {
        this.enabled = false;
        this.trafficRules.reset();
        this.obstacleAvoidance.reset();
        this.driverOverride.reset();
        this.resetBrakeAttribution();
        this.transitionTo('COLLISION_HANDOVER');
        this.syncStatus('COLLISION_HANDOVER', collisionDir.reason);
        this.recordPerf(stepStart);
        return this.controlAdapter.apply(
          driverInput,
          false,
          this.laneFollower.command,
          this.speedController.command,
          this.driverOverride.state,
          null,
          lamps,
          false,
          collisionDir,
        );
      }

      const colState = collisionDir.state as ADASState;
      this.transitionTo(colState);
      this.syncStatus(colState, collisionDir.reason, collisionDir);
      this.recordPerf(stepStart);
      return this.controlAdapter.apply(
        driverInput,
        true,
        this.laneFollower.command,
        this.speedController.command,
        this.driverOverride.state,
        null,
        lamps,
        true,
        collisionDir,
      );
    }

    this.exceptionRecovery.recordBreadcrumb(vehicle);

    // Attach registered external AI actor provider if world didn't specify one directly
    const effectiveWorld =
      world.trafficActorProvider || !this.externalActorProvider
        ? world
        : this.attachProvider(world);

    // 1. Validate inputs, vehicle eligibility, and data freshness (never steer blindly on bad/stale data)
    const hardGateError = this.validateHardGates(driverInput, vehicle, effectiveWorld);
    if (hardGateError !== null) {
      this.transitionTo('UNAVAILABLE');
      this.laneFollower.reset();
      this.speedController.reset();
      this.syncStatus('UNAVAILABLE', hardGateError);
      this.recordPerf(stepStart);
      return this.controlAdapter.apply(
        driverInput,
        false,
        this.laneFollower.command,
        this.speedController.command,
        this.driverOverride.state,
        null,
        lamps,
        false,
      );
    }

    // 2. Multi-rate scheduling: Planner (~10 Hz) and Perception/Rules (~20 Hz)
    const plannerInterval = 1 / Math.max(2, this.config.plannerHz);
    const perceptionInterval = 1 / Math.max(5, this.config.perceptionHz);
    this.plannerTimer += safeDt;
    this.perceptionTimer += safeDt;

    const navVersion = effectiveWorld.navigationState?.version ?? -1;
    const routeChanged = navVersion !== this.lastRouteVersion;
    const forceInit = this.state === 'INITIALIZING' && this.initElapsed === 0;
    const manualSignalIntent = this.driverOverride.updateSignalIntent(ds, this.controlAdapter.ownedTurnSignal);
    const manualSignalChanged = manualSignalIntent !== this.prevManualSignalSeen;
    this.prevManualSignalSeen = manualSignalIntent;

    // Step lane-change & continuous local trajectory S-curves at 120 Hz
    if (this.planner.snapshot.valid) {
      this.planner.stepLaneChangeClock(safeDt, vehicle, this.obstacleAvoidance.assessment);
      this.localPlanner.stepClock(safeDt, vehicle, this.planner.snapshot);
    }

    // Run planner at 10 Hz (or immediately on init / route change / manual signal / steering release)
    let plannerRan = false;
    if (forceInit || routeChanged || manualSignalChanged || this.driverOverride.state.steeringJustReleased || this.plannerTimer >= plannerInterval) {
      const t0 = nowMs();
      const plannerDt = this.plannerTimer === Infinity ? plannerInterval : this.plannerTimer;
      this.plannerTimer = 0;
      this.lastRouteVersion = navVersion;
      this.planner.update(
        plannerDt,
        vehicle,
        effectiveWorld,
        this.config,
        this.obstacleAvoidance.assessment,
        this.driverOverride.state.steeringOverride,
        manualSignalIntent,
      );
      this.perf.lastPlannerMs = nowMs() - t0;
      this.perf.plannerUpdates++;
      plannerRan = true;
    }

    const plan = this.planner.snapshot;

    // Run perception, continuous local corridor planner & traffic rules at 20 Hz
    if (forceInit || plannerRan || this.perceptionTimer >= perceptionInterval) {
      const t0 = nowMs();
      const percDt = this.perceptionTimer === Infinity ? perceptionInterval : this.perceptionTimer;
      this.perceptionTimer = 0;
      this.obstacleAvoidance.collectPerceptionAndAdjacent(vehicle, effectiveWorld, plan, this.config);
      this.localPlanner.update(
        percDt,
        vehicle,
        plan,
        this.obstacleAvoidance.perception.actors,
        this.obstacleAvoidance.perception.count,
        effectiveWorld,
        this.config,
        this.driverOverride.state.steeringOverride,
        manualSignalIntent,
        this.obstacleAvoidance.assessment.leftLane,
        this.obstacleAvoidance.assessment.rightLane,
      );
      this.localPlanner.stepClock(0, vehicle, plan);
      this.obstacleAvoidance.evaluateCorridorAndAEB(vehicle, effectiveWorld, plan, this.config);
      this.trafficRules.update(percDt, vehicle, effectiveWorld, plan, this.obstacleAvoidance.assessment, this.config);
      this.perf.lastPerceptionMs = nowMs() - t0;
      this.perf.perceptionUpdates++;
    } else {
      // Fast 120 Hz AEB kinematic check between perception updates
      this.obstacleAvoidance.updateFastSafetyCheck(safeDt, vehicle, this.config);
    }

    const obstacle = this.obstacleAvoidance.assessment;
    const rules = this.trafficRules.decision;

    // 3. Check plan validity (if degraded fallback exhausted while moving, apply controlled SAFE_STOP braking rather than blind coasting)
    if (!plan.valid) {
      const movingDegradedStop =
        plan.drivingMode === 'MAP_DEGRADED' &&
        this.previousState !== 'OFF' &&
        this.previousState !== 'INITIALIZING';
      if (movingDegradedStop) {
        this.transitionTo('SAFE_STOP');
        this.activeStopOrigin = 'DEGRADED_SAFE_STOP';
        const stopOv = this.driverOverride.update(
          safeDt,
          ds,
          vehicle,
          rules.speedLimitMps,
          0,
          obstacle.emergencyBraking,
          this.config,
          this.controlAdapter.ownedTurnSignal,
          true,
        );
        const safeStopSteer = this.laneFollower.update(safeDt, vehicle, plan, 0, 0, stopOv.steeringBlend, false, 0);
        const safeStopSpeed = this.speedController.update(
          safeDt,
          vehicle,
          0,
          !stopOv.accelerationOverride,
          0,
          obstacle.emergencyBraking,
          obstacle.emergencyBrakeDemand,
          stopOv.brakeOverride,
          stopOv.accelerationOverride,
          true,
          this.config,
        );
        this.syncStatus('SAFE_STOP', plan.unavailableReason || '地图/定位信息不足 · 安全停车，请接管');
        this.recordPerf(stepStart);
        return this.controlAdapter.apply(
          driverInput,
          true,
          safeStopSteer,
          safeStopSpeed,
          stopOv,
          null,
          lamps,
          obstacle.emergencyBraking,
        );
      }

      this.transitionTo('UNAVAILABLE');
      this.activeStopOrigin = 'NONE';
      this.laneFollower.reset();
      this.speedController.reset();
      this.syncStatus('UNAVAILABLE', plan.unavailableReason || '导航路径不可用');
      this.recordPerf(stepStart);
      return this.controlAdapter.apply(
        driverInput,
        false,
        this.laneFollower.command,
        this.speedController.command,
        this.driverOverride.state,
        null,
        lamps,
        false,
      );
    }

    // 4. Advance INITIALIZING briefly to ensure clean first-frame sensor + planner lock
    if (this.state === 'INITIALIZING') {
      this.initElapsed += safeDt;
      if (this.initElapsed < 0.05) {
        this.syncStatus('INITIALIZING', '正在锁定车道与交通状态');
        this.recordPerf(stepStart);
        return this.controlAdapter.apply(
          driverInput,
          false,
          this.laneFollower.command,
          this.speedController.command,
          this.driverOverride.state,
          null,
          lamps,
          false,
        );
      }
    }

    // 5. Compute combined automatic target speed & stop requirement
    // Arbitrate longitudinal overtaking/evasion speed without letting departed-lane slow obstacles prematurely drag speed down
    const overtakingBoostActive =
      !obstacle.emergencyBraking &&
      !rules.mustStop &&
      !plan.inJunction &&
      !plan.nearJunctionSolidZone &&
      ((plan.overtaking.active &&
        (plan.overtaking.phase === 'preparing' ||
          plan.overtaking.phase === 'changing_out' ||
          plan.overtaking.phase === 'passing')) ||
        (obstacle.overtakeRecommended && obstacle.canEvadeWithoutStopping));

    const rawOvertakeSpeed = overtakingBoostActive
      ? this.computeOvertakeTargetSpeedMps(vehicle, plan, rules, obstacle, effectiveWorld)
      : rules.targetSpeedMps;
    if (overtakingBoostActive) {
      this.activeOvertakeCeilingMps = rawOvertakeSpeed;
    } else if (Number.isFinite(this.activeOvertakeCeilingMps)) {
      this.activeOvertakeCeilingMps = Math.max(rules.targetSpeedMps, this.activeOvertakeCeilingMps - 1.0 * safeDt);
      if (this.activeOvertakeCeilingMps <= rules.targetSpeedMps + 0.05) {
        this.activeOvertakeCeilingMps = Infinity;
      }
    }
    const curveLimitActive = rules.curveAndTurnSpeedCapMps < rules.speedLimitMps - 0.5;
    const overtakeSpeedMps =
      overtakingBoostActive
        ? rawOvertakeSpeed
        : Number.isFinite(this.activeOvertakeCeilingMps)
          ? Math.min(
              this.activeOvertakeCeilingMps,
              curveLimitActive ? rules.curveAndTurnSpeedCapMps : Infinity,
              rules.arrivalSpeedCapMps,
              rules.mustStop ? rules.targetSpeedMps : Infinity,
            )
          : rules.targetSpeedMps;
    if (plan.overtaking.active) {
      plan.overtaking.overtakeTargetSpeedMps = overtakeSpeedMps;
    }

    const effectiveObstacleSpeed = obstacle.canEvadeWithoutStopping
      ? obstacle.avoidanceTargetSpeedMps
      : obstacle.targetSpeedMps;
    const effectiveObstacleStopDist = obstacle.canEvadeWithoutStopping
      ? Infinity
      : obstacle.stopDistanceM;

    const autoTargetSpeed = Math.min(overtakeSpeedMps, effectiveObstacleSpeed);
    const stopRequired =
      rules.mustStop ||
      (Number.isFinite(effectiveObstacleStopDist) && effectiveObstacleStopDist < 45);
    const stopDistanceM = Math.min(rules.stopDistanceM, effectiveObstacleStopDist);

    // 6. Driver override arbitration (independent lateral & longitudinal axes, driver standstill hold, turn signals)
    const priorSystemHold =
      (stopRequired && this.speedController.command.holdingStandstill && !this.driverOverride.state.driverStandstillHold) ||
      obstacle.emergencyBraking ||
      obstacle.roadBlocked;
    const override = this.driverOverride.update(
      safeDt,
      ds,
      vehicle,
      rules.speedLimitMps,
      autoTargetSpeed,
      obstacle.emergencyBraking,
      this.config,
      this.controlAdapter.ownedTurnSignal,
      priorSystemHold,
    );

    // 6b. Blocked recovery state machine (runs only after normal obstacle avoidance cannot clear close static blockage)
    const driverBlockedOverride =
      override.steeringOverride ||
      override.brakeOverride ||
      override.accelerationOverride ||
      driverInput.shiftUp ||
      driverInput.shiftDown ||
      driverInput.driveSelector !== undefined ||
      (driverInput.handbrake > 0.5 && this.exceptionRecovery.currentBlockedPhase !== 'BLOCKED_RECOVERY_FAILED');

    const blockedDir = this.exceptionRecovery.stepBlockedRecovery(
      safeDt,
      vehicle,
      effectiveWorld,
      plan,
      obstacle,
      rules,
      this.obstacleAvoidance.perception.actors,
      this.obstacleAvoidance.perception.count,
      driverBlockedOverride,
      this.config,
    );
    if (blockedDir.abortedByDriver) {
      // Immediately disarm ADAS & cancel all automated steering/throttle/brake/gear/path commands cleanly
      this.enabled = false;
      this.planner.reset();
      this.localPlanner.reset();
      this.trafficRules.reset();
      this.obstacleAvoidance.reset();
      this.laneFollower.reset();
      this.speedController.reset();
      this.resetBrakeAttribution();
      this.transitionTo('OFF');
      const takeoverMsg = '驾驶员已接管 · 自动倒车脱困已取消，请手动驾驶';
      this.syncStatus('OFF', takeoverMsg);
      this.recordPerf(stepStart);
      return this.controlAdapter.apply(
        driverInput,
        false,
        this.laneFollower.command,
        this.speedController.command,
        this.driverOverride.state,
        null,
        lamps,
        false,
      );
    }
    if (blockedDir.requestPlannerRefresh) {
      this.plannerTimer = Infinity;
    }
    if (blockedDir.active && blockedDir.overrideDriving) {
      const recState = blockedDir.state as ADASState;
      if (recState === 'BLOCKED_RECOVERY_FAILED') {
        this.planner.reset();
        this.laneFollower.reset();
        this.speedController.reset();
        this.resetBrakeAttribution();
      }
      this.stateDwellTime += safeDt;
      this.transitionTo(recState);
      this.syncStatus(recState, blockedDir.reason, blockedDir);
      this.recordPerf(stepStart);
      return this.controlAdapter.apply(
        driverInput,
        true,
        this.laneFollower.command,
        this.speedController.command,
        override,
        null,
        lamps,
        false,
        blockedDir,
      );
    }

    // 5b. Speed/Stop helper variables refreshed synchronously if driver just released manual bypass steering
    let activePlan = plan;
    let activeObstacle = obstacle;
    let activeRules = rules;
    let activeOvertakeSpeed = overtakeSpeedMps;
    let activeAutoTargetSpeed = autoTargetSpeed;
    let activeStopRequired = stopRequired;
    let activeStopDistanceM = stopDistanceM;
    let activeOvertakingBoost = overtakingBoostActive;

    // When driver finishes manual steering / lane change, immediately adopt current lane
    // and synchronously re-evaluate path + obstacles + rules on this exact step so bypassed obstacles cannot cause repeat braking.
    if (override.steeringJustReleased) {
      this.obstacleAvoidance.notifyDriverBypassReleased(effectiveWorld.simulationTime);
      this.planner.adoptCurrentLaneFromVehicle(
        vehicle,
        effectiveWorld.navigationState,
        effectiveWorld.roadNetwork ?? effectiveWorld.nearbyNetwork,
      );
      this.planner.update(
        plannerInterval,
        vehicle,
        effectiveWorld,
        this.config,
        this.obstacleAvoidance.assessment,
        false,
        manualSignalIntent,
      );
      this.localPlanner.notifyDriverSteeringReleased(vehicle, this.planner.snapshot);
      this.obstacleAvoidance.collectPerceptionAndAdjacent(vehicle, effectiveWorld, this.planner.snapshot, this.config);
      this.localPlanner.update(
        perceptionInterval,
        vehicle,
        this.planner.snapshot,
        this.obstacleAvoidance.perception.actors,
        this.obstacleAvoidance.perception.count,
        effectiveWorld,
        this.config,
        false,
        manualSignalIntent,
        this.obstacleAvoidance.assessment.leftLane,
        this.obstacleAvoidance.assessment.rightLane,
      );
      this.localPlanner.stepClock(0, vehicle, this.planner.snapshot);
      this.obstacleAvoidance.evaluateCorridorAndAEB(vehicle, effectiveWorld, this.planner.snapshot, this.config);
      this.trafficRules.update(
        perceptionInterval,
        vehicle,
        effectiveWorld,
        this.planner.snapshot,
        this.obstacleAvoidance.assessment,
        this.config,
      );
      this.plannerTimer = 0;
      this.perceptionTimer = 0;
      this.laneFollower.syncToPhysicalAngle(vehicle, driverInput.steering);

      activePlan = this.planner.snapshot;
      activeObstacle = this.obstacleAvoidance.assessment;
      activeRules = this.trafficRules.decision;
      activeOvertakingBoost = false;
      activeOvertakeSpeed = activeRules.targetSpeedMps;
      const effObsSpd = activeObstacle.canEvadeWithoutStopping
        ? activeObstacle.avoidanceTargetSpeedMps
        : activeObstacle.targetSpeedMps;
      const effObsStop = activeObstacle.canEvadeWithoutStopping ? Infinity : activeObstacle.stopDistanceM;
      activeAutoTargetSpeed = Math.min(activeOvertakeSpeed, effObsSpd);
      activeStopRequired = activeRules.mustStop || (Number.isFinite(effObsStop) && effObsStop < 45);
      activeStopDistanceM = Math.min(activeRules.stopDistanceM, effObsStop);
    }

    // Distinguish stop origin: driver standstill hold vs signal wait vs obstacle/degraded stop
    if (override.driverStandstillHold) {
      this.activeStopOrigin = 'DRIVER_STOP';
    } else if (activeObstacle.emergencyBraking || activeObstacle.roadBlocked) {
      this.activeStopOrigin = activeObstacle.roadBlocked ? 'ROAD_BLOCKED' : 'OBSTACLE';
    } else if (
      activeRules.mustStop &&
      (activeRules.signalDecision === 'STOP_RED' ||
        activeRules.signalDecision === 'STOP_AMBER' ||
        activeRules.signalDecision === 'STOP_BLOCKED_JUNCTION')
    ) {
      this.activeStopOrigin = 'TRAFFIC_SIGNAL';
    } else if (activeStopRequired) {
      this.activeStopOrigin =
        activePlan.maneuver === 'ARRIVING'
          ? 'ARRIVAL'
          : activePlan.drivingMode === 'MAP_DEGRADED'
            ? 'DEGRADED_SAFE_STOP'
            : 'OBSTACLE';
    } else {
      this.activeStopOrigin = 'NONE';
    }

    // Final target speed respects driver acceleration override, driver standstill hold, and brake reacquire dwell
    const maxCruiseOrOvertakeCeiling = Math.max(
      activeOvertakeSpeed,
      activeRules.speedLimitMps + this.config.driverOverrideMaxOverspeedMps,
    );
    let finalTargetSpeed =
      activeObstacle.emergencyBraking || override.driverStandstillHold
        ? 0
        : activeStopRequired && activeStopDistanceM < 25 && !override.accelerationOverride
          ? activeAutoTargetSpeed
          : Math.max(
              activeAutoTargetSpeed,
              Math.min(override.overrideTargetSpeedMps, maxCruiseOrOvertakeCeiling),
            );

    const effectiveStopRequired =
      override.driverStandstillHold || (activeStopRequired && !override.accelerationOverride);
    const effectiveStopDistanceM = override.driverStandstillHold ? 0 : activeStopDistanceM;

    if (
      !override.driverStandstillHold &&
      (override.brakeReacquireRemainingS ?? 0) > 0 &&
      !effectiveStopRequired &&
      !activeObstacle.emergencyBraking &&
      !override.accelerationOverride
    ) {
      // Wait for stability briefly after manual brake release before accelerating again
      finalTargetSpeed = Math.min(finalTargetSpeed, Math.max(0, vehicle.speed));
    }

    // 7. Resolve explicit ADAS State Machine state
    this.stateDwellTime += safeDt;
    const nextState = this.resolveState(activePlan, activeRules, activeObstacle, override, vehicle);
    this.transitionTo(nextState);

    // 8. 120 Hz Lateral & Longitudinal Control
    const lateralActive = !override.steeringOverride && nextState !== 'UNAVAILABLE' && nextState !== 'INITIALIZING';
    const steerCmd = this.laneFollower.update(
      safeDt,
      vehicle,
      activePlan,
      this.planner.getActiveLaneChangeLateralShift(),
      this.planner.getActiveLaneChangeHeadingShift(vehicle.speed),
      override.steeringBlend,
      lateralActive,
      this.planner.getActiveLaneChangeCurvature(vehicle.speed),
    );

    let speedProfile: import('./ADASTypes').ADASSpeedProfile = 'normal_cruise';
    if (activeObstacle.emergencyBraking) {
      speedProfile = 'emergency_aeb';
    } else if (vehicle.speed < 1.0 && finalTargetSpeed > 1.5) {
      speedProfile = 'start_from_stop';
    } else if (
      activeOvertakingBoost ||
      (activePlan.laneChange.active && activePlan.laneChange.reason === 'obstacle')
    ) {
      speedProfile = 'overtaking';
    } else if (activePlan.maneuver === 'MERGE' || nextState === 'RAMP_ENTRY') {
      speedProfile = 'highway_merge';
    } else if (nextState === 'AVOIDANCE' || (this.previousState === 'AVOIDANCE' && this.stateDwellTime < 2.0)) {
      speedProfile = 'resume_after_avoidance';
    }

    const speedCmd = this.speedController.update(
      safeDt,
      vehicle,
      finalTargetSpeed,
      effectiveStopRequired,
      effectiveStopDistanceM,
      activeObstacle.emergencyBraking,
      activeObstacle.emergencyBrakeDemand,
      override.brakeOverride,
      override.accelerationOverride,
      nextState !== 'UNAVAILABLE' && nextState !== 'INITIALIZING',
      this.config,
      speedProfile,
    );

    // 9. Arbitrate into VehicleInputState via VehicleControlAdapter
    const output = this.controlAdapter.apply(
      driverInput,
      true,
      steerCmd,
      speedCmd,
      override,
      plan.desiredTurnSignal,
      lamps,
      obstacle.emergencyBraking,
      blockedDir.active ? blockedDir : undefined,
    );

    const activeState: ADASState = blockedDir.active ? (blockedDir.state as ADASState) : nextState;
    const reason = blockedDir.active ? blockedDir.reason : this.resolveReason(nextState, plan, rules, obstacle, override);
    this.updateBrakeAttribution(
      vehicle,
      plan,
      rules,
      obstacle,
      finalTargetSpeed,
      effectiveObstacleSpeed,
      speedCmd.desiredAccelMps2,
      speedCmd.brake,
    );
    this.syncStatus(activeState, reason, blockedDir.active ? blockedDir : undefined);
    this.recordPerf(stepStart);
    return output;
  }

  private readonly worldWithProvider: ADASWorldContext = {
    navigationState: null,
    roadNetwork: undefined,
    nearbyNetwork: undefined,
    trafficSignals: undefined,
    simulationTime: 0,
  };

  private attachProvider(world: ADASWorldContext): ADASWorldContext {
    const dst = this.worldWithProvider;
    dst.navigationState = world.navigationState;
    dst.roadNetwork = world.roadNetwork;
    dst.nearbyNetwork = world.nearbyNetwork;
    dst.trafficSignals = world.trafficSignals;
    dst.laneGraph = world.laneGraph;
    dst.getLegacyJunctionSignalColor = world.getLegacyJunctionSignalColor;
    dst.queryNearbyColliders = world.queryNearbyColliders;
    dst.trafficActors = world.trafficActors;
    dst.trafficActorProvider = this.externalActorProvider;
    dst.simulationTime = world.simulationTime;
    dst.dataTimestamp = world.dataTimestamp;
    dst.suppressNavigationReroute = world.suppressNavigationReroute;
    dst.roadGripMultiplier = world.roadGripMultiplier;
    dst.wetness = world.wetness;
    dst.visibilityFactor = world.visibilityFactor;
    return dst;
  }

  private computeOvertakeTargetSpeedMps(
    vehicle: ADASVehicleState,
    plan: RouteLanePlanner['snapshot'],
    rules: TrafficRuleController['decision'],
    obstacle: ObstacleAvoidanceController['assessment'],
    world: ADASWorldContext,
  ): number {
    const baseLimit = rules.speedLimitMps;
    if (
      !this.config.overtakingEnabled ||
      baseLimit < this.config.overtakingMinRoadLimitMps ||
      plan.degraded ||
      !obstacle.dataReliable
    ) {
      return rules.targetSpeedMps;
    }

    const roadGrip = clampADAS(world.roadGripMultiplier ?? 1.0, 0.45, 1.0);
    const wetness = clampADAS(world.wetness ?? 0.0, 0.0, 1.0);
    const visibility = clampADAS(world.visibilityFactor ?? 1.0, 0.3, 1.0);

    let maxAheadCurv = 0;
    const egoS = plan.egoS;
    for (let i = plan.egoSampleIndex; i < plan.sampleCount; i++) {
      const sp = plan.samples[i]!;
      const ds = sp.s - egoS;
      if (ds > 120) break;
      const absK = Math.abs(sp.curvature);
      if (absK > maxAheadCurv) maxAheadCurv = absK;
    }

    // Attenuate overspeed allowance by weather friction, visibility & upcoming curvature
    const weatherFactor = clampADAS(Math.min((roadGrip - 0.85) / 0.15, (0.35 - wetness) / 0.35), 0, 1);
    const visFactor = clampADAS((visibility - 0.75) / 0.25, 0, 1);
    const curveFactor = clampADAS(1 - (maxAheadCurv - 0.0022) / 0.0035, 0, 1);
    const envAllowRatio = Math.min(weatherFactor, visFactor, curveFactor);
    if (envAllowRatio <= 0.05) {
      return rules.targetSpeedMps;
    }

    const leadSpeed = plan.overtaking.active
      ? plan.overtaking.leadSpeedSnapshotMps
      : Number.isFinite(obstacle.leadSpeedMps)
        ? obstacle.leadSpeedMps
        : 0;
    const limitMargin = Math.max(0, baseLimit - leadSpeed);

    // Higher passing urgency when slow lead speed is close to road limit (minimizes passing exposure time)
    const passExposureUrgency =
      limitMargin < 8.5
        ? clampADAS(0.65 + (8.5 - limitMargin) * 0.04, 0.5, 1.0)
        : clampADAS(0.45 + Math.max(0, 18 - limitMargin) * 0.02, 0.35, 0.65);

    const maxBoostRatio = Math.max(1.0, this.config.aggressiveOvertakeMaxLimitRatio) - 1.0;
    const effectiveRatio = 1.0 + maxBoostRatio * envAllowRatio * passExposureUrgency;

    // Desired speed combines passing delta over lead and capped road-limit ratio; also considers current ego capability
    const boostCapSpeed = baseLimit * effectiveRatio;
    const minPassDeltaSpeed = leadSpeed + Math.max(10.0, baseLimit * 0.35);
    const desiredPassSpeed =
      envAllowRatio > 0.15
        ? Math.min(
            boostCapSpeed,
            Math.max(baseLimit * Math.min(effectiveRatio, 1.07), minPassDeltaSpeed, rules.targetSpeedMps, vehicle.speed),
          )
        : Math.max(rules.targetSpeedMps, vehicle.speed);

    const physicalCurveCap =
      maxAheadCurv > 0.0025
        ? Math.sqrt((Math.max(0.8, this.config.maxComfortLateralAccelMps2 * roadGrip)) / maxAheadCurv)
        : Infinity;
    const effectiveRuleCurveCap =
      envAllowRatio <= 0.1 || rules.curveAndTurnSpeedCapMps < baseLimit - 0.5
        ? rules.curveAndTurnSpeedCapMps
        : Infinity;

    const boundedOvertake = Math.min(
      desiredPassSpeed,
      baseLimit * effectiveRatio,
      physicalCurveCap,
      effectiveRuleCurveCap,
      rules.arrivalSpeedCapMps,
    );
    const finalSafe = rules.mustStop ? Math.min(rules.targetSpeedMps, boundedOvertake) : boundedOvertake;
    return Math.max(0, Math.min(finalSafe, baseLimit * this.config.aggressiveOvertakeMaxLimitRatio));
  }

  private validateHardGates(
    input: Readonly<VehicleInputState>,
    vehicle: Readonly<ADASVehicleState>,
    world: ADASWorldContext,
  ): string | null {
    if (
      !Number.isFinite(vehicle.x) ||
      !Number.isFinite(vehicle.y) ||
      !Number.isFinite(vehicle.z) ||
      !Number.isFinite(vehicle.yaw) ||
      !Number.isFinite(vehicle.speed) ||
      !Number.isFinite(input.steering) ||
      !Number.isFinite(input.throttle) ||
      !Number.isFinite(input.brake)
    ) {
      return '车辆或控制输入数据异常';
    }
    if (vehicle.suspended) return '仿真已暂停';
    if (!vehicle.vehicleOperational || !vehicle.driveAvailable) return '车辆动力未就绪';
    const inBlockedRecovery = this.exceptionRecovery.currentBlockedPhase !== 'NONE';
    if (!vehicle.forwardGear && !inBlockedRecovery) return '请挂入前进挡 (D)';
    if ((vehicle.parkingBrakeActive || input.handbrake > 0.05) && !inBlockedRecovery) return '驻车制动已拉起';
    if (
      world.dataTimestamp !== undefined &&
      Number.isFinite(world.dataTimestamp) &&
      world.simulationTime - world.dataTimestamp > this.config.maxDataAgeSeconds
    ) {
      return '交通/导航数据已过期';
    }
    return null;
  }

  private resolveState(
    plan: RouteLanePlanner['snapshot'],
    rules: TrafficRuleController['decision'],
    obstacle: ObstacleAvoidanceController['assessment'],
    override: DriverOverrideController['state'],
    vehicle: ADASVehicleState,
  ): ADASState {
    if (obstacle.emergencyBraking) return 'EMERGENCY_BRAKING';
    if (override.steeringOverride) return 'DRIVER_STEERING_OVERRIDE';
    if (override.accelerationOverride) return 'DRIVER_ACCELERATION_OVERRIDE';
    if (obstacle.roadBlocked) return 'ROAD_BLOCKED';

    if (!plan.valid) {
      if (this.state === 'UNMARKED_ROAD' && this.stateDwellTime < this.config.unmarkedRoadHoldDistanceM / Math.max(1, vehicle.speed)) {
        return 'UNMARKED_ROAD';
      }
      return 'SAFE_STOP';
    }

    // Lane change states
    if (plan.laneChange.active) {
      if (plan.laneChange.phase === 'signaling') return 'PREPARING_LANE_CHANGE';
      return 'LANE_CHANGING';
    }

    // Obstacle avoidance (discrete request, solid bypass, or continuous local offset dodge)
    if (
      obstacle.avoidanceRequest !== 'none' ||
      obstacle.allowSolidBypass ||
      (plan.localTrajectory?.active &&
        (plan.localTrajectory.mode === 'in_lane_offset' || plan.localTrajectory.mode === 'partial_encroach'))
    ) {
      return 'AVOIDANCE';
    }

    // Traffic signal stop
    if (
      rules.mustStop &&
      (rules.signalDecision === 'STOP_RED' ||
        rules.signalDecision === 'STOP_AMBER' ||
        rules.signalDecision === 'STOP_BLOCKED_JUNCTION')
    ) {
      return 'STOPPING_FOR_SIGNAL';
    }

    // Intersections
    if (plan.inJunction || (plan.upcomingJunction.valid && plan.upcomingJunction.distanceToStopLineM < 16)) {
      return 'INTERSECTION';
    }

    // Ramps
    const isRampRoad = plan.currentRoadId.includes('ramp') || plan.currentRoadName.includes('匝道');
    if (isRampRoad) {
      if (plan.maneuver === 'EXIT_RAMP' || plan.upcomingJunction.valid) return 'RAMP_EXIT';
      return 'RAMP_ENTRY';
    }

    // Unmarked road
    if (plan.derivedLaneGeometry || plan.leftBoundary === 'unavailable' || plan.rightBoundary === 'unavailable') {
      return 'UNMARKED_ROAD';
    }

    // Follow vs Decelerating vs Cruise
    if (
      obstacle.hasLeadActor &&
      !obstacle.leadIsStatic &&
      obstacle.leadGapM < 55 &&
      (obstacle.closingSpeedMps > -1.0 || obstacle.cutInDetected)
    ) {
      return 'FOLLOW';
    }

    const rampCapMps = rules.rampSpeedCapMps ?? Infinity;
    if (
      rules.curveAndTurnSpeedCapMps < rules.speedLimitMps - 2.0 ||
      rampCapMps < rules.speedLimitMps - 2.0 ||
      (rules.mustStop && rules.stopDistanceM < 65)
    ) {
      return 'DECELERATING';
    }

    if (plan.drivingMode === 'MAP_DEGRADED' || plan.degraded || !obstacle.dataReliable) return 'DEGRADED';
    return 'CRUISE';
  }

  private resolveReason(
    state: ADASState,
    plan: RouteLanePlanner['snapshot'],
    rules: TrafficRuleController['decision'],
    obstacle: ObstacleAvoidanceController['assessment'],
    override: DriverOverrideController['state'],
  ): string {
    if (override.driverStandstillHold) {
      return '驾驶员主动停车保持 · 踩油门起步';
    }
    if (plan.awaitingJunctionIntent && state !== 'EMERGENCY_BRAKING' && !override.steeringOverride && !override.accelerationOverride) {
      return 'T字路口请打转向灯选择方向 · 等待意图';
    }
    switch (state) {
      case 'CRUISE':
        if (plan.overtaking.active && plan.overtaking.phase === 'passing') {
          return '正在加速超越慢车 · 完成超车中';
        }
        return plan.drivingMode === 'FREE_DRIVING' ? '自由驾驶 · 车道巡航保持' : '正常巡航保持';
      case 'FOLLOW':
        return obstacle.reason || 'IDM智能跟车';
      case 'DECELERATING':
        return '前方弯道/限速提前减速';
      case 'PREPARING_LANE_CHANGE':
        if (plan.overtaking.active) {
          return plan.overtaking.phase === 'returning'
            ? '超车完成 · 打灯准备返回原车道'
            : plan.laneChange.direction === 'left'
              ? '开启左转向灯 · 准备主动超车'
              : '开启右转向灯 · 准备主动超车';
        }
        return plan.laneChange.direction === 'left' ? '开启左转向灯 · 准备变道' : '开启右转向灯 · 准备变道';
      case 'LANE_CHANGING':
        if (plan.overtaking.active) {
          return plan.overtaking.phase === 'returning'
            ? '超车完成 · 平稳返回原车道'
            : plan.laneChange.direction === 'left'
              ? '正在向左变道超车'
              : '正在向右变道超车';
        }
        return plan.laneChange.direction === 'left' ? '正在向左平稳变道' : '正在向右平稳变道';
      case 'AVOIDANCE':
        return obstacle.reason || '避障绕行中';
      case 'INTERSECTION':
        return '路口通行中 · 保持转弯轨迹';
      case 'RAMP_ENTRY':
        return '驶入高速匝道 · 控制合流车速';
      case 'RAMP_EXIT':
        return '驶出高速匝道 · 减速进入辅路';
      case 'UNMARKED_ROAD':
        return '无标线道路 · 保持道路曲率与方向';
      case 'ROAD_BLOCKED':
        return obstacle.reason || '前方道路完全阻断 · 安全停车等待';
      case 'SAFE_STOP':
        return '无法确认道路通行条件 · 平稳安全靠边停车';
      case 'EMERGENCY_BRAKING':
        return obstacle.reason || '紧急制动避险';
      case 'DRIVER_STEERING_OVERRIDE':
        return '人工转向接管（保持安全监测）';
      case 'DRIVER_ACCELERATION_OVERRIDE':
        return '人工加速接管（松开后恢复限速）';
      case 'STOPPING_FOR_SIGNAL':
        return rules.reason || '交通信号停车等待';
      case 'LANE_CHANGE':
        return plan.laneChange.direction === 'left' ? '正在向左自动变道' : '正在向右自动变道';
      case 'OBSTACLE_RESPONSE':
        return obstacle.reason || '前方障碍物减速跟车';
      case 'DEGRADED':
        return plan.derivedLaneGeometry
          ? '降级模式 · 推导车道几何（谨慎行驶）'
          : '降级模式 · 感知可靠性偏低';
      case 'ACTIVE':
        if (override.brakeOverride) return '人工制动优先';
        if (plan.maneuver === 'TURN_LEFT') return '准备左转';
        if (plan.maneuver === 'TURN_RIGHT') return '准备右转';
        if (plan.maneuver === 'UTURN') return '准备掉头';
        if (plan.maneuver === 'ARRIVING') return '即将到达目的地';
        return '导航辅助驾驶中';
      default:
        return '';
    }
  }

  private transitionTo(next: ADASState): void {
    if (next !== this.state) {
      this.previousState = this.state;
      this.state = next;
      this.stateDwellTime = 0;
    }
  }

  private syncStatus(
    state: ADASState,
    reason: string,
    exceptionDir?: Readonly<ExceptionControlDirectives>,
  ): void {
    const s = this.status;
    const plan = this.planner.snapshot;
    const rules = this.trafficRules.decision;
    const obs = this.obstacleAvoidance.assessment;
    const ov = this.driverOverride.state;

    s.enabled = this.enabled;
    s.state = state;
    s.previousState = this.previousState;
    s.maneuver = plan.maneuver;
    s.targetSpeedKmh = this.speedController.command.targetSpeedMps * 3.6;
    s.speedLimitKmh = rules.speedLimitMps * 3.6;
    s.speedLimitEstimated = rules.speedLimitEstimated;
    s.currentRoadName = plan.currentRoadName;
    s.currentLaneIndex = plan.currentLaneIndex;
    s.approachLaneIndex = plan.currentApproachLaneIndex;
    s.approachLaneCount = plan.currentApproachLaneCount;
    s.desiredTurnSignal = plan.desiredTurnSignal;
    s.signalDecision = rules.signalDecision;
    s.signalColor = rules.signalColor;
    s.leadGapM = obs.hasLeadActor && Number.isFinite(obs.leadGapM) ? obs.leadGapM : null;
    s.ttcSeconds = obs.hasLeadActor && Number.isFinite(obs.ttcSeconds) ? obs.ttcSeconds : null;
    s.leadActorId = obs.hasLeadActor ? obs.leadActorId : undefined;
    s.leadActorKind = obs.hasLeadActor ? obs.leadActorKind : undefined;
    s.leadDistanceM = obs.hasLeadActor && Number.isFinite(obs.leadGapM) ? obs.leadGapM : undefined;
    s.leadClosingSpeedKmh = obs.hasLeadActor && Number.isFinite(obs.closingSpeedMps) ? obs.closingSpeedMps * 3.6 : undefined;
    s.leadInCorridor = obs.hasLeadActor ? obs.leadInCorridor : undefined;
    s.driverSteeringOverride = ov.steeringOverride;
    s.driverAccelerationOverride = ov.accelerationOverride;
    s.driverBrakeOverride = ov.brakeOverride;
    s.degraded = state === 'DEGRADED' || state === 'UNMARKED_ROAD' || plan.degraded || plan.drivingMode === 'MAP_DEGRADED';
    s.overtakingPhase = plan.overtaking.active ? plan.overtaking.phase : 'none';
    s.brakeAttribution = this.brakeAttribution;
    s.collisionLocked = this.exceptionRecovery.isCollisionLocked;
    s.collisionTargetLabel = this.exceptionRecovery.currentCollisionTargetLabel;
    s.hazardRequested = Boolean(exceptionDir?.active && exceptionDir.requestHazard);
    s.blockedRecoveryPhase = this.exceptionRecovery.currentBlockedPhase;
    s.reverseDistanceRemainingM = exceptionDir?.reverseRemainingM ?? 0;
    s.drivingMode = plan.drivingMode ?? 'NAVIGATION';
    s.controlAuthority = ov.controlAuthority ?? 'SYSTEM';
    s.driverIntent = plan.activeIntent ?? ov.pendingTurnIntent ?? 'NONE';
    s.stopOrigin = this.activeStopOrigin;
    s.requestNavReroute = Boolean(plan.requestNavReroute);
    s.reason = reason;
  }

  private resetBrakeAttribution(): void {
    const b = this.brakeAttribution;
    b.active = false;
    b.source = 'NONE';
    b.reason = '';
    b.targetId = '';
    b.targetKind = 'none';
    b.targetX = 0;
    b.targetY = 0;
    b.targetZ = 0;
    b.distanceM = Infinity;
    b.ttcSeconds = Infinity;
    b.corridorOverlap = false;
    b.targetSpeedMps = 0;
    b.desiredAccelMps2 = 0;
    b.brakeCommand = 0;
  }

  private updateBrakeAttribution(
    vehicle: ADASVehicleState,
    plan: RouteLanePlanner['snapshot'],
    rules: TrafficRuleController['decision'],
    obstacle: ObstacleAvoidanceController['assessment'],
    finalTargetSpeed: number,
    effectiveObstacleSpeed: number,
    desiredAccelMps2: number,
    brakeCommand: number,
  ): void {
    const b = this.brakeAttribution;
    const isDecelerating = brakeCommand > 0.02 || desiredAccelMps2 < -0.35;
    if (!isDecelerating) {
      if (b.active) this.resetBrakeAttribution();
      return;
    }

    // Jerk-limited release tail after an already-attributed deceleration: target speed has already recovered above current speed
    if (
      b.active &&
      b.source !== 'NONE' &&
      b.source !== 'UNATTRIBUTED_BRAKE' &&
      finalTargetSpeed >= vehicle.speed - 0.25
    ) {
      b.targetSpeedMps = finalTargetSpeed;
      b.desiredAccelMps2 = desiredAccelMps2;
      b.brakeCommand = brakeCommand;
      return;
    }

    b.active = true;
    b.targetId = '';
    b.targetKind = 'none';
    b.targetX = 0;
    b.targetY = 0;
    b.targetZ = 0;
    b.distanceM = Infinity;
    b.ttcSeconds = Infinity;
    b.corridorOverlap = false;
    b.targetSpeedMps = finalTargetSpeed;
    b.desiredAccelMps2 = desiredAccelMps2;
    b.brakeCommand = brakeCommand;

    const assignLeadTarget = (src: ADASBrakeAttribution['source'], fallbackReason: string) => {
      b.source = src;
      b.reason = obstacle.reason || fallbackReason;
      b.targetId = obstacle.leadActorId;
      b.targetKind = obstacle.leadActorKind;
      b.targetX = obstacle.leadX;
      b.targetY = obstacle.leadY;
      b.targetZ = obstacle.leadZ;
      b.distanceM = obstacle.leadGapM;
      b.ttcSeconds = obstacle.ttcSeconds;
      b.corridorOverlap = obstacle.leadInCorridor;
    };

    if (!plan.valid || !obstacle.dataReliable) {
      b.source = 'PLAN_INVALID';
      b.reason = plan.unavailableReason || '路径/感知状态异常，保护性减速';
      return;
    }

    if (
      obstacle.emergencyBraking ||
      (obstacle.hasLeadActor &&
        (!obstacle.canEvadeWithoutStopping || obstacle.allowSolidBypass) &&
        effectiveObstacleSpeed <= Math.min(rules.targetSpeedMps, finalTargetSpeed) + 0.25)
    ) {
      assignLeadTarget(
        obstacle.leadIsInfrastructure ? 'INFRASTRUCTURE_COLLIDER' : 'REAL_OBSTACLE',
        obstacle.leadIsInfrastructure ? '侵入车道基础设施碰撞体减速' : '前方障碍物或慢车减速',
      );
      return;
    }

    if (rules.mustStop && rules.signalDecision === 'STOP_BLOCKED_JUNCTION') {
      b.source = 'JUNCTION_BLOCKED';
      b.reason = rules.reason || '前方路口堵塞等待';
      b.distanceM = rules.stopDistanceM;
      return;
    }

    if (rules.mustStop && (rules.signalDecision === 'STOP_RED' || rules.signalDecision === 'STOP_AMBER')) {
      b.source = 'TRAFFIC_SIGNAL';
      b.reason = rules.reason || '信号灯停车线减速';
      b.distanceM = rules.stopDistanceM;
      return;
    }

    if (Number.isFinite(rules.arrivalSpeedCapMps) && rules.arrivalSpeedCapMps <= finalTargetSpeed + 0.25) {
      b.source = 'ARRIVAL_STOP';
      b.reason = '接近目的地减速停车';
      b.distanceM = plan.remainingRouteDistanceM;
      return;
    }

    const rampCapMps = rules.rampSpeedCapMps ?? Infinity;
    if (
      Number.isFinite(rampCapMps) &&
      rampCapMps <= finalTargetSpeed + 0.25 &&
      rampCapMps < rules.speedLimitMps - 0.5
    ) {
      b.source = 'RAMP_DECELERATION';
      b.reason = '进入匝道减速区降速';
      b.distanceM = plan.upcomingJunction.valid ? plan.upcomingJunction.distanceToJunctionEntryM : Infinity;
      return;
    }

    if (rules.curveAndTurnSpeedCapMps <= finalTargetSpeed + 0.25 && rules.curveAndTurnSpeedCapMps < rules.speedLimitMps - 0.5) {
      b.source = 'CURVE_SPEED_CAP';
      b.reason = '弯道或天气安全限速';
      return;
    }

    if (
      vehicle.speed > rules.speedLimitMps + 0.15 &&
      finalTargetSpeed <= Math.max(rules.speedLimitMps, Number.isFinite(this.activeOvertakeCeilingMps) ? this.activeOvertakeCeilingMps : 0) + 0.25
    ) {
      b.source = 'ROAD_SPEED_LIMIT';
      b.reason = '当前道路限速控制';
      return;
    }

    if (obstacle.hasLeadActor && effectiveObstacleSpeed <= finalTargetSpeed + 0.35) {
      assignLeadTarget(
        obstacle.leadIsInfrastructure ? 'INFRASTRUCTURE_COLLIDER' : 'REAL_OBSTACLE',
        '前方目标跟车控制',
      );
      return;
    }

    b.source = 'UNATTRIBUTED_BRAKE';
    b.reason = '未归因减速（疑似幽灵制动）';
  }

  private recordPerf(stepStartMs: number): void {
    const elapsed = Math.max(0, nowMs() - stepStartMs);
    this.perf.lastStepMs = elapsed;
    this.perf.avgStepMs = this.perf.avgStepMs === 0 ? elapsed : this.perf.avgStepMs * 0.96 + elapsed * 0.04;
  }
}
