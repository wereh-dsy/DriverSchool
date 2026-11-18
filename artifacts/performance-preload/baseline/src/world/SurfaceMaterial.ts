import * as THREE from 'three';
import { SURFACE_PROFILES, surfaceProfile, type SurfaceProfile } from './SurfaceProfile';

/** Surface identity is metadata; forces always use the continuous response values. */
export type SurfaceType = 'asphalt' | 'concrete' | 'compact-shoulder' | 'grass' | 'curb'
  | 'compact-gravel' | 'loose-gravel' | 'dirt' | 'damp-dirt'
  | 'wet-asphalt' | 'packed-snow' | 'fresh-snow' | 'ice' | 'gravel' | 'sand' | 'mud';

export interface SurfaceMaterial {
  /** Optional authored override; otherwise use the shared profile for this type. */
  readonly profile?: SurfaceProfile;
  readonly depth?: number;
  readonly wetness?: number;
  readonly surfaceType: SurfaceType;
  /** Relative tyre-force capacity; asphalt is the 1.0 baseline. */
  readonly longitudinalGrip: number;
  readonly lateralGrip: number;
  /** Multiplies the vehicle's rolling-resistance coefficient, not its velocity. */
  readonly rollingResistance: number;
  /** Normalized road texture, reserved for contact feedback rather than velocity noise. */
  readonly roughness: number;
}

/** Stable authored identity, allocated once by the map, borrowed by contacts. */
export interface SurfaceReference {
  readonly surfaceId: string;
  readonly roadId?: string;
  readonly segmentId?: string;
  readonly kind?: 'road' | 'junction' | 'terrain';
  readonly segmentIndex?: number;
  /** Authored one-hop relations, prepared once by the map; never graph-searched. */
  readonly connectedRoadIds?: ReadonlySet<string>;
  readonly structureKind?: string;
}

export type SupportLayerClass = 'SAME_LAYER' | 'POSSIBLE_LAYER_SWITCH' | 'GRADE_SEPARATED';
export interface SupportCandidateDecision {
  eligible: boolean;
  reason?: string;
  layerClass: SupportLayerClass;
  predictedError: number;
  continuityRank: number;
  topologyRank: number;
  normalDot: number;
}

/** Per-wheel support hint. Maps revalidate footprint on every query. */
export interface SurfaceSupportHint {
  reference?: SurfaceReference;
  height: number;
  normal: { x: number; y: number; z: number };
  heightTolerance: number;
  withinTick: boolean;
  previousReachable: boolean;
  transientSurface?: string;
  /** Called inside the existing footprint query, before any score comparison. */
  evaluateCandidate?: (height: number, nx: number, ny: number, nz: number,
    reference: SurfaceReference | undefined) => SupportCandidateDecision;
}

export interface SurfaceCandidateDebug {
  readonly x: number; readonly z: number; readonly referenceHeight: number;
  readonly chosen: string | null;
  readonly candidates: readonly { readonly id: string; readonly roadId?: string; readonly segmentIndex?: number; readonly segmentId?: string;
    readonly height: number; readonly normal: { readonly x: number; readonly y: number; readonly z: number };
    readonly distance: number; readonly score: number; readonly accepted: boolean; readonly reason?: string }[];
}

export interface RoadSurfaceSample extends SurfaceMaterial {
  readonly reference?: SurfaceReference;
  readonly referenceHeight?: number;
  readonly height: number;
  /** dh/dx and dh/dz (rise divided by horizontal run). */
  readonly gradient: THREE.Vector2;
  readonly normal: THREE.Vector3;
  /** Signed grade in the requested horizontal travel direction. */
  readonly grade: number;
  /** Compatibility alias for the existing V0 tyre model. */
  readonly gripMultiplier: number;
  /** Compatibility alias for rollingResistance. */
  readonly rollingResistanceMultiplier: number;
}

