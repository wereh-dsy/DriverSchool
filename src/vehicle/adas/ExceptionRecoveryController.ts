import type { StaticCollider } from '../physics/CollisionSystem';
import {
  clampADAS,
  wrapADASAngle,
  type ADASConfig,
  type ADASObstacleAssessment,
  type ADASPlanSnapshot,
  type ADASState,
  type ADASTrafficRuleDecision,
  type ADASVehicleState,
  type ADASWorldContext,
  type TrafficActorSnapshot,
} from './ADASTypes';

const TRAIL_CAPACITY = 64;
const TRAIL_STEP_M = 0.6;
const CANDIDATE_REVERSE_DISTANCES = [3.0, 6.0, 10.0] as const;

export interface ExceptionControlDirectives {
  active: boolean;
  overrideDriving: boolean;
  abortedByDriver: boolean;
  state: ADASState | 'NONE';
  reason: string;
  throttle: number;
  brake: number;
  steering: number;
  requestHazard: boolean;
  requestDriveSelector?: 'P' | 'R' | 'N' | 'D';
  requestDirectGear?: 'R' | 'N' | 1;
  requestHandbrake: boolean;
  keepHandbrakeAfterDisarm: boolean;
  shouldLockDisableAdas: boolean;
  requestPlannerRefresh: boolean;
  reverseRemainingM: number;
  collisionTargetLabel: string;
}

/**
 * Coordinates highest-priority exception handling for ADAS V3.4:
 * 1. Real physical Collision Response -> stop, Park (when supported), EPB/handbrake, hazard, locked ADAS disarm.
 * 2. Blocked Recovery -> rear corridor/dynamic safety check, kinematic reverse+turnout prediction, forward re-plan bypass.
 * Zero per-tick heap allocations.
 */
export class ExceptionRecoveryController {
  public readonly directives: ExceptionControlDirectives = {
    active: false,
    overrideDriving: false,
    abortedByDriver: false,
    state: 'NONE',
    reason: '',
    throttle: 0,
    brake: 0,
    steering: 0,
    requestHazard: false,
    requestDriveSelector: undefined,
    requestDirectGear: undefined,
    requestHandbrake: false,
    keepHandbrakeAfterDisarm: false,
    shouldLockDisableAdas: false,
    requestPlannerRefresh: false,
    reverseRemainingM: 0,
    collisionTargetLabel: '',
  };

  private collisionLocked = false;
  private collisionPhase: 'NONE' | 'COLLISION_STOPPING' | 'COLLISION_HOLD' | 'COLLISION_HANDOVER' = 'NONE';
  private collisionPhaseTimer = 0;
  private collisionInParkTimer = 0;
  private collisionTargetLabel = '';
  private collisionHoldParkHandbrakeSent = false;
  private collisionParkConfirmTimedOut = false;

  private blockedPhase:
    | 'NONE'
    | 'BLOCKED_RECOVERY_CHECK'
    | 'BLOCKED_REVERSE'
    | 'BLOCKED_REVERSE_STOP'
    | 'BLOCKED_FORWARD_AVOIDANCE'
    | 'BLOCKED_RECOVERY_FAILED' = 'NONE';
  private blockedPhaseTimer = 0;
  private blockedDwellTimer = 0;
  private blockedRecoveryFailedLatched = false;
  private blockedFailureReason = '';
  private blockedBlockerId = '';
  private reverseStartX = 0;
  private reverseStartZ = 0;
  private reverseStartYaw = 0;
  private reverseTargetDistM = 0;
  private reverseStoppedByHazard = false;
  private reverseSmoothedSteer = 0;
  private reverseSmoothedThrottle = 0;
  private forwardAvoidAttemptedSawLc = false;

  // Pre-allocated forward breadcrumb ring buffer for smooth trail-following reverse
  private readonly trailX = new Float64Array(TRAIL_CAPACITY);
  private readonly trailZ = new Float64Array(TRAIL_CAPACITY);
  private readonly trailYaw = new Float64Array(TRAIL_CAPACITY);
  private trailHead = 0;
  private trailCount = 0;
  private lastTrailX = NaN;
  private lastTrailZ = NaN;

  public get isCollisionLocked(): boolean {
    return this.collisionLocked;
  }

  public get isCollisionStopHoldInProgress(): boolean {
    return this.collisionPhase === 'COLLISION_STOPPING' || this.collisionPhase === 'COLLISION_HOLD';
  }

  public get currentCollisionTargetLabel(): string {
    return this.collisionTargetLabel;
  }

  public get currentBlockedPhase(): ADASState | 'NONE' {
    return this.blockedPhase;
  }

  public resetAll(): void {
    this.collisionLocked = false;
    this.collisionPhase = 'NONE';
    this.collisionPhaseTimer = 0;
    this.collisionInParkTimer = 0;
    this.collisionTargetLabel = '';
    this.collisionHoldParkHandbrakeSent = false;
    this.collisionParkConfirmTimedOut = false;
    this.resetBlockedOnly();
    this.trailHead = 0;
    this.trailCount = 0;
    this.lastTrailX = NaN;
    this.lastTrailZ = NaN;
    this.clearDirectives();
  }

  public resetBlockedOnly(): void {
    this.blockedPhase = 'NONE';
    this.blockedPhaseTimer = 0;
    this.blockedDwellTimer = 0;
    this.blockedRecoveryFailedLatched = false;
    this.blockedFailureReason = '';
    this.blockedBlockerId = '';
    this.reverseTargetDistM = 0;
    this.reverseStoppedByHazard = false;
    this.reverseSmoothedSteer = 0;
    this.reverseSmoothedThrottle = 0;
    this.forwardAvoidAttemptedSawLc = false;
  }

  /** Called ONLY by explicit driver action re-enabling ADAS after handover completes. */
  public clearCollisionLockOnDriverEnable(): void {
    if (this.isCollisionStopHoldInProgress) return;
    this.collisionLocked = false;
    this.collisionPhase = 'NONE';
    this.collisionPhaseTimer = 0;
    this.collisionInParkTimer = 0;
    this.collisionTargetLabel = '';
    this.collisionHoldParkHandbrakeSent = false;
    this.collisionParkConfirmTimedOut = false;
    this.resetBlockedOnly();
  }

  private clearDirectives(): void {
    const d = this.directives;
    d.active = false;
    d.overrideDriving = false;
    d.abortedByDriver = false;
    d.state = 'NONE';
    d.reason = '';
    d.throttle = 0;
    d.brake = 0;
    d.steering = 0;
    d.requestHazard = false;
    d.requestDriveSelector = undefined;
    d.requestDirectGear = undefined;
    d.requestHandbrake = false;
    d.keepHandbrakeAfterDisarm = false;
    d.shouldLockDisableAdas = false;
    d.requestPlannerRefresh = false;
    d.reverseRemainingM = 0;
    d.collisionTargetLabel = this.collisionTargetLabel;
  }

  /** Record forward vehicle pose breadcrumbs when driving normally forward. */
  public recordBreadcrumb(vehicle: Readonly<ADASVehicleState>): void {
    if (this.blockedPhase === 'BLOCKED_REVERSE' || this.blockedPhase === 'BLOCKED_REVERSE_STOP') return;
    if (!vehicle.forwardGear || vehicle.speed < 0.2) return;
    if (!Number.isFinite(this.lastTrailX)) {
      this.pushBreadcrumb(vehicle.x, vehicle.z, vehicle.yaw);
      return;
    }
    const distSq = (vehicle.x - this.lastTrailX) ** 2 + (vehicle.z - this.lastTrailZ) ** 2;
    if (distSq >= TRAIL_STEP_M * TRAIL_STEP_M) {
      this.pushBreadcrumb(vehicle.x, vehicle.z, vehicle.yaw);
    }
  }

  private pushBreadcrumb(x: number, z: number, yaw: number): void {
    this.trailX[this.trailHead] = x;
    this.trailZ[this.trailHead] = z;
    this.trailYaw[this.trailHead] = yaw;
    this.trailHead = (this.trailHead + 1) % TRAIL_CAPACITY;
    if (this.trailCount < TRAIL_CAPACITY) this.trailCount++;
    this.lastTrailX = x;
    this.lastTrailZ = z;
  }

