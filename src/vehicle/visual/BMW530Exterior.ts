import * as T from 'three';
import { beam, grid, label, loft, path, polygon, rounded, roundel, roofHeight, sideGlassX, sweep } from './BMW530Geometry';
import { bmwWindshieldPoint, bmwAPillarRing, bmwFrontWindowCorners } from './BMW530FrontFrame';
import type { MirrorVisualConfig, VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';
import type { MirrorSurfaceMesh } from './VehicleVisual';

const mix = T.MathUtils.lerp;
const kidney = (sign: number): P[] => [[.035, .88, -2.549], [.10, .922, -2.544], [.37, .904, -2.535],
  [.443, .85, -2.526], [.428, .677, -2.527], [.34, .62, -2.54], [.10, .615, -2.55], [.037, .67, -2.551]]
  .map(([x, y, z]) => [sign * x!, y!, z!] as P);

export function buildBMW530Exterior(root: T.Group, config: VehicleVisualConfig): void {
  const paint = new T.MeshPhysicalMaterial({ color: config.body.color, metalness: .64, roughness: .29,
    clearcoat: .85, clearcoatRoughness: .2, side: T.DoubleSide });
  const black = new T.MeshStandardMaterial({ color: 0x0a0d13, roughness: .52, side: T.DoubleSide });
  const chrome = new T.MeshStandardMaterial({ color: 0xb4bfca, roughness: .24, metalness: .9, side: T.DoubleSide });
  const seal = new T.MeshStandardMaterial({ color: 0x11161b, roughness: .92, side: T.DoubleSide });
  const glass = new T.MeshPhysicalMaterial({ color: config.windowGlass!.color, transparent: true,
    opacity: config.windowGlass!.windowOpacity, roughness: .12, metalness: .12, clearcoat: 1,
    side: T.DoubleSide, depthWrite: false });
  const windscreen = glass.clone(); windscreen.opacity = config.windowGlass!.windshieldOpacity;
  const lens = new T.MeshPhysicalMaterial({ color: 0xe2efff, transparent: true, opacity: .16,
    roughness: .06, metalness: .16, clearcoat: 1, side: T.DoubleSide, depthWrite: false });
  const redLens = lens.clone(); redLens.color.set(0x601017); redLens.opacity = .32;
  const optical = new T.MeshStandardMaterial({ color: 0x667585, metalness: .6, roughness: .2, side: T.DoubleSide });
  const sections = [
    [-2.553, .76, .90, .65], [-2.40, .88, .92, .75], [-2.02, .934, .935, .83],
    [-1.5525, .934, .95, .864], [-.94, .912, .955, .858], [0, .91, .952, .858],
    [.8, .921, .944, .857], [1.5525, .934, .938, .848], [1.93, .91, .943, .80],
    [2.33, .88, .925, .75], [2.553, .78, .895, .69],
  ];
  const sample = (z: number) => {
    let i = 0; while (i < sections.length - 2 && sections[i + 1]![0]! < z) i++;
    const a = sections[i]!, b = sections[i + 1]!, t = (z - a[0]!) / (b[0]! - a[0]!);
    return { width: mix(a[1]!, b[1]!, t), y: mix(a[2]!, b[2]!, t), belt: mix(a[3]!, b[3]!, t) };
  };
  const archY = config.body.wheelArchCenterY ?? config.wheelRadius;
  const archR = config.wheelRadius + config.body.wheelArchClearance;
  const archBottom = (z: number) => {
    const d = Math.min(Math.abs(z + config.wheelBase / 2), Math.abs(z - config.wheelBase / 2));
    return d < archR ? Math.max(.24, archY + Math.sqrt(archR * archR - d * d)) : .24;
  };
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'Left' : 'Right';
    root.add(grid(side + ' sculpted body and open wheel arches', 256, 12, (u, v) => {
      const z = mix(-2.553, 2.553, u), s = sample(z), bottom = archBottom(z);
      const y = mix(bottom, s.y, v), f = (y - .24) / (s.y - .24);
      const width = f < .72 ? s.width - .044 * (1 - f / .72) : mix(s.width, s.belt, (f - .72) / .28);
      return [sign * width, y, z];
    }, paint));
    for (const centerZ of [-config.wheelBase / 2, config.wheelBase / 2]) {
      const arch: P[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = Math.PI * i / 40, z = centerZ + Math.cos(t) * archR;
        arch.push([sign * (sample(z).width - .015), archY + Math.sin(t) * archR, z]);
      }
      root.add(path(side + ' rolled fender arch lip', arch, .012, paint));
      root.add(grid(side + ' wheelhouse liner', 40, 4, (u, v) => {
        const angle = u * Math.PI, z = centerZ + Math.cos(angle) * (archR + .005);
        return [sign * mix(sample(z).width - .012, .63, v), archY + Math.sin(angle) * (archR + .005), z];
      }, black));
    }
    root.add(path(side + ' lower rocker sculpting', [[sign * .885, .282, -1.12], [sign * .915, .30, 0], [sign * .907, .31, 1.12]], .027, paint));
    root.add(path(side + ' shoulder crease', [[sign * .926, .81, -2.02], [sign * .907, .842, -.86],
      [sign * .90, .846, .4], [sign * .917, .843, 1.5], [sign * .88, .835, 2.35]], .0024, chrome));
    for (const [name, z] of [['Front door leading seam', -.90], ['B pillar door seam', .44], ['Long rear door trailing seam', 1.53]] as const) {
      const low = archBottom(z) + .015, s = sample(z);
      root.add(path(side + ' ' + name, [[sign * (s.belt + .002), s.y - .005, z],
        [sign * (s.width + .001), .78, z], [sign * (s.width - .015), Math.max(low, .4), z + .01]], .0023, seal));
    }
    for (const z of [.24, 1.30]) {
      root.add(rounded(side + ' recessed door handle pocket', [.017, .036, .178], [sign * .91, .864, z], black));
      root.add(rounded(side + ' body-colour door handle', [.023, .021, .15], [sign * .924, .867, z], paint));
    }
    const frontPoints = [[-.875, .948], [-.32, 1.411], [.39, 1.45], [.412, .947]];
    const rearPoints = [[.475, .947], [.46, 1.45], [1.015, 1.402], [1.446, 1.063], [1.315, .952]];
    for (const [name, list] of [['Front side window', frontPoints], ['Long rear door window', rearPoints]] as const) {
      const points = name === 'Front side window' ? bmwFrontWindowCorners(sign) : list.map(([z, y]) => [sign * sideGlassX(y!), y!, z!] as P);
      root.add(polygon(side + ' ' + name, points, glass));
      root.add(path(side + ' ' + name + ' rubber seal', points, .010, seal, true));
      root.add(path(side + ' ' + name + ' satin surround', points.map(([x, y, z]) => [x + sign * .007, y, z]), .005, chrome, true));
    }
    const quarter: P[] = [[sign * .848, .954, 1.348], [sign * .819, 1.05, 1.47], [sign * .831, 1.018, 1.53]];
    root.add(polygon(side + ' Hofmeister quarter glass', quarter, glass));
    root.add(path(side + ' Hofmeister kink surround', quarter, .010, chrome, true));
    root.add(loft(side + ' structural B pillar', [
      { z: .407, points: [[sign * .85, .93], [sign * .69, 1.452], [sign * .665, 1.438], [sign * .818, .925]] },
      { z: .474, points: [[sign * .85, .93], [sign * .69, 1.452], [sign * .665, 1.438], [sign * .818, .925]] },
    ], black));
    // Close the full wedge between the windshield and front side-glass edges.
    root.add(sweep(side + ' sculpted A pillar outer',Array.from({length:29},(_,j)=>bmwAPillarRing(sign,j/28,false)),paint));
    root.add(polygon(side + ' C pillar shaped sail', [[sign * .696, 1.426, 1.005], [sign * .708, 1.405, 1.093],
      [sign * .859, .943, 1.89], [sign * .855, .942, 1.53], [sign * .81, 1.08, 1.465]], paint));
    root.add(path(side + ' continuous roof rail', [[sign * .70, 1.426, -.315], [sign * .70, 1.469, .35],
      [sign * .70, 1.416, 1.035]], .018, paint));
    root.add(path(side + ' beltline chrome', [[sign * .861, .951, -.88], [sign * .865, .953, .43],
      [sign * .865, .948, 1.32], [sign * .854, .98, 1.52]], .005, chrome));
  }
  root.add(grid('Crowned multi-section hood', 40, 32, (u, v) => {
    const z = mix(-2.54, -.935, u), s = sample(z), x = (v * 2 - 1) * s.belt;
    const crown = .016 * (1 - (v * 2 - 1) ** 2), ridge = .015 * Math.exp(-(((Math.abs(v * 2 - 1) - .59) / .10) ** 2));
    return [x, s.y + crown + ridge * Math.sin(Math.PI * u), z];
  }, paint));
  root.add(grid('Trunk deck with integrated trailing lip', 18, 24, (u, v) => {
    const z = mix(1.875, 2.545, u), s = sample(z), x = (v * 2 - 1) * s.belt;
    return [x, s.y + .012 * (1 - (v * 2 - 1) ** 2) + .018 * Math.exp(-(((u - .9) / .09) ** 2)), z];
  }, paint));
  root.add(grid('Compound curved outer roof', 28, 24, (u, v) => {
    const z = mix(-.31, 1.03, u), x = (v * 2 - 1) * .70; return [x, roofHeight(z, x), z];
  }, paint));
  const glazing = (name: string, bottomY: number, bottomZ: number, topY: number, topZ: number, material: T.Material,
    frontPoint?: (u: number,v: number)=>P) => {
    const point = frontPoint ?? ((u: number, v: number): P => {
      const x = (v * 2 - 1) * mix(.83, .682, u), bulge = .035 * (1 - (v * 2 - 1) ** 2) * Math.sin(u * Math.PI);
      return [x, mix(bottomY, topY, u) + bulge * .3, mix(bottomZ, topZ, u) + (bottomZ < 0 ? -1 : 1) * bulge];
    });
    root.add(grid(name, 20, 24, point, material));
    root.add(grid(name + ' lower frit', 2, 24, (u, v) => point(u * .07, v), seal));
    root.add(grid(name + ' upper frit', 2, 24, (u, v) => point(.956 + u * .044, v), seal));
    for (const side of [0, 1]) root.add(grid(name + ' side frit ' + side, 20, 2,
      (u, v) => point(u, side === 0 ? v * .025 : 1 - v * .025), seal));
  };
  glazing('Tapered curved windshield', .94, -.945, 1.435, -.31, windscreen,bmwWindshieldPoint);
  glazing('Sloping rear glass', .945, 1.89, 1.435, 1.03, glass);
  for (let i = 0; i < 8; i++) root.add(path('Rear glass demister trace', [[-.72 + i * .014, 1.00 + i * .045, 1.80 - i * .078],
    [0, 1.01 + i * .045, 1.82 - i * .078], [.72 - i * .014, 1.00 + i * .045, 1.80 - i * .078]], .00065, chrome));
  const wiper = (sign: number) => path('Parked windshield wiper', [[sign * .08, .971, -.944], [sign * .38, .967, -.94], [sign * .70, .958, -.925]], .006, black);
  root.add(wiper(-1), wiper(1));
  const fin = loft('Shark fin antenna', [{ z: .74, points: [[-.026, 1.478], [.026, 1.478], [0, 1.555]] },
    { z: .9, points: [[-.026, 1.461], [.026, 1.461], [0, 1.466]] }], paint);
  // Keep the normal-roof reference within the requested 1.5 m envelope.
  fin.scale.y = .30; fin.position.y = 1.03; root.add(fin);
  for (const rear of [false, true]) root.add(grid(rear ? 'Sculpted rear bumper' : 'Sculpted front bumper', 32, 20, (u, v) => {
    const x = (u * 2 - 1) * mix(.86, .78, v), y = mix(.25, rear ? .795 : .609, v);
    const z = (rear ? 1 : -1) * (2.553 - .14 * (Math.abs(u * 2 - 1) ** 3) - .025 * Math.sin(v * Math.PI));
    return [x, y, z];
  }, paint));
  root.add(grid('Continuous rear trunk fascia behind recessed lamps', 40, 10, (u, v) => {
    const x = (u * 2 - 1) * .78;
    return [x, mix(.782, .922, v), 2.529 - .19 * (Math.abs(x) / .88) ** 2];
  }, paint));
  root.add(grid('Front fascia between recessed kidneys and lamps', 40, 10, (u, v) => {
    const x = (u * 2 - 1) * .78;
    return [x, mix(.598, .894, v), -2.514 + .16 * (Math.abs(x) / .88) ** 2];
  }, paint));
  const output = (name: string, key: string, points: P[], radius: number) => {
    const m = path(name, points, radius, optical); m.userData.lightingKey = key; root.add(m); return m;
  };
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'Left' : 'Right', turn = sign < 0 ? 'left' : 'right';
    const outline = kidney(sign);
    root.add(polygon(side + ' inset kidney dark backing', outline.map(([x, y, z]) => [x, y, z - .002]), black));
    root.add(path(side + ' thick kidney chrome frame', outline, .016, chrome, true));
    root.add(path(side + ' inset kidney inner frame', outline.map(([x, y, z]) => [x * .91 + sign * .018, .77 + (y - .77) * .87, z + .008]), .009, black, true));
    for (let i = 0; i < 9; i++) {
      const x = sign * (.075 + i * .038);
      root.add(beam(side + ' vertical kidney slat ' + i, [x, .658, -2.555 + Math.abs(x) * .035], [x, .882, -2.552 + Math.abs(x) * .035], .005, chrome));
    }
    const head: P[] = [[sign * .457, .876, -2.541], [sign * .83, .91, -2.456], [sign * .905, .86, -2.411],
      [sign * .886, .744, -2.426], [sign * .474, .738, -2.541]];
    root.add(polygon(side + ' recessed headlamp housing', head, black));
    root.add(path(side + ' headlamp perimeter bezel', head, .009, chrome, true));
    root.add(polygon(side + ' clear headlamp outer lens', head.map(([x, y, z]) => [x, y, z - .009]), lens));
    const lampZ = (x: number) => -2.541 + (x - .457) * .228 - .006;
    for (let i = 0; i < 2; i++) {
      const x = .535 + i * .182, z = lampZ(x);
      const module = rounded(side + ' projector optical module ' + i, [.077, .064, .018], [sign * x, .818, z], optical);
      module.userData.lightingKey = 'head'; root.add(module);
      output(side + ' L-shaped DRL ' + i, 'position', [[sign * (x - .036), .854, lampZ(x - .036)],
        [sign * (x - .032), .773, lampZ(x - .032)], [sign * (x + .092), .776, lampZ(x + .092)]], .006);
    }
    output(side + ' front amber indicator', turn, [[sign * .491, .878, -2.547], [sign * .675, .89, -2.501], [sign * .855, .899, -2.45]], .007);
    const intake: P[] = [[sign * .03, .557, -2.553], [sign * .60, .553, -2.526], [sign * .68, .42, -2.50],
      [sign * .54, .293, -2.539], [sign * .03, .294, -2.554]];
    root.add(polygon(side + ' lower central intake recess', intake, black));
    root.add(path(side + ' intake satin lower edge', intake.slice(2), .007, chrome));
    const air: P[] = [[sign * .737, .60, -2.49], [sign * .867, .646, -2.428],
      [sign * .878, .332, -2.416], [sign * .752, .33, -2.484]];
    root.add(polygon(side + ' bumper side air trim', air, black));
    root.add(path(side + ' bumper air trim contour', air, .006, chrome, true));
    for (let row = 0; row < 4; row++) root.add(beam(side + ' lower intake louvre', [sign * .06, .33 + row * .05, -2.552],
      [sign * .56, .33 + row * .05, -2.535], .006, black));
    const rear: P[] = [[sign * .19, .885, 2.553], [sign * .68, .921, 2.502], [sign * .881, .881, 2.40],
      [sign * .89, .79, 2.39], [sign * .48, .791, 2.53], [sign * .19, .824, 2.553]];
    root.add(polygon(side + ' dark sculpted tail housing', rear, black));
    root.add(polygon(side + ' red outer tail lens', rear.map(([x, y, z]) => [x, y, z + .002]), redLens));
    output(side + ' tail L light guide', 'tail', [[sign * .225, .877, 2.555], [sign * .66, .885, 2.518],
      [sign * .86, .865, 2.421], [sign * .84, .825, 2.438], [sign * .55, .832, 2.54]], .010);
    output(side + ' brake light region', 'brake', [[sign * .26, .843, 2.554], [sign * .67, .849, 2.514], [sign * .857, .844, 2.43]], .009);
    output(side + ' rear amber indicator', turn, [[sign * .45, .807, 2.55], [sign * .70, .813, 2.50], [sign * .87, .815, 2.42]], .006);
    output(side + ' reverse optical region', 'reverse', [[sign * .23, .812, 2.556], [sign * .36, .814, 2.548]], .007);
    output(side + ' rear fog reflector', 'fogRear', [[sign * .79, .35, 2.427], [sign * .795, .48, 2.424]], .010);
    const exhaust = [[sign * .58, .288, 2.545], [sign * .80, .29, 2.485], [sign * .77, .20, 2.49], [sign * .61, .20, 2.54]] as P[];
    root.add(polygon(side + ' trapezoidal exhaust inset', exhaust, black)); root.add(path(side + ' trapezoidal exhaust surround', exhaust, .009, chrome, true));
  }
  root.add(path('Front lower lip', [[-.79, .25, -2.44], [-.5, .248, -2.54], [0, .248, -2.55], [.5, .248, -2.54], [.79, .25, -2.44]], .012, black));
  root.add(rounded('Rear lower valance', [1.07, .08, .026], [0, .245, 2.535], black));
  root.add(rounded('Rear license plate recess', [.51, .135, .015], [0, .646, 2.548], black));
  root.add(label('Rear number plate', '530Li · G38', .40, .073, [0, .65, 2.558]));
  root.add(rounded('Front license plate plinth', [.43, .105, .013], [0, .422, -2.552], black));
  root.add(label('Front number plate', 'BMW 530Li', .38, .064, [0, .42, -2.56], [0, Math.PI, 0]));
  const hoodBadge = roundel('Hood roundel', .027); hoodBadge.position.set(0, .933, -2.34); hoodBadge.rotation.x = -Math.PI / 2; root.add(hoodBadge);
  const rearBadge = roundel('Trunk roundel', .03); rearBadge.position.set(0, .861, 2.556); root.add(rearBadge);
  root.add(label('530Li trunk designation', '530Li', .15, .025, [.55, .947, 2.48]));
  output('High-mounted brake light', 'brake', [[-.105, 1.041, 1.756], [.105, 1.041, 1.756]], .009);
  root.traverse(o => { if (o instanceof T.Mesh) o.userData.vehicleBodyPart = o.name.includes('glass') || o.name.includes('windshield') ? 'glass' : 'body'; });
}

