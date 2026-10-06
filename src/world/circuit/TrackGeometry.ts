import * as THREE from 'three';
import type { CircuitTrackConfig } from './CircuitTrackConfig';
import {
  CIRCUIT_ROAD_SURFACE_OFFSET,
  createCircuitRibbonGeometry,
} from './geometry';
import type { CircuitMaterials } from './materials';
import type { CircuitTrackLayout } from './TrackLayout';

export class TrackGeometry {
  public readonly root = new THREE.Group();

  public constructor(
    config: CircuitTrackConfig,
    layout: CircuitTrackLayout,
    materials: CircuitMaterials,
    shadows: boolean,
  ) {
    this.root.name = 'Circuit road geometry';
    const shoulder = new THREE.Mesh(
      createCircuitRibbonGeometry(
        layout.curve,
        config.trackWidth + config.shoulderWidth * 2,
        CIRCUIT_ROAD_SURFACE_OFFSET - 0.008,
      ),
      materials.shoulder,
    );
    shoulder.name = 'Compacted circuit shoulders';
    shoulder.receiveShadow = shadows;

    const asphalt = new THREE.Mesh(
      createCircuitRibbonGeometry(
        layout.curve,
        config.trackWidth,
        CIRCUIT_ROAD_SURFACE_OFFSET,
      ),
      materials.asphalt,
    );
    asphalt.name = 'Closed circuit asphalt';
    asphalt.receiveShadow = shadows;
    this.root.add(shoulder, asphalt);

    const lineOffset = config.trackWidth * 0.5 - config.markings.edgeLineWidth * 0.7;
    for (const [offset, name] of [
      [-lineOffset, 'Circuit left edge line'],
      [lineOffset, 'Circuit right edge line'],
    ] as const) {
      const line = new THREE.Mesh(
        createCircuitRibbonGeometry(
          layout.curve,
          config.markings.edgeLineWidth,
          CIRCUIT_ROAD_SURFACE_OFFSET + config.markings.surfaceClearance,
          config.markings.maximumSegmentLength,
          offset,
        ),
        materials.marking,
      );
      line.name = name;
      line.userData.circuitRoadMarking = true;
      this.root.add(line);
    }
  }
}
