import type { DriveSelector } from '../config';
import type { P2HybridConfig, TransferMode } from '../config/P2HybridConfig';
import { clamp, damp } from '../physics/math';
import { CompliantShaftCoupling } from '../physics/CompliantShaftCoupling';

/** Lumped transfer clutch. No independent electric axles and no grip multiplier. */
export class MechanicalTransferCase {
  public mode: TransferMode;
  public frontShare: number;
  public rejectedReason: string | null = null;
  public readonly centerLock?: CompliantShaftCoupling;
  public readonly rearLock?: CompliantShaftCoupling;
  public readonly frontLock?: CompliantShaftCoupling;
  public readonly wheelCouplings: readonly CompliantShaftCoupling[];
  private frontInputTorque = 0;
  private rearInputTorque = 0;
  public constructor(private readonly config: P2HybridConfig['transfer']) {
    this.mode = config.defaultMode; this.frontShare = config.frontShare;
    if (config.centerLock) this.centerLock = new CompliantShaftCoupling('center', [.5, .5, -.5, -.5], config.centerLock);
    if (config.rearLock) this.rearLock = new CompliantShaftCoupling('rear', [0, 0, 1, -1], config.rearLock);
    if (config.frontLock) this.frontLock = new CompliantShaftCoupling('front', [1, -1, 0, 0], config.frontLock);
    this.wheelCouplings = [this.centerLock, this.rearLock, this.frontLock].filter((c): c is CompliantShaftCoupling => c !== undefined);
  }
  public get ratio(): number { return this.mode === '4L' ? this.config.lowRatio : 1; }
  public request(mode: TransferMode, speed: number, selector: DriveSelector | null, brake: number): boolean {
    this.rejectedReason = null;
    if (!this.config.modes.includes(mode)) this.rejectedReason = 'unsupported';
    else if ((mode === '4H' || mode === '4L') && this.centerLock && !this.centerLock.engaged &&
      Math.abs(this.centerLock.relativeSpeed) > (this.config.lockMaximumSlip ?? 2)) this.rejectedReason = 'synchronize-front-rear-shafts';
    else if ((mode === '4L' || this.mode === '4L') &&
      (Math.abs(speed) > this.config.lowShiftMaximumSpeed || selector !== 'N' || brake < .2)) this.rejectedReason = 'stop-select-N-and-brake';
    else if (Math.abs(speed) > this.config.highShiftMaximumSpeed) this.rejectedReason = 'speed-too-high';
    if (this.rejectedReason) return false;
    this.mode = mode;
    this.frontShare = mode === '2H' ? 0 : mode === 'AWD' ? this.config.frontShare : .5;
    if (this.centerLock) this.centerLock.engaged = mode === '4H' || mode === '4L';
    if (mode === '2H' || mode === 'AWD') { if (this.rearLock) this.rearLock.engaged = false; if (this.frontLock) this.frontLock.engaged = false; }
    return true;
  }
  public requestAxleLock(axle: 'front' | 'rear', locked: boolean, speed: number): boolean {
    const lock = axle === 'front' ? this.frontLock : this.rearLock;
    this.rejectedReason = null;
    if (!lock) this.rejectedReason = 'axle-lock-not-installed';
    else if (locked && (this.mode !== '4L' && (axle === 'front' || this.mode !== '4H'))) this.rejectedReason = 'select-locked-four-wheel-drive';
    else if (locked && (Math.abs(speed) > (this.config.lockMaximumSpeed ?? 1.4) || Math.abs(lock.relativeSpeed) > (this.config.lockMaximumSlip ?? 2))) this.rejectedReason = 'stop-and-synchronize-wheels';
    if (this.rejectedReason) return false;
    lock!.engaged = locked; return true;
  }
  public update(dt: number, frontOmega: number, rearOmega: number): void {
    if (this.mode !== 'AWD') return;
    // Rear slip engages the SAME mechanical front branch; no new source torque.
    const slip = (Math.abs(rearOmega) - Math.abs(frontOmega)) / Math.max(2, Math.abs(frontOmega), Math.abs(rearOmega));
    const target = clamp(this.config.frontShare + slip * .5, .05, this.config.maximumFrontShare);
    this.frontShare = damp(this.frontShare, target, this.config.couplingResponse, dt);
  }
  public carrierSpeed(front: number, rear: number): number { return front * this.frontShare + rear * (1 - this.frontShare); }
  public recordAxleInputTorques(front: number, rear: number): void { this.frontInputTorque = front; this.rearInputTorque = rear; }
  public get axleOutputTorques() { const reaction = this.centerLock?.engaged ? this.centerLock.torque : 0;
    return { front: this.frontInputTorque - reaction, rear: this.rearInputTorque + reaction }; }
  public reset(): void { this.mode = this.config.defaultMode; this.frontShare = this.config.frontShare; this.rejectedReason = null;
    this.frontInputTorque = this.rearInputTorque = 0;
    for (const c of this.wheelCouplings) c.reset(); if (this.centerLock) this.centerLock.engaged = this.mode === '4H' || this.mode === '4L'; }
  public getSnapshot() { return { mode: this.mode, ratio: this.ratio, frontShare: this.frontShare,
    rearShare: 1 - this.frontShare, centerCoupling: this.mode === '4H' || this.mode === '4L' ? this.centerLock ? 'COMPLIANT_LOCK' : 'BOUNDED_50_50' : 'VARIABLE',
    centerLock: this.centerLock?.getSnapshot(), rearLock: this.rearLock?.getSnapshot(), frontLock: this.frontLock?.getSnapshot(),
    axleOutputTorques: this.axleOutputTorques,
    rejectedReason: this.rejectedReason, axleLocks: this.rearLock || this.frontLock ? 'CONFIGURED_DOG_LOCKS' : 'NOT_SIMULATED' } as const; }
}
