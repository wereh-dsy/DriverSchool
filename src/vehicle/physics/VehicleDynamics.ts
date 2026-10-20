import type { VehicleControlMode, VehicleInputState } from '../../input/VehicleInputState';
import {
  createDefaultVehiclePhysicsConfig,
  type Gear,
  type DriveSelector,
  type VehiclePhysicsConfig,
  type VehicleChassisConfig,
} from '../config';
import { BrakeSystem } from './BrakeSystem';
import { DriverAssistSystem, type DriverAssistOptions, type DriverAssistSnapshot } from './DriverAssistSystem';
import { SteeringSystem } from './SteeringSystem';
import { WHEEL_IDS, averageWheelGroundGeometry, type GroundNormal, type WheelContactSet, type WheelId } from './WheelContact';
import { centerOfMassOffsetZ, wheelLocalPosition } from '../VehicleDimensions';
import { SuspensionSystem } from './SuspensionSystem';
import { SurfaceInteraction, softSurfaceResistance } from './SurfaceInteraction';
import { WheelRotationSystem } from './WheelRotationSystem';
import type { Differential, DifferentialSnapshot } from './Differential';
import { createDifferential } from './LimitedSlipDifferential';
import { resolveVehicleCapabilities, type VehicleCapabilities } from '../VehicleCapabilities';
import type { DriveTorqueSource } from './DriveTorqueSource';
import { ElectronicParkingBrake, type ParkingBrakeSnapshot } from '../control/ElectronicParkingBrake';
import { AutoHoldController, type AutoHoldSnapshot } from '../control/AutoHoldController';
import { AWDTorqueDistribution, type AWDTorqueDistributionSnapshot } from './AWDTorqueDistribution';
import type { ChassisPhysicsState, WheelPhysicsState, WheelPhysicsStateSet } from './WheelPhysicsState';
import { clamp, clamp01, wrapAngle } from './math';
import { ICEPowertrain } from '../powertrain/ICEPowertrain';
import { ElectricPowertrain } from '../powertrain/ElectricPowertrain';
import { isElectricConfig } from '../config/ElectricVehiclePhysicsConfig';
import { TripComputer, type TripComputerSnapshot } from '../control/TripComputer';
import type { Powertrain, PowertrainSnapshot, PowertrainInitialState, PowertrainUpdateContext, ICEVehicleTelemetry, PowertrainTransmissionSnapshot, ShiftRejectionReason } from '../powertrain/Powertrain';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { TPMSSensor, type TPMSState } from '../TPMSState';
import type { TransmissionSnapshot } from '../transmission/TransmissionSystem';

export interface VehicleWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Per-step road information supplied by the world/track system. */
export interface VehicleEnvironment {
  ambientTemperatureC?: number;
  /** Four independently queried tyre contacts; material coefficients are relative to asphalt. */
  wheelContacts?: WheelContactSet;
  /** Upward unit surface normal. Wheel-contact normals take priority when present. */
  groundNormal?: { x: number; y: number; z: number };
  /** Positive means uphill in the vehicle's local forward direction. */
  gradeRadians?: number;
  /** Multiplier for wet, gravel, etc. One is the configured dry-road grip. */
  surfaceGripMultiplier?: number;
  /** Optional axle-independent overrides layered on top of surfaceGripMultiplier. */
  surfaceLongitudinalGripMultiplier?: number;
  surfaceLateralGripMultiplier?: number;
  rollingResistanceMultiplier?: number;
  /** Wind/collisions may inject a signed force without entering the drivetrain. */
  externalLongitudinalForce?: number;
  bounds?: VehicleWorldBounds;
}

/** Body/axle-midpoint pose and point velocity from the planar static collision resolver. */
export interface VehicleContactCorrection {
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
  yawRate?: number;
}

interface TyreContactForces {
  staticSupported: boolean;
  wheelForce: number;
  powertrainForce: number;
  serviceBrakeForce: number;
  handbrakeForce: number;
  rollingForce: number;
  rollingMagnitude: number;
  longitudinalForceLimit: number;
  frontLateralGrip: number;
  rearLateralGrip: number;
  frontLongitudinalUsage: number;
  rearLongitudinalUsage: number;
  contactYawAcceleration: number;
  lateralForce: number;
  yawMoment: number;
  lateralForceLimit: number;
}

type FourWheelValues = [number, number, number, number];

export interface VehicleInitialState {
  ambientTemperatureC?: number;
  vehicleOperational?: boolean;
  driveAvailable?: boolean;
  shaftAngularVelocity?: number;
  currentFuelL?: number;
  stateOfCharge?: number;
  /** World body origin (axle midpoint), matching map spawn poses. */
  x?: number;
  z?: number;
  yaw?: number;
  speed?: number;
  gear?: Gear;
  engineRPM?: number;
  /** Defaults to true; false creates a stopped/stalled engine at zero rpm. */
  engineRunning?: boolean;
  clutchEngagement?: number;
  controlMode?: VehicleControlMode;
  driveSelector?: DriveSelector;
}

export type { ShiftRejectionReason } from '../powertrain/Powertrain';

/** Result lets the UI distinguish a successful stop from a blocked restart. */
export type EngineToggleResult = 'started' | 'stopped' | 'start-rejected';

export interface VehicleForceSnapshot {
  /** Signed tyre force generated by the powertrain, including back-drive. */
  wheelForce: number;
  /** Combined applied service-brake and handbrake force. */
  brakeForce: number;
  serviceBrakeForce: number;
  handbrakeForce: number;
  aerodynamicDragForce: number;
  rollingResistanceForce: number;
  gradeForce: number;
  externalForce: number;
  netForce: number;
  /** Signed subset of wheelForce that opposes motion with the throttle shut. */
  engineBrakingForce: number;
  /** Torque crossing the clutch; exposed for slip/capacity diagnostics. */
  clutchTorque: number;
  clutchSlipAngularVelocity: number;
}

export interface VehicleSnapshot extends ICEVehicleTelemetry {
  tpmsState: TPMSState;
  trip: TripComputerSnapshot;
  frontAeroVerticalForce: number;
  rearAeroVerticalForce: number;
  powertrain: PowertrainSnapshot;
  vehicleOperational: boolean;
  driveAvailable: boolean;
  baseVehicleMass: number;
  effectiveVehicleMass: number;
  driveMode?: import('../config').VehicleDriveMode;
  /** World body/visual origin at the axle midpoint; derived from CG and yaw. */
  x: number;
  z: number;
  yaw: number;
  /** CG velocity along body forward (-Z), in m/s. */
  speed: number;
  speedKmh: number;
  acceleration: number;
  yawRate: number;
  /** Velocity direction relative to the body; positive points toward vehicle-right. */
  bodySlipAngle: number;
  /** CG velocity along body right (+X), in m/s. */
  lateralVelocity: number;
  /** Signed body-local lateral acceleration; positive is vehicle-right. */
  lateralAcceleration: number;
  /** Remaining rear lateral authority after parking-brake lockup. */
  rearLateralGripFactor: number;
  throttle: number;
  brake: number;
  handbrake: number;
  steer: number;
  controlMode: VehicleControlMode;
  /** State of the most recent shift event; compare sequence for a new event. */
  shiftRejected: boolean;
  shiftRejectionReason: ShiftRejectionReason | null;
  shiftEventSequence: number;
  steeringAngle: number;
  /** Individual visual/diagnostic road-wheel angles after Ackermann correction. */
  leftRoadWheelAngle: number;
  rightRoadWheelAngle: number;
  steeringWheelAngle: number;
  forces: VehicleForceSnapshot;
  wheels: WheelPhysicsStateSet;
  chassis: ChassisPhysicsState;
  transmission: TransmissionSnapshot;
  parkingBrake: ParkingBrakeSnapshot;
  autoHold: AutoHoldSnapshot;
  electronicDifferentialActive: boolean;
  differential: DifferentialSnapshot;
  rearDifferential?: DifferentialSnapshot;
  awd?: AWDTorqueDistributionSnapshot;
  driverAssists: DriverAssistSnapshot;
  /** True for the update in which corrupt numeric state was restored. */
  recoveredFromInvalidState: boolean;
}

interface ValidCoreState {
  powertrain: PowertrainInitialState;
  centerOfMassX: number;
  centerOfMassZ: number;
  yaw: number;
  speed: number;
  controlMode: VehicleControlMode;
  bodySlipAngle: number;
  lateralVelocity: number;
  chassisY: number;
  verticalVelocity: number;
  contactSlipRecovery: boolean;
  contactSlipHoldTime: number;
  yawRate: number;
}

const ZERO_FORCES: VehicleForceSnapshot = {
  wheelForce: 0,
  brakeForce: 0,
  serviceBrakeForce: 0,
  handbrakeForce: 0,
  aerodynamicDragForce: 0,
  rollingResistanceForce: 0,
  gradeForce: 0,
  externalForce: 0,
  netForce: 0,
  engineBrakingForce: 0,
  clutchTorque: 0,
  clutchSlipAngularVelocity: 0,
};

/**
 * Four independent supported wheel contacts and a planar chassis. This class
 * consumes only the normalized VehicleInputState contract. It has no knowledge
 * of keyboards, gamepads, steering wheels, renderers, or wall-clock time.
 */
type ICEAccess<P extends Powertrain, K extends keyof ICEPowertrain> = P extends ICEPowertrain ? ICEPowertrain[K] : ICEPowertrain[K] | undefined;
type DynamicsConfig<P extends Powertrain> = P extends ICEPowertrain ? VehiclePhysicsConfig : VehicleChassisConfig;
export type VehicleRuntimeSnapshot = Omit<VehicleSnapshot, keyof ICEVehicleTelemetry | 'transmission'> &
  Partial<Omit<ICEVehicleTelemetry, 'gear'>> & { gear: Gear | null; transmission: PowertrainTransmissionSnapshot };
export type VehicleSnapshotFor<P extends Powertrain> = P extends ICEPowertrain ? VehicleSnapshot : VehicleRuntimeSnapshot;

export class VehicleDynamics<TPowertrain extends Powertrain = ICEPowertrain> {
  public readonly powertrain: TPowertrain;
  public readonly tripComputer = new TripComputer();
  private frontAeroVerticalForce = 0;
  private rearAeroVerticalForce = 0;
  private get icePowertrain(): ICEPowertrain | undefined { return this.powertrain instanceof ICEPowertrain ? this.powertrain : undefined; }

  public get fuel(): ICEAccess<TPowertrain, 'fuel'> { return this.icePowertrain?.fuel as ICEAccess<TPowertrain, 'fuel'>; }
  public get engine(): ICEAccess<TPowertrain, 'engine'> { return this.icePowertrain?.engine as ICEAccess<TPowertrain, 'engine'>; }
  public get clutch(): ICEAccess<TPowertrain, 'clutch'> { return this.icePowertrain?.clutch as ICEAccess<TPowertrain, 'clutch'>; }
  public get autoClutch(): ICEAccess<TPowertrain, 'autoClutch'> { return this.icePowertrain?.autoClutch as ICEAccess<TPowertrain, 'autoClutch'>; }
  public get gearbox(): ICEAccess<TPowertrain, 'gearbox'> { return this.icePowertrain?.gearbox as ICEAccess<TPowertrain, 'gearbox'>; }
  public get upshiftAdvisor(): ICEAccess<TPowertrain, 'upshiftAdvisor'> { return this.icePowertrain?.upshiftAdvisor as ICEAccess<TPowertrain, 'upshiftAdvisor'>; }
  public get drivetrainLash(): ICEAccess<TPowertrain, 'drivetrainLash'> { return this.icePowertrain?.drivetrainLash as ICEAccess<TPowertrain, 'drivetrainLash'>; }
  /** Shared mass entry for all mass-dependent physics; config.mass stays base mass. */
  private readonly runtimeConfig: VehicleChassisConfig;
  public get effectiveVehicleMass(): number { return this.runtimeConfig.mass; }

