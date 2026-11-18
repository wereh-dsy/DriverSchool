import type { SurfaceMaterial } from '../../world/SurfaceMaterial';
import { surfaceProfile, type SurfaceProfile } from '../../world/SurfaceProfile';
import type { WheelId } from './WheelContact';
import { clamp } from './math';

export interface SurfaceResponse extends SurfaceProfile {
  longitudinalGrip: number;
  lateralGrip: number;
  rollingResistance: number;
  depth: number;
}

const initial = (): SurfaceResponse => ({ ...surfaceProfile(), longitudinalGrip: 1,
  lateralGrip: 1, rollingResistance: 1, depth: 0 });
const keys = ['slipRatioScale', 'slipAngleScale', 'lateralStiffnessScale', 'lateralResponseTime',
  'longitudinalFalloff', 'lateralFalloff', 'combinedEllipseBlend', 'defaultDepth', 'firmness',
  'looseness', 'resistanceStrength'] as const;
type MutableResponse = { -readonly [K in keyof SurfaceResponse]: SurfaceResponse[K] };

/** Four persistent responses. A 12 ms contact filter bounds boundary changes;
 * a newly spawned contact and uninterrupted dry asphalt are exactly unchanged. */
export class SurfaceInteraction {
  private readonly responses: Record<WheelId, MutableResponse> = {
    frontLeft: initial(), frontRight: initial(), rearLeft: initial(), rearRight: initial(),
  };
  private readonly initialized = new Set<WheelId>();
  public reset(): void { this.initialized.clear(); }
  public update(id: WheelId, dt: number, material?: SurfaceMaterial): SurfaceResponse {
    const state = this.responses[id], profile = surfaceProfile(material);
    const alpha = this.initialized.has(id) ? -Math.expm1(-Math.max(0, dt) / .012) : 1;
    this.initialized.add(id);
    for (const key of keys) state[key] = blend(state[key], profile[key], alpha);
    state.longitudinalGrip = blend(state.longitudinalGrip, material?.longitudinalGrip ?? 1, alpha);
    state.lateralGrip = blend(state.lateralGrip, material?.lateralGrip ?? 1, alpha);
    state.rollingResistance = blend(state.rollingResistance, material?.rollingResistance ?? 1, alpha);
    state.roughness = material?.roughness ?? profile.roughness;
    state.wetness = material?.wetness ?? profile.wetness;
    const depth = material?.depth ?? profile.defaultDepth;
    state.depth = blend(state.depth, Number.isFinite(depth) ? clamp(depth, 0, .6) : profile.defaultDepth, alpha);
    return state;
  }
  public get(id: WheelId): SurfaceResponse { return this.responses[id]; }
}

/** Lightweight deformation/bulldozing force magnitude, N. Independent of tyre
 * shear; always applied against contact velocity, never against wheel speed.
 * Pressure only influences this extra ground work, bounded to +/-8 percent. */
export function softSurfaceResistance(surface: SurfaceResponse, load: number, speed: number,
  slip: number, pressureRatio: number, referenceLoad = 3500): number {
  if (surface.depth <= 0 || surface.resistanceStrength <= 0 || load <= 0) return 0;
  const sinkage = Math.pow(surface.depth / .1, .85) * (1 - .75 * surface.firmness) *
    clamp(Math.pow(load / Math.max(1, referenceLoad), .18), .8, 1.25) *
    clamp(1 + (pressureRatio - 1) * .16, .92, 1.08);
  const speedGain = 1 + .30 * Math.min(Math.abs(speed) / 15, 2);
  const churn = 1 + .65 * surface.looseness * clamp(Math.abs(slip), 0, 1);
  return load * Math.min(.65, surface.resistanceStrength * sinkage * speedGain * churn);
}

export function contactUsefulSlip(peakSlip: number, contact?: SurfaceMaterial, pressureStiffness = 1): number {
  const scale = surfaceProfile(contact).slipRatioScale;
  return peakSlip * scale / (scale === 1 ? 1 : Math.max(.85, pressureStiffness));
}

function blend(from: number, to: number, alpha: number): number {
  return Math.abs(from - to) < 1e-8 ? to : from + (to - from) * alpha;
}
