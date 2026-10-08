import type { EngineConfig } from '../vehicle/config';
import type { VehicleAudioProfile } from './VehicleAudioProfile';

/** Additional telemetry used by the synthesized vehicle and road-noise layers. */
export interface EngineAudioUpdateOptions {
  /** Vehicle speed in metres per second. */
  vehicleSpeed?: number;
  /** Estimated engine load from 0 (overrun) to 1 (full load). */
  engineLoad?: number;
  /** Clutch engagement from 0 (open) to 1 (locked). */
  clutchEngagement?: number;
  /** Surface roughness from 0 (smooth asphalt) to 1 (very coarse). */
  roadRoughness?: number;
  engineCharacter?: EngineConfig;
  profile?: VehicleAudioProfile;
  cockpit?: boolean;
  driveMode?: string;
  ignitionPhase?: 'OFF' | 'CRANKING' | 'CATCH' | 'RUNNING' | 'STOPPING';
  cruiseActive?: boolean;
  lowFuel?: boolean;
  parkingDistance?: number | null;
}

interface EngineMix {
  firingHz: number;
  exhaust: number;
  exhaustBody: number;
  upperExhaust: number;
  intake: number;
  mechanical: number;
  road: number;
  wind: number;
  load: number;
  speed: number;
}

const SILENCE = 0.0001;

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

const smoothStep = (value: number): number => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

/**
 * Produces a conservative mix from the configured four-stroke firing density. Keeping this calculation separate
 * from the Web Audio graph makes future sample-based or electric powertrains easy
 * to add without changing the game's vehicle interface.
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
  const sport = options.driveMode === 'SPORT' ? (profile?.sportPresence ?? 1) : 1;
  const cabin = profile && options.cockpit !== false
    ? profile.cabinIdle + (profile.cabinLoad - profile.cabinIdle) * smoothStep(load) : 1;
  const presence = cabin * sport;
  const character = options.engineCharacter;
  const bodyPresence = character?.soundProfile === 'full-bodied' ? 1.45 : character?.cylinderCount === 6 ? 1.15 : 1;
  const upperPresence = character?.soundProfile === 'full-bodied' ? .55 : character?.cylinderCount === 6 ? .8 : 1;
  return {
    // Four-stroke firing rate: cylinder count / two crank revolutions.
    firingHz: clamp(safeRpm * (options.engineCharacter?.cylinderCount ?? 4) / 120, 18, 850),
    exhaust: profile ? (0.008 + Math.pow(load, 1.3) * 0.065 + rpmNormal * load * 0.008) * presence : 0.030 + load * 0.026 + rpmNormal * 0.009,
    exhaustBody: bodyPresence * (profile ? (0.011 + load * 0.048) * (1 - rpmNormal * .35) * presence : (1 - rpmNormal * 0.72) * (0.018 + load * 0.009)),
    upperExhaust: upperPresence * (profile ? (.001 + rpmNormal * load * .004) * presence : 0.006 + rpmNormal * 0.015 + load * 0.006),
    intake: profile ? (.0006 + Math.pow(load, 2) * .016) * presence : 0.0015 + Math.pow(load, 1.35) * 0.031 + rpmNormal * safeThrottle * 0.006,
    mechanical: profile ? (.0008 + rpmNormal * .003) * presence : 0.0025 + rpmNormal * 0.010 + (1 - load) * rpmNormal * 0.002,
    road: speedNormal * (0.011 + roadRoughness * 0.021) * (profile && options.cockpit !== false ? profile.cabinRoad : 1),
    wind: Math.pow(clamp(speed / 50), 1.7) * 0.020 * (profile && options.cockpit !== false ? profile.cabinWind : 1),
    load,
    speed,
  };
};

/**
 * Asset-free layered vehicle audio. The public start/update/dispose contract is
 * intentionally compatible with the original implementation.
 */
