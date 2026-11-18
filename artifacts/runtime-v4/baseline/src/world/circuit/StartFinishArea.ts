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
export const CIRCUIT_PIT_ACCESS_Z = [-54, 38] as const;

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

    // Two rows of alternating squares share one geometry through instancing.
    const columns = Math.ceil((config.trackWidth - 0.3) / 0.6);
    const tileWidth = (config.trackWidth - 0.3) / columns;
    const darkTiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(tileWidth, 0.36),
      materials.startDark, columns);
    darkTiles.geometry.rotateX(-Math.PI * 0.5);
    darkTiles.name = 'Start finish checker squares';
    darkTiles.position.copy(startLine.position);
    darkTiles.position.y += 0.001;
    darkTiles.rotation.copy(startLine.rotation);
    const dummy = new THREE.Object3D();
    let tileIndex = 0;
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if ((row + column) % 2 !== 0) continue;
        dummy.position.set((column + 0.5) * tileWidth - (config.trackWidth - 0.3) * 0.5,
          0, (row - 0.5) * 0.36);
        dummy.updateMatrix();
        darkTiles.setMatrixAt(tileIndex++, dummy.matrix);
      }
    }
    darkTiles.instanceMatrix.needsUpdate = true;
    this.root.add(darkTiles);
    this.buildGantry(config, layout, materials, shadows);

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
    for (const z of CIRCUIT_PIT_ACCESS_Z) {
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

  private buildGantry(config: CircuitTrackConfig, layout: CircuitTrackLayout,
    materials: CircuitMaterials, shadows: boolean): void {
    const t = CIRCUIT_START_LINE_DISTANCE / layout.lapLength;
    const point = layout.curve.getPointAt(t);
    const tangent = layout.curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const gantry = new THREE.Group();
    gantry.name = 'Start finish gantry';
    gantry.position.copy(point);
    gantry.rotation.y = Math.atan2(tangent.x, tangent.z);
    const span = config.trackWidth + config.barrierOffset * 2 + 6;
    const postGeometry = new THREE.BoxGeometry(0.24, 6.4, 0.24);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, materials.guardrailPost);
      post.position.set(side * span * 0.5, 3.2, 0);
      post.castShadow = shadows;
      gantry.add(post);
      this.colliders.push(createStaticOBBCollider({
        id: `circuit-gantry-post:${side}`, x: point.x + right.x * side * span * 0.5,
        z: point.z + right.z * side * span * 0.5, width: 0.24, length: 0.24,
        minHeight: 0, maxHeight: 6.4, type: 'obstacle',
      }));
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.5, 0.35), materials.roof);
    beam.position.y = 6.2;
    beam.castShadow = shadows;
    gantry.add(beam);
    const lampGeometry = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 10);
    lampGeometry.rotateX(Math.PI * 0.5);
    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x712d27, roughness: 0.6 });
    for (let index = 0; index < 5; index += 1) {
      const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
      lamp.position.set((index - 2) * 0.48, 6.2, -0.21);
      gantry.add(lamp);
    }
    this.root.add(gantry);
  }
}
