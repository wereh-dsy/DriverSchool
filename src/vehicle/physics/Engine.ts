import type { EngineConfig, TorqueCurvePoint } from '../config';
import {
  clamp,
  clamp01,
  damp,
  radiansPerSecondToRPM,
  rpmToRadiansPerSecond,
} from './math';

export interface EngineTorqueSample {
  combustionTorque: number;
  engineBrakingTorque: number;
  idleControlTorque: number;
  netCrankTorque: number;
  revHangTorque: number;
}

export interface RevHangSnapshot {
  active: boolean;
  residualTorque: number;
  factor: number;
}

export interface RevHangContext {
  /** Fully engaged drivetrains and neutral free revving retain their normal drag. */
  enabled: boolean;
  gearEngaged: boolean;
  clutchEngagement: number;
}

/**
 * Rotational crankshaft model. It deliberately owns no knowledge of gears or
 * wheels: the clutch supplies the load torque applied to the crankshaft.
 */
export class Engine {
  public currentRPM: number;
  public throttle = 0;
  public isRunning = true;

  private readonly torqueCurve: readonly TorqueCurvePoint[];
  private fuelCutActive = false;
  private previousThrottleCommand = 0;
  private recentLiftTime = 0;
  private revHangElapsed = -1;
  private revHangFactor = 0;

  public constructor(public readonly config: EngineConfig) {
    if (config.torqueCurve.length === 0) {
      throw new Error('Engine torqueCurve must contain at least one sample.');
    }
    this.torqueCurve = [...config.torqueCurve].sort((a, b) => a.rpm - b.rpm);
    this.currentRPM = config.idleRPM;
  }

  public reset(rpm = this.config.idleRPM, running = true): void {
    this.isRunning = running;
    this.currentRPM = running
      ? clamp(rpm, this.config.stallRPM + 1, this.config.maxRPM)
      : 0;
    this.throttle = 0;
    this.fuelCutActive = false;
    this.resetRevHang();
  }

  /** Starter abstraction; ignition timing and battery state can be added later. */
  public start(): void {
    this.isRunning = true;
    this.currentRPM = this.config.idleRPM;
    this.throttle = 0;
    this.fuelCutActive = false;
    this.resetRevHang();
  }

  public stop(): void {
    this.isRunning = false;
    this.currentRPM = 0;
    this.throttle = 0;
    this.fuelCutActive = false;
    this.resetRevHang();
  }

  public updateThrottle(targetThrottle: number, dt: number, revHang?: RevHangContext): void {
    const target = clamp01(targetThrottle);
    const response = target < this.throttle
      ? this.config.throttleReleaseResponse
      : this.config.throttleResponseRate;
    this.throttle = damp(this.throttle, target, response, dt);
    this.updateRevHang(target, dt, revHang);
  }

  private resetRevHang(): void {
    this.previousThrottleCommand = 0;
    this.recentLiftTime = 0;
    this.revHangElapsed = -1;
    this.revHangFactor = 0;
  }

  private updateRevHang(target: number, dt: number, context?: RevHangContext): void {
    const config = this.config.revHang;
    const risingThrottle = target > this.previousThrottleCommand + 1e-4;
    const rapidLift = this.previousThrottleCommand >= 0.15 && target < this.previousThrottleCommand &&
      (this.previousThrottleCommand - target) / Math.max(1e-4, dt) > 1.5;
    this.previousThrottleCommand = target;
    this.recentLiftTime = Math.max(0, this.recentLiftTime - dt);
    if (rapidLift) this.recentLiftTime = 0.18;
    if (config?.enabled !== true || context?.enabled !== true || !context.gearEngaged ||
      !this.isRunning || this.currentRPM < this.config.idleRPM + 350) {
      this.revHangElapsed = -1; this.revHangFactor = 0; this.recentLiftTime = 0;
      return;
    }
    if (target > 0.08 || risingThrottle) {
      this.revHangElapsed = -1; this.revHangFactor = 0;
      if (risingThrottle) this.recentLiftTime = 0;
      return;
    }
    // Wait briefly for the pressure plate to open after a simultaneous lift
    // and pedal press. The residual never compensates a fully coupled load.
    if (context.clutchEngagement >= 0.95) {
      this.revHangElapsed = -1; this.revHangFactor = 0;
      return;
    }
    if (this.revHangElapsed < 0 && this.recentLiftTime > 0) {
      this.revHangElapsed = 0; this.recentLiftTime = 0;
    }
    if (this.revHangElapsed < 0) { this.revHangFactor = 0; return; }
    this.revHangElapsed += dt;
    const hold = Math.max(0, config.holdTime);
    const decay = Math.max(0.01, config.decayTime);
    const decayFactor = 1 - clamp01((this.revHangElapsed - hold) / decay);
    this.revHangFactor = decayFactor * clamp01((0.95 - context.clutchEngagement) / 0.65);
    if (decayFactor <= 0) this.revHangElapsed = -1;
  }

