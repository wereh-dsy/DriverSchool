import type { Gear, DriveModeCalibration } from '../config';
import type { ElectricVehiclePhysicsConfig, EVThermalConfig, EVModeCalibration } from '../config/ElectricVehiclePhysicsConfig';
import { clamp01 } from '../physics/math';
import { BatteryPack } from './BatteryPack';
import type { ElectricMotor } from './ElectricMotor';
import { ElectricDriveUnit } from './ElectricDriveUnit';
import { EVPowerCoordinator, NORMAL_EV_MODE } from './EVPowerCoordinator';
import { EVLaunchControl } from './EVLaunchControl';
import type { EVTransmission } from '../transmission/EVTransmission';
import type { Powertrain, PowertrainInitialState, PowertrainUpdateContext, PowertrainOutput, PowertrainSnapshot, EVTelemetry } from './Powertrain';

const LEGACY_INVERTER_THERMAL: EVThermalConfig = { thermalCapacity: 14000, coolingRate: 40, airflowCooling: 1,
  derateStartTemperature: 85, criticalTemperature: 120, minimumCapability: .35, initialTemperatureOffset: 4 };

/** Shared pack -> power coordinator -> independently coupled axle drive units. */
export class ElectricPowertrain implements Powertrain {
  public readonly motor: ElectricMotor;
  public readonly battery: BatteryPack;
  public readonly transmission: EVTransmission;
  public readonly frontDriveUnit?: ElectricDriveUnit;
  public readonly rearDriveUnit?: ElectricDriveUnit;
  public readonly coordinator = new EVPowerCoordinator();
  public readonly launchControl?: EVLaunchControl;
  public readonly supportsManualSelection = false;
  public readonly variableMassKg = 0;
  public readonly gear = null;
  private readonly primary: ElectricDriveUnit;
  private mode: EVModeCalibration = NORMAL_EV_MODE;
  private operational = true;
  private context?: PowertrainUpdateContext;
  private pendingDt = 0;
  private consumed = 0;
  private recovered = 0;
  private distanceKm = 0;
  private batteryPower = 0;
  private batteryHeatJ = 0;
  private thermalTime = 0;
  private recentConsumption: number;
  private recentEnergy = 0;
  private recentDistance = 0;
  private recentTime = 0;
  private regenRequested = 0;
  private regenReason: string | null = null;
  private systemPowerLimit = 0;
  public readonly axleOutput: PowertrainOutput = { frontWheelTorque: 0, rearWheelTorque: 0,
    drivenWheelTorque: 0, regenerativeWheelTorque: 0, stopBrakeDemand: 0,
    inputLoadTorque: 0, couplingSlipAngularVelocity: 0, parkingLocked: true };
  public constructor(public readonly config: ElectricVehiclePhysicsConfig) {
    const ambient = config.ambientTemperature ?? 20;
    this.battery = new BatteryPack(config.battery, ambient);
    const units = config.driveUnits ?? [{ axle: config.drivetrainType === 'FWD' ? 'front' as const : 'rear' as const,
      motor: config.motor, transmission: config.fixedReduction,
      inverter: { maxPower: config.battery.maxDischargePower, efficiency: 1, thermal: LEGACY_INVERTER_THERMAL } }];
    for (const unit of units) {
      if (unit.axle === 'front') this.frontDriveUnit = new ElectricDriveUnit(unit, ambient);
      else this.rearDriveUnit = new ElectricDriveUnit(unit, ambient);
    }
    const primary = this.rearDriveUnit ?? this.frontDriveUnit;
    if (!primary) throw new Error('EV requires at least one drive unit');
    this.primary = primary; this.motor = primary.motor; this.transmission = primary.transmission;
    this.recentConsumption = config.regen.referenceConsumptionKWhPer100km;
    this.systemPowerLimit = config.normalSystemPower ?? config.motor.maxDrivePower;
    if (config.launchControl) this.launchControl = new EVLaunchControl(config.launchControl);
  }
  public get torqueSource(): ElectricMotor { return this.motor; }
  public get vehicleOperational(): boolean { return this.operational; }
  public get driveAvailable(): boolean { return this.operational && this.battery.availableDischargePower > 1; }
  public get driving(): boolean { return this.transmission.mode === 'D' || this.transmission.mode === 'R'; }
  public get throttle(): number { return this.motor.requestedDrive; }
  public get serviceBrakeDemand(): number { return this.axleOutput.stopBrakeDemand ?? 0; }
  public get drivenWheelInertia(): number { return this.primary.wheelInertia; }
  public wheelInertiaForAxle(front: boolean): number { return (front ? this.frontDriveUnit : this.rearDriveUnit)?.wheelInertia ?? 0; }
  public get numericallyValid(): boolean {
    const f = this.frontDriveUnit, r = this.rearDriveUnit;
    return Number.isFinite(this.battery.remainingEnergyKWh + this.battery.temperature) &&
      (!f || Number.isFinite(f.motor.shaftAngularVelocity + f.motor.deliveredDriveTorque + f.motor.temperature + f.inverter.thermal.temperature)) &&
      (!r || Number.isFinite(r.motor.shaftAngularVelocity + r.motor.deliveredDriveTorque + r.motor.temperature + r.inverter.thermal.temperature));
  }
  private stopBrakeRequest(context: PowertrainUpdateContext): number {
    return this.operational && this.driving && !this.config.fixedReduction.creepEnabled && context.throttle < .02
      ? this.config.regen.stopBrakeDemand * clamp01(1 - Math.abs(context.vehicleSpeed) / Math.max(.01, this.config.regen.stopBrakeSpeed)) : 0;
  }
  public setStateOfCharge(soc: number): void { this.battery.setStateOfCharge(soc); }
  public reset(state: PowertrainInitialState, recovering = false): void {
    this.operational = state.vehicleOperational ?? true;
    const ev = state.ev;
    if (ev?.stateOfCharge !== undefined) this.battery.setStateOfCharge(ev.stateOfCharge);
    if (ev?.batteryTemperature !== undefined && this.battery.thermal) this.battery.thermal.temperature = ev.batteryTemperature;
    if (!recovering) {
      this.consumed = this.recovered = this.distanceKm = 0;
      this.recentConsumption = this.config.regen.referenceConsumptionKWhPer100km;
      this.recentEnergy = this.recentDistance = this.recentTime = 0;
    }
    this.resetUnit(this.frontDriveUnit, state, ev?.frontMotorTemperature, ev?.frontInverterTemperature);
    this.resetUnit(this.rearDriveUnit, state, ev?.rearMotorTemperature, ev?.rearInverterTemperature);
    this.pendingDt = this.batteryPower = this.regenRequested = this.batteryHeatJ = this.thermalTime = 0;
    this.regenReason = null; this.launchControl?.reset();
    this.axleOutput.frontWheelTorque = this.axleOutput.rearWheelTorque = this.axleOutput.drivenWheelTorque = this.axleOutput.regenerativeWheelTorque = this.axleOutput.stopBrakeDemand = 0;
    this.axleOutput.parkingLocked = this.transmission.mode === 'P';
  }
  private resetUnit(unit: ElectricDriveUnit | undefined, state: PowertrainInitialState, motorTemp?: number, inverterTemp?: number): void {
    if (!unit) return;
    unit.reset(); unit.motor.setShaftSpeed(state.shaftAngularVelocity ?? 0);
    unit.transmission.reset(state.driveSelector ?? 'P'); unit.wheelTorque = 0;
    if (motorTemp !== undefined && unit.motor.thermal) unit.motor.thermal.temperature = motorTemp;
    if (inverterTemp !== undefined) unit.inverter.thermal.temperature = inverterTemp;
  }
  public captureState(previous: PowertrainInitialState = {}): PowertrainInitialState {
    previous.vehicleOperational = this.operational; previous.driveAvailable = this.driveAvailable;
    previous.driveSelector = this.transmission.mode; previous.shaftAngularVelocity = this.motor.shaftAngularVelocity;
    const ev = previous.ev ?? (previous.ev = {});
    ev.stateOfCharge = this.battery.stateOfCharge; ev.batteryTemperature = this.battery.temperature;
    ev.frontMotorTemperature = this.frontDriveUnit?.motor.temperature; ev.rearMotorTemperature = this.rearDriveUnit?.motor.temperature;
    ev.frontInverterTemperature = this.frontDriveUnit?.inverter.thermal.temperature; ev.rearInverterTemperature = this.rearDriveUnit?.inverter.thermal.temperature;
    return previous;
  }
  public requestStart(): boolean { if (this.operational) return false; this.operational = true; return true; }
  public requestStop(): boolean { if (!this.operational) return false; this.operational = false; return true; }
  public requestGear(_gear: Gear): 'gear-not-available' { return 'gear-not-available'; }
  public getShiftGear(): null { return null; }
  public setControlMode(): 'normal' { return 'normal'; }
  public applyDriveMode(calibration: DriveModeCalibration): void {
    this.mode = calibration.ev ?? NORMAL_EV_MODE;
    if (this.frontDriveUnit) this.frontDriveUnit.motor.responseRate = calibration.throttleResponse;
    if (this.rearDriveUnit) this.rearDriveUnit.motor.responseRate = calibration.throttleResponse;
  }
  public prepare(context: PowertrainUpdateContext): void {
    this.context = context;
    if (context.selectorRequest) {
      if (this.transmission.requestSelector(context.selectorRequest, context.vehicleSpeed, context.vehicleLateralSpeed, context.brake)) {
        const other = this.primary === this.rearDriveUnit ? this.frontDriveUnit : this.rearDriveUnit;
        if (other && other.transmission.mode !== this.transmission.mode) other.transmission.reset(this.transmission.mode);
      }
    }
    if (this.operational) this.launchControl?.update(context, this.battery, this.frontDriveUnit, this.rearDriveUnit, this.transmission.mode === 'D');
    else this.launchControl?.reset();
    this.prepareUnit(this.frontDriveUnit, context); this.prepareUnit(this.rearDriveUnit, context);
    this.axleOutput.stopBrakeDemand = this.stopBrakeRequest(context);
  }
  private wheelOmega(unit: ElectricDriveUnit, context: PowertrainUpdateContext): number {
    return (unit.config.axle === 'front' ? context.frontWheelAngularVelocity : context.rearWheelAngularVelocity) ?? context.drivenWheelAngularVelocity;
  }
  private prepareUnit(unit: ElectricDriveUnit | undefined, c: PowertrainUpdateContext): void {
    if (!unit) return;
    unit.transmission.advance(c.dt, c.vehicleSpeed, c.throttle, this.mode.shiftStrategy, this.launchControl?.preselectFirst ?? false);
    unit.motor.setShaftSpeed(this.wheelOmega(unit, c) * unit.transmission.ratio);
    unit.motor.requestDrive(c.throttle, c.dt);
  }
  public update(context: PowertrainUpdateContext): PowertrainOutput {
    this.context = context; this.pendingDt = context.dt; this.regenReason = null;
    const speed = Math.abs(context.vehicleSpeed), regen = this.config.regen;
    const direction = this.transmission.mode === 'R' ? -1 : 1;
    const fade = clamp01((speed - regen.minimumSpeed) / Math.max(.01, regen.fadeSpeed - regen.minimumSpeed));
    const discharge = this.battery.dischargeLimit(context.dt), charge = this.battery.chargeLimit(context.dt);
    const batteryFactor = discharge / this.config.battery.maxDischargePower;
    this.limitUnit(this.frontDriveUnit, context, discharge, charge, batteryFactor, fade);
    this.limitUnit(this.rearDriveUnit, context, discharge, charge, batteryFactor, fade);
    this.systemPowerLimit = (this.launchControl?.powerLimit ?? this.config.normalSystemPower ?? this.config.motor.maxDrivePower) * this.mode.powerFraction;
    // During launch release, the real calipers can decay while propulsion builds.
    // Ordinary pedal/hold/cruise blending keeps its existing propulsion interlock.
    const launchRelease = this.launchControl?.state === 'LAUNCHING' && context.brake < .01;
    const service = !launchRelease && ((context.totalServiceBrakeTorque ?? 0) > 1 || context.brake > .01);
    const lift = this.config.mass * regen.maximumLiftOffDeceleration * this.config.wheelRadius * regen.strength *
      this.mode.liftOffMultiplier * (1 - clamp01(context.throttle));
    this.regenRequested = this.operational && this.driving ? service ? (context.totalServiceBrakeTorque ?? context.drivenAxleBrakeTorque ?? 0) * (regen.brakeRegenFraction ?? 1) : lift : 0;
    const allowed = this.operational && this.driving && !context.autoHoldHolding && !context.parkingBrakeActive;
    if (context.throttle > .02 && !service) {
      this.coordinator.allocate(context, this.frontDriveUnit, this.rearDriveUnit, this.mode, this.launchControl?.state === 'LAUNCHING');
      const reverseTaper = direction < 0 ? clamp01((this.config.fixedReduction.reverseSpeedLimit - speed) / 1) : 1;
      this.deliverUnit(this.frontDriveUnit, direction * this.coordinator.frontTorqueRequest * reverseTaper, context, direction, allowed);
      this.deliverUnit(this.rearDriveUnit, direction * this.coordinator.rearTorqueRequest * reverseTaper, context, direction, allowed);
    } else {
      const f = this.frontDriveUnit, r = this.rearDriveUnit;
      const capacityF = f ? f.regenLimit * f.transmission.ratio / f.transmission.efficiency : 0;
      const capacityR = r ? r.regenLimit * r.transmission.ratio / r.transmission.efficiency : 0;
      const demandF = service ? Math.min(this.regenRequested, context.frontAxleBrakeTorque ?? (f ? this.regenRequested : 0)) : this.regenRequested * capacityF / Math.max(1, capacityF + capacityR);
      const demandR = service ? Math.min(Math.max(0, this.regenRequested - demandF), context.rearAxleBrakeTorque ?? context.drivenAxleBrakeTorque ?? this.regenRequested) : this.regenRequested - demandF;
      this.deliverRegen(f, demandF, context, direction, allowed, service);
      this.deliverRegen(r, demandR, context, direction, allowed, service);
    }
    this.coordinator.constrainPower(this.frontDriveUnit, this.rearDriveUnit, this.systemPowerLimit, discharge, this.auxiliaryPower);
    this.coordinator.constrainCharge(this.frontDriveUnit, this.rearDriveUnit, charge);
    this.updateOutput();
    this.axleOutput.stopBrakeDemand = this.stopBrakeRequest(context);
    if (this.regenRequested > (this.axleOutput.regenerativeWheelTorque ?? 0) + 1) this.regenReason =
      this.battery.chargeFactor < .99 ? 'high-soc' : fade < .99 ? 'low-speed' : 'thermal-motor-or-charge-power';
    return this.axleOutput;
  }
  private get auxiliaryPower(): number { return this.operational ? (this.config.auxiliaryPower ?? 0) + (this.config.hvacPower ?? 0) : 0; }
  private limitUnit(unit: ElectricDriveUnit | undefined, c: PowertrainUpdateContext, discharge: number, charge: number, factor: number, fade: number): void {
    if (!unit) return;
    const traction = (unit.config.axle === 'front' ? c.frontTorqueLimitFactor : c.rearTorqueLimitFactor) ?? c.torqueLimitFactor;
    unit.prepare(this.wheelOmega(unit, c), discharge, charge, traction, factor, fade);
  }
  private deliverUnit(unit: ElectricDriveUnit | undefined, torque: number, c: PowertrainUpdateContext, direction: number, allowed: boolean): void {
    unit?.deliver(torque, c.dt, unit ? this.wheelOmega(unit, c) : 0, direction, allowed);
  }
  private deliverRegen(unit: ElectricDriveUnit | undefined, wheelDemand: number, c: PowertrainUpdateContext, direction: number, allowed: boolean, service: boolean): void {
    if (!unit) return;
    let torque = -Math.sign(unit.motor.shaftAngularVelocity || c.vehicleSpeed) * Math.min(unit.regenLimit,
      wheelDemand / unit.transmission.ratio * unit.transmission.efficiency);
    const reduction = unit.config.transmission;
    if (reduction.creepEnabled && Math.abs(c.vehicleSpeed) < reduction.creepSpeed && !service)
      torque += direction * reduction.creepTorque * clamp01(1 - Math.abs(c.vehicleSpeed) / reduction.creepSpeed);
    this.deliverUnit(unit, torque, c, direction, allowed);
    if (service && unit.motor.deliveredDriveTorque * direction > 0) unit.motor.limitTorque(0, unit.regenLimit, direction);
  }
  private updateOutput(): void {
    const c = this.context, f = this.frontDriveUnit, r = this.rearDriveUnit;
    if (f) f.wheelTorque = f.transmission.update(c ? this.wheelOmega(f, c) : 0, f.motor.deliveredDriveTorque);
    if (r) r.wheelTorque = r.transmission.update(c ? this.wheelOmega(r, c) : 0, r.motor.deliveredDriveTorque);
    this.axleOutput.frontWheelTorque = f?.wheelTorque ?? 0; this.axleOutput.rearWheelTorque = r?.wheelTorque ?? 0;
    this.axleOutput.drivenWheelTorque = (f?.wheelTorque ?? 0) + (r?.wheelTorque ?? 0);
    const motion = Math.sign(c?.vehicleSpeed ?? 0);
    this.axleOutput.regenerativeWheelTorque = Math.max(0, -(f?.wheelTorque ?? 0) * motion) + Math.max(0, -(r?.wheelTorque ?? 0) * motion);
    this.axleOutput.parkingLocked = this.transmission.mode === 'P';
  }
  public limitRegeneration(maximumWheelTorque: number): number {
    if (this.primary.config.axle === 'front') this.limitAxleRegeneration(maximumWheelTorque, 0);
    else this.limitAxleRegeneration(0, maximumWheelTorque);
    return this.axleOutput.drivenWheelTorque;
  }
  public limitAxleRegeneration(front: number, rear: number): void {
    const before = this.axleOutput.regenerativeWheelTorque ?? 0, c = this.context;
    if (this.frontDriveUnit) this.frontDriveUnit.constrainRegen(front, c ? this.wheelOmega(this.frontDriveUnit, c) : 0, Math.sign(c?.vehicleSpeed ?? 0));
    if (this.rearDriveUnit) this.rearDriveUnit.constrainRegen(rear, c ? this.wheelOmega(this.rearDriveUnit, c) : 0, Math.sign(c?.vehicleSpeed ?? 0));
    this.updateOutput();
    if ((this.axleOutput.regenerativeWheelTorque ?? 0) + 1 < before) this.regenReason = 'traction-or-abs';
  }
  public finishStep(speed: number, drivenWheelAngularVelocity?: number, frontWheelAngularVelocity?: number, rearWheelAngularVelocity?: number): void {
    const dt = this.pendingDt; this.pendingDt = 0;
    if (dt <= 0) return;
    const f = this.frontDriveUnit, r = this.rearDriveUnit;
    const terminal = (f?.account(dt, frontWheelAngularVelocity ?? drivenWheelAngularVelocity) ?? 0) +
      (r?.account(dt, rearWheelAngularVelocity ?? drivenWheelAngularVelocity) ?? 0) + this.auxiliaryPower;
    this.batteryPower = this.battery.integrate(dt, terminal);
    const stored = this.batteryPower >= 0 ? this.batteryPower / this.config.battery.dischargeEfficiency : this.batteryPower * this.config.battery.chargeEfficiency;
    const energy = stored * dt / 3_600_000;
    this.consumed += Math.max(0, energy); this.recovered += Math.max(0, -energy);
    const distance = Math.abs(speed) * dt / 1000;
    this.distanceKm += distance;
    this.recentEnergy += energy; this.recentDistance += distance; this.recentTime += dt;
    if (this.recentTime >= 5) {
      if (this.recentDistance > .02) {
        const sample = Math.min(100, Math.max(3, this.recentEnergy / this.recentDistance * 100));
        this.recentConsumption += (sample - this.recentConsumption) * -Math.expm1(-this.recentDistance / 1.5);
      }
      this.recentEnergy = this.recentDistance = this.recentTime = 0;
    }
    this.launchControl?.account(dt, (f?.mechanicalPower ?? 0) + (r?.mechanicalPower ?? 0));
    this.batteryHeatJ += Math.abs(stored - this.batteryPower) * dt; this.thermalTime += dt;
    if (this.thermalTime >= .05) {
      f?.integrateThermal(this.thermalTime, speed, this.mode.coolingMultiplier);
      r?.integrateThermal(this.thermalTime, speed, this.mode.coolingMultiplier);
      this.battery.thermal?.integrate(this.thermalTime, this.batteryHeatJ / this.thermalTime, speed, this.mode.coolingMultiplier);
      this.thermalTime = this.batteryHeatJ = 0;
    }
  }
  public getSnapshot(): PowertrainSnapshot {
    const average = this.distanceKm >= 1 ? (this.consumed - this.recovered) / this.distanceKm * 100 : null;
    const f = this.frontDriveUnit, r = this.rearDriveUnit;
    const thermalFactor = Math.min(this.battery.thermal?.capability ?? 1, f?.motor.thermalCapability ?? 1,
      r?.motor.thermalCapability ?? 1, f?.inverter.thermal.capability ?? 1, r?.inverter.thermal.capability ?? 1);
    const ev: EVTelemetry = {
      instantPowerKW: this.batteryPower / 1000,
      instantConsumption: Math.abs(this.context?.vehicleSpeed ?? 0) > 1 ? this.batteryPower / 1000 / (Math.abs(this.context!.vehicleSpeed) * 3.6) * 100 : null,
      tripKWhPer100Km: average, energyUsedKWh: this.consumed, energyRecoveredKWh: this.recovered,
      batteryTemperature: this.battery.temperature, frontMotorTemperature: f?.motor.temperature, rearMotorTemperature: r?.motor.temperature,
      frontInverterTemperature: f?.inverter.thermal.temperature, rearInverterTemperature: r?.inverter.thermal.temperature,
      frontMotorRPM: f ? Math.abs(f.motor.shaftAngularVelocity) * 30 / Math.PI : undefined,
      rearMotorRPM: r ? Math.abs(r.motor.shaftAngularVelocity) * 30 / Math.PI : undefined,
      frontMotorTorque: f?.motor.deliveredDriveTorque, rearMotorTorque: r?.motor.deliveredDriveTorque,
      frontDriveUnit: f?.getState(), rearDriveUnit: r?.getState(), launchState: this.launchControl?.state,
      systemPowerLimitKW: this.systemPowerLimit / 1000,
      availableDischargePower: this.battery.availableDischargePower,
      availableRegenPower: Math.min(this.battery.availableChargePower, this.unitRegenPower(f) + this.unitRegenPower(r)),
      thermalDerateFraction: 1 - thermalFactor,
      regenBrakeLight: (this.axleOutput.regenerativeWheelTorque ?? 0) / (this.config.mass * this.config.wheelRadius) >= this.config.regen.brakeLightDeceleration,
      stateOfCharge: this.battery.stateOfCharge, remainingEnergyKWh: this.battery.remainingEnergyKWh,
      batteryPowerKw: this.batteryPower / 1000, motorRPM: Math.abs(this.motor.shaftAngularVelocity) * 30 / Math.PI,
      motorTorque: this.motor.deliveredDriveTorque, drivePowerKw: Math.max(0, this.batteryPower) / 1000,
      regenPowerKw: Math.max(0, -this.batteryPower) / 1000, regenLimited: this.regenReason !== null, regenLimitReason: this.regenReason,
      tripEnergyConsumedKWh: this.consumed, tripEnergyRecoveredKWh: this.recovered, averageConsumptionKWhPer100km: average,
      estimatedRangeKm: this.battery.remainingEnergyKWh / Math.max(3, this.recentConsumption) * 100,
      requestedBrakeTorque: this.context?.totalServiceBrakeTorque ?? 0, regenerativeBrakeTorque: this.axleOutput.regenerativeWheelTorque ?? 0 };
    return { kind: 'EV', vehicleOperational: this.operational, driveAvailable: this.driveAvailable,
      inputShaftAngularVelocity: this.motor.shaftAngularVelocity, sourceInertia: this.motor.rotationalInertia,
      availableDriveTorque: this.motor.deliveredDriveTorque, transmission: this.transmission.getSnapshot(), ev };
  }
  private unitRegenPower(unit: ElectricDriveUnit | undefined): number {
    return unit ? unit.regenLimit * Math.abs(unit.motor.shaftAngularVelocity) * unit.motor.efficiency(unit.regenLimit, true) * unit.inverter.config.efficiency : 0;
  }
}
