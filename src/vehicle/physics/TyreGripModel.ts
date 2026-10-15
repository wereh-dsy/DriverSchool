import type { TireConfig } from '../config';
import { clamp } from './math';
import type { SurfaceCurve } from '../../world/SurfaceProfile';

/** Scalar, per-contact simcade tyre curves; no controller or velocity corrections. */
export class TyreGripModel {
  private readonly budgetExponent: number;

  public constructor(private readonly config: TireConfig) {
    // A rounded box budget is more forgiving than a friction ellipse. Reuse
    // the existing combined-grip calibration; never allow independent Fx/Fy peaks.
    this.budgetExponent = clamp(1 / Math.max(0.125, config.combinedGripLateralReduction), 3, 8);
  }

  public loadFactor(load: number, referenceLoad: number): number {
    const sensitivity = clamp(this.config.loadSensitivity ?? 0, 0, 0.15);
    return clamp(Math.pow(Math.max(0.1, load / Math.max(1, referenceLoad)), -sensitivity), 0.92, 1.08);
  }

  public wetRetention(wetness: number, lateral = false): number {
    const retention = lateral ? this.config.wetLateralGripRetention : this.config.wetLongitudinalGripRetention;
    return 1 - clamp(Number.isFinite(wetness) ? wetness : 0, 0, 1) * (1 - clamp(retention ?? 1, 0, 1));
  }

  public longitudinalForce(slipRatio: number, limit: number, stiffnessFactor = 1, surface?: SurfaceCurve): number {
    const ratio = Math.abs(slipRatio) * stiffnessFactor / Math.max(0.015, this.config.peakSlipRatio * (surface?.slipRatioScale ?? 1));
    const curve = ratio <= 1 ? Math.sin(ratio * Math.PI * 0.5) : this.postPeak(ratio, surface?.longitudinalFalloff ?? .35);
    return Math.sign(slipRatio) * limit * curve;
  }

  public lateralForce(slipAngle: number, stiffness: number, limit: number, surface?: SurfaceCurve): number {
    if (limit <= 1e-6 || stiffness <= 0) return 0;
    const peakAngle = Math.max(0.01, this.config.peakSlipAngle * (surface?.slipAngleScale ?? 1));
    const t = Math.abs(slipAngle) / peakAngle;
    // Monotone Hermite segment: configured small-angle stiffness, zero slope
    // at the peak, and no overshoot. Very low-grip contacts limit that slope.
    const slope = clamp(stiffness * peakAngle / limit, 0, 3);
    // Lateral plateau is deliberately gentler than longitudinal lockup/ spin:
    // a released handbrake slide must recover without an added stability aid.
    const curve = t <= 1 ? ((slope - 2) * t + (3 - 2 * slope)) * t * t + slope * t
      : this.postPeak(t, surface?.lateralFalloff ?? .15);
    return -Math.sign(slipAngle) * limit * curve;
  }

  /** Both components use the same scale, so cornering also costs propulsion/braking grip. */
  public combinedScale(fx: number, fy: number, longitudinalLimit: number, lateralLimit: number, surface?: SurfaceCurve): number {
    const usage = this.usage(fx, fy, longitudinalLimit, lateralLimit, surface);
    const x = longitudinalLimit > 1e-6 ? Math.abs(fx) / longitudinalLimit : 0;
    const y = lateralLimit > 1e-6 ? Math.abs(fy) / lateralLimit : 0;
    // Fade the rounding width to zero for single-axis slip, retaining the
    // established full longitudinal peak on straight roads.
    const width = 0.08 * Math.min(x, y);
    if (width <= 1e-8) return 1 / Math.max(1, usage);
    const lower = 1 - width * 0.5;
    if (usage <= lower) return 1;
    // C1 soft maximum around the boundary; no force discontinuity at saturation.
    const denominator = usage >= 1 + width * 0.5 ? usage : 1 + (usage - lower) ** 2 / (2 * width);
    return 1 / denominator;
  }

  public usage(fx: number, fy: number, longitudinalLimit: number, lateralLimit: number, surface?: SurfaceCurve): number {
    const x = longitudinalLimit > 1e-6 ? Math.abs(fx) / longitudinalLimit : 0;
    const y = lateralLimit > 1e-6 ? Math.abs(fy) / lateralLimit : 0;
    const exponent = this.budgetExponent + (2 - this.budgetExponent) * clamp(surface?.combinedEllipseBlend ?? 0, 0, 1);
    return Math.pow(Math.pow(x, exponent) + Math.pow(y, exponent), 1 / exponent);
  }

  private postPeak(ratio: number, falloffScale = 0.35): number {
    return 1 - clamp(this.config.gripFalloff, 0, 1) * falloffScale *
      (1 - Math.exp(-0.5 * (ratio - 1) ** 2));
  }
}