  public getRevHangSnapshot(): RevHangSnapshot {
    const residualTorque = this.getTorqueSample().revHangTorque;
    return { active: residualTorque > 0.05, residualTorque, factor: this.revHangFactor };
  }

  /** Linear interpolation of the data-driven full-load torque curve. */
  public getTorqueAtRPM(rpm: number): number {
    const first = this.torqueCurve[0];
    const last = this.torqueCurve[this.torqueCurve.length - 1];
    if (first === undefined || last === undefined) return 0;
    if (rpm <= first.rpm) return first.torque;
    if (rpm >= last.rpm) return last.torque;

    for (let index = 1; index < this.torqueCurve.length; index += 1) {
      const upper = this.torqueCurve[index];
      const lower = this.torqueCurve[index - 1];
      if (upper !== undefined && lower !== undefined && rpm <= upper.rpm) {
        const range = Math.max(1, upper.rpm - lower.rpm);
        const fraction = (rpm - lower.rpm) / range;
        return lower.torque + (upper.torque - lower.torque) * fraction;
      }
    }
    return last.torque;
  }

  /** Current net torque available at the crank before clutch load. */
  public getTorqueSample(): EngineTorqueSample {
    if (!this.isRunning) {
      return {
        combustionTorque: 0,
        engineBrakingTorque: 0,
        idleControlTorque: 0,
        netCrankTorque: 0,
        revHangTorque: 0,
      };
    }

    const rpmRange = Math.max(1, this.config.redlineRPM - this.config.idleRPM);
    const normalizedRPM = clamp((this.currentRPM - this.config.idleRPM) / rpmRange, 0, 1);
    const limiterMultiplier = this.fuelCutActive ? 0 : 1;
    const combustionTorque =
      this.getTorqueAtRPM(this.currentRPM) * this.throttle * limiterMultiplier;

    // Pumping/friction losses become much more apparent with the throttle shut.
    const engineBrakingTorque =
      (this.config.engineFrictionTorque +
        this.config.engineBrakingStrength * normalizedRPM) *
      (1 - this.throttle) ** 1.6;

    // The governor exactly compensates normal friction at target idle, then
    // adds a finite reserve as RPM sags. Unlike the old minimum-RPM clamp this
    // can be overwhelmed by a locked drivetrain, allowing a genuine stall.
    const idleTarget = this.config.idleRPM;
    const idleError = clamp(
      (idleTarget - this.currentRPM) / Math.max(1, this.config.idleControlBandRPM),
      0,
      1,
    );
    const idleReserve = Math.max(0, this.config.idleControlStrength - engineBrakingTorque);
    const idleActivation = clamp(
      (this.config.idleRPM * 1.15 - this.currentRPM) /
        Math.max(1, this.config.idleRPM * 0.15),
      0,
      1,
    );
    const idleControlTorque =
      (engineBrakingTorque + idleReserve * idleError) * idleActivation;
    // Residual airflow offsets part of closed-throttle drag, never clamps RPM
    // or adds enough torque to defeat crank load, stall or engine braking.
    const revHangTorque = Math.max(0, engineBrakingTorque - combustionTorque) *
      clamp01(this.config.revHang?.strength ?? 0) * this.revHangFactor;
    const netCrankTorque = combustionTorque + idleControlTorque + revHangTorque - engineBrakingTorque;

    return { combustionTorque, engineBrakingTorque, idleControlTorque, revHangTorque, netCrankTorque };
  }

  /** Apply clutch load and integrate crankshaft angular velocity. */
  public integrate(dt: number, clutchLoadTorque: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!this.isRunning) {
      this.currentRPM = 0;
      return;
    }
    const torque = this.getTorqueSample().netCrankTorque - clutchLoadTorque;
    const angularAcceleration = torque / Math.max(0.01, this.config.engineInertia);
    const nextAngularVelocity =
      rpmToRadiansPerSecond(this.currentRPM) + angularAcceleration * dt;
    const nextRPM = clamp(radiansPerSecondToRPM(nextAngularVelocity), 0, this.config.maxRPM);
    if (nextRPM <= this.config.stallRPM) {
      this.stop();
      return;
    }
    this.currentRPM = nextRPM;

    if (this.currentRPM >= this.config.revLimiterRPM) this.fuelCutActive = true;
    if (this.currentRPM < this.config.revLimiterRPM - 250) this.fuelCutActive = false;

    if (!Number.isFinite(this.currentRPM)) this.reset();
  }

  public get angularVelocity(): number {
    return rpmToRadiansPerSecond(this.currentRPM);
  }

  public get isOnLimiter(): boolean {
    return this.fuelCutActive;
  }
}
