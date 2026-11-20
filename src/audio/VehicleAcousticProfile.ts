import type { VehicleCabinAcousticsProfile } from './VehicleCabinAcoustics';
import type { VehicleChimeKind, VehicleChimeVoice } from './VehicleAudioProfile';

export type PowertrainAcousticKind = 'ICE' | 'MILD_HYBRID' | 'P2_PHEV' | 'EHS_PHEV' | 'EV';

export type EngineLayoutAcoustic = 'INLINE' | 'V' | 'FLAT_PLANE_V' | 'W';

export type StarterAcousticType =
  | 'NONE'
  | 'CONVENTIONAL'
  | 'ISG_48V'
  | 'P2_HYBRID'
  | 'P1_HIGH_RPM'
  | 'HIGH_TORQUE_SPORT';

export type ShiftEventStyle =
  | 'NONE'
  | 'MANUAL_CLUNK'
  | 'AT_SMOOTH'
  | 'DCT_CRISP'
  | 'DCT_POP'
  | 'LST_SNAP'
  | 'EV_TWO_SPEED';

export type TransmissionAcousticType =
  | 'MANUAL'
  | 'AT'
  | 'DCT'
  | 'CVT'
  | 'LST'
  | 'P2_9HAT'
  | 'EHS_DIRECT'
  | 'EV_SINGLE'
  | 'EV_TWO_SPEED';

export type ElectricMachineRole =
  | 'TRACTION_REAR'
  | 'TRACTION_FRONT'
  | 'P2_HYBRID'
  | 'EHS_P3_DRIVE'
  | 'EHS_P1_GENERATOR';

export type ElectricMotorAcousticType = 'PMSM' | 'INDUCTION' | 'ISG';

/**
 * Turbocharger acoustic signature (present only on turbocharged vehicles).
 * Driven by physical boost pressure when available, or calibrated load/RPM.
 */
export interface TurboAcousticSignature {
  readonly spoolBaseHz: number;
  readonly spoolSweepHz: number;
  readonly spoolGain: number;
  readonly whooshGain: number;
  readonly whooshFreqHz: number;
  readonly blowoffLevel: number;
  readonly blowoffFreqHz: number;
  readonly maxBoostBar: number;
  readonly usePhysicalBoost: boolean;
}

/**
 * Overrun / throttle-lift deceleration acoustic signature.
 */
export interface OverrunAcousticSignature {
  /** Fraction of exhaust body retained during closed-throttle deceleration (0..1). */
  readonly bodyRetention: number;
  /** Low-frequency pumping rumble gain on deceleration. */
  readonly rumbleGain: number;
  /** Center frequency for decel pumping resonance, Hz. */
  readonly rumbleHz: number;
  /** Subtle exhaust crackle/burble intensity on lift-off (0 for family/luxury). */
  readonly popIntensity: number;
  /** Minimum RPM for overrun burble events. */
  readonly popMinRPM: number;
  /** Minimum RPM drop rate or throttle-lift threshold sensitivity (0..1). */
  readonly sportPopMultiplier: number;
}

/**
 * Complete combustion engine acoustic signature.
 * Separates combustion harmonics, RPM spectral bands, intake, exhaust cavity,
 * valvetrain mechanicals, turbocharger, and overrun behavior.
 */
export interface EngineAcousticSignature {
  readonly cylinderCount: number;
  readonly layout: EngineLayoutAcoustic;
  /** Nominal firing order label (engineering metadata for character audit). */
  readonly firingOrder: string;
  readonly displacementL: number;
  readonly idleRPM: number;
  readonly redlineRPM: number;
  readonly maxRPM: number;

