import type { VehicleDimensions } from '../VehicleDimensions';
import type { EngineConfig, VehicleChassisConfig, VehiclePhysicsConfig } from '../config';
import { isElectricConfig } from '../config/ElectricVehiclePhysicsConfig';
import { isEhsHybridConfig } from '../config/EhsHybridConfig';
import { isP2HybridConfig } from '../config/P2HybridConfig';
import type { VehicleRuntimeSnapshot } from '../physics/VehicleDynamics';
import {
  clampADAS,
  type ADASPowertrainKind,
  type ADASVehicleDynamicsProfile,
  type ADASVehicleState,
} from './ADASTypes';

function hasIceEngineConfig(config: VehicleChassisConfig): config is VehiclePhysicsConfig {
  return 'engine' in config && (config as Partial<VehiclePhysicsConfig>).engine !== undefined;
}

function estimateIceRatedPowerW(eng: EngineConfig): number {
  if (Number.isFinite(eng.ratedNetPowerW) && eng.ratedNetPowerW! > 1000) {
    return eng.ratedNetPowerW!;
  }
  let maxPowerW = 80000;
  const curve = eng.torqueCurve;
  for (let i = 0; i < curve.length; i++) {
    const pt = curve[i]!;
    const pW = pt.torque * ((pt.rpm * Math.PI) / 30);
    if (pW > maxPowerW) maxPowerW = pW;
  }
  return maxPowerW;
}

export function createDefaultDynamicsProfile(): ADASVehicleDynamicsProfile {
  return {
    massKg: 1700,
    powertrainKind: 'ice',
    ratedPowerW: 165000,
    peakAccelMps2: 5.5,
    throttleResponseRate: 6.0,
    throttleExponent: 1.0,
    hasSteppedGearbox: true,
    creepEnabled: true,
    maxRegenDecelMps2: 0.35,
    understeerGradient: 0.00045,
    frontOverhangM: 0.95,
    rearOverhangM: 0.95,
    minTurningRadiusM: 5.6,
  };
}

/**
 * Extracts vehicle-agnostic physical, powertrain, and geometry capabilities into `out`
 * from installed physics config and live snapshot. Zero runtime heap allocations once initialized.
 */
