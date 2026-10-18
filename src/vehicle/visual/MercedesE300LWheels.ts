import * as T from 'three';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import { mesh, rounded } from './MercedesE300LGeometry';
import { mercedesExteriorUV } from './MercedesE300LExteriorDetails';

/**
 * 20-inch luxury multi-spoke wheels. The rear axle carries the wider 275 section
 * while both axles keep the same rolling radius, so the physics datum is shared.
 */
export function buildMercedesE300LWheels(root: T.Group, c: VehicleVisualConfig, atlas: T.Texture): {
  pivots: Record<VehicleWheelId, T.Group>; wheels: T.Mesh[];
} {
  const rubber = new T.MeshStandardMaterial({ color: 0x14171a, roughness: .89 });
  const alloy = new T.MeshStandardMaterial({ color: 0xbcc3c9, metalness: .86, roughness: .25 });
  const inner = new T.MeshStandardMaterial({ color: 0x232830, metalness: .58, roughness: .40 });
  const steel = new T.MeshStandardMaterial({ color: 0x7f868d, metalness: .76, roughness: .46 });
  const machined = new T.MeshStandardMaterial({ map: atlas, alphaTest: .45, metalness: .82,
    roughness: .26, side: T.DoubleSide });
  const faceGeometry = new T.CircleGeometry(.253, 48);
  mercedesExteriorUV(faceGeometry, 'wheel', (x, y) => [(x + .253) / .506, (y + .253) / .506]);
  faceGeometry.rotateY(Math.PI / 2);

  const radius = c.wheelRadius;
  const positions = localWheelPositions(c.dimensions);
  const pivots = {} as Record<VehicleWheelId, T.Group>, wheels: T.Mesh[] = [];
  for (const id of VEHICLE_WHEEL_IDS) {
    const anchor = positions[id], sign = id.endsWith('Left') ? -1 : 1;
    const front = id === 'frontLeft' || id === 'frontRight';
    const width = (front ? c.dimensions.frontWheelWidth : c.dimensions.rearWheelWidth)
      ?? c.dimensions.wheelWidth;
    const shoulder = Math.max(.03, (width - .216) * .5 + .028);
    // Tyre section: broad bead, rounded shoulder, flat crown.
    const profile = [[.253, -width / 2], [.286, -width / 2], [radius - .014, -width * .40],
      [radius, -width * .26], [radius, width * .26], [radius - .014, width * .40],
      [.286, width / 2], [.253, width / 2], [.253, -width / 2]]
      .map(([r, z]) => new T.Vector2(r!, z!));
    const tyreGeometry = new T.LatheGeometry(profile, 64); tyreGeometry.rotateZ(Math.PI / 2);
    const barrelGeometry = new T.CylinderGeometry(.2545, .2545, width * .90, 48, 1, true);
    barrelGeometry.rotateZ(Math.PI / 2);
    const discGeometry = new T.CylinderGeometry(.190, .190, .013, 48); discGeometry.rotateZ(Math.PI / 2);
    const lipGeometry = new T.TorusGeometry(.2525, .0085, 8, 64); lipGeometry.rotateY(Math.PI / 2);

    const pivot = new T.Group();
    pivot.name = id + ' Mercedes wheel mount'; pivot.userData.wheelId = id;
    pivot.position.set(anchor.x, anchor.y - (c.staticBodyOffsetY ?? 0), anchor.z);
    pivots[id] = pivot;
    const tyre = mesh(front ? '245/40 R20 front tyre' : '275/35 R20 rear tyre', tyreGeometry, rubber);
    const face = sign * (width / 2 - .011);
    tyre.add(mesh('20 inch alloy barrel', barrelGeometry, inner));
    const disc = mesh('Ventilated road brake disc', discGeometry, steel);
    disc.position.x = sign * .058; tyre.add(disc);
    const lip = mesh('20 inch polished rim lip', lipGeometry, alloy); lip.position.x = face; tyre.add(lip);
    const spokes = mesh('Twenty-spoke luxury wheel face', faceGeometry, machined);
    spokes.position.x = face + sign * .0035; tyre.add(spokes);
    for (const x of [-.062, 0, .062]) {
      const groove = mesh('Tyre tread groove', new T.TorusGeometry(radius + .0005, .0013, 4, 64), inner);
      groove.rotation.y = Math.PI / 2; groove.position.x = x; tyre.add(groove);
    }
    const caliper = rounded('Front brake caliper', [Math.max(.058, shoulder * .9), .112, .066],
      [sign * .054, .034, .150], inner);
    pivot.add(tyre, caliper); root.add(pivot); wheels.push(tyre);
  }
  return { pivots, wheels };
}
