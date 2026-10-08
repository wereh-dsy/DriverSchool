/** Forward gears supported by the shared transmission model. */
export type ForwardGear = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Every vehicle keeps the original five ratios, while performance presets may
 * opt into sixth and seventh.  Keeping the upper ratios optional lets the
 * family sedan remain a genuine five-speed instead of carrying dummy gears.
 */
export type ForwardGearRatios = Readonly<Partial<Record<ForwardGear, number>>>;

/** Public gear identifier used by input, transmission, and HUD code. */
export type Gear = 'R' | 'N' | ForwardGear;

export type TransmissionType = 'MANUAL' | 'TORQUE_CONVERTER_AT' | 'DCT' | 'CVT';
export type DriveSelector = 'P' | 'R' | 'N' | 'D';

export interface AutomaticShiftMapPoint {
  throttle: number;
  upshiftRPM: number;
  downshiftRPM: number;
}

export interface AutomaticShiftConfig {
  map: readonly AutomaticShiftMapPoint[];
  /** One lower road-speed bound for each upshift, in m/s. */
  minimumUpshiftSpeeds: readonly number[];
  hysteresisRPM: number;
  minimumTimeInGear: number;
  kickdownThrottle: number;
  kickdownTargetRPM: number;
  kickdownMaximumRPM: number;
  /** Small gear-specific corrections to the interpolated upshift RPM. */
  gearRPMCorrections?: readonly number[];
}

export interface TorqueConverterConfig {
  /** Hydrodynamic pump torque = coefficient * pump rad/s squared * slip fraction. */
  pumpTorqueCoefficient: number;
  torqueRatioCurve: readonly { speedRatio: number; torqueRatio: number }[];
  maximumPumpTorque: number;
  backdriveCoupling: number;
  lockupCapacity: number;
  lockupStiffness: number;
  lockupApplyRate: number;
  lockupReleaseRate: number;
  lockupMinimumSpeed: number;
  lockupMinimumSpeedRatio: number;
  lockupMaximumThrottle: number;
}

export interface AutomaticTransmissionConfig {
  converter: TorqueConverterConfig;
  shiftStrategy: AutomaticShiftConfig;
  /** Remaining driveline capacity during a ratio change. */
  shiftTorqueFactor: number;
  parkMaximumSpeed: number;
}

export interface DualClutchTransmissionConfig {
  shiftStrategy: AutomaticShiftConfig;
  clutchCapacity: number;
  couplingStiffness: number;
  clutchApplyRate: number;
  clutchReleaseRate: number;
  creepEngagement: number;
  launchFullyEngagedSpeed: number;
  unexpectedShiftDelay: number;
  parkMaximumSpeed: number;
}

export interface TorqueCurvePoint {
  /** Engine speed in revolutions per minute. */
  rpm: number;
  /** Full-throttle crankshaft torque in newton metres. */
  torque: number;
}

/**
 * Calibration for the dashboard's everyday-driving upshift advice.
 *
 * This is deliberately not the rev limiter. A family car can recommend the
 * next gear around 1,500--2,500 rpm while still retaining a normal petrol
 * engine redline near 6,000 rpm for overtaking and low-gear acceleration.
 */
export interface ShiftRecommendationConfig {
  /** Target at closed/light throttle, in rpm. */
  lightLoadRPM: number;
  /** Highest everyday-driving target, reached near full throttle. */
  highLoadRPM: number;
  /** Shapes throttle load before interpolating between the two targets. */
  throttleCurveExponent: number;
  /** Small extra allowance in first gear to avoid an immediate launch prompt. */
  firstGearOffsetRPM: number;
  /** Do not recommend an upshift below this road speed. */
  minimumSpeedKmh: number;
  /** Prevents the recommendation flickering as rpm crosses its target. */
  hysteresisRPM: number;
}

