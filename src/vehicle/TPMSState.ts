import { WHEEL_IDS, type WheelId } from './physics/WheelContact';
import type { TyreThermalPressureSystem } from './physics/TyreThermalPressureSystem';

export type TyrePosition = 'FRONT_LEFT' | 'FRONT_RIGHT' | 'REAR_LEFT' | 'REAR_RIGHT';
export type TyrePressureState = 'NORMAL' | 'LOW' | 'CRITICAL_LOW' | 'HIGH';
export interface TyreStatus {
  readonly position: TyrePosition;
  valid: boolean;
  pressureKPa: number | null;
  temperatureC: number | null;
  targetColdPressureKPa: number;
  pressureState: TyrePressureState;
}
export interface TPMSState extends Record<WheelId, TyreStatus> {
  available: boolean;
  warning: boolean;
}
export function createTPMSState(available = false): TPMSState {
  const tyre = (position: TyrePosition): TyreStatus => ({ position, valid: false, pressureKPa: null,
    temperatureC: null, targetColdPressureKPa: 0, pressureState: 'NORMAL' });
  return { available, warning: false, frontLeft: tyre('FRONT_LEFT'), frontRight: tyre('FRONT_RIGHT'),
    rearLeft: tyre('REAR_LEFT'), rearRight: tyre('REAR_RIGHT') };
}

/** Sensor boundary: 2 Hz sample/display, time-based filter, 1 kPa resolution.
 * Warning uses unfiltered physical state so filtering cannot hide low pressure. */
export class TPMSSensor {
  public readonly state: TPMSState;
  private elapsed = 0;
  private readonly filtered: Record<WheelId, number> = { frontLeft: NaN, frontRight: NaN, rearLeft: NaN, rearRight: NaN };
  public constructor(private readonly tyres: TyreThermalPressureSystem, available: boolean) {
    this.state = createTPMSState(available);
    this.reset();
  }
  public reset(): void {
    this.elapsed = 0;
    for (const id of WHEEL_IDS) this.filtered[id] = NaN;
    this.sample(0);
  }
  public update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt;
    if (this.elapsed + 1e-9 < .5) return;
    this.sample(this.elapsed); this.elapsed = 0;
  }
  private sample(dt: number): void {
    this.state.warning = false;
    for (const id of WHEEL_IDS) {
      const physical = this.tyres.states[id], status = this.state[id];
      status.targetColdPressureKPa = physical.targetColdPressureKPa;
      status.valid = this.state.available && Number.isFinite(physical.gaugePressureKPa) && physical.gaugePressureKPa > 0 &&
        Number.isFinite(physical.temperatureC) && Number.isFinite(physical.targetColdPressureKPa) && physical.targetColdPressureKPa > 0;
      if (!status.valid) {
        status.pressureKPa = status.temperatureC = null; status.pressureState = 'NORMAL'; this.filtered[id] = NaN;
        continue;
      }
      const time = this.tyres.configs[id].displayPressureSmoothing;
      const alpha = !Number.isFinite(time) || time <= 0 ? 1 : -Math.expm1(-dt / time);
      this.filtered[id] = Number.isFinite(this.filtered[id]) ? this.filtered[id] +
        (physical.gaugePressureKPa - this.filtered[id]) * alpha : physical.gaugePressureKPa;
      status.pressureKPa = Math.round(this.filtered[id]);
      status.temperatureC = Math.round(physical.temperatureC);
      status.pressureState = physical.warningState;
      this.state.warning ||= status.pressureState !== 'NORMAL';
    }
  }
}
