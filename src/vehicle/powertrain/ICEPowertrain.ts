import type { VehicleControlMode } from '../../input/VehicleInputState';
import type { DriveModeCalibration, Gear, VehiclePhysicsConfig } from '../config';
import { Engine } from '../physics/Engine';
import { FuelSystem } from '../physics/FuelSystem';
import { Clutch } from '../physics/Clutch';
import { AutoClutchController } from '../physics/AutoClutchController';
import type { AutoClutchUpdateResult } from '../physics/AutoClutchController';
import { Gearbox } from '../physics/Gearbox';
import { DrivetrainLash } from '../physics/DrivetrainLash';
import { UpshiftAdvisor } from '../physics/UpshiftAdvisor';
import { clamp01 } from '../physics/math';
import { createTransmissionSystem } from '../transmission/createTransmissionSystem';
import type { TransmissionContext, TransmissionSystem, TransmissionSnapshot } from '../transmission/TransmissionSystem';
import type { Powertrain, PowertrainSnapshot, PowertrainInitialState, PowertrainUpdateContext, PowertrainOutput, ICEVehicleTelemetry, ShiftRejectionReason } from './Powertrain';

export interface ICEPowertrainSnapshot extends PowertrainSnapshot { ice: ICEVehicleTelemetry; transmission: TransmissionSnapshot }

