import * as THREE from 'three';

import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';

import { Cockpit } from './Cockpit';
import { buildVehicleExterior } from './VehicleExterior';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';
import {
  DEFAULT_SEDAN_VISUAL_CONFIG,
  type MirrorVisualConfig,
  type VehicleVisualConfig,
  type Vector3Tuple,
} from './VehicleVisualConfig';

export type MirrorSide = 'left' | 'right';
export type MirrorSurfaceMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

export interface MirrorWorldTransform {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  /** World-space normal; mirror PlaneGeometry has local +Z normal. */
  readonly normal: THREE.Vector3;
  readonly size: THREE.Vector2;
  readonly surface: MirrorSurfaceMesh;
}

export interface VehicleVisualPose {
  readonly position: THREE.Vector3Like;
  readonly yawRadians: number;
  readonly pitchRadians?: number;
  readonly rollRadians?: number;
}

const setPosition = (object: THREE.Object3D, value: Vector3Tuple): void => {
  object.position.set(value[0], value[1], value[2]);
};

/** Only enough cabin geometry to read as occupied space; no upholstery detail. */
const buildSimplifiedSeats = (config: VehicleVisualConfig): THREE.Group => {
  const seats = new THREE.Group();
  seats.name = 'Simplified cabin seats';
  const sport = config.body.profile === 'sport-coupe';
  const upholstery = new THREE.MeshStandardMaterial({
    color: config.body.interiorColor, roughness: 0.96, metalness: 0,
  });
  const seatBox = (name: string, size: Vector3Tuple, position: Vector3Tuple, tilt = 0): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), upholstery);
    mesh.name = name;
    mesh.userData.vehicleInteriorPart = 'seat';
    mesh.position.set(...position);
    mesh.rotation.x = tilt;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.set(VEHICLE_RENDER_LAYERS.INTERIOR);
    seats.add(mesh);
  };
  const cushionY = sport ? 0.43 : 0.48;
  const backY = sport ? 0.79 : 0.84;
  for (const [label, x] of [
    ['Driver', config.driverEyePosition[0]],
    ['Passenger', Math.max(0.49, config.cabin.width * 0.5 - 0.28)],
  ] as const) {
    seatBox(`${label} seat cushion`, [0.4, 0.11, 0.47], [x, cushionY, 0.4]);
    seatBox(`${label} seat back`, [0.39, sport ? 0.5 : 0.55, 0.095],
      [x, backY, 0.65], THREE.MathUtils.degToRad(10));
    seatBox(`${label} headrest`, [0.23, 0.15, 0.1], [x, backY + 0.38, 0.73]);
  }
  seatBox('Rear bench cushion', [config.cabin.width * 0.8, 0.1, 0.27], [0, cushionY, 0.88]);
  seatBox('Rear bench back', [config.cabin.width * 0.8, 0.43, 0.08],
    [0, cushionY + 0.33, 0.95], THREE.MathUtils.degToRad(-8));
  return seats;
};

/**
 * Complete visual hierarchy for one car.
 *
 * Coordinate convention: +X right, +Y up, -Z forward.  The root origin is
 * midway between the axles at tyre-contact height.  `exteriorRoot` is kept
 * separate from `cockpitRoot` so mirror cameras can include only the car's
 * exterior while avoiding recursive interior/mirror rendering.
 */
export class VehicleVisual {
  public readonly root = new THREE.Group();
  public readonly exteriorRoot = new THREE.Group();
  public readonly mirrorSurfaceRoot = new THREE.Group();
  public readonly cockpitRoot: Cockpit;
  public readonly mirrorSurfaces: Readonly<Record<MirrorSide, MirrorSurfaceMesh>>;
  public readonly frontWheelPivots: readonly [THREE.Group, THREE.Group];

  private readonly wheelMeshes: THREE.Mesh[] = [];
  public readonly wheelPivots = {} as Record<VehicleWheelId, THREE.Group>;

