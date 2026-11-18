import * as T from 'three';
import { surfaceGrid, surfaceLoft, surfaceQuad, surfaceRounded } from './SurfaceVehicleGeometry';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

/** MY2026 January Dragon Face saloon. Large continuous panels, instance materials. */
export function buildQinPlusExterior(root: T.Group, c: VehicleVisualConfig): void {
  const paint = new T.MeshStandardMaterial({ color: c.body.color, roughness: .38, metalness: .35, side: T.DoubleSide });
  const black = new T.MeshStandardMaterial({ color: 0x102026, roughness: .40, side: T.DoubleSide });
  const satin = new T.MeshStandardMaterial({ color: 0xaebbc0, metalness: .8, roughness: .26 });
  const glass = new T.MeshStandardMaterial({ color: 0x7b969b, roughness: .12, transparent: true, opacity: .23,
    metalness: .15, side: T.DoubleSide, depthWrite: false });
  const led = new T.MeshStandardMaterial({ color: 0xe8f6ff, emissive: 0xbad9f2, emissiveIntensity: .65 });
  const tail = new T.MeshStandardMaterial({ color: 0x8f151b, emissive: 0xcb1420, emissiveIntensity: .55 });
  const add = (name: string, size: P, at: P, m: T.Material, radius = .012) => {
    const mesh = surfaceRounded(name, size, at, m, radius); mesh.userData.vehicleBodyPart = 'body'; root.add(mesh); return mesh;
  };
  const stations = [
    [-2.39, .76, .38, .70], [-2.18, .86, .33, .83], [-1.62, .9185, .32, .90],
    [-1.00, .90, .33, .94], [-.35, .895, .33, .96], [.60, .90, .33, .98],
    [1.38, .9185, .33, 1.00], [2.02, .88, .35, .98], [2.39, .79, .40, .93],
  ];
  // One loft owns sides/sills/decks; open arch cuts are sampled into its side edge.
  const archY = (z: number) => {
    const distance = Math.min(Math.abs(z + c.wheelBase / 2), Math.abs(z - c.wheelBase / 2));
    const r = c.wheelRadius + c.body.wheelArchClearance;
    return distance < r ? c.wheelRadius + Math.sqrt(r * r - distance * distance) : .32;
  };
  const dense: { at: number; ring: readonly (readonly [number, number])[] }[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i]!, b = stations[i + 1]!;
    const count = Math.ceil((b[0]! - a[0]!) / .06);
    const slices = Array.from({ length: count }, (_, j) => T.MathUtils.lerp(a[0]!, b[0]!, j / count));
    for (const opening of [-.99, 1.76]) if (opening > a[0]! && opening < b[0]!) slices.push(opening);
    slices.sort((x, y) => x - y);
    for (const z of slices) {
      const f = (z - a[0]!) / (b[0]! - a[0]!);
      const w = T.MathUtils.lerp(a[1]!, b[1]!, f), y = T.MathUtils.lerp(a[3]!, b[3]!, f);
      const bottom = Math.max(T.MathUtils.lerp(a[2]!, b[2]!, f), archY(z));
      dense.push({ at: z, ring: [[-w, bottom], [-w, y - .12], [-w * .91, y], [0, y + .008],
        [w * .91, y], [w, y - .12], [w, bottom], [w * .91, bottom], [-w * .91, bottom]] });
    }
  }
  dense.push({ ...dense[dense.length - 1]!, at: 2.39 });
  const body = surfaceLoft('Qin PLUS continuous saloon body and wheel arch skins', dense, paint);
  // Hood/trunk remain closed; the passenger cell is an actual opening. A
  // continuous deck across this interval cuts through the wheel and footwells.
  const indices = body.geometry.index!, openBody: number[] = [];
  for (let row = 0; row < dense.length - 1; row++) for (let edge = 0; edge < 9; edge++) {
    const z = (dense[row]!.at + dense[row + 1]!.at) / 2;
    if (z > -.99 && z < 1.76 && (edge === 2 || edge === 3)) continue;
    for (let k = 0; k < 6; k++) openBody.push(indices.getX((row * 9 + edge) * 6 + k));
  }
  for (let i = (dense.length - 1) * 9 * 6; i < indices.count; i++) openBody.push(indices.getX(i));
  body.geometry.setIndex(openBody); body.geometry.computeVertexNormals();
  body.userData.vehicleBodyPart = 'body'; root.add(body);
  add('Qin flat underfloor battery enclosure', [1.30, .10, 1.90], [0, .195, .12], black).userData.vehicleBodyPart='underfloor';
  // Cabin silhouette matches the dimensional envelope; no imported SUV geometry.
  root.add(surfaceGrid('Qin PLUS curved roof', 14, 18, (u, v) => {
    const z = T.MathUtils.lerp(-.51, 1.28, v), x = (u * 2 - 1) * (.66 + .025 * Math.sin(v * Math.PI));
    return [x, 1.515 - .075 * (u * 2 - 1) ** 2 - .065 * (v * 2 - 1) ** 2, z];
  }, paint));
  root.add(surfaceQuad('Qin PLUS front windshield', [[-.82, 1.035, -.99], [-.65, 1.445, -.51],
    [.65, 1.445, -.51], [.82, 1.035, -.99]], glass));
  root.add(surfaceQuad('Qin PLUS rear windshield', [[-.65, 1.445, 1.20], [-.79, 1.01, 1.76],
    [.79, 1.01, 1.76], [.65, 1.445, 1.20]], glass));
  for (const side of [-1, 1]) {
    root.add(surfaceQuad('Qin PLUS side glazing', [[side * .85, .995, -.88], [side * .66, 1.44, -.48],
      [side * .66, 1.44, 1.18], [side * .85, .995, 1.55]], glass));
    const pillar = (name: string, a: P, b: P, width: number, m: T.Material) => {
      const v = new T.Vector3(...b).sub(new T.Vector3(...a));
      const node = new T.Mesh(new T.CylinderGeometry(width, width, v.length(), 6), m);
      node.name = name; node.position.set(...a).addScaledVector(v, .5);
      node.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize()); root.add(node);
    };
    pillar('Qin painted A pillar', [side * .84, 1.025, -.99], [side * .66, 1.45, -.51], .035, paint);
    pillar('Qin black B pillar', [side * .85, 1.005, .25], [side * .68, 1.46, .27], .031, black);
    pillar('Qin sculpted C pillar', [side * .84, 1.00, 1.68], [side * .66, 1.45, 1.20], .065, paint);
    add('Qin beltline chrome', [.014, .012, 2.40], [side * .863, .985, .30], satin);
    for (const z of [-.05, .99]) add('Qin conventional door handle', [.022, .026, .14], [side * .901, .90, z], satin);
  }
  add('Qin Dragon Face black grille', [1.50, .30, .035], [0, .56, -2.385], black, .07);
  for (const y of [.45, .51, .57, .63, .69]) add('Qin grille horizontal blade', [1.37, .010, .014], [0, y, -2.409], satin, .004);
  add('Qin Dragon Face chrome brow', [1.56, .037, .023], [0, .808, -2.35], satin);
  for (const side of [-1, 1]) {
    const head = add('Qin swept headlamp housing', [.40, .085, .055], [side * .67, .80, -2.28], black);
    head.rotation.y = side * -.24;
    const strip = add('Qin blue-white LED signature', [.36, .016, .012], [side * .67, .823, -2.315], led);
    strip.rotation.y = side * -.24;
    add('Qin lower corner intake', [.16, .16, .04], [side * .79, .51, -2.27], black);
    add('Qin Chinese knot tail light', [.30, .07, .035], [side * .65, .925, 2.30], tail);
  }
  add('Qin full-width tail lamp', [1.43, .019, .025], [0, .935, 2.36], tail);
  add('Qin rear lower diffuser trim', [1.43, .08, .025], [0, .45, 2.35], black);
  add('Qin rear plate recess', [.43, .125, .015], [0, .69, 2.385], black);
  add('Qin front plate recess', [.40, .105, .017], [0, .55, -2.43], black);
  const badge = add('Qin dynasty grille badge', [.07, .048, .014], [0, .807, -2.373], satin);
  badge.userData.vehicleBodyPart = 'badge';
}
