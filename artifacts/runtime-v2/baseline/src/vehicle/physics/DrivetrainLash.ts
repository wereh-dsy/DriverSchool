import type { TransmissionConfig } from '../config';
import { clamp, clamp01, moveTowards } from './math';

export interface DrivetrainLashSnapshot {
  /** Engine -> gearbox torque direction, including when the vehicle reverses. */
  state: number;
  target: -1 | 0 | 1;
  effectiveTorqueFactor: number;
  /** Signed, normalized reload transient: drive +, engine braking -. */
  joltIntensity: number;
}

/** A short dissipative take-up interval, without shaft inertia or oscillation. */
export class DrivetrainLash {
  private state = 0;
  private target: -1 | 0 | 1 = 0;
  private factor = 1;
  private jolt = 0;
  private loadedDirection: -1 | 0 | 1 = 0;

  public constructor(private readonly config?: TransmissionConfig['drivetrainLash']) {}

  public reset(): void {
    this.state = 0; this.target = 0; this.factor = 1;
    this.jolt = 0; this.loadedDirection = 0;
  }

  public update(dt: number, requestedTorque: number, torqueCapacity: number): number {
    if (this.config === undefined) { this.reset(); return 1; }
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const torque = Number.isFinite(requestedTorque) ? requestedTorque : 0;
    const deadzone = Math.max(1, this.config.torqueDeadzone);
    this.target = torque > deadzone ? 1 : torque < -deadzone ? -1 : 0;
    const duration = clamp(this.config.reversalTime, 0.05, 0.15);
    this.state = moveTowards(this.state, this.target, 2 * safeDt / duration);
    this.jolt *= Math.exp(-22 * safeDt);
    const alignment = Math.max(0, this.state * this.target);
    // Keep a substantial connection through the take-up region. At either
    // loaded end the original positive/negative wheel torque is fully restored.
    const targetFactor = this.target === 0 ? 1 : 0.65 + 0.35 * alignment * alignment * (3 - 2 * alignment);
    this.factor = moveTowards(this.factor, targetFactor, 1.4 * safeDt / duration);
    if (this.target !== 0 && alignment >= 0.95) {
      if (this.loadedDirection !== 0 && this.loadedDirection !== this.target && Math.abs(torque) > deadzone * 4) {
        this.jolt = this.target * 0.22 * clamp01(Math.abs(torque) / Math.max(1, torqueCapacity));
      }
      this.loadedDirection = this.target;
    }
    return this.factor;
  }

  public getSnapshot(): DrivetrainLashSnapshot {
    return { state: this.state, target: this.target, effectiveTorqueFactor: this.factor,
      joltIntensity: Math.abs(this.jolt) < 1e-4 ? 0 : this.jolt };
  }
}
