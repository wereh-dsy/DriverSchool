import type { VehicleChassisConfig } from '../config';
import { WHEEL_IDS, type WheelId } from './WheelContact';
import type { WheelPhysicsStateSet } from './WheelPhysicsState';
import { clamp, damp } from './math';
import { ESCController } from './ESCController';
import { resolveVehicleCapabilities } from '../VehicleCapabilities';
import type { BrakeTorqueCoordinator } from './BrakeTorqueCoordinator';

export interface DriverAssistOptions {
  absEnabled: boolean;
  ebdEnabled: boolean;
  tractionControlEnabled: boolean;
  stabilityControlEnabled?: boolean;
}
export interface DriverAssistSnapshot extends DriverAssistOptions {
  absLamp: boolean;
  absSupported: boolean;
  tcsSupported: boolean;
  escSupported: boolean;
  absActive: boolean;
  tcsActive: boolean;
  engineTorqueFactor: number;
  frontBrakeBias: number;
  absWarning: boolean;
  tcsLamp: boolean;
  tcsOff: boolean;
  stabilityControlEnabled: boolean;
  escActive: boolean;
  escOff: boolean;
  /** Shared TCS/ESC skid lamp, including the existing ignition self-check. */
  skidLamp: boolean;
}

/** Independent service-pressure modulation, axle allocation and crank torque demand. */
export class DriverAssistSystem {
  /** eDiff reuses traction slip observations; no second competing wheel controller. */
  public readonly differentialBrakeTorques = [0, 0, 0, 0];
  public get electronicDifferentialActive(): boolean { return this.differentialBrakeTorques.some(t => t > 1); }
  public readonly esc: ESCController;
  public readonly pressures = [1, 1, 1, 1];
  public engineTorqueFactor = 1;
  public frontBrakeBias: number;
  private options: DriverAssistOptions;
  private absActive = false;
  private selfCheck = 0;
  private time = 0;
  private vehicleOperational = false;
  private readonly capabilities: ReturnType<typeof resolveVehicleCapabilities>;

