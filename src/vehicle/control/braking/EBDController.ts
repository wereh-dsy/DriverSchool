import { clamp, damp } from '../../physics/math';
import type { VehicleControlState } from '../VehicleStateEstimator';
import { BaseControlCalibration, type ControlCalibration } from '../BaseControlCalibration';
import { WHEEL_IDS } from '../../physics/WheelContact';

export class EBDController {
  public frontBias: number;
  public constructor(private readonly factoryBias: number, private calibration: ControlCalibration['ebd'] = BaseControlCalibration.ebd) { this.frontBias = factoryBias; }
  public setCalibration(calibration: ControlCalibration['ebd']): void { this.calibration = calibration; }
  public reset(): void { this.frontBias = this.factoryBias; }
  public update(dt: number, enabled: boolean, state: VehicleControlState, capacities: readonly number[]): number {
    let front = 0, rear = 0;
    for (let i = 0; i < 4; i++) {
      const wheel = state.wheels[WHEEL_IDS[i]!];
      // Capacity is already Fz/load sensitivity/surface limited by the tyre solver.
      const capacity = wheel.grounded ? Math.max(0, capacities[i] ?? 0) : 0;
      if (i < 2) front += capacity; else rear += capacity;
    }
    const tune = this.calibration;
    const target = enabled && front + rear > 1
      ? clamp(front / (front + rear) + tune.frontReserve, this.factoryBias - .08, .9) : this.factoryBias;
    this.frontBias = enabled ? damp(this.frontBias, target, tune.response, dt) : target;
    return this.frontBias;
  }
}
