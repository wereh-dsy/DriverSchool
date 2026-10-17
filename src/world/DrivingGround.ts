import type * as THREE from 'three';

import type { TrackSpawnPose } from './DrivingTestTrack';
import type { RoadSurfaceSample } from './SurfaceMaterial';
import type { StaticCollider } from '../vehicle/physics/CollisionSystem';
import type { RoadNetworkData } from './navigation/RoadNetwork';
import type { LapCourseDefinition } from '../game/lap/LapCourseDefinition';
import type { TrafficSignalProvider } from './navigation/TrafficSignalState';

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
  /** Shared by HUD, future routes and instrument navigation. */
  readonly roadNetwork?: RoadNetworkData;
  /** Optional live phase/lane snapshots; independent of visual sector loading. */
  readonly trafficSignals?: TrafficSignalProvider;
  /** Optional authored timing gates; timing state belongs to the game. */
  readonly lapCourse?: LapCourseDefinition;
  /** Authored solids, deliberately separate from the road surface query. */
  readonly colliders: readonly StaticCollider[];
  sampleRoadSurface(
    x: number,
    z: number,
    travelDirection?: THREE.Vector2Like,
  ): RoadSurfaceSample;
  getRoadHeightAt(x: number, z: number): number;
  getRoadPitchAt(x: number, z: number, yawRadians: number): number;
  /** Optional per-frame hook for maps with authored ambient animation. */
  update?(deltaSeconds: number): void;
  /** Optional streaming hook; true asks the environment to discover new visuals. */
  updatePlayerPosition?(x: number, z: number,yawRadians?:number,speedMetersPerSecond?:number): boolean;
  /** Asynchronous visual readiness only. Logical contacts/topology are already available. */
  readonly visualReady?: boolean;
  readonly visualLoadingError?: Error;
  setVisualResourcePreparation?(prepare: (texture: THREE.Texture) => void,
    warmup?: (root: THREE.Group) => Promise<unknown>): void;
  /** Incremental visual additions/removals; never changes logical resources. */
  setVisualObserver?(observer: (root: THREE.Object3D, added: boolean) => void): void;
  updateVisualVisibility?(eye: THREE.Vector3, fogFar: number, cameras: readonly THREE.Camera[]): void;
  /** Multi-level worlds select support near this height. Existing height-field maps ignore it. */
  setSurfaceReferenceHeight?(height: number): void;
  dispose(): void;
}

export interface DrivingGroundDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly navigation?: boolean;
  readonly create: () => DrivingGround;
}
