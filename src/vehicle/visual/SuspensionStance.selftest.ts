import * as THREE from 'three';
import { DriverCamera } from '../../camera/DriverCamera';
import { VEHICLE_CATALOG } from '../VehicleCatalog';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { SuspensionSystem } from '../physics/SuspensionSystem';
import { chassisBodyPose } from '../physics/WheelPhysicsState';
import { createStaticOBBCollider, VehicleCollisionSystem } from '../physics/CollisionSystem';
import { VehicleVisual } from './VehicleVisual';
import { VehicleLighting } from './VehicleLighting';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';

/** Loaded stance, full-bump clearance and body-mounted fixtures; no driving tuning. */
export function runSuspensionStanceSelfTest() {
  let assertions = 0;
  let maximumWheelError = 0;
  const assert = (ok: boolean, message: string) => {
    assertions++;
    if (!ok) throw new Error(`Suspension stance: ${message}`);
  };
  const needsDocument = typeof document === 'undefined';
  if (needsDocument) Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) },
  });
  try {
    for (const car of VEHICLE_CATALOG) {
      const config = car.visualConfig;
      const physics = car.physicsConfig;
      const spring = new SuspensionSystem(physics);
      const rest = spring.getSnapshot();
      for (const id of VEHICLE_WHEEL_IDS) {
        const corner = rest.wheels[id];
        assert(corner.compression > physics.suspension.suspensionTravel * .5 &&
          corner.compression + physics.suspension.suspensionTravel * .5 < physics.suspension.restLength * .94,
        `${car.id}: loaded equilibrium reserves compression and rebound travel`);
        assert(corner.bumpStopForce === 0 && Math.abs(corner.springForce - corner.staticLoad) < 1e-8,
          `${car.id}: static load is supported without bump stops`);
      }
      const visual = new VehicleVisual(config);
      const lights = new VehicleLighting(visual);
      try {
        const camera = new DriverCamera({ driverEyePosition: new THREE.Vector3(...config.driverEyePosition) });
        const fixtures = [visual.cockpitRoot.steeringWheelBase, visual.getMirrorSurface('left'),
          visual.getMirrorSurface('right'), visual.root.getObjectByName('Left low/high headlamp')!];
        const fixtureAnchors = fixtures.map(object => object.getWorldPosition(new THREE.Vector3()));
        const anchors = localWheelPositions(physics);
        const points = Object.fromEntries(VEHICLE_WHEEL_IDS.map(id => [id, anchors[id]])) as typeof anchors;
        const pose = chassisBodyPose(rest.chassis, config.staticBodyOffsetY);
        visual.setWorldPose(0, pose.y, 0, 0, pose.pitch, pose.roll);
        visual.setWheelWorldPositions(points);
        visual.root.updateWorldMatrix(true, true);
        let floorY = Number.POSITIVE_INFINITY;
        visual.exteriorRoot.traverse(object => {
          if (object instanceof THREE.Mesh && object.userData.vehicleBodyPart === 'main-shell') {
            floorY = new THREE.Box3().setFromObject(object).min.y;
          }
        });
        assert(Math.abs(floorY - physics.suspension.rideHeight) < 1e-6,
          `${car.id}: visible underfloor ${floorY} matches loaded rideHeight ${physics.suspension.rideHeight}`);
        // Test the actual shell/trim at the tyre crown at the compression limit.
        visual.setWorldPose(0, pose.y - physics.suspension.suspensionTravel * .5, 0, 0);
        visual.setWheelWorldPositions(points);
        visual.root.updateWorldMatrix(true, true);
        const ray = new THREE.Raycaster();
        ray.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR);
        for (const id of VEHICLE_WHEEL_IDS) {
          const wheel = anchors[id];
          const side = Math.sign(wheel.x);
          ray.set(new THREE.Vector3(side * 2, wheel.y + physics.wheelRadius + .001, wheel.z),
            new THREE.Vector3(-side, 0, 0));
          const innerSide = Math.abs(wheel.x) - physics.wheelWidth * .5;
          const intrusion = ray.intersectObject(visual.exteriorRoot, true).filter(hit => hit.distance <= 2 - innerSide);
          assert(intrusion.length === 0,
            `${car.id}: ${id} body/trim clear tyre crown at full bump (${intrusion.map(hit => hit.object.name).join(', ')})`);
          const error = visual.wheelPivots[id].getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(wheel.x, wheel.y, wheel.z));
          maximumWheelError = Math.max(maximumWheelError, error);
          assert(error < 1e-9, `${car.id}: full bump keeps the physical wheel grounded`);
        }
        for (let i = 0; i < 120; i++) spring.update(1 / 120, { longitudinalAcceleration: -4, lateralAcceleration: 3 });
        const moving = chassisBodyPose(spring.getSnapshot().chassis, config.staticBodyOffsetY);
        assert(moving.pitch < 0 && moving.roll > 0, `${car.id}: suspension supplies braking pitch and cornering roll`);
        visual.setWorldPose(0, moving.y, 0, .7, moving.pitch, moving.roll);
        visual.setWheelWorldPositions(points);
        visual.root.updateWorldMatrix(true, true);
        fixtures.forEach((fixture, index) => {
          assert(fixture.getWorldPosition(new THREE.Vector3()).distanceTo(
            visual.root.localToWorld(fixtureAnchors[index]!.clone())) < 1e-9,
          `${car.id}: cockpit, mirror plane and lights share the chassis transform`);
        });
        camera.update(visual.root, 0);
        assert(camera.camera.position.distanceTo(visual.root.localToWorld(new THREE.Vector3(...config.driverEyePosition))) < 1e-9,
          `${car.id}: DriverEye follows the same body datum`);
        for (const clearanceDelta of [-.005, .005]) {
          const collider = createStaticOBBCollider({ id: 'height-probe', x: 0, z: 0, width: 1, length: 1,
            minHeight: 0, maxHeight: physics.suspension.rideHeight + clearanceDelta });
          const collision = new VehicleCollisionSystem([collider]).resolve({
            previousPose: { x: 0, z: 0, yaw: 0, ...pose }, pose: { x: 0, z: 0, yaw: 0, ...pose },
            velocity: { x: 0, z: 0 }, dimensions: config.collisionDimensions, dt: 1 / 120,
          });
          assert(collision.collided === (clearanceDelta > 0), `${car.id}: collider bottom follows actual rideHeight`);
        }
      } finally { lights.dispose(); visual.dispose(); }
    }
  } finally {
    if (needsDocument) delete (globalThis as unknown as { document?: Document }).document;
  }
  return { assertions, maximumWheelError };
}
