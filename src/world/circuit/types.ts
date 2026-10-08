import type * as THREE from 'three';
import type { DrivingGround, DrivingGroundMetadata } from '../DrivingGround';
import type { RoadSurfaceSample, TrackSpawnPose } from '../DrivingTestTrack';
import type {
  CircuitCornerKind,
  CircuitTrackConfig,
} from './CircuitTrackConfig';

export interface CircuitRoutePoint {
  readonly x: number;
  readonly z: number;
  /** Forward distance from the route seam in metres. */
  readonly distance: number;
  readonly tangentX: number;
  readonly tangentZ: number;
}

export interface CircuitSectionMetadata {
  readonly id: string;
  readonly label: string;
  readonly kind: 'straight' | CircuitCornerKind;
  readonly startDistance: number;
  readonly endDistance: number;
  readonly length: number;
  /** Present only for circular corner sections. */
  readonly radius?: number;
  /** Signed heading change; positive is a right bend in this map convention. */
  readonly turnAngleRadians?: number;
}

export interface CircuitMapMetadata extends DrivingGroundMetadata {
  readonly id: 'simple-circuit';
  readonly version: 2;
  readonly mapId: 'simple-closed-circuit';
  readonly schemaVersion: '1.0.0';
  readonly displayName: '基础闭环试车赛道';
  readonly coordinateUnits: 'metres';
  readonly closedRoute: true;
  readonly lapLength: number;
  readonly trackWidth: number;
  readonly shoulderWidth: number;
  readonly barrierOffset: number;
  readonly mainStraightLength: number;
  /** Ordered, closed route. The final point duplicates the first on purpose. */
  readonly routeCenterline: readonly CircuitRoutePoint[];
  readonly sections: readonly CircuitSectionMetadata[];
}

export interface CircuitGroundOptions {
  readonly shadows?: boolean;
  readonly config?: CircuitTrackConfig;
}

export interface CircuitMarkingDiagnostics {
  readonly vertexCount: number;
  readonly minimumSurfaceClearance: number;
  readonly maximumSurfaceClearance: number;
  readonly maximumClearanceError: number;
  readonly maximumJoinGap: number;
}

export interface CircuitGroundApi extends DrivingGround {
  readonly metadata: CircuitMapMetadata;
  readonly config: CircuitTrackConfig;
  readonly spawnPose: TrackSpawnPose;
  readonly routeCurve: THREE.Curve<THREE.Vector3>;
  sampleRoadSurface(x: number, z: number, direction?: THREE.Vector2Like): RoadSurfaceSample;
  getRoadMarkingDiagnostics(): CircuitMarkingDiagnostics;
}