  // Combustion harmonics & pulse texture
  readonly pulseHarmonics: readonly number[];
  readonly bodyHarmonics: readonly number[];
  /** Relative to 4-stroke firing frequency (e.g. 0.5 = half-order growl, 1.0 = flat-plane). */
  readonly bodyOrder: number;
  /** Upper firing harmonic order (e.g. 1.5, 2.0, 2.5, 3.0). */
  readonly upperOrder: number;
  readonly primaryGain: number;
  readonly bodyGain: number;
  readonly upperGain: number;
  /** Micro-detune roughness in cents (lower = silkier V12/I6, higher = raw I4/V8). */
  readonly roughnessCents: number;
  readonly roughnessRateHz: number;
  /** Firing-rate-modulated combustion gas texture noise. */
  readonly pulseNoiseGain: number;
  readonly pulseNoiseFreqHz: number;
  readonly pulseNoiseQ: number;

  // Multi-zone RPM presence & spectral evolution (idle / low / mid / high)
  readonly idlePresence: number;
  readonly lowPresence: number;
  readonly midPresence: number;
  readonly highPresence: number;
  /** Extra upper-order bloom at high RPM (gives high-rev NA/I6/V8 soaring top end). */
  readonly highRpmUpperBloom: number;

  // Load & drive-mode dynamics
  readonly loadDepth: number;
  readonly loadCutoffBoostHz: number;
  readonly sportPresence: number;
  readonly ecoPresence: number;
  /** Extra cutoff brightness multiplier in Sport / Race modes. */
  readonly sportBrightness: number;

  // Exhaust & muffler resonance cavity (dual-formant + nonlinear combustion saturation)
  readonly exhaustGain: number;
  readonly exhaustBaseCutoffHz: number;
  readonly exhaustRpmSlope: number;
  /** Primary low-mid muffler/tailpipe resonance formant, Hz. */
  readonly exhaustResonanceHz: number;
  readonly exhaustResonanceQ: number;
  readonly exhaustResonanceGainDb: number;
  /** Secondary mid-high character formant (bark / metallic edge / I6 tenor / V8 trumpet), Hz. */
  readonly exhaustCharacterHz: number;
  readonly exhaustCharacterQ: number;
  readonly exhaustCharacterGainDb: number;
  /** Nonlinear exhaust/combustion waveshaper drive (0 = linear luxury, 0.85 = raw hypercar roar). */
  readonly combustionDrive: number;

  // Intake plenum / induction
  readonly intakeGain: number;
  readonly intakeBaseHz: number;
  readonly intakeRpmSlope: number;
  readonly intakeLoadBoostHz: number;
  readonly intakeQ: number;
  readonly intakeLoadExponent: number;

  // Valvetrain & mechanical rotating assembly
  readonly mechanicalOrder: number;
  readonly mechanicalGain: number;
  readonly mechanicalWave: OscillatorType;

  // Optional turbo & overrun
  readonly turbo?: TurboAcousticSignature;
  readonly overrun: OverrunAcousticSignature;
  readonly busLevel: number;
}

/**
 * Acoustic model for a single electric machine (traction motor or P1 generator).
 */
export interface ElectricMachineAcousticSignature {
  readonly role: ElectricMachineRole;
  readonly motorType: ElectricMotorAcousticType;
  readonly maxRPM: number;
  readonly maxTorque: number;
  /** Effective electromagnetic pole-pair / slot order for tonal scaling. */
  readonly polePairs: number;
  readonly baseHz: number;
  readonly sweepHz: number;
  readonly wave: OscillatorType;
  readonly harmonicOrder: number;
  readonly harmonicWave: OscillatorType;
  readonly baseLevel: number;
  readonly loadGain: number;
  readonly harmonicGain: number;
  /** Audible inverter switching sideband center & sweep, Hz. */
  readonly inverterCarrierHz: number;
  readonly inverterSweepHz: number;
  readonly inverterGain: number;
  readonly inverterQ: number;
  /** Reduction gear tooth mesh pitch & level. */
  readonly gearMeshBaseHz: number;
  readonly gearMeshSweepHz: number;
  readonly gearMeshGain: number;
  /** Regenerative braking acoustic differentiation. */
  readonly regenPitchScale: number;
  readonly regenGainScale: number;
  readonly regenInverterBoost: number;
  readonly regenTimbreShiftHz: number;
}

