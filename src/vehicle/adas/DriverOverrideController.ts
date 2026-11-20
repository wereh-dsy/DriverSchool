import {
  clampADAS,
  type ADASConfig,
  type ADASControlAuthority,
  type ADASDriverInputSnapshot,
  type ADASDriverIntentKind,
  type ADASDriverOverrideState,
  type ADASVehicleState,
  type TurnSignalRequest,
} from './ADASTypes';

/**
 * Arbitrates driver manual steering, throttle, brake, standstill hold, and turn-signal intent
 * independently for lateral and longitudinal axes without exiting ADAS.
 * Runs at 120 Hz; zero heap allocations.
 */
export class DriverOverrideController {
  public readonly state: ADASDriverOverrideState = {
    steeringOverride: false,
    accelerationOverride: false,
    brakeOverride: false,
    manualTurnSignalActive: false,
    steeringBlend: 1,
    overrideTargetSpeedMps: 0,
    steeringJustReleased: false,
    lateralAuthority: 'SYSTEM',
    longitudinalAuthority: 'SYSTEM',
    controlAuthority: 'SYSTEM',
    driverStandstillHold: false,
    brakeReacquireRemainingS: 0,
    manualSignalIntent: null,
    pendingTurnIntent: 'NONE',
  };

  private steerReleaseTimer = 0;
  private driverSignaled = false;
  private manualSignalIntent: TurnSignalRequest = null;
  private overrideSpeedActive = false;
  private brakeReacquireTimer = 0;
  private standstillBrakeTimer = 0;
  private driverStandstillHold = false;
  private hadBrakeOverride = false;

  public reset(): void {
    this.steerReleaseTimer = 0;
    this.driverSignaled = false;
    this.manualSignalIntent = null;
    this.overrideSpeedActive = false;
    this.brakeReacquireTimer = 0;
    this.standstillBrakeTimer = 0;
    this.driverStandstillHold = false;
    this.hadBrakeOverride = false;
    const s = this.state;
    s.steeringOverride = false;
    s.accelerationOverride = false;
    s.brakeOverride = false;
    s.manualTurnSignalActive = false;
    s.steeringBlend = 1;
    s.overrideTargetSpeedMps = 0;
    s.steeringJustReleased = false;
    s.lateralAuthority = 'SYSTEM';
    s.longitudinalAuthority = 'SYSTEM';
    s.controlAuthority = 'SYSTEM';
    s.driverStandstillHold = false;
    s.brakeReacquireRemainingS = 0;
    s.manualSignalIntent = null;
    s.pendingTurnIntent = 'NONE';
  }

  public clearStandstillHold(): void {
    this.driverStandstillHold = false;
    this.standstillBrakeTimer = 0;
    this.state.driverStandstillHold = false;
  }

  public clearManualSignalIntent(): void {
    this.manualSignalIntent = null;
    this.driverSignaled = false;
    this.state.manualSignalIntent = null;
    this.state.manualTurnSignalActive = false;
  }

