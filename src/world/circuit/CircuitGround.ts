import * as THREE from 'three';
import type { DrivingGround } from '../DrivingGround';
import type { StaticCollider } from '../../vehicle/physics/CollisionSystem';
import type { RoadSurfaceSample, TrackSpawnPose } from '../DrivingTestTrack';
import {
  blendSurfaceMaterials,
  calibratedSurfaceMaterial,
  surfaceResponseAliases,
  type SurfaceMaterial,
} from '../SurfaceMaterial';
import {
  DEFAULT_CIRCUIT_TRACK_CONFIG,
  type CircuitTrackConfig,
} from './CircuitTrackConfig';
import {
  CIRCUIT_ROAD_SURFACE_OFFSET,
  measureCircuitRibbonJoinGap,
} from './geometry';
import { createCircuitMaterials } from './materials';
import { StartFinishArea, CIRCUIT_SPAWN_DISTANCE } from './StartFinishArea';
import { TrackEnvironment } from './TrackEnvironment';
import { TrackGeometry } from './TrackGeometry';
import { createCircuitMapMetadata, createCircuitTrackLayout } from './TrackLayout';
import type {
  CircuitGroundOptions,
  CircuitMapMetadata,
  CircuitMarkingDiagnostics,
} from './types';

const smoothstep01 = (value: number): number => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export class CircuitGround implements DrivingGround {
  public readonly root = new THREE.Group();
  public readonly config: CircuitTrackConfig;
  public readonly metadata: CircuitMapMetadata;
  public readonly routeCurve: THREE.Curve<THREE.Vector3>;
  public readonly worldBounds: DrivingGround['worldBounds'];
  public readonly spawnPose: TrackSpawnPose;
  public readonly colliders: readonly StaticCollider[];

  private readonly routeSamples: readonly CircuitMapMetadata['routeCenterline'][number][];
  private readonly materials;

  public constructor(options: CircuitGroundOptions = {}) {
    this.config = options.config ?? DEFAULT_CIRCUIT_TRACK_CONFIG;
    const layout = createCircuitTrackLayout(this.config);
    this.routeCurve = layout.curve;
    this.metadata = createCircuitMapMetadata(this.config, layout);
    this.routeSamples = this.metadata.routeCenterline;
    this.worldBounds = Object.freeze({
      minX: Math.min(layout.bounds.minimumX, -236),
      maxX: layout.bounds.maximumX,
      minZ: layout.bounds.minimumZ,
      maxZ: layout.bounds.maximumZ,
    });
    const spawnT = CIRCUIT_SPAWN_DISTANCE / layout.lapLength;
    const spawn = layout.curve.getPointAt(spawnT);
    const tangent = layout.curve.getTangentAt(spawnT).normalize();
    this.spawnPose = Object.freeze({
      position: new THREE.Vector3(spawn.x, 0.04, spawn.z),
      yawRadians: Math.atan2(-tangent.x, -tangent.z),
    });
    this.materials = createCircuitMaterials();
    this.root.name = 'Simple closed circuit';
    this.root.userData.renderCategory = 'WORLD';
    this.root.userData.mapId = this.metadata.id;
    this.root.userData.routeMetadata = this.metadata;

    const shadows = options.shadows ?? true;
    this.buildGround(shadows);
    const base = new StartFinishArea(this.config, layout, this.materials, shadows);
    const environment = new TrackEnvironment(this.config, layout, this.materials, shadows);
    this.colliders = [...base.colliders, ...environment.colliders];
    this.root.add(
      new TrackGeometry(this.config, layout, this.materials, shadows).root,
      base.root,
      environment.root,
    );
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
    _direction: THREE.Vector2Like = { x: 0, y: -1 },
  ): RoadSurfaceSample {
    const response = this.sampleSurfaceResponse(x, z);
    return {
      height: 0,
      gradient: new THREE.Vector2(),
      normal: new THREE.Vector3(0, 1, 0),
      grade: 0,
      ...surfaceResponseAliases(response),
    };
  }

  public getRoadMarkingDiagnostics(): CircuitMarkingDiagnostics {
    let vertexCount = 0;
    let minimumSurfaceClearance = Number.POSITIVE_INFINITY;
    let maximumSurfaceClearance = Number.NEGATIVE_INFINITY;
    let maximumClearanceError = 0;
    let maximumJoinGap = 0;
    const point = new THREE.Vector3();
    this.root.updateWorldMatrix(true, true);
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.circuitRoadMarking !== true) return;
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        point.set(positions.getX(index), positions.getY(index), positions.getZ(index));
        object.localToWorld(point);
        const clearance = point.y - CIRCUIT_ROAD_SURFACE_OFFSET;
        vertexCount += 1;
        minimumSurfaceClearance = Math.min(minimumSurfaceClearance, clearance);
        maximumSurfaceClearance = Math.max(maximumSurfaceClearance, clearance);
        maximumClearanceError = Math.max(
          maximumClearanceError,
          Math.abs(clearance - this.config.markings.surfaceClearance),
        );
      }
      if (object.geometry.userData.circuitClosedRibbon === true) {
        maximumJoinGap = Math.max(
          maximumJoinGap,
          measureCircuitRibbonJoinGap(object.geometry),
        );
      }
    });
    if (vertexCount === 0) {
      minimumSurfaceClearance = 0;
      maximumSurfaceClearance = 0;
    }
    return {
      vertexCount,
      minimumSurfaceClearance,
      maximumSurfaceClearance,
      maximumClearanceError,
      maximumJoinGap,
    };
  }

  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
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

  private buildGround(shadows: boolean): void {
    const width = this.worldBounds.maxX - this.worldBounds.minX;
    const depth = this.worldBounds.maxZ - this.worldBounds.minZ;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.materials.grass);
    ground.name = 'Circuit grass runoff';
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.set(
      (this.worldBounds.minX + this.worldBounds.maxX) * 0.5,
      -0.045,
      (this.worldBounds.minZ + this.worldBounds.maxZ) * 0.5,
    );
    ground.receiveShadow = shadows;
    this.root.add(ground);
  }

  private sampleSurfaceResponse(
    x: number,
    z: number,
  ): SurfaceMaterial {
    const distanceToCentre = this.distanceToRoute(x, z);
    let distanceFromAsphalt = Math.max(0, distanceToCentre - this.config.trackWidth * 0.5);
    distanceFromAsphalt = Math.min(
      distanceFromAsphalt,
      this.distanceOutsideRectangle(x, z, -205.5, -183.5, -71, 55),
      this.distanceOutsideRectangle(x, z, -191.25, -173.75, -57.75, -50.25),
      this.distanceOutsideRectangle(x, z, -191.25, -173.75, 34.25, 41.75),
    );
    const surface = this.config.surface;
    const asphalt = calibratedSurfaceMaterial('asphalt', surface.asphaltGrip, surface.asphaltRollingResistance);
    const shoulder = calibratedSurfaceMaterial('compact-shoulder', surface.shoulderGrip, surface.shoulderRollingResistance);
    const grass = calibratedSurfaceMaterial('grass', surface.grassGrip, surface.grassRollingResistance);
    if (distanceFromAsphalt <= 0) {
      return asphalt;
    }
    const transition = Math.max(0.1, surface.transitionDepth);
    const shoulderBlend = smoothstep01(distanceFromAsphalt / transition);
    const shoulderResponse = blendSurfaceMaterials(asphalt, shoulder, shoulderBlend);
    const grassBlend = smoothstep01(
      (distanceFromAsphalt - this.config.shoulderWidth) / transition,
    );
    return blendSurfaceMaterials(shoulderResponse, grass, grassBlend);
  }

  private distanceToRoute(x: number, z: number): number {
    let minimumSquared = Number.POSITIVE_INFINITY;
    for (let index = 1; index < this.routeSamples.length; index += 1) {
      const a = this.routeSamples[index - 1]!;
      const b = this.routeSamples[index]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSquared = dx * dx + dz * dz;
      const projection = lengthSquared > 1e-9
        ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1)
        : 0;
      const nearestX = a.x + dx * projection;
      const nearestZ = a.z + dz * projection;
      minimumSquared = Math.min(
        minimumSquared,
        (x - nearestX) ** 2 + (z - nearestZ) ** 2,
      );
    }
    return Math.sqrt(minimumSquared);
  }

  private distanceOutsideRectangle(
    x: number,
    z: number,
    minimumX: number,
    maximumX: number,
    minimumZ: number,
    maximumZ: number,
  ): number {
    return Math.hypot(
      Math.max(minimumX - x, 0, x - maximumX),
      Math.max(minimumZ - z, 0, z - maximumZ),
    );
  }
}
