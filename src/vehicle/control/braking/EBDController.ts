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
      // Preserve the tyre solver's surface/load-sensitive coefficient, replacing
      // only raw Fz by the short control estimate. No ax/ay load-transfer model.
      const capacity = wheel.grounded && wheel.rawNormalLoad > 1
        ? Math.max(0, capacities[i] ?? 0) * wheel.estimatedControlNormalLoad / wheel.rawNormalLoad : 0;
      if (i < 2) front += capacity; else rear += capacity;
    }
    const tune = this.calibration;
    const target = enabled && front + rear > 1
      ? clamp(front / (front + rear) + tune.frontReserve, this.factoryBias - .08, .9) : this.factoryBias;
    // Fz already has its short observer filter; do not add the old 125 ms
    // pressure-allocation lag on top of genuine pitch/load transfer.
    this.frontBias = enabled ? damp(this.frontBias, target, Math.max(40, tune.response), dt) : target;
    return this.frontBias;
  }
}
