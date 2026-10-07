import type * as THREE from 'three';
import type { DrivingGround, DrivingGroundMetadata } from '../DrivingGround';
import type { RoadSurfaceSample, TrackSpawnPose } from '../DrivingTestTrack';
import type {
  Subject3GroundConfig,
  Subject3JunctionKind,
  Subject3Point2,
  Subject3RoadClass,
  Subject3ZoneKind,
} from './Subject3GroundConfig';
import type { Subject3TrafficSignalState } from './trafficSignals';

export interface Subject3Bounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}

export interface Subject3RoadMetadata {
  readonly id: string;
  readonly name: string;
  readonly roadClass: Subject3RoadClass;
  readonly width: number;
  readonly speedLimitKmh: number;
  /** Travel direction of the authored reference lane, in radians. */
  readonly headingRadians: number;
  readonly centerline: readonly Subject3Point2[];
  readonly length: number;
}

export interface Subject3JunctionArmMetadata {
  readonly segmentId: string;
  /** Unit vector pointing from the junction outwards along the arm. */
  readonly outward: Subject3Point2;
  /** Yaw a vehicle has while driving into the junction along this arm. */
  readonly approachYawRadians: number;
  readonly approachLaneCount: number;
  readonly roadWidth: number;
}

export interface Subject3JunctionMetadata {
  readonly id: string;
  readonly kind: Subject3JunctionKind;
  readonly center: Subject3Point2;
  readonly halfExtentX: number;
  readonly halfExtentZ: number;
  readonly arms: readonly Subject3JunctionArmMetadata[];
  readonly hasTrafficSignals: boolean;
}

export interface Subject3ZoneMetadata {
  readonly id: string;
  readonly kind: Subject3ZoneKind;
  readonly label: string;
  readonly bounds: Subject3Bounds;
  readonly headingRadians?: number;
}

export interface Subject3MapMetadata extends DrivingGroundMetadata {
  readonly id: 'subject-3-shared-city-map';
  readonly version: 1;
  readonly mapId: 'cn-subject-3-shared-city-map';
  readonly schemaVersion: '1.0.0';
  readonly displayName: '科目三共享城市地图';
  readonly coordinateUnits: 'metres';
  readonly bounds: Subject3Bounds;
  readonly spawn: {
    readonly position: Subject3Point2;
    readonly yawRadians: number;
  };
  readonly totalRoadLength: number;
  readonly junctions: readonly Subject3JunctionMetadata[];
  readonly roads: readonly Subject3RoadMetadata[];
  readonly zones: readonly Subject3ZoneMetadata[];
}

export interface Subject3GroundOptions {
  readonly shadows?: boolean;
  readonly config?: Subject3GroundConfig;
}

export interface Subject3RoadMarkingDiagnostics {
  readonly vertexCount: number;
  readonly minimumSurfaceClearance: number;
  readonly maximumSurfaceClearance: number;
  readonly maximumClearanceError: number;
  readonly minimumWorldHeight: number;
  readonly maximumWorldHeight: number;
}

export interface Subject3TrafficSignalSnapshot {
  readonly cycleSeconds: number;
  readonly state: Subject3TrafficSignalState;
  readonly northSouth: Subject3TrafficSignalState['color'];
  readonly eastWest: Subject3TrafficSignalState['color'];
  readonly secondsRemaining: number;
}

export interface Subject3GroundApi extends DrivingGround {
  readonly metadata: Subject3MapMetadata;
  readonly config: Subject3GroundConfig;
  readonly spawnPose: TrackSpawnPose;
  sampleRoadSurface(x: number, z: number, direction?: THREE.Vector2Like): RoadSurfaceSample;
  getRoadMarkingDiagnostics(): Subject3RoadMarkingDiagnostics;
  /** Authoritative, queryable traffic-light state for later examination logic. */
  getTrafficSignalSnapshot(junctionId?: string): Subject3TrafficSignalSnapshot;
  update(deltaSeconds: number): void;
}
