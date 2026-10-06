import type { AutomaticShiftConfig, ForwardGear } from '../../config';
import type { Gearbox } from '../../physics/Gearbox';
import { clamp01 } from '../../physics/math';
import type { TransmissionContext } from '../TransmissionSystem';

export interface ShiftDecision { gear: ForwardGear; kickdown: boolean }

/** Shared decisions only: AT and DCT own different physical shift actuators. */
export class AutomaticShiftController {
  private timeInGear = 0;
  private previousThrottle = 0;
  public constructor(private readonly config: AutomaticShiftConfig, private readonly gearbox: Gearbox) {}
  public reset(): void { this.timeInGear = 0; this.previousThrottle = 0; }
  public gearChanged(): void { this.timeInGear = 0; }
  public decide(context: TransmissionContext, shifting: boolean): ShiftDecision | null {
    this.timeInGear += context.dt;
    const throttle = clamp01(context.throttle);
    const risingThrottle = throttle - this.previousThrottle;
    this.previousThrottle = throttle;
    if (shifting || !context.engineRunning || typeof this.gearbox.currentGear !== 'number') return null;
    const gear = this.gearbox.currentGear;
    const maxGear = this.gearbox.getMaximumForwardGear();
    const outputOmega = Math.abs(context.drivenWheelAngularVelocity) * this.gearbox.config.finalDriveRatio;
    const predictedRPM = (target: ForwardGear): number => outputOmega * this.gearbox.getRatio(target) * 60 / (2 * Math.PI);
    const currentRPM = predictedRPM(gear);
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
    const map = [...this.config.map].sort((a, b) => a.throttle - b.throttle);
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
