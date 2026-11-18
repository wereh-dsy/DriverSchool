import type { SurfaceMaterial, SurfaceType } from './SurfaceMaterial';

/** Dimensionless curve calibration; slip angle remains radians, depth metres. */
export interface SurfaceCurve {
  readonly slipRatioScale: number;
  readonly slipAngleScale: number;
  readonly lateralStiffnessScale: number;
  readonly lateralResponseTime: number;
  readonly longitudinalFalloff: number;
  readonly lateralFalloff: number;
  /** Zero retains the installed tyre budget; one uses a friction ellipse. */
  readonly combinedEllipseBlend: number;
}

export interface SurfaceProfile extends SurfaceCurve {
  readonly longitudinalGrip: number;
  readonly lateralGrip: number;
  readonly rollingResistance: number;
  readonly roughness: number;
  readonly wetness: number;
  readonly defaultDepth: number;
  readonly firmness: number;
  readonly looseness: number;
  /** Additional deformation resistance / normal load at 0.1 m depth. */
  readonly resistanceStrength: number;
}

const paved: SurfaceProfile = Object.freeze({
  longitudinalGrip: 1, lateralGrip: 1, rollingResistance: 1, roughness: .025, wetness: 0,
  slipRatioScale: 1, slipAngleScale: 1, lateralStiffnessScale: 1,
  lateralResponseTime: 0, longitudinalFalloff: .35, lateralFalloff: .15,
  combinedEllipseBlend: 0, defaultDepth: 0, firmness: 1, looseness: 0, resistanceStrength: 0,
});
const profile = (values: Partial<SurfaceProfile>): SurfaceProfile => Object.freeze({ ...paved, ...values });

/** Legacy paved/calibrated maps retain the installed tyre curve by default. */
export const SURFACE_PROFILES: Readonly<Partial<Record<SurfaceType, SurfaceProfile>>> = Object.freeze({
  asphalt: paved,
  'wet-asphalt': profile({ longitudinalGrip: .64, lateralGrip: .60, rollingResistance: 1.05, wetness: .65, slipRatioScale: .88, slipAngleScale: .85, lateralStiffnessScale: .85,
    longitudinalFalloff: .50, lateralFalloff: .30, combinedEllipseBlend: 1 }),
  grass: profile({ longitudinalGrip: .55, lateralGrip: .55, rollingResistance: 3, roughness: .24, slipRatioScale: 1.4, slipAngleScale: 1.35, lateralStiffnessScale: .65,
    lateralResponseTime: .045, combinedEllipseBlend: 1 }),
  gravel: profile({ longitudinalGrip: .63, lateralGrip: .57, rollingResistance: 2.3, roughness: .24, slipRatioScale: 1.8, slipAngleScale: 1.6, lateralStiffnessScale: .58,
    lateralResponseTime: .055, longitudinalFalloff: .22, lateralFalloff: .22,
    combinedEllipseBlend: 1, defaultDepth: .025, firmness: .65, looseness: .65, resistanceStrength: .055 }),
  'packed-snow': profile({ longitudinalGrip: .34, lateralGrip: .30, rollingResistance: 1.8, roughness: .10, slipRatioScale: 1.9, slipAngleScale: 1.7, lateralStiffnessScale: .48,
    lateralResponseTime: .065, longitudinalFalloff: .22, lateralFalloff: .22, combinedEllipseBlend: 1 }),
  'fresh-snow': profile({ longitudinalGrip: .30, lateralGrip: .26, rollingResistance: 2.4, roughness: .16, slipRatioScale: 2.1, slipAngleScale: 1.9, lateralStiffnessScale: .40,
    lateralResponseTime: .075, longitudinalFalloff: .22, lateralFalloff: .25,
    combinedEllipseBlend: 1, defaultDepth: .12, firmness: .38, looseness: .75, resistanceStrength: .09 }),
  ice: profile({ longitudinalGrip: .085, lateralGrip: .065, rollingResistance: .85, roughness: .01, slipRatioScale: .65, slipAngleScale: .65, lateralStiffnessScale: .30,
    lateralResponseTime: .025, longitudinalFalloff: .65, lateralFalloff: .45, combinedEllipseBlend: 1 }),
  sand: profile({ longitudinalGrip: .48, lateralGrip: .40, rollingResistance: 2.8, roughness: .20, slipRatioScale: 2.3, slipAngleScale: 2, lateralStiffnessScale: .36,
    lateralResponseTime: .085, longitudinalFalloff: .28, lateralFalloff: .25,
    combinedEllipseBlend: 1, defaultDepth: .12, firmness: .22, looseness: .95, resistanceStrength: .18 }),
  mud: profile({ longitudinalGrip: .27, lateralGrip: .23, rollingResistance: 2.5, roughness: .22, wetness: .8, slipRatioScale: 2.6, slipAngleScale: 2.1, lateralStiffnessScale: .32,
    lateralResponseTime: .08, longitudinalFalloff: .80, lateralFalloff: .40,
    combinedEllipseBlend: 1, defaultDepth: .10, firmness: .30, looseness: .85, resistanceStrength: .12 }),
});

export function surfaceProfile(surface?: Pick<SurfaceMaterial, 'surfaceType' | 'profile'>): SurfaceProfile {
  return surface?.profile ?? (surface && SURFACE_PROFILES[surface.surfaceType]) ?? paved;
}