  public updateSignalIntent(
    driver: ADASDriverInputSnapshot,
    adasOwnedSignal: TurnSignalRequest = null,
  ): TurnSignalRequest {
    const s = this.state;
    // Distinguish driver manual turn signal vs ADAS-owned automatic blinker
    if (driver.hazardEdge || driver.hazardActive) {
      this.driverSignaled = false;
      this.manualSignalIntent = null;
    } else if (driver.leftIndicatorEdge) {
      const turningOn = !driver.leftSignalActive || adasOwnedSignal === 'left';
      this.driverSignaled = turningOn;
      this.manualSignalIntent = turningOn ? 'left' : null;
    } else if (driver.rightIndicatorEdge) {
      const turningOn = !driver.rightSignalActive || adasOwnedSignal === 'right';
      this.driverSignaled = turningOn;
      this.manualSignalIntent = turningOn ? 'right' : null;
    } else {
      if (this.manualSignalIntent === 'left' && !driver.leftSignalActive) {
        this.manualSignalIntent = null;
        this.driverSignaled = false;
      } else if (this.manualSignalIntent === 'right' && !driver.rightSignalActive) {
        this.manualSignalIntent = null;
        this.driverSignaled = false;
      } else if (!this.driverSignaled) {
        if (driver.leftSignalActive && adasOwnedSignal !== 'left') {
          this.driverSignaled = true;
          this.manualSignalIntent = 'left';
        } else if (driver.rightSignalActive && adasOwnedSignal !== 'right') {
          this.driverSignaled = true;
          this.manualSignalIntent = 'right';
        }
      }
    }
    s.manualTurnSignalActive = this.driverSignaled;
    s.manualSignalIntent = this.manualSignalIntent;
    s.pendingTurnIntent = this.deriveIntentKind(this.manualSignalIntent);
    return this.manualSignalIntent;
  }