export function resolveADASVehicleDynamicsProfile(
  config: VehicleChassisConfig,
  dims: VehicleDimensions,
  snap: Readonly<VehicleRuntimeSnapshot>,
  out: ADASVehicleDynamicsProfile,
): ADASVehicleDynamicsProfile {
  const massKg = Math.max(850, snap.effectiveVehicleMass || snap.baseVehicleMass || config.mass || 1700);
  out.massKg = massKg;

  let kind: ADASPowertrainKind = 'ice';
  let ratedPowerW = 140000;
  let throttleResponseRate = 6.0;
  let throttleExponent = 1.0;
  let hasSteppedGearbox = true;
  let creepEnabled = true;
  let maxRegenDecelMps2 = 0.32;

  const isEv = isElectricConfig(config);
  const isEhs = isEhsHybridConfig(config);
  const isP2 = isP2HybridConfig(config);

  if (isEv) {
    kind = 'ev';
    const units = config.driveUnits;
    let sumMotorW = 0;
    let maxRate = config.motor.driveResponseRate || 12;
    if (units && units.length > 0) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i]!;
        sumMotorW += Math.min(u.motor.maxDrivePower, u.inverter.maxPower * u.motor.motoringEfficiency);
        if (u.motor.driveResponseRate > maxRate) maxRate = u.motor.driveResponseRate;
      }
      hasSteppedGearbox = units.some((u) => 'type' in u.transmission && u.transmission.type === 'TWO_SPEED');
    } else {
      sumMotorW = config.motor.maxDrivePower;
      hasSteppedGearbox = 'type' in config.fixedReduction && config.fixedReduction.type === 'TWO_SPEED';
    }
    const batCapW = config.battery.maxDischargePower * (config.battery.dischargeEfficiency ?? 0.98);
    ratedPowerW = Math.min(batCapW, config.normalSystemPower ?? sumMotorW, sumMotorW || config.motor.maxDrivePower);
    throttleResponseRate = maxRate;
    creepEnabled = config.fixedReduction.creepEnabled;
    maxRegenDecelMps2 = clampADAS(config.regen.maximumLiftOffDeceleration * Math.max(0.25, config.regen.strength), 0.3, 2.4);
  } else if (isEhs) {
    kind = 'ehs';
    const ehs = config.ehs;
    const p3PowerW = ehs.p3.maxDrivePower;
    const iceW = hasIceEngineConfig(config) ? estimateIceRatedPowerW(config.engine) : 74000;
    ratedPowerW = Math.min(ehs.battery.maxDischargePower * 0.96 + iceW * 0.65, p3PowerW + iceW * 0.65);
    throttleResponseRate = ehs.p3.driveResponseRate || 10;
    hasSteppedGearbox = false;
    creepEnabled = true;
    maxRegenDecelMps2 = 0.95;
  } else if (isP2) {
    kind = 'hybrid';
    const h = config.hybrid;
    const iceW = hasIceEngineConfig(config) ? estimateIceRatedPowerW(config.engine) : 180000;
    ratedPowerW = h.systemPower || (iceW + h.motor.maxDrivePower);
    throttleResponseRate = Math.max(
      hasIceEngineConfig(config) ? (config.engine.throttleResponseRate ?? 5.5) : 5.5,
      h.motor.driveResponseRate * 0.7,
    );
    hasSteppedGearbox = true;
    creepEnabled = true;
    maxRegenDecelMps2 = 0.75;
  } else if (hasIceEngineConfig(config)) {
    kind = 'ice';
    ratedPowerW = estimateIceRatedPowerW(config.engine);
    throttleResponseRate = config.engine.throttleResponseRate ?? config.engine.throttleResponse ?? 5.5;
    throttleExponent = config.engine.partThrottleExponent ?? 1.0;
    const tType = snap.transmission.type;
    hasSteppedGearbox = tType === 'TORQUE_CONVERTER_AT' || tType === 'LST' || tType === 'DCT' || tType === 'MANUAL';
    creepEnabled = tType === 'TORQUE_CONVERTER_AT' || tType === 'LST' || tType === 'DCT' || tType === 'CVT';
    const eb = config.engine.engineBrakingStrength ?? 45;
    maxRegenDecelMps2 = clampADAS((eb / massKg) * 8.0, 0.25, 0.75);
  }

  // Respect current selected driving mode calibration (ECO / NORMAL / SPORT / SNOW)
  const dmKey = snap.driveMode;
  const dmCal = dmKey && config.driveModes ? config.driveModes[dmKey] : undefined;
  if (dmCal) {
    if (Number.isFinite(dmCal.throttleResponse)) throttleResponseRate = dmCal.throttleResponse!;
    if (Number.isFinite(dmCal.throttleExponent)) throttleExponent = dmCal.throttleExponent!;
    if (dmCal.ev && isEv) {
      ratedPowerW *= clampADAS(dmCal.ev.powerFraction, 0.55, 1.05);
      maxRegenDecelMps2 *= clampADAS(dmCal.ev.liftOffMultiplier, 0.4, 1.3);
    }
  }

  out.powertrainKind = kind;
  out.ratedPowerW = clampADAS(ratedPowerW, 45000, 1400000);
  // Traction-bounded low/mid-speed peak accel capability (m/s^2)
  const tireGrip = clampADAS(config.tires.longitudinalGrip ?? config.tires.gripCoefficient ?? 1.0, 0.65, 1.35);
  const powerAccelCap = out.ratedPowerW / (massKg * 11.5);
  out.peakAccelMps2 = clampADAS(Math.min(tireGrip * 9.2, Math.max(2.6, powerAccelCap * 1.15)), 2.5, 9.6);
  out.throttleResponseRate = clampADAS(throttleResponseRate, 2.0, 22.0);
  out.throttleExponent = clampADAS(throttleExponent, 0.55, 1.75);
  out.hasSteppedGearbox = hasSteppedGearbox;
  out.creepEnabled = creepEnabled;
  out.maxRegenDecelMps2 = maxRegenDecelMps2;

  // Bicycle understeer gradient approximation from axle weight bias & cornering stiffness
  const biasF = clampADAS(config.frontWeightBias ?? 0.52, 0.35, 0.72);
  const cF = Math.max(35000, config.tires.corneringStiffnessFront ?? 80000);
  const cR = Math.max(35000, config.tires.corneringStiffnessRear ?? 85000);
  const wf = massKg * biasF * 0.5;
  const wr = massKg * (1 - biasF) * 0.5;
  out.understeerGradient = clampADAS((wf / cF - wr / cR) * 0.045 + 0.00035, 0.00018, 0.00095);

  const overhangTotal = Math.max(0.4, dims.length - config.wheelBase);
  out.frontOverhangM = overhangTotal * 0.5;
  out.rearOverhangM = overhangTotal * 0.5;
  const maxRoadAng = Math.max(0.2, config.steering.maxRoadWheelAngle);
  out.minTurningRadiusM = clampADAS(config.wheelBase / Math.tan(maxRoadAng) + dims.width * 0.5, 4.2, 8.5);
  return out;
}

/**
 * Updates live per-step powertrain/transmission/dynamics telemetry on ADASVehicleState. Zero allocations.
 */
export function syncADASLiveVehicleTelemetry(
  av: ADASVehicleState,
  config: VehicleChassisConfig,
  dims: VehicleDimensions,
  snap: Readonly<VehicleRuntimeSnapshot>,
  roadGripMultiplier?: number,
): void {
  if (!av.dynamicsProfile) {
    av.dynamicsProfile = createDefaultDynamicsProfile();
  }
  resolveADASVehicleDynamicsProfile(config, dims, snap, av.dynamicsProfile);

  av.transmissionType = snap.transmission.type;
  av.driveSelector = snap.transmission.selectedMode;
  av.currentGear = snap.gear ?? snap.transmission.currentPhysicalGear;
  av.currentGearRatio = snap.transmission.currentRatio;
  av.shiftInProgress = snap.transmission.shiftInProgress;
  av.kickdownActive = snap.transmission.kickdown;
  av.driveMode = snap.driveMode;
  av.roadGripMultiplier = roadGripMultiplier;

  if (snap.powertrain.ehs) {
    av.hybridPath = snap.powertrain.ehs.path;
    av.hybridEngineRunning = Boolean(snap.engineRunning);
  } else if (snap.powertrain.hybrid) {
    av.hybridPath = snap.powertrain.hybrid.state === 'EV' ? 'EV' : 'PARALLEL';
    av.hybridEngineRunning = Boolean(snap.engineRunning);
  } else {
    av.hybridPath = null;
    av.hybridEngineRunning = Boolean(snap.engineRunning);
  }
}
