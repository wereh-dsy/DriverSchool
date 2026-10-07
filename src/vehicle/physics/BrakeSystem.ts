import type { BrakeConfig } from '../config';
import type { WheelId } from './WheelContact';
import { clamp01, damp } from './math';

export interface WheelBrakeTorques {
  /** Nonnegative requested and delivered hydraulic torque, Nm. */
  readonly requestedBrakeTorque: number;
  readonly appliedBrakeTorque: number;
  /** Independent mechanical parking-brake torque, Nm; rear wheels only. */
  readonly requestedHandbrakeTorque: number;
  readonly appliedHandbrakeTorque: number;
}

/**
 * Pedal/pressure-to-torque only. Wheel rotation and tyre slip produce braking
 * forces; this class neither reduces chassis speed nor performs ABS modulation.
 */
export class BrakeSystem {
  private dynamicFrontBias: number | undefined;
  private absPressures: readonly number[] | undefined;
  public setDriverAidState(frontBias: number, pressures: readonly number[]): void {
    this.dynamicFrontBias = frontBias; this.absPressures = pressures;
  }
  public brakeInput = 0;
  public handbrakeInput = 0;

  // Radius remains accepted for older construction sites; force production was removed.
  public constructor(public readonly config: BrakeConfig, _wheelRadius = 0.315) {}

  public reset(): void {
    this.dynamicFrontBias = undefined; this.absPressures = undefined;
    this.brakeInput = 0;
    this.handbrakeInput = 0;
  }

  public update(dt: number, targetInput: number, targetHandbrake = 0): void {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const command = Number.isFinite(targetInput) ? clamp01(targetInput) : 0;
    const exponent = Number.isFinite(this.config.pedalCurveExponent)
      ? Math.max(0.1, this.config.pedalCurveExponent) : 1;
    const pressureTarget = command ** exponent;
    const response = pressureTarget > this.brakeInput
      ? this.config.applyResponse : this.config.releaseResponse;
    this.brakeInput = damp(this.brakeInput, pressureTarget,
      Number.isFinite(response) ? Math.max(0, response) : this.config.response, safeDt);
    this.handbrakeInput = damp(
      this.handbrakeInput,
      Number.isFinite(targetHandbrake) ? clamp01(targetHandbrake) : 0,
      this.config.handbrakeResponse,
      safeDt,
    );
  }

  public getWheelTorques(id: WheelId): WheelBrakeTorques {
    const frontBias = Math.min(0.98, Math.max(0.02, this.config.frontBrakeBias));
    const maximumTotalTorque = Math.max(0, Math.min(
      this.config.maxBrakeTorqueFront / frontBias,
      this.config.maxBrakeTorqueRear / (1 - frontBias),
    ));
    const front = id === 'frontLeft' || id === 'frontRight';
    const allocation = this.dynamicFrontBias ?? frontBias;
    const requestedBrakeTorque = Math.min(front ? this.config.maxBrakeTorqueFront : this.config.maxBrakeTorqueRear,
      maximumTotalTorque * this.brakeInput * (front ? allocation : 1 - allocation)) * 0.5;
    const index = id === 'frontLeft' ? 0 : id === 'frontRight' ? 1 : id === 'rearLeft' ? 2 : 3;
    const requestedHandbrakeTorque = front ? 0
      : Math.max(0, this.config.handbrakeTorque) * this.handbrakeInput * 0.5;
    return {
      requestedBrakeTorque, appliedBrakeTorque: requestedBrakeTorque * (this.absPressures?.[index] ?? 1),
      requestedHandbrakeTorque, appliedHandbrakeTorque: requestedHandbrakeTorque,
    };
  }
}
