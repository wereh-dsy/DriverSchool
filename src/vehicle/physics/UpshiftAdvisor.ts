import type { ForwardGear, Gear, ShiftRecommendationConfig } from '../config';
import { clamp, clamp01 } from './math';

export interface UpshiftAdvisorContext {
  engineRPM: number;
  throttle: number;
  speedKmh: number;
  gear: Gear;
  /** Suppresses advice while an already-requested shift is being executed. */
  shiftInProgress: boolean;
}

export interface UpshiftRecommendation {
  /** Current load-dependent everyday-driving target. */
  targetRPM: number;
  /** True only below the configured top gear and above the calibrated road speed. */
  available: boolean;
  /** Latched with hysteresis so the dashboard cue does not flicker. */
  recommended: boolean;
}

/**
 * Load-aware dashboard advice for ordinary road driving.
 *
 * This class never changes gear and never limits the engine. Redline and fuel
 * cut remain the Engine's responsibility, which keeps an economy prompt near
 * 2,000 rpm from accidentally behaving like a 2,000 rpm rev limiter.
 */
export class UpshiftAdvisor {
  private sample: UpshiftRecommendation;

  public constructor(
    public readonly config: ShiftRecommendationConfig,
    private readonly maximumForwardGear: ForwardGear = 5,
  ) {
    this.sample = {
      targetRPM: this.getTargetRPM(0, 1),
      available: false,
      recommended: false,
    };
  }

  public reset(): void {
    this.sample = {
      targetRPM: this.getTargetRPM(0, 1),
      available: false,
      recommended: false,
    };
  }

  public update(context: UpshiftAdvisorContext): UpshiftRecommendation {
    const targetRPM = this.getTargetRPM(context.throttle, context.gear);
    const minimumSpeedKmh = Math.max(0, this.finiteOr(this.config.minimumSpeedKmh, 0));
    const isForwardUpshiftGear =
      typeof context.gear === 'number' &&
      context.gear >= 1 &&
      context.gear < this.maximumForwardGear;
    const available =
      isForwardUpshiftGear &&
      !context.shiftInProgress &&
      this.finiteOr(context.speedKmh, 0) >= minimumSpeedKmh;

    let recommended = this.sample.recommended;
    if (!available) {
      recommended = false;
    } else {
      const hysteresisRPM = Math.max(0, this.finiteOr(this.config.hysteresisRPM, 0));
      const releaseRPM = targetRPM - hysteresisRPM;
      const engineRPM = Math.max(0, this.finiteOr(context.engineRPM, 0));
      recommended = recommended ? engineRPM >= releaseRPM : engineRPM >= targetRPM;
    }

    this.sample = { targetRPM, available, recommended };
    return this.getSample();
  }

  public getSample(): UpshiftRecommendation {
    return { ...this.sample };
  }

  /** Returns the calibrated 1,500--2,500-ish target before eligibility gates. */
  public getTargetRPM(throttle: number, gear: Gear): number {
    const low = Math.max(1, this.finiteOr(this.config.lightLoadRPM, 1_700));
    const high = Math.max(low, this.finiteOr(this.config.highLoadRPM, 2_500));
    const exponent = Math.max(
      0.05,
      this.finiteOr(this.config.throttleCurveExponent, 0.65),
    );
    const load = clamp01(this.finiteOr(throttle, 0)) ** exponent;
    const firstGearOffset = gear === 1
      ? Math.max(0, this.finiteOr(this.config.firstGearOffsetRPM, 0))
      : 0;
    return clamp(low + (high - low) * load + firstGearOffset, low, high);
  }

  private finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
  }
}
