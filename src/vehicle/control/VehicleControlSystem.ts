import type { VehicleChassisConfig } from '../config';
import { WHEEL_IDS, type WheelContactSet } from '../physics/WheelContact';
import { TractionController } from '../physics/TractionController';
import type { WheelPhysicsStateSet } from '../physics/WheelPhysicsState';
import { clamp, damp } from '../physics/math';
import { ESCController } from '../physics/ESCController';
import { resolveVehicleCapabilities } from '../VehicleCapabilities';
import type { BrakeTorqueCoordinator } from '../physics/BrakeTorqueCoordinator';
import type { BrakeSystem } from '../physics/BrakeSystem';
import { VehicleStateEstimator } from './VehicleStateEstimator';
import { ABSController } from './braking/ABSController';
import { EBDController } from './braking/EBDController';
import { ControlArbitrator } from './ControlArbitrator';
import { BaseControlCalibration } from './BaseControlCalibration';
import { AdaptiveDriverLayer } from './adaptive/AdaptiveDriverLayer';
import type { DriverIntent } from './adaptive/DriverBehaviorMonitor';

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
  absActiveWheels: readonly boolean[];
  yawTarget: number;
  yawError: number;
  adaptiveLearningEnabled: boolean;
  driverProfileConfidence: number;
}

/** Independent service-pressure modulation, axle allocation and crank torque demand. */
export class VehicleControlSystem {
  public readonly estimator: VehicleStateEstimator;
  public readonly arbitrator = new ControlArbitrator();
  public readonly abs = new ABSController();
  public readonly ebd: EBDController;
  public adaptive = new AdaptiveDriverLayer();
  public learningAllowed = true;
  private readonly intent: DriverIntent = { throttle: 0, brake: 0, steering: 0 };
  private readonly interventions = { absActive: false, tcsActive: false, escActive: false };
  private readonly brakeRequested = [false, false, false, false];
  public readonly tractionBrakeTorques = [0, 0, 0, 0];
  private readonly tractionActive = [false, false, false, false];
  private readonly axleSlipDuration = [0, 0];
  private readonly combinedTractionBrakes = [0, 0, 0, 0];
  private readonly driverDemand = { throttle: 0, brake: 0 };
  /** eDiff reuses traction slip observations; no second competing wheel controller. */
  public readonly differentialBrakeTorques = [0, 0, 0, 0];
  public get electronicDifferentialActive(): boolean { return this.differentialBrakeTorques.some(t => t > 1); }
  public readonly esc: ESCController;
  public readonly pressures = this.abs.pressures;
  public engineTorqueFactor = 1;
  /** Independent motor authority; ICE still consumes engineTorqueFactor. */
  public frontTorqueFactor = 1;
  public rearTorqueFactor = 1;
  public frontBrakeBias: number;
  private readonly frontTraction = new TractionController();
  private readonly rearTraction = new TractionController();
  private options: DriverAssistOptions;
  private absActive = false;
  private selfCheck = 0;
  private time = 0;
  private vehicleOperational = false;
  private readonly capabilities: ReturnType<typeof resolveVehicleCapabilities>;

