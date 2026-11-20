import type { EngineConfig } from '../vehicle/config';
import type { VehicleAudioProfile, VehicleChimeKind } from './VehicleAudioProfile';
import { calculateElectricAudioMix, TurnSignalClickTracker, type ElectricAudioOptions } from './ElectricAudioMix';
import type { VehicleLightingState } from '../vehicle/control/VehicleLightingController';
import { playLaneDepartureWarningSound } from './LaneDepartureWarningSound';
import { calculateWeatherAudioMix, createWeatherAudioMix } from './WeatherAudioMix';
import type { CabinAcousticState } from './VehicleCabinAcoustics';
import type { VehicleAcousticProfile } from './VehicleAcousticProfile';
import type { VehicleAcousticTelemetry } from './AcousticTelemetry';
import {
  AcousticEventPlayer,
  MAX_CONCURRENT_TRANSIENTS,
  type TransientPlayerStats,
} from './AcousticEventPlayer';
import {
  PowertrainEventController,
  type PowertrainAcousticEventType,
} from './PowertrainEventController';
import {
  createAcousticMixState,
  evaluateVehicleAcoustics,
  type AcousticMixState,
} from './VehicleAcousticModel';

/** Additional telemetry used by the legacy synthesized vehicle and road-noise layers. */
export interface EngineAudioUpdateOptions {
  boostPressureBar?: number;
  shiftInProgress?: boolean;
  /** Vehicle speed in metres per second. */
  vehicleSpeed?: number;
  /** Estimated engine load from 0 (overrun) to 1 (full load). */
  engineLoad?: number;
  /** Clutch engagement from 0 (open) to 1 (locked). */
  clutchEngagement?: number;
  /** Surface roughness from 0 (smooth asphalt) to 1 (very coarse). */
  roadRoughness?: number;
  /** Physical forward gear, used only for subtle drivetrain colour. */
  gear?: number | string;
  /** Longitudinal acceleration in m/s²; positive under power, negative on overrun. */
  acceleration?: number;
  /** Internally smoothed acceleration, -1..1. */
  accelerationLoad?: number;
  engineCharacter?: EngineConfig;
  profile?: VehicleAudioProfile;
  cockpit?: boolean;
  /** Continuous driver-door/window isolation; omitted keeps legacy audio. */
  cabinAcoustics?: CabinAcousticState;
  driveMode?: string;
  ignitionPhase?: 'OFF' | 'CRANKING' | 'CATCH' | 'RUNNING' | 'STOPPING';
  cruiseActive?: boolean;
  lowFuel?: boolean;
  parkingDistance?: number | null;
  /** Actual access fractions; no input-derived or synthetic door state. */
  driverAccess?: { readonly doorOpen: number; readonly windowOpen: number };
}

interface EngineMix {
  firingHz: number;
  exhaustCutoffHz: number;
  intakeCutoffHz: number;
  exhaust: number;
  exhaustBody: number;
  upperExhaust: number;
  intake: number;
  mechanical: number;
  combustionNoise: number;
  turbo: number;
  road: number;
  wind: number;
  /** Cabin low-pass cutoff; 20 kHz means no additional filtering. */
  cabinLowpassHz: number;
  load: number;
  speed: number;
}

export interface AudioEngineDiagnostics {
  readonly initialized: boolean;
  readonly activeVehicleId: string | null;
  readonly persistentNodeCount: number;
  readonly continuousSourceCount: number;
  readonly continuousUpdateHz: number;
  readonly maxConcurrentTransients: number;
  readonly transientStats: TransientPlayerStats;
  readonly paramSchedulesApplied: number;
  readonly periodicWaveCacheSize: number;
  readonly mixState: Readonly<AcousticMixState>;
}

const SILENCE = 0.0001;
/** V2 continuous AudioParam update cadence: 25 Hz (within 20–30 Hz budget). */
const CONTINUOUS_UPDATE_INTERVAL_SEC = 0.04;

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

const smoothStep = (value: number): number => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

/**
 * Legacy pure-math compatibility helper retained for existing V1 selftests
 * (ExecutivePolish, MaybachS680, MaybachS680Access, PowertrainLayout, VehicleInteraction).
 */
export const calculateEngineAudioMix = (
  rpm: number,
  throttle: number,
  options: EngineAudioUpdateOptions = {},
): EngineMix => {
  const safeRpm = clamp(rpm, 0, 8_500);
  const safeThrottle = clamp(throttle);
  const speed = clamp(Math.abs(options.vehicleSpeed ?? 0), 0, 90);
  const rpmNormal = smoothStep(clamp((safeRpm - 650) / 5_850));
  const clutchLoad = 0.82 + clamp(options.clutchEngagement ?? 1) * 0.18;
  const load = clamp(options.engineLoad ?? safeThrottle) * clutchLoad;
  const roadRoughness = clamp(options.roadRoughness ?? 0.12);
  const speedNormal = smoothStep(speed / 42);

  const profile = options.profile;
  const cockpit = options.cockpit !== false;
  const driveMode = options.driveMode;
  const modePresence = profile
    ? driveMode === 'SPORT' ? profile.sportPresence
      : driveMode === 'ECO' ? (profile.ecoPresence ?? .8) : 1
    : 1;
  const cabin = profile && cockpit
    ? profile.cabinIdle + (profile.cabinLoad - profile.cabinIdle) * smoothStep(load) : 1;
  const cabinAcoustics = cockpit ? options.cabinAcoustics : undefined;
  const presence = profile
    ? cockpit
      ? cabin * modePresence * (cabinAcoustics?.engineScale ?? 1)
      : (profile.exteriorPresence ?? 1) * modePresence
    : 1;
  let layerPresence = 1;
  if (profile) {
    const idleBand = 1 - smoothStep(rpmNormal / .12);
    const lowBand = smoothStep(rpmNormal / .18) * (1 - smoothStep((rpmNormal - .22) / .22));
    const midBand = smoothStep((rpmNormal - .25) / .25) * (1 - smoothStep((rpmNormal - .60) / .22));
    const highBand = smoothStep((rpmNormal - .55) / .30);
    const total = Math.max(.0001, idleBand + lowBand + midBand + highBand);
    layerPresence = (idleBand * (profile.idlePresence ?? 1) + lowBand * (profile.lowPresence ?? 1) +
      midBand * (profile.midPresence ?? 1) + highBand * (profile.highPresence ?? 1)) / total;
  }
  const overrun = profile
    ? 1 - smoothStep(1 - load / .35) * smoothStep((safeRpm - 1_200) / 2_000) *
      (1 - (profile.overrunPresence ?? .55))
    : 1;
  const turbo = profile
    ? (profile.turboPresence ?? 0) * (profile.physicalTurbo
      ? smoothStep((options.boostPressureBar ?? 0) / Math.max(.1, (options.engineCharacter?.turbo?.maxPressureRatio ?? 2) - 1))
      : smoothStep((load - .32) / .68)) * smoothStep((safeRpm - 1_100) / 3_200)
    : 0;
  const gear = typeof options.gear === 'number' ? Math.abs(options.gear)
    : Math.abs(Number(String(options.gear ?? '').replace(/[^\d.-]/g, '')));
  const gearPresence = profile && Number.isFinite(gear) && gear >= 1
    ? 1 + (profile.gearPresence ?? 0) * (1 - clamp((gear - 1) / 7)) : 1;
  const acceleration = profile
    ? clamp(options.accelerationLoad ?? 0, -1, 1) * (profile.accelerationPresence ?? 0) : 0;
  const drivetrainBody = gearPresence * (1 + acceleration) * (profile?.flatPlaneV8 && options.shiftInProgress ? .88 : 1);
  const character = options.engineCharacter;
  const bodyPresence = profile?.flatPlaneV8 ? 1.05 : character?.soundProfile === 'full-bodied' ? 1.45 : character?.cylinderCount === 6 ? 1.15 : 1;
  const upperPresence = profile?.flatPlaneV8 ? 1.2 : character?.soundProfile === 'full-bodied' ? .55 : character?.cylinderCount === 6 ? .8 : 1;
  const closedFilter = profile?.cabinEngineFilterScale ?? 1;
  const cabinFilter = cockpit ? closedFilter + (1 - closedFilter) * (cabinAcoustics?.openness ?? 0) : 1;
  return {
    exhaustCutoffHz: (profile ? profile.exhaustCutoff + rpm * (profile.combustionTimbre?.exhaustRpmSlope ?? .055) + load * (profile.combustionTimbre?.exhaustLoadCutoff ?? 185)
      : (235 + rpm * .145 + load * 390) * (character?.soundProfile === 'full-bodied' ? .72 : 1)) * cabinFilter,
    intakeCutoffHz: (profile ? 300 + rpm * .082 + load * 230 + turbo * 1500
      : 430 + rpm * .21 + load * 430) * cabinFilter,
    firingHz: clamp(safeRpm * (options.engineCharacter?.cylinderCount ?? 4) / 120, 18, 850),
    exhaust: profile
      ? (0.007 + Math.pow(load, 1.35) * 0.064 * (profile.loadDepth ?? 1) + rpmNormal * load * 0.009) *
        presence * layerPresence * overrun * drivetrainBody
      : 0.030 + load * 0.026 + rpmNormal * 0.009,
    exhaustBody: bodyPresence * (profile?.combustionTimbre?.bodyGain ?? 1) * (profile
      ? (0.010 + Math.pow(load, 1.15) * 0.047 * (profile.loadDepth ?? 1)) * (1 - rpmNormal * .32) *
        presence * layerPresence * overrun * drivetrainBody
      : (1 - rpmNormal * 0.72) * (0.018 + load * 0.009)),
    upperExhaust: upperPresence * (profile?.combustionTimbre?.upperGain ?? 1) * (profile
      ? (0.0012 + rpmNormal * load * 0.0055 * (profile.highPresence ?? 1)) *
        presence * layerPresence * overrun
      : 0.006 + rpmNormal * 0.015 + load * 0.006),
    intake: profile
      ? (.0006 + Math.pow(load, 2) * .015 + turbo * .012) * presence * layerPresence
      : 0.0015 + Math.pow(load, 1.35) * 0.031 + rpmNormal * safeThrottle * 0.006,
    mechanical: profile
      ? (.0008 + rpmNormal * .0031 * (profile.highPresence ?? 1)) * presence * layerPresence * (profile.combustionTimbre?.mechanicalGain ?? 1)
      : 0.0025 + rpmNormal * 0.010 + (1 - load) * rpmNormal * 0.002,
    combustionNoise: (profile?.combustionTimbre?.pulseNoiseGain ?? 0) * (.18 + Math.pow(load, 1.25) * .82) * presence * layerPresence * overrun,
    turbo,
    road: speedNormal * (0.011 + roadRoughness * 0.021) *
      (profile && cockpit ? profile.cabinRoad * (cabinAcoustics?.roadScale ?? 1) : 1),
    wind: Math.pow(clamp(speed / 50), 1.7) * 0.020 *
      (profile && cockpit ? profile.cabinWind * (cabinAcoustics?.windScale ?? 1) : 1),
    cabinLowpassHz: cabinAcoustics !== undefined ? cabinAcoustics.lowpassHz
      : cockpit ? (profile?.closedCabinCutoffHz ?? 20_000) : 20_000,
    load,
    speed,
  };
};

