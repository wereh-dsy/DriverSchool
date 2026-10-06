import type { DriveSelector, Gear } from '../config';
import type { Gearbox } from '../physics/Gearbox';

/** No braking trick: P is a separate parking constraint enabled only near rest. */
export class SelectorSafety {
  public mode: DriveSelector = 'P';
  public rejectedReason: string | null = null;
  public constructor(private readonly gearbox: Gearbox, private readonly parkMaximumSpeed: number,
    private readonly wheelRadius: number, private readonly maximumSafeInputRPM: number,
    private readonly cruiseTargetRPM: number) {}
  public reset(gear: Gear = 'N', selector?: DriveSelector): void {
    this.mode = selector ?? 'P';
    this.rejectedReason = null;
    this.gearbox.setGear(this.mode === 'D' ? (typeof gear === 'number' ? gear : 1) : this.mode === 'R' ? 'R' : 'N');
  }
  /** Service-brake interlock applies to driver PRND changes, never ratio shifts. */
  public request(mode: DriveSelector, speed: number, lateralSpeed = 0, brake = 0): boolean {
    if (mode !== 'P' && mode !== 'R' && mode !== 'N' && mode !== 'D') return false;
    // Re-selecting the current mode is harmless and must not produce a warning.
    if (mode === this.mode) { this.rejectedReason = null; return true; }
    if (!Number.isFinite(brake) || brake < 0.1) {
      this.rejectedReason = 'brake-required'; return false;
    }
    if (mode === 'P' && Math.hypot(speed, lateralSpeed) > this.parkMaximumSpeed) {
      this.rejectedReason = 'park-while-moving'; return false;
    }
    if ((mode === 'R' && speed > this.gearbox.config.reverseLockoutSpeed) ||
        (mode === 'D' && speed < -this.gearbox.config.reverseLockoutSpeed)) {
      this.rejectedReason = 'direction-while-moving'; return false;
    }
    this.rejectedReason = null;
    let targetGear: Gear = mode === 'R' ? 'R' : 'N';
    if (mode === 'D') {
      // Rolling N -> D must not select launch gear and over-speed the crank.
      // Pick a gentle cruise ratio; the normal shift map can kick down later.
      const wheelOmega = Math.abs(speed) / Math.max(0.01, this.wheelRadius);
      const candidates = this.gearbox.getForwardGears().map((gear) => ({ gear,
        rpm: wheelOmega * this.gearbox.config.finalDriveRatio * this.gearbox.getRatio(gear) * 60 / (2 * Math.PI) }))
        .filter((candidate) => candidate.rpm <= this.maximumSafeInputRPM);
      if (candidates.length === 0) { this.rejectedReason = 'drive-over-speed'; return false; }
      targetGear = Math.abs(speed) < 0.65 ? 1 : candidates.reduce((best, candidate) =>
        Math.abs(candidate.rpm - this.cruiseTargetRPM) < Math.abs(best.rpm - this.cruiseTargetRPM) ? candidate : best).gear;
    }
    this.mode = mode;
    this.gearbox.setGear(targetGear);
    return true;
  }
  public get parkingLocked(): boolean { return this.mode === 'P'; }
  public get driving(): boolean { return this.mode === 'D' || this.mode === 'R'; }
}
