import type { TireConfig } from '../config';
import { createTyreThermalPressureConfig, type TyreThermalPressureConfig } from '../config/TyreThermalPressureConfig';
import { WHEEL_IDS, type WheelId } from './WheelContact';
import type { TyrePressureState } from '../TPMSState';
import { clamp } from './math';

export const TYRE_ATMOSPHERIC_PRESSURE_PA = 101325;
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const temperature = (value: number, fallback = 20) => clamp(finite(value, fallback), -80, 200);

export interface TyreThermalPressureState {
  temperatureC: number;
  gaugePressureKPa: number;
  absolutePressurePa: number;
  targetColdPressureKPa: number;
  pressureRatio: number;
  rollingResistanceFactor: number;
  longitudinalStiffnessFactor: number;
  lateralStiffnessFactor: number;
  warningState: TyrePressureState;
}
interface ThermalAccumulator { elapsed: number; heat: number; cooling: number; ambientCooling: number }

/** Allocation-free work accumulation at physics cadence, integration at 20 Hz.
 * No tyre damage or temperature/grip curve. Air mass and volume remain fixed. */
export class TyreThermalPressureSystem {
  public readonly states: Record<WheelId, TyreThermalPressureState>;
  public readonly configs: Record<WheelId, TyreThermalPressureConfig>;
  private readonly accumulators: Record<WheelId, ThermalAccumulator>;
  public constructor(config: TireConfig, ambientTemperatureC = 20) {
    const front = createTyreThermalPressureConfig(240, config.thermalPressureFront);
    const rear = createTyreThermalPressureConfig(250, config.thermalPressureRear);
    this.configs = { frontLeft: front, frontRight: front, rearLeft: rear, rearRight: rear };
    this.states = {} as typeof this.states;
    this.accumulators = {} as typeof this.accumulators;
    for (const id of WHEEL_IDS) {
      this.states[id] = { temperatureC: 20, gaugePressureKPa: 0, absolutePressurePa: 0,
        targetColdPressureKPa: 0, pressureRatio: 1, rollingResistanceFactor: 1,
        longitudinalStiffnessFactor: 1, lateralStiffnessFactor: 1, warningState: 'NORMAL' };
      this.accumulators[id] = { elapsed: 0, heat: 0, cooling: 0, ambientCooling: 0 };
    }
    this.reset(ambientTemperatureC);
  }
  public reset(ambientTemperatureC: number): void {
    for (const id of WHEEL_IDS) {
      const c = this.configs[id], a = this.accumulators[id];
      this.states[id].temperatureC = temperature(ambientTemperatureC) + finite(c.initialTemperatureOffsetC ?? 0);
      a.elapsed = a.heat = a.cooling = a.ambientCooling = 0;
      this.refresh(id);
    }
  }
  public accumulate(id: WheelId, dt: number, ambientTemperatureC: number, rollingForce: number,
    longitudinalSpeed: number, longitudinalForce: number, longitudinalSlipSpeed: number,
    lateralForce: number, lateralSlipSpeed: number): void {
    const duration = clamp(finite(dt), 0, .1);
    if (duration <= 0) return;
    const c = this.configs[id], a = this.accumulators[id];
    // Forces already contain load, surface and combined-slip contributions.
    const power = Math.abs(finite(rollingForce) * finite(longitudinalSpeed)) +
      Math.abs(finite(longitudinalForce) * finite(longitudinalSlipSpeed)) +
      Math.abs(finite(lateralForce) * finite(lateralSlipSpeed));
    const cooling = Math.max(0, finite(c.baseCoolingRate, 12)) +
      Math.max(0, finite(c.speedCoolingGain, .8)) * Math.hypot(finite(longitudinalSpeed), finite(lateralSlipSpeed));
    a.elapsed += duration;
    a.heat += power * clamp(finite(c.heatingEfficiency, .65), 0, 1) * duration;
    a.cooling += cooling * duration;
    a.ambientCooling += cooling * temperature(ambientTemperatureC) * duration;
    if (a.elapsed + 1e-9 < .05) return;
    const state = this.states[id], capacity = Math.max(1000, finite(c.thermalCapacity, 30000));
    if (a.cooling > 1e-9) {
      const equilibrium = (a.heat + a.ambientCooling) / a.cooling;
      state.temperatureC += (equilibrium - state.temperatureC) * -Math.expm1(-a.cooling / capacity);
    } else state.temperatureC += a.heat / capacity;
    a.elapsed = a.heat = a.cooling = a.ambientCooling = 0;
    this.refresh(id);
  }
  /** Re-derive pressure and modifiers from temperature; also useful for diagnostics. */
  public refresh(id: WheelId): void {
    const c = this.configs[id], s = this.states[id];
    s.temperatureC = temperature(s.temperatureC);
    s.targetColdPressureKPa = Math.max(1, finite(c.referenceColdPressureKPa, 240));
    s.absolutePressurePa = (s.targetColdPressureKPa * 1000 + TYRE_ATMOSPHERIC_PRESSURE_PA) *
      (s.temperatureC + 273.15) / (temperature(c.referenceTemperatureC) + 273.15);
    s.gaugePressureKPa = Math.max(0, (s.absolutePressurePa - TYRE_ATMOSPHERIC_PRESSURE_PA) / 1000);
    s.pressureRatio = s.gaugePressureKPa / s.targetColdPressureKPa;
    // Clamp the *physical correction* only; telemetry still reports the gas pressure.
    const minimum = clamp(finite(c.minimumPhysicalPressureKPa, 40), 1, 500);
    const maximum = Math.max(minimum, finite(c.maximumPhysicalPressureKPa, 550));
    const ratio = clamp(s.gaugePressureKPa, minimum, maximum) / s.targetColdPressureKPa;
    const delta = ratio - 1;
    s.rollingResistanceFactor = clamp(1 - Math.max(0, finite(c.rollingResistancePressureSensitivity, .25)) *
      (delta < 0 ? delta * (1 - delta) : delta * .4), .94, 1.4);
    s.longitudinalStiffnessFactor = clamp(1 + delta * Math.max(0, finite(c.longitudinalStiffnessPressureSensitivity, .10)), .85, 1.08);
    s.lateralStiffnessFactor = clamp(1 + delta * Math.max(0, finite(c.lateralStiffnessPressureSensitivity, .12)), .85, 1.08);
    const low = clamp(finite(c.lowPressureWarningRatio, .8), .1, .99);
    const critical = clamp(finite(c.criticalLowPressureRatio, .65), 0, low);
    s.warningState = s.pressureRatio < critical ? 'CRITICAL_LOW' : s.pressureRatio < low ? 'LOW' :
      s.pressureRatio > Math.max(1.3, finite(c.highPressureWarningRatio, 1.45)) ? 'HIGH' : 'NORMAL';
  }
}