/**
 * Unified Vehicle Audio V2 Engine.
 * - Single AudioContext, fixed persistent node graph (zero node growth on vehicle switch).
 * - Separates unified audio engine from independent per-vehicle VehicleAcousticProfile models.
 * - Continuous AudioParam scheduling throttled to 25 Hz (zero per-frame heap allocation).
 * - Discrete event-driven powertrain/drivetrain transitions with deduplication, cancellation,
 *   and MAX_CONCURRENT_TRANSIENTS = 8 voice cap.
 */
export class EngineAudio {
  private readonly contextFactory: () => AudioContext;
  private menuDucked = false;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  // Main buses & cabin EQ
  private engineBus: GainNode | null = null;
  private cabinEngineFilter: BiquadFilterNode | null = null;
  private cabinEngineShelf: BiquadFilterNode | null = null;
  private motorBus: GainNode | null = null;
  private cabinMotorFilter: BiquadFilterNode | null = null;
  private roadBus: GainNode | null = null;
  private cabinLowpass: BiquadFilterNode | null = null;
  private transientBus: GainNode | null = null;
  private weatherBus: GainNode | null = null;

  // Combustion continuous layers
  private exhaustPulse: OscillatorNode | null = null;
  private exhaustBody: OscillatorNode | null = null;
  private upperExhaust: OscillatorNode | null = null;
  private mechanical: OscillatorNode | null = null;
  private roughnessLfo: OscillatorNode | null = null;
  private roughnessDepth: GainNode | null = null;
  private exhaustGain: GainNode | null = null;
  private exhaustBodyGain: GainNode | null = null;
  private upperExhaustGain: GainNode | null = null;
  private mechanicalGain: GainNode | null = null;
  private exhaustFilter: BiquadFilterNode | null = null;
  private exhaustResonator: BiquadFilterNode | null = null;
  private exhaustCharacterFilter: BiquadFilterNode | null = null;
  private exhaustShaper: WaveShaperNode | null = null;

  // Combustion gas texture (fixed once at graph creation, never leaked)
  private combustionNoise: AudioBufferSourceNode | null = null;
  private combustionFilter: BiquadFilterNode | null = null;
  private combustionNoiseGain: GainNode | null = null;

  // Dedicated continuous turbo spool & transmission whine layers
  private turboSpool: OscillatorNode | null = null;
  private turboSpoolGain: GainNode | null = null;
  private txWhine: OscillatorNode | null = null;
  private txWhineGain: GainNode | null = null;

  // Stateful cranking oscillator (active only during CRANKING phase)
  private starter: OscillatorNode | null = null;
  private starterFilter: BiquadFilterNode | null = null;
  private starterGain: GainNode | null = null;

  // Noise layers (reusing 2 shared AudioBuffers)
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private softNoiseBuffer: AudioBuffer | null = null;
  private intakeNoise: AudioBufferSourceNode | null = null;
  private intakeFilter: BiquadFilterNode | null = null;
  private intakeGain: GainNode | null = null;
  private roadNoise: AudioBufferSourceNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private roadGain: GainNode | null = null;
  private windNoise: AudioBufferSourceNode | null = null;
  private windHighpass: BiquadFilterNode | null = null;
  private windLowpass: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // Electric machine continuous layers (primary + secondary + inverter/gear + AVAS)
  private electricMotor: OscillatorNode | null = null;
  private electricHarmonic: OscillatorNode | null = null;
  private secondaryMotor: OscillatorNode | null = null;
  private motorInverter: OscillatorNode | null = null;
  private motorInverterFilter: BiquadFilterNode | null = null;
  private pedestrianHum: OscillatorNode | null = null;
  private electricGain: GainNode | null = null;
  private harmonicGain: GainNode | null = null;
  private secondaryMotorGain: GainNode | null = null;
  private motorInverterGain: GainNode | null = null;
  private pedestrianGain: GainNode | null = null;

  // Weather continuous layers (4 looping sources sharing white/soft noise buffers)
  private weatherSources: AudioBufferSourceNode[] = [];
  private rainGain: GainNode | null = null;
  private rainBodyGain: GainNode | null = null;
  private glassRainGain: GainNode | null = null;
  private weatherWindGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainLowpass: BiquadFilterNode | null = null;
  private glassRainFilter: BiquadFilterNode | null = null;
  private weatherWindFilter: BiquadFilterNode | null = null;

  // Optional door/window access motor (lazy 3 nodes)
  private accessMotor: OscillatorNode | null = null;
  private accessMotorGain: GainNode | null = null;

  // V2 acoustic architecture state
  private acousticProfile: VehicleAcousticProfile | undefined;
  private profile: VehicleAudioProfile | undefined;
  private readonly eventController = new PowertrainEventController();
  private readonly eventPlayer = new AcousticEventPlayer();
  private readonly acousticMix: AcousticMixState = createAcousticMixState();
  private readonly waveCache = new Map<string, PeriodicWave>();
  private readonly shaperCurveCache = new Map<string, Float32Array<ArrayBuffer>>();

  // Lifecycle, throttling & telemetry
  private resumePromise: Promise<void> | null = null;
  private nextResumeAttempt = 0;
  private visibilityListenerAttached = false;
  private persistentNodeCount = 0;
  private continuousSourceCount = 0;
  private paramSchedulesApplied = 0;
  private continuousElapsed = CONTINUOUS_UPDATE_INTERVAL_SEC;
  private forceImmediateSync = true;
  private lastEventCallback: ((event: PowertrainAcousticEventType) => void) | null = null;

  // UI chime & access state
  private lastRunning = false;
  private lastFiringHz = 28;
  private lastPhase = 'OFF';
  private lastMode = '';
  private lastCruise = false;
  private lastLowFuel = false;
  private nextParkingChime = 0;
  private nextDoorChime = 0;
  private previousDoor = 0;
  private previousWindow = 0;
  private accessSampled = false;
  private accelerationLoad = 0;
  private lastUpdateTime = 0;
  private weatherElapsed = 0;
  private readonly weatherMix = createWeatherAudioMix();
  private readonly signalClicks = new TurnSignalClickTracker();
  private readonly weatherProfileScratch: {
    weatherIsolation: number;
    rainCabinAttenuation: number;
    windCabinAttenuation: number;
  } = { weatherIsolation: 0, rainCabinAttenuation: 0.5, windCabinAttenuation: 0.4 };

  public constructor(contextFactory?: () => AudioContext) {
    this.contextFactory = contextFactory ?? (() => new window.AudioContext());
  }

