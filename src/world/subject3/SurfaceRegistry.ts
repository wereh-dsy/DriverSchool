import type { Subject3Point2 } from './Subject3GroundConfig';
import { distanceToPolyline } from './math';

interface CorridorSurface {
  readonly kind: 'corridor';
  readonly points: readonly Subject3Point2[];
  readonly width: number;
}

interface RectangleSurface {
  readonly kind: 'rectangle';
  readonly centerX: number;
  readonly centerZ: number;
  readonly lengthX: number;
  readonly widthZ: number;
}

type SurfacePrimitive = CorridorSurface | RectangleSurface;

const rectangleDistance = (x: number, z: number, surface: RectangleSurface): number => {
  const dx = Math.abs(x - surface.centerX) - surface.lengthX * 0.5;
  const dz = Math.abs(z - surface.centerZ) - surface.widthZ * 0.5;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  const inside = Math.min(Math.max(dx, dz), 0);
  return outside + inside;
};

const primitiveDistance = (x: number, z: number, surface: SurfacePrimitive): number => (
  surface.kind === 'rectangle'
    ? rectangleDistance(x, z, surface)
    : distanceToPolyline(x, z, surface.points) - surface.width * 0.5
);

/**
 * Planar coverage registry for the shared Subject 3 map. Asphalt corridors and
 * rectangles are queried per contact sample, so the drivable surface response
 * follows the authored road network instead of a mask texture.
 */
export class Subject3SurfaceRegistry {
  private readonly asphalt: SurfacePrimitive[] = [];
  private readonly sidewalk: SurfacePrimitive[] = [];
  /** Explicitly paved non-road areas such as forecourts and car parks. */
  private readonly pavement: SurfacePrimitive[] = [];

  public addRoadCorridor(points: readonly Subject3Point2[], width: number): void {
    this.asphalt.push({ kind: 'corridor', points: points.map((point) => ({ ...point })), width });
  }

  public addRoadRectangle(
    centerX: number,
    centerZ: number,
    lengthX: number,
    widthZ: number,
  ): void {
    this.asphalt.push({ kind: 'rectangle', centerX, centerZ, lengthX, widthZ });
  }

  public addSidewalkCorridor(points: readonly Subject3Point2[], width: number): void {
    this.sidewalk.push({ kind: 'corridor', points: points.map((point) => ({ ...point })), width });
  }

  public addSidewalkRectangle(
    centerX: number,
    centerZ: number,
    lengthX: number,
    widthZ: number,
  ): void {
    this.sidewalk.push({ kind: 'rectangle', centerX, centerZ, lengthX, widthZ });
  }

  public addPavementRectangle(
    centerX: number,
    centerZ: number,
    lengthX: number,
    widthZ: number,
  ): void {
    this.pavement.push({ kind: 'rectangle', centerX, centerZ, lengthX, widthZ });
  }

  /** Signed distance: <= 0 anywhere on authored asphalt. */
  public distanceFromAsphalt(x: number, z: number): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const surface of this.asphalt) {
      nearest = Math.min(nearest, primitiveDistance(x, z, surface));
    }
    return nearest;
  }

  /** Signed distance to paved kerbside/sidewalk space and seamed pavements. */
  public distanceFromPavement(x: number, z: number): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const surface of this.sidewalk) {
      nearest = Math.min(nearest, primitiveDistance(x, z, surface));
    }
    for (const surface of this.pavement) {
      nearest = Math.min(nearest, primitiveDistance(x, z, surface));
    }
    return nearest;
  }

  public isOnAsphalt(x: number, z: number): boolean {
    return this.distanceFromAsphalt(x, z) <= 0;
  }

  /** True when the vehicle footprint is fully on asphalt; used for spawning. */
  public isFullyOnAsphalt(x: number, z: number, radius: number): boolean {
    return this.distanceFromAsphalt(x, z) <= -radius;
  }
}
