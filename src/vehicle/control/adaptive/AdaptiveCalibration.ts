import type { DriverProfile } from './DriverProfile';
import { BaseControlCalibration } from '../BaseControlCalibration';
import { clamp } from '../../physics/math';

/** Soft layer only: endpoints remain 0/1; no safety or tyre parameters. */
export class AdaptiveCalibration {
  public throttleExponent = 1;
  public brakeExponent = 1;
  public torqueSmoothingSeconds = 0;
  public update(dt: number, enabled: boolean, profile: DriverProfile): void {
    const tune = BaseControlCalibration.adaptive;
    const alpha = -Math.expm1(-3 * Math.max(0, dt) / tune.blendSeconds);
    const confidence = enabled ? profile.confidence : 0;
    const preference = (profile.throttleAggressiveness + profile.accelerationPreference) * .5;
    const throttle = 1 + (.5 - preference) * 2 * tune.maximumPedalOffset * confidence;
    const brake = 1 + (.5 - profile.brakeAggressiveness) * 2 * tune.maximumPedalOffset * confidence;
    const smoothing = clamp((profile.drivingSmoothness - .5) * 2, 0, 1) * confidence * tune.maximumTorqueSmoothingSeconds;
    this.throttleExponent += (throttle - this.throttleExponent) * alpha;
    this.brakeExponent += (brake - this.brakeExponent) * alpha;
    this.torqueSmoothingSeconds += (smoothing - this.torqueSmoothingSeconds) * alpha;
  }
}
