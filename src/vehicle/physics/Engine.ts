import type { EngineConfig, TorqueCurvePoint } from '../config';
import {
  clamp,
  clamp01,
  damp,
  radiansPerSecondToRPM,
  rpmToRadiansPerSecond,
} from './math';
import { Turbocharger } from './Turbocharger';
import type { DriveTorqueSource } from './DriveTorqueSource';

export interface EngineTurboSnapshot {
  enabled: boolean;
  turboSpeed: number;
  manifoldPressureBar: number;
  boostPressureBar: number;
  wastegateOpening: number;
  baseTorquePotential: number;
  availableTorque: number;
}

export interface EngineTorqueSample {
  combustionTorque: number;
  /** Bearing/accessory drag, always present while the crank is running. */
  mechanicalFrictionTorque: number;
  /** Closed-throttle airflow drag, separate from mechanical friction. */
  pumpingLossTorque: number;
  /** Compatibility observation: mechanical friction plus pumping loss. */
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
export class Engine implements DriveTorqueSource {
  public requestedDrive = 0;
  public deliveredDriveTorque = 0;
  public lastTorqueSample: EngineTorqueSample | undefined;
  public get shaftAngularVelocity(): number { return this.angularVelocity; }
  public get availableDriveTorque(): number { return this.getTorqueSample().netCrankTorque; }
  public get canDeliverTorque(): boolean { return this.isRunning && this.fuelAvailable; }
  private revHangContext: RevHangContext | undefined;
  public setRevHangContext(context: RevHangContext): void { this.revHangContext = context; }
  public requestDrive(demand: number, dt: number): void {
    this.requestedDrive = clamp01(demand); this.updateThrottle(this.requestedDrive, dt, this.revHangContext);
  }
  public updateState(dt: number, loadTorque: number): void {
    this.lastTorqueSample = this.integrate(dt, loadTorque);
    this.deliveredDriveTorque = this.lastTorqueSample?.netCrankTorque ?? 0;
  }
  private firingPhase = 0;
  private rippleWave = 0;
  /** Existing engineInertia remains the configured kg m² reference. */
  public get rotationalInertia(): number {
    return this.config.engineInertia * (this.config.firingCharacter?.inertiaScale ??
      (this.config.layout === 'INLINE' ? this.config.cylinderCount > 4 ? 1.04 : 1 : this.config.layout === 'V' ? 1.10 : 1.18));
  }
  public get firingFrequencyHz(): number { return this.currentRPM * this.config.cylinderCount / 120; }
  private get startup(): EngineConfig['ignitionSequence'] { return this.config.ignitionSequence ?? this.config.startupCharacter; }
  private torqueLimitFactor = 1;
  /** Combustion-only intervention; does not change pedal, throttle actuator, drag or idle governor. */
  public setTorqueLimitFactor(factor: number): void { this.torqueLimitFactor = clamp01(Number.isFinite(factor) ? factor : 1); }
  public currentRPM: number;
  public throttle = 0;
  public isRunning = true;
  public ignitionOn = true;
  public ignitionPhase: 'OFF' | 'CRANKING' | 'CATCH' | 'RUNNING' | 'STOPPING' = 'RUNNING';
  private ignitionElapsed = 0;
  public get isStarting(): boolean { return this.ignitionPhase === 'CRANKING' || this.ignitionPhase === 'CATCH'; }
  private fuelAvailable = true;
  private fuelStarvedCoasting = false;

  public setFuelAvailable(available: boolean): void {
    this.fuelAvailable = available;
    if (!available && this.currentRPM > 0) this.fuelStarvedCoasting = true;
    if (available && this.isRunning) this.fuelStarvedCoasting = false;
  }

  private readonly torqueCurve: readonly TorqueCurvePoint[];
  private readonly baseTorqueCurve: readonly TorqueCurvePoint[] | undefined;
  private readonly turbo: Turbocharger | undefined;
  private fuelCutActive = false;
  private previousThrottleCommand = 0;
  private recentLiftTime = 0;
  private revHangElapsed = -1;
  private revHangFactor = 0;

