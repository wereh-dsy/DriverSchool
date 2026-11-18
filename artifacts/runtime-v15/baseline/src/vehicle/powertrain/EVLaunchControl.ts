import type { EVLaunchConfig } from '../config/ElectricVehiclePhysicsConfig';
import type { BatteryPack } from './BatteryPack';
import type { ElectricDriveUnit } from './ElectricDriveUnit';
import type { PowertrainUpdateContext } from './Powertrain';
import { smoothLimit } from './EVThermalState';

export type EVLaunchState = 'IDLE' | 'ARMED' | 'READY' | 'LAUNCHING' | 'COOLDOWN' | 'UNAVAILABLE';
export class EVLaunchControl {
  public state: EVLaunchState = 'IDLE';
  public powerLimit: number;
  public preselectFirst = false;
  private timer = 0;
  private energyKJ = 0;
  private coolingTimer = 0;
  public constructor(public readonly config: EVLaunchConfig) { this.powerLimit = config.normalPower; }
  public reset(): void { this.state = 'IDLE'; this.timer = this.energyKJ = this.coolingTimer = 0; this.preselectFirst = false; this.powerLimit = this.config.normalPower; }
  public update(context: PowertrainUpdateContext, battery: BatteryPack, front: ElectricDriveUnit | undefined, rear: ElectricDriveUnit | undefined, driving: boolean): void {
    const c = this.config;
    const safe = battery.stateOfCharge >= c.minimumSOC && battery.temperature >= c.minimumBatteryTemperature &&
      battery.temperature <= c.maximumBatteryTemperature && (!front || front.motor.temperature < c.maximumMotorTemperature && front.inverter.thermal.temperature < c.maximumInverterTemperature) &&
      (!rear || rear.motor.temperature < c.maximumMotorTemperature && rear.inverter.thermal.temperature < c.maximumInverterTemperature);
    this.powerLimit = c.normalPower; this.preselectFirst = false;
    if (this.state === 'COOLDOWN') {
      this.coolingTimer = Math.max(0, this.coolingTimer - context.dt);
      if (this.coolingTimer <= 0) this.state = 'IDLE';
      else return;
    }
    if (this.state === 'LAUNCHING') {
      this.timer += context.dt;
      if (!safe || !driving || context.driveMode !== 'SPORT_PLUS' || context.brake > .2 || context.throttle < .5 || this.timer >= c.duration || this.energyKJ >= c.energyBudgetKJ) {
        this.state = 'COOLDOWN'; this.coolingTimer = c.cooldown; return;
      }
      const reserve = Math.min(smoothLimit((c.duration - this.timer) / 1.2), smoothLimit((c.energyBudgetKJ - this.energyKJ) / Math.max(1, c.energyBudgetKJ * .2)));
      this.powerLimit = c.normalPower + (c.overboostPower - c.normalPower) * reserve;
      return;
    }
    if (!safe) { this.state = 'UNAVAILABLE'; this.timer = 0; return; }
    if (context.driveMode !== 'SPORT_PLUS' || !driving) { this.state = 'IDLE'; this.timer = 0; return; }
    if (this.state === 'READY' && context.brake < .1 && context.throttle > .9) {
      this.state = 'LAUNCHING'; this.timer = this.energyKJ = 0; this.powerLimit = c.overboostPower; return;
    }
    if (Math.abs(context.vehicleSpeed) < .4 && context.brake > .7 && context.throttle > .92 && !context.parkingBrakeActive) {
      this.timer += context.dt; this.state = this.timer >= c.armTime ? 'READY' : 'ARMED'; this.preselectFirst = true;
    } else { this.state = 'IDLE'; this.timer = 0; }
  }
  public account(dt: number, mechanicalPower: number): void {
    if (this.state === 'LAUNCHING') this.energyKJ += Math.max(0, mechanicalPower - this.config.normalPower) * dt / 1000;
  }
}
