import type { DriveModeCalibration, DriveSelector } from '../config';
import type { P2HybridVehiclePhysicsConfig, HybridMode, TransferMode } from '../config/P2HybridConfig';
import type { DriveTorqueSource } from '../physics/DriveTorqueSource';
import { clamp, clamp01 } from '../physics/math';
import { implicitClutchDemand } from '../transmission/implicitClutchDemand';
import type { TransmissionContext } from '../transmission/TransmissionSystem';
import { P2HybridTransmission } from '../transmission/P2HybridTransmission';
import { ICEPowertrain, type ICEPowertrainSnapshot } from './ICEPowertrain';
import { ElectricMotor } from './ElectricMotor';
import { HybridBattery } from './HybridBattery';
import { HybridEnergyManagement } from './HybridEnergyManagement';
import { MechanicalTransferCase } from './MechanicalTransferCase';
import type { EVTelemetry, PowertrainInitialState, PowertrainOutput, PowertrainUpdateContext } from './Powertrain';

export interface HybridTelemetry {
  mode: HybridMode; state: string; holdSOC: number; engineRequested: boolean;
  enginePhase: string; clutchEngagement: number; clutchSlipRPM: number; clutchTorque: number;
  enginePowerW: number; motorPowerW: number; generationPowerW: number; wheelPowerW: number;
  clutchLossW: number; transmissionLossW: number; electricalLossW: number;
  battery: ReturnType<HybridBattery['getSnapshot']>; transfer: ReturnType<MechanicalTransferCase['getSnapshot']>;
}

/** Reuses ICE lifecycle/telemetry, Engine/FuelSystem/Clutch and EV electrical components.
 * K0 is BEFORE the motor. Positive engine output is ONLY its K0 reaction torque.
 * Both sources then traverse the same HAT, final drive and mechanical transfer. */