  public setCurrentFuelL(litres: number): void {
    this.icePowertrain?.setCurrentFuelL(litres);
    this.synchronizePowertrainMass();
  }

  private synchronizePowertrainMass(): void {
    this.runtimeConfig.mass = this.config.mass + this.powertrain.variableMassKg;
  }
  public readonly capabilities: VehicleCapabilities;
  public get torqueSource(): DriveTorqueSource { return this.powertrain.torqueSource; }
  public readonly parkingBrake: ElectronicParkingBrake | undefined;
  public readonly autoHold: AutoHoldController | undefined;
  public setAutoHoldEnabled(enabled: boolean): void { this.autoHold?.setEnabled(enabled); }
  public setStartStopEnabled(enabled: boolean): void { this.icePowertrain?.setStartStopEnabled(enabled && this.capabilities.startStop); }
  public readonly brakes: BrakeSystem;
  public readonly driverAssists: DriverAssistSystem;
  /** Shared control boundary; driverAssists remains the presentation compatibility alias. */
  public get vehicleControl(): DriverAssistSystem { return this.driverAssists; }
  public setDriverAssistOptions(options: DriverAssistOptions): void { this.driverAssists.setOptions(options); }
  public readonly steering: SteeringSystem;
  public readonly suspension: SuspensionSystem;
  public readonly wheelRotation: WheelRotationSystem;
  private readonly surfaceInteraction = new SurfaceInteraction();
  private readonly softLongitudinalForces: FourWheelValues = [0, 0, 0, 0];
  private readonly softLateralForces: FourWheelValues = [0, 0, 0, 0];
  public readonly tpms: TPMSSensor;
  private tyreAmbientTemperatureC: number;
  public readonly differential: Differential;
  public readonly rearDifferential: Differential | undefined;
  public readonly awd: AWDTorqueDistribution | undefined;
  public get transmission(): TPowertrain['transmission'] { return this.powertrain.transmission; }

  // Translational state is authoritative at CG. Geometry remains axle-midpoint based.
  private centerOfMassX = 0;
  private centerOfMassZ = 0;
  private readonly centerOfMassLocalZ: number;
  /** Derived world body origin. Setters retain compatibility with explicit pose edits. */
  public get x(): number { return this.centerOfMassX - Math.sin(this.yaw) * this.centerOfMassLocalZ; }
  public set x(bodyOriginX: number) { this.centerOfMassX = bodyOriginX + Math.sin(this.yaw) * this.centerOfMassLocalZ; }
  public get z(): number { return this.centerOfMassZ - Math.cos(this.yaw) * this.centerOfMassLocalZ; }
  public set z(bodyOriginZ: number) { this.centerOfMassZ = bodyOriginZ + Math.cos(this.yaw) * this.centerOfMassLocalZ; }
  public yaw = 0;
  /** Signed CG longitudinal velocity in m/s; negative means reversing. */
  public speed = 0;
  public acceleration = 0;
  public yawRate = 0;
  /** Positive means the velocity vector points to the vehicle's right. */
  public bodySlipAngle = 0;
  /** CG velocity along body right (+X). */
  public lateralVelocity = 0;
  public lateralAcceleration = 0;
  public rearLateralGripFactor = 1;
  /** Authoritative body-origin height, integrated from gravity and suspension support, m. */
  public chassisY = 0;
  public verticalVelocity = 0;
  public verticalAcceleration = 0;
  private verticalInitialized = false;
  private groundedWheels = 4;

  private readonly powertrainContext: PowertrainUpdateContext = {
    dt: 0, throttle: 0, brake: 0, vehicleSpeed: 0, vehicleLateralSpeed: 0,
    drivenWheelAngularVelocity: 0, torqueLimitFactor: 1, clutchPedal: 1,
  };
  private forces: VehicleForceSnapshot = { ...ZERO_FORCES };
  private previousShiftUp = false;
  private previousShiftDown = false;
  private controlMode: VehicleControlMode = 'normal';
  private shiftRejected = false;
  private shiftRejectionReason: ShiftRejectionReason | null = null;
  private shiftEventSequence = 0;
  private lastValidState: ValidCoreState;
  private recoveredThisUpdate = false;
  private wheels = {} as Record<WheelId, WheelPhysicsState>;
  private readonly escLateralLimits = [0, 0, 0, 0];
  private readonly controlGrounded = [true, true, true, true];
  /** Preserve an oblique collision's tangent velocity while contact settles. */
  public driveMode: import('../config').VehicleDriveMode | undefined;
  private driveModeThrottleExponent = 1;
  private contactSlipRecovery = false;
  private contactSlipHoldTime = 0;

  public constructor(
    public readonly config: DynamicsConfig<TPowertrain> = createDefaultVehiclePhysicsConfig() as DynamicsConfig<TPowertrain>,
    initialState: VehicleInitialState = {},
    injectedPowertrain?: TPowertrain,
  ) {
    validateVehiclePlatformConfig(config);
    this.centerOfMassLocalZ = centerOfMassOffsetZ(config);
    if (injectedPowertrain === undefined && !('engine' in config) && !isElectricConfig(config)) throw new Error('A non-ICE chassis requires a Powertrain');
    this.powertrain = injectedPowertrain ?? ((isElectricConfig(config) ? new ElectricPowertrain(config)
      : new ICEPowertrain(config as VehiclePhysicsConfig)) as unknown as TPowertrain);
    if (config.transmission && (config.transmission.type ?? 'MANUAL') !== this.powertrain.transmission.type) throw new Error('Powertrain transmission disagrees with config');
    if (this.powertrain.supportsManualSelection && this.powertrain.transmission.type !== 'TORQUE_CONVERTER_AT' && this.powertrain.transmission.type !== 'DCT') throw new Error('Manual selection requires stepped AT/DCT');
    if (config.transmission && (config.transmission.supportsManualSelection === true) !== this.powertrain.supportsManualSelection) throw new Error('Powertrain manual selection disagrees with config');
    if (config.autoHold && this.powertrain.transmission.type === 'MANUAL') throw new Error('Auto Hold requires a selector-based Powertrain');
    this.capabilities = resolveVehicleCapabilities(config, undefined, this.powertrain);
    this.parkingBrake = this.capabilities.electronicParkingBrake && config.parkingBrake
      ? new ElectronicParkingBrake(config.parkingBrake) : undefined;
    this.autoHold = this.capabilities.autoHold && config.autoHold && this.powertrain.transmission.type !== 'MANUAL'
      ? new AutoHoldController(config.autoHold) : undefined;
    this.runtimeConfig = { ...config, mass: config.mass + this.powertrain.variableMassKg };
    const axle = config.drivetrainType === 'RWD' ? 'rear' : 'front';
    this.differential = createDifferential(axle, axle === 'rear' ? config.rearDiff : config.frontDiff);
    this.rearDifferential = this.capabilities.awd ? createDifferential('rear', config.rearDiff) : undefined;
    this.awd = this.capabilities.awd && !this.powertrain.axleOutput ? new AWDTorqueDistribution(config) : undefined;
    this.brakes = new BrakeSystem(config.brakes, config.wheelRadius);
    this.driverAssists = new DriverAssistSystem(this.runtimeConfig);
    this.steering = new SteeringSystem(
      config.steering,
      config.wheelBase,
      config.frontTrackWidth,
    );
    this.suspension = new SuspensionSystem(this.runtimeConfig);
    this.tyreAmbientTemperatureC = this.finiteOr(initialState.ambientTemperatureC, this.finiteOr(config.ambientTemperature, 20));
    this.wheelRotation = new WheelRotationSystem(config.tires, config.wheelRadius, config.tires.wheelInertia, this.tyreAmbientTemperatureC);
    this.tpms = new TPMSSensor(this.wheelRotation.tyres, this.capabilities.tpms);
    this.lastValidState = {
      powertrain: {},
      centerOfMassX: 0,
      centerOfMassZ: 0,
      yaw: 0,
      speed: 0,
      controlMode: 'normal',
      bodySlipAngle: 0,
      lateralVelocity: 0,
      chassisY: 0,
      verticalVelocity: 0,
      contactSlipRecovery: false,
      contactSlipHoldTime: 0,
      yawRate: 0,
    };
    this.reset(initialState);
  }

  public reset(initialState: VehicleInitialState = {}): VehicleSnapshotFor<TPowertrain> {
    // Full reset returns subsystems to cold state; setPose/respawn preserves heat.
    this.tyreAmbientTemperatureC = this.finiteOr(initialState.ambientTemperatureC, this.tyreAmbientTemperatureC);
    this.wheelRotation.tyres.reset(this.tyreAmbientTemperatureC);
    this.tpms.reset();
    this.powertrain.reset({ vehicleOperational: initialState.vehicleOperational, driveAvailable: initialState.driveAvailable,
      shaftAngularVelocity: initialState.shaftAngularVelocity, gear: initialState.gear, driveSelector: initialState.driveSelector,
      ev: initialState.stateOfCharge === undefined ? undefined : { stateOfCharge: initialState.stateOfCharge },
      controlMode: initialState.controlMode, ice: this.icePowertrain ? {
        currentFuelL: initialState.currentFuelL, engineRPM: initialState.engineRPM,
        engineRunning: initialState.engineRunning, clutchEngagement: initialState.clutchEngagement,
      } : undefined });
    this.synchronizePowertrainMass();
    if (this.config.driveModes !== undefined) this.setDriveMode(this.config.defaultDriveMode ?? 'NORMAL');
    this.yaw = wrapAngle(this.finiteOr(initialState.yaw, 0));
    this.x = this.finiteOr(initialState.x, 0);
    this.z = this.finiteOr(initialState.z, 0);
    this.speed = clamp(
      this.finiteOr(initialState.speed, 0),
      -this.config.safety.maxReverseSpeed,
      this.config.safety.maxForwardSpeed,
    );
    this.acceleration = 0;
    this.frontAeroVerticalForce = this.rearAeroVerticalForce = 0;
    this.yawRate = 0;
    this.bodySlipAngle = 0;
    this.lateralVelocity = 0;
    this.contactSlipRecovery = false;
    this.contactSlipHoldTime = 0;
    this.lateralAcceleration = 0;
    this.rearLateralGripFactor = 1;
    this.chassisY = 0;
    this.verticalVelocity = 0;
    this.verticalAcceleration = 0;
    this.verticalInitialized = false;
    this.groundedWheels = 4;
    this.suspension.reset();
    this.wheelRotation.reset(this.speed);
    this.surfaceInteraction.reset();
    this.differential.distributeTorque(0);
    this.rearDifferential?.distributeTorque(0);
    this.awd?.reset();
    this.driverAssists.esc.reset();
    this.initializeWheelStates();
    this.driverAssists.reset(this.powertrain.vehicleOperational);
    this.brakes.reset();
    this.parkingBrake?.reset(this.powertrain.vehicleOperational, this.transmission.getSnapshot().selectedMode === 'P');
    this.autoHold?.reset();
    this.differential.reset(); this.rearDifferential?.reset();
    this.steering.reset();
    this.controlMode = this.powertrain.setControlMode(initialState.controlMode ?? 'normal');
    this.forces = { ...ZERO_FORCES };
    this.previousShiftUp = false;
    this.previousShiftDown = false;
    this.shiftRejected = false;
    this.shiftRejectionReason = null;
    this.shiftEventSequence = 0;
    this.recoveredThisUpdate = false;
    this.storeLastValidState();
    this.updateUpshiftRecommendation();
    return this.getSnapshot();
  }

