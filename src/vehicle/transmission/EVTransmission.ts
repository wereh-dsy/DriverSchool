import type { DriveSelector } from '../config';
import type { EVModeCalibration } from '../config/ElectricVehiclePhysicsConfig';
import type { PowertrainTransmission } from '../powertrain/Powertrain';

export interface EVTransmission extends PowertrainTransmission {
  readonly mode: DriveSelector; readonly ratio: number; readonly efficiency: number; readonly torqueTransfer: number;
  reset(mode?: DriveSelector): void;
  advance(dt: number, speed: number, throttle: number, strategy: EVModeCalibration['shiftStrategy'], launch: boolean): void;
  update(wheelOmega: number, motorTorque: number): number;
}
