import {
  clampADAS,
  type ADASConfig,
  type ADASSpeedCommand,
  type ADASSpeedProfile,
  type ADASVehicleState,
} from './ADASTypes';

type LongitudinalPhase = 'coast' | 'throttle' | 'brake' | 'hold';

/**
 * Smooth, vehicle-adaptive 120 Hz layered longitudinal controller:
 *  - Layer 1: Mode & maneuver-aware comfort target acceleration + grip/capability/jerk limiting
 *  - Layer 2: Physics feedforward + closed-loop actual-acceleration tracking + shift-cut freeze +
 *             anti-windup + ICE kickdown guard / EV launch & regen / Hybrid anti-cycling shaping.
 * Zero per-tick allocations.
 */
export class SpeedController {
  public readonly command: ADASSpeedCommand = {
    throttle: 0,
    brake: 0,
    targetSpeedMps: 0,
    desiredAccelMps2: 0,
    holdingStandstill: false,
  };

  private phase: LongitudinalPhase = 'coast';
  private integralThrottle = 0;
  private integralBrake = 0;
  private smoothedThrottle = 0;
  private smoothedBrake = 0;
  private smoothedDesiredAccel = 0;
  private filteredActualAccel = 0;
  private activeMaxAccel = 1.4;
  private activeJerkUp = 2.2;
  private postShiftTimer = 0;

  public reset(): void {
    this.phase = 'coast';
    this.integralThrottle = 0;
    this.integralBrake = 0;
    this.smoothedThrottle = 0;
    this.smoothedBrake = 0;
    this.smoothedDesiredAccel = 0;
    this.filteredActualAccel = 0;
    this.activeMaxAccel = 1.4;
    this.activeJerkUp = 2.2;
    this.postShiftTimer = 0;
    this.command.throttle = 0;
    this.command.brake = 0;
    this.command.targetSpeedMps = 0;
    this.command.desiredAccelMps2 = 0;
    this.command.holdingStandstill = false;
  }

  public syncBumpless(currentThrottle: number): void {
    this.smoothedThrottle = clampADAS(currentThrottle, 0, 0.78);
    this.integralThrottle = clampADAS(this.smoothedThrottle * 0.35, -0.15, 0.35);
    this.smoothedBrake = 0;
    this.postShiftTimer = 0;
    this.phase = this.smoothedThrottle > 0.02 ? 'throttle' : 'coast';
  }