  public constructor(
    public readonly config: VehicleVisualConfig = DEFAULT_SEDAN_VISUAL_CONFIG,
  ) {
    this.root.name = `Vehicle visual: ${config.name}`;
    this.root.userData.coordinateConvention = '+X right, +Y up, -Z forward';
    this.root.rotation.order = 'YXZ';
    this.exteriorRoot.name = 'Car exterior';
    this.exteriorRoot.userData.renderCategory = 'CAR_EXTERIOR';
    this.cockpitRoot = new Cockpit(config);
    this.cockpitRoot.userData.renderCategory = 'COCKPIT';
    this.cockpitRoot.add(buildSimplifiedSeats(config));
    this.mirrorSurfaceRoot.name = 'Mirror surfaces';
    this.mirrorSurfaceRoot.userData.renderCategory = 'MIRROR_SURFACE';
    this.root.add(this.exteriorRoot, this.cockpitRoot, this.mirrorSurfaceRoot);

    this.buildExterior();
    this.frontWheelPivots = this.buildWheels();

    const leftMirror = this.buildMirror('left', config.leftMirrorTransform);
    const rightMirror = this.buildMirror('right', config.rightMirrorTransform);
    this.mirrorSurfaces = { left: leftMirror, right: rightMirror };
    this.exteriorRoot.traverse((object) => object.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR));
    this.cockpitRoot.traverse((object) => object.layers.set(VEHICLE_RENDER_LAYERS.INTERIOR));
    this.mirrorSurfaceRoot.traverse((object) => object.layers.set(VEHICLE_RENDER_LAYERS.MIRROR));
  }

  public setPose(
    positionOrPose: THREE.Vector3Like | VehicleVisualPose,
    yawRadians?: number,
    pitchRadians = 0,
    rollRadians = 0,
  ): void {
    const isPose = 'position' in positionOrPose;
    const position = isPose ? positionOrPose.position : positionOrPose;
    const yaw = isPose ? positionOrPose.yawRadians : (yawRadians ?? 0);
    const pitch = isPose ? (positionOrPose.pitchRadians ?? 0) : pitchRadians;
    const roll = isPose ? (positionOrPose.rollRadians ?? 0) : rollRadians;

    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.set(
      Number.isFinite(pitch) ? pitch : 0,
      Number.isFinite(yaw) ? yaw : 0,
      Number.isFinite(roll) ? roll : 0,
      'YXZ',
    );
  }

  public setWorldPose(
    x: number,
    y: number,
    z: number,
    yawRadians: number,
    pitchRadians = 0,
    rollRadians = 0,
  ): void {
    this.setPose({ x, y, z }, yawRadians, pitchRadians, rollRadians);
  }

  public setSteeringInput(normalizedInput: number): void {
    this.cockpitRoot.setSteeringInput(normalizedInput);
  }

  public setSteeringWheelAngle(angleRadians: number): void {
    this.cockpitRoot.setSteeringWheelAngle(angleRadians);
  }

  /** Feeds the physical cockpit cluster without exposing its mesh internals. */
  public updateInstruments(telemetry: InstrumentTelemetry, deltaTime = 1 / 60): void {
    this.cockpitRoot.updateInstruments(telemetry, deltaTime);
  }

  public setFrontWheelSteeringAngle(angleRadians: number): void {
    const safeAngle = Number.isFinite(angleRadians) ? angleRadians : 0;
    for (const pivot of this.frontWheelPivots) {
      pivot.rotation.y = safeAngle;
    }
  }

  /** Applies the Ackermann-corrected left/right angles to the visible wheels. */
  public setFrontWheelSteeringAngles(
    leftAngleRadians: number,
    rightAngleRadians: number,
  ): void {
    this.frontWheelPivots[0].rotation.y = Number.isFinite(leftAngleRadians)
      ? leftAngleRadians
      : 0;
    this.frontWheelPivots[1].rotation.y = Number.isFinite(rightAngleRadians)
      ? rightAngleRadians
      : 0;
  }

  /** Wheel spin is local X rotation, positive when the car rolls forward. */
  public setWheelRotation(angleRadians: number): void {
    const safeAngle = Number.isFinite(angleRadians) ? angleRadians : 0;
    for (const wheel of this.wheelMeshes) {
      wheel.rotation.x = -safeAngle;
    }
  }

  /** Physics-supplied wheel displacement relative to the chassis; no visual force model. */
  public setWheelSuspensionOffsets(offsets: Readonly<Record<VehicleWheelId, number>>): void {
    for (const id of VEHICLE_WHEEL_IDS) {
      this.wheelPivots[id].position.y = this.config.dimensions.wheelRadius
        + (Number.isFinite(offsets[id]) ? offsets[id] : 0);
    }
  }

  /**
   * Keep tyre bottoms on sampled ground even while the body pitches/rolls.
   * The planar yaw anchors match physics exactly, then the full inverse body
   * transform removes any unwanted X/Z displacement caused by pitch/roll.
   */
  public setWheelGroundHeights(heights: Readonly<Record<VehicleWheelId, number>>): void {
    this.root.updateWorldMatrix(true, false);
    const localPositions = localWheelPositions(this.config.dimensions);
    const position = this.root.getWorldPosition(new THREE.Vector3());
    const cosine = Math.cos(this.root.rotation.y);
    const sine = Math.sin(this.root.rotation.y);
    for (const id of VEHICLE_WHEEL_IDS) {
      const anchor = localPositions[id];
      const worldCentre = new THREE.Vector3(
        position.x + anchor.x * cosine + anchor.z * sine,
        heights[id] + this.config.dimensions.wheelRadius,
        position.z - anchor.x * sine + anchor.z * cosine,
      );
      this.wheelPivots[id].position.copy(this.root.worldToLocal(worldCentre));
    }
  }

  /** Explicit physical wheel centres, useful when later geometry includes camber or banking. */
  public setWheelWorldPositions(points: Readonly<Record<VehicleWheelId, THREE.Vector3Like>>): void {
    this.root.updateWorldMatrix(true, false);
    for (const id of VEHICLE_WHEEL_IDS) {
      const point = points[id];
      this.wheelPivots[id].position.copy(this.root.worldToLocal(new THREE.Vector3(point.x, point.y, point.z)));
    }
  }

  /** Body-only envelope excludes protruding mirror housings, matching the contact footprint. */
  public getVisualBodyBounds(target = new THREE.Box3()): THREE.Box3 {
    this.root.updateWorldMatrix(true, true);
    target.makeEmpty();
    this.exteriorRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.vehicleBodyPart === 'mirror-housing') return;
      if (object.geometry.boundingBox === null) object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox !== null) {
        target.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    });
    return target;
  }

  public getMirrorSurface(side: MirrorSide): MirrorSurfaceMesh {
    return this.mirrorSurfaces[side];
  }

  public getMirrorWorldTransform(side: MirrorSide): MirrorWorldTransform {
    this.root.updateWorldMatrix(true, true);
    const surface = this.getMirrorSurface(side);
    const position = surface.getWorldPosition(new THREE.Vector3());
    const quaternion = surface.getWorldQuaternion(new THREE.Quaternion());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
    const mirrorConfig = side === 'left'
      ? this.config.leftMirrorTransform
      : this.config.rightMirrorTransform;

    return {
      position,
      quaternion,
      normal,
      size: new THREE.Vector2(mirrorConfig.size[0], mirrorConfig.size[1]),
      surface,
    };
  }

  /** Assigns a reflection target produced by the mirror subsystem. */
  public applyMirrorTexture(side: MirrorSide, texture: THREE.Texture | null): void {
    const material = this.getMirrorSurface(side).material;
    material.map = texture;
    material.color.set(texture === null ? 0x9cb8bf : 0xffffff);
    material.needsUpdate = true;
  }

  /**
   * Releases the per-car procedural meshes when a vehicle is switched.
   * Mirror render-target textures are owned by MirrorSystem and deliberately
   * excluded; every other texture here was created by this visual hierarchy.
   */
  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of meshMaterials) {
        materials.add(material);
        if (object.userData.mirrorSide !== undefined) continue;
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });

    this.root.removeFromParent();
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }

  private buildExterior(): void {
    buildVehicleExterior(this.exteriorRoot, this.config);
  }

  private buildWheels(): readonly [THREE.Group, THREE.Group] {
    const sport = this.config.body.profile === 'sport-coupe';
    const tyreMaterial = new THREE.MeshStandardMaterial({
      color: 0x111214,
      roughness: 0.88,
      metalness: 0.02,
    });
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: sport ? 0x565d64 : 0x9da4a8,
      roughness: sport ? 0.24 : 0.31,
      metalness: 0.78,
    });
    const brakeMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f6264,
      roughness: 0.48,
      metalness: 0.66,
    });
    const tyreGeometry = new THREE.CylinderGeometry(
      this.config.wheelRadius,
      this.config.wheelRadius,
      this.config.dimensions.wheelWidth,
      24,
    );
    tyreGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new THREE.CylinderGeometry(
      this.config.wheelRadius * (sport ? 0.64 : 0.59),
      this.config.wheelRadius * (sport ? 0.64 : 0.59),
      this.config.dimensions.wheelWidth * 0.94,
      sport ? 20 : 16,
      1,
      true,
    );
    rimGeometry.rotateZ(Math.PI / 2);
    const brakeDiscGeometry = new THREE.CylinderGeometry(
      this.config.wheelRadius * 0.43,
      this.config.wheelRadius * 0.43,
      this.config.dimensions.wheelWidth * 0.89,
      20,
    );
    brakeDiscGeometry.rotateZ(Math.PI / 2);
    const hubGeometry = new THREE.CylinderGeometry(
      this.config.wheelRadius * 0.105,
      this.config.wheelRadius * 0.105,
      this.config.dimensions.wheelWidth * 0.98,
      12,
    );
    hubGeometry.rotateZ(Math.PI / 2);
    const rimLipGeometry = new THREE.TorusGeometry(
      this.config.wheelRadius * (sport ? 0.57 : 0.52),
      0.012,
      6,
      sport ? 20 : 16,
    );
    rimLipGeometry.rotateY(Math.PI / 2);
    const spokeGeometry = new THREE.BoxGeometry(
      this.config.dimensions.wheelWidth * 0.96,
      sport ? 0.024 : 0.028,
      this.config.wheelRadius * (sport ? 0.42 : 0.38),
    );
    spokeGeometry.translate(0, 0, this.config.wheelRadius * (sport ? 0.27 : 0.25));

    const frontPivots: THREE.Group[] = [];
    const wheelPositions = localWheelPositions(this.config.dimensions);

    VEHICLE_WHEEL_IDS.forEach((id, index) => {
      const position = wheelPositions[id];
      const pivot = new THREE.Group();
      pivot.name = `${id} ${index < 2 ? 'steering pivot' : 'suspension mount'}`;
      pivot.userData.wheelId = id;
      pivot.position.set(position.x, position.y, position.z);
      this.wheelPivots[id] = pivot;

      const wheel = new THREE.Mesh(tyreGeometry, tyreMaterial);
      wheel.name = 'Tyre';
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.name = sport ? 'Sports open wheel rim barrel' : 'Sedan open wheel rim barrel';
      const brakeDisc = new THREE.Mesh(brakeDiscGeometry, brakeMaterial);
      brakeDisc.name = 'Ventilated brake disc';
      const hub = new THREE.Mesh(hubGeometry, rimMaterial);
      hub.name = 'Wheel hub';
      wheel.add(brakeDisc, rim, hub);

      const lipOffset = this.config.dimensions.wheelWidth * 0.47;
      for (const faceX of [-lipOffset, lipOffset]) {
        const lip = new THREE.Mesh(rimLipGeometry, rimMaterial);
        lip.name = 'Wheel rim lip';
        lip.position.x = faceX;
        wheel.add(lip);
      }

      const spokeCount = sport ? 5 : 6;
      for (let spokeIndex = 0; spokeIndex < spokeCount; spokeIndex += 1) {
        const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
        spoke.name = sport ? 'Sports wheel spoke' : 'Sedan wheel spoke';
        spoke.rotation.x = spokeIndex / spokeCount * Math.PI * 2;
        wheel.add(spoke);
      }
      pivot.add(wheel);
      this.exteriorRoot.add(pivot);
      this.wheelMeshes.push(wheel);

      if (index < 2) frontPivots.push(pivot);
    });

    return [frontPivots[0]!, frontPivots[1]!];
  }

  private buildMirror(side: MirrorSide, mirrorConfig: MirrorVisualConfig): MirrorSurfaceMesh {
    const assembly = new THREE.Group();
    assembly.name = `${side} mirror assembly`;
    setPosition(assembly, mirrorConfig.position);
    assembly.rotation.set(...mirrorConfig.rotation);

    const housingMaterial = new THREE.MeshStandardMaterial({
      color: this.config.body.trimColor,
      roughness: 0.42,
      metalness: 0.12,
    });
    // Keep the side mirror deliberately simple and legible.  The previous
    // stretched sphere produced a half-oval/half-rectangle silhouette that
    // did not match either an ordinary saloon mirror or a GT mirror.
    const housingWidth = mirrorConfig.size[0] + 0.03;
    const housingHeight = mirrorConfig.size[1] + 0.028;
    const housingGeometry = new THREE.BoxGeometry(
      housingWidth,
      housingHeight,
      mirrorConfig.housingDepth,
    );
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.name = `${side} mirror housing`;
    housing.position.z = -mirrorConfig.housingDepth * 0.5;
    housing.castShadow = true;
    housing.userData.vehicleBodyPart = 'mirror-housing';
    assembly.add(housing);

    // A narrow raised bezel makes the reflective rectangle read as glass
    // instead of a texture placed on the face of a box.  The bars remain
    // outside the configured optical aperture, so they cannot crop the view.
    const bezelThickness = 0.011;
    const bezelDepth = 0.012;
    const horizontalBezelGeometry = new THREE.BoxGeometry(
      housingWidth,
      bezelThickness,
      bezelDepth,
    );
    const verticalBezelGeometry = new THREE.BoxGeometry(
      bezelThickness,
      mirrorConfig.size[1],
      bezelDepth,
    );
    for (const y of [-(mirrorConfig.size[1] + bezelThickness) * 0.5,
      (mirrorConfig.size[1] + bezelThickness) * 0.5]) {
      const bezel = new THREE.Mesh(horizontalBezelGeometry, housingMaterial);
      bezel.name = `${side} mirror horizontal bezel`;
      bezel.userData.vehicleBodyPart = 'mirror-housing';
      bezel.position.set(0, y, 0.002);
      assembly.add(bezel);
    }
    for (const x of [-(mirrorConfig.size[0] + bezelThickness) * 0.5,
      (mirrorConfig.size[0] + bezelThickness) * 0.5]) {
      const bezel = new THREE.Mesh(verticalBezelGeometry, housingMaterial);
      bezel.name = `${side} mirror vertical bezel`;
      bezel.userData.vehicleBodyPart = 'mirror-housing';
      bezel.position.set(x, 0, 0.002);
      assembly.add(bezel);
    }

    const reflectiveMaterial = new THREE.MeshStandardMaterial({
      color: 0x9cb8bf,
      roughness: 0.06,
      metalness: 0.9,
      side: THREE.FrontSide,
    });
    const surface: MirrorSurfaceMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mirrorConfig.size[0], mirrorConfig.size[1]),
      reflectiveMaterial,
    );
    surface.name = `${side} mirror surface`;
    surface.position.copy(new THREE.Vector3(...mirrorConfig.position))
      .add(new THREE.Vector3(0, 0, 0.004).applyEuler(new THREE.Euler(...mirrorConfig.rotation)));
    surface.rotation.set(...mirrorConfig.rotation);
    surface.userData.mirrorSide = side;
    surface.userData.mirrorShape = 'rectangular';
    surface.userData.localNormal = new THREE.Vector3(0, 0, 1);
    surface.renderOrder = 3;
    this.mirrorSurfaceRoot.add(surface);

    const stalk = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.032, 0.052),
      housingMaterial,
    );
    stalk.name = `${side} mirror stalk`;
    stalk.position.x = side === 'left' ? 0.105 : -0.105;
    stalk.position.y = -housingHeight * 0.18;
    stalk.position.z = -mirrorConfig.housingDepth * 0.68;
    stalk.castShadow = true;
    stalk.userData.vehicleBodyPart = 'mirror-housing';
    assembly.add(stalk);

    this.exteriorRoot.add(assembly);
    return surface;
  }
}
