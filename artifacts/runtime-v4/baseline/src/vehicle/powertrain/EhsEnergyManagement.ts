import type { EhsDriverMode, EhsHybridConfig, EhsPath } from '../config/EhsHybridConfig';
import { clamp } from '../physics/math';

/** Low-cost supervisory rules, independent of shafts and vehicle presentation. */
export class EhsEnergyManagement {
  public mode: EhsDriverMode;
  public holdSOC: number;
  public path: EhsPath = 'EV';
  public engineRequested = false;
  public targetRPM = 0;
  public chargeRequestW = 0;
  private runTime = 0;
  private offTime = 100;
  private pathTime = 100;
  private sustaining = false;
  public constructor(private readonly config: EhsHybridConfig) {
    this.mode = config.defaultMode; this.holdSOC = config.control.holdSOC;
  }
  public reset(): void {
    this.path = 'EV'; this.engineRequested = false; this.targetRPM = this.chargeRequestW = 0;
    this.runTime = 0; this.offTime = this.pathTime = 100; this.sustaining = false;
  }
  public setMode(mode: EhsDriverMode, soc = this.holdSOC): void {
    if (!['EV', 'HEV', 'HOLD', 'SPORT'].includes(mode) || !Number.isFinite(soc)) return;
    this.mode = mode; this.holdSOC = clamp(soc, .2, .8);
  }
  public update(dt: number, soc: number, wheelPowerW: number, roadRPM: number, throttle: number,
    enabled: boolean, canDirect: boolean, availableBatteryW: number): void {
    const c = this.config.control, direct = this.config.directDrive;
    this.pathTime += dt;
    if (soc < c.minimumSOC) this.sustaining = true;
    if (soc > c.restartSOC) this.sustaining = false;
    const target = this.mode === 'HOLD' ? this.holdSOC : c.restartSOC;
    const hold = this.mode === 'HOLD' && soc < target + .005;
    const demand = Math.max(0, wheelPowerW);
    const powerThreshold = this.mode === 'EV' ? c.startPowerW * 1.55 : c.startPowerW;
    const need = this.sustaining || hold || this.mode === 'SPORT' && throttle > .25 ||
      demand > powerThreshold || demand > availableBatteryW * .85 && demand > 6000;
    if (!enabled) this.engineRequested = false;
    else if (!this.engineRequested && need && this.offTime >= c.minimumOffSeconds) this.engineRequested = true;
    else if (this.engineRequested && !need && demand < c.stopPowerW && this.runTime >= c.minimumRunSeconds)
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
    const usefulLoad = load > (this.path === 'PARALLEL' ? .20 : .32) && load <
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
    this.targetRPM = !this.engineRequested ? 0 : this.path === 'PARALLEL' ? roadRPM : rpm;
  }
}
