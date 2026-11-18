import type { DriveSelector } from '../config';
import type { P2HybridConfig, TransferMode } from '../config/P2HybridConfig';
import { clamp, damp } from '../physics/math';

/** Lumped transfer clutch. No independent electric axles and no grip multiplier. */
export class MechanicalTransferCase {
  public mode: TransferMode;
  public frontShare: number;
  public rejectedReason: string | null = null;
  public constructor(private readonly config: P2HybridConfig['transfer']) {
    this.mode = config.defaultMode; this.frontShare = config.frontShare;
  }
  public get ratio(): number { return this.mode === '4L' ? this.config.lowRatio : 1; }
  public request(mode: TransferMode, speed: number, selector: DriveSelector | null, brake: number): boolean {
    this.rejectedReason = null;
    if (!this.config.modes.includes(mode)) this.rejectedReason = 'unsupported';
    else if ((mode === '4L' || this.mode === '4L') &&
      (Math.abs(speed) > this.config.lowShiftMaximumSpeed || selector !== 'N' || brake < .2)) this.rejectedReason = 'stop-select-N-and-brake';
    else if (Math.abs(speed) > this.config.highShiftMaximumSpeed) this.rejectedReason = 'speed-too-high';
    if (this.rejectedReason) return false;
    this.mode = mode;
    this.frontShare = mode === '2H' ? 0 : mode === 'AWD' ? this.config.frontShare : .5;
    return true;
  }
  public update(dt: number, frontOmega: number, rearOmega: number): void {
    if (this.mode !== 'AWD') return;
    // Rear slip engages the SAME mechanical front branch; no new source torque.
    const slip = (Math.abs(rearOmega) - Math.abs(frontOmega)) / Math.max(2, Math.abs(frontOmega), Math.abs(rearOmega));
    const target = clamp(this.config.frontShare + slip * .5, .05, this.config.maximumFrontShare);
    this.frontShare = damp(this.frontShare, target, this.config.couplingResponse, dt);
  }
  public carrierSpeed(front: number, rear: number): number { return front * this.frontShare + rear * (1 - this.frontShare); }
  public reset(): void { this.mode = this.config.defaultMode; this.frontShare = this.config.frontShare; this.rejectedReason = null; }
  public getSnapshot() { return { mode: this.mode, ratio: this.ratio, frontShare: this.frontShare,
    rearShare: 1 - this.frontShare, centerCoupling: this.mode === '4H' || this.mode === '4L' ? 'BOUNDED_50_50' : 'VARIABLE',
    rejectedReason: this.rejectedReason, axleLocks: 'NOT_SIMULATED' } as const; }
}
