import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';
import { surfaceGrid, surfaceMesh } from './SurfaceVehicleGeometry';

/** One set of seams for paint, glass, pillars, the moving door and cockpit trim. */
export const TANK_BODY = { belt: 1.285, doorFront: -1.03, doorRear: .37, rear: 2.16,
  windBottomZ: -1.065, windTopZ: -.61, windTopY: 1.803, roofY: 1.862,
  frontWindow: [[-1.015, 1.30], [-.595, 1.795], [.315, 1.818], [.335, 1.30]],
  rearWindow: [[.435, 1.30], [.425, 1.818], [1.27, 1.802], [1.31, 1.30]],
  quarterWindow: [[1.405, 1.30], [1.365, 1.795], [1.875, 1.76], [2.01, 1.30]],
} as const;
export function tankSidePoint(c: VehicleVisualConfig, side: number, z: number, y: number): P {
  const half = c.vehicleWidth / 2;
  const width = y >= TANK_BODY.belt ? half - .040 - (y - TANK_BODY.belt) * .225 :
    half - .075 * (1 - Math.sin(T.MathUtils.clamp((y - .44) / .85, 0, 1) * Math.PI * .5));
  const frontRound = .10 * (1 - T.MathUtils.smoothstep(z, -c.vehicleLength / 2, -2.12));
  const rearRound = .08 * T.MathUtils.smoothstep(z, 1.86, TANK_BODY.rear);
  return [side * (width - frontRound - rearRound), y, z];
}
export function tankWindshieldPoint(u: number, v: number): P {
  const x = T.MathUtils.lerp(.85, .81, v) * (2 * u - 1);
  return [x, T.MathUtils.lerp(TANK_BODY.belt, TANK_BODY.windTopY, v),
    T.MathUtils.lerp(TANK_BODY.windBottomZ, TANK_BODY.windTopZ, v) - .018 * (1 - (2 * u - 1) ** 2)];
}
export function tankHoodPoint(u: number, v: number): P {
  const x = (2 * u - 1) * T.MathUtils.lerp(.87, .89, v), across = 1 - (2 * u - 1) ** 2;
  return [x, T.MathUtils.lerp(1.245, TANK_BODY.belt, v) + .055 * across * Math.sin(Math.PI * (.12 + v * .76)),
    T.MathUtils.lerp(-2.445, TANK_BODY.windBottomZ, v) - .018 * across * v];
}
export function tankShoulderHeight(z: number): number {
  return T.MathUtils.lerp(1.245, TANK_BODY.belt, T.MathUtils.smoothstep(z, -2.445, TANK_BODY.windBottomZ));
}
export function tankFrontPoint(c: VehicleVisualConfig, x: number, y: number): P {
  const lower = .16 * (1 - T.MathUtils.smoothstep(y, .32, .58));
  const upper = .06 * T.MathUtils.smoothstep(y, 1.10, 1.28);
  return [x, y, -c.vehicleLength / 2 + .035 + lower + upper + .11 * (Math.abs(x) / (c.vehicleWidth / 2)) ** 6];
}
export function tankRearPoint(x: number, y: number): P {
  return [x, y, TANK_BODY.rear - .055 * (Math.abs(x) / .96) ** 6 - .10 * T.MathUtils.smoothstep(y, 1.30, 1.83) - .08 * (1 - T.MathUtils.smoothstep(y, .3, .58))];
}
export function tankArchBottom(c: VehicleVisualConfig, z: number): number {
  const radius = c.wheelRadius + c.body.wheelArchClearance;
  const distance = Math.min(Math.abs(z - c.wheelBase / 2), Math.abs(z + c.wheelBase / 2));
  return distance < radius ? Math.max(.46, (c.body.wheelArchCenterY ?? c.wheelRadius) + Math.sqrt(radius ** 2 - distance ** 2)) : .46;
}
export function tankSidePane(name: string, c: VehicleVisualConfig, side: number, points: readonly (readonly [number, number])[], m: T.Material): T.Mesh {
  return surfaceGrid(name, 5, 3, (u, v) => tankSidePoint(c, side,
    T.MathUtils.lerp(T.MathUtils.lerp(points[0]![0], points[1]![0], v), T.MathUtils.lerp(points[3]![0], points[2]![0], v), u),
    T.MathUtils.lerp(T.MathUtils.lerp(points[0]![1], points[1]![1], v), T.MathUtils.lerp(points[3]![1], points[2]![1], v), u)), m);
}
export function tankRibbon(name: string, points: readonly P[], width: number, material: T.Material): T.Mesh {
  const p: number[] = [], uv: number[] = [], indices: number[] = [];
  points.forEach((a, i) => { p.push(a[0], a[1] - width / 2, a[2], a[0], a[1] + width / 2, a[2]); uv.push(i / (points.length - 1), 0, i / (points.length - 1), 1);
    if (i < points.length - 1) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); } });
  return surfaceMesh(name, p, indices, uv, material);
}
/** Consolidate static trim with the same material while retaining separate moving-door ownership. */
export function tankJoin(name: string, parts: readonly T.Mesh[], material: T.Material): T.Mesh {
  const geometry = mergeGeometries(parts.map(p => p.geometry));
  if (!geometry) throw Error('Tank trim geometry attributes disagree');
  parts.forEach(p => p.geometry.dispose()); const result = new T.Mesh(geometry, material); result.name = name;
  result.castShadow = result.receiveShadow = true; return result;
}
