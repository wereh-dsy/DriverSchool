import * as T from 'three';
import { surfaceGrid, surfaceLoft, surfaceQuad, surfaceRounded } from './SurfaceVehicleGeometry';
import { gtiMaterial } from './GolfGTISurfaces';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';

/** Shared exact frame datums, borrowed by the glass and the interior liners. */
export function gtiWindshieldPoint(c: VehicleVisualConfig, u: number, v: number): P {
  const half = T.MathUtils.lerp(c.cabin.width / 2 + .025, c.body.roofWidth / 2 - .035, u);
  return [(v * 2 - 1) * half, T.MathUtils.lerp(c.cabin.windshieldBottomY, c.cabin.windshieldTopY, u),
    T.MathUtils.lerp(c.cabin.windshieldBottomZ, c.cabin.windshieldTopZ, u) - .035 * Math.sin(v * Math.PI)];
}
export function gtiSidePoint(c: VehicleVisualConfig, sign: number, z: number, y: number): P {
  const t = T.MathUtils.clamp((y - c.cabin.windshieldBottomY) / (c.cabin.roofY - c.cabin.windshieldBottomY), 0, 1);
  return [sign * T.MathUtils.lerp(c.cabin.width / 2 + .033, c.body.roofWidth / 2, t), y, z];
}
export function gtiWindowFrame(c: VehicleVisualConfig, sign: number, material: T.Material, inward = 0): T.Mesh {
  const outer = [[-.90, .84], [-.50, 1.388], [1.25, 1.413], [1.945, .855]];
  const inner = [[-.79, .895], [-.422, 1.339], [1.14, 1.354], [1.70, .895]];
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i < 4; i++) for (const ring of [outer, inner]) {
    const [z, y] = ring[i]!; const p = gtiSidePoint(c, sign, z!, y!); positions.push(p[0] - sign * inward, p[1], p[2]); uv.push(i / 3, ring === outer ? 0 : 1);
  }
  for (let i = 0; i < 4; i++) { const a = i * 2, b = ((i + 1) % 4) * 2; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  const mesh = new T.Mesh(g, material); mesh.name = `${sign < 0 ? 'Left' : 'Right'} GTI continuous A/C window frame`; return mesh;
}