  public update(
    dt: number,
    driver: ADASDriverInputSnapshot,
    vehicle: ADASVehicleState,
    roadSpeedLimitMps: number,
    autoTargetSpeedMps: number,
    emergencyBraking: boolean,
    config: Readonly<ADASConfig>,
    _adasOwnedSignal: TurnSignalRequest = null,
    systemHoldActive = false,
  ): ADASDriverOverrideState {
    const s = this.state;
    s.steeringJustReleased = false;

    const absSteer = Number.isFinite(driver.steering) ? Math.abs(driver.steering) : 0;
    const rawThrottle = Number.isFinite(driver.throttle) ? clampADAS(driver.throttle, 0, 1) : 0;
    const rawBrake = Number.isFinite(driver.brake) ? clampADAS(driver.brake, 0, 1) : 0;
    const absSpeed = Math.abs(vehicle.speed);

    // 2. Independent Lateral steering override (immediate yield, stability dwell, smooth blend)
    if (absSteer >= config.driverSteerOverrideThreshold) {
      s.steeringOverride = true;
      s.steeringBlend = 0;
      this.steerReleaseTimer = 0;
    } else if (s.steeringOverride) {
      if (absSteer <= config.driverSteerReleaseThreshold && Math.abs(vehicle.yawRate) < 0.45) {
        this.steerReleaseTimer += dt;
        if (this.steerReleaseTimer >= config.driverSteerReacquireSeconds) {
          s.steeringOverride = false;
          s.steeringJustReleased = true;
          this.steerReleaseTimer = 0;
        }
      } else {
        this.steerReleaseTimer = 0;
      }
    } else if (s.steeringBlend < 1) {
      s.steeringBlend = Math.min(1, s.steeringBlend + dt / 0.6);
    }

    s.lateralAuthority = s.steeringOverride
      ? 'DRIVER_INTERVENING'
      : this.steerReleaseTimer > 0 || s.steeringBlend < 0.98
        ? 'RECOVERING'
        : 'SYSTEM';

    // 3. Independent Longitudinal brake & standstill-hold priority
    const holdSpeedThresh = config.driverStandstillBrakeHoldSpeedMps ?? 0.28;
    const brakeReacquireSec = config.driverBrakeReacquireSeconds ?? 0.35;
    s.brakeOverride = rawBrake >= config.driverBrakeOverrideThreshold;

    if (s.brakeOverride) {
      this.hadBrakeOverride = true;
      s.accelerationOverride = false;
      this.overrideSpeedActive = false;
      this.brakeReacquireTimer = 0;
      s.brakeReacquireRemainingS = 0;
      s.overrideTargetSpeedMps = Math.max(0, vehicle.speed);

      // Driver actively braked down to standstill (distinct from traffic-signal/obstacle auto-stop)
      if (!systemHoldActive && absSpeed <= holdSpeedThresh) {
        this.standstillBrakeTimer += dt;
        if (this.standstillBrakeTimer >= 0.12) {
          this.driverStandstillHold = true;
        }
      } else if (!this.driverStandstillHold) {
        this.standstillBrakeTimer = 0;
      }

      s.driverStandstillHold = this.driverStandstillHold;
      s.longitudinalAuthority = 'DRIVER_INTERVENING';
      s.controlAuthority = this.combineAuthority(s.lateralAuthority, s.longitudinalAuthority);
      return s;
    }

    // Brake was just released -> trigger brief stability confirmation wait before resuming positive accel
    if (this.hadBrakeOverride) {
      this.hadBrakeOverride = false;
      if (!this.driverStandstillHold && !emergencyBraking) {
        this.brakeReacquireTimer = brakeReacquireSec;
      }
    }
    this.standstillBrakeTimer = 0;

    if (this.brakeReacquireTimer > 0) {
      this.brakeReacquireTimer = Math.max(0, this.brakeReacquireTimer - dt);
    }
    s.brakeReacquireRemainingS = this.brakeReacquireTimer;

    // 4. Independent Longitudinal acceleration override (also releases driverStandstillHold!)
    const maxAllowedSpeed = Math.max(autoTargetSpeedMps, roadSpeedLimitMps + config.driverOverrideMaxOverspeedMps);
    if (!emergencyBraking && rawThrottle >= config.driverThrottleOverrideThreshold) {
      if (this.driverStandstillHold) {
        this.driverStandstillHold = false;
        s.pendingTurnIntent = 'RESUME_DRIVE';
      }
      this.brakeReacquireTimer = 0;
      s.brakeReacquireRemainingS = 0;
      s.accelerationOverride = true;
      this.overrideSpeedActive = true;
      const desired = clampADAS(
        Math.max(vehicle.speed + 1.0, autoTargetSpeedMps + rawThrottle * config.driverOverrideMaxOverspeedMps),
        autoTargetSpeedMps,
        maxAllowedSpeed,
      );
      s.overrideTargetSpeedMps = desired;
    } else {
      s.accelerationOverride = false;
      if (this.overrideSpeedActive) {
        if (s.overrideTargetSpeedMps > autoTargetSpeedMps + 0.05) {
          s.overrideTargetSpeedMps = Math.max(
            autoTargetSpeedMps,
            s.overrideTargetSpeedMps - config.driverOverrideDecayMps2 * dt,
          );
        } else {
          s.overrideTargetSpeedMps = autoTargetSpeedMps;
          this.overrideSpeedActive = false;
        }
      } else {
        s.overrideTargetSpeedMps = autoTargetSpeedMps;
      }
    }

    if (!vehicle.forwardGear && this.driverStandstillHold && Math.abs(vehicle.speed) > 0.8) {
      this.driverStandstillHold = false;
    }
    s.driverStandstillHold = this.driverStandstillHold;

    s.longitudinalAuthority = s.accelerationOverride
      ? 'DRIVER_INTERVENING'
      : this.brakeReacquireTimer > 0 || this.overrideSpeedActive
        ? 'RECOVERING'
        : 'SYSTEM';

    s.controlAuthority = this.combineAuthority(s.lateralAuthority, s.longitudinalAuthority);
    return s;
  }

  private combineAuthority(
    lat: ADASControlAuthority,
    lon: ADASControlAuthority,
  ): ADASControlAuthority {
    if (lat === 'DRIVER_INTERVENING' || lon === 'DRIVER_INTERVENING') return 'DRIVER_INTERVENING';
    if (lat === 'RECOVERING' || lon === 'RECOVERING') return 'RECOVERING';
    return 'SYSTEM';
  }

  private deriveIntentKind(signal: TurnSignalRequest): ADASDriverIntentKind {
    if (signal === 'left') return 'LANE_CHANGE_LEFT';
    if (signal === 'right') return 'LANE_CHANGE_RIGHT';
    return 'NONE';
  }
}