  public setPose(x: number, z: number, yaw: number, speed = this.speed): void {
    if (![x, z, yaw, speed].every(Number.isFinite)) return;
    this.yaw = wrapAngle(yaw);
    this.x = x;
    this.z = z;
    // A teleport is not a vertical dynamics event; the next contact sample
    // re-seats the chassis and zeroes the heave velocity.
    this.chassisY = 0;
    this.verticalVelocity = 0;
    this.verticalAcceleration = 0;
    this.verticalInitialized = false;
    this.suspension.resetVerticalContact();
    this.speed = clamp(
      speed,
      -this.config.safety.maxReverseSpeed,
      this.config.safety.maxForwardSpeed,
    );
    this.wheelRotation.reset(this.speed);
    this.surfaceInteraction.reset();
    this.differential.distributeTorque(0);
    this.rearDifferential?.distributeTorque(0);
    this.awd?.reset();
    this.driverAssists.esc.reset();
    this.initializeWheelStates();
    this.storeLastValidState();
  }

  /**
   * Import a collision correction without retaining the pre-impact slip state.
   * CollisionSystem owns contact detection and response; this method only keeps
   * the drivetrain's local velocity and body/velocity heading consistent.
   */
  public applyContactCorrection(correction: VehicleContactCorrection): VehicleSnapshotFor<TPowertrain> {
    if (![correction.x, correction.z, correction.velocityX, correction.velocityZ]
      .every(Number.isFinite)) return this.getSnapshot();
    this.x = correction.x;
    this.z = correction.z;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.speed = clamp(
      -sin * correction.velocityX - cos * correction.velocityZ,
      -this.config.safety.maxReverseSpeed,
      this.config.safety.maxForwardSpeed,
    );
    this.yawRate = clamp(this.finiteOr(correction.yawRate, 0),
      -this.config.steering.maximumYawRate, this.config.steering.maximumYawRate);
    // v_bodyOrigin,right = v_CG,right - yawRate * CG.z_from_body.
    const lateral = cos * correction.velocityX - sin * correction.velocityZ +
      this.yawRate * this.centerOfMassLocalZ;
    // At rest, retain a modest tangent drift rather than dividing by near-zero
    // forward speed. The normal driving solver damps it out progressively.
    this.lateralVelocity = lateral;
    this.bodySlipAngle = Math.abs(this.speed) > 0.05
      ? Math.atan(lateral / this.speed) : 0;
    this.contactSlipRecovery = Math.abs(lateral) > 0.025;
    // Repeated wall contacts refresh this short hold. A normal tyre-slip clamp
    // or its normal recovery must not turn an already corrected wall-tangent
    // velocity into inward motion again on the next 120 Hz step.
    this.contactSlipHoldTime = this.contactSlipRecovery ? 0.12 : 0;
    this.acceleration = 0;
    this.lateralAcceleration = -this.speed * this.yawRate;
    // An impact is an explicit velocity constraint. Remove stored wheel spin
    // energy with it so tyres cannot immediately shove the car into the wall.
    this.constrainWheelRotation(this.speed);
    this.storeLastValidState();
    return this.getSnapshot();
  }

  /**
   * Attempts to crank the engine. Starting in gear is permitted only when the
   * physical clutch is already sufficiently open, so callers can give useful
   * feedback without knowing any drivetrain internals.
   */
  public requestEngineStart(): boolean {
    if (!this.powertrain.requestStart()) return false;
    this.storeLastValidState();
    return true;
  }

  /**
   * Switches ignition off immediately. This is deliberately permitted while
   * moving or in gear; the drivetrain continues to coast/back-drive through
   * the normal clutch model and no pose or velocity state is rewritten.
   */
  public requestEngineStop(): boolean {
    if (!this.powertrain.requestStop()) return false;
    this.updateUpshiftRecommendation();
    this.storeLastValidState();
    return true;
  }

  /** One edge-triggered cockpit command can safely operate both directions. */
  public requestEngineToggle(): EngineToggleResult {
    // Legacy ICE toggle restarts a stall, but still stops a fuel-starved coasting engine.
    const ice = this.icePowertrain;
    const running = ice ? ice.engine.isRunning || ice.engine.isStarting || ice.getSnapshot().ice.startStop?.state === 'AUTO_STOPPED' ||
      ice.getSnapshot().ice.startStop?.state === 'RESTARTING' : this.powertrain.vehicleOperational;
    if (running) {
      this.requestEngineStop();
      return 'stopped';
    }
    return this.requestEngineStart() ? 'started' : 'start-rejected';
  }

  /**
   * Request a gear under the active control mode. Normal mode sequences the
   * automatic clutch; Manual mode swaps immediately only when actually open.
   */
  public requestGear(
    requestedGear: Gear,
    mode: VehicleControlMode = this.controlMode,
  ): boolean {
    const rejection = this.powertrain.requestGear(requestedGear, mode, this.speed);
    if (rejection) return this.rejectShift(rejection);
    this.acceptShift(); return true;
  }

  /** PRND uses the safety gate only; it never advances time or reads a device. */
  public requestDriveSelector(selector: DriveSelector, brake = this.brakes.brakeInput): boolean {
    return this.powertrain.requestDriveSelector(selector, this.speed, this.lateralVelocity, this.safeUnitInput(brake));
  }

  /** Apply calibration in place: existing subsystems retain their config references. */
  private setDriveMode(mode: import('../config').VehicleDriveMode): void {
    const calibration = this.config.driveModes?.[mode];
    if (!this.capabilities.driveModes || calibration === undefined) return;
    this.driveMode = mode;
    this.suspension.setDriveMode(mode);
    this.driveModeThrottleExponent = calibration.throttleExponent;
    if (calibration.tcs) Object.assign(this.config.driverAids.tcs ??= { ...calibration.tcs }, calibration.tcs);
    if (calibration.esc) Object.assign(this.config.driverAids.esc ??= { ...calibration.esc }, calibration.esc);
    this.powertrain.applyDriveMode?.(calibration);
    this.config.steering.steeringResponse = calibration.steeringResponse;
    this.config.steering.steeringDamping = calibration.steeringDamping;
    if (this.config.awd !== undefined && calibration.accelerationRearTorqueSplit !== undefined)
      this.config.awd.accelerationRearTorqueSplit = calibration.accelerationRearTorqueSplit;
  }

  public cycleDriveMode(): void {
    if (this.config.driveModes === undefined) return;
    const order = this.config.driveModeOrder ?? ['ECO', 'NORMAL', 'SPORT'];
    const index = this.driveMode === undefined ? -1 : order.indexOf(this.driveMode);
    const next = order[(index + 1) % order.length];
    if (next) this.setDriveMode(next);
  }

  /** Variable-frame entry point with bounded internal substeps. */
  public update(
    deltaTime: number,
    input: VehicleInputState,
    environment: VehicleEnvironment = {},
  ): VehicleSnapshotFor<TPowertrain> {
    this.recoveredThisUpdate = false;
    this.validateOrRecover();
    this.updateControlMode(input.controlMode);
    if (input.cycleDriveMode) this.cycleDriveMode();
    this.processShiftCommands(input);

    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return this.getSnapshot();
    const maxFrameTime = Math.max(1e-4, this.config.safety.maxFrameTime);
    const maxSubstep = Math.max(1e-4, this.config.safety.maxSubstep);
    const frameTime = Math.min(deltaTime, maxFrameTime);
    const stepCount = Math.max(1, Math.ceil(frameTime / maxSubstep));
    const dt = frameTime / stepCount;

    for (let step = 0; step < stepCount; step += 1) {
      this.integrateStep(dt, input, environment);
    }
    return this.getSnapshot();
  }

  /** Single integration step for tests or an upper-layer fixed-step driver. */
  public stepFixed(
    dt: number,
    input: VehicleInputState,
    environment: VehicleEnvironment = {},
  ): VehicleSnapshotFor<TPowertrain> {
    this.recoveredThisUpdate = false;
    this.validateOrRecover();
    this.updateControlMode(input.controlMode);
    if (input.cycleDriveMode) this.cycleDriveMode();
    this.processShiftCommands(input);
    if (Number.isFinite(dt) && dt > 0) {
      const maxFrameTime = Math.max(1e-4, this.config.safety.maxFrameTime);
      this.integrateStep(Math.min(dt, maxFrameTime), input, environment);
    }
    return this.getSnapshot();
  }

  public getSnapshot(): VehicleSnapshotFor<TPowertrain> {
    this.synchronizeWheelPositions();
    const powertrain = this.powertrain.getSnapshot();
    const transmission = powertrain.transmission;
    return {
      ...powertrain.ice, powertrain, trip: this.tripComputer.getSnapshot(),
      tpmsState: this.tpms.state,
      frontAeroVerticalForce: this.frontAeroVerticalForce, rearAeroVerticalForce: this.rearAeroVerticalForce,
      vehicleOperational: powertrain.vehicleOperational, driveAvailable: powertrain.driveAvailable,
      baseVehicleMass: this.config.mass,
      effectiveVehicleMass: this.effectiveVehicleMass,
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      speed: this.speed,
      speedKmh: Math.abs(this.speed) * 3.6,
      driveMode: this.driveMode,
      acceleration: this.acceleration,
      yawRate: this.yawRate,
      bodySlipAngle: this.bodySlipAngle,
      lateralVelocity: this.lateralVelocity,
      lateralAcceleration: this.lateralAcceleration,
      rearLateralGripFactor: this.rearLateralGripFactor,
      gear: this.powertrain.gear,
      throttle: this.powertrain.throttle,
      brake: this.brakes.brakeInput,
      handbrake: this.brakes.handbrakeInput,
      steer: this.steering.steeringInput,
      controlMode: this.controlMode,
      shiftRejected: this.shiftRejected,
      shiftRejectionReason: this.shiftRejectionReason,
      shiftEventSequence: this.shiftEventSequence,
      steeringAngle: this.steering.steeringAngle,
      leftRoadWheelAngle: this.steering.leftRoadWheelAngle,
      rightRoadWheelAngle: this.steering.rightRoadWheelAngle,
      steeringWheelAngle: this.steering.steeringWheelAngle,
      forces: { ...this.forces },
      wheels: { frontLeft: this.copyWheelSnapshot('frontLeft'), frontRight: this.copyWheelSnapshot('frontRight'),
        rearLeft: this.copyWheelSnapshot('rearLeft'), rearRight: this.copyWheelSnapshot('rearRight') },
      chassis: { ...this.suspension.getChassisSnapshot(), chassisY: this.chassisY,
        verticalVelocity: this.verticalVelocity, verticalAcceleration: this.verticalAcceleration,
        groundedWheels: this.groundedWheels },
      transmission,
      differential: this.getDifferentialSnapshot(),
      rearDifferential: this.rearDifferential?.getSnapshot(),
      awd: this.awd?.getSnapshot(),
      driverAssists: this.driverAssists.getSnapshot(),
      parkingBrake: this.parkingBrake?.getSnapshot() ?? {
        state: this.brakes.handbrakeInput > .05 ? 'ENGAGED' : 'RELEASED',
        engaged: this.brakes.handbrakeInput > .05, applying: false,
        fraction: this.brakes.handbrakeInput, emergencyBraking: false },
      autoHold: this.autoHold?.getSnapshot() ?? { state: 'OFF', enabled: false, holding: false, releasing: false, pressure: 0 },
      electronicDifferentialActive: this.driverAssists.electronicDifferentialActive,
      recoveredFromInvalidState: this.recoveredThisUpdate,
    } as VehicleSnapshotFor<TPowertrain>;
  }

