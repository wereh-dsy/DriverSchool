import * as THREE from 'three';
import {
  createBarrierColliders,
  createStaticOBBCollider,
  type StaticCollider,
} from '../vehicle/physics/CollisionSystem';
import {
  blendSurfaceMaterials,
  sampleGroundGeometry,
  surfaceResponseAliases,
  SURFACE_MATERIALS,
  type RoadSurfaceSample,
  type SurfaceMaterial,
} from './SurfaceMaterial';

export type { RoadSurfaceSample } from './SurfaceMaterial';

export interface RoadMarkingDiagnostics {
  readonly vertexCount: number;
  /** Smallest vertical clearance above the sampled asphalt ribbon. */
  readonly minSurfaceClearance: number;
  /** Largest vertical clearance above the sampled asphalt ribbon. */
  readonly maxSurfaceClearance: number;
  /** Error from the authored, millimetre-scale marking clearance. */
  readonly maxClearanceError: number;
  /** Positional mismatch where two subdivisions of one stripe meet. */
  readonly maxJoinGap: number;
  readonly minimumWorldHeight: number;
  readonly maximumWorldHeight: number;
}

export interface DrivingTestTrackOptions {
  readonly roadWidth?: number;
  readonly shoulderWidth?: number;
  readonly treeCount?: number;
  readonly shadows?: boolean;
}

export interface TrackSpawnPose {
  readonly position: THREE.Vector3;
  /** Radians around +Y; zero points the vehicle toward world -Z. */
  readonly yawRadians: number;
}

type HeightSampler = (x: number, z: number) => number;

interface DistanceRange {
  readonly start: number;
  readonly end: number;
}

const ROAD_SURFACE_OFFSET = 0.025;
const ROAD_MARKING_CLEARANCE = 0.008;
const ROAD_MARKING_HEIGHT = ROAD_SURFACE_OFFSET + ROAD_MARKING_CLEARANCE;
const MAX_MARKING_SEGMENT_LENGTH = 0.7;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const makeBox = (
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: THREE.Material,
  shadows: boolean,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
};

