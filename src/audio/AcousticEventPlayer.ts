import type {
  AcousticEventCategory,
  AcousticEventPriority,
  PowertrainAcousticEvent,
} from './PowertrainEventController';
import type { VehicleAcousticProfile } from './VehicleAcousticProfile';

const SILENCE = 0.0001;
export const MAX_CONCURRENT_TRANSIENTS = 8;

interface ActiveVoice {
  id: number;
  category: AcousticEventCategory | 'ui' | 'weather';
  priority: AcousticEventPriority;
  startedAt: number;
  endsAt: number;
  softCancel: (now: number) => void;
  stopAndCleanup: () => void;
}

export interface TransientPlayerStats {
  readonly activeVoices: number;
  readonly peakConcurrentVoices: number;
  readonly totalTriggered: number;
  readonly totalDroppedByCap: number;
  readonly totalCancelled: number;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

/**
 * Bounded, priority-aware transient voice scheduler & powertrain event synthesizer.
 * - Enforces MAX_CONCURRENT_TRANSIENTS = 8 across all one-shot sounds.
 * - Supports category cancellation (preventing lingering starter/shutdown overlap).
 * - Cleans up and disconnects all nodes deterministically on end or cancelAll().
 */
export class AcousticEventPlayer {
  private readonly voices: ActiveVoice[] = [];
  private nextVoiceId = 1;
  private peakConcurrent = 0;
  private totalTriggered = 0;
  private totalDropped = 0;
  private totalCancelled = 0;

  public get activeVoiceCount(): number {
    return this.voices.length;
  }

  public getStats(): TransientPlayerStats {
    return {
      activeVoices: this.voices.length,
      peakConcurrentVoices: this.peakConcurrent,
      totalTriggered: this.totalTriggered,
      totalDroppedByCap: this.totalDropped,
      totalCancelled: this.totalCancelled,
    };
  }

  public resetStats(): void {
    this.peakConcurrent = this.voices.length;
    this.totalTriggered = 0;
    this.totalDropped = 0;
    this.totalCancelled = 0;
  }

