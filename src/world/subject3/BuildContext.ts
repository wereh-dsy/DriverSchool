import type * as THREE from 'three';
import type { StaticCollider } from '../../vehicle/physics/CollisionSystem';
import type { Subject3GroundConfig } from './Subject3GroundConfig';
import type { Subject3HeightSampler } from './geometry';
import type { Subject3Materials } from './materials';
import type { Subject3SurfaceRegistry } from './SurfaceRegistry';
import type { Subject3Topology } from './topology';

export interface Subject3BuildContext {
  readonly config: Subject3GroundConfig;
  readonly topology: Subject3Topology;
  readonly materials: Subject3Materials;
  readonly surfaces: Subject3SurfaceRegistry;
  readonly heightAt: Subject3HeightSampler;
  readonly shadows: boolean;
  /** Authored static solids collected by landmarks and the environment. */
  readonly colliders: StaticCollider[];
}

export interface Subject3AreaModule {
  readonly root: THREE.Group;
}
