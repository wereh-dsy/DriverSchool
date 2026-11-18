import * as THREE from 'three';
import type { CircuitTrackConfig } from './CircuitTrackConfig';
import {
  CIRCUIT_ROAD_SURFACE_OFFSET,
  createCircuitRibbonGeometry,
  createCircuitBandGeometry,
} from './geometry';
import type { CircuitMaterials } from './materials';
import type { CircuitTrackLayout } from './TrackLayout';
import { circuitRunoffWidth, cornerEnvelope } from './TrackFeatures';

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

    for (const section of layout.sections) {
      if (!section.turnAngleRadians) continue;
      const inside = Math.sign(section.turnAngleRadians);
      // Only apex and exit zones receive kerbs, leaving the straights open.
      for (const [side, start, end, name] of [
        [inside, section.startDistance + section.length * 0.22,
          section.startDistance + section.length * 0.78, 'Circuit apex kerb'],
        [-inside, section.startDistance + section.length * 0.72,
          section.endDistance + 18, 'Circuit exit kerb'],
      ] as const) {
        const edge = config.trackWidth * 0.5;
        const kerb = new THREE.Mesh(createCircuitBandGeometry(
          layout.curve, start, end, CIRCUIT_ROAD_SURFACE_OFFSET + 0.003,
          () => side > 0 ? [edge, edge + config.kerbWidth] : [-edge - config.kerbWidth, -edge], true,
        ), materials.kerb);
        kerb.name = name;
        kerb.receiveShadow = shadows;
        this.root.add(kerb);
      }
      if (section.kind === 'braking') {
        const outside = -inside;
        const edge = config.trackWidth * 0.5;
        const runoff = new THREE.Mesh(createCircuitBandGeometry(
          layout.curve, section.startDistance - 35, section.endDistance + 40,
          CIRCUIT_ROAD_SURFACE_OFFSET - 0.002, distance => {
            const outerEdge = edge + circuitRunoffWidth(config, section, distance, layout.lapLength);
            return outside > 0 ? [edge, outerEdge] : [-outerEdge, -edge];
          },
        ), materials.runoff);
        runoff.name = 'Braking corner tapered asphalt runoff';
        runoff.receiveShadow = shadows;
        this.root.add(runoff);
        const runoffShoulder = new THREE.Mesh(createCircuitBandGeometry(
          layout.curve, section.startDistance - 35, section.endDistance + 40,
          CIRCUIT_ROAD_SURFACE_OFFSET - 0.008, distance => {
            const inner = edge + circuitRunoffWidth(config, section, distance, layout.lapLength);
            const outer = inner + config.shoulderWidth * cornerEnvelope(section, distance, layout.lapLength);
            return outside > 0 ? [inner, outer] : [-outer, -inner];
          },
        ), materials.shoulder);
        runoffShoulder.name = 'Braking runoff compacted shoulder';
        runoffShoulder.receiveShadow = shadows;
        this.root.add(runoffShoulder);
      }
    }

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
