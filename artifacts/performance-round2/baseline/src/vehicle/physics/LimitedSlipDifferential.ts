import type { DifferentialConfig } from '../config/VehiclePlatformConfig';
import type { Differential, DifferentialSnapshot } from './Differential';
import { OpenDifferential } from './OpenDifferential';
import { clamp, damp } from './math';

/** Dissipative carrier coupling: torque is transferred from the faster side. */
export class LimitedSlipDifferential extends OpenDifferential {
  private lockingTorque = 0;
  public constructor(axle: 'front' | 'rear', private readonly config: Extract<DifferentialConfig, { type: 'lsd' }>) {
    super(axle);
  }
  public override reset(): void { super.reset(); this.lockingTorque = 0; }
  public override distributeTorque(torque: number, dt = 1 / 120): void {
    super.distributeTorque(torque);
    const difference = this.leftAngularVelocity - this.rightAngularVelocity;
    const bias = Math.max(1, this.config.torqueBiasRatio);
    const biasLimit = Math.abs(torque) * .5 * (bias - 1) / (bias + 1);
    const capacity = Math.min(biasLimit, Math.max(0, this.config.preload) +
      Math.abs(torque) * Math.max(0, this.config.lockStrength));
    const target = capacity * Math.tanh(difference * Math.max(0, this.config.speedDifferenceSensitivity));
    let coupling = damp(this.lockingTorque, target, this.config.response, Math.max(0, dt));
    // A speed reversal must never turn clutch dissipation into shaft power.
    coupling = difference === 0 ? 0 : Math.sign(difference) *
      clamp(coupling * Math.sign(difference), 0, capacity);
    this.lockingTorque = coupling;
    this.leftTorque -= coupling;
    this.rightTorque += coupling;
  }
  public override getSnapshot(): DifferentialSnapshot {
    return { ...super.getSnapshot(), type: 'lsd', lockingTorque: this.lockingTorque };
  }
}

export function createDifferential(axle: 'front' | 'rear', config?: DifferentialConfig): Differential {
  return config?.type === 'lsd' ? new LimitedSlipDifferential(axle, config) : new OpenDifferential(axle);
}
