import type { VehicleChassisConfig, VehicleDriveMode } from '../config';
import { clamp } from '../physics/math';
import { BaseControlCalibration, type ControlCalibration } from './BaseControlCalibration';

export type ControlCalibrationOverrides = { [G in keyof ControlCalibration]?: Partial<ControlCalibration[G]> };
export type VehicleControlCalibration = ControlCalibrationOverrides & {
  modes?: Readonly<Partial<Record<VehicleDriveMode, ControlCalibrationOverrides>>>;
};

/** Immutable final guardrails. Neither modes nor learning can raise these limits.
 * They constrain requests, never clamp wheel/chassis motion. */
export const HardSafetyEnvelope = Object.freeze({ maximumABSLockSlip: .23,
  maximumDriveSlip: .38, maximumSideslip: .23, maximumYawError: .8,
  minimumPedalExponent: .65, maximumPedalExponent: 1.65,
  maximumSmoothingSeconds: .18, maximumAxleRatioRate: .65 });

const MODE_OVERRIDES: Partial<Record<VehicleDriveMode, ControlCalibrationOverrides>> = {
  ECO: { throttle: { adaptiveAuthority: .8 }, tcs: { slipMultiplier: 1.15 },
    esc: { yawErrorThreshold: .14, sideslipThreshold: .10 } },
  RANGE: { throttle: { adaptiveAuthority: .7 }, tcs: { slipMultiplier: 1.15 } },
  SPORT: { throttle: { adaptiveAuthority: .5 }, tcs: { slipMultiplier: 1.45, torqueDelay: .18 },
    esc: { yawErrorThreshold: .23, sideslipThreshold: .16 } },
  SPORT_PLUS: { throttle: { adaptiveAuthority: .4 }, tcs: { slipMultiplier: 1.55 },
    esc: { yawErrorThreshold: .26, sideslipThreshold: .18 } },
  RACE: { throttle: { adaptiveAuthority: .35 }, tcs: { slipMultiplier: 1.65 },
    esc: { yawErrorThreshold: .28, sideslipThreshold: .18 } },
  WET: { throttle: { adaptiveAuthority: .4 }, tcs: { slipMultiplier: 1.1, torqueDelay: .08 },
    esc: { yawErrorThreshold: .13, sideslipThreshold: .09 } },
};
const groups = Object.keys(BaseControlCalibration) as (keyof ControlCalibration)[];
function merge(c: ControlCalibration, layer?: ControlCalibrationOverrides): void {
  if (layer) for (const group of groups) Object.assign(c[group], layer[group]);
}
function bound(value: number, fallback: number, min: number, max: number): number {
  return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

/** Runs only on construction/mode changes, never allocates at physics cadence.
 * Existing transmission/EV/steering mode data still goes to its established owner. */
export function resolveControlCalibration(config: VehicleChassisConfig, mode?: VehicleDriveMode): ControlCalibration {
  const c = structuredClone(BaseControlCalibration) as ControlCalibration;
  const nominal = config.rearTorqueSplit / Math.max(.001, config.frontTorqueSplit + config.rearTorqueSplit);
  Object.assign(c.drivetrain, { nominalRearRatio: nominal,
    accelerationRearRatio: config.awd?.accelerationRearTorqueSplit ?? nominal,
    maximumRearRatio: config.awd?.mode === 'on-demand' ? config.awd.maximumRearTorqueSplit ?? .5 : 1,
    response: config.awd?.response ?? c.drivetrain.response });
  if (config.driverAids.tcs) {
    Object.assign(c.tcs, config.driverAids.tcs);
    c.tcs.slipMultiplier = config.driverAids.tcs.slipThresholdMultiplier;
  }
  Object.assign(c.esc, config.driverAids.esc);
  merge(c, config.controlCalibration);
  const legacyMode = mode ? config.driveModes?.[mode] : undefined;
  if (legacyMode) {
    merge(c, MODE_OVERRIDES[mode!]);
    c.throttle.pedalExponent *= legacyMode.throttleExponent;
    if (legacyMode.tcs) { Object.assign(c.tcs, legacyMode.tcs); c.tcs.slipMultiplier = legacyMode.tcs.slipThresholdMultiplier; }
    Object.assign(c.esc, legacyMode.esc);
    if (legacyMode.accelerationRearTorqueSplit !== undefined) c.drivetrain.accelerationRearRatio = legacyMode.accelerationRearTorqueSplit;
    merge(c, config.controlCalibration?.modes?.[mode!]);
  }
  // Invalid external authoring data cannot propagate NaN into a live controller.
  for (const group of groups) {
    const values = c[group] as Record<string, number>, fallback = BaseControlCalibration[group] as Record<string, number>;
    for (const key of Object.keys(values)) if (!Number.isFinite(values[key])) values[key] = fallback[key] ?? 0;
  }
  c.abs.slipMultiplier = bound(c.abs.slipMultiplier, 1.05, .8, 1.1);
  c.abs.exitSpeed = bound(c.abs.exitSpeed, 1, .5, 1.5);
  c.abs.fullSpeed = bound(c.abs.fullSpeed, 2.5, c.abs.exitSpeed + .5, 4);
  c.abs.hysteresis = bound(c.abs.hysteresis, .015, .005, .03);
  c.abs.releaseResponse = bound(c.abs.releaseResponse, 24, 16, 45);
  c.abs.recoverResponse = bound(c.abs.recoverResponse, 5, 2, 12);
  c.ebd.frontReserve = bound(c.ebd.frontReserve, .04, .02, .08);
  c.ebd.response = bound(c.ebd.response, 8, 2, 16);
  c.tcs.slipMultiplier = bound(c.tcs.slipMultiplier, 1.25, 1, 1.8);
  c.tcs.maximumTorqueReduction = bound(c.tcs.maximumTorqueReduction, .95, .8, .98);
  c.tcs.response = bound(c.tcs.response, 7, 4, 24);
  c.tcs.recoveryResponse = bound(c.tcs.recoveryResponse, 1.8, 1, 6);
  c.tcs.torqueDelay = bound(c.tcs.torqueDelay, .16, .03, .25);
  c.tcs.severeSlip = bound(c.tcs.severeSlip, .18, .08, .24);
  c.tcs.brakeFraction = bound(c.tcs.brakeFraction, .22, .08, .3);
  c.tcs.brakeResponse = bound(c.tcs.brakeResponse, 12, 5, 24);
  c.tcs.hysteresis = bound(c.tcs.hysteresis, .012, .005, .03);
  c.esc.minimumSpeed = bound(c.esc.minimumSpeed, 5, 3, 7);
  c.esc.yawErrorThreshold = bound(c.esc.yawErrorThreshold, .16, .1, .3);
  c.esc.sideslipThreshold = bound(c.esc.sideslipThreshold, .14, .065, .18);
  c.esc.maximumBrakeGripFraction = bound(c.esc.maximumBrakeGripFraction, .45, .2, .55);
  c.esc.response = bound(c.esc.response, 6, 5, 16);
  c.esc.confirmationTime = bound(c.esc.confirmationTime, .1, .04, .16);
  c.esc.interventionGain = bound(c.esc.interventionGain, .9, .6, 1.2);
  c.esc.torqueReductionGain = bound(c.esc.torqueReductionGain, .5, .2, .8);
  c.esc.maximumTorqueReduction = bound(c.esc.maximumTorqueReduction, .4, .3, .6);
  c.throttle.pedalExponent = bound(c.throttle.pedalExponent, 1, HardSafetyEnvelope.minimumPedalExponent, HardSafetyEnvelope.maximumPedalExponent);
  c.throttle.brakeExponent = bound(c.throttle.brakeExponent, 1, .85, 1.2);
  c.throttle.torqueSmoothingSeconds = bound(c.throttle.torqueSmoothingSeconds, 0, 0, HardSafetyEnvelope.maximumSmoothingSeconds);
  c.throttle.adaptiveAuthority = bound(c.throttle.adaptiveAuthority, 1, 0, 1);
  const d = c.drivetrain;
  const physicalMaximum = config.awd?.mode === 'on-demand' ? config.awd.maximumRearTorqueSplit ?? .5 : 1;
  d.maximumRearRatio = bound(d.maximumRearRatio, .5, 0, physicalMaximum);
  d.minimumRearRatio = bound(d.minimumRearRatio, 0, 0, d.maximumRearRatio);
  d.nominalRearRatio = clamp(d.nominalRearRatio, d.minimumRearRatio, d.maximumRearRatio);
  d.accelerationRearRatio = clamp(d.accelerationRearRatio, d.minimumRearRatio, d.maximumRearRatio);
  d.corneringBias = bound(d.corneringBias, .015, -.06, .06);
  d.slipGain = bound(d.slipGain, .45, .15, .8);
  d.stabilityGain = bound(d.stabilityGain, .08, .02, .15);
  d.response = bound(d.response, 3, 1, 12);
  d.rateLimit = bound(d.rateLimit, .3, .05, HardSafetyEnvelope.maximumAxleRatioRate);
  d.slipHysteresis = bound(d.slipHysteresis, .025, .01, .08);
  d.edlBrakeFraction = bound(d.edlBrakeFraction, .18, .05, .25);
  d.edlSlipDifference = bound(d.edlSlipDifference, .08, .04, .2);
  d.edlSpeedDifference = bound(d.edlSpeedDifference, .65, .3, 2);
  return c;
}
