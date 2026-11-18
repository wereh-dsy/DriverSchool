import type { P2HybridConfig } from '../config/P2HybridConfig';
import { BatteryPack } from './BatteryPack';
import { clamp } from '../physics/math';

/** PHEV lifecycle/charger over the SAME electrical/thermal model used by EVs. */
export class HybridBattery extends BatteryPack {
  public chargingState: 'DISCONNECTED' | 'CHARGING' | 'COMPLETE' | 'INHIBITED' = 'DISCONNECTED';
  public connector: 'AC' | 'DC' | null = null;
  public gridPowerW = 0;
  public gridEnergyKWh = 0;
  public chargerLossKWh = 0;
  public terminalPowerW = 0;
  private requestedPower = 0;
  public constructor(private readonly hybrid: P2HybridConfig, ambient = 20) { super(hybrid.battery, ambient); }
  public connect(type: 'AC' | 'DC', requestedPower?: number): void {
    this.connector = type;
    this.requestedPower = Math.max(0, requestedPower ?? (type === 'AC' ? this.hybrid.charging.acPower : this.hybrid.charging.dcPower));
    this.chargingState = 'INHIBITED';
  }
  public disconnect(): void { this.connector = null; this.gridPowerW = 0; this.chargingState = 'DISCONNECTED'; }
  /** Initialization/replay only; normal charging always integrates terminal power. */
  public initializeSOC(soc: number): void { this.setStateOfCharge(soc); }
  public step(dt: number, terminalPowerW: number, speed: number, chargingPermitted: boolean): number {
    this.gridPowerW = 0;
    if (this.connector) {
      const ac = this.connector === 'AC', c = this.hybrid.charging;
      const efficiency = ac ? c.acEfficiency : c.dcEfficiency;
      const allowed = chargingPermitted && Math.abs(speed) < .05;
      const grid = allowed && this.stateOfCharge < .999 ? Math.min(this.requestedPower, ac ? c.acPower : c.dcPower,
        this.chargeLimit(dt) / efficiency) : 0;
      this.terminalPowerW = this.integrate(dt, -grid * efficiency);
      this.gridPowerW = Math.max(0, -this.terminalPowerW / efficiency);
      this.gridEnergyKWh += this.gridPowerW * dt / 3_600_000;
      this.chargerLossKWh += this.gridPowerW * (1 - efficiency) * dt / 3_600_000;
      this.chargingState = this.stateOfCharge >= .999 ? 'COMPLETE' : this.gridPowerW > 1 ? 'CHARGING' : 'INHIBITED';
    } else {
      this.chargingState = 'DISCONNECTED';
      this.terminalPowerW = this.integrate(dt, terminalPowerW);
    }
    const chemical = this.terminalPowerW + this.resistiveLoss;
    const efficiencyHeat = chemical >= 0 ? chemical * (1 / this.config.dischargeEfficiency - 1)
      : -chemical * (1 - this.config.chargeEfficiency);
    this.thermal?.integrate(dt, this.resistiveLoss + efficiencyHeat, speed);
    return this.terminalPowerW;
  }
  public getSnapshot() {
    return { soc: this.stateOfCharge, energyKWh: this.remainingEnergyKWh, temperatureC: this.temperature,
      voltage: this.voltage, current: this.current, internalResistance: this.internalResistance,
      dischargePowerW: this.availableDischargePower, chargePowerW: this.availableChargePower,
      connector: this.connector, state: this.chargingState, gridPowerW: this.gridPowerW,
      gridEnergyKWh: this.gridEnergyKWh, chargerLossKWh: this.chargerLossKWh,
      thermalCapability: clamp(this.thermal?.capability ?? 1, 0, 1) };
  }
}
