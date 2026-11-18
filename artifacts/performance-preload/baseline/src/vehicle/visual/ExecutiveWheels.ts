import * as T from 'three';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import { executiveUV } from './ExecutiveExteriorSurfaces';

/** Physical tyre silhouette, open barrel and brake disc; the repeated alloy
 * machining uses a single alpha-tested face instead of separate spoke meshes. */
export function buildExecutiveWheels(root: T.Group, config: VehicleVisualConfig, map: T.Texture): {
  pivots: Record<VehicleWheelId, T.Group>; wheels: T.Mesh[];
} {
  const r = config.wheelRadius, w = config.dimensions.wheelWidth, rimRadius = r * .735;
  const rubber = new T.MeshStandardMaterial({ color: 0x101215, roughness: .86 });
  const dark = new T.MeshStandardMaterial({ color: 0x222831, roughness: .4, metalness: .65 });
  const steel = new T.MeshStandardMaterial({ color: 0x6c737b, roughness: .52, metalness: .72 });
  const alloy = new T.MeshStandardMaterial({ map, roughness: .28, metalness: .72, alphaTest: .5, side: T.DoubleSide });
  alloy.name = 'Executive atlas diamond-cut alloy';
  const section = [[rimRadius, -w / 2], [r - .018, -w * .47], [r, -w * .32],
    [r, w * .32], [r - .018, w * .47], [rimRadius, w / 2], [rimRadius, -w / 2]];
  const tyreGeometry = new T.LatheGeometry(section.map(p => new T.Vector2(p[0]!, p[1]!)), 32);
  tyreGeometry.rotateZ(Math.PI / 2);
  const barrelGeometry = new T.CylinderGeometry(rimRadius, rimRadius, w * .92, 32, 1, true); barrelGeometry.rotateZ(Math.PI / 2);
  const discGeometry = new T.CylinderGeometry(r * .52, r * .52, .012, 24); discGeometry.rotateZ(Math.PI / 2);
  const faceGeometry = new T.CircleGeometry(rimRadius, 32);
  const uv = faceGeometry.getAttribute('uv');
  executiveUV(faceGeometry, 'wheel', Array.from({ length: uv.count }, (_, i) => uv.getX(i)), Array.from({ length: uv.count }, (_, i) => uv.getY(i)));
  faceGeometry.rotateY(Math.PI / 2);
  const wheelPositions = localWheelPositions(config.dimensions), pivots = {} as Record<VehicleWheelId, T.Group>, wheels: T.Mesh[] = [];
  for (const id of VEHICLE_WHEEL_IDS) {
    const p = wheelPositions[id], sign = id.endsWith('Left') ? -1 : 1;
    const pivot = new T.Group(); pivot.name = id + ' executive wheel mount'; pivot.userData.wheelId = id;
    pivot.position.set(p.x, p.y - (config.staticBodyOffsetY ?? 0), p.z); pivots[id] = pivot;
    const tyre = new T.Mesh(tyreGeometry, rubber); tyre.name = 'Executive touring tyre'; tyre.castShadow = tyre.receiveShadow = true;
    const width = id.startsWith('front') ? config.dimensions.frontWheelWidth : config.dimensions.rearWheelWidth;
    tyre.scale.x = (width ?? w) / w;
    const barrel = new T.Mesh(barrelGeometry, dark); barrel.name = 'Executive open alloy barrel';
    const disc = new T.Mesh(discGeometry, steel); disc.name = 'Executive brake disc'; disc.position.x = sign * w * .27;
    const face = new T.Mesh(faceGeometry, alloy); face.name = 'Executive textured split-spoke wheel face'; face.position.x = sign * w * .48;
    tyre.add(barrel, disc, face); pivot.add(tyre); root.add(pivot); wheels.push(tyre);
  }
  return { pivots, wheels };
}