  public setMenuDucked(ducked: boolean): void {
    this.menuDucked = ducked;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(ducked ? 0.10 : 0.58, this.context.currentTime, 0.12);
    }
  }

  /** Optional observer hook used by automated verification suites. */
  public setEventObserver(callback: ((event: PowertrainAcousticEventType) => void) | null): void {
    this.lastEventCallback = callback;
  }

  /**
   * Configures the active vehicle acoustic model (V2) and optional legacy V1 profile.
   * Immediately cancels stale transients, resets event state machines, and reconfigures
   * persistent oscillators/filters without creating or leaking Web Audio nodes.
   */
  public configure(profile?: VehicleAudioProfile, acousticProfile?: VehicleAcousticProfile): void {
    this.profile = profile;
    this.acousticProfile = acousticProfile;
    this.eventPlayer.cancelAll();
    this.eventController.reset();
    this.signalClicks.reset();

    this.lastPhase = 'OFF';
    this.lastRunning = false;
    this.lastMode = '';
    this.lastCruise = false;
    this.lastLowFuel = false;
    this.nextParkingChime = 0;
    this.nextDoorChime = 0;
    this.accessSampled = false;
    this.accelerationLoad = 0;
    this.lastUpdateTime = 0;
    this.continuousElapsed = CONTINUOUS_UPDATE_INTERVAL_SEC;
    this.forceImmediateSync = true;
    this.acousticMix.smoothedAccelLoad = 0;
    this.acousticMix.smoothedLoad = 0;
    this.acousticMix.engineEnvelope = 0;
    this.acousticMix.crankEnvelope = 0;
    this.acousticMix.cabinBlend = 1;

    calculateWeatherAudioMix(this.weatherMix, 0, 0, 0, true, 0, this.getWeatherProfile());

    if (this.context) {
      const now = this.context.currentTime;
      this.applyProfileWavesAndFilters(this.context, now);
      this.muteContinuousLayers(now, 0.025);
    }
  }

  public getDiagnostics(): AudioEngineDiagnostics {
    return {
      initialized: this.context !== null,
      activeVehicleId: this.acousticProfile?.vehicleId ?? null,
      persistentNodeCount: this.persistentNodeCount,
      continuousSourceCount: this.continuousSourceCount,
      continuousUpdateHz: Math.round(1 / CONTINUOUS_UPDATE_INTERVAL_SEC),
      maxConcurrentTransients: MAX_CONCURRENT_TRANSIENTS,
      transientStats: this.eventPlayer.getStats(),
      paramSchedulesApplied: this.paramSchedulesApplied,
      periodicWaveCacheSize: this.waveCache.size,
      mixState: this.acousticMix,
    };
  }

  async start(): Promise<void> {
    if (!this.context) this.createGraph();
    await this.resume();
  }

  /** Safe to call from any pointer/key gesture after the browser suspended audio. */
  async resume(): Promise<void> {
    const context = this.context;
    if (!context || context.state === 'running' || context.state === 'closed') return;
    if (this.resumePromise) return this.resumePromise;
    if (Date.now() < this.nextResumeAttempt) return;

    this.resumePromise = context.resume()
      .catch(() => {
        // Browser autoplay gate: retry on next user gesture.
      })
      .finally(() => {
        this.resumePromise = null;
        this.nextResumeAttempt = Date.now() + 750;
      });
    return this.resumePromise;
  }

  /**
   * Primary V2 audio tick driven by preallocated read-only VehicleAcousticTelemetry.
   * - Discrete powertrain events execute immediately (zero latency, zero allocation).
   * - Continuous AudioParam scheduling runs at 25 Hz (40 ms cadence).
   */
  public updateAcoustic(telemetry: Readonly<VehicleAcousticTelemetry>, dt: number): void {
    const context = this.context;
    const acoustic = this.acousticProfile;
    if (!context || !acoustic) return;
    if (context.state === 'suspended' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.resume();
    }

    const safeDt = Number.isFinite(dt) ? clamp(dt, 0.001, 0.1) : 1 / 60;
    const now = context.currentTime;

    // 1. Prune expired transients & run event state machine immediately
    this.eventPlayer.prune(now);
    const eventCount = this.eventController.update(safeDt, acoustic, telemetry);
    if (eventCount > 0 && this.transientBus) {
      for (let i = 0; i < eventCount; i += 1) {
        const evt = this.eventController.getEvent(i);
        this.lastEventCallback?.(evt.type);
        this.eventPlayer.playEvent(
          context,
          this.transientBus,
          this.whiteNoiseBuffer,
          acoustic,
          evt,
          telemetry.cockpit,
        );
      }
    }

    // 2. Cabin UI chimes & door/window access feedback
    this.updateCabinUiChimesV2(acoustic, telemetry, now);
    this.updateAccessSoundsV2(acoustic, telemetry, now);

    // Track last firing frequency for manual stop fallback
    if (acoustic.engine && telemetry.rpm > 100) {
      this.lastFiringHz = clamp((telemetry.rpm * acoustic.engine.cylinderCount) / 120, 18, 950);
    }
    this.lastRunning = telemetry.engineRunning;

    // 3. Continuous acoustic evaluation & Web Audio parameter updates throttled to 25 Hz
    this.continuousElapsed += safeDt;
    if (!this.forceImmediateSync && this.continuousElapsed < CONTINUOUS_UPDATE_INTERVAL_SEC) {
      return;
    }
    const stepDt = this.forceImmediateSync
      ? Math.max(safeDt, CONTINUOUS_UPDATE_INTERVAL_SEC)
      : Math.min(0.12, this.continuousElapsed);
    this.continuousElapsed = this.forceImmediateSync
      ? 0
      : Math.min(CONTINUOUS_UPDATE_INTERVAL_SEC * 0.99, Math.max(0, this.continuousElapsed - CONTINUOUS_UPDATE_INTERVAL_SEC));

    evaluateVehicleAcoustics(this.acousticMix, acoustic, telemetry, stepDt, this.forceImmediateSync);
    this.forceImmediateSync = false;
    this.applyAcousticMixToGraph(this.acousticMix, now);
  }

  /** Legacy V1 ICE update path retained for backward compatibility if called directly without V2 telemetry. */
  update(
    rpm: number,
    throttle: number,
    running = true,
    options: EngineAudioUpdateOptions = {},
  ): void {
    const context = this.context;
    if (!context) return;
    if (context.state === 'suspended' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.resume();
    }

    const mergedOptions: EngineAudioUpdateOptions = { ...options, profile: this.profile };
    const now = context.currentTime;
    const elapsed = this.lastUpdateTime > 0 ? clamp(now - this.lastUpdateTime, 0.001, 0.1) : 1 / 60;
    this.lastUpdateTime = now;
    const accelerationTarget = clamp((mergedOptions.acceleration ?? 0) / 4, -1, 1);
    this.accelerationLoad += (accelerationTarget - this.accelerationLoad) * (1 - Math.exp(-elapsed * 4.2));
    mergedOptions.accelerationLoad = this.accelerationLoad;

    const mix = calculateEngineAudioMix(rpm, throttle, mergedOptions);
    this.electricGain?.gain.setTargetAtTime(SILENCE, now, 0.06);
    this.harmonicGain?.gain.setTargetAtTime(SILENCE, now, 0.06);
    this.secondaryMotorGain?.gain.setTargetAtTime(SILENCE, now, 0.06);
    this.motorInverterGain?.gain.setTargetAtTime(SILENCE, now, 0.06);
    this.pedestrianGain?.gain.setTargetAtTime(SILENCE, now, 0.06);
    this.turboSpoolGain?.gain.setTargetAtTime(SILENCE, now, 0.06);
    this.txWhineGain?.gain.setTargetAtTime(SILENCE, now, 0.06);
    this.updateRoadNoise(mix, now);
    this.updateAccessSounds(mergedOptions, now);

    if (this.profile) {
      const phase = mergedOptions.ignitionPhase ?? (running ? 'RUNNING' : 'OFF');
      if (phase !== this.lastPhase) {
        if (phase === 'CRANKING' && (!this.profile.chimes || mergedOptions.cockpit !== false)) this.playChime('startup');
        if (phase === 'CATCH') this.playEngineCatchTransient();
        if (phase === 'STOPPING') this.playShutdownTransient();
        this.lastPhase = phase;
      }
      this.starterGain?.gain.setTargetAtTime(phase === 'CRANKING' ? this.profile.starterLevel : SILENCE, now, 0.035);
      this.starter?.frequency.setTargetAtTime(64 + clamp(rpm / 300) * 38, now, 0.025);
      const cabinPowered = !this.profile.chimes || (mergedOptions.cockpit !== false && phase !== 'OFF' && phase !== 'STOPPING');
      if (cabinPowered && this.lastMode && mergedOptions.driveMode !== this.lastMode) this.playChime('mode');
      if (cabinPowered && (mergedOptions.cruiseActive ?? false) !== this.lastCruise) this.playChime('cruise');
      if (cabinPowered && mergedOptions.lowFuel && !this.lastLowFuel) this.playChime('fuel');
      const proximity = mergedOptions.parkingDistance;
      if (cabinPowered && proximity != null && proximity < 1.8 && now >= this.nextParkingChime) {
        this.playChime('parking');
        this.nextParkingChime = now + (this.profile.chimes ? 0.15 + clamp(proximity / 1.8) ** 1.4 * 0.95 : 0.45 + clamp(proximity / 1.8) * 1.25);
      }
      if (cabinPowered && this.profile.chimes && (mergedOptions.driverAccess?.doorOpen ?? 0) > 0.025 && mix.speed > 0.5 && now >= this.nextDoorChime) {
        this.playChime('door');
        this.nextDoorChime = now + 4;
      }
      this.lastMode = mergedOptions.driveMode ?? '';
      this.lastCruise = mergedOptions.cruiseActive ?? false;
      this.lastLowFuel = mergedOptions.lowFuel ?? false;
    }

    if ((!running && !(this.profile && mergedOptions.ignitionPhase === 'STOPPING' && rpm > 30)) || rpm < (this.profile ? 30 : 80)) {
      this.engineBus?.gain.setTargetAtTime(SILENCE, now, 0.16);
      if (this.lastRunning && !this.profile) this.playShutdownTransient();
      this.lastRunning = false;
      return;
    }

    if (!this.lastRunning && !this.profile) this.playEngineCatchTransient();
    this.lastRunning = true;
    this.lastFiringHz = mix.firingHz;

    this.engineBus?.gain.setTargetAtTime(
      mergedOptions.ignitionPhase === 'STOPPING' && this.profile ? 0.42 * clamp(rpm / 750) : 0.70 * (this.profile?.engineBusLevel ?? 1),
      now,
      this.profile ? 0.055 : 0.14,
    );
    this.exhaustPulse?.frequency.setTargetAtTime(mix.firingHz, now, 0.040);
    this.exhaustBody?.frequency.setTargetAtTime(mix.firingHz * (this.profile?.combustionTimbre?.bodyOrder ?? (this.profile?.flatPlaneV8 ? 1.003 : 0.502)), now, 0.052);
    this.upperExhaust?.frequency.setTargetAtTime(mix.firingHz * (this.profile?.combustionTimbre?.upperOrder ?? 2.012), now, 0.038);
    this.mechanical?.frequency.setTargetAtTime(Math.max(105, mix.firingHz * 5.96), now, 0.055);
    this.roughnessLfo?.frequency.setTargetAtTime(5.3 + clamp(rpm / 6_500) * 2.2, now, 0.18);
    this.roughnessDepth?.gain.setTargetAtTime(
      this.profile?.combustionTimbre?.roughnessCents ?? (this.profile ? 0.7 : (4.2 - clamp(rpm / 6_500) * 2.4) * 4 / (mergedOptions.engineCharacter?.cylinderCount ?? 4)),
      now,
      0.20,
    );

    this.exhaustGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.exhaust), now, 0.075);
    this.exhaustBodyGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.exhaustBody), now, 0.095);
    this.upperExhaustGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.upperExhaust), now, 0.075);
    this.intakeGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.intake), now, 0.10);
    this.mechanicalGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.mechanical), now, 0.10);
    this.combustionNoiseGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.combustionNoise), now, 0.09);
    this.exhaustFilter?.frequency.setTargetAtTime(mix.exhaustCutoffHz, now, 0.075);
    this.intakeFilter?.frequency.setTargetAtTime(mix.intakeCutoffHz, now, 0.085);
  }

  /** Legacy V1 electric update path retained for backward compatibility. */
  public updateElectric(rpm: number, torque: number, options: ElectricAudioOptions): void {
    const context = this.context;
    if (!context) return;
    if (context.state === 'suspended' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.resume();
    }
    const merged: ElectricAudioOptions = { ...options, voice: this.profile?.electric };
    const now = context.currentTime;
    const mix = calculateElectricAudioMix(rpm, torque, merged);
    if (this.profile?.electric && !merged.hybridLayer) {
      this.updateAccessSounds(merged, now);
      const on = merged.operational !== false;
      if (on && this.lastPhase === 'OFF' && merged.cockpit !== false) this.playChime('startup');
      if (on && this.lastMode && merged.driveMode !== this.lastMode && merged.cockpit !== false) this.playChime('mode');
      this.lastPhase = on ? 'RUNNING' : 'OFF';
      this.lastMode = merged.driveMode ?? '';
    }
    if (!merged.hybridLayer) {
      this.engineBus?.gain.setTargetAtTime(SILENCE, now, 0.035);
      this.starterGain?.gain.setTargetAtTime(SILENCE, now, 0.035);
      this.lastRunning = false;
    }
    this.motorBus?.gain.setTargetAtTime(1, now, 0.05);
    this.electricMotor?.frequency.setTargetAtTime(mix.frequency, now, 0.10);
    this.electricHarmonic?.frequency.setTargetAtTime(mix.harmonicFrequency, now, 0.13);
    this.pedestrianHum?.frequency.setTargetAtTime(mix.pedestrianFrequency, now, 0.15);
    this.electricGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.motor), now, 0.09);
    this.harmonicGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.motor * mix.harmonic), now, 0.12);
    this.secondaryMotorGain?.gain.setTargetAtTime(SILENCE, now, 0.09);
    this.motorInverterGain?.gain.setTargetAtTime(SILENCE, now, 0.09);
    this.pedestrianGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.pedestrian), now, 0.18);
    if (!merged.hybridLayer) this.updateRoadNoise(mix, now);
  }

  public updateTurnSignal(state: Readonly<VehicleLightingState>, cockpit = true): void {
    const edge = this.signalClicks.update(state);
    const context = this.context;
    if (!edge || !context || context.state !== 'running' || !this.transientBus) return;
    const frequencies = this.acousticProfile?.turnSignalFrequencies ?? this.profile?.turnSignalFrequencies ?? [1250, 920];
    if (!cockpit && (this.acousticProfile?.turnSignalFrequencies || this.profile?.turnSignalFrequencies)) return;
    const now = context.currentTime;
    const level = this.acousticProfile?.turnSignalLevel ?? this.profile?.turnSignalLevel ?? 0.024;
    let cleaned = false;
    const tone = context.createOscillator();
    const envelope = this.createOneShotEnvelope(context, now, 0.035, level, 0.002, 0.025);
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      try { tone.stop(); } catch { /* ignore */ }
      try { tone.disconnect(); } catch { /* ignore */ }
      try { envelope.disconnect(); } catch { /* ignore */ }
    };
    if (this.eventPlayer.tryAcquireSlot(now, 'ui', 1, 0.045, cleanup) === null) {
      cleanup();
      return;
    }
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(frequencies[edge === 'on' ? 0 : 1]!, now);
    tone.connect(envelope).connect(this.transientBus);
    tone.start(now);
    tone.stop(now + 0.04);
    tone.onended = cleanup;
  }

  /** Shares only the audio graph; LDW has its own timbre, pattern and louder gain. */
  public playLaneDepartureWarning(): void {
    if (!this.context || this.context.state !== 'running' || !this.transientBus || (typeof document !== 'undefined' && document.hidden)) return;
    playLaneDepartureWarningSound(this.context, this.transientBus);
  }

  /**
   * Layered weather ambience on the existing graph (throttled at 10 Hz).
   */
  public updateWeather(
    dt: number,
    rainIntensity: number,
    windIntensity: number,
    stormIntensity: number,
    cockpit: boolean,
    speedMetersPerSecond: number,
    cabinAcoustics?: CabinAcousticState,
  ): void {
    const context = this.context;
    if (!context || !this.weatherBus) return;
    this.weatherElapsed += Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
    if (this.weatherElapsed < 0.1) return;
    this.weatherElapsed = 0;
    const now = context.currentTime;
    const mix = calculateWeatherAudioMix(
      this.weatherMix,
      rainIntensity,
      windIntensity,
      stormIntensity,
      cockpit !== false,
      speedMetersPerSecond,
      this.getWeatherProfile(),
      cockpit ? cabinAcoustics : undefined,
    );
    this.rainGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.rainAmbient), now, 0.35);
    this.rainBodyGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.rainBody), now, 0.45);
    this.glassRainGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.glassRain), now, 0.30);
    this.weatherWindGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.wind), now, 0.50);
    this.rainFilter?.frequency.setTargetAtTime(mix.rainFilterHz, now, 0.50);
    this.rainFilter?.Q.setTargetAtTime(mix.rainQ, now, 0.50);
    this.rainLowpass?.frequency.setTargetAtTime(mix.rainLowpassHz, now, 0.50);
    this.glassRainFilter?.frequency.setTargetAtTime(mix.glassFilterHz, now, 0.40);
    this.weatherWindFilter?.frequency.setTargetAtTime(mix.windFilterHz, now, 0.50);
  }

  /** One short low-volume transient per wiper stroke, bounded by transient cap. */
  public playWiperSweep(mode: 'OFF' | 'INTERMITTENT' | 'LOW' | 'HIGH'): void {
    const context = this.context;
    const bus = this.transientBus;
    if (!context || !bus || context.state !== 'running' || mode === 'OFF' || (typeof document !== 'undefined' && document.hidden)) return;
    const now = context.currentTime;
    const fast = mode === 'HIGH';
    const duration = fast ? 0.38 : 0.52;
    let cleaned = false;
    const motor = context.createOscillator();
    const motorEnvelope = this.createOneShotEnvelope(context, now, duration, 0.011, 0.03, duration * 0.6);
    let swish: AudioBufferSourceNode | null = null;
    let swishFilter: BiquadFilterNode | null = null;
    let swishEnv: GainNode | null = null;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      try { motor.stop(); } catch { /* ignore */ }
      try { swish?.stop(); } catch { /* ignore */ }
      try { motor.disconnect(); motorEnvelope.disconnect(); } catch { /* ignore */ }
      try { swish?.disconnect(); swishFilter?.disconnect(); swishEnv?.disconnect(); } catch { /* ignore */ }
    };
    if (this.eventPlayer.tryAcquireSlot(now, 'weather', 1, duration + 0.02, cleanup) === null) {
      cleanup();
      return;
    }
    motor.type = 'triangle';
    motor.frequency.setValueAtTime(fast ? 132 : 104, now);
    motor.frequency.linearRampToValueAtTime(fast ? 116 : 92, now + duration);
    motor.connect(motorEnvelope).connect(bus);
    if (this.whiteNoiseBuffer) {
      swish = context.createBufferSource();
      swish.buffer = this.whiteNoiseBuffer;
      swishFilter = context.createBiquadFilter();
      swishFilter.type = 'bandpass';
      swishFilter.frequency.value = fast ? 1_250 : 900;
      swishFilter.Q.value = 0.7;
      swishEnv = this.createOneShotEnvelope(context, now, duration * 0.9, 0.008, 0.06, duration * 0.5);
      swish.connect(swishFilter).connect(swishEnv).connect(bus);
      swish.start(now);
      swish.stop(now + duration);
    }
    motor.start(now);
    motor.stop(now + duration);
    motor.onended = cleanup;
  }

  /** Scheduled by WeatherSystem; delay conveys distance without spatial audio. */
  public playThunder(delaySeconds: number): void {
    const context = this.context;
    const bus = this.transientBus;
    if (!context || !bus || context.state !== 'running' || (typeof document !== 'undefined' && document.hidden)) return;
    const start = context.currentTime + (Number.isFinite(delaySeconds) ? Math.min(4, Math.max(0, delaySeconds)) : 0);
    const mix = this.weatherMix;
    let cleaned = false;
    const rumble = context.createOscillator();
    const rumbleEnv = this.createOneShotEnvelope(context, start, 1.7, mix.thunderBody, 0.05, 1.1);
    let burst: AudioBufferSourceNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let burstEnv: GainNode | null = null;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      try { rumble.stop(); } catch { /* ignore */ }
      try { burst?.stop(); } catch { /* ignore */ }
      try { rumble.disconnect(); rumbleEnv.disconnect(); } catch { /* ignore */ }
      try { burst?.disconnect(); filter?.disconnect(); burstEnv?.disconnect(); } catch { /* ignore */ }
    };
    if (this.eventPlayer.tryAcquireSlot(start, 'weather', 2, 2.45, cleanup) === null) {
      cleanup();
      return;
    }
    if (this.whiteNoiseBuffer) {
      burst = context.createBufferSource();
      burst.buffer = this.whiteNoiseBuffer;
      burst.playbackRate.value = 0.62;
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(mix.thunderLowpassHz, start);
      filter.frequency.exponentialRampToValueAtTime(120, start + 1.6);
      burstEnv = this.createOneShotEnvelope(context, start, 2.3, mix.thunder, 0.03, 1.6);
      burst.connect(filter).connect(burstEnv).connect(bus);
      burst.start(start);
      burst.stop(start + 2.4);
    }
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(46, start);
    rumble.frequency.exponentialRampToValueAtTime(29, start + 1.4);
    rumble.connect(rumbleEnv).connect(bus);
    rumble.start(start);
    rumble.stop(start + 1.8);
    if (burst) burst.onended = cleanup;
    else rumble.onended = cleanup;
  }

  /** Play vehicle-specific starter when driver triggers ignition on instant-start engines. */
  onIgnitionStart(): void {
    this.withAudioGraph(() => {
      if (this.acousticProfile && this.context && this.transientBus) {
        const count = this.eventController.notifyLegacyIgnitionStart(this.acousticProfile);
        for (let i = 0; i < count; i += 1) {
          const evt = this.eventController.getEvent(i);
          this.lastEventCallback?.(evt.type);
          this.eventPlayer.playEvent(this.context, this.transientBus, this.whiteNoiseBuffer, this.acousticProfile, evt, true);
        }
        return;
      }
      this.playStarterTransient();
    });
  }

  /** Play vehicle-specific combustion catch/rise on instant-start engines. */
  onEngineStart(): void {
    this.withAudioGraph(() => {
      if (this.acousticProfile && this.context && this.transientBus) {
        const count = this.eventController.notifyLegacyEngineCatch(this.acousticProfile);
        for (let i = 0; i < count; i += 1) {
          const evt = this.eventController.getEvent(i);
          this.lastEventCallback?.(evt.type);
          this.eventPlayer.playEvent(this.context, this.transientBus, this.whiteNoiseBuffer, this.acousticProfile, evt, true);
        }
        this.lastRunning = true;
        return;
      }
      this.playEngineCatchTransient();
    });
    this.lastRunning = true;
  }

  /** Fade engine and play vehicle-specific shutdown + mechanical decay. */
  onEngineStop(): void {
    this.withAudioGraph(() => {
      if (this.acousticProfile && this.context && this.transientBus) {
        const now = this.context.currentTime;
        this.engineBus?.gain.setTargetAtTime(SILENCE, now, 0.14);
        const rpmEstimate = this.acousticProfile.engine
          ? (this.lastFiringHz * 120) / Math.max(1, this.acousticProfile.engine.cylinderCount)
          : 750;
        const count = this.eventController.notifyLegacyEngineStop(this.acousticProfile, rpmEstimate);
        for (let i = 0; i < count; i += 1) {
          const evt = this.eventController.getEvent(i);
          this.lastEventCallback?.(evt.type);
          this.eventPlayer.playEvent(this.context, this.transientBus, this.whiteNoiseBuffer, this.acousticProfile, evt, true);
        }
        this.lastRunning = false;
        return;
      }
      this.playShutdownTransient();
    });
    this.lastRunning = false;
  }

  dispose(): void {
    this.eventPlayer.cancelAll();
    this.eventController.reset();

    if (this.visibilityListenerAttached && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerAttached = false;
    }

    const sources: Array<AudioScheduledSourceNode | null> = [
      this.exhaustPulse,
      this.exhaustBody,
      this.upperExhaust,
      this.mechanical,
      this.roughnessLfo,
      this.combustionNoise,
      this.turboSpool,
      this.txWhine,
      this.intakeNoise,
      this.roadNoise,
      this.windNoise,
      this.starter,
      this.accessMotor,
      this.electricMotor,
      this.electricHarmonic,
      this.secondaryMotor,
      this.motorInverter,
      this.pedestrianHum,
      ...this.weatherSources,
    ];
    for (const source of sources) {
      try { source?.stop(); } catch { /* ignore */ }
      try { source?.disconnect(); } catch { /* ignore */ }
    }
    this.weatherSources = [];
    this.waveCache.clear();
    this.shaperCurveCache.clear();

    void this.context?.close();
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.engineBus = null;
    this.cabinEngineFilter = null;
    this.cabinEngineShelf = null;
    this.motorBus = null;
    this.cabinMotorFilter = null;
    this.roadBus = null;
    this.cabinLowpass = null;
    this.transientBus = null;
    this.weatherBus = null;
    this.exhaustPulse = null;
    this.exhaustBody = null;
    this.upperExhaust = null;
    this.mechanical = null;
    this.roughnessLfo = null;
    this.roughnessDepth = null;
    this.exhaustGain = null;
    this.exhaustBodyGain = null;
    this.upperExhaustGain = null;
    this.mechanicalGain = null;
    this.exhaustFilter = null;
    this.exhaustResonator = null;
    this.exhaustCharacterFilter = null;
    this.exhaustShaper = null;
    this.combustionNoise = null;
    this.combustionFilter = null;
    this.combustionNoiseGain = null;
    this.turboSpool = null;
    this.turboSpoolGain = null;
    this.txWhine = null;
    this.txWhineGain = null;
    this.starter = null;
    this.starterFilter = null;
    this.starterGain = null;
    this.intakeNoise = null;
    this.intakeFilter = null;
    this.intakeGain = null;
    this.roadNoise = null;
    this.roadFilter = null;
    this.roadGain = null;
    this.windNoise = null;
    this.windHighpass = null;
    this.windLowpass = null;
    this.windGain = null;
    this.electricMotor = null;
    this.electricHarmonic = null;
    this.secondaryMotor = null;
    this.motorInverter = null;
    this.motorInverterFilter = null;
    this.pedestrianHum = null;
    this.electricGain = null;
    this.harmonicGain = null;
    this.secondaryMotorGain = null;
    this.motorInverterGain = null;
    this.pedestrianGain = null;
    this.accessMotor = null;
    this.accessMotorGain = null;
    this.whiteNoiseBuffer = null;
    this.softNoiseBuffer = null;
    this.persistentNodeCount = 0;
    this.continuousSourceCount = 0;
    this.lastRunning = false;
  }

  private getWeatherProfile(): VehicleAudioProfile | undefined {
    if (this.profile) return this.profile;
    if (!this.acousticProfile) return undefined;
    this.weatherProfileScratch.weatherIsolation = this.acousticProfile.cabin.weatherIsolation;
    this.weatherProfileScratch.rainCabinAttenuation = this.acousticProfile.cabin.rainCabinAttenuation;
    this.weatherProfileScratch.windCabinAttenuation = this.acousticProfile.cabin.windCabinAttenuation;
    return this.weatherProfileScratch as unknown as VehicleAudioProfile;
  }

  private createGraph(): void {
    const context = this.contextFactory();
    this.context = context;
    const now = context.currentTime;
    this.persistentNodeCount = 0;
    this.continuousSourceCount = 0;

    // 1. Master + Anti-clipping compressor + 5 structured buses (11 nodes)
    this.master = context.createGain();
    this.master.gain.setValueAtTime(this.menuDucked ? 0.10 : 0.58, now);
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 5.5;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.16;
    this.master.connect(this.compressor).connect(context.destination);

    this.engineBus = context.createGain();
    this.engineBus.gain.setValueAtTime(SILENCE, now);
    this.cabinEngineFilter = context.createBiquadFilter();
    this.cabinEngineFilter.type = 'lowpass';
    this.cabinEngineFilter.frequency.value = 16_000;
    this.cabinEngineFilter.Q.value = 0.52;
    this.cabinEngineShelf = context.createBiquadFilter();
    this.cabinEngineShelf.type = 'highshelf';
    this.cabinEngineShelf.frequency.value = 2_200;
    this.cabinEngineShelf.gain.value = 0;
    this.engineBus.connect(this.cabinEngineFilter).connect(this.cabinEngineShelf).connect(this.master);

    this.motorBus = context.createGain();
    this.motorBus.gain.setValueAtTime(SILENCE, now);
    this.cabinMotorFilter = context.createBiquadFilter();
    this.cabinMotorFilter.type = 'lowpass';
    this.cabinMotorFilter.frequency.value = 16_000;
    this.cabinMotorFilter.Q.value = 0.50;
    this.motorBus.connect(this.cabinMotorFilter).connect(this.master);

    this.roadBus = context.createGain();
    this.roadBus.gain.setValueAtTime(1, now);
    this.cabinLowpass = context.createBiquadFilter();
    this.cabinLowpass.type = 'lowpass';
    this.cabinLowpass.frequency.value = 20_000;
    this.cabinLowpass.Q.value = 0.42;
    this.roadBus.connect(this.cabinLowpass).connect(this.master);

    this.transientBus = context.createGain();
    this.transientBus.gain.setValueAtTime(0.74, now);
    this.transientBus.connect(this.master);

    this.weatherBus = context.createGain();
    this.weatherBus.gain.value = 1;
    this.weatherBus.connect(this.master);
    this.persistentNodeCount += 11;

    // 2. Shared reusable noise buffers (2 buffers total for the entire engine)
    this.whiteNoiseBuffer = this.createNoiseBuffer(context, false);
    this.softNoiseBuffer = this.createNoiseBuffer(context, true);

    // 3. Persistent continuous layers
    this.createEngineLayers(context, now);
    this.createNoiseLayers(context, now);
    this.createElectricLayers(context, now);
    this.createWeatherLayers(context, now);
    this.applyProfileWavesAndFilters(context, now);

    if (!this.visibilityListenerAttached && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerAttached = true;
    }
  }

  private createEngineLayers(context: AudioContext, now: number): void {
    if (!this.engineBus || !this.transientBus || !this.whiteNoiseBuffer) return;

    this.exhaustPulse = context.createOscillator();
    this.exhaustBody = context.createOscillator();
    this.upperExhaust = context.createOscillator();
    this.upperExhaust.type = 'sine';
    this.mechanical = context.createOscillator();
    this.mechanical.type = 'sine';

    this.exhaustGain = this.createSilentGain(context, now);
    this.exhaustBodyGain = this.createSilentGain(context, now);
    this.upperExhaustGain = this.createSilentGain(context, now);
    this.mechanicalGain = this.createSilentGain(context, now);

    this.exhaustShaper = context.createWaveShaper();
    this.exhaustShaper.curve = this.getOrCreateShaperCurve(0);
    this.exhaustShaper.oversample = '2x';

    this.exhaustFilter = context.createBiquadFilter();
    this.exhaustFilter.type = 'lowpass';
    this.exhaustFilter.frequency.value = 620;
    this.exhaustFilter.Q.value = 0.72;

    this.exhaustResonator = context.createBiquadFilter();
    this.exhaustResonator.type = 'peaking';
    this.exhaustResonator.frequency.value = 140;
    this.exhaustResonator.Q.value = 1.3;
    this.exhaustResonator.gain.value = 0;

    this.exhaustCharacterFilter = context.createBiquadFilter();
    this.exhaustCharacterFilter.type = 'peaking';
    this.exhaustCharacterFilter.frequency.value = 780;
    this.exhaustCharacterFilter.Q.value = 1.5;
    this.exhaustCharacterFilter.gain.value = 0;

    this.exhaustPulse.connect(this.exhaustGain).connect(this.exhaustShaper);
    this.exhaustBody.connect(this.exhaustBodyGain).connect(this.exhaustShaper);
    this.upperExhaust.connect(this.upperExhaustGain).connect(this.exhaustShaper);
    this.exhaustShaper
      .connect(this.exhaustFilter)
      .connect(this.exhaustResonator)
      .connect(this.exhaustCharacterFilter)
      .connect(this.engineBus);
    // Route mechanical texture through exhaustFilter so it never pierces unfiltered at high RPM
    this.mechanical.connect(this.mechanicalGain).connect(this.exhaustFilter);

    // Firing-rate roughness micro-detune LFO
    this.roughnessLfo = context.createOscillator();
    this.roughnessLfo.type = 'sine';
    this.roughnessLfo.frequency.value = 5.5;
    this.roughnessDepth = context.createGain();
    this.roughnessDepth.gain.value = 1.5;
    this.roughnessLfo.connect(this.roughnessDepth);
    this.roughnessDepth.connect(this.exhaustPulse.detune);
    this.roughnessDepth.connect(this.exhaustBody.detune);

    // Pre-built firing-modulated combustion gas texture (fixed node count; muted when unused)
    this.combustionNoise = context.createBufferSource();
    this.combustionNoise.buffer = this.whiteNoiseBuffer;
    this.combustionNoise.loop = true;
    this.combustionFilter = context.createBiquadFilter();
    this.combustionFilter.type = 'bandpass';
    this.combustionFilter.frequency.value = 600;
    this.combustionFilter.Q.value = 0.6;
    const combEnv = context.createGain();
    combEnv.gain.value = 0.64;
    const combPulseMod = context.createGain();
    combPulseMod.gain.value = 0.30;
    this.exhaustPulse.connect(combPulseMod).connect(combEnv.gain);
    this.combustionNoiseGain = this.createSilentGain(context, now);
    this.combustionNoise
      .connect(this.combustionFilter)
      .connect(combEnv)
      .connect(this.combustionNoiseGain)
      .connect(this.exhaustFilter);

    // Dedicated continuous turbo spool & transmission whine oscillators
    this.turboSpool = context.createOscillator();
    this.turboSpool.type = 'sine';
    this.turboSpool.frequency.value = 2_000;
    this.turboSpoolGain = this.createSilentGain(context, now);
    this.turboSpool.connect(this.turboSpoolGain).connect(this.engineBus);

    this.txWhine = context.createOscillator();
    this.txWhine.type = 'sine';
    this.txWhine.frequency.value = 420;
    this.txWhineGain = this.createSilentGain(context, now);
    this.txWhine.connect(this.txWhineGain).connect(this.engineBus);

    // Stateful cranking oscillator (active only during CRANKING)
    this.starter = context.createOscillator();
    this.starter.type = 'triangle';
    this.starterFilter = context.createBiquadFilter();
    this.starterFilter.type = 'lowpass';
    this.starterFilter.frequency.value = 380;
    this.starterGain = this.createSilentGain(context, now);
    this.starter.connect(this.starterFilter).connect(this.starterGain).connect(this.transientBus);

    this.exhaustPulse.start();
    this.exhaustBody.start();
    this.upperExhaust.start();
    this.mechanical.start();
    this.roughnessLfo.start();
    this.combustionNoise.start();
    this.turboSpool.start();
    this.txWhine.start();
    this.starter.start();

    this.persistentNodeCount += 26;
    this.continuousSourceCount += 9;
  }

  private createNoiseLayers(context: AudioContext, now: number): void {
    if (!this.engineBus || !this.roadBus || !this.whiteNoiseBuffer || !this.softNoiseBuffer) return;

    this.intakeNoise = context.createBufferSource();
    this.intakeNoise.buffer = this.whiteNoiseBuffer;
    this.intakeNoise.loop = true;
    this.intakeFilter = context.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 720;
    this.intakeFilter.Q.value = 0.72;
    this.intakeGain = this.createSilentGain(context, now);
    this.intakeNoise.connect(this.intakeFilter).connect(this.intakeGain).connect(this.engineBus);

    this.roadNoise = context.createBufferSource();
    this.roadNoise.buffer = this.softNoiseBuffer;
    this.roadNoise.loop = true;
    this.roadFilter = context.createBiquadFilter();
    this.roadFilter.type = 'bandpass';
    this.roadFilter.frequency.value = 340;
    this.roadFilter.Q.value = 0.48;
    this.roadGain = this.createSilentGain(context, now);
    this.roadNoise.connect(this.roadFilter).connect(this.roadGain).connect(this.roadBus);

    this.windNoise = context.createBufferSource();
    this.windNoise.buffer = this.whiteNoiseBuffer;
    this.windNoise.loop = true;
    this.windHighpass = context.createBiquadFilter();
    this.windHighpass.type = 'highpass';
    this.windHighpass.frequency.value = 720;
    this.windLowpass = context.createBiquadFilter();
    this.windLowpass.type = 'lowpass';
    this.windLowpass.frequency.value = 3_400;
    this.windGain = this.createSilentGain(context, now);
    this.windNoise
      .connect(this.windHighpass)
      .connect(this.windLowpass)
      .connect(this.windGain)
      .connect(this.roadBus);

    this.intakeNoise.start();
    this.roadNoise.start();
    this.windNoise.start();

    this.persistentNodeCount += 10;
    this.continuousSourceCount += 3;
  }

  private createElectricLayers(context: AudioContext, now: number): void {
    if (!this.motorBus || !this.master) return;

    this.electricMotor = context.createOscillator();
    this.electricMotor.type = 'sine';
    this.electricGain = this.createSilentGain(context, now);
    this.electricMotor.connect(this.electricGain).connect(this.motorBus);

    this.electricHarmonic = context.createOscillator();
    this.electricHarmonic.type = 'sine';
    this.harmonicGain = this.createSilentGain(context, now);
    this.electricHarmonic.connect(this.harmonicGain).connect(this.motorBus);

    this.secondaryMotor = context.createOscillator();
    this.secondaryMotor.type = 'sine';
    this.secondaryMotorGain = this.createSilentGain(context, now);
    this.secondaryMotor.connect(this.secondaryMotorGain).connect(this.motorBus);

    this.motorInverter = context.createOscillator();
    this.motorInverter.type = 'sine';
    this.motorInverter.frequency.value = 1_800;
    this.motorInverterFilter = context.createBiquadFilter();
    this.motorInverterFilter.type = 'bandpass';
    this.motorInverterFilter.frequency.value = 2_800;
    this.motorInverterFilter.Q.value = 2.8;
    this.motorInverterGain = this.createSilentGain(context, now);
    this.motorInverter
      .connect(this.motorInverterFilter)
      .connect(this.motorInverterGain)
      .connect(this.motorBus);

    this.pedestrianHum = context.createOscillator();
    this.pedestrianHum.type = 'sine';
    this.pedestrianHum.frequency.value = 140;
    this.pedestrianGain = this.createSilentGain(context, now);
    this.pedestrianHum.connect(this.pedestrianGain).connect(this.master);

    this.electricMotor.start();
    this.electricHarmonic.start();
    this.secondaryMotor.start();
    this.motorInverter.start();
    this.pedestrianHum.start();

    this.persistentNodeCount += 11;
    this.continuousSourceCount += 5;
  }

  private createWeatherLayers(context: AudioContext, now: number): void {
    if (!this.weatherBus || !this.whiteNoiseBuffer || !this.softNoiseBuffer) return;
    const bus = this.weatherBus;

    const rain = context.createBufferSource();
    rain.buffer = this.whiteNoiseBuffer;
    rain.loop = true;
    this.rainFilter = context.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 1_600;
    this.rainFilter.Q.value = 0.55;
    this.rainLowpass = context.createBiquadFilter();
    this.rainLowpass.type = 'lowpass';
    this.rainLowpass.frequency.value = 6_400;
    this.rainGain = this.createSilentGain(context, now);
    rain.connect(this.rainFilter).connect(this.rainLowpass).connect(this.rainGain).connect(bus);

    const body = context.createBufferSource();
    body.buffer = this.softNoiseBuffer;
    body.loop = true;
    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 380;
    this.rainBodyGain = this.createSilentGain(context, now);
    body.connect(bodyFilter).connect(this.rainBodyGain).connect(bus);

    const glass = context.createBufferSource();
    glass.buffer = this.whiteNoiseBuffer;
    glass.loop = true;
    this.glassRainFilter = context.createBiquadFilter();
    this.glassRainFilter.type = 'bandpass';
    this.glassRainFilter.frequency.value = 2_800;
    this.glassRainFilter.Q.value = 0.65;
    this.glassRainGain = this.createSilentGain(context, now);
    glass.connect(this.glassRainFilter).connect(this.glassRainGain).connect(bus);

    const wind = context.createBufferSource();
    wind.buffer = this.softNoiseBuffer;
    wind.loop = true;
    this.weatherWindFilter = context.createBiquadFilter();
    this.weatherWindFilter.type = 'bandpass';
    this.weatherWindFilter.frequency.value = 520;
    this.weatherWindFilter.Q.value = 0.4;
    this.weatherWindGain = this.createSilentGain(context, now);
    wind.connect(this.weatherWindFilter).connect(this.weatherWindGain).connect(bus);

    rain.start();
    body.start();
    glass.start();
    wind.start();
    this.weatherSources = [rain, body, glass, wind];

    this.persistentNodeCount += 13;
    this.continuousSourceCount += 4;
  }

  private getOrCreatePeriodicWave(context: AudioContext, cacheKey: string, harmonics: readonly number[]): PeriodicWave {
    const cached = this.waveCache.get(cacheKey);
    if (cached) return cached;
    const wave = context.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics));
    this.waveCache.set(cacheKey, wave);
    return wave;
  }

  /**
   * Builds and caches a unity-small-signal asymmetric combustion saturation curve.
   * Zero drive = linear luxury tone; higher drive = rich load-blooming exhaust roar.
   */
  private getOrCreateShaperCurve(drive: number): Float32Array<ArrayBuffer> {
    const clamped = clamp(drive, 0, 1);
    const key = clamped.toFixed(2);
    const cached = this.shaperCurveCache.get(key);
    if (cached) return cached;
    const samples = 513;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    const k = 1 + clamped * 7.5;
    const asym = clamped * 0.24;
    for (let i = 0; i < samples; i += 1) {
      const x = (i / (samples - 1)) * 2 - 1;
      if (clamped <= 0.02) {
        curve[i] = x;
      } else {
        const biased = x + asym * x * x;
        curve[i] = Math.tanh(k * biased) / k;
      }
    }
    this.shaperCurveCache.set(key, curve);
    return curve;
  }

  private applyProfileWavesAndFilters(context: AudioContext, now: number): void {
    const acoustic = this.acousticProfile;
    if (acoustic) {
      if (acoustic.engine) {
        const eng = acoustic.engine;
        const pulseWave = this.getOrCreatePeriodicWave(context, `${acoustic.vehicleId}:pulse`, eng.pulseHarmonics);
        this.exhaustPulse?.setPeriodicWave(pulseWave);
        const bodyWave = this.getOrCreatePeriodicWave(context, `${acoustic.vehicleId}:body`, eng.bodyHarmonics);
        this.exhaustBody?.setPeriodicWave(bodyWave);
        if (this.exhaustShaper) this.exhaustShaper.curve = this.getOrCreateShaperCurve(eng.combustionDrive);
        // Always keep mechanical oscillator pure sine (prevents sawtooth/triangle high-freq buzz)
        if (this.mechanical) this.mechanical.type = 'sine';
      } else if (this.exhaustShaper) {
        this.exhaustShaper.curve = this.getOrCreateShaperCurve(0);
      }
      if (acoustic.motor) {
        const mot = acoustic.motor;
        if (this.electricMotor) this.electricMotor.type = mot.primary.wave;
        if (this.electricHarmonic) this.electricHarmonic.type = 'sine';
        if (this.secondaryMotor) this.secondaryMotor.type = mot.secondary?.wave ?? 'sine';
      }
      if (this.starter) {
        const isP1Starter = acoustic.events.starterType === 'P1_HIGH_RPM';
        const isElectricStarter = acoustic.events.starterType === 'ISG_48V' || isP1Starter;
        this.starter.type = isElectricStarter ? 'sine' : 'triangle';
        this.starterFilter?.frequency.setTargetAtTime(isP1Starter ? 240 : isElectricStarter ? 520 : 380, now, 0.02);
      }
      return;
    }

    // Legacy V1 profile fallback
    const pulseHarmonics = this.profile?.pulseHarmonics ?? [0, 1, 0.24, 0.13, 0.065, 0.035];
    const pulseWave = this.getOrCreatePeriodicWave(context, `legacy:pulse:${pulseHarmonics.join(',')}`, pulseHarmonics);
    this.exhaustPulse?.setPeriodicWave(pulseWave);
    const bodyHarmonics = this.profile?.combustionTimbre?.bodyHarmonics;
    if (bodyHarmonics) {
      const bodyWave = this.getOrCreatePeriodicWave(context, `legacy:body:${bodyHarmonics.join(',')}`, bodyHarmonics);
      this.exhaustBody?.setPeriodicWave(bodyWave);
    } else if (this.exhaustBody) {
      this.exhaustBody.type = 'sine';
    }
    if (this.electricMotor) this.electricMotor.type = this.profile?.electric?.rearWave ?? 'sine';
    if (this.electricHarmonic) this.electricHarmonic.type = this.profile?.electric?.frontWave ?? 'sine';
  }

  private muteContinuousLayers(now: number, tau: number): void {
    this.engineBus?.gain.setTargetAtTime(SILENCE, now, tau);
    this.motorBus?.gain.setTargetAtTime(SILENCE, now, tau);
    this.exhaustGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.exhaustBodyGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.upperExhaustGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.mechanicalGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.combustionNoiseGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.intakeGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.turboSpoolGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.txWhineGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.starterGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.electricGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.harmonicGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.secondaryMotorGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.motorInverterGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.pedestrianGain?.gain.setTargetAtTime(SILENCE, now, tau);
    this.accessMotorGain?.gain.setTargetAtTime(SILENCE, now, tau);
  }

  /** Applies the 25 Hz V2 AcousticMixState directly to the persistent AudioNodes. */
  private applyAcousticMixToGraph(mix: Readonly<AcousticMixState>, now: number): void {
    // Cabin EQ filters (smoothly updated at 25 Hz)
    this.cabinEngineFilter?.frequency.setTargetAtTime(clamp(mix.cabinEngineLowpassHz, 600, 20_000), now, 0.08);
    this.cabinEngineShelf?.frequency.setTargetAtTime(clamp(mix.cabinEngineShelfHz, 600, 6_000), now, 0.12);
    this.cabinEngineShelf?.gain.setTargetAtTime(clamp(mix.cabinEngineShelfDb, -14, 4), now, 0.10);
    this.cabinMotorFilter?.frequency.setTargetAtTime(clamp(mix.cabinMotorLowpassHz, 800, 20_000), now, 0.08);
    this.cabinLowpass?.frequency.setTargetAtTime(clamp(mix.cabinRoadLowpassHz, 600, 20_000), now, 0.14);

    // Cranking layer (smooth envelope prevents abrupt stop clicks on hybrid catch)
    this.starterGain?.gain.setTargetAtTime(mix.crankActive ? Math.max(SILENCE, mix.crankGain) : SILENCE, now, 0.045);
    if (mix.crankActive) {
      this.starter?.frequency.setTargetAtTime(mix.crankHz, now, 0.035);
    }

    // Always track firing/harmonic frequencies so combustion wake-up has zero pitch glitch
    this.exhaustPulse?.frequency.setTargetAtTime(mix.firingHz, now, 0.035);
    this.exhaustBody?.frequency.setTargetAtTime(mix.bodyHz, now, 0.045);
    this.upperExhaust?.frequency.setTargetAtTime(mix.upperHz, now, 0.035);
    this.mechanical?.frequency.setTargetAtTime(mix.mechanicalHz, now, 0.045);

    // Combustion layers (driven continuously by organic engineEnvelope through crank/catch/stop)
    if (mix.engineEnvelope > 0.0025) {
      this.engineBus?.gain.setTargetAtTime(Math.max(SILENCE, mix.engineBusGain), now, 0.065);
      this.roughnessLfo?.frequency.setTargetAtTime(mix.roughnessHz, now, 0.15);
      this.roughnessDepth?.gain.setTargetAtTime(mix.roughnessCents, now, 0.15);

      this.exhaustGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.exhaustPrimaryGain), now, 0.060);
      this.exhaustBodyGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.exhaustBodyGain), now, 0.070);
      this.upperExhaustGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.exhaustUpperGain), now, 0.060);
      this.combustionNoiseGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.combustionNoiseGain), now, 0.070);
      this.combustionFilter?.frequency.setTargetAtTime(mix.combustionNoiseFreqHz, now, 0.075);
      this.combustionFilter?.Q.setTargetAtTime(mix.combustionNoiseQ, now, 0.12);

      this.exhaustFilter?.frequency.setTargetAtTime(mix.exhaustCutoffHz, now, 0.065);
      this.exhaustResonator?.frequency.setTargetAtTime(mix.exhaustResonanceHz, now, 0.085);
      this.exhaustResonator?.Q.setTargetAtTime(mix.exhaustResonanceQ, now, 0.12);
      this.exhaustResonator?.gain.setTargetAtTime(mix.exhaustResonanceGainDb, now, 0.085);

      this.exhaustCharacterFilter?.frequency.setTargetAtTime(mix.exhaustCharacterHz, now, 0.085);
      this.exhaustCharacterFilter?.Q.setTargetAtTime(mix.exhaustCharacterQ, now, 0.12);
      this.exhaustCharacterFilter?.gain.setTargetAtTime(mix.exhaustCharacterGainDb, now, 0.085);

      this.intakeGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.intakeGain), now, 0.080);
      this.intakeFilter?.frequency.setTargetAtTime(mix.intakeCutoffHz, now, 0.080);
      this.intakeFilter?.Q.setTargetAtTime(mix.intakeQ, now, 0.12);
      this.mechanicalGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.mechanicalGain), now, 0.080);

      this.turboSpoolGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.turboSpoolGain), now, 0.070);
      if (mix.turboSpoolGain > 0.0002) {
        this.turboSpool?.frequency.setTargetAtTime(mix.turboSpoolHz, now, 0.06);
      }
    } else {
      this.engineBus?.gain.setTargetAtTime(mix.txWhineGain > 0.0004 ? 0.72 : SILENCE, now, 0.085);
      this.exhaustGain?.gain.setTargetAtTime(SILENCE, now, 0.075);
      this.exhaustBodyGain?.gain.setTargetAtTime(SILENCE, now, 0.075);
      this.upperExhaustGain?.gain.setTargetAtTime(SILENCE, now, 0.075);
      this.combustionNoiseGain?.gain.setTargetAtTime(SILENCE, now, 0.075);
      this.intakeGain?.gain.setTargetAtTime(SILENCE, now, 0.075);
      this.mechanicalGain?.gain.setTargetAtTime(SILENCE, now, 0.075);
      this.turboSpoolGain?.gain.setTargetAtTime(SILENCE, now, 0.075);
    }

    // Transmission continuous whine
    this.txWhineGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.txWhineGain), now, 0.075);
    if (mix.txWhineGain > 0.0003) {
      this.txWhine?.frequency.setTargetAtTime(mix.txWhineHz, now, 0.065);
    }

    // Electric motor layers (primary + secondary + inverter/gear + AVAS)
    if (mix.motorBusGain > 0.001 && (mix.motor1Active || mix.motor2Active || mix.motorInverterGain > 0.0003)) {
      this.motorBus?.gain.setTargetAtTime(mix.motorBusGain, now, 0.055);
      this.electricMotor?.frequency.setTargetAtTime(mix.motor1EmHz, now, 0.065);
      this.electricGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.motor1EmGain), now, 0.065);
      this.electricHarmonic?.frequency.setTargetAtTime(mix.motor1HarmonicHz, now, 0.075);
      this.harmonicGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.motor1HarmonicGain), now, 0.075);

      this.secondaryMotor?.frequency.setTargetAtTime(mix.motor2EmHz, now, 0.065);
      this.secondaryMotorGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.motor2EmGain), now, 0.065);

      this.motorInverter?.frequency.setTargetAtTime(mix.motorInverterHz, now, 0.07);
      this.motorInverterFilter?.frequency.setTargetAtTime(mix.motorInverterHz, now, 0.07);
      this.motorInverterFilter?.Q.setTargetAtTime(mix.motorInverterQ, now, 0.12);
      this.motorInverterGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.motorInverterGain), now, 0.07);
    } else {
      this.motorBus?.gain.setTargetAtTime(SILENCE, now, 0.05);
      this.electricGain?.gain.setTargetAtTime(SILENCE, now, 0.05);
      this.harmonicGain?.gain.setTargetAtTime(SILENCE, now, 0.05);
      this.secondaryMotorGain?.gain.setTargetAtTime(SILENCE, now, 0.05);
      this.motorInverterGain?.gain.setTargetAtTime(SILENCE, now, 0.05);
    }

    this.pedestrianHum?.frequency.setTargetAtTime(mix.pedestrianHz, now, 0.12);
    this.pedestrianGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.pedestrianGain), now, 0.12);

    // Road & wind layers
    this.roadGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.roadGain), now, 0.16);
    this.roadFilter?.frequency.setTargetAtTime(mix.roadFilterHz, now, 0.18);
    this.windGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.windGain), now, 0.22);
    this.windHighpass?.frequency.setTargetAtTime(mix.windHighpassHz, now, 0.22);
    this.windLowpass?.frequency.setTargetAtTime(mix.windLowpassHz, now, 0.24);

    this.paramSchedulesApplied += 1;
  }

  private updateCabinUiChimesV2(
    acoustic: VehicleAcousticProfile,
    t: Readonly<VehicleAcousticTelemetry>,
    now: number,
  ): void {
    const phase = t.p2Active ? t.p2EnginePhase : t.ehsActive ? t.ehsEnginePhase : t.ignitionPhase;
    const hasCustomChimes = acoustic.chimes !== undefined || this.profile?.chimes !== undefined;
    const operational = acoustic.powertrainKind === 'EV' ? t.vehicleOperational : (phase !== 'OFF' && phase !== 'STOPPING');
    const cabinPowered = !hasCustomChimes || (t.cockpit && operational);

    if (cabinPowered && this.lastMode && t.driveMode !== this.lastMode) {
      this.playChime('mode');
    }
    if (cabinPowered && t.cruiseActive !== this.lastCruise) {
      this.playChime('cruise');
    }
    if (cabinPowered && t.lowFuel && !this.lastLowFuel) {
      this.playChime('fuel');
    }
    if (cabinPowered && t.parkingDistance != null && t.parkingDistance < 1.8 && now >= this.nextParkingChime) {
      this.playChime('parking');
      this.nextParkingChime = now + (hasCustomChimes
        ? 0.15 + clamp(t.parkingDistance / 1.8) ** 1.4 * 0.95
        : 0.45 + clamp(t.parkingDistance / 1.8) * 1.25);
    }
    if (cabinPowered && hasCustomChimes && t.hasDriverAccess && t.doorOpen > 0.025 && t.vehicleSpeed > 0.5 && now >= this.nextDoorChime) {
      this.playChime('door');
      this.nextDoorChime = now + 4;
    }

    this.lastMode = t.driveMode;
    this.lastCruise = t.cruiseActive;
    this.lastLowFuel = t.lowFuel;
  }

  private updateAccessSoundsV2(
    acoustic: VehicleAcousticProfile,
    t: Readonly<VehicleAcousticTelemetry>,
    now: number,
  ): void {
    const voice = acoustic.accessSounds ?? this.profile?.accessSounds;
    const context = this.context;
    const bus = this.transientBus;
    if (!voice || !context || !bus || !t.hasDriverAccess) {
      this.accessMotorGain?.gain.setTargetAtTime(SILENCE, now, 0.05);
      return;
    }
    const { doorOpen, windowOpen } = t;
    if (!this.accessMotor) {
      this.accessMotor = context.createOscillator();
      this.accessMotor.type = 'triangle';
      this.accessMotorGain = this.createSilentGain(context, now);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      this.accessMotor.connect(filter).connect(this.accessMotorGain).connect(bus);
      this.accessMotor.start();
      this.persistentNodeCount += 3;
      this.continuousSourceCount += 1;
    }
    const moving = this.accessSampled && Math.abs(windowOpen - this.previousWindow) > 0.0001;
    const drawingLatch = doorOpen > 0.001 && doorOpen < 0.08 && doorOpen < this.previousDoor;
    this.accessMotor.frequency.setTargetAtTime(
      moving ? (windowOpen < this.previousWindow ? voice.windowUpHz ?? 205 : voice.windowDownHz ?? 184) : 112,
      now,
      0.04,
    );
    this.accessMotorGain!.gain.setTargetAtTime(
      moving || drawingLatch ? voice.windowLevel * (drawingLatch && !moving ? 0.55 : 1) * (!t.cockpit ? 0.60 : 1) : SILENCE,
      now,
      0.035,
    );
    if (this.accessSampled && this.previousDoor <= 0.001 && doorOpen > 0.001) this.playAccessLatch(false, voice.latchLevel);
    if (this.accessSampled && this.previousDoor > 0.001 && doorOpen <= 0.001) this.playAccessLatch(true, voice.closeLevel);
    this.previousDoor = doorOpen;
    this.previousWindow = windowOpen;
    this.accessSampled = true;
  }

  private updateRoadNoise(mix: Pick<EngineMix, 'road' | 'wind' | 'speed'> & { cabinLowpassHz?: number }, now: number): void {
    this.roadGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.road), now, 0.20);
    this.windGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.wind), now, 0.28);
    this.roadFilter?.frequency.setTargetAtTime(245 + mix.speed * 12, now, 0.22);
    this.windHighpass?.frequency.setTargetAtTime(620 + mix.speed * 15, now, 0.28);
    this.windLowpass?.frequency.setTargetAtTime(2_600 + mix.speed * 31, now, 0.30);
    this.cabinLowpass?.frequency.setTargetAtTime(Math.max(600, mix.cabinLowpassHz ?? 20_000), now, 0.26);
  }

  private playStarterTransient(): void {
    const context = this.context;
    const bus = this.transientBus;
    if (!context || !bus) return;
    const now = context.currentTime;
    const duration = 0.78;
    const envelope = this.createOneShotEnvelope(context, now, duration, 0.052, 0.035, 0.17);
    const starter = context.createOscillator();
    starter.type = 'triangle';
    starter.frequency.setValueAtTime(82, now);
    starter.frequency.exponentialRampToValueAtTime(116, now + duration * 0.78);
    const starterHarmonic = context.createOscillator();
    starterHarmonic.type = 'sine';
    starterHarmonic.frequency.setValueAtTime(184, now);
    starterHarmonic.frequency.exponentialRampToValueAtTime(246, now + duration * 0.78);
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0.25;
    starter.connect(envelope);
    starterHarmonic.connect(harmonicGain).connect(envelope);
    envelope.connect(bus);
    starter.start(now);
    starterHarmonic.start(now);
    starter.stop(now + duration);
    starterHarmonic.stop(now + duration);
    starter.onended = () => {
      starter.disconnect();
      starterHarmonic.disconnect();
      harmonicGain.disconnect();
      envelope.disconnect();
    };
  }

  private playEngineCatchTransient(): void {
    const context = this.context;
    const bus = this.transientBus;
    if (!context || !bus) return;
    const now = context.currentTime;
    const envelope = this.createOneShotEnvelope(
      context,
      now,
      0.28,
      Math.min(0.08, this.profile?.combustionTimbre?.catchLevel ?? (this.profile ? 0.017 : 0.032)),
      0.012,
      0.11,
    );
    const catchPulse = context.createOscillator();
    catchPulse.type = 'triangle';
    catchPulse.frequency.setValueAtTime(49, now);
    catchPulse.frequency.exponentialRampToValueAtTime(72, now + 0.12);
    catchPulse.frequency.exponentialRampToValueAtTime(43, now + 0.27);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    catchPulse.connect(filter).connect(envelope).connect(bus);
    catchPulse.start(now);
    catchPulse.stop(now + 0.28);
    catchPulse.onended = () => {
      catchPulse.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  private playShutdownTransient(): void {
    const context = this.context;
    const bus = this.transientBus;
    if (!context || !bus) return;
    const now = context.currentTime;
    if (!this.profile) {
      this.engineBus?.gain.cancelScheduledValues(now);
      this.engineBus?.gain.setTargetAtTime(SILENCE, now, 0.19);
    }
    const envelope = this.createOneShotEnvelope(
      context,
      now,
      0.46,
      Math.min(0.06, this.profile?.combustionTimbre?.shutdownLevel ?? (this.profile ? 0.006 : 0.026)),
      0.006,
      0.25,
    );
    const tail = context.createOscillator();
    tail.type = 'triangle';
    tail.frequency.setValueAtTime(clamp(this.lastFiringHz, 24, 170), now);
    tail.frequency.exponentialRampToValueAtTime(18, now + 0.44);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(430, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.44);
    tail.connect(filter).connect(envelope).connect(bus);
    tail.start(now);
    tail.stop(now + 0.46);
    tail.onended = () => {
      tail.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  private playChime(kind: VehicleChimeKind): void {
    const context = this.context;
    const bus = this.transientBus;
    if (!context || !bus) return;
    const chimes = this.acousticProfile?.chimes ?? this.profile?.chimes;
    const chimeLevel = this.acousticProfile?.chimeLevel ?? this.profile?.chimeLevel ?? 0;
    if (chimeLevel <= 0.0005) return;
    const voice = chimes?.[kind];
    const notes = voice?.notes ?? (kind === 'startup' ? [392, 523] : kind === 'fuel' ? [440, 349] : [440]);
    for (let index = 0; index < notes.length; index += 1) {
      const frequency = notes[index]!;
      const duration = voice?.duration ?? 0.32;
      const start = context.currentTime + index * (voice?.spacing ?? 0.13);
      let cleaned = false;
      const tone = context.createOscillator();
      const envelope = this.createOneShotEnvelope(
        context,
        start,
        duration,
        chimeLevel * (voice?.gain ?? 1),
        voice ? Math.min(0.018, duration * 0.12) : 0.025,
        voice ? duration * 0.82 : 0.24,
      );
      let partial: OscillatorNode | null = null;
      let partialGain: GainNode | null = null;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        try { tone.stop(); } catch { /* ignore */ }
        try { partial?.stop(); } catch { /* ignore */ }
        try { tone.disconnect(); envelope.disconnect(); } catch { /* ignore */ }
        try { partial?.disconnect(); partialGain?.disconnect(); } catch { /* ignore */ }
      };
      if (this.eventPlayer.tryAcquireSlot(start, 'ui', 2, duration + 0.02, cleanup) === null) {
        cleanup();
        continue;
      }
      tone.type = 'sine';
      tone.frequency.value = frequency;
      tone.connect(envelope).connect(bus);
      tone.start(start);
      tone.stop(start + duration);
      if (voice?.partial) {
        partial = context.createOscillator();
        partialGain = context.createGain();
        partial.frequency.value = frequency * 2.002;
        partialGain.gain.value = voice.partial;
        partial.connect(partialGain).connect(envelope);
        partial.start(start);
        partial.stop(start + duration);
      }
      tone.onended = cleanup;
    }
  }

  private updateAccessSounds(options: EngineAudioUpdateOptions, now: number): void {
    const voice = this.profile?.accessSounds;
    const context = this.context;
    const bus = this.transientBus;
    if (!voice || !context || !bus || !options.driverAccess) {
      this.accessMotorGain?.gain.setTargetAtTime(SILENCE, now, 0.05);
      return;
    }
    const { doorOpen, windowOpen } = options.driverAccess;
    if (!this.accessMotor) {
      this.accessMotor = context.createOscillator();
      this.accessMotor.type = 'triangle';
      this.accessMotorGain = this.createSilentGain(context, now);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      this.accessMotor.connect(filter).connect(this.accessMotorGain).connect(bus);
      this.accessMotor.start();
      this.persistentNodeCount += 3;
      this.continuousSourceCount += 1;
    }
    const moving = this.accessSampled && Math.abs(windowOpen - this.previousWindow) > 0.0001;
    const drawingLatch = doorOpen > 0.001 && doorOpen < 0.08 && doorOpen < this.previousDoor;
    this.accessMotor.frequency.setTargetAtTime(
      moving ? (windowOpen < this.previousWindow ? voice.windowUpHz ?? 205 : voice.windowDownHz ?? 184) : 112,
      now,
      0.04,
    );
    this.accessMotorGain!.gain.setTargetAtTime(
      moving || drawingLatch ? voice.windowLevel * (drawingLatch && !moving ? 0.55 : 1) * (options.cockpit === false ? 0.60 : 1) : SILENCE,
      now,
      0.035,
    );
    if (this.accessSampled && this.previousDoor <= 0.001 && doorOpen > 0.001) this.playAccessLatch(false, voice.latchLevel);
    if (this.accessSampled && this.previousDoor > 0.001 && doorOpen <= 0.001) this.playAccessLatch(true, voice.closeLevel);
    this.previousDoor = doorOpen;
    this.previousWindow = windowOpen;
    this.accessSampled = true;
  }

  private playAccessLatch(closing: boolean, level: number): void {
    const context = this.context!;
    const bus = this.transientBus!;
    const now = context.currentTime;
    const duration = closing ? 0.22 : 0.055;
    const access = this.acousticProfile?.accessSounds ?? this.profile?.accessSounds;
    let cleaned = false;
    const body = context.createOscillator();
    const envelope = this.createOneShotEnvelope(context, now, duration, level, 0.003, duration * 0.93);
    let latch: AudioBufferSourceNode | null = null;
    let latchFilter: BiquadFilterNode | null = null;
    let latchGain: GainNode | null = null;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      try { body.stop(); } catch { /* ignore */ }
      try { latch?.stop(); } catch { /* ignore */ }
      try { body.disconnect(); envelope.disconnect(); } catch { /* ignore */ }
      try { latch?.disconnect(); latchFilter?.disconnect(); latchGain?.disconnect(); } catch { /* ignore */ }
    };
    if (this.eventPlayer.tryAcquireSlot(now, 'ui', 2, duration + 0.02, cleanup) === null) {
      cleanup();
      return;
    }
    body.type = 'sine';
    const base = closing ? access?.closeBodyHz ?? 94 : access?.latchHz ?? 430;
    body.frequency.setValueAtTime(base, now);
    body.frequency.exponentialRampToValueAtTime(base * (closing ? 0.5 : 250 / 430), now + duration);
    body.connect(envelope).connect(bus);
    body.start(now);
    body.stop(now + duration);
    if (this.whiteNoiseBuffer) {
      latch = context.createBufferSource();
      latchFilter = context.createBiquadFilter();
      latch.buffer = this.whiteNoiseBuffer;
      latchFilter.type = 'bandpass';
      latchFilter.frequency.value = closing ? 560 : 1_550;
      latchFilter.Q.value = 0.65;
      latchGain = this.createOneShotEnvelope(context, now, 0.065, level * 0.65, 0.002, 0.060);
      latch.connect(latchFilter).connect(latchGain).connect(bus);
      latch.start(now);
      latch.stop(now + 0.07);
    }
    body.onended = cleanup;
  }

  private createOneShotEnvelope(
    context: AudioContext,
    now: number,
    duration: number,
    peak: number,
    attack: number,
    release: number,
  ): GainNode {
    const safePeak = Math.max(SILENCE * 2, clamp(peak, 0, 0.30));
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(SILENCE, now);
    envelope.gain.linearRampToValueAtTime(safePeak, now + attack);
    envelope.gain.setValueAtTime(safePeak, Math.max(now + attack, now + duration - release));
    envelope.gain.exponentialRampToValueAtTime(SILENCE, now + duration);
    return envelope;
  }

  private createSilentGain(context: AudioContext, now: number): GainNode {
    const gain = context.createGain();
    gain.gain.setValueAtTime(SILENCE, now);
    return gain;
  }

  private createNoiseBuffer(context: AudioContext, softened: boolean): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(context.sampleRate * 1.5));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = softened ? 0x4a39b70d : 0x12e15e35;
    let memory = 0;
    for (let index = 0; index < frameCount; index += 1) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) | 0;
      const white = ((seed >>> 8) / 0x00ffffff) * 2 - 1;
      if (softened) {
        memory = (memory + white * 0.055) / 1.045;
        data[index] = memory * 2.4;
      } else {
        data[index] = white * 0.58;
      }
    }
    return buffer;
  }

  private withAudioGraph(callback: () => void): void {
    void this.start().then(callback).catch(() => {
      // Audio is optional; unsupported/restricted contexts must not break driving.
    });
  }

  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.resume();
    }
  };
}
