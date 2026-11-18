import * as THREE from 'three';
import { getVehicleDescriptor, createVehiclePhysicsConfig } from '../VehicleCatalog';
import { VehicleVisual } from './VehicleVisual';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { createVehicleOBB } from '../physics/CollisionSystem';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { ElectricPowertrain } from '../powertrain/ElectricPowertrain';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';

export function runTeslaModel3VisualSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Tesla structure: ${message}`); };
  const needsDocument = typeof document === 'undefined';
  if (needsDocument) Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) } });
  const descriptor = getVehicleDescriptor('tesla-model-3-rwd'), config = createVehiclePhysicsConfig('tesla-model-3-rwd');
  const visual = new VehicleVisual(descriptor.visualConfig);
  try {
    assert(descriptor.visualConfig.body.design === 'electric-fastback', 'independent fastback shape family');
    assert(visual.root.getObjectByName('Minimal horizontal electric dashboard') !== undefined, 'horizontal dashboard exists');
    assert(visual.root.getObjectByName('Electric centre touchscreen') !== undefined, 'centre landscape screen exists');
    assert(visual.root.getObjectByName('Instrument binnacle back') === undefined && visual.root.getObjectByName('Tachometer') === undefined, 'no behind-wheel cluster or ICE gauges');
    assert(visual.root.getObjectByName('Gear lever knob') === undefined && !visual.root.getObjectByName('Comfort trapezoid grille'), 'no fabricated lever or ICE grille');
    const screen = visual.root.getObjectByName('Landscape touchscreen bezel') as THREE.Mesh<THREE.BoxGeometry>;
    assert(screen.geometry.parameters.width > screen.geometry.parameters.height, 'landscape physical screen');
    const camera = new THREE.PerspectiveCamera(65, 16 / 9, .05, 100);
    camera.position.set(...descriptor.visualConfig.driverEyePosition); camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, -1))); camera.updateMatrixWorld(true);
    visual.root.updateMatrixWorld(true);
    const screenCentre = screen.getWorldPosition(new THREE.Vector3()).project(camera);
    assert(Math.abs(screenCentre.x) < .9 && Math.abs(screenCentre.y) < .9 && screenCentre.z < 1, 'central display is inside default driver view');
    const physics = new VehicleDynamics<ElectricPowertrain>(config, { speed: 12, yaw: .42, x: 3, z: -6, driveSelector: 'D' }, new ElectricPowertrain(config));
    const state = physics.stepFixed(1 / 120, { ...createNeutralVehicleInputState(), steering: .3, throttle: .3 });
    visual.setPose({ position: { x: state.x, y: state.chassis.groundHeight + state.chassis.rideOffset, z: state.z }, yawRadians: state.yaw, pitchRadians: state.chassis.pitch, rollRadians: state.chassis.roll });
    visual.setWheelGroundHeights(Object.fromEntries(VEHICLE_WHEEL_IDS.map(id => [id, state.wheels[id].worldPosition.y - config.wheelRadius])) as Record<typeof VEHICLE_WHEEL_IDS[number], number>);
    visual.setWheelAlignment(state.wheels); visual.root.updateMatrixWorld(true);
    const anchors = localWheelPositions(config);
    for (const id of VEHICLE_WHEEL_IDS) {
      const pivot = visual.wheelPivots[id], position = pivot.getWorldPosition(new THREE.Vector3());
      assert(Math.hypot(position.x - state.wheels[id].worldPosition.x, position.z - state.wheels[id].worldPosition.z) < 1e-6, `${id}: visual/contact planar centres match under pitch, roll and asymmetric CG`);
      assert(Math.abs(pivot.rotation.y + state.wheels[id].steeringAngle) < 1e-10, `${id}: steering plus toe is rendered`);
      const left = id.endsWith('Left'); assert(Math.abs(pivot.rotation.z - (left ? 1 : -1) * (state.wheels[id].camberAngle ?? 0)) < 1e-10, `${id}: mirrored camber is rendered`);
      assert(Math.abs(anchors[id].z) === config.wheelBase / 2, `${id}: body geometry uses axle-midpoint datum`);
    }
    const body = createVehicleOBB({ x: state.x, z: state.z, yaw: state.yaw }, descriptor.visualConfig.collisionDimensions);
    assert(Math.abs(body.halfLength * 2 + .12 - config.length) < 1e-9 && Math.abs(body.halfWidth * 2 + .06 - config.width) < 1e-9, 'collision envelope shares physical dimensions and existing contact allowances');
    assert(config.mass > createVehiclePhysicsConfig('ferrari-458-italia').mass && config.yawInertia > createVehiclePhysicsConfig('ferrari-458-italia').yawInertia, 'battery sedan has plausible larger yaw inertia than Ferrari');
    const detached = createVehiclePhysicsConfig('tesla-model-3-rwd'); detached.battery.defaultStateOfCharge = .2; detached.suspension.kinematics!.front.staticCamber = 0;
    assert(descriptor.physicsConfig !== detached && createVehiclePhysicsConfig('tesla-model-3-rwd').battery.defaultStateOfCharge === .8, 'spawn config deeply detached');
    return { assertions, physicalWheelPoses: 4, cockpitDisplay: 'ev-center' };
  } finally { visual.dispose(); if (needsDocument) Reflect.deleteProperty(globalThis, 'document'); }
}


