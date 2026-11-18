import type { DriveSelector, ForwardGear, Gear, TransmissionConfig } from '../config';
import type { Gearbox } from '../physics/Gearbox';
import { clamp, clamp01, moveTowards } from '../physics/math';
import { SelectorSafety } from './SelectorSafety';
import { AutomaticShiftController } from './automatic/AutomaticShiftController';
import { implicitClutchDemand } from './implicitClutchDemand';
import { angularVelocityToRPM, limitAutomaticEngineLoad, type TransmissionContext,
  type TransmissionOutput, type TransmissionSnapshot, type TransmissionSystem } from './TransmissionSystem';

/** Reduced multi-clutch compound gearset. Any ratio can hand over directly;
 * no odd/even shafts, preselection penalty, converter or imposed crank RPM.
 * The overlapping clutch paths are reduced to a capacity-weighted ratio.
 * Input/output power balance is retained through that ratio and efficiency.
 * This does not resolve the seven individual clutches' internal inertias. */
export class LightSpeedTransmission implements TransmissionSystem {
  readonly type = 'LST' as const;
  private readonly selector: SelectorSafety;
  private readonly controller: AutomaticShiftController;
  private readonly calibration: NonNullable<TransmissionConfig['lst']>;
  private shift: { source: number; target: ForwardGear; elapsed: number } | null = null;
  private engagement = 0;
  private ratio = 0;
  private load = 0;
  private outputTorque = 0;
  private inputRPM = 0;
  private outputRPM = 0;
  private kickdown = false;
  constructor(private readonly gearbox: Gearbox, private readonly wheelRadius: number) {
    this.calibration = gearbox.config.lst!;
    this.selector = new SelectorSafety(gearbox, this.calibration.parkMaximumSpeed,
      wheelRadius, this.calibration.shiftStrategy.kickdownMaximumRPM, 2300);
    this.controller = new AutomaticShiftController(this.calibration.shiftStrategy, gearbox, wheelRadius);
  }
  reset(gear: Gear = 'N', selector?: DriveSelector): void {
    this.selector.reset(gear, selector); this.controller.reset(); this.shift = null;
    this.engagement = this.load = this.outputTorque = this.inputRPM = this.outputRPM = 0;
    this.ratio = this.gearbox.getRatio(); this.kickdown = false;
  }
  requestSelector(mode: DriveSelector, speed: number, lateralSpeed = 0, brake = 0): boolean {
    const previous = this.selector.mode;
    const accepted = this.selector.request(mode, speed, lateralSpeed, brake);
    if (accepted && previous !== mode) {
      this.shift = null; this.engagement = 0; this.ratio = this.gearbox.getRatio(); this.controller.reset();
    }
    return accepted;
  }
  requestManualSelection(direction: -1 | 1): void {
    if (this.selector.mode === 'D') this.controller.requestManualSelection(direction);
  }
  returnToAuto(): void { this.controller.returnToAuto(); }
  prepare(c: TransmissionContext): { throttleScale: number; minimumThrottle: number } {
    if (c.selectorRequest) this.requestSelector(c.selectorRequest, c.vehicleSpeed, c.vehicleLateralSpeed, c.brake);
    const a = this.calibration;
    const speedBlend = clamp01(Math.abs(c.vehicleSpeed) / a.launchFullyEngagedSpeed);
    const target = this.selector.driving && c.engineRunning && !c.holdingBrake
      ? Math.max(speedBlend, c.throttle * .65) * (1 - clamp01(c.brake / .15) * (1 - speedBlend)) : 0;
    this.engagement = moveTowards(this.engagement, target, c.dt * (target < this.engagement ? 18 : a.engagementRate));
    if (this.shift) {
      this.shift.elapsed += c.dt;
      const t = clamp01(this.shift.elapsed / this.gearbox.config.shiftTime);
      const blend = t * t * (3 - 2 * t);
      this.ratio = this.shift.source + (this.gearbox.getRatio(this.shift.target) - this.shift.source) * blend;
      if (t >= .5) this.gearbox.setGear(this.shift.target);
      if (t >= 1) { this.shift = null; this.controller.gearChanged(); }
    }
    if (this.selector.mode === 'D') {
      const decision = this.controller.decide(c, this.shift !== null);
      if (decision && decision.gear !== this.gearbox.currentGear) {
        this.shift = { source: this.ratio, target: decision.gear, elapsed: 0 };
        this.kickdown = decision.kickdown;
      }
    }
    const targetRPM = this.shift ? Math.abs(c.vehicleSpeed) / this.wheelRadius *
      this.gearbox.getRatio(this.shift.target) * this.gearbox.config.finalDriveRatio * 30 / Math.PI : 0;
    return { throttleScale: this.shift ? .92 : 1,
      minimumThrottle: this.shift && targetRPM > c.engineRPM && targetRPM < c.redlineRPM * .97
        ? clamp((targetRPM - c.engineRPM) / c.redlineRPM * 5, 0, .8) : 0 };
  }
  update(c: TransmissionContext): TransmissionOutput {
    const a = this.calibration, fd = this.gearbox.config.finalDriveRatio;
    const omega = c.drivenWheelAngularVelocity * fd;
    this.inputRPM = angularVelocityToRPM(omega * this.ratio); this.outputRPM = angularVelocityToRPM(omega);
    this.load = 0;
    if (this.selector.driving && c.engineRunning && !c.holdingBrake && this.engagement > 0) {
      const slip = c.engineAngularVelocity - omega * this.ratio;
      const demand = implicitClutchDemand(c.availableEngineTorque * this.engagement, slip,
        a.couplingStiffness * this.engagement, c, this.ratio * fd, this.gearbox.config.drivetrainEfficiency);
      const capacity = a.clutchCapacity * this.engagement;
      this.load = clamp(demand, -capacity, capacity);
      const launchRPM = c.idleRPM + (a.launchTargetRPM - c.idleRPM) * clamp01((c.throttle - .5) * 2);
      if (!this.shift && this.inputRPM < launchRPM && c.throttle > .5 && this.load > 0)
        this.load = Math.min(this.load, Math.max(0, c.availableEngineTorque +
          c.engineInertia * (c.engineRPM - launchRPM) * Math.PI / 30 * 9));
      this.load = limitAutomaticEngineLoad(this.load, c);
    }
    this.outputTorque = this.load * this.ratio * this.gearbox.config.drivetrainEfficiency;
    return { engineLoadTorque: this.load, transmittedTorque: this.load, outputTorque: this.outputTorque,
      drivenWheelTorque: this.outputTorque * fd, parkingLocked: this.selector.parkingLocked };
  }
  getSnapshot(): TransmissionSnapshot {
    return { type: this.type, selectedMode: this.selector.mode, currentPhysicalGear: this.gearbox.currentGear,
      currentRatio: this.ratio, engineLoadTorque: this.load, transmittedTorque: this.load,
      outputTorque: this.outputTorque, inputRPM: this.inputRPM, outputRPM: this.outputRPM,
      shiftInProgress: this.shift !== null, shiftState: this.shift ? 'MULTI_CLUTCH_HANDOVER' : 'IDLE',
      shiftProgress: this.shift ? clamp01(this.shift.elapsed / this.gearbox.config.shiftTime) : 0,
      kickdown: this.shift !== null && this.kickdown, parkingLocked: this.selector.parkingLocked,
      selectorRejectedReason: this.selector.rejectedReason, manualSelectionActive: this.controller.manualSelectionActive,
      manualSelectionRejectedReason: this.controller.manualSelectionRejectedReason,
      couplingEngagement: this.engagement };
  }
}
