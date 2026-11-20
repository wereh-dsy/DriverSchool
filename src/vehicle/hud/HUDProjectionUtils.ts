import { Vector3, type PerspectiveCamera } from 'three';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { ADASEnvironmentTheme, ADASRibbonTone } from '../adas/visualization/ADASVisualizationTypes';

export interface ProjectedScreenPoint {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
}

const tmpProjVec = new Vector3();

/** Project a world-space XYZ point into CSS pixel screen coordinates. */
export function projectWorldPointToScreen(
  wx: number,
  wy: number,
  wz: number,
  camera: PerspectiveCamera | null,
  viewportW: number,
  viewportH: number,
  out?: { visible: boolean; x: number; y: number },
): ProjectedScreenPoint {
  const target = out ?? { visible: false, x: 0, y: 0 };
  if (!camera || viewportW <= 0 || viewportH <= 0) {
    target.visible = false;
    return target;
  }
  tmpProjVec.set(wx, wy, wz);
  tmpProjVec.project(camera);
  if (tmpProjVec.z < -1 || tmpProjVec.z > 1) {
    target.visible = false;
    return target;
  }
  const sx = (tmpProjVec.x * 0.5 + 0.5) * viewportW;
  const sy = (-tmpProjVec.y * 0.5 + 0.5) * viewportH;
  if (sx < -48 || sx > viewportW + 48 || sy < -32 || sy > viewportH + 40) {
    target.visible = false;
    return target;
  }
  target.visible = true;
  target.x = sx;
  target.y = sy;
  return target;
}

/** Check line-of-sight occlusion against opaque nearby colliders (Ray-AABB slab test). */
export function isTargetOccludedByCollider(
  camera: PerspectiveCamera | null,
  tx: number,
  ty: number,
  tz: number,
  targetId: string,
  colliders?: readonly StaticCollider[],
): boolean {
  if (!camera || !colliders || colliders.length === 0) return false;
  const ox = camera.position.x;
  const oy = camera.position.y;
  const oz = camera.position.z;
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq < 1e-4) return false;
  const maxDist = Math.sqrt(distSq);
  const invDy = Math.abs(dy) > 1e-6 ? 1 / dy : 1e6;

  for (let i = 0; i < colliders.length; i++) {
    const col = colliders[i]!;
    if (col.id === targetId || col.maxHeight < 0.7) continue;
    const sinY = Math.sin(col.yaw);
    const cosY = Math.cos(col.yaw);
    const relOx = ox - col.center.x;
    const relOz = oz - col.center.z;
    // Transform ray origin & direction into collider's local OBB frame
    const lox = relOx * cosY - relOz * sinY;
    const loz = relOx * sinY + relOz * cosY;
    const ldx = dx * cosY - dz * sinY;
    const ldz = dx * sinY + dz * cosY;
    const invLx = Math.abs(ldx) > 1e-6 ? 1 / ldx : 1e6;
    const invLz = Math.abs(ldz) > 1e-6 ? 1 / ldz : 1e6;

    const minY = col.minHeight;
    const maxY = col.maxHeight;
    let tmin = 0.02;
    let tmax = Math.min(1.0, (maxDist - 0.6) / maxDist);
    if (tmax <= tmin) continue;

    const tx1 = (-col.halfWidth - lox) * invLx;
    const tx2 = (col.halfWidth - lox) * invLx;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));

    const ty1 = (minY - oy) * invDy;
    const ty2 = (maxY - oy) * invDy;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));

    const tz1 = (-col.halfLength - loz) * invLz;
    const tz2 = (col.halfLength - loz) * invLz;
    tmin = Math.max(tmin, Math.min(tz1, tz2));
    tmax = Math.min(tmax, Math.max(tz1, tz2));

    if (tmax > tmin && tmin * maxDist < maxDist - 0.8) {
      return true;
    }
  }
  return false;
}

export function resolveAnnotationAccentHex(
  theme: ADASEnvironmentTheme,
  tone: ADASRibbonTone,
): string {
  if (tone === 'hazard') {
    return theme === 'NIGHT' ? '#df5d5d' : '#f26b6b';
  }
  if (tone === 'caution') {
    return theme === 'NIGHT' ? '#d49a48' : '#f2b149';
  }
  return theme === 'NIGHT' ? '#6cbcc7' : '#73d3ec';
}