/** Adapter for the existing ICE implementation; integration order is unchanged. */
export class ICEPowertrain implements Powertrain {
  private startStopEnabled = false;
  private startStopState: 'DISABLED' | 'READY' | 'AUTO_STOPPED' | 'RESTARTING' = 'DISABLED';
  private stoppedTime = 0;
  private restartTime = 0;
  public setStartStopEnabled(enabled: boolean): void {
    this.startStopEnabled = enabled && this.config.startStop !== undefined && this.transmission.type !== 'MANUAL';
  }
  public readonly engine: Engine;
  public readonly fuel: FuelSystem;
  public readonly clutch: Clutch;
  public readonly autoClutch: AutoClutchController;
  public readonly gearbox: Gearbox;
  public readonly transmission: TransmissionSystem;
  public readonly drivetrainLash: DrivetrainLash;
  public readonly upshiftAdvisor: UpshiftAdvisor;
  private controlMode: VehicleControlMode = 'normal';
  private clutchPedal = 1;
  private readonly output: PowertrainOutput = { drivenWheelTorque: 0, inputLoadTorque: 0, couplingSlipAngularVelocity: 0, parkingLocked: false };
  public constructor(public readonly config: VehiclePhysicsConfig) {
    this.engine = new Engine(config.engine);
    this.fuel = new FuelSystem(config.fuel, config.engine);
    this.clutch = new Clutch(config.clutch);
    this.autoClutch = new AutoClutchController(config.autoClutch, config.engine.idleRPM);
    this.gearbox = new Gearbox(config.transmission);
    this.transmission = createTransmissionSystem(config.transmission, this.gearbox, this.clutch, this.autoClutch, config.wheelRadius);
    this.drivetrainLash = new DrivetrainLash(this.transmission.type === 'MANUAL' ? config.transmission.drivetrainLash : undefined);
    this.upshiftAdvisor = new UpshiftAdvisor(config.engine.shiftRecommendation, this.gearbox.getMaximumForwardGear());
    this.setStartStopEnabled(config.startStop?.enabledByDefault ?? false);
  }
  public get torqueSource(): Engine { return this.engine; }
  public get vehicleOperational(): boolean { return this.engine.ignitionOn; }
  public get driveAvailable(): boolean { return this.startStopState !== 'AUTO_STOPPED' && this.startStopState !== 'RESTARTING' && this.torqueSource.canDeliverTorque; }
  public get supportsManualSelection(): boolean { return this.config.transmission.supportsManualSelection === true; }
  public get gear(): Gear { return this.gearbox.currentGear; }
  public get throttle(): number { return this.engine.throttle; }
  public get variableMassKg(): number { return this.fuel.fuelMassKg; }
  public get driving(): boolean {
    const mode = this.transmission.getSnapshot().selectedMode;
    return this.transmission.type === 'MANUAL' ? this.gear !== 'N' : mode === 'D' || mode === 'R';
  }
  public get numericallyValid(): boolean {
    return Number.isFinite(this.engine.currentRPM) && Number.isFinite(this.clutch.engagement) && Number.isFinite(this.clutch.targetEngagement);
  }
  private synchronizeFuel(): void { this.engine.setFuelAvailable(this.fuel.hasFuel); }
  public setCurrentFuelL(litres: number): void { this.fuel.setCurrentFuelL(litres); this.synchronizeFuel(); }
  public reset(state: PowertrainInitialState, recovering = false): void {
    this.startStopState = this.startStopEnabled ? 'READY' : 'DISABLED';
    this.stoppedTime = this.restartTime = 0;
    if (state.ice?.currentFuelL !== undefined) this.fuel.setCurrentFuelL(state.ice.currentFuelL);
    if (!recovering) this.fuel.resetTrip();
    this.synchronizeFuel();
    this.engine.reset(this.finiteOr(state.ice?.engineRPM, state.shaftAngularVelocity === undefined ? this.config.engine.idleRPM : state.shaftAngularVelocity * 60 / (2 * Math.PI)), state.ice?.engineRunning ?? state.driveAvailable ?? true);
    this.engine.ignitionOn = state.vehicleOperational ?? (state.ice?.engineRunning !== false);
    this.engine.setTorqueLimitFactor(1);
    this.gearbox.reset(state.gear ?? 'N');
    const engagement = this.safeUnitInput(state.ice?.clutchEngagement ?? 0);
    this.clutch.reset(engagement);
    if (!recovering) this.autoClutch.reset(engagement);
    this.transmission.reset(state.gear ?? 'N', state.driveSelector);
    this.drivetrainLash.reset(); this.upshiftAdvisor.reset();
    this.controlMode = this.transmission.type === 'MANUAL' && state.controlMode === 'manual-clutch' ? 'manual-clutch' : 'normal';
    this.clutchPedal = 1 - engagement;
    if (recovering && this.transmission.type === 'MANUAL') {
      if (this.controlMode === 'normal') this.autoClutch.takeOver(engagement);
      else this.autoClutch.releaseControl(engagement);
    }
    this.output.drivenWheelTorque = this.output.inputLoadTorque = this.output.couplingSlipAngularVelocity = 0;
    this.output.parkingLocked = false;
  }
  public captureState(previous: PowertrainInitialState = {}): PowertrainInitialState {
    previous.vehicleOperational = this.vehicleOperational; previous.driveAvailable = this.driveAvailable;
    previous.shaftAngularVelocity = this.torqueSource.shaftAngularVelocity;
    previous.gear = this.gear; previous.driveSelector = this.transmission.getSnapshot().selectedMode ?? undefined;
    previous.controlMode = this.controlMode;
    const ice = previous.ice ?? (previous.ice = {});
    ice.engineRPM = this.engine.currentRPM; ice.engineRunning = this.engine.isRunning; ice.clutchEngagement = this.clutch.engagement;
    return previous;
  }
  public requestStart(): boolean {
    if (this.engine.isRunning || this.engine.isStarting || !this.fuel.hasFuel) return false;
    const automaticMode = this.transmission.getSnapshot().selectedMode;
    const drivetrainIsSafe = this.transmission.type !== 'MANUAL'
      ? automaticMode === 'P' || automaticMode === 'N'
      :
      this.gearbox.currentGear === 'N' ||
      1 - this.clutch.engagement >=
        this.config.transmission.minimumClutchDisengagementForShift;
    if (!drivetrainIsSafe) return false;
    this.engine.start();
    return true;
  }

  public requestStop(): boolean {
    if (!this.vehicleOperational && !this.engine.isRunning && !this.engine.isStarting) return false;
    this.startStopState = 'DISABLED'; this.stoppedTime = this.restartTime = 0;
    this.engine.stop(); return true;
  }
  public requestGear(
    requestedGear: Gear,
    mode: VehicleControlMode,
    speed: number,
  ): ShiftRejectionReason | null {
    if (this.transmission.type !== 'MANUAL') return 'gear-not-available';
    if (!this.gearbox.isGearAvailable(requestedGear)) {
      return 'gear-not-available';
    }
    let targetGear = requestedGear;
    const directionConflict =
      (requestedGear === 'R' && speed > this.config.transmission.reverseLockoutSpeed) ||
      (Gearbox.isForwardGear(requestedGear) &&
        speed < -this.config.transmission.reverseLockoutSpeed);
    if (directionConflict) targetGear = 'N';

    if (targetGear !== 'N' && this.wouldOverRev(targetGear, speed)) {
      return 'engine-over-speed';
    }

    if (targetGear === this.gearbox.currentGear && this.autoClutch.pendingGear === null) {
      return 'already-selected';
    }

    if (mode === 'manual-clutch') {
      if (
        1 - this.clutch.engagement <
        this.config.transmission.minimumClutchDisengagementForShift
      ) {
        return 'clutch-not-disengaged';
      }
      this.gearbox.setGear(targetGear);
      return null;
    }

    if (!this.autoClutch.requestShift(targetGear)) {
      return 'shift-in-progress';
    }
    return null;
  }

