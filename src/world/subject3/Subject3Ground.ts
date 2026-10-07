import * as THREE from 'three';
import type { StaticCollider } from '../../vehicle/physics/CollisionSystem';
import type { DrivingGround } from '../DrivingGround';
import type { RoadSurfaceSample, TrackSpawnPose } from '../DrivingTestTrack';
import {
  blendSurfaceMaterials,
  calibratedSurfaceMaterial,
  sampleGroundGeometry,
  surfaceResponseAliases,
  type SurfaceMaterial,
} from '../SurfaceMaterial';
import type { Subject3BuildContext } from './BuildContext';
import {
  DEFAULT_SUBJECT3_GROUND_CONFIG,
  type Subject3GroundConfig,
  type Subject3Point2,
} from './Subject3GroundConfig';
import { SUBJECT3_ROAD_SURFACE_OFFSET } from './geometry';
import { Subject3Environment } from './environment';
import { Subject3Junctions } from './junctions';
import { Subject3Landmarks } from './landmarks';
import { createSubject3Materials } from './materials';
import { createSubject3MapMetadata } from './metadata';
import { Subject3Roads } from './roads';
import { Subject3SurfaceRegistry } from './SurfaceRegistry';
import { buildSubject3Topology, laneWidthFor, type Subject3Topology } from './topology';
import type {
  Subject3GroundOptions,
  Subject3MapMetadata,
  Subject3RoadMarkingDiagnostics,
  Subject3TrafficSignalSnapshot,
} from './types';

const smoothstep01 = (value: number): number => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The shared Subject 3 city map: a connected street network with signalised and
 * plain junctions, school, bus-stop and commercial landmarks, and a northern
 * dome landmark. Geometry and metadata only — no examination route, scoring or
 * traffic logic lives here.
 */
export class Subject3Ground implements DrivingGround {
  public readonly root = new THREE.Group();
  public readonly config: Subject3GroundConfig;
  public readonly metadata: Subject3MapMetadata;
  public readonly topology: Subject3Topology;
  public readonly worldBounds: DrivingGround['worldBounds'];
  public readonly spawnPose: TrackSpawnPose;
  public readonly colliders: readonly StaticCollider[];

  private readonly materials;
  private readonly surfaces = new Subject3SurfaceRegistry();
  private readonly signals: Subject3Junctions['signals'];

  public constructor(options: Subject3GroundOptions = {}) {
    this.config = options.config ?? DEFAULT_SUBJECT3_GROUND_CONFIG;
    this.topology = buildSubject3Topology(this.config);
    this.metadata = createSubject3MapMetadata(this.config, this.topology);
    this.worldBounds = Object.freeze({
      minX: this.metadata.bounds.minimumX,
      maxX: this.metadata.bounds.maximumX,
      minZ: this.metadata.bounds.minimumZ,
      maxZ: this.metadata.bounds.maximumZ,
    });
    this.materials = createSubject3Materials();
    this.root.name = 'Subject 3 shared city map';
    this.root.userData.renderCategory = 'WORLD';
    this.root.userData.mapId = this.metadata.id;
    this.root.userData.mapMetadata = this.metadata;

    const colliders: StaticCollider[] = [];
    const context: Subject3BuildContext = {
      config: this.config,
      topology: this.topology,
      materials: this.materials,
      surfaces: this.surfaces,
      heightAt: (x, z) => this.getRoadHeightAt(x, z),
      shadows: options.shadows ?? true,
      colliders,
    };

    this.buildBaseGround(context);
    const roads = new Subject3Roads(context);
    const junctions = new Subject3Junctions(context);
    this.signals = junctions.signals;
    const landmarks = new Subject3Landmarks(context);
    const environment = new Subject3Environment(context);
    this.root.add(roads.root, junctions.root, landmarks.root, environment.root);
    this.colliders = Object.freeze(colliders);
    // Coverage exists only after the builders have registered their surfaces.
    const spawn = this.resolveSpawn(this.config.spawn.position);
    this.spawnPose = Object.freeze({
      position: new THREE.Vector3(spawn.x, this.getRoadHeightAt(spawn.x, spawn.z) + 0.04, spawn.z),
      yawRadians: this.config.spawn.yawRadians,
    });
  }

  public getRoadHeightAt(_x: number, _z: number): number {
    return 0;
  }

  public getRoadPitchAt(_x: number, _z: number, _yawRadians = 0): number {
    return 0;
  }

  public sampleRoadSurface(
    x: number,
    z: number,
    direction: THREE.Vector2Like = { x: 0, y: -1 },
  ): RoadSurfaceSample {
    return {
      ...sampleGroundGeometry((sampleX, sampleZ) => this.getRoadHeightAt(sampleX, sampleZ), x, z, direction),
      ...surfaceResponseAliases(this.sampleSurfaceResponse(x, z)),
    };
  }

  /** Advances the shared traffic-signal clock. */
  public update(deltaSeconds: number): void {
    this.signals.update(deltaSeconds);
  }

  public getTrafficSignalSnapshot(junctionId?: string): Subject3TrafficSignalSnapshot {
    const index = junctionId === undefined
      ? this.topology.junctions.findIndex((junction) => junction.hasTrafficSignals)
      : this.topology.junctions.findIndex((junction) => junction.id === junctionId && junction.hasTrafficSignals);
    if (index < 0) throw new RangeError(`Unknown signalised Subject 3 junction: ${junctionId ?? '(default)'}`);
    const state = this.signals.getStateForJunction(index);
    return {
      cycleSeconds: this.signals.getCycleSeconds(),
      state,
      northSouth: this.signals.getColorForApproach(index, 'north-south'),
      eastWest: this.signals.getColorForApproach(index, 'east-west'),
      secondsRemaining: state.secondsRemaining,
    };
  }