  private copyWheelSnapshot(id: WheelId): WheelPhysicsState {
    const wheel = this.wheels[id];
    return { ...wheel, worldPosition: { ...wheel.worldPosition }, groundNormal: { ...wheel.groundNormal } };
  }

  /** Drive modes shape the pedal, before arbitration with assistance demand. */
  public driverThrottleCommand(throttle: number): number {
    return this.vehicleControl.previewThrottleDemand(Math.pow(this.safeUnitInput(throttle), this.driveModeThrottleExponent));
  }

  private integrateStep(
    dt: number,
    input: VehicleInputState,
    environment: VehicleEnvironment,
  ): void {
    const control = this.vehicleControl;
    control.estimator.update(dt, this.speed, this.lateralVelocity, this.acceleration,
      this.lateralAcceleration, this.yawRate, this.steering.steeringAngle, this.wheels, environment.wheelContacts);
    const rawThrottle = this.safeUnitInput(input.throttle), rawBrake = this.safeUnitInput(input.brake);
    const steerCommand = clamp(this.finiteOr(input.steering, 0), -1, 1);
    control.updateDriverIntent(dt, rawThrottle, rawBrake, steerCommand, this.powertrain.vehicleOperational,
      (input.cruiseThrottle ?? 0) > 0 || (input.cruiseBrake ?? 0) > 0);
    const demand = control.mapDriverDemand(dt, Math.pow(rawThrottle, this.driveModeThrottleExponent), rawBrake,
      this.safeUnitInput(input.cruiseThrottle ?? 0));
    const throttleCommand = demand.throttle, brakeCommand = demand.brake;
    const handbrakeCommand = this.safeUnitInput(input.handbrake);


    this.driverAssists.updateTraction(dt, this.wheels, throttleCommand, this.powertrain.vehicleOperational,
      this.powertrain.driving, this.powertrain.driveAvailable, environment.wheelContacts);
    this.awd?.update(dt, throttleCommand, this.wheels, this.powertrain.driveAvailable && this.powertrain.driving,
      this.driverAssists.frontTorqueFactor, this.driverAssists.rearTorqueFactor);
    const context = this.powertrainContext;
    context.dt = dt; context.throttle = throttleCommand; context.brake = brakeCommand;
    context.vehicleSpeed = this.speed; context.vehicleLateralSpeed = this.lateralVelocity;
    context.drivenWheelAngularVelocity = this.getDrivenWheelAngularVelocity();
    context.frontWheelAngularVelocity = (this.wheelRotation.getAngularVelocity('frontLeft') + this.wheelRotation.getAngularVelocity('frontRight')) * .5;
    context.rearWheelAngularVelocity = (this.wheelRotation.getAngularVelocity('rearLeft') + this.wheelRotation.getAngularVelocity('rearRight')) * .5;
    // Carrier inertia follows the same torque-weighted speed as AWD allocation.
    let inverseInertia = 0, reactionAcceleration = 0;
    for (const id of WHEEL_IDS) {
      const front = id === 'frontLeft' || id === 'frontRight';
      const share = this.awd ? (front ? 1 - this.awd.rearTorqueSplit : this.awd.rearTorqueSplit) * .5
        : front === (this.config.drivetrainType === 'FWD') ? .5 : 0;
      const wheel = this.wheels[id], inertia = this.config.tires.wheelInertia;
      inverseInertia += share * share / inertia;
      const reaction = wheel.longitudinalForce * this.config.wheelRadius +
        (wheel.appliedBrakeTorque + wheel.appliedHandbrakeTorque) * Math.sign(wheel.angularVelocity);
      reactionAcceleration += share * reaction / inertia;
    }
    context.drivenWheelInertia = 1 / Math.max(1e-6, inverseInertia);
    context.drivenWheelReactionTorque = reactionAcceleration * context.drivenWheelInertia;
    context.frontTorqueLimitFactor = control.arbitrator.request.frontTorqueFactor;
    context.rearTorqueLimitFactor = control.arbitrator.request.rearTorqueFactor;
    context.yawRate = this.yawRate; context.expectedYawRate = this.driverAssists.esc.expectedYawRate;
    context.escActive = this.driverAssists.esc.active; context.escMode = this.driverAssists.esc.mode;
    context.torqueLimitFactor = control.arbitrator.request.powertrainTorqueFactor;
    context.clutchPedal = this.safeUnitInput(input.clutchPedal);
    context.selectorRequest = input.driveSelector; context.driveMode = this.driveMode;
    context.autoHoldHolding = this.autoHold?.state === 'HOLDING';
    context.parkingBrakeActive = (this.parkingBrake?.fraction ?? handbrakeCommand) > .01;
    this.powertrain.prepare(context);
    this.brakes.update(dt, brakeCommand, this.capabilities.mechanicalHandbrake && !this.parkingBrake ? handbrakeCommand : 0);
    this.brakes.setPowertrainStopRequest(this.powertrain.serviceBrakeDemand ?? 0);
    this.brakes.setRegenerativeCredit(0, 0);
    this.brakes.setCruiseRequest(dt, this.safeUnitInput(input.cruiseBrake ?? 0));
    const mode = this.transmission.getSnapshot().selectedMode;
    const driving = mode === 'D' || mode === 'R';
    this.parkingBrake?.update(dt, handbrakeCommand, Math.hypot(this.speed, this.lateralVelocity),
      this.powertrain.vehicleOperational, mode === 'P', driving, throttleCommand, brakeCommand, this.powertrain.driveAvailable);
    this.autoHold?.update(dt, this.powertrain.vehicleOperational, driving,
      Math.hypot(this.speed, this.lateralVelocity), Math.max(brakeCommand, this.powertrain.serviceBrakeDemand ?? 0), throttleCommand,
      this.powertrain.driveAvailable, this.parkingBrake?.state === 'ENGAGED',
      this.parkingBrake !== undefined && ((!this.powertrain.vehicleOperational && this.parkingBrake.config.autoApplyOnIgnitionOff) ||
        (mode === 'P' && this.parkingBrake.config.autoApplyInPark)));
    this.brakes.setHoldingRequests(this.autoHold?.pressure ?? 0, this.parkingBrake?.emergencyDemand ?? 0,
      this.parkingBrake?.config, this.parkingBrake?.fraction ?? 0);
    control.stageBrakeRequests(this.brakes);
    context.autoHoldHolding = this.autoHold?.state === 'HOLDING';
    context.parkingBrakeActive = (this.parkingBrake?.fraction ?? handbrakeCommand) > .01;
    const frontSurfaceGrip = environment.wheelContacts === undefined ?
      Math.max(0, this.finiteOr(environment.surfaceLateralGripMultiplier,
        this.finiteOr(environment.surfaceGripMultiplier, 1))) :
      (environment.wheelContacts.frontLeft.lateralGrip + environment.wheelContacts.frontRight.lateralGrip) * 0.5;
    this.steering.update(dt, steerCommand, this.speed, frontSurfaceGrip);
    context.drivenAxleBrakeTorque = this.brakes.axleBrakeDemand(this.config.drivetrainType === 'FWD');
    context.frontAxleBrakeTorque = this.brakes.axleBrakeDemand(true);
    context.rearAxleBrakeTorque = this.brakes.axleBrakeDemand(false);
    context.totalServiceBrakeTorque = this.brakes.axleBrakeDemand(true) + this.brakes.axleBrakeDemand(false);
    const transmissionOutput = this.powertrain.update(context);
    const clutchTorque = transmissionOutput.inputLoadTorque;
    this.synchronizePowertrainMass();

    const dragForce =
      -0.5 *
      this.config.aero.airDensity *
      this.config.aero.dragCoefficient *
      this.config.aero.frontalArea *
      this.speed *
      Math.abs(this.speed);
    const grade = this.getContactGrade(environment);
    const gradeForce = -this.effectiveVehicleMass * this.config.gravity * Math.sin(grade);
    const externalForce = this.finiteOr(environment.externalLongitudinalForce, 0);
    const tyreForces = this.calculateTyreContactForces(
      dt,
      environment,
      grade,
      transmissionOutput.drivenWheelTorque,
      dragForce + gradeForce + externalForce,
    );
    const {
      wheelForce,
      rollingForce,
      rollingMagnitude,
      serviceBrakeForce,
      handbrakeForce,
    } = tyreForces;
    const forceWithoutBrakes =
      wheelForce + dragForce + rollingForce + gradeForce + externalForce;
    const brakeForce = serviceBrakeForce + handbrakeForce;
    const netForce = forceWithoutBrakes + brakeForce;

    this.acceleration = netForce / Math.max(1, this.effectiveVehicleMass) -
      this.lateralVelocity * this.yawRate;
    const previousSpeed = this.speed;
    let nextSpeed = previousSpeed + this.acceleration * dt;

    // Passive resistance and either brake must not numerically push through zero.
    const crossedZero =
      (previousSpeed > 0 && nextSpeed < 0) || (previousSpeed < 0 && nextSpeed > 0);
    const propulsionWouldReverse = Math.abs(wheelForce + gradeForce + externalForce) <
      Math.abs(dragForce + rollingForce + brakeForce);
    if (crossedZero && propulsionWouldReverse) nextSpeed = 0;
    if (Math.abs(nextSpeed) < 0.002 && Math.abs(netForce) < rollingMagnitude + 1) nextSpeed = 0;
    // Only remove numerical residue at rest; normal braking is tyre slip/force.
    if (this.brakes.brakeInput > 0.1 && Math.abs(nextSpeed) < 0.003 &&
      Math.abs(netForce) < this.effectiveVehicleMass * 0.1) nextSpeed = 0;
    if (tyreForces.staticSupported) nextSpeed = 0;
    this.speed = clamp(
      nextSpeed,
      -this.config.safety.maxReverseSpeed,
      this.config.safety.maxForwardSpeed,
    );

    if (transmissionOutput.parkingLocked) {
      // A near-rest parking pawl is a velocity constraint, not an enormous
      // artificial braking force. It also holds gravity on a slope.
      this.speed = 0; this.acceleration = 0; this.lateralVelocity = 0; this.yawRate = 0;
      this.bodySlipAngle = 0; this.contactSlipRecovery = false; this.contactSlipHoldTime = 0;
      this.constrainWheelRotation(0);
    }
    if (tyreForces.staticSupported) {
      this.lateralVelocity = 0; this.yawRate = 0; this.bodySlipAngle = 0;
      this.contactSlipRecovery = false; this.contactSlipHoldTime = 0;
    }

    const averageSpeed = transmissionOutput.parkingLocked ? 0 : (previousSpeed + this.speed) * 0.5;
    if (!transmissionOutput.parkingLocked && !tyreForces.staticSupported) this.integrateLateralDynamics(dt, averageSpeed, tyreForces);
    else this.lateralAcceleration = 0;

    const engineBrakingForce =
      Math.abs(this.speed) > 0.05 && tyreForces.powertrainForce * this.speed < 0 && throttleCommand < 0.05
        ? tyreForces.powertrainForce
        : 0;
    this.forces = {
      wheelForce,
      brakeForce,
      serviceBrakeForce,
      handbrakeForce,
      aerodynamicDragForce: dragForce,
      rollingResistanceForce: rollingForce,
      gradeForce,
      externalForce,
      netForce,
      engineBrakingForce,
      clutchTorque,
      clutchSlipAngularVelocity: transmissionOutput.couplingSlipAngularVelocity,
    };

    this.applyWorldBounds(environment.bounds);
    this.validateOrRecover();
    this.powertrain.finishStep(this.speed, this.getDrivenWheelAngularVelocity(),
      (this.wheelRotation.getAngularVelocity('frontLeft') + this.wheelRotation.getAngularVelocity('frontRight')) * .5,
      (this.wheelRotation.getAngularVelocity('rearLeft') + this.wheelRotation.getAngularVelocity('rearRight')) * .5);
    this.lastValidState.powertrain = this.powertrain.captureState(this.lastValidState.powertrain);
    if (!this.recoveredThisUpdate) this.tripComputer.update(dt, averageSpeed, transmissionOutput.consumedFuelL);
  }