const createRoadRibbonGeometry = (
  curve: THREE.Curve<THREE.Vector3>,
  width: number,
  samples: number,
  heightAt: HeightSampler,
  yOffset: number,
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const right = new THREE.Vector3();

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const centre = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    right.set(-tangent.z, 0, tangent.x).normalize();

    for (const side of [-1, 1]) {
      const x = centre.x + right.x * width * 0.5 * side;
      const z = centre.z + right.z * width * 0.5 * side;
      positions.push(x, heightAt(x, z) + yOffset, z);
      uvs.push(side < 0 ? 0 : 1, t * 64);
    }
  }

  for (let index = 0; index < samples; index += 1) {
    const left = index * 2;
    const rightIndex = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    // Counter-clockwise from above, so the default FrontSide material faces +Y.
    indices.push(left, rightIndex, nextLeft, rightIndex, nextRight, nextLeft);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

/**
 * A road-space stripe rather than a horizontal box. Every short subdivision
 * samples both of its edges from the same height field as the asphalt, so it
 * stays flush through hill transitions, bends and crossfall.
 */
const createRoadMarkingRibbonGeometry = (
  curve: THREE.Curve<THREE.Vector3>,
  lateralOffset: number,
  width: number,
  ranges: readonly DistanceRange[],
  heightAt: HeightSampler,
): THREE.BufferGeometry => {
  const curveLength = curve.getLength();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  let maxJoinGap = 0;

  const writePair = (distance: number): readonly [THREE.Vector3, THREE.Vector3] => {
    const t = THREE.MathUtils.clamp(distance / curveLength, 0, 1);
    const centre = curve.getPointAt(t);
    tangent.copy(curve.getTangentAt(t)).normalize();
    right.set(-tangent.z, 0, tangent.x).normalize();
    const markingCentreX = centre.x + right.x * lateralOffset;
    const markingCentreZ = centre.z + right.z * lateralOffset;
    const halfWidth = width * 0.5;
    const leftX = markingCentreX - right.x * halfWidth;
    const leftZ = markingCentreZ - right.z * halfWidth;
    const rightX = markingCentreX + right.x * halfWidth;
    const rightZ = markingCentreZ + right.z * halfWidth;
    return [
      new THREE.Vector3(leftX, heightAt(leftX, leftZ) + ROAD_MARKING_HEIGHT, leftZ),
      new THREE.Vector3(rightX, heightAt(rightX, rightZ) + ROAD_MARKING_HEIGHT, rightZ),
    ];
  };

  for (const range of ranges) {
    const start = THREE.MathUtils.clamp(range.start, 0, curveLength);
    const end = THREE.MathUtils.clamp(range.end, start, curveLength);
    const segmentCount = Math.max(1, Math.ceil((end - start) / MAX_MARKING_SEGMENT_LENGTH));
    let previousEnd: readonly [THREE.Vector3, THREE.Vector3] | undefined;

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const startDistance = THREE.MathUtils.lerp(start, end, segment / segmentCount);
      const endDistance = THREE.MathUtils.lerp(start, end, (segment + 1) / segmentCount);
      const startPair = writePair(startDistance);
      const endPair = writePair(endDistance);
      if (previousEnd) {
        maxJoinGap = Math.max(
          maxJoinGap,
          previousEnd[0].distanceTo(startPair[0]),
          previousEnd[1].distanceTo(startPair[1]),
        );
      }

      const base = positions.length / 3;
      positions.push(
        startPair[0].x, startPair[0].y, startPair[0].z,
        startPair[1].x, startPair[1].y, startPair[1].z,
        endPair[0].x, endPair[0].y, endPair[0].z,
        endPair[1].x, endPair[1].y, endPair[1].z,
      );
      uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      previousEnd = endPair;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData.roadMarkingMaxJoinGap = maxJoinGap;
  return geometry;
};

const makeHorizontalMarking = (
  name: string,
  width: number,
  depth: number,
  x: number,
  z: number,
  surfaceHeight: number,
  material: THREE.Material,
): THREE.Mesh => {
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const marking = new THREE.Mesh(geometry, material);
  marking.name = name;
  marking.position.set(x, surfaceHeight + ROAD_MARKING_CLEARANCE, z);
  return marking;
};

/**
 * A compact proving ground with roughly 1.9 km of main road.  The long west
 * straight carries a real 8 m hill; a broad return curve supplies sustained
 * cornering, while the north bend and parking access are deliberately tighter.
 */
export class DrivingTestTrack {
  public readonly root = new THREE.Group();
  public readonly colliders: StaticCollider[] = [];
  public readonly metadata = Object.freeze({
    id: 'road-course',
    version: 2,
    displayName: '综合公路练习场',
    description: '长直道、连续弯道、坡道与停车区的综合驾驶练习场',
  });
  public readonly worldBounds = Object.freeze({
    minX: -380,
    maxX: 520,
    minZ: -820,
    maxZ: 250,
  });
  public readonly mainCourseCurve: THREE.CatmullRomCurve3;
  public readonly spawnPose: TrackSpawnPose = {
    position: new THREE.Vector3(-2.6, 0.04, 118),
    yawRadians: 0,
  };

  public readonly roadWidth: number;
  public readonly shoulderWidth: number;

  private readonly shadows: boolean;
  private readonly drivableCourseSamples: readonly THREE.Vector3[];

  public constructor(options: DrivingTestTrackOptions = {}) {
    this.root.name = 'Driving test track';
    this.root.userData.renderCategory = 'WORLD';
    this.roadWidth = options.roadWidth ?? 11.5;
    this.shoulderWidth = Math.max(options.shoulderWidth ?? 14.5, this.roadWidth + 1.5);
    this.shadows = options.shadows ?? true;

    this.mainCourseCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 160),
        new THREE.Vector3(0, 0, 80),
        new THREE.Vector3(0, 0, -80),
        new THREE.Vector3(0, 0, -240),
        new THREE.Vector3(0, 0, -430),
        new THREE.Vector3(0, 0, -590),
        new THREE.Vector3(24, 0, -656),
        new THREE.Vector3(92, 0, -705),
        new THREE.Vector3(185, 0, -718),
        new THREE.Vector3(270, 0, -687),
        new THREE.Vector3(326, 0, -615),
        new THREE.Vector3(347, 0, -510),
        new THREE.Vector3(344, 0, -365),
        new THREE.Vector3(330, 0, -215),
        new THREE.Vector3(300, 0, -93),
        new THREE.Vector3(260, 0, 5),
        new THREE.Vector3(215, 0, 89),
        new THREE.Vector3(154, 0, 143),
        new THREE.Vector3(72, 0, 169),
      ],
      true,
      'catmullrom',
      0.16,
    );
    this.drivableCourseSamples = this.mainCourseCurve.getSpacedPoints(420);

    this.buildGround();
    this.buildRoadNetwork();
    this.buildMarkings();
    this.buildGuardrails();
    this.buildRoadsideFurniture();
    this.buildParkingArea();
    this.buildIntersection();
    this.buildBuildings();
    this.buildTrees(options.treeCount ?? 92);
    this.buildSigns();
  }

  /**
   * Road/terrain height in metres.  The hill is blended into a broad earth
   * embankment so wheels and scenery can use exactly the same surface sample.
   */
  public getRoadHeightAt(x: number, z: number): number {
    const lateralBlend = 1 - smoothstep(18, 52, Math.abs(x));
    if (lateralBlend <= 0 || z > -175 || z < -470) return 0;

    let profile = 0;
    if (z >= -260) {
      profile = smoothstep(-175, -260, z);
    } else if (z >= -350) {
      profile = 1;
    } else {
      profile = 1 - smoothstep(-350, -460, z);
    }
    return profile * lateralBlend * 8;
  }

  /**
   * Signed grade in an arbitrary horizontal travel direction.  Direction is
   * normalized internally; the default (0,-1) matches the starting straight.
   */
  public getRoadGradeAt(
    x: number,
    z: number,
    direction: THREE.Vector2Like = { x: 0, y: -1 },
  ): number {
    return this.sampleRoadSurface(x, z, direction).grade;
  }

  public getRoadPitchAt(x: number, z: number, yawRadians = 0): number {
    const direction = new THREE.Vector2(-Math.sin(yawRadians), -Math.cos(yawRadians));
    return Math.atan(this.getRoadGradeAt(x, z, direction));
  }

  public getRoadNormalAt(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
    const epsilon = 0.2;
    const slopeX = (
      this.getRoadHeightAt(x + epsilon, z) - this.getRoadHeightAt(x - epsilon, z)
    ) / (2 * epsilon);
    const slopeZ = (
      this.getRoadHeightAt(x, z + epsilon) - this.getRoadHeightAt(x, z - epsilon)
    ) / (2 * epsilon);
    return target.set(-slopeX, 1, -slopeZ).normalize();
  }

  public sampleRoadSurface(
    x: number,
    z: number,
    direction: THREE.Vector2Like = { x: 0, y: -1 },
  ): RoadSurfaceSample {
    return {
      ...sampleGroundGeometry((sampleX, sampleZ) => this.getRoadHeightAt(sampleX, sampleZ), x, z, direction, 0.2),
      ...surfaceResponseAliases(this.sampleSurfaceResponse(x, z)),
    };
  }

  /**
   * Debug/CI aid for verifying that sampled hill markings remain a thin decal
   * over the asphalt instead of becoming horizontal, floating boxes.
   */
  public getRoadMarkingDiagnostics(): RoadMarkingDiagnostics {
    let vertexCount = 0;
    let minSurfaceClearance = Number.POSITIVE_INFINITY;
    let maxSurfaceClearance = Number.NEGATIVE_INFINITY;
    let maxClearanceError = 0;
    let maxJoinGap = 0;
    let minimumWorldHeight = Number.POSITIVE_INFINITY;
    let maximumWorldHeight = Number.NEGATIVE_INFINITY;

    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.roadConformingMarking !== true) return;
      const position = object.geometry.getAttribute('position');
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        const clearance = y - (this.getRoadHeightAt(x, z) + ROAD_SURFACE_OFFSET);
        vertexCount += 1;
        minSurfaceClearance = Math.min(minSurfaceClearance, clearance);
        maxSurfaceClearance = Math.max(maxSurfaceClearance, clearance);
        maxClearanceError = Math.max(maxClearanceError, Math.abs(clearance - ROAD_MARKING_CLEARANCE));
        minimumWorldHeight = Math.min(minimumWorldHeight, y);
        maximumWorldHeight = Math.max(maximumWorldHeight, y);
      }
      const joinGap = object.geometry.userData.roadMarkingMaxJoinGap;
      if (typeof joinGap === 'number') maxJoinGap = Math.max(maxJoinGap, joinGap);
    });

    if (vertexCount === 0) {
      minSurfaceClearance = 0;
      maxSurfaceClearance = 0;
      minimumWorldHeight = 0;
      maximumWorldHeight = 0;
    }
    return {
      vertexCount,
      minSurfaceClearance,
      maxSurfaceClearance,
      maxClearanceError,
      maxJoinGap,
      minimumWorldHeight,
      maximumWorldHeight,
    };
  }

  /** Broad-phase helper for reset logic; it intentionally includes shoulders. */
  public isOnDrivableSurface(x: number, z: number): boolean {
    const onMainCourse = this.getDistanceToMainCourse(x, z) <= this.shoulderWidth * 0.52;
    const onCrossRoad = z >= 24 && z <= 36 && x >= -145 && x <= 180;
    const inParking = x >= 70 && x <= 140 && z >= 45 && z <= 88;
    const onParkingAccess = x >= 99 && x <= 111 && z >= 30 && z <= 50;
    return onMainCourse || onCrossRoad || inParking || onParkingAccess;
  }

  private sampleSurfaceResponse(
    x: number,
    z: number,
  ): SurfaceMaterial {
    const distanceFromMainAsphalt = Math.max(
      0,
      this.getDistanceToMainCourse(x, z) - this.roadWidth * 0.5,
    );
    const distanceFromPavement = Math.min(
      distanceFromMainAsphalt,
      this.getDistanceOutsideRectangle(x, z, -145, 180, 24, 36),
      this.getDistanceOutsideRectangle(x, z, 70, 140, 45, 88),
      this.getDistanceOutsideRectangle(x, z, 99, 111, 30, 50),
    );

    // Preserve the authored asphalt response exactly. Beyond its edge, blend
    // first into the compacted shoulder, then gradually into grass so a tyre
    // crossing the boundary never receives a one-frame grip discontinuity.
    const shoulderDepth = Math.max(0.35, (this.shoulderWidth - this.roadWidth) * 0.5);
    const shoulderBlendDistance = Math.min(0.6, shoulderDepth * 0.8);
    const shoulderBlend = smoothstep(0, shoulderBlendDistance, distanceFromPavement);
    const shoulderResponse = blendSurfaceMaterials(
      SURFACE_MATERIALS.asphalt,
      SURFACE_MATERIALS['compact-shoulder'],
      shoulderBlend,
    );
    const grassBlend = smoothstep(
      shoulderDepth,
      shoulderDepth + 1.5,
      distanceFromPavement,
    );
    return blendSurfaceMaterials(shoulderResponse, SURFACE_MATERIALS.grass, grassBlend);
  }

  private getDistanceToMainCourse(x: number, z: number): number {
    let closestSquared = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.drivableCourseSamples.length; index += 1) {
      const start = this.drivableCourseSamples[index];
      const end = this.drivableCourseSamples[(index + 1) % this.drivableCourseSamples.length];
      if (!start || !end) continue;
      const segmentX = end.x - start.x;
      const segmentZ = end.z - start.z;
      const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
      const projection = segmentLengthSquared > 1e-9
        ? THREE.MathUtils.clamp(
          ((x - start.x) * segmentX + (z - start.z) * segmentZ) / segmentLengthSquared,
          0,
          1,
        )
        : 0;
      const nearestX = start.x + segmentX * projection;
      const nearestZ = start.z + segmentZ * projection;
      const deltaX = x - nearestX;
      const deltaZ = z - nearestZ;
      closestSquared = Math.min(closestSquared, deltaX * deltaX + deltaZ * deltaZ);
    }
    return Math.sqrt(closestSquared);
  }

  private getDistanceOutsideRectangle(
    x: number,
    z: number,
    minimumX: number,
    maximumX: number,
    minimumZ: number,
    maximumZ: number,
  ): number {
    const deltaX = Math.max(minimumX - x, 0, x - maximumX);
    const deltaZ = Math.max(minimumZ - z, 0, z - maximumZ);
    return Math.hypot(deltaX, deltaZ);
  }

  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of meshMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  private buildGround(): void {
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x718153,
      roughness: 1,
      metalness: 0,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1150), groundMaterial);
    ground.name = 'Grass proving ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(145, -0.09, -270);
    ground.receiveShadow = this.shadows;
    this.root.add(ground);

    const embankmentGeometry = new THREE.PlaneGeometry(120, 330, 24, 66);
    embankmentGeometry.rotateX(-Math.PI / 2);
    const positions = embankmentGeometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const localZ = positions.getZ(index);
      const z = localZ - 322;
      positions.setXYZ(index, x, this.getRoadHeightAt(x, z) - 0.055, z);
    }
    positions.needsUpdate = true;
    embankmentGeometry.computeVertexNormals();
    const embankment = new THREE.Mesh(embankmentGeometry, groundMaterial);
    embankment.name = 'Hill embankment';
    embankment.receiveShadow = this.shadows;
    this.root.add(embankment);
  }

  private buildRoadNetwork(): void {
    const shoulderMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b6962,
      roughness: 0.98,
    });
    const asphaltMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c3033,
      roughness: 0.94,
      metalness: 0.01,
    });
    const sampleHeight = (x: number, z: number): number => this.getRoadHeightAt(x, z);

    const shoulder = new THREE.Mesh(
      createRoadRibbonGeometry(this.mainCourseCurve, this.shoulderWidth, 520, sampleHeight, 0.005),
      shoulderMaterial,
    );
    shoulder.name = 'Main course compacted shoulders';
    shoulder.receiveShadow = this.shadows;
    this.root.add(shoulder);

    const road = new THREE.Mesh(
      createRoadRibbonGeometry(
        this.mainCourseCurve,
        this.roadWidth,
        520,
        sampleHeight,
        ROAD_SURFACE_OFFSET,
      ),
      asphaltMaterial,
    );
    road.name = 'Main course asphalt';
    road.receiveShadow = this.shadows;
    this.root.add(road);

    const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(325, 12), asphaltMaterial);
    crossRoad.name = 'Four-way intersection cross road';
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.set(17.5, 0.027, 30);
    crossRoad.receiveShadow = this.shadows;
    this.root.add(crossRoad);

    const accessRoad = new THREE.Mesh(new THREE.PlaneGeometry(12, 21), asphaltMaterial);
    accessRoad.name = 'Parking access road';
    accessRoad.rotation.x = -Math.PI / 2;
    accessRoad.position.set(105, 0.029, 43);
    accessRoad.receiveShadow = this.shadows;
    this.root.add(accessRoad);
  }

  private buildMarkings(): void {
    const white = new THREE.MeshBasicMaterial({
      color: 0xf3f0dc,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const yellow = new THREE.MeshBasicMaterial({
      color: 0xf2c649,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const curveLength = this.mainCourseCurve.getLength();
    const dashLength = 4.2;
    const dashSpacing = 10;
    const dashRanges: DistanceRange[] = [];
    for (let start = (dashSpacing - dashLength) * 0.5; start < curveLength; start += dashSpacing) {
      dashRanges.push({ start, end: Math.min(start + dashLength, curveLength) });
    }
    const sampleHeight = (x: number, z: number): number => this.getRoadHeightAt(x, z);
    const dashes = new THREE.Mesh(
      createRoadMarkingRibbonGeometry(
        this.mainCourseCurve,
        0,
        0.105,
        dashRanges,
        sampleHeight,
      ),
      yellow,
    );
    dashes.name = 'Main course dashed centre line';
    dashes.userData.roadConformingMarking = true;
    this.root.add(dashes);

    const makeEdgeLine = (offset: number, name: string): THREE.Mesh => {
      const line = new THREE.Mesh(
        createRoadMarkingRibbonGeometry(
          this.mainCourseCurve,
          offset,
          0.09,
          [{ start: 0, end: curveLength }],
          sampleHeight,
        ),
        white,
      );
      line.name = name;
      line.userData.roadConformingMarking = true;
      return line;
    };
    this.root.add(
      makeEdgeLine(-this.roadWidth * 0.46, 'Left road edge line'),
      makeEdgeLine(this.roadWidth * 0.46, 'Right road edge line'),
    );

    const crossDashGeometry = new THREE.PlaneGeometry(4.2, 0.105);
    crossDashGeometry.rotateX(-Math.PI / 2);
    const crossDashes = new THREE.InstancedMesh(crossDashGeometry, yellow, 26);
    crossDashes.name = 'Intersection road centre line';
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 26; index += 1) {
      dummy.position.set(
        -140 + index * 12,
        ROAD_SURFACE_OFFSET + 0.002 + ROAD_MARKING_CLEARANCE,
        30,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      crossDashes.setMatrixAt(index, dummy.matrix);
    }
    crossDashes.instanceMatrix.needsUpdate = true;
    this.root.add(crossDashes);

    for (const x of [-7, 7]) {
      const stopLine = makeHorizontalMarking(
        'Intersection stop line',
        5.3,
        0.24,
        x,
        30,
        ROAD_SURFACE_OFFSET + 0.002,
        white,
      );
      this.root.add(stopLine);
    }

    for (let stripe = 0; stripe < 7; stripe += 1) {
      const zebra = makeHorizontalMarking(
        'Pedestrian crossing stripe',
        0.46,
        4.5,
        -2 + stripe * 0.67,
        39,
        ROAD_SURFACE_OFFSET + 0.002,
        white,
      );
      this.root.add(zebra);
    }
  }

  private buildGuardrails(): void {
    const steel = new THREE.MeshStandardMaterial({
      color: 0xb2b8ba,
      roughness: 0.42,
      metalness: 0.72,
    });
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x72787a, roughness: 0.6, metalness: 0.5 });

    for (const x of [-7.35, 7.35]) {
      for (let z = -184; z >= -460; z -= 8) {
        const nextZ = Math.max(-460, z - 8);
        const y1 = this.getRoadHeightAt(x, z);
        const y2 = this.getRoadHeightAt(x, nextZ);
        const start = new THREE.Vector3(x, y1 + 0.56, z);
        const end = new THREE.Vector3(x, y2 + 0.56, nextZ);
        this.colliders.push(...createBarrierColliders({
          id: `road-slope:${x}:${z}`, start, end, thickness: 0.12,
          minHeight: Math.min(y1, y2) + 0.48,
          maxHeight: Math.max(y1, y2) + 0.64,
          type: 'guardrail',
        }));
        const direction = end.clone().sub(start);
        const length = direction.length();
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, length + 0.08), steel);
        beam.name = 'Slope guardrail beam';
        beam.position.copy(start).add(end).multiplyScalar(0.5);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
        beam.castShadow = this.shadows;
        this.root.add(beam);

        const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.11), postMaterial);
        post.name = 'Guardrail post';
        post.position.set(x, y1 + 0.29, z);
        post.castShadow = this.shadows;
        this.root.add(post);
      }
    }
  }

  private buildRoadsideFurniture(): void {
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0xe4e1d7, roughness: 0.75 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x31363a, roughness: 0.62, metalness: 0.35 });
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7e8b0,
      emissive: 0xffd36b,
      emissiveIntensity: 1.2,
      roughness: 0.28,
    });

    const edgePostCount = 116;
    const edgePosts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.72, 0.12), postMaterial, edgePostCount);
    edgePosts.name = 'Road boundary marker posts';
    const dummy = new THREE.Object3D();
    for (let index = 0; index < edgePostCount / 2; index += 1) {
      const t = index / (edgePostCount / 2);
      const point = this.mainCourseCurve.getPointAt(t);
      const tangent = this.mainCourseCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const side = sideIndex === 0 ? -1 : 1;
        const x = point.x + right.x * this.shoulderWidth * 0.57 * side;
        const z = point.z + right.z * this.shoulderWidth * 0.57 * side;
        dummy.position.set(x, this.getRoadHeightAt(x, z) + 0.34, z);
        dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
        dummy.updateMatrix();
        edgePosts.setMatrixAt(index * 2 + sideIndex, dummy.matrix);
      }
    }
    edgePosts.instanceMatrix.needsUpdate = true;
    edgePosts.castShadow = this.shadows;
    this.root.add(edgePosts);

    const lampPositions: Array<readonly [number, number]> = [];
    for (let z = 115; z >= -565; z -= 55) {
      lampPositions.push([-10.5, z], [10.5, z]);
    }
    for (let x = -125; x <= 160; x += 48) lampPositions.push([x, 39]);

    const poleGeometry = new THREE.CylinderGeometry(0.065, 0.09, 6.4, 8);
    const headGeometry = new THREE.BoxGeometry(0.64, 0.12, 0.24);
    const poles = new THREE.InstancedMesh(poleGeometry, darkMaterial, lampPositions.length);
    const heads = new THREE.InstancedMesh(headGeometry, lightMaterial, lampPositions.length);
    poles.name = 'Lamp posts';
    heads.name = 'Lamp heads';
    lampPositions.forEach(([x, z], index) => {
      const baseY = this.getRoadHeightAt(x, z);
      dummy.position.set(x, baseY + 3.2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(index, dummy.matrix);
      dummy.position.set(x + (x < 0 ? 0.25 : -0.25), baseY + 6.37, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      heads.setMatrixAt(index, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    poles.castShadow = this.shadows;
    this.root.add(poles, heads);
  }

  private buildParkingArea(): void {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.96 });
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xeae8d8,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const parking = new THREE.Mesh(new THREE.PlaneGeometry(70, 43), asphalt);
    parking.name = 'Parking practice area';
    parking.rotation.x = -Math.PI / 2;
    parking.position.set(105, 0.032, 66.5);
    parking.receiveShadow = this.shadows;
    this.root.add(parking);

    const lines = new THREE.Group();
    lines.name = 'Parking bay markings';
    for (let x = 73; x <= 137; x += 8) {
      lines.add(
        makeHorizontalMarking('Parking bay divider', 0.09, 8, x, 82, 0.032, lineMaterial),
        makeHorizontalMarking('Parking bay divider', 0.09, 8, x, 51, 0.032, lineMaterial),
      );
    }
    lines.add(
      makeHorizontalMarking('Parking bay back line', 64, 0.09, 105, 86, 0.032, lineMaterial),
      makeHorizontalMarking('Parking bay back line', 64, 0.09, 105, 47, 0.032, lineMaterial),
    );
    this.root.add(lines);

    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xb7b4a9, roughness: 0.88 });
    this.root.add(
      makeBox('Parking north curb', [70, 0.15, 0.24], [105, 0.075, 88.1], curbMaterial, this.shadows),
      makeBox('Parking west curb', [0.24, 0.15, 43], [69.9, 0.075, 66.5], curbMaterial, this.shadows),
      makeBox('Parking east curb', [0.24, 0.15, 43], [140.1, 0.075, 66.5], curbMaterial, this.shadows),
    );
  }

  private buildIntersection(): void {
    const curb = new THREE.MeshStandardMaterial({ color: 0xd2cfc2, roughness: 0.9 });
    const grassIsland = new THREE.MeshStandardMaterial({ color: 0x64794b, roughness: 1 });
    const corners = [
      [-14, 43],
      [14, 43],
      [-14, 17],
      [14, 17],
    ] as const;
    for (const [x, z] of corners) {
      const island = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.13, 18), grassIsland);
      island.name = 'Intersection corner island';
      island.position.set(x, 0.06, z);
      island.receiveShadow = this.shadows;
      this.root.add(island);
      const curbRing = new THREE.Mesh(new THREE.TorusGeometry(5.45, 0.1, 6, 24), curb);
      curbRing.name = 'Intersection corner curb';
      curbRing.rotation.x = Math.PI / 2;
      curbRing.position.set(x, 0.13, z);
      this.root.add(curbRing);
    }
  }

  private buildBuildings(): void {
    const wallPalette = [0xb7aa91, 0x8c9da2, 0xb08e78, 0x9b9b8a];
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x454b50, roughness: 0.8 });
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x6c91a2,
      emissive: 0x172630,
      emissiveIntensity: 0.35,
      roughness: 0.24,
      metalness: 0.2,
    });
    const buildingSites = [
      [-105, 84, 25, 16, 42],
      [-62, 91, 18, 11, 28],
      [182, 87, 31, 18, 46],
      [228, 55, 24, 13, 34],
      [382, -36, 34, 20, 54],
      [405, -145, 29, 14, 40],
      [411, -290, 38, 17, 58],
      [395, -455, 26, 12, 43],
      [345, -732, 35, 16, 48],
      [216, -776, 46, 21, 34],
    ] as const;

    buildingSites.forEach(([x, z, width, height, depth], index) => {
      this.colliders.push(createStaticOBBCollider({
        id: `road-building:${index}`, x, z, width, length: depth,
        minHeight: 0, maxHeight: height, type: 'building',
      }));
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: wallPalette[index % wallPalette.length],
        roughness: 0.9,
      });
      const building = makeBox('Reference building', [width, height, depth], [x, height / 2, z], wallMaterial, this.shadows);
      const roof = makeBox('Building roof', [width + 0.6, 0.6, depth + 0.6], [x, height + 0.3, z], roofMaterial, this.shadows);
      this.root.add(building, roof);

      const windowsAcross = Math.max(2, Math.floor(width / 5));
      for (let windowIndex = 0; windowIndex < windowsAcross; windowIndex += 1) {
        const windowX = x - width * 0.38 + (windowIndex / Math.max(1, windowsAcross - 1)) * width * 0.76;
        const window = makeBox('Building window', [1.7, 1.5, 0.08], [windowX, Math.min(4.2, height * 0.55), z - depth / 2 - 0.05], windowMaterial, false);
        this.root.add(window);
      }
    });
  }

  private buildTrees(treeCount: number): void {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4630, roughness: 1 });
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x3d673e, roughness: 0.94 });
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 2.8, 7), trunkMaterial, treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.65, 0), foliageMaterial, treeCount);
    trunks.name = 'Instanced tree trunks';
    crowns.name = 'Instanced tree crowns';

    let seed = 0x2f6e2b1;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const dummy = new THREE.Object3D();
    let placed = 0;
    while (placed < treeCount) {
      const x = -145 + random() * 600;
      const z = -770 + random() * 930;
      if (this.isOnDrivableSurface(x, z)) continue;
      if (x > 55 && x < 155 && z > 35 && z < 100) continue;
      const scale = 0.78 + random() * 0.52;
      const baseY = this.getRoadHeightAt(x, z);
      dummy.position.set(x, baseY + 1.4 * scale, z);
      dummy.rotation.set(0, random() * Math.PI * 2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      dummy.position.y = baseY + 3.6 * scale;
      dummy.rotation.y += 0.7;
      dummy.updateMatrix();
      crowns.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.castShadow = this.shadows;
    trunks.receiveShadow = this.shadows;
    crowns.castShadow = this.shadows;
    this.root.add(trunks, crowns);
  }

  private buildSigns(): void {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x6e7476, roughness: 0.45, metalness: 0.6 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x245ca8, roughness: 0.48 });
    const warning = new THREE.MeshStandardMaterial({ color: 0xe9b830, roughness: 0.5 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

    const makeSign = (x: number, z: number, material: THREE.Material, name: string): THREE.Group => {
      const sign = new THREE.Group();
      sign.name = name;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.2, 8), poleMaterial);
      pole.position.y = 1.1;
      pole.castShadow = this.shadows;
      const plate = makeBox('Road sign plate', [0.72, 0.72, 0.055], [0, 2.05, 0], material, this.shadows);
      sign.add(pole, plate);
      sign.position.set(x, this.getRoadHeightAt(x, z), z);
      return sign;
    };

    const parkingSign = makeSign(69, 45, blue, 'Parking area sign');
    const pStem = makeBox('Parking P stem', [0.09, 0.42, 0.025], [-0.12, 2.05, -0.034], white, false);
    const pTop = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 20, Math.PI * 1.6), white);
    pTop.name = 'Parking P loop';
    pTop.position.set(-0.025, 2.14, -0.035);
    pTop.rotation.z = THREE.MathUtils.degToRad(-18);
    parkingSign.add(pStem, pTop);

    const hillStart = makeSign(-8.2, -174, warning, 'Hill warning sign');
    const hillChevron = new THREE.Mesh(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.22, 1.88, -0.035),
        new THREE.Vector3(0, 2.18, -0.035),
        new THREE.Vector3(0.22, 1.88, -0.035),
      ]),
      new THREE.LineBasicMaterial({ color: 0x1d2529 }),
    );
    hillStart.add(hillChevron);

    const junctionSign = makeSign(-10, 49, warning, 'Intersection warning sign');
    const vertical = makeBox('Intersection symbol vertical', [0.045, 0.42, 0.026], [0, 2.05, -0.035], white, false);
    const horizontal = makeBox('Intersection symbol horizontal', [0.42, 0.045, 0.026], [0, 2.05, -0.035], white, false);
    junctionSign.add(vertical, horizontal);
    this.root.add(parkingSign, hillStart, junctionSign);

    const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xe66d24, roughness: 0.72 });
    for (let index = 0; index < 8; index += 1) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 12), coneMaterial);
      cone.name = 'Handling course cone';
      cone.position.set(167 + index * 8, 0.25, 26 + (index % 2 === 0 ? -2.2 : 2.2));
      cone.castShadow = this.shadows;
      this.root.add(cone);
    }
  }
}