/**
 * Complete vehicle electric-machine acoustic signature.
 * Supports single motor, dual front/rear EV motors, P2 motor, or EHS P3 + P1 pair.
 */
export interface MotorAcousticSignature {
  /** Primary machine: EV rear/single, P2 traction motor, or EHS P3 front drive motor. */
  readonly primary: ElectricMachineAcousticSignature;
  /** Secondary machine: EV front motor or EHS P1 crank-mounted generator. */
  readonly secondary?: ElectricMachineAcousticSignature;
  /** Low-speed pedestrian acoustic warning (AVAS). */
  readonly pedestrianBaseHz: number;
  readonly pedestrianSweepHz: number;
  readonly pedestrianLevel: number;
  readonly pedestrianMaxSpeedMps: number;
  /** Optional active sport harmonic resonance (e.g. Porsche Electric Sport Sound). */
  readonly sportHarmonicGain: number;
  readonly sportBodyBaseHz: number;
  readonly sportBodySweepHz: number;
  readonly sportPresence: number;
  readonly busLevel: number;
}

/**
 * Transmission & driveline acoustic signature.
 */
export interface TransmissionAcousticSignature {
  readonly type: TransmissionAcousticType;
  readonly gearWhineGain: number;
  readonly gearWhineBaseHz: number;
  readonly gearWhineRpmSlope: number;
  readonly gearWhineQ: number;
  readonly shiftEventStyle: ShiftEventStyle;
  readonly shiftCutGain: number;
  readonly shiftDurationSec: number;
  readonly shiftClunkHz: number;
  readonly shiftClunkGain: number;
  readonly downshiftBlipGain: number;
  /** Extra gear whine when low-range transfer case (4L) is engaged. */
  readonly lowRangeWhineGain: number;
  readonly gearPresence: number;
  readonly accelerationPresence: number;
}

/**
 * Chassis/drivetrain mechanical transients & rev limiter signature.
 */
export interface MechanicalAcousticSignature {
  readonly drivetrainLashGain: number;
  readonly drivetrainLashHz: number;
  readonly clutchLockGain: number;
  readonly clutchLockHz: number;
  readonly revLimiterStyle: 'NONE' | 'SOFT' | 'HARD';
  readonly revLimiterPulseHz: number;
  readonly revLimiterDepth: number;
}

/**
 * Event-driven startup, shutdown, hybrid transition & EV readiness signature.
 */
export interface PowertrainEventSignature {
  // Startup & shutdown continuous combustion crossfade timing
  /** Seconds for combustion layers to bloom smoothly from cranking into catch/idle. */
  readonly startFadeSec: number;
  /** Seconds for combustion layers to decay smoothly on fuel-cut shutdown. */
  readonly stopFadeSec: number;

  // Starter & cranking
  readonly starterType: StarterAcousticType;
  readonly starterFreqStartHz: number;
  readonly starterFreqEndHz: number;
  /** Compression-stroke cadence modulation frequency during cranking, Hz. */
  readonly starterPulseHz: number;
  readonly starterGain: number;
  readonly starterDurationSec: number;

  // Ignition catch & initial RPM rise
  readonly catchFreqStartHz: number;
  readonly catchFreqPeakHz: number;
  readonly catchFreqSettleHz: number;
  readonly catchGain: number;
  readonly catchDurationSec: number;
  readonly flareNoiseGain: number;
  readonly flareNoiseHz: number;

  // Shutdown & mechanical decay
  readonly shutdownStartHz: number;
  readonly shutdownEndHz: number;
  readonly shutdownGain: number;
  readonly shutdownDurationSec: number;
  readonly shutdownShudderHz: number;
  readonly shutdownShudderGain: number;

