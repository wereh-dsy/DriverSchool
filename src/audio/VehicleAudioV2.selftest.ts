import { VEHICLE_CATALOG, VEHICLE_IDS, createVehiclePhysicsConfig, getVehicleDescriptor, type ICEVehicleId } from '../vehicle/VehicleCatalog';
import { VehicleDynamics } from '../vehicle/physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import type { ElectricPowertrain } from '../vehicle/powertrain/ElectricPowertrain';
import type { P2HybridPowertrain } from '../vehicle/powertrain/P2HybridPowertrain';
import type { EhsHybridSystem } from '../vehicle/powertrain/EhsHybridSystem';
import { EngineAudio } from './EngineAudio';
import {
  createVehicleAcousticTelemetry,
  populateAcousticTelemetry,
  type AcousticFrameContext,
} from './AcousticTelemetry';
import { createAcousticMixState, evaluateVehicleAcoustics } from './VehicleAcousticModel';
import { MAX_CONCURRENT_TRANSIENTS } from './AcousticEventPlayer';
import {
  PowertrainEventController,
  type PowertrainAcousticEventType,
} from './PowertrainEventController';

/** Deterministic instrumented AudioContext stub for headless Node verification. */
class MockAudioParam {
  public value: number;
  public scheduleCount = 0;
  public constructor(initial = 0) {
    this.value = initial;
  }
  public setValueAtTime(v: number, _t: number): this {
    this.value = v;
    this.scheduleCount += 1;
    return this;
  }
  public linearRampToValueAtTime(v: number, _t: number): this {
    this.value = v;
    this.scheduleCount += 1;
    return this;
  }
  public exponentialRampToValueAtTime(v: number, _t: number): this {
    this.value = v;
    this.scheduleCount += 1;
    return this;
  }
  public setTargetAtTime(v: number, _t: number, _tau: number): this {
    this.value = v;
    this.scheduleCount += 1;
    return this;
  }
  public cancelScheduledValues(_t: number): this {
    return this;
  }
}

class MockAudioNode {
  public disconnected = false;
  public readonly kind: string;
  public constructor(kind: string, protected readonly ctx: MockAudioContext) {
    this.kind = kind;
    this.ctx.createdNodes += 1;
    this.ctx.liveNodes += 1;
  }
  public connect(dest: unknown): unknown {
    return dest;
  }
  public disconnect(): void {
    if (!this.disconnected) {
      this.disconnected = true;
      this.ctx.liveNodes = Math.max(0, this.ctx.liveNodes - 1);
      this.ctx.disconnectedNodes += 1;
    }
  }
}

class MockGainNode extends MockAudioNode {
  public readonly gain = new MockAudioParam(1);
  public constructor(ctx: MockAudioContext) {
    super('GainNode', ctx);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  public type: BiquadFilterType = 'lowpass';
  public readonly frequency = new MockAudioParam(1000);
  public readonly Q = new MockAudioParam(1);
  public readonly gain = new MockAudioParam(0);
  public constructor(ctx: MockAudioContext) {
    super('BiquadFilterNode', ctx);
  }
}

class MockCompressorNode extends MockAudioNode {
  public readonly threshold = new MockAudioParam(-24);
  public readonly knee = new MockAudioParam(30);
  public readonly ratio = new MockAudioParam(12);
  public readonly attack = new MockAudioParam(0.003);
  public readonly release = new MockAudioParam(0.25);
  public constructor(ctx: MockAudioContext) {
    super('DynamicsCompressorNode', ctx);
  }
}

class MockWaveShaperNode extends MockAudioNode {
  public curve: Float32Array | null = null;
  public oversample: OverSampleType = 'none';
  public constructor(ctx: MockAudioContext) {
    super('WaveShaperNode', ctx);
  }
}

class MockOscillatorNode extends MockAudioNode {
  public type: OscillatorType = 'sine';
  public readonly frequency = new MockAudioParam(440);
  public readonly detune = new MockAudioParam(0);
  public onended: (() => void) | null = null;
  public started = false;
  public stopped = false;
  public stopAt: number | null = null;
  public constructor(ctx: MockAudioContext) {
    super('OscillatorNode', ctx);
    ctx.scheduledSources.push(this);
  }
  public setPeriodicWave(_w: PeriodicWave): void { /* noop */ }
  public start(_when = 0): void {
    this.started = true;
  }
  public stop(when?: number): void {
    if (when !== undefined && when > this.ctx.currentTime) {
      this.stopAt = when;
      return;
    }
    if (!this.stopped) {
      this.stopped = true;
      this.onended?.();
    }
  }
}

class MockBufferSourceNode extends MockAudioNode {
  public buffer: AudioBuffer | null = null;
  public loop = false;
  public readonly playbackRate = new MockAudioParam(1);
  public onended: (() => void) | null = null;
  public started = false;
  public stopped = false;
  public stopAt: number | null = null;
  public constructor(ctx: MockAudioContext) {
    super('AudioBufferSourceNode', ctx);
    ctx.scheduledSources.push(this);
  }
  public start(_when = 0): void {
    this.started = true;
  }
  public stop(when?: number): void {
    if (when !== undefined && when > this.ctx.currentTime) {
      this.stopAt = when;
      return;
    }
    if (!this.stopped) {
      this.stopped = true;
      this.onended?.();
    }
  }
}

class MockAudioContext {
  public state: AudioContextState = 'running';
  public sampleRate = 48_000;
  public currentTime = 0;
  public readonly destination = { kind: 'destination' };
  public createdNodes = 0;
  public liveNodes = 0;
  public disconnectedNodes = 0;
  public periodicWavesCreated = 0;
  public closed = false;
  public readonly scheduledSources: Array<MockOscillatorNode | MockBufferSourceNode> = [];

  public advance(dt: number): void {
    this.currentTime += dt;
    for (let i = this.scheduledSources.length - 1; i >= 0; i -= 1) {
      const src = this.scheduledSources[i]!;
      if (!src.stopped && src.stopAt !== null && src.stopAt <= this.currentTime) {
        src.stopped = true;
        src.onended?.();
        this.scheduledSources.splice(i, 1);
      } else if (src.stopped) {
        this.scheduledSources.splice(i, 1);
      }
    }
  }
  public createGain(): GainNode {
    return new MockGainNode(this) as unknown as GainNode;
  }
  public createBiquadFilter(): BiquadFilterNode {
    return new MockBiquadFilterNode(this) as unknown as BiquadFilterNode;
  }
  public createDynamicsCompressor(): DynamicsCompressorNode {
    return new MockCompressorNode(this) as unknown as DynamicsCompressorNode;
  }
  public createWaveShaper(): WaveShaperNode {
    return new MockWaveShaperNode(this) as unknown as WaveShaperNode;
  }
  public createOscillator(): OscillatorNode {
    return new MockOscillatorNode(this) as unknown as OscillatorNode;
  }
  public createBufferSource(): AudioBufferSourceNode {
    return new MockBufferSourceNode(this) as unknown as AudioBufferSourceNode;
  }
  public createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }
  public createPeriodicWave(_real: Float32Array, _imag: Float32Array): PeriodicWave {
    this.periodicWavesCreated += 1;
    return {} as PeriodicWave;
  }
  public async resume(): Promise<void> {
    this.state = 'running';
  }
  public async close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
  }
}

const DEFAULT_CTX: AcousticFrameContext = {
  roadRoughness: 0.12,
  cockpit: true,
  cabinAcoustics: undefined,
  hasDriverAccess: false,
  doorOpen: 0,
  windowOpen: 0,
  cruiseActive: false,
  parkingDistance: null,
  drivetrainLashIntensity: 0,
};

