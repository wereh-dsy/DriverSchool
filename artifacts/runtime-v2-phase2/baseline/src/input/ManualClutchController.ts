import { applyAxisDeadzone, clamp, clamp01 } from './inputMath';

export interface ManualClutchControllerConfig {
  /** Deadzone around the centred rate-control axis. */
  deadzone: number;
  /** > 1 gives extra resolution to small stick movements. */
  responseExponent: number;
  /** Pedal travel per second at full downward deflection. */
  pressRate: number;
  /** Pedal travel per second at full upward deflection. */
  releaseRate: number;
  /** Protect against a background tab producing one very large pedal jump. */
  maximumDeltaTime: number;
}

export const DEFAULT_MANUAL_CLUTCH_CONFIG: Readonly<ManualClutchControllerConfig> = {
  deadzone: 0.14,
  responseExponent: 1.7,
  pressRate: 2.2,
  releaseRate: 1.15,
  maximumDeltaTime: 0.1,
};

/**
 * Integrates a centred stick as pedal velocity rather than pedal position.
 * Positive input presses the pedal; negative input releases it. At centre the
 * pedal remains exactly where the driver left it.
 */
export class ManualClutchController {
  private pedal = 1;
  private readonly config: ManualClutchControllerConfig;

  public constructor(config: Partial<ManualClutchControllerConfig> = {}) {
    this.config = { ...DEFAULT_MANUAL_CLUTCH_CONFIG, ...config };
  }

  public get clutchPedal(): number {
    return this.pedal;
  }

  public get clutchEngagement(): number {
    return 1 - this.pedal;
  }

  /** Seamlessly take over from the currently simulated clutch engagement. */
  public takeOver(actualClutchEngagement: number): number {
    this.pedal = 1 - clamp01(actualClutchEngagement);
    return this.pedal;
  }

  public setPedal(clutchPedal: number): number {
    this.pedal = clamp01(clutchPedal);
    return this.pedal;
  }

  public update(deltaTime: number, rateAxis: number): number {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return this.pedal;
    const dt = Math.min(deltaTime, Math.max(0, this.config.maximumDeltaTime));
    const shapedRate = applyAxisDeadzone(
      clamp(rateAxis, -1, 1),
      this.config.deadzone,
      this.config.responseExponent,
    );
    if (shapedRate === 0) return this.pedal;

    const travelRate = shapedRate > 0
      ? this.config.pressRate
      : this.config.releaseRate;
    this.pedal = clamp01(this.pedal + shapedRate * travelRate * dt);
    return this.pedal;
  }
}