  // Hybrid transition events (P2 K0 / EHS P1 & direct clutch)
  readonly syncHumFreqHz: number;
  readonly syncHumGain: number;
  readonly k0EngageHz: number;
  readonly k0EngageGain: number;
  readonly directDriveEngageHz: number;
  readonly directDriveEngageGain: number;
  readonly modeTransitionGain: number;

  // EV power-up / inverter activation / regen / power-down events
  readonly driveReadyNotes: readonly number[];
  readonly driveReadyGain: number;
  readonly inverterActivateHz: number;
  readonly inverterActivateGain: number;
  readonly driveShutdownHz: number;
  readonly driveShutdownGain: number;
  readonly regenTransitionGain: number;
}

/**
 * Interior vs exterior acoustic filtering, isolation & perspective smoothing.
 */
export interface CabinAcousticSignature {
  readonly interiorEngineScale: number;
  readonly exteriorEngineScale: number;
  readonly interiorIdleScale: number;
  readonly interiorLoadScale: number;

  readonly interiorLowpassHz: number;
  readonly exteriorLowpassHz: number;
  /** Mid/upper cabin absorption shelf in dB (negative = warmer, quieter luxury cabin). */
  readonly interiorShelfDb: number;
  readonly interiorShelfFreqHz: number;

  /** Layer-specific interior retention ratios relative to exterior (1.0 = unchanged). */
  readonly interiorIntakeScale: number;
  readonly interiorExhaustScale: number;
  readonly interiorMechanicalScale: number;
  readonly interiorTurboScale: number;

  /** Distinct interior vs exterior mix ratios for electric motors & AVAS. */
  readonly interiorMotorScale: number;
  readonly exteriorMotorScale: number;
  readonly interiorInverterScale: number;
  readonly exteriorInverterScale: number;
  readonly interiorPedestrianScale: number;
  readonly exteriorPedestrianScale: number;

  /** Road & wind attenuation. */
  readonly interiorRoadScale: number;
  readonly exteriorRoadScale: number;
  readonly interiorWindScale: number;
  readonly exteriorWindScale: number;
  readonly closedRoadLowpassHz: number;

  /** Perspective transition smoothing time constant (seconds). */
  readonly perspectiveSmoothSec: number;

  /** Weather isolation compatibility. */
  readonly weatherIsolation: number;
  readonly rainCabinAttenuation: number;
  readonly windCabinAttenuation: number;

  /** Continuous door/window isolation model when vehicle supports interactive openings. */
  readonly cabinAcoustics?: VehicleCabinAcousticsProfile;
}

export interface VehicleAccessSoundSignature {
  readonly windowLevel: number;
  readonly latchLevel: number;
  readonly closeLevel: number;
  readonly windowUpHz?: number;
  readonly windowDownHz?: number;
  readonly closeBodyHz?: number;
  readonly latchHz?: number;
}

/**
 * Unified Vehicle Audio V2 static acoustic profile.
 * Every registered vehicle in VehicleCatalog owns an independent frozen instance.
 */
export interface VehicleAcousticProfile {
  readonly vehicleId: string;
  readonly displayName: string;
  readonly powertrainKind: PowertrainAcousticKind;
  /** Documents which parameters are physics-derived vs engineering acoustic estimates. */
  readonly calibrationNote: string;
  readonly engine?: EngineAcousticSignature;
  readonly motor?: MotorAcousticSignature;
  readonly transmission: TransmissionAcousticSignature;
  readonly mechanical: MechanicalAcousticSignature;
  readonly events: PowertrainEventSignature;
  readonly cabin: CabinAcousticSignature;
  readonly chimeLevel: number;
  readonly chimes?: Readonly<Record<VehicleChimeKind, VehicleChimeVoice>>;
  readonly turnSignalFrequencies?: readonly [on: number, off: number];
  readonly turnSignalLevel: number;
  readonly accessSounds?: VehicleAccessSoundSignature;
}