/** Rounded open housing around the unchanged physical planar reflection aperture. */
export function buildBMW530SideMirror(root: T.Group, mirrorRoot: T.Group, side: 'left' | 'right', c: MirrorVisualConfig, paintColor: number): MirrorSurfaceMesh {
  const sign = side === 'left' ? -1 : 1, g = new T.Group(); g.name = side + ' mirror assembly';
  g.position.set(...c.position); g.rotation.set(...c.rotation);
  const paint = new T.MeshPhysicalMaterial({ color: paintColor, metalness: .62, roughness: .3, clearcoat: .8, side: T.DoubleSide });
  const black = new T.MeshStandardMaterial({ color: 0x10151b, roughness: .55, side: T.DoubleSide });
  const outline: P[] = [];
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2;
    outline.push([Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** .35 * (c.size[0] / 2 + .015),
      Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** .45 * (c.size[1] / 2 + .014), 0]);
  }
  g.add(grid(side + ' curved mirror housing', 40, 8, (u, v) => {
    const a = u * Math.PI * 2, t = Math.cos(v * Math.PI / 2), z = -c.housingDepth * Math.sin(v * Math.PI / 2);
    return [Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** .35 * (c.size[0] / 2 + .015) * t,
      Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** .45 * (c.size[1] / 2 + .014) * t, z];
  }, paint));
  g.add(path(side + ' mirror edge gasket', outline, .007, black, true));
  const start = c.mountPosition!, delta = new T.Vector3(...c.position).sub(new T.Vector3(...start));
  root.add(beam(side + ' mirror stalk', start, [c.position[0] - sign * .07, c.position[1] - .024, c.position[2] - .03], .021, black));
  root.add(rounded(side + ' door sail mirror base', [.042, .092, .115], start, black));
  const amber = path(side + ' mirror amber repeater', [[-.085, -.028, -.048], [0, -.033, -.067], [.085, -.024, -.048]], .004, black);
  amber.userData.lightingKey = side; g.add(amber);
  root.add(g);
  const surface: MirrorSurfaceMesh = new T.Mesh(new T.PlaneGeometry(...c.size), new T.MeshStandardMaterial({ color: 0xaabac8, metalness: .95, roughness: .03 }));
  surface.name = side + ' mirror surface'; surface.position.set(...c.position); surface.rotation.set(...c.rotation);
  surface.userData.mirrorSide = side; surface.renderOrder = 3; mirrorRoot.add(surface);
  root.traverse(o => { if (o.name.startsWith(side + ' mirror') || o.name === side + ' door sail mirror base') o.userData.vehicleBodyPart = 'mirror-housing'; });
  g.traverse(o => { o.userData.vehicleBodyPart = 'mirror-housing'; });
  // Mount direction is intentionally geometry-derived, independent of the optical adjustment.
  surface.userData.mountDirection = delta.normalize(); return surface;
}
