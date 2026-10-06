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
import type { Subject2BuildContext } from './BuildContext';
import { ConnectionRoads } from './ConnectionRoads';
import { CurveDrivingArea } from './CurveDrivingArea';
import { Environment } from './Environment';
import { FinishArea } from './FinishArea';
import { SUBJECT2_ROAD_SURFACE_OFFSET } from './geometry';
import { HillStartArea } from './HillStartArea';
import { createSubject2Layout, createSubject2MapMetadata } from './layout';
import { createSubject2Materials } from './materials';
import { ReverseParkingArea } from './ReverseParkingArea';
import { RightAngleTurnArea } from './RightAngleTurnArea';
import { SideParkingArea } from './SideParkingArea';
import {
  DEFAULT_SUBJECT2_GROUND_CONFIG,
  type Subject2GroundConfig,
} from './Subject2GroundConfig';
import { Subject2SurfaceRegistry } from './SurfaceRegistry';
import type {
  Subject2GroundOptions,
  Subject2MapMetadata,
  Subject2RoadMarkingDiagnostics,
} from './types';
import { WaitingArea } from './WaitingArea';

const smoothstep01 = (value: number): number => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Height gained along a ramp whose grade eases in and out over `transition`. */
const easedRampHeight = (
  distance: number,
  length: number,
  maximumGrade: number,
  transition: number,
): number => {
  const d = THREE.MathUtils.clamp(distance, 0, length);
  const t = Math.min(Math.max(transition, 0.01), length * 0.49);
  const totalRise = maximumGrade * (length - t);
  if (d < t) return maximumGrade * d * d / (2 * t);
  if (d <= length - t) return maximumGrade * (d - t * 0.5);
  const remaining = length - d;
  return totalRise - maximumGrade * remaining * remaining / (2 * t);
};

/**
 * Geometry-only 科目二 training ground. Stable project/checkpoint metadata is
 * authored now for later scoring and replay work, but this class intentionally
 * contains no project state machine or pass/fail logic.
 */
export class Subject2Ground implements DrivingGround {
  public readonly colliders: readonly StaticCollider[];
  public readonly root = new THREE.Group();
  public readonly config: Subject2GroundConfig;
  public readonly metadata: Subject2MapMetadata;
  public readonly worldBounds: DrivingGround['worldBounds'];
  public readonly spawnPose: TrackSpawnPose;

  private readonly materials;
  private readonly surfaces = new Subject2SurfaceRegistry();

  public constructor(options: Subject2GroundOptions = {}) {
    this.config = options.config ?? DEFAULT_SUBJECT2_GROUND_CONFIG;
    const layout = createSubject2Layout(this.config);
    this.metadata = createSubject2MapMetadata(this.config, layout);
    this.worldBounds = Object.freeze({
      minX: this.metadata.bounds.minimumX,
      maxX: this.metadata.bounds.maximumX,
      minZ: this.metadata.bounds.minimumZ,
      maxZ: this.metadata.bounds.maximumZ,
    });
    const spawn = layout.waitingRoute[0] ?? this.config.layout.waitingCenter;
    this.spawnPose = Object.freeze({
      position: new THREE.Vector3(spawn.x, this.getRoadHeightAt(spawn.x, spawn.z) + 0.04, spawn.z),
      yawRadians: -Math.PI * 0.5,
    });
    this.materials = createSubject2Materials();
    this.root.name = 'Subject 2 training ground';
    this.root.userData.renderCategory = 'WORLD';
    this.root.userData.mapId = this.metadata.id;
    this.root.userData.routeMetadata = this.metadata;

    this.buildBaseGround(options.shadows ?? true);
    const context: Subject2BuildContext = {
      config: this.config,
      layout,
      materials: this.materials,
      surfaces: this.surfaces,
      heightAt: (x, z) => this.getRoadHeightAt(x, z),
      shadows: options.shadows ?? true,
    };

    // Connections go down first so project aprons hide their joins; every
    // section still uses the same height sampler and has no physical seam.
    const environment = new Environment(context);
    this.colliders = environment.colliders;
    const modules = [
      new ConnectionRoads(context),
      new WaitingArea(context),
      new ReverseParkingArea(context),
      new SideParkingArea(context),
      new RightAngleTurnArea(context),
      new CurveDrivingArea(context),
      new HillStartArea(context),
      new FinishArea(context),
      environment,
    ];
    for (const module of modules) this.root.add(module.root);
  }

