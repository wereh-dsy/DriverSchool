import type { AutomaticTransmissionConfig, DriveSelector, ForwardGear, Gear } from '../../config';
import type { Gearbox } from '../../physics/Gearbox';
import { clamp01 } from '../../physics/math';
import { SelectorSafety } from '../SelectorSafety';
import { angularVelocityToRPM, type TransmissionContext, type TransmissionOutput,
  type TransmissionSnapshot, type TransmissionSystem } from '../TransmissionSystem';
import { AutomaticShiftController } from './AutomaticShiftController';
import { TorqueConverter } from './TorqueConverter';

export class AutomaticTransmissionSystem implements TransmissionSystem {
  public readonly type = 'TORQUE_CONVERTER_AT' as const;
  public readonly converter: TorqueConverter;
  private readonly selector: SelectorSafety;
  private readonly controller: AutomaticShiftController;
  private shiftElapsed = 0;
  private shiftTarget: ForwardGear | null = null;
  private shiftChanged = false;
  private kickdown = false;
  private outputTorque = 0;
  private load = 0;
  private torque = 0;
  private inputRPM = 0;
  private outputRPM = 0;
  public constructor(private readonly gearbox: Gearbox, private readonly config: AutomaticTransmissionConfig, wheelRadius: number) {
    this.selector = new SelectorSafety(gearbox, config.parkMaximumSpeed, wheelRadius,
      config.shiftStrategy.kickdownMaximumRPM, config.shiftStrategy.map[0]?.upshiftRPM ?? 1700);
    this.controller = new AutomaticShiftController(config.shiftStrategy, gearbox, wheelRadius);
    this.converter = new TorqueConverter(config.converter);
  }
  public reset(gear: Gear = 'N', selector?: DriveSelector): void {
    this.selector.reset(gear, selector); this.controller.reset(); this.converter.reset();
    this.shiftTarget = null; this.shiftElapsed = 0; this.shiftChanged = false;
    this.outputTorque = 0; this.load = 0; this.torque = 0; this.inputRPM = 0; this.outputRPM = 0; this.kickdown = false;
  }
  public requestSelector(selector: DriveSelector, speed: number, lateralSpeed = 0, brake = 0): boolean {
    const old = this.selector.mode;
    const accepted = this.selector.request(selector, speed, lateralSpeed, brake);
    if (accepted && old !== this.selector.mode) {
      this.shiftTarget = null; this.shiftElapsed = 0; this.shiftChanged = false;
      this.controller.reset(); this.converter.reset(); this.kickdown = false;
    }
    return accepted;
  }
  public requestManualSelection(direction: -1 | 1): void {
    if (this.selector.mode === 'D') this.controller.requestManualSelection(direction);
  }
  public returnToAuto(): void { this.controller.returnToAuto(); }
  public prepare(context: TransmissionContext): { throttleScale: number } {
    if (context.selectorRequest !== undefined) this.requestSelector(context.selectorRequest, context.vehicleSpeed, context.vehicleLateralSpeed, context.brake);
    if (this.shiftTarget !== null) {
      this.shiftElapsed += context.dt;
      const progress = this.shiftProgress;
      if (progress >= 0.5 && !this.shiftChanged) {
        this.gearbox.setGear(this.shiftTarget); this.shiftChanged = true;
      }
      if (progress >= 1) { this.shiftTarget = null; this.controller.gearChanged(); }
    }
    if (this.selector.mode === 'D') {
      const decision = this.controller.decide(context, this.shiftTarget !== null);
      if (decision !== null && decision.gear !== this.gearbox.currentGear) {
        this.shiftTarget = decision.gear; this.shiftElapsed = 0; this.shiftChanged = false; this.kickdown = decision.kickdown;
      }
    }
    const turbine = context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio * this.gearbox.getRatio();
    this.converter.prepare(context, turbine, this.shiftTarget !== null, this.selector.driving);
    // Engine torque reduction has a real load consequence; never force RPM to a target.
    const reduction = this.shiftTarget === null ? 1 : 0.55 + 0.45 * Math.abs(2 * this.shiftProgress - 1);
    return { throttleScale: reduction };
  }
  public update(context: TransmissionContext): TransmissionOutput {
    const outputOmega = context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio;
    const turbine = outputOmega * this.gearbox.getRatio();
    this.inputRPM = angularVelocityToRPM(turbine); this.outputRPM = angularVelocityToRPM(outputOmega);
    const shiftScale = this.shiftTarget === null ? 1 :
      this.config.shiftTorqueFactor + (1 - this.config.shiftTorqueFactor) * Math.abs(2 * this.shiftProgress - 1);
    const converter = this.converter.update(context, turbine, this.selector.driving ? shiftScale : 0);
    this.load = converter.load; this.torque = converter.turbineTorque;
    const outputTorque = this.torque * this.gearbox.getRatio() * this.gearbox.config.drivetrainEfficiency;
    this.outputTorque = outputTorque;
    return { engineLoadTorque: this.load, transmittedTorque: this.torque, outputTorque,
      drivenWheelTorque: outputTorque * this.gearbox.config.finalDriveRatio, parkingLocked: this.selector.parkingLocked };
  }
  private get shiftProgress(): number { return clamp01(this.shiftElapsed / Math.max(0.08, this.gearbox.config.shiftTime)); }
  public getSnapshot(): TransmissionSnapshot {
    const progress = this.shiftTarget === null ? 0 : this.shiftProgress;
    const state = this.shiftTarget === null ? 'IDLE' : progress < 0.2 ? 'PREPARE' :
      progress < 0.5 ? 'TORQUE_REDUCTION' : progress < 0.7 ? 'GEAR_CHANGE' : 'TORQUE_RESTORE';
    return { manualSelectionActive: this.controller.manualSelectionActive,
      manualSelectionRejectedReason: this.controller.manualSelectionRejectedReason,
      type: this.type, selectedMode: this.selector.mode, currentPhysicalGear: this.gearbox.currentGear,
      currentRatio: this.gearbox.getRatio(), outputTorque: this.outputTorque,
      inputRPM: this.inputRPM, outputRPM: this.outputRPM, engineLoadTorque: this.load, transmittedTorque: this.torque,
      shiftInProgress: this.shiftTarget !== null, shiftState: state, shiftProgress: progress,
      kickdown: this.shiftTarget !== null && this.kickdown, selectorRejectedReason: this.selector.rejectedReason,
      parkingLocked: this.selector.parkingLocked,
      torqueConverter: { pumpRPM: this.converter.pumpRPM, turbineRPM: this.converter.turbineRPM,
        speedRatio: this.converter.speedRatio, slipRPM: this.converter.slipRPM,
        torqueRatio: this.converter.torqueRatio, lockupEngagement: this.converter.lockupEngagement } };
  }
}
