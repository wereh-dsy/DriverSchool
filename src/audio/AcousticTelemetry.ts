import type { Engine } from '../vehicle/physics/Engine';
import type { VehicleRuntimeSnapshot, VehicleSnapshot } from '../vehicle/physics/VehicleDynamics';
import type { CabinAcousticState } from './VehicleCabinAcoustics';

export type IgnitionPhaseTelemetry = 'OFF' | 'CRANKING' | 'CATCH' | 'RUNNING' | 'STOPPING';
export type EhsAcousticState = 'EV' | 'SERIES' | 'PARALLEL' | 'DIRECT';

/**
 * Reusable, flat telemetry frame consumed by Vehicle Audio V2.
 * Allocated once per controller/game instance and overwritten in-place each tick
 * to avoid per-frame object allocations and GC pressure.
 */
export interface VehicleAcousticTelemetry {
  // Common vehicle state
  vehicleSpeed: number;
  acceleration: number;
  roadRoughness: number;
  cockpit: boolean;
  driveMode: string;
  vehicleOperational: boolean;
  driveAvailable: boolean;
  driving: boolean;

  // Combustion engine telemetry (zeroed when pure EV)
  hasCombustion: boolean;
  rpm: number;
  throttle: number;
  engineLoad: number;
  engineRunning: boolean;
  ignitionPhase: IgnitionPhaseTelemetry;
  sequencedIgnition: boolean;
  boostPressureBar: number;
  onRevLimiter: boolean;
  clutchEngagement: number;
  drivetrainLashIntensity: number;
  startStopState: 'DISABLED' | 'READY' | 'AUTO_STOPPED' | 'RESTARTING';
  mildHybridAssistActive: boolean;

  // Transmission telemetry
  gearNumber: number;
  targetGearNumber: number;
  selectedMode: string;
  shiftInProgress: boolean;
  shiftProgress: number;
  transmissionRatio: number;

  // P2 PHEV telemetry (Tank 500 Hi4-T)
  p2Active: boolean;
  p2Mode: string;
  p2TerrainMode: string;
  p2State: string;
  p2EngineRequested: boolean;
  p2EnginePhase: IgnitionPhaseTelemetry;
  p2ClutchEngagement: number;
  p2ClutchSlipRPM: number;
  p2ClutchTorque: number;
  p2MotorRPM: number;
  p2MotorTorque: number;
  p2GenerationPowerW: number;
  p2TransferMode: string;

  // EHS Series-Parallel PHEV telemetry (Qin PLUS DM-i)
  ehsActive: boolean;
  ehsMode: string;
  ehsState: EhsAcousticState;
  ehsPath: 'EV' | 'SERIES' | 'PARALLEL';
  ehsEngineRequested: boolean;
  ehsEnginePhase: IgnitionPhaseTelemetry;
  ehsTargetRPM: number;
  ehsDirectClutchEngagement: number;
  ehsDirectClutchSlipRPM: number;
  ehsDirectClutchTorqueNm: number;
  ehsP1RPM: number;
  ehsP1MechanicalPowerW: number;
  ehsP1GenerationPowerW: number;
  ehsP3RPM: number;
  ehsP3Torque: number;
  ehsP3MechanicalPowerW: number;

  // Pure EV / Electric propulsion telemetry
  evActive: boolean;
  rearMotorRPM: number;
  rearMotorTorque: number;
  frontMotorRPM: number;
  frontMotorTorque: number;
  frontConnected: boolean;
  regenPowerKw: number;
  drivePowerKw: number;
  launchState: string;
  evGear: number;
  evShiftInProgress: boolean;

  // Cabin & UI feedback hooks (preserved read-only)
  cabinAcoustics: CabinAcousticState | undefined;
  hasDriverAccess: boolean;
  doorOpen: number;
  windowOpen: number;
  cruiseActive: boolean;
  lowFuel: boolean;
  parkingDistance: number | null;
}

