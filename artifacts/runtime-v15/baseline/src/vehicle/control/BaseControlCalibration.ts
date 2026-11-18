/** Shared fallback. These are game calibrations, not claimed OEM ECU data. */
export const BaseControlCalibration = Object.freeze({
  abs: Object.freeze({ exitSpeed: 1, fullSpeed: 2.5, slipMultiplier: 1.05,
    hysteresis: .015, releaseResponse: 24, recoverResponse: 5 }),
  ebd: Object.freeze({ frontReserve: .04, response: 8 }),
  tcs: Object.freeze({ slipMultiplier: 1.25, brakeFraction: .22, brakeResponse: 12,
    torqueDelay: .16, severeSlip: .18, hysteresis: .012,
    maximumTorqueReduction: .95, response: 7, recoveryResponse: 1.8 }),
  esc: Object.freeze({ minimumSpeed: 5, yawErrorThreshold: .16, sideslipThreshold: .14,
    maximumBrakeGripFraction: .45, response: 6, confirmationTime: .1,
    interventionGain: .9, torqueReductionGain: .5, maximumTorqueReduction: .4 }),
  throttle: Object.freeze({ pedalExponent: 1, brakeExponent: 1, torqueSmoothingSeconds: 0, adaptiveAuthority: 1 }),
  drivetrain: Object.freeze({ nominalRearRatio: .5, accelerationRearRatio: .5,
    minimumRearRatio: 0, maximumRearRatio: 1, corneringBias: .015, slipGain: .45,
    stabilityGain: .08, response: 3, rateLimit: .3, slipHysteresis: .025,
    edlBrakeFraction: .18, edlSlipDifference: .08, edlSpeedDifference: .65 }),
  adaptive: Object.freeze({ blendSeconds: 1.5, learningSeconds: 180, confidenceSeconds: 600,
    maximumPedalOffset: .12, maximumTorqueSmoothingSeconds: .08 }),
});

/** Numeric composition contract shared by all controllers. */
export type ControlCalibration = {
  -readonly [Group in keyof typeof BaseControlCalibration]: {
    -readonly [Parameter in keyof typeof BaseControlCalibration[Group]]: number;
  };
};
