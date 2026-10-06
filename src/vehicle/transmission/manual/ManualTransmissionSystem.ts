import type { DriveSelector, Gear } from '../../config';
import type { Clutch } from '../../physics/Clutch';
import type { Gearbox } from '../../physics/Gearbox';
import type { AutoClutchController } from '../../physics/AutoClutchController';
import { angularVelocityToRPM, type TransmissionContext, type TransmissionOutput,
  type TransmissionSnapshot, type TransmissionSystem } from '../TransmissionSystem';

/** Adapter, not a replacement: the original pedal and AutoClutch sequencing stay intact. */
export class ManualTransmissionSystem implements TransmissionSystem {
  public readonly type = 'MANUAL' as const;
  private load = 0;
  private inputRPM = 0;
  private outputRPM = 0;
  public constructor(private readonly gearbox: Gearbox, private readonly clutch: Clutch,
    private readonly autoClutch: AutoClutchController) {}
  public reset(_gear?: Gear, _selector?: DriveSelector): void { this.load = 0; this.inputRPM = 0; this.outputRPM = 0; }
  public prepare(_context: TransmissionContext): { throttleScale: number } { return { throttleScale: 1 }; }
  public requestSelector(_selector: DriveSelector, _speed: number): boolean { return false; }
  public update(context: TransmissionContext): TransmissionOutput {
    const shaft = context.drivenWheelAngularVelocity * this.gearbox.getRatio() * this.gearbox.config.finalDriveRatio;
    this.load = this.gearbox.currentGear === 'N' ? 0 : this.clutch.calculateTransmittedTorque(
      context.availableEngineTorque, context.engineAngularVelocity, shaft);
    if (this.gearbox.currentGear === 'N') {
      this.clutch.lastSlipAngularVelocity = 0;
      this.clutch.lastTransmittedTorque = 0;
    }
    this.inputRPM = angularVelocityToRPM(shaft);
    this.outputRPM = angularVelocityToRPM(context.drivenWheelAngularVelocity * this.gearbox.config.finalDriveRatio);
    return { engineLoadTorque: this.load, transmittedTorque: this.load,
      outputTorque: this.load * this.gearbox.getRatio() * this.gearbox.config.drivetrainEfficiency,
      drivenWheelTorque: this.gearbox.getWheelTorque(this.load), parkingLocked: false };
  }
  public getSnapshot(): TransmissionSnapshot {
    return { type: this.type, selectedMode: null, currentPhysicalGear: this.gearbox.currentGear,
      inputRPM: this.inputRPM, outputRPM: this.outputRPM, engineLoadTorque: this.load, transmittedTorque: this.load,
      shiftInProgress: this.autoClutch.isShifting, shiftState: this.autoClutch.state,
      shiftProgress: 0, kickdown: false, selectorRejectedReason: null, parkingLocked: false };
  }
}