  public update(
    dt: number,
    vehicle: ADASVehicleState,
    targetSpeedMps: number,
    stopRequired: boolean,
    stopDistanceM: number,
    emergencyBraking: boolean,
    emergencyBrakeDemand: number,
    driverBrakeOverride: boolean,
    driverAccelOverride: boolean,
    active: boolean,
    config: Readonly<ADASConfig>,
    situationalProfile?: ADASSpeedProfile,
  ): ADASSpeedCommand {
    const out = this.command;
    const safeDt = clampADAS(dt, 0, 0.1);
    const v = Math.max(0, vehicle.speed);
    const targetV = Math.max(0, Number.isFinite(targetSpeedMps) ? targetSpeedMps : 0);
    out.targetSpeedMps = targetV;

    if (!active) {
      this.reset();
      return out;
    }

    // Lightly filter measured longitudinal acceleration to prevent suspension noise from spiking throttle
    const rawMeasAccel = Number.isFinite(vehicle.acceleration) ? vehicle.acceleration : 0;
    this.filteredActualAccel += (rawMeasAccel - this.filteredActualAccel) * (1 - Math.exp(-16 * safeDt));

    // 1. Highest priority: Emergency Braking (AEB) — zero throttle, instant full braking
    if (emergencyBraking) {
      this.phase = 'brake';
      this.integralThrottle = 0;
      this.smoothedThrottle = 0;
      this.smoothedBrake = clampADAS(emergencyBrakeDemand, 0.8, 1.0);
      this.smoothedDesiredAccel = -8.5;
      this.postShiftTimer = 0;
      out.throttle = 0;
      out.brake = this.smoothedBrake;
      out.desiredAccelMps2 = this.smoothedDesiredAccel;
      out.holdingStandstill = v < 0.2;
      return out;
    }

    // 2. Driver manual brake priority — never request opposing throttle
    if (driverBrakeOverride) {
      this.phase = 'coast';
      this.integralThrottle = 0;
      this.smoothedThrottle = 0;
      this.smoothedBrake = 0;
      this.smoothedDesiredAccel = Math.min(0, this.filteredActualAccel);
      out.throttle = 0;
      out.brake = 0;
      out.desiredAccelMps2 = this.smoothedDesiredAccel;
      out.holdingStandstill = false;
      return out;
    }

    // 3. Driver manual acceleration override — yield longitudinal throttle & suppress brake
    if (driverAccelOverride) {
      this.phase = 'throttle';
      this.smoothedBrake = 0;
      this.smoothedThrottle = clampADAS(vehicle.throttle, 0, 0.82);
      this.integralThrottle = clampADAS(this.smoothedThrottle * 0.25, -0.1, 0.35);
      this.smoothedDesiredAccel = Math.max(0, this.filteredActualAccel);
      out.throttle = 0;
      out.brake = 0;
      out.desiredAccelMps2 = this.smoothedDesiredAccel;
      out.holdingStandstill = false;
      return out;
    }

    // 4. Standstill hold (prevents AT/DCT creep at red lights, blocked junctions, or obstacles)
    const shouldHold =
      (stopRequired && Number.isFinite(stopDistanceM) && ((stopDistanceM <= 2.4 && v <= 0.75) || stopDistanceM <= 0.55)) ||
      (targetV <= 0.12 && v <= 0.45);
    const shouldReleaseHold = !stopRequired && targetV >= 0.7;

    if (shouldHold || (this.phase === 'hold' && !shouldReleaseHold)) {
      this.phase = 'hold';
      this.integralThrottle = 0;
      this.integralBrake = 0;
      this.smoothedThrottle = 0;
      this.smoothedBrake = Math.min(0.60, Math.max(0.48, this.smoothedBrake + 3.0 * safeDt));
      this.smoothedDesiredAccel = 0;
      out.throttle = 0;
      out.brake = this.smoothedBrake;
      out.desiredAccelMps2 = 0;
      out.holdingStandstill = true;
      return out;
    }

    // Extract vehicle dynamics & powertrain profile (with safe defaults if caller omitted)
    const dyn = vehicle.dynamicsProfile;
    const kind = dyn?.powertrainKind ?? 'ice';
    const massKg = dyn?.massKg ?? 1700;
    const ratedPowerW = dyn?.ratedPowerW ?? 165000;
    const peakAccel = dyn?.peakAccelMps2 ?? 5.2;
    const respRate = dyn?.throttleResponseRate ?? 6.0;
    const pedalExp = dyn?.throttleExponent ?? 1.0;
    const hasStepped = dyn?.hasSteppedGearbox ?? true;
    const maxRegenDecel = dyn?.maxRegenDecelMps2 ?? 0.35;
    const grip = clampADAS(vehicle.roadGripMultiplier ?? 1.0, 0.38, 1.05);
    const driveMode = vehicle.driveMode ?? 'NORMAL';
    const modeAccelScale =
      driveMode === 'ECO'
        ? 0.85
        : driveMode === 'SNOW'
          ? 0.68
          : driveMode === 'SPORT'
            ? 1.12
            : 1.0;

    // Layer 1: Situational & vehicle-capability target acceleration + jerk envelope
    const speedErr = targetV - v;
    let profile = situationalProfile;
    if (!profile) {
      if (emergencyBraking) profile = 'emergency_aeb';
      else if (v < 1.0 && targetV > 1.5) profile = 'start_from_stop';
      else profile = 'normal_cruise';
    }

    const powerBoundAccel = clampADAS((ratedPowerW / (massKg * Math.max(v, 7.5))) * 0.88, 1.8, peakAccel);
    const gripBoundAccel = 3.8 * grip;
    const vehCapAccel = Math.min(peakAccel, powerBoundAccel, gripBoundAccel);

    let targetMaxAccel = config.comfortAccelMps2;
    let targetJerkUp = config.jerkComfortLimitMps3 ?? 2.4;

    switch (profile) {
      case 'start_from_stop': {
        const launchBase = config.startFromStopMaxAccelMps2 ?? 1.25;
        const earlySoftener = kind === 'ev' && v < 1.5 ? 0.82 : 1.0;
        targetMaxAccel = Math.min(launchBase * modeAccelScale * earlySoftener, vehCapAccel * 0.65);
        targetJerkUp = (kind === 'ev' ? 1.35 : 1.55) * grip;
        break;
      }
      case 'resume_after_avoidance':
        targetMaxAccel = Math.min((config.resumeAccelAfterAvoidanceMps2 ?? 1.05) * modeAccelScale, vehCapAccel * 0.65);
        targetJerkUp = 1.65 * grip;
        break;
      case 'highway_merge':
        targetMaxAccel = Math.min(2.35, config.comfortAccelMps2 * 1.25 * modeAccelScale, vehCapAccel * 0.85);
        targetJerkUp = 2.6 * grip;
        break;
      case 'overtaking':
        targetMaxAccel = Math.min(2.50, config.comfortAccelMps2 * 1.35 * modeAccelScale, vehCapAccel * 0.90);
        targetJerkUp = 2.9 * grip;
        break;
      case 'normal_cruise':
      default: {
        const trimCap = Math.abs(speedErr) < 2.8 ? 1.25 : config.comfortAccelMps2;
        targetMaxAccel = Math.min(trimCap * modeAccelScale, vehCapAccel * 0.72);
        targetJerkUp = (config.jerkComfortLimitMps3 ?? 2.3) * grip;
        break;
      }
    }

    const accelSlewUp = (profile === 'overtaking' || profile === 'highway_merge' ? 1.15 : 0.48) * safeDt;
    const accelSlewDown = 0.65 * safeDt;
    this.activeMaxAccel += clampADAS(targetMaxAccel - this.activeMaxAccel, -accelSlewDown, accelSlewUp);
    const jerkSlewRate = (profile === 'overtaking' || profile === 'highway_merge' ? 1.6 : 0.95) * safeDt;
    this.activeJerkUp += clampADAS(targetJerkUp - this.activeJerkUp, -jerkSlewRate, jerkSlewRate);

    const maxAllowedAccel = Math.max(0.55, this.activeMaxAccel);
    const maxJerkUp = Math.max(0.8, this.activeJerkUp);

    const speedToAccelGain = speedErr < -0.5 ? 0.76 : v < 5.0 ? 0.68 : v < 18.0 ? 0.62 : 0.56;
    const gripMaxDecel = config.maxNormalDecelMps2 * Math.max(0.65, grip);
    let rawAccel = clampADAS(speedErr * speedToAccelGain, -gripMaxDecel, maxAllowedAccel);

    if (stopRequired && Number.isFinite(stopDistanceM)) {
      if (v >= targetV * 0.92 || stopDistanceM <= 3.5) {
        const stopAccel =
          stopDistanceM <= 0.5
            ? -gripMaxDecel
            : -(v * v) / (2 * Math.max(0.35, stopDistanceM - 0.35));
        const finalCreepTrim = stopDistanceM <= 3.5 && v > 0.1 ? -1.4 : 0;
        const clampedStopAccel = clampADAS(Math.min(stopAccel, finalCreepTrim), -gripMaxDecel * 1.25, 0);
        rawAccel = Math.min(rawAccel, clampedStopAccel);
      }
    }

    const maxJerkDown = rawAccel < -2.2
      ? (config.jerkNormalLimitMps3 ? config.jerkNormalLimitMps3 * 1.8 : 9.0) * grip
      : (config.jerkComfortLimitMps3 ? config.jerkComfortLimitMps3 * 1.65 : 4.2) * grip;
    const effectiveMaxJerkUp =
      this.smoothedDesiredAccel < -4.5 && rawAccel >= 0 && !stopRequired
        ? Math.max(maxJerkUp, 14.0)
        : this.smoothedDesiredAccel < -0.2 && rawAccel >= 0 && !stopRequired
          ? Math.max(maxJerkUp, 3.8)
          : maxJerkUp;
    const accelDelta = clampADAS(
      rawAccel - this.smoothedDesiredAccel,
      -maxJerkDown * safeDt,
      effectiveMaxJerkUp * safeDt,
    );
    this.smoothedDesiredAccel += accelDelta;
    out.desiredAccelMps2 = this.smoothedDesiredAccel;

    // 5. Mode hysteresis between throttle / coast / brake (utilizing EV/Hybrid regen first)
    const a = this.smoothedDesiredAccel;
    const regenFloor = kind === 'ev' || kind === 'ehs' || kind === 'hybrid'
      ? -Math.min(1.65, maxRegenDecel * 0.85)
      : -0.45;
    if (this.phase === 'hold') {
      this.phase = a > 0.05 ? 'throttle' : 'coast';
    }
    if (this.phase === 'brake') {
      if (a > Math.max(-0.12, regenFloor * 0.25) && (!stopRequired || stopDistanceM > 8)) {
        this.phase = a > 0.16 ? 'throttle' : 'coast';
      }
    } else if (this.phase === 'throttle') {
      const needServiceBrake =
        a < Math.min(-1.85, regenFloor - 0.45) ||
        (stopRequired && stopDistanceM < 25 && a < -0.22) ||
        (stopRequired && a < -0.48) ||
        (speedErr < -4.8 && a < regenFloor - 0.25);
      if (needServiceBrake) {
        this.phase = 'brake';
      } else if (a < -0.06 && speedErr < -0.25) {
        this.phase = 'coast';
      }
    } else {
      // coast (EV & Hybrid apply lift-off regen naturally in coast without hydraulic braking!)
      const needServiceBrake =
        a < Math.min(-1.75, regenFloor - 0.35) ||
        (stopRequired && stopDistanceM < 22 && a < -0.18) ||
        (stopRequired && a < -0.42) ||
        (speedErr < -4.8 && a < regenFloor - 0.20);
      if (needServiceBrake) {
        this.phase = 'brake';
      } else if (a > 0.10 || (speedErr > 0.32 && !stopRequired)) {
        this.phase = 'throttle';
      }
    }

    // Layer 2: Physics feedforward + closed-loop acceleration tracking + powertrain shaping
    if (this.phase === 'throttle') {
      this.smoothedBrake = 0;
      this.integralBrake = 0;

      // Stepped-transmission shift interruption freeze prevents torque flare on clutch lockup
      if (vehicle.shiftInProgress) {
        this.postShiftTimer = 0.24;
        const holdThrottle = clampADAS(this.smoothedThrottle * 0.92, 0, 0.72);
        const shiftTrimSlew = 1.6 * safeDt;
        this.smoothedThrottle += clampADAS(holdThrottle - this.smoothedThrottle, -shiftTrimSlew, shiftTrimSlew * 0.3);
        out.throttle = this.smoothedThrottle;
        out.brake = 0;
        out.holdingStandstill = false;
        return out;
      }

      if (this.postShiftTimer > 0) {
        this.postShiftTimer = Math.max(0, this.postShiftTimer - safeDt);
      }

      // Compute realistic acceleration capacity at current (v, physical gear ratio, powertrain)
      const gearRatio = Number.isFinite(vehicle.currentGearRatio) && vehicle.currentGearRatio! > 0.2
        ? vehicle.currentGearRatio!
        : hasStepped && vehicle.currentGear === 1
          ? 3.4
          : hasStepped && vehicle.currentGear === 2
            ? 2.1
            : 1.4;
      const gearRatioBoost = hasStepped ? clampADAS(gearRatio / 1.75, 0.82, 1.85) : 1.0;
      const midBandFactor = kind === 'ev' || kind === 'ehs' ? 0.85 : 0.74;
      const rawPowerAccel = (ratedPowerW / (massKg * Math.max(v, 7.0))) * midBandFactor * gearRatioBoost;
      const availAccelAtV =
        kind === 'ev'
          ? clampADAS(Math.min(peakAccel, rawPowerAccel), 2.4, 7.8)
          : clampADAS(Math.min(peakAccel * 0.95, rawPowerAccel), 2.3, 5.2);
      const aeroRollingDragAccel = 0.0115 * 9.81 + 0.00028 * v * v;
      const reqDriveAccel = Math.max(0, a + aeroRollingDragAccel);
      let ffThrottle = clampADAS(reqDriveAccel / availAccelAtV, 0, 0.62);

      // Gentle pedal non-linearity compensation without starving off-boost ICE engines
      if (Math.abs(pedalExp - 1.0) > 0.08 && ffThrottle > 0.03) {
        const compExp = clampADAS(1 / clampADAS(pedalExp, 0.75, 1.35), 0.82, 1.22);
        ffThrottle = clampADAS(Math.pow(ffThrottle, compExp), 0, 0.62);
      }

      const accelErr = a - this.filteredActualAccel;
      const accelKp = clampADAS(0.24 / Math.max(2.2, availAccelAtV * 0.45), 0.08, 0.18);
      // Small outer speed trim only near target speed; avoid fighting inner accel loop during large speed steps
      const speedTrim = clampADAS(speedErr * 0.015, -0.05, 0.05);
      // Fast active pull-back when measured accel overshoots target (tames 1st-gear turbo boost & EV torque surge)
      const overshootDamp = accelErr < -0.15 ? accelErr * 0.18 : 0;
      const proportional = accelErr * accelKp + speedTrim + overshootDamp;

      // ICE kickdown guard: avoid unnecessary downshifts during steady/normal driving
      const allowHighLoad =
        profile === 'overtaking' ||
        profile === 'highway_merge' ||
        (speedErr > 6.5 && this.filteredActualAccel < 0.35);
      const throttleCap =
        kind === 'ice' && hasStepped && !allowHighLoad
          ? 0.68
          : allowHighLoad
            ? 0.84
            : 0.76;

      const rawThrottle = ffThrottle + proportional + this.integralThrottle;

      // Response-rate-aware anti-windup: slower-spooling engines integrate calmly upwards, unwind swiftly on overshoot
      const lagGainUp = clampADAS(respRate / 6.5, 0.50, 1.0);
      const intRateScale = accelErr < 0 ? Math.max(1.8, lagGainUp * 2.8) : lagGainUp;
      const maxIntBound = clampADAS(0.16 + Math.max(0, a) * 0.09, 0.16, 0.30);
      const saturatedHigh = rawThrottle >= throttleCap && (accelErr > 0 || speedErr > 0);
      const saturatedLow = rawThrottle <= 0 && accelErr < 0 && speedErr < 0;
      if (!saturatedHigh && !saturatedLow && this.postShiftTimer <= 0) {
        const intInput = accelErr * 0.085 + clampADAS(speedErr * 0.012, -0.03, 0.04);
        this.integralThrottle = clampADAS(
          this.integralThrottle + intInput * intRateScale * safeDt,
          -0.18,
          maxIntBound,
        );
      }

      const targetThrottle = clampADAS(ffThrottle + proportional + this.integralThrottle, 0, throttleCap);

      // Powertrain-tailored upward/downward throttle rate shaping
      let upSlew = 1.0;
      if (this.postShiftTimer > 0) {
        upSlew = 0.42;
      } else if (profile === 'start_from_stop') {
        upSlew = kind === 'ev' ? 0.50 : 0.62;
      } else if (profile === 'resume_after_avoidance') {
        upSlew = 0.60;
      } else if (kind === 'hybrid' || kind === 'ehs') {
        // Hybrid anti-cycling hysteresis filter during steady cruising
        upSlew = Math.abs(speedErr) < 2.2 ? 0.58 : 0.85;
      } else if (kind === 'ev') {
        upSlew = v < 4.0 ? 0.55 : 0.90;
      } else if (profile === 'overtaking' || profile === 'highway_merge') {
        upSlew = 1.30;
      }
      const downSlew = accelErr < -0.35 ? 3.2 : 1.75;

      const stepDelta = clampADAS(
        targetThrottle - this.smoothedThrottle,
        -downSlew * safeDt,
        upSlew * safeDt,
      );
      this.smoothedThrottle = clampADAS(this.smoothedThrottle + stepDelta, 0, throttleCap);
      out.throttle = this.smoothedThrottle;
      out.brake = 0;
      out.holdingStandstill = false;
    } else if (this.phase === 'brake') {
      this.smoothedThrottle = 0;
      this.integralThrottle *= Math.exp(-3.2 * safeDt);
      const desiredDecelMag = Math.max(0, -a);
      // Offset friction-brake request by natural lift-off regen on EV/Hybrid when slowing smoothly
      const naturalRegenAssist = !stopRequired && desiredDecelMag < 2.2 ? Math.min(desiredDecelMag * 0.45, maxRegenDecel * 0.5) : 0;
      const effDecelReq = Math.max(0, desiredDecelMag - naturalRegenAssist);
      const actualDecelMag = Math.max(0, -this.filteredActualAccel);
      const decelErr = desiredDecelMag - actualDecelMag;
      this.integralBrake = clampADAS(this.integralBrake + decelErr * 0.055 * safeDt, 0, 0.28);
      const creepOffset = dyn?.creepEnabled !== false && v < 3.0 && stopRequired ? 0.11 : 0;
      const targetBrake = clampADAS(effDecelReq / (7.2 * Math.max(0.75, grip)) + decelErr * 0.055 + this.integralBrake + creepOffset, 0.05, 0.90);
      const maxBrakeSlew = 3.6 * safeDt;
      this.smoothedBrake = clampADAS(
        this.smoothedBrake + clampADAS(targetBrake - this.smoothedBrake, -maxBrakeSlew, maxBrakeSlew),
        0,
        0.90,
      );
      out.throttle = 0;
      out.brake = this.smoothedBrake;
      out.holdingStandstill = false;
    } else {
      // coast
      this.integralBrake *= Math.exp(-3.0 * safeDt);
      this.integralThrottle *= Math.exp(-1.5 * safeDt);
      this.smoothedThrottle = Math.max(0, this.smoothedThrottle - 2.2 * safeDt);
      this.smoothedBrake = Math.max(0, this.smoothedBrake - 3.5 * safeDt);
      out.throttle = this.smoothedThrottle;
      out.brake = 0;
      out.holdingStandstill = false;
    }

    return out;
  }
}