/** Shared defaults for every map. No surface performs direct speed correction. */
export const SURFACE_MATERIALS: Readonly<Record<SurfaceType, SurfaceMaterial>> = Object.freeze({
  'wet-asphalt': profiledMaterial('wet-asphalt'),
  'packed-snow': profiledMaterial('packed-snow'),
  'fresh-snow': profiledMaterial('fresh-snow'),
  ice: profiledMaterial('ice'), gravel: profiledMaterial('gravel'),
  sand: profiledMaterial('sand'), mud: profiledMaterial('mud'),
  asphalt: Object.freeze({
    surfaceType: 'asphalt', longitudinalGrip: 1, lateralGrip: 1,
    rollingResistance: 1, roughness: 0.025,
  }),
  concrete: Object.freeze({
    surfaceType: 'concrete', longitudinalGrip: 0.97, lateralGrip: 0.98,
    rollingResistance: 1.03, roughness: 0.035,
  }),
  'compact-shoulder': Object.freeze({
    surfaceType: 'compact-shoulder', longitudinalGrip: 0.78, lateralGrip: 0.78,
    rollingResistance: 1.7, roughness: 0.13,
  }),
  grass: Object.freeze({
    surfaceType: 'grass', longitudinalGrip: 0.55, lateralGrip: 0.55,
    rollingResistance: 3, roughness: 0.24,
  }),
  curb: Object.freeze({
    surfaceType: 'curb', longitudinalGrip: 0.91, lateralGrip: 0.9,
    rollingResistance: 1.22, roughness: 0.2,
  }),
  'compact-gravel': Object.freeze({
    surfaceType: 'compact-gravel', longitudinalGrip: 0.83, lateralGrip: 0.79,
    rollingResistance: 1.35, roughness: 0.13,
  }),
  'loose-gravel': Object.freeze({
    surfaceType: 'loose-gravel', longitudinalGrip: 0.71, lateralGrip: 0.66,
    rollingResistance: 1.8, roughness: 0.22,
  }),
  dirt: Object.freeze({
    surfaceType: 'dirt', longitudinalGrip: 0.75, lateralGrip: 0.70,
    rollingResistance: 1.65, roughness: 0.19,
  }),
  'damp-dirt': Object.freeze({
    surfaceType: 'damp-dirt', longitudinalGrip: 0.64, lateralGrip: 0.60,
    rollingResistance: 2.15, roughness: 0.24,
  }),
});

/** Profile constants remain the single calibration source for V1 surfaces. */
function profiledMaterial(surfaceType: SurfaceType): SurfaceMaterial {
  const profile = SURFACE_PROFILES[surfaceType]!;
  return Object.freeze({ surfaceType, profile, longitudinalGrip: profile.longitudinalGrip,
    lateralGrip: profile.lateralGrip, rollingResistance: profile.rollingResistance,
    roughness: profile.roughness, wetness: profile.wetness });
}

/** The existing map contract is the Surface Interaction sample boundary. */
export type SurfaceSample = RoadSurfaceSample;

/** Preserve an authored map calibration while giving it the shared material contract. */
export function calibratedSurfaceMaterial(
  surfaceType: SurfaceType,
  grip: number,
  rollingResistance: number,
): SurfaceMaterial {
  return {
    ...SURFACE_MATERIALS[surfaceType],
    longitudinalGrip: grip,
    lateralGrip: grip,
    rollingResistance,
  };
}

/** Capacities interpolate here; the contact filter handles curve-profile changes. */
export function blendSurfaceMaterials(
  from: SurfaceMaterial,
  to: SurfaceMaterial,
  blend: number,
): SurfaceMaterial {
  const t = THREE.MathUtils.clamp(blend, 0, 1);
  return {
    surfaceType: t < 0.5 ? from.surfaceType : to.surfaceType,
    profile: t < .5 ? from.profile : to.profile,
    depth: THREE.MathUtils.lerp(from.depth ?? surfaceProfile(from).defaultDepth, to.depth ?? surfaceProfile(to).defaultDepth, t),
    wetness: THREE.MathUtils.lerp(from.wetness ?? 0, to.wetness ?? 0, t),
    longitudinalGrip: THREE.MathUtils.lerp(from.longitudinalGrip, to.longitudinalGrip, t),
    lateralGrip: THREE.MathUtils.lerp(from.lateralGrip, to.lateralGrip, t),
    rollingResistance: THREE.MathUtils.lerp(from.rollingResistance, to.rollingResistance, t),
    roughness: THREE.MathUtils.lerp(from.roughness, to.roughness, t),
  };
}

export function surfaceResponseAliases(material: SurfaceMaterial): SurfaceMaterial & Pick<
  RoadSurfaceSample, 'gripMultiplier' | 'rollingResistanceMultiplier'
> {
  return {
    ...material,
    gripMultiplier: material.lateralGrip,
    rollingResistanceMultiplier: material.rollingResistance,
  };
}

/** The normal depends only on the height field, never on the queried driving direction. */
export function sampleGroundGeometry(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  direction: THREE.Vector2Like = { x: 0, y: -1 },
  epsilon = 0.16,
): Pick<RoadSurfaceSample, 'height' | 'gradient' | 'normal' | 'grade'> {
  const slopeX = (heightAt(x + epsilon, z) - heightAt(x - epsilon, z)) / (2 * epsilon);
  const slopeZ = (heightAt(x, z + epsilon) - heightAt(x, z - epsilon)) / (2 * epsilon);
  const directionLength = Math.hypot(direction.x, direction.y);
  const directionX = directionLength > 1e-7 ? direction.x / directionLength : 0;
  const directionZ = directionLength > 1e-7 ? direction.y / directionLength : -1;
  return {
    height: heightAt(x, z),
    gradient: new THREE.Vector2(slopeX, slopeZ),
    normal: new THREE.Vector3(-slopeX, 1, -slopeZ).normalize(),
    grade: slopeX * directionX + slopeZ * directionZ,
  };
}
