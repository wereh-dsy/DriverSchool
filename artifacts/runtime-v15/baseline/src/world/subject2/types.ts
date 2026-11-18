import type * as THREE from 'three';
import type { DrivingGround, DrivingGroundMetadata } from '../DrivingGround';
import type { RoadSurfaceSample, TrackSpawnPose } from '../DrivingTestTrack';
import type { Subject2GroundConfig, Subject2Point2 } from './Subject2GroundConfig';

export type Subject2ProjectId =
  | 'waiting-area'
  | 'reverse-parking'
  | 'side-parking'
  | 'right-angle-turn'
  | 'curve-driving'
  | 'hill-start'
  | 'finish-area';

export type Subject2CheckpointKind = 'entry' | 'reference' | 'exit';

export interface Subject2Bounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}

export interface Subject2CheckpointMetadata {
  readonly id: string;
  readonly projectId: Subject2ProjectId;
  readonly kind: Subject2CheckpointKind;
  readonly position: Subject2Point2;
  readonly yawRadians: number;
}

export interface Subject2ProjectZoneMetadata {
  readonly id: Subject2ProjectId;
  readonly order: number;
  readonly label: string;
  readonly bounds: Subject2Bounds;
  readonly entryCheckpointId: string;
  readonly exitCheckpointId: string;
  readonly checkpointIds: readonly string[];
}

export type Subject2RouteSegmentKind = 'project' | 'connection';

export interface Subject2RouteSegmentMetadata {
  readonly id: string;
  readonly kind: Subject2RouteSegmentKind;
  readonly projectId?: Subject2ProjectId;
  readonly fromProjectId?: Subject2ProjectId;
  readonly toProjectId?: Subject2ProjectId;
  readonly nominalWidth: number;
  readonly centerline: readonly Subject2Point2[];
  readonly length: number;
}

export interface Subject2MapMetadata {
  readonly id: 'subject-2-training-ground';
  readonly version: 1;
  readonly description: string;
  readonly mapId: 'cn-subject-2-training-ground';
  readonly schemaVersion: '1.0.0';
  readonly displayName: '科目二训练场';
  readonly coordinateUnits: 'metres';
  readonly bounds: Subject2Bounds;
  readonly projectOrder: readonly Subject2ProjectId[];
  readonly projectZones: readonly Subject2ProjectZoneMetadata[];
  readonly routeSegments: readonly Subject2RouteSegmentMetadata[];
  readonly routeCenterline: readonly Subject2Point2[];
  readonly checkpoints: readonly Subject2CheckpointMetadata[];
}

export interface Subject2GroundOptions {
  readonly shadows?: boolean;
  readonly config?: Subject2GroundConfig;
}

export interface Subject2RoadMarkingDiagnostics {
  readonly vertexCount: number;
  readonly minimumSurfaceClearance: number;
  readonly maximumSurfaceClearance: number;
  readonly maximumClearanceError: number;
  readonly maximumJoinGap: number;
  readonly minimumWorldHeight: number;
  readonly maximumWorldHeight: number;
}

export interface Subject2GroundApi extends DrivingGround {
  readonly metadata: DrivingGroundMetadata & Subject2MapMetadata;
  readonly config: Subject2GroundConfig;
  readonly spawnPose: TrackSpawnPose;
  sampleRoadSurface(x: number, z: number, direction?: THREE.Vector2Like): RoadSurfaceSample;
  getRoadMarkingDiagnostics(): Subject2RoadMarkingDiagnostics;
}
