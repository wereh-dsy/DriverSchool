import {
  clampADAS,
  createEmptyLocalTrajectoryState,
  evaluateLocalTrajectoryCurvatureAtDs,
  evaluateLocalTrajectoryOffsetAtDs,
  evaluateLocalTrajectorySlopeAtDs,
  wrapADASAngle,
  type ADASConfig,
  type ADASPlanSnapshot,
  type ADASVehicleState,
  type ADASWorldContext,
  type AdjacentLaneClearance,
  type LocalTrajectoryState,
  type TrafficActorSnapshot,
  type TurnSignalRequest,
} from './ADASTypes';

interface ProjectedCorridorObstacle {
  id: string;
  sRel: number;
  dRel: number;
  relYaw: number;
  halfL: number;
  halfW: number;
  projHalfLat: number;
  projHalfLong: number;
  vLong: number;
  vLat: number;
  accel: number;
  isStatic: boolean;
  isInfrastructure: boolean;
  isOncoming: boolean;
  timestamp: number;
  hasTraj: boolean;
  actor: TrafficActorSnapshot | null;
}

const MAX_CORRIDOR_OBSTACLES = 24;
const MAX_CANDIDATES = 16;
const SWEPT_CHECK_STEPS = 7;

function createEmptyProjectedObs(): ProjectedCorridorObstacle {
  return {
    id: '',
    sRel: 0,
    dRel: 0,
    relYaw: 0,
    halfL: 0,
    halfW: 0,
    projHalfLat: 0,
    projHalfLong: 0,
    vLong: 0,
    vLat: 0,
    accel: 0,
    isStatic: true,
    isInfrastructure: false,
    isOncoming: false,
    timestamp: 0,
    hasTraj: false,
    actor: null,
  };
}

/**
 * Continuous drivable-corridor & multi-candidate quintic local trajectory planner.
 *
 * Replaces rigid lane-centerline tracking with a flexible drivable space `[hardLeft, hardRight]`
 * supporting:
 * - In-lane lateral offsets & edge hugging around partial/narrow hazards
 * - Conditional solid-line straddling / partial encroachment when avoiding unavoidable static blocks
 * - Full swept-volume 2D OBB + overhang + turning-radius verification along candidate quintic S-curves
 * - Dynamic actor trajectory prediction & tail-clearance lock before returning to nominal reference
 * - Smooth initialization from actual vehicle `(offset, heading)` after driver steering intervention
 *
 * Zero per-tick heap allocations.
 */
export class LocalTrajectoryPlanner {
  public readonly state: LocalTrajectoryState = createEmptyLocalTrajectoryState();

  private readonly obsPool: ProjectedCorridorObstacle[] = Array.from(
    { length: MAX_CORRIDOR_OBSTACLES },
    createEmptyProjectedObs,
  );
  private obsCount = 0;

  private readonly candidates = new Float64Array(MAX_CANDIDATES);
  private candidateCount = 0;

  private lockedTargetOffsetM = 0;
  private lockCooldownS = 0;
  private driverHoldOffsetM = 0;
  private driverHoldActive = false;
  private driverHoldElapsedS = 0;
  private remainingTailClearM = 0;

  public reset(): void {
    Object.assign(this.state, createEmptyLocalTrajectoryState());
    this.obsCount = 0;
    this.candidateCount = 0;
    this.lockedTargetOffsetM = 0;
    this.lockCooldownS = 0;
    this.driverHoldOffsetM = 0;
    this.driverHoldActive = false;
    this.driverHoldElapsedS = 0;
    this.remainingTailClearM = 0;
  }

  /**
   * Called synchronously on the exact frame driver steering override finishes so ADAS
   * resumes from the vehicle's actual lateral pose without yanking back to an old reference.
   */
  public notifyDriverSteeringReleased(
    vehicle: ADASVehicleState,
    plan: Readonly<ADASPlanSnapshot>,
  ): void {
    if (!plan.valid || plan.sampleCount < 2) {
      this.reset();
      return;
    }
    const sp = plan.samples[plan.egoSampleIndex]!;
    const cosY = Math.cos(sp.yaw);
    const sinY = Math.sin(sp.yaw);
    const rawLat = (vehicle.x - sp.x) * cosY - (vehicle.z - sp.z) * sinY;
    const laneW = Math.max(2.6, plan.currentLaneWidth || 3.5);
    const halfW = vehicle.vehicleWidth * 0.5;
    const maxSafeOffset = Math.max(0.25, laneW * 0.5 - halfW + 0.35);
    const clampedLat = clampADAS(rawLat, -maxSafeOffset, maxSafeOffset);

    this.driverHoldOffsetM = Math.abs(clampedLat) > 0.14 ? clampedLat : 0;
    this.driverHoldActive = Math.abs(this.driverHoldOffsetM) > 0.14;
    this.driverHoldElapsedS = 0;

    if (this.driverHoldActive) {
      this.lockedTargetOffsetM = this.driverHoldOffsetM;
      this.state.active = true;
      this.state.mode = 'driver_offset_hold';
      this.state.startOffsetM = this.driverHoldOffsetM;
      this.state.targetOffsetM = this.driverHoldOffsetM;
      this.state.currentOffsetM = this.driverHoldOffsetM;
      this.state.currentHeadingShiftRad = 0;
      this.state.currentCurvature = 0;
      this.state.elapsedDistM = 0;
      this.state.transitionLengthM = clampADAS(Math.max(18, vehicle.speed * 2.0), 18, 42);
      this.state.remainingTailClearM = 0;
      this.state.reason = '沿驾驶员调整位置平稳继续';
    } else {
      this.lockedTargetOffsetM = 0;
      this.state.active = false;
      this.state.mode = 'center';
      this.state.startOffsetM = 0;
      this.state.targetOffsetM = 0;
      this.state.currentOffsetM = 0;
      this.state.currentHeadingShiftRad = 0;
      this.state.currentCurvature = 0;
      this.state.elapsedDistM = 0;
      this.state.remainingTailClearM = 0;
    }
    this.remainingTailClearM = 0;
    this.lockCooldownS = 0.8;
  }

