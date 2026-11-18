import type { MildHybridConfig } from '../config/MildHybridConfig';
import type { Engine } from '../physics/Engine';
import type { PowertrainUpdateContext } from './Powertrain';
import type { TransmissionSnapshot } from '../transmission/TransmissionSystem';
import { clamp, clamp01 } from '../physics/math';
import { smoothLimit } from './EVThermalState';
import { ElectricMotor } from './ElectricMotor';

/** One crank machine and a small pack. No eAxle, EV selector or HEV driving mode. */
export class MildHybridSystem {
  public readonly motor: ElectricMotor;
  public soc: number;
  public voltage: number;
  public current = 0;
  public electricalPower = 0;
  private reserve = 1;
  private initialOmega = 0;
  private heatJ = 0;
  private thermalTime = 0;
  public constructor(public readonly config: MildHybridConfig) {
    this.motor = new ElectricMotor(config.motor);
    this.soc = config.battery.defaultSOC; this.voltage = config.battery.nominalVoltage;
  }
  public get restartAvailable(): boolean { return this.soc > .14 && this.motor.thermalCapability > .2; }
  public get torque(): number { return this.motor.deliveredDriveTorque; }
  public reset(soc = this.soc): void {
    this.soc = clamp01(soc); this.reserve = 1; this.motor.reset();
    this.current = this.electricalPower = this.heatJ = this.thermalTime = 0;
    this.voltage = this.config.battery.nominalVoltage * (.92 + .16 * this.soc);
  }
  public prepare(c: PowertrainUpdateContext, engine: Engine, transmission: TransmissionSnapshot): void {
    const b = this.config.battery, m = this.motor;
    this.initialOmega = engine.angularVelocity; m.setShaftSpeed(this.initialOmega);
    const discharge = smoothLimit((this.soc - .1) / .25);
    const charge = smoothLimit((.95 - this.soc) / .25);
    const ocv = b.nominalVoltage * (.92 + .16 * this.soc);
    const i = b.maxDischargeCurrent * discharge;
    const draw = Math.min(b.maxAssistPower, i * Math.max(1, ocv - i * b.internalResistance),
      this.soc * b.usableCapacityKWh * 3600000 / c.dt);
    const j = b.maxChargeCurrent * charge;
    const recovery = Math.min(b.maxRegenPower, j * (ocv + j * b.internalResistance),
      (1 - this.soc) * b.usableCapacityKWh * 3600000 / c.dt);
    const drive = m.driveLimit(Math.max(0, draw - 300)) * discharge;
    const regen = m.regenLimit(recovery) * charge;
    let request = 0;
    if (engine.ignitionPhase === 'CRANKING' && this.restartAvailable) request = Math.min(drive, this.config.restartTorque);
    else if (engine.ignitionPhase === 'CATCH') request = Math.min(drive, 25) *
      (1 - smoothLimit((engine.currentRPM - engine.config.idleRPM) / 150));
    else if (engine.isRunning && !engine.isStarting && (transmission.selectedMode === 'D' || transmission.selectedMode === 'R')) {
      if (c.throttle > .08 && c.brake < .01 && !c.autoHoldHolding && !c.parkingBrakeActive) {
        const lowSpeed = 1 - smoothLimit((engine.currentRPM - 1800) / 2200);
        // Real turbo air-limited potential; assistance exits as the spool catches up.
        const turboGap = clamp01(1 - engine.availableTorque / Math.max(1, engine.getTorqueAtRPM(engine.currentRPM)));
        const shiftFill = transmission.shiftInProgress && transmission.shiftProgress > .7 ? .4 : 0;
        const demand = clamp01(c.throttle * (.32 * lowSpeed + 1.4 * turboGap + shiftFill));
        request = drive * demand * this.reserve * (this.config.modeAssist[c.driveMode ?? 'NORMAL'] ?? 1) * c.torqueLimitFactor;
      } else if (c.throttle < .03 && Math.abs(c.vehicleSpeed) > 4 && engine.currentRPM > engine.config.idleRPM + 300 &&
        (transmission.torqueConverter?.lockupEngagement ?? 0) > .95 && !transmission.shiftInProgress && !c.autoHoldHolding && !c.parkingBrakeActive) {
        // Generate only when the road backdrives the crank through closed lockup.
        // This is mild engine drag; it does not claim hydraulic brake credit.
        request = -Math.min(regen, this.config.liftOffTorque + c.brake * this.config.brakeRegenTorque);
      }
    }
    this.reserve = clamp01(this.reserve + c.dt * (engine.isRunning && c.throttle > .08
      ? request > 0 ? -1 / this.config.burstDuration : 0 : 1 / this.config.recoveryTime));
    m.requestTorque(request); m.updateState(c.dt, 0); m.limitTorque(drive, regen, 1);
    if (request === 0 || request * m.deliveredDriveTorque < 0) m.scaleTorque(0);
  }
  public cancelRegeneration(): void { this.motor.constrainRegeneration(0, 1); }
  public finish(dt: number, engineOmega: number, speed: number): void {
    const b = this.config.battery;
    const mechanical = this.torque * (this.initialOmega + engineOmega) * .5;
    const efficiency = this.motor.efficiency(this.torque, mechanical < 0);
    this.electricalPower = (mechanical < 0 ? mechanical * efficiency : mechanical / efficiency) +
      300 * (this.torque / this.config.motor.maxDriveTorque) ** 2;
    const ocv = b.nominalVoltage * (.92 + .16 * this.soc), r = b.internalResistance;
    this.current = 2 * this.electricalPower / Math.max(1, ocv + Math.sqrt(Math.max(0, ocv * ocv - 4 * r * this.electricalPower)));
    this.voltage = ocv - this.current * r;
    this.soc = clamp(this.soc - (this.electricalPower + this.current * this.current * r) * dt / 3600000 / b.usableCapacityKWh, 0, 1);
    this.motor.setShaftSpeed(engineOmega);
    this.heatJ += Math.max(0, this.electricalPower - mechanical) * dt; this.thermalTime += dt;
    if (this.thermalTime >= .1) {
      this.motor.thermal?.integrate(this.thermalTime, this.heatJ / this.thermalTime, speed);
      this.heatJ = this.thermalTime = 0;
    }
  }
  public getSnapshot() {
    return { stateOfCharge: this.soc, packVoltage: this.voltage, packCurrent: this.current,
      powerKW: this.electricalPower / 1000, isgTorque: this.torque,
      isgRPM: this.motor.shaftAngularVelocity * 30 / Math.PI, isgTemperature: this.motor.temperature,
      assistReserve: this.reserve };
  }
}
