import * as T from 'three';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

/** One indexed mesh for all five swept spokes, shared by four wheel instances. */
export function buildGolfGTIWheels(root: T.Group, c: VehicleVisualConfig) {
  const tyreMat = new T.MeshStandardMaterial({ color: 0x141619, roughness: .92 });
  const alloy = new T.MeshStandardMaterial({ color: 0xb0b6ba, metalness: .8, roughness: .29, side: T.DoubleSide });
  const dark = new T.MeshStandardMaterial({ color: 0x33383b, metalness: .62, roughness: .46 });
  const tyreG = new T.CylinderGeometry(c.wheelRadius, c.wheelRadius, c.dimensions.wheelWidth, 40, 1, true); tyreG.rotateZ(Math.PI / 2);
  const ringG = new T.TorusGeometry(.221, .012, 8, 40); ringG.rotateY(Math.PI / 2);
  const discG = new T.CylinderGeometry(.147, .147, .016, 32); discG.rotateZ(Math.PI / 2);
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    for (const [r, angle] of [[.042, a - .3], [.218, a + .03], [.218, a + .20], [.065, a + .44]]) {
      positions.push(.109, Math.cos(angle!) * r!, Math.sin(angle!) * r!);
    }
    const n = i * 4; indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const spokesG = new T.BufferGeometry(); spokesG.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  spokesG.setIndex(indices); spokesG.computeVertexNormals();
  const sidewallG = new T.RingGeometry(.224, c.wheelRadius, 40); sidewallG.rotateY(Math.PI / 2);
  tyreMat.side = T.DoubleSide;
  const pivots = {} as Record<VehicleWheelId, T.Group>, wheels: T.Mesh[] = [], anchors = localWheelPositions(c.dimensions);
  for (const id of VEHICLE_WHEEL_IDS) {
    const a = anchors[id], pivot = new T.Group(); pivot.name = id + ' wheel pivot'; pivot.userData.wheelId = id;
    pivot.position.set(a.x, a.y - (c.staticBodyOffsetY ?? 0), a.z);
    const tyre = new T.Mesh(tyreG, tyreMat); tyre.name = 'GTI 225/40 R18 tyre'; tyre.castShadow = tyre.receiveShadow = true;
    const disc = new T.Mesh(discG, dark); tyre.add(disc);
    for (const sign of [-1, 1]) {
      const ring = new T.Mesh(ringG, alloy); ring.position.x = sign * .109; tyre.add(ring);
      const sidewall = new T.Mesh(sidewallG, tyreMat); sidewall.position.x = sign * .1125; tyre.add(sidewall);
      const spokes = new T.Mesh(spokesG, alloy); spokes.scale.x = sign; spokes.name = 'GTI five swept spokes single mesh'; tyre.add(spokes);
    }
    pivot.add(tyre); root.add(pivot); pivots[id] = pivot; wheels.push(tyre);
  }
  return { pivots, wheels };
}
