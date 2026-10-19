import * as T from 'three';
import { beam, grid, label, loft, path, polygon, rounded, roundel, roofHeight, sideGlassX, sweep } from './BMW530Geometry';
import { bmwWindshieldPoint, bmwAPillarRing, bmwFrontWindowCorners } from './BMW530FrontFrame';
import { bmwExteriorUV, createBMW530ExteriorAtlas } from './BMW530ExteriorDetails';
import { splitSideBodyForDoor } from './DoorSideSplit';
import type { MirrorVisualConfig, VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';
import type { MirrorSurfaceMesh } from './VehicleVisual';

const mix = T.MathUtils.lerp;
const kidney = (sign: number): P[] => [[.026, .865, -2.548], [.095, .936, -2.540], [.383, .932, -2.516],
  [.491, .875, -2.495], [.484, .733, -2.502], [.389, .638, -2.522], [.096, .623, -2.548], [.026, .665, -2.551]]
  .map(([x, y, z]) => [sign * x!, y!, z!] as P);

/** Convex rear glazing clears the existing long-wheelbase rear head restraints. */
const rearGlassPoint = (u: number, v: number): P => {
  const across = v * 2 - 1, crown = .026 * (1 - across * across) * Math.sin(u * Math.PI);
  return [across * mix(.83, .682, u), mix(.945, 1.435, u + .95 * u * (1 - u)) + crown * .3,
    mix(1.96, 1.03, u) + crown];
};

export function buildBMW530Exterior(root: T.Group, config: VehicleVisualConfig): void {
  const map = createBMW530ExteriorAtlas();
  const paint = new T.MeshPhysicalMaterial({ color: config.body.color, metalness: .58, roughness: .25,
    clearcoat: .95, clearcoatRoughness: .15, side: T.DoubleSide });
  const sidePaint = paint.clone(); sidePaint.map = map;
  const rearPaint = paint.clone(); rearPaint.map = map;
  const details = new T.MeshStandardMaterial({ map, metalness: .58, roughness: .32, side: T.DoubleSide });
  details.name = 'BMW shared static exterior atlas material';
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
    [-2.553, .845, .918, .855], [-2.40, .895, .94, .87], [-2.02, .934, .950, .86],
    [-1.5525, .934, .95, .864], [-.94, .912, .955, .858], [0, .91, .952, .858],
    [.8, .921, .944, .857], [1.5525, .934, .938, .848], [1.93, .91, .943, .80],
    [2.33, .90, .943, .85], [2.553, .855, .916, .82],
  ];
  const sample = (z: number) => {
    let i = 0; while (i < sections.length - 2 && sections[i + 1]![0]! < z) i++;
    const a = sections[i]!, b = sections[i + 1]!, t = (z - a[0]!) / (b[0]! - a[0]!);
    return { width: mix(a[1]!, b[1]!, t), y: mix(a[2]!, b[2]!, t), belt: mix(a[3]!, b[3]!, t) };
  };
  // The corner stations must turn into the fascia instead of ending in a flat
  // vertical side wall beyond it. Keep wheel/cabin stations exactly where they are.
  const cornerZ = (x: number, z: number) => z - Math.sign(z) * .19 * (Math.abs(x) / .89) ** 3 *
    T.MathUtils.clamp((Math.abs(z) - 2.02) / .533, 0, 1);
  const archY = config.body.wheelArchCenterY ?? config.wheelRadius;
  const archR = config.wheelRadius + config.body.wheelArchClearance;
  const archBottom = (z: number) => {
    const d = Math.min(Math.abs(z + config.wheelBase / 2), Math.abs(z - config.wheelBase / 2));
    return d < archR ? Math.max(.24, archY + Math.sqrt(archR * archR - d * d)) : .24;
  };
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'Left' : 'Right';
    const access = sign < 0 ? config.driverAccess : undefined;
    const sidePoint = (z: number, y: number): P => {
      const s = sample(z);
      const f = (y - .24) / (s.y - .24);
      const waist = .018 * Math.exp(-(((f - .40) / .15) ** 2)) * Math.exp(-((z / 1.4) ** 6));
      const width = (f < .80 ? s.width - .040 * (1 - f / .80) : mix(s.width, s.belt, (f - .80) / .20)) - waist;
      return [sign * width, y, cornerZ(width, z)];
    };
    let driverHingePosition: T.Vector3 | null = null;
    let driverDoor: T.Group | null = null;
    if (access !== undefined) {
      const split = splitSideBodyForDoor(root, {
        fullFrontZ: -2.553, fullRearZ: 2.553,
        doorFrontZ: access.doorFrontZ, doorRearZ: access.doorRearZ,
        sillY: config.body.sillY, bottomY: archBottom, topY: z => sample(z).y,
        point: sidePoint, material: sidePaint,
        fullBodyName: side + ' sculpted body and open wheel arches',
        assignUV: geometry => bmwExteriorUV(geometry, 'side', (_x, y, z) => [(z + 2.553) / 5.106,
          (y - .24) / .72]),
      });
      driverHingePosition = split.hingePosition;
      const hinge = new T.Group(); hinge.name = 'Driver door hinge'; hinge.position.copy(split.hingePosition);
      driverDoor = new T.Group(); driverDoor.name = 'Driver door';
      split.doorMesh.position.sub(split.hingePosition); driverDoor.add(split.doorMesh);
      hinge.add(driverDoor); root.add(hinge);
    } else {
      const body = grid(side + ' sculpted body and open wheel arches', 256, 12, (u, v) => {
        const z = mix(-2.553, 2.553, u), s = sample(z), bottom = archBottom(z);
        return sidePoint(z, mix(bottom, s.y, v));
      }, sidePaint);
      bmwExteriorUV(body.geometry, 'side', (_x, y, z) => [(z + 2.553) / 5.106, (y - .24) / .72]); root.add(body);
    }
    for (const centerZ of [-config.wheelBase / 2, config.wheelBase / 2]) {
      // A thin ruled lip retains the wheel opening without a dense tubular trim.
      root.add(grid(side + ' rolled fender arch lip', 48, 1, (u, v) => {
        const a = u * Math.PI, z = centerZ + Math.cos(a) * (archR + v * .010);
        return [sign * (sample(z).width - .008 + v * .004), archY + Math.sin(a) * (archR + v * .010), z];
      }, paint));
      root.add(grid(side + ' wheelhouse liner', 40, 4, (u, v) => {
        const angle = u * Math.PI, z = centerZ + Math.cos(angle) * (archR + .005);
        const roofY = archY + Math.sin(angle) * (archR + .005);
        // Fold the inner half down behind the tyre: suspension clearance must
        // reveal a dark wheel well rather than the world on the opposite side.
        return [sign * mix(sample(z).width - .012, .63, Math.min(1, v * 2)),
          mix(roofY, .16, Math.max(0, v * 2 - 1)), z];
      }, black));
    }
    root.add(grid(side + ' lower rocker sculpting', 16, 2, (u, v) => {
      const z = mix(-1.12, 1.12, u); return [sign * (.906 + .006 * Math.sin(Math.PI * v)), mix(.258, .315, v), z];
    }, paint));
    const frontPoints = [[-.875, .948], [-.32, 1.411], [.39, 1.45], [.412, .947]];
    const rearPoints = [[.475, .947], [.46, 1.45], [1.015, 1.402], [1.446, 1.063], [1.315, .952]];
    const windowBottomY = Math.min(...bmwFrontWindowCorners(sign).map(point => point[1]));
    for (const [name, list] of [['Front side window', frontPoints], ['Long rear door window', rearPoints]] as const) {
      const points = name === 'Front side window' ? bmwFrontWindowCorners(sign) : list.map(([z, y]) => [sign * sideGlassX(y!), y!, z!] as P);
      const driverWindow = name === 'Front side window' && access !== undefined;
      if (driverWindow) {
        const hinge = driverHingePosition!;
        const clipPlaneLocal = new T.Plane(new T.Vector3(0, 1, 0), -((windowBottomY + .0016) - hinge.y));
        const clipPlane = clipPlaneLocal.clone();
        const driverGlass = glass.clone();
        driverGlass.clippingPlanes = [clipPlane];
        driverGlass.clipShadows = false;
        const pane = polygon(side + ' ' + name, points, driverGlass);
        pane.position.sub(hinge);
        const mount = new T.Group();
        mount.name = 'Driver window glass mount';
        mount.userData.driverWindowClipPlane = clipPlane;
        mount.userData.driverWindowClipPlaneLocal = clipPlaneLocal;
        mount.userData.driverWindowTravel = access!.windowTravelDistance;
        mount.add(pane);
        driverDoor!.add(mount);
        const windowSeal = path(side + ' ' + name + ' rubber seal', points, .010, seal, true);
        const surround = path(side + ' ' + name + ' satin surround',
          points.map(([x, y, z]) => [x + sign * .007, y, z]), .005, chrome, true);
        windowSeal.position.sub(hinge); surround.position.sub(hinge);
        driverDoor!.add(windowSeal, surround);
      } else {
        root.add(polygon(side + ' ' + name, points, glass));
        root.add(path(side + ' ' + name + ' rubber seal', points, .010, seal, true));
        root.add(path(side + ' ' + name + ' satin surround', points.map(([x, y, z]) => [x + sign * .007, y, z]), .005, chrome, true));
      }
    }
    if (access !== undefined && driverDoor !== null && driverHingePosition !== null) {
      const hinge = driverHingePosition;
      const filler = grid('Driver door belt filler', 40, 1, (u, v) => {
        const z = mix(access.doorFrontZ, access.doorRearZ, u), s = sample(z);
        const top = sidePoint(z, s.y), upper: P = [sign * sideGlassX(windowBottomY), windowBottomY, z];
        return [mix(top[0], upper[0], v), mix(top[1], upper[1], v), z] as P;
      }, paint);
      filler.position.sub(hinge); driverDoor.add(filler);
    }
    const quarter: P[] = [[sign * .848, .954, 1.348], [sign * .819, 1.05, 1.47], [sign * .831, 1.018, 1.53]];
    root.add(polygon(side + ' Hofmeister quarter glass', quarter, glass));
    root.add(polygon(side + ' satin Hofmeister sail', [[sign * .855, .954, 1.305], [sign * .797, 1.121, 1.371],
      [sign * .815, 1.075, 1.483], [sign * .850, .981, 1.568], [sign * .862, .950, 1.52]], chrome));
    root.add(loft(side + ' structural B pillar', [
      { z: .407, points: [[sign * .85, .93], [sign * .69, 1.452], [sign * .665, 1.438], [sign * .818, .925]] },
      { z: .474, points: [[sign * .85, .93], [sign * .69, 1.452], [sign * .665, 1.438], [sign * .818, .925]] },
    ], chrome));
    // Close the full wedge between the windshield and front side-glass edges.
    root.add(sweep(side + ' sculpted A pillar outer',Array.from({length:29},(_,j)=>bmwAPillarRing(sign,j/28,false)),paint));
    root.add(grid(side + ' C pillar shaped sail', 24, 4, (u, v) => {
      const rear = rearGlassPoint(1 - u, sign < 0 ? 0 : 1), y = rear[1];
      const z = y > 1.08 ? mix(1.005, 1.465, (1.426 - y) / .346) : mix(1.465, 1.53, (1.08 - y) / .137);
      return [mix(sign * sideGlassX(y), rear[0], v), y, mix(z, rear[2], v)];
    }, paint));
    root.add(path(side + ' continuous roof rail', [[sign * .70, 1.426, -.315], [sign * .70, 1.469, .35],
      [sign * .70, 1.416, 1.035]], .018, paint));
    if (access !== undefined && driverDoor !== null && driverHingePosition !== null) {
      const frontBelt = path(side + ' front door beltline', [[sign * .861, .951, access.doorFrontZ],
        [sign * .865, .953, access.doorRearZ]], .005, chrome);
      frontBelt.position.sub(driverHingePosition); driverDoor.add(frontBelt);
      root.add(path(side + ' rear beltline', [[sign * .865, .953, access.doorRearZ],
        [sign * .865, .948, 1.32], [sign * .854, .98, 1.52]], .005, chrome));
    } else {
      root.add(path(side + ' beltline chrome', [[sign * .861, .951, -.88], [sign * .865, .953, .43],
        [sign * .865, .948, 1.32], [sign * .854, .98, 1.52]], .005, chrome));
    }
  }
  root.add(grid('Crowned multi-section hood', 40, 32, (u, v) => {
    const z = mix(-2.54, -.935, u), s = sample(z), x = (v * 2 - 1) * s.belt;
    const crown = .020 * (1 - (v * 2 - 1) ** 2), ridge = .024 * Math.exp(-(((Math.abs(v * 2 - 1) - .49) / .075) ** 2));
    return [x, s.y + crown + ridge * Math.sin(Math.PI * u), cornerZ(x, z)];
  }, paint));
  root.add(grid('Trunk deck with integrated trailing lip', 18, 24, (u, v) => {
    const z = mix(1.96, 2.545, u), s = sample(z), x = (v * 2 - 1) * s.belt;
    return [x, s.y + .012 * (1 - (v * 2 - 1) ** 2) + .018 * Math.exp(-(((u - .9) / .09) ** 2)), cornerZ(x, z)];
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
  glazing('Sloping rear glass', .945, 1.96, 1.435, 1.03, glass, rearGlassPoint);
  for (let i = 0; i < 8; i++) root.add(path('Rear glass demister trace', [.04, .5, .96].map(v => {
    const p = rearGlassPoint(.10 + i * .095, v); return [p[0], p[1] + .001, p[2] + .001] as P;
  }), .00065, chrome));
  const wiper = (sign: number) => path('Parked windshield wiper', [[sign * .08, .971, -.944], [sign * .38, .967, -.94], [sign * .70, .958, -.925]], .006, black);
  root.add(wiper(-1), wiper(1));
  const fin = loft('Shark fin antenna', [{ z: .74, points: [[-.026, 1.478], [.026, 1.478], [0, 1.555]] },
    { z: .9, points: [[-.026, 1.461], [.026, 1.461], [0, 1.466]] }], paint);
  // Keep the normal-roof reference within the requested 1.5 m envelope.
  fin.scale.y = .30; fin.position.y = 1.03; root.add(fin);
  for (const rear of [false, true]) {
    const bumper = grid(rear ? 'Sculpted rear bumper' : 'Sculpted front bumper', 32, 20, (u, v) => {
    const x = (u * 2 - 1) * mix(.865, .89, v), y = mix(.25, rear ? .795 : .623, v);
    const z = (rear ? 1 : -1) * (2.553 - .19 * (Math.abs(u * 2 - 1) ** 3) - .018 * Math.sin(v * Math.PI));
    return [x, y, z];
    }, rear ? rearPaint : paint);
    if (rear) bmwExteriorUV(bumper.geometry, 'rearPanel', (x, y) => [(x + .89) / 1.78, (y - .25) / .545]);
    root.add(bumper);
  }
  root.add(grid('Continuous rear trunk fascia behind recessed lamps', 40, 10, (u, v) => {
    const x = (u * 2 - 1) * .855;
    return [x, mix(.782, .922, v), 2.529 - .19 * (Math.abs(x) / .88) ** 2];
  }, paint));
  root.add(grid('Front fascia between recessed kidneys and lamps', 40, 10, (u, v) => {
    const x = (u * 2 - 1) * .89;
    return [x, mix(.598, .918, v), -2.514 + .16 * (Math.abs(x) / .88) ** 2];
  }, paint));
  const output = (name: string, key: string, points: P[], radius: number) => {
    const m = path(name, points, radius, optical); m.userData.lightingKey = key; root.add(m); return m;
  };
  const surface = (name: string, points: P[], region: Parameters<typeof bmwExteriorUV>[1]) => {
    const m = polygon(name, points, details);
    const xs = points.map(p => Math.abs(p[0])), ys = points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    bmwExteriorUV(m.geometry, region, (x, y) => [(Math.abs(x) - minX) / (maxX - minX), (y - minY) / (maxY - minY)]);
    root.add(m); return m;
  };
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'Left' : 'Right', turn = sign < 0 ? 'left' : 'right';
    const outline = kidney(sign);
    surface(side + ' inset kidney dark backing', outline.map(([x, y, z]) => [x, y, z - .002]), 'kidney');
    root.add(path(side + ' thick kidney chrome frame', outline, .012, chrome, true));
    root.add(path(side + ' inset kidney inner frame', outline.map(([x, y, z]) => [x * .91 + sign * .018, .77 + (y - .77) * .87, z + .008]), .009, black, true));
    const head: P[] = [[sign * .522, .875, -2.502], [sign * .868, .943, -2.410], [sign * .922, .891, -2.355],
      [sign * .906, .791, -2.371], [sign * .552, .777, -2.497]];
    surface(side + ' recessed headlamp housing', head, 'head');
    root.add(path(side + ' headlamp perimeter bezel', head, .004, black, true));
    root.add(polygon(side + ' clear headlamp outer lens', head.map(([x, y, z]) => [x, y, z - .009]), lens));
    const lampZ = (x: number) => -2.512 + (x - .522) * .30;
    for (let i = 0; i < 2; i++) {
      const x = .612 + i * .177, z = lampZ(x), y = .831 + i * .015;
      const module = rounded(side + ' projector optical module ' + i, [.065, .046, .012], [sign * x, y, z], optical);
      module.userData.lightingKey = 'head'; root.add(module);
      output(side + ' L-shaped DRL ' + i, 'position', [[sign * (x - .026), y + .057, lampZ(x - .026) - .006],
        [sign * (x - .042), y + .043, lampZ(x - .042) - .006], [sign * (x - .041), y - .036, lampZ(x - .041) - .006],
        [sign * (x + .049), y - .035, lampZ(x + .049) - .006]], .0055);
    }
    output(side + ' front amber indicator', turn, [[sign * .55, .881, -2.510], [sign * .716, .914, -2.460], [sign * .862, .937, -2.416]], .004);
    const intake: P[] = [[sign * .015, .554, -2.553], [sign * .571, .547, -2.530],
      [sign * .662, .293, -2.502], [sign * .015, .285, -2.554]];
    surface(side + ' lower central intake recess', intake, 'intake');
    root.add(path(side + ' intake satin lower edge', [intake[1]!, intake[2]!, intake[3]!], .004, black));
    const air: P[] = [[sign * .740, .606, -2.461], [sign * .876, .656, -2.397],
      [sign * .887, .340, -2.383], [sign * .777, .318, -2.443]];
    surface(side + ' bumper side air trim', air, 'air');
    root.add(path(side + ' bumper air trim contour', air, .004, black, true));
    // Broad diagonal bumper cheeks define the opening in silhouette; the ribs are baked.
    root.add(polygon(side + ' angular painted bumper cheek', [[sign * .594, .564, -2.519], [sign * .718, .612, -2.475],
      [sign * .769, .327, -2.454], [sign * .688, .278, -2.493]], paint));
    const rear: P[] = [[sign * .27, .876, 2.553], [sign * .70, .923, 2.491], [sign * .900, .894, 2.397],
      [sign * .905, .808, 2.390], [sign * .45, .807, 2.539], [sign * .27, .830, 2.553]];
    surface(side + ' dark sculpted tail housing', rear, 'tail');
    root.add(polygon(side + ' red outer tail lens', rear.map(([x, y, z]) => [x, y, z + .002]), redLens));
    output(side + ' tail L light guide', 'tail', [[sign * .29, .868, 2.556], [sign * .67, .884, 2.516],
      [sign * .892, .872, 2.411]], .006);
    output(side + ' brake light region', 'brake', [[sign * .30, .839, 2.556], [sign * .67, .851, 2.514], [sign * .892, .839, 2.411]], .006);
    output(side + ' rear amber indicator', turn, [[sign * .45, .807, 2.55], [sign * .70, .813, 2.50], [sign * .87, .815, 2.42]], .006);
    output(side + ' reverse optical region', 'reverse', [[sign * .23, .812, 2.556], [sign * .36, .814, 2.548]], .007);
    output(side + ' rear fog reflector', 'fogRear', [[sign * .79, .35, 2.427], [sign * .795, .48, 2.424]], .010);
    root.add(polygon(side + ' angular rear bumper shoulder', [[sign * .47, .370, 2.539], [sign * .76, .389, 2.454],
      [sign * .87, .274, 2.407], [sign * .56, .280, 2.526]], paint));
  }
  root.add(path('Front lower lip', [[-.79, .25, -2.44], [-.5, .248, -2.54], [0, .248, -2.55], [.5, .248, -2.54], [.79, .25, -2.44]], .012, black));
  const valance = grid('Rear lower valance', 12, 2, (u, v) => {
    const x = (u * 2 - 1) * .82; return [x, mix(.235, .365, v), 2.546 - .20 * (Math.abs(x) / .88) ** 2];
  }, details);
  bmwExteriorUV(valance.geometry, 'valance', (x, y) => [(x + .82) / 1.64, (y - .235) / .13]); root.add(valance);
  root.add(rounded('Rear license plate recess', [.51, .135, .015], [0, .646, 2.548], black));
  root.add(label('Rear number plate', '530Li · G38', .40, .073, [0, .65, 2.558]));
  root.add(rounded('Front license plate plinth', [.43, .105, .013], [0, .422, -2.552], black));
  root.add(label('Front number plate', 'BMW 530Li', .38, .064, [0, .42, -2.56], [0, Math.PI, 0]));
  const hoodBadge = roundel('Hood roundel', .027); hoodBadge.position.set(0, .933, -2.34); hoodBadge.rotation.x = -Math.PI / 2; root.add(hoodBadge);
  const rearBadge = roundel('Trunk roundel', .03); rearBadge.position.set(0, .861, 2.556); root.add(rearBadge);
  root.add(label('530Li trunk designation', '530Li', .17, .028, [.57, .943, 2.48]));
  output('High-mounted brake light', 'brake', [[-.105, 1.041, 1.756], [.105, 1.041, 1.756]], .009);
  const floor = config.body.groundClearance;
  root.add(loft('BMW underbody', [
    { z: -1.1, points: [[-.70, floor], [.70, floor], [.70, floor + .018], [-.70, floor + .018]] },
    { z: 1.1, points: [[-.70, floor], [.70, floor], [.70, floor + .018], [-.70, floor + .018]] },
  ], black));
  root.traverse(o => { if (o instanceof T.Mesh) o.userData.vehicleBodyPart = o.name === 'BMW underbody' ? 'main-shell' : o.name.includes('glass') || o.name.includes('windshield') ? 'glass' : 'body'; });
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