  public constructor(private readonly config: VehicleChassisConfig) {
    this.capabilities = resolveVehicleCapabilities(config);
    this.options = { absEnabled: config.driverAids.absEnabled,
      ebdEnabled: config.driverAids.ebdEnabled ?? false, tractionControlEnabled: config.driverAids.tractionControlEnabled,
      stabilityControlEnabled: config.driverAids.stabilityControlEnabled };
    this.esc = new ESCController(config);
    this.setOptions(this.options);
    this.frontBrakeBias = config.brakes.frontBrakeBias;
  }
  public setOptions(options: DriverAssistOptions): void {
    const capabilities = this.capabilities;
    this.options = { absEnabled: options.absEnabled && capabilities.abs,
      ebdEnabled: options.ebdEnabled && capabilities.ebd,
      tractionControlEnabled: options.tractionControlEnabled && capabilities.tcs,
      stabilityControlEnabled: (options.stabilityControlEnabled ?? this.config.driverAids.stabilityControlEnabled) && capabilities.esc };
    if (!this.options.stabilityControlEnabled) this.esc.reset();
    if (!this.options.absEnabled) { this.pressures.fill(1); this.absActive = false; }
    if (!this.options.tractionControlEnabled) this.engineTorqueFactor = 1;
  }
  public updateStability(dt: number, speed: number, steering: number, yawRate: number,
    lateralVelocity: number, wheels: WheelPhysicsStateSet, limits: readonly number[], lateralLimits: readonly number[]): void {
    this.esc.update(dt, this.options.stabilityControlEnabled === true && this.vehicleOperational,
      speed, steering, yawRate, lateralVelocity, wheels, limits, lateralLimits);
  }
  public reset(running: boolean): void {
    this.differentialBrakeTorques.fill(0);
    this.esc.reset();
    this.pressures.fill(1); this.engineTorqueFactor = 1; this.absActive = false;
    this.frontBrakeBias = this.config.brakes.frontBrakeBias;
    this.vehicleOperational = running; this.selfCheck = running ? 1.2 : 0; this.time = 0;
  }
  public updateTraction(dt: number, wheels: WheelPhysicsStateSet, throttle: number, running: boolean, driving: boolean, driveAvailable = running): void {
    if (running && !this.vehicleOperational) this.selfCheck = 1.2;
    this.vehicleOperational = running; this.selfCheck = Math.max(0, this.selfCheck - dt); this.time += dt;
    let excess = 0;
    if (this.options.tractionControlEnabled && running && driveAvailable && driving && throttle > .05) {
      const ids: readonly WheelId[] = this.config.drivetrainType === 'AWD' ? WHEEL_IDS
        : this.config.drivetrainType === 'RWD' ? ['rearLeft', 'rearRight'] : ['frontLeft', 'frontRight'];
      for (const id of ids) {
        const w = wheels[id];
        const direction = Math.sign(w.longitudinalSpeed || w.angularVelocity);
        excess = Math.max(excess, w.slipRatio * direction - this.config.tires.peakSlipRatio *
          (this.config.driverAids.tcs?.slipThresholdMultiplier ?? 1.25));
      }
    }
    const tune = this.config.driverAids.tcs;
    const target = 1 - clamp(excess / .5, 0, tune?.maximumTorqueReduction ?? .95);
    this.engineTorqueFactor = damp(this.engineTorqueFactor, target,
      target < this.engineTorqueFactor ? tune?.response ?? 7 : tune?.recoveryResponse ?? 1.8, dt);
    if (!this.options.tractionControlEnabled) this.engineTorqueFactor = 1;
    const differential = this.config.electronicDifferential;
    if (!differential) { this.differentialBrakeTorques.fill(0); return; }
    for (let i = 0; i < 4; i++) {
      const driven = this.config.drivetrainType === 'AWD' || (i < 2) === (this.config.drivetrainType === 'FWD');
      const wheel = wheels[WHEEL_IDS[i]!], other = wheels[WHEEL_IDS[i ^ 1]!];
      const direction = Math.sign(wheel.longitudinalSpeed || wheel.angularVelocity);
      const slip = wheel.slipRatio * direction;
      // Wheel-relative slip speed excludes the normal outside-wheel speed in a turn.
      const excessSpeed = direction * ((wheel.angularVelocity - other.angularVelocity) * this.config.wheelRadius -
        (wheel.longitudinalSpeed - other.longitudinalSpeed));
      const target = differential && driven && running && driveAvailable && driving && throttle > .05
        ? differential.maximumBrakeTorque * clamp((slip - differential.slipThreshold) / .4, 0, 1) *
          clamp((excessSpeed - differential.speedDifferenceThreshold) / 2, 0, 1) : 0;
      this.differentialBrakeTorques[i] = damp(this.differentialBrakeTorques[i]!, target, differential?.response ?? 10, dt);
    }
  }
  /** Capacities already contain actual loads, surface and tyre load sensitivity. */
  public updateBrakes(dt: number, speed: number, brake: number, wheels: WheelPhysicsStateSet,
    capacities: readonly number[], coordinator?: BrakeTorqueCoordinator, regenerativeAxle?: 'front' | 'rear'): void {
    const front = capacities[0]! + capacities[1]!;
    const rear = capacities[2]! + capacities[3]!;
    const targetBias = this.options.ebdEnabled && front + rear > 1
      ? clamp(front / (front + rear) + .04, this.config.brakes.frontBrakeBias - .08, .9)
      : this.config.brakes.frontBrakeBias;
    this.frontBrakeBias = this.options.ebdEnabled ? damp(this.frontBrakeBias, targetBias, 8, dt) : targetBias;
    this.absActive = false;
    const authority = clamp((Math.abs(speed) - 1) / 1.5, 0, 1);
    for (let i = 0; i < 4; i++) {
      const w = wheels[WHEEL_IDS[i]!];
      const slip = -w.slipRatio * Math.sign(w.longitudinalSpeed || speed);
      const excessive = slip - this.config.tires.peakSlipRatio * 1.05;
      const requested = brake > .01 || this.esc.brakeTorques[i]! > 1 || coordinator?.hasServiceRequest(i) === true ||
        (regenerativeAxle !== undefined && (i < 2) === (regenerativeAxle === 'front'));
      const target = this.options.absEnabled && requested
        ? 1 - authority * clamp(excessive / .2, 0, .96) : 1;
      this.pressures[i] = this.options.absEnabled && authority > 0 && requested
        ? damp(this.pressures[i]!, target, target < this.pressures[i]! ? 24 : 5, dt) : 1;
      this.absActive ||= this.options.absEnabled && authority > 0 && this.pressures[i]! < .98;
    }
  }
  public getSnapshot(): DriverAssistSnapshot {
    const capabilities = this.capabilities;
    const tcsActive = this.options.tractionControlEnabled && this.engineTorqueFactor < .98;
    return { ...this.options, absSupported: capabilities.abs, tcsSupported: capabilities.tcs, escSupported: capabilities.esc,
      absLamp: this.vehicleOperational && this.absActive && Math.floor(this.time * 8) % 2 === 0,
      absActive: this.absActive, tcsActive,
      stabilityControlEnabled: this.options.stabilityControlEnabled === true,
      escActive: this.esc.active,
      escOff: this.vehicleOperational && !this.options.stabilityControlEnabled,
      skidLamp: this.vehicleOperational && (this.selfCheck > 0 ||
        ((tcsActive || this.esc.active) && Math.floor(this.time * 8) % 2 === 0)),
      engineTorqueFactor: this.engineTorqueFactor, frontBrakeBias: this.frontBrakeBias,
      absWarning: this.vehicleOperational && (!this.options.absEnabled || this.selfCheck > 0),
      tcsLamp: this.vehicleOperational && (this.selfCheck > 0 || (tcsActive && Math.floor(this.time * 8) % 2 === 0)),
      tcsOff: this.vehicleOperational && !this.options.tractionControlEnabled };
  }
}
