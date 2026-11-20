import type { IgnitionPhaseTelemetry, EhsAcousticState, VehicleAcousticTelemetry } from './AcousticTelemetry';
import type { VehicleAcousticProfile } from './VehicleAcousticProfile';

export type PowertrainAcousticEventType =
  // Traditional ICE
  | 'ICE_STARTER'
  | 'ICE_CRANKING'
  | 'ICE_IGNITION'
  | 'ICE_RPM_RISE'
  | 'ICE_IDLE_STABILIZED'
  | 'ICE_SHUTDOWN'
  | 'ICE_MECHANICAL_DECAY'
  // P2 PHEV
  | 'P2_ENGINE_START_REQUEST'
  | 'P2_ENGINE_CRANKING'
  | 'P2_SYNCHRONIZATION'
  | 'P2_K0_ENGAGEMENT'
  | 'P2_ENGINE_LOAD_TRANSITION'
  | 'P2_ENGINE_SHUTDOWN'
  // EHS Series-Parallel PHEV
  | 'EHS_P1_CRANKING'
  | 'EHS_ENGINE_START'
  | 'EHS_GENERATOR_MODE'
  | 'EHS_GENERATOR_RPM_STABILIZED'
  | 'EHS_SERIES_TO_PARALLEL'
  | 'EHS_DIRECT_DRIVE_ENGAGEMENT'
  | 'EHS_ENGINE_SHUTDOWN'
  // Pure EV (and EV operational layer on PHEVs)
  | 'EV_DRIVE_READY'
  | 'EV_INVERTER_ACTIVATION'
  | 'EV_MOTOR_LOAD_TRANSITION'
  | 'EV_REGEN_TRANSITION'
  | 'EV_DRIVE_SHUTDOWN'
  // Drivetrain & turbo/overrun transients
  | 'SHIFT_UPSHIFT'
  | 'SHIFT_DOWNSHIFT'
  | 'EV_TWO_SPEED_SHIFT'
  | 'TURBO_BLOWOFF'
  | 'OVERRUN_BURBLE'
  | 'DRIVETRAIN_LASH';

export type AcousticEventCategory =
  | 'ignition'
  | 'hybrid_sync'
  | 'hybrid_clutch'
  | 'ev_power'
  | 'ev_load'
  | 'shift'
  | 'turbo'
  | 'overrun'
  | 'mechanical';

export type AcousticEventPriority = 1 | 2 | 3 | 4;

export interface PowertrainAcousticEvent {
  type: PowertrainAcousticEventType;
  category: AcousticEventCategory;
  priority: AcousticEventPriority;
  /** Normalized intensity 0..1 derived from real telemetry. */
  intensity: number;
  /** Optional physical anchor value (e.g. RPM, boost drop bar, slip RPM). */
  value: number;
  /** Category to cancel before firing this event, if any. */
  cancelCategory: AcousticEventCategory | null;
}

const EVENT_POOL_CAPACITY = 16;

const COOLDOWN_SECONDS: Readonly<Record<PowertrainAcousticEventType, number>> = {
  ICE_STARTER: 0.40,
  ICE_CRANKING: 0.35,
  ICE_IGNITION: 0.35,
  ICE_RPM_RISE: 0.45,
  ICE_IDLE_STABILIZED: 0.60,
  ICE_SHUTDOWN: 0.40,
  ICE_MECHANICAL_DECAY: 0.50,

  P2_ENGINE_START_REQUEST: 0.45,
  P2_ENGINE_CRANKING: 0.35,
  P2_SYNCHRONIZATION: 0.45,
  P2_K0_ENGAGEMENT: 0.40,
  P2_ENGINE_LOAD_TRANSITION: 0.45,
  P2_ENGINE_SHUTDOWN: 0.45,

  EHS_P1_CRANKING: 0.35,
  EHS_ENGINE_START: 0.35,
  EHS_GENERATOR_MODE: 0.55,
  EHS_GENERATOR_RPM_STABILIZED: 0.70,
  EHS_SERIES_TO_PARALLEL: 0.55,
  EHS_DIRECT_DRIVE_ENGAGEMENT: 0.50,
  EHS_ENGINE_SHUTDOWN: 0.45,

  EV_DRIVE_READY: 0.50,
  EV_INVERTER_ACTIVATION: 0.45,
  EV_MOTOR_LOAD_TRANSITION: 0.55,
  EV_REGEN_TRANSITION: 0.55,
  EV_DRIVE_SHUTDOWN: 0.50,

  SHIFT_UPSHIFT: 0.14,
  SHIFT_DOWNSHIFT: 0.14,
  EV_TWO_SPEED_SHIFT: 0.35,
  TURBO_BLOWOFF: 0.45,
  OVERRUN_BURBLE: 0.24,
  DRIVETRAIN_LASH: 0.30,
};