export function buildGolfGTIExterior(root: T.Group, c: VehicleVisualConfig, assets?: VehicleAssetRegistry): void {
  const paint = new T.MeshPhysicalMaterial({ color: c.body.color, roughness: .29, metalness: .25, clearcoat: .7, clearcoatRoughness: .25, side: T.DoubleSide });
  const trim = new T.MeshStandardMaterial({ color: c.body.trimColor, roughness: .55, side: T.DoubleSide });
  const glass = new T.MeshPhysicalMaterial({ color: c.windowGlass!.color, transparent: true,
    opacity: c.windowGlass!.windowOpacity, roughness: .12, metalness: .12, depthWrite: false, side: T.DoubleSide });
  const side = gtiMaterial('side', c, assets), front = gtiMaterial('front', c, assets), rear = gtiMaterial('rear', c, assets), badge = gtiMaterial('badge', c, assets);
  side.roughness = rear.roughness = .32; side.metalness = rear.metalness = .25;
  const h = c.vehicleLength / 2, w = c.vehicleWidth / 2;
  const skinWidth = (z: number) => w * (1 - .07 * Math.abs(z / h) ** 5);
  const belt = (z: number) => .845 + .025 * Math.sin((z + h) / (h * 2) * Math.PI);
  const archY = (z: number) => {
    const dy = c.body.wheelArchCenterY ?? c.wheelRadius, r = c.wheelRadius + c.body.wheelArchClearance;
    const distance = Math.min(Math.abs(z + c.wheelBase / 2), Math.abs(z - c.wheelBase / 2));
    return distance < r ? dy + Math.sqrt(r * r - distance * distance) : c.body.groundClearance;
  };
  for (const sign of [-1, 1]) {
    const label = sign < 0 ? 'Left' : 'Right';
    const flank = surfaceGrid(label + ' GTI arch-cut door and fender skin', 120, 6, (u, v) => {
      const z = T.MathUtils.lerp(-h, h, u), top = belt(z), bottom = archY(z);
      const y = T.MathUtils.lerp(bottom, top, v);
      return [sign * skinWidth(z) * (1 - .07 * (1 - v) ** 3), y, z];
    }, side);
    // Atlas U runs along the car, V runs down the doors independently of arch cuts.
    const p = flank.geometry.getAttribute('position'), uv = flank.geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getZ(i) + h) / (2 * h), (p.getY(i) - .135) / .74);
    root.add(flank, gtiWindowFrame(c, sign, paint));
    const panel = (name: string, zy: number[][], mat: T.Material) => surfaceQuad(label + ' ' + name,
      zy.map(([z, y]) => gtiSidePoint(c, sign, z!, y!)) as unknown as [P, P, P, P], mat);
    root.add(panel('GTI front door glass', [[-.79, .895], [-.422, 1.339], [.25, 1.345], [.27, .895]], glass));
    root.add(panel('GTI rear door glass', [[.32, .895], [.30, 1.346], [1.08, 1.353], [1.42, .895]], glass));
    root.add(panel('GTI quarter glass', [[1.46, .895], [1.12, 1.35], [1.14, 1.354], [1.70, .895]], glass));
    root.add(panel('GTI B pillar', [[.265, .855], [.245, 1.375], [.31, 1.375], [.33, .855]], trim));
    root.add(panel('GTI rear window divider', [[1.425, .875], [1.06, 1.368], [1.105, 1.368], [1.475, .875]], trim));
  }
  root.add(surfaceGrid('GTI crowned short bonnet', 16, 24, (u, v) => {
    const z = T.MathUtils.lerp(-h, c.cabin.windshieldBottomZ, u), x = (v * 2 - 1) * skinWidth(z);
    return [x, belt(z) - .035 + .026 * Math.sin(v * Math.PI), z];
  }, paint));
  root.add(surfaceGrid('GTI continuous roof', 24, 24, (u, v) => {
    const z = T.MathUtils.lerp(-.50, 1.25, u), x = (v * 2 - 1) * c.body.roofWidth / 2;
    return [x, 1.391 + .026 * Math.sin(v * Math.PI) + .013 * Math.sin(u * Math.PI), z];
  }, paint));
  const windshield = glass.clone(); windshield.opacity = c.windowGlass!.windshieldOpacity;
  root.add(surfaceGrid('GTI curved windshield', 12, 24, (u, v) => gtiWindshieldPoint(c, u, v), windshield));
  root.add(surfaceGrid('GTI windshield roof header closure', 2, 24, (u,v) => {
    const p = gtiWindshieldPoint(c,1,v); return [p[0], T.MathUtils.lerp(p[1],1.391 + .026*Math.sin(v*Math.PI),u), T.MathUtils.lerp(p[2],-.50,u)];
  },paint));
  root.add(surfaceGrid('GTI tailgate glass', 10, 18, (u, v) => [
    (v * 2 - 1) * T.MathUtils.lerp(.65, .76, u), T.MathUtils.lerp(1.37, .91, u), T.MathUtils.lerp(1.24, 1.91, u)], glass));
  root.add(surfaceLoft('GTI short roof spoiler', [
    { at: 1.21, ring: [[-.68, 1.395], [.68, 1.395], [.68, 1.43], [-.68, 1.43]] },
    { at: 1.38, ring: [[-.69, 1.37], [.69, 1.37], [.69, 1.41], [-.69, 1.41]] },
  ], trim));
  root.add(surfaceGrid('GTI tailgate shoulder closure', 8, 12, (u, v) => [
    (v * 2 - 1) * T.MathUtils.lerp(.76, skinWidth(h), u), T.MathUtils.lerp(.91, belt(h), u), T.MathUtils.lerp(1.91, h, u)], paint));
  root.add(surfaceRounded('GTI painted front fascia', [1.66, .56, .10], [0, .51, -h + .05], paint, .09));
  root.add(surfaceRounded('GTI hatch and rear bumper', [1.67, .70, .11], [0, .53, h - .055], rear, .075));
  root.add(surfaceRounded('GTI upper honeycomb red stripe grille', [.97, .12, .006], [0, .72, -h - .003], front, .015));
  root.add(surfaceRounded('GTI lower honeycomb intake', [1.26, .245, .008], [0, .422, -h - .004], front, .06));
  root.add(surfaceRounded('GTI rear dark valance', [1.57, .12, .01], [0, .215, h + .002], trim, .03));
  for (const [z, y] of [[-h - .008, .754], [h + .007, .805]]) {
    const emblem = new T.Mesh(new T.PlaneGeometry(.085, .085), badge); emblem.position.set(0, y!, z!);
    if (z! < 0) emblem.rotation.y = Math.PI; emblem.name = 'GTI VW surface emblem'; root.add(emblem);
  }
  const optic = new T.MeshStandardMaterial({ color: 0x20282e, roughness: .25, side: T.DoubleSide });
  const lamp = (name: string, key: string, size: P, pos: P, mat = optic) => {
    const m = surfaceRounded(name, size, pos, mat, .012); m.userData.lightingKey = key; root.add(m);
  };
  for (const sign of [-1, 1]) {
    const label = sign < 0 ? 'Left' : 'Right', signal = sign < 0 ? 'left' : 'right';
    const housing = surfaceRounded(label + ' GTI swept headlamp housing', [.41, .12, .012], [sign * .62, .741, -h - .006], optic, .025);
    housing.userData.vehicleBodyPart = 'headlamp'; root.add(housing);
    lamp(label + ' GTI low high module', 'head', [.20, .045, .004], [sign * .60, .755, -h - .014]);
    lamp(label + ' GTI U LED signature', 'position', [.34, .012, .004], [sign * .62, .713, -h - .016]);
    lamp(label + ' GTI front amber', signal, [.27, .012, .004], [sign * .65, .697, -h - .015]);
    lamp(label + ' GTI fog', 'fogFront', [.075, .045, .004], [sign * .75, .40, -h - .014]);
    lamp(label + ' GTI tail outline', 'tail', [.38, .017, .004], [sign * .62, .80, h + .012]);
    lamp(label + ' GTI brake', 'brake', [.34, .036, .004], [sign * .63, .770, h + .012]);
    lamp(label + ' GTI rear amber', signal, [.22, .014, .004], [sign * .68, .737, h + .012]);
    lamp(label + ' GTI reverse', 'reverse', [.12, .018, .004], [sign * .50, .713, h + .012]);
    // Hollow physical dual outlets, no fake four-pipe R treatment.
    const exhaust = new T.Mesh(new T.CylinderGeometry(.034, .034, .10, 16, 1, true),
      new T.MeshStandardMaterial({ color: 0x949b9f, metalness: .8, roughness: .32, side: T.DoubleSide }));
    exhaust.rotation.x = Math.PI / 2; exhaust.position.set(sign * .63, .232, h - .052); exhaust.name = 'GTI dual exhaust outlet'; root.add(exhaust);
  }
  lamp('GTI rear fog', 'fogRear', [.11, .024, .004], [-.48, .25, h + .011]);
  lamp('GTI high mounted brake', 'brake', [.23, .018, .004], [0, 1.374, 1.35]);
  const underfloor = surfaceQuad('GTI underfloor', [[-.65,.135,-h],[.65,.135,-h],[.65,.135,h],[-.65,.135,h]], trim);
  // Stance/clearance validation locates the physical body datum via this category.
  underfloor.userData.vehicleBodyPart = 'main-shell';
  root.add(underfloor);
  root.traverse(o => { if (o instanceof T.Mesh && !o.userData.vehicleBodyPart) o.userData.vehicleBodyPart = 'body'; });
}
