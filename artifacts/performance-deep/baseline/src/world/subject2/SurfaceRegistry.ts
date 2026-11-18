import * as THREE from 'three';
import type { Subject2Point2 } from './Subject2GroundConfig';

interface RectangleSurface {
  readonly kind: 'rectangle';
  readonly centerX: number;
  readonly centerZ: number;
  readonly length: number;
  readonly width: number;
}

interface CorridorSurface {
  readonly kind: 'corridor';
  readonly points: readonly Subject2Point2[];
  readonly width: number;
}

type SurfacePrimitive = RectangleSurface | CorridorSurface;

const distanceToSegment = (
  x: number,
  z: number,
  start: Subject2Point2,
  end: Subject2Point2,
): number => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const squaredLength = dx * dx + dz * dz;
  const t = squaredLength > 1e-9
    ? THREE.MathUtils.clamp(((x - start.x) * dx + (z - start.z) * dz) / squaredLength, 0, 1)
    : 0;
  return Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t));
};

export class Subject2SurfaceRegistry {
  private readonly surfaces: SurfacePrimitive[] = [];

  public addRectangle(
    centerX: number,
    centerZ: number,
    length: number,
    width: number,
  ): void {
    this.surfaces.push({ kind: 'rectangle', centerX, centerZ, length, width });
  }

  public addCorridor(points: readonly Subject2Point2[], width: number): void {
    this.surfaces.push({ kind: 'corridor', points: points.map((point) => ({ ...point })), width });
  }

  /** Signed distance: <= 0 on authored asphalt, positive outside it. */
  public distanceFromAsphalt(x: number, z: number): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const surface of this.surfaces) {
      if (surface.kind === 'rectangle') {
        const dx = Math.abs(x - surface.centerX) - surface.length * 0.5;
        const dz = Math.abs(z - surface.centerZ) - surface.width * 0.5;
        const outside = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
        const inside = Math.min(Math.max(dx, dz), 0);
        nearest = Math.min(nearest, outside + inside);
        continue;
      }
      let centreDistance = Number.POSITIVE_INFINITY;
      for (let index = 1; index < surface.points.length; index += 1) {
        const start = surface.points[index - 1];
        const end = surface.points[index];
        if (!start || !end) continue;
        centreDistance = Math.min(centreDistance, distanceToSegment(x, z, start, end));
      }
      nearest = Math.min(nearest, centreDistance - surface.width * 0.5);
    }
    return nearest;
  }

  public isOnAsphalt(x: number, z: number): boolean {
    return this.distanceFromAsphalt(x, z) <= 0;
  }
}