  public setControlMode(requestedMode: VehicleControlMode): VehicleControlMode {
    if (this.transmission.type !== 'MANUAL') { this.controlMode = 'normal'; return this.controlMode; }
    const nextMode: VehicleControlMode = requestedMode === 'manual-clutch'
      ? 'manual-clutch'
      : 'normal';
    if (nextMode === this.controlMode) return this.controlMode;

    if (nextMode === 'manual-clutch') {
      this.autoClutch.releaseControl(this.clutch.engagement);
      // The input layer mirrors this value on R3; retaining it here makes the
      // physics transition continuous even if a custom adapter is one frame late.
      this.clutchPedal = 1 - this.clutch.engagement;
    } else {
      this.autoClutch.takeOver(this.clutch.engagement);
      this.clutchPedal = 1 - this.clutch.engagement;
    }
    this.controlMode = nextMode;
    return nextMode;
  }

  private wouldOverRev(targetGear: Exclude<Gear, 'N'>, speed: number): boolean {
    const ratio = this.gearbox.getRatio(targetGear);
    const wheelAngularVelocity = speed / Math.max(0.01, this.config.wheelRadius);
    const coupledRPM = Math.abs(
      (wheelAngularVelocity * ratio * this.config.transmission.finalDriveRatio * 60) /
        (Math.PI * 2),
    );
    return coupledRPM > this.config.engine.maxRPM * 1.05;
  }

  public prepare(context: PowertrainUpdateContext): void {
    this.synchronizeFuel();
    const { dt, throttle: throttleCommand } = context;
    let clutchTarget = 0;
    let autoUpdate: AutoClutchUpdateResult = {
      targetEngagement: this.clutch.engagement,
      cutThrottle: false,
    };
    const isManual = this.transmission.type === 'MANUAL';
    this.engine.setTorqueLimitFactor(context.torqueLimitFactor);
    let automaticThrottleScale = 1, automaticMinimumThrottle = 0;
    if (!isManual) {
      const preparation = this.transmission.prepare({
        ...this.getTransmissionContext(context), selectorRequest: context.selectorRequest,
      });
      automaticThrottleScale = preparation.throttleScale;
      automaticMinimumThrottle = preparation.minimumThrottle ?? 0;
    } else if (this.controlMode === 'normal') {
      autoUpdate = this.autoClutch.update(dt, {
        currentEngagement: this.clutch.engagement,
        currentGear: this.gearbox.currentGear,
        vehicleSpeed: context.vehicleSpeed,
        engineRPM: this.engine.currentRPM,
        coupledEngineRPM: this.gearbox.getCoupledEngineRPM(
          context.vehicleSpeed,
          this.config.wheelRadius,
        ),
        throttle: throttleCommand,
      });
      if (autoUpdate.gearToEngage !== undefined) {
        this.gearbox.setGear(autoUpdate.gearToEngage);
      }
      clutchTarget = autoUpdate.targetEngagement;
    } else {
      this.clutchPedal = this.safeUnitInput(context.clutchPedal);
      clutchTarget = this.clutch.pedalToEngagement(this.clutchPedal);
    }

    if (isManual) this.clutch.update(dt, clutchTarget);
    this.updateStartStop(context);
    this.engine.setRevHangContext({
      enabled: isManual,
      gearEngaged: this.gearbox.currentGear !== 'N',
      clutchEngagement: this.clutch.engagement,
    });
    this.torqueSource.requestDrive(autoUpdate.cutThrottle ? 0 : Math.max(throttleCommand * automaticThrottleScale, automaticMinimumThrottle), dt);
  }
  public update(context: PowertrainUpdateContext): PowertrainOutput {
    const { dt } = context;
    const transmissionOutput = this.transmission.update(this.getTransmissionContext(context));
    const clutchTorque = transmissionOutput.engineLoadTorque;
    const lashFactor = this.drivetrainLash.update(dt, transmissionOutput.transmittedTorque,
      this.config.clutch.maxClutchTorque);
    const fuelRPM = this.engine.currentRPM;
    const fuelThrottle = this.engine.throttle;
    // Fuel observes the unchanged ICE sample; shaft integration uses the common source boundary.
    this.torqueSource.updateState(dt, clutchTorque);
    const engineTorque = this.engine.lastTorqueSample;
    const previousFuel = this.fuel.currentFuelL;
    this.fuel.update(dt, fuelRPM, fuelThrottle, engineTorque, context.vehicleSpeed, context.vehicleLateralSpeed, context.driveMode);
    this.output.consumedFuelL = Math.max(0, previousFuel - this.fuel.currentFuelL);
    this.synchronizeFuel();
    this.output.drivenWheelTorque = transmissionOutput.drivenWheelTorque * lashFactor;
    this.output.inputLoadTorque = clutchTorque;
    this.output.couplingSlipAngularVelocity = this.transmission.type === 'MANUAL' ? this.clutch.lastSlipAngularVelocity : (this.engine.currentRPM - this.transmission.getSnapshot().inputRPM) * 2 * Math.PI / 60;
    this.output.parkingLocked = transmissionOutput.parkingLocked;
    return this.output;
  }

