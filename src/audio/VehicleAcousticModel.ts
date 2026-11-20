import type { VehicleAcousticTelemetry } from './AcousticTelemetry';
import type {
  ElectricMachineAcousticSignature,
  VehicleAcousticProfile,
} from './VehicleAcousticProfile';

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const smoothStep = (value: number): number => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Flat, preallocated output of the V2 continuous acoustic model.
 * Overwritten in-place every acoustic tick (25 Hz) with zero heap allocations.
 */
export interface AcousticMixState {
  // Perspective & cabin filtering
  cabinBlend: number;
  cabinEngineLowpassHz: number;
  cabinEngineShelfDb: number;
  cabinEngineShelfHz: number;
  cabinMotorLowpassHz: number;
  cabinRoadLowpassHz: number;

  // Combustion engine layers & organic start/stop envelope
  engineActive: boolean;
  engineEnvelope: number;
  engineBusGain: number;
  firingHz: number;
  bodyHz: number;
  upperHz: number;
  mechanicalHz: number;
  exhaustCutoffHz: number;
  exhaustResonanceHz: number;
  exhaustResonanceQ: number;
  exhaustResonanceGainDb: number;
  exhaustCharacterHz: number;
  exhaustCharacterQ: number;
  exhaustCharacterGainDb: number;
  intakeCutoffHz: number;
  intakeQ: number;
  combustionNoiseFreqHz: number;
  combustionNoiseQ: number;
  roughnessHz: number;
  roughnessCents: number;

  exhaustPrimaryGain: number;
  exhaustBodyGain: number;
  exhaustUpperGain: number;
  combustionNoiseGain: number;
  intakeGain: number;
  mechanicalGain: number;

  // Turbo & transmission continuous layers
  turboSpoolHz: number;
  turboSpoolGain: number;
  txWhineHz: number;
  txWhineGain: number;

  // Stateful cranking layer (active only during CRANKING phase)
  crankActive: boolean;
  crankEnvelope: number;
  crankHz: number;
  crankGain: number;

  // Electric machine layers (Primary: EV rear/single, P2 motor, EHS P3; Secondary: EV front, EHS P1 gen)
  motorBusGain: number;
  motor1Active: boolean;
  motor1EmHz: number;
  motor1HarmonicHz: number;
  motor1EmGain: number;
  motor1HarmonicGain: number;

  motor2Active: boolean;
  motor2EmHz: number;
  motor2EmGain: number;

  motorInverterHz: number;
  motorInverterQ: number;
  motorInverterGain: number;

  pedestrianHz: number;
  pedestrianGain: number;

  // Road & wind layers
  roadGain: number;
  roadFilterHz: number;
  windGain: number;
  windHighpassHz: number;
  windLowpassHz: number;

  // Diagnostics / internal smoothers
  overrunFactor: number;
  boostNorm: number;
  smoothedAccelLoad: number;
  smoothedLoad: number;
  crankPhase: number;
}

export function createAcousticMixState(): AcousticMixState {
  return {
    cabinBlend: 1,
    cabinEngineLowpassHz: 20_000,
    cabinEngineShelfDb: 0,
    cabinEngineShelfHz: 2_200,
    cabinMotorLowpassHz: 20_000,
    cabinRoadLowpassHz: 20_000,

    engineActive: false,
    engineEnvelope: 0,
    engineBusGain: 0,
    firingHz: 28,
    bodyHz: 14,
    upperHz: 56,
    mechanicalHz: 140,
    exhaustCutoffHz: 420,
    exhaustResonanceHz: 140,
    exhaustResonanceQ: 1.2,
    exhaustResonanceGainDb: 0,
    exhaustCharacterHz: 750,
    exhaustCharacterQ: 1.4,
    exhaustCharacterGainDb: 0,
    intakeCutoffHz: 600,
    intakeQ: 0.7,
    combustionNoiseFreqHz: 620,
    combustionNoiseQ: 0.55,
    roughnessHz: 5.5,
    roughnessCents: 1.0,

    exhaustPrimaryGain: 0,
    exhaustBodyGain: 0,
    exhaustUpperGain: 0,
    combustionNoiseGain: 0,
    intakeGain: 0,
    mechanicalGain: 0,

    turboSpoolHz: 1800,
    turboSpoolGain: 0,
    txWhineHz: 420,
    txWhineGain: 0,

    crankActive: false,
    crankEnvelope: 0,
    crankHz: 75,
    crankGain: 0,

    motorBusGain: 0,
    motor1Active: false,
    motor1EmHz: 140,
    motor1HarmonicHz: 280,
    motor1EmGain: 0,
    motor1HarmonicGain: 0,

    motor2Active: false,
    motor2EmHz: 190,
    motor2EmGain: 0,

    motorInverterHz: 2400,
    motorInverterQ: 2.0,
    motorInverterGain: 0,

    pedestrianHz: 140,
    pedestrianGain: 0,

    roadGain: 0,
    roadFilterHz: 280,
    windGain: 0,
    windHighpassHz: 650,
    windLowpassHz: 2800,

    overrunFactor: 0,
    boostNorm: 0,
    smoothedAccelLoad: 0,
    smoothedLoad: 0,
    crankPhase: 0,
  };
}