/** Effective normalized-shaft parameters, not a compressor/turbine map. */
export interface TurbochargerConfig {
  enabled: boolean;
  /** Effective inertia of normalized speed; torque parameters use the same scale. */
  inertia: number;
  pressureGain: number;
  /** Absolute/ambient pressure ratio, not gauge boost. Ambient is 1 bar. */
  maxPressureRatio: number;
  turbineDriveStrength: number;
  compressorLoadStrength: number;
  friction: number;
  wastegateGain: number;
  /** Approximate unboosted full-load combustion torque, in Nm. */
  baseTorqueCurve: readonly TorqueCurvePoint[];
}

/** Conventional belt variator with a hydrodynamic launch/lockup unit, not e-CVT. */
export interface CVTConfig {
  minimumRatio: number;
  maximumRatio: number;
  ratioChangeRate: number;
  targetRPMResponse: number;
  targetRPMCurve: readonly { throttle: number; rpm: number }[];
  parkMaximumSpeed: number;
  converter: TorqueConverterConfig;
}

export interface EngineConfig {
  /** Optional starter/shutdown rotation; steady-state combustion calibration is unchanged. */
  ignitionSequence?: { crankingDuration: number; crankingRPM: number; flareRPM: number;
    settlingDuration: number; shutdownFriction: number };
  /** Swept volume used by the lightweight fuel-loss approximation, litres. */
  displacementL: number;
  /** Omitted/disabled: preserve the original naturally aspirated torque path. */
  turbo?: TurbochargerConfig;
  /** Mild throttle-to-combustion curve; 1 keeps the full-load curve linear. */
  partThrottleExponent: number;
  /** Residual closed-throttle airflow; used only by the existing MT presets. */
  revHang?: { enabled: boolean; holdTime: number; decayTime: number; strength: number };
  idleRPM: number;
  /** Below this speed a running engine can no longer sustain combustion. */
  stallRPM: number;
  /** Maximum torque available from the idle-speed governor, in Nm. */
  idleControlMaxTorque: number;
  /** RPM drop over which the idle governor ramps from base compensation to maximum. */
  idleControlBandRPM: number;
  /** Canonical idle-governor strength. Mirrors idleControlMaxTorque for V0 compatibility. */
  idleControlStrength: number;
  /** Economy/daily-driving advice; separate from redline protection. */
  shiftRecommendation: ShiftRecommendationConfig;
  /** RPM at which the dashboard should show a redline warning. */
  redlineWarningRPM: number;
  redlineRPM: number;
  /** Fuel-cut threshold. Kept separate so soft/hard limiters can be modelled later. */
  revLimiterRPM: number;
  revLimiterType: 'soft' | 'hard';
  /** Hard safety limit, normally slightly above the redline. */
  maxRPM: number;
  /** Rotating inertia at the crankshaft in kg m². */
  engineInertia: number;
  /** Near-constant bearing/accessory loss, in Nm. */
  engineFrictionTorque: number;
  /** Speed-dependent closed-throttle pumping loss at redline, in Nm. */
  engineBrakingStrength: number;
  /** Maximum closed-throttle drag torque at the redline, in Nm. */
  engineBraking: number;
  /** Canonical accelerator build rate, in s^-1. */
  throttleResponseRate: number;
  /** First-order response rate of the physical throttle, in s^-1. */
  throttleResponse: number;
  /** Faster return rate when the driver lifts, in s^-1. */
  throttleReleaseResponse: number;
  /** Reserved for a future time-based starter model, in Nm. */
  starterTorque: number;
  /** Full-boost ceiling when turbo is enabled; ordinary full-load curve otherwise. */
  torqueCurve: readonly TorqueCurvePoint[];
}

