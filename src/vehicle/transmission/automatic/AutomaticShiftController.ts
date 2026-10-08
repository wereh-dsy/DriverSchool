import type { AutomaticShiftConfig, ForwardGear } from '../../config';
import type { Gearbox } from '../../physics/Gearbox';
import { clamp01 } from '../../physics/math';
import type { TransmissionContext } from '../TransmissionSystem';

export interface ShiftDecision { gear: ForwardGear; kickdown: boolean }

/** Shared decisions only: AT and DCT own different physical shift actuators. */
export class AutomaticShiftController {
  public manualSelectionActive = false;
  public manualSelectionRejectedReason: string | null = null;
  private manualElapsed = 0;
  private pendingManual: -1 | 1 | null = null;
  private map: AutomaticShiftConfig['map'];
  private mapSource: AutomaticShiftConfig['map'];
  public requestManualSelection(direction: -1 | 1): void {
    if (this.gearbox.config.supportsManualSelection !== true) return;
    this.manualSelectionActive = true; this.manualElapsed = 0;
    this.pendingManual = direction; this.manualSelectionRejectedReason = null;
  }
  public returnToAuto(): void {
    this.manualSelectionActive = false; this.manualElapsed = 0; this.pendingManual = null;
    this.manualSelectionRejectedReason = null;
  }
  private timeInGear = 0;
  private previousThrottle = 0;
  public constructor(private readonly config: AutomaticShiftConfig, private readonly gearbox: Gearbox, private readonly wheelRadius: number) {
    this.mapSource = config.map;
    this.map = [...config.map].sort((a, b) => a.throttle - b.throttle);
  }
  public reset(): void { this.timeInGear = 0; this.previousThrottle = 0; this.returnToAuto(); }
  public gearChanged(): void { this.timeInGear = 0; }
  public decide(context: TransmissionContext, shifting: boolean): ShiftDecision | null {
    this.timeInGear += context.dt;
    const throttle = clamp01(context.throttle);
    const risingThrottle = throttle - this.previousThrottle;
    this.previousThrottle = throttle;
    if (this.manualSelectionActive) this.manualElapsed += context.dt;
    if (shifting && this.pendingManual !== null) {
      this.pendingManual = null; this.manualSelectionRejectedReason = 'shift-in-progress';
    }
    if (shifting || !context.engineRunning || typeof this.gearbox.currentGear !== 'number') return null;
    const gear = this.gearbox.currentGear;
    const maxGear = this.gearbox.getMaximumForwardGear();
    const outputOmega = Math.abs(context.drivenWheelAngularVelocity) * this.gearbox.config.finalDriveRatio;
    const predictedRPM = (target: ForwardGear): number => outputOmega * this.gearbox.getRatio(target) * 60 / (2 * Math.PI);
    const currentRPM = predictedRPM(gear);
    const roadOmega = Math.abs(context.vehicleSpeed) / Math.max(.01, this.wheelRadius) * this.gearbox.config.finalDriveRatio;
    const safeRPM = (target: ForwardGear): number => Math.max(outputOmega, roadOmega) * this.gearbox.getRatio(target) * 60 / (2 * Math.PI);
    if (this.manualSelectionActive) {
      const request = this.pendingManual; this.pendingManual = null;
      if (request !== null) {
        const target = (gear + request) as ForwardGear;
        if (!this.gearbox.isGearAvailable(target)) this.manualSelectionRejectedReason = 'gear-not-available';
        else if (safeRPM(target) > context.redlineRPM * .97) this.manualSelectionRejectedReason = 'engine-over-speed';
        else if (request > 0 && safeRPM(target) < context.idleRPM * .85) this.manualSelectionRejectedReason = 'anti-lug';
        else return { gear: target, kickdown: false };
      }
      // Necessary low-speed/anti-lug protection takes precedence over a held gear.
      if (gear > 1 && currentRPM < context.idleRPM * 1.05) {
        const target = (Math.abs(context.vehicleSpeed) < .65 && safeRPM(1) < context.redlineRPM * .97 ? 1 : gear - 1) as ForwardGear;
        if (safeRPM(target) < context.redlineRPM * .97) return { gear: target, kickdown: false };
      }
      if (this.gearbox.config.manualAutoUpshiftAtRedline === true && gear < maxGear &&
          Math.max(currentRPM, context.engineRPM) >= context.redlineRPM * .985 &&
          safeRPM((gear + 1) as ForwardGear) > context.idleRPM) return { gear: (gear + 1) as ForwardGear, kickdown: false };
      const stable = throttle < .75 && context.brake < .1 && Math.abs(context.vehicleLateralSpeed ?? 0) < .75 && Math.abs(risingThrottle) < .03;
      if (this.manualElapsed >= (this.gearbox.config.manualSelectionTimeout ?? 8) && stable) this.returnToAuto();
      else return null;
    }
    if (Math.abs(context.vehicleSpeed) < 0.65 && gear !== 1) return { gear: 1, kickdown: false };
    if (this.timeInGear < this.config.minimumTimeInGear) return null;
    const heavy = throttle >= this.config.kickdownThrottle;
    if (heavy && gear > 1 && (risingThrottle > 0.08 || currentRPM < this.config.kickdownTargetRPM * 0.8)) {
      let target = gear;
      for (let candidate = 1; candidate < gear; candidate += 1) {
        const rpm = predictedRPM(candidate as ForwardGear);
        if (rpm <= Math.min(this.config.kickdownMaximumRPM, context.redlineRPM * 0.95) &&
            rpm >= context.idleRPM * 1.3) { target = candidate as ForwardGear; break; }
      }
      if (target < gear && predictedRPM(target) > currentRPM + this.config.hysteresisRPM) return { gear: target, kickdown: true };
    }
    if (this.mapSource !== this.config.map) {
      this.mapSource = this.config.map;
      this.map = [...this.config.map].sort((a, b) => a.throttle - b.throttle);
    }
    const map = this.map;
    const first = map[0]; const last = map[map.length - 1];
    if (first === undefined || last === undefined) return null;
    let up = first.upshiftRPM; let down = first.downshiftRPM;
    if (throttle >= last.throttle) { up = last.upshiftRPM; down = last.downshiftRPM; }
    else for (let index = 1; index < map.length; index += 1) {
      const lower = map[index - 1]!; const upper = map[index]!;
      if (throttle <= upper.throttle) {
        const fraction = clamp01((throttle - lower.throttle) / Math.max(0.001, upper.throttle - lower.throttle));
        up = lower.upshiftRPM + (upper.upshiftRPM - lower.upshiftRPM) * fraction;
        down = lower.downshiftRPM + (upper.downshiftRPM - lower.downshiftRPM) * fraction;
        break;
      }
    }
    up += this.config.gearRPMCorrections?.[gear - 1] ?? 0;
    const next = Math.min(maxGear, gear + 1) as ForwardGear;
    // A slipping converter can reach the engine limiter before its turbine
    // reaches the nominal upshift RPM. The actual crank RPM is therefore an
    // upshift input too; speed/post-shift-RPM gates still prevent launch skips.
    const upshiftRPM = Math.max(currentRPM, context.engineRPM);
    if (gear < maxGear && upshiftRPM > up + this.config.hysteresisRPM &&
      Math.abs(context.vehicleSpeed) > (this.config.minimumUpshiftSpeeds[gear - 1] ?? 0) &&
      predictedRPM(next) > down + this.config.hysteresisRPM * 0.6) return { gear: next, kickdown: false };
    if (gear > 1 && currentRPM < down - this.config.hysteresisRPM &&
      predictedRPM((gear - 1) as ForwardGear) < up - this.config.hysteresisRPM) return { gear: (gear - 1) as ForwardGear, kickdown: false };
    return null;
  }
}
