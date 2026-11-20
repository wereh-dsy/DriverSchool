import {
  clampADAS,
  evaluateLocalTrajectoryOffsetAtDs,
  wrapADASAngle,
  type ADASPlanSnapshot,
  type ADASSteeringCommand,
  type ADASVehicleState,
} from './ADASTypes';

/**
 * Vehicle-agnostic 120 Hz lateral trajectory tracking controller.
 * Combines Ackermann curvature feedforward, speed-scheduled Stanley feedback,
 * lookahead preview, yaw-rate/lateral-velocity damping, and exact inverse
 * SteeringSystem sensitivity mapping. Zero per-tick allocations.
 */
export class LaneFollowingController {
  public readonly command: ADASSteeringCommand = {
    steering: 0,
    lookAheadM: 8,
    targetCurvature: 0,
    active: false,
  };

  private smoothedSteering = 0;
  private filteredLatVel = 0;

  public reset(): void {
    this.smoothedSteering = 0;
    this.filteredLatVel = 0;
    this.command.steering = 0;
    this.command.lookAheadM = 8;
    this.command.targetCurvature = 0;
    this.command.active = false;
  }

  /** Sync internal output state to avoid jumps when re-acquiring from driver override. */
  public syncToSteering(currentSteering: number): void {
    this.smoothedSteering = Number.isFinite(currentSteering) ? clampADAS(currentSteering, -1, 1) : 0;
  }

  /** Sync internal steering command from live physical road-wheel angle on override release in curves. */
  public syncToPhysicalAngle(vehicle: ADASVehicleState, driverSteering = 0): void {
    const v = Math.max(0, vehicle.speed);
    const maxRoadAngle = Math.max(0.2, vehicle.steeringConfig.maxRoadWheelAngle);
    const sc = vehicle.steeringConfig;
    const refSpeed = Math.max(1, sc.highSpeedReferenceSpeed ?? 18);
    const minAuth = clampADAS(sc.highSpeedMinimumAuthority ?? 0.22, 0.05, 1);
    const speedAuthority = minAuth + (1 - minAuth) / (1 + (v / refSpeed) * (v / refSpeed));
    const anglePerCmd = Math.min(
      maxRoadAngle,
      (sc.steeringWheelLock * 0.5 * speedAuthority) / Math.max(1, sc.steeringRatio),
    );
    const physicalCmd = clampADAS(vehicle.steeringAngle / Math.max(0.005, anglePerCmd), -1, 1);
    const driverCmd = Number.isFinite(driverSteering) ? clampADAS(driverSteering, -1, 1) : 0;
    this.smoothedSteering = Math.abs(driverCmd) > Math.abs(physicalCmd) ? driverCmd : physicalCmd;
  }

