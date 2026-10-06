import * as THREE from 'three';
import type { CircuitTrackConfig } from './CircuitTrackConfig';
import {
  CIRCUIT_ROAD_SURFACE_OFFSET,
  createFlatPatch,
  createRoutePatch,
} from './geometry';
import type { CircuitMaterials } from './materials';
import type { CircuitTrackLayout } from './TrackLayout';
import { createStaticOBBCollider, type StaticCollider } from '../../vehicle/physics/CollisionSystem';

export const CIRCUIT_SPAWN_DISTANCE = 22;
export const CIRCUIT_START_LINE_DISTANCE = 52;

export class StartFinishArea {
  public readonly root = new THREE.Group();
  public readonly colliders: StaticCollider[] = [];

  public constructor(
    config: CircuitTrackConfig,
    layout: CircuitTrackLayout,
    materials: CircuitMaterials,
    shadows: boolean,
  ) {
    this.root.name = 'Circuit start finish and paddock';
    const startLine = createRoutePatch(
      layout.curve,
      CIRCUIT_START_LINE_DISTANCE,
      config.trackWidth - 0.3,
      0.72,
      CIRCUIT_ROAD_SURFACE_OFFSET + config.markings.surfaceClearance,
      materials.marking,
    );
    startLine.name = 'Circuit start finish line';
    startLine.userData.circuitRoadMarking = true;
    this.root.add(startLine);

    // A small, intentionally non-functional pit-like base. It supplies a clear
    // home area without implying pit rules, timing or vehicle service logic.
    const pit = createFlatPatch(22, 126, -194.5, -8, 0.018, materials.asphalt);
    pit.name = 'Simple pit parking apron';
    pit.receiveShadow = shadows;
    this.root.add(pit);
    for (const z of [-52, -28, -4, 20, 44]) {
      const divider = createFlatPatch(8.5, 0.12, -198.5, z, 0.027, materials.marking);
      divider.name = 'Pit parking bay line';
      this.root.add(divider);
    }
    for (const z of [-54, 38]) {
      const access = createFlatPatch(17.5, 7.5, -182.5, z, 0.02, materials.asphalt);
      access.name = 'Pit apron access';
      this.root.add(access);
    }

    const shed = new THREE.Group();
    shed.name = 'Circuit base shelter';
    const roof = new THREE.Mesh(new THREE.BoxGeometry(17, 0.38, 28), materials.roof);
    roof.position.set(-211, 4.4, 0);
    roof.castShadow = shadows;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.2, 28), materials.structure);
    wall.position.set(-219.2, 2.1, 0);
    wall.castShadow = shadows;
    wall.receiveShadow = shadows;
    this.colliders.push(createStaticOBBCollider({
      id: 'circuit-shelter-wall', x: -219.2, z: 0,
      width: 0.45, length: 28, minHeight: 0, maxHeight: 4.2, type: 'wall',
    }));
    shed.add(roof, wall);
    for (const z of [-12.5, 12.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.3, 0.32), materials.structure);
      post.position.set(-203, 2.15, z);
      post.castShadow = shadows;
      this.colliders.push(createStaticOBBCollider({
        id: `circuit-shelter-post:${z}`, x: -203, z,
        width: 0.32, length: 0.32, minHeight: 0, maxHeight: 4.3, type: 'obstacle',
      }));
      shed.add(post);
    }
    this.root.add(shed);
  }
}
