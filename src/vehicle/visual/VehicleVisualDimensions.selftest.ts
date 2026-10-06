import * as THREE from 'three';

import { DEFAULT_VEHICLE_PHYSICS_CONFIG, SPORTS_COUPE_PHYSICS_CONFIG } from '../config';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { createVehicleOBB } from '../physics/CollisionSystem';
import { sampleWheelContacts } from '../physics/WheelContact';
import type { RoadSurfaceSample } from '../../world/SurfaceMaterial';
import { VehicleVisual } from './VehicleVisual';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';
import { DEFAULT_SEDAN_VISUAL_CONFIG, SPORTS_COUPE_VISUAL_CONFIG } from './VehicleVisualConfig';

export interface VehicleVisualDimensionsSelfTestResult {
  readonly assertions: number;
  readonly maximumWheelWorldErrorMetres: number;
  readonly checkedWheelPoses: number;
  readonly exteriorViewsChecked: number;
  readonly collisionLengthAllowanceMetres: number;
  readonly collisionWidthAllowanceMetres: number;
}

/** Shared dimensions + real mesh layers/poses. No WebGL context or replacement car model. */
export function runVehicleVisualDimensionsSelfTest(): VehicleVisualDimensionsSelfTestResult {
  let assertions = 0;
  let maximumWheelWorldErrorMetres = 0;
  let checkedWheelPoses = 0;
  let exteriorViewsChecked = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Vehicle visual dimensions self-test failed: ${message}`);
  };
  // Canvas artwork is immaterial to these geometric tests. Browser runs keep
  // their real document; Node gets a scoped null 2D context only for construction.
  const needsDocument = typeof document === 'undefined';
  if (needsDocument) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) },
    });
  }
  try {
    const pairs = [
      [DEFAULT_SEDAN_VISUAL_CONFIG, DEFAULT_VEHICLE_PHYSICS_CONFIG],
      [SPORTS_COUPE_VISUAL_CONFIG, SPORTS_COUPE_PHYSICS_CONFIG],
    ] as const;
    for (const [config, physics] of pairs) {
      assert(config.dimensions === config.collisionDimensions, `${config.name}: no independent collider envelope`);
      for (const key of ['length', 'width', 'height', 'wheelBase', 'frontTrackWidth',
        'rearTrackWidth', 'wheelRadius', 'wheelWidth'] as const) {
        assert(config.dimensions[key] === physics[key], `${config.name}: physics/visual ${key} mismatch`);
      }
      const visual = new VehicleVisual(config);
      try {
        const testCategory = (root: THREE.Object3D, layer: number): void => {
          root.traverse((object) => {
            if (object instanceof THREE.Mesh) assert(object.layers.mask === 1 << layer,
              `${config.name}: ${object.name} has incorrect render layer`);
          });
        };
        testCategory(visual.exteriorRoot, VEHICLE_RENDER_LAYERS.EXTERIOR);
        testCategory(visual.cockpitRoot, VEHICLE_RENDER_LAYERS.INTERIOR);
        testCategory(visual.mirrorSurfaceRoot, VEHICLE_RENDER_LAYERS.MIRROR);
        assert(visual.mirrorSurfaceRoot.children.length === 2, `${config.name}: surfaces are a separate category`);
        const seatRoot = visual.cockpitRoot.getObjectByName('Simplified cabin seats');
        assert(seatRoot !== undefined && seatRoot.children.length === 8,
          `${config.name}: need two front seats/headrests and a simple rear bench`);
        if (seatRoot !== undefined) {
          visual.root.updateWorldMatrix(true, true);
          const eye = new THREE.Vector3(...config.driverEyePosition);
          for (const part of seatRoot.children) {
            const bounds = new THREE.Box3().setFromObject(part);
            assert(bounds.distanceToPoint(eye) > 0.18,
              `${config.name}: ${part.name} intrudes into DriverEye clearance`);
            assert(bounds.max.y < config.cabin.roofY - 0.08,
              `${config.name}: ${part.name} intrudes into the roof`);
            if (part.name.endsWith('seat back') || part.name.endsWith('headrest')) {
              assert(bounds.min.z > eye.z + 0.18,
                `${config.name}: front seat backs/headrests must stay behind the eye`);
            }
          }
          const seatCaster = new THREE.Raycaster();
          seatCaster.layers.set(VEHICLE_RENDER_LAYERS.INTERIOR);
          for (const direction of [
            new THREE.Vector3(0, 0, -1), new THREE.Vector3(-0.8, 0, -1),
            new THREE.Vector3(0.8, 0, -1), new THREE.Vector3(0, -0.45, -1),
          ]) {
            seatCaster.set(eye, direction.normalize());
            assert(seatCaster.intersectObject(seatRoot, true).length === 0,
              `${config.name}: seats obstruct forward road/dashboard viewing directions`);
          }
        }
        const anchors = localWheelPositions(config.dimensions);
        for (const id of VEHICLE_WHEEL_IDS) {
          const actual = visual.wheelPivots[id].position;
          const anchor = anchors[id];
          assert(actual.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z)) < 1e-12,
            `${config.name}: initial ${id} visual wheel differs from shared geometry`);
          const tyre = visual.wheelPivots[id].children[0] as THREE.Mesh<THREE.CylinderGeometry>;
          assert(tyre.geometry.parameters.radiusTop === config.dimensions.wheelRadius,
            `${config.name}: ${id} visual tyre radius differs`);
          assert(tyre.geometry.parameters.height === config.dimensions.wheelWidth,
            `${config.name}: ${id} visual tyre width differs`);
        }
        const ground = {
          sampleRoadSurface(x: number, z: number): RoadSurfaceSample {
            const height = x * 0.025 + z * 0.015;
            return {
              height, normal: new THREE.Vector3(-0.025, 1, -0.015).normalize(),
              gradient: new THREE.Vector2(0.025, 0.015), grade: 0,
              surfaceType: 'asphalt', longitudinalGrip: 1, lateralGrip: 1,
              rollingResistance: 1, roughness: 0.025,
              gripMultiplier: 1, rollingResistanceMultiplier: 1,
            };
          },
        };
        for (const [x, z, yaw, pitch, roll] of [
          [0, 0, 0, 0, 0], [15, -23, 0.9, 0.07, -0.04],
          [-17, 8, -2.3, -0.065, 0.06], [7, 21, Math.PI, 0.045, -0.03],
        ]) {
          const pose = { x: x!, z: z!, yaw: yaw! };
          visual.setPose({ x: x!, y: 0.11, z: z! }, yaw!, pitch!, roll!);
          const contacts = sampleWheelContacts(ground, pose, physics);
          visual.setWheelGroundHeights({
            frontLeft: contacts.frontLeft.height, frontRight: contacts.frontRight.height,
            rearLeft: contacts.rearLeft.height, rearRight: contacts.rearRight.height,
          });
          visual.root.updateWorldMatrix(true, true);
          for (const id of VEHICLE_WHEEL_IDS) {
            const actual = visual.wheelPivots[id].getWorldPosition(new THREE.Vector3());
            const contact = contacts[id];
            const expected = new THREE.Vector3(contact.x, contact.height + physics.wheelRadius, contact.z);
            const error = actual.distanceTo(expected);
            maximumWheelWorldErrorMetres = Math.max(maximumWheelWorldErrorMetres, error);
            assert(error < 1e-10, `${config.name}: ${id} world wheel shifts away from physics under body pose`);
            checkedWheelPoses += 1;
          }
        }
        visual.setPose({ x: 0, y: 0, z: 0 }, 0);
        visual.setWheelGroundHeights({ frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 });
        const bounds = visual.getVisualBodyBounds();
        const size = bounds.getSize(new THREE.Vector3());
        assert(Math.abs(size.x - physics.width) < 0.015 && Math.abs(size.z - physics.length) < 0.015,
          `${config.name}: full visible body does not match physics envelope`);
        const obb = createVehicleOBB({ x: 0, z: 0, yaw: 0 }, config.dimensions);
        assert(Math.abs(size.x - 2 * obb.halfWidth - 0.06) < 0.015,
          `${config.name}: collider width must be only slightly inset`);
        assert(Math.abs(size.z - 2 * obb.halfLength - 0.12) < 0.015,
          `${config.name}: collider length must be only slightly inset`);
        for (const corner of obb.corners) assert(corner.x >= bounds.min.x && corner.x <= bounds.max.x
          && corner.z >= bounds.min.z && corner.z <= bounds.max.z,
        `${config.name}: OBB corner must stay inside body footprint`);
        const wheelCaster = new THREE.Raycaster();
        wheelCaster.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR);
        for (const id of VEHICLE_WHEEL_IDS) {
          const anchor = anchors[id];
          const left = id === 'frontLeft' || id === 'rearLeft';
          const eye = new THREE.Vector3(left ? -3 : 3, anchor.y, anchor.z);
          wheelCaster.set(eye, new THREE.Vector3(left ? 1 : -1, 0, 0));
          const hits = wheelCaster.intersectObject(visual.exteriorRoot, true);
          assert(hits.some((hit) => hit.object.name === 'Tyre'),
            `${config.name}: real ${id} tyre is hidden by an uninterrupted body flank`);
          assert(hits[0]?.object.name === 'Tyre',
            `${config.name}: a body panel covers the middle of ${id} wheel opening`);
        }
        visual.setFrontWheelSteeringAngles(-0.22, -0.3);
        visual.setWheelRotation(0.7);
        visual.root.updateWorldMatrix(true, true);
        const leftForward = new THREE.Vector3(0, 0, -1).applyQuaternion(
          visual.wheelPivots.frontLeft.getWorldQuaternion(new THREE.Quaternion()));
        const rightForward = new THREE.Vector3(0, 0, -1).applyQuaternion(
          visual.wheelPivots.frontRight.getWorldQuaternion(new THREE.Quaternion()));
        assert(leftForward.x > 0 && rightForward.x > leftForward.x,
          `${config.name}: right-turn tyre orientation must turn right, with the inside wheel tighter`);
        assert(visual.wheelPivots.rearLeft.rotation.y === 0 && visual.wheelPivots.rearRight.rotation.y === 0,
          `${config.name}: rear axle must not inherit front steering`);
        for (const id of VEHICLE_WHEEL_IDS) {
          const tyre = visual.wheelPivots[id].children[0] as THREE.Mesh;
          assert(Math.abs(tyre.rotation.x + 0.7) < 1e-12,
            `${config.name}: tyre spin must be about its own axle after steering`);
        }
        for (const side of ['left', 'right'] as const) {
          const surface = visual.getMirrorSurface(side);
          assert(surface.parent === visual.mirrorSurfaceRoot, `${config.name}: no nested exterior mirror surface`);
          assert(surface.scale.x === 1 && surface.scale.y === 1,
            `${config.name}: no arbitrary second horizontal mirror flip`);
        }
        const caster = new THREE.Raycaster();
        caster.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR);
        for (const eye of [
          new THREE.Vector3(0, 0.55, -6), new THREE.Vector3(0, 0.55, 6),
          new THREE.Vector3(-5, 0.55, 0), new THREE.Vector3(5, 0.55, 0),
          new THREE.Vector3(-5, 0.85, 5), new THREE.Vector3(5, 0.85, 5),
        ]) {
          caster.set(eye, new THREE.Vector3(0, 0.55, 0).sub(eye).normalize());
          assert(caster.intersectObject(visual.exteriorRoot, true).length > 0,
            `${config.name}: complete exterior unavailable from ${eye.toArray().join('/')}`);
          exteriorViewsChecked += 1;
        }
      } finally {
        visual.dispose();
      }
    }
  } finally {
    if (needsDocument) delete (globalThis as unknown as { document?: Document }).document;
  }
  return {
    assertions, maximumWheelWorldErrorMetres, checkedWheelPoses, exteriorViewsChecked,
    collisionLengthAllowanceMetres: 0.12, collisionWidthAllowanceMetres: 0.06,
  };
}
