import type { CVTConfig, DriveSelector, Gear } from '../../config';
import type { Gearbox } from '../../physics/Gearbox';
import { clamp, damp, moveTowards } from '../../physics/math';
import { SelectorSafety } from '../SelectorSafety';
import { TorqueConverter } from '../automatic/TorqueConverter';
import { angularVelocityToRPM, type TransmissionContext, type TransmissionOutput,
  type TransmissionSnapshot, type TransmissionSystem } from '../TransmissionSystem';

export class CVTTransmissionSystem implements TransmissionSystem {
  public readonly type = 'CVT' as const;
  public readonly converter: TorqueConverter;
  private readonly selector: SelectorSafety;
  private ratio: number;
  private targetRatio: number;
  private targetRPM = 1100;
  private inputRPM = 0;
  private outputRPM = 0;
  private load = 0;
  private torque = 0;
  public constructor(private readonly gearbox: Gearbox, private readonly config: CVTConfig, private readonly wheelRadius: number) {
    if (!(config.minimumRatio > 0 && config.maximumRatio > config.minimumRatio && config.ratioChangeRate > 0)) {
      throw new Error('Invalid CVT ratio calibration.');
    }
    this.ratio = this.targetRatio = config.maximumRatio;
    this.converter = new TorqueConverter(config.converter);
    this.selector = new SelectorSafety(gearbox, config.parkMaximumSpeed, wheelRadius, 6200, 1500);
  }
  public reset(gear: Gear = 'N', selector?: DriveSelector): void {
    this.selector.reset(gear, selector); this.converter.reset();
    this.ratio = this.targetRatio = this.config.maximumRatio;
    this.targetRPM = this.config.targetRPMCurve[0]?.rpm ?? 1100;
    this.inputRPM = this.outputRPM = this.load = this.torque = 0;
  }
  public requestSelector(mode: DriveSelector, speed: number, lateralSpeed = 0, brake = 0): boolean {
    const previous = this.selector.mode;
    const accepted = this.selector.request(mode, speed, lateralSpeed, brake);
    if (accepted && previous !== mode) {
      this.converter.reset();
      // Rolling N -> D picks a safe continuous ratio before torque reconnects.
      const outputRPM = Math.abs(speed) / this.wheelRadius * this.gearbox.config.finalDriveRatio * 60 / (2 * Math.PI);
      this.ratio = this.targetRatio = clamp(Math.max(1500, this.targetRPM) / Math.max(1, outputRPM),
        this.config.minimumRatio, this.config.maximumRatio);
    }
    return accepted;
  }
  public prepare(context: TransmissionContext): { throttleScale: number } {
    if (context.selectorRequest !== undefined) this.requestSelector(context.selectorRequest,
      context.vehicleSpeed, context.vehicleLateralSpeed, context.brake);
    let rpm = this.config.targetRPMCurve.at(-1)?.rpm ?? context.idleRPM;
    const curve = this.config.targetRPMCurve;
    if (context.throttle <= (curve[0]?.throttle ?? 0)) rpm = curve[0]?.rpm ?? context.idleRPM;
    else for (let i = 1; i < curve.length; i++) {
      const lower = curve[i - 1]!; const upper = curve[i]!;
      if (context.throttle <= upper.throttle) {
        rpm = lower.rpm + (upper.rpm - lower.rpm) *
          (context.throttle - lower.throttle) / Math.max(.001, upper.throttle - lower.throttle); break;
      }
    }
    this.targetRPM = damp(this.targetRPM, clamp(rpm, context.idleRPM, context.redlineRPM - 250),
      this.config.targetRPMResponse, context.dt);
    const outputOmega = Math.abs(context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio);
    this.targetRatio = clamp(this.targetRPM * 2 * Math.PI / 60 / Math.max(1, outputOmega),
      this.config.minimumRatio, this.config.maximumRatio);
    if (this.selector.mode === 'D') this.ratio = moveTowards(this.ratio, this.targetRatio,
      context.dt * this.config.ratioChangeRate);
    const turbine = context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio * this.signedRatio;
    this.converter.prepare(context, turbine, false, this.selector.driving);
    return { throttleScale: 1 };
  }
  private get signedRatio(): number {
    return this.selector.mode === 'D' ? this.ratio : this.selector.mode === 'R' ? this.gearbox.config.reverseRatio : 0;
  }
  public update(context: TransmissionContext): TransmissionOutput {
    const outputOmega = context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio;
    const turbine = outputOmega * this.signedRatio;
    this.inputRPM = angularVelocityToRPM(turbine); this.outputRPM = angularVelocityToRPM(outputOmega);
    const converter = this.converter.update(context, turbine, this.selector.driving ? 1 : 0);
    this.load = converter.load; this.torque = converter.turbineTorque;
    const outputTorque = this.torque * this.signedRatio * this.gearbox.config.drivetrainEfficiency;
    return { engineLoadTorque: this.load, transmittedTorque: this.torque, outputTorque,
      drivenWheelTorque: outputTorque * this.gearbox.config.finalDriveRatio, parkingLocked: this.selector.parkingLocked };
  }
  public getSnapshot(): TransmissionSnapshot {
    return { type: this.type, selectedMode: this.selector.mode, currentPhysicalGear: null,
      inputRPM: this.inputRPM, outputRPM: this.outputRPM, engineLoadTorque: this.load, transmittedTorque: this.torque,
      shiftInProgress: false, shiftState: this.selector.driving ? 'CONTINUOUS' : 'IDLE', shiftProgress: 0,
      kickdown: false, selectorRejectedReason: this.selector.rejectedReason, parkingLocked: this.selector.parkingLocked,
      cvt: { ratio: this.ratio, targetRatio: this.targetRatio, targetRPM: this.targetRPM },
      torqueConverter: { pumpRPM: this.converter.pumpRPM, turbineRPM: this.converter.turbineRPM,
        speedRatio: this.converter.speedRatio, slipRPM: this.converter.slipRPM,
        torqueRatio: this.converter.torqueRatio, lockupEngagement: this.converter.lockupEngagement } };
  }
}