  /**
   * Highest-priority evaluation: genuine physical collision response overrides all ADAS activity.
   * Returns true while collision stopping/holding/handover owns ADAS state.
   */
  public stepCollision(
    dt: number,
    adasEnabled: boolean,
    vehicle: Readonly<ADASVehicleState>,
  ): ExceptionControlDirectives {
    this.clearDirectives();
    const d = this.directives;

    // Detect fresh valid collision when ADAS is currently enabled
    if (adasEnabled && this.collisionPhase === 'NONE') {
      const hitLabel = this.detectValidCollisionTarget(vehicle);
      if (hitLabel !== null) {
        this.collisionLocked = true;
        this.collisionPhase = 'COLLISION_STOPPING';
        this.collisionPhaseTimer = 0;
        this.collisionTargetLabel = hitLabel;
        this.collisionHoldParkHandbrakeSent = false;
        this.resetBlockedOnly();
      }
    }

    if (this.collisionPhase === 'NONE') {
      return d;
    }

    this.collisionPhaseTimer += dt;
    d.active = true;
    d.overrideDriving = true;
    d.collisionTargetLabel = this.collisionTargetLabel;
    d.requestHazard = true;
    d.throttle = 0;
    d.brake = 1.0;
    d.steering = 0;

    const totalSpeed = Math.hypot(vehicle.speed, vehicle.lateralVelocity);

    if (this.collisionPhase === 'COLLISION_STOPPING') {
      d.state = 'COLLISION_STOPPING';
      d.reason = this.collisionTargetLabel
        ? `碰撞（${this.collisionTargetLabel}）· 紧急制动停车并开启双闪`
        : '发生真实碰撞 · 紧急制动停车并开启双闪';
      if (totalSpeed < 0.08 && this.collisionPhaseTimer >= 0.25) {
        this.collisionPhase = 'COLLISION_HOLD';
        this.collisionPhaseTimer = 0;
        this.collisionInParkTimer = 0;
        this.collisionHoldParkHandbrakeSent = false;
      }
      return d;
    }

    if (this.collisionPhase === 'COLLISION_HOLD') {
      d.state = 'COLLISION_HOLD';
      const supportsPark = vehicle.supportsPark !== false && vehicle.transmissionType !== 'MANUAL';
      const inParkNow = vehicle.driveSelector === 'P';
      const neutralNow = vehicle.neutralGear ?? (!vehicle.forwardGear && !vehicle.reverseGear);
      const hasEPB = vehicle.hasElectronicParkingBrake !== false;
      const parkBrakeConfirmed =
        vehicle.parkingBrakeEngaged !== undefined
          ? vehicle.parkingBrakeEngaged
          : vehicle.parkingBrakeActive;

      let parkRequestSent = false;
      if (supportsPark) {
        if (!inParkNow) {
          d.requestDriveSelector = 'P';
          parkRequestSent = true;
          this.collisionInParkTimer = 0;
        } else {
          this.collisionInParkTimer += dt;
        }
        if (!parkBrakeConfirmed && inParkNow && this.collisionInParkTimer >= 0.25) {
          parkRequestSent = true;
          if (!hasEPB) {
            // Mechanical handbrake reads continuous handbrake input; hold continuously while unconfirmed/holding
            d.requestHandbrake = true;
          } else if (!this.collisionHoldParkHandbrakeSent) {
            d.requestHandbrake = true;
            this.collisionHoldParkHandbrakeSent = true;
          }
        } else if (!hasEPB && inParkNow) {
          d.requestHandbrake = true;
        }
      } else {
        if (!neutralNow) {
          d.requestDirectGear = 'N';
          parkRequestSent = true;
          this.collisionInParkTimer = 0;
        } else {
          this.collisionInParkTimer += dt;
        }
        if (neutralNow) {
          parkRequestSent = true;
          if (!hasEPB) {
            // Mechanical handbrake has direct level feedback (brakes.handbrakeInput > 0.05) -> hold continuously
            d.requestHandbrake = true;
          } else if (!parkBrakeConfirmed && !this.collisionHoldParkHandbrakeSent && this.collisionInParkTimer >= 0.12) {
            d.requestHandbrake = true;
            this.collisionHoldParkHandbrakeSent = true;
          }
        }
      }

      const stoppedConfirmed = totalSpeed < 0.08;
      const gearConfirmed = supportsPark ? inParkNow : neutralNow;
      const parkedConfirmed = stoppedConfirmed && gearConfirmed && parkBrakeConfirmed;
      const timedOut = this.collisionPhaseTimer >= 2.6;

      if (parkedConfirmed && this.collisionInParkTimer >= 0.25) {
        this.collisionParkConfirmTimedOut = false;
        this.collisionPhase = 'COLLISION_HANDOVER';
        this.collisionPhaseTimer = 0;
      } else if (timedOut) {
        this.collisionParkConfirmTimedOut = true;
        this.collisionPhase = 'COLLISION_HANDOVER';
        this.collisionPhaseTimer = 0;
      } else if (parkRequestSent && !parkedConfirmed) {
        d.reason = this.collisionTargetLabel
          ? `碰撞停车驻车请求已发出（${this.collisionTargetLabel}）· 正在确认挡位与驻车状态`
          : '碰撞停车驻车请求已发出 · 正在确认挡位与驻车状态';
      } else {
        d.reason = this.collisionTargetLabel
          ? `碰撞已驻车（${this.collisionTargetLabel}）· 双闪已开启 · 准备解除 ADAS`
          : '碰撞已驻车 · 双闪已开启 · 准备解除 ADAS';
      }
      return d;
    }

    // COLLISION_HANDOVER: ADAS completely disarmed & locked until driver manually re-enables
    d.state = 'COLLISION_HANDOVER';
    d.overrideDriving = false;
    d.brake = 0;
    d.shouldLockDisableAdas = true;
    d.keepHandbrakeAfterDisarm = vehicle.hasElectronicParkingBrake === false;
    d.reason = this.collisionParkConfirmTimedOut
      ? '驻车状态确认超时（请踩住制动并手动确认 P 挡/手刹）· ADAS 已解除，请接管'
      : this.collisionTargetLabel
        ? `碰撞停车（${this.collisionTargetLabel}）· 双闪开启 · ADAS 已解除，请接管`
        : '碰撞停车 · 双闪开启 · ADAS 已解除，请接管';
    return d;
  }