export class EngineAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private engineBus: GainNode | null = null;
  private roadBus: GainNode | null = null;
  private transientBus: GainNode | null = null;

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
  private intakeGain: GainNode | null = null;
  private roadGain: GainNode | null = null;
  private windGain: GainNode | null = null;

  private exhaustFilter: BiquadFilterNode | null = null;
  private intakeFilter: BiquadFilterNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private windHighpass: BiquadFilterNode | null = null;
  private windLowpass: BiquadFilterNode | null = null;

  private intakeNoise: AudioBufferSourceNode | null = null;
  private roadNoise: AudioBufferSourceNode | null = null;
  private windNoise: AudioBufferSourceNode | null = null;

  private resumePromise: Promise<void> | null = null;
  private nextResumeAttempt = 0;
  private visibilityListenerAttached = false;
  private lastRunning = false;
  private lastFiringHz = 28;
  private profile: VehicleAudioProfile | undefined;
  private starter: OscillatorNode | null = null;
  private starterGain: GainNode | null = null;
  private lastPhase = 'OFF';
  private lastMode = '';
  private lastCruise = false;
  private lastLowFuel = false;
  private nextParkingChime = 0;

  public configure(profile?: VehicleAudioProfile): void {
    this.profile = profile;
    this.lastPhase = 'OFF'; this.lastRunning = false; this.lastMode = '';
    this.lastCruise = false; this.lastLowFuel = false;
    if (this.context) {
      this.setPulseWave(this.context);
      this.starterGain?.gain.setTargetAtTime(SILENCE, this.context.currentTime, .04);
    }
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
        // Some browsers only permit resume during a user gesture. The next input
        // event or visibility change will retry without breaking the game loop.
      })
      .finally(() => {
        this.resumePromise = null;
        this.nextResumeAttempt = Date.now() + 750;
      });
    return this.resumePromise;
  }

  update(
    rpm: number,
    throttle: number,
    running = true,
    options: EngineAudioUpdateOptions = {},
  ): void {
    const context = this.context;
    if (!context) return;
    if (context.state === 'suspended' && document.visibilityState === 'visible') void this.resume();

    options = { ...options, profile: this.profile };
    const mix = calculateEngineAudioMix(rpm, throttle, options);
    const now = context.currentTime;
    this.updateRoadNoise(mix, now);

    if (this.profile) {
      const phase = options.ignitionPhase ?? (running ? 'RUNNING' : 'OFF');
      if (phase !== this.lastPhase) {
        if (phase === 'CRANKING') this.playChime('startup');
        if (phase === 'CATCH') this.playEngineCatchTransient();
        if (phase === 'STOPPING') this.playShutdownTransient();
        this.lastPhase = phase;
      }
      this.starterGain?.gain.setTargetAtTime(phase === 'CRANKING' ? this.profile.starterLevel : SILENCE, now, .035);
      this.starter?.frequency.setTargetAtTime(64 + clamp(rpm / 300) * 38, now, .025);
      if (this.lastMode && options.driveMode !== this.lastMode) this.playChime('mode');
      if ((options.cruiseActive ?? false) !== this.lastCruise) this.playChime('cruise');
      if (options.lowFuel && !this.lastLowFuel) this.playChime('fuel');
      const proximity = options.parkingDistance;
      if (proximity != null && proximity < 1.8 && now >= this.nextParkingChime) {
        this.playChime('parking'); this.nextParkingChime = now + .45 + clamp(proximity / 1.8) * 1.25;
      }
      this.lastMode = options.driveMode ?? ''; this.lastCruise = options.cruiseActive ?? false;
      this.lastLowFuel = options.lowFuel ?? false;
    }
    if ((!running && !(this.profile && options.ignitionPhase === 'STOPPING' && rpm > 30)) || rpm < (this.profile ? 30 : 80)) {
      this.engineBus?.gain.setTargetAtTime(SILENCE, now, 0.16);
      if (this.lastRunning && !this.profile) this.playShutdownTransient();
      this.lastRunning = false;
      return;
    }

    if (!this.lastRunning && !this.profile) this.playEngineCatchTransient();
    this.lastRunning = true;
    this.lastFiringHz = mix.firingHz;

    this.engineBus?.gain.setTargetAtTime(options.ignitionPhase === 'STOPPING' && this.profile
      ? .42 * clamp(rpm / 750) : .70, now, this.profile ? .055 : .14);
    this.exhaustPulse?.frequency.setTargetAtTime(mix.firingHz, now, 0.040);
    this.exhaustBody?.frequency.setTargetAtTime(mix.firingHz * 0.502, now, 0.052);
    this.upperExhaust?.frequency.setTargetAtTime(mix.firingHz * 2.012, now, 0.038);
    this.mechanical?.frequency.setTargetAtTime(Math.max(105, mix.firingHz * 5.96), now, 0.055);
    this.roughnessLfo?.frequency.setTargetAtTime(5.3 + clamp(rpm / 6_500) * 2.2, now, 0.18);
    this.roughnessDepth?.gain.setTargetAtTime(this.profile ? .7 : (4.2 - clamp(rpm / 6_500) * 2.4) * 4 / (options.engineCharacter?.cylinderCount ?? 4), now, 0.20);

    this.exhaustGain?.gain.setTargetAtTime(mix.exhaust, now, 0.075);
    this.exhaustBodyGain?.gain.setTargetAtTime(mix.exhaustBody, now, 0.095);
    this.upperExhaustGain?.gain.setTargetAtTime(mix.upperExhaust, now, 0.075);
    this.intakeGain?.gain.setTargetAtTime(mix.intake, now, 0.10);
    this.mechanicalGain?.gain.setTargetAtTime(mix.mechanical, now, 0.10);

    this.exhaustFilter?.frequency.setTargetAtTime(
      this.profile ? this.profile.exhaustCutoff + rpm * .055 + mix.load * 185 : (235 + rpm * 0.145 + mix.load * 390) * (options.engineCharacter?.soundProfile === 'full-bodied' ? .72 : 1),
      now,
      0.075,
    );
    this.intakeFilter?.frequency.setTargetAtTime(
      this.profile ? 310 + rpm * .085 + mix.load * 240 : 430 + rpm * 0.21 + mix.load * 430,
      now,
      0.085,
    );
  }

  /** Play the starter motor when the driver presses the ignition control. */
  onIgnitionStart(): void {
    this.withAudioGraph(() => this.playStarterTransient());
  }

  /** Play the combustion catch/settle event. Automatic state detection is retained. */
  onEngineStart(): void {
    this.withAudioGraph(() => this.playEngineCatchTransient());
    this.lastRunning = true;
  }

  /** Fade the engine and play a short, pitched shutdown tail. */
  onEngineStop(): void {
    this.withAudioGraph(() => this.playShutdownTransient());
    this.lastRunning = false;
  }

  dispose(): void {
    if (this.visibilityListenerAttached) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerAttached = false;
    }

    const sources: Array<AudioScheduledSourceNode | null> = [
      this.exhaustPulse,
      this.exhaustBody,
      this.upperExhaust,
      this.mechanical,
      this.roughnessLfo,
      this.intakeNoise,
      this.roadNoise,
      this.windNoise,
      this.starter,
    ];
    for (const source of sources) {
      try {
        source?.stop();
      } catch {
        // A source can already have ended while disposal races a navigation.
      }
    }

    void this.context?.close();
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.engineBus = null;
    this.roadBus = null;
    this.transientBus = null;
    this.lastRunning = false;
  }

  private createGraph(): void {
    const context = new window.AudioContext();
    this.context = context;
    const now = context.currentTime;

    this.master = context.createGain();
    this.master.gain.setValueAtTime(0.58, now);
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -22;
    this.compressor.knee.value = 16;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.18;
    this.master.connect(this.compressor).connect(context.destination);

    this.engineBus = context.createGain();
    this.engineBus.gain.setValueAtTime(SILENCE, now);
    this.roadBus = context.createGain();
    this.roadBus.gain.setValueAtTime(1, now);
    this.transientBus = context.createGain();
    this.transientBus.gain.setValueAtTime(0.72, now);
    this.engineBus.connect(this.master);
    this.roadBus.connect(this.master);
    this.transientBus.connect(this.master);

    this.createEngineLayers(context, now);
    this.createNoiseLayers(context, now);

    if (!this.visibilityListenerAttached) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerAttached = true;
    }
  }

  private createEngineLayers(context: AudioContext, now: number): void {
    if (!this.engineBus) return;
    this.exhaustPulse = context.createOscillator();
    this.setPulseWave(context);
    this.starter = context.createOscillator(); this.starter.type = 'triangle';
    this.starterGain = this.createSilentGain(context, now);
    const starterFilter = context.createBiquadFilter(); starterFilter.type = 'lowpass'; starterFilter.frequency.value = 360;
    this.starter.connect(starterFilter).connect(this.starterGain).connect(this.transientBus!);
    this.starter.start();
    this.exhaustBody = context.createOscillator();
    this.exhaustBody.type = 'sine';
    this.upperExhaust = context.createOscillator();
    this.upperExhaust.type = 'triangle';
    this.mechanical = context.createOscillator();
    this.mechanical.type = 'sine';

    this.exhaustGain = this.createSilentGain(context, now);
    this.exhaustBodyGain = this.createSilentGain(context, now);
    this.upperExhaustGain = this.createSilentGain(context, now);
    this.mechanicalGain = this.createSilentGain(context, now);
    this.exhaustFilter = context.createBiquadFilter();
    this.exhaustFilter.type = 'lowpass';
    this.exhaustFilter.frequency.value = 620;
    this.exhaustFilter.Q.value = 0.72;

    this.exhaustPulse.connect(this.exhaustGain).connect(this.exhaustFilter);
    this.exhaustBody.connect(this.exhaustBodyGain).connect(this.exhaustFilter);
    this.upperExhaust.connect(this.upperExhaustGain).connect(this.exhaustFilter);
    this.exhaustFilter.connect(this.engineBus);
    this.mechanical.connect(this.mechanicalGain).connect(this.engineBus);

    this.roughnessLfo = context.createOscillator();
    this.roughnessLfo.type = 'sine';
    this.roughnessLfo.frequency.value = 5.7;
    this.roughnessDepth = context.createGain();
    this.roughnessDepth.gain.value = 3.5;
    this.roughnessLfo.connect(this.roughnessDepth);
    this.roughnessDepth.connect(this.exhaustPulse.detune);
    this.roughnessDepth.connect(this.exhaustBody.detune);

    this.exhaustPulse.start();
    this.exhaustBody.start();
    this.upperExhaust.start();
    this.mechanical.start();
    this.roughnessLfo.start();
  }

  private createNoiseLayers(context: AudioContext, now: number): void {
    if (!this.engineBus || !this.roadBus) return;
    const whiteNoise = this.createNoiseBuffer(context, false);
    const softNoise = this.createNoiseBuffer(context, true);

    this.intakeNoise = context.createBufferSource();
    this.intakeNoise.buffer = whiteNoise;
    this.intakeNoise.loop = true;
    this.intakeFilter = context.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 850;
    this.intakeFilter.Q.value = 0.72;
    this.intakeGain = this.createSilentGain(context, now);
    this.intakeNoise.connect(this.intakeFilter).connect(this.intakeGain).connect(this.engineBus);

    this.roadNoise = context.createBufferSource();
    this.roadNoise.buffer = softNoise;
    this.roadNoise.loop = true;
    this.roadFilter = context.createBiquadFilter();
    this.roadFilter.type = 'bandpass';
    this.roadFilter.frequency.value = 340;
    this.roadFilter.Q.value = 0.48;
    this.roadGain = this.createSilentGain(context, now);
    this.roadNoise.connect(this.roadFilter).connect(this.roadGain).connect(this.roadBus);

    this.windNoise = context.createBufferSource();
    this.windNoise.buffer = whiteNoise;
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
  }

  private updateRoadNoise(mix: EngineMix, now: number): void {
    this.roadGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.road), now, 0.20);
    this.windGain?.gain.setTargetAtTime(Math.max(SILENCE, mix.wind), now, 0.28);
    this.roadFilter?.frequency.setTargetAtTime(245 + mix.speed * 12, now, 0.22);
    this.windHighpass?.frequency.setTargetAtTime(620 + mix.speed * 15, now, 0.28);
    this.windLowpass?.frequency.setTargetAtTime(2_600 + mix.speed * 31, now, 0.30);
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
  }

  private playEngineCatchTransient(): void {
    const context = this.context;
    const bus = this.transientBus;
    if (!context || !bus) return;
    const now = context.currentTime;
    const envelope = this.createOneShotEnvelope(context, now, 0.28, this.profile ? .017 : .032, 0.012, 0.11);
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
    const envelope = this.createOneShotEnvelope(context, now, 0.46, this.profile ? .006 : .026, 0.006, 0.25);
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
  }

  private setPulseWave(context: AudioContext): void {
    const harmonics = this.profile?.pulseHarmonics ?? [0, 1, .24, .13, .065, .035];
    this.exhaustPulse?.setPeriodicWave(context.createPeriodicWave(
      new Float32Array(harmonics.length), new Float32Array(harmonics)));
  }

  private playChime(kind: 'startup' | 'mode' | 'cruise' | 'fuel' | 'parking'): void {
    const context = this.context, bus = this.transientBus;
    if (!context || !bus || !this.profile) return;
    const notes = kind === 'startup' ? [392, 523] : kind === 'fuel' ? [440, 349] : [440];
    notes.forEach((frequency, index) => {
      const now = context.currentTime + index * .13;
      const tone = context.createOscillator(); tone.type = 'sine'; tone.frequency.value = frequency;
      const envelope = this.createOneShotEnvelope(context, now, .32, this.profile!.chimeLevel, .025, .24);
      tone.connect(envelope).connect(bus); tone.start(now); tone.stop(now + .32);
    });
  }

  private createOneShotEnvelope(
    context: AudioContext,
    now: number,
    duration: number,
    peak: number,
    attack: number,
    release: number,
  ): GainNode {
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(SILENCE, now);
    envelope.gain.linearRampToValueAtTime(peak, now + attack);
    envelope.gain.setValueAtTime(peak, Math.max(now + attack, now + duration - release));
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
    if (document.visibilityState === 'visible') void this.resume();
  };
}
