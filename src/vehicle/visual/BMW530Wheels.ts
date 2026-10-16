import * as T from 'three';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import { mesh, rounded } from './BMW530Geometry';
import { bmwExteriorUV } from './BMW530ExteriorDetails';

export function buildBMW530Wheels(root: T.Group, c: VehicleVisualConfig, map: T.Texture): {
  pivots: Record<VehicleWheelId, T.Group>; wheels: T.Mesh[];
} {
  const rubber = new T.MeshStandardMaterial({ color: 0x14171b, roughness: .88 });
  const alloy = new T.MeshStandardMaterial({ color: 0xb2b9c0, metalness: .85, roughness: .27 });
  const dark = new T.MeshStandardMaterial({ color: 0x242932, metalness: .6, roughness: .38 });
  const steel = new T.MeshStandardMaterial({ color: 0x7e858d, metalness: .78, roughness: .45 });
  const machined = new T.MeshStandardMaterial({ map, alphaTest: .45, metalness: .8, roughness: .28, side: T.DoubleSide });
  const faceGeometry = new T.CircleGeometry(.224, 48);
  bmwExteriorUV(faceGeometry, 'wheel', (x, y) => [(x + .224) / .448, (y + .224) / .448]);
  faceGeometry.rotateY(Math.PI / 2);
  const r = c.wheelRadius, w = c.dimensions.wheelWidth;
  const profile = [[.224, -w / 2], [.282, -w / 2], [r - .012, -w * .40], [r, -w * .28],
    [r, w * .28], [r - .012, w * .40], [.282, w / 2], [.224, w / 2], [.224, -w / 2]];
  const tyreGeometry = new T.LatheGeometry(profile.map(p => new T.Vector2(p[0]!, p[1]!)), 64); tyreGeometry.rotateZ(Math.PI / 2);
  const rimGeometry = new T.CylinderGeometry(.2286, .2286, w * .92, 48, 1, true); rimGeometry.rotateZ(Math.PI / 2);
  const discGeometry = new T.CylinderGeometry(.167, .167, .012, 48); discGeometry.rotateZ(Math.PI / 2);
  const lipGeometry = new T.TorusGeometry(.226, .009, 8, 64); lipGeometry.rotateY(Math.PI / 2);
  const wheelPositions = localWheelPositions(c.dimensions), pivots = {} as Record<VehicleWheelId, T.Group>, wheels: T.Mesh[] = [];
  for (const id of VEHICLE_WHEEL_IDS) {
    const p = wheelPositions[id], sign = id.endsWith('Left') ? -1 : 1;
    const pivot = new T.Group(); pivot.name = id + ' BMW wheel mount'; pivot.userData.wheelId = id;
    pivot.position.set(p.x, p.y - (c.staticBodyOffsetY ?? 0), p.z); pivots[id] = pivot;
    const tyre = mesh('245/45 R18 touring tyre', tyreGeometry, rubber), face = sign * (w / 2 - .009);
    tyre.add(mesh('18 inch alloy barrel', rimGeometry, dark));
    const disc = mesh('Ventilated road brake disc', discGeometry, steel); disc.position.x = sign * .057; tyre.add(disc);
    const lip = mesh('18 inch polished rim lip', lipGeometry, alloy); lip.position.x = face; tyre.add(lip);
    const spokes = mesh('BMW diamond-cut split-spoke atlas face', faceGeometry, machined);
    spokes.position.x = face + sign * .003; tyre.add(spokes);
    // Shallow circumferential tread grooves and raised sidewall bead.
    for (const x of [-.065, 0, .065]) {
      const groove = mesh('Tyre tread groove', new T.TorusGeometry(r + .0005, .0014, 4, 64), dark);
      groove.rotation.y = Math.PI / 2; groove.position.x = x; tyre.add(groove);
    }
    const caliper = rounded('Road brake caliper', [.062, .105, .064], [sign * .052, .03, .141], dark);
    pivot.add(tyre, caliper); root.add(pivot); wheels.push(tyre);
  }
  return { pivots, wheels };
}