export interface TransmissionConfig {
  /** Lightweight torque-reversal take-up, measured at the clutch in Nm. */
  drivetrainLash?: { reversalTime: number; torqueDeadzone: number };
  /** Omitted by legacy presets: manual remains the exact original default. */
  type?: TransmissionType;
  automatic?: AutomaticTransmissionConfig;
  dct?: DualClutchTransmissionConfig;
  cvt?: CVTConfig;
  /** Reverse is negative so wheel torque naturally points backwards. */
  reverseRatio: number;
  gearRatios: ForwardGearRatios;
  finalDrive: number;
  /** Canonical name for finalDrive; both remain equal in the default calibration. */
  finalDriveRatio: number;
  /** Fraction of crank torque remaining after gearbox/final-drive losses. */
  efficiency: number;
  /** Canonical name for efficiency. */
  drivetrainEfficiency: number;
  /** Mechanical ratio-swap delay; the actuator may add its own sequencing time. */
  shiftTime: number;
  /** Forward speed above which reverse selection is redirected to neutral. */
  reverseLockoutSpeed: number;
  /** Required pedal-down fraction for a manual-clutch shift. */
  minimumClutchDisengagementForShift: number;
  /** Reserved normalized synchronizer authority. */
  synchroStrength: number;
}

export interface ClutchConfig {
  /** Canonical maximum transmitted torque, in Nm. */
  maxClutchTorque: number;
  /** Maximum crankshaft torque the clutch can transmit, in Nm. */
  maxTorque: number;
  /** Pedal-down fraction at which torque first becomes available while releasing. */
  bitePointStart: number;
  /** Pedal-down fraction at which the progressive bite region is complete. */
  bitePointEnd: number;
  /** Named curve makes future vehicle presets self-documenting. */
  engagementCurve: 'linear' | 'progressive';
  /** Curve exponent applied between bitePointStart and bitePointEnd. */
  engagementCurveExponent: number;
  /** Shapes torque capacity near the bite point without changing pedal travel. */
  torqueCapacityExponent: number;
  /** Slip correction torque per rad/s of slip. */
  couplingStiffness: number;
  /** Maximum mechanical engagement change per second while opening. */
  disengagementRate: number;
  /** Maximum mechanical engagement change per second while closing. */
  engagementRate: number;
  /** Manual shifts are rejected above this actual engagement. */
  manualShiftMaxEngagement: number;
}

/**
 * Calibration for the automatic actuator. It is intentionally separate from
 * the mechanical clutch data so a three-pedal controller can bypass it without
 * bypassing clutch slip or torque-capacity physics.
 */
export interface AutoClutchConfig {
  /** Time held fully open while the gearbox swaps ratios. */
  gearChangeDelay: number;
  /** Actual engagement below which an automatic shift may swap ratios. */
  shiftDisengagedThreshold: number;
  /** Vehicle speed at which launch assistance may fully close the clutch. */
  launchFullyEngagedSpeed: number;
  /** Initial bite point used when launching with throttle. */
  launchMinimumEngagement: number;
  /** Fraction of idle RPM where anti-stall begins opening the clutch. */
  antiStallRPMFraction: number;
  /** Controller-side engagement recovery rate after manual-mode takeover. */
  takeoverRate: number;
}

export interface BrakeConfig {
  pedalCurveExponent: number;
  /** Hydraulic pressure build/release rates, in s^-1; no ABS modulation. */
  applyResponse: number;
  releaseResponse: number;
  /** Maximum axle brake torque values, in Nm. */
  maxBrakeTorqueFront: number;
  maxBrakeTorqueRear: number;
  /** Hydraulic front share; exposed separately from axle hardware capacities. */
  frontBrakeBias: number;
  maxBrakeForce: number;
  /** Maximum parking-brake torque at its configured axle, in Nm. */
  handbrakeTorque: number;
  handbrakeAxle: 'front' | 'rear';
  /** Peak longitudinal force from the mechanically separate handbrake. */
  maxHandbrakeForce: number;
  /** First-order hydraulic/input response rate, in s^-1. */
  response: number;
  /** Faster cable/electric parking-brake input response, in s^-1. */
  handbrakeResponse: number;
}

