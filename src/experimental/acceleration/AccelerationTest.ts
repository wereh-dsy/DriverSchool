import type { FuelSnapshot } from '../../vehicle/physics/FuelSystem';
import type { EVTelemetry } from '../../vehicle/powertrain/Powertrain';

export type AccelerationTarget = 100 | 200;
export interface AccelerationSample {
  readonly speed: number;
  readonly lateralVelocity: number;
  readonly acceleration: number;
  readonly fuel?: Pick<FuelSnapshot, 'fuelUsedL'>;
  readonly powertrain: { readonly kind: string; readonly ev?: Pick<EVTelemetry, 'energyUsedKWh' | 'energyRecoveredKWh'> };
}
export interface AccelerationMeasurement {
  elapsedSeconds: number;
  distanceMeters: number;
  fuelUsedL: number | null;
  energyUsedKWh: number | null;
  energyRecoveredKWh: number | null;
  peakAcceleration: number;
}
export interface AccelerationTestState {
  phase: 'IDLE' | 'ARMED' | 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'INTERRUPTED';
  target: AccelerationTarget;
  energyKind: 'ICE' | 'EV';
  waitingForRelease: boolean;
  notice: string;
  current: AccelerationMeasurement;
  to100: AccelerationMeasurement | null;
  to200: AccelerationMeasurement | null;
}

const REST_SPEED = 0.15;
const THROTTLE_PRESS = 0.05;
const THROTTLE_RELEASE = 0.02;
const available = (value: number | undefined): boolean => value !== undefined && Number.isFinite(value) && value >= 0;
const counterDelta = (before: number | undefined, after: number | undefined): number | null => {
  if (before === undefined || after === undefined) return null;
  if (!available(before) || !available(after) || after < before - 1e-9) return NaN;
  return Math.max(0, after - before);
};
const add = (total: number | null, delta: number | null, fraction: number): number | null =>
  total === null || delta === null ? null : total + delta * fraction;
const crossing = (before: number, after: number, target: number): number | null => {
  const speed = target / 3.6;
  return before < speed && after >= speed && after > before ? (speed - before) / (after - before) : null;
};

/** Passive fixed-step measurement: never requests controls or changes the vehicle. */
export class AccelerationTest {
  public readonly state: AccelerationTestState = {
    phase: 'IDLE', target: 100, energyKind: 'ICE', waitingForRelease: false, notice: '',
    current: { elapsedSeconds: 0, distanceMeters: 0, fuelUsedL: null, energyUsedKWh: null, energyRecoveredKWh: null, peakAcceleration: 0 },
    to100: null, to200: null,
  };

  public arm(sample: AccelerationSample, throttle: number, target = this.state.target): boolean {
    if (this.state.phase === 'RUNNING') return false;
    if (!Number.isFinite(sample.speed) || !Number.isFinite(sample.lateralVelocity) ||
      Math.hypot(sample.speed, sample.lateralVelocity) > REST_SPEED) {
      this.state.notice = '请先停稳，再点击待测。'; return false;
    }
    this.state.phase = 'ARMED'; this.state.target = target;
    this.state.energyKind = sample.powertrain.kind === 'EV' ? 'EV' : 'ICE';
    this.state.waitingForRelease = !Number.isFinite(throttle) || throttle > THROTTLE_RELEASE;
    this.state.notice = ''; this.state.to100 = this.state.to200 = null;
    const current = this.state.current;
    current.elapsedSeconds = current.distanceMeters = current.peakAcceleration = 0;
    current.fuelUsedL = this.state.energyKind === 'ICE' && available(sample.fuel?.fuelUsedL) ? 0 : null;
    current.energyUsedKWh = this.state.energyKind === 'EV' && available(sample.powertrain.ev?.energyUsedKWh) ? 0 : null;
    current.energyRecoveredKWh = this.state.energyKind === 'EV' && available(sample.powertrain.ev?.energyRecoveredKWh) ? 0 : null;
    return true;
  }

  public stop(): void {
    if (this.state.phase !== 'RUNNING' && this.state.phase !== 'ARMED') return;
    this.state.phase = 'STOPPED'; this.state.notice = '本轮已结束，已完成分段保留。';
  }