/**
 * Reusable scratch struct for single-machine electric computation (zero alloc).
 */
interface MachineEvalScratch {
  active: boolean;
  emHz: number;
  harmonicHz: number;
  emGain: number;
  harmonicGain: number;
  inverterHz: number;
  inverterQ: number;
  inverterGain: number;
  gearHz: number;
  gearGain: number;
}

const primaryScratch: MachineEvalScratch = {
  active: false, emHz: 120, harmonicHz: 240, emGain: 0, harmonicGain: 0,
  inverterHz: 2400, inverterQ: 2, inverterGain: 0, gearHz: 500, gearGain: 0,
};

const secondaryScratch: MachineEvalScratch = {
  active: false, emHz: 160, harmonicHz: 320, emGain: 0, harmonicGain: 0,
  inverterHz: 2800, inverterQ: 2, inverterGain: 0, gearHz: 600, gearGain: 0,
};

function evaluateElectricMachine(
  out: MachineEvalScratch,
  sig: ElectricMachineAcousticSignature,
  rpmAbs: number,
  torqueSigned: number,
  regenActive: boolean,
  powered: boolean,
  sportScale: number,
  allowStationaryGen: boolean,
): void {
  const rotation = clamp(rpmAbs / Math.max(1000, sig.maxRPM), 0, 1.15);
  const load = clamp(Math.abs(torqueSigned) / Math.max(10, sig.maxTorque), 0, 1.15);
  const spinning = allowStationaryGen
    ? smoothStep(rpmAbs / 240)
    : smoothStep(rpmAbs / 110);

  if (!powered || spinning <= 0.001) {
    out.active = false;
    out.emHz = sig.baseHz;
    out.harmonicHz = sig.baseHz * sig.harmonicOrder;
    out.emGain = 0;
    out.harmonicGain = 0;
    out.inverterHz = sig.inverterCarrierHz;
    out.inverterQ = sig.inverterQ;
    out.inverterGain = 0;
    out.gearHz = sig.gearMeshBaseHz;
    out.gearGain = 0;
    return;
  }

  out.active = true;
  const regenPitch = regenActive ? sig.regenPitchScale : 1;
  const regenGain = regenActive ? sig.regenGainScale : 1;
  const regenShift = regenActive ? sig.regenTimbreShiftHz : 0;

  const emHz = clamp(
    sig.baseHz + rotation * sig.sweepHz * regenPitch + regenShift,
    45,
    2_400,
  );
  const harmonicHz = clamp(emHz * sig.harmonicOrder, 80, 3_200);

  const torqueEnvelope = sig.baseLevel + Math.pow(clamp(load, 0, 1), 0.85) * sig.loadGain;
  const speedRollOff = 1 - smoothStep((rotation - 0.82) / 0.35) * 0.18;
  const emGain = spinning * torqueEnvelope * speedRollOff * sportScale * regenGain;
  const harmonicGain = emGain * sig.harmonicGain * (0.28 + clamp(load, 0, 1) * 0.72);

  const inverterLoad = Math.pow(clamp(load, 0, 1), 1.1) * (regenActive ? sig.regenInverterBoost : 1);
  const inverterHz = clamp(
    sig.inverterCarrierHz * 0.58 + rotation * sig.inverterSweepHz * 0.45 * (regenActive ? 0.92 : 1),
    750,
    2_400,
  );
  const inverterGain = spinning * sig.inverterGain * 0.35 * (0.12 + inverterLoad * 0.88) * sportScale;

  const gearHz = clamp(sig.gearMeshBaseHz * 0.82 + rotation * sig.gearMeshSweepHz * 0.65, 180, 1_800);
  const gearGain = spinning * sig.gearMeshGain * 0.45 * (0.25 + clamp(load, 0, 1) * 0.75);

  out.emHz = emHz;
  out.harmonicHz = harmonicHz;
  out.emGain = emGain;
  out.harmonicGain = harmonicGain;
  out.inverterHz = inverterHz;
  out.inverterQ = sig.inverterQ;
  out.inverterGain = inverterGain;
  out.gearHz = gearHz;
  out.gearGain = gearGain;
}

/**
 * Evaluates the complete Vehicle Audio V2 continuous sound field into `out`.
 * Pure, deterministic, zero allocations.
 */
