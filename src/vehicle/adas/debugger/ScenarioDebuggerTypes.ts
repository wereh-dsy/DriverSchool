import type { Object3D } from 'three';
import type { StaticCollider } from '../../physics/CollisionSystem';
import type { TrafficActorKind } from '../ADASTypes';

export type DebugActorType = 'vehicle' | 'pedestrian' | 'obstacle';
export type DebugActorMotionMode = 'static' | 'dynamic';
export type DebugTravelDirection = 'forward' | 'oncoming' | 'cross-left' | 'cross-right';
export type DebugBehaviorType =
  | 'constant'
  | 'sudden-brake'
  | 'sudden-accel'
  | 'cut-in'
  | 'random';

export type DebugScenarioCategory =
  | 'lead'
  | 'interaction'
  | 'vru'
  | 'obstacle'
  | 'junction_highway';

export type DebugDynamicSpeedMode =
  | 'fixed'
  | 'lead-slow'
  | 'traffic-cruise'
  | 'traffic-fast'
  | 'lead-sudden-brake'
  | 'lead-sudden-accel'
  | 'rear-fast-approach'
  | 'green-launch';

export interface DebugSpeedPolicy {
  /** Dynamic speed profile resolved against live road speed limit & ego speed at spawn time. */
  readonly mode: DebugDynamicSpeedMode;
  readonly initialScale?: number;
  readonly initialOffsetKmh?: number;
  readonly targetScale?: number;
  readonly minKmh?: number;
  readonly maxKmh?: number;
}

export interface SpawnActorConfig {
  id?: string;
  label?: string;
  presetId?: string;
  type: DebugActorType;
  kindOverride?: TrafficActorKind;
  motionMode: DebugActorMotionMode;
  positionMode: 'road-relative' | 'world';
  /** Forward distance relative to ego car front bumper along road (m). Negative = behind ego. */
  forwardDistanceM: number;
  /** Lateral lane offset (-1 = left lane, 0 = current lane, +1 = right lane). */
  laneOffset: number;
  /** Precise lateral offset in metres from target lane center (m). */
  lateralOffsetM: number;
  /** Travel direction relative to ego road direction. Defaults to 'forward'. */
  direction?: DebugTravelDirection;
  /** World coordinates if positionMode === 'world'. */
  worldPosition?: { x: number; y: number; z: number; yaw?: number };
  /** Fallback/explicit initial speed in km/h (used when speedPolicy is absent or 'fixed'). */
  speedKmh: number;
  /** Fallback/explicit target speed in km/h (used when speedPolicy is absent or 'fixed'). */
  targetSpeedKmh: number;
  /** Optional dynamic speed rule scaled by live road speed limit and ego speed. */
  speedPolicy?: DebugSpeedPolicy;
  /** Dynamic behavior. */
  behavior: DebugBehaviorType;
  /** Delay before triggering dynamic behavior (s). */
  behaviorDelayS: number;
  /** Target lane change direction if behavior === 'cut-in'. */
  targetLaneChange: 'none' | 'left' | 'right';
  /** Deterministic PRNG seed for reproducible random events. */
  randomSeed: number;
  /** Custom bounding box dimensions { length, width, height } in metres. */
  dimensions?: { length: number; width: number; height: number };
}

export interface DebugScenarioPreset {
  readonly id: string;
  readonly category: DebugScenarioCategory;
  readonly name: string;
  readonly desc: string;
  readonly actors: readonly SpawnActorConfig[];
}

export interface DebugActorRuntime {
  id: string;
  label?: string;
  type: DebugActorType;
  kind: TrafficActorKind;
  motionMode: DebugActorMotionMode;
  direction: DebugTravelDirection;
  laneOffset: number;
  lateralOffsetM: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  vx: number;
  vz: number;
  accelMps2: number;
  targetSpeed: number;
  length: number;
  width: number;
  height: number;
  laneId?: string;
  roadId?: string;
  mesh: Object3D;
  collider: StaticCollider;
  behavior: DebugBehaviorType;
  behaviorDelayS: number;
  behaviorElapsedS: number;
  behaviorTriggered: boolean;
  targetLaneChange: 'none' | 'left' | 'right';
  cutInShiftedM?: number;
  cutInLaneWidthM?: number;
  randomSeed: number;
  prngState: number;
  active: boolean;
  spawnTime: number;
  initialSpeed: number;
  predictedTrajectory: Array<{ x: number; y: number; z: number; timestamp: number }>;
  sourceConfig: SpawnActorConfig;
}

export interface ScenarioDebuggerActorStatus {
  id: string;
  label?: string;
  type: DebugActorType;
  kind: TrafficActorKind;
  motionMode: DebugActorMotionMode;
  direction: DebugTravelDirection;
  laneOffset: number;
  lateralOffsetM: number;
  distanceToEgoM: number;
  speedKmh: number;
  targetSpeedKmh: number;
  behavior: DebugBehaviorType;
  behaviorDelayS: number;
  behaviorTriggered: boolean;
  targetLaneChange: 'none' | 'left' | 'right';
  randomSeed: number;
  width: number;
  length: number;
  height: number;
  x: number;
  z: number;
}

export interface ScenarioDebuggerStatus {
  activeActorCount: number;
  hudOpen: boolean;
  paused: boolean;
  lastScenarioName: string | null;
  actors: ScenarioDebuggerActorStatus[];
}