  /** Automatic combustion stop preserves ignition and all chassis accessories. */
  private updateStartStop(context: PowertrainUpdateContext): void {
    const config = this.config.startStop;
    if (!config || this.transmission.type === 'MANUAL') return;
    if (!this.vehicleOperational || !this.fuel.hasFuel) {
      this.startStopState = 'DISABLED'; this.stoppedTime = this.restartTime = 0; return;
    }
    const mode = this.transmission.getSnapshot().selectedMode;
    if (this.startStopState === 'AUTO_STOPPED') {
      const restart = !this.startStopEnabled || mode !== 'D' || context.throttle >= config.restartThrottleThreshold ||
        (!context.autoHoldHolding && context.brake < config.restartBrakeReleaseThreshold);
      if (restart) { this.startStopState = 'RESTARTING'; this.restartTime = 0; }
    } else if (this.startStopState === 'RESTARTING') {
      this.restartTime += context.dt;
      if (this.restartTime >= config.restartDelay && !this.engine.isRunning && !this.engine.isStarting) this.engine.start();
      if (this.engine.isRunning && !this.engine.isStarting) {
        this.startStopState = this.startStopEnabled ? 'READY' : 'DISABLED'; this.stoppedTime = 0;
      }
    } else {
      this.startStopState = this.startStopEnabled ? 'READY' : 'DISABLED';
      const canStop = this.startStopEnabled && mode === 'D' && this.engine.isRunning && !this.engine.isStarting &&
        Math.hypot(context.vehicleSpeed, context.vehicleLateralSpeed) <= config.stopSpeedThreshold &&
        (context.brake >= config.brakeThreshold || context.autoHoldHolding === true) &&
        context.throttle < config.restartThrottleThreshold;
      this.stoppedTime = canStop ? this.stoppedTime + context.dt : 0;
      if (this.stoppedTime >= config.minimumStopDelay) {
        this.engine.stop(); this.engine.ignitionOn = true; this.startStopState = 'AUTO_STOPPED'; this.stoppedTime = 0;
      }
    }
  }
  public finishStep(speed: number): void {
    this.upshiftAdvisor.update({
      engineRPM: this.engine.currentRPM,
      throttle: this.engine.throttle,
      speedKmh: Math.abs(speed) * 3.6,
      gear: this.gearbox.currentGear,
      shiftInProgress: this.autoClutch.isShifting || this.transmission.type !== 'MANUAL',
    });
  }

