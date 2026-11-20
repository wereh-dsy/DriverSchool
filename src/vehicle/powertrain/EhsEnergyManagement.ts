import type { EhsDriverMode, EhsEvFallbackReason, EhsHybridConfig, EhsPath } from '../config/EhsHybridConfig';
import type { VehicleDriveMode } from '../config/VehiclePhysicsConfig';
import { clamp } from '../physics/math';

/** Low-cost supervisory rules, independent of shafts and vehicle presentation. */
export class EhsEnergyManagement {
  public mode: EhsDriverMode;
  public holdSOC: number;
  public path: EhsPath = 'EV';
  public engineRequested = false;
  public targetRPM = 0;
  public chargeRequestW = 0;
  public evFallbackActive = false;
  public evFallbackReason: EhsEvFallbackReason = 'NONE';
  private runTime = 0;
  private offTime = 100;
  private pathTime = 100;
  private sustaining = false;
  public constructor(private readonly config: EhsHybridConfig) {
    this.mode = config.defaultMode; this.holdSOC = config.control.holdSOC;
  }
  public reset(): void {
    this.path = 'EV'; this.engineRequested = false; this.targetRPM = this.chargeRequestW = 0;
    this.evFallbackActive = false; this.evFallbackReason = 'NONE';
    this.runTime = 0; this.offTime = this.pathTime = 100; this.sustaining = false;
  }
  public setMode(mode: EhsDriverMode, soc = this.holdSOC): void {
    if (!['EV', 'HEV', 'HOLD', 'SPORT'].includes(mode) || !Number.isFinite(soc)) return;
    this.mode = mode; this.holdSOC = clamp(soc, .2, .8);
  }
  public update(dt: number, soc: number, wheelPowerW: number, roadRPM: number, throttle: number,
    enabled: boolean, canDirect: boolean, availableBatteryW: number,
    driveMode?: VehicleDriveMode, thermalDerated = false): void {
    const c = this.config.control, direct = this.config.directDrive;
    const dmStrat = driveMode ? this.config.driveModeStrategy?.[driveMode] : undefined;
    this.pathTime += dt;
    if (soc < c.minimumSOC) this.sustaining = true;
    if (soc > c.restartSOC) this.sustaining = false;
    const target = this.mode === 'HOLD' ? this.holdSOC : c.restartSOC;
    const hold = this.mode === 'HOLD' && soc < target + .005;
    const demand = Math.max(0, wheelPowerW);
    const startPower = c.startPowerW * (dmStrat?.engineStartPowerScale ?? 1);
    const stopPower = c.stopPowerW * (dmStrat?.engineStopPowerScale ?? 1);
    const evPowerThreshold = c.startPowerW * 1.55 * (dmStrat?.evPowerThresholdScale ?? 1);
    const powerThreshold = this.mode === 'EV' ? evPowerThreshold : startPower;
    const batteryLimited = demand > availableBatteryW * .85 && demand > 6000;
    const thermalLimited = thermalDerated && (batteryLimited || availableBatteryW < 25000);
    if (this.mode === 'EV' && enabled) {
      if (this.sustaining) { this.evFallbackActive = true; this.evFallbackReason = 'LOW_SOC'; }
      else if (thermalLimited) { this.evFallbackActive = true; this.evFallbackReason = 'THERMAL_LIMIT'; }
      else if (batteryLimited) { this.evFallbackActive = true; this.evFallbackReason = 'BATTERY_LIMIT'; }
      else if (demand > evPowerThreshold) { this.evFallbackActive = true; this.evFallbackReason = 'POWER_DEMAND'; }
      else { this.evFallbackActive = false; this.evFallbackReason = 'NONE'; }
    } else {
      this.evFallbackActive = false; this.evFallbackReason = 'NONE';
    }
    const sportAssist = this.mode === 'HEV' && dmStrat?.assistThrottleThreshold !== undefined &&
      throttle > dmStrat.assistThrottleThreshold && demand > stopPower * .55;
    const need = this.sustaining || hold || this.mode === 'SPORT' && throttle > .25 || sportAssist ||
      demand > powerThreshold || batteryLimited || thermalLimited;
    if (!enabled) this.engineRequested = false;
    else if (!this.engineRequested && need && (this.offTime >= c.minimumOffSeconds || this.sustaining || thermalLimited)) this.engineRequested = true;
    else if (this.engineRequested && !need && demand < stopPower && this.runTime >= c.minimumRunSeconds)
      this.engineRequested = false;
    this.runTime = this.engineRequested ? this.runTime + dt : 0;
    this.offTime = this.engineRequested ? 0 : this.offTime + dt;
    this.chargeRequestW = this.engineRequested ? clamp((target - soc) * 220000, 0, c.generationReserveW) : 0;
    // A mechanical path is useful only at an efficient crank speed and load.
    // Hysteresis and dwell prevent speed/pedal noise from cycling the clutch.
    const margin = this.path === 'PARALLEL' ? 150 : 0;
    const speedOK = roadRPM >= direct.minimumRPM - margin && roadRPM <= direct.maximumRPM + margin;
    const approximateCrankPower = roadRPM * Math.PI / 30 * direct.referenceTorqueNm * c.efficientLoad;
    const load = (demand + this.chargeRequestW) / Math.max(1, approximateCrankPower);
    const enterLoadMin = dmStrat?.parallelLoadMin ?? .32;
    const stayLoadMin = enterLoadMin * .625;
    const usefulLoad = load > (this.path === 'PARALLEL' ? stayLoadMin : enterLoadMin) && load <
      (this.sustaining ? .95 : Infinity);
    let next: EhsPath = !this.engineRequested ? 'EV' : canDirect && speedOK && usefulLoad ? 'PARALLEL' : 'SERIES';
    if (next !== this.path && (next === 'EV' || !canDirect || this.pathTime >= c.pathDwellSeconds)) {
      this.path = next; this.pathTime = 0;
    }
    if (!enabled) this.path = 'EV';
    const generationPower = demand / .88 + this.chargeRequestW;
    const table = c.efficientRPM;
    let rpm = table[table.length - 1]!.rpm;
    for (let i = 1; i < table.length; i++) {
      const a = table[i - 1]!, b = table[i]!;
      if (generationPower <= b.powerW) {
        rpm = a.rpm + (b.rpm - a.rpm) * clamp((generationPower - a.powerW) / (b.powerW - a.powerW), 0, 1); break;
      }
    }
    const minSeriesRpm = table[0]!.rpm;
    const maxSeriesRpm = table[table.length - 1]!.rpm;
    const scaledSeriesRpm = clamp(rpm * (dmStrat?.seriesRpmScale ?? 1), minSeriesRpm * .92, maxSeriesRpm);
    this.targetRPM = !this.engineRequested ? 0 : this.path === 'PARALLEL' ? roadRPM : scaledSeriesRpm;
  }
}