export interface SteeringConfig {
  returnProfile?: { lowSpeedRate: number; highSpeedRate: number; speedReference: number };
  /** Canonical maximum road-wheel centre angle at parking speed, in radians. */
  maxRoadWheelAngle: number;
  /** Maximum road-wheel angle at parking speed, in radians. */
  maxSteeringAngle: number;
  /** Total steering-wheel travel from full left to full right, in radians. */
  steeringWheelLock: number;
  /** Steering-wheel angle divided by road-wheel angle. */
  steeringRatio: number;
  /** Rate used to approach a commanded steering position, in s^-1. */
  steeringResponse: number;
  /** Faster rate used to self-centre after the input is released, in s^-1. */
  steeringReturnRate: number;
  /** Rack-output smoothing rate, in s^-1, after driver-input smoothing. */
  steeringDamping: number;
  /** Canonical speed-sensitivity coefficient. */
  highSpeedSteeringReduction: number;
  /** @deprecated Legacy coefficient; new racks use reference speed and a finite authority floor. */
  highSpeedReduction: number;
  /** Speed at the midpoint between full steering and the authority floor, in m/s. */
  highSpeedReferenceSpeed: number;
  highSpeedMinimumAuthority: number;
  /** Zero gives parallel front wheels; one gives ideal Ackermann geometry. */
  ackermannFactor: number;
  /** Scales the inertia-derived yaw response without bypassing yawInertia. */
  yawResponseScale: number;
  minimumYawResponseRate: number;
  maximumYawResponseRate: number;
  /** Legacy V0 calibration only; four-wheel dynamics no longer adds artificial yaw gain. */
  handbrakeOversteerGain: number;
  /** Absolute spin guard, in rad/s. */
  maximumYawRate: number;
}

export interface AeroConfig {
  dragCoefficient: number;
  frontalArea: number;
  airDensity: number;
  /** Reserved axle lift coefficients; negative values represent downforce. */
  liftCoefficientFront: number;
  liftCoefficientRear: number;
}

export interface TireConfig {
  /** Mild friction-coefficient sensitivity to load relative to static wheel load. */
  loadSensitivity?: number;
  /** Rotational inertia of each wheel/tyre assembly, kg m². */
  wheelInertia: number;
  rollingResistance: number;
  /** Canonical dry-road longitudinal and lateral friction coefficients. */
  longitudinalGrip: number;
  lateralGrip: number;
  /** Legacy shared coefficient, retained for existing vehicle presets. */
  gripCoefficient: number;
  /** Small-angle axle cornering stiffness, in N/rad. */
  corneringStiffnessFront: number;
  corneringStiffnessRear: number;
  /** Slip-angle recovery with normal rear grip, in s^-1. */
  lateralSlipRecoveryRate: number;
  /** Remaining rear lateral grip at full handbrake. */
  handbrakeRearGripFactor: number;
  /** Stable guard for body/velocity separation, in radians. */
  maximumBodySlipAngle: number;
  /** Shared-grip budget rounding strength; larger values give stronger combined-force interaction. */
  combinedGripLateralReduction: number;
  /** Scales left/right contact-force yaw moments without adding a rigid-body solver. */
  contactYawInfluence: number;
  /** Slip ratio and slip angle at the respective continuous force peaks. */
  peakSlipRatio: number;
  peakSlipAngle: number;
  gripFalloff: number;
}

export interface SuspensionConfig {
  /** Loaded, flat-road underfloor clearance, metres; not the unloaded strut length. */
  rideHeight: number;
  /** Unloaded spring strut length; compression is measured from this length. */
  restLength: number;
  springRateFront: number;
  springRateRear: number;
  damperCompressionFront: number;
  damperCompressionRear: number;
  damperReboundFront: number;
  damperReboundRear: number;
  /** Total usable travel about load / springRate static compression. */
  suspensionTravel: number;
  /** Progressive support within the final part of compression travel. */
  bumpStopStartRatio: number;
  bumpStopStiffness: number;
  /** Per-axle mechanical left/right coupling, N/m. */
  antiRollStiffnessFront: number;
  antiRollStiffnessRear: number;
  /** @deprecated Compatibility total; no extra visual roll suppression. */
  antiRollStiffness: number;
}

