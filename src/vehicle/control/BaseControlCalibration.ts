/** Shared conservative ECU baseline. Adaptive calibration cannot write these limits.
 * Vehicle/mode layers can be composed here later; none are installed in this phase. */
export const BaseControlCalibration = Object.freeze({
  abs: Object.freeze({ exitSpeed: 1, fullSpeed: 2.5, slipMultiplier: 1.05,
    hysteresis: .015, releaseResponse: 24, recoverResponse: 5 }),
  ebd: Object.freeze({ frontReserve: .04, response: 8 }),
  tcs: Object.freeze({ slipMultiplier: 1.25, brakeFraction: .22, brakeResponse: 12,
    torqueDelay: .16, severeSlip: .18, hysteresis: .012 }),
  esc: Object.freeze({ minimumSpeed: 5, yawErrorThreshold: .16, sideslipThreshold: .14,
    maximumBrakeGripFraction: .45, response: 6, confirmationTime: .1 }),
  adaptive: Object.freeze({ blendSeconds: 1.5, learningSeconds: 180, confidenceSeconds: 600,
    maximumPedalOffset: .12, maximumTorqueSmoothingSeconds: .08 }),
});

/** Numeric composition contract for future vehicle/mode layers. Runtime currently
 * installs only the shared baseline plus the separate adaptive soft layer. */
export type ControlCalibration = {
  readonly [Group in keyof typeof BaseControlCalibration]: {
    readonly [Parameter in keyof typeof BaseControlCalibration[Group]]: number;
  };
};