  public update(
    dt: number,
    vehicle: ADASVehicleState,
    plan: ADASPlanSnapshot,
    laneChangeLatShiftM: number,
    laneChangeHeadingShiftRad: number,
    steeringBlend: number,
    active: boolean,
    laneChangeCurvature = 0,
  ): ADASSteeringCommand {
    const out = this.command;
    out.active = active && plan.valid && plan.sampleCount >= 2 && steeringBlend > 0.001;

    if (!out.active) {
      // Smoothly decay internal steering memory when yielded/inactive
      const decay = 1 - Math.exp(-8 * Math.max(0, dt));
      this.smoothedSteering += (0 - this.smoothedSteering) * decay;
      out.steering = 0;
      out.targetCurvature = 0;
      return out;
    }

    const v = Math.max(0, vehicle.speed);
    const L = Math.max(1.8, vehicle.wheelBase);
    const samples = plan.samples;
    const n = plan.sampleCount;

    // 1. Fast 120 Hz continuous segment-interpolated projection on pre-allocated plan samples
    //    Eliminates both 10 Hz planner lag AND 1.5m discrete sample-stepping steering jitter.
    const searchStart = Math.max(0, plan.egoSampleIndex - 4);
    const searchEnd = Math.min(n - 1, plan.egoSampleIndex + 12);
    let bestIdx = searchStart;
    let bestDistSq = Infinity;
    for (let i = searchStart; i <= searchEnd; i++) {
      const sp = samples[i]!;
      const dx = vehicle.x - sp.x;
      const dz = vehicle.z - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    let segA = samples[bestIdx]!;
    let segB = segA;
    let segU = 0;
    let bestSegErrSq = bestDistSq;
    for (let k = Math.max(0, bestIdx - 1); k < Math.min(n - 1, bestIdx + 1); k++) {
      const a = samples[k]!;
      const b = samples[k + 1]!;
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const lenSq = sx * sx + sz * sz;
      if (lenSq < 1e-6) continue;
      const u = clampADAS(((vehicle.x - a.x) * sx + (vehicle.z - a.z) * sz) / lenSq, 0, 1);
      const px = a.x + sx * u;
      const pz = a.z + sz * u;
      const ex = vehicle.x - px;
      const ez = vehicle.z - pz;
      const errSq = ex * ex + ez * ez;
      if (errSq <= bestSegErrSq + 1e-6) {
        bestSegErrSq = errSq;
        segA = a;
        segB = b;
        segU = u;
      }
    }

    const refX = segA.x + (segB.x - segA.x) * segU;
    const refZ = segA.z + (segB.z - segA.z) * segU;
    const refYaw = segA.yaw + wrapADASAngle(segB.yaw - segA.yaw) * segU;
    const refCurvature = segA.curvature + (segB.curvature - segA.curvature) * segU;
    const egoS = segA.s + (segB.s - segA.s) * segU;

    const cosY = Math.cos(refYaw);
    const sinY = Math.sin(refYaw);
    const rawLatErr = (vehicle.x - refX) * cosY - (vehicle.z - refZ) * sinY;

    const lt = plan.localTrajectory;
    const localShiftNow = lt && lt.active && lt.mode !== 'lane_change' ? lt.currentOffsetM : 0;
    const localHeadNow = lt && lt.active && lt.mode !== 'lane_change' ? lt.currentHeadingShiftRad : 0;
    const localCurvNow = lt && lt.active && lt.mode !== 'lane_change' ? lt.currentCurvature : 0;

    // Instantaneous cross-track & heading error relative to lane + active local trajectory / lane-change S-curve
    const latErr = rawLatErr - laneChangeLatShiftM - localShiftNow;
    const headingErr = wrapADASAngle((refYaw - laneChangeHeadingShiftRad - localHeadNow) - vehicle.yaw);

    // 2. Dynamic speed-dependent lookahead distance (short in tight turns, longer at highway speed & long wheelbases)
    const wbLookScale = 1.0 + clampADAS((L - 2.85) * 0.04, -0.04, 0.08) * smoothStep((v - 14) / 14);
    let lookAhead = clampADAS((4.5 + 0.55 * v + 0.011 * v * v) * wbLookScale, 4.5, 38.0);
    const absLocalK = Math.abs(refCurvature);
    if (plan.inJunction || absLocalK > 0.03) {
      lookAhead = Math.min(lookAhead, clampADAS(4.5 + 0.45 * v, 4.5, 10.0));
    }
    out.lookAheadM = lookAhead;

    // Continuously interpolate lookahead point at targetS along path
    const targetS = egoS + lookAhead;
    let lookIdx = bestIdx;
    while (lookIdx < n - 1 && samples[lookIdx]!.s < targetS) lookIdx++;
    let lookX = samples[lookIdx]!.x;
    let lookZ = samples[lookIdx]!.z;
    let lookYaw = samples[lookIdx]!.yaw;
    let lookCurvature = samples[lookIdx]!.curvature;
    if (lookIdx > 0 && targetS <= samples[lookIdx]!.s) {
      const a = samples[lookIdx - 1]!;
      const b = samples[lookIdx]!;
      const ds = b.s - a.s;
      const u = ds > 1e-4 ? clampADAS((targetS - a.s) / ds, 0, 1) : 1;
      lookX = a.x + (b.x - a.x) * u;
      lookZ = a.z + (b.z - a.z) * u;
      lookYaw = a.yaw + wrapADASAngle(b.yaw - a.yaw) * u;
      lookCurvature = a.curvature + (b.curvature - a.curvature) * u;
    }

    // Continuously interpolate short-horizon preview (steering rack lead ~0.26s, 3.0..8.5m) for curvature feedforward
    const ffLeadS = egoS + clampADAS(v * 0.26, 3.0, 8.5);
    let ffIdx = bestIdx;
    while (ffIdx < n - 1 && samples[ffIdx]!.s < ffLeadS) ffIdx++;
    let ffCurvature = samples[ffIdx]!.curvature;
    if (ffIdx > 0 && ffLeadS <= samples[ffIdx]!.s) {
      const a = samples[ffIdx - 1]!;
      const b = samples[ffIdx]!;
      const ds = b.s - a.s;
      const u = ds > 1e-4 ? clampADAS((ffLeadS - a.s) / ds, 0, 1) : 1;
      ffCurvature = a.curvature + (b.curvature - a.curvature) * u;
    }
    const curvatureNow = refCurvature + laneChangeCurvature + localCurvNow;
    const blendedCurvature = 0.45 * refCurvature + 0.55 * ffCurvature + laneChangeCurvature + localCurvNow;
    out.targetCurvature = blendedCurvature;

    // Lookahead lateral offset projected onto lookahead frame (incorporating lane-change & continuous local trajectory)
    const fxVeh = vehicle.x - Math.sin(vehicle.yaw) * lookAhead;
    const fzVeh = vehicle.z - Math.cos(vehicle.yaw) * lookAhead;
    const lc = plan.laneChange;
    let lookLcShift = laneChangeLatShiftM;
    if (lc.active && lc.phase === 'executing') {
      const lookTime = lc.elapsedSeconds + lookAhead / Math.max(v, 5.0);
      const tauAhead = clampADAS(lookTime / Math.max(0.5, lc.durationSeconds), 0, 1);
      lookLcShift = tauAhead * tauAhead * tauAhead * (10 + tauAhead * (-15 + 6 * tauAhead)) * lc.lateralDeltaM;
    }
    const lookLocalShift =
      lt && lt.active && lt.mode !== 'lane_change'
        ? evaluateLocalTrajectoryOffsetAtDs(lt, lookAhead)
        : 0;
    const lookLatErr =
      (fxVeh - lookX) * Math.cos(lookYaw) -
      (fzVeh - lookZ) * Math.sin(lookYaw) -
      lookLcShift -
      lookLocalShift +
      0.5 * lookCurvature * lookAhead * lookAhead;

    // 3. Standstill / ultra-low-speed stabilization (prevents stationary steering jitter)
    if (v < 0.25) {
      const damp = 1 - Math.exp(-5 * Math.max(0, dt));
      this.smoothedSteering += (0 - this.smoothedSteering) * damp;
      out.steering = this.smoothedSteering * steeringBlend;
      return out;
    }

    // Filter lateral velocity lightly to remove tire micro-noise
    const lvAlpha = 1 - Math.exp(-12 * Math.max(0, dt));
    this.filteredLatVel += (vehicle.lateralVelocity - this.filteredLatVel) * lvAlpha;

    // 4. Vehicle-adaptive critically-damped speed- & wheelbase-scheduled gains:
    //    Adapts natural frequency, understeer compensation, yaw damping, and slew rate to
    //    wheelbase L, axle stiffness understeerGradient, mass, and road surface grip.
    const grip = clampADAS(vehicle.roadGripMultiplier ?? 1.0, 0.42, 1.05);
    const longWheelbaseFactor = clampADAS(L / 2.95, 0.95, 1.12);
    const highSpeedBlend = smoothStep((v - 8) / 18);
    const vCtrl = Math.max(v, 5.5);
    const gripScale = 0.82 + 0.18 * Math.min(1.0, grip);
    const wnBase = (1.48 + (0.95 - 1.48) * highSpeedBlend) * gripScale;
    const zeta = 1.0;
    const kCrossTrack = clampADAS((L * wnBase * wnBase) / (vCtrl * vCtrl), 0.004, 0.18);
    const kHeading = clampADAS((2 * zeta * wnBase * L) / vCtrl, 0.20, 1.0);
    const kLookLat = kCrossTrack * 0.22;
    const kYawDamp = (0.16 + (0.24 - 0.16) * highSpeedBlend) * (1.0 + (longWheelbaseFactor - 1.0) * highSpeedBlend);
    const kLatVel = (0.006 + (0.012 - 0.006) * highSpeedBlend) * (1.0 + (longWheelbaseFactor - 1.0) * highSpeedBlend);
    // Tire compliance feedforward multiplier + vehicle-specific understeer gradient
    const ffGain = 1.55 + 0.35 * highSpeedBlend;
    const kUndersteer = Math.max(0.00045, vehicle.dynamicsProfile?.understeerGradient ?? 0.00045);

    const deltaFF =
      ffGain * Math.atan(L * blendedCurvature) +
      kUndersteer * v * v * blendedCurvature;

    const deadbandedLat = applyDeadband(latErr, highSpeedBlend * 0.02);
    const deltaFB =
      -clampADAS(kCrossTrack * deadbandedLat, -0.28, 0.28) -
      clampADAS(kHeading * headingErr, -0.38, 0.38) -
      clampADAS(kLookLat * applyDeadband(lookLatErr, 0.04), -0.14, 0.14) +
      kYawDamp * (v * curvatureNow + vehicle.yawRate) -
      kLatVel * this.filteredLatVel;

    const maxRoadAngle = Math.max(0.2, vehicle.steeringConfig.maxRoadWheelAngle);
    const desiredRoadAngle = clampADAS(deltaFF + deltaFB, -maxRoadAngle, maxRoadAngle);

    // 5. Invert SteeringSystem's speed-sensitivity curve to normalized steering input [-1, 1]
    const sc = vehicle.steeringConfig;
    const refSpeed = Math.max(1, sc.highSpeedReferenceSpeed ?? 18);
    const minAuth = clampADAS(sc.highSpeedMinimumAuthority ?? 0.22, 0.05, 1);
    const speedAuthority = minAuth + (1 - minAuth) / (1 + (v / refSpeed) * (v / refSpeed));
    const anglePerCmd = Math.min(
      maxRoadAngle,
      (sc.steeringWheelLock * 0.5 * speedAuthority) / Math.max(1, sc.steeringRatio),
    );
    const maxSteerAuthority = 1.0 - 0.55 * highSpeedBlend;
    const rawCmd = clampADAS(desiredRoadAngle / Math.max(0.005, anglePerCmd), -maxSteerAuthority, maxSteerAuthority);

    // 6. Smooth filtering + speed-, wheelbase-, and grip-dependent slew rate limit
    const responseRate = (9.0 + (5.5 - 9.0) * highSpeedBlend) * (0.88 + 0.12 * grip);
    const maxSlewRate = ((2.2 + (0.55 - 2.2) * highSpeedBlend) * (0.78 + 0.22 * grip)) / (1.0 + (longWheelbaseFactor - 1.0) * 0.5 * highSpeedBlend);
    const expFiltered = this.smoothedSteering + (rawCmd - this.smoothedSteering) * (1 - Math.exp(-responseRate * Math.max(0, dt)));
    const maxStep = maxSlewRate * Math.max(0, dt);
    this.smoothedSteering = clampADAS(
      this.smoothedSteering + clampADAS(expFiltered - this.smoothedSteering, -maxStep, maxStep),
      -1,
      1,
    );

    out.steering = this.smoothedSteering * clampADAS(steeringBlend, 0, 1);
    return out;
  }
}

function smoothStep(x: number): number {
  const u = clampADAS(x, 0, 1);
  return u * u * (3 - 2 * u);
}

function applyDeadband(val: number, band: number): number {
  if (Math.abs(val) <= band) return 0;
  return val - Math.sign(val) * band;
}