  /**
   * High-rate 120 Hz evaluation of the active continuous quintic offset trajectory.
   */
  public stepClock(
    dt: number,
    vehicle: ADASVehicleState,
    plan: Readonly<ADASPlanSnapshot>,
  ): void {
    const st = this.state;
    const dsStep = Math.max(0, vehicle.speed) * Math.max(0, dt);
    if (this.lockCooldownS > 0) this.lockCooldownS = Math.max(0, this.lockCooldownS - dt);
    if (this.driverHoldActive) this.driverHoldElapsedS += dt;
    if (this.remainingTailClearM > 0) {
      this.remainingTailClearM = Math.max(0, this.remainingTailClearM - dsStep);
    }
    st.remainingTailClearM = this.remainingTailClearM;

    if (!plan.valid || !st.active || plan.laneChange.active) {
      if (plan.laneChange.active && st.active) {
        // Yield cleanly without jumping when a full discrete lane change takes over
        const decay = 1 - Math.exp(-6.0 * Math.max(0, dt));
        st.currentOffsetM += (0 - st.currentOffsetM) * decay;
        st.currentHeadingShiftRad *= 1 - decay;
        st.currentCurvature = 0;
        if (Math.abs(st.currentOffsetM) < 0.03) {
          st.active = false;
          st.mode = 'lane_change';
          st.targetOffsetM = 0;
          st.startOffsetM = 0;
          st.currentOffsetM = 0;
          st.elapsedDistM = 0;
        }
      } else {
        st.currentOffsetM = 0;
        st.currentHeadingShiftRad = 0;
        st.currentCurvature = 0;
        st.elapsedDistM = 0;
      }
      return;
    }

    st.elapsedDistM += dsStep;
    const offset = evaluateLocalTrajectoryOffsetAtDs(st, 0);
    const slope = evaluateLocalTrajectorySlopeAtDs(st, 0);
    const curv = evaluateLocalTrajectoryCurvatureAtDs(st, 0);
    st.currentOffsetM = offset;
    st.currentHeadingShiftRad = Math.atan(slope);
    st.currentCurvature = curv;

    // Deactivate cleanly once smoothly settled back to centerline past obstacle tail
    if (
      Math.abs(st.targetOffsetM) < 0.06 &&
      Math.abs(offset) < 0.06 &&
      st.elapsedDistM >= st.transitionLengthM - 0.5 &&
      this.remainingTailClearM <= 0
    ) {
      st.active = false;
      st.mode = 'center';
      st.startOffsetM = 0;
      st.targetOffsetM = 0;
      st.currentOffsetM = 0;
      st.currentHeadingShiftRad = 0;
      st.currentCurvature = 0;
      st.elapsedDistM = 0;
      st.remainingTailClearM = 0;
      st.boundaryEncroachment = 'none';
      st.speedCapMps = Infinity;
      st.reason = '';
      this.lockedTargetOffsetM = 0;
      this.remainingTailClearM = 0;
    }
  }

