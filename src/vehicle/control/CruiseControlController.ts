import type { VehicleInputState } from '../../input/VehicleInputState';
import { clamp, clamp01 } from '../../input/inputMath';

export interface CruiseControlConfig {
  /** Cruise cannot be armed below this road speed. */
  minimumSetSpeedKmh: number;
  /** Defensive upper bound for corrupt telemetry or future very fast cars. */
  maximumSetSpeedKmh: number;
  /** Proportional throttle correction per m/s of speed error. */
  throttleGain: number;
  /** Slow integral correction used to remove grade and drag error. */
  integralGain: number;
  /** Approximate level-road throttle needed to hold a normal cruising speed. */
  throttleFeedForward: number;
  maximumCruiseThrottle: number;
  /** Coasting is preferred; a large overspeed can request light service brake. */
  brakeStartOverspeedKmh: number;
  brakeGain: number;
  maximumCruiseBrake: number;
  driverBrakeCancelThreshold: number;
}

export const DEFAULT_CRUISE_CONTROL_CONFIG: Readonly<CruiseControlConfig> = {
  minimumSetSpeedKmh: 25,
  maximumSetSpeedKmh: 250,
  throttleGain: 0.075,
  integralGain: 0.018,
  throttleFeedForward: 0.12,
  maximumCruiseThrottle: 0.72,
  brakeStartOverspeedKmh: 5,
  brakeGain: 0.035,
  maximumCruiseBrake: 0.16,
  driverBrakeCancelThreshold: 0.04,
};

export interface CruiseControlContext {
  /** Vehicle-level feature flag; currently enabled only for the sports coupe. */
  available: boolean;
  /** Signed longitudinal speed. Positive is forward. */
  speedMetersPerSecond: number;
  engineRunning: boolean;
  gear: string | number;
}

export type CruiseControlEventReason =
  | 'activated'
  | 'driver-toggle'
  | 'driver-brake'
  | 'parking-brake'
  | 'manual-clutch'
  | 'engine-off'
  | 'not-forward-gear'
  | 'speed-too-low'
  | 'unavailable';

export interface CruiseControlEvent {
  sequence: number;
  kind: 'activated' | 'cancelled' | 'rejected';
  reason: CruiseControlEventReason;
}

export interface CruiseControlStatus {
  available: boolean;
  active: boolean;
  targetSpeedKmh: number | null;
  lastEvent: CruiseControlEvent | null;
}

/**
 * Driver-assistance policy placed between normalized input and vehicle physics.
 *
 * This controller deliberately knows nothing about the browser Gamepad API.
 * It consumes the same VehicleInputState used by keyboard and future wheel
 * adapters, then returns a new normalized state for VehicleDynamics.
 */
export class CruiseControlController {
  public readonly config: CruiseControlConfig;

  private active = false;
  private available = false;
  private targetSpeedMetersPerSecond: number | null = null;
  private speedErrorIntegral = 0;
  private eventSequence = 0;
  private lastEvent: CruiseControlEvent | null = null;

  public constructor(config: Partial<CruiseControlConfig> = {}) {
    this.config = { ...DEFAULT_CRUISE_CONTROL_CONFIG, ...config };
  }

  public get status(): CruiseControlStatus {
    return {
      available: this.available,
      active: this.active,
      targetSpeedKmh: this.targetSpeedMetersPerSecond === null
        ? null
        : this.targetSpeedMetersPerSecond * 3.6,
      lastEvent: this.lastEvent === null ? null : { ...this.lastEvent },
    };
  }

  public update(
    deltaTime: number,
    input: VehicleInputState,
    context: CruiseControlContext,
  ): VehicleInputState {
    this.available = context.available;
    const unsafeReason = this.getUnsafeReason(input, context);

    if (input.cruiseToggle) {
      if (this.active) {
        this.cancel('driver-toggle');
      } else if (unsafeReason === null) {
        const speed = clamp(
          context.speedMetersPerSecond,
          this.config.minimumSetSpeedKmh / 3.6,
          this.config.maximumSetSpeedKmh / 3.6,
        );
        this.active = true;
        this.targetSpeedMetersPerSecond = speed;
        this.speedErrorIntegral = 0;
        this.emit('activated', 'activated');
      } else {
        this.emit('rejected', unsafeReason);
      }
    } else if (this.active && unsafeReason !== null) {
      this.cancel(unsafeReason);
    }

    if (!this.active || this.targetSpeedMetersPerSecond === null) return input;

    const dt = Number.isFinite(deltaTime) ? clamp(deltaTime, 0, 0.1) : 0;
    const speedError = this.targetSpeedMetersPerSecond - context.speedMetersPerSecond;
    this.speedErrorIntegral = clamp(
      this.speedErrorIntegral + speedError * dt,
      -8,
      8,
    );

    const cruiseThrottle = clamp01(
      this.config.throttleFeedForward +
      speedError * this.config.throttleGain +
      this.speedErrorIntegral * this.config.integralGain,
    );
    const limitedCruiseThrottle = Math.min(
      cruiseThrottle,
      this.config.maximumCruiseThrottle,
    );
    const overspeed = -speedError;
    const brakeStart = this.config.brakeStartOverspeedKmh / 3.6;
    const driverIsAccelerating = input.throttle > limitedCruiseThrottle + 0.01;
    const cruiseBrake = !driverIsAccelerating && overspeed > brakeStart
      ? Math.min(
        this.config.maximumCruiseBrake,
        (overspeed - brakeStart) * this.config.brakeGain,
      )
      : 0;

    return {
      ...input,
      throttle: cruiseBrake > 0
        ? input.throttle
        : Math.max(input.throttle, limitedCruiseThrottle),
      brake: Math.max(input.brake, cruiseBrake),
    };
  }

  /** Cancel without generating a driver-facing event, e.g. during vehicle reset. */
  public reset(): void {
    this.active = false;
    this.targetSpeedMetersPerSecond = null;
    this.speedErrorIntegral = 0;
    this.available = false;
  }

  private getUnsafeReason(
    input: VehicleInputState,
    context: CruiseControlContext,
  ): Exclude<CruiseControlEventReason, 'activated' | 'driver-toggle'> | null {
    if (!context.available) return 'unavailable';
    if (!context.engineRunning) return 'engine-off';
    if (input.controlMode === 'manual-clutch') return 'manual-clutch';
    if (input.handbrake > 0.05) return 'parking-brake';
    if (input.brake > this.config.driverBrakeCancelThreshold) return 'driver-brake';
    if (typeof context.gear !== 'number' || context.gear < 1) return 'not-forward-gear';
    const minimumSpeedKmh = this.active
      ? this.config.minimumSetSpeedKmh * 0.4
      : this.config.minimumSetSpeedKmh;
    if (
      !Number.isFinite(context.speedMetersPerSecond) ||
      context.speedMetersPerSecond < minimumSpeedKmh / 3.6
    ) return 'speed-too-low';
    return null;
  }

  private cancel(reason: CruiseControlEventReason): void {
    this.active = false;
    this.targetSpeedMetersPerSecond = null;
    this.speedErrorIntegral = 0;
    this.emit('cancelled', reason);
  }

  private emit(kind: CruiseControlEvent['kind'], reason: CruiseControlEventReason): void {
    this.eventSequence += 1;
    this.lastEvent = { sequence: this.eventSequence, kind, reason };
  }
}