export interface DriverAidConfig {
  hillHoldEnabled: boolean;
  hillHoldDuration: number;
  antiStallStrength: number;
  absEnabled: boolean;
  ebdEnabled?: boolean;
  tractionControlEnabled: boolean;
  stabilityControlEnabled: boolean;
  /** Optional vehicle calibration; omitted fields use conservative road-car values. */
  esc?: {
    minimumSpeed?: number;
    yawErrorThreshold?: number;
    sideslipThreshold?: number;
    maximumBrakeGripFraction?: number;
    response?: number;
  };
  autoBlipEnabled: boolean;
}

export interface SimulationSafetyConfig {
  /** Largest integration slice accepted by the internal sub-stepper. */
  maxSubstep: number;
  /** A long frame is capped so resuming a hidden tab cannot explode the state. */
  maxFrameTime: number;
  maxForwardSpeed: number;
  maxReverseSpeed: number;
  /** Position outside this square is considered corrupt if no world bounds exist. */
  maxAbsPosition: number;
}

/**
 * All handling-affecting data for a vehicle. Values use SI units unless noted.
 * Visual/cockpit measurements intentionally live in a separate visual config.
 */
export type VehicleDriveMode = 'ECO' | 'NORMAL' | 'SPORT';
/** Optional calibration only; existing engine, rack, shift controller and AWD own behavior. */
export interface DriveModeCalibration {
  throttleExponent: number;
  throttleResponse: number;
  shiftStrategy: AutomaticShiftConfig;
  steeringResponse: number;
  steeringDamping: number;
  accelerationRearTorqueSplit: number;
}

export interface VehiclePhysicsConfig {
  fuel: FuelConfig;
  driveModes?: Readonly<Record<VehicleDriveMode, DriveModeCalibration>>;
  /** Exterior envelope and wheel geometry, in metres. */
  length: number;
  width: number;
  height: number;
  /** Base vehicle mass excluding consumable fuel, kg. */
  mass: number;
  wheelBase: number;
  frontTrackWidth: number;
  rearTrackWidth: number;
  /** Compatibility average; use the per-axle values for new systems. */
  trackWidth: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Static front-axle load share. */
  frontWeightBias: number;
  centerOfMassHeight: number;
  /** Positive moves the configured centre of mass toward the front axle. */
  centerOfMassLongitudinalOffset: number;
  /** Body yaw moment of inertia, in kg m². */
  yawInertia: number;
  /** AWD uses two independent open axle carriers. */
  drivetrainType: 'FWD' | 'RWD' | 'AWD';
  /** Only an open carrier is implemented; omitted legacy presets default to open. */
  differentialType?: 'open';
  frontTorqueSplit: number;
  rearTorqueSplit: number;
  /** Nominal split reuses frontTorqueSplit/rearTorqueSplit above. */
  awd?: {
    mode: 'full-time' | 'on-demand';
    accelerationRearTorqueSplit?: number;
    maximumRearTorqueSplit?: number;
    /** First-order axle distribution response, s^-1. */
    response?: number;
  };
  /** @deprecated Compatibility alias for drivetrainType. */
  drivetrainLayout: 'FWD' | 'RWD' | 'AWD';
  /** Static vehicle weight carried by driven wheels; used for launch grip. */
  drivenWheelWeightFraction: number;
  gravity: number;
  engine: EngineConfig;
  transmission: TransmissionConfig;
  clutch: ClutchConfig;
  autoClutch: AutoClutchConfig;
  brakes: BrakeConfig;
  steering: SteeringConfig;
  aero: AeroConfig;
  tires: TireConfig;
  suspension: SuspensionConfig;
  driverAids: DriverAidConfig;
  safety: SimulationSafetyConfig;
}

export interface FuelConfig {
  tankCapacityL: number;
  defaultFuelL: number;
  /** Petrol density, kg/L. */
  fuelDensity: number;
  /** Approximate best conversion of fuel energy to crankshaft work. */
  peakThermalEfficiency: number;
  /** Range seed until a useful moving consumption history exists. */
  referenceConsumptionLPer100km: number;
}