  /**
   * 20 Hz drivable-corridor construction + multi-candidate local trajectory evaluation.
   */
  public update(
    _dt: number,
    vehicle: ADASVehicleState,
    plan: ADASPlanSnapshot,
    actors: readonly TrafficActorSnapshot[],
    actorCount: number,
    world: ADASWorldContext,
    config: Readonly<ADASConfig>,
    driverSteeringOverride: boolean,
    manualSignalIntent: TurnSignalRequest,
    leftLane?: Readonly<AdjacentLaneClearance>,
    rightLane?: Readonly<AdjacentLaneClearance>,
  ): LocalTrajectoryState {
    const st = this.state;
    plan.localTrajectory = st;

    if (!plan.valid || plan.sampleCount < 2 || driverSteeringOverride) {
      if (driverSteeringOverride) {
        this.driverHoldActive = false;
        this.remainingTailClearM = 0;
      }
      st.active = false;
      st.mode = 'center';
      st.targetOffsetM = 0;
      st.currentOffsetM = 0;
      st.currentHeadingShiftRad = 0;
      st.currentCurvature = 0;
      st.elapsedDistM = 0;
      st.remainingTailClearM = 0;
      st.speedCapMps = Infinity;
      st.boundaryEncroachment = 'none';
      return st;
    }

    // If a discrete multi-lane change / overtake is already executing, defer smoothly to laneChange
    if (plan.laneChange.active) {
      this.driverHoldActive = false;
      this.lockedTargetOffsetM = 0;
      this.remainingTailClearM = 0;
      st.mode = 'lane_change';
      st.targetOffsetM = 0;
      st.remainingTailClearM = 0;
      st.speedCapMps = Infinity;
      st.boundaryEncroachment = 'none';
      return st;
    }

    const laneW = Math.max(2.6, plan.currentLaneWidth || 3.5);
    const k = plan.currentApproachLaneIndex;
    const N = Math.max(1, plan.currentApproachLaneCount);
    const leftB = plan.leftBoundary;
    const rightB = plan.rightBoundary;
    const egoHalfW = vehicle.vehicleWidth * 0.5;
    const egoHalfL = vehicle.vehicleLength * 0.5;
    const wheelBase = Math.max(2.0, vehicle.wheelBase);
    const egoSpeed = Math.max(0, vehicle.speed);
    const grip = clampADAS(world.roadGripMultiplier ?? vehicle.roadGripMultiplier ?? 1.0, 0.38, 1.05);
    const safetyLatPad = egoSpeed > 18 ? 0.14 : 0.10;
    const egoEffHalfW = egoHalfW + safetyLatPad;

    // 1. Construct base road & boundary drivable bounds relative to current lane centerline
    let hardLeft = -laneW * 0.5 + 0.06;
    if (k > 0 && leftB !== 'median' && leftB !== 'road-edge') {
      hardLeft = -k * laneW - laneW * 0.5 + 0.10;
    } else if (k === 0 && leftB === 'solid') {
      // Edge lane bordered by solid divider (two-way or shoulder): never hard-cross into oncoming
      hardLeft = -laneW * 0.5 + 0.06;
    }

    let hardRight = laneW * 0.5 - 0.06;
    if (k < N - 1 && rightB !== 'median' && rightB !== 'road-edge') {
      hardRight = (N - 1 - k + 0.5) * laneW - 0.10;
    }

    const leftDashLegal = leftB === 'dashed' && !plan.inJunction && !plan.nearJunctionSolidZone;
    const rightDashLegal = rightB === 'dashed' && !plan.inJunction && !plan.nearJunctionSolidZone;
    const softLeft = leftDashLegal ? hardLeft : -laneW * 0.5 + 0.06;
    const softRight = rightDashLegal ? hardRight : laneW * 0.5 - 0.06;

    // 2. Project relevant obstacles into corridor frame & tighten hard barrier bounds
    const maxLookAheadM = Math.max(46, egoSpeed * 3.8 + 20);
    this.obsCount = 0;
    let nearestNominalBlockerIdx = -1;
    let nearestBlockerS = Infinity;
    let hasOncomingLeft = false;
    let hasOncomingRight = false;

    const samples = plan.samples;
    const sampleCount = plan.sampleCount;
    const nActors = Math.min(actors.length, actorCount);

    for (let i = 0; i < nActors && this.obsCount < MAX_CORRIDOR_OBSTACLES; i++) {
      const a = actors[i]!;
      const pObs = this.obsPool[this.obsCount]!;
      if (!this.projectActorIntoLocalFrame(a, vehicle, plan, samples, sampleCount, pObs)) continue;

      // Keep actors within lateral reach & ahead horizon (including side-by-side tail overlap)
      if (pObs.sRel + pObs.projHalfLong < -egoHalfL - 2.5 || pObs.sRel - pObs.projHalfLong > maxLookAheadM) {
        continue;
      }
      if (Math.abs(pObs.dRel) > Math.max(laneW * 1.85, 6.5) + pObs.projHalfLat) {
        continue;
      }

      // Skip harmless roadside posts/boards outside road surface
      const isInfra = pObs.isInfrastructure;
      if (isInfra && pObs.dRel + pObs.projHalfLat < hardLeft - 0.05 && pObs.dRel < 0) continue;
      if (isInfra && pObs.dRel - pObs.projHalfLat > hardRight + 0.05 && pObs.dRel > 0) continue;

      if (pObs.isOncoming) {
        if (pObs.dRel < 0) hasOncomingLeft = true;
        else hasOncomingRight = true;
      }

      // Static infrastructure walls / barriers / piers inside road corridor act as hard physical bounds
      if (isInfra && pObs.sRel > -egoHalfL && pObs.sRel < maxLookAheadM) {
        const infraClearPad = 0.18;
        if (pObs.dRel <= 0.1) {
          hardLeft = Math.max(hardLeft, pObs.dRel + pObs.projHalfLat + infraClearPad);
        }
        if (pObs.dRel >= -0.1) {
          hardRight = Math.min(hardRight, pObs.dRel - pObs.projHalfLat - infraClearPad);
        }
      }

      // Track whether any static/stopped/very-slow obstacle overlaps nominal lane center corridor
      const slowOrStatic = pObs.isStatic || pObs.vLong < Math.max(2.0, plan.currentSpeedLimitMps * 0.45);
      const overlapsCenter = Math.abs(pObs.dRel) <= egoEffHalfW + pObs.projHalfLat + 0.14;
      if (slowOrStatic && overlapsCenter && pObs.sRel + pObs.projHalfLong > -egoHalfL) {
        if (pObs.sRel < nearestBlockerS) {
          nearestBlockerS = pObs.sRel;
          nearestNominalBlockerIdx = this.obsCount;
        }
      }

      this.obsCount++;
    }

    // Clamp driver-offset hold cleanly once traffic catches up or expires slowly if totally clear
    if (this.driverHoldActive) {
      if (
        this.driverHoldOffsetM - egoEffHalfW < hardLeft ||
        this.driverHoldOffsetM + egoEffHalfW > hardRight ||
        (this.driverHoldElapsedS > 4.5 && nearestNominalBlockerIdx < 0 && egoSpeed > 7.5)
      ) {
        this.driverHoldActive = false;
      }
    }

    st.corridorLeftHardM = hardLeft;
    st.corridorRightHardM = hardRight;
    st.corridorLeftSoftM = Math.max(hardLeft, softLeft);
    st.corridorRightSoftM = Math.min(hardRight, softRight);

    // Early clean center path when no obstacles threaten drivable corridor, no driver hold, and no active bypass return
    const hasObstacleOrReturnNeed =
      this.obsCount > 0 || this.driverHoldActive || this.remainingTailClearM > 0 || st.active;
    if (!hasObstacleOrReturnNeed) {
      st.active = false;
      st.mode = 'center';
      st.startOffsetM = 0;
      st.targetOffsetM = 0;
      st.currentOffsetM = 0;
      st.currentHeadingShiftRad = 0;
      st.currentCurvature = 0;
      st.elapsedDistM = 0;
      st.remainingTailClearM = 0;
      st.boundaryEncroachment = 'none';
      st.speedCapMps = Infinity;
      st.reason = '';
      this.lockedTargetOffsetM = 0;
      return st;
    }

    // If vehicle cannot physically fit inside hard bounds anywhere, abort offset planning cleanly
    if (hardRight - hardLeft < egoEffHalfW * 2.0) {
      st.active = false;
      st.mode = 'center';
      st.targetOffsetM = 0;
      st.speedCapMps = Infinity;
      st.reason = '物理可行驶走廊不足';
      return st;
    }

    // Current offset state from where the next smooth candidate S-curve starts
    const currentActualLat = plan.valid && plan.sampleCount >= 2
      ? (vehicle.x - samples[plan.egoSampleIndex]!.x) * Math.cos(samples[plan.egoSampleIndex]!.yaw) -
        (vehicle.z - samples[plan.egoSampleIndex]!.z) * Math.sin(samples[plan.egoSampleIndex]!.yaw)
      : 0;
    const dNow = st.active
      ? clampADAS(st.currentOffsetM, hardLeft + egoEffHalfW, hardRight - egoEffHalfW)
      : clampADAS(currentActualLat, hardLeft + egoEffHalfW, hardRight - egoEffHalfW);

    // Update bypassed tail clearance gate: if we are currently offset bypassing an obstacle, keep rear tail safe
    for (let i = 0; i < this.obsCount; i++) {
      const o = this.obsPool[i]!;
      const obsCenterConflict = Math.abs(o.dRel) <= egoEffHalfW + o.projHalfLat + 0.18;
      if (obsCenterConflict && Math.abs(dNow) > 0.28 && Math.abs(o.dRel - dNow) > egoEffHalfW + o.projHalfLat * 0.4) {
        const tailClearDistM = (o.sRel + o.projHalfLong) + egoHalfL * 1.35 + 2.2;
        if (tailClearDistM > this.remainingTailClearM) {
          this.remainingTailClearM = tailClearDistM;
        }
      }
    }
    st.remainingTailClearM = this.remainingTailClearM;

    // 3. Build discrete candidate continuous lateral offsets (zero heap allocations)
    this.candidateCount = 0;
    const pushCandidate = (d: number) => {
      if (!Number.isFinite(d) || this.candidateCount >= MAX_CANDIDATES) return;
      if (d - egoEffHalfW < hardLeft || d + egoEffHalfW > hardRight) return;
      for (let j = 0; j < this.candidateCount; j++) {
        if (Math.abs(this.candidates[j]! - d) < 0.08) return;
      }
      this.candidates[this.candidateCount++] = d;
    };

    const tailLocked = this.remainingTailClearM > 0.1;
    if (!tailLocked) {
      pushCandidate(0);
    }
    if (st.active && Math.abs(this.lockedTargetOffsetM) > 0.12) {
      pushCandidate(this.lockedTargetOffsetM);
    }
    if (this.driverHoldActive && Math.abs(this.driverHoldOffsetM) > 0.14) {
      pushCandidate(this.driverHoldOffsetM);
    }

    // In-lane left/right edge-hug offsets (stay inside lane boundaries completely)
    const inLaneMaxLeft = Math.max(hardLeft + egoEffHalfW, -(laneW * 0.5 - egoHalfW - 0.12));
    const inLaneMaxRight = Math.min(hardRight - egoEffHalfW, +(laneW * 0.5 - egoHalfW - 0.12));
    if (inLaneMaxLeft < -0.15) pushCandidate(inLaneMaxLeft);
    if (inLaneMaxRight > 0.15) pushCandidate(inLaneMaxRight);
    if (inLaneMaxLeft * 0.55 < -0.15) pushCandidate(inLaneMaxLeft * 0.55);
    if (inLaneMaxRight * 0.55 > 0.15) pushCandidate(inLaneMaxRight * 0.55);

    // Partial straddle / encroachment candidates (both dashed or conditional solid when avoiding blocker)
    let hasDynamicLeftNeighbor = false;
    let hasDynamicRightNeighbor = false;
    for (let i = 0; i < this.obsCount; i++) {
      const o = this.obsPool[i]!;
      if (!o.isStatic && o.sRel > -25 && o.sRel < 38) {
        if (o.dRel < -laneW * 0.45 && o.dRel > -laneW * 1.65) hasDynamicLeftNeighbor = true;
        if (o.dRel > laneW * 0.45 && o.dRel < laneW * 1.65) hasDynamicRightNeighbor = true;
      }
    }

    const allowPartialLeft =
      k > 0 && leftB !== 'median' && leftB !== 'road-edge' && !hasOncomingLeft && !hasDynamicLeftNeighbor && (!leftLane || leftLane.safe) && !plan.inJunction;
    const allowPartialRight =
      k < N - 1 && rightB !== 'median' && rightB !== 'road-edge' && !hasOncomingRight && !hasDynamicRightNeighbor && (!rightLane || rightLane.safe) && !plan.inJunction;
    const inGore =
      plan.upcomingJunction.valid &&
      plan.upcomingJunction.isRampTransition &&
      plan.upcomingJunction.distanceToJunctionEntryM < 40;
    const hasStaticOrStoppedBlocker =
      nearestNominalBlockerIdx >= 0 &&
      (this.obsPool[nearestNominalBlockerIdx]!.isStatic || this.obsPool[nearestNominalBlockerIdx]!.vLong < 1.2) &&
      !inGore;

    if (allowPartialLeft && (leftDashLegal || (hasStaticOrStoppedBlocker && plan.nearJunctionSolidZone))) {
      pushCandidate(-laneW * 0.36);
      pushCandidate(-laneW * 0.56);
      pushCandidate(-laneW * 0.78);
    }
    if (allowPartialRight && (rightDashLegal || (hasStaticOrStoppedBlocker && plan.nearJunctionSolidZone))) {
      pushCandidate(+laneW * 0.36);
      pushCandidate(+laneW * 0.56);
      pushCandidate(+laneW * 0.78);
    }

    // Exact tangent-clearance candidates around nearest blocking obstacle in nominal lane
    if (nearestNominalBlockerIdx >= 0) {
      const blk = this.obsPool[nearestNominalBlockerIdx]!;
      const passPad = clampADAS(config.obstacleBypassLateralMarginM * 0.55, 0.25, 0.55);
      const passL = blk.dRel - (blk.projHalfLat + egoEffHalfW + passPad);
      const passR = blk.dRel + (blk.projHalfLat + egoEffHalfW + passPad);
      if (passL >= hardLeft + egoEffHalfW && (passL >= softLeft + egoEffHalfW || (allowPartialLeft && (leftDashLegal || (hasStaticOrStoppedBlocker && plan.nearJunctionSolidZone))))) {
        pushCandidate(passL);
      }
      if (passR <= hardRight - egoEffHalfW && (passR <= softRight - egoEffHalfW || (allowPartialRight && (rightDashLegal || (hasStaticOrStoppedBlocker && plan.nearJunctionSolidZone))))) {
        pushCandidate(passR);
      }
    }

    // 4. Score every candidate trajectory by swept-body OBB collision + safety + rules + comfort + continuity
    const vPlan = Math.max(4.0, egoSpeed);
    const frontOverhang = vehicle.dynamicsProfile?.frontOverhangM ?? Math.max(0.5, (vehicle.vehicleLength - wheelBase) * 0.5);
    const rearOverhang = vehicle.dynamicsProfile?.rearOverhangM ?? frontOverhang;
    const minTurnRadius = vehicle.dynamicsProfile?.minTurningRadiusM ?? 5.5;
    const maxLatAccel = Math.max(0.65, config.laneChangeMaxLatAccelMps2 * grip);

    let bestOffset = NaN;
    let bestCost = Infinity;
    let bestMinClearance = Infinity;
    let bestTouchesSolid = false;
    let bestSolidSide: 'none' | 'left_solid' | 'right_solid' | 'dashed_neighbor' = 'none';
    let anyFeasible = false;

    for (let c = 0; c < this.candidateCount; c++) {
      const dCand = this.candidates[c]!;
      const deltaD = Math.abs(dCand - dNow);

      // Compute smooth transition distance adhering to turning radius, grip, and lat-accel caps
      const timeForAccel = deltaD > 0.15 ? Math.sqrt((5.7735 * deltaD) / maxLatAccel) : 1.0;
      const minRadDist = deltaD > 0.15 ? Math.sqrt(deltaD * minTurnRadius * 3.8) : 8.0;
      const transLen = clampADAS(Math.max(vPlan * timeForAccel, minRadDist, 14.0), 14.0, 52.0);
      const evalHorizon = Math.max(transLen + 8.0, Math.min(48.0, nearestBlockerS + 16.0));

      // Enforce soft legal rule: crossing a solid boundary ONLY permitted conditionally near junction solid approach!
      const crossesLeftEdge = dCand - egoEffHalfW < -laneW * 0.5 + 0.02;
      const crossesRightEdge = dCand + egoEffHalfW > laneW * 0.5 - 0.02;
      const touchesLeftSolid = crossesLeftEdge && !leftDashLegal;
      const touchesRightSolid = crossesRightEdge && !rightDashLegal;
      if ((touchesLeftSolid || touchesRightSolid) && (!hasStaticOrStoppedBlocker || !plan.nearJunctionSolidZone)) {
        continue;
      }

      // If an adjacent dashed lane is completely safe & route-compatible for a full turn-signal
      // lane change / overtake, defer crossing-the-dashed-line maneuvers to RouteLanePlanner
      // (while still allowing pure in-lane edge hugging without changing lanes).
      if (crossesLeftEdge && (!allowPartialLeft || (leftDashLegal && leftLane?.safe && leftLane.boundaryCrossable && leftLane.routeCompatible))) {
        continue;
      }
      if (crossesRightEdge && (!allowPartialRight || (rightDashLegal && rightLane?.safe && rightLane.boundaryCrossable && rightLane.routeCompatible))) {
        continue;
      }

      // Swept-volume 2D OBB + overhang/curvature check across candidate quintic curve
      let feasible = true;
      let minClearance = Infinity;

      for (let step = 0; step < SWEPT_CHECK_STEPS; step++) {
        const frac = step / (SWEPT_CHECK_STEPS - 1);
        const sSample = frac * evalHorizon;
        const tSample = sSample / vPlan;
        const tau = clampADAS(sSample / transLen, 0, 1);
        const sCurve = tau * tau * tau * (10 + tau * (-15 + 6 * tau));
        const dSample = dNow + (dCand - dNow) * sCurve;
        const dsDtau = 30 * tau * tau * (1 - tau) * (1 - tau);
        const slope = (dsDtau * (dCand - dNow)) / transLen;
        const egoRelYaw = Math.atan(slope);
        const pathK = Math.abs(samples[Math.min(sampleCount - 1, plan.egoSampleIndex + Math.round(sSample * 0.5))]?.curvature ?? 0);
        const swingPad = Math.min(0.28, (wheelBase * 0.25 + frontOverhang * 0.35 + rearOverhang * 0.25) * (Math.abs(egoRelYaw) + pathK * 1.8));

        // Hard boundary check at every intermediate point along the S-curve
        if (dSample - egoEffHalfW - swingPad * 0.5 < hardLeft || dSample + egoEffHalfW + swingPad * 0.5 > hardRight) {
          feasible = false;
          break;
        }

        // Check every corridor obstacle (with future predicted trajectory for dynamic actors)
        for (let oi = 0; oi < this.obsCount; oi++) {
          const o = this.obsPool[oi]!;
          let actS = o.sRel;
          let actD = o.dRel;
          if (!o.isStatic && Math.abs(o.vLong) > 0.1) {
            const predVLong = Math.max(-4, o.vLong + clampADAS(o.accel, -3, 2.5) * tSample);
            actS = o.sRel + 0.5 * (o.vLong + predVLong) * tSample;
            const latDamp = tSample < 1.2 ? tSample : 1.2 + (tSample - 1.2) * 0.4;
            actD = o.dRel + o.vLat * latDamp;
          }
          // Fast longitudinal reject
          if (Math.abs(actS - sSample) > egoHalfL + o.projHalfLong + 2.5) continue;

          const edgeDist = Math.abs(actD - dSample) - (egoEffHalfW + swingPad + o.projHalfLat);
          if (edgeDist < minClearance) minClearance = edgeDist;

          const hit = this.doesOBBOverlapOBB(
            sSample,
            dSample,
            egoRelYaw,
            egoHalfL + 0.9,
            egoEffHalfW + swingPad,
            actS,
            actD,
            o.relYaw,
            o.halfL + 0.35,
            o.halfW + 0.08,
          );
          if (hit) {
            feasible = false;
            break;
          }
        }
        if (!feasible) break;
      }

      if (!feasible) continue;
      anyFeasible = true;

      // Multi-objective cost function
      let cost = 0;

      // (a) Preference for nominal lane center (or driver hold) when no obstacle demands offset
      const wantOffsetBias = this.driverHoldActive ? this.driverHoldOffsetM : 0;
      const refDiff = dCand - wantOffsetBias;
      cost += 2.2 * refDiff * refDiff;
      cost += 0.25 * dCand * dCand;

      // (b) Boundary encroachment cost (prefer inside own lane -> dashed neighbor -> conditional solid line)
      if (touchesLeftSolid || touchesRightSolid) {
        cost += 4.5 + Math.abs(dCand) * 1.4;
      } else if (crossesLeftEdge || crossesRightEdge) {
        cost += 1.8 + Math.abs(dCand) * 0.4;
      }

      // (c) Safety clearance reward / proximity penalty
      if (minClearance < 0.8) {
        cost += (0.8 - minClearance) * 3.5;
      }

      // (d) Continuity hysteresis: stick strongly to already-locked bypass offset while hazard remains!
      if (nearestNominalBlockerIdx >= 0 && st.active && Math.abs(dCand - this.lockedTargetOffsetM) < 0.22) {
        cost -= 1.85;
      } else if (st.active && Math.abs(dCand - this.lockedTargetOffsetM) > 0.35 && this.lockCooldownS > 0) {
        cost += 0.65;
      }

      // (e) Comfort curvature/lateral excursion penalty scaled inversely with grip (bounded below ref weight)
      cost += (deltaD * deltaD * 0.14) / grip;

      // (f) Slight alignment bonus with manual turn signal direction if active
      if (manualSignalIntent === 'left' && dCand < -0.2) cost -= 0.45;
      if (manualSignalIntent === 'right' && dCand > 0.2) cost -= 0.45;

      if (cost < bestCost) {
        bestCost = cost;
        bestOffset = dCand;
        bestMinClearance = minClearance;
        bestTouchesSolid = touchesLeftSolid || touchesRightSolid;
        bestSolidSide = touchesLeftSolid
          ? 'left_solid'
          : touchesRightSolid
            ? 'right_solid'
            : crossesLeftEdge || crossesRightEdge
              ? 'dashed_neighbor'
              : 'none';
      }
    }

    if (!anyFeasible || !Number.isFinite(bestOffset)) {
      // No safe continuous bypass exists (road is truly blocked) -> stay centered cleanly for IDM/AEB stop
      if (!st.active || Math.abs(st.currentOffsetM) < 0.08) {
        st.active = false;
        st.mode = 'center';
        st.targetOffsetM = 0;
        st.startOffsetM = 0;
        st.currentOffsetM = 0;
        st.boundaryEncroachment = 'none';
        st.speedCapMps = Infinity;
        st.reason = nearestNominalBlockerIdx >= 0 ? '无安全绕行走廊' : '';
      }
      return st;
    }

    // Activate continuous trajectory only when an intentional offset / return-from-offset is needed;
    // normal lane keeping (no obstacle, no driver hold, target=0, not already active) uses LaneFollowingController directly.
    const offsetSignificant = Math.abs(bestOffset) > 0.14 || (st.active && Math.abs(dNow) > 0.14);
    if (!offsetSignificant) {
      st.active = false;
      st.mode = 'center';
      st.startOffsetM = 0;
      st.targetOffsetM = 0;
      st.currentOffsetM = 0;
      st.currentHeadingShiftRad = 0;
      st.currentCurvature = 0;
      st.elapsedDistM = 0;
      st.boundaryEncroachment = 'none';
      st.speedCapMps = Infinity;
      st.reason = '';
      this.lockedTargetOffsetM = 0;
      return st;
    }

    // Lock or smoothly re-target quintic local trajectory from current offset `dNow` to `bestOffset`
    const targetChanged = !st.active || Math.abs(bestOffset - st.targetOffsetM) > 0.16;
    if (targetChanged) {
      const deltaD = Math.abs(bestOffset - dNow);
      const timeForAccel = deltaD > 0.15 ? Math.sqrt((5.7735 * deltaD) / maxLatAccel) : 1.2;
      const minRadDist = deltaD > 0.15 ? Math.sqrt(deltaD * minTurnRadius * 3.8) : 12.0;
      const transLen = clampADAS(Math.max(vPlan * timeForAccel, minRadDist, 16.0), 15.0, 56.0);

      st.active = true;
      st.startOffsetM = dNow;
      st.targetOffsetM = bestOffset;
      st.currentOffsetM = dNow;
      st.elapsedDistM = 0;
      st.transitionLengthM = transLen;
      this.lockedTargetOffsetM = bestOffset;
      this.lockCooldownS = 0.65;
    }

    st.boundaryEncroachment = bestSolidSide;
    st.mode = this.driverHoldActive && Math.abs(bestOffset - this.driverHoldOffsetM) < 0.25
      ? 'driver_offset_hold'
      : bestTouchesSolid
        ? 'partial_encroach'
        : Math.abs(bestOffset) > laneW * 0.5 - egoHalfW
          ? 'partial_encroach'
          : 'in_lane_offset';

    if (bestTouchesSolid) {
      st.speedCapMps = Math.min(config.obstacleBypassSpeedCapMps, Math.max(5.5, 9.5 * grip));
      st.reason = '借道实线局部绕行';
    } else if (st.mode === 'in_lane_offset') {
      st.speedCapMps = bestMinClearance < 0.55 ? Math.min(plan.currentSpeedLimitMps, 11.5 * grip) : Infinity;
      st.reason = nearestNominalBlockerIdx >= 0 ? '车道内连续偏移避障' : '车道内安全偏移';
    } else if (st.mode === 'partial_encroach') {
      st.speedCapMps = Math.min(plan.currentSpeedLimitMps, Math.max(7.5, config.obstacleBypassSpeedCapMps * 1.15 * grip));
      st.reason = '连续可行驶走廊绕行';
    } else {
      st.speedCapMps = Infinity;
      st.reason = '沿驾驶员调整位置平稳行驶';
    }

    return st;
  }