export interface VehicleAudioV2SelfTestSummary {
  assertions: number;
  vehiclesVerified: number;
  persistentNodes: number;
  continuousSources: number;
  continuousUpdateHz: number;
  peakConcurrentTransients: number;
  paramSchedulesIn3sAt60Hz: number;
  periodicWaveCacheAfter36Switches: number;
}

export async function runVehicleAudioV2SelfTest(): Promise<VehicleAudioV2SelfTestSummary> {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions += 1;
    if (!ok) throw new Error(`VehicleAudioV2 selftest failed: ${message}`);
  };

  // =========================================================================
  // 1. ALL 18 VEHICLES HAVE INDEPENDENT, PHYSICS-ALIGNED PROFILES
  // =========================================================================
  assert(VEHICLE_CATALOG.length === 18, `expected 18 catalog vehicles, got ${VEHICLE_CATALOG.length}`);
  const fingerprints = new Set<string>();

  for (const descriptor of VEHICLE_CATALOG) {
    const ap = descriptor.acousticProfile;
    assert(ap !== undefined, `${descriptor.id}: missing acousticProfile`);
    assert(ap.vehicleId === descriptor.id, `${descriptor.id}: mismatched vehicleId`);
    assert(ap.calibrationNote.length > 10, `${descriptor.id}: missing calibrationNote`);

    const phys = descriptor.physicsConfig as unknown as Record<string, unknown>;
    if ('ehs' in phys && phys.ehs) {
      assert(ap.powertrainKind === 'EHS_PHEV', `${descriptor.id}: expected EHS_PHEV`);
      assert(ap.engine !== undefined && ap.motor?.primary !== undefined && ap.motor?.secondary !== undefined,
        `${descriptor.id}: EHS requires engine + P3 + P1 signatures`);
    } else if ('hybrid' in phys && phys.hybrid) {
      assert(ap.powertrainKind === 'P2_PHEV', `${descriptor.id}: expected P2_PHEV`);
      assert(ap.engine !== undefined && ap.motor?.primary !== undefined,
        `${descriptor.id}: P2 requires engine + P2 motor signatures`);
    } else if ('motor' in phys && phys.motor) {
      assert(ap.powertrainKind === 'EV', `${descriptor.id}: expected EV`);
      assert(ap.engine === undefined && ap.motor !== undefined,
        `${descriptor.id}: pure EV must not carry combustion signature`);
    } else {
      assert(ap.powertrainKind === 'ICE' || ap.powertrainKind === 'MILD_HYBRID',
        `${descriptor.id}: expected ICE or MILD_HYBRID`);
      const engCfg = (phys as { engine: { cylinderCount: number; idleRPM: number; redlineRPM: number; turbo?: { enabled?: boolean } } }).engine;
      assert(ap.engine !== undefined, `${descriptor.id}: ICE requires engine signature`);
      assert(ap.engine!.cylinderCount === engCfg.cylinderCount, `${descriptor.id}: cylinderCount mismatch`);
      assert(ap.engine!.idleRPM === engCfg.idleRPM, `${descriptor.id}: idleRPM mismatch`);
      assert(ap.engine!.redlineRPM === engCfg.redlineRPM, `${descriptor.id}: redlineRPM mismatch`);
      assert(Boolean(ap.engine!.turbo) === Boolean(engCfg.turbo?.enabled),
        `${descriptor.id}: turbo presence must match physics config`);
    }

    // Verify independent interior vs exterior motor mix ratio for every electric/hybrid vehicle
    if (ap.motor) {
      assert(
        ap.cabin.interiorMotorScale < ap.cabin.exteriorMotorScale &&
        ap.cabin.interiorInverterScale < ap.cabin.exteriorInverterScale,
        `${descriptor.id}: motor/inverter interior vs exterior mix ratios must differ`,
      );
    }

    const fp = JSON.stringify({
      kind: ap.powertrainKind,
      eng: ap.engine ? [ap.engine.cylinderCount, ap.engine.exhaustResonanceHz, ap.engine.exhaustBaseCutoffHz, ap.engine.pulseHarmonics, ap.engine.turbo?.spoolBaseHz ?? 0] : null,
      mot: ap.motor ? [ap.motor.primary.baseHz, ap.motor.primary.sweepHz, ap.motor.primary.inverterCarrierHz, ap.motor.secondary?.baseHz ?? 0] : null,
      cab: [ap.cabin.interiorLowpassHz, ap.cabin.interiorShelfDb, ap.cabin.interiorRoadScale],
      ev: [ap.events.starterType, ap.events.starterFreqStartHz, ap.events.catchFreqPeakHz, ap.events.driveReadyNotes],
    });
    assert(!fingerprints.has(fp), `${descriptor.id}: duplicate acoustic signature detected`);
    fingerprints.add(fp);
  }

  // =========================================================================
  // 2. ALL 13 ICE VEHICLES: STARTUP, RPM ZONES, LOAD, OVERRUN, SHIFT & SHUTDOWN
  // =========================================================================
  const iceIds = VEHICLE_IDS.filter((id): id is ICEVehicleId => {
    const k = getVehicleDescriptor(id).acousticProfile.powertrainKind;
    return k === 'ICE' || k === 'MILD_HYBRID';
  });
  assert(iceIds.length === 13, `expected 13 ICE/MHEV vehicles, got ${iceIds.length}`);

  const telemetry = createVehicleAcousticTelemetry();
  const mixA = createAcousticMixState();
  const mixB = createAcousticMixState();
  const mixC = createAcousticMixState();

  for (const id of iceIds) {
    const desc = getVehicleDescriptor(id);
    const ap = desc.acousticProfile;
    const eng = ap.engine!;

    // Real VehicleDynamics cold start & stop verification
    const car = new VehicleDynamics(createVehiclePhysicsConfig(id), { engineRunning: false });
    const events: PowertrainAcousticEventType[] = [];
    const ctrl = new PowertrainEventController();
    const input = createNeutralVehicleInputState();

    populateAcousticTelemetry(telemetry, car.getSnapshot(), car.engine, DEFAULT_CTX);
    ctrl.update(1 / 60, ap, telemetry); // initial sync at OFF

    assert(car.requestEngineStart(), `${id}: cold start rejected`);
    const isSequenced = (car.engine.config.ignitionSequence ?? car.engine.config.startupCharacter) !== undefined;
    if (!isSequenced) {
      const n1 = ctrl.notifyLegacyIgnitionStart(ap);
      for (let i = 0; i < n1; i += 1) events.push(ctrl.getEvent(i).type);
      const n2 = ctrl.notifyLegacyEngineCatch(ap);
      for (let i = 0; i < n2; i += 1) events.push(ctrl.getEvent(i).type);
    }

    for (let step = 0; step < 300; step += 1) {
      car.stepFixed(1 / 120, input);
      if (step % 2 === 0) {
        populateAcousticTelemetry(telemetry, car.getSnapshot(), car.engine, DEFAULT_CTX);
        const count = ctrl.update(1 / 60, ap, telemetry);
        for (let i = 0; i < count; i += 1) events.push(ctrl.getEvent(i).type);
      }
    }

    assert(events.includes('ICE_STARTER') && events.includes('ICE_IGNITION'),
      `${id}: startup must emit starter and ignition events (got ${events.join(',')})`);
    if (isSequenced) {
      assert(events.includes('ICE_CRANKING') && events.includes('ICE_RPM_RISE') && events.includes('ICE_IDLE_STABILIZED'),
        `${id}: sequenced startup missing stage (got ${events.join(',')})`);
    }
    // No lingering cranking once running!
    evaluateVehicleAcoustics(mixA, ap, telemetry, 0.04, true);
    assert(mixA.engineActive && !mixA.crankActive && mixA.crankGain === 0,
      `${id}: cranking must be completely silent once running`);

    // Shutdown sequence
    assert(car.requestEngineStop(), `${id}: stop rejected`);
    if (!isSequenced) {
      const nStop = ctrl.notifyLegacyEngineStop(ap, eng.idleRPM);
      for (let i = 0; i < nStop; i += 1) events.push(ctrl.getEvent(i).type);
    }
    for (let step = 0; step < 260; step += 1) {
      car.stepFixed(1 / 120, input);
      if (step % 2 === 0) {
        populateAcousticTelemetry(telemetry, car.getSnapshot(), car.engine, DEFAULT_CTX);
        const count = ctrl.update(1 / 60, ap, telemetry);
        for (let i = 0; i < count; i += 1) events.push(ctrl.getEvent(i).type);
      }
    }
    assert(events.includes('ICE_SHUTDOWN') && events.includes('ICE_MECHANICAL_DECAY'),
      `${id}: shutdown must emit shutdown + mechanical decay (got ${events.join(',')})`);
    evaluateVehicleAcoustics(mixA, ap, telemetry, 0.04, true);
    assert(!mixA.engineActive && mixA.exhaustPrimaryGain === 0 && mixA.crankGain === 0,
      `${id}: stopped engine must be silent`);

    // Low / Mid / High RPM & Light vs Heavy load checks
    const evalPoint = (out: typeof mixA, rpm: number, load: number, throttle: number, cockpit = true, boost = 0) => {
      telemetry.hasCombustion = true;
      telemetry.engineRunning = true;
      telemetry.ignitionPhase = 'RUNNING';
      telemetry.rpm = rpm;
      telemetry.engineLoad = load;
      telemetry.throttle = throttle;
      telemetry.clutchEngagement = 1;
      telemetry.cockpit = cockpit;
      telemetry.boostPressureBar = boost;
      telemetry.vehicleSpeed = 18;
      telemetry.gearNumber = 3;
      telemetry.p2Active = false;
      telemetry.ehsActive = false;
      telemetry.evActive = false;
      evaluateVehicleAcoustics(out, ap, telemetry, 0.04, true);
    };

    evalPoint(mixA, eng.idleRPM + 600, 0.25, 0.25); // low RPM light load
    evalPoint(mixB, (eng.idleRPM + eng.redlineRPM) * 0.55, 0.85, 0.85, true, eng.turbo ? eng.turbo.maxBoostBar * 0.8 : 0); // mid heavy
    evalPoint(mixC, eng.redlineRPM * 0.92, 0.90, 0.90, true, eng.turbo ? eng.turbo.maxBoostBar : 0); // high heavy

    assert(mixC.firingHz > mixB.firingHz && mixB.firingHz > mixA.firingHz, `${id}: firingHz must rise with RPM`);
    assert(mixB.exhaustPrimaryGain > mixA.exhaustPrimaryGain * 1.6, `${id}: heavy load must exceed light load`);
    assert(mixC.exhaustCutoffHz > mixA.exhaustCutoffHz, `${id}: spectral cutoff must open with RPM/load`);
    if (eng.turbo) {
      assert(mixB.turboSpoolGain > 0 && mixC.turboSpoolGain > 0, `${id}: turbo vehicle must produce boost spool`);
    } else {
      assert(mixB.turboSpoolGain === 0 && mixC.turboSpoolGain === 0, `${id}: NA vehicle must have zero turbo spool`);
    }

    // Overrun deceleration check
    evalPoint(mixA, eng.redlineRPM * 0.65, 0.04, 0, true, 0);
    assert(mixA.overrunFactor > 0.7 && mixA.exhaustBodyGain > 0, `${id}: overrun deceleration must stay alive`);

    // Exterior vs Interior check
    evalPoint(mixA, 3_200, 0.60, 0.60, true, eng.turbo ? 0.6 : 0);
    evalPoint(mixB, 3_200, 0.60, 0.60, false, eng.turbo ? 0.6 : 0);
    assert(mixB.exhaustPrimaryGain > mixA.exhaustPrimaryGain && mixB.cabinEngineLowpassHz > mixA.cabinEngineLowpassHz,
      `${id}: exterior must be brighter and louder than closed interior`);
  }

  // Cross-vehicle ICE differentiation benchmarks
  const evalCar = (id: (typeof VEHICLE_IDS)[number], rpm: number, load: number, cockpit: boolean, boost = 0) => {
    const out = createAcousticMixState();
    const ap = getVehicleDescriptor(id).acousticProfile;
    const t = createVehicleAcousticTelemetry();
    t.hasCombustion = true; t.engineRunning = true; t.ignitionPhase = 'RUNNING';
    t.rpm = rpm; t.engineLoad = load; t.throttle = load; t.clutchEngagement = 1; t.driving = true;
    t.cockpit = cockpit; t.vehicleSpeed = 24; t.gearNumber = 3; t.boostPressureBar = boost;
    return evaluateVehicleAcoustics(out, ap, t, 0.04, true);
  };
  const maybachIn = evalCar('mercedes-maybach-s680-z223', 2500, 0.45, true, 0.4);
  const a6lIn = evalCar('executive-lwb-2t', 2500, 0.45, true, 0.4);
  const bmwIn = evalCar('bmw-530li-g38', 2500, 0.45, true, 0.4);
  const e300In = evalCar('mercedes-e300l-v214', 2500, 0.45, true, 0.4);
  const f458High = evalCar('ferrari-458-italia', 8400, 0.90, false, 0);
  const jeskoHigh = evalCar('koenigsegg-jesko-attack', 8000, 0.90, false, 1.5);
  const touaregLow = evalCar('road-suv-v6-8at', 2200, 0.75, false, 0.7);
  const familyLow = evalCar('family-sedan', 2200, 0.75, false, 0);

  assert(maybachIn.firingHz === 250 && a6lIn.firingHz === Math.round(2500 * 4 / 120) || Math.abs(a6lIn.firingHz - 83.33) < 0.2,
    'V12 firing density is 3x I4 at identical RPM');
  assert(maybachIn.exhaustPrimaryGain < e300In.exhaustPrimaryGain && e300In.exhaustPrimaryGain < a6lIn.exhaustPrimaryGain && a6lIn.exhaustPrimaryGain < bmwIn.exhaustPrimaryGain,
    'luxury isolation ordering: Maybach < E300L < A6L < 530Li');
  assert(f458High.exhaustUpperGain > familyLow.exhaustUpperGain * 2 && f458High.turboSpoolGain === 0,
    'Ferrari 458 delivers high-rev NA V8 upper harmonic scream without turbo');
  assert(jeskoHigh.turboSpoolGain > 0.002 && jeskoHigh.turboSpoolGain <= 0.0046 && jeskoHigh.txWhineGain > 0.002 && jeskoHigh.txWhineGain <= 0.0056,
    `Jesko Attack delivers subtle non-shrill twin-turbo spool and 9LST gear whine (spool=${jeskoHigh.turboSpoolGain.toFixed(4)}, tx=${jeskoHigh.txWhineGain.toFixed(4)})`);
  assert(familyLow.txWhineGain < 0.0005 && a6lIn.txWhineGain < 0.0005,
    'ordinary passenger gearboxes must not emit intrusive continuous whine');
  // Anti-shrillness spectral guard across all ICE / Hybrid / EV vehicles
  for (const id of VEHICLE_IDS) {
    const desc = getVehicleDescriptor(id);
    const ap = desc.acousticProfile;
    const tGuard = createVehicleAcousticTelemetry();
    const outGuard = createAcousticMixState();
    tGuard.cockpit = false;
    tGuard.vehicleOperational = true;
    tGuard.driving = true;
    tGuard.vehicleSpeed = 36;
    if (ap.engine) {
      tGuard.hasCombustion = true;
      tGuard.engineRunning = true;
      tGuard.ignitionPhase = 'RUNNING';
      tGuard.rpm = ap.engine.redlineRPM * 0.92;
      tGuard.engineLoad = 0.95;
      tGuard.throttle = 0.95;
      tGuard.clutchEngagement = 1;
      tGuard.boostPressureBar = ap.engine.turbo ? ap.engine.turbo.maxBoostBar : 0;
    }
    if (ap.motor) {
      tGuard.evActive = ap.powertrainKind === 'EV';
      tGuard.p2Active = ap.powertrainKind === 'P2_PHEV';
      tGuard.ehsActive = ap.powertrainKind === 'EHS_PHEV';
      tGuard.rearMotorRPM = 11_000;
      tGuard.rearMotorTorque = 280;
      tGuard.frontConnected = Boolean(ap.motor.secondary);
      tGuard.frontMotorRPM = 11_000;
      tGuard.frontMotorTorque = 180;
      tGuard.p2MotorRPM = 5_500;
      tGuard.p2MotorTorque = 260;
      tGuard.ehsP3RPM = 10_000;
      tGuard.ehsP3Torque = 160;
      tGuard.ehsP1RPM = 4_000;
      tGuard.ehsP1GenerationPowerW = 24_000;
    }
    evaluateVehicleAcoustics(outGuard, ap, tGuard, 0.04, true);
    assert(outGuard.mechanicalHz <= 600 && outGuard.mechanicalGain <= 0.006,
      `${id}: mechanical layer must stay warm & non-shrill (hz=${outGuard.mechanicalHz.toFixed(0)}, gain=${outGuard.mechanicalGain.toFixed(4)})`);
    assert(outGuard.turboSpoolGain <= 0.005 && outGuard.turboSpoolHz <= 2_700,
      `${id}: turbo spool must stay subtle & non-piercing (hz=${outGuard.turboSpoolHz.toFixed(0)}, gain=${outGuard.turboSpoolGain.toFixed(4)})`);
    assert(outGuard.txWhineGain <= 0.006 && outGuard.txWhineHz <= 1_150,
      `${id}: txWhine must stay bounded & non-shrill (hz=${outGuard.txWhineHz.toFixed(0)}, gain=${outGuard.txWhineGain.toFixed(4)})`);
    assert(outGuard.motorInverterGain <= 0.0035 && outGuard.motorInverterHz <= 2_500,
      `${id}: motor inverter must stay non-piercing (hz=${outGuard.motorInverterHz.toFixed(0)}, gain=${outGuard.motorInverterGain.toFixed(4)})`);
    assert(outGuard.exhaustCharacterGainDb <= 5.5 && outGuard.exhaustCharacterQ <= 1.4,
      `${id}: exhaust character formant must avoid narrow high-Q ringing (Q=${outGuard.exhaustCharacterQ}, dB=${outGuard.exhaustCharacterGainDb.toFixed(1)})`);
  }
  assert(touaregLow.exhaustBodyGain > familyLow.exhaustBodyGain && touaregLow.exhaustResonanceHz < familyLow.exhaustResonanceHz,
    'Touareg V6 SUV delivers deeper, heavier low-end baritone than 1.6 family sedan');
  assert(getVehicleDescriptor('mercedes-e300l-v214').acousticProfile.events.starterType === 'ISG_48V',
    'E 300 L uses 48V ISG quiet start');

  // Turbo blowoff & Sport overrun burble & DCT shift event verification
  {
    const gti = getVehicleDescriptor('volkswagen-golf-gti').acousticProfile;
    const ctrl = new PowertrainEventController();
    const t = createVehicleAcousticTelemetry();
    t.hasCombustion = true; t.engineRunning = true; t.ignitionPhase = 'RUNNING';
    t.rpm = 5_200; t.throttle = 0.9; t.engineLoad = 0.9; t.boostPressureBar = 0.95; t.driveMode = 'SPORT'; t.gearNumber = 2;
    ctrl.update(0.016, gti, t);
    // Upshift 2 -> 3
    t.shiftInProgress = true; t.targetGearNumber = 3;
    let n = ctrl.update(0.016, gti, t);
    let sawUpshift = false;
    for (let i = 0; i < n; i += 1) if (ctrl.getEvent(i).type === 'SHIFT_UPSHIFT') sawUpshift = true;
    assert(sawUpshift, 'Golf GTI shiftInProgress must emit SHIFT_UPSHIFT');

    // Sudden throttle lift under boost -> TURBO_BLOWOFF + OVERRUN_BURBLE
    t.shiftInProgress = false; t.gearNumber = 3; t.throttle = 0.02; t.engineLoad = 0.05; t.boostPressureBar = 0.25;
    const postLift: PowertrainAcousticEventType[] = [];
    for (let k = 0; k < 25; k += 1) {
      n = ctrl.update(0.02, gti, t);
      for (let i = 0; i < n; i += 1) postLift.push(ctrl.getEvent(i).type);
    }
    assert(postLift.includes('TURBO_BLOWOFF'), 'Golf GTI lift-off under boost must emit TURBO_BLOWOFF');
    assert(postLift.includes('OVERRUN_BURBLE'), 'Golf GTI Sport high-RPM lift-off must emit OVERRUN_BURBLE');
  }

  // =========================================================================
  // 3. P2 PHEV (TANK 500 Hi4-T): PURE EV -> ENGINE START -> SYNC -> K0 -> COMBINED -> STOP + 4L
  // =========================================================================
  {
    const desc = getVehicleDescriptor('tank-500-hi4-t');
    const ap = desc.acousticProfile;
    const car = new VehicleDynamics<P2HybridPowertrain>(createVehiclePhysicsConfig('tank-500-hi4-t'), { driveSelector: 'D' });
    const ctrl = new PowertrainEventController();
    const events: PowertrainAcousticEventType[] = [];
    const t = createVehicleAcousticTelemetry();

    populateAcousticTelemetry(t, car.getSnapshot(), car.engine, DEFAULT_CTX);
    ctrl.update(1 / 60, ap, t);

    // Step 1: Light pedal in EV mode -> motor active, engine silent
    const light = { ...createNeutralVehicleInputState(), throttle: 0.22 };
    for (let i = 0; i < 180; i += 1) {
      car.stepFixed(1 / 120, light);
      if (i % 2 === 0) {
        populateAcousticTelemetry(t, car.getSnapshot(), car.engine, DEFAULT_CTX);
        const n = ctrl.update(1 / 60, ap, t);
        for (let j = 0; j < n; j += 1) events.push(ctrl.getEvent(j).type);
      }
    }
    evaluateVehicleAcoustics(mixA, ap, t, 0.04, true);
    assert(!mixA.engineActive && mixA.motor1Active && mixA.motor1EmGain > 0,
      'Tank 500 EV crawl: ICE must be silent while P2 motor drives');

    // Step 2: Heavy throttle -> P2 engine request -> crank -> ignition -> sync -> K0 engage -> combined drive
    const heavy = { ...createNeutralVehicleInputState(), throttle: 0.95 };
    for (let i = 0; i < 600; i += 1) {
      car.stepFixed(1 / 120, heavy);
      if (i % 2 === 0) {
        populateAcousticTelemetry(t, car.getSnapshot(), car.engine, DEFAULT_CTX);
        const n = ctrl.update(1 / 60, ap, t);
        for (let j = 0; j < n; j += 1) events.push(ctrl.getEvent(j).type);
      }
    }
    assert(events.includes('P2_ENGINE_START_REQUEST'), `Tank 500 missing P2_ENGINE_START_REQUEST (${events.join(',')})`);
    assert(events.includes('P2_ENGINE_CRANKING'), `Tank 500 missing P2_ENGINE_CRANKING (${events.join(',')})`);
    assert(events.includes('ICE_IGNITION'), `Tank 500 missing ICE_IGNITION (${events.join(',')})`);
    assert(events.includes('P2_K0_ENGAGEMENT'), `Tank 500 missing P2_K0_ENGAGEMENT (${events.join(',')})`);
    assert(events.includes('P2_ENGINE_LOAD_TRANSITION'), `Tank 500 missing P2_ENGINE_LOAD_TRANSITION (${events.join(',')})`);
    evaluateVehicleAcoustics(mixB, ap, t, 0.04, true);
    assert(mixB.engineActive && mixB.motor1Active, 'Tank 500 combined drive must render both ICE and P2 motor');

    // Step 3: 4L transfer whine increases txWhineGain
    t.p2TransferMode = 'AWD';
    t.vehicleSpeed = 6;
    evaluateVehicleAcoustics(mixA, ap, t, 0.04, true);
    t.p2TransferMode = '4L';
    evaluateVehicleAcoustics(mixB, ap, t, 0.04, true);
    assert(mixB.txWhineGain > mixA.txWhineGain * 2, 'Tank 500 4L transfer case must add distinct low-range gear whine');

    // Step 4: Shutdown event & smooth envelope continuity check (no abrupt jump on hybrid start/stop!)
    car.requestEngineStop();
    populateAcousticTelemetry(t, car.getSnapshot(), car.engine, DEFAULT_CTX);
    const nStop = ctrl.update(1 / 60, ap, t);
    for (let j = 0; j < nStop; j += 1) events.push(ctrl.getEvent(j).type);
    assert(events.includes('P2_ENGINE_SHUTDOWN') || events.includes('EV_DRIVE_SHUTDOWN'),
      'Tank 500 stop must emit shutdown event');

    // Verify Tank 500 organic start/stop envelope ramp (no instant 0->1 jump or instant 35% drop!)
    const envMix = createAcousticMixState();
    const envT = createVehicleAcousticTelemetry();
    envT.p2Active = true; envT.hasCombustion = true; envT.vehicleOperational = true;
    envT.p2EnginePhase = 'OFF'; envT.ignitionPhase = 'OFF'; envT.engineRunning = false; envT.rpm = 0;
    evaluateVehicleAcoustics(envMix, ap, envT, 0.04, true);
    assert(envMix.engineEnvelope === 0, 'Tank 500 starts at zero envelope');
    envT.p2EnginePhase = 'CRANKING'; envT.ignitionPhase = 'CRANKING'; envT.rpm = 240;
    evaluateVehicleAcoustics(envMix, ap, envT, 0.04, false);
    const crankEnv = envMix.engineEnvelope;
    envT.p2EnginePhase = 'CATCH'; envT.ignitionPhase = 'CATCH'; envT.engineRunning = true; envT.rpm = 950;
    evaluateVehicleAcoustics(envMix, ap, envT, 0.04, false);
    const firstCatchStep = envMix.engineEnvelope - crankEnv;
    assert(firstCatchStep > 0 && firstCatchStep < 0.16,
      `Tank 500 catch envelope must bloom gradually without sudden jump (delta=${firstCatchStep.toFixed(3)})`);
    for (let k = 0; k < 40; k += 1) evaluateVehicleAcoustics(envMix, ap, envT, 0.04, false);
    const runningEnv = envMix.engineEnvelope;
    envT.p2EnginePhase = 'STOPPING'; envT.ignitionPhase = 'STOPPING'; envT.engineRunning = false; envT.rpm = 720;
    evaluateVehicleAcoustics(envMix, ap, envT, 0.04, false);
    const firstStopDrop = runningEnv - envMix.engineEnvelope;
    assert(firstStopDrop >= 0 && firstStopDrop < 0.12,
      `Tank 500 stop envelope must decay smoothly without abrupt drop (drop=${firstStopDrop.toFixed(3)})`);
  }

  // =========================================================================
  // 4. EHS SERIES-PARALLEL PHEV (QIN PLUS DM-i): EV, SERIES GEN, PARALLEL, DIRECT, P1 != P3
  // =========================================================================
  {
    const desc = getVehicleDescriptor('byd-qin-plus-dmi-210-2026');
    const ap = desc.acousticProfile;
    const car = new VehicleDynamics<EhsHybridSystem>(createVehiclePhysicsConfig('byd-qin-plus-dmi-210-2026'), {
      driveSelector: 'D',
    });
    car.powertrain.reset({ driveSelector: 'D', ev: { stateOfCharge: 0.78 }, ehs: { mode: 'EV' } });
    const ctrl = new PowertrainEventController();
    const events: PowertrainAcousticEventType[] = [];
    const t = createVehicleAcousticTelemetry();

    // 4a. Real EV drive: ICE & P1 silent, P3 active
    populateAcousticTelemetry(t, car.getSnapshot(), car.engine, DEFAULT_CTX);
    ctrl.update(1 / 60, ap, t);
    const evCmd = { ...createNeutralVehicleInputState(), throttle: 0.30 };
    for (let i = 0; i < 200; i += 1) {
      car.stepFixed(1 / 120, evCmd);
    }
    populateAcousticTelemetry(t, car.getSnapshot(), car.engine, DEFAULT_CTX);
    evaluateVehicleAcoustics(mixA, ap, t, 0.04, true);
    assert(t.ehsState === 'EV' && !mixA.engineActive && !mixA.motor2Active && mixA.motor1Active,
      'Qin PLUS EV mode: only P3 motor active; ICE and P1 generator must be silent');

    // 4b. Real HEV Series generation at low SOC: P1 cranks, ICE runs at generation RPM, P1 & P3 independent!
    const seriesCar = new VehicleDynamics<EhsHybridSystem>(createVehiclePhysicsConfig('byd-qin-plus-dmi-210-2026'), {
      driveSelector: 'D',
    });
    seriesCar.powertrain.reset({ driveSelector: 'D', ev: { stateOfCharge: 0.18 }, ehs: { mode: 'HEV' } });
    ctrl.reset();
    populateAcousticTelemetry(t, seriesCar.getSnapshot(), seriesCar.engine, DEFAULT_CTX);
    ctrl.update(1 / 60, ap, t);
    const cityCmd = { ...createNeutralVehicleInputState(), throttle: 0.25 };
    for (let i = 0; i < 420; i += 1) {
      seriesCar.stepFixed(1 / 120, cityCmd);
      if (i % 2 === 0) {
        populateAcousticTelemetry(t, seriesCar.getSnapshot(), seriesCar.engine, DEFAULT_CTX);
        const n = ctrl.update(1 / 60, ap, t);
        for (let j = 0; j < n; j += 1) events.push(ctrl.getEvent(j).type);
      }
    }
    assert(events.includes('EHS_P1_CRANKING'), `Qin PLUS missing EHS_P1_CRANKING (${events.join(',')})`);
    assert(events.includes('EHS_ENGINE_START'), `Qin PLUS missing EHS_ENGINE_START (${events.join(',')})`);
    assert(events.includes('EHS_GENERATOR_MODE'), `Qin PLUS missing EHS_GENERATOR_MODE (${events.join(',')})`);

    // Explicit SERIES vs PARALLEL vs DIRECT decoupled-RPM & P1/P3 separation checks
    const ehsT = createVehicleAcousticTelemetry();
    ehsT.ehsActive = true; ehsT.hasCombustion = true; ehsT.vehicleOperational = true; ehsT.driving = true;
    ehsT.engineRunning = true; ehsT.ehsEnginePhase = 'RUNNING'; ehsT.ignitionPhase = 'RUNNING';
    ehsT.ehsState = 'SERIES'; ehsT.ehsPath = 'SERIES'; ehsT.ehsEngineRequested = true;
    ehsT.rpm = 3_200; ehsT.ehsTargetRPM = 3_200; ehsT.ehsP1RPM = 3_200; ehsT.ehsP1GenerationPowerW = 24_000;
    ehsT.vehicleSpeed = 5.0; ehsT.ehsP3RPM = 1_500; ehsT.ehsP3Torque = 110;
    evaluateVehicleAcoustics(mixA, ap, ehsT, 0.04, true);
    // Double road speed (P3 RPM doubles) while keeping ICE/P1 generation RPM fixed at 3200!
    ehsT.vehicleSpeed = 12.0; ehsT.ehsP3RPM = 3_600;
    evaluateVehicleAcoustics(mixB, ap, ehsT, 0.04, true);
    assert(mixA.engineActive && mixA.motor1Active && mixA.motor2Active,
      'Qin PLUS SERIES must drive ICE + P3 traction + P1 generator simultaneously');
    assert(Math.abs(mixA.firingHz - mixB.firingHz) < 0.01 && Math.abs(mixA.motor2EmHz - mixB.motor2EmHz) < 0.01,
      'Qin PLUS SERIES: ICE firingHz & P1 generator pitch follow crank RPM, NOT road speed');
    assert(mixB.motor1EmHz > mixA.motor1EmHz * 1.4,
      'Qin PLUS SERIES: P3 traction motor pitch tracks road speed independently of P1/ICE');
    assert(Math.abs(mixA.motor1EmHz - mixA.motor2EmHz) > 80,
      'Qin PLUS SERIES: P1 generator and P3 traction motor have independent acoustic frequencies');

    // Series -> Parallel -> Direct Drive -> Shutdown event chain
    const ehsEvents: PowertrainAcousticEventType[] = [];
    ctrl.reset();
    ehsT.ehsState = 'SERIES'; ehsT.ehsPath = 'SERIES'; ehsT.rpm = 3_150; ehsT.ehsTargetRPM = 3_200;
    ctrl.update(0.02, ap, ehsT);
    ehsT.ehsPath = 'PARALLEL'; ehsT.ehsState = 'PARALLEL'; ehsT.ehsDirectClutchEngagement = 0.35; ehsT.ehsDirectClutchSlipRPM = 220;
    let cnt = ctrl.update(0.02, ap, ehsT);
    for (let i = 0; i < cnt; i += 1) ehsEvents.push(ctrl.getEvent(i).type);
    ehsT.ehsState = 'DIRECT'; ehsT.ehsDirectClutchEngagement = 0.96; ehsT.ehsDirectClutchTorqueNm = 95; ehsT.ehsP3Torque = 5; ehsT.ehsP1GenerationPowerW = 0;
    cnt = ctrl.update(0.02, ap, ehsT);
    for (let i = 0; i < cnt; i += 1) ehsEvents.push(ctrl.getEvent(i).type);
    evaluateVehicleAcoustics(mixC, ap, ehsT, 0.04, true);
    assert(ehsEvents.includes('EHS_SERIES_TO_PARALLEL') && ehsEvents.includes('EHS_DIRECT_DRIVE_ENGAGEMENT'),
      `Qin PLUS missing parallel/direct transitions (${ehsEvents.join(',')})`);
    assert(mixC.engineActive && mixC.motor1EmGain < mixB.motor1EmGain * 0.5,
      'Qin PLUS DIRECT drive: ICE carries load while P3 fades down');

    ehsT.ehsEnginePhase = 'STOPPING'; ehsT.engineRunning = false; ehsT.ehsEngineRequested = false;
    cnt = ctrl.update(0.02, ap, ehsT);
    for (let i = 0; i < cnt; i += 1) ehsEvents.push(ctrl.getEvent(i).type);
    assert(ehsEvents.includes('EHS_ENGINE_SHUTDOWN'), 'Qin PLUS must emit EHS_ENGINE_SHUTDOWN');

    // Verify Qin PLUS smooth EHS start/stop envelope ramp (no abrupt jump or drop!)
    const qinEnv = createAcousticMixState();
    const qinT = createVehicleAcousticTelemetry();
    qinT.ehsActive = true; qinT.hasCombustion = true; qinT.vehicleOperational = true;
    qinT.ehsEnginePhase = 'OFF'; qinT.ignitionPhase = 'OFF'; qinT.engineRunning = false; qinT.rpm = 0;
    evaluateVehicleAcoustics(qinEnv, ap, qinT, 0.04, true);
    qinT.ehsEnginePhase = 'CRANKING'; qinT.ignitionPhase = 'CRANKING'; qinT.rpm = 820;
    evaluateVehicleAcoustics(qinEnv, ap, qinT, 0.04, false);
    const qinCrank = qinEnv.engineEnvelope;
    qinT.ehsEnginePhase = 'CATCH'; qinT.ignitionPhase = 'CATCH'; qinT.engineRunning = true; qinT.rpm = 1200;
    evaluateVehicleAcoustics(qinEnv, ap, qinT, 0.04, false);
    const qinCatchJump = qinEnv.engineEnvelope - qinCrank;
    assert(qinCatchJump > 0 && qinCatchJump < 0.14,
      `Qin PLUS catch envelope must bloom smoothly (delta=${qinCatchJump.toFixed(3)})`);
    for (let k = 0; k < 50; k += 1) evaluateVehicleAcoustics(qinEnv, ap, qinT, 0.04, false);
    const qinRun = qinEnv.engineEnvelope;
    qinT.ehsEnginePhase = 'STOPPING'; qinT.ignitionPhase = 'STOPPING'; qinT.engineRunning = false; qinT.rpm = 950;
    evaluateVehicleAcoustics(qinEnv, ap, qinT, 0.04, false);
    const qinStopDrop = qinRun - qinEnv.engineEnvelope;
    assert(qinStopDrop >= 0 && qinStopDrop < 0.10,
      `Qin PLUS stop envelope must fade gently without abrupt drop (drop=${qinStopDrop.toFixed(3)})`);
  }

  // =========================================================================
  // 5. PURE EVs (MODEL 3, TAYCAN 4S, SU7 MAX): ACCEL, REGEN, DUAL-MOTOR, 2-SPEED, EVENTS
  // =========================================================================
  {
    // 5a. Model 3 RWD: accel vs regen + EV power events
    const m3Ap = getVehicleDescriptor('tesla-model-3-rwd').acousticProfile;
    const m3 = new VehicleDynamics<ElectricPowertrain>(createVehiclePhysicsConfig('tesla-model-3-rwd'), {
      driveSelector: 'P',
      vehicleOperational: false,
    });
    const ctrl = new PowertrainEventController();
    const m3Events: PowertrainAcousticEventType[] = [];
    const t = createVehicleAcousticTelemetry();
    populateAcousticTelemetry(t, m3.getSnapshot(), undefined, DEFAULT_CTX);
    ctrl.update(1 / 60, m3Ap, t);

    m3.requestEngineStart();
    populateAcousticTelemetry(t, m3.getSnapshot(), undefined, DEFAULT_CTX);
    let n = ctrl.update(1 / 60, m3Ap, t);
    for (let i = 0; i < n; i += 1) m3Events.push(ctrl.getEvent(i).type);

    assert(m3.requestDriveSelector('D', 1), 'Model 3 shift P->D with brake');
    const accelIn = { ...createNeutralVehicleInputState(), throttle: 0.75 };
    for (let i = 0; i < 240; i += 1) {
      m3.stepFixed(1 / 120, accelIn);
      if (i % 2 === 0) {
        populateAcousticTelemetry(t, m3.getSnapshot(), undefined, DEFAULT_CTX);
        n = ctrl.update(1 / 60, m3Ap, t);
        for (let j = 0; j < n; j += 1) m3Events.push(ctrl.getEvent(j).type);
      }
    }
    evaluateVehicleAcoustics(mixA, m3Ap, t, 0.04, true);
    assert(mixA.motor1Active && !mixA.motor2Active && !mixA.engineActive,
      'Model 3 RWD: single rear motor active, no front motor, no ICE');

    // Lift off -> one-pedal regen!
    const liftIn = createNeutralVehicleInputState();
    for (let i = 0; i < 120; i += 1) {
      m3.stepFixed(1 / 120, liftIn);
      if (i % 2 === 0) {
        populateAcousticTelemetry(t, m3.getSnapshot(), undefined, DEFAULT_CTX);
        n = ctrl.update(1 / 60, m3Ap, t);
        for (let j = 0; j < n; j += 1) m3Events.push(ctrl.getEvent(j).type);
      }
    }
    evaluateVehicleAcoustics(mixB, m3Ap, t, 0.04, true);
    assert(mixB.motor1Active && mixB.motor1EmHz < mixA.motor1EmHz,
      'Model 3 regen pitch must shift lower than drive pitch');

    m3.requestEngineStop();
    populateAcousticTelemetry(t, m3.getSnapshot(), undefined, DEFAULT_CTX);
    n = ctrl.update(1 / 60, m3Ap, t);
    for (let i = 0; i < n; i += 1) m3Events.push(ctrl.getEvent(i).type);
    evaluateVehicleAcoustics(mixC, m3Ap, t, 0.04, true);
    assert(!mixC.motor1Active && mixC.motor1EmGain === 0 && mixC.pedestrianGain === 0,
      'Model 3 shutdown must silence propulsion & AVAS');
    assert(
      m3Events.includes('EV_DRIVE_READY') &&
      m3Events.includes('EV_INVERTER_ACTIVATION') &&
      m3Events.includes('EV_MOTOR_LOAD_TRANSITION') &&
      m3Events.includes('EV_REGEN_TRANSITION') &&
      m3Events.includes('EV_DRIVE_SHUTDOWN'),
      `Model 3 missing EV lifecycle events (${m3Events.join(',')})`,
    );

    // 5b. Taycan 4S: dual PSM + front disconnect + 2-speed shift + Sport harmonic
    const taycanAp = getVehicleDescriptor('porsche-taycan-4s').acousticProfile;
    const tayT = createVehicleAcousticTelemetry();
    tayT.evActive = true; tayT.vehicleOperational = true; tayT.driving = true;
    tayT.vehicleSpeed = 20; tayT.rearMotorRPM = 7_500; tayT.rearMotorTorque = 280;
    tayT.frontMotorRPM = 4_200; tayT.frontMotorTorque = 190; tayT.frontConnected = true;
    tayT.driveMode = 'NORMAL'; tayT.evGear = 1;
    evaluateVehicleAcoustics(mixA, taycanAp, tayT, 0.04, true);
    assert(mixA.motor1Active && mixA.motor2Active && mixA.motor2EmGain > 0,
      'Taycan 4S connected AWD must drive both rear and front motors independently');

    tayT.frontConnected = false; tayT.frontMotorTorque = 0;
    evaluateVehicleAcoustics(mixB, taycanAp, tayT, 0.04, true);
    assert(mixB.motor1Active && !mixB.motor2Active && mixB.motor2EmGain === 0,
      'Taycan 4S disconnected front axle must silence secondary motor cleanly');

    tayT.frontConnected = true; tayT.frontMotorTorque = 210; tayT.driveMode = 'SPORT_PLUS';
    evaluateVehicleAcoustics(mixC, taycanAp, tayT, 0.04, true);
    assert(mixC.motor1HarmonicGain > mixA.motor1HarmonicGain * 1.2,
      'Taycan Sport Plus must amplify Electric Sport Sound harmonic body');

    ctrl.reset();
    ctrl.update(0.02, taycanAp, tayT);
    tayT.evShiftInProgress = true; tayT.evGear = 2;
    n = ctrl.update(0.02, taycanAp, tayT);
    let saw2Spd = false;
    for (let i = 0; i < n; i += 1) if (ctrl.getEvent(i).type === 'EV_TWO_SPEED_SHIFT') saw2Spd = true;
    assert(saw2Spd, 'Taycan 4S rear 2-speed shift must emit EV_TWO_SPEED_SHIFT');

    // 5c. Xiaomi SU7 Max vs Model 3 vs Taycan differentiation
    const su7Ap = getVehicleDescriptor('xiaomi-su7-max-2026').acousticProfile;
    const su7T = createVehicleAcousticTelemetry();
    su7T.evActive = true; su7T.vehicleOperational = true; su7T.driving = true;
    su7T.vehicleSpeed = 25; su7T.rearMotorRPM = 9_500; su7T.rearMotorTorque = 360;
    su7T.frontMotorRPM = 9_500; su7T.frontMotorTorque = 220; su7T.frontConnected = true;
    su7T.driveMode = 'SPORT';
    evaluateVehicleAcoustics(mixA, su7Ap, su7T, 0.04, true);
    evaluateVehicleAcoustics(mixB, m3Ap, su7T, 0.04, true);
    assert(mixA.motor1Active && mixA.motor2Active && Math.abs(mixA.motor1EmHz - mixA.motor2EmHz) > 100,
      'SU7 Max front induction vs rear PMSM must have distinct acoustic frequencies');
    assert(Math.abs(mixA.motor1EmHz - mixB.motor1EmHz) > 20 || Math.abs(mixA.motorInverterHz - mixB.motorInverterHz) > 200,
      'SU7 Max and Model 3 must have distinct electromagnetic/inverter voices');
  }

  // =========================================================================
  // 6. FULL ENGINEAUDIO GRAPH, 25 Hz THROTTLE, SMOOTH PERSPECTIVE, SWITCHING & STRESS TESTS
  // =========================================================================
  const mockCtx = new MockAudioContext();
  const audio = new EngineAudio(() => mockCtx as unknown as AudioContext);
  await audio.start();

  const initialDiag = audio.getDiagnostics();
  assert(initialDiag.initialized, 'EngineAudio graph initialized');
  assert(initialDiag.continuousUpdateHz === 25, `expected 25 Hz update rate, got ${initialDiag.continuousUpdateHz}`);
  const basePersistentNodes = initialDiag.persistentNodeCount;

  // 6a. Smooth interior <-> exterior perspective transition (no 1-frame snap)
  const a6lDesc = getVehicleDescriptor('executive-lwb-2t');
  audio.configure(a6lDesc.audioProfile, a6lDesc.acousticProfile);
  const frameT = createVehicleAcousticTelemetry();
  frameT.hasCombustion = true; frameT.engineRunning = true; frameT.ignitionPhase = 'RUNNING';
  frameT.rpm = 2_800; frameT.engineLoad = 0.55; frameT.throttle = 0.55; frameT.cockpit = true;
  audio.updateAcoustic(frameT, 0.04); // immediate sync inside cabin
  assert(Math.abs(audio.getDiagnostics().mixState.cabinBlend - 1) < 0.01, 'initial cabinBlend = 1');

  frameT.cockpit = false;
  mockCtx.advance(0.04);
  audio.updateAcoustic(frameT, 0.04);
  const midBlend = audio.getDiagnostics().mixState.cabinBlend;
  assert(midBlend > 0.3 && midBlend < 0.95, `perspective switch must transition smoothly (got ${midBlend})`);
  for (let i = 0; i < 30; i += 1) {
    mockCtx.advance(0.04);
    audio.updateAcoustic(frameT, 0.04);
  }
  assert(audio.getDiagnostics().mixState.cabinBlend < 0.05, 'perspective switch converges cleanly to exterior');

  // 6b. 25 Hz throttling check: 3 seconds at 60 Hz (180 frames) should schedule ~75 continuous updates, NOT 180!
  const beforeSchedules = audio.getDiagnostics().paramSchedulesApplied;
  for (let f = 0; f < 180; f += 1) {
    mockCtx.advance(1 / 60);
    frameT.rpm = 2_400 + Math.sin(f * 0.08) * 600;
    audio.updateAcoustic(frameT, 1 / 60);
  }
  const schedulesIn3s = audio.getDiagnostics().paramSchedulesApplied - beforeSchedules;
  assert(schedulesIn3s >= 68 && schedulesIn3s <= 82,
    `expected ~75 continuous updates in 3s at 25 Hz, got ${schedulesIn3s}`);

  // 6c. 36 consecutive vehicle switches across all 18 vehicles: ZERO node growth, ZERO lingering voices
  for (let pass = 0; pass < 2; pass += 1) {
    for (const desc of VEHICLE_CATALOG) {
      audio.configure(desc.audioProfile, desc.acousticProfile);
      const d = audio.getDiagnostics();
      assert(d.persistentNodeCount === basePersistentNodes,
        `persistent node leak on switch to ${desc.id}: ${d.persistentNodeCount} vs ${basePersistentNodes}`);
      assert(d.transientStats.activeVoices === 0,
        `lingering transient voices after switch to ${desc.id}: ${d.transientStats.activeVoices}`);
      frameT.hasCombustion = desc.acousticProfile.engine !== undefined;
      frameT.evActive = desc.acousticProfile.powertrainKind === 'EV';
      frameT.vehicleOperational = true;
      frameT.engineRunning = frameT.hasCombustion;
      frameT.ignitionPhase = frameT.hasCombustion ? 'RUNNING' : 'OFF';
      frameT.rpm = desc.acousticProfile.engine?.idleRPM ?? 0;
      frameT.rearMotorRPM = frameT.evActive ? 2_500 : 0;
      frameT.rearMotorTorque = frameT.evActive ? 120 : 0;
      mockCtx.advance(0.04);
      audio.updateAcoustic(frameT, 0.04);
    }
  }
  const waveCacheSize = audio.getDiagnostics().periodicWaveCacheSize;
  assert(waveCacheSize <= 36, `PeriodicWave cache must be bounded (got ${waveCacheSize})`);

  // 6d. Rapid start/stop & burst stress test: capped at MAX_CONCURRENT_TRANSIENTS (8), zero leak, zero residual!
  const jesko = getVehicleDescriptor('koenigsegg-jesko-attack');
  audio.configure(jesko.audioProfile, jesko.acousticProfile);
  const stressT = createVehicleAcousticTelemetry();
  stressT.hasCombustion = true; stressT.sequencedIgnition = true; stressT.driveMode = 'RACE';
  audio.updateAcoustic(stressT, 0.04);

  for (let burst = 0; burst < 25; burst += 1) {
    mockCtx.advance(0.02);
    stressT.ignitionPhase = burst % 2 === 0 ? 'CRANKING' : 'STOPPING';
    stressT.engineRunning = false;
    stressT.rpm = burst % 2 === 0 ? 350 : 600;
    audio.updateAcoustic(stressT, 0.02);

    mockCtx.advance(0.02);
    stressT.ignitionPhase = 'CATCH';
    stressT.engineRunning = true;
    stressT.rpm = 1_500;
    stressT.shiftInProgress = burst % 3 === 0;
    stressT.gearNumber = (burst % 6) + 1;
    stressT.targetGearNumber = ((burst + 1) % 6) + 1;
    audio.updateAcoustic(stressT, 0.02);
  }
  const peakTransients = audio.getDiagnostics().transientStats.peakConcurrentVoices;
  assert(peakTransients <= MAX_CONCURRENT_TRANSIENTS,
    `transient voice count exceeded cap ${MAX_CONCURRENT_TRANSIENTS}: peak=${peakTransients}`);

  // Stop cleanly and advance clock past all transient durations -> zero active voices & silent engine!
  stressT.ignitionPhase = 'OFF';
  stressT.engineRunning = false;
  stressT.rpm = 0;
  stressT.shiftInProgress = false;
  for (let i = 0; i < 40; i += 1) {
    mockCtx.advance(0.05);
    audio.updateAcoustic(stressT, 0.05);
  }
  const postStressDiag = audio.getDiagnostics();
  assert(postStressDiag.transientStats.activeVoices === 0,
    `expected 0 active transient voices after settle, got ${postStressDiag.transientStats.activeVoices}`);
  assert(!postStressDiag.mixState.engineActive && !postStressDiag.mixState.crankActive && postStressDiag.mixState.exhaustPrimaryGain === 0,
    'engine and cranking must be completely silent after rapid stop');

  // 6e. Anti-clipping sanity check at worst-case simultaneous peak (Jesko RACE redline exterior)
  stressT.ignitionPhase = 'RUNNING';
  stressT.engineRunning = true;
  stressT.rpm = 8_500;
  stressT.engineLoad = 1;
  stressT.throttle = 1;
  stressT.boostPressureBar = 1.7;
  stressT.cockpit = false;
  stressT.vehicleSpeed = 90;
  mockCtx.advance(0.5);
  audio.updateAcoustic(stressT, 0.5);
  const peakMix = audio.getDiagnostics().mixState;
  const totalEngineLayerSum =
    peakMix.exhaustPrimaryGain +
    peakMix.exhaustBodyGain +
    peakMix.exhaustUpperGain +
    peakMix.combustionNoiseGain +
    peakMix.intakeGain +
    peakMix.mechanicalGain +
    peakMix.turboSpoolGain +
    peakMix.txWhineGain;
  assert(Number.isFinite(totalEngineLayerSum) && totalEngineLayerSum < 1.25,
    `worst-case summed layer gains must stay bounded below clipping (got ${totalEngineLayerSum.toFixed(3)})`);

  // 6f. Full disposal releases AudioContext & clears node counters
  audio.dispose();
  assert(mockCtx.closed && !audio.getDiagnostics().initialized && audio.getDiagnostics().persistentNodeCount === 0,
    'dispose() must close AudioContext and reset persistent node count');

  return {
    assertions,
    vehiclesVerified: VEHICLE_CATALOG.length,
    persistentNodes: basePersistentNodes,
    continuousSources: initialDiag.continuousSourceCount,
    continuousUpdateHz: initialDiag.continuousUpdateHz,
    peakConcurrentTransients: peakTransients,
    paramSchedulesIn3sAt60Hz: schedulesIn3s,
    periodicWaveCacheAfter36Switches: waveCacheSize,
  };
}
