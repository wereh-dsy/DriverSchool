import type * as THREE from 'three';

import type { TrackSpawnPose } from './DrivingTestTrack';
import type { RoadSurfaceSample } from './SurfaceMaterial';
import type { StaticCollider } from '../vehicle/physics/CollisionSystem';

export interface DrivingGroundBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface DrivingGroundMetadata {
  /** Stable save/settings identifier. */
  readonly id: string;
  /** Increment when authored geometry or route metadata changes materially. */
  readonly version: number | string;
  readonly displayName: string;
  readonly description: string;
}

/**
 * World contract consumed by DrivingGame. New training grounds only need to
 * satisfy this interface; vehicle, camera, input and replay systems remain
 * independent of the concrete map implementation.
 */
export interface DrivingGround {
  readonly root: THREE.Group;
  readonly spawnPose: TrackSpawnPose;
  readonly worldBounds: DrivingGroundBounds;
  readonly metadata: DrivingGroundMetadata;
  /** Authored solids, deliberately separate from the road surface query. */
  readonly colliders: readonly StaticCollider[];
  sampleRoadSurface(
    x: number,
    z: number,
    travelDirection?: THREE.Vector2Like,
  ): RoadSurfaceSample;
  getRoadHeightAt(x: number, z: number): number;
  getRoadPitchAt(x: number, z: number, yawRadians: number): number;
  dispose(): void;
}

export interface DrivingGroundDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly create: () => DrivingGround;
}