export class P2HybridPowertrain extends ICEPowertrain {
  public readonly ignitionToggleUsesOperationalState = true;
  public override readonly transmission: P2HybridTransmission;
  public readonly battery: HybridBattery;
  public readonly motor: ElectricMotor;
  public readonly energyManagement: HybridEnergyManagement;
  public readonly transfer: MechanicalTransferCase;
  private operational = true;
  private pedal = 0;
  private shaftOmega = 0;
  private freeOmega = 0;
  private ratio = 0;
  private wheelOmega = 0;
  private k0Torque = 0;
  private enginePower = 0;
  private clutchLoss = 0;
  private transmissionLoss = 0;
  private electricalLoss = 0;
  private starterPower = 0;
  private auxiliaryPower = 0;
  private propulsionAuthority = 1;
  private creeping = false;
  private pendingStep = 0;
  private usedKWh = 0;
  private recoveredKWh = 0;
  private distanceKm = 0;
  private requestedBrake = 0;
  private regenerationTorque = 0;
  private terminalPower = 0;
  private readonly hatContext: TransmissionContext = { dt: 0, engineAngularVelocity: 0, engineRPM: 0,
    engineRunning: false, engineInertia: .22, idleRPM: 650, stallRPM: 0, redlineRPM: 6400,
    availableEngineTorque: 0, throttle: 0, brake: 0, vehicleSpeed: 0, drivenWheelAngularVelocity: 0 };
  private readonly p2Output: PowertrainOutput = { drivenWheelTorque: 0, frontWheelTorque: 0, rearWheelTorque: 0,
    inputLoadTorque: 0, couplingSlipAngularVelocity: 0, parkingLocked: false, regenerativeWheelTorque: 0 };
  private readonly shaftSource = {
    shaftAngularVelocity: 0, rotationalInertia: .2, requestedDrive: 0, deliveredDriveTorque: 0,
    availableDriveTorque: 0, canDeliverTorque: true, requestDrive: () => {}, updateState: () => {},
  } satisfies DriveTorqueSource;
  public constructor(public override readonly config: P2HybridVehiclePhysicsConfig) {
    super(config);
    this.transmission = new P2HybridTransmission(this.gearbox, config.transmission, config.wheelRadius);
    this.battery = new HybridBattery(config.hybrid, config.ambientTemperature);
    this.motor = new ElectricMotor(config.hybrid.motor, config.ambientTemperature);
    this.energyManagement = new HybridEnergyManagement(config.hybrid);
    this.transfer = new MechanicalTransferCase(config.hybrid.transfer);
  }
  public override get torqueSource(): DriveTorqueSource { return this.shaftSource; }
  public override get vehicleOperational(): boolean { return this.operational; }
  public override get driveAvailable(): boolean { return this.operational && !this.battery.connector &&
    (this.battery.availableDischargePower > 500 || this.engine.isRunning); }
  public override get throttle(): number { return this.pedal; }
  public override get driving(): boolean { return this.transmission.selectedMode === 'D' || this.transmission.selectedMode === 'R'; }
  public override get numericallyValid(): boolean { return super.numericallyValid &&
    Number.isFinite(this.shaftOmega) && Number.isFinite(this.battery.remainingEnergyKWh) && Number.isFinite(this.motor.deliveredDriveTorque); }
  public get axleOutput(): PowertrainOutput { return this.p2Output; }
  public wheelInertiaForAxle(front: boolean): number {
    const share = front ? this.transfer.frontShare : 1 - this.transfer.frontShare;
    return this.motor.rotationalInertia * this.ratio ** 2 * share * .5;
  }
  public setHybridMode(mode: HybridMode, targetSOC?: number): void { this.energyManagement.setMode(mode, targetSOC); }
  public override requestDriveSelector(selector: DriveSelector, speed: number, lateralSpeed: number, brake: number): boolean {
    return this.transmission.requestSelector(selector, speed * this.transfer.ratio, lateralSpeed, brake);
  }
  public requestTransferMode(mode: TransferMode, speed: number, brake: number): boolean {
    return this.transfer.request(mode, speed, this.transmission.selectedMode, brake);
  }
  public connectCharger(type: 'AC' | 'DC', powerW?: number): boolean {
    if (this.operational || this.transmission.selectedMode !== 'P' || Math.abs(this.wheelOmega) > .1) return false;
    this.battery.connect(type, powerW); return true;
  }
  public override requestStart(): boolean {
    if (this.operational || this.battery.connector) return false;
    this.operational = true; return true;
  }
  public override requestStop(): boolean {
    if (!this.operational) return false;
    this.operational = false; this.engine.stop(); this.clutch.reset(0); return true;
  }
  public override reset(state: PowertrainInitialState, recovering = false): void {
    super.reset(state, recovering);
    this.operational = state.vehicleOperational ?? true;
    this.battery.disconnect();
    if (state.ev?.stateOfCharge !== undefined) this.battery.initializeSOC(state.ev.stateOfCharge);
    if (!recovering) {
      this.battery.thermal && (this.battery.thermal.temperature = state.ev?.batteryTemperature ?? this.config.ambientTemperature ?? 20);
      this.motor.thermal && (this.motor.thermal.temperature = state.ev?.rearMotorTemperature ?? this.config.ambientTemperature ?? 20);
      this.usedKWh = this.recoveredKWh = this.distanceKm = 0;
    }
    this.energyManagement.reset();
    if (state.hybrid?.mode) this.energyManagement.setMode(state.hybrid.mode, state.hybrid.holdSOC);
    this.transfer.reset();
    if (state.hybrid?.transferMode) this.transfer.request(state.hybrid.transferMode, 0, 'N', 1);
    if (state.ice?.engineRunning !== true) this.engine.reset(0, false);
    this.clutch.reset(state.ice?.clutchEngagement ?? 0);
    this.motor.reset(); this.shaftOmega = this.freeOmega = state.hybrid?.freeShaftOmega ?? 0;
    this.k0Torque = this.pedal = this.ratio = this.wheelOmega = this.pendingStep = this.terminalPower = 0;
    this.enginePower = this.clutchLoss = this.transmissionLoss = this.electricalLoss = 0;
    this.regenerationTorque = this.requestedBrake = 0;
    this.p2Output.drivenWheelTorque = this.p2Output.frontWheelTorque = this.p2Output.rearWheelTorque = 0;
  }
  public override captureState(previous: PowertrainInitialState = {}): PowertrainInitialState {
    super.captureState(previous);
    previous.ev = { stateOfCharge: this.battery.stateOfCharge, batteryTemperature: this.battery.temperature,
      rearMotorTemperature: this.motor.temperature };
    previous.hybrid = { mode: this.energyManagement.mode, holdSOC: this.energyManagement.holdSOC,
      transferMode: this.transfer.mode, freeShaftOmega: this.freeOmega };
    previous.ice!.currentFuelL = this.fuel.currentFuelL;
    return previous;
  }
  public override applyDriveMode(calibration: DriveModeCalibration): void { super.applyDriveMode(calibration); }
  private transmissionContext(c: PowertrainUpdateContext, torque = 0): TransmissionContext {
    const t = this.hatContext;
    t.dt = c.dt; t.engineAngularVelocity = this.shaftOmega; t.engineRPM = this.shaftOmega * 30 / Math.PI;
    t.engineRunning = this.driveAvailable; t.engineInertia = this.motor.rotationalInertia;
    t.redlineRPM = this.config.engine.redlineRPM; t.availableEngineTorque = torque;
    t.throttle = c.throttle; t.brake = c.brake; t.vehicleSpeed = c.vehicleSpeed * this.transfer.ratio;
    t.vehicleLateralSpeed = c.vehicleLateralSpeed; t.drivenWheelAngularVelocity = this.wheelOmega * this.transfer.ratio;
    t.selectorRequest = c.selectorRequest; t.drivenWheelInertia = c.drivenWheelInertia;
    t.drivenWheelReactionTorque = c.drivenWheelReactionTorque;
    return t;
  }
  public override prepare(c: PowertrainUpdateContext): void {
    this.engine.setFuelAvailable(this.fuel.hasFuel);
    this.pedal = clamp01(c.throttle); this.pendingStep = c.dt;
    const front = c.frontWheelAngularVelocity ?? c.drivenWheelAngularVelocity;
    const rear = c.rearWheelAngularVelocity ?? c.drivenWheelAngularVelocity;
    this.transfer.update(c.dt, front, rear); this.wheelOmega = this.transfer.carrierSpeed(front, rear);
    this.shaftOmega = this.driving ? this.wheelOmega * this.transmission.ratio * this.config.transmission.finalDriveRatio * this.transfer.ratio : this.freeOmega;
    this.transmission.prepare(this.transmissionContext(c));
    this.ratio = this.transmission.ratio * this.config.transmission.finalDriveRatio * this.transfer.ratio;
    this.shaftOmega = this.driving ? this.wheelOmega * this.ratio : this.freeOmega;
    this.motor.setShaftSpeed(this.shaftOmega);
    this.auxiliaryPower = this.operational ? Math.min(this.config.hybrid.auxiliaryPower, this.battery.dischargeLimit(c.dt)) : 0;
    const discharge = Math.max(0, this.battery.dischargeLimit(c.dt) - this.auxiliaryPower - this.config.hybrid.starterPower);
    const motorCapacity = this.motor.driveLimit(discharge * this.config.hybrid.inverterEfficiency);
    const totalCapacity = Math.min(this.config.hybrid.systemTorque,
      this.config.hybrid.systemPower / Math.max(1, Math.abs(this.shaftOmega)), this.engine.getTorqueAtRPM(Math.abs(this.shaftOmega) * 30 / Math.PI) + this.config.hybrid.motor.maxDriveTorque);
    const lowSpeedAuthority = this.transfer.mode === '4L' ? clamp01((this.config.hybrid.transfer.lowMaximumSpeed - Math.abs(c.vehicleSpeed)) / 1.5) : 1;
    this.propulsionAuthority = c.torqueLimitFactor * lowSpeedAuthority;
    const tune = this.config.hybrid.driveability, eta = this.config.transmission.drivetrainEfficiency * this.config.hybrid.transfer.efficiency;
    const held = c.autoHoldHolding || c.parkingBrakeActive || c.brake >= .02;
    this.creeping = !!tune && this.driving && this.pedal < .01 && !held && Math.abs(c.vehicleSpeed) < tune.creepSpeed;
    const acceleration = tune ? this.transfer.mode === '4L' ? tune.lowRangeAcceleration :
      this.energyManagement.mode === 'SPORT' || c.driveMode === 'SPORT' ? tune.sportAcceleration :
      c.driveMode === 'ECO' ? tune.ecoAcceleration : tune.normalAcceleration : 0;
    const force = tune ? (this.config.mass + this.variableMassKg) * (this.creeping ?
      tune.creepAcceleration * clamp01((tune.creepSpeed - Math.abs(c.vehicleSpeed)) / tune.creepSpeed) :
      acceleration * (this.transfer.mode === '4L' ? this.pedal ** 1.5 : this.pedal)) : 0;
    const shaftRequest = tune ? force * this.config.wheelRadius / Math.max(1, Math.abs(this.ratio) * eta) : this.pedal * totalCapacity;
    const demand = this.driving && !held ? Math.min(totalCapacity, shaftRequest) * this.propulsionAuthority : 0;
    const ems = this.energyManagement;
    ems.update({ dt: c.dt, operational: this.operational, connected: this.battery.connector !== null,
      speed: c.vehicleSpeed, demandTorque: demand, shaftOmega: this.shaftOmega, soc: this.battery.stateOfCharge,
      dischargePower: discharge, chargePower: this.battery.chargeLimit(c.dt), brake: c.brake,
      engineRunning: this.engine.isRunning && !this.engine.isStarting, fuelAvailable: this.fuel.hasFuel,
      shifting: this.transmission.isShifting, engineTorqueCapacity: this.engine.availableTorque * (this.thermal?.torqueFactor ?? 1),
      motorTorqueCapacity: motorCapacity, driveMode: c.driveMode, pedal: this.pedal, driving: this.driving });
    if (ems.engineRequested && !this.engine.isRunning && !this.engine.isStarting && this.operational &&
      this.battery.dischargeLimit(c.dt) >= this.config.hybrid.starterPower) this.engine.start();
    if (!ems.engineRequested && (this.engine.isRunning || this.engine.isStarting) && this.clutch.engagement < .01) this.engine.stop();
    const generationRPM = !this.driving && ems.engineRequested ? this.config.hybrid.energyManagement.generationMinimumRPM + 450 : 0;
    const targetOmega = Math.max(this.config.engine.idleRPM, generationRPM, this.shaftOmega * 30 / Math.PI) * Math.PI / 30;
    const speedCorrection = clamp((targetOmega - this.engine.angularVelocity) * this.engine.rotationalInertia * 8, -160, 160);
    // Open K0 uses only the speed governor. Applying propulsion feed-forward
    // before contact would free-rev past the shaft and prevent synchronization.
    const net = Math.max(0, ems.engineTorqueRequest * this.clutch.engagement + speedCorrection + this.config.engine.engineFrictionTorque);
    const engineCommand = ems.engineRequested && (!this.driving || c.brake < .02) ? clamp01(net / Math.max(1, this.engine.availableTorque + this.config.engine.engineFrictionTorque)) : 0;
    this.engine.setTorqueLimitFactor((this.thermal?.torqueFactor ?? 1) * this.propulsionAuthority);
    this.engine.requestDrive(engineCommand, c.dt);
    const slipRPM = Math.abs(this.engine.currentRPM - this.shaftOmega * 30 / Math.PI);
    const launch = this.shaftOmega < this.config.engine.idleRPM * Math.PI / 30;
    const canCouple = this.operational && !this.battery.connector && this.engine.isRunning && !this.engine.isStarting &&
      ems.engineRequested && (!this.driving || !held) && (!this.driving || this.pedal >= .01 || this.creeping) && (slipRPM < this.config.hybrid.energyManagement.synchronizationToleranceRPM ||
        this.clutch.engagement > .2 && slipRPM < 800 || launch);
    this.clutch.update(c.dt, canCouple ? 1 : 0);
    // Hydraulic safety release before service/lift regeneration; ABS must never
    // need to undo already-integrated crank reaction to release the shared shaft.
    if (c.brake > .02 && this.driving) this.clutch.reset(0);
    this.shaftSource.requestedDrive = this.pedal;
    // Save demand; update will subtract ACTUAL K0 torque, never engine potential.
    this.shaftSource.availableDriveTorque = demand;
  }
  public override update(c: PowertrainUpdateContext): PowertrainOutput {
    const h = this.config.hybrid, dt = c.dt;
    const engineOmega = this.engine.angularVelocity, slip = engineOmega - this.shaftOmega;
    const sample = this.engine.getTorqueSample();
    const k0Context = this.transmissionContext(c);
    k0Context.engineInertia = this.engine.rotationalInertia;
    if (!this.driving) { k0Context.drivenWheelInertia = this.motor.rotationalInertia; k0Context.drivenWheelReactionTorque = -this.motor.deliveredDriveTorque; }
    const capacity = this.config.clutch.maxTorque * this.clutch.engagement ** this.config.clutch.torqueCapacityExponent;
    this.k0Torque = clamp(implicitClutchDemand(sample.netCrankTorque, slip, this.config.clutch.couplingStiffness,
      k0Context, this.driving ? this.ratio : 1, this.config.transmission.drivetrainEfficiency), -capacity, capacity);
    if (!this.engine.isRunning || this.battery.connector) this.k0Torque = 0;
    const demand = this.shaftSource.availableDriveTorque;
    const availableDischarge = Math.max(0, this.battery.dischargeLimit(dt) - this.auxiliaryPower - (this.engine.isStarting ? h.starterPower : 0));
    this.starterPower = this.engine.isStarting ? Math.min(h.starterPower, this.battery.dischargeLimit(dt) - this.auxiliaryPower) : 0;
    const copper = h.motor.copperLossAtMaxTorque ?? 0;
    const driveLimit = this.motor.driveLimit(Math.max(0, availableDischarge * h.inverterEfficiency - copper)) * this.propulsionAuthority;
    const regenLimit = this.motor.regenLimit(this.battery.chargeLimit(dt) / h.inverterEfficiency);
    this.requestedBrake = this.driving ? c.totalServiceBrakeTorque ?? 0 : 0;
    const fade = clamp01((Math.abs(c.vehicleSpeed) - h.regen.minimumSpeed) / (h.regen.fullSpeed - h.regen.minimumSpeed));
    const eta = this.config.transmission.drivetrainEfficiency * h.transfer.efficiency;
    const ratio = Math.abs(this.ratio);
    const brakeMotor = this.requestedBrake * eta / Math.max(1, ratio) * fade;
    const coastTorque = h.driveability ? (this.config.mass + this.variableMassKg) * h.driveability.coastDeceleration *
      this.config.wheelRadius * eta / Math.max(1, ratio) : h.regen.liftTorque;
    const liftMotor = this.driving && !this.creeping && this.clutch.engagement < .01 && c.throttle < .01 && c.brake < .02 ? coastTorque * fade : 0;
    let target = this.driving ? demand / Math.max(.1, this.transmission.torqueFactor) - this.k0Torque : 0;
    if (!this.driving && this.energyManagement.generationPowerRequest > 0)
      target = -Math.min(this.energyManagement.generationPowerRequest / Math.max(1, this.shaftOmega), Math.max(0, this.k0Torque));
    // Only the connected ICE's measured surplus can fund in-drive generation.
    if (target < 0 && this.requestedBrake < 1 && liftMotor <= 0)
      target = -Math.min(-target, this.energyManagement.generationPowerRequest / Math.max(1, Math.abs(this.shaftOmega)));
    if (brakeMotor > 0 || liftMotor > 0) target = -Math.sign(this.shaftOmega || 1) * Math.max(brakeMotor, liftMotor);
    if (!this.driveAvailable || this.battery.connector || this.driving && (c.autoHoldHolding || c.parkingBrakeActive && c.throttle < .1)) target = 0;
    this.motor.requestTorque(clamp(target, -regenLimit, driveLimit)); this.motor.updateState(dt, 0);
    this.motor.limitTorque(driveLimit, regenLimit, 1);
    if (!this.driveAvailable || this.battery.connector) this.motor.scaleTorque(0);
    // Do not allow a delayed positive motor tail to defeat service braking.
    if (c.brake > .02 && this.motor.deliveredDriveTorque > 0) this.motor.scaleTorque(0);
    const total = this.k0Torque + this.motor.deliveredDriveTorque;
    const limitedTotal = Math.min(total, h.systemTorque, h.systemPower / Math.max(1, Math.abs(this.shaftOmega)));
    if (limitedTotal < total) this.motor.deliveredDriveTorque -= Math.min(total - limitedTotal, Math.max(0, this.motor.deliveredDriveTorque));
    const input = this.k0Torque + this.motor.deliveredDriveTorque;
    const transmission = this.transmission.update(this.transmissionContext(c, input));
    this.p2Output.drivenWheelTorque = transmission.drivenWheelTorque * this.transfer.ratio * (input * this.shaftOmega >= 0 ? h.transfer.efficiency : 1 / h.transfer.efficiency);
    this.p2Output.inputLoadTorque = this.k0Torque;
    this.p2Output.couplingSlipAngularVelocity = slip;
    this.p2Output.parkingLocked = transmission.parkingLocked;
    this.regenerationTorque = this.driving && this.p2Output.drivenWheelTorque * c.vehicleSpeed < 0 ? Math.abs(this.p2Output.drivenWheelTorque) : 0;
    this.publishAxles();
    const beforeFuel = this.fuel.currentFuelL;
    const rpm = this.engine.currentRPM, throttle = this.engine.throttle;
    this.engine.updateState(dt, this.k0Torque);
    this.fuel.update(dt, rpm, throttle, this.engine.lastTorqueSample, c.vehicleSpeed, c.vehicleLateralSpeed);
    this.p2Output.consumedFuelL = beforeFuel - this.fuel.currentFuelL;
    this.engine.setFuelAvailable(this.fuel.hasFuel);
    if (!this.driving) this.freeOmega = Math.max(0, this.freeOmega + input / this.motor.rotationalInertia * dt);
    else this.freeOmega = this.shaftOmega;
    this.enginePower = (this.engine.lastTorqueSample?.netCrankTorque ?? 0) * engineOmega;
    this.clutchLoss = Math.max(0, this.k0Torque * slip);
    this.transmissionLoss = Math.max(0, input * this.shaftOmega - this.p2Output.drivenWheelTorque * this.wheelOmega);
    this.shaftSource.shaftAngularVelocity = this.shaftOmega;
    this.shaftSource.rotationalInertia = this.motor.rotationalInertia;
    this.shaftSource.deliveredDriveTorque = input;
    this.shaftSource.availableDriveTorque = input;
    return this.p2Output;
  }
  private publishAxles(): void {
    this.p2Output.frontWheelTorque = this.p2Output.drivenWheelTorque * this.transfer.frontShare;
    this.p2Output.rearWheelTorque = this.p2Output.drivenWheelTorque * (1 - this.transfer.frontShare);
    this.p2Output.regenerativeWheelTorque = this.regenerationTorque;
  }
  public limitAxleRegeneration(front: number, rear: number): void {
    const share = this.transfer.frontShare;
    this.limitRegeneration(Math.min(share > .001 ? front / share : Infinity, share < .999 ? rear / (1 - share) : Infinity));
  }
  public limitRegeneration(maximum: number): number {
    if (this.regenerationTorque > 0) {
      const factor = clamp01(maximum / this.regenerationTorque);
      // Shared input motor: either axle ABS can cut the entire regeneration path.
      this.motor.scaleTorque(factor);
      this.p2Output.drivenWheelTorque *= factor;
      this.regenerationTorque *= factor; this.publishAxles();
    }
    return this.p2Output.drivenWheelTorque;
  }
  public override get shaftRegenerating(): boolean { return false; }
  public override finishStep(speed: number): void {
    const dt = this.pendingStep; if (dt <= 0) return;
    const h = this.config.hybrid;
    const torque = this.motor.deliveredDriveTorque, mechanical = torque * this.shaftOmega;
    this.transmissionLoss = this.driving ? Math.max(0, (this.k0Torque + torque) * this.shaftOmega -
      this.p2Output.drivenWheelTorque * this.wheelOmega) : 0;
    const efficiency = this.motor.efficiency(torque, mechanical < 0) * h.inverterEfficiency;
    const copper = (h.motor.copperLossAtMaxTorque ?? 0) * (torque / h.motor.maxDriveTorque) ** 2;
    const motorElectrical = mechanical >= 0 ? mechanical / efficiency + copper : mechanical * efficiency + copper;
    this.electricalLoss = Math.max(0, motorElectrical - mechanical);
    this.terminalPower = this.battery.step(dt, motorElectrical + this.auxiliaryPower + this.starterPower, speed,
      !this.operational && this.transmission.selectedMode === 'P');
    this.motor.thermal?.integrate(dt, this.electricalLoss, speed);
    this.thermal?.update(dt, (this.engine.lastTorqueSample?.combustionTorque ?? 0) * this.engine.angularVelocity,
      speed, this.config.ambientTemperature ?? 20);
    this.usedKWh += Math.max(0, this.terminalPower) * dt / 3_600_000;
    if (!this.battery.connector) this.recoveredKWh += Math.max(0, -this.terminalPower) * dt / 3_600_000;
    this.distanceKm += Math.abs(speed) * dt / 1000;
    this.pendingStep = 0;
  }
  public override getSnapshot(): ICEPowertrainSnapshot & { hybrid: HybridTelemetry; ev: EVTelemetry } {
    const base = super.getSnapshot(), motorPower = this.motor.deliveredDriveTorque * this.shaftOmega;
    base.kind = 'P2_PHEV';
    base.ice.automaticEngineStop = this.operational && this.fuel.hasFuel && !this.energyManagement.engineRequested;
    base.ice.clutchEngagement = this.clutch.engagement;
    base.ice.clutchPedal = 1 - this.clutch.engagement;
    const hybrid: HybridTelemetry = { mode: this.energyManagement.mode, state: this.energyManagement.state,
      holdSOC: this.energyManagement.holdSOC, engineRequested: this.energyManagement.engineRequested,
      enginePhase: this.engine.ignitionPhase, clutchEngagement: this.clutch.engagement,
      clutchSlipRPM: this.p2Output.couplingSlipAngularVelocity * 30 / Math.PI, clutchTorque: this.k0Torque,
      enginePowerW: this.enginePower, motorPowerW: motorPower, generationPowerW: Math.max(0, -motorPower),
      wheelPowerW: this.p2Output.drivenWheelTorque * this.wheelOmega,
      clutchLossW: this.clutchLoss, transmissionLossW: this.transmissionLoss, electricalLossW: this.electricalLoss,
      battery: this.battery.getSnapshot(), transfer: this.transfer.getSnapshot() };
    const ev: EVTelemetry = { stateOfCharge: this.battery.stateOfCharge, remainingEnergyKWh: this.battery.remainingEnergyKWh,
      batteryPowerKw: this.terminalPower / 1000, motorRPM: this.shaftOmega * 30 / Math.PI, motorTorque: this.motor.deliveredDriveTorque,
      drivePowerKw: Math.max(0, motorPower) / 1000, regenPowerKw: Math.max(0, -motorPower) / 1000,
      regenBrakeLight: this.regenerationTorque / this.config.wheelRadius / this.config.mass > 1.3,
      regenLimited: this.battery.availableChargePower < this.config.hybrid.motor.maxRegenPower,
      regenLimitReason: this.battery.availableChargePower < 100 ? 'BATTERY' : null,
      tripEnergyConsumedKWh: this.usedKWh, tripEnergyRecoveredKWh: this.recoveredKWh,
      averageConsumptionKWhPer100km: this.distanceKm > .1 ? this.usedKWh / this.distanceKm * 100 : null,
      estimatedRangeKm: this.battery.remainingEnergyKWh / 32 * 100, requestedBrakeTorque: this.requestedBrake,
      regenerativeBrakeTorque: this.regenerationTorque, batteryTemperature: this.battery.temperature,
      rearMotorTemperature: this.motor.temperature, packVoltage: this.battery.voltage, packCurrent: this.battery.current,
      availableDischargePower: this.battery.availableDischargePower, availableRegenPower: this.battery.availableChargePower };
    return { ...base, hybrid, ev };
  }
}