  /** Sum four independently limited contact forces and moments in body coordinates. */
  private integrateLateralDynamics(
    dt: number,
    averageSpeed: number,
    contacts: TyreContactForces,
  ): void {
    const absoluteSpeed = Math.abs(averageSpeed);
    const collisionHold = this.contactSlipRecovery && this.contactSlipHoldTime > 0;
    if (collisionHold) {
      this.contactSlipHoldTime = Math.max(0, this.contactSlipHoldTime - dt);
    } else {
      // A small, dissipative contact relaxation damps sustained saturated
      // slides. It never adds yaw or changes the requested steering angle.
      // Grip loss weakens this damping naturally; restored rear grip lets a
      // released parking-brake slide settle instead of continuing to spin.
      const yawDamping = this.config.tires.lateralSlipRecoveryRate * 0.18 *
        Math.min(1, absoluteSpeed / 3) * this.rearLateralGripFactor;
      const yawAcceleration = contacts.yawMoment / Math.max(1, this.config.yawInertia) *
        Math.max(0.05, this.config.steering.yawResponseScale) - this.yawRate * yawDamping;
      this.yawRate += clamp(yawAcceleration, -5, 5) * dt;
      const maximumYawRate = Math.max(0.1, this.config.steering.maximumYawRate);
      this.yawRate = clamp(this.yawRate, -maximumYawRate, maximumYawRate);
      const lateralAcceleration = contacts.lateralForce / Math.max(1, this.effectiveVehicleMass) + averageSpeed * this.yawRate;
      this.lateralVelocity += lateralAcceleration * dt;
      if (absoluteSpeed < 0.4) {
        const restBlend = clamp01(1 - absoluteSpeed / 0.4);
        this.yawRate *= Math.exp(-12 * restBlend * dt);
        this.lateralVelocity *= Math.exp(-12 * restBlend * dt);
      }
      const slipLimit = Math.max(0.05, this.config.tires.maximumBodySlipAngle) * (averageSpeed < 0 ? 0.55 : 1);
      const velocityLimit = Math.max(0.05, absoluteSpeed) * Math.tan(slipLimit);
      if (!this.contactSlipRecovery) this.lateralVelocity = clamp(this.lateralVelocity, -velocityLimit, velocityLimit);
      if (this.contactSlipRecovery && Math.abs(this.lateralVelocity) < 0.025) this.contactSlipRecovery = false;
    }
    this.bodySlipAngle = absoluteSpeed > 0.05 ? Math.atan(this.lateralVelocity / averageSpeed) : 0;
    const middleYaw = this.yaw + this.yawRate * dt * 0.5;
    this.centerOfMassX += (-Math.sin(middleYaw) * averageSpeed +
      Math.cos(middleYaw) * this.lateralVelocity) * dt;
    this.centerOfMassZ += (-Math.cos(middleYaw) * averageSpeed -
      Math.sin(middleYaw) * this.lateralVelocity) * dt;
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
    this.lateralAcceleration = contacts.lateralForce / Math.max(1, this.effectiveVehicleMass);
  }

  /** Refresh contact metadata after the scene adapter's final pose/collision query. */
  public syncWheelContacts(contacts: WheelContactSet): void {
    const vertical = this.suspension.getVerticalSnapshot();
    this.suspension.synchronizeGroundGeometry(contacts, vertical.active ? vertical : undefined);
    if (!this.verticalInitialized) {
      // Spawn/respawn is the one legitimate ground snap: initialise the heave
      // state from the sampled support plane, then never re-seat it per frame.
      const geometry = averageWheelGroundGeometry(contacts);
      this.chassisY = Number.isFinite(geometry.height) ? geometry.height : 0;
      this.verticalVelocity = 0;
      this.verticalAcceleration = 0;
      this.verticalInitialized = true;
    }
    for (const id of WHEEL_IDS) {
      const requirement = this.suspension.contactRequirement(id, this.chassisY, contacts[id].height);
      const compression = this.suspension.clampContactCompression(id, requirement);
      const y = this.chassisY + this.suspension.contactWheelOffsetY(id, compression);
      this.wheels[id] = {
        ...this.wheels[id],
        worldPosition: { x: contacts[id].x, y, z: contacts[id].z },
        surfaceType: contacts[id].surfaceType,
        groundNormal: { ...contacts[id].normal },
      };
    }
  }

  private synchronizeWheelPositions(): void {
    const bodyOriginX = this.x, bodyOriginZ = this.z;
    const sine = Math.sin(this.yaw), cosine = Math.cos(this.yaw);
    for (const id of WHEEL_IDS) {
      const local = wheelLocalPosition(this.config, id);
      this.wheels[id] = {
        ...this.wheels[id],
        worldPosition: {
          x: bodyOriginX + local.x * cosine + local.z * sine,
          y: this.wheels[id].worldPosition.y,
          z: bodyOriginZ - local.x * sine + local.z * cosine,
        },
      };
    }
  }

  /** Contact normals provide longitudinal slope, including heading across a ramp. */
  private getContactGrade(environment: VehicleEnvironment): number {
    const contacts = environment.wheelContacts;
    const vertical = this.suspension.getVerticalSnapshot();
    let normals: GroundNormal[];
    if (contacts === undefined) {
      normals = environment.groundNormal === undefined ? [] : [environment.groundNormal];
    } else if (vertical.active) {
      // Airborne wheels cannot transfer a road plane to the chassis. With no
      // grounded wheel there is also no slope force until contact returns.
      normals = WHEEL_IDS.filter(id => vertical.wheels[id].grounded).map(id => contacts[id].normal);
      if (normals.length === 0) return 0;
    } else {
      normals = [contacts.frontLeft.normal, contacts.frontRight.normal,
        contacts.rearLeft.normal, contacts.rearRight.normal];
    }
    if (normals.length === 0) return clamp(
      this.finiteOr(environment.gradeRadians, 0), -Math.PI * 0.45, Math.PI * 0.45,
    );
    let x = 0;
    let y = 0;
    let z = 0;
    for (const normal of normals) {
      x += this.finiteOr(normal.x, 0);
      y += Math.max(0, this.finiteOr(normal.y, 1));
      z += this.finiteOr(normal.z, 0);
    }
    // dy/ds = -(normal dot forward) / normal.y, forward=(-sin yaw,-cos yaw).
    return clamp(Math.atan2(x * Math.sin(this.yaw) + z * Math.cos(this.yaw),
      Math.max(1e-4, y)), -Math.PI * 0.45, Math.PI * 0.45);
  }

