import type { DriveSelector, Gear } from '../config';
import type { FixedReductionConfig } from '../config/ElectricVehiclePhysicsConfig';
import { FixedReductionTransmission } from './FixedReductionTransmission';
import type { TransmissionContext, TransmissionOutput, TransmissionSnapshot, TransmissionSystem } from './TransmissionSystem';

/** e-CVT compatibility facade: one P3 reduction, no pulley, shift or P2 input shaft. */
export class EhsTransmission implements TransmissionSystem {
  public readonly type = 'CVT' as const;
  public readonly reduction: FixedReductionTransmission;
  public wheelTorque = 0;
  public engineTorque = 0;
  public engineRPM = 0;
  public engagement = 0;
  public constructor(config: FixedReductionConfig) { this.reduction = new FixedReductionTransmission(config); }
  public get selectedMode(): DriveSelector { return this.reduction.mode; }
  public reset(_gear?: Gear, selector: DriveSelector = 'P'): void {
    this.reduction.reset(selector); this.wheelTorque = this.engineTorque = this.engineRPM = this.engagement = 0;
  }
  public requestSelector(mode: DriveSelector, speed: number, lateral = 0, brake = 0): boolean {
    return this.reduction.requestSelector(mode, speed, lateral, brake);
  }
  public prepare(_context: TransmissionContext) { return { throttleScale: 1 }; }
  public update(_context: TransmissionContext): TransmissionOutput {
    return { engineLoadTorque: this.engineTorque, transmittedTorque: this.engineTorque,
      outputTorque: this.wheelTorque, drivenWheelTorque: this.wheelTorque, parkingLocked: this.selectedMode === 'P' };
  }
  public getSnapshot(): TransmissionSnapshot {
    return { ...this.reduction.getSnapshot(), type: 'CVT', currentPhysicalGear: null,
      outputTorque: this.wheelTorque, engineLoadTorque: this.engineTorque, inputRPM: this.engineRPM,
      transmittedTorque: this.engineTorque, couplingEngagement: this.engagement };
  }
}
