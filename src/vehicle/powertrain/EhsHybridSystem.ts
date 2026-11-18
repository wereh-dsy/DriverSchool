import type { DriveSelector, Gear } from '../config';
import type { EhsDriverMode, EhsHybridVehiclePhysicsConfig } from '../config/EhsHybridConfig';
import { clamp01 } from '../physics/math';
import { ICEPowertrain, type ICEPowertrainSnapshot } from './ICEPowertrain';
import { ElectricMotor } from './ElectricMotor';
import { HybridBattery } from './HybridBattery';
import { smoothLimit } from './EVThermalState';
import { EhsEnergyManagement } from './EhsEnergyManagement';
import { EhsTransmission } from '../transmission/EhsTransmission';
import type { EVTelemetry, PowertrainInitialState, PowertrainOutput, PowertrainUpdateContext } from './Powertrain';

export interface EhsTelemetry {
  mode: EhsDriverMode; path: 'EV' | 'SERIES' | 'PARALLEL'; state: 'EV' | 'SERIES' | 'PARALLEL' | 'DIRECT';
  holdSOC: number; engineRequested: boolean; enginePhase: string; targetRPM: number;
  directClutch: { engagement: number; torqueNm: number; slipRPM: number };
  enginePowerW: number; p1MechanicalPowerW: number; p1GenerationPowerW: number; p1RPM: number;
  p3MechanicalPowerW: number; p3DCPowerW: number; p3RPM: number; wheelPowerW: number;
  busPowerW: number; battery: ReturnType<HybridBattery['getSnapshot']>;
  p1TemperatureC: number; p3TemperatureC: number;
  losses: { electricalW: number; transmissionW: number; clutchW: number; batteryW: number;
    fuelW: number; frictionW: number; auxiliaryW: number; chargerW: number };
  energy: { residualW: number; residualJ: number; fuelJ: number; batteryJ: number; gridJ: number;
    wheelJ: number; lossesJ: number; rotorJ: number };
}

/** P1 is on the crank; P3 is on the front axle through its own permanent reduction.
 * ICEPowertrain supplies Engine/FuelSystem lifecycle and existing audio telemetry ONLY.
 * Its clutch/gearbox/update are never used to transmit EHS torque. No P2/K0 path. */
export class EhsHybridSystem extends ICEPowertrain {
  public override readonly transmission: EhsTransmission;
  public readonly ignitionToggleUsesOperationalState = true;
  public readonly battery: HybridBattery;
  public readonly p1: ElectricMotor;
  public readonly p3: ElectricMotor;
  public readonly energyManagement: EhsEnergyManagement;
  private operational = true;
  private pedal = 0;
  private wheelOmega = 0;
  private ehsStepDt = 0;
  private demandNm = 0;
  private directNm = 0;
  private engagement = 0;
  private generatorNm = 0;
  private starterNm = 0;
  private omegaBefore = 0;
  private meanOmega = 0;
  private p1DC = 0;
  private p3DC = 0;
  private auxiliaryW = 0;
  private regenerationNm = 0;
  private requestedBrakeNm = 0;
  private usedKWh = 0;
  private recoveredKWh = 0;
  private distanceKm = 0;
  private terminalW = 0;
  private engineW = 0;
  private motorWheelNm = 0;
  private previousDirectWheelNm = 0;
  private previousRoadOmega = 0;
  private roadSpeedValid = false;
  private readonly losses = { electricalW: 0, transmissionW: 0, clutchW: 0, batteryW: 0,
    fuelW: 0, frictionW: 0, auxiliaryW: 0, chargerW: 0 };
  private readonly energy = { residualW: 0, residualJ: 0, fuelJ: 0, batteryJ: 0, gridJ: 0,
    wheelJ: 0, lossesJ: 0, rotorJ: 0 };
  private readonly ehsOutput: PowertrainOutput = { drivenWheelTorque: 0, frontWheelTorque: 0,
    rearWheelTorque: 0, regenerativeWheelTorque: 0, inputLoadTorque: 0,
    couplingSlipAngularVelocity: 0, parkingLocked: true, consumedFuelL: 0 };