  public interrupt(reason: string, includeArmed = true): void {
    if (this.state.phase !== 'RUNNING' && !(includeArmed && this.state.phase === 'ARMED')) return;
    this.state.phase = 'INTERRUPTED'; this.state.notice = `${reason}，未完成部分已中止。`;
  }

  /** Before/after are borrowed snapshots around the same physics step; throttle is the driver's pedal, before cruise arbitration. */
  public update(dt: number, before: AccelerationSample, after: AccelerationSample, throttle: number,
    active: boolean, collided = false): void {
    const state = this.state;
    if (!active) { this.interrupt('驾驶已暂停', false); return; }
    if (state.phase !== 'ARMED' && state.phase !== 'RUNNING') return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!Number.isFinite(before.speed) || !Number.isFinite(after.speed) || !Number.isFinite(before.lateralVelocity) ||
      !Number.isFinite(after.lateralVelocity) || !Number.isFinite(after.acceleration) || !Number.isFinite(throttle)) {
      this.interrupt('车辆数据无效'); return;
    }
    if ((after.powertrain.kind === 'EV' ? 'EV' : 'ICE') !== state.energyKind) {
      this.interrupt('动力系统已切换'); return;
    }
    if (collided) { this.interrupt('发生碰撞'); return; }
    if (state.phase === 'ARMED') {
      if (Math.hypot(before.speed, before.lateralVelocity) > REST_SPEED) {
        this.interrupt('起步前车辆已移动'); return;
      }
      if (state.waitingForRelease) {
        if (throttle <= THROTTLE_RELEASE) state.waitingForRelease = false;
        return;
      }
      if (throttle <= THROTTLE_PRESS) return;
      state.phase = 'RUNNING'; state.notice = '';
    }
    if (after.speed < -0.5) { this.interrupt('车辆正在倒退'); return; }
    const fuel = state.energyKind === 'ICE' ? counterDelta(before.fuel?.fuelUsedL, after.fuel?.fuelUsedL) : null;
    const energy = state.energyKind === 'EV' ? counterDelta(before.powertrain.ev?.energyUsedKWh, after.powertrain.ev?.energyUsedKWh) : null;
    const recovered = state.energyKind === 'EV' ? counterDelta(before.powertrain.ev?.energyRecoveredKWh, after.powertrain.ev?.energyRecoveredKWh) : null;
    if (Number.isNaN(fuel) || Number.isNaN(energy) || Number.isNaN(recovered)) {
      this.interrupt('能耗计数已重置或无效'); return;
    }
    const current = state.current;
    const distance = Math.abs(after.speed) * dt;
    const peak = Math.max(current.peakAcceleration, after.acceleration, 0);
    const hundred = state.to100 === null ? crossing(before.speed, after.speed, 100) : null;
    const twoHundred = state.target === 200 && state.to200 === null ? crossing(before.speed, after.speed, 200) : null;
    if (hundred !== null) state.to100 = this.capture(dt, hundred, distance, fuel, energy, recovered, peak);
    if (twoHundred !== null) state.to200 = this.capture(dt, twoHundred, distance, fuel, energy, recovered, peak);
    const finishFraction = (state.target === 100 ? hundred : twoHundred) ?? 1;
    current.elapsedSeconds += dt * finishFraction; current.distanceMeters += distance * finishFraction;
    current.fuelUsedL = add(current.fuelUsedL, fuel, finishFraction);
    current.energyUsedKWh = add(current.energyUsedKWh, energy, finishFraction);
    current.energyRecoveredKWh = add(current.energyRecoveredKWh, recovered, finishFraction);
    current.peakAcceleration = peak;
    if (state.target === 100 && state.to100 || state.target === 200 && state.to200) state.phase = 'COMPLETED';
  }

  /** Only milestone crossings allocate a result object (at most twice per run). */
  private capture(dt: number, fraction: number, distance: number, fuel: number | null,
    energy: number | null, recovered: number | null, peak: number): AccelerationMeasurement {
    const current = this.state.current;
    return { elapsedSeconds: current.elapsedSeconds + dt * fraction,
      distanceMeters: current.distanceMeters + distance * fraction,
      fuelUsedL: add(current.fuelUsedL, fuel, fraction), energyUsedKWh: add(current.energyUsedKWh, energy, fraction),
      energyRecoveredKWh: add(current.energyRecoveredKWh, recovered, fraction), peakAcceleration: peak };
  }
}
