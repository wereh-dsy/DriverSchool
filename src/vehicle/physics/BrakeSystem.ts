import type { BrakeConfig } from '../config';
import { clamp01, damp } from './math';

/** Force-based service and handbrake model. ABS/axle bias can stay behind this API. */
export class BrakeSystem {
  public brakeInput = 0;
  public handbrakeInput = 0;

  public constructor(
    public readonly config: BrakeConfig,
    private readonly wheelRadius = 0.315,
  ) {}

  public reset(): void {
    this.brakeInput = 0;
    this.handbrakeInput = 0;
  }

  public update(dt: number, targetInput: number, targetHandbrake = 0): void {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.brakeInput = damp(
      this.brakeInput,
      Number.isFinite(targetInput) ? clamp01(targetInput) : 0,
      this.config.response,
      safeDt,
    );
    this.handbrakeInput = damp(
      this.handbrakeInput,
      Number.isFinite(targetHandbrake) ? clamp01(targetHandbrake) : 0,
      this.config.handbrakeResponse,
      safeDt,
    );
  }

  /**
   * Returns a signed longitudinal force. Around rest it only cancels an
   * existing force, so the brake can hold the car without launching it back.
   */
  public calculateServiceForce(speed: number, forceWithoutBrakes: number): number {
    return this.calculateOpposingForce(
      speed,
      forceWithoutBrakes,
      (this.getServiceBrakeTorqueLimit() / Math.max(0.01, this.wheelRadius)) *
        this.brakeInput,
    );
  }

  /** Handbrake is an independent force source, never a velocity multiplier. */
  public calculateHandbrakeForce(speed: number, forceWithoutHandbrake: number): number {
    return this.calculateOpposingForce(
      speed,
      forceWithoutHandbrake,
      (this.config.handbrakeTorque / Math.max(0.01, this.wheelRadius)) *
        this.handbrakeInput,
    );
  }

  /** Backward-compatible total-force helper. */
  public calculateForce(speed: number, forceWithoutBrakes: number): number {
    const serviceForce = this.calculateServiceForce(speed, forceWithoutBrakes);
    const handbrakeForce = this.calculateHandbrakeForce(
      speed,
      forceWithoutBrakes + serviceForce,
    );
    return serviceForce + handbrakeForce;
  }

  private calculateOpposingForce(
    speed: number,
    forceWithoutThisBrake: number,
    availableForce: number,
  ): number {
    if (availableForce <= 0) return 0;
    if (Math.abs(speed) > 0.05) return -Math.sign(speed) * availableForce;
    if (Math.abs(forceWithoutThisBrake) > 0.01) {
      return -Math.sign(forceWithoutThisBrake) *
        Math.min(availableForce, Math.abs(forceWithoutThisBrake));
    }
    return 0;
  }

  private getServiceBrakeTorqueLimit(): number {
    const frontBias = Math.min(0.98, Math.max(0.02, this.config.frontBrakeBias));
    const frontLimitedTotal = this.config.maxBrakeTorqueFront / frontBias;
    const rearLimitedTotal = this.config.maxBrakeTorqueRear / (1 - frontBias);
    return Math.max(0, Math.min(frontLimitedTotal, rearLimitedTotal));
  }
}