  /**
   * Static axle load is divided across four contacts. Each tyre gets its own
   * drive, brake and resistance budget, so straddling a boundary changes only
   * the contacting side instead of switching the entire car's material.
   */
  private calculateTyreContactForces(
    dt: number,
    environment: VehicleEnvironment,
    grade: number,
    requestedDriveTorque: number,
    otherLongitudinalForce: number,
  ): TyreContactForces {
    const dynamicPressureArea = .5 * this.config.aero.airDensity * this.config.aero.frontalArea * this.speed * this.speed;
    this.frontAeroVerticalForce = dynamicPressureArea * this.config.aero.liftCoefficientFront;
    this.rearAeroVerticalForce = dynamicPressureArea * this.config.aero.liftCoefficientRear;
    // Vertical dynamics runs before the load model so contact state can gate
    // both the 8% floor and supported-weight normalization in the same step.
    const vertical = environment.wheelContacts === undefined
      ? undefined : this.integrateVerticalDynamics(dt, environment.wheelContacts);
    const suspension = this.suspension.update(dt, {
      frontAeroVerticalForce: this.frontAeroVerticalForce, rearAeroVerticalForce: this.rearAeroVerticalForce, speed: this.speed,
      contacts: environment.wheelContacts,
      vertical,
      normal: environment.groundNormal ?? { x: 0, y: Math.cos(grade), z: Math.sin(grade) },
      // Coordinate-speed derivative also contains -v_lateral*yawRate; load
      // transfer must use the actual body-forward force acceleration instead.
      longitudinalAcceleration: this.forces.netForce / Math.max(1, this.effectiveVehicleMass),
      lateralAcceleration: this.lateralAcceleration,
    });
    const frontWeight = clamp(this.config.frontWeightBias, 0.05, 0.95);
    const shares: FourWheelValues = [frontWeight * 0.5, frontWeight * 0.5,
      (1 - frontWeight) * 0.5, (1 - frontWeight) * 0.5];
    const localX: FourWheelValues = [-this.config.frontTrackWidth * 0.5,
      this.config.frontTrackWidth * 0.5, -this.config.rearTrackWidth * 0.5,
      this.config.rearTrackWidth * 0.5];
    const wheelContacts = environment.wheelContacts;
    const contacts = wheelContacts === undefined ? undefined : [
      wheelContacts.frontLeft, wheelContacts.frontRight,
      wheelContacts.rearLeft, wheelContacts.rearRight,
    ];
    const sharedGrip = Math.max(0, this.finiteOr(environment.surfaceGripMultiplier, 1));
    const legacyLongitudinal = sharedGrip * Math.max(0,
      this.finiteOr(environment.surfaceLongitudinalGripMultiplier, 1));
    const legacyLateral = sharedGrip * Math.max(0,
      this.finiteOr(environment.surfaceLateralGripMultiplier, 1));
    const legacyRolling = Math.max(0,
      this.finiteOr(environment.rollingResistanceMultiplier, 1));
    for (const id of WHEEL_IDS) this.surfaceInteraction.update(id, dt, wheelContacts?.[id]);
    const gripLong = shares.map((_, i) => Math.max(0,
      this.finiteOr(wheelContacts ? this.surfaceInteraction.get(WHEEL_IDS[i]!).longitudinalGrip : undefined, legacyLongitudinal)) *
      this.wheelRotation.gripModel.wetRetention(contacts?.[i]?.wetness ?? 0)) as FourWheelValues;
    const gripLat = shares.map((_, i) => Math.max(0,
      this.finiteOr(wheelContacts ? this.surfaceInteraction.get(WHEEL_IDS[i]!).lateralGrip : undefined, legacyLateral)) *
      this.wheelRotation.gripModel.wetRetention(contacts?.[i]?.wetness ?? 0, true)) as FourWheelValues;
    const rolling = shares.map((_, i) => Math.max(0,
      this.finiteOr(wheelContacts ? this.surfaceInteraction.get(WHEEL_IDS[i]!).rollingResistance : undefined, legacyRolling))) as FourWheelValues;
    const loads = WHEEL_IDS.map((id) => suspension.wheels[id].normalLoad) as FourWheelValues;
    // A common nominal tyre load preserves sublinear grip across static axle
    // distributions as well as dynamic transfer. Width never scales friction.
    const tyreReferenceLoad = this.config.mass * this.config.gravity * .25;
    const limits = loads.map((load, i) => this.config.tires.longitudinalGrip * load *
      this.wheelRotation.gripModel.loadFactor(load, tyreReferenceLoad) * gripLong[i]!) as FourWheelValues;
    for (let i = 0; i < 4; i++) this.escLateralLimits[i] = this.config.tires.lateralGrip * loads[i]! *
      this.wheelRotation.gripModel.loadFactor(loads[i]!, tyreReferenceLoad) * gripLat[i]!;
    const control = this.vehicleControl;
    for (let i = 0; i < 4; i++) this.controlGrounded[i] = vertical?.wheels[WHEEL_IDS[i]!].grounded ?? true;
    control.estimator.state.steeringAngle = this.steering.steeringAngle;
    control.estimator.refreshWheels(this.wheels, wheelContacts, loads, this.controlGrounded);
    control.updateStabilityState(dt, limits, this.escLateralLimits);
    const evAxles = this.powertrain.axleOutput;
    const regenerating = this.powertrain.limitRegeneration !== undefined && (requestedDriveTorque * this.speed < 0 ||
      evAxles !== undefined && ((evAxles.frontWheelTorque ?? 0) * this.speed < 0 || (evAxles.rearWheelTorque ?? 0) * this.speed < 0));
    control.resolveServiceBrakes(dt, this.brakes, limits,
      regenerating ? this.config.drivetrainType === 'AWD' ? 'both' : this.config.drivetrainType === 'FWD' ? 'front' : 'rear' : undefined);
    if (regenerating && this.powertrain.limitAxleRegeneration) {
      let frontLimit = Infinity, rearLimit = Infinity;
      for (let i = 0; i < 4; i++) {
        const wheel = this.wheels[WHEEL_IDS[i]!];
        const cornering = Math.sqrt(Math.max(0, 1 - Math.min(1, wheel.lateralUsage) ** 2));
        let limit = limits[i]! * cornering * this.config.wheelRadius * 2 * this.driverAssists.pressures[i]!;
        if (this.driverAssists.pressures[i]! < .98) limit = 0;
        if (i < 2) frontLimit = Math.min(frontLimit, limit);
        else rearLimit = Math.min(rearLimit, limit);
      }
      if ((this.powertrainContext.totalServiceBrakeTorque ?? 0) > 1) {
        frontLimit = Math.min(frontLimit, this.brakes.axleBrakeDemand(true) * Math.min(this.driverAssists.pressures[0]!, this.driverAssists.pressures[1]!));
        rearLimit = Math.min(rearLimit, this.brakes.axleBrakeDemand(false) * Math.min(this.driverAssists.pressures[2]!, this.driverAssists.pressures[3]!));
      }
      this.powertrain.limitAxleRegeneration(frontLimit, rearLimit);
      const output = this.powertrain.axleOutput!;
      requestedDriveTorque = output.drivenWheelTorque;
      this.brakes.setRegenerativeCredit(Math.max(0, -(output.frontWheelTorque ?? 0) * Math.sign(this.speed)),
        Math.max(0, -(output.rearWheelTorque ?? 0) * Math.sign(this.speed)));
    } else if (regenerating) {
      const first = this.config.drivetrainType === 'FWD' ? 0 : 2;
      let maximumRegen = Infinity;
      for (let i = first; i < first + 2; i++) {
        const wheel = this.wheels[WHEEL_IDS[i]!];
        const corneringAvailability = Math.sqrt(Math.max(0, 1 - Math.min(1, wheel.lateralUsage) ** 2));
        maximumRegen = Math.min(maximumRegen, limits[i]! * corneringAvailability * this.config.wheelRadius * 2 * this.driverAssists.pressures[i]!);
        // Rigid single-motor axle cannot release just one wheel. Cut the whole
        // motor immediately while either driven-wheel ABS channel is releasing.
        if (this.driverAssists.pressures[i]! < .98) maximumRegen = 0;
      }
      if ((this.powertrainContext.totalServiceBrakeTorque ?? 0) > 1)
        maximumRegen = Math.min(maximumRegen, this.brakes.axleBrakeDemand(first === 0) *
          Math.min(this.driverAssists.pressures[first]!, this.driverAssists.pressures[first + 1]!));
      requestedDriveTorque = this.powertrain.limitRegeneration!(maximumRegen);
      const credit = Math.abs(requestedDriveTorque);
      this.brakes.setRegenerativeCredit(first === 0 ? credit : 0, first === 2 ? credit : 0);
    }
    // Transmission owns final drive/efficiency; AWD owns axle shares and each
    // configured carrier owns left/right torque distribution.
    const axleOutput = this.powertrain.axleOutput;
    this.differential.distributeTorque(axleOutput ? (this.differential.axle === 'front' ? axleOutput.frontWheelTorque : axleOutput.rearWheelTorque) ?? 0
      : requestedDriveTorque * (this.awd ? 1 - this.awd.rearTorqueSplit : 1), dt);
    this.rearDifferential?.distributeTorque(axleOutput ? axleOutput.rearWheelTorque ?? 0 : requestedDriveTorque * (this.awd?.rearTorqueSplit ?? 0), dt);
    const requestedDrive: FourWheelValues = this.rearDifferential
      ? [this.differential.leftTorque, this.differential.rightTorque, this.rearDifferential.leftTorque, this.rearDifferential.rightTorque]
      : this.differential.axle === 'front'
      ? [this.differential.leftTorque, this.differential.rightTorque, 0, 0]
      : [0, 0, this.differential.leftTorque, this.differential.rightTorque];
    const rollingMagnitudes = loads.map((load, i) =>
      this.config.tires.rollingResistance * load * rolling[i]! *
      this.wheelRotation.tyres.states[WHEEL_IDS[i]!].rollingResistanceFactor) as FourWheelValues;
    const rollingForces = rollingMagnitudes.map((magnitude, i) =>
      -magnitude * Math.tanh((this.speed + this.yawRate * localX[i]!) / 0.2)) as FourWheelValues;
    // Deformation work is dissipative at each contact, including sideways motion.
    // Keep it separate from rolling heat: work spent moving soil is not tyre heat.
    const softLong = this.softLongitudinalForces;
    const softLat = this.softLateralForces;
    for (const i of [0, 1, 2, 3] as const) {
      const id = WHEEL_IDS[i];
      const response = this.surfaceInteraction.get(id);
      if (response.depth <= 0 || response.resistanceStrength <= 0) {
        softLong[i] = softLat[i] = 0;
        continue;
      }
      const vx = this.speed + this.yawRate * localX[i];
      const vz = this.lateralVelocity + this.yawRate * (i < 2 ? -this.config.wheelBase * .5 - this.centerOfMassLocalZ : this.config.wheelBase * .5 - this.centerOfMassLocalZ);
      const velocity = Math.hypot(vx, vz);
      const magnitude = softSurfaceResistance(response, loads[i], velocity,
        this.wheels[id].slipRatio, this.wheelRotation.tyres.states[id].pressureRatio, tyreReferenceLoad);
      // Smooth at rest, bounded to dissipate at most the contact's share of kinetic
      // energy per step. No velocity clamp or pose correction on soft ground.
      const force = Math.min(magnitude * Math.tanh(velocity / .3), loads[i] / this.config.gravity * velocity / Math.max(dt, 1e-4) * .5);
      const scale = velocity > 1e-8 ? -force / velocity : 0;
      softLong[i] = vx * scale;
      softLat[i] = vz * scale;
    }
    const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
    const usage: FourWheelValues = [0, 0, 0, 0];
    const lateral: FourWheelValues = [0, 0, 0, 0];
    const lateralLimits: FourWheelValues = [0, 0, 0, 0];
    const angles: FourWheelValues = [this.steering.leftRoadWheelAngle + suspension.wheels.frontLeft.toeAngle,
      this.steering.rightRoadWheelAngle - suspension.wheels.frontRight.toeAngle,
      suspension.wheels.rearLeft.toeAngle, -suspension.wheels.rearRight.toeAngle];
    const brakeTorques = WHEEL_IDS.map(id => this.brakes.getWheelTorques(id));
    control.arbitrator.captureBrakes(this.brakes.coordinator);
    // A stopped tyre supports static shear on a hill even with zero slip.
    // Solve that dry-contact constraint only near rest and only within actual
    // brake torque AND tyre grip. Moving/locked-wheel braking keeps real slip.
    let staticForces: FourWheelValues | undefined;
    if ((vertical === undefined || vertical.groundedWheels === 4) &&
      Math.hypot(this.speed, this.lateralVelocity) < 0.08 && Math.abs(this.yawRate) < 0.03 &&
      brakeTorques.some(b => b.appliedBrakeTorque + b.appliedHandbrakeTorque > 1) &&
      WHEEL_IDS.every(id => Math.abs(this.wheelRotation.getAngularVelocity(id) * this.config.wheelRadius) < 0.12)) {
      const minimum: FourWheelValues = [0, 0, 0, 0];
      const maximum: FourWheelValues = [0, 0, 0, 0];
      for (const i of [0, 1, 2, 3] as const) {
        const brake = brakeTorques[i]!;
        const capacity = brake.appliedBrakeTorque + brake.appliedHandbrakeTorque;
        const inertiaTorque = this.config.tires.wheelInertia *
          this.wheelRotation.getAngularVelocity(WHEEL_IDS[i]) / Math.max(1e-4, dt);
        const cosine = Math.cos(angles[i]);
        minimum[i] = Math.max(-limits[i], (requestedDrive[i] + inertiaTorque - capacity) /
          this.config.wheelRadius) * cosine;
        maximum[i] = Math.min(limits[i], (requestedDrive[i] + inertiaTorque + capacity) /
          this.config.wheelRadius) * cosine;
      }
      const required = -otherLongitudinalForce - sum(rollingForces.map((f, i) => f * Math.cos(angles[i]!))) -
        this.effectiveVehicleMass * this.speed / Math.max(1e-4, dt);
      const lower = sum(minimum); const upper = sum(maximum);
      if (minimum.every((v, i) => v <= maximum[i]!) && required >= lower && required <= upper) {
        const blend = upper - lower > 1e-6 ? (required - lower) / (upper - lower) : 0;
        staticForces = minimum.map((v, i) => (v + (maximum[i]! - v) * blend) /
          Math.cos(angles[i]!)) as FourWheelValues;
      }
    }
    const driveBody: FourWheelValues = [0, 0, 0, 0];
    const inertiaBody: FourWheelValues = [0, 0, 0, 0];
    const serviceBody: FourWheelValues = [0, 0, 0, 0];
    const handbrakeBody: FourWheelValues = [0, 0, 0, 0];
    const rollingBody: FourWheelValues = [0, 0, 0, 0];
    const lateralScrub: FourWheelValues = [0, 0, 0, 0];
    const rearAvailability: number[] = [];
    let asymmetricLongitudinalMoment = 0;
    let totalYawMoment = 0;
    // Local +Z lever arms measured from CG, distinct from wheel geometry about body origin.
    const frontWheelLeverArmZ = -this.config.wheelBase * 0.5 - this.centerOfMassLocalZ;
    const rearWheelLeverArmZ = this.config.wheelBase * 0.5 - this.centerOfMassLocalZ;
    const wheelLeverArmsZ: FourWheelValues = [frontWheelLeverArmZ, frontWheelLeverArmZ, rearWheelLeverArmZ, rearWheelLeverArmZ];
    const bodyOriginX = this.x, bodyOriginZ = this.z;
    const bodySine = Math.sin(this.yaw), bodyCosine = Math.cos(this.yaw);
    let staticSupported = staticForces !== undefined;
    for (const i of [0, 1, 2, 3] as const) {
      const id = WHEEL_IDS[i];
      const verticalCorner = vertical?.wheels[id];
      const wheelGrounded = verticalCorner === undefined || verticalCorner.grounded;
      const cosine = Math.cos(angles[i]);
      const sine = Math.sin(angles[i]);
      const wheelForwardVelocity = this.speed + this.yawRate * localX[i];
      const wheelLateralVelocity = this.lateralVelocity + this.yawRate * wheelLeverArmsZ[i];
      const brake = brakeTorques[i]!;
      const handbrakeUsage = limits[i] > 1 ? clamp01(brake.appliedHandbrakeTorque / this.config.wheelRadius / limits[i]) : 0;
      const lockedRearAvailability = 1 - (1 - clamp01(this.config.tires.handbrakeRearGripFactor)) *
        handbrakeUsage * handbrakeUsage * (3 - 2 * handbrakeUsage);
      if (i >= 2) rearAvailability.push(lockedRearAvailability);
      const staticLoad = suspension.wheels[id].staticLoad;
      const loadStiffness = Math.max(0.1, loads[i] / Math.max(1, staticLoad));
      const corneringStiffness = (i < 2 ? this.config.tires.corneringStiffnessFront : this.config.tires.corneringStiffnessRear) * 0.5 * loadStiffness;
      const rotation = this.wheelRotation.updateWheel(id, dt, {
        additionalInertia: this.powertrain.wheelInertiaForAxle ? this.powertrain.wheelInertiaForAxle(i < 2) : requestedDrive[i] !== 0 || (this.config.drivetrainType === 'FWD' ? i < 2 : i >= 2)
          ? this.powertrain.drivenWheelInertia ?? 0 : 0,
        camberAngle: suspension.wheels[id].camberAngle * (i % 2 === 0 ? 1 : -1),
        longitudinalSpeed: wheelForwardVelocity * cosine + wheelLateralVelocity * sine,
        lateralSpeed: wheelLateralVelocity * cosine - wheelForwardVelocity * sine,
        driveTorque: requestedDrive[i], brakeTorque: brake.appliedBrakeTorque,
        handbrakeTorque: brake.appliedHandbrakeTorque, normalLoad: loads[i],
        surfaceLongitudinalGrip: gripLong[i],
        surfaceCurve: this.surfaceInteraction.get(id),
        staticNormalLoad: tyreReferenceLoad, surfaceLateralGrip: gripLat[i],
        corneringStiffness, lateralGripAvailability: lockedRearAvailability,
        staticLongitudinalForce: wheelGrounded ? staticForces?.[i] : undefined,
      });
      staticSupported = staticSupported && wheelGrounded && rotation.staticContact;
      const tyreForce = wheelGrounded ? rotation.longitudinalForce : 0;
      usage[i] = wheelGrounded ? rotation.longitudinalUsage : 0;
      lateralLimits[i] = wheelGrounded ? rotation.lateralForceLimit : 0;
      const slipAngle = rotation.slipAngle;
      const tyreLateral = wheelGrounded ? rotation.lateralForce : 0;
      this.tyreAmbientTemperatureC = this.finiteOr(environment.ambientTemperatureC, this.tyreAmbientTemperatureC);
      this.wheelRotation.tyres.accumulate(id, dt, this.tyreAmbientTemperatureC, rollingForces[i],
        rotation.longitudinalSpeed, tyreForce, rotation.angularVelocity * this.config.wheelRadius - rotation.longitudinalSpeed,
        tyreLateral, rotation.lateralSpeed);
      // Torque-derived diagnostics close exactly with wheel inertia. Only the
      // actual slip-derived Fx enters the chassis: never sum the demands twice.
      const driveForce = requestedDrive[i] / this.config.wheelRadius;
      const serviceForce = -rotation.brakeReactionTorque / this.config.wheelRadius;
      const handbrakeForce = -rotation.handbrakeReactionTorque / this.config.wheelRadius;
      driveBody[i] = driveForce * cosine;
      inertiaBody[i] = rotation.rotationalInertiaForce * cosine;
      serviceBody[i] = serviceForce * cosine;
      handbrakeBody[i] = handbrakeForce * cosine;
      rollingBody[i] = rollingForces[i] * cosine + softLong[i];
      lateralScrub[i] = -tyreLateral * sine;
      const longitudinal = (tyreForce + rollingForces[i]) * cosine + lateralScrub[i] + softLong[i];
      lateral[i] = (tyreForce + rollingForces[i]) * sine + tyreLateral * cosine + softLat[i];
      if (!wheelGrounded) {
        // A wheel outside suspension reach cannot transmit road force. Drive
        // and brake reactions still act on the free wheel's inertia, but not
        // on the chassis through a contact patch that does not exist.
        driveBody[i] = inertiaBody[i] = serviceBody[i] = handbrakeBody[i] = 0;
        rollingBody[i] = lateralScrub[i] = 0;
        lateral[i] = 0;
      } else {
        asymmetricLongitudinalMoment += localX[i] * (tyreForce + rollingForces[i] + softLong[i]);
        totalYawMoment += localX[i] * longitudinal + wheelLeverArmsZ[i] * lateral[i];
      }
      const localWheel = wheelLocalPosition(this.config, id);
      const worldX = bodyOriginX + localWheel.x * bodyCosine + localWheel.z * bodySine;
      const worldZ = bodyOriginZ - localWheel.x * bodySine + localWheel.z * bodyCosine;
      const spring = suspension.wheels[id];
      const wheelY = verticalCorner === undefined
        ? (contacts?.[i]?.height ?? 0) + this.config.wheelRadius
        : this.chassisY + verticalCorner.wheelLocalY;
      this.wheels[id] = {
        id,
        tyre: this.wheelRotation.tyres.states[id],
        worldPosition: { x: contacts?.[i]?.x ?? worldX, y: wheelY, z: contacts?.[i]?.z ?? worldZ },
        surfaceType: contacts?.[i]?.surfaceType ?? 'asphalt',
        surfaceDepth: this.surfaceInteraction.get(id).depth,
        estimatedFriction: loads[i] > 1 ? limits[i] / loads[i] : 0,
        softSurfaceResistanceForce: wheelGrounded ? Math.hypot(softLong[i], softLat[i]) : 0,
        groundNormal: { ...(contacts?.[i]?.normal ?? environment.groundNormal ?? { x: 0, y: Math.cos(grade), z: Math.sin(grade) }) },
        normalLoad: loads[i], steeringAngle: angles[i],
        camberAngle: spring.camberAngle, toeAngle: spring.toeAngle,
        driveTorque: requestedDrive[i], driveForce,
        brakeTorque: brake.appliedBrakeTorque, requestedBrakeTorque: brake.requestedBrakeTorque,
        appliedBrakeTorque: brake.appliedBrakeTorque, brakeForce: serviceForce,
        handbrakeTorque: brake.appliedHandbrakeTorque, requestedHandbrakeTorque: brake.requestedHandbrakeTorque,
        appliedHandbrakeTorque: brake.appliedHandbrakeTorque, handbrakeForce,
        rollingResistanceForce: wheelGrounded ? rollingForces[i] : 0, longitudinalForce: tyreForce, lateralForce: tyreLateral,
        suspensionCompression: verticalCorner?.compression ?? spring.compression,
        suspensionVelocity: verticalCorner?.compressionVelocity ?? spring.compressionVelocity,
        suspensionRestCompression: spring.restCompression,
        springForce: verticalCorner?.springForce ?? spring.springForce,
        damperForce: verticalCorner?.damperForce ?? spring.damperForce,
        grounded: wheelGrounded,
        supportForce: verticalCorner?.supportForce ?? 0,
        suspensionLength: verticalCorner?.suspensionLength ??
          this.config.suspension.restLength - spring.compression,
        angularVelocity: rotation.angularVelocity, wheelAngularVelocity: rotation.angularVelocity,
        rotationAngle: rotation.rotationAngle, longitudinalSpeed: rotation.longitudinalSpeed,
        lateralSpeed: rotation.lateralSpeed, slipRatio: rotation.slipRatio, slipAngle,
        longitudinalUsage: rotation.longitudinalUsage, lateralUsage: rotation.lateralUsage, gripUsage: rotation.gripUsage,
      };
    }
    this.tpms.update(dt);
    this.rearLateralGripFactor = rearAvailability.reduce((total, value) => total + value, 0) * 0.5;
    return {
      staticSupported,
      wheelForce: sum(driveBody) + sum(inertiaBody) + sum(lateralScrub),
      powertrainForce: sum(driveBody),
      serviceBrakeForce: sum(serviceBody),
      handbrakeForce: sum(handbrakeBody),
      rollingForce: sum(rollingBody),
      rollingMagnitude: sum(rollingMagnitudes) + Math.abs(sum(softLong)),
      longitudinalForceLimit: sum(limits),
      frontLateralGrip: (gripLat[0] + gripLat[1]) * 0.5,
      rearLateralGrip: (gripLat[2] + gripLat[3]) * 0.5,
      frontLongitudinalUsage: (usage[0] + usage[1]) * 0.5,
      rearLongitudinalUsage: (usage[2] + usage[3]) * 0.5,
      contactYawAcceleration: clamp(asymmetricLongitudinalMoment / Math.max(1, this.config.yawInertia) *
        clamp01(this.config.tires.contactYawInfluence), -0.65, 0.65),
      lateralForce: sum(lateral),
      yawMoment: totalYawMoment,
      lateralForceLimit: sum(lateralLimits),
    };
  }