  /**
   * Evaluate and execute blocked-road low-speed reverse recovery when normal forward bypass cannot clear a close obstacle.
   */
  public stepBlockedRecovery(
    dt: number,
    vehicle: Readonly<ADASVehicleState>,
    world: ADASWorldContext,
    plan: Readonly<ADASPlanSnapshot>,
    obstacle: Readonly<ADASObstacleAssessment>,
    rules: Readonly<ADASTrafficRuleDecision>,
    actors: readonly TrafficActorSnapshot[],
    actorCount: number,
    driverOverrideAny: boolean,
    config: Readonly<ADASConfig>,
  ): ExceptionControlDirectives {
    this.clearDirectives();
    const d = this.directives;

    // Driver override immediately aborts automated blocked recovery & resets all pending control directives
    if (driverOverrideAny) {
      if (this.blockedPhase !== 'NONE') {
        this.resetBlockedOnly();
        d.abortedByDriver = true;
      }
      return d;
    }

    // Once failed, stay latched in BLOCKED_RECOVERY_FAILED (never auto-retry reversing or creeping forward)
    if (this.blockedPhase === 'BLOCKED_RECOVERY_FAILED') {
      this.blockedPhaseTimer += dt;
      d.active = true;
      d.overrideDriving = true;
      d.state = 'BLOCKED_RECOVERY_FAILED';
      d.requestHazard = true;
      d.throttle = 0;
      d.brake = 1.0;
      d.steering = 0;
      const atRest = Math.hypot(vehicle.speed, vehicle.lateralVelocity) < 0.15;
      if (atRest && this.blockedPhaseTimer >= 0.3) {
        const supportsPark = vehicle.supportsPark !== false && vehicle.transmissionType !== 'MANUAL';
        const hasEPB = vehicle.hasElectronicParkingBrake !== false;
        if (supportsPark) {
          if (vehicle.driveSelector !== 'P') d.requestDriveSelector = 'P';
          else if (!hasEPB || !vehicle.parkingBrakeActive) d.requestHandbrake = true;
        } else {
          const neutralNow = vehicle.neutralGear ?? (!vehicle.forwardGear && !vehicle.reverseGear);
          if (!neutralNow) d.requestDirectGear = 'N';
          else if (!hasEPB || !vehicle.parkingBrakeActive) d.requestHandbrake = true;
        }
      }
      d.reason = this.blockedFailureReason || '脱困失败，请人工接管';
      return d;
    }

    // Only trigger reverse recovery for fixed road obstacles (never temporarily stopped vehicles, traffic queues, pedestrians or cyclists)
    const isFixedStaticObstacle =
      obstacle.leadIsStatic &&
      (obstacle.leadActorKind === 'static-obstacle' || obstacle.leadActorKind === 'road-block');

    const staticBlockerClose =
      plan.valid &&
      obstacle.hasLeadActor &&
      isFixedStaticObstacle &&
      obstacle.leadGapM <= 7.8;

    // High-risk road prohibition check (never auto-reverse on highway, ramp, expressway, or inside intersection)
    const isHighRiskRoad = this.isHighRiskReverseRoad(plan);

    // 1. Trigger check from idle ADAS state when wedged close behind static obstacle without signal hold or forward bypass
    if (this.blockedPhase === 'NONE') {
      if (
        !this.blockedRecoveryFailedLatched &&
        staticBlockerClose &&
        !rules.mustStop &&
        !plan.laneChange.active &&
        !obstacle.canEvadeWithoutStopping &&
        Math.abs(vehicle.speed) < 0.45 &&
        !vehicle.parkingBrakeActive
      ) {
        if (obstacle.leadActorId !== this.blockedBlockerId) {
          this.blockedBlockerId = obstacle.leadActorId;
          this.blockedDwellTimer = 0;
        }
        this.blockedDwellTimer += dt;
        if (this.blockedDwellTimer >= 1.1) {
          this.blockedPhase = 'BLOCKED_RECOVERY_CHECK';
          this.blockedPhaseTimer = 0;
        }
      } else {
        this.blockedDwellTimer = Math.max(0, this.blockedDwellTimer - dt * 2);
        if (!staticBlockerClose) this.blockedBlockerId = '';
      }

      if (this.blockedPhase === 'NONE') return d;
    }

    this.blockedPhaseTimer += dt;

    // 2. BLOCKED_RECOVERY_CHECK: assess corridor feasibility & rear safety before shifting R
    if (this.blockedPhase === 'BLOCKED_RECOVERY_CHECK') {
      d.active = true;
      d.overrideDriving = true;
      d.state = 'BLOCKED_RECOVERY_CHECK';
      d.throttle = 0;
      d.brake = 1.0;
      d.steering = 0;
      d.reason = '前方受阻，正在检查倒车空间';

      // If forward direct bypass suddenly opened while checking, cancel check and let V3.3 bypass normally
      if (obstacle.canEvadeWithoutStopping || !staticBlockerClose) {
        this.resetBlockedOnly();
        return this.clearAndReturn();
      }

      if (isHighRiskRoad) {
        this.enterRecoveryFailed('高速主线/匝道禁止自动倒车 · 脱困失败，请人工接管');
        return this.stepBlockedRecovery(dt, vehicle, world, plan, obstacle, rules, actors, actorCount, false, config);
      }

      // Pre-simulate candidate reverse distances (3 m, 6 m, 10 m) to confirm BOTH rear safety AND a valid post-reverse forward bypass path
      const planDecision = this.findBestFeasibleReversePlan(
        vehicle,
        world,
        plan,
        obstacle,
        actors,
        actorCount,
        config,
      );
      if (!planDecision.feasible) {
        this.enterRecoveryFailed(planDecision.reason || '前方或后方无法确认安全脱困路线 · 脱困失败，请人工接管');
        return this.stepBlockedRecovery(dt, vehicle, world, plan, obstacle, rules, actors, actorCount, false, config);
      }

      // Brief check dwell (0.45s), then request R gear with hazard lights ON
      d.requestHazard = true;
      if (this.blockedPhaseTimer >= 0.45 && Math.hypot(vehicle.speed, vehicle.lateralVelocity) < 0.15) {
        const supportsManual = vehicle.transmissionType === 'MANUAL';
        if (supportsManual) {
          d.requestDirectGear = 'R';
        } else {
          d.requestDriveSelector = 'R';
        }

        const inReverseNow = vehicle.reverseGear === true || vehicle.driveSelector === 'R';
        if (inReverseNow) {
          this.blockedPhase = 'BLOCKED_REVERSE';
          this.blockedPhaseTimer = 0;
          this.reverseStartX = vehicle.x;
          this.reverseStartZ = vehicle.z;
          this.reverseStartYaw = vehicle.yaw;
          this.reverseTargetDistM = planDecision.selectedReverseM;
          this.reverseStoppedByHazard = false;
          this.reverseSmoothedSteer = 0;
          this.reverseSmoothedThrottle = 0;
        }
      }
      return d;
    }

    // 3. BLOCKED_REVERSE: reverse smoothly at 1.0–2.0 m/s along previous trail / path while continuously checking rear safety
    if (this.blockedPhase === 'BLOCKED_REVERSE') {
      d.active = true;
      d.overrideDriving = true;
      d.state = 'BLOCKED_REVERSE';
      d.requestHazard = true;

      if (isHighRiskRoad) {
        this.reverseStoppedByHazard = true;
        this.blockedPhase = 'BLOCKED_REVERSE_STOP';
        this.blockedPhaseTimer = 0;
        d.state = 'BLOCKED_REVERSE_STOP';
        d.brake = 1.0;
        d.reason = '高风险路段终止倒车，请人工接管';
        return d;
      }

      const fwdX = -Math.sin(this.reverseStartYaw);
      const fwdZ = -Math.cos(this.reverseStartYaw);
      const reversedDist = -((vehicle.x - this.reverseStartX) * fwdX + (vehicle.z - this.reverseStartZ) * fwdZ);
      const remainingM = Math.max(0, this.reverseTargetDistM - Math.max(0, reversedDist));
      d.reverseRemainingM = remainingM;

      // Live rear safety check during reversing
      const rearCheck = this.evaluateRearCorridorSafety(
        Math.max(1.5, remainingM),
        vehicle,
        world,
        plan,
        actors,
        actorCount,
      );
      if (!rearCheck.safe) {
        this.reverseStoppedByHazard = true;
        this.blockedPhase = 'BLOCKED_REVERSE_STOP';
        this.blockedPhaseTimer = 0;
        d.state = 'BLOCKED_REVERSE_STOP';
        d.throttle = 0;
        d.brake = 1.0;
        d.steering = 0;
        d.reason = '后方存在危险，倒车已停止';
        return d;
      }

      if (remainingM <= 0.15 || this.blockedPhaseTimer >= 13.0) {
        this.reverseStoppedByHazard = false;
        this.blockedPhase = 'BLOCKED_REVERSE_STOP';
        this.blockedPhaseTimer = 0;
        d.state = 'BLOCKED_REVERSE_STOP';
        d.throttle = 0;
        d.brake = 1.0;
        d.steering = 0;
        d.reason = '倒车已达安全距离 · 准备切换前进挡';
        return d;
      }

      // Gentle 1.0 - 1.8 m/s reverse speed controller
      const targetRevSpeed = clampADAS(1.0 + remainingM * 0.35, 1.0, 1.8);
      const curRevSpeed = Math.max(0, -vehicle.speed);
      const speedErr = targetRevSpeed - curRevSpeed;

      if (speedErr >= -0.15) {
        const rawThr = clampADAS(0.14 + speedErr * 0.22, 0.08, 0.38);
        this.reverseSmoothedThrottle += (rawThr - this.reverseSmoothedThrottle) * (1 - Math.exp(-5 * dt));
        d.throttle = this.reverseSmoothedThrottle;
        d.brake = 0;
      } else {
        this.reverseSmoothedThrottle = 0;
        d.throttle = 0;
        d.brake = clampADAS((-speedErr - 0.15) * 0.55, 0.05, 0.5);
      }

      d.steering = this.computeReverseTrailSteering(dt, vehicle, plan);
      d.reason = `正在低速倒车脱困（剩余 ${remainingM.toFixed(1)} m）`;
      return d;
    }

    // 4. BLOCKED_REVERSE_STOP: brake cleanly to rest, either fail if rear hazard stopped us, or shift D -> forward bypass
    if (this.blockedPhase === 'BLOCKED_REVERSE_STOP') {
      d.active = true;
      d.overrideDriving = true;
      d.state = 'BLOCKED_REVERSE_STOP';
      d.requestHazard = true;
      d.throttle = 0;
      d.brake = 1.0;
      d.steering = 0;

      const atRest = Math.hypot(vehicle.speed, vehicle.lateralVelocity) < 0.14;
      if (this.reverseStoppedByHazard) {
        d.reason = '后方存在危险，倒车已停止';
        if (atRest && this.blockedPhaseTimer >= 1.1) {
          this.enterRecoveryFailed('后方存在危险，倒车已停止 · 请人工接管');
          return this.stepBlockedRecovery(dt, vehicle, world, plan, obstacle, rules, actors, actorCount, false, config);
        }
        return d;
      }

      d.reason = '倒车到位停车 · 切换前进挡';
      if (atRest && this.blockedPhaseTimer >= 0.25) {
        if (vehicle.transmissionType === 'MANUAL') {
          d.requestDirectGear = 1;
        } else {
          d.requestDriveSelector = 'D';
        }
        if (vehicle.forwardGear) {
          this.blockedPhase = 'BLOCKED_FORWARD_AVOIDANCE';
          this.blockedPhaseTimer = 0;
          this.forwardAvoidAttemptedSawLc = false;
          d.requestPlannerRefresh = true;
        }
      }
      return d;
    }

    // 5. BLOCKED_FORWARD_AVOIDANCE: hand off steering/throttle to V3.3 forward bypass while monitoring completion
    if (this.blockedPhase === 'BLOCKED_FORWARD_AVOIDANCE') {
      d.active = true;
      d.overrideDriving = false; // V3.3 RouteLanePlanner + ObstacleAvoidanceController execute forward maneuver
      d.state = 'BLOCKED_FORWARD_AVOIDANCE';
      d.requestHazard = !plan.laneChange.active;
      d.reason = '正在重新规划前进路径';

      if (plan.laneChange.active) {
        this.forwardAvoidAttemptedSawLc = true;
      }

      const clearedObstacle =
        !obstacle.hasLeadActor ||
        obstacle.leadGapM > 14.0 ||
        (this.forwardAvoidAttemptedSawLc && !plan.laneChange.active && vehicle.speed > 1.2);

      if (clearedObstacle && this.blockedPhaseTimer >= 0.6) {
        // Successfully escaped: release hazard light ownership and resume normal ADAS
        this.resetBlockedOnly();
        return this.clearAndReturn();
      }

      if (this.blockedPhaseTimer >= 5.0 && Math.abs(vehicle.speed) < 0.3 && !plan.laneChange.active && !obstacle.canEvadeWithoutStopping) {
        this.enterRecoveryFailed('倒车后仍无安全绕行路径 · 脱困失败，请人工接管');
        return this.stepBlockedRecovery(dt, vehicle, world, plan, obstacle, rules, actors, actorCount, false, config);
      }
      return d;
    }

    return d;
  }

