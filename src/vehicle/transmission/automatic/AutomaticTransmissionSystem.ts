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
  private shiftStartRatio = 0;
  private get effectiveRatio(): number {
    if (!this.config.smoothRatioShift || this.shiftTarget === null) return this.gearbox.getRatio();
    const t = this.shiftProgress, blend = t * t * (3 - 2 * t);
    return this.shiftStartRatio + (this.gearbox.getRatio(this.shiftTarget) - this.shiftStartRatio) * blend;
  }
  private shiftTarget: ForwardGear | null = null;
  private shiftChanged = false;
  private kickdown = false;
  private outputTorque = 0;
  private load = 0;
  private torque = 0;
  private inputRPM = 0;
  private outputRPM = 0;
  private temperatureC = 20;
  private get thermalTorqueFactor(): number {
    const t = this.config.thermal;
    if (!t) return 1;
    const fraction = clamp01((this.temperatureC - t.derateStartC) / (t.derateEndC - t.derateStartC));
    return 1 - fraction * fraction * (3 - 2 * fraction) * (1 - t.minimumTorqueFactor);
  }
  public constructor(private readonly gearbox: Gearbox, private readonly config: AutomaticTransmissionConfig, wheelRadius: number) {
    this.selector = new SelectorSafety(gearbox, config.parkMaximumSpeed, wheelRadius,
      config.shiftStrategy.kickdownMaximumRPM, config.shiftStrategy.map[0]?.upshiftRPM ?? 1700);
    this.controller = new AutomaticShiftController(config.shiftStrategy, gearbox, wheelRadius);
    this.converter = new TorqueConverter(config.converter);
    this.temperatureC = config.thermal?.initialTemperatureC ?? 20;
  }
  public reset(gear: Gear = 'N', selector?: DriveSelector): void {
    this.selector.reset(gear, selector); this.controller.reset(); this.converter.reset();
    this.temperatureC = this.config.thermal?.initialTemperatureC ?? 20;
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
        this.shiftStartRatio = this.gearbox.getRatio();
        this.shiftTarget = decision.gear; this.shiftElapsed = 0; this.shiftChanged = false; this.kickdown = decision.kickdown;
      }
    }
    const turbine = context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio * this.effectiveRatio;
    this.converter.prepare(context, turbine, this.shiftTarget !== null, this.selector.driving);
    // Engine torque reduction has a real load consequence; never force RPM to a target.
    const shiftFloor = this.config.shiftThrottleFactor ?? .55;
    const reduction = this.shiftTarget === null ? 1 : shiftFloor + (1 - shiftFloor) * Math.abs(2 * this.shiftProgress - 1);
    return { throttleScale: reduction * this.thermalTorqueFactor };
  }
  public update(context: TransmissionContext): TransmissionOutput {
    const outputOmega = context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio;
    const ratio = this.effectiveRatio;
    const turbine = outputOmega * ratio;
    this.inputRPM = angularVelocityToRPM(turbine); this.outputRPM = angularVelocityToRPM(outputOmega);
    const shiftScale = this.shiftTarget === null ? 1 :
      this.config.shiftTorqueFactor + (1 - this.config.shiftTorqueFactor) * Math.abs(2 * this.shiftProgress - 1);
    const converter = this.converter.update(context, turbine, this.selector.driving ? shiftScale : 0, ratio * this.gearbox.config.finalDriveRatio, this.gearbox.config.drivetrainEfficiency);
    this.load = converter.load; this.torque = converter.turbineTorque;
    const thermal = this.config.thermal;
    if (thermal) {
      // Actual pump/input and turbine/output power difference, plus gear losses.
      const loss = Math.max(0, this.load * context.engineAngularVelocity - this.torque * turbine) +
        Math.abs(this.torque * turbine) * (1 - this.gearbox.config.drivetrainEfficiency);
      const cooling = thermal.coolingWPerK + thermal.airflowCoolingWPerKPerMps * Math.abs(context.vehicleSpeed);
      const target = 20 + loss / cooling;
      this.temperatureC = target + (this.temperatureC - target) * Math.exp(-cooling * context.dt / thermal.heatCapacityJPerK);
    }
    const outputTorque = this.torque * ratio * this.gearbox.config.drivetrainEfficiency;
    this.outputTorque = outputTorque;
    return { engineLoadTorque: this.load, transmittedTorque: this.torque, outputTorque,
      drivenWheelTorque: outputTorque * this.gearbox.config.finalDriveRatio, parkingLocked: this.selector.parkingLocked };
  }
  private get shiftProgress(): number { return clamp01(this.shiftElapsed / Math.max(0.08, this.gearbox.config.shiftTime)); }
  public getSnapshot(): TransmissionSnapshot {
    const progress = this.shiftTarget === null ? 0 : this.shiftProgress;
    const state = this.shiftTarget === null ? 'IDLE' : progress < 0.2 ? 'PREPARE' :
      progress < 0.5 ? 'TORQUE_REDUCTION' : progress < 0.7 ? 'GEAR_CHANGE' : 'TORQUE_RESTORE';
    return { thermal: this.config.thermal ? { temperatureC: this.temperatureC, torqueFactor: this.thermalTorqueFactor } : undefined,
      manualSelectionActive: this.controller.manualSelectionActive,
      manualSelectionRejectedReason: this.controller.manualSelectionRejectedReason,
      type: this.type, selectedMode: this.selector.mode, currentPhysicalGear: this.gearbox.currentGear,
      currentRatio: this.effectiveRatio, outputTorque: this.outputTorque,
      inputRPM: this.inputRPM, outputRPM: this.outputRPM, engineLoadTorque: this.load, transmittedTorque: this.torque,
      shiftInProgress: this.shiftTarget !== null, shiftState: state, shiftProgress: progress,
      kickdown: this.shiftTarget !== null && this.kickdown, selectorRejectedReason: this.selector.rejectedReason,
      parkingLocked: this.selector.parkingLocked,
      torqueConverter: { pumpRPM: this.converter.pumpRPM, turbineRPM: this.converter.turbineRPM,
        speedRatio: this.converter.speedRatio, slipRPM: this.converter.slipRPM,
        torqueRatio: this.converter.torqueRatio, lockupEngagement: this.converter.lockupEngagement } };
  }
}
