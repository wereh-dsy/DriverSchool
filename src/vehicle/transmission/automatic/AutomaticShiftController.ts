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
  private transientDemand = 0;
  private liftHoldRemaining = 0;
  public constructor(private readonly config: AutomaticShiftConfig, private readonly gearbox: Gearbox, private readonly wheelRadius: number) {
    this.mapSource = config.map;
    this.map = [...config.map].sort((a, b) => a.throttle - b.throttle);
  }
  public reset(): void {
    this.timeInGear = 0; this.previousThrottle = 0; this.transientDemand = 0;
    this.liftHoldRemaining = 0; this.returnToAuto();
  }
  public gearChanged(): void { this.timeInGear = 0; }
  public decide(context: TransmissionContext, shifting: boolean): ShiftDecision | null {
    this.timeInGear += context.dt;
    const throttle = clamp01(context.throttle);
    const risingThrottle = throttle - this.previousThrottle;
    const throttleRate = risingThrottle / Math.max(1e-4, context.dt);
    this.transientDemand = Math.max(this.transientDemand * Math.exp(-context.dt * 4),
      Math.min(.06, Math.max(0, throttleRate) * .02));
    if (throttleRate < -.3 && this.previousThrottle > .35)
      this.liftHoldRemaining = this.config.liftHoldTime ?? 0;
    this.liftHoldRemaining = Math.max(0, this.liftHoldRemaining - context.dt);
    this.previousThrottle = throttle;
    if (this.manualSelectionActive) this.manualElapsed += context.dt;
    if (shifting && this.pendingManual !== null) {
      this.pendingManual = null; this.manualSelectionRejectedReason = 'shift-in-progress';
    }
    if (shifting || !context.engineRunning || typeof this.gearbox.currentGear !== 'number') return null;
    const gear = this.gearbox.currentGear;
    const maxGear = this.gearbox.getMaximumForwardGear();
    const outputOmega = Math.abs(context.drivenWheelAngularVelocity) * this.gearbox.config.finalDriveRatio;
    const currentRPM = outputOmega * this.gearbox.getRatio(gear) * 60 / (2 * Math.PI);
    const roadOmega = Math.abs(context.vehicleSpeed) / Math.max(.01, this.wheelRadius) * this.gearbox.config.finalDriveRatio;
    const coupledRPM = Math.min(outputOmega, roadOmega) * this.gearbox.getRatio(gear) * 60 / (2 * Math.PI);
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
    if (this.mapSource !== this.config.map) {
      this.mapSource = this.config.map;
      this.map = [...this.config.map].sort((a, b) => a.throttle - b.throttle);
    }
    const map = this.map;
    const first = map[0]; const last = map[map.length - 1];
    if (first === undefined || last === undefined) return null;
    const demand = clamp01(throttle + this.transientDemand);
    let up = first.upshiftRPM; let down = first.downshiftRPM;
    if (demand >= last.throttle) { up = last.upshiftRPM; down = last.downshiftRPM; }
    else for (let index = 1; index < map.length; index += 1) {
      const lower = map[index - 1]!; const upper = map[index]!;
      if (demand <= upper.throttle) {
        const fraction = clamp01((demand - lower.throttle) / Math.max(0.001, upper.throttle - lower.throttle));
        up = lower.upshiftRPM + (upper.upshiftRPM - lower.upshiftRPM) * fraction;
        down = lower.downshiftRPM + (upper.downshiftRPM - lower.downshiftRPM) * fraction;
        break;
      }
    }
    const baseUp = up;
    up += this.config.gearRPMCorrections?.[gear - 1] ?? 0;
    const next = Math.min(maxGear, gear + 1) as ForwardGear;
    const ratio = this.gearbox.getRatio(gear);
    const downshiftRPM = (target: ForwardGear): number => Math.max(safeRPM(target),
      context.engineRPM * this.gearbox.getRatio(target) / ratio);
    const nextRPM = Math.min(outputOmega, roadOmega) * this.gearbox.getRatio(next) * 60 / (2 * Math.PI);
    // Crank prediction matters with converter/clutch slip. Coupled prediction
    // independently protects launch and a locked-wheel road-speed mismatch.
    const nextCrankRPM = context.engineRPM * this.gearbox.getRatio(next) / ratio;
    const minimumRPM = Math.max(context.idleRPM * 1.1, this.config.minimumPostShiftRPM ?? 0);
    // Wheelspin may put the computed input shaft above redline while the crank
    // is still accelerating normally. It must not trigger an early upshift.
    const upshiftRPM = context.engineRPM;
    const safeUpshift = gear < maxGear && nextRPM > minimumRPM && nextCrankRPM > minimumRPM &&
      safeRPM(next) < context.redlineRPM * .97 &&
      Math.abs(context.vehicleSpeed) > (this.config.minimumUpshiftSpeeds[gear - 1] ?? 0);
    const automaticCeiling = Math.min(this.config.maximumAutomaticRPM ?? context.redlineRPM * .97,
      context.redlineRPM * .985);
    // AUTO cannot be held at the limiter by dwell, a sport hold, or kickdown.
    if (safeUpshift && upshiftRPM >= automaticCeiling) return { gear: next, kickdown: false };
    const heavy = throttle >= this.config.kickdownThrottle;
    const urgentKickdown = heavy && throttleRate > .7 && this.timeInGear >= .2;
    if (this.timeInGear < this.config.minimumTimeInGear && !urgentKickdown) return null;

    const fullTorque = context.engineTorqueAtRPM?.(Math.max(context.idleRPM, context.engineRPM));
    const nextTorque = context.engineTorqueAtRPM?.(Math.max(context.idleRPM, Math.min(nextRPM, nextCrankRPM)));
    // Compare available next-gear wheel torque/power at the same road speed
    // against current delivered torque and the requested acceleration reserve.
    // This is decision data only; it never changes the engine torque source.
    const requestedTorque = Math.max(0, context.availableEngineTorque, (fullTorque ?? 0) * demand) * ratio;
    const nextCapacity = (nextTorque ?? 0) * this.gearbox.getRatio(next);
    const ampleReserve = fullTorque !== undefined && nextCapacity > requestedTorque * 1.2;
    const economyFactor = demand <= .65 && this.transientDemand < .01 && ampleReserve
      ? this.config.economicalShiftFactor ?? .94 : 1;
    const holding = context.brake > .2 || this.liftHoldRemaining > 0 || ((this.config.liftHoldTime ?? 0) > 0 &&
      Math.abs(context.vehicleLateralSpeed ?? 0) > 1);
    if (safeUpshift && !holding && upshiftRPM >= Math.min(up * economyFactor + this.config.hysteresisRPM, automaticCeiling))
      return { gear: next, kickdown: false };

    if (heavy && gear > 1 && (urgentKickdown || Math.max(coupledRPM, context.engineRPM) < this.config.kickdownTargetRPM * .8)) {
      let target = gear;
      let bestDistance = Math.abs(coupledRPM - this.config.kickdownTargetRPM);
      for (let candidate = 1; candidate < gear; candidate += 1) {
        const rpm = downshiftRPM(candidate as ForwardGear);
        const distance = Math.abs(rpm - this.config.kickdownTargetRPM);
        if (rpm <= Math.min(this.config.kickdownMaximumRPM, automaticCeiling - this.config.hysteresisRPM) &&
            rpm >= context.idleRPM * 1.3 && distance < bestDistance) {
          target = candidate as ForwardGear; bestDistance = distance;
        }
      }
      if (target < gear && safeRPM(target) > coupledRPM + this.config.hysteresisRPM)
        return { gear: target, kickdown: true };
    }
    if (gear > 1) {
      const lower = (gear - 1) as ForwardGear;
      // A steady pedal must not undo the previous upshift. Keep the downshift
      // boundary below the road RPM that the previous gear's schedule produces.
      const previousUp = baseUp + (this.config.gearRPMCorrections?.[gear - 2] ?? 0);
      down = Math.min(down, previousUp * (this.config.economicalShiftFactor ?? .94) *
        ratio / this.gearbox.getRatio(lower) - this.config.hysteresisRPM);
      const braking = this.config.brakingDownshiftRPM !== undefined && context.brake > .2 &&
        coupledRPM < this.config.brakingDownshiftRPM;
      // Braking holds the lower gear for engine braking, independently of the
      // light-pedal upshift map. Both paths retain road/crank overrev protection.
      const downshiftCeiling = braking ? automaticCeiling : Math.min(up - this.config.hysteresisRPM, automaticCeiling);
      if ((braking || coupledRPM < down - this.config.hysteresisRPM) &&
          downshiftRPM(lower) < downshiftCeiling)
        return { gear: lower, kickdown: false };
    }
    return null;
  }
}
