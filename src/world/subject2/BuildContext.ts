import type * as THREE from 'three';
import type { Subject2GroundConfig } from './Subject2GroundConfig';
import type { Subject2Layout } from './layout';
import type { Subject2HeightSampler } from './geometry';
import type { Subject2Materials } from './materials';
import type { Subject2SurfaceRegistry } from './SurfaceRegistry';

export interface Subject2BuildContext {
  readonly config: Subject2GroundConfig;
  readonly layout: Subject2Layout;
  readonly materials: Subject2Materials;
  readonly surfaces: Subject2SurfaceRegistry;
  readonly heightAt: Subject2HeightSampler;
  readonly shadows: boolean;
}

export interface Subject2AreaModule {
  readonly root: THREE.Group;
}