  public constructor(public override readonly config: EhsHybridVehiclePhysicsConfig) {
    const transmission = new EhsTransmission(config.ehs.reduction);
    super({ ...config, engine: { ...config.engine, engineInertia: config.engine.engineInertia + config.ehs.p1.rotationalInertia } }, transmission);
    const h = config.ehs;
    this.transmission = transmission;
    this.battery = new HybridBattery(h, config.ambientTemperature);
    this.p1 = new ElectricMotor(h.p1, config.ambientTemperature);
    this.p3 = new ElectricMotor(h.p3, config.ambientTemperature);
    this.energyManagement = new EhsEnergyManagement(h);
  }
  public override get torqueSource(): ElectricMotor { return this.p3; }
  public override get vehicleOperational(): boolean { return this.operational; }
  public override get driveAvailable(): boolean {
    return this.operational && !this.battery.connector &&
      (this.battery.availableDischargePower > 500 || this.engine.isRunning);
  }
  public override get throttle(): number { return this.pedal; }
  public override get gear(): Gear { return this.transmission.selectedMode === 'R' ? 'R' : this.driving ? 1 : 'N'; }
  public override get supportsManualSelection(): boolean { return false; }
  public override get driving(): boolean { return this.transmission.selectedMode === 'D' || this.transmission.selectedMode === 'R'; }
  public override get numericallyValid(): boolean {
    return [this.engine.currentRPM, this.battery.remainingEnergyKWh, this.p3.deliveredDriveTorque,
      this.energy.residualJ, this.directNm].every(Number.isFinite);
  }
  public get axleOutput(): PowertrainOutput { return this.ehsOutput; }
  public get drivenWheelInertia(): number { return this.p3.rotationalInertia * this.config.ehs.reduction.ratio ** 2 / 2; }
  public wheelInertiaForAxle(front: boolean): number { return front ? this.drivenWheelInertia : 0; }
  public setHybridMode(mode: EhsDriverMode, targetSOC?: number): void { this.energyManagement.setMode(mode, targetSOC); }
  public connectCharger(type: 'AC' | 'DC', powerW?: number): boolean {
    if (this.operational || this.transmission.selectedMode !== 'P' || Math.abs(this.wheelOmega) > .1) return false;
    this.battery.connect(type, powerW); return true;
  }
  public override requestDriveSelector(mode: DriveSelector, speed: number, lateral: number, brake: number): boolean {
    if (this.battery.connector && mode !== 'P') return false;
    return this.transmission.requestSelector(mode, speed, lateral, brake);
  }
  public override requestStart(): boolean {
    if (this.operational || this.battery.connector) return false;
    this.operational = true; return true;
  }
  public override requestStop(): boolean {
    if (!this.operational) return false;
    this.operational = false; this.engine.stop(); this.engagement = this.directNm = 0; return true;
  }
  public override reset(s: PowertrainInitialState, recovering = false): void {
    super.reset(s, recovering);
    this.operational = s.vehicleOperational ?? true;
    this.battery.disconnect(); this.battery.initializeSOC(s.ev?.stateOfCharge ?? this.config.ehs.battery.defaultStateOfCharge);
    this.engine.reset(s.ice?.engineRPM ?? 0, s.ice?.engineRunning ?? false);
    this.transmission.reset(undefined, s.driveSelector ?? 'P');
    this.energyManagement.reset();
    this.energyManagement.setMode(s.ehs?.mode ?? this.config.ehs.defaultMode, s.ehs?.holdSOC);
    this.p1.reset(); this.p3.reset();
    if (!recovering) {
      if (this.battery.thermal) this.battery.thermal.temperature = s.ev?.batteryTemperature ?? this.config.ambientTemperature ?? 20;
      if (this.p1.thermal) this.p1.thermal.temperature = s.ehs?.p1TemperatureC ?? this.config.ambientTemperature ?? 20;
      if (this.p3.thermal) this.p3.thermal.temperature = s.ev?.frontMotorTemperature ?? this.config.ambientTemperature ?? 20;
      this.usedKWh = this.recoveredKWh = this.distanceKm = 0;
      for (const k of Object.keys(this.energy) as (keyof typeof this.energy)[]) this.energy[k] = 0;
    }
    this.pedal = this.wheelOmega = this.ehsStepDt = this.demandNm = this.directNm = this.engagement = 0;
    this.generatorNm = this.starterNm = this.omegaBefore = this.meanOmega = this.p1DC = this.p3DC = this.auxiliaryW = 0;
    this.terminalW = this.engineW = this.motorWheelNm = this.regenerationNm = this.requestedBrakeNm = 0;
    this.previousDirectWheelNm = 0;
    this.previousRoadOmega = 0; this.roadSpeedValid = false;
    for (const k of Object.keys(this.losses) as (keyof typeof this.losses)[]) this.losses[k] = 0;
    this.refreshOutput();
  }
  public override captureState(previous: PowertrainInitialState = {}): PowertrainInitialState {
    super.captureState(previous);
    previous.driveSelector = this.transmission.selectedMode;
    previous.ice!.currentFuelL = this.fuel.currentFuelL;
    previous.ev = { stateOfCharge: this.battery.stateOfCharge, batteryTemperature: this.battery.temperature,
      frontMotorTemperature: this.p3.temperature };
    previous.ehs = { mode: this.energyManagement.mode, holdSOC: this.energyManagement.holdSOC,
      p1TemperatureC: this.p1.temperature };
    return previous;
  }
  public override prepare(c: PowertrainUpdateContext): void {
    this.pedal = clamp01(c.throttle);
    if (c.selectorRequest) this.requestDriveSelector(c.selectorRequest, c.vehicleSpeed, c.vehicleLateralSpeed, c.brake);
  }
  /** DC includes copper, inverter and bus losses in both directions. */
  private electrical(motor: ElectricMotor, torque: number, omega: number): number {
    const mechanical = torque * omega, h = this.config.ehs;
    const eta = motor.efficiency(torque, mechanical < 0) * h.inverterEfficiency * h.busEfficiency;
    const copper = (motor.config.copperLossAtMaxTorque ?? 0) * (torque / motor.config.maxDriveTorque) ** 2;
    return (mechanical >= 0 ? mechanical / eta : mechanical * eta) + copper;
  }
  private constrainP3(dischargeW: number, chargeW: number): void {
    const original = this.p3.deliveredDriveTorque, omega = this.p3.shaftAngularVelocity;
    const power = this.electrical(this.p3, original, omega);
    if (power <= dischargeW && power >= -chargeW) return;
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2, p = this.electrical(this.p3, original * mid, omega);
      if (p > dischargeW || p < -chargeW) hi = mid; else lo = mid;
    }
    this.p3.scaleTorque(lo);
  }
  public override update(c: PowertrainUpdateContext): PowertrainOutput {
    const dt = c.dt, h = this.config.ehs, e = this.engine, em = this.energyManagement;
    if (!Number.isFinite(dt) || dt <= 0) return this.ehsOutput;
    this.ehsStepDt = dt;
    this.wheelOmega = c.frontWheelAngularVelocity ?? c.drivenWheelAngularVelocity;
    this.p3.setShaftSpeed(this.wheelOmega * h.reduction.ratio);
    const direction = this.transmission.selectedMode === 'R' ? -1 : 1;
    const held = c.autoHoldHolding || c.parkingBrakeActive && this.pedal < .1;
    const braking = c.brake >= .02;
    const driving = this.driving && this.driveAvailable && !held;
    const maximumDemand = (this.config.mass + this.variableMassKg) * h.control.acceleration * this.config.wheelRadius;
    let target = driving && !braking ? this.pedal * maximumDemand : 0;
    if (driving && !braking && this.pedal < .01 && h.reduction.creepEnabled)
      target = h.reduction.creepTorque * h.reduction.ratio * clamp01(1 - Math.abs(c.vehicleSpeed) / h.reduction.creepSpeed);
    if (direction < 0 && Math.abs(c.vehicleSpeed) > h.reduction.reverseSpeedLimit) target = 0;
    this.demandNm += (target - this.demandNm) * -Math.expm1(-h.control.torqueResponse * dt);
    if (!driving || braking) this.demandNm = 0;
    const roadOmega = Math.max(0, this.wheelOmega * h.directDrive.ratio);
    const roadAcceleration = this.roadSpeedValid ? (roadOmega - this.previousRoadOmega) / dt : 0;
    this.previousRoadOmega = roadOmega; this.roadSpeedValid = true;
    const demandW = this.demandNm * Math.max(1, Math.abs(this.wheelOmega));
    // Leave a sub-millilitre unusable remainder rather than funding even one
    // final combustion tick with less chemical energy than its possible work.
    const usableFuel = this.fuel.currentFuelL * this.config.fuel.fuelDensity * 43200000 >
      this.config.engine.ratedNetPowerW! / .12 * dt;
    em.update(dt, this.battery.stateOfCharge, demandW, roadOmega * 30 / Math.PI, this.pedal,
      this.operational && !this.battery.connector && usableFuel,
      driving && direction > 0 && !braking && this.wheelOmega > 0, this.battery.availableDischargePower);
    e.setFuelAvailable(usableFuel);
    if (em.engineRequested && !e.isRunning && !e.isStarting && this.battery.dischargeLimit(dt) > 1500) e.start(true);
    if (!em.engineRequested && (e.isRunning || e.isStarting)) e.stop();
    this.auxiliaryW = this.operational && !this.battery.connector ? Math.min(h.auxiliaryPower, this.battery.dischargeLimit(dt)) : 0;
    this.omegaBefore = e.angularVelocity;
    this.p1.setShaftSpeed(this.omegaBefore);
    this.starterNm = e.ignitionPhase === 'CRANKING' ? Math.min(h.p1.maxDriveTorque * this.p1.thermalCapability,
      this.p1.availablePower / Math.max(20, this.omegaBefore),
      (Math.max(0, this.battery.dischargeLimit(dt) - this.auxiliaryW) - 300) * .8 / Math.max(20, this.omegaBefore)) : 0;
    this.starterNm = Math.max(0, this.starterNm);
    e.externalShaftTorque = this.starterNm;
    const directRequest = Math.min(this.demandNm / (h.directDrive.ratio * h.directDrive.efficiency), h.directDrive.capacityNm) *
      clamp01(c.frontTorqueLimitFactor ?? c.torqueLimitFactor);
    // A requested parallel path is still physically SERIES until the clutch
    // carries torque. Keep P1 available through synchronization: its physical
    // load can recover crank kinetic energy and bring RPM down to the road
    // shaft instead of leaving the engine to coast down on friction alone.
    const electricalDriveShare = em.path === 'SERIES' ? 1 : em.path === 'PARALLEL' ? 1 - this.engagement : 0;
    const generationRequestW = demandW / .86 * electricalDriveShare + em.chargeRequestW;
    const requestedGenNm = Math.min(h.p1.maxRegenTorque * this.p1.thermalCapability,
      h.p1.maxRegenPower * this.p1.thermalCapability / Math.max(1, this.omegaBefore),
      generationRequestW / .87 / Math.max(1, this.omegaBefore));
    const targetOmega = em.targetRPM * Math.PI / 30 + (em.path === 'PARALLEL' ? 3 : 0);
    const feedforward = (em.path === 'PARALLEL' ? directRequest * this.engagement : 0) + requestedGenNm;
    const frictionFeedforward = this.config.engine.engineFrictionTorque;
    const throttle = e.isRunning ? clamp01((feedforward + frictionFeedforward + (targetOmega - this.omegaBefore) * .85) /
      Math.max(1, e.getTorqueAtRPM(e.currentRPM) + frictionFeedforward)) : 0;
    e.setTorqueLimitFactor(this.thermal?.torqueFactor ?? 1); e.updateThrottle(throttle, dt);
    const sample = e.getTorqueSample(), net = sample.netCrankTorque;
    const synchronized = Math.abs(e.currentRPM - roadOmega * 30 / Math.PI) < h.directDrive.synchronizationRPM;
    const close = em.path === 'PARALLEL' && e.ignitionPhase === 'RUNNING' && driving && direction > 0;
    if (close && (synchronized || this.engagement > 0)) this.engagement = Math.min(1, this.engagement + dt / h.directDrive.engagementSeconds);
    else this.engagement = Math.max(0, this.engagement - dt / .15);
    if (!close) this.engagement = 0;
    // Backward-Euler friction response against the observed moving road shaft.
    // Reserve crank/P1 inertia torque as the road accelerates; transferring all
    // net crank torque would leave RPM behind the road and chatter the clutch.
    const stiffness = h.directDrive.couplingStiffness;
    const clutchDemand = stiffness * (this.omegaBefore - roadOmega + dt *
      (net / e.rotationalInertia - roadAcceleration)) / (1 + stiffness * dt / e.rotationalInertia);
    this.directNm = close ? Math.min(directRequest, h.directDrive.capacityNm * this.engagement,
      Math.max(0, clutchDemand),
      Math.max(0, net + (this.omegaBefore - roadOmega) * e.rotationalInertia / dt)) : 0;
    const safeOmega = Math.max(this.config.engine.idleRPM * .9, 800) * Math.PI / 30;
    this.generatorNm = e.isRunning && em.engineRequested ? Math.min(requestedGenNm,
      Math.max(0, net - this.directNm - (targetOmega - this.omegaBefore) * e.rotationalInertia * 4),
      Math.max(0, net - this.directNm + (this.omegaBefore - safeOmega) * e.rotationalInertia / dt)) : 0;
    if (this.directNm > 0) this.generatorNm = Math.min(this.generatorNm,
      Math.max(0, net - this.directNm + (this.omegaBefore - roadOmega) * e.rotationalInertia / dt));
    const potentialGenW = this.generatorNm * Math.max(0, this.omegaBefore - 8) * .85;
    const starterReserve = this.starterNm * Math.max(10, this.omegaBefore + this.starterNm / e.rotationalInertia * dt / 2) / .8 + (this.starterNm ? 300 : 0);
    const dischargeW = Math.max(0, this.battery.dischargeLimit(dt) + potentialGenW - this.auxiliaryW - starterReserve);
    const directWheel = this.directNm * h.directDrive.ratio * h.directDrive.efficiency;
    const driveLimit = this.p3.driveLimit(Math.max(0, dischargeW - (h.p3.copperLossAtMaxTorque ?? 0))) *
      clamp01(c.frontTorqueLimitFactor ?? c.torqueLimitFactor);
    const chargeW = this.battery.chargeLimit(dt) + this.auxiliaryW;
    const regenLimit = this.p3.regenLimit(chargeW);
    this.requestedBrakeNm = this.driving ? c.totalServiceBrakeTorque ?? 0 : 0;
    const fade = clamp01((Math.abs(c.vehicleSpeed) - h.control.regenMinimumSpeed) /
      (h.control.regenFullSpeed - h.control.regenMinimumSpeed));
    const service = this.requestedBrakeNm > 1 && (braking || this.pedal < .01);
    const lift = this.pedal < .01 && target < 1 && !service ? h.control.liftRegenWheelNm : 0;
    const brakeMotor = Math.max(service ? c.frontAxleBrakeTorque ?? c.drivenAxleBrakeTorque ?? this.requestedBrakeNm * .65 : 0, lift) *
      h.reduction.efficiency / h.reduction.ratio * fade;
    let motorRequest = direction * Math.max(0, this.demandNm - directWheel) / (h.reduction.ratio * h.reduction.efficiency);
    if (service || lift > 0) motorRequest = -Math.sign(this.wheelOmega) * Math.min(brakeMotor, regenLimit);
    this.p3.requestTorque(driving ? motorRequest : 0); this.p3.updateState(dt, 0);
    // Existing pedal/motor response stays in place; P3 fills only the change in
    // the mechanical branch, before all electrical/traction safety limits.
    if (driving && !service && lift === 0 && direction > 0) {
      const fill = Math.max(0, this.previousDirectWheelNm - directWheel) /
        (h.reduction.ratio * h.reduction.efficiency);
      // Reduce P3 only when the requested total is met. A power-limited P3
      // must retain its actual output while mechanical assistance builds.
      this.p3.deliveredDriveTorque = Math.max(0, Math.min(motorRequest, this.p3.deliveredDriveTorque + fill));
    }
    this.p3.limitTorque(driveLimit, regenLimit, direction);
    if (!driving || braking && this.p3.deliveredDriveTorque * direction > 0) this.p3.scaleTorque(0);
    this.constrainP3(dischargeW, chargeW);
    this.p3DC = this.electrical(this.p3, this.p3.deliveredDriveTorque, this.p3.shaftAngularVelocity);
    // P1 can feed P3 and charge the ONE pack, never two separate battery budgets.
    const maximumGenDC = Math.max(0, this.p3DC + this.auxiliaryW + this.battery.chargeLimit(dt));
    this.generatorNm = Math.min(this.generatorNm, maximumGenDC / Math.max(1, this.omegaBefore) / .96);
    e.updateState(dt, this.generatorNm + this.directNm);
    this.meanOmega = (this.omegaBefore + e.angularVelocity) / 2;
    if (this.directNm > 0 && this.meanOmega < roadOmega) {
      const old = this.directNm;
      this.directNm = Math.max(0, old + 2 * (this.meanOmega - roadOmega) * e.rotationalInertia / dt);
      e.currentRPM += (old - this.directNm) * dt / e.rotationalInertia * 30 / Math.PI;
      this.meanOmega = (this.omegaBefore + e.angularVelocity) / 2;
      if (driving && !service) this.p3.deliveredDriveTorque += (old - this.directNm) * h.directDrive.ratio *
        h.directDrive.efficiency / (h.reduction.ratio * h.reduction.efficiency);
    }
    this.p1DC = this.electrical(this.p1, this.starterNm - this.generatorNm, this.meanOmega);
    this.p3.limitTorque(driveLimit, regenLimit, direction);
    this.constrainP3(Math.max(0, this.battery.dischargeLimit(dt) - this.p1DC - this.auxiliaryW), chargeW);
    this.previousDirectWheelNm = this.directNm * h.directDrive.ratio * h.directDrive.efficiency;
    this.refreshOutput();
    return this.ehsOutput;
  }
  private refreshOutput(): void {
    const h = this.config.ehs, p = this.ehsOutput;
    this.motorWheelNm = this.transmission.reduction.update(this.wheelOmega, this.p3.deliveredDriveTorque);
    const directWheel = this.directNm * h.directDrive.ratio * h.directDrive.efficiency;
    p.drivenWheelTorque = p.frontWheelTorque = this.motorWheelNm + directWheel; p.rearWheelTorque = 0;
    this.regenerationNm = this.p3.deliveredDriveTorque * this.wheelOmega < 0 ? Math.abs(this.motorWheelNm) : 0;
    p.regenerativeWheelTorque = this.regenerationNm; p.inputLoadTorque = this.directNm;
    p.couplingSlipAngularVelocity = this.engagement ? this.meanOmega - this.wheelOmega * h.directDrive.ratio : 0;
    p.parkingLocked = this.transmission.selectedMode === 'P';
    this.transmission.wheelTorque = p.drivenWheelTorque; this.transmission.engineTorque = this.directNm;
    this.transmission.engineRPM = this.engine.currentRPM; this.transmission.engagement = this.engagement;
  }
  public limitRegeneration(maximumWheelTorque: number): number {
    const h = this.config.ehs;
    this.p3.constrainRegeneration(Math.max(0, maximumWheelTorque) * h.reduction.efficiency / h.reduction.ratio);
    this.refreshOutput(); return this.ehsOutput.drivenWheelTorque;
  }
  public limitAxleRegeneration(front: number, _rear: number): void { this.limitRegeneration(front); }
  public override get shaftRegenerating(): boolean { return false; }
  public override cancelShaftRegeneration(): number { return this.ehsOutput.drivenWheelTorque; }
  public override finishStep(speed: number): void {
    const dt = this.ehsStepDt; if (dt <= 0) return;
    const h = this.config.ehs, e = this.engine;
    this.p3DC = this.electrical(this.p3, this.p3.deliveredDriveTorque, this.p3.shaftAngularVelocity);
    const maximumGeneration = Math.max(0, this.p3DC + this.auxiliaryW + this.battery.chargeLimit(dt));
    // ABS may have removed P3 recovery in this same tick. Curtail P1, returning
    // its unused impulse to the crank before integrating battery energy/fuel.
    if (this.generatorNm > 0 && -this.p1DC > maximumGeneration) {
      const original = this.generatorNm, originalEnd = e.angularVelocity;
      let lo = 0, hi = original;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2, end = originalEnd + (original - mid) * dt / e.rotationalInertia;
        const dc = this.electrical(this.p1, -mid, (this.omegaBefore + end) / 2);
        if (-dc > maximumGeneration) hi = mid; else lo = mid;
      }
      this.generatorNm = lo;
      e.currentRPM += (original - lo) * dt / e.rotationalInertia * 30 / Math.PI;
      this.meanOmega = (this.omegaBefore + e.angularVelocity) / 2;
    }
    this.p1DC = this.electrical(this.p1, this.starterNm - this.generatorNm, this.meanOmega);
    const energyBefore = this.battery.remainingEnergyKWh, fuelBefore = this.fuel.currentFuelL;
    this.terminalW = this.battery.step(dt, this.p3DC + this.p1DC + this.auxiliaryW, speed,
      !this.operational && this.transmission.selectedMode === 'P');
    this.fuel.update(dt, this.meanOmega * 30 / Math.PI, e.throttle, e.lastTorqueSample, speed, 0);
    const burned = fuelBefore - this.fuel.currentFuelL;
    this.ehsOutput.consumedFuelL = burned;
    const fuelW = burned * this.config.fuel.fuelDensity * 43200000 / dt;
    const rotorW = e.rotationalInertia * (e.angularVelocity ** 2 - this.omegaBefore ** 2) / (2 * dt);
    const s = e.lastTorqueSample;
    const combustionW = s ? (s.combustionTorque + s.idleControlTorque + s.revHangTorque) * this.meanOmega : 0;
    this.engineW = s ? Math.max(0, s.netCrankTorque * this.meanOmega) : 0;
    const p1Mechanical = (this.starterNm - this.generatorNm) * this.meanOmega;
    const p3Mechanical = this.p3.deliveredDriveTorque * this.p3.shaftAngularVelocity;
    const wheelW = this.ehsOutput.drivenWheelTorque * this.wheelOmega;
    const chemicalW = (energyBefore - this.battery.remainingEnergyKWh) * 3600000 / dt;
    this.losses.electricalW = this.p1DC - p1Mechanical + this.p3DC - p3Mechanical;
    this.losses.transmissionW = p3Mechanical - this.motorWheelNm * this.wheelOmega +
      this.directNm * this.wheelOmega * h.directDrive.ratio * (1 - h.directDrive.efficiency);
    this.losses.clutchW = this.directNm * (this.meanOmega - this.wheelOmega * h.directDrive.ratio);
    this.losses.batteryW = chemicalW - this.terminalW;
    this.losses.fuelW = fuelW - combustionW;
    this.losses.frictionW = s ? s.engineBrakingTorque * this.meanOmega : p1Mechanical - rotorW;
    this.losses.auxiliaryW = this.auxiliaryW;
    this.losses.chargerW = this.battery.gridPowerW * (1 - (this.battery.connector === 'AC' ? h.charging.acEfficiency : h.charging.dcEfficiency));
    const totalLoss = this.losses.electricalW + this.losses.transmissionW + this.losses.clutchW + this.losses.batteryW +
      this.losses.fuelW + this.losses.frictionW + this.losses.auxiliaryW + this.losses.chargerW;
    this.energy.residualW = fuelW + chemicalW + this.battery.gridPowerW - wheelW - rotorW - totalLoss;
    this.energy.residualJ += this.energy.residualW * dt;
    this.energy.fuelJ += fuelW * dt; this.energy.batteryJ += chemicalW * dt; this.energy.gridJ += this.battery.gridPowerW * dt;
    this.energy.wheelJ += wheelW * dt; this.energy.rotorJ += rotorW * dt; this.energy.lossesJ += totalLoss * dt;
    this.p1.thermal?.integrate(dt, Math.max(0, this.p1DC - p1Mechanical), speed);
    this.p3.thermal?.integrate(dt, Math.max(0, this.p3DC - p3Mechanical), speed);
    const cooling = this.config.engine.thermal;
    if (this.thermal && cooling) {
      const thermostat = h.engineCooling;
      const open = smoothLimit((this.thermal.temperatureC - thermostat.thermostatStartC) /
        (thermostat.thermostatFullC - thermostat.thermostatStartC));
      this.thermal.integrateHeat(dt, Math.max(0, this.losses.fuelW) * cooling.heatFraction + this.losses.frictionW,
        thermostat.bypassWPerK + open * (cooling.coolingWPerK + cooling.airflowCoolingWPerKPerMps * Math.abs(speed)),
        this.config.ambientTemperature ?? 20);
    }
    this.usedKWh += Math.max(0, this.terminalW) * dt / 3600000;
    // Trip recovery counts P3 braking only; P1 fuel generation is not free recovery.
    this.recoveredKWh += Math.max(0, -this.p3DC) * dt / 3600000;
    this.distanceKm += Math.abs(speed) * dt / 1000;
    this.p1.setShaftSpeed(e.angularVelocity); this.p1.deliveredDriveTorque = this.starterNm - this.generatorNm;
    this.refreshOutput(); this.ehsStepDt = 0;
  }
  public override getSnapshot(): ICEPowertrainSnapshot & { ehs: EhsTelemetry; ev: EVTelemetry } {
    const base = super.getSnapshot(), em = this.energyManagement;
    const mechanical = this.p3.deliveredDriveTorque * this.p3.shaftAngularVelocity;
    base.kind = 'EHS_PHEV'; base.ice.automaticEngineStop = this.operational && !em.engineRequested;
    base.ice.gear = this.gear; base.ice.upshiftRecommendationAvailable = base.ice.upshiftRecommended = false;
    base.ice.clutchEngagement = this.engagement; base.ice.clutchPedal = 1 - this.engagement;
    const ev: EVTelemetry = { stateOfCharge: this.battery.stateOfCharge, remainingEnergyKWh: this.battery.remainingEnergyKWh,
      batteryPowerKw: this.terminalW / 1000, motorRPM: this.p3.shaftAngularVelocity * 30 / Math.PI,
      motorTorque: this.p3.deliveredDriveTorque, drivePowerKw: Math.max(0, mechanical) / 1000, regenPowerKw: Math.max(0, -mechanical) / 1000,
      regenBrakeLight: this.regenerationNm / this.config.wheelRadius / this.config.mass > 1.3,
      regenLimited: this.battery.availableChargePower < this.config.ehs.p3.maxRegenPower,
      regenLimitReason: this.battery.availableChargePower < 100 ? 'BATTERY' : null,
      tripEnergyConsumedKWh: this.usedKWh, tripEnergyRecoveredKWh: this.recoveredKWh,
      averageConsumptionKWhPer100km: this.distanceKm > .1 ? this.usedKWh / this.distanceKm * 100 : null,
      estimatedRangeKm: this.battery.remainingEnergyKWh / 12.04 * 100,
      requestedBrakeTorque: this.requestedBrakeNm, regenerativeBrakeTorque: this.regenerationNm,
      batteryTemperature: this.battery.temperature, frontMotorTemperature: this.p3.temperature,
      packVoltage: this.battery.voltage, packCurrent: this.battery.current,
      frontMotorRPM: this.p3.shaftAngularVelocity * 30 / Math.PI, frontMotorTorque: this.p3.deliveredDriveTorque,
      availableDischargePower: this.battery.availableDischargePower, availableRegenPower: this.battery.availableChargePower };
    const direct = em.path === 'PARALLEL' && this.engagement > .95 && Math.abs(this.motorWheelNm) < Math.max(35, this.ehsOutput.drivenWheelTorque * .1);
    const state = em.path === 'PARALLEL' && this.engagement > 0 ? direct ? 'DIRECT' : 'PARALLEL' : em.engineRequested ? 'SERIES' : 'EV';
    return { ...base, ev, ehs: { mode: em.mode, path: em.path, state,
      holdSOC: em.holdSOC, engineRequested: em.engineRequested, enginePhase: this.engine.ignitionPhase, targetRPM: em.targetRPM,
      directClutch: { engagement: this.engagement, torqueNm: this.directNm,
        slipRPM: (this.engine.angularVelocity - this.wheelOmega * this.config.ehs.directDrive.ratio) * 30 / Math.PI },
      enginePowerW: this.engineW, p1MechanicalPowerW: (this.starterNm - this.generatorNm) * this.meanOmega,
      p1GenerationPowerW: Math.max(0, -this.p1DC), p1RPM: this.engine.currentRPM,
      p3MechanicalPowerW: mechanical, p3DCPowerW: this.p3DC, p3RPM: ev.motorRPM,
      wheelPowerW: this.ehsOutput.drivenWheelTorque * this.wheelOmega, busPowerW: this.terminalW,
      battery: this.battery.getSnapshot(), p1TemperatureC: this.p1.temperature, p3TemperatureC: this.p3.temperature,
      losses: { ...this.losses }, energy: { ...this.energy } } };
  }
}