const clamp01 = (v: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;

/**
 * Deterministic, state-driven powertrain event detector.
 * - Driven strictly by real vehicle telemetry edges (never road-speed guesses).
 * - Deduplicates repeated triggers via edge latches + per-event cooldowns.
 * - Emits cancellation directives when mutually exclusive phases change
 *   (e.g. shutdown cancels cranking/catch; new start cancels shutdown decay).
 * - Zero heap allocations during update().
 */
export class PowertrainEventController {
  private readonly eventPool: PowertrainAcousticEvent[] = Array.from({ length: EVENT_POOL_CAPACITY }, () => ({
    type: 'ICE_STARTER',
    category: 'ignition',
    priority: 3,
    intensity: 0,
    value: 0,
    cancelCategory: null,
  }));
  private emittedCount = 0;

  private initialized = false;
  private elapsedSeconds = 0;
  private readonly lastFiredAt: Partial<Record<PowertrainAcousticEventType, number>> = {};

  // ICE state latches
  private lastIgnitionPhase: IgnitionPhaseTelemetry = 'OFF';
  private lastEngineRunning = false;
  private awaitingRpmRise = false;
  private awaitingIdleStable = false;
  private awaitingMechDecay = false;
  private startupPeakRpm = 0;
  private lastRpm = 0;
  private lastThrottle = 0;
  private lastBoostBar = 0;
  private lastManualStartTriggeredAt = -10;
  private lastManualStopTriggeredAt = -10;

  // P2 PHEV state latches
  private lastP2Requested = false;
  private lastP2Phase: IgnitionPhaseTelemetry = 'OFF';
  private p2SyncEmitted = false;
  private p2K0Locked = false;
  private p2Loaded = false;

  // EHS PHEV state latches
  private lastEhsPhase: IgnitionPhaseTelemetry = 'OFF';
  private lastEhsState: EhsAcousticState = 'EV';
  private lastEhsPath: 'EV' | 'SERIES' | 'PARALLEL' = 'EV';
  private ehsGenActive = false;
  private ehsGenStable = false;
  private ehsDirectLocked = false;

  // EV state latches
  private lastOperational = false;
  private lastDriving = false;
  private evHighLoadActive = false;
  private evRegenActive = false;
  private lastEvGear = 1;
  private lastEvShifting = false;

  // Shared drivetrain latches
  private lastGear = 0;
  private lastShifting = false;
  private lastLashHigh = false;
  private overrunBurbleRemaining = 0;
  private overrunBurbleTimer = 0;

  /** Active event slice count produced by the most recent update() call. */
  public get count(): number {
    return this.emittedCount;
  }

  public getEvent(index: number): Readonly<PowertrainAcousticEvent> {
    return this.eventPool[index]!;
  }

  public reset(): void {
    this.initialized = false;
    this.elapsedSeconds = 0;
    this.emittedCount = 0;
    for (const key of Object.keys(this.lastFiredAt) as PowertrainAcousticEventType[]) {
      delete this.lastFiredAt[key];
    }
    this.lastIgnitionPhase = 'OFF';
    this.lastEngineRunning = false;
    this.awaitingRpmRise = false;
    this.awaitingIdleStable = false;
    this.awaitingMechDecay = false;
    this.startupPeakRpm = 0;
    this.lastRpm = 0;
    this.lastThrottle = 0;
    this.lastBoostBar = 0;
    this.lastManualStartTriggeredAt = -10;
    this.lastManualStopTriggeredAt = -10;

    this.lastP2Requested = false;
    this.lastP2Phase = 'OFF';
    this.p2SyncEmitted = false;
    this.p2K0Locked = false;
    this.p2Loaded = false;

    this.lastEhsPhase = 'OFF';
    this.lastEhsState = 'EV';
    this.lastEhsPath = 'EV';
    this.ehsGenActive = false;
    this.ehsGenStable = false;
    this.ehsDirectLocked = false;

    this.lastOperational = false;
    this.lastDriving = false;
    this.evHighLoadActive = false;
    this.evRegenActive = false;
    this.lastEvGear = 1;
    this.lastEvShifting = false;

    this.lastGear = 0;
    this.lastShifting = false;
    this.lastLashHigh = false;
    this.overrunBurbleRemaining = 0;
    this.overrunBurbleTimer = 0;
  }

  /**
   * Explicit manual ignition hook for legacy instant-start engines (no ignitionSequence).
   * Deduplicates automatically against sequenced ignition telemetry.
   */
  public notifyLegacyIgnitionStart(profile: VehicleAcousticProfile): number {
    this.emittedCount = 0;
    if (!profile.engine || profile.powertrainKind === 'EV') return 0;
    this.lastManualStartTriggeredAt = this.elapsedSeconds;
    this.push('ICE_STARTER', 'ignition', 3, 1, profile.engine.idleRPM, 'ignition');
    return this.emittedCount;
  }

  public notifyLegacyEngineCatch(profile: VehicleAcousticProfile): number {
    this.emittedCount = 0;
    if (!profile.engine || profile.powertrainKind === 'EV') return 0;
    this.lastManualStartTriggeredAt = this.elapsedSeconds;
    this.lastEngineRunning = true;
    this.lastIgnitionPhase = 'RUNNING';
    this.awaitingIdleStable = true;
    this.push('ICE_IGNITION', 'ignition', 4, 1, profile.engine.idleRPM * 1.25, 'ignition');
    this.push('ICE_RPM_RISE', 'ignition', 3, 0.85, profile.engine.idleRPM * 1.3, null);
    return this.emittedCount;
  }

  public notifyLegacyEngineStop(profile: VehicleAcousticProfile, rpm: number): number {
    this.emittedCount = 0;
    if (!profile.engine || profile.powertrainKind === 'EV') return 0;
    this.lastManualStopTriggeredAt = this.elapsedSeconds;
    this.lastEngineRunning = false;
    this.lastIgnitionPhase = 'OFF';
    this.awaitingRpmRise = false;
    this.awaitingIdleStable = false;
    this.push('ICE_SHUTDOWN', 'ignition', 4, 1, Math.max(profile.engine.idleRPM * 0.7, rpm), 'ignition');
    this.push('ICE_MECHANICAL_DECAY', 'ignition', 2, 0.85, Math.max(300, rpm), null);
    return this.emittedCount;
  }

  /**
   * Advances state machines from real vehicle telemetry.
   * Returns the number of discrete events emitted into the internal pool.
   */
  public update(
    dt: number,
    profile: VehicleAcousticProfile,
    t: Readonly<VehicleAcousticTelemetry>,
  ): number {
    const safeDt = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
    this.elapsedSeconds += safeDt;
    this.emittedCount = 0;

    if (!this.initialized) {
      this.syncInitialState(t);
      return 0;
    }

    if (profile.powertrainKind === 'P2_PHEV' || t.p2Active) {
      this.updateEvOperationalEvents(t, true);
      this.updateP2Events(profile, t);
      this.updateSharedCombustionDrivetrainEvents(safeDt, profile, t);
    } else if (profile.powertrainKind === 'EHS_PHEV' || t.ehsActive) {
      this.updateEvOperationalEvents(t, true);
      this.updateEhsEvents(profile, t);
      this.updateSharedCombustionDrivetrainEvents(safeDt, profile, t);
    } else if (profile.powertrainKind === 'EV' || t.evActive) {
      this.updateEvOperationalEvents(t, false);
      this.updatePureEvEvents(profile, t);
    } else {
      this.updateIceEvents(profile, t);
      this.updateSharedCombustionDrivetrainEvents(safeDt, profile, t);
    }

    this.lastRpm = t.rpm;
    this.lastThrottle = t.throttle;
    this.lastBoostBar = t.boostPressureBar;
    this.lastGear = t.gearNumber;
    this.lastShifting = t.shiftInProgress;
    return this.emittedCount;
  }

  private syncInitialState(t: Readonly<VehicleAcousticTelemetry>): void {
    this.initialized = true;
    this.lastIgnitionPhase = t.ignitionPhase;
    this.lastEngineRunning = t.engineRunning;
    this.lastRpm = t.rpm;
    this.lastThrottle = t.throttle;
    this.lastBoostBar = t.boostPressureBar;
    this.lastP2Requested = t.p2EngineRequested;
    this.lastP2Phase = t.p2EnginePhase;
    this.p2K0Locked = t.p2ClutchEngagement >= 0.72;
    this.p2Loaded = Math.abs(t.p2ClutchTorque) > 45;
    this.lastEhsPhase = t.ehsEnginePhase;
    this.lastEhsState = t.ehsState;
    this.lastEhsPath = t.ehsPath;
    this.ehsGenActive = t.ehsState === 'SERIES' && t.ehsP1GenerationPowerW > 500;
    this.ehsGenStable = this.ehsGenActive;
    this.ehsDirectLocked = t.ehsDirectClutchEngagement >= 0.75 || t.ehsState === 'DIRECT';
    this.lastOperational = t.vehicleOperational;
    this.lastDriving = t.driving;
    this.evHighLoadActive = t.drivePowerKw > 25;
    this.evRegenActive = t.regenPowerKw > 4;
    this.lastEvGear = t.evGear;
    this.lastEvShifting = t.evShiftInProgress;
    this.lastGear = t.gearNumber;
    this.lastShifting = t.shiftInProgress;
    this.lastLashHigh = t.drivetrainLashIntensity > 0.35;
  }

  private updateIceEvents(profile: VehicleAcousticProfile, t: Readonly<VehicleAcousticTelemetry>): void {
    const eng = profile.engine;
    if (!eng) return;

    const phase = t.ignitionPhase;
    const prevPhase = this.lastIgnitionPhase;

    if (t.sequencedIgnition) {
      if (phase !== prevPhase) {
        if (phase === 'CRANKING') {
          this.awaitingRpmRise = true;
          this.awaitingIdleStable = false;
          this.awaitingMechDecay = false;
          this.startupPeakRpm = 0;
          this.push('ICE_STARTER', 'ignition', 3, 1, eng.idleRPM, 'ignition');
          this.push('ICE_CRANKING', 'ignition', 3, 1, t.rpm, null);
        } else if (phase === 'CATCH') {
          this.awaitingRpmRise = true;
          this.awaitingIdleStable = true;
          this.startupPeakRpm = t.rpm;
          this.push('ICE_IGNITION', 'ignition', 4, 1, Math.max(t.rpm, eng.idleRPM * 1.15), 'ignition');
        } else if (phase === 'RUNNING' && (prevPhase === 'OFF' || prevPhase === 'STOPPING')) {
          this.awaitingIdleStable = true;
          this.push('ICE_IGNITION', 'ignition', 4, 0.9, Math.max(t.rpm, eng.idleRPM), 'ignition');
        } else if (phase === 'STOPPING') {
          this.awaitingRpmRise = false;
          this.awaitingIdleStable = false;
          this.awaitingMechDecay = true;
          this.push('ICE_SHUTDOWN', 'ignition', 4, 1, Math.max(eng.idleRPM * 0.65, t.rpm), 'ignition');
        } else if (phase === 'OFF' && prevPhase === 'STOPPING') {
          if (this.awaitingMechDecay) {
            this.awaitingMechDecay = false;
            this.push('ICE_MECHANICAL_DECAY', 'ignition', 2, 0.75, Math.max(120, this.lastRpm), null);
          }
        } else if (phase === 'OFF' && prevPhase === 'RUNNING') {
          this.awaitingRpmRise = false;
          this.awaitingIdleStable = false;
          this.push('ICE_SHUTDOWN', 'ignition', 4, 1, Math.max(eng.idleRPM * 0.65, this.lastRpm), 'ignition');
          this.push('ICE_MECHANICAL_DECAY', 'ignition', 2, 0.75, Math.max(120, this.lastRpm), null);
        }
        this.lastIgnitionPhase = phase;
      }

      // RPM Rise after catch (real flare detection)
      if (this.awaitingRpmRise && (phase === 'CATCH' || phase === 'RUNNING')) {
        if (t.rpm > this.startupPeakRpm) this.startupPeakRpm = t.rpm;
        if (t.rpm >= eng.idleRPM * 1.08) {
          this.awaitingRpmRise = false;
          this.push('ICE_RPM_RISE', 'ignition', 3, clamp01((t.rpm - eng.idleRPM * 0.7) / Math.max(300, eng.idleRPM * 0.8)), t.rpm, null);
        }
      }

      // Idle Stabilization once flare settles near configured idle
      if (this.awaitingIdleStable && phase === 'RUNNING' && t.throttle < 0.05) {
        if (Math.abs(t.rpm - eng.idleRPM) < Math.max(70, eng.idleRPM * 0.10)) {
          this.awaitingIdleStable = false;
          this.push('ICE_IDLE_STABILIZED', 'ignition', 1, 0.6, t.rpm, null);
        }
      }

      // Mechanical decay mid-way through STOPPING coast-down
      if (this.awaitingMechDecay && phase === 'STOPPING' && t.rpm < eng.idleRPM * 0.42 && t.rpm > 20) {
        this.awaitingMechDecay = false;
        this.push('ICE_MECHANICAL_DECAY', 'ignition', 2, 0.85, t.rpm, null);
      }
    } else {
      // Legacy instant-start engines (no ignitionSequence in physics config)
      const recentlyManualStarted = this.elapsedSeconds - this.lastManualStartTriggeredAt < 0.25;
      const recentlyManualStopped = this.elapsedSeconds - this.lastManualStopTriggeredAt < 0.25;
      if (t.engineRunning && !this.lastEngineRunning && !recentlyManualStarted) {
        this.awaitingIdleStable = true;
        this.push('ICE_STARTER', 'ignition', 3, 0.75, eng.idleRPM, 'ignition');
        this.push('ICE_IGNITION', 'ignition', 4, 1, Math.max(t.rpm, eng.idleRPM), null);
        this.push('ICE_RPM_RISE', 'ignition', 3, 0.8, eng.idleRPM * 1.25, null);
      } else if (!t.engineRunning && this.lastEngineRunning && !recentlyManualStopped) {
        this.awaitingIdleStable = false;
        this.push('ICE_SHUTDOWN', 'ignition', 4, 1, Math.max(eng.idleRPM * 0.65, this.lastRpm), 'ignition');
        this.push('ICE_MECHANICAL_DECAY', 'ignition', 2, 0.8, Math.max(200, this.lastRpm), null);
      } else if (this.awaitingIdleStable && t.engineRunning && t.throttle < 0.05 && Math.abs(t.rpm - eng.idleRPM) < 90) {
        this.awaitingIdleStable = false;
        this.push('ICE_IDLE_STABILIZED', 'ignition', 1, 0.55, t.rpm, null);
      }
      this.lastIgnitionPhase = phase;
    }

    this.lastEngineRunning = t.engineRunning;
  }

  private updateP2Events(profile: VehicleAcousticProfile, t: Readonly<VehicleAcousticTelemetry>): void {
    const eng = profile.engine;
    const phase = t.p2EnginePhase;
    const prevPhase = this.lastP2Phase;

    // 1. Engine Start Request
    if (t.p2EngineRequested && !this.lastP2Requested) {
      this.p2SyncEmitted = false;
      this.p2K0Locked = false;
      this.p2Loaded = false;
      this.push('P2_ENGINE_START_REQUEST', 'hybrid_sync', 3, clamp01(0.45 + t.throttle * 0.55), t.p2MotorRPM, 'ignition');
    }

    // 2. Engine Cranking & Ignition Catch
    if (phase !== prevPhase) {
      if (phase === 'CRANKING') {
        this.push('P2_ENGINE_CRANKING', 'ignition', 3, 1, t.rpm, 'ignition');
      } else if (phase === 'CATCH') {
        this.push('ICE_IGNITION', 'ignition', 4, 0.82, Math.max(t.rpm, eng?.idleRPM ?? 780), 'ignition');
      } else if (phase === 'STOPPING' || (phase === 'OFF' && (prevPhase === 'RUNNING' || prevPhase === 'CATCH'))) {
        this.p2SyncEmitted = false;
        this.p2K0Locked = false;
        this.p2Loaded = false;
        this.push('P2_ENGINE_SHUTDOWN', 'ignition', 4, 1, Math.max(300, this.lastRpm), 'ignition');
      }
      this.lastP2Phase = phase;
    }

    // 3. P2 Synchronization (engine running & requested, K0 still open, matching shaft speed)
    if (
      t.p2EngineRequested &&
      t.engineRunning &&
      phase === 'RUNNING' &&
      !this.p2K0Locked &&
      !this.p2SyncEmitted &&
      t.p2ClutchEngagement < 0.65 &&
      Math.abs(t.p2ClutchSlipRPM) > 40
    ) {
      this.p2SyncEmitted = true;
      this.push(
        'P2_SYNCHRONIZATION',
        'hybrid_sync',
        3,
        clamp01(Math.abs(t.p2ClutchSlipRPM) / 1400),
        Math.abs(t.p2ClutchSlipRPM),
        null,
      );
    }

    // 4. K0 Clutch Engagement
    if (!this.p2K0Locked && t.p2ClutchEngagement >= 0.72 && t.engineRunning) {
      this.p2K0Locked = true;
      this.push(
        'P2_K0_ENGAGEMENT',
        'hybrid_clutch',
        3,
        clamp01(0.45 + Math.abs(t.p2ClutchTorque) / 320),
        t.p2ClutchTorque,
        'hybrid_sync',
      );
    } else if (this.p2K0Locked && t.p2ClutchEngagement < 0.20) {
      this.p2K0Locked = false;
      this.p2Loaded = false;
      this.p2SyncEmitted = false;
    }

    // 5. Engine Load Transition (combined torque ramp after K0 locks)
    const highLoad = this.p2K0Locked && t.p2ClutchTorque > 85 && t.engineLoad > 0.32;
    if (highLoad && !this.p2Loaded) {
      this.p2Loaded = true;
      this.push('P2_ENGINE_LOAD_TRANSITION', 'hybrid_clutch', 2, clamp01(t.engineLoad), t.p2ClutchTorque, null);
    } else if (!highLoad && t.p2ClutchTorque < 30) {
      this.p2Loaded = false;
    }

    this.lastP2Requested = t.p2EngineRequested;
    this.lastEngineRunning = t.engineRunning;
    this.lastIgnitionPhase = phase;
  }

  private updateEhsEvents(profile: VehicleAcousticProfile, t: Readonly<VehicleAcousticTelemetry>): void {
    const eng = profile.engine;
    const phase = t.ehsEnginePhase;
    const prevPhase = this.lastEhsPhase;

    // 1. P1 High-RPM Cranking / Engine Start / Shutdown
    if (phase !== prevPhase) {
      if (phase === 'CRANKING') {
        this.ehsGenActive = false;
        this.ehsGenStable = false;
        this.ehsDirectLocked = false;
        this.push('EHS_P1_CRANKING', 'ignition', 3, 1, Math.max(t.ehsP1RPM, 650), 'ignition');
      } else if (phase === 'CATCH' || (phase === 'RUNNING' && prevPhase === 'CRANKING')) {
        this.push('EHS_ENGINE_START', 'ignition', 4, 0.85, Math.max(t.rpm, eng?.idleRPM ?? 1000), 'ignition');
      } else if (phase === 'STOPPING' || (phase === 'OFF' && (prevPhase === 'RUNNING' || prevPhase === 'CATCH'))) {
        this.ehsGenActive = false;
        this.ehsGenStable = false;
        this.ehsDirectLocked = false;
        this.push('EHS_ENGINE_SHUTDOWN', 'ignition', 4, 1, Math.max(400, this.lastRpm), 'ignition');
      }
      this.lastEhsPhase = phase;
    }

    // 2. Generator Mode entry (SERIES + P1 actively generating)
    const inGenerator = t.ehsState === 'SERIES' && t.engineRunning && t.ehsP1GenerationPowerW > 500;
    if (inGenerator && !this.ehsGenActive) {
      this.ehsGenActive = true;
      this.ehsGenStable = false;
      this.push(
        'EHS_GENERATOR_MODE',
        'hybrid_sync',
        3,
        clamp01(t.ehsP1GenerationPowerW / 35_000),
        t.ehsTargetRPM || t.rpm,
        null,
      );
    } else if (!inGenerator && t.ehsState !== 'SERIES') {
      this.ehsGenActive = false;
      this.ehsGenStable = false;
    }

    // 3. Generator RPM Stabilization (crank RPM settled near targetRPM in SERIES)
    if (
      this.ehsGenActive &&
      !this.ehsGenStable &&
      t.ehsTargetRPM > 800 &&
      Math.abs(t.rpm - t.ehsTargetRPM) < 180
    ) {
      this.ehsGenStable = true;
      this.push('EHS_GENERATOR_RPM_STABILIZED', 'hybrid_sync', 1, 0.65, t.rpm, null);
    }

    // 4. Series-to-Parallel Transition
    if (
      (this.lastEhsPath === 'SERIES' || this.lastEhsState === 'SERIES') &&
      (t.ehsPath === 'PARALLEL' || t.ehsState === 'PARALLEL' || t.ehsState === 'DIRECT')
    ) {
      this.push(
        'EHS_SERIES_TO_PARALLEL',
        'hybrid_sync',
        3,
        clamp01(0.5 + Math.abs(t.ehsDirectClutchSlipRPM) / 800),
        t.ehsDirectClutchSlipRPM,
        null,
      );
    }

    // 5. Direct Drive Engagement (clutch locked or DIRECT state)
    const directLocked = t.ehsDirectClutchEngagement >= 0.75 || t.ehsState === 'DIRECT';
    if (directLocked && !this.ehsDirectLocked && t.engineRunning) {
      this.ehsDirectLocked = true;
      this.push(
        'EHS_DIRECT_DRIVE_ENGAGEMENT',
        'hybrid_clutch',
        3,
        clamp01(0.5 + Math.abs(t.ehsDirectClutchTorqueNm) / 140),
        t.ehsDirectClutchTorqueNm,
        'hybrid_sync',
      );
    } else if (!directLocked && t.ehsDirectClutchEngagement < 0.2) {
      this.ehsDirectLocked = false;
    }

    this.lastEhsState = t.ehsState;
    this.lastEhsPath = t.ehsPath;
    this.lastEngineRunning = t.engineRunning;
    this.lastIgnitionPhase = phase;
  }

  private updateEvOperationalEvents(t: Readonly<VehicleAcousticTelemetry>, isHybrid: boolean): void {
    // Operational power-on / Drive Ready
    if (t.vehicleOperational && !this.lastOperational) {
      this.push('EV_DRIVE_READY', 'ev_power', 3, 1, 0, 'ev_power');
    } else if (!t.vehicleOperational && this.lastOperational) {
      this.evHighLoadActive = false;
      this.evRegenActive = false;
      this.push('EV_DRIVE_SHUTDOWN', 'ev_power', 4, 1, 0, 'ev_power');
    }

    // Inverter / Motor activation on entering D/R while operational
    if (!isHybrid && t.vehicleOperational && t.driving && !this.lastDriving) {
      this.push('EV_INVERTER_ACTIVATION', 'ev_power', 2, 0.85, 0, null);
    }

    this.lastOperational = t.vehicleOperational;
    this.lastDriving = t.driving;
  }

  private updatePureEvEvents(profile: VehicleAcousticProfile, t: Readonly<VehicleAcousticTelemetry>): void {
    if (!t.vehicleOperational) return;

    // Motor Load Transition (surge into significant propulsion)
    const highLoad = t.driving && t.drivePowerKw > 35 && t.throttle > 0.35;
    if (highLoad && !this.evHighLoadActive) {
      this.evHighLoadActive = true;
      this.push('EV_MOTOR_LOAD_TRANSITION', 'ev_load', 2, clamp01(t.drivePowerKw / 220), t.drivePowerKw, null);
    } else if (t.drivePowerKw < 10 || t.throttle < 0.10) {
      this.evHighLoadActive = false;
    }

    // Regeneration Transition (crossing into meaningful electric braking)
    const regenNow = t.driving && t.regenPowerKw > 6 && t.vehicleSpeed > 2.2;
    if (regenNow && !this.evRegenActive) {
      this.evRegenActive = true;
      this.push('EV_REGEN_TRANSITION', 'ev_load', 2, clamp01(t.regenPowerKw / 75), t.regenPowerKw, null);
    } else if (t.regenPowerKw < 1.5) {
      this.evRegenActive = false;
    }

    // 2-speed EV transmission shift (e.g. Porsche Taycan 4S rear 2-speed gearbox)
    if (profile.transmission.type === 'EV_TWO_SPEED') {
      const shiftStarted = t.evShiftInProgress && !this.lastEvShifting;
      const gearChanged = t.evGear !== this.lastEvGear && t.evGear >= 1 && this.lastEvGear >= 1;
      if (shiftStarted || gearChanged) {
        const upshift = t.evGear > this.lastEvGear ? 1 : -1;
        this.push('EV_TWO_SPEED_SHIFT', 'shift', 3, clamp01(0.45 + t.throttle * 0.55), upshift, 'shift');
      }
      this.lastEvGear = t.evGear;
      this.lastEvShifting = t.evShiftInProgress;
    }
  }

  private updateSharedCombustionDrivetrainEvents(
    dt: number,
    profile: VehicleAcousticProfile,
    t: Readonly<VehicleAcousticTelemetry>,
  ): void {
    const tx = profile.transmission;
    const eng = profile.engine;

    // Stepped transmission shift events (MT / AT / DCT / LST / P2 9HAT)
    if (tx.shiftEventStyle !== 'NONE' && tx.type !== 'CVT' && tx.type !== 'EHS_DIRECT') {
      const startedShift = t.shiftInProgress && !this.lastShifting;
      const gearStepped = !t.shiftInProgress && this.lastGear > 0 && t.gearNumber > 0 && t.gearNumber !== this.lastGear;
      if (startedShift) {
        const direction = t.targetGearNumber > 0 && t.gearNumber > 0
          ? (t.targetGearNumber >= t.gearNumber ? 1 : -1)
          : 1;
        const intensity = clamp01(0.35 + t.engineLoad * 0.45 + clamp01(t.rpm / Math.max(1000, eng?.redlineRPM ?? 6000)) * 0.25);
        this.push(
          direction >= 0 ? 'SHIFT_UPSHIFT' : 'SHIFT_DOWNSHIFT',
          'shift',
          3,
          intensity,
          t.rpm,
          'shift',
        );
      } else if (gearStepped) {
        const direction = t.gearNumber > this.lastGear ? 1 : -1;
        const intensity = clamp01(0.30 + t.engineLoad * 0.45 + clamp01(t.rpm / Math.max(1000, eng?.redlineRPM ?? 6000)) * 0.25);
        this.push(
          direction >= 0 ? 'SHIFT_UPSHIFT' : 'SHIFT_DOWNSHIFT',
          'shift',
          3,
          intensity,
          t.rpm,
          'shift',
        );
      }
    }

    // Turbo blow-off / diverter valve transient on rapid throttle lift under boost
    if (eng?.turbo && t.engineRunning && eng.turbo.blowoffLevel > 0.001) {
      const throttleDropped = this.lastThrottle > 0.45 && t.throttle < 0.16;
      const boostWasHigh = this.lastBoostBar > Math.max(0.28, eng.turbo.maxBoostBar * 0.28);
      if (throttleDropped && boostWasHigh) {
        const intensity = clamp01(this.lastBoostBar / Math.max(0.4, eng.turbo.maxBoostBar));
        this.push('TURBO_BLOWOFF', 'turbo', 2, intensity, this.lastBoostBar, 'turbo');
      }
    }

    // Overrun exhaust burble/crackle on high-RPM throttle lift (sport/supercars only)
    if (eng && eng.overrun.popIntensity > 0.01 && t.engineRunning) {
      const sportMul = (t.driveMode === 'SPORT' || t.driveMode === 'RACE' || t.driveMode === 'SPORT_PLUS')
        ? eng.overrun.sportPopMultiplier
        : 1;
      if (this.lastThrottle > 0.35 && t.throttle < 0.08 && t.rpm >= eng.overrun.popMinRPM && sportMul > 0) {
        this.overrunBurbleRemaining = sportMul > 1.2 ? 3 : 2;
        this.overrunBurbleTimer = 0.06;
      }
      if (this.overrunBurbleRemaining > 0) {
        if (t.throttle > 0.15 || t.rpm < eng.overrun.popMinRPM * 0.8) {
          this.overrunBurbleRemaining = 0;
        } else {
          this.overrunBurbleTimer -= dt;
          if (this.overrunBurbleTimer <= 0) {
            this.overrunBurbleRemaining -= 1;
            this.overrunBurbleTimer = 0.14 + (2 - this.overrunBurbleRemaining) * 0.05;
            const rpmRatio = clamp01((t.rpm - eng.overrun.popMinRPM * 0.8) / Math.max(1000, eng.redlineRPM - eng.overrun.popMinRPM * 0.8));
            this.push('OVERRUN_BURBLE', 'overrun', 1, clamp01(eng.overrun.popIntensity * sportMul * (0.45 + rpmRatio * 0.55)), t.rpm, null);
          }
        }
      }
    } else {
      this.overrunBurbleRemaining = 0;
    }

    // Drivetrain lash clunk (manual/stiff drivetrain torque reversal)
    if (profile.mechanical.drivetrainLashGain > 0.001) {
      const highLash = t.drivetrainLashIntensity > 0.45;
      if (highLash && !this.lastLashHigh) {
        this.push('DRIVETRAIN_LASH', 'mechanical', 1, clamp01(t.drivetrainLashIntensity), t.vehicleSpeed, null);
      }
      this.lastLashHigh = highLash;
    }
  }

  private push(
    type: PowertrainAcousticEventType,
    category: AcousticEventCategory,
    priority: AcousticEventPriority,
    intensity: number,
    value: number,
    cancelCategory: AcousticEventCategory | null,
  ): void {
    const cooldown = COOLDOWN_SECONDS[type];
    const previous = this.lastFiredAt[type];
    if (previous !== undefined && this.elapsedSeconds - previous < cooldown) {
      return;
    }
    if (this.emittedCount >= EVENT_POOL_CAPACITY) {
      return;
    }
    this.lastFiredAt[type] = this.elapsedSeconds;
    const slot = this.eventPool[this.emittedCount]!;
    slot.type = type;
    slot.category = category;
    slot.priority = priority;
    slot.intensity = clamp01(intensity);
    slot.value = Number.isFinite(value) ? value : 0;
    slot.cancelCategory = cancelCategory;
    this.emittedCount += 1;
  }
}