  public constructor(private readonly config: VehicleChassisConfig) {
    this.estimator = new VehicleStateEstimator(config);
    this.ebd = new EBDController(config.brakes.frontBrakeBias);
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
    if (!this.options.absEnabled) { this.abs.reset(); this.absActive = false; }
    if (!this.options.tractionControlEnabled) {
      this.frontTraction.reset(); this.rearTraction.reset(); this.tractionBrakeTorques.fill(0);
      this.tractionActive.fill(false); this.axleSlipDuration.fill(0);
    }
    this.resolveTorque();
  }
  /** Driver intent is sampled before soft mapping. Automation bypasses pedal learning/mapping. */
  public updateDriverIntent(dt: number, throttle: number, brake: number, steering: number, operational: boolean, automated: boolean): void {
    this.intent.throttle = throttle; this.intent.brake = brake; this.intent.steering = steering;
    this.interventions.absActive = this.absActive;
    this.interventions.tcsActive = this.tractionIsActive;
    this.interventions.escActive = this.esc.active;
    this.adaptive.update(dt, this.intent, this.estimator.state, this.interventions,
      this.learningAllowed && operational && !automated && this.estimator.state.speed > .5);
  }
  public previewThrottleDemand(baselineThrottle: number): number {
    return baselineThrottle ** this.adaptive.calibration.throttleExponent;
  }
  public mapDriverDemand(dt: number, baselineThrottle: number, driverBrake: number,
    cruiseThrottle: number): Readonly<{ throttle: number; brake: number }> {
    this.driverDemand.throttle = Math.max(this.adaptive.mapThrottle(dt, baselineThrottle), cruiseThrottle);
    this.driverDemand.brake = this.adaptive.mapBrake(driverBrake);
    return this.driverDemand;
  }
  private get tractionIsActive(): boolean {
    return this.options.tractionControlEnabled && (Math.min(this.frontTraction.factor, this.rearTraction.factor) < .98 ||
      this.tractionBrakeTorques.some(t => t > 5));
  }
  private resolveTorque(): void {
    const share = this.config.drivetrainType === 'FWD' ? 1 : this.config.drivetrainType === 'RWD' ? 0 : this.config.frontTorqueSplit;
    const traction = this.options.tractionControlEnabled;
    this.arbitrator.limitTorque(traction ? this.frontTraction.factor : 1,
      traction ? this.rearTraction.factor : 1, this.esc.torqueFactor, share);
    const request = this.arbitrator.request;
    this.engineTorqueFactor = request.powertrainTorqueFactor;
    this.frontTorqueFactor = request.frontTorqueFactor; this.rearTorqueFactor = request.rearTorqueFactor;
  }
  public stageBrakeRequests(brakes: BrakeSystem): void {
    for (let i = 0; i < 4; i++) {
      if (!this.estimator.state.wheels[WHEEL_IDS[i]!].grounded) {
        this.tractionBrakeTorques[i] = this.differentialBrakeTorques[i] = 0;
      }
      // eDiff and TCS describe overlapping slip control on the same wheel.
      this.combinedTractionBrakes[i] = Math.max(this.tractionBrakeTorques[i]!, this.differentialBrakeTorques[i]!);
    }
    brakes.setDriverAidState(this.frontBrakeBias, this.pressures);
    this.arbitrator.submitBrakes(brakes.coordinator, this.esc.brakeTorques, this.combinedTractionBrakes);
  }
  /** Current Fz/contact state is refreshed by the solver before this call.
   * ABS sees every service source plus motor braking before either is delivered. */
  public resolveServiceBrakes(dt: number, brakes: BrakeSystem, capacities: readonly number[],
    regenerativeAxle?: 'front' | 'rear' | 'both'): void {
    this.frontBrakeBias = this.ebd.update(dt, this.options.ebdEnabled, this.estimator.state, capacities);
    this.stageBrakeRequests(brakes);
    brakes.prepareRequests();
    this.modulateABS(dt, brakes.brakeInput, brakes.coordinator, regenerativeAxle);
    this.stageBrakeRequests(brakes);
  }
  public updateStabilityState(dt: number, limits: readonly number[], lateralLimits: readonly number[]): void {
    this.esc.updateState(dt, this.options.stabilityControlEnabled === true && this.vehicleOperational,
      this.estimator.state, limits, lateralLimits);
    this.resolveTorque();
  }
  public updateStability(dt: number, speed: number, steering: number, yawRate: number,
    lateralVelocity: number, wheels: WheelPhysicsStateSet, limits: readonly number[], lateralLimits: readonly number[]): void {
    // Legacy call shape retained for external callers. Runtime reads the shared sample.
    const state = this.estimator.state;
    state.longitudinalVelocity = speed; state.speed = Math.hypot(speed, lateralVelocity);
    state.steeringAngle = steering; state.yawRate = yawRate; state.lateralVelocity = lateralVelocity;
    state.estimatedSideslipAngle = Math.atan(lateralVelocity / Math.max(2, Math.abs(speed)));
    this.estimator.refreshWheels(wheels);
    this.updateStabilityState(dt, limits, lateralLimits);
  }
  public reset(running: boolean): void {
    this.frontTraction.reset(); this.rearTraction.reset();
    this.estimator.reset(); this.ebd.reset(); this.abs.reset(); this.adaptive.resetTransient();
    this.tractionBrakeTorques.fill(0); this.tractionActive.fill(false); this.axleSlipDuration.fill(0);
    this.differentialBrakeTorques.fill(0);
    this.esc.reset();
    this.pressures.fill(1); this.engineTorqueFactor = this.frontTorqueFactor = this.rearTorqueFactor = 1; this.absActive = false;
    this.frontBrakeBias = this.config.brakes.frontBrakeBias;
    this.vehicleOperational = running; this.selfCheck = running ? 1.2 : 0; this.time = 0;
    this.resolveTorque();
  }
  public updateTraction(dt: number, wheels: WheelPhysicsStateSet, throttle: number, running: boolean, driving: boolean, driveAvailable = running, contacts?: WheelContactSet): void {
    if (running && !this.vehicleOperational) this.selfCheck = 1.2;
    this.vehicleOperational = running; this.selfCheck = Math.max(0, this.selfCheck - dt); this.time += dt;
    let frontError = -1, rearError = -1;
    this.estimator.refreshWheels(wheels, contacts);
    const enabled = this.options.tractionControlEnabled && running && driveAvailable && driving && throttle > .05;
    if (enabled) {
      for (const id of WHEEL_IDS) {
        const front = id === 'frontLeft' || id === 'frontRight';
        const w = this.estimator.state.wheels[id];
        if (!w.driven) continue;
        const direction = Math.sign(w.longitudinalVelocity || w.angularVelocity);
        const target = w.usefulSlipRatio * BaseControlCalibration.tcs.slipMultiplier;
        // Airborne overspeed may limit propulsion, but cannot produce road-brake intervention.
        const error = w.longitudinalSlipRatio * direction - target;
        if (front) frontError = Math.max(frontError, error);
        else rearError = Math.max(rearError, error);
      }
    }
    const tune = BaseControlCalibration.tcs;
    for (let axle = 0; axle < 2; axle++) {
      const error = axle === 0 ? frontError : rearError;
      this.axleSlipDuration[axle] = enabled && error > tune.hysteresis ? this.axleSlipDuration[axle]! + dt
        : Math.max(0, this.axleSlipDuration[axle]! - dt * 2);
      const torqueError = error > tune.severeSlip || this.axleSlipDuration[axle]! >= tune.torqueDelay ? error : Math.min(0, error);
      (axle === 0 ? this.frontTraction : this.rearTraction).update(dt, torqueError, enabled);
    }
    for (let i = 0; i < 4; i++) {
      const w = this.estimator.state.wheels[WHEEL_IDS[i]!];
      const error = w.longitudinalSlipRatio * Math.sign(w.longitudinalVelocity || w.angularVelocity) - w.usefulSlipRatio * tune.slipMultiplier;
      const usable = enabled && w.driven && w.grounded && Math.abs(w.linearSurfaceSpeed - w.longitudinalVelocity) > .35;
      if (!usable || error < -tune.hysteresis) this.tractionActive[i] = false;
      else if (error > tune.hysteresis) this.tractionActive[i] = true;
      const hardware = (i < 2 ? this.config.brakes.maxBrakeTorqueFront : this.config.brakes.maxBrakeTorqueRear) * .5;
      const target = usable && this.tractionActive[i] ? Math.min(hardware * tune.brakeFraction,
        w.normalLoad * this.config.wheelRadius * tune.brakeFraction) * clamp(error / .15, 0, 1) : 0;
      this.tractionBrakeTorques[i] = usable ? damp(this.tractionBrakeTorques[i]!, target, tune.brakeResponse, dt) : 0;
    }
    this.resolveTorque();
    const differential = this.config.electronicDifferential;
    if (!differential) { this.differentialBrakeTorques.fill(0); return; }
    for (let i = 0; i < 4; i++) {
      const driven = this.config.drivetrainType === 'AWD' || (i < 2) === (this.config.drivetrainType === 'FWD');
      const wheel = this.estimator.state.wheels[WHEEL_IDS[i]!], other = this.estimator.state.wheels[WHEEL_IDS[i ^ 1]!];
      const direction = Math.sign(wheel.longitudinalVelocity || wheel.angularVelocity);
      const slip = wheel.longitudinalSlipRatio * direction;
      // Wheel-relative slip speed excludes the normal outside-wheel speed in a turn.
      const excessSpeed = direction * ((wheel.angularVelocity - other.angularVelocity) * this.config.wheelRadius -
        (wheel.longitudinalVelocity - other.longitudinalVelocity));
      const target = differential && driven && wheel.grounded && running && driveAvailable && driving && throttle > .05
        ? differential.maximumBrakeTorque * clamp((slip - differential.slipThreshold * wheel.usefulSlipRatio / Math.max(.015, this.config.tires.peakSlipRatio)) / .4, 0, 1) *
          clamp((excessSpeed - differential.speedDifferenceThreshold) / 2, 0, 1) : 0;
      this.differentialBrakeTorques[i] = damp(this.differentialBrakeTorques[i]!, target, differential?.response ?? 10, dt);
    }
  }
  /** Capacities already contain actual loads, surface and tyre load sensitivity. */
  public updateBrakes(dt: number, speed: number, brake: number, wheels: WheelPhysicsStateSet,
    capacities: readonly number[], coordinator?: BrakeTorqueCoordinator, regenerativeAxle?: 'front' | 'rear' | 'both', contacts?: WheelContactSet): void {
    this.estimator.state.longitudinalVelocity = speed;
    this.estimator.refreshWheels(wheels, contacts);
    this.frontBrakeBias = this.ebd.update(dt, this.options.ebdEnabled, this.estimator.state, capacities);
    this.modulateABS(dt, brake, coordinator, regenerativeAxle);
  }
  private modulateABS(dt: number, brake: number, coordinator?: BrakeTorqueCoordinator,
    regenerativeAxle?: 'front' | 'rear' | 'both'): void {
    for (let i = 0; i < 4; i++) {
      this.brakeRequested[i] = brake > .01 || this.esc.brakeTorques[i]! > 1 || coordinator?.hasServiceRequest(i) === true ||
        (regenerativeAxle === 'both' || regenerativeAxle !== undefined && (i < 2) === (regenerativeAxle === 'front'));
    }
    this.abs.update(dt, this.options.absEnabled, this.estimator.state, this.brakeRequested);
    this.absActive = this.abs.active;
  }
  public getSnapshot(): DriverAssistSnapshot {
    const capabilities = this.capabilities;
    const tcsActive = this.tractionIsActive;
    return { ...this.options, absSupported: capabilities.abs, tcsSupported: capabilities.tcs, escSupported: capabilities.esc,
      absLamp: this.vehicleOperational && this.absActive && Math.floor(this.time * 8) % 2 === 0,
      absActive: this.absActive, tcsActive,
      stabilityControlEnabled: this.options.stabilityControlEnabled === true,
      escActive: this.esc.active,
      escOff: this.vehicleOperational && !this.options.stabilityControlEnabled,
      skidLamp: this.vehicleOperational && (this.selfCheck > 0 ||
        ((tcsActive || this.esc.active) && Math.floor(this.time * 8) % 2 === 0)),
      engineTorqueFactor: this.engineTorqueFactor, frontBrakeBias: this.frontBrakeBias,
      absActiveWheels: [...this.abs.activeWheels], yawTarget: this.esc.expectedYawRate,
      yawError: this.esc.expectedYawRate - this.estimator.state.yawRate,
      adaptiveLearningEnabled: this.adaptive.enabled, driverProfileConfidence: this.adaptive.profile.confidence,
      absWarning: this.vehicleOperational && (!this.options.absEnabled || this.selfCheck > 0),
      tcsLamp: this.vehicleOperational && (this.selfCheck > 0 || (tcsActive && Math.floor(this.time * 8) % 2 === 0)),
      tcsOff: this.vehicleOperational && !this.options.tractionControlEnabled };
  }
}