  public getRoadHeightAt(x: number, z: number): number {
    const entry = this.config.layout.hillEntry;
    const hill = this.config.hillStart;
    const distance = entry.z - z;
    const totalLength = hill.uphillLength + hill.crestLength + hill.downhillLength;
    if (distance <= 0 || distance >= totalLength) return 0;

    const rise = easedRampHeight(
      hill.uphillLength,
      hill.uphillLength,
      hill.slope,
      hill.transitionLength,
    );
    let longitudinalHeight: number;
    if (distance < hill.uphillLength) {
      longitudinalHeight = easedRampHeight(
        distance,
        hill.uphillLength,
        hill.slope,
        hill.transitionLength,
      );
    } else if (distance <= hill.uphillLength + hill.crestLength) {
      longitudinalHeight = rise;
    } else {
      const downhillDistance = distance - hill.uphillLength - hill.crestLength;
      longitudinalHeight = rise - easedRampHeight(
        downhillDistance,
        hill.downhillLength,
        hill.slope,
        hill.transitionLength,
      );
    }

    const lateralDistance = Math.abs(x - entry.x);
    const fullHeightHalfWidth = hill.laneWidth * 0.5 + 0.55;
    const embankmentOuterHalfWidth = fullHeightHalfWidth + 4.8;
    const lateralBlend = 1 - smoothstep01(
      (lateralDistance - fullHeightHalfWidth)
      / (embankmentOuterHalfWidth - fullHeightHalfWidth),
    );
    return longitudinalHeight * lateralBlend;
  }

  public getRoadPitchAt(x: number, z: number, yawRadians = 0): number {
    const direction = new THREE.Vector2(-Math.sin(yawRadians), -Math.cos(yawRadians));
    return Math.atan(this.sampleRoadSurface(x, z, direction).grade);
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

  public getRoadMarkingDiagnostics(): Subject2RoadMarkingDiagnostics {
    let vertexCount = 0;
    let minimumSurfaceClearance = Number.POSITIVE_INFINITY;
    let maximumSurfaceClearance = Number.NEGATIVE_INFINITY;
    let maximumClearanceError = 0;
    let maximumJoinGap = 0;
    let minimumWorldHeight = Number.POSITIVE_INFINITY;
    let maximumWorldHeight = Number.NEGATIVE_INFINITY;
    const point = new THREE.Vector3();

    this.root.updateWorldMatrix(true, true);
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.subject2RoadMarking !== true) return;
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        point.set(positions.getX(index), positions.getY(index), positions.getZ(index));
        object.localToWorld(point);
        const clearance = point.y - (
          this.getRoadHeightAt(point.x, point.z) + SUBJECT2_ROAD_SURFACE_OFFSET
        );
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
      const joinGap = object.geometry.userData.maximumJoinGap;
      if (typeof joinGap === 'number') maximumJoinGap = Math.max(maximumJoinGap, joinGap);
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
      maximumJoinGap,
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
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) materials.add(material);
    });
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

  private buildBaseGround(shadows: boolean): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.config.site.length + 32, this.config.site.width + 32),
      this.materials.grass,
    );
    ground.name = 'Subject 2 grass base';
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.055;
    ground.receiveShadow = shadows;
    this.root.add(ground);
  }

  private sampleSurfaceResponse(
    x: number,
    z: number,
  ): SurfaceMaterial {
    const surface = this.config.surface;
    const asphalt = calibratedSurfaceMaterial('asphalt', surface.asphaltGrip, surface.asphaltRollingResistance);
    const shoulder = calibratedSurfaceMaterial('compact-shoulder', surface.shoulderGrip, surface.shoulderRollingResistance);
    const grass = calibratedSurfaceMaterial('grass', surface.grassGrip, surface.grassRollingResistance);
    const distance = this.surfaces.distanceFromAsphalt(x, z);
    if (distance <= 0) {
      return asphalt;
    }
    const blend = Math.max(surface.shoulderBlendDepth, 0.05);
    if (distance <= blend) {
      const t = smoothstep01(distance / blend);
      return blendSurfaceMaterials(asphalt, shoulder, t);
    }
    if (distance <= blend * 2) {
      const t = smoothstep01((distance - blend) / blend);
      return blendSurfaceMaterials(shoulder, grass, t);
    }
    return grass;
  }
}
