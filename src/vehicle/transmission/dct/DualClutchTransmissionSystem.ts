import type { DriveSelector, DualClutchTransmissionConfig, ForwardGear, Gear } from '../../config';
import type { Gearbox } from '../../physics/Gearbox';
import { clamp01, moveTowards } from '../../physics/math';
import { SelectorSafety } from '../SelectorSafety';
import { AutomaticShiftController } from '../automatic/AutomaticShiftController';
import { angularVelocityToRPM, limitAutomaticEngineLoad, type TransmissionContext,
  type TransmissionOutput, type TransmissionSnapshot, type TransmissionSystem } from '../TransmissionSystem';

type Shaft = 'A' | 'B';
interface Handover {
  sourceGear: Gear; targetGear: ForwardGear; sourceShaft: Shaft; targetShaft: Shaft;
  elapsed: number; duration: number; sourceEngagement: number; unexpected: boolean;
}

/** Two independent friction clutches. No torque converter and no AutoClutch. */
export class DualClutchTransmissionSystem implements TransmissionSystem {
  public readonly type = 'DCT' as const;
  public clutchAEngagement = 0;
  public clutchBEngagement = 0;
  private shaftAGear: Gear | null = 1;
  private shaftBGear: Gear | null = 2;
  private activeShaft: Shaft | null = null;
  private preselectedGear: Gear | null = null;
  private readonly selector: SelectorSafety;
  private readonly controller: AutomaticShiftController;
  private handover: Handover | null = null;
  private kickdown = false;
  private outputTorque = 0;
  private load = 0;
  private torque = 0;
  private inputRPM = 0;
  private outputRPM = 0;
  public constructor(private readonly gearbox: Gearbox, private readonly config: DualClutchTransmissionConfig, private readonly selectorWheelRadius: number) {
    this.selector = new SelectorSafety(gearbox, config.parkMaximumSpeed, selectorWheelRadius,
      config.shiftStrategy.kickdownMaximumRPM, config.shiftStrategy.map[0]?.upshiftRPM ?? 1700);
    this.controller = new AutomaticShiftController(config.shiftStrategy, gearbox, selectorWheelRadius);
  }
  public reset(gear: Gear = 'N', selector?: DriveSelector): void {
    this.selector.reset(gear, selector); this.controller.reset(); this.handover = null; this.kickdown = false;
    this.clutchAEngagement = 0; this.clutchBEngagement = 0;
    this.shaftAGear = null; this.shaftBGear = null; this.preselectedGear = null;
    this.activeShaft = this.selector.driving ? this.shaftFor(this.gearbox.currentGear) : null;
    if (this.activeShaft !== null) this.setShaftGear(this.activeShaft, this.gearbox.currentGear);
    this.preselect(); this.outputTorque = 0; this.load = 0; this.torque = 0; this.inputRPM = 0; this.outputRPM = 0;
  }
  public requestSelector(selector: DriveSelector, speed: number, lateralSpeed = 0, brake = 0): boolean {
    const previous = this.selector.mode;
    const accepted = this.selector.request(selector, speed, lateralSpeed, brake);
    if (accepted && previous !== this.selector.mode) {
      this.handover = null; this.controller.reset(); this.kickdown = false;
      // A direction change always opens both clutches before the new launch.
      this.clutchAEngagement = 0; this.clutchBEngagement = 0;
      this.shaftAGear = null; this.shaftBGear = null; this.preselectedGear = null;
      this.activeShaft = this.selector.driving ? this.shaftFor(this.gearbox.currentGear) : null;
      if (this.activeShaft !== null) this.setShaftGear(this.activeShaft, this.gearbox.currentGear);
      this.preselect();
    }
    return accepted;
  }
  public requestManualSelection(direction: -1 | 1): void {
    if (this.selector.mode === 'D') this.controller.requestManualSelection(direction);
  }
  public returnToAuto(): void { this.controller.returnToAuto(); }
  public prepare(context: TransmissionContext): { throttleScale: number; minimumThrottle?: number } {
    if (context.selectorRequest !== undefined) this.requestSelector(context.selectorRequest, context.vehicleSpeed, context.vehicleLateralSpeed, context.brake);
    const launchTarget = this.getLaunchEngagement(context);
    if (this.handover !== null) {
      this.handover.elapsed += context.dt;
      const shift = this.handover;
      const raw = clamp01(shift.elapsed / shift.duration);
      if (shift.sourceShaft !== shift.targetShaft) {
        const t = raw * raw * (3 - 2 * raw);
        this.setEngagement(shift.sourceShaft, shift.sourceEngagement * (1 - t));
        this.setEngagement(shift.targetShaft, launchTarget * t);
      } else {
        // A non-preselected same-shaft jump needs a short open-clutch swap.
        const engagement = raw < 0.5 ? shift.sourceEngagement * (1 - raw * 2) : launchTarget * (raw * 2 - 1);
        this.setEngagement(shift.sourceShaft, engagement);
        if (raw >= 0.5) this.setShaftGear(shift.targetShaft, shift.targetGear);
      }
      if (raw >= 0.5) this.gearbox.setGear(shift.targetGear);
      if (raw >= 1) {
        this.activeShaft = shift.targetShaft; this.gearbox.setGear(shift.targetGear);
        this.setEngagement(this.otherShaft(shift.targetShaft), 0);
        this.handover = null; this.controller.gearChanged(); this.preselect();
      }
    } else {
      const active = this.selector.driving ? this.shaftFor(this.gearbox.currentGear) : null;
      this.activeShaft = active;
      if (active !== null) {
        this.setShaftGear(active, this.gearbox.currentGear);
        const rate = launchTarget < this.getEngagement(active) ? this.config.clutchReleaseRate : this.config.clutchApplyRate;
        this.setEngagement(active, moveTowards(this.getEngagement(active), launchTarget, context.dt * rate));
        this.setEngagement(this.otherShaft(active), moveTowards(this.getEngagement(this.otherShaft(active)), 0, context.dt * this.config.clutchReleaseRate));
      } else {
        this.clutchAEngagement = moveTowards(this.clutchAEngagement, 0, context.dt * this.config.clutchReleaseRate);
        this.clutchBEngagement = moveTowards(this.clutchBEngagement, 0, context.dt * this.config.clutchReleaseRate);
      }
      this.preselect();
    }
    if (this.selector.mode === 'D') {
      const decision = this.controller.decide(context, this.handover !== null);
      if (decision !== null && decision.gear !== this.gearbox.currentGear) this.beginShift(decision.gear, decision.kickdown);
    }
    // Mild, brief engine torque management during overlap. Load coupling, not
    // directly assigning RPM, brings the engine to the incoming shaft speed.
    const match = this.config.revMatching, shift = this.handover;
    const targetRPM = shift ? Math.abs(context.vehicleSpeed) / this.selectorWheelRadius *
      this.gearbox.config.finalDriveRatio * this.gearbox.getRatio(shift.targetGear) * 30 / Math.PI : 0;
    const minimumThrottle = match && shift && typeof shift.sourceGear === 'number' && shift.targetGear < shift.sourceGear &&
      context.engineRunning && targetRPM < context.redlineRPM * .97
      ? Math.min(match.maximumThrottle, Math.max(0, (targetRPM - context.engineRPM) / context.redlineRPM * match.response)) : 0;
    return { throttleScale: shift === null ? 1 : this.kickdown ? 0.85 : 0.75, minimumThrottle };
  }
  public update(context: TransmissionContext): TransmissionOutput {
    const outputOmega = context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio;
    this.outputRPM = angularVelocityToRPM(outputOmega);
    this.inputRPM = angularVelocityToRPM(outputOmega * this.gearbox.getRatio());
    const clutchTorque = (gear: Gear | null, engagement: number): number => {
      if (gear === null || !this.selector.driving || !context.engineRunning || context.holdingBrake || engagement <= 0) return 0;
      const slip = context.engineAngularVelocity - outputOmega * this.gearbox.getRatio(gear);
      const demand = context.availableEngineTorque * engagement + slip * this.config.couplingStiffness * engagement;
      const capacity = Math.max(0.1, this.config.clutchCapacity * engagement);
      return demand / Math.pow(1 + (Math.abs(demand) / capacity) ** 6, 1 / 6);
    };
    let torqueA = clutchTorque(this.shaftAGear, this.clutchAEngagement);
    let torqueB = clutchTorque(this.shaftBGear, this.clutchBEngagement);
    const desiredLoad = torqueA + torqueB;
    this.load = limitAutomaticEngineLoad(desiredLoad, context);
    const safetyScale = desiredLoad > 1e-6 ? clamp01(this.load / desiredLoad) : 1;
    torqueA *= safetyScale; torqueB *= safetyScale; this.torque = torqueA + torqueB;
    const outputTorque = (torqueA * (this.shaftAGear === null ? 0 : this.gearbox.getRatio(this.shaftAGear)) +
      torqueB * (this.shaftBGear === null ? 0 : this.gearbox.getRatio(this.shaftBGear))) * this.gearbox.config.drivetrainEfficiency;
    this.outputTorque = outputTorque;
    return { engineLoadTorque: this.load, transmittedTorque: this.torque, outputTorque,
      drivenWheelTorque: outputTorque * this.gearbox.config.finalDriveRatio, parkingLocked: this.selector.parkingLocked };
  }
  private getLaunchEngagement(context: TransmissionContext): number {
    if (!this.selector.driving || !context.engineRunning || context.holdingBrake) return 0;
    const speedBlend = clamp01(Math.abs(context.vehicleSpeed) / Math.max(0.5, this.config.launchFullyEngagedSpeed));
    const throttleBlend = clamp01(context.throttle * 0.6);
    const creep = this.config.creepEngagement * (1 - clamp01(context.brake * 4));
    const lowSpeedBrake = 1 - clamp01(context.brake / .12) * (1 - speedBlend);
    return clamp01((creep + (1 - creep) * Math.max(speedBlend, throttleBlend)) * lowSpeedBrake);
  }
  private beginShift(target: ForwardGear, kickdown: boolean): void {
    const source = this.gearbox.currentGear;
    const sourceShaft = this.shaftFor(source); const targetShaft = this.shaftFor(target);
    const unexpected = this.preselectedGear !== target;
    const duration = Math.max(0.08, this.gearbox.config.shiftTime) + (unexpected ? this.config.unexpectedShiftDelay : 0);
    this.handover = { sourceGear: source, targetGear: target, sourceShaft, targetShaft,
      elapsed: 0, duration, sourceEngagement: this.getEngagement(sourceShaft), unexpected };
    this.kickdown = kickdown;
    if (sourceShaft !== targetShaft) { this.setShaftGear(targetShaft, target); this.setEngagement(targetShaft, 0); }
    this.preselectedGear = target;
  }
  private preselect(): void {
    if (this.handover !== null || this.selector.mode !== 'D' || typeof this.gearbox.currentGear !== 'number') return;
    const current = this.gearbox.currentGear;
    const next = (current < this.gearbox.getMaximumForwardGear() ? current + 1 : current - 1) as ForwardGear;
    this.preselectedGear = next;
    const inactive = this.otherShaft(this.shaftFor(current));
    // The inactive shaft is always open while its next ratio is selected.
    if (this.getEngagement(inactive) < 0.001) this.setShaftGear(inactive, next);
  }
  private shaftFor(gear: Gear): Shaft { return gear === 'R' || (typeof gear === 'number' && gear % 2 === 1) ? 'A' : 'B'; }
  private otherShaft(shaft: Shaft): Shaft { return shaft === 'A' ? 'B' : 'A'; }
  private setShaftGear(shaft: Shaft, gear: Gear): void { if (shaft === 'A') this.shaftAGear = gear; else this.shaftBGear = gear; }
  private getEngagement(shaft: Shaft): number { return shaft === 'A' ? this.clutchAEngagement : this.clutchBEngagement; }
  private setEngagement(shaft: Shaft, engagement: number): void { if (shaft === 'A') this.clutchAEngagement = clamp01(engagement); else this.clutchBEngagement = clamp01(engagement); }
  public getSnapshot(): TransmissionSnapshot {
    return { manualSelectionActive: this.controller.manualSelectionActive,
      manualSelectionRejectedReason: this.controller.manualSelectionRejectedReason,
      type: this.type, selectedMode: this.selector.mode, currentPhysicalGear: this.gearbox.currentGear,
      currentRatio: this.gearbox.getRatio(), outputTorque: this.outputTorque,
      inputRPM: this.inputRPM, outputRPM: this.outputRPM, engineLoadTorque: this.load, transmittedTorque: this.torque,
      shiftInProgress: this.handover !== null, shiftState: this.handover === null ? 'IDLE' : this.handover.unexpected ? 'PRESELECT_HANDOVER' : 'CLUTCH_HANDOVER',
      shiftProgress: this.handover === null ? 0 : clamp01(this.handover.elapsed / this.handover.duration),
      kickdown: this.handover !== null && this.kickdown, selectorRejectedReason: this.selector.rejectedReason,
      parkingLocked: this.selector.parkingLocked,
      dct: { clutchAEngagement: this.clutchAEngagement, clutchBEngagement: this.clutchBEngagement,
        activeShaft: this.activeShaft, preselectedGear: this.preselectedGear,
        shaftAGear: this.shaftAGear, shaftBGear: this.shaftBGear } };
  }
}