  private clearAndReturn(): ExceptionControlDirectives {
    this.clearDirectives();
    return this.directives;
  }

  private enterRecoveryFailed(reason: string): void {
    this.blockedPhase = 'BLOCKED_RECOVERY_FAILED';
    this.blockedPhaseTimer = 0;
    this.blockedRecoveryFailedLatched = true;
    this.blockedFailureReason = reason;
    this.directives.reason = reason;
  }

  private detectValidCollisionTarget(vehicle: Readonly<ADASVehicleState>): string | null {
    const col = vehicle.collision;
    if (!col || !col.collided || col.contacts.length === 0) return null;

    const deltaSpeed = Math.abs(col.deltaSpeedMps ?? 0);
    const totalSpeed = Math.hypot(vehicle.speed, vehicle.lateralVelocity);
    let bestScore = -1;
    let bestLabel: string | null = null;

    for (let i = 0; i < col.contacts.length; i++) {
      const c = col.contacts[i]!;
      const maxH = c.maxHeight;
      const isLowCurb = maxH !== undefined && maxH < 0.35;
      // Ignore normal low curbs unless high-impulse curb slam
      if (isLowCurb && (c.inwardSpeed < 1.8 || deltaSpeed < 1.2)) {
        continue;
      }

      // Separate minor glancing scrapes / micro-touches from real body impacts:
      // Requires substantial inward impact velocity, velocity shock (delta-v), or deep structural intrusion.
      const substantialImpact =
        c.inwardSpeed >= 1.15 ||
        (c.inwardSpeed >= 0.75 && deltaSpeed >= 0.60) ||
        (deltaSpeed >= 1.20 && (c.inwardSpeed >= 0.25 || c.penetration >= 0.03)) ||
        (c.penetration >= 0.12 && (totalSpeed >= 0.25 || c.inwardSpeed >= 0.20));

      if (!substantialImpact) continue;

      const score = c.inwardSpeed + c.penetration * 10 + deltaSpeed;
      if (score > bestScore) {
        bestScore = score;
        bestLabel = this.classifyColliderLabel(c.colliderId, c.colliderType);
      }
    }
    return bestLabel;
  }

  private classifyColliderLabel(
    id: string,
    type?: 'guardrail' | 'wall' | 'building' | 'obstacle',
  ): string {
    if (id.includes(':post:')) return '路灯杆/标志杆';
    if (id.includes(':board:')) return '导向标志牌';
    if (id.includes(':pier:')) return '桥墩/立柱';
    if (id.includes(':island:')) return '安全岛';
    if (type === 'guardrail' || id.includes('rail') || id.includes('barrier')) return '护栏';
    if (type === 'building') return '建筑物';
    if (type === 'wall' || id.includes(':wall:')) return '墙体/挡墙';
    if (type === 'obstacle') return '道路设施/障碍物';
    return '静态障碍物';
  }

  private isHighRiskReverseRoad(plan: Readonly<ADASPlanSnapshot>): boolean {
    if (plan.inJunction) return true;
    // Structural road attributes first: highway/expressway/ramp/taper segments regardless of instantaneous vehicle speed
    if (
      plan.currentRoadType === 'highway' ||
      plan.currentRoadType === 'ramp' ||
      plan.currentRoadFunction === 'expressway' ||
      plan.currentRoadFunction === 'ramp' ||
      plan.currentIsHighwayTransition === true
    ) {
      return true;
    }
    if (plan.currentSpeedLimitMps >= 70 / 3.6) return true;
    if (plan.currentRoadId.includes('ramp') || plan.currentRoadName.includes('匝道')) return true;
    if (plan.currentRoadName.includes('高速') || plan.currentRoadName.includes('高架') || plan.currentRoadName.includes('快速')) {
      return true;
    }
    if (plan.maneuver === 'EXIT_RAMP' || plan.maneuver === 'MERGE') return true;
    return false;
  }

  private readonly reversePlanResult = { feasible: false, selectedReverseM: 0, reason: '' };
  private readonly rearSafetyResult = { safe: true, reason: '' };
  private readonly simRevPose = { x: 0, z: 0, yaw: 0, steerAngle: 0, ok: false, reason: '' };

