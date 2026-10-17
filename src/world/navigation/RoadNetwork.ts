/** Metre-based planar road data, independent of Three.js and HUD rendering. */
export interface RoadPoint { readonly x: number; readonly z: number; readonly y?: number }
export interface LogicalLaneData {
  readonly id: string; readonly roadId: string; readonly index: number;
  readonly direction: 'forward' | 'reverse'; readonly width: number;
}
export interface RoadMapBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}
export interface RoadSegmentData {
  readonly id: string;
  readonly name?: string;
  readonly routeNumber?: string;
  readonly nameId?: string;
  readonly centerline: readonly RoadPoint[];
  readonly width: number;
  readonly length: number;
  readonly laneCountPerDirection: number;
  readonly laneWidth: number;
  /** Travel follows the polyline in either order. */
  readonly travelDirection: 'two-way' | 'forward' | 'reverse';
  readonly speedLimit?: number;
  /** Presentation classification only; does not alter topology or lane control. */
  readonly roadType?: 'highway' | 'urban' | 'ramp' | 'circuit';
  /** Authored logical lanes only. Absence means lateral assistance unavailable. */
  readonly lanes?: readonly LogicalLaneData[];
  readonly markingsAvailable?: boolean;
  readonly highwayTransition?: { readonly kind: 'deceleration' | 'acceleration'; readonly taperMetres: number; readonly mainRoadId: string; readonly decisionId: string };
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
  readonly pavementFootprint?: readonly RoadPoint[];
  readonly arms: readonly RoadIntersectionArmData[];
}
export interface RoadNetworkData {
  readonly mapId: string;
  readonly bounds: RoadMapBounds;
  readonly segments: readonly RoadSegmentData[];
  readonly intersections: readonly RoadIntersectionData[];
  /** Optional authored map landmarks, shared by HUD and vehicle navigation displays. */
  readonly mapAnnotations?: readonly RoadMapAnnotation[];
  readonly laneConnections?: readonly { readonly intersectionId: string; readonly fromLaneId: string; readonly toLaneId: string }[];
  /** Explicit legal endpoint transitions; geometric crossings never create links. */
  readonly routing?: { readonly connections: readonly RoadRoutingConnection[]; readonly places: readonly RoadMapPlace[] };
}

export interface RoadRoutingConnection {
  readonly fromRoadId: string; readonly fromEnd: 'start' | 'end';
  readonly toRoadId: string; readonly toEnd: 'start' | 'end'; readonly via?: RoadPoint;
}
export interface RoadMapPlace {
  readonly id: string; readonly name: string; readonly position: RoadPoint; readonly roadIds: readonly string[];
  readonly kind?: 'service' | 'interchange' | 'landmark';
}

export interface RoadMapAnnotation {
  readonly id: string;
  readonly kind: 'start-finish' | 'corner' | 'pit' | 'direction';
  readonly position: RoadPoint;
  readonly label: string;
  readonly yawRadians?: number;
  readonly roadWidth?: number;
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
export const projectWorldToRoad = (network: RoadNetworkData, x: number, z: number, referenceHeight?: number): RoadProjection | null => {
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
      const py=(a.y??0)+((b.y??0)-(a.y??0))*t, heightDifference=referenceHeight===undefined?0:Math.abs(py-referenceHeight);
      if(referenceHeight!==undefined&&heightDifference>2.5){travelled+=length;continue;}
      const score=squared+(heightDifference*8)**2;
      if (score < bestSquared) {
        bestSquared = score;
        nearest = {
          segmentId: road.id, position: referenceHeight===undefined?{ x: px, z: pz }:{x:px,y:py,z:pz}, distanceAlong: travelled + length * t,
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