  public constructor(public readonly config: EngineConfig) {
    if (!['INLINE', 'V', 'W'].includes(config.layout) || !Number.isInteger(config.cylinderCount) ||
        config.cylinderCount < 1 || config.cylinderCount > 16 ||
        (config.layout === 'V' && (config.cylinderCount < 4 || config.cylinderCount % 2 !== 0)) ||
        (config.layout === 'W' && (config.cylinderCount < 8 || config.cylinderCount % 4 !== 0)) ||
        (config.bankAngle !== undefined && (!Number.isFinite(config.bankAngle) || config.bankAngle <= 0 || config.bankAngle >= Math.PI))) {
      throw new Error('Invalid engine layout, cylinder count or bank angle.');
    }
    if (config.torqueCurve.length === 0) {
      throw new Error('Engine torqueCurve must contain at least one sample.');
    }
    this.torqueCurve = [...config.torqueCurve].sort((a, b) => a.rpm - b.rpm);
    if (config.turbo?.enabled === true) {
      if (config.turbo.baseTorqueCurve.length === 0 ||
        config.turbo.baseTorqueCurve.some((point) => !Number.isFinite(point.rpm) ||
          !Number.isFinite(point.torque) || point.torque < 0)) {
        throw new Error('Turbo baseTorqueCurve must contain finite non-negative samples.');
      }
      this.baseTorqueCurve = [...config.turbo.baseTorqueCurve].sort((a, b) => a.rpm - b.rpm);
      this.turbo = new Turbocharger(config.turbo);
    }
    this.currentRPM = config.idleRPM;
  }

  public reset(rpm = this.config.idleRPM, running = true): void {
    this.ignitionOn = running;
    this.requestedDrive = 0; this.deliveredDriveTorque = 0;
    this.lastTorqueSample = undefined; this.revHangContext = undefined;
    this.firingPhase = 0; this.rippleWave = 0;
    this.torqueLimitFactor = 1;
    this.fuelStarvedCoasting = false;
    this.isRunning = running && this.fuelAvailable;
    this.ignitionPhase = this.isRunning ? 'RUNNING' : 'OFF';
    this.ignitionElapsed = 0;
    this.currentRPM = this.isRunning
      ? clamp(rpm, this.config.stallRPM + 1, this.config.maxRPM)
      : 0;
    this.throttle = 0;
    this.fuelCutActive = false;
    this.resetRevHang();
    this.turbo?.reset();
  }

  /** Starter abstraction; ignition timing and battery state can be added later. */
  public start(): void {
    if (!this.fuelAvailable) return;
    this.ignitionOn = true;
    this.fuelStarvedCoasting = false;
    this.isRunning = this.startup === undefined;
    this.ignitionPhase = this.startup === undefined ? 'RUNNING' : 'CRANKING';
    this.ignitionElapsed = 0;
    if (this.startup === undefined) this.currentRPM = this.config.idleRPM;
    this.throttle = 0;
    this.fuelCutActive = false;
    this.resetRevHang();
  }

  public stop(): void {
    this.ignitionOn = false;
    this.fuelStarvedCoasting = false;
    this.isRunning = false;
    this.ignitionPhase = this.startup !== undefined && this.currentRPM > 0 ? 'STOPPING' : 'OFF';
    this.ignitionElapsed = 0;
    if (this.startup === undefined) this.currentRPM = 0;
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
    return this.interpolateTorque(this.torqueCurve, rpm);
  }

  private interpolateTorque(curve: readonly TorqueCurvePoint[], rpm: number): number {
    const first = curve[0];
    const last = curve[curve.length - 1];
    if (first === undefined || last === undefined) return 0;
    if (rpm <= first.rpm) return first.torque;
    if (rpm >= last.rpm) return last.torque;

    for (let index = 1; index < curve.length; index += 1) {
      const upper = curve[index];
      const lower = curve[index - 1];
      if (upper !== undefined && lower !== undefined && rpm <= upper.rpm) {
        const range = Math.max(1, upper.rpm - lower.rpm);
        const fraction = (rpm - lower.rpm) / range;
        return lower.torque + (upper.torque - lower.torque) * fraction;
      }
    }
    return last.torque;
  }

  /** Read-only air-limited potential. Sampling never advances turbo state. */
  public get availableTorque(): number {
    const ceiling = this.getTorqueAtRPM(this.currentRPM);
    if (!this.turbo || !this.baseTorqueCurve) return ceiling;
    return Math.min(ceiling,
      this.interpolateTorque(this.baseTorqueCurve, this.currentRPM) * this.turbo.manifoldPressure);
  }

