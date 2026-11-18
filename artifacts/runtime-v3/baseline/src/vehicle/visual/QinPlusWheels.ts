import * as T from 'three';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

/** Independent 16-inch alloy / 225/60 tyre approximation; brakes stay on uprights. */
export function buildQinPlusWheels(root: T.Group, c: VehicleVisualConfig) {
  const pivots = {} as Record<VehicleWheelId, T.Group>, wheels: T.Mesh[] = [];
  const rubber = new T.MeshStandardMaterial({ color: 0x14181b, roughness: .9, side: T.DoubleSide });
  const metal = new T.MeshStandardMaterial({ color: 0xa7b3b8, metalness: .8, roughness: .27 });
  const dark = new T.MeshStandardMaterial({ color: 0x2c3539, metalness: .5, roughness: .55 });
  const tireGeometry = new T.CylinderGeometry(c.wheelRadius, c.wheelRadius, c.dimensions.wheelWidth, 32, 1, true);
  tireGeometry.rotateZ(Math.PI / 2);
  const sidewallGeometry = new T.RingGeometry(.205, c.wheelRadius, 32); sidewallGeometry.rotateY(Math.PI / 2);
  const ringGeometry = new T.TorusGeometry(.199, .010, 6, 32); ringGeometry.rotateY(Math.PI / 2);
  const discGeometry = new T.CylinderGeometry(.126, .126, .012, 24); discGeometry.rotateZ(Math.PI / 2);
  const spokeGeometry = new T.BoxGeometry(.014, .025, .15); spokeGeometry.translate(0, 0, .112);
  const positions = localWheelPositions(c.dimensions), matrix = new T.Matrix4(), rotation = new T.Quaternion();
  for (const id of VEHICLE_WHEEL_IDS) {
    const p = positions[id];
    const pivot = new T.Group(); pivot.name = `Qin ${id} upright`; pivot.userData.wheelId = id;
    pivot.position.set(p.x, p.y - (c.staticBodyOffsetY ?? 0), p.z);
    const wheel = new T.Mesh(tireGeometry, rubber); wheel.name = `Qin ${id} tyre`; wheel.castShadow = true;
    // Registry discovery requires the spinning tyre at child zero; upright
    // brakes remain subsequent children and do not rotate with wheel spin.
    pivot.add(wheel);
    for (const sign of [-1, 1]) {
      const wall = new T.Mesh(sidewallGeometry, rubber); wall.position.x = sign * c.dimensions.wheelWidth / 2; wheel.add(wall);
    }
    const side = id.endsWith('Left') ? -1 : 1;
    const ring = new T.Mesh(ringGeometry, metal); ring.position.x = side * .109; wheel.add(ring);
    const spokes = new T.InstancedMesh(spokeGeometry, metal, 10); spokes.position.x = side * .106;
    for (let i = 0; i < 10; i++) {
      rotation.setFromAxisAngle(new T.Vector3(1, 0, 0), i * Math.PI / 5);
      matrix.compose(new T.Vector3(), rotation, new T.Vector3(1, 1, 1)); spokes.setMatrixAt(i, matrix);
    }
    wheel.add(spokes);
    const disc = new T.Mesh(discGeometry, dark); disc.position.x = side * .075; pivot.add(disc);
    const caliper = new T.Mesh(new T.BoxGeometry(.034, .11, .055), dark); caliper.position.set(side * .07, .015, .11); pivot.add(caliper);
    root.add(pivot); pivots[id] = pivot; wheels.push(wheel);
  }
  return { pivots, wheels };
}
