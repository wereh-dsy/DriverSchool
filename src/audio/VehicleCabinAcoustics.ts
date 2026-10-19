/**
 * Continuous cabin-isolation abstraction. It is deliberately independent of
 * the Web Audio graph so the same parameters can drive gains, filters and
 * tests without an AudioContext.
 */
export interface VehicleCabinAcousticsProfile {
  /** Isolation at closed door/window, 0..1. */
  readonly closedIsolation: number;
  /** Fraction of isolation lost at a fully open window (door closed). */
  readonly windowOpenLoss: number;
  /** Fraction of isolation lost at a fully open driver door. */
  readonly doorOpenLoss: number;
  /** Exterior wind scaling at a fully open window (relative to the cabin mix). */
  readonly windowWindScale: number;
  readonly windowRoadScale: number;
  readonly windowEngineScale: number;
  readonly windowAmbienceScale: number;
  /** Additional multiplier when the door itself is fully open. */
  readonly doorWindScale: number;
  readonly doorRoadScale: number;
  readonly doorEngineScale: number;
  readonly doorAmbienceScale: number;
  /** Cabin low-pass cutoff at the closed and fully open extremes, Hz. */
  readonly closedLowpassHz: number;
  readonly openLowpassHz: number;
  /** Extra wind/road exposure from vehicle speed once open. */
  readonly speedExposure: number;
}

/**
 * Vehicle calibration profiles live with the vehicle's audio profile; this
 * module owns only the shared continuous evaluation.
 */
export interface CabinAcousticsInput {
  /** 0 = closed, 1 = fully open. */
  readonly windowPosition: number;
  /** 0 = closed, 1 = fully open. */
  readonly doorOpenAmount: number;
  readonly speedMetersPerSecond: number;
}

export interface CabinAcousticState {
  readonly windowPosition: number;
  readonly doorOpenAmount: number;
  /** Combined 0..1 exposure used by filters; the door dominates. */
  readonly openness: number;
  readonly isolation: number;
  readonly windScale: number;
  readonly roadScale: number;
  readonly engineScale: number;
  readonly ambienceScale: number;
  readonly lowpassHz: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Evaluates the continuous acoustic state. Every output changes smoothly with
 * the inputs; there is no open/closed branch or fixed step.
 */
export function evaluateCabinAcoustics(
  profile: VehicleCabinAcousticsProfile,
  input: CabinAcousticsInput,
): CabinAcousticState {
  const windowPosition = clamp01(input.windowPosition);
  const doorOpenAmount = clamp01(input.doorOpenAmount);
  const speed = clamp01(Math.abs(input.speedMetersPerSecond) / 45);
  const openness = 1 - (1 - windowPosition) * (1 - doorOpenAmount);
  const isolation = clamp01(
    profile.closedIsolation *
    (1 - profile.windowOpenLoss * windowPosition) *
    (1 - profile.doorOpenLoss * doorOpenAmount),
  );
  const speedGain = 1 + profile.speedExposure * openness * speed;
  const windScale = (1 + (profile.windowWindScale - 1) * windowPosition) *
    (1 + (profile.doorWindScale - 1) * doorOpenAmount) * speedGain;
  const roadScale = (1 + (profile.windowRoadScale - 1) * windowPosition) *
    (1 + (profile.doorRoadScale - 1) * doorOpenAmount) * (1 + profile.speedExposure * .6 * openness * speed);
  const engineScale = (1 + (profile.windowEngineScale - 1) * windowPosition) *
    (1 + (profile.doorEngineScale - 1) * doorOpenAmount);
  const ambienceScale = (1 + (profile.windowAmbienceScale - 1) * windowPosition) *
    (1 + (profile.doorAmbienceScale - 1) * doorOpenAmount);
  const lowpassHz = (profile.closedLowpassHz +
    (profile.openLowpassHz - profile.closedLowpassHz) * openness) *
    (1 + profile.speedExposure * .15 * openness * speed);
  return {
    windowPosition,
    doorOpenAmount,
    openness,
    isolation,
    windScale,
    roadScale,
    engineScale,
    ambienceScale,
    lowpassHz,
  };
}