  /** On-demand debug snapshot; not allocated inside the fixed physics tick. */
  public getTurboSnapshot(): EngineTurboSnapshot {
    return {
      enabled: this.turbo !== undefined,
      turboSpeed: this.turbo?.turboSpeed ?? 0,
      manifoldPressureBar: this.turbo?.manifoldPressure ?? 1,
      boostPressureBar: (this.turbo?.manifoldPressure ?? 1) - 1,
      wastegateOpening: this.turbo?.wastegateOpening ?? 0,
      baseTorquePotential: this.interpolateTorque(this.baseTorqueCurve ?? this.torqueCurve, this.currentRPM),
      availableTorque: this.availableTorque,
    };
  }

  /** Current net torque available at the crank before clutch load. */
  public getTorqueSample(): EngineTorqueSample {
    if (!this.isRunning && !this.fuelStarvedCoasting) {
      return {
        combustionTorque: 0,
        mechanicalFrictionTorque: 0,
        pumpingLossTorque: 0,
        engineBrakingTorque: 0,
        idleControlTorque: 0,
        netCrankTorque: 0,
        revHangTorque: 0,
      };
    }

    const rpmRange = Math.max(1, this.config.redlineRPM - this.config.idleRPM);
    const normalizedRPM = clamp((this.currentRPM - this.config.idleRPM) / rpmRange, 0, 1);
    const canBurn = this.isRunning && this.fuelAvailable;
    const limiterMultiplier = this.fuelCutActive || !canBurn ? 0 : 1;
    // The command curve shapes combustion only; it must not erase crank drag
    // at wide-open throttle. Legacy configurations retain the linear mapping.
    const combustionThrottle = clamp01(this.throttle) ** Math.max(0.1, this.config.partThrottleExponent ?? 1);
    const combustionTorque =
      this.availableTorque * combustionThrottle * limiterMultiplier * this.torqueLimitFactor *
      (1 + this.rippleWave * (this.config.torqueRipple ?? .018) * 4 / this.config.cylinderCount);

    // Mechanical drag is independent of pedal position. The existing
    // engineBrakingStrength remains the speed-dependent pumping-loss strength;
    // their sum preserves the former closed-throttle curve at every RPM.
    const mechanicalFrictionTorque = Math.max(0, this.config.engineFrictionTorque);
    const pumpingLossTorque = Math.max(0, this.config.engineBrakingStrength) *
      normalizedRPM * (1 - clamp01(this.throttle)) ** 1.6 *
      (this.config.firingCharacter?.brakingScale ?? (this.config.layout === 'INLINE' ? 1 : 1.04));
    const engineBrakingTorque = mechanicalFrictionTorque + pumpingLossTorque;

    // The governor exactly compensates normal friction at target idle, then
    // adds a finite reserve as RPM sags. Unlike the old minimum-RPM clamp this
    // can be overwhelmed by a locked drivetrain, allowing a genuine stall.
    const startup = this.startup;
    const idleTarget = this.ignitionPhase === 'CATCH' && startup !== undefined
      ? this.config.idleRPM + (startup.flareRPM - this.config.idleRPM) *
        Math.max(0, 1 - this.ignitionElapsed / startup.settlingDuration) : this.config.idleRPM;
    const idleError = clamp(
      (idleTarget - this.currentRPM) / Math.max(1, this.config.idleControlBandRPM),
      0,
      1,
    );
    const idleReserve = Math.max(0, this.config.idleControlStrength - engineBrakingTorque);
    const idleActivation = clamp(
      (idleTarget * 1.15 - this.currentRPM) /
        Math.max(1, this.config.idleRPM * 0.15),
      0,
      1,
    );
    const idleControlTorque =
      canBurn ? (engineBrakingTorque + idleReserve * idleError) * idleActivation *
        (1 + this.rippleWave * (this.config.torqueRipple ?? .018) * 4 / this.config.cylinderCount) : 0;
    // Residual airflow offsets part of closed-throttle drag, never clamps RPM
    // or adds enough torque to defeat crank load, stall or engine braking.
    const revHangTorque = (canBurn ? 1 : 0) * Math.max(0, engineBrakingTorque - combustionTorque) *
      clamp01(this.config.revHang?.strength ?? 0) * this.revHangFactor;
    const netCrankTorque = combustionTorque + idleControlTorque + revHangTorque - engineBrakingTorque;

    return { combustionTorque, mechanicalFrictionTorque, pumpingLossTorque,
      engineBrakingTorque, idleControlTorque, revHangTorque, netCrankTorque };
  }