  /**
   * Real heave integration. Road geometry supplies contact height only; the
   * chassis keeps its own Y and vertical velocity. No path here assigns a
   * ground target to chassisY.
   */
  private integrateVerticalDynamics(dt: number, contacts: WheelContactSet) {
    if (!this.verticalInitialized) {
      // Direct stepFixed callers may not use the scene adapter. Seed the same
      // spawn support plane and attitude that a scene contact sync would.
      this.suspension.synchronizeGroundGeometry(contacts);
      const geometry = averageWheelGroundGeometry(contacts);
      this.chassisY = Number.isFinite(geometry.height) ? geometry.height : 0;
      this.verticalVelocity = 0;
      this.verticalAcceleration = 0;
      this.verticalInitialized = true;
      this.suspension.resetVerticalContact();
    }
    const vertical = this.suspension.updateVertical(dt, {
      chassisY: this.chassisY,
      verticalVelocity: this.verticalVelocity,
      contacts,
    });
    const mass = Math.max(1, this.effectiveVehicleMass);
    const verticalForce = vertical.supportForce + this.frontAeroVerticalForce +
      this.rearAeroVerticalForce - mass * this.config.gravity;
    this.verticalAcceleration = Number.isFinite(verticalForce) ? verticalForce / mass : 0;
    this.verticalVelocity += this.verticalAcceleration * dt;
    this.verticalVelocity = clamp(this.verticalVelocity, -60, 60);
    this.chassisY += this.verticalVelocity * dt;
    this.groundedWheels = vertical.groundedWheels;
    this.resolvePenetration(contacts);
    if (!Number.isFinite(this.chassisY) || !Number.isFinite(this.verticalVelocity)) {
      // Numerical safety only; normal landings never take this path.
      this.chassisY = averageWheelGroundGeometry(contacts).height;
      this.verticalVelocity = 0;
      this.verticalAcceleration = 0;
    }
    return vertical;
  }

  /**
   * Last-resort anti-tunnelling correction. It only moves the chassis when the
   * bump stop has actually been overrun, and removes only downward velocity.
   */
  private resolvePenetration(contacts: WheelContactSet): void {
    let correction = 0;
    for (const id of WHEEL_IDS) {
      const limit = this.suspension.minimumChassisY(id, contacts[id].height);
      if (this.chassisY < limit) correction = Math.max(correction, limit - this.chassisY);
    }
    if (correction <= 1e-6) return;
    this.chassisY += correction;
    if (this.verticalVelocity < 0) this.verticalVelocity = 0;
  }

