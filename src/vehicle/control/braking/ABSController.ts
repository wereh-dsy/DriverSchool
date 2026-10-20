import { WHEEL_IDS } from '../../physics/WheelContact';
import { clamp, damp } from '../../physics/math';
import type { VehicleControlState } from '../VehicleStateEstimator';
import { BaseControlCalibration, type ControlCalibration } from '../BaseControlCalibration';
import { HardSafetyEnvelope } from '../VehicleControlCalibration';

export class ABSController {
  public constructor(private calibration: ControlCalibration['abs'] = BaseControlCalibration.abs) {}
  public setCalibration(calibration: ControlCalibration['abs']): void { this.calibration = calibration; }
  public readonly pressures = [1, 1, 1, 1];
  public readonly activeWheels = [false, false, false, false];
  private readonly releasing = [false, false, false, false];
  public get active(): boolean { return this.activeWheels.some(Boolean); }
  public reset(): void { this.pressures.fill(1); this.activeWheels.fill(false); this.releasing.fill(false); }
  public update(dt: number, enabled: boolean, state: VehicleControlState, requested: readonly boolean[]): void {
    const tune = this.calibration;
    const authority = clamp((Math.abs(state.longitudinalVelocity) - tune.exitSpeed) / (tune.fullSpeed - tune.exitSpeed), 0, 1);
    for (let i = 0; i < 4; i++) {
      const w = state.wheels[WHEEL_IDS[i]!];
      if (!enabled || authority === 0 || !requested[i] || !w.grounded) {
        // A free wheel is not a locked road contact; do not freeze ABS memory in flight.
        this.pressures[i] = 1; this.activeWheels[i] = this.releasing[i] = false; continue;
      }
      const slip = -w.longitudinalSlipRatio * Math.sign(w.longitudinalVelocity || state.longitudinalVelocity);
      const error = slip - Math.min(w.usefulSlipRatio * tune.slipMultiplier, HardSafetyEnvelope.maximumABSLockSlip);
      if (error > tune.hysteresis) this.releasing[i] = true;
      else if (error < -tune.hysteresis) this.releasing[i] = false;
      const target = this.releasing[i] ? 1 - authority * clamp(error / .2, 0, .96) : 1;
      // Hold within the Schmitt window instead of alternating pressure each tick.
      if (Math.abs(error) > tune.hysteresis || !this.releasing[i])
        this.pressures[i] = clamp(damp(this.pressures[i]!, target,
          target < this.pressures[i]! ? tune.releaseResponse : tune.recoverResponse, dt), 0, 1);
      this.activeWheels[i] = this.pressures[i]! < .98;
    }
  }
}