  /** Apply clutch load and integrate crankshaft angular velocity. */
  public integrate(dt: number, clutchLoadTorque: number): EngineTorqueSample | undefined {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const sequence = this.startup;
    if (sequence !== undefined && this.ignitionPhase === 'STOPPING') {
      const omega = this.angularVelocity;
      const drag = this.config.engineFrictionTorque + sequence.shutdownFriction * Math.min(1, omega / 50);
      this.currentRPM = radiansPerSecondToRPM(Math.max(0, omega - drag / this.rotationalInertia * dt));
      if (this.currentRPM <= 1) { this.currentRPM = 0; this.ignitionPhase = 'OFF'; }
      this.turbo?.update(dt, this.currentRPM, 0, 0, 0, 0, false);
      return;
    }
    if (sequence !== undefined && this.ignitionPhase === 'CRANKING') {
      if (!this.fuelAvailable) {
        const ignitionOn = this.ignitionOn;
        this.stop(); this.ignitionOn = ignitionOn;
        return;
      }
      this.ignitionElapsed += dt;
      // Starter torque approaches cranking speed against inertia, with no combustion.
      const starterTorque = Math.min(this.config.starterTorque,
        Math.max(0, rpmToRadiansPerSecond(sequence.crankingRPM) - this.angularVelocity) * this.rotationalInertia * 8);
      this.currentRPM += radiansPerSecondToRPM(starterTorque / this.rotationalInertia * dt);
      if (this.ignitionElapsed >= sequence.crankingDuration) {
        this.ignitionPhase = 'CATCH'; this.ignitionElapsed = 0; this.isRunning = true;
      }
      return;
    }
    if (this.ignitionPhase === 'CATCH' && sequence !== undefined) {
      this.ignitionElapsed += dt;
      if (this.ignitionElapsed >= sequence.settlingDuration) this.ignitionPhase = 'RUNNING';
    }
    if (!this.isRunning && !this.fuelStarvedCoasting) {
      this.currentRPM = 0;
      this.turbo?.update(dt, 0, 0, 0, 0, 0, false);
      return;
    }
    if (this.turbo) {
      const demand = this.fuelCutActive || !this.fuelAvailable || !this.isRunning ? 0
        : clamp01(this.throttle) ** Math.max(0.1, this.config.partThrottleExponent ?? 1);
      this.turbo.update(dt, this.currentRPM, this.throttle, demand,
        clutchLoadTorque, this.getTorqueAtRPM(this.currentRPM), this.isRunning && this.fuelAvailable);
    }
    // Integrate an average firing pulse, attenuating above the 120 Hz solver's
    // resolvable band. This prevents high-RPM aliases from changing mean output.
    const phaseStep = this.firingFrequencyHz * 2 * Math.PI * dt;
    const halfStep = phaseStep * .5;
    const smoothness = this.config.firingCharacter?.smoothness ??
      Math.min(.95, .55 + this.config.cylinderCount * .045 + (this.config.layout === 'INLINE' ? .04 : 0));
    const band = Math.max(0, 1 - this.firingFrequencyHz * dt * 2);
    this.rippleWave = Math.sin(this.firingPhase + halfStep) *
      (halfStep > 1e-6 ? Math.sin(halfStep) / halfStep : 1) * band * (1 - smoothness);
    this.firingPhase = (this.firingPhase + phaseStep) % (Math.PI * 2);
    const sample = this.getTorqueSample();
    const torque = sample.netCrankTorque - clutchLoadTorque;
    const angularAcceleration = torque / Math.max(0.01, this.rotationalInertia);
    const nextAngularVelocity =
      rpmToRadiansPerSecond(this.currentRPM) + angularAcceleration * dt;
    const nextRPM = clamp(radiansPerSecondToRPM(nextAngularVelocity), 0, this.config.maxRPM);
    if (nextRPM <= this.config.stallRPM && this.ignitionPhase !== 'CATCH') {
      if (this.fuelStarvedCoasting) {
        this.isRunning = false;
        this.currentRPM = nextRPM;
        if (nextRPM <= 0) this.fuelStarvedCoasting = false;
      } else {
        const ignitionOn = this.ignitionOn;
        this.stop();
        this.ignitionOn = ignitionOn;
      }
      return sample;
    }
    this.currentRPM = nextRPM;

    if (this.currentRPM >= this.config.revLimiterRPM) this.fuelCutActive = true;
    if (this.currentRPM < this.config.revLimiterRPM - 250) this.fuelCutActive = false;

    if (!Number.isFinite(this.currentRPM)) this.reset();
    return sample;
  }

  public get angularVelocity(): number {
    return rpmToRadiansPerSecond(this.currentRPM);
  }

  public get isOnLimiter(): boolean {
    return this.fuelCutActive;
  }
}