  private getTransmissionContext(context: PowertrainUpdateContext): TransmissionContext {
    // Prepare launch coupling while hydraulic/parking pressure is still present.
    // Idle creep stays unloaded; only a deliberate launch with propulsion ready
    // can build torque before the hold actuator releases.
    const holdLaunch = context.autoHoldHolding && context.throttle >= (this.config.autoHold?.releaseThrottle ?? 1);
    const parkingLaunch = context.parkingBrakeActive && context.throttle >= (this.config.parkingBrake?.releaseThrottle ?? 1);
    const launchRequested = this.driveAvailable && context.brake < .1 && (holdLaunch || parkingLaunch);
    return { dt: context.dt, engineAngularVelocity: this.torqueSource.shaftAngularVelocity,
      engineRPM: this.engine.currentRPM, engineRunning: this.driveAvailable,
      engineInertia: this.torqueSource.rotationalInertia, idleRPM: this.config.engine.idleRPM,
      stallRPM: this.config.engine.stallRPM, redlineRPM: this.config.engine.redlineRPM,
      availableEngineTorque: this.torqueSource.availableDriveTorque, throttle: context.throttle,
      brake: context.brake, vehicleSpeed: context.vehicleSpeed, vehicleLateralSpeed: context.vehicleLateralSpeed,
      holdingBrake: (context.autoHoldHolding === true || context.parkingBrakeActive === true) && !launchRequested,
      drivenWheelAngularVelocity: context.drivenWheelAngularVelocity };
  }
  public getSnapshot(): ICEPowertrainSnapshot {
    const upshift = this.upshiftAdvisor.getSample(), transmission = this.transmission.getSnapshot();
    const automaticEngagement = transmission.dct === undefined ? 0 : transmission.dct.clutchAEngagement + transmission.dct.clutchBEngagement;
    return { kind: 'ICE', vehicleOperational: this.vehicleOperational, driveAvailable: this.driveAvailable,
      inputShaftAngularVelocity: this.torqueSource.shaftAngularVelocity, sourceInertia: this.torqueSource.rotationalInertia,
      availableDriveTorque: this.torqueSource.availableDriveTorque, transmission,
      ice: {
        startStop: { supported: this.config.startStop !== undefined && this.transmission.type !== 'MANUAL',
          enabled: this.startStopEnabled, state: this.startStopState },
        fuel: this.fuel.getSnapshot(),
        rpm: this.engine.currentRPM,
        engineRunning: this.engine.isRunning,
        idleRPM: this.config.engine.idleRPM,
        shiftWarningRPM: upshift.targetRPM,
        recommendedUpshiftRPM: upshift.targetRPM,
        upshiftRecommendationAvailable: upshift.available,
        upshiftRecommended: upshift.recommended,
        redlineWarningRPM: this.config.engine.redlineWarningRPM,
        nearRedline: this.engine.currentRPM >= this.config.engine.redlineWarningRPM,
        onRevLimiter: this.engine.isOnLimiter,
        redlineRPM: this.config.engine.redlineRPM,
        gear: this.gearbox.currentGear,
        requestedGear: this.autoClutch.pendingGear,
        clutchPedal: this.transmission.type !== 'MANUAL' ? 1 - automaticEngagement : this.controlMode === 'manual-clutch'
          ? this.clutchPedal
          : 1 - this.clutch.engagement,
        clutchEngagement: this.transmission.type === 'MANUAL' ? this.clutch.engagement : automaticEngagement,
        clutchState: this.clutch.state,
        autoClutchState: this.autoClutch.state,
        drivetrainLash: this.drivetrainLash.getSnapshot(), revHang: this.engine.getRevHangSnapshot(),
      },
    };
  }
  public getShiftGear(direction: -1 | 1): Gear { return direction > 0 ? this.gearbox.getShiftUpGear() : this.gearbox.getShiftDownGear(); }
  public applyDriveMode(calibration: DriveModeCalibration): void {
    this.config.engine.throttleResponse = this.config.engine.throttleResponseRate = calibration.throttleResponse;
    const strategy = this.config.transmission.dct?.shiftStrategy ?? this.config.transmission.automatic?.shiftStrategy;
    if (strategy) Object.assign(strategy, calibration.shiftStrategy);
    if (this.config.transmission.dct && calibration.dctShiftTime !== undefined)
      this.config.transmission.shiftTime = calibration.dctShiftTime;
  }
  private safeUnitInput(value: number): number { return clamp01(this.finiteOr(value, 0)); }
  private finiteOr(value: number | undefined, fallback: number): number { return value !== undefined && Number.isFinite(value) ? value : fallback; }
}
