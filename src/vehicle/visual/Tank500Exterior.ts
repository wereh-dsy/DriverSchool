import * as T from 'three';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
export { buildTank500BodyExterior as buildTank500Exterior } from './Tank500BodyExterior';
const material = (color: number, metalness = .1, roughness = .45) => new T.MeshStandardMaterial({ color, metalness, roughness });
export function buildTank500Wheels(root: T.Group, c: VehicleVisualConfig): { pivots: Record<VehicleWheelId, T.Group>; wheels: T.Mesh[] } {
  const pivots = {} as Record<VehicleWheelId, T.Group>, wheels: T.Mesh[] = [];
  const tyre = material(0x131617, 0, .94), rim = material(0xa3a7aa, .8, .25), recess = material(0x22282b, .4, .6);
  const geometry = new T.CylinderGeometry(c.wheelRadius, c.wheelRadius, c.dimensions.wheelWidth, 32); geometry.rotateZ(Math.PI / 2);
  const rimGeometry = new T.CylinderGeometry(.245, .245, c.dimensions.wheelWidth + .005, 24); rimGeometry.rotateZ(Math.PI / 2);
  const positions = localWheelPositions(c.dimensions);
  for (const id of VEHICLE_WHEEL_IDS) {
    const p = positions[id], pivot = new T.Group(); pivot.name = `Tank ${id} steering pivot`; pivot.userData.wheelId = id;
    pivot.position.set(p.x, p.y, p.z); root.add(pivot); pivots[id] = pivot;
    const wheel = new T.Mesh(geometry, tyre); wheel.name = `Tank ${id} all-terrain tyre`; wheel.castShadow = true; pivot.add(wheel); wheels.push(wheel);
    const face = new T.Mesh(rimGeometry, recess); wheel.add(face);
    const spokes = new T.InstancedMesh(new T.BoxGeometry(.016, .055, .19), rim, 12), matrix = new T.Matrix4();
    for (let j = 0; j < 12; j++) { const a = j * Math.PI / 6; matrix.makeRotationX(a); matrix.setPosition((id.includes('Left') ? -1 : 1) * .137, Math.sin(a) * .13, Math.cos(a) * .13); spokes.setMatrixAt(j, matrix); }
    wheel.add(spokes);
    const tread = new T.InstancedMesh(new T.BoxGeometry(.10, .013, .052), tyre, 72);
    for (let j = 0; j < 72; j++) { const a = Math.floor(j / 3) / 24 * Math.PI * 2; matrix.makeRotationX(a); matrix.setPosition((j % 3 - 1) * .082, Math.cos(a) * c.wheelRadius, Math.sin(a) * c.wheelRadius); tread.setMatrixAt(j, matrix); }
    wheel.add(tread);
  }
  return { pivots, wheels };
}