  private projectActorIntoLocalFrame(
    actor: TrafficActorSnapshot,
    vehicle: ADASVehicleState,
    plan: ADASPlanSnapshot,
    samples: ADASPlanSnapshot['samples'],
    sampleCount: number,
    out: ProjectedCorridorObstacle,
  ): boolean {
    let bestIdx = -1;
    let bestDistSq = Infinity;
    for (let i = 0; i < sampleCount; i++) {
      const sp = samples[i]!;
      const dx = actor.x - sp.x;
      const dz = actor.z - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestDistSq > 18 * 18) return false;

    const sp = samples[bestIdx]!;
    const minY = Number.isFinite(actor.minHeight) ? actor.minHeight! : actor.y;
    const maxY = Number.isFinite(actor.maxHeight) ? actor.maxHeight! : actor.y + actor.height;
    if (minY > sp.y + 1.90 || maxY < sp.y + 0.12) return false;

    const cosY = Math.cos(sp.yaw);
    const sinY = Math.sin(sp.yaw);
    const fx = -sinY, fz = -cosY;
    const rx = cosY, rz = -sinY;
    const dx = actor.x - sp.x;
    const dz = actor.z - sp.z;
    const alongDelta = dx * fx + dz * fz;

    out.id = actor.id;
    out.sRel = sp.s + alongDelta - plan.egoS;
    out.dRel = dx * rx + dz * rz;
    out.vLong = actor.vx * fx + actor.vz * fz;
    out.vLat = actor.vx * rx + actor.vz * rz;
    out.accel = actor.accel ?? 0;
    out.relYaw = wrapADASAngle(actor.yaw - sp.yaw);
    out.halfL = Math.max(0.2, actor.length * 0.5);
    out.halfW = Math.max(0.2, actor.width * 0.5);
    const absCos = Math.abs(Math.cos(out.relYaw));
    const absSin = Math.abs(Math.sin(out.relYaw));
    out.projHalfLat = out.halfW * absCos + out.halfL * absSin;
    out.projHalfLong = out.halfL * absCos + out.halfW * absSin;
    out.isStatic = actor.kind === 'static-obstacle' || Math.abs(actor.speed) < 0.25;
    out.isInfrastructure =
      actor.isInfrastructure === true ||
      (actor.kind === 'static-obstacle' &&
        (actor.id.includes(':post:') ||
          actor.id.includes(':board:') ||
          actor.id.includes(':pier:') ||
          actor.id.includes(':wall:') ||
          actor.id.includes(':barrier:') ||
          actor.id.includes(':median:')));
    out.isOncoming = !out.isStatic && out.vLong < -1.5;
    out.timestamp = Number.isFinite(actor.timestamp) ? actor.timestamp : 0;
    out.hasTraj = Boolean(actor.predictedTrajectory && actor.predictedTrajectory.length > 0);
    out.actor = actor;
    void vehicle;
    return true;
  }

  private doesOBBOverlapOBB(
    sA: number,
    dA: number,
    yawA: number,
    halfLA: number,
    halfWA: number,
    sB: number,
    dB: number,
    yawB: number,
    halfLB: number,
    halfWB: number,
  ): boolean {
    const ds = sB - sA;
    const dd = dB - dA;
    const cA = Math.cos(yawA), sA_sin = Math.sin(yawA);
    const cB = Math.cos(yawB), sB_sin = Math.sin(yawB);
    const dc = Math.abs(cA * cB + sA_sin * sB_sin);
    const dsin = Math.abs(-sA_sin * cB + cA * sB_sin);

    if (Math.abs(ds * cA + dd * sA_sin) > halfLA + halfLB * dc + halfWB * dsin) return false;
    if (Math.abs(-ds * sA_sin + dd * cA) > halfWA + halfLB * dsin + halfWB * dc) return false;
    if (Math.abs(ds * cB + dd * sB_sin) > halfLB + halfLA * dc + halfWA * dsin) return false;
    if (Math.abs(-ds * sB_sin + dd * cB) > halfWB + halfLA * dsin + halfWA * dc) return false;
    return true;
  }
}
