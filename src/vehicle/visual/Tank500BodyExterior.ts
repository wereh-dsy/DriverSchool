import * as T from 'three';
import { vehiclePaint, vehicleGlass } from './VehicleMaterials';
import { surfaceGrid, surfaceQuad, surfaceRounded } from './SurfaceVehicleGeometry';
import { TANK_BODY as b, tankArchBottom, tankFrontPoint, tankRearPoint, tankSidePoint, tankWindshieldPoint, tankHoodPoint, tankShoulderHeight, tankSidePane, tankRibbon, tankJoin } from './Tank500BodyGeometry';
import { tankGrilleTexture, tankLensTexture } from './Tank500Textures';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

export function buildTank500BodyExterior(root: T.Group, c: VehicleVisualConfig): void {
  const paint = vehiclePaint(c.body.color, { metalness: .32, side: T.DoubleSide });
  const dark = new T.MeshStandardMaterial({ color: 0x172026, roughness: .70, side: T.DoubleSide });
  const satin = new T.MeshStandardMaterial({ color: 0xa2afb2, metalness: .83, roughness: .27, side: T.DoubleSide });
  const glass = vehicleGlass(c.windowGlass?.color ?? 0x647e89, c.windowGlass?.windowOpacity ?? .22);
  const grille = new T.MeshStandardMaterial({ map: tankGrilleTexture(), metalness: .68, roughness: .32, side: T.DoubleSide });
  const optics = new T.MeshStandardMaterial({ map: tankLensTexture(), roughness: .16, metalness: .35, side: T.DoubleSide });
  const addBox = (name: string, size: P, at: P, m: T.Material = dark) => { const node = surfaceRounded(name, size, at, m, .018); root.add(node); return node; };
  const hinge = new T.Group(), door = new T.Group(); hinge.name = 'Driver door hinge'; hinge.position.set(-.92, b.belt, b.doorFront);
  door.name = 'Driver door'; hinge.add(door); root.add(hinge);
  const onDoor = (object: T.Object3D) => { object.position.sub(hinge.position); door.add(object); };
  const windowFrame = (side: number, points: readonly (readonly [number, number])[], name: string, moving: boolean) => {
    const parts: T.Mesh[] = [];
    const outer = points.map(([z, y]) => tankSidePoint(c, side, z, y));
    const centerZ = points.reduce((s, p) => s + p[0], 0) / points.length, centerY = points.reduce((s, p) => s + p[1], 0) / points.length;
    const inner = points.map(([z, y]) => tankSidePoint(c, side, T.MathUtils.lerp(z, centerZ, .035), T.MathUtils.lerp(y, centerY, .07)));
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const frame = surfaceQuad(name + ' edge ' + i, [outer[i]!, inner[i]!, inner[j]!, outer[j]!], satin);
      parts.push(frame);
    }
    const joined = tankJoin(name, parts, satin); moving ? onDoor(joined) : root.add(joined);
  };
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'Left' : 'Right';
    const ranges = side < 0 ? [[-c.vehicleLength / 2, b.doorFront, false], [b.doorFront, b.doorRear, true], [b.doorRear, b.rear, false]] as const : [[-c.vehicleLength / 2, b.rear, false]] as const;
    for (const [from, to, moving] of ranges) {
      const skin = surfaceGrid(label + (moving ? ' Tank hinged door skin' : ' Tank sculpted fender and shoulder'), Math.ceil((to - from) / .045), 10, (u, v) => {
        const z = T.MathUtils.lerp(from, to, u), y = T.MathUtils.lerp(tankArchBottom(c, z), tankShoulderHeight(z), v);
        const p = tankSidePoint(c, side, z, y);
        const end = z < -2.1 ? (tankFrontPoint(c, p[0], y)[2] + c.vehicleLength / 2) * (1 - T.MathUtils.smoothstep(z, -c.vehicleLength / 2, -2.1)) :
          (tankRearPoint(p[0], y)[2] - b.rear) * T.MathUtils.smoothstep(z, 1.85, b.rear);
        return [p[0], y, p[2] + end];
      }, paint);
      moving ? onDoor(skin) : root.add(skin);
    }
    const frames = [b.frontWindow, b.rearWindow, b.quarterWindow];
    for (let i = 0; i < frames.length; i++) {
      const points = frames[i]!, moving = side < 0 && i === 0;
      const pane = tankSidePane(label + ' Tank ' + (i === 0 ? 'front door glass' : i === 1 ? 'rear door glass' : 'quarter glass'), c, side, points, moving ? glass.clone() : glass);
      if (moving) {
        const mount = new T.Group(); mount.name = 'Driver window glass mount'; mount.userData.driverWindowBeltHeight = b.belt - hinge.position.y;
        pane.position.sub(hinge.position); mount.add(pane); door.add(mount);
      } else root.add(pane);
      windowFrame(side, points, label + ' Tank window frame ' + i, moving);
    }
    // A/B/C/D structure shares glass boundaries; no upright box through the windscreen.
    const pillars = [
      [[-1.075, b.belt], [-.665, 1.835], [-.595, 1.795], [-1.015, 1.30]],
      [[.315, b.belt], [.315, 1.857], [.425, 1.857], [.435, b.belt]],
      [[1.27, b.belt], [1.27, 1.84], [1.365, 1.82], [1.405, b.belt]],
      [[2.01, b.belt], [1.875, 1.80], [2.10, 1.70], [b.rear, b.belt]],
    ] as const;
    pillars.forEach((p, i) => root.add(tankSidePane(`${label} Tank ${['A', 'B', 'C', 'D'][i]} pillar`, c, side, p, i === 1 ? dark : paint)));
    for (const z of [-.05, .99]) { const at = tankSidePoint(c, side, z, 1.23); const handle = addBox(label + ' Tank door handle', [.025, .035, .17], at, satin); if (side < 0 && z < 0) onDoor(handle); }
    addBox(label + ' Tank recessed side step', [.15, .055, 2.15], [side * .87, .41, .02], dark);
    root.add(surfaceGrid(label + ' Tank rounded bonnet shoulder', 24, 3, (u, v) => {
      const hood = tankHoodPoint(side < 0 ? 0 : 1, u), edge = tankSidePoint(c, side, hood[2], tankShoulderHeight(hood[2]));
      return [T.MathUtils.lerp(hood[0], edge[0], v), T.MathUtils.lerp(hood[1], edge[1], v), hood[2]];
    }, paint));
    const rail = addBox(label + ' Tank roof rail', [.035, .04, 2.40], [side * .72, 1.883, .58], satin); rail.castShadow = false;
    const belt = tankRibbon(label + ' Tank belt trim', [-1.05, -.4, .35, 1.31, 2.08].map(z => tankSidePoint(c, side, z, b.belt + .008)), .012, satin);
    if (side < 0) { // The front section belongs to the door; fixed trim cannot span its aperture.
      belt.geometry.dispose(); root.add(tankRibbon(label + ' Tank rear belt trim', [.39, 1.31, 2.08].map(z => tankSidePoint(c, side, z, b.belt + .008)), .012, satin));
      onDoor(tankRibbon('Tank moving driver belt trim', [b.doorFront, -.4, b.doorRear].map(z => tankSidePoint(c, side, z, b.belt + .008)), .012, satin));
    } else root.add(belt);
    for (const axle of [-1, 1]) {
      const points: P[] = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI, r = c.wheelRadius + c.body.wheelArchClearance; const z = axle * c.wheelBase / 2 + Math.cos(a) * r;
        const p = tankSidePoint(c, side, z, (c.body.wheelArchCenterY ?? c.wheelRadius) + Math.sin(a) * r); points.push([p[0] + side * .004, p[1], p[2]]); }
      root.add(tankRibbon(`${label} Tank wheelarch lip ${axle}`, points, .022, dark));
      root.add(surfaceGrid(`${label} Tank inner wheelarch liner ${axle}`, 24, 3, (u, v) => {
        const a = u * Math.PI, r = c.wheelRadius + c.body.wheelArchClearance + .008;
        return [side * T.MathUtils.lerp(.64, .94, v), (c.body.wheelArchCenterY ?? c.wheelRadius) + Math.sin(a) * r,
          axle * c.wheelBase / 2 + Math.cos(a) * r];
      }, dark));
    }
    for (const z of [b.doorFront, b.doorRear]) {
      const edge = surfaceQuad('Tank painted moving door return', [tankSidePoint(c, -1, z, tankArchBottom(c, z)), tankSidePoint(c, -1, z, b.belt), [-.84, b.belt, z], [-.84, tankArchBottom(c, z), z]], paint);
      if (side < 0) onDoor(edge); else edge.geometry.dispose();
    }
  }
  root.add(surfaceGrid('Tank crowned bonnet and cowl', 22, 14, tankHoodPoint, paint));
  root.add(surfaceGrid('Tank bonnet leading return', 22, 2, (u, v) => {
    const hood = tankHoodPoint(u, 0), nose = tankFrontPoint(c, hood[0], 1.245);
    return [hood[0], T.MathUtils.lerp(hood[1], nose[1], v), T.MathUtils.lerp(hood[2], nose[2], v)];
  }, paint));
  root.add(surfaceGrid('Tank curved windscreen', 10, 16, tankWindshieldPoint, vehicleGlass(c.windowGlass?.color ?? 0x6b838e, c.windowGlass?.windshieldOpacity ?? .15)));
  root.add(surfaceGrid('Tank cambered roof', 18, 12, (u, v) => {
    const z = T.MathUtils.lerp(-.61, 2.06, v), x = (u * 2 - 1) * T.MathUtils.lerp(.81, .77, T.MathUtils.smoothstep(v, .88, 1));
    const y = v < .06 ? T.MathUtils.lerp(b.windTopY, b.roofY, v / .06) : b.roofY - .09 * T.MathUtils.smoothstep(z, 1.20, 2.04);
    return [x, T.MathUtils.lerp(y - .018 * (2 * u - 1) ** 2 * Math.min(1, v / .06), 1.77, T.MathUtils.smoothstep(v, .90, 1)),
      T.MathUtils.lerp(z, tankRearPoint(x, 1.77)[2], T.MathUtils.smoothstep(v, .90, 1))];
  }, paint));
  root.add(surfaceGrid('Tank sculpted front cap', 20, 16, (u, v) => tankFrontPoint(c, (u * 2 - 1) * .94, T.MathUtils.lerp(.38, 1.245, v)), paint));
  root.add(surfaceGrid('Tank rolled tailgate', 14, 12, (u, v) => tankRearPoint((u * 2 - 1) * .94, T.MathUtils.lerp(.43, 1.30, v)), paint));
  root.add(surfaceGrid('Tank rear protective bumper', 16, 4, (u, v) => tankRearPoint((u * 2 - 1) * .94, T.MathUtils.lerp(.27, .43, v)), dark));
  root.add(surfaceGrid('Tank rear backlight', 8, 10, (u, v) => tankRearPoint((u * 2 - 1) * T.MathUtils.lerp(.83, .77, v), T.MathUtils.lerp(1.30, 1.77, v)), glass));
  const frontPatch = (name: string, x0: number, x1: number, y0: number, y1: number, m: T.Material, key?: string) => {
    const patch = surfaceGrid(name, 6, 10, (u, v) => { const p = tankFrontPoint(c, T.MathUtils.lerp(x0, x1, u), T.MathUtils.lerp(y0, y1, v)); return [p[0], p[1], p[2] - .006]; }, m);
    const position = patch.geometry.getAttribute('position'), uv = patch.geometry.getAttribute('uv');
    for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) - x0) / (x1 - x0), (position.getY(i) - y0) / (y1 - y0));
    if (key) patch.userData.lightingKey = key; root.add(patch); return patch;
  };
  frontPatch('Tank five-bar chrome grille atlas', -.565, .565, .78, 1.218, grille);
  frontPatch('Tank lower intake', -.66, .66, .46, .62, dark);
  frontPatch('Tank brushed front skid plate', -.59, .59, .34, .43, satin);
  const output = new T.MeshStandardMaterial({ color: 0x121b20, emissive: 0xe7f0ff, emissiveIntensity: 0, side: T.DoubleSide });
  for (const side of [-1, 1]) {
    const x = side * .746, head = frontPatch('Tank sealed optical housing', x - .165, x + .165, 1.015, 1.19, optics);
    head.userData.refinedOptics = true; head.userData.vehicleBodyPart = 'headlamp';
    frontPatch('Tank dipped projector', x - .045, x + .045, 1.065, 1.145, output.clone(), 'head');
    frontPatch('Tank daytime signature', x - .165, x + .165, 1.188, 1.202, output.clone(), 'position');
    frontPatch('Tank front turn strip', x - .165, x + .165, .989, 1.006, output.clone(), side < 0 ? 'left' : 'right');
    const tail = (name: string, y0: number, y1: number, key: string) => {
      const node = surfaceGrid(name, 4, 2, (u, v) => { const p = tankRearPoint(x + (u * 2 - 1) * .072, T.MathUtils.lerp(y0, y1, v)); return [p[0], p[1], p[2] + .007]; }, output.clone());
      node.userData.lightingKey = key; node.userData.refinedOptics = true; root.add(node);
    };
    tail('Tank vertical tail signature', 1.015, 1.40, 'tail'); tail('Tank rear brake module', 1.26, 1.355, 'brake');
    tail('Tank rear turn module', .945, .985, side < 0 ? 'left' : 'right'); tail('Tank rear reverse module', .90, .94, 'reverse');
  }
  addBox('Tank tailgate handle', [.25, .035, .028], [.59, 1.18, 2.163], satin);
  const under = addBox('Tank lower protective underfloor', [1.20, .012, 4.15], [0, c.body.groundClearance + .006, -.02]); under.userData.vehicleBodyPart = 'underfloor';
  for (const x of [-.53, .53]) addBox('Tank ladder frame rail', [.10, .12, 3.95], [x, .32, -.04]);
  addBox('Tank protected HV battery enclosure', [1.12, .18, 1.38], [0, .42, 1.03]);
  const spare = new T.Mesh(new T.CylinderGeometry(c.wheelRadius, c.wheelRadius, .245, 28), dark);
  spare.rotation.x = Math.PI / 2; spare.position.set(0, 1.16, 2.35); spare.name = 'Tank tailgate external spare tyre'; root.add(spare);
  const cover = new T.Mesh(new T.CylinderGeometry(c.wheelRadius * .92, c.wheelRadius * .92, .035, 32), paint);
  cover.rotation.x = Math.PI / 2; cover.position.set(0, 1.16, 2.49); cover.name = 'Tank external spare cover'; root.add(cover);
}
