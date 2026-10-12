import type { DriveSelector } from '../config';
import type { EVModeCalibration, EVTwoSpeedConfig } from '../config/ElectricVehiclePhysicsConfig';
import { FixedReductionTransmission } from './FixedReductionTransmission';
import { smoothLimit } from '../powertrain/EVThermalState';

/** Fast EV shift with torque withdrawal, smooth ratio movement, then restoration. */
export class EVTwoSpeedTransmission extends FixedReductionTransmission {
  public override readonly type = 'EV_TWO_SPEED' as const;
  public physicalGear: 1 | 2 = 2;
  private targetGear: 1 | 2 = 2;
  private fromRatio: number;
  private currentRatio: number;
  private elapsed = 0;
  private dwell = 0;
  private shifting = false;
  public constructor(public override readonly config: EVTwoSpeedConfig) {
    super(config); this.currentRatio = this.fromRatio = config.secondRatio;
  }
  public override get ratio(): number { return this.currentRatio; }
  public override get torqueTransfer(): number {
    if (!this.shifting) return 1;
    const progress = this.elapsed / this.config.shiftDuration;
    return progress < .25 ? 1 - smoothLimit(progress / .25) : progress > .75 ? smoothLimit((progress - .75) / .25) : 0;
  }
  public override reset(mode: DriveSelector = 'P'): void {
    this.physicalGear = this.targetGear = 2; this.currentRatio = this.fromRatio = this.config.secondRatio;
    this.elapsed = 0; this.dwell = this.config.minimumShiftInterval; this.shifting = false; super.reset(mode);
    this.snapshot.shiftInProgress = false; this.snapshot.shiftState = 'NONE'; this.snapshot.shiftProgress = 0;
  }
  public override advance(dt: number, speed: number, throttle: number, strategy: EVModeCalibration['shiftStrategy'], launch: boolean): void {
    const c = this.config, v = Math.abs(speed);
    this.dwell += dt;
    if (launch && v < .5 && !this.shifting) {
      this.physicalGear = this.targetGear = 1; this.currentRatio = c.ratio;
    }
    const sport = strategy === 'sport', plus = strategy === 'sport-plus';
    const up = plus ? c.sportPlusUpshiftSpeed : sport ? c.sportUpshiftSpeed : c.normalUpshiftSpeed;
    const down = plus ? c.sportPlusDownshiftSpeed : sport ? c.sportDownshiftSpeed : c.normalDownshiftSpeed;
    if (!this.shifting && !launch && this.mode === 'D' && this.dwell >= c.minimumShiftInterval) {
      const wanted = this.physicalGear === 1 && (v > up || (throttle < .35 && v > down + 2)) ? 2 :
        this.physicalGear === 2 && throttle > (sport || plus ? .55 : .85) && v < down && strategy !== 'range' ? 1 : this.physicalGear;
      if (wanted !== this.physicalGear) {
        this.targetGear = wanted; this.fromRatio = this.currentRatio; this.elapsed = 0; this.shifting = true;
      }
    }
    if (this.shifting) {
      this.elapsed = Math.min(c.shiftDuration, this.elapsed + dt);
      const p = this.elapsed / c.shiftDuration;
      this.currentRatio = this.fromRatio + ((this.targetGear === 1 ? c.ratio : c.secondRatio) - this.fromRatio) * smoothLimit((p - .25) / .5);
      if (p >= 1) { this.physicalGear = this.targetGear; this.shifting = false; this.dwell = 0; }
    }
    this.snapshot.type = this.type;
    this.snapshot.currentPhysicalGear = this.physicalGear;
    this.snapshot.shiftInProgress = this.shifting; this.snapshot.shiftState = this.shifting ? 'EV_SHIFT' : 'NONE';
    this.snapshot.shiftProgress = this.shifting ? this.elapsed / c.shiftDuration : 0;
  }
  public override update(wheelOmega: number, motorTorque: number): number {
    const torque = super.update(wheelOmega, motorTorque);
    this.snapshot.type = this.type; this.snapshot.currentPhysicalGear = this.physicalGear;
    return torque;
  }
}