export function evaluateVehicleAcoustics(
  out: AcousticMixState,
  profile: VehicleAcousticProfile,
  t: Readonly<VehicleAcousticTelemetry>,
  dt: number,
  immediateSync = false,
): AcousticMixState {
  const safeDt = Number.isFinite(dt) ? clamp(dt, 0.001, 0.12) : 1 / 25;
  const cabin = profile.cabin;

  // 1. Smooth interior <-> exterior perspective blend
  const targetCabin = t.cockpit ? 1 : 0;
  if (immediateSync || cabin.perspectiveSmoothSec <= 0.001) {
    out.cabinBlend = targetCabin;
  } else {
    const alpha = 1 - Math.exp(-safeDt / cabin.perspectiveSmoothSec);
    out.cabinBlend += (targetCabin - out.cabinBlend) * alpha;
    if (Math.abs(out.cabinBlend - targetCabin) < 0.001) out.cabinBlend = targetCabin;
  }
  const interior = out.cabinBlend;

  // Continuous door/window openness modulation when inside cockpit
  const ca = t.cabinAcoustics;
  const openness = ca ? clamp(ca.openness, 0, 1) : 0;
  const doorWindowEngineScale = ca ? ca.engineScale : 1;
  const doorWindowRoadScale = ca ? ca.roadScale : 1;
  const doorWindowWindScale = ca ? ca.windScale : 1;
  const closedIsolationBlend = interior * (1 - openness * 0.82);

  // Smooth acceleration load (-1..1)
  const accelTarget = clamp(t.acceleration / 4.5, -1, 1);
  out.smoothedAccelLoad += (accelTarget - out.smoothedAccelLoad) * (1 - Math.exp(-safeDt * 4.5));

  const speed = clamp(Math.abs(t.vehicleSpeed), 0, 160);
  const speedNorm = smoothStep(speed / 42);
  const roughness = clamp(t.roadRoughness, 0, 1);
  const isSport = t.driveMode === 'SPORT' || t.driveMode === 'RACE' || t.driveMode === 'SPORT_PLUS';
  const isSnow = t.driveMode === 'SNOW' || (t.p2Active && t.p2TerrainMode === 'SNOW');
  const isEco = t.driveMode === 'ECO' || t.driveMode === 'RANGE' || t.driveMode === 'MAYBACH' || isSnow;
  const hybridEnergyEngineScale = t.p2Active
    ? (t.p2Mode === 'EV' ? 0.94 : t.p2Mode === 'INTELLIGENT' && t.p2State === 'CHARGE' ? 0.93 : t.p2State === 'BOOST' ? 1.06 : 1)
    : t.ehsActive
      ? (t.ehsMode === 'EV' ? 0.94 : t.ehsState === 'SERIES' ? 0.95 : t.ehsState === 'DIRECT' ? 1.03 : 1)
      : 1;
  const hybridEnergyMotorScale = t.p2Active
    ? (t.p2Mode === 'EV' ? 1.04 : t.p2State === 'BOOST' ? 1.08 : t.p2Mode === 'INTELLIGENT' ? 0.98 : 1)
    : t.ehsActive
      ? (t.ehsMode === 'EV' ? 1.03 : t.ehsState === 'PARALLEL' ? 1.06 : 1)
      : 1;

  // Cabin EQ targets
  const closedEngLowpass = cabin.interiorLowpassHz + (cabin.exteriorLowpassHz - cabin.interiorLowpassHz) * openness;
  out.cabinEngineLowpassHz = lerp(cabin.exteriorLowpassHz, closedEngLowpass, interior);
  out.cabinEngineShelfDb = lerp(0, cabin.interiorShelfDb * (1 - openness * 0.75), interior);
  out.cabinEngineShelfHz = cabin.interiorShelfFreqHz;

  const closedMotorLowpass = Math.max(1_800, closedEngLowpass * 1.35);
  out.cabinMotorLowpassHz = lerp(cabin.exteriorLowpassHz, closedMotorLowpass, interior);

  const interiorRoadLp = ca ? ca.lowpassHz : cabin.closedRoadLowpassHz;
  out.cabinRoadLowpassHz = lerp(20_000, interiorRoadLp, interior);

  // 2. Combustion Engine Synthesis (ICE, Mild Hybrid, P2 PHEV, EHS PHEV)
  const eng = profile.engine;
  const phase = t.p2Active ? t.p2EnginePhase : t.ehsActive ? t.ehsEnginePhase : t.ignitionPhase;
  const isCranking = eng !== undefined && phase === 'CRANKING';

  // Stateful cranking layer with smooth envelope (NO abrupt cut!)
  if (isCranking && profile.events.starterType !== 'NONE') {
    const ev = profile.events;
    const crankRatio = clamp(t.rpm / Math.max(180, eng.idleRPM * 0.65), 0, 1.2);
    const isElectricSpin = ev.starterType === 'ISG_48V' || ev.starterType === 'P1_HIGH_RPM' || ev.starterType === 'P2_HYBRID';
    out.crankPhase = (out.crankPhase + safeDt * Math.max(2, ev.starterPulseHz) * Math.PI * 2) % (Math.PI * 2);
    const compressionCadence = isElectricSpin
      ? (0.92 + 0.08 * Math.sin(out.crankPhase))
      : (0.72 + 0.28 * Math.sin(out.crankPhase));
    const crankTarget = 1;
    out.crankEnvelope = immediateSync
      ? crankTarget
      : out.crankEnvelope + (crankTarget - out.crankEnvelope) * (1 - Math.exp(-safeDt / 0.065));
    out.crankActive = true;
    out.crankHz = lerp(ev.starterFreqStartHz, ev.starterFreqEndHz, clamp(crankRatio, 0, 1));
    const perspectiveStarter = lerp(1.18, 0.72 + openness * 0.35, interior);
    out.crankGain = ev.starterGain * out.crankEnvelope * compressionCadence * perspectiveStarter;
  } else {
    if (immediateSync) {
      out.crankEnvelope = 0;
    } else {
      out.crankEnvelope *= Math.exp(-safeDt / 0.075);
      if (out.crankEnvelope < 0.004) out.crankEnvelope = 0;
    }
    out.crankActive = out.crankEnvelope > 0.004;
    out.crankHz = profile.events.starterFreqStartHz;
    out.crankGain = out.crankActive ? profile.events.starterGain * out.crankEnvelope * 0.65 : 0;
  }

  // Organic continuous engine wake-up & coast-down envelope (eliminates abrupt hybrid start/stop!)
  if (eng && t.hasCombustion) {
    const isRunningPhase = (t.engineRunning && t.rpm >= 60) || (phase === 'CATCH' && t.rpm >= 60);
    const isStoppingPhase = phase === 'STOPPING' && t.rpm >= 25;
    const isHybridSmooth = profile.powertrainKind === 'P2_PHEV' || profile.powertrainKind === 'EHS_PHEV';

    let targetEnv = 0;
    let envTau = Math.max(0.06, profile.events.stopFadeSec);
    if (isCranking && t.rpm >= 40) {
      // Muffled compression pulses organically bridge cranking into ignition catch!
      targetEnv = isHybridSmooth ? 0.16 : 0.22;
      envTau = 0.14;
    } else if (phase === 'CATCH' && t.rpm >= 60) {
      targetEnv = 0.92;
      envTau = Math.max(0.06, profile.events.startFadeSec);
    } else if (isRunningPhase) {
      targetEnv = 1;
      envTau = Math.max(0.06, profile.events.startFadeSec);
    } else if (isStoppingPhase) {
      // Natural monotonic decay following real decelerating crank RPM — NO abrupt 35% step!
      const rpmTail = Math.pow(clamp(t.rpm / Math.max(240, eng.idleRPM), 0, 1), 0.78);
      targetEnv = rpmTail * 0.85;
      envTau = Math.max(0.10, profile.events.stopFadeSec);
    } else {
      targetEnv = 0;
      envTau = Math.max(0.09, profile.events.stopFadeSec * 0.55);
    }

    if (immediateSync) {
      out.engineEnvelope = isRunningPhase ? 1 : isStoppingPhase ? targetEnv : 0;
    } else {
      const alpha = 1 - Math.exp(-safeDt / envTau);
      out.engineEnvelope += (targetEnv - out.engineEnvelope) * alpha;
      if (targetEnv === 0 && out.engineEnvelope < 0.0025) out.engineEnvelope = 0;
    }

    // Always keep firing/harmonic frequencies tracking real crank RPM (zero pitch jump on catch!)
    const safeRpm = clamp(t.rpm > 20 ? t.rpm : eng.idleRPM * 0.35, 30, eng.maxRPM + 400);
    const firingHz = clamp((safeRpm * eng.cylinderCount) / 120, 12, 980);
    out.firingHz = firingHz;
    out.bodyHz = clamp(firingHz * eng.bodyOrder, 12, 980);
    out.upperHz = clamp(firingHz * eng.upperOrder, 24, 1_850);
    // Keep mechanical rotating texture in warm low-mid band (never a 1-4 kHz sine whistle)
    out.mechanicalHz = clamp(firingHz * Math.min(eng.mechanicalOrder, 2.5), 75, 580);

    const isAudible = out.engineEnvelope > 0.003 && (isRunningPhase || isStoppingPhase || isCranking || out.engineEnvelope > 0.01);
    if (isAudible) {
      out.engineActive = !isCranking || isRunningPhase || isStoppingPhase;
      const rpmSpan = Math.max(1_500, eng.redlineRPM - eng.idleRPM);
      const rpmNorm = clamp((safeRpm - eng.idleRPM) / rpmSpan, 0, 1.15);
      const rpmSmooth = smoothStep(clamp(rpmNorm, 0, 1));

      // Real engine load, softly smoothed on hybrid start/stop so load never jumps in 1 tick
      let rawLoad = clamp(t.engineLoad, 0, 1);
      if (isCranking || isStoppingPhase) {
        rawLoad = 0.05;
      } else if (t.ehsActive && t.ehsState === 'SERIES') {
        const genLoad = clamp(t.ehsP1GenerationPowerW / 40_000, 0, 1);
        rawLoad = Math.max(rawLoad, genLoad * 0.85, t.throttle * 0.65);
      } else if (!t.ehsActive && !t.p2Active) {
        const clutchWeight = 0.78 + clamp(t.clutchEngagement, 0, 1) * 0.22;
        rawLoad = clamp(Math.max(rawLoad, t.throttle * 0.85) * clutchWeight, 0, 1);
      }

      if (immediateSync) {
        out.smoothedLoad = rawLoad;
      } else {
        const loadTau = isHybridSmooth ? 0.14 : 0.055;
        out.smoothedLoad += (rawLoad - out.smoothedLoad) * (1 - Math.exp(-safeDt / loadTau));
      }
      const effectiveLoad = clamp(out.smoothedLoad, 0, 1);

      // 4-band RPM zone presence
      const idleBand = 1 - smoothStep(rpmNorm / 0.14);
      const lowBand = smoothStep(rpmNorm / 0.16) * (1 - smoothStep((rpmNorm - 0.22) / 0.24));
      const midBand = smoothStep((rpmNorm - 0.24) / 0.26) * (1 - smoothStep((rpmNorm - 0.62) / 0.24));
      const highBand = smoothStep((rpmNorm - 0.56) / 0.30);
      const bandSum = Math.max(0.0001, idleBand + lowBand + midBand + highBand);
      const rpmZonePresence = (
        idleBand * eng.idlePresence +
        lowBand * eng.lowPresence +
        midBand * eng.midPresence +
        highBand * eng.highPresence
      ) / bandSum;

      const modeGain = (isSport ? eng.sportPresence : isEco ? eng.ecoPresence : 1) * hybridEnergyEngineScale;
      const modeBright = (isSport ? eng.sportBrightness : isSnow ? 0.86 : isEco ? 0.90 : 1) *
        (t.p2Active && t.p2State === 'BOOST' ? 1.04 : 1);

      // Overrun (closed throttle deceleration above idle)
      const overrunActive =
        phase === 'RUNNING'
          ? smoothStep((0.18 - t.throttle) / 0.16) *
            smoothStep((safeRpm - eng.idleRPM * 1.25) / Math.max(800, rpmSpan * 0.28)) *
            (t.ehsActive && t.ehsState === 'SERIES' ? 0.12 : 1)
          : 0;
      out.overrunFactor = overrunActive;
      const overrunEnvelope = 1 - overrunActive * (1 - eng.overrun.bodyRetention);

      // Gear & longitudinal acceleration body modulation
      const gearWeight = t.gearNumber >= 1
        ? 1 + profile.transmission.gearPresence * (1 - clamp((t.gearNumber - 1) / 7, 0, 1))
        : 1;
      const accelBody = 1 + out.smoothedAccelLoad * profile.transmission.accelerationPresence;
      const shiftDip = t.shiftInProgress && profile.transmission.shiftEventStyle !== 'NONE'
        ? (profile.transmission.shiftEventStyle === 'LST_SNAP' || profile.transmission.shiftEventStyle === 'DCT_POP' ? 0.78 : 0.88)
        : 1;

      const limiterFactor = t.onRevLimiter && profile.mechanical.revLimiterStyle !== 'NONE'
        ? (1 - profile.mechanical.revLimiterDepth * (0.5 + 0.5 * Math.sin(safeRpm * 0.05)))
        : 1;

      // Interior vs exterior engine presence
      const interiorCurve = lerp(cabin.interiorIdleScale, cabin.interiorLoadScale, smoothStep(effectiveLoad));
      const interiorPresence = cabin.interiorEngineScale * interiorCurve * doorWindowEngineScale;
      const exteriorPresence = cabin.exteriorEngineScale;
      const perspectivePresence = lerp(exteriorPresence, interiorPresence, interior);

      const exhaustPersp = lerp(1, cabin.interiorExhaustScale, closedIsolationBlend);
      const intakePersp = lerp(1, cabin.interiorIntakeScale, closedIsolationBlend);
      const mechPersp = lerp(1, cabin.interiorMechanicalScale, closedIsolationBlend);
      const turboPersp = lerp(1, cabin.interiorTurboScale, closedIsolationBlend);

      // Roughness LFO
      out.roughnessHz = eng.roughnessRateHz + rpmSmooth * 2.8;
      out.roughnessCents = eng.roughnessCents * (1 - rpmSmooth * 0.30);

      // Fuel-cut & cranking softly close exhaust cutoff so wake-up and shutdown feel organic
      const fuelCutFilterScale = isCranking ? 0.42 : isStoppingPhase ? lerp(0.38, 0.85, out.engineEnvelope) : 1;

      // Dual-formant exhaust filtering (Primary muffler boom + Secondary signature bark/trumpet)
      const rawExhaustCutoff = (
        eng.exhaustBaseCutoffHz +
        safeRpm * eng.exhaustRpmSlope +
        effectiveLoad * eng.loadCutoffBoostHz
      ) * modeBright * (1 - overrunActive * 0.22) * fuelCutFilterScale;
      out.exhaustCutoffHz = clamp(rawExhaustCutoff, 110, 4_200);

      out.exhaustResonanceHz = clamp(
        lerp(eng.exhaustResonanceHz, eng.overrun.rumbleHz, overrunActive * 0.65) * (1 + rpmSmooth * 0.30),
        65,
        950,
      );
      out.exhaustResonanceQ = Math.min(eng.exhaustResonanceQ, 1.65);
      out.exhaustResonanceGainDb = clamp(
        eng.exhaustResonanceGainDb * (0.65 + effectiveLoad * 0.35 + overrunActive * 0.20) * fuelCutFilterScale,
        -3,
        6.0,
      );

      // Secondary character formant shifts moderately with RPM (gives unmistakable engine voice without resonant ringing)
      out.exhaustCharacterHz = clamp(
        eng.exhaustCharacterHz * (0.80 + rpmSmooth * 0.42 + effectiveLoad * 0.12),
        200,
        1_300,
      );
      out.exhaustCharacterQ = Math.min(eng.exhaustCharacterQ, 1.35);
      out.exhaustCharacterGainDb = clamp(
        eng.exhaustCharacterGainDb * 0.68 * (0.55 + effectiveLoad * 0.45) * fuelCutFilterScale,
        -3,
        5.2,
      );

      // Turbo spool & air whoosh (strictly 0 for naturally aspirated engines!)
      // Keep tonal turbine whistle ultra-subtle & warm; real turbo feel rides on intake air whoosh + blowoff.
      let turboNorm = 0;
      if (eng.turbo && !isCranking && !isStoppingPhase) {
        const tb = eng.turbo;
        const boostSource = tb.usePhysicalBoost
          ? clamp(t.boostPressureBar / Math.max(0.15, tb.maxBoostBar), 0, 1.1)
          : smoothStep((effectiveLoad - 0.22) / 0.75) * smoothStep((safeRpm - eng.idleRPM * 1.35) / 2_600);
        turboNorm = clamp(boostSource, 0, 1);
        out.turboSpoolHz = clamp(
          tb.spoolBaseHz * 0.52 + turboNorm * tb.spoolSweepHz * 0.36 + rpmSmooth * 180,
          780,
          2_600,
        );
        out.turboSpoolGain = clamp(
          tb.spoolGain * 0.10 * Math.pow(turboNorm, 1.35) * perspectivePresence * turboPersp * modeGain * out.engineEnvelope,
          0,
          0.0045,
        );
      } else {
        out.turboSpoolHz = 1_200;
        out.turboSpoolGain = 0;
      }
      out.boostNorm = turboNorm;

      const loadShape = Math.pow(effectiveLoad, 1.18) * eng.loadDepth;
      const baseMaster =
        perspectivePresence *
        rpmZonePresence *
        modeGain *
        gearWeight *
        accelBody *
        shiftDip *
        limiterFactor *
        out.engineEnvelope;

      out.engineBusGain = 0.76 * eng.busLevel * out.engineEnvelope;

      out.exhaustPrimaryGain = clamp(
        (0.014 + loadShape * 0.095 + rpmSmooth * effectiveLoad * 0.024) *
          eng.primaryGain * eng.exhaustGain * baseMaster * overrunEnvelope * exhaustPersp,
        0,
        0.44,
      );

      out.exhaustBodyGain = clamp(
        ((0.016 + Math.pow(effectiveLoad, 1.08) * 0.068 * eng.loadDepth) * (1 - rpmSmooth * 0.28) +
          overrunActive * eng.overrun.rumbleGain * 0.060) *
          eng.bodyGain * eng.exhaustGain * baseMaster * overrunEnvelope * exhaustPersp,
        0,
        0.44,
      );

      const upperBloom = 1 + Math.pow(rpmSmooth, 1.55) * eng.highRpmUpperBloom;
      out.exhaustUpperGain = clamp(
        (0.0032 + rpmSmooth * (0.011 + effectiveLoad * 0.032) * upperBloom) *
          eng.upperGain * eng.exhaustGain * baseMaster * overrunEnvelope * exhaustPersp,
        0,
        0.34,
      );

      out.combustionNoiseFreqHz = clamp(eng.pulseNoiseFreqHz + rpmSmooth * 420 + effectiveLoad * 240, 180, 2_200);
      out.combustionNoiseQ = Math.min(eng.pulseNoiseQ, 0.85);
      out.combustionNoiseGain = clamp(
        eng.pulseNoiseGain * (0.20 + Math.pow(effectiveLoad, 1.1) * 0.80 + overrunActive * 0.28) *
          baseMaster * exhaustPersp,
        0,
        0.26,
      );

      const turboWhoosh = eng.turbo && !isCranking && !isStoppingPhase ? eng.turbo.whooshGain * turboNorm * turboPersp : 0;
      out.intakeCutoffHz = clamp(
        (eng.intakeBaseHz + safeRpm * eng.intakeRpmSlope + effectiveLoad * eng.intakeLoadBoostHz + turboNorm * 550) * modeBright,
        220,
        2_600,
      );
      out.intakeQ = Math.min(eng.intakeQ, 0.90);
      out.intakeGain = clamp(
        ((0.0012 + Math.pow(effectiveLoad, eng.intakeLoadExponent) * eng.intakeGain * (0.48 + rpmSmooth * 0.82)) * intakePersp +
          turboWhoosh) * perspectivePresence * rpmZonePresence * modeGain * (1 - overrunActive * 0.65) * out.engineEnvelope,
        0,
        0.28,
      );

      out.mechanicalGain = clamp(
        (0.0005 + rpmSmooth * 0.0030 + (1 - effectiveLoad) * rpmSmooth * 0.0010) *
          eng.mechanicalGain * perspectivePresence * rpmZonePresence * mechPersp * out.engineEnvelope,
        0,
        0.0055,
      );
    } else {
      out.engineActive = false;
      out.engineBusGain = 0;
      out.exhaustPrimaryGain = 0;
      out.exhaustBodyGain = 0;
      out.exhaustUpperGain = 0;
      out.combustionNoiseGain = 0;
      out.intakeGain = 0;
      out.mechanicalGain = 0;
      out.turboSpoolGain = 0;
      out.overrunFactor = 0;
      out.boostNorm = 0;
    }
  } else {
    out.engineActive = false;
    out.engineEnvelope = 0;
    out.engineBusGain = 0;
    out.exhaustPrimaryGain = 0;
    out.exhaustBodyGain = 0;
    out.exhaustUpperGain = 0;
    out.combustionNoiseGain = 0;
    out.intakeGain = 0;
    out.mechanicalGain = 0;
    out.turboSpoolGain = 0;
    out.overrunFactor = 0;
    out.boostNorm = 0;
  }

  // 3. Transmission Continuous Gear/Belt/Transfer Whine
  // Only transmissions with authentic mechanical whine (straight-cut LST, CVT steel belt, 4L transfer case, EV 2-speed)
  // emit subtle audible whine; ordinary passenger helical gearboxes remain near-silent so no weird high tone appears.
  const tx = profile.transmission;
  if (t.driving && (tx.gearWhineGain > 0 || (tx.lowRangeWhineGain > 0 && t.p2TransferMode === '4L'))) {
    const shaftRefRpm = t.hasCombustion && t.engineRunning
      ? t.rpm
      : Math.max(t.rearMotorRPM, t.frontMotorRPM, t.p2MotorRPM, t.ehsP3RPM);
    const speedFactor = smoothStep(speed / 4.5);
    const loadFactor = t.hasCombustion ? (0.35 + t.engineLoad * 0.65) : (0.35 + clamp(t.drivePowerKw / 120, 0, 1) * 0.65);
    const hasDistinctiveWhine = tx.type === 'LST' || tx.type === 'CVT' || tx.type === 'EV_TWO_SPEED';
    const baseWhineScale = hasDistinctiveWhine ? 0.16 : 0.025;
    const lowRangeExtra = t.p2TransferMode === '4L' ? tx.lowRangeWhineGain * 0.22 * smoothStep(speed / 1.5) : 0;
    const cvtRatioScale = tx.type === 'CVT' ? clamp(0.72 + t.transmissionRatio * 0.22, 0.72, 1.35) : 1;
    out.txWhineHz = clamp(
      (tx.gearWhineBaseHz * 0.72 + shaftRefRpm * tx.gearWhineRpmSlope * 0.55 + speed * 5.0) * cvtRatioScale,
      160,
      1_100,
    );
    const txPersp = lerp(1.0, 0.58 + openness * 0.35, interior);
    out.txWhineGain = clamp(
      (tx.gearWhineGain * baseWhineScale * speedFactor * loadFactor + lowRangeExtra) * txPersp,
      0,
      0.0055,
    );
  } else {
    out.txWhineGain = 0;
  }

  // 4. Electric Machine Synthesis (Pure EV, P2 Hybrid, EHS P3 + P1)
  const mot = profile.motor;
  if (mot && (t.evActive || t.p2Active || t.ehsActive)) {
    const motorSport = (isSport ? mot.sportPresence : isSnow ? 0.84 : isEco ? 0.90 : 1) * hybridEnergyMotorScale;
    const motorPersp = lerp(cabin.exteriorMotorScale, cabin.interiorMotorScale * doorWindowEngineScale, interior);
    const invPersp = lerp(cabin.exteriorInverterScale, cabin.interiorInverterScale * doorWindowEngineScale, interior);
    const avasPersp = lerp(cabin.exteriorPedestrianScale, cabin.interiorPedestrianScale * (1 + openness * 1.4), interior);

    let p1Rpm = 0;
    let p1Torque = 0;
    let p1Regen = false;
    let p1Stationary = false;
    let p2Rpm = 0;
    let p2Torque = 0;
    let p2Regen = false;
    let p2Stationary = false;

    if (t.ehsActive) {
      p1Rpm = t.ehsP3RPM;
      p1Torque = t.ehsP3Torque;
      p1Regen = t.regenPowerKw > 0.2 || t.ehsP3MechanicalPowerW < -300;
      p1Stationary = false;
      p2Rpm = t.ehsP1RPM;
      const p1Omega = Math.max(15, (t.ehsP1RPM * Math.PI) / 30);
      p2Torque = t.ehsP1GenerationPowerW > 200
        ? t.ehsP1GenerationPowerW / p1Omega
        : Math.abs(t.ehsP1MechanicalPowerW) / p1Omega;
      p2Regen = t.ehsP1GenerationPowerW > 250;
      p2Stationary = true;
    } else if (t.p2Active) {
      p1Rpm = t.p2MotorRPM;
      p1Torque = t.p2MotorTorque;
      p1Regen = t.regenPowerKw > 0.2 || t.p2GenerationPowerW > 300;
      p1Stationary = t.p2GenerationPowerW > 500;
    } else {
      p1Rpm = t.rearMotorRPM;
      p1Torque = t.rearMotorTorque;
      p1Regen = t.regenPowerKw > 0.15 && t.rearMotorTorque * (t.selectedMode === 'R' ? -1 : 1) <= 0;
      p2Rpm = t.frontConnected ? t.frontMotorRPM : 0;
      p2Torque = t.frontConnected ? t.frontMotorTorque : 0;
      p2Regen = t.regenPowerKw > 0.15 && t.frontMotorTorque * (t.selectedMode === 'R' ? -1 : 1) <= 0;
    }

    evaluateElectricMachine(
      primaryScratch,
      mot.primary,
      p1Rpm,
      p1Torque,
      p1Regen,
      t.vehicleOperational,
      motorSport,
      p1Stationary,
    );

    if (mot.secondary) {
      evaluateElectricMachine(
        secondaryScratch,
        mot.secondary,
        p2Rpm,
        p2Torque,
        p2Regen,
        t.vehicleOperational && (!t.ehsActive || t.engineRunning),
        motorSport,
        p2Stationary,
      );
      if (t.ehsActive && secondaryScratch.active) {
        // Gate EHS P1 generator smoothly by engineEnvelope so engine wake-up never pops in a sudden sine tone.
        const p1Env = clamp(out.engineEnvelope, 0, 1);
        secondaryScratch.emGain *= p1Env;
        secondaryScratch.harmonicGain *= p1Env;
        secondaryScratch.inverterGain *= p1Env;
        secondaryScratch.gearGain *= p1Env;
      }
    } else {
      secondaryScratch.active = false;
      secondaryScratch.emGain = 0;
      secondaryScratch.harmonicGain = 0;
      secondaryScratch.inverterGain = 0;
      secondaryScratch.gearGain = 0;
    }

    let sportBodyGain = 0;
    let sportBodyHz = mot.sportBodyBaseHz;
    if (mot.sportHarmonicGain > 0 && primaryScratch.active) {
      const rot = clamp(p1Rpm / Math.max(1000, mot.primary.maxRPM), 0, 1);
      const load = clamp(Math.abs(p1Torque) / Math.max(10, mot.primary.maxTorque), 0, 1);
      const modeBoost = isSport ? 1.45 : isEco ? 0.45 : 0.85;
      sportBodyHz = mot.sportBodyBaseHz + rot * mot.sportBodySweepHz;
      sportBodyGain = mot.sportHarmonicGain * modeBoost * (0.2 + load * 0.8) * smoothStep(speed / 2.2);
    }

    out.motorBusGain = mot.busLevel;
    out.motor1Active = primaryScratch.active;
    out.motor1EmHz = primaryScratch.emHz;
    out.motor1EmGain = clamp(primaryScratch.emGain * motorPersp, 0, 0.28);

    if (sportBodyGain > primaryScratch.harmonicGain * 1.2) {
      out.motor1HarmonicHz = sportBodyHz;
      out.motor1HarmonicGain = clamp((primaryScratch.harmonicGain + sportBodyGain) * motorPersp, 0, 0.24);
    } else {
      out.motor1HarmonicHz = primaryScratch.harmonicHz;
      out.motor1HarmonicGain = clamp((primaryScratch.harmonicGain + sportBodyGain * 0.5) * motorPersp, 0, 0.24);
    }

    out.motor2Active = secondaryScratch.active;
    out.motor2EmHz = secondaryScratch.emHz;
    out.motor2EmGain = clamp(secondaryScratch.emGain * motorPersp, 0, 0.24);

    const totalInvGain = (primaryScratch.inverterGain + secondaryScratch.inverterGain * 0.85) * invPersp;
    const totalGearGain = (primaryScratch.gearGain + secondaryScratch.gearGain * 0.65) * motorPersp;
    if (totalInvGain >= totalGearGain) {
      out.motorInverterHz = clamp(
        secondaryScratch.inverterGain > primaryScratch.inverterGain
          ? secondaryScratch.inverterHz
          : primaryScratch.inverterHz,
        680,
        2_400,
      );
      out.motorInverterQ = Math.min(primaryScratch.inverterQ, 2.2);
    } else {
      out.motorInverterHz = clamp(primaryScratch.gearHz, 220, 1_800);
      out.motorInverterQ = 1.4;
    }
    out.motorInverterGain = clamp(totalInvGain + totalGearGain, 0, 0.0032);

    const maxAvasSpeed = Math.max(2, mot.pedestrianMaxSpeedMps);
    if (t.vehicleOperational && t.driving && speed > 0.15 && speed < maxAvasSpeed) {
      const avasEnv = smoothStep(speed / 0.8) * (1 - smoothStep((speed - maxAvasSpeed * 0.65) / (maxAvasSpeed * 0.35)));
      out.pedestrianHz = mot.pedestrianBaseHz + clamp(speed / maxAvasSpeed, 0, 1) * mot.pedestrianSweepHz;
      out.pedestrianGain = clamp(avasEnv * mot.pedestrianLevel * avasPersp, 0, 0.08);
    } else {
      out.pedestrianGain = 0;
    }
  } else {
    out.motorBusGain = 0;
    out.motor1Active = false;
    out.motor1EmGain = 0;
    out.motor1HarmonicGain = 0;
    out.motor2Active = false;
    out.motor2EmGain = 0;
    out.motorInverterGain = 0;
    out.pedestrianGain = 0;
  }

  // 5. Road & Wind Layers
  const roadPersp = lerp(cabin.exteriorRoadScale, cabin.interiorRoadScale * doorWindowRoadScale, interior);
  const windPersp = lerp(cabin.exteriorWindScale, cabin.interiorWindScale * doorWindowWindScale, interior);
  out.roadGain = clamp(speedNorm * (0.011 + roughness * 0.022) * roadPersp, 0, 0.14);
  out.roadFilterHz = clamp(245 + speed * 12, 200, 1_800);
  out.windGain = clamp(Math.pow(clamp(speed / 50, 0, 1.8), 1.75) * 0.021 * windPersp, 0, 0.14);
  out.windHighpassHz = clamp(620 + speed * 15, 500, 2_800);
  out.windLowpassHz = clamp(2_600 + speed * 31, 1_800, 7_500);

  return out;
}
