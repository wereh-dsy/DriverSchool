import type { DriveSelector, ForwardGear, Gear, TransmissionConfig } from '../config';
import { Gearbox } from '../physics/Gearbox';
import { clamp01 } from '../physics/math';
import { SelectorSafety } from './SelectorSafety';
import { AutomaticShiftController } from './automatic/AutomaticShiftController';
import type { TransmissionContext, TransmissionSnapshot, TransmissionSystem, TransmissionOutput } from './TransmissionSystem';

/** 9HAT reduced wet-clutch gearset; schedule/selector are shared with existing ATs.
 * Motor and K0 torque enter ONCE ahead of the effective ratio, including shifts.
 * Continuous ratio interpolation is an overlap approximation, not planetary CAD. */
export class P2HybridTransmission implements TransmissionSystem {
  public readonly type = 'TORQUE_CONVERTER_AT' as const;
  private readonly selector: SelectorSafety;
  private readonly controller: AutomaticShiftController;
  private target: ForwardGear | null = null;
  private elapsed = 0;
  private fromRatio = 0;
  private kickdown = false;
  private inputRPM = 0;
  private outputRPM = 0;
  private inputTorque = 0;
  private outputTorque = 0;
  public get selectedMode(): DriveSelector { return this.selector.mode; }
  public get isShifting(): boolean { return this.target !== null; }
  public constructor(public readonly gearbox: Gearbox, private readonly config: TransmissionConfig, radius: number) {
    const a = config.automatic!;
    this.selector = new SelectorSafety(gearbox, a.parkMaximumSpeed, radius, 6400, 1600);
    this.controller = new AutomaticShiftController(a.shiftStrategy, gearbox, radius);
  }
  public get progress(): number { return this.target === null ? 0 : clamp01(this.elapsed / this.config.shiftTime); }
  public get ratio(): number {
    const t = this.progress, blend = t * t * (3 - 2 * t);
    return this.target === null ? this.gearbox.getRatio() : this.fromRatio + (this.gearbox.getRatio(this.target) - this.fromRatio) * blend;
  }
  public get torqueFactor(): number { return this.target === null ? 1 : 1 - (1 - this.config.automatic!.shiftTorqueFactor) * Math.sin(Math.PI * this.progress) ** 2; }
  public reset(gear: Gear = 'N', selector?: DriveSelector): void {
    this.selector.reset(gear, selector); this.controller.reset(); this.target = null; this.elapsed = 0;
    this.inputRPM = this.outputRPM = this.inputTorque = this.outputTorque = 0;
  }
  public requestSelector(mode: DriveSelector, speed: number, lateral = 0, brake = 0): boolean {
    const old = this.selector.mode, accepted = this.selector.request(mode, speed, lateral, brake);
    if (accepted && old !== mode) { this.target = null; this.elapsed = 0; this.controller.reset(); }
    return accepted;
  }
  public requestManualSelection(direction: -1 | 1): void { if (this.selector.mode === 'D') this.controller.requestManualSelection(direction); }
  public returnToAuto(): void { this.controller.returnToAuto(); }
  public prepare(c: TransmissionContext): { throttleScale: number } {
    if (c.selectorRequest) this.requestSelector(c.selectorRequest, c.vehicleSpeed, c.vehicleLateralSpeed, c.brake);
    if (this.target !== null) {
      this.elapsed += c.dt;
      if (this.progress >= 1) { this.gearbox.setGear(this.target); this.target = null; this.controller.gearChanged(); }
    }
    if (this.selector.mode === 'D') {
      const decision = this.controller.decide(c, this.target !== null);
      if (decision && decision.gear !== this.gearbox.currentGear) {
        this.fromRatio = this.ratio; this.target = decision.gear; this.elapsed = 0; this.kickdown = decision.kickdown;
      }
    }
    return { throttleScale: this.torqueFactor };
  }
  public update(c: TransmissionContext): TransmissionOutput {
    this.inputRPM = c.engineRPM; this.outputRPM = c.drivenWheelAngularVelocity * this.config.finalDriveRatio * 30 / Math.PI;
    // Backdrive is a wheel-funded load. A shift cut may dissipate propulsion,
    // but must not reduce wheel work while leaving generator work unchanged.
    const factor = c.availableEngineTorque * c.engineAngularVelocity < 0 ? 1 : this.torqueFactor;
    this.inputTorque = this.selector.driving ? c.availableEngineTorque * factor : 0;
    // Reciprocal efficiency for backdrive: electrical recovery never exceeds wheel work.
    const efficiency = this.inputTorque * c.engineAngularVelocity < 0 ? 1 / this.config.drivetrainEfficiency : this.config.drivetrainEfficiency;
    this.outputTorque = this.inputTorque * this.ratio * efficiency;
    return { engineLoadTorque: this.inputTorque, transmittedTorque: this.inputTorque, outputTorque: this.outputTorque,
      drivenWheelTorque: this.outputTorque * this.config.finalDriveRatio, parkingLocked: this.selector.parkingLocked };
  }
  public getSnapshot(): TransmissionSnapshot {
    return { type: this.type, selectedMode: this.selector.mode, currentPhysicalGear: this.gearbox.currentGear,
      currentRatio: this.ratio, outputTorque: this.outputTorque, inputRPM: this.inputRPM, outputRPM: this.outputRPM,
      engineLoadTorque: this.inputTorque, transmittedTorque: this.inputTorque, shiftInProgress: this.target !== null,
      shiftState: this.target === null ? 'IDLE' : 'P2_CLUTCH_OVERLAP', shiftProgress: this.progress,
      kickdown: this.target !== null && this.kickdown, parkingLocked: this.selector.parkingLocked,
      selectorRejectedReason: this.selector.rejectedReason, manualSelectionActive: this.controller.manualSelectionActive,
      manualSelectionRejectedReason: this.controller.manualSelectionRejectedReason };
  }
}