  private findClosestPlanSample(x: number, z: number, plan: Readonly<ADASPlanSnapshot>): number {
    let bestIdx = 0;
    let bestDistSq = Infinity;
    for (let k = 0; k < plan.sampleCount; k++) {
      const sp = plan.samples[k]!;
      const dx = x - sp.x;
      const dz = z - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = k;
      }
    }
    return bestIdx;
  }

  private findClosestBreadcrumbYaw(
    x: number,
    z: number,
    fallbackX: number,
    fallbackZ: number,
    fallbackYaw: number,
  ): { refX: number; refZ: number; refYaw: number } {
    if (this.trailCount < 2) {
      return { refX: fallbackX, refZ: fallbackZ, refYaw: fallbackYaw };
    }
    let bestDistSq = Infinity;
    let bestIdx = 0;
    const oldest = (this.trailHead - this.trailCount + TRAIL_CAPACITY) % TRAIL_CAPACITY;
    for (let k = 0; k < this.trailCount; k++) {
      const idx = (oldest + k) % TRAIL_CAPACITY;
      const dx = x - this.trailX[idx]!;
      const dz = z - this.trailZ[idx]!;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
    return {
      refX: this.trailX[bestIdx]!,
      refZ: this.trailZ[bestIdx]!,
      refYaw: this.trailYaw[bestIdx]!,
    };
  }

  /**
   * Simulate curved reversing trajectory starting from current front wheel angle & vehicle pose,
   * accounting for wheelbase, turning rate, and curved road samples / recorded breadcrumbs.
   */
  private simulateReverseKinematicPath(
    reverseDistM: number,
    vehicle: Readonly<ADASVehicleState>,
    world: ADASWorldContext,
    plan: Readonly<ADASPlanSnapshot>,
  ): void {
    const out = this.simRevPose;
    const wheelBase = Math.max(2.0, vehicle.wheelBase);
    const maxRoadAngle = clampADAS(vehicle.steeringConfig.maxRoadWheelAngle * 0.72, 0.18, 0.48);
    const laneW = Math.max(2.8, plan.currentLaneWidth || 3.5);
    const egoHalfW = vehicle.vehicleWidth * 0.5;
    const egoHalfL = vehicle.vehicleLength * 0.5;
    const maxAllowLat = Math.max(0.85, laneW * 0.5 - egoHalfW + 0.25);

    let px = vehicle.x;
    let pz = vehicle.z;
    let pyaw = vehicle.yaw;
    let psteer = clampADAS(vehicle.steeringAngle, -maxRoadAngle, maxRoadAngle);

    const revStepM = 0.75;
    const steps = Math.max(2, Math.ceil(reverseDistM / revStepM));
    const stepLen = reverseDistM / steps;
    const dtStep = stepLen / 1.35;
    const steerSlew = 0.9 * dtStep;

    const colliders = world.queryNearbyColliders
      ? world.queryNearbyColliders(
          { x: vehicle.x + Math.sin(vehicle.yaw) * (reverseDistM * 0.5), z: vehicle.z + Math.cos(vehicle.yaw) * (reverseDistM * 0.5) },
          reverseDistM + 8.0,
        )
      : undefined;

    for (let s = 0; s < steps; s++) {
      let refX = vehicle.x;
      let refZ = vehicle.z;
      let refYaw = vehicle.yaw;
      if (this.trailCount >= 2) {
        const ref = this.findClosestBreadcrumbYaw(px, pz, vehicle.x, vehicle.z, vehicle.yaw);
        refX = ref.refX;
        refZ = ref.refZ;
        refYaw = ref.refYaw;
      } else if (plan.valid && plan.sampleCount >= 2) {
        const sp = plan.samples[this.findClosestPlanSample(px, pz, plan)]!;
        refX = sp.x;
        refZ = sp.z;
        refYaw = sp.yaw;
      }

      const cosRef = Math.cos(refYaw);
      const sinRef = Math.sin(refYaw);
      const latErr = (px - refX) * cosRef - (pz - refZ) * sinRef;
      const headErr = wrapADASAngle(refYaw - pyaw);
      // Desired road wheel angle follows same sign convention as computeReverseTrailSteering
      const targetSteer = clampADAS(
        (-clampADAS(0.08 * latErr, -0.18, 0.18) + clampADAS(0.42 * headErr, -0.22, 0.22)) * (maxRoadAngle / 0.35),
        -maxRoadAngle,
        maxRoadAngle,
      );
      psteer += clampADAS(targetSteer - psteer, -steerSlew, steerSlew);

      // Step backward along vehicle heading (-fx, -fz) with reversing bicycle yaw increment
      const fx = -Math.sin(pyaw);
      const fz = -Math.cos(pyaw);
      px -= fx * stepLen;
      pz -= fz * stepLen;
      pyaw = wrapADASAngle(pyaw + (Math.tan(psteer) / wheelBase) * stepLen);

      // Validate curved lane boundary throughout entire reversing sweep
      if (plan.valid && plan.sampleCount >= 2) {
        const sp = plan.samples[this.findClosestPlanSample(px, pz, plan)]!;
        const cLat = (px - sp.x) * Math.cos(sp.yaw) - (pz - sp.z) * Math.sin(sp.yaw);
        if (Math.abs(cLat) > maxAllowLat) {
          out.ok = false;
          out.reason = '考虑当前车轮转角与道路曲率，倒车将越过车道边界';
          return;
        }
      }

      // Validate simulated pose against local static colliders
      if (colliders) {
        for (let i = 0; i < colliders.length; i++) {
          const col = colliders[i]!;
          if (col.maxHeight < 0.35 || col.minHeight > vehicle.y + 1.9) continue;
          const dx = col.center.x - px;
          const dz = col.center.z - pz;
          const relYaw = wrapADASAngle(col.yaw - pyaw);
          const absC = Math.abs(Math.cos(relYaw));
          const absS = Math.abs(Math.sin(relYaw));
          const cHalfW = col.halfWidth * absC + col.halfLength * absS;
          const cHalfL = col.halfLength * absC + col.halfWidth * absS;
          const localLong = dx * -Math.sin(pyaw) + dz * -Math.cos(pyaw);
          const localLat = dx * Math.cos(pyaw) - dz * Math.sin(pyaw);
          if (Math.abs(localLong) <= egoHalfL + cHalfL + 0.20 && Math.abs(localLat) <= egoHalfW + cHalfW + 0.22) {
            out.ok = false;
            out.reason = '弯道或当前转角下倒车包络将与路侧障碍干涉';
            return;
          }
        }
      }
    }

    out.x = px;
    out.z = pz;
    out.yaw = pyaw;
    out.steerAngle = psteer;
    out.ok = true;
    out.reason = '';
  }

  private findBestFeasibleReversePlan(
    vehicle: Readonly<ADASVehicleState>,
    world: ADASWorldContext,
    plan: Readonly<ADASPlanSnapshot>,
    obstacle: Readonly<ADASObstacleAssessment>,
    actors: readonly TrafficActorSnapshot[],
    actorCount: number,
    config: Readonly<ADASConfig>,
  ): { feasible: boolean; selectedReverseM: number; reason: string } {
    const res = this.reversePlanResult;
    const canLeftDashed = obstacle.leftLane.exists && plan.leftBoundary === 'dashed' && !plan.inJunction;
    const canRightDashed = obstacle.rightLane.exists && plan.rightBoundary === 'dashed' && !plan.inJunction;
    const canLeftSolid = obstacle.leftLane.exists && plan.leftBoundary === 'solid' && !plan.inJunction;
    const canRightSolid = obstacle.rightLane.exists && plan.rightBoundary === 'solid' && !plan.inJunction;

    // On undivided urban two-way single-carriageway roads with sufficient width & zero oncoming traffic,
    // allow evaluating an emergency opposite-lane turnout/reverse recovery only when same-direction bypass fails.
    const net = world.roadNetwork ?? world.nearbyNetwork;
    const curRoad = net?.segments.find((s) => s.id === plan.currentRoadId);
    const hasPhysicalDivider =
      (world.queryNearbyColliders &&
        world
          .queryNearbyColliders({ x: vehicle.x, z: vehicle.z }, 22)
          .some(
            (c) =>
              (c.id.includes(':median:') || c.id.includes(':barrier:')) &&
              c.maxHeight >= vehicle.y + 0.15 &&
              c.minHeight <= vehicle.y + 1.85,
          )) ||
      false;
    const isUndividedUrbanTwoWay =
      Boolean(curRoad) &&
      curRoad!.travelDirection === 'two-way' &&
      !hasPhysicalDivider &&
      curRoad!.roadType !== 'highway' &&
      curRoad!.roadType !== 'ramp' &&
      curRoad!.roadFunction !== 'expressway' &&
      !plan.inJunction &&
      plan.leftBoundary !== 'road-edge';

    if (!canLeftDashed && !canRightDashed && !canLeftSolid && !canRightSolid && !isUndividedUrbanTwoWay) {
      res.feasible = false;
      res.selectedReverseM = 0;
      res.reason = '前方完全阻断且无合法绕行/掉头空间 · 脱困失败，请人工接管';
      return res;
    }

    // Dynamic minimum turning setback lower bound based on wheelbase & usable road wheel angle
    const maxRoadAngle = clampADAS(vehicle.steeringConfig.maxRoadWheelAngle * 0.72, 0.18, 0.45);
    const minRadius = Math.max(4.6, vehicle.wheelBase / Math.tan(maxRoadAngle));
    const latClear = clampADAS((vehicle.vehicleWidth + Math.max(1.2, obstacle.leadWidth)) * 0.5 + 0.55, 1.5, 2.8);
    const minSetbackM = Math.max(
      config.minStandstillGapM + 3.0,
      Math.sqrt(2 * minRadius * latClear) + 1.5,
    );

    let lastBlockReason = '倒车后前方仍无法形成安全绕行或掉头路径 · 脱困失败，请人工接管';
    for (let i = 0; i < CANDIDATE_REVERSE_DISTANCES.length; i++) {
      const candidateRevM = CANDIDATE_REVERSE_DISTANCES[i]!;
      const setbackGapAfterRev = Math.max(0, obstacle.leadGapM) + candidateRevM;
      if (setbackGapAfterRev < minSetbackM) {
        continue;
      }

      // 1. Verify rear safety & intersection/boundary compliance for this exact reverse distance
      const rearCheck = this.evaluateRearCorridorSafety(candidateRevM, vehicle, world, plan, actors, actorCount);
      if (!rearCheck.safe) {
        res.feasible = false;
        res.selectedReverseM = 0;
        res.reason = rearCheck.reason || '后方空间不足或存在风险 · 脱困失败，请人工接管';
        return res;
      }

      // 2. Simulate full curved bicycle reverse path from actual wheel angle to get predicted post-reverse endpoint pose
      this.simulateReverseKinematicPath(candidateRevM, vehicle, world, plan);
      if (!this.simRevPose.ok) {
        lastBlockReason = this.simRevPose.reason || lastBlockReason;
        continue;
      }

      // 3a. Priority 1: Prefer legal dashed-line bypasses cleanly
      const leftDashedClear = canLeftDashed && this.isPostReverseForwardBypassClear('left', candidateRevM, setbackGapAfterRev, vehicle, world, plan, obstacle, actors, actorCount);
      const rightDashedClear = canRightDashed && this.isPostReverseForwardBypassClear('right', candidateRevM, setbackGapAfterRev, vehicle, world, plan, obstacle, actors, actorCount);
      if (leftDashedClear || rightDashedClear) {
        res.feasible = true;
        res.selectedReverseM = candidateRevM;
        res.reason = '';
        return res;
      }

      // 3b. Priority 2: Restricted emergency solid-line bypass when dashed lanes are unavailable/blocked
      const leftSolidClear = canLeftSolid && this.isPostReverseForwardBypassClear('left', candidateRevM, setbackGapAfterRev, vehicle, world, plan, obstacle, actors, actorCount);
      const rightSolidClear = canRightSolid && this.isPostReverseForwardBypassClear('right', candidateRevM, setbackGapAfterRev, vehicle, world, plan, obstacle, actors, actorCount);
      if (leftSolidClear || rightSolidClear) {
        res.feasible = true;
        res.selectedReverseM = candidateRevM;
        res.reason = '';
        return res;
      }

      // 3c. Priority 3: Last-resort undivided two-way urban turnout / U-turn space check (only when wide enough & clear of oncoming traffic)
      if (
        isUndividedUrbanTwoWay &&
        curRoad &&
        curRoad.width >= 2 * minRadius * 0.85 + vehicle.vehicleWidth &&
        this.isPostReverseForwardBypassClear('left', candidateRevM, setbackGapAfterRev, vehicle, world, plan, obstacle, actors, actorCount)
      ) {
        res.feasible = true;
        res.selectedReverseM = candidateRevM;
        res.reason = '';
        return res;
      }
      lastBlockReason = `倒车 ${candidateRevM.toFixed(0)}m 后转出空间不足或相邻车道被占用 · 无安全绕行路线`;
    }

    res.feasible = false;
    res.selectedReverseM = 0;
    res.reason = lastBlockReason;
    return res;
  }

  private isPostReverseForwardBypassClear(
    side: 'left' | 'right',
    candidateRevM: number,
    newLeadGapM: number,
    vehicle: Readonly<ADASVehicleState>,
    world: ADASWorldContext,
    plan: Readonly<ADASPlanSnapshot>,
    obstacle: Readonly<ADASObstacleAssessment>,
    actors: readonly TrafficActorSnapshot[],
    actorCount: number,
  ): boolean {
    const laneW = Math.max(2.8, plan.currentLaneWidth || 3.5);
    const targetLaneLatOffset = side === 'left' ? -laneW : laneW;
    const egoHalfW = vehicle.vehicleWidth * 0.5;
    const egoHalfL = vehicle.vehicleLength * 0.5;
    const wheelBase = Math.max(2.0, vehicle.wheelBase);
    const maxRoadAngle = clampADAS(vehicle.steeringConfig.maxRoadWheelAngle * 0.72, 0.18, 0.45);
    const obsLen = Math.max(1.0, obstacle.leadLength || 4.0);
    const obsHalfW = Math.max(0.4, (obstacle.leadWidth || 1.8) * 0.5);
    const obsHalfL = obsLen * 0.5;

    // Simulate actual R->D forward pull-out trajectory from post-reverse pose (simRevPose)
    let fxPos = this.simRevPose.x;
    let fzPos = this.simRevPose.z;
    let fYaw = this.simRevPose.yaw;
    let fSteer = this.simRevPose.steerAngle;

    const totalPulloutM = newLeadGapM + obsLen + 11.0;
    const stepM = 0.75;
    const pullSteps = Math.max(4, Math.ceil(totalPulloutM / stepM));
    const speedEst = 2.6; // typical R->D launch/avoidance pull-out speed (m/s)
    const dtPerStep = stepM / speedEst;
    const steerSlewPerStep = 0.85 * dtPerStep;

    const pullColliders = world.queryNearbyColliders
      ? world.queryNearbyColliders(
          {
            x: fxPos - Math.sin(fYaw) * (totalPulloutM * 0.5),
            z: fzPos - Math.cos(fYaw) * (totalPulloutM * 0.5),
          },
          totalPulloutM + 8.0,
        )
      : undefined;

    for (let s = 0; s < pullSteps; s++) {
      const lookDistM = 4.2;
      let refX = fxPos - Math.sin(fYaw) * lookDistM + Math.cos(fYaw) * targetLaneLatOffset;
      let refZ = fzPos - Math.cos(fYaw) * lookDistM - Math.sin(fYaw) * targetLaneLatOffset;
      let refYaw = fYaw;
      if (plan.valid && plan.sampleCount >= 2) {
        const curIdx = this.findClosestPlanSample(fxPos, fzPos, plan);
        const targetIdx = Math.min(plan.sampleCount - 1, curIdx + Math.round(lookDistM / 2.0));
        const sp = plan.samples[targetIdx]!;
        refYaw = sp.yaw;
        // Aim at target adjacent lane shifted along curved road normal
        refX = sp.x + Math.cos(refYaw) * targetLaneLatOffset;
        refZ = sp.z - Math.sin(refYaw) * targetLaneLatOffset;
      }

      const latErrTarget = (fxPos - refX) * Math.cos(refYaw) - (fzPos - refZ) * Math.sin(refYaw);
      const headErrTarget = wrapADASAngle(refYaw - fYaw);
      // Left turn -> negative wheel angle -> positive yaw increment (note LaneFollowingController sign)
      const desiredSteer = clampADAS(
        -clampADAS(0.18 * latErrTarget, -maxRoadAngle, maxRoadAngle) - clampADAS(0.85 * headErrTarget, -maxRoadAngle, maxRoadAngle),
        -maxRoadAngle,
        maxRoadAngle,
      );
      fSteer += clampADAS(desiredSteer - fSteer, -steerSlewPerStep, steerSlewPerStep);

      fxPos += -Math.sin(fYaw) * stepM;
      fzPos += -Math.cos(fYaw) * stepM;
      fYaw = wrapADASAngle(fYaw - (Math.tan(fSteer) / wheelBase) * stepM);

      // 3a. Verify swept ego bounding box (including outer front bumper corner!) clears front blocker during turnout
      if (obstacle.hasLeadActor && Number.isFinite(obstacle.leadX) && Number.isFinite(obstacle.leadZ)) {
        const relObsYaw = wrapADASAngle(obstacle.leadYaw - fYaw);
        const absCO = Math.abs(Math.cos(relObsYaw));
        const absSO = Math.abs(Math.sin(relObsYaw));
        const bHalfLat = obsHalfW * absCO + obsHalfL * absSO;
        const bHalfLong = obsHalfL * absCO + obsHalfW * absSO;
        const odx = obstacle.leadX - fxPos;
        const odz = obstacle.leadZ - fzPos;
        const oLong = odx * -Math.sin(fYaw) + odz * -Math.cos(fYaw);
        const oLat = odx * Math.cos(fYaw) - odz * Math.sin(fYaw);
        if (Math.abs(oLong) <= egoHalfL + bHalfLong + 0.35 && Math.abs(oLat) <= egoHalfW + bHalfLat + 0.30) {
          return false; // Front bumper corner or body clips blocker during R->D swing-out
        }
      }

      // 3b. Verify swept pose against world static colliders in turnout arc
      if (pullColliders) {
        for (let cIdx = 0; cIdx < pullColliders.length; cIdx++) {
          const col = pullColliders[cIdx]!;
          if (col.id === obstacle.leadActorId) continue;
          if (col.maxHeight < vehicle.y + 0.12 || col.minHeight > vehicle.y + 1.90) continue;
          const relColYaw = wrapADASAngle(col.yaw - fYaw);
          const absCC = Math.abs(Math.cos(relColYaw));
          const absSC = Math.abs(Math.sin(relColYaw));
          const cdx = col.center.x - fxPos;
          const cdz = col.center.z - fzPos;
          const cLong = cdx * -Math.sin(fYaw) + cdz * -Math.cos(fYaw);
          const cLat = cdx * Math.cos(fYaw) - cdz * Math.sin(fYaw);
          // 2D SAT in both ego frame and collider local frame to prevent diagonal barrier inflation
          const egoPadL = egoHalfL + 0.25;
          const egoPadW = egoHalfW + 0.25;
          const overlapEgoAxes =
            Math.abs(cLong) <= egoPadL + col.halfLength * absCC + col.halfWidth * absSC &&
            Math.abs(cLat) <= egoPadW + col.halfWidth * absCC + col.halfLength * absSC;
          const overlapColAxes =
            Math.abs(cLong * Math.cos(relColYaw) + cLat * Math.sin(relColYaw)) <= col.halfLength + egoPadL * absCC + egoPadW * absSC &&
            Math.abs(-cLong * Math.sin(relColYaw) + cLat * Math.cos(relColYaw)) <= col.halfWidth + egoPadL * absSC + egoPadW * absCC;
          if (overlapEgoAxes && overlapColAxes) {
            return false;
          }
        }
      }
    }

    // 4. Verify dynamic & static perceived traffic actors along the adjacent bypass corridor over maneuver horizon
    const cosY = Math.cos(this.simRevPose.yaw);
    const sinY = Math.sin(this.simRevPose.yaw);
    const fx = -sinY;
    const fz = -cosY;
    const rx = cosY;
    const rz = -sinY;
    const minForwardS = -egoHalfL - 2.5;
    const maxForwardS = totalPulloutM + 4.0;
    const bypassDurationS = 5.5;

    for (let i = 0; i < actorCount; i++) {
      const a = actors[i]!;
      if (a.id === obstacle.leadActorId) continue;

      const dx = a.x - this.simRevPose.x;
      const dz = a.z - this.simRevPose.z;
      const sRelNow = dx * fx + dz * fz;
      const dRelNow = dx * rx + dz * rz;

      const relYaw = wrapADASAngle(a.yaw - this.simRevPose.yaw);
      const absCos = Math.abs(Math.cos(relYaw));
      const absSin = Math.abs(Math.sin(relYaw));
      const aHalfL = Math.max(0.25, a.length * 0.5);
      const aHalfW = Math.max(0.25, a.width * 0.5);
      const halfLat = aHalfW * absCos + aHalfL * absSin;
      const halfLong = aHalfL * absCos + aHalfW * absSin;

      const vLong = a.vx * fx + a.vz * fz;
      const vLat = a.vx * rx + a.vz * rz;

      const inTargetNow = Math.abs(dRelNow - targetLaneLatOffset) <= laneW * 0.52 + halfLat;
      const inTargetFuture = Math.abs(dRelNow + vLat * 2.5 - targetLaneLatOffset) <= laneW * 0.52 + halfLat;
      if (!inTargetNow && !inTargetFuture) continue;

      if (vLong < -1.2 && sRelNow > minForwardS && sRelNow < maxForwardS + Math.abs(vLong) * bypassDurationS) {
        return false; // oncoming vehicle in bypass corridor
      }

      if (a.kind === 'static-obstacle' || a.kind === 'road-block' || Math.abs(a.speed) < 0.35) {
        if (sRelNow + halfLong >= minForwardS && sRelNow - halfLong <= maxForwardS) {
          return false; // static or stopped obstruction inside bypass lane
        }
      } else {
        const sPredEnd = sRelNow + vLong * bypassDurationS;
        const spanMin = Math.min(sRelNow, sPredEnd) - halfLong;
        const spanMax = Math.max(sRelNow, sPredEnd) + halfLong;
        if (spanMax >= minForwardS - 4.0 && spanMin <= maxForwardS) {
          return false; // moving traffic occupying bypass corridor during maneuver
        }
      }
    }

    return candidateRevM > 0;
  }

  private evaluateRearCorridorSafety(
    neededReverseM: number,
    vehicle: Readonly<ADASVehicleState>,
    world: ADASWorldContext,
    plan: Readonly<ADASPlanSnapshot>,
    actors: readonly TrafficActorSnapshot[],
    actorCount: number,
  ): { safe: boolean; reason: string } {
    const out = this.rearSafetyResult;
    const egoHalfL = vehicle.vehicleLength * 0.5;
    const egoHalfW = vehicle.vehicleWidth * 0.5;
    const cosY = Math.cos(vehicle.yaw);
    const sinY = Math.sin(vehicle.yaw);
    const fx = -sinY;
    const fz = -cosY;
    const rx = cosY;
    const rz = -sinY;

    const reqClearM = neededReverseM + 4.0;
    const estReverseTimeS = neededReverseM / 1.25 + 3.2;

    // 1. Prohibit reversing into or across rear road intersections
    const checkIntersections = (
      intersections: readonly { center: { x: number; z: number }; halfExtentX: number; halfExtentZ: number }[] | undefined,
    ): boolean => {
      if (!intersections) return false;
      for (let i = 0; i < intersections.length; i++) {
        const j = intersections[i]!;
        const extX = (j.halfExtentX || 10) + 6.0;
        const extZ = (j.halfExtentZ || 10) + 6.0;
        for (let step = 0; step <= 3; step++) {
          const backS = (reqClearM * step) / 3;
          const px = vehicle.x - fx * backS;
          const pz = vehicle.z - fz * backS;
          if (Math.abs(px - j.center.x) <= extX && Math.abs(pz - j.center.z) <= extZ) {
            return true;
          }
        }
      }
      return false;
    };
    if (checkIntersections(world.roadNetwork?.intersections) || checkIntersections(world.nearbyNetwork?.intersections)) {
      out.safe = false;
      out.reason = '后方存在交叉路口，禁止自动倒车';
      return out;
    }

    // 2. Verify backward trajectory stays within original lane boundaries & road edges
    if (plan.valid && plan.sampleCount >= 2) {
      const laneW = Math.max(2.8, plan.currentLaneWidth || 3.5);
      const maxAllowLat = Math.max(0.85, laneW * 0.5 - egoHalfW + 0.25);
      for (let probe = 1; probe <= 2; probe++) {
        const backDist = neededReverseM * probe * 0.5;
        const bx = vehicle.x - fx * backDist;
        const bz = vehicle.z - fz * backDist;
        let bestIdx = 0;
        let bestDistSq = Infinity;
        for (let k = 0; k < plan.sampleCount; k++) {
          const sp = plan.samples[k]!;
          const dSq = (bx - sp.x) * (bx - sp.x) + (bz - sp.z) * (bz - sp.z);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = k;
          }
        }
        const matched = plan.samples[bestIdx]!;
        const mCos = Math.cos(matched.yaw);
        const mSin = Math.sin(matched.yaw);
        const latOffset = (bx - matched.x) * mCos - (bz - matched.z) * mSin;
        if (Math.abs(latOffset) > maxAllowLat) {
          out.safe = false;
          out.reason = '倒车轨迹将越过原车道边界，存在偏离风险';
          return out;
        }
      }
    }

    // 3. Check all rear traffic actors (vehicles, pedestrians, cyclists/e-bikes, fixed obstacles), across full perception range
    for (let i = 0; i < actorCount; i++) {
      const a = actors[i]!;
      const dx = a.x - vehicle.x;
      const dz = a.z - vehicle.z;
      const sRel = dx * fx + dz * fz; // negative behind vehicle
      const dRel = dx * rx + dz * rz;
      if (sRel >= egoHalfL * 0.5) continue;

      const relYaw = wrapADASAngle(a.yaw - vehicle.yaw);
      const absCos = Math.abs(Math.cos(relYaw));
      const absSin = Math.abs(Math.sin(relYaw));
      const aHalfL = Math.max(0.25, a.length * 0.5);
      const aHalfW = Math.max(0.25, a.width * 0.5);
      const halfLat = aHalfW * absCos + aHalfL * absSin;
      const halfLong = aHalfL * absCos + aHalfW * absSin;

      const isVulnerable = a.kind === 'pedestrian' || a.kind === 'cyclist';
      const latSafetyMargin = isVulnerable ? 0.75 : 0.45;
      const inRearCorridor = Math.abs(dRel) <= egoHalfW + halfLat + latSafetyMargin;
      const rearGap = -sRel - egoHalfL - halfLong;

      const vLong = a.vx * fx + a.vz * fz; // > 0 means approaching ego rear from behind
      const vLat = a.vx * rx + a.vz * rz;
      const movingIntoCorridor =
        !inRearCorridor &&
        dRel * vLat < -0.20 &&
        Math.abs(dRel + vLat * (isVulnerable ? 3.0 : 2.2)) <= egoHalfW + halfLat + latSafetyMargin;
      if (!inRearCorridor && !movingIntoCorridor) continue;

      if (rearGap <= reqClearM) {
        out.safe = false;
        out.reason = a.kind === 'pedestrian'
          ? '后方有行人，停止倒车'
          : a.kind === 'cyclist'
            ? '后方有非机动车，停止倒车'
            : '后方倒车安全空间不足';
        return out;
      }

      // Full-range dynamic rear approach prediction (never ignore approaching speed even if temporarily far)
      if (vLong > 0.20) {
        const closingSpeed = vLong + 1.8;
        const ttc = Math.max(0, rearGap) / closingSpeed;
        const predGap = rearGap - closingSpeed * estReverseTimeS;
        if (ttc < 5.5 || predGap < 6.0) {
          out.safe = false;
          out.reason = isVulnerable ? '后方行人/骑行者快速接近，存在碰撞风险' : '后方来车快速接近，存在碰撞风险';
          return out;
        }
      }
    }

    // 4. Direct check against nearby static world colliders (walls, guardrails, posts behind ego)
    if (world.queryNearbyColliders) {
      const colliders: readonly StaticCollider[] = world.queryNearbyColliders(
        { x: vehicle.x - fx * (reqClearM * 0.5), z: vehicle.z - fz * (reqClearM * 0.5) },
        reqClearM + 6.0,
      );
      for (let i = 0; i < colliders.length; i++) {
        const col = colliders[i]!;
        if (col.maxHeight < 0.35 || col.minHeight > vehicle.y + 1.9) continue;
        const dx = col.center.x - vehicle.x;
        const dz = col.center.z - vehicle.z;
        const sRel = dx * fx + dz * fz;
        if (sRel >= -egoHalfL * 0.25) continue;

        const relYaw = wrapADASAngle(col.yaw - vehicle.yaw);
        const absCos = Math.abs(Math.cos(relYaw));
        const absSin = Math.abs(Math.sin(relYaw));
        const halfLat = col.halfWidth * absCos + col.halfLength * absSin;
        const halfLong = col.halfLength * absCos + col.halfWidth * absSin;
        const dRel = dx * rx + dz * rz;
        if (Math.abs(dRel) <= egoHalfW + halfLat + 0.25) {
          const rearGap = -sRel - egoHalfL - halfLong;
          if (rearGap <= reqClearM) {
            out.safe = false;
            out.reason = '后方有固定路障/护栏，空间不足';
            return out;
          }
        }
      }
    }

    out.safe = true;
    out.reason = '';
    return out;
  }

  private computeReverseTrailSteering(
    dt: number,
    vehicle: Readonly<ADASVehicleState>,
    plan: Readonly<ADASPlanSnapshot>,
  ): number {
    let refX = this.reverseStartX;
    let refZ = this.reverseStartZ;
    let refYaw = this.reverseStartYaw;

    // Prefer recorded forward breadcrumb trail; fallback to backward path samples
    if (this.trailCount >= 2) {
      let bestDistSq = Infinity;
      let bestIdx = 0;
      const oldest = (this.trailHead - this.trailCount + TRAIL_CAPACITY) % TRAIL_CAPACITY;
      for (let k = 0; k < this.trailCount; k++) {
        const idx = (oldest + k) % TRAIL_CAPACITY;
        const dx = vehicle.x - this.trailX[idx]!;
        const dz = vehicle.z - this.trailZ[idx]!;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
      refX = this.trailX[bestIdx]!;
      refZ = this.trailZ[bestIdx]!;
      refYaw = this.trailYaw[bestIdx]!;
    } else if (plan.valid && plan.sampleCount >= 2) {
      const sp = plan.samples[Math.max(0, Math.min(plan.sampleCount - 1, plan.egoSampleIndex))]!;
      refX = sp.x;
      refZ = sp.z;
      refYaw = sp.yaw;
    }

    const cosY = Math.cos(refYaw);
    const sinY = Math.sin(refYaw);
    const latErr = (vehicle.x - refX) * cosY - (vehicle.z - refZ) * sinY;
    const headingErr = wrapADASAngle(refYaw - vehicle.yaw);

    // Hurwitz-stable reverse path-following feedback (gentle gains, avoid sudden opposite lock)
    const targetSteer = clampADAS(
      -clampADAS(0.08 * latErr, -0.18, 0.18) + clampADAS(0.42 * headingErr, -0.22, 0.22),
      -0.28,
      0.28,
    );
    const alpha = 1 - Math.exp(-6.0 * Math.max(0, dt));
    this.reverseSmoothedSteer += (targetSteer - this.reverseSmoothedSteer) * alpha;
    return this.reverseSmoothedSteer;
  }
}