  /** Reaps expired voices whose end time has passed without waiting for onended. */
  public prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i -= 1) {
      if (this.voices[i]!.endsAt <= now - 0.02) {
        const voice = this.voices[i]!;
        this.voices.splice(i, 1);
        voice.stopAndCleanup();
      }
    }
  }

  public cancelCategory(category: ActiveVoice['category'], now?: number): void {
    for (let i = this.voices.length - 1; i >= 0; i -= 1) {
      if (this.voices[i]!.category === category) {
        const voice = this.voices[i]!;
        this.voices.splice(i, 1);
        this.totalCancelled += 1;
        if (now !== undefined) voice.softCancel(now);
        else voice.stopAndCleanup();
      }
    }
  }

  public cancelAll(): void {
    while (this.voices.length > 0) {
      const voice = this.voices.pop()!;
      this.totalCancelled += 1;
      voice.stopAndCleanup();
    }
  }

  /**
   * Reserves a slot under MAX_CONCURRENT_TRANSIENTS.
   * Steals the lowest-priority oldest voice if the incoming priority is higher;
   * otherwise drops the incoming low-priority sound gracefully.
   */
  public tryAcquireSlot(
    now: number,
    category: ActiveVoice['category'],
    priority: AcousticEventPriority,
    durationSec: number,
    stopAndCleanup: () => void,
    softCancel?: (t: number) => void,
  ): number | null {
    this.prune(now);

    if (this.voices.length >= MAX_CONCURRENT_TRANSIENTS) {
      let victimIndex = -1;
      let victimPriority = priority;
      let victimStart = Infinity;
      for (let i = 0; i < this.voices.length; i += 1) {
        const v = this.voices[i]!;
        if (v.priority < victimPriority || (v.priority === victimPriority && v.startedAt < victimStart && priority >= 3)) {
          victimPriority = v.priority;
          victimStart = v.startedAt;
          victimIndex = i;
        }
      }
      if (victimIndex < 0) {
        this.totalDropped += 1;
        return null;
      }
      const victim = this.voices.splice(victimIndex, 1)[0]!;
      this.totalCancelled += 1;
      victim.softCancel(now);
    }

    const id = this.nextVoiceId++;
    this.voices.push({
      id,
      category,
      priority,
      startedAt: now,
      endsAt: now + Math.max(0.02, durationSec),
      softCancel: softCancel ?? (() => stopAndCleanup()),
      stopAndCleanup,
    });
    this.totalTriggered += 1;
    if (this.voices.length > this.peakConcurrent) {
      this.peakConcurrent = this.voices.length;
    }
    return id;
  }

  private releaseSlot(id: number): void {
    for (let i = this.voices.length - 1; i >= 0; i -= 1) {
      if (this.voices[i]!.id === id) {
        this.voices.splice(i, 1);
        return;
      }
    }
  }

  /**
   * Synthesizes a discrete powertrain or drivetrain event into `bus`.
   */
  public playEvent(
    context: AudioContext,
    bus: AudioNode,
    noiseBuffer: AudioBuffer | null,
    profile: VehicleAcousticProfile,
    event: Readonly<PowertrainAcousticEvent>,
    cockpit: boolean,
  ): boolean {
    const now = context.currentTime;
    if (event.cancelCategory) {
      this.cancelCategory(event.cancelCategory, now);
    }

    const ev = profile.events;
    const tx = profile.transmission;
    const isHybrid = profile.powertrainKind === 'P2_PHEV' || profile.powertrainKind === 'EHS_PHEV';
    const perspectiveGain = cockpit
      ? clamp(0.65 + (profile.cabin.interiorLowpassHz / 12_000) * 0.35, 0.45, 1.0)
      : 1.18;
    const cabinCutoffScale = cockpit ? clamp(profile.cabin.interiorLowpassHz / 6_000, 0.35, 1.0) : 1.0;

    switch (event.type) {
      case 'ICE_STARTER':
      case 'P2_ENGINE_CRANKING':
      case 'EHS_P1_CRANKING': {
        if (ev.starterType === 'NONE' || ev.starterGain <= 0.0005) return false;
        // On EHS hybrids, P1 spins the crank silently inside the oil-cooled housing while
        // EngineAudio's low-passed crank layer + organic engineEnvelope handle wake-up;
        // never stack an extra pure sine sweep on top.
        if (event.type === 'EHS_P1_CRANKING') return false;
        // On P2 hybrids, emit only a gentle low-passed engagement cue.
        if (isHybrid) {
          return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
            wave: 'sine',
            startHz: ev.starterFreqStartHz,
            peakHz: ev.starterFreqEndHz,
            endHz: ev.starterFreqEndHz * 1.02,
            peakRatio: 0.7,
            duration: 0.24,
            gain: ev.starterGain * 0.40 * perspectiveGain,
            attack: 0.06,
            release: 0.14,
            filterType: 'lowpass',
            filterHz: 340 * cabinCutoffScale,
          });
        }
        const duration = clamp(ev.starterDurationSec, 0.25, 0.90);
        const isElectricSpin = ev.starterType === 'ISG_48V' || ev.starterType === 'P1_HIGH_RPM';
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: isElectricSpin ? 'sine' : 'triangle',
          startHz: ev.starterFreqStartHz,
          peakHz: ev.starterFreqEndHz,
          endHz: ev.starterFreqEndHz * 1.04,
          peakRatio: 0.78,
          duration,
          gain: ev.starterGain * perspectiveGain * clamp(event.intensity, 0.5, 1),
          attack: isElectricSpin ? 0.045 : 0.025,
          release: duration * 0.30,
          filterType: 'lowpass',
          filterHz: (isElectricSpin ? 620 : 440) * cabinCutoffScale,
          harmonicRatio: isElectricSpin ? 2.0 : 2.25,
          harmonicGain: isElectricSpin ? 0.12 : 0.24,
        });
      }

      case 'ICE_CRANKING':
        return false;

      case 'ICE_IGNITION':
      case 'EHS_ENGINE_START': {
        if (ev.catchGain <= 0.0005) return false;
        const duration = clamp(ev.catchDurationSec, 0.18, 0.48);
        // Hybrids use a silky, soft-attack warm pressure swell instead of a sharp starter snap.
        const ok = this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: isHybrid ? 'sine' : 'triangle',
          startHz: ev.catchFreqStartHz,
          peakHz: ev.catchFreqPeakHz,
          endHz: ev.catchFreqSettleHz,
          peakRatio: isHybrid ? 0.48 : 0.36,
          duration,
          gain: ev.catchGain * (isHybrid ? 0.62 : 1) * perspectiveGain * clamp(event.intensity, 0.5, 1.1),
          attack: isHybrid ? 0.055 : 0.014,
          release: duration * (isHybrid ? 0.52 : 0.45),
          filterType: 'lowpass',
          filterHz: clamp(ev.flareNoiseHz * (isHybrid ? 0.65 : 0.90), 180, 1_500) * cabinCutoffScale,
          harmonicRatio: 2.0,
          harmonicGain: isHybrid ? 0.10 : 0.24,
        });
        if (!isHybrid && noiseBuffer && ev.flareNoiseGain > 0.001) {
          this.spawnNoiseTransient(context, bus, noiseBuffer, now, event.category, Math.max(1, event.priority - 1) as AcousticEventPriority, {
            duration: duration * 0.85,
            gain: ev.flareNoiseGain * perspectiveGain * event.intensity,
            attack: 0.012,
            release: duration * 0.55,
            filterType: 'bandpass',
            filterStartHz: ev.flareNoiseHz * cabinCutoffScale,
            filterEndHz: ev.flareNoiseHz * 0.55 * cabinCutoffScale,
            Q: 0.9,
          });
        }
        return ok;
      }

      case 'ICE_RPM_RISE': {
        if (ev.flareNoiseGain <= 0.001) return false;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: Math.max(38, ev.catchFreqPeakHz * 0.95),
          peakHz: Math.max(46, ev.catchFreqPeakHz * 1.18),
          endHz: Math.max(32, ev.catchFreqSettleHz),
          peakRatio: 0.35,
          duration: 0.24,
          gain: ev.catchGain * 0.48 * perspectiveGain * event.intensity,
          attack: 0.02,
          release: 0.15,
          filterType: 'lowpass',
          filterHz: 420 * cabinCutoffScale,
        });
      }

      case 'ICE_IDLE_STABILIZED':
      case 'EHS_GENERATOR_RPM_STABILIZED':
        return false;

      case 'ICE_SHUTDOWN':
      case 'P2_ENGINE_SHUTDOWN':
      case 'EHS_ENGINE_SHUTDOWN': {
        if (ev.shutdownGain <= 0.0005) return false;
        // On hybrids, the continuous engineEnvelope coasts smoothly down with real crank RPM;
        // play only a very gentle, soft-attack low-pass settle so stop never sounds like an abrupt swoop.
        const duration = clamp(ev.shutdownDurationSec, 0.28, 0.72);
        const startHz = clamp(
          event.value > 200 && profile.engine
            ? (event.value * profile.engine.cylinderCount) / 120
            : ev.shutdownStartHz,
          24,
          220,
        );
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: isHybrid ? 'sine' : 'triangle',
          startHz: isHybrid ? Math.min(startHz, 72) : startHz,
          peakHz: isHybrid ? Math.min(startHz, 72) * 0.86 : startHz * 0.82,
          endHz: Math.max(14, ev.shutdownEndHz),
          peakRatio: isHybrid ? 0.30 : 0.16,
          duration,
          gain: ev.shutdownGain * (isHybrid ? 0.42 : 1) * perspectiveGain,
          attack: isHybrid ? 0.065 : 0.012,
          release: duration * 0.68,
          filterType: 'lowpass',
          filterHz: (isHybrid ? 210 : 420) * cabinCutoffScale,
        });
      }

      case 'ICE_MECHANICAL_DECAY': {
        if (ev.shutdownShudderGain <= 0.0005) return false;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: Math.max(18, ev.shutdownShudderHz * 1.25),
          peakHz: Math.max(16, ev.shutdownShudderHz),
          endHz: 14,
          peakRatio: 0.3,
          duration: 0.26,
          gain: ev.shutdownShudderGain * perspectiveGain * event.intensity,
          attack: 0.01,
          release: 0.18,
          filterType: 'lowpass',
          filterHz: 140,
        });
      }

      case 'P2_ENGINE_START_REQUEST': {
        if (ev.modeTransitionGain <= 0.0005) return false;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: Math.max(100, ev.syncHumFreqHz * 0.82),
          peakHz: Math.max(120, ev.syncHumFreqHz * 1.05),
          endHz: Math.max(110, ev.syncHumFreqHz),
          peakRatio: 0.65,
          duration: 0.20,
          gain: ev.modeTransitionGain * 0.65 * perspectiveGain,
          attack: 0.025,
          release: 0.09,
          filterType: 'bandpass',
          filterHz: 320,
        });
      }

      case 'P2_SYNCHRONIZATION':
      case 'EHS_GENERATOR_MODE':
      case 'EHS_SERIES_TO_PARALLEL': {
        if (ev.syncHumGain <= 0.0005) return false;
        const isEhs = event.type === 'EHS_GENERATOR_MODE' || event.type === 'EHS_SERIES_TO_PARALLEL';
        const base = isEhs ? clamp(ev.syncHumFreqHz, 65, 130) : Math.max(110, ev.syncHumFreqHz);
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: base * 0.88,
          peakHz: base * (isEhs ? 1.06 : 1.15),
          endHz: base * 0.98,
          peakRatio: 0.55,
          duration: isEhs ? 0.22 : 0.28,
          gain: ev.syncHumGain * (isEhs ? 0.35 : 0.85) * perspectiveGain * clamp(0.5 + event.intensity * 0.5, 0.5, 1),
          attack: isEhs ? 0.065 : 0.03,
          release: 0.14,
          filterType: isEhs ? 'lowpass' : 'bandpass',
          filterHz: isEhs ? 220 * cabinCutoffScale : clamp(base * 1.35, 220, 1_400),
        });
      }

      case 'P2_K0_ENGAGEMENT':
      case 'EHS_DIRECT_DRIVE_ENGAGEMENT': {
        const gain = event.type === 'P2_K0_ENGAGEMENT' ? ev.k0EngageGain : ev.directDriveEngageGain;
        const hz = event.type === 'P2_K0_ENGAGEMENT' ? ev.k0EngageHz : ev.directDriveEngageHz;
        if (gain <= 0.0005 || hz <= 20) return false;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'triangle',
          startHz: hz * 1.15,
          peakHz: hz,
          endHz: hz * 0.58,
          peakRatio: 0.2,
          duration: 0.14,
          gain: gain * perspectiveGain * clamp(0.55 + event.intensity * 0.45, 0.55, 1),
          attack: 0.006,
          release: 0.10,
          filterType: 'lowpass',
          filterHz: 360 * cabinCutoffScale,
        });
      }

      case 'P2_ENGINE_LOAD_TRANSITION': {
        if (ev.modeTransitionGain <= 0.0005) return false;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: 68,
          peakHz: 94,
          endHz: 82,
          peakRatio: 0.45,
          duration: 0.22,
          gain: ev.modeTransitionGain * 0.8 * perspectiveGain * event.intensity,
          attack: 0.02,
          release: 0.13,
          filterType: 'lowpass',
          filterHz: 260,
        });
      }

      case 'EV_DRIVE_READY': {
        if (ev.driveReadyGain <= 0.0005 || ev.driveReadyNotes.length === 0) return false;
        const notes = ev.driveReadyNotes;
        let played = false;
        for (let i = 0; i < Math.min(3, notes.length); i += 1) {
          const noteHz = notes[i]!;
          const ok = this.spawnTonalTransient(context, bus, now + i * 0.095, event.category, event.priority, {
            wave: 'sine',
            startHz: noteHz,
            peakHz: noteHz,
            endHz: noteHz,
            peakRatio: 0.5,
            duration: 0.26,
            gain: ev.driveReadyGain * (cockpit ? 1.0 : 0.45),
            attack: 0.014,
            release: 0.20,
            filterType: 'lowpass',
            filterHz: 3_600,
            harmonicRatio: 2.0,
            harmonicGain: 0.08,
          });
          if (ok) played = true;
        }
        return played;
      }

      case 'EV_INVERTER_ACTIVATION': {
        if (ev.inverterActivateGain <= 0.0005) return false;
        const invHz = Math.min(ev.inverterActivateHz, 1_650);
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: invHz * 0.88,
          peakHz: invHz,
          endHz: invHz * 1.05,
          peakRatio: 0.6,
          duration: 0.18,
          gain: ev.inverterActivateGain * 0.55 * (cockpit ? 0.72 : 1.05),
          attack: 0.02,
          release: 0.12,
          filterType: 'bandpass',
          filterHz: invHz * cabinCutoffScale,
        });
      }

      case 'EV_MOTOR_LOAD_TRANSITION': {
        if (ev.regenTransitionGain <= 0.0005) return false;
        const base = profile.motor ? profile.motor.primary.baseHz * 1.45 : 160;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: base * 0.85,
          peakHz: base * 1.25,
          endHz: base * 1.10,
          peakRatio: 0.5,
          duration: 0.18,
          gain: ev.regenTransitionGain * 0.75 * event.intensity * (cockpit ? 0.75 : 1.05),
          attack: 0.02,
          release: 0.11,
          filterType: 'lowpass',
          filterHz: 950 * cabinCutoffScale,
        });
      }

      case 'EV_REGEN_TRANSITION': {
        if (ev.regenTransitionGain <= 0.0005) return false;
        const base = profile.motor ? profile.motor.primary.baseHz * 1.85 : 220;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: base * 1.12,
          peakHz: base * 0.96,
          endHz: base * 0.74,
          peakRatio: 0.3,
          duration: 0.22,
          gain: ev.regenTransitionGain * event.intensity * (cockpit ? 0.75 : 1.08),
          attack: 0.018,
          release: 0.15,
          filterType: 'lowpass',
          filterHz: 1_200 * cabinCutoffScale,
        });
      }

      case 'EV_DRIVE_SHUTDOWN': {
        if (ev.driveShutdownGain <= 0.0005) return false;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: ev.driveShutdownHz,
          peakHz: ev.driveShutdownHz * 0.85,
          endHz: Math.max(90, ev.driveShutdownHz * 0.45),
          peakRatio: 0.25,
          duration: 0.30,
          gain: ev.driveShutdownGain * (cockpit ? 1.0 : 0.55),
          attack: 0.012,
          release: 0.24,
          filterType: 'lowpass',
          filterHz: 1_600,
        });
      }

      case 'SHIFT_UPSHIFT':
      case 'SHIFT_DOWNSHIFT':
      case 'EV_TWO_SPEED_SHIFT': {
        const isDown = event.type === 'SHIFT_DOWNSHIFT' || (event.type === 'EV_TWO_SPEED_SHIFT' && event.value < 0);
        const style = tx.shiftEventStyle;
        if (style === 'NONE') return false;
        const duration = clamp(tx.shiftDurationSec, 0.045, 0.28);

        if (style === 'DCT_POP' || style === 'LST_SNAP') {
          const popGain = (isDown ? tx.downshiftBlipGain : tx.shiftCutGain) * perspectiveGain * event.intensity;
          const ok = this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
            wave: 'sawtooth',
            startHz: isDown ? tx.shiftClunkHz * 1.45 : tx.shiftClunkHz * 1.05,
            peakHz: isDown ? tx.shiftClunkHz * 1.85 : tx.shiftClunkHz * 0.78,
            endHz: tx.shiftClunkHz * 0.55,
            peakRatio: isDown ? 0.45 : 0.22,
            duration,
            gain: popGain,
            attack: 0.004,
            release: duration * 0.75,
            filterType: 'lowpass',
            filterHz: (style === 'LST_SNAP' ? 1_450 : 920) * cabinCutoffScale,
          });
          if (noiseBuffer && !isDown && popGain > 0.01) {
            this.spawnNoiseTransient(context, bus, noiseBuffer, now, event.category, 2, {
              duration: Math.min(0.09, duration),
              gain: popGain * 0.62,
              attack: 0.003,
              release: Math.min(0.075, duration * 0.8),
              filterType: 'bandpass',
              filterStartHz: 620 * cabinCutoffScale,
              filterEndHz: 260 * cabinCutoffScale,
              Q: 1.1,
            });
          }
          return ok;
        }

        // MANUAL_CLUNK, AT_SMOOTH, DCT_CRISP, EV_TWO_SPEED
        const baseGain = (isDown ? Math.max(tx.shiftClunkGain, tx.downshiftBlipGain) : Math.max(tx.shiftClunkGain, tx.shiftCutGain)) *
          perspectiveGain * clamp(0.45 + event.intensity * 0.55, 0.45, 1);
        if (baseGain <= 0.001) return false;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: style === 'EV_TWO_SPEED' ? 'sine' : 'triangle',
          startHz: isDown ? tx.shiftClunkHz * 1.25 : tx.shiftClunkHz,
          peakHz: isDown ? tx.shiftClunkHz * 1.45 : tx.shiftClunkHz * 0.85,
          endHz: tx.shiftClunkHz * 0.52,
          peakRatio: isDown ? 0.35 : 0.25,
          duration,
          gain: baseGain,
          attack: 0.006,
          release: duration * 0.72,
          filterType: 'lowpass',
          filterHz: (style === 'MANUAL_CLUNK' ? 620 : 440) * cabinCutoffScale,
        });
      }

      case 'TURBO_BLOWOFF': {
        const turbo = profile.engine?.turbo;
        if (!turbo || !noiseBuffer || turbo.blowoffLevel <= 0.001) return false;
        const turboPersp = cockpit ? profile.cabin.interiorTurboScale : 1.15;
        const blowHz = Math.min(turbo.blowoffFreqHz, 2_100);
        return this.spawnNoiseTransient(context, bus, noiseBuffer, now, event.category, event.priority, {
          duration: 0.24,
          gain: turbo.blowoffLevel * event.intensity * turboPersp,
          attack: 0.008,
          release: 0.19,
          filterType: 'bandpass',
          filterStartHz: blowHz * cabinCutoffScale,
          filterEndHz: blowHz * 0.58 * cabinCutoffScale,
          Q: 1.7,
        });
      }

      case 'OVERRUN_BURBLE': {
        const eng = profile.engine;
        if (!eng || !noiseBuffer || eng.overrun.popIntensity <= 0.01) return false;
        const burbleGain = 0.028 * event.intensity * (cockpit ? profile.cabin.interiorExhaustScale : 1.25);
        return this.spawnNoiseTransient(context, bus, noiseBuffer, now, event.category, event.priority, {
          duration: 0.075,
          gain: burbleGain,
          attack: 0.004,
          release: 0.062,
          filterType: 'bandpass',
          filterStartHz: clamp(eng.overrun.rumbleHz * 2.1, 140, 620) * cabinCutoffScale,
          filterEndHz: clamp(eng.overrun.rumbleHz * 1.1, 90, 320) * cabinCutoffScale,
          Q: 1.8,
        });
      }

      case 'DRIVETRAIN_LASH': {
        const mech = profile.mechanical;
        if (mech.drivetrainLashGain <= 0.001) return false;
        return this.spawnTonalTransient(context, bus, now, event.category, event.priority, {
          wave: 'sine',
          startHz: mech.drivetrainLashHz * 1.2,
          peakHz: mech.drivetrainLashHz,
          endHz: mech.drivetrainLashHz * 0.45,
          peakRatio: 0.2,
          duration: 0.11,
          gain: mech.drivetrainLashGain * event.intensity * perspectiveGain,
          attack: 0.004,
          release: 0.085,
          filterType: 'lowpass',
          filterHz: 280,
        });
      }
    }
  }

  private spawnTonalTransient(
    context: AudioContext,
    bus: AudioNode,
    startTime: number,
    category: ActiveVoice['category'],
    priority: AcousticEventPriority,
    spec: {
      wave: OscillatorType;
      startHz: number;
      peakHz: number;
      endHz: number;
      peakRatio: number;
      duration: number;
      gain: number;
      attack: number;
      release: number;
      filterType: BiquadFilterType;
      filterHz: number;
      harmonicRatio?: number;
      harmonicGain?: number;
    },
  ): boolean {
    const peakGain = clamp(spec.gain, 0, 0.22);
    if (peakGain <= 0.0004) return false;

    let cleaned = false;
    let osc: OscillatorNode | null = null;
    let harm: OscillatorNode | null = null;
    let harmGain: GainNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let env: GainNode | null = null;

    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      try { osc?.stop(); } catch { /* already stopped */ }
      try { harm?.stop(); } catch { /* already stopped */ }
      try { osc?.disconnect(); } catch { /* ignore */ }
      try { harm?.disconnect(); } catch { /* ignore */ }
      try { harmGain?.disconnect(); } catch { /* ignore */ }
      try { filter?.disconnect(); } catch { /* ignore */ }
      try { env?.disconnect(); } catch { /* ignore */ }
    };

    const softCancel = (cancelAt: number): void => {
      if (cleaned) return;
      try {
        env?.gain.cancelScheduledValues(cancelAt);
        env?.gain.setTargetAtTime(SILENCE, cancelAt, 0.012);
        osc?.stop(cancelAt + 0.055);
        harm?.stop(cancelAt + 0.055);
      } catch {
        cleanup();
      }
    };

    const slotId = this.tryAcquireSlot(startTime, category, priority, spec.duration + 0.02, cleanup, softCancel);
    if (slotId === null) return false;

    const end = startTime + spec.duration;
    const mid = startTime + spec.duration * clamp(spec.peakRatio, 0.1, 0.9);
    osc = context.createOscillator();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(Math.max(12, spec.startHz), startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(12, spec.peakHz), mid);
    osc.frequency.exponentialRampToValueAtTime(Math.max(12, spec.endHz), end);

    filter = context.createBiquadFilter();
    filter.type = spec.filterType;
    filter.frequency.setValueAtTime(clamp(spec.filterHz, 80, 12_000), startTime);
    if (spec.filterType === 'bandpass') filter.Q.value = 1.4;

    env = context.createGain();
    env.gain.setValueAtTime(SILENCE, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(spec.attack, spec.duration * 0.4));
    env.gain.setValueAtTime(peakGain, Math.max(startTime + spec.attack, end - spec.release));
    env.gain.exponentialRampToValueAtTime(SILENCE, end);

    osc.connect(filter).connect(env).connect(bus);

    if (spec.harmonicRatio && spec.harmonicGain && spec.harmonicGain > 0.01) {
      harm = context.createOscillator();
      harm.type = 'sine';
      harm.frequency.setValueAtTime(Math.max(20, spec.startHz * spec.harmonicRatio), startTime);
      harm.frequency.exponentialRampToValueAtTime(Math.max(20, spec.peakHz * spec.harmonicRatio), mid);
      harm.frequency.exponentialRampToValueAtTime(Math.max(20, spec.endHz * spec.harmonicRatio), end);
      harmGain = context.createGain();
      harmGain.gain.value = spec.harmonicGain;
      harm.connect(harmGain).connect(filter);
      harm.start(startTime);
      harm.stop(end + 0.01);
    }

    osc.start(startTime);
    osc.stop(end + 0.01);
    osc.onended = () => {
      this.releaseSlot(slotId);
      cleanup();
    };
    return true;
  }

  private spawnNoiseTransient(
    context: AudioContext,
    bus: AudioNode,
    buffer: AudioBuffer,
    startTime: number,
    category: ActiveVoice['category'],
    priority: AcousticEventPriority,
    spec: {
      duration: number;
      gain: number;
      attack: number;
      release: number;
      filterType: BiquadFilterType;
      filterStartHz: number;
      filterEndHz: number;
      Q: number;
    },
  ): boolean {
    const peakGain = clamp(spec.gain, 0, 0.20);
    if (peakGain <= 0.0004) return false;

    let cleaned = false;
    let src: AudioBufferSourceNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let env: GainNode | null = null;

    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      try { src?.stop(); } catch { /* already stopped */ }
      try { src?.disconnect(); } catch { /* ignore */ }
      try { filter?.disconnect(); } catch { /* ignore */ }
      try { env?.disconnect(); } catch { /* ignore */ }
    };

    const softCancel = (cancelAt: number): void => {
      if (cleaned) return;
      try {
        env?.gain.cancelScheduledValues(cancelAt);
        env?.gain.setTargetAtTime(SILENCE, cancelAt, 0.012);
        src?.stop(cancelAt + 0.055);
      } catch {
        cleanup();
      }
    };

    const slotId = this.tryAcquireSlot(startTime, category, priority, spec.duration + 0.02, cleanup, softCancel);
    if (slotId === null) return false;

    const end = startTime + spec.duration;
    src = context.createBufferSource();
    src.buffer = buffer;

    filter = context.createBiquadFilter();
    filter.type = spec.filterType;
    filter.Q.value = spec.Q;
    filter.frequency.setValueAtTime(clamp(spec.filterStartHz, 80, 12_000), startTime);
    filter.frequency.exponentialRampToValueAtTime(clamp(spec.filterEndHz, 60, 12_000), end);

    env = context.createGain();
    env.gain.setValueAtTime(SILENCE, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(spec.attack, spec.duration * 0.4));
    env.gain.setValueAtTime(peakGain, Math.max(startTime + spec.attack, end - spec.release));
    env.gain.exponentialRampToValueAtTime(SILENCE, end);

    src.connect(filter).connect(env).connect(bus);
    src.start(startTime);
    src.stop(end + 0.01);
    src.onended = () => {
      this.releaseSlot(slotId);
      cleanup();
    };
    return true;
  }
}
