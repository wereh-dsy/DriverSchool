/** Metre-based planar road data, independent of Three.js and HUD rendering. */
export interface RoadPoint { readonly x: number; readonly z: number }
export interface RoadMapBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}
export interface RoadSegmentData {
  readonly id: string;
  readonly centerline: readonly RoadPoint[];
  readonly width: number;
  readonly length: number;
  readonly laneCountPerDirection: number;
  readonly laneWidth: number;
  /** Travel follows the polyline in either order. */
  readonly travelDirection: 'two-way' | 'forward' | 'reverse';
  readonly speedLimit?: number;
}
export interface RoadIntersectionArmData {
  readonly segmentId: string;
  readonly outward: RoadPoint;
  readonly approachYawRadians: number;
  readonly approachLaneCount: number;
  /** Query the ground's signal snapshot using this junction and control group. */
  readonly trafficSignal?: {
    readonly junctionId: string;
    readonly controlKind: 'north-south' | 'east-west';
  };
}
export interface RoadIntersectionData {
  readonly id: string;
  readonly center: RoadPoint;
  readonly halfExtentX: number;
  readonly halfExtentZ: number;
  readonly arms: readonly RoadIntersectionArmData[];
}
export interface RoadNetworkData {
  readonly mapId: string;
  readonly bounds: RoadMapBounds;
  readonly segments: readonly RoadSegmentData[];
  readonly intersections: readonly RoadIntersectionData[];
}

/** North-up normalized map coordinates: +X right, +Z down. No clamping. */
export const worldToRoadMap = (bounds: RoadMapBounds, x: number, z: number): { x: number; y: number } => ({
  x: (x - bounds.minimumX) / Math.max(1, bounds.maximumX - bounds.minimumX),
  y: (z - bounds.minimumZ) / Math.max(1, bounds.maximumZ - bounds.minimumZ),
});

export interface RoadProjection {
  readonly segmentId: string;
  readonly position: RoadPoint;
  readonly distanceAlong: number;
  readonly distanceFromCenterline: number;
  /** Signed offset right of the polyline's start-to-end direction. */
  readonly lateralOffset: number;
  readonly headingRadians: number;
}

/** On-demand geometry query for guidance consumers. No routing or pathfinding. */
export const projectWorldToRoad = (network: RoadNetworkData, x: number, z: number): RoadProjection | null => {
  let nearest: RoadProjection | null = null;
  let bestSquared = Infinity;
  for (const road of network.segments) {
    let travelled = 0;
    for (let i = 1; i < road.centerline.length; i += 1) {
      const a = road.centerline[i - 1]!, b = road.centerline[i]!;
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (length * length)));
      const px = a.x + dx * t, pz = a.z + dz * t;
      const squared = (x - px) ** 2 + (z - pz) ** 2;
      if (squared < bestSquared) {
        bestSquared = squared;
        nearest = {
          segmentId: road.id, position: { x: px, z: pz }, distanceAlong: travelled + length * t,
          distanceFromCenterline: Math.sqrt(squared),
          lateralOffset: ((x - px) * -dz + (z - pz) * dx) / length,
          headingRadians: Math.atan2(-dx, -dz),
        };
      }
      travelled += length;
    }
  }
  return nearest;
};
