import * as THREE from 'three';

/** Surface identity is metadata; forces always use the continuous response values. */
export type SurfaceType = 'asphalt' | 'concrete' | 'compact-shoulder' | 'grass' | 'curb';

export interface SurfaceMaterial {
  readonly surfaceType: SurfaceType;
  /** Relative tyre-force capacity; asphalt is the 1.0 baseline. */
  readonly longitudinalGrip: number;
  readonly lateralGrip: number;
  /** Multiplies the vehicle's rolling-resistance coefficient, not its velocity. */
  readonly rollingResistance: number;
  /** Normalized road texture, reserved for contact feedback rather than velocity noise. */
  readonly roughness: number;
}

export interface RoadSurfaceSample extends SurfaceMaterial {
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
});

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

/** Only the dominant label switches; all physical values interpolate continuously. */
export function blendSurfaceMaterials(
  from: SurfaceMaterial,
  to: SurfaceMaterial,
  blend: number,
): SurfaceMaterial {
  const t = THREE.MathUtils.clamp(blend, 0, 1);
  return {
    surfaceType: t < 0.5 ? from.surfaceType : to.surfaceType,
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