const clamp01 = (v: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;

const parseGearNumber = (gear: number | string | null | undefined): number => {
  if (typeof gear === 'number') return Number.isFinite(gear) ? Math.abs(gear) : 0;
  if (!gear || gear === 'N' || gear === 'P') return 0;
  if (gear === 'R') return -1;
  const parsed = Number(String(gear).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const toIgnitionPhase = (value: string | undefined, running: boolean): IgnitionPhaseTelemetry => {
  if (value === 'OFF' || value === 'CRANKING' || value === 'CATCH' || value === 'RUNNING' || value === 'STOPPING') {
    return value;
  }
  return running ? 'RUNNING' : 'OFF';
};

export function createVehicleAcousticTelemetry(): VehicleAcousticTelemetry {
  return {
    vehicleSpeed: 0,
    acceleration: 0,
    roadRoughness: 0.12,
    cockpit: true,
    driveMode: 'NORMAL',
    vehicleOperational: false,
    driveAvailable: false,
    driving: false,

    hasCombustion: false,
    rpm: 0,
    throttle: 0,
    engineLoad: 0,
    engineRunning: false,
    ignitionPhase: 'OFF',
    sequencedIgnition: false,
    boostPressureBar: 0,
    onRevLimiter: false,
    clutchEngagement: 0,
    drivetrainLashIntensity: 0,
    startStopState: 'DISABLED',
    mildHybridAssistActive: false,

    gearNumber: 0,
    targetGearNumber: 0,
    selectedMode: 'P',
    shiftInProgress: false,
    shiftProgress: 0,
    transmissionRatio: 0,

    p2Active: false,
    p2Mode: 'INTELLIGENT',
    p2TerrainMode: 'OFF',
    p2State: 'EV',
    p2EngineRequested: false,
    p2EnginePhase: 'OFF',
    p2ClutchEngagement: 0,
    p2ClutchSlipRPM: 0,
    p2ClutchTorque: 0,
    p2MotorRPM: 0,
    p2MotorTorque: 0,
    p2GenerationPowerW: 0,
    p2TransferMode: 'AWD',

    ehsActive: false,
    ehsMode: 'HEV',
    ehsState: 'EV',
    ehsPath: 'EV',
    ehsEngineRequested: false,
    ehsEnginePhase: 'OFF',
    ehsTargetRPM: 0,
    ehsDirectClutchEngagement: 0,
    ehsDirectClutchSlipRPM: 0,
    ehsDirectClutchTorqueNm: 0,
    ehsP1RPM: 0,
    ehsP1MechanicalPowerW: 0,
    ehsP1GenerationPowerW: 0,
    ehsP3RPM: 0,
    ehsP3Torque: 0,
    ehsP3MechanicalPowerW: 0,

    evActive: false,
    rearMotorRPM: 0,
    rearMotorTorque: 0,
    frontMotorRPM: 0,
    frontMotorTorque: 0,
    frontConnected: false,
    regenPowerKw: 0,
    drivePowerKw: 0,
    launchState: 'INACTIVE',
    evGear: 1,
    evShiftInProgress: false,

    cabinAcoustics: undefined,
    hasDriverAccess: false,
    doorOpen: 0,
    windowOpen: 0,
    cruiseActive: false,
    lowFuel: false,
    parkingDistance: null,
  };
}

export interface AcousticFrameContext {
  readonly roadRoughness: number;
  readonly cockpit: boolean;
  readonly cabinAcoustics?: CabinAcousticState;
  readonly hasDriverAccess: boolean;
  readonly doorOpen: number;
  readonly windowOpen: number;
  readonly cruiseActive: boolean;
  readonly parkingDistance: number | null;
  readonly drivetrainLashIntensity: number;
}

/**
 * Read-only adapter that projects VehicleSnapshot + Engine into the flat
 * preallocated VehicleAcousticTelemetry struct. Never mutates vehicle physics.
 */
export function populateAcousticTelemetry(
  target: VehicleAcousticTelemetry,
  snapshot: Readonly<VehicleSnapshot | VehicleRuntimeSnapshot>,
  engine: Readonly<Engine> | undefined,
  context: Readonly<AcousticFrameContext>,
): VehicleAcousticTelemetry {
  const pt = snapshot.powertrain;
  const tx = pt.transmission;
  const hybrid = pt.hybrid;
  const ehs = pt.ehs;
  const ev = pt.ev;
  const selectedMode = tx.selectedMode ?? (tx.type === 'MANUAL' ? (snapshot.gear === 'N' ? 'N' : 'D') : 'P');

  target.vehicleSpeed = Math.abs(snapshot.speed);
  target.acceleration = Number.isFinite(snapshot.acceleration) ? snapshot.acceleration : 0;
  target.roadRoughness = clamp01(context.roadRoughness);
  target.cockpit = context.cockpit;
  target.driveMode = snapshot.driveMode ?? 'NORMAL';
  target.vehicleOperational = snapshot.vehicleOperational;
  target.driveAvailable = snapshot.driveAvailable;
  target.driving = selectedMode === 'D' || selectedMode === 'R' || (tx.type === 'MANUAL' && snapshot.gear !== 'N');

  // Combustion
  if (engine) {
    const rpm = Number.isFinite(snapshot.rpm) ? (snapshot.rpm ?? 0) : 0;
    const torqueSample = engine.lastTorqueSample ?? engine.getTorqueSample();
    const maxTorqueAtRpm = Math.max(1, engine.getTorqueAtRPM(rpm));
    const loadTorque = Math.max(
      Math.max(0, torqueSample.combustionTorque),
      Math.abs(tx.engineLoadTorque ?? 0),
    );
    target.hasCombustion = true;
    target.rpm = rpm;
    target.throttle = hybrid || ehs ? engine.throttle : clamp01(snapshot.throttle);
    target.engineLoad = clamp01(loadTorque / maxTorqueAtRpm);
    target.engineRunning = snapshot.engineRunning ?? engine.isRunning;
    target.ignitionPhase = toIgnitionPhase(engine.ignitionPhase, target.engineRunning);
    target.sequencedIgnition = (engine.config.ignitionSequence ?? engine.config.startupCharacter) !== undefined;
    target.boostPressureBar = Math.max(0, engine.boostPressureBar);
    target.onRevLimiter = snapshot.onRevLimiter ?? false;
    target.clutchEngagement = clamp01(snapshot.clutchEngagement ?? 0);
    target.drivetrainLashIntensity = clamp01(context.drivetrainLashIntensity);
    target.startStopState = pt.ice?.startStop?.state ?? 'DISABLED';
    target.mildHybridAssistActive = (pt.ice?.mildHybrid?.powerKW ?? 0) > 1.5;
  } else {
    target.hasCombustion = false;
    target.rpm = 0;
    target.throttle = clamp01(snapshot.throttle);
    target.engineLoad = 0;
    target.engineRunning = false;
    target.ignitionPhase = 'OFF';
    target.sequencedIgnition = false;
    target.boostPressureBar = 0;
    target.onRevLimiter = false;
    target.clutchEngagement = 0;
    target.drivetrainLashIntensity = 0;
    target.startStopState = 'DISABLED';
    target.mildHybridAssistActive = false;
  }

  // Transmission
  target.gearNumber = parseGearNumber(snapshot.gear ?? tx.currentPhysicalGear);
  target.targetGearNumber = parseGearNumber(snapshot.requestedGear ?? tx.dct?.preselectedGear);
  target.selectedMode = selectedMode;
  target.shiftInProgress = tx.shiftInProgress === true;
  target.shiftProgress = clamp01(tx.shiftProgress ?? 0);
  const ratioValue = tx.cvt?.ratio ?? tx.currentRatio;
  target.transmissionRatio = Number.isFinite(ratioValue) ? Math.abs(ratioValue) : 0;

  // P2 PHEV
  if (hybrid) {
    target.p2Active = true;
    target.p2Mode = hybrid.mode;
    target.p2TerrainMode = hybrid.terrainMode ?? 'OFF';
    target.p2State = hybrid.state;
    target.p2EngineRequested = hybrid.engineRequested;
    target.p2EnginePhase = toIgnitionPhase(hybrid.enginePhase, target.engineRunning);
    target.p2ClutchEngagement = clamp01(hybrid.clutchEngagement);
    target.p2ClutchSlipRPM = Number.isFinite(hybrid.clutchSlipRPM) ? hybrid.clutchSlipRPM : 0;
    target.p2ClutchTorque = Number.isFinite(hybrid.clutchTorque) ? hybrid.clutchTorque : 0;
    target.p2MotorRPM = ev ? Math.abs(ev.motorRPM) : 0;
    target.p2MotorTorque = ev ? ev.motorTorque : 0;
    target.p2GenerationPowerW = Math.max(0, hybrid.generationPowerW);
    target.p2TransferMode = hybrid.transfer.mode;
  } else {
    target.p2Active = false;
    target.p2Mode = 'INTELLIGENT';
    target.p2TerrainMode = 'OFF';
    target.p2State = 'EV';
    target.p2EngineRequested = false;
    target.p2EnginePhase = 'OFF';
    target.p2ClutchEngagement = 0;
    target.p2ClutchSlipRPM = 0;
    target.p2ClutchTorque = 0;
    target.p2MotorRPM = 0;
    target.p2MotorTorque = 0;
    target.p2GenerationPowerW = 0;
    target.p2TransferMode = 'AWD';
  }

  // EHS Series-Parallel PHEV
  if (ehs) {
    target.ehsActive = true;
    target.ehsMode = ehs.mode;
    target.ehsState = ehs.state;
    target.ehsPath = ehs.path;
    target.ehsEngineRequested = ehs.engineRequested;
    target.ehsEnginePhase = toIgnitionPhase(ehs.enginePhase, target.engineRunning);
    target.ehsTargetRPM = ehs.targetRPM;
    target.ehsDirectClutchEngagement = clamp01(ehs.directClutch.engagement);
    target.ehsDirectClutchSlipRPM = ehs.directClutch.slipRPM;
    target.ehsDirectClutchTorqueNm = ehs.directClutch.torqueNm;
    target.ehsP1RPM = Math.abs(ehs.p1RPM);
    target.ehsP1MechanicalPowerW = ehs.p1MechanicalPowerW;
    target.ehsP1GenerationPowerW = Math.max(0, ehs.p1GenerationPowerW);
    target.ehsP3RPM = Math.abs(ehs.p3RPM);
    target.ehsP3Torque = ev ? ev.motorTorque : 0;
    target.ehsP3MechanicalPowerW = ehs.p3MechanicalPowerW;
  } else {
    target.ehsActive = false;
    target.ehsMode = 'HEV';
    target.ehsState = 'EV';
    target.ehsPath = 'EV';
    target.ehsEngineRequested = false;
    target.ehsEnginePhase = 'OFF';
    target.ehsTargetRPM = 0;
    target.ehsDirectClutchEngagement = 0;
    target.ehsDirectClutchSlipRPM = 0;
    target.ehsDirectClutchTorqueNm = 0;
    target.ehsP1RPM = 0;
    target.ehsP1MechanicalPowerW = 0;
    target.ehsP1GenerationPowerW = 0;
    target.ehsP3RPM = 0;
    target.ehsP3Torque = 0;
    target.ehsP3MechanicalPowerW = 0;
  }

  // Pure EV or electric side of hybrid
  if (ev && !hybrid && !ehs) {
    target.evActive = true;
    target.rearMotorRPM = Math.abs(ev.rearMotorRPM ?? ev.motorRPM);
    target.rearMotorTorque = ev.rearMotorTorque ?? ev.motorTorque;
    target.frontMotorRPM = Math.abs(ev.frontMotorRPM ?? 0);
    target.frontMotorTorque = ev.frontMotorTorque ?? 0;
    target.frontConnected = ev.frontDriveUnit
      ? ev.frontDriveUnit.disconnectState === 'connected'
      : ev.frontMotorRPM !== undefined;
    target.regenPowerKw = Math.max(0, ev.regenPowerKw);
    target.drivePowerKw = Math.max(0, ev.drivePowerKw);
    target.launchState = ev.launchState ?? 'INACTIVE';
    target.evGear = parseGearNumber(tx.currentPhysicalGear) || 1;
    target.evShiftInProgress = tx.shiftInProgress === true;
  } else {
    target.evActive = false;
    target.rearMotorRPM = 0;
    target.rearMotorTorque = 0;
    target.frontMotorRPM = 0;
    target.frontMotorTorque = 0;
    target.frontConnected = false;
    target.regenPowerKw = ev ? Math.max(0, ev.regenPowerKw) : 0;
    target.drivePowerKw = ev ? Math.max(0, ev.drivePowerKw) : 0;
    target.launchState = 'INACTIVE';
    target.evGear = 1;
    target.evShiftInProgress = false;
  }

  // Cabin & UI feedback
  target.cabinAcoustics = context.cabinAcoustics;
  target.hasDriverAccess = context.hasDriverAccess;
  target.doorOpen = clamp01(context.doorOpen);
  target.windowOpen = clamp01(context.windowOpen);
  target.cruiseActive = context.cruiseActive;
  target.lowFuel = snapshot.fuel?.lowFuel ?? false;
  target.parkingDistance = context.parkingDistance;

  return target;
}
