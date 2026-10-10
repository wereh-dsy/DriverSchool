import type { Gear } from '../config';
import type { ElectricVehiclePhysicsConfig } from '../config/ElectricVehiclePhysicsConfig';
import { clamp01 } from '../physics/math';
import { BatteryPack } from './BatteryPack';
import { ElectricMotor } from './ElectricMotor';
import { FixedReductionTransmission } from '../transmission/FixedReductionTransmission';
import type { Powertrain, PowertrainInitialState, PowertrainUpdateContext, PowertrainOutput, PowertrainSnapshot, EVTelemetry } from './Powertrain';

/** Battery -> motor -> one fixed reduction. All chassis/brakes remain common. */
export class ElectricPowertrain implements Powertrain {
  public readonly motor: ElectricMotor;
  public readonly battery: BatteryPack;
  public readonly transmission: FixedReductionTransmission;
  public readonly supportsManualSelection = false;
  public readonly variableMassKg = 0;
  public readonly gear = null;
  private operational = true;
  private context: PowertrainUpdateContext | undefined;
  private pendingDt = 0;
  private consumed = 0;
  private recovered = 0;
  private distanceKm = 0;
  private batteryPower = 0;
  private regenRequested = 0;
  private regenReason: string | null = null;
  private readonly output: PowertrainOutput = { drivenWheelTorque: 0, regenerativeWheelTorque: 0, stopBrakeDemand: 0,
    inputLoadTorque: 0, couplingSlipAngularVelocity: 0, parkingLocked: true };
  public constructor(public readonly config: ElectricVehiclePhysicsConfig) {
    this.motor = new ElectricMotor(config.motor); this.battery = new BatteryPack(config.battery);
    this.transmission = new FixedReductionTransmission(config.fixedReduction);
  }
  public get torqueSource(): ElectricMotor { return this.motor; }
  public get vehicleOperational(): boolean { return this.operational; }
  public get driveAvailable(): boolean { return this.operational && this.battery.dischargeFactor > 0; }
  public get driving(): boolean { return this.transmission.mode === 'D' || this.transmission.mode === 'R'; }
  public get throttle(): number { return this.motor.requestedDrive; }
  public get serviceBrakeDemand(): number { return this.output.stopBrakeDemand ?? 0; }
  public get drivenWheelInertia(): number { return this.config.motor.rotationalInertia * this.config.fixedReduction.ratio ** 2 / 2; }
  public get numericallyValid(): boolean {
    return Number.isFinite(this.battery.remainingEnergyKWh) && Number.isFinite(this.motor.shaftAngularVelocity) && Number.isFinite(this.motor.deliveredDriveTorque);
  }
  private stopBrakeRequest(context: PowertrainUpdateContext): number {
    return this.operational && this.driving && !this.config.fixedReduction.creepEnabled && context.throttle < .02
      ? this.config.regen.stopBrakeDemand * clamp01(1 - Math.abs(context.vehicleSpeed) / Math.max(.01, this.config.regen.stopBrakeSpeed)) : 0;
  }
  public setStateOfCharge(soc: number): void { this.battery.setStateOfCharge(soc); }
  public reset(state: PowertrainInitialState, recovering = false): void {
    this.operational = state.vehicleOperational ?? true;
    if (state.ev?.stateOfCharge !== undefined) this.battery.setStateOfCharge(state.ev.stateOfCharge);
    if (!recovering) this.consumed = this.recovered = this.distanceKm = 0;
    this.motor.reset(); this.motor.setShaftSpeed(state.shaftAngularVelocity ?? 0);
    this.transmission.reset(state.driveSelector ?? 'P');
    this.pendingDt = this.batteryPower = this.regenRequested = 0; this.regenReason = null;
    this.output.drivenWheelTorque = this.output.regenerativeWheelTorque = this.output.stopBrakeDemand = 0;
    this.output.parkingLocked = this.transmission.mode === 'P';
  }
  public captureState(previous: PowertrainInitialState = {}): PowertrainInitialState {
    previous.vehicleOperational = this.operational; previous.driveAvailable = this.driveAvailable;
    previous.driveSelector = this.transmission.mode; previous.shaftAngularVelocity = this.motor.shaftAngularVelocity;
    const ev = previous.ev ?? (previous.ev = {}); ev.stateOfCharge = this.battery.stateOfCharge;
    return previous;
  }
  public requestStart(): boolean { if (this.operational) return false; this.operational = true; return true; }
  public requestStop(): boolean { if (!this.operational) return false; this.operational = false; return true; }
  public requestGear(_gear: Gear): 'gear-not-available' { return 'gear-not-available'; }
  public getShiftGear(): null { return null; }
  public setControlMode(): 'normal' { return 'normal'; }
  public prepare(context: PowertrainUpdateContext): void {
    this.context = context;
    if (context.selectorRequest) this.transmission.requestSelector(context.selectorRequest, context.vehicleSpeed, context.vehicleLateralSpeed, context.brake);
    this.motor.setShaftSpeed(context.drivenWheelAngularVelocity * this.config.fixedReduction.ratio);
    this.motor.requestDrive(context.throttle, context.dt);
    this.output.stopBrakeDemand = this.stopBrakeRequest(context);
  }
  public update(context: PowertrainUpdateContext): PowertrainOutput {
    this.context = context; this.pendingDt = context.dt; this.regenReason = null;
    const { fixedReduction: reduction, regen } = this.config, speed = Math.abs(context.vehicleSpeed);
    const direction = this.transmission.mode === 'R' ? -1 : 1;
    const driveLimit = Math.min(this.motor.driveLimit(this.battery.dischargeLimit(context.dt)),
      this.config.motor.maxDriveTorque * this.battery.dischargeFactor) * context.torqueLimitFactor;
    const fade = clamp01((speed - regen.minimumSpeed) / Math.max(.01, regen.fadeSpeed - regen.minimumSpeed));
    const regenLimit = this.motor.regenLimit(this.battery.chargeLimit(context.dt)) * fade;
    const brakeRequest = Math.max(0, context.drivenAxleBrakeTorque ?? 0);
    const liftOffWheelTorque = this.config.mass * regen.maximumLiftOffDeceleration * this.config.wheelRadius *
      regen.strength * (1 - clamp01(context.throttle));
    // Pedal braking replaces lift-off demand; never stack full regen onto full service braking.
    const serviceBraking = (context.totalServiceBrakeTorque ?? 0) > 1 || context.brake > .01;
    this.regenRequested = this.operational && this.driving ? serviceBraking ? brakeRequest : liftOffWheelTorque : 0;
    let target = 0;
    if (this.operational && this.driving && !context.autoHoldHolding && !context.parkingBrakeActive) {
      if (context.throttle > .02 && !serviceBraking) {
        const reverseTaper = this.transmission.mode === 'R' ? clamp01((reduction.reverseSpeedLimit - speed) / 1) : 1;
        target = direction * driveLimit * context.throttle * reverseTaper;
      } else {
        target = -Math.sign(this.motor.shaftAngularVelocity || context.vehicleSpeed) *
          Math.min(regenLimit, this.regenRequested / reduction.ratio * reduction.efficiency);
        if (reduction.creepEnabled && speed < reduction.creepSpeed && context.brake < .01)
          target += direction * reduction.creepTorque * clamp01(1 - speed / reduction.creepSpeed);
      }
    }
    this.motor.requestTorque(target); this.motor.updateState(context.dt, 0);
    // A brake request cancels residual positive propulsion in this step.
    if (serviceBraking && this.motor.deliveredDriveTorque * direction > 0) this.motor.limitTorque(0, regenLimit, direction);
    this.motor.limitTorque(driveLimit, regenLimit, Math.sign(this.motor.shaftAngularVelocity) || direction);
    if (!this.operational || !this.driving || context.autoHoldHolding || context.parkingBrakeActive) this.motor.limitTorque(0, 0);
    this.updateOutput();
    this.output.stopBrakeDemand = this.stopBrakeRequest(context);
    if (this.regenRequested > (this.output.regenerativeWheelTorque ?? 0) + 1) this.regenReason =
      this.battery.chargeFactor < .99 ? 'high-soc' : fade < .99 ? 'low-speed' : 'motor-or-charge-power';
    return this.output;
  }
  private updateOutput(): void {
    this.output.drivenWheelTorque = this.transmission.update(this.context?.drivenWheelAngularVelocity ?? 0, this.motor.deliveredDriveTorque);
    this.output.regenerativeWheelTorque = this.output.drivenWheelTorque * (this.context?.vehicleSpeed ?? 0) < 0 ? Math.abs(this.output.drivenWheelTorque) : 0;
    this.output.parkingLocked = this.transmission.mode === 'P';
  }
  public limitRegeneration(maximumWheelTorque: number): number {
    const before = this.output.regenerativeWheelTorque ?? 0;
    this.motor.constrainRegeneration(Math.max(0, maximumWheelTorque) / this.config.fixedReduction.ratio * this.config.fixedReduction.efficiency);
    this.updateOutput();
    if ((this.output.regenerativeWheelTorque ?? 0) + 1 < before) this.regenReason = 'traction-or-abs';
    return this.output.drivenWheelTorque;
  }
  public finishStep(speed: number, drivenWheelAngularVelocity?: number): void {
    const dt = this.pendingDt; this.pendingDt = 0;
    if (dt <= 0) return;
    const previousOmega = this.motor.shaftAngularVelocity;
    if (drivenWheelAngularVelocity !== undefined) {
      this.motor.setShaftSpeed(drivenWheelAngularVelocity * this.config.fixedReduction.ratio);
      this.transmission.update(drivenWheelAngularVelocity, this.motor.deliveredDriveTorque);
    }
    const mechanicalPower = this.motor.deliveredDriveTorque * (previousOmega + this.motor.shaftAngularVelocity) * .5;
    const terminalPower = mechanicalPower >= 0 ? mechanicalPower / this.config.motor.motoringEfficiency : mechanicalPower * this.config.motor.regenEfficiency;
    this.batteryPower = this.battery.integrate(dt, terminalPower);
    const energy = this.batteryPower * dt / 3_600_000;
    this.consumed += Math.max(0, energy) / this.config.battery.dischargeEfficiency;
    this.recovered += Math.max(0, -energy) * this.config.battery.chargeEfficiency;
    this.distanceKm += Math.abs(speed) * dt / 1000;
  }
  public getSnapshot(): PowertrainSnapshot {
    const average = this.distanceKm >= 1 ? (this.consumed - this.recovered) / this.distanceKm * 100 : null;
    const rangeConsumption = average !== null && average > 1 ? average : this.config.regen.referenceConsumptionKWhPer100km;
    const ev: EVTelemetry = { regenBrakeLight: (this.output.regenerativeWheelTorque ?? 0) /
        (this.config.mass * this.config.wheelRadius) >= this.config.regen.brakeLightDeceleration,
      stateOfCharge: this.battery.stateOfCharge, remainingEnergyKWh: this.battery.remainingEnergyKWh,
      batteryPowerKw: this.batteryPower / 1000, motorRPM: Math.abs(this.motor.shaftAngularVelocity) * 30 / Math.PI,
      motorTorque: this.motor.deliveredDriveTorque, drivePowerKw: Math.max(0, this.batteryPower) / 1000,
      regenPowerKw: Math.max(0, -this.batteryPower) / 1000, regenLimited: this.regenReason !== null, regenLimitReason: this.regenReason,
      tripEnergyConsumedKWh: this.consumed, tripEnergyRecoveredKWh: this.recovered, averageConsumptionKWhPer100km: average,
      estimatedRangeKm: this.battery.remainingEnergyKWh / rangeConsumption * 100,
      requestedBrakeTorque: this.context?.totalServiceBrakeTorque ?? 0, regenerativeBrakeTorque: this.output.regenerativeWheelTorque ?? 0 };
    return { kind: 'EV', vehicleOperational: this.operational, driveAvailable: this.driveAvailable,
      inputShaftAngularVelocity: this.motor.shaftAngularVelocity, sourceInertia: this.motor.rotationalInertia,
      availableDriveTorque: this.motor.deliveredDriveTorque, transmission: this.transmission.getSnapshot(), ev };
  }
}