  /** Number of authored signal heads; used by the structural self-test. */
  public getTrafficSignalHeadCount(): number {
    return this.signals.getHeadCount();
  }

  public getRoadMarkingDiagnostics(): Subject3RoadMarkingDiagnostics {
    let vertexCount = 0;
    let minimumSurfaceClearance = Number.POSITIVE_INFINITY;
    let maximumSurfaceClearance = Number.NEGATIVE_INFINITY;
    let maximumClearanceError = 0;
    let minimumWorldHeight = Number.POSITIVE_INFINITY;
    let maximumWorldHeight = Number.NEGATIVE_INFINITY;
    const point = new THREE.Vector3();
    this.root.updateWorldMatrix(true, true);
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.subject3RoadMarking !== true) return;
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        point.set(positions.getX(index), positions.getY(index), positions.getZ(index));
        object.localToWorld(point);
        const clearance = point.y
          - (this.getRoadHeightAt(point.x, point.z) + SUBJECT3_ROAD_SURFACE_OFFSET);
        vertexCount += 1;
        minimumSurfaceClearance = Math.min(minimumSurfaceClearance, clearance);
        maximumSurfaceClearance = Math.max(maximumSurfaceClearance, clearance);
        maximumClearanceError = Math.max(
          maximumClearanceError,
          Math.abs(clearance - this.config.markings.surfaceClearance),
        );
        minimumWorldHeight = Math.min(minimumWorldHeight, point.y);
        maximumWorldHeight = Math.max(maximumWorldHeight, point.y);
      }
    });
    if (vertexCount === 0) {
      minimumSurfaceClearance = 0;
      maximumSurfaceClearance = 0;
      minimumWorldHeight = 0;
      maximumWorldHeight = 0;
    }
    return {
      vertexCount,
      minimumSurfaceClearance,
      maximumSurfaceClearance,
      maximumClearanceError,
      minimumWorldHeight,
      maximumWorldHeight,
    };
  }

  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) materials.add(material);
    });
    // One owner disposes all geometry/materials, including shared signal assets.
    for (const material of Object.values(this.materials)) materials.add(material);
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.root.clear();
  }

  private buildBaseGround(context: Subject3BuildContext): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.config.site.length, this.config.site.width),
      this.materials.grass,
    );
    ground.name = 'Subject 3 grass base';
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.05;
    ground.receiveShadow = context.shadows;
    this.root.add(ground);
  }

  /**
   * Nudges the authored spawn onto the nearest carriageway centre if the config
   * point is not fully on asphalt, so the default spawn always starts on road.
   */
  private resolveSpawn(configured: Subject3Point2): Subject3Point2 {
    if (this.surfaces.isFullyOnAsphalt(configured.x, configured.z, 1.4)) return { ...configured };
    let best: Subject3Point2 | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const segment of this.topology.segments) {
      for (let distance = 0; distance <= segment.length; distance += 2) {
        const sample = samplePolyline(segment.centerline, distance);
        if (sample === null) continue;
        const halfLane = laneWidthFor(segment.roadClass, this.config) * 0.5;
        const rightX = Math.cos(this.config.spawn.yawRadians);
        const rightZ = -Math.sin(this.config.spawn.yawRadians);
        const candidate = {
          x: sample.point.x + rightX * halfLane,
          z: sample.point.z + rightZ * halfLane,
        };
        const offset = Math.hypot(candidate.x - configured.x, candidate.z - configured.z);
        if (offset >= bestDistance) continue;
        if (!this.surfaces.isFullyOnAsphalt(candidate.x, candidate.z, 1.4)) continue;
        best = candidate;
        bestDistance = offset;
      }
    }
    return best ?? { ...configured };
  }

  private sampleSurfaceResponse(x: number, z: number): SurfaceMaterial {
    const surface = this.config.surface;
    const asphalt = calibratedSurfaceMaterial('asphalt', surface.asphaltGrip, surface.asphaltRollingResistance);
    const sidewalk = calibratedSurfaceMaterial('concrete', surface.sidewalkGrip, surface.sidewalkRollingResistance);
    const grass = calibratedSurfaceMaterial('grass', surface.grassGrip, surface.grassRollingResistance);
    const asphaltDistance = this.surfaces.distanceFromAsphalt(x, z);
    if (asphaltDistance <= 0) return asphalt;
    const blend = Math.max(surface.shoulderBlendDepth, 0.05);
    if (asphaltDistance <= blend) {
      return blendSurfaceMaterials(asphalt, sidewalk, smoothstep01(asphaltDistance / blend));
    }
    const pavementDistance = this.surfaces.distanceFromPavement(x, z);
    if (pavementDistance <= 0) return sidewalk;
    if (pavementDistance <= blend) {
      return blendSurfaceMaterials(sidewalk, grass, smoothstep01(pavementDistance / blend));
    }
    return grass;
  }
}

const samplePolyline = (
  points: readonly Subject3Point2[],
  targetDistance: number,
): { readonly point: Subject3Point2; readonly tangent: Subject3Point2 } | null => {
  if (points.length < 2) return null;
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-9) continue;
    if (travelled + length >= targetDistance) {
      const t = (targetDistance - travelled) / length;
      return {
        point: { x: start.x + dx * t, z: start.z + dz * t },
        tangent: { x: dx / length, z: dz / length },
      };
    }
    travelled += length;
  }
  return null;
};