  private initializeWheelStates(): void {
    const springs = this.suspension.getSnapshot();
    const bodyOriginX = this.x, bodyOriginZ = this.z;
    const sine = Math.sin(this.yaw), cosine = Math.cos(this.yaw);
    for (const id of WHEEL_IDS) {
      const local = wheelLocalPosition(this.config, id);
      const spring = springs.wheels[id];
      const rotation = this.wheelRotation.getSnapshot(id);
      this.wheels[id] = {
        id, worldPosition: { x: bodyOriginX + local.x * cosine + local.z * sine, y: this.chassisY + this.config.wheelRadius,
          z: bodyOriginZ - local.x * sine + local.z * cosine },
        tyre: this.wheelRotation.tyres.states[id],
        surfaceType: 'asphalt', groundNormal: { x: 0, y: 1, z: 0 }, normalLoad: spring.normalLoad,
        steeringAngle: spring.toeAngle * (id.endsWith('Left') ? 1 : -1),
        camberAngle: spring.camberAngle, toeAngle: spring.toeAngle,
        driveTorque: 0, driveForce: 0, brakeTorque: 0, brakeForce: 0,
        requestedBrakeTorque: 0, appliedBrakeTorque: 0,
        handbrakeTorque: 0, handbrakeForce: 0, rollingResistanceForce: 0, longitudinalForce: 0, lateralForce: 0,
        requestedHandbrakeTorque: 0, appliedHandbrakeTorque: 0,
        suspensionCompression: spring.compression, suspensionVelocity: 0, suspensionRestCompression: spring.restCompression,
        springForce: spring.springForce, damperForce: 0,
        angularVelocity: rotation.angularVelocity, wheelAngularVelocity: rotation.angularVelocity,
        rotationAngle: rotation.rotationAngle, longitudinalSpeed: rotation.longitudinalSpeed,
        lateralSpeed: 0, slipRatio: 0, slipAngle: 0,
        longitudinalUsage: 0, lateralUsage: 0, gripUsage: 0,
      };
    }
  }

  /** Only a discontinuous contact/pawl constraint may synchronise wheel spin. */
  private constrainWheelRotation(speed: number): void {
    for (const id of WHEEL_IDS) {
      const local = wheelLocalPosition(this.config, id);
      const angle = this.wheels[id].steeringAngle;
      const forward = speed + this.yawRate * local.x;
      const side = this.lateralVelocity + this.yawRate * (local.z - this.centerOfMassLocalZ);
      const longitudinalSpeed = forward * Math.cos(angle) + side * Math.sin(angle);
      const lateralSpeed = side * Math.cos(angle) - forward * Math.sin(angle);
      this.wheelRotation.constrainAngularVelocity(id, longitudinalSpeed / Math.max(0.01, this.config.wheelRadius),
        longitudinalSpeed, lateralSpeed);
      const rotation = this.wheelRotation.getSnapshot(id);
      this.wheels[id] = { ...this.wheels[id], angularVelocity: rotation.angularVelocity,
        wheelAngularVelocity: rotation.angularVelocity, rotationAngle: rotation.rotationAngle,
        longitudinalSpeed, lateralSpeed, slipRatio: rotation.slipRatio, slipAngle: rotation.slipAngle,
        longitudinalForce: 0, lateralForce: 0, driveForce: 0, brakeForce: 0, handbrakeForce: 0,
        rollingResistanceForce: 0, longitudinalUsage: 0, lateralUsage: 0, gripUsage: 0 };
    }
  }

  private getDrivenWheelAngularVelocity(): number {
    if (this.rearDifferential) {
      const front = this.differential.updateSpeeds(this.wheelRotation.getAngularVelocity('frontLeft'),
        this.wheelRotation.getAngularVelocity('frontRight'));
      const rear = this.rearDifferential.updateSpeeds(this.wheelRotation.getAngularVelocity('rearLeft'),
        this.wheelRotation.getAngularVelocity('rearRight'));
      return this.awd ? this.awd.updateSpeeds(front, rear) : rear;
    }
    const front = this.differential.axle === 'front';
    return this.differential.updateSpeeds(
      this.wheelRotation.getAngularVelocity(front ? 'frontLeft' : 'rearLeft'),
      this.wheelRotation.getAngularVelocity(front ? 'frontRight' : 'rearRight'));
  }

  private getDifferentialSnapshot(): DifferentialSnapshot {
    this.getDrivenWheelAngularVelocity();
    return this.differential.getSnapshot();
  }

  private updateControlMode(requestedMode: VehicleControlMode): void {
    this.controlMode = this.powertrain.setControlMode(requestedMode);
  }

  private processShiftCommands(input: VehicleInputState): void {
    const shiftUp = input.shiftUp === true;
    const shiftDown = input.shiftDown === true;
    if (this.transmission.type !== 'MANUAL') {
      // Near-rest brake gating separates PRND requests from optional D ratio requests.
      // Stop at the ends: D must never wrap straight into P. Explicit selector
      // requests take priority and use the existing prepare/safety path.
      const direction = shiftUp && !this.previousShiftUp && !shiftDown ? 1
        : shiftDown && !this.previousShiftDown && !shiftUp ? -1 : 0;
      if (input.returnToAuto === true) this.transmission.returnToAuto?.();
      if (input.driveSelector === undefined && direction !== 0) {
        const current = this.transmission.getSnapshot().selectedMode ?? 'P';
        const selectorAllowed = Math.hypot(this.speed, this.lateralVelocity) < 2 / 3.6 && input.brake >= .1;
        if (selectorAllowed) {
          const selectors: readonly DriveSelector[] = ['P', 'R', 'N', 'D'];
          const next = selectors[selectors.indexOf(current) + direction];
          if (next !== undefined) this.requestDriveSelector(next, input.brake);
        } else if (current === 'D' && this.capabilities.manualSelection && input.returnToAuto !== true) {
          this.transmission.requestManualSelection?.(direction);
        }
      }
    } else if (input.directGear !== undefined) {
      this.requestGear(input.directGear, this.controlMode);
    } else if (shiftUp && !this.previousShiftUp && !shiftDown) {
      const gear = this.powertrain.getShiftGear(1);
      if (gear !== null) this.requestGear(gear, this.controlMode);
    } else if (shiftDown && !this.previousShiftDown && !shiftUp) {
      const gear = this.powertrain.getShiftGear(-1);
      if (gear !== null) this.requestGear(gear, this.controlMode);
    }
    this.previousShiftUp = shiftUp;
    this.previousShiftDown = shiftDown;
  }

  private acceptShift(): void {
    this.shiftRejected = false;
    this.shiftRejectionReason = null;
    this.shiftEventSequence += 1;
  }

  private rejectShift(reason: ShiftRejectionReason): false {
    this.shiftRejected = true;
    this.shiftRejectionReason = reason;
    this.shiftEventSequence += 1;
    return false;
  }

  private applyWorldBounds(bounds: VehicleWorldBounds | undefined): void {
    if (bounds === undefined) return;
    if (![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)) return;
    if (bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) return;
    const boundedX = clamp(this.x, bounds.minX, bounds.maxX);
    const boundedZ = clamp(this.z, bounds.minZ, bounds.maxZ);
    if (boundedX !== this.x || boundedZ !== this.z) {
      this.x = boundedX;
      this.z = boundedZ;
      this.speed = 0;
      this.acceleration = 0;
      this.yawRate = 0;
      this.bodySlipAngle = 0;
      this.lateralVelocity = 0;
      this.lateralAcceleration = 0;
      this.constrainWheelRotation(0);
    }
  }

  private validateOrRecover(): void {
    const values = [
      this.centerOfMassX,
      this.centerOfMassZ,
      this.x,
      this.z,
      this.yaw,
      this.speed,
      this.acceleration,
      this.yawRate,
      this.bodySlipAngle,
      this.lateralVelocity,
      this.lateralAcceleration,
      this.rearLateralGripFactor,
      this.chassisY,
      this.verticalVelocity,
      this.verticalAcceleration,
      this.torqueSource.shaftAngularVelocity,
      this.powertrain.variableMassKg,
      this.brakes.brakeInput,
      this.brakes.handbrakeInput,
      ...WHEEL_IDS.flatMap(id => [this.wheelRotation.getSnapshot(id).angularVelocity,
        this.wheelRotation.getSnapshot(id).rotationAngle, this.wheels[id].slipRatio]),
    ];
    const positionIsReasonable =
      Math.abs(this.x) <= this.config.safety.maxAbsPosition &&
      Math.abs(this.z) <= this.config.safety.maxAbsPosition;
    if (this.powertrain.numericallyValid && values.every(Number.isFinite) && positionIsReasonable) {
      this.storeLastValidState();
      return;
    }

    this.centerOfMassX = this.lastValidState.centerOfMassX;
    this.centerOfMassZ = this.lastValidState.centerOfMassZ;
    this.yaw = this.lastValidState.yaw;
    this.speed = this.lastValidState.speed;
    this.acceleration = 0;
    this.yawRate = this.lastValidState.yawRate;
    this.bodySlipAngle = this.lastValidState.bodySlipAngle;
    this.lateralVelocity = this.lastValidState.lateralVelocity;
    this.contactSlipRecovery = this.lastValidState.contactSlipRecovery;
    this.contactSlipHoldTime = this.lastValidState.contactSlipHoldTime;
    this.lateralAcceleration = -this.speed * this.yawRate;
    this.rearLateralGripFactor = 1;
    this.chassisY = this.lastValidState.chassisY;
    this.verticalVelocity = this.lastValidState.verticalVelocity;
    this.verticalAcceleration = 0;
    this.groundedWheels = 4;
    this.verticalInitialized = false;
    this.powertrain.reset(this.lastValidState.powertrain, true);
    this.controlMode = this.lastValidState.controlMode;
    this.synchronizePowertrainMass();
    this.brakes.reset();
    this.parkingBrake?.reset(this.powertrain.vehicleOperational, this.transmission.getSnapshot().selectedMode === 'P');
    this.autoHold?.reset();
    this.differential.reset(); this.rearDifferential?.reset();
    this.steering.reset();
    this.suspension.reset();
    this.wheelRotation.reset(this.speed);
    this.surfaceInteraction.reset();
    this.differential.distributeTorque(0);
    this.rearDifferential?.distributeTorque(0);
    this.awd?.reset();
    this.driverAssists.esc.reset();
    this.initializeWheelStates();
    this.forces = { ...ZERO_FORCES };
    this.recoveredThisUpdate = true;
  }

  private storeLastValidState(): void {
    const state = this.lastValidState;
    state.centerOfMassX = this.centerOfMassX; state.centerOfMassZ = this.centerOfMassZ;
    state.yaw = this.yaw; state.speed = this.speed;
    state.controlMode = this.controlMode; state.bodySlipAngle = this.bodySlipAngle;
    state.lateralVelocity = this.lateralVelocity;
    state.chassisY = this.chassisY; state.verticalVelocity = this.verticalVelocity;
    state.contactSlipRecovery = this.contactSlipRecovery;
    state.contactSlipHoldTime = this.contactSlipHoldTime; state.yawRate = this.yawRate;
    state.powertrain = this.powertrain.captureState(state.powertrain);
  }

  private safeUnitInput(value: number): number {
    return clamp01(this.finiteOr(value, 0));
  }

  private updateUpshiftRecommendation(): void { this.powertrain.finishStep(this.speed); }

  private finiteOr(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) ? value : fallback;
  }

}
