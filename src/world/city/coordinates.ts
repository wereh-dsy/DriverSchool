import type { CityPoint } from './CityMapData';

/** Metres, always X / Y (height) / Z. V1 points without Y remain at ground level. */
export const point3 = (x: number, y: number, z: number): CityPoint => ({ x, y, z });

export function transformPoint3(point: CityPoint, position: CityPoint, rotation: number): CityPoint {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return point3(point.x * c + point.z * s + position.x,
    (point.y ?? 0) + (position.y ?? 0), -point.x * s + point.z * c + position.z);
}
