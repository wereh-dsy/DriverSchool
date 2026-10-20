import * as T from 'three';
import {
  beam, grid, label, loft, mercedesAPillarRing, mercedesFrontWindowCorners, mercedesRearGlassPoint,
  mercedesRearWindowCorners, mercedesRoofHeight, mercedesSideGlassX, mercedesWindshieldPoint, path,
  polygon, rounded, starEmblem, sweep, threePointedStar,
} from './MercedesE300LGeometry';
import { createMercedesE300LAtlas, mercedesExteriorUV } from './MercedesE300LExteriorDetails';
import { splitSideBodyForDoor } from './DoorSideSplit';
import type { MirrorVisualConfig, VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';
import type { MirrorSurfaceMesh } from './VehicleVisual';

const mix = T.MathUtils.lerp;

/** Longitudinal body stations: Z, belt half width, shoulder height, glass-line width. */
const STATIONS: readonly (readonly [number, number, number, number])[] = [
  [-2.546, .846, .846, .700], [-2.470, .892, .876, .752], [-2.300, .916, .912, .794],
  [-2.050, .930, .930, .818], [-1.700, .936, .938, .833], [-1.547, .938, .941, .838],
  [-1.100, .940, .944, .843], [-.500, .940, .948, .845], [.200, .940, .950, .845],
  [.800, .939, .952, .843], [1.240, .938, .953, .842], [1.547, .936, .952, .840],
  [1.900, .930, .956, .826], [2.200, .918, .952, .800], [2.420, .892, .934, .762],
  [2.546, .846, .906, .700],
];

export function buildMercedesE300LExterior(root: T.Group, config: VehicleVisualConfig): void {
  const atlas = createMercedesE300LAtlas();
  const paint = new T.MeshPhysicalMaterial({ color: config.body.color, metalness: .62, roughness: .24,
    clearcoat: .98, clearcoatRoughness: .13, side: T.DoubleSide });
  const sidePaint = paint.clone(); sidePaint.map = atlas;
  const lowerPaint = paint.clone();
  const trim = new T.MeshStandardMaterial({ color: 0x0a0d11, roughness: .54, side: T.DoubleSide });
  const bright = new T.MeshStandardMaterial({ color: 0xc2cad1, roughness: .21, metalness: .92, side: T.DoubleSide });
  const satin = new T.MeshStandardMaterial({ color: 0x8e979e, roughness: .38, metalness: .74, side: T.DoubleSide });
  const seal = new T.MeshStandardMaterial({ color: 0x101419, roughness: .93, side: T.DoubleSide });
  const lens = new T.MeshPhysicalMaterial({ color: 0xe4eeff, transparent: true, opacity: .17,
    roughness: .05, metalness: .14, clearcoat: 1, side: T.DoubleSide, depthWrite: false });
  const redLens = lens.clone(); redLens.color.set(0x5c0f18); redLens.opacity = .34;
  const optic = new T.MeshStandardMaterial({ color: 0x6a7784, metalness: .62, roughness: .19, side: T.DoubleSide });
  const detail = new T.MeshStandardMaterial({ map: atlas, metalness: .55, roughness: .34, side: T.DoubleSide });
  detail.name = 'Mercedes shared static exterior atlas material';
  const glass = new T.MeshPhysicalMaterial({ color: config.windowGlass!.color, transparent: true,
    opacity: config.windowGlass!.windowOpacity, roughness: .11, metalness: .12, clearcoat: 1,
    side: T.DoubleSide, depthWrite: false });
  const windscreen = glass.clone(); windscreen.opacity = config.windowGlass!.windshieldOpacity;

  const sample = (z: number) => {
    let i = 0;
    while (i < STATIONS.length - 2 && STATIONS[i + 1]![0]! < z) i++;
    const a = STATIONS[i]!, b = STATIONS[i + 1]!;
    const t = T.MathUtils.clamp((z - a[0]!) / (b[0]! - a[0]!), 0, 1);
    return { width: mix(a[1]!, b[1]!, t), y: mix(a[2]!, b[2]!, t), belt: mix(a[3]!, b[3]!, t) };
  };
  // Rounded nose/tail corners instead of a vertical side wall beyond the fascia.
  const cornerZ = (x: number, z: number): number => z - Math.sign(z) * .185 * (Math.abs(x) / .94) ** 3 *
    T.MathUtils.clamp((Math.abs(z) - 2.010) / .536, 0, 1);
  const archY = config.body.wheelArchCenterY ?? config.wheelRadius;
  const archR = config.wheelRadius + config.body.wheelArchClearance;
  const rockerY = .242;
  const archBottom = (z: number): number => {
    const d = Math.min(Math.abs(z + config.wheelBase / 2), Math.abs(z - config.wheelBase / 2));
    return d < archR ? Math.max(rockerY, archY + Math.sqrt(archR * archR - d * d)) : rockerY;
  };

  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'Left' : 'Right';
    const access = sign < 0 ? config.driverAccess : undefined;
    const sidePoint = (z: number, y: number): P => {
      const s = sample(z);
      const f = (y - rockerY) / Math.max(.001, s.y - rockerY);
      const crease = .014 * Math.exp(-(((f - .46) / .13) ** 2)) * Math.exp(-((z / 1.6) ** 6));
      const width = (f < .80 ? s.width - .036 * (1 - f / .80) : mix(s.width, s.belt, (f - .80) / .20)) - crease;
      return [sign * width, y, cornerZ(width, z)];
    };
    let driverHingePosition: T.Vector3 | null = null;
    let driverDoor: T.Group | null = null;
    if (access !== undefined) {
      const split = splitSideBodyForDoor(root, {
        fullFrontZ: -2.546, fullRearZ: 2.546,
        doorFrontZ: access.doorFrontZ, doorRearZ: access.doorRearZ,
        sillY: config.body.sillY, bottomY: archBottom, topY: z => sample(z).y,
        // Keep the inserted sill row above the wheel opening instead of
        // folding the split side-body triangles back across the tyre.
        point: (z, y) => sidePoint(z, Math.max(archBottom(z), y)), material: sidePaint,
        fullBodyName: side + ' sculpted body side with open arches',
        assignUV: geometry => mercedesExteriorUV(geometry, 'side', (_x, y, z) => [(z + 2.546) / 5.092,
          (y - rockerY) / .714]),
      });
      driverHingePosition = split.hingePosition;
      const hinge = new T.Group(); hinge.name = 'Driver door hinge'; hinge.position.copy(split.hingePosition);
      driverDoor = new T.Group(); driverDoor.name = 'Driver door';
      split.doorMesh.position.sub(split.hingePosition); driverDoor.add(split.doorMesh);
      hinge.add(driverDoor); root.add(hinge);
    } else {
      const body = grid(side + ' sculpted body side with open arches', 264, 12, (u, v) => {
        const z = mix(-2.546, 2.546, u), s = sample(z), bottom = archBottom(z);
        return sidePoint(z, mix(bottom, s.y, v));
      }, sidePaint);
      mercedesExteriorUV(body.geometry, 'side', (_x, y, z) => [(z + 2.546) / 5.092, (y - rockerY) / .714]);
      root.add(body);
    }

    for (const centerZ of [-config.wheelBase / 2, config.wheelBase / 2]) {
      // Thin rolled arch lip keeps the opening crisp without a dense tube.
      root.add(grid(side + ' rolled wheel arch lip', 48, 1, (u, v) => {
        const angle = u * Math.PI, z = centerZ + Math.cos(angle) * (archR + v * .009);
        return [sign * (sample(z).width - .007 + v * .003), archY + Math.sin(angle) * (archR + v * .009), z];
      }, paint));
      // Dark wheel well folds behind the tyre so the suspension gap stays closed.
      root.add(grid(side + ' wheel well liner', 40, 4, (u, v) => {
        const angle = u * Math.PI, z = centerZ + Math.cos(angle) * (archR + .004);
        const roofY = archY + Math.sin(angle) * (archR + .004);
        return [sign * mix(sample(z).width - .010, .628, Math.min(1, v * 2)),
          mix(roofY, .158, Math.max(0, v * 2 - 1)), z];
      }, trim));
    }
    // Continuous lower rocker/sill section.
    root.add(grid(side + ' lower rocker moulding', 20, 2, (u, v) => {
      const z = mix(-1.34, 1.34, u);
      return [sign * (.914 + .008 * Math.sin(Math.PI * v)), mix(rockerY - .004, .312, v), z];
    }, bright));

    const windowBottomY = Math.min(...mercedesFrontWindowCorners(sign).map(point => point[1]));
    for (const [name, points] of [
      ['Front side window', mercedesFrontWindowCorners(sign)],
      ['Rear door window', mercedesRearWindowCorners(sign)],
    ] as const) {
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
        const windowSeal = path(side + ' ' + name + ' rubber seal', points, .009, seal, true);
        const surround = path(side + ' ' + name + ' satin surround',
          points.map(([x, y, z]) => [x + sign * .006, y, z] as P), .0045, bright, true);
        windowSeal.position.sub(hinge); surround.position.sub(hinge);
        driverDoor!.add(windowSeal, surround);
      } else {
        root.add(polygon(side + ' ' + name, points, glass));
        root.add(path(side + ' ' + name + ' rubber seal', points, .009, seal, true));
        root.add(path(side + ' ' + name + ' satin surround',
          points.map(([x, y, z]) => [x + sign * .006, y, z] as P), .0045, bright, true));
      }
    }
    if (access !== undefined && driverDoor !== null && driverHingePosition !== null) {
      const hinge = driverHingePosition;
      const filler = grid('Driver door belt filler', 40, 1, (u, v) => {
        const z = mix(access.doorFrontZ, access.doorRearZ, u), s = sample(z);
        const top = sidePoint(z, s.y), upper: P = [sign * mercedesSideGlassX(windowBottomY), windowBottomY, z];
        return [mix(top[0], upper[0], v), mix(top[1], upper[1], v), z] as P;
      }, paint);
      filler.position.sub(hinge); driverDoor.add(filler);
    }
    // Closed wedge between the windshield edge and the front side glass.
    root.add(sweep(side + ' sculpted A pillar outer', Array.from({ length: 29 }, (_, j) =>
      mercedesAPillarRing(sign, j / 28, false)), paint));
    // Structural B pillar between the two panes.
    root.add(loft(side + ' structural B pillar', [
      { z: .412, points: [[sign * .848, .948], [sign * .696, 1.446], [sign * .668, 1.432], [sign * .816, .944]] },
      { z: .478, points: [[sign * .848, .948], [sign * .696, 1.446], [sign * .668, 1.432], [sign * .816, .944]] },
    ], trim));
    root.add(loft(side + ' satin B pillar applique', [
      { z: .414, points: [[sign * .852, .950], [sign * .700, 1.444], [sign * .684, 1.438], [sign * .834, .948]] },
      { z: .476, points: [[sign * .852, .950], [sign * .700, 1.444], [sign * .684, 1.438], [sign * .834, .948]] },
    ], bright));
    root.add(grid(side + ' shaped C pillar sail', 24, 4, (u, v) => {
      const rear = mercedesRearGlassPoint(1 - u, sign < 0 ? 0 : 1), y = rear[1];
      const z = y > 1.06 ? mix(1.026, 1.412, (1.436 - y) / .376) : mix(1.412, 1.470, (1.06 - y) / .102);
      return [mix(sign * mercedesSideGlassX(y), rear[0], v), y, mix(z, rear[2], v)];
    }, paint));
    root.add(path(side + ' continuous roof rail', [[sign * .706, mercedesRoofHeight(-.330, .706) + .007, -.330],
      [sign * .706, mercedesRoofHeight(.400, .706) + .007, .400],
      [sign * .706, mercedesRoofHeight(1.048, .706) + .007, 1.048]], .014, paint));
    if (access !== undefined && driverDoor !== null && driverHingePosition !== null) {
      const frontBelt = path(side + ' front door beltline', [[sign * .862, .955, access.doorFrontZ],
        [sign * .864, .957, access.doorRearZ]], .0045, bright);
      frontBelt.position.sub(driverHingePosition); driverDoor.add(frontBelt);
      root.add(path(side + ' rear beltline', [[sign * .864, .957, access.doorRearZ],
        [sign * .862, .953, 1.262], [sign * .850, .986, 1.446]], .0045, bright));
    } else {
      root.add(path(side + ' beltline satin moulding', [[sign * .862, .955, -.874], [sign * .864, .957, .436],
        [sign * .862, .953, 1.262], [sign * .850, .986, 1.446]], .0045, bright));
    }
    const handle = grid(side + ' flush door handle bezel', 6, 1, (u, v) => {
      const z = mix(sign < 0 ? -.726 : -.700, sign < 0 ? -.626 : -.600, u);
      return [sign * (sample(z).width - .004), mix(.884, .896, v), z];
    }, satin);
    if (access !== undefined && driverDoor !== null && driverHingePosition !== null) {
      handle.position.sub(driverHingePosition); driverDoor.add(handle);
    } else root.add(handle);
    root.add(grid(side + ' rear flush door handle bezel', 6, 1, (u, v) => {
      const z = mix(.774, .874, u);
      return [sign * (sample(z).width - .004), mix(.888, .900, v), z];
    }, satin));
  }

  // Long, gently crowned bonnet with two soft power domes.
  root.add(grid('Crowned long bonnet', 44, 32, (u, v) => {
    const z = mix(-2.542, -.960, u), s = sample(z), x = (v * 2 - 1) * s.belt;
    const crown = .018 * (1 - (v * 2 - 1) ** 2);
    const dome = .016 * Math.exp(-(((Math.abs(v * 2 - 1) - .46) / .085) ** 2)) * Math.sin(Math.PI * u) ** .6;
    return [x, s.y + crown + dome, cornerZ(x, z)];
  }, paint));
  root.add(grid('Boot lid with trailing lip', 20, 26, (u, v) => {
    const z = mix(1.880, 2.542, u), s = sample(z), x = (v * 2 - 1) * s.belt;
    return [x, s.y + .010 * (1 - (v * 2 - 1) ** 2) + .014 * Math.exp(-(((u - .93) / .08) ** 2)), cornerZ(x, z)];
  }, paint));
  // Panoramic glass roof panel inset into the painted roof skin.
  root.add(grid('Compound curved outer roof', 28, 24, (u, v) => {
    const z = mix(-.330, 1.130, u), x = (v * 2 - 1) * .706;
    return [x, mercedesRoofHeight(z, x), z];
  }, paint));
  root.add(grid('Panoramic glass roof panel', 16, 14, (u, v) => {
    const z = mix(-.196, .922, u), x = (v * 2 - 1) * .548;
    return [x, mercedesRoofHeight(z, x) + .0015, z];
  }, glass));
  root.add(path('Panoramic roof satin surround', [[-.556, mercedesRoofHeight(-.200, -.556) + .002, -.200],
    [.556, mercedesRoofHeight(-.200, .556) + .002, -.200],
    [.558, mercedesRoofHeight(.920, .558) + .002, .920],
    [-.558, mercedesRoofHeight(.920, -.558) + .002, .920]], .0055, bright, true));

  const glazing = (name: string, bottomY: number, bottomZ: number, topY: number, topZ: number,
    material: T.Material, point?: (u: number, v: number) => P): void => {
    const surface = point ?? ((u: number, v: number): P => {
      const x = (v * 2 - 1) * mix(.834, .694, u), bulge = .030 * (1 - (v * 2 - 1) ** 2) * Math.sin(u * Math.PI);
      return [x, mix(bottomY, topY, u) + bulge * .3, mix(bottomZ, topZ, u) + (bottomZ < 0 ? -1 : 1) * bulge];
    });
    root.add(grid(name, 20, 24, surface, material));
    root.add(grid(name + ' lower frit', 2, 24, (u, v) => surface(u * .07, v), seal));
    root.add(grid(name + ' upper frit', 2, 24, (u, v) => surface(.958 + u * .042, v), seal));
    for (const side of [0, 1]) root.add(grid(name + ' side frit ' + side, 20, 2,
      (u, v) => surface(u, side === 0 ? v * .024 : 1 - v * .024), seal));
  };
  glazing('Tapered acoustic windshield', .955, -.925, 1.440, -.325, windscreen, mercedesWindshieldPoint);
  glazing('Sloping rear screen', .958, 1.842, 1.436, 1.062, glass, mercedesRearGlassPoint);
  for (let i = 0; i < 7; i++) root.add(path('Rear screen demister trace', [.06, .5, .94].map(v => {
    const p = mercedesRearGlassPoint(.10 + i * .105, v); return [p[0], p[1] + .001, p[2] + .001] as P;
  }), .0006, satin));
  const wiper = (sign: number) => path('Parked windshield wiper',
    [[sign * .07, .986, -.918], [sign * .36, .980, -.912], [sign * .68, .968, -.898]], .0055, trim);
  root.add(wiper(-1), wiper(1));
  root.add(loft('Shark fin antenna', [
    { z: .780, points: [[-.020, 1.452], [.020, 1.452], [0, 1.487]] },
    { z: .900, points: [[-.020, 1.446], [.020, 1.446], [0, 1.452]] },
  ], paint));

  // Bumper fascias follow the same rounded corners as the body sides.
  for (const rear of [false, true]) {
    const bumper = grid(rear ? 'Sculpted rear bumper' : 'Sculpted front bumper', 34, 20, (u, v) => {
      const x = (u * 2 - 1) * mix(.856, .888, v), y = mix(.248, rear ? .792 : .624, v);
      const z = (rear ? 1 : -1) * (2.546 - .182 * (Math.abs(u * 2 - 1) ** 3) - .015 * Math.sin(v * Math.PI));
      return [x, y, z];
    }, rear ? lowerPaint : paint);
    root.add(bumper);
  }
  root.add(grid('Front fascia between grille and lamps', 40, 10, (u, v) => {
    const x = (u * 2 - 1) * .888;
    return [x, mix(.596, .926, v), -2.512 + .150 * (Math.abs(x) / .882) ** 2];
  }, paint));
  root.add(grid('Rear panel behind the tail lamps', 40, 10, (u, v) => {
    const x = (u * 2 - 1) * .850;
    return [x, mix(.784, .930, v), 2.524 - .182 * (Math.abs(x) / .878) ** 2];
  }, paint));

  const output = (name: string, key: string, points: P[], radius: number): T.Mesh => {
    const m = path(name, points, radius, optic); m.userData.lightingKey = key; root.add(m); return m;
  };
  const surface = (name: string, points: P[], region: Parameters<typeof mercedesExteriorUV>[1],
    part?: string): T.Mesh => {
    const m = polygon(name, points, detail);
    const xs = points.map(p => Math.abs(p[0])), ys = points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    mercedesExteriorUV(m.geometry, region, (x, y) => [(Math.abs(x) - minX) / Math.max(.001, maxX - minX),
      (y - minY) / Math.max(.001, maxY - minY)]);
    if (part) m.userData.vehicleBodyPart = part;
    root.add(m); return m;
  };

  // ---- Standing star, traditional grille, digital-LED headlamps -------------
  const grilleOutline: P[] = [[-.336, .582, -2.500], [-.418, .674, -2.494], [-.430, .840, -2.490],
    [-.372, .920, -2.486], [.372, .920, -2.486], [.430, .840, -2.490], [.418, .674, -2.494],
    [.336, .582, -2.500]];
  surface('Traditional grille dark backing', grilleOutline, 'grille');
  root.add(path('Traditional chrome grille frame', grilleOutline, .011, bright, true));
  root.add(path('Grille inner satin frame', grilleOutline.map(([x, y, z]) => [x * .93, .751 + (y - .751) * .91, z + .006] as P),
    .006, satin, true));
  for (const y of [.632, .690, .748, .806, .864]) {
    const halfWidth = mix(.345, .424, (y - .582) / (.920 - .582));
    root.add(path('Grille horizontal chrome slat', [[-halfWidth, y, -2.489], [0, y - .004, -2.484],
      [halfWidth, y, -2.489]], .0055, bright));
  }
  root.add(path('Grille central vertical divider', [[0, .588, -2.497], [0, .918, -2.484]], .0045, bright));

  const hoodStar = new T.Group(); hoodStar.name = 'Bonnet standing star';
  hoodStar.position.set(0, .945, -2.302);
  hoodStar.add(rounded('Standing star base plate', [.072, .014, .092], [0, .004, .010], bright, .005));
  hoodStar.add(beam('Standing star stem', [0, .010, .008], [0, .072, -.010], .0085, bright));
  const standingStar = starEmblem('Standing star emblem', .036, bright, satin);
  standingStar.position.set(0, .098, -.018); hoodStar.add(standingStar);
  root.add(hoodStar);

  const grilleStar = starEmblem('Grille star emblem', .062, bright, satin);
  grilleStar.position.set(0, .752, -2.487); root.add(grilleStar);

  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'Left' : 'Right', turn = sign < 0 ? 'left' : 'right';
    const housing: P[] = [[sign * .452, .790, -2.492], [sign * .556, .838, -2.470], [sign * .778, .900, -2.418],
      [sign * .916, .884, -2.372], [sign * .928, .812, -2.386], [sign * .828, .758, -2.416],
      [sign * .556, .748, -2.470], [sign * .458, .754, -2.492]];
    surface(side + ' recessed digital headlamp housing', housing, 'head', 'headlamp');
    root.add(path(side + ' headlamp perimeter bezel', housing, .004, trim, true));
    root.add(polygon(side + ' clear headlamp outer lens',
      housing.map(([x, y, z]) => [x, y, z - .008] as P), lens));
    const lampZ = (x: number): number => -2.478 + Math.abs(x - .452) * .335;
    // Digital-Light style signature: upper eyebrow and lower blade.
    output(side + ' upper LED day running light', 'position',
      [[sign * .504, .812, lampZ(.504)], [sign * .660, .845, lampZ(.660)], [sign * .824, .874, lampZ(.824)],
        [sign * .902, .868, lampZ(.902)]], .0048);
    output(side + ' lower LED day running light', 'position',
      [[sign * .494, .780, lampZ(.494)], [sign * .648, .788, lampZ(.648)], [sign * .796, .806, lampZ(.796)],
        [sign * .876, .824, lampZ(.876)]], .0044);
    for (let i = 0; i < 2; i++) {
      const x = .566 + i * .148, module = rounded(side + ' headlamp optical module ' + i,
        [.078, .050, .013], [sign * x, .800 + i * .014, lampZ(x)], optic);
      module.userData.lightingKey = 'head'; root.add(module);
    }
    output(side + ' front amber indicator', turn,
      [[sign * .866, .852, lampZ(.866)], [sign * .906, .840, lampZ(.906)], [sign * .898, .808, lampZ(.898)]], .0042);

    // Wide horizontal tail cluster with the star-motif light guides.
    const tail: P[] = [[sign * .214, .866, 2.508], [sign * .356, .912, 2.504], [sign * .700, .920, 2.474],
      [sign * .890, .898, 2.402], [sign * .898, .840, 2.396], [sign * .700, .826, 2.470],
      [sign * .348, .826, 2.506], [sign * .210, .838, 2.510]];
    surface(side + ' dark sculpted tail lamp housing', tail, 'tail', 'tail-lamp');
    root.add(polygon(side + ' deep red tail lens', tail.map(([x, y, z]) => [x, y, z + .002] as P), redLens));
    const tailZ = (x: number): number => 2.512 - Math.abs(x - .200) * .132;
    for (let i = 0; i < 3; i++) {
      const x = .300 + i * .216, y = .866 + i * .012, radius = .030 - i * .002;
      const star = threePointedStar(radius, .010, optic);
      star.name = side + ' tail star light guide ' + i;
      star.position.set(sign * x, y, tailZ(x)); star.userData.lightingKey = 'tail'; root.add(star);
      const ring = new T.Mesh(new T.TorusGeometry(radius, .0026, 5, 24), optic);
      ring.name = side + ' tail star ring ' + i; ring.position.set(sign * x, y, tailZ(x));
      ring.userData.lightingKey = 'tail'; root.add(ring);
    }
    output(side + ' brake light blade', 'brake',
      [[sign * .250, .846, 2.512], [sign * .560, .852, 2.492], [sign * .868, .846, 2.404]], .005);
    output(side + ' rear amber indicator', turn,
      [[sign * .236, .832, 2.512], [sign * .560, .836, 2.492], [sign * .868, .834, 2.404]], .0044);
    output(side + ' reverse optical strip', 'reverse',
      [[sign * .244, .856, 2.512], [sign * .336, .860, 2.508]], .0046);
    output(side + ' rear fog reflector', 'fogRear',
      [[sign * .806, .368, 2.402], [sign * .808, .470, 2.398]], .009);
    root.add(polygon(side + ' painted rear bumper shoulder', [[sign * .470, .372, 2.520], [sign * .762, .392, 2.436],
      [sign * .868, .276, 2.388], [sign * .560, .282, 2.508]], paint));
  }
  // Continuous light band linking both clusters, plus the centre brake strip.
  output('Rear light band', 'tail', [[-.214, .866, 2.508], [0, .874, 2.514], [.214, .866, 2.508]], .0055);
  output('High-mounted centre brake light', 'brake',
    [[-.112, 1.052, 1.664], [.112, 1.052, 1.664]], .008);

  // Lower front intake, air curtains, exhaust outlets and valance.
  const intake: P[] = [[-.545, .560, -2.522], [.545, .560, -2.522], [.616, .300, -2.470], [-.616, .300, -2.470]];
  surface('Lower central intake recess', intake, 'intake');
  root.add(path('Intake satin lower edge', [intake[3]!, intake[2]!], .005, bright));
  for (const sign of [-1, 1]) {
    const air: P[] = [[sign * .686, .566, -2.470], [sign * .866, .606, -2.398],
      [sign * .878, .318, -2.386], [sign * .704, .302, -2.448]];
    surface('Bumper side air curtain', air, 'intake');
    root.add(path('Air curtain contour', air, .004, trim, true));
    root.add(polygon(sign < 0 ? 'Left painted bumper cheek' : 'Right painted bumper cheek',
      [[sign * .622, .548, -2.500], [sign * .700, .572, -2.462], [sign * .716, .330, -2.440],
        [sign * .648, .300, -2.470]], paint));
    const exhaust: P = [sign * .470, .272, 2.500];
    root.add(rounded(sign < 0 ? 'Left chrome exhaust outlet' : 'Right chrome exhaust outlet',
      [.150, .052, .062], exhaust, bright, .016));
    root.add(rounded(sign < 0 ? 'Left exhaust inner bore' : 'Right exhaust inner bore',
      [.116, .034, .030], [exhaust[0], exhaust[1], exhaust[2] - .020], trim, .010));
  }
  const valance = grid('Rear lower valance', 14, 2, (u, v) => {
    const x = (u * 2 - 1) * .818; return [x, mix(.238, .352, v), 2.532 - .186 * (Math.abs(x) / .878) ** 2];
  }, detail);
  mercedesExteriorUV(valance.geometry, 'intake', (x, y) => [(x + .818) / 1.636, (y - .238) / .114]);
  root.add(valance);
  for (const rear of [false, true]) root.add(path(rear ? 'Rear lower sill lip' : 'Front lower lip',
    [[-.792, .242, rear ? 2.500 : -2.500], [-.42, .238, rear ? 2.542 : -2.542], [0, .236, rear ? 2.546 : -2.546],
      [.42, .238, rear ? 2.542 : -2.542], [.792, .242, rear ? 2.500 : -2.500]], .011, trim));

  root.add(rounded('Rear number plate recess', [.520, .138, .014], [0, .640, 2.526], trim));
  root.add(label('Rear number plate', 'E 300 L', .410, .075, [0, .642, 2.536]));
  root.add(rounded('Front number plate plinth', [.440, .108, .012], [0, .418, -2.534], trim));
  root.add(label('Front number plate', 'Mercedes-Benz E 300 L', .400, .066, [0, .418, -2.542], [0, Math.PI, 0]));
  const bootStar = starEmblem('Boot lid star emblem', .034, bright, satin);
  bootStar.position.set(0, .880, 2.522); root.add(bootStar);
  root.add(label('Model designation', 'E 300 L', .180, .028, [-.560, .900, 2.508], [0, 0, 0], '#d9dee3'));

  const floor = config.body.groundClearance;
  root.add(loft('Mercedes underbody', [
    { z: -1.10, points: [[-.702, floor], [.702, floor], [.702, floor + .018], [-.702, floor + .018]] },
    { z: 1.10, points: [[-.702, floor], [.702, floor], [.702, floor + .018], [-.702, floor + .018]] },
  ], trim));

  root.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    if (object.name === 'Mercedes underbody') { object.userData.vehicleBodyPart = 'main-shell'; return; }
    if (object.userData.vehicleBodyPart === 'headlamp' || object.userData.vehicleBodyPart === 'tail-lamp') return;
    object.userData.vehicleBodyPart = /glass|windshield|screen|roof panel/.test(object.name) ? 'glass' : 'body';
  });
}

/** Rounded painted housing around the unchanged planar reflection aperture. */
export function buildMercedesE300LSideMirror(root: T.Group, mirrorRoot: T.Group, side: 'left' | 'right',
  c: MirrorVisualConfig, paintColor: number): MirrorSurfaceMesh {
  const sign = side === 'left' ? -1 : 1, group = new T.Group();
  group.name = side + ' mirror assembly';
  group.position.set(...c.position); group.rotation.set(...c.rotation);
  const paint = new T.MeshPhysicalMaterial({ color: paintColor, metalness: .62, roughness: .26,
    clearcoat: .9, side: T.DoubleSide });
  const black = new T.MeshStandardMaterial({ color: 0x0d1116, roughness: .58, side: T.DoubleSide });
  const outline: P[] = [];
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2;
    outline.push([Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** .38 * (c.size[0] / 2 + .016),
      Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** .48 * (c.size[1] / 2 + .015), 0]);
  }
  group.add(grid(side + ' curved mirror housing', 40, 8, (u, v) => {
    const a = u * Math.PI * 2, t = Math.cos(v * Math.PI / 2), z = -c.housingDepth * Math.sin(v * Math.PI / 2);
    return [Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** .38 * (c.size[0] / 2 + .016) * t,
      Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** .48 * (c.size[1] / 2 + .015) * t, z];
  }, paint));
  group.add(path(side + ' mirror edge gasket', outline, .006, black, true));
  const start = c.mountPosition!;
  root.add(beam(side + ' mirror stalk', start,
    [c.position[0] - sign * .072, c.position[1] - .022, c.position[2] - .028], .020, black));
  root.add(rounded(side + ' door sail mirror base', [.044, .094, .118], start, black));
  const repeater = path(side + ' mirror amber repeater',
    [[-.090, -.030, -.044], [0, -.034, -.060], [.090, -.026, -.044]], .0035, black);
  repeater.userData.lightingKey = side; group.add(repeater);
  root.add(group);
  const surface: MirrorSurfaceMesh = new T.Mesh(new T.PlaneGeometry(...c.size),
    new T.MeshStandardMaterial({ color: 0xa9b8c4, metalness: .95, roughness: .03 }));
  surface.name = side + ' mirror surface';
  surface.position.set(...c.position); surface.rotation.set(...c.rotation);
  surface.userData.mirrorSide = side; surface.renderOrder = 3; mirrorRoot.add(surface);
  group.traverse(object => { object.userData.vehicleBodyPart = 'mirror-housing'; });
  for (const name of [side + ' mirror stalk', side + ' door sail mirror base']) {
    const part = root.getObjectByName(name);
    if (part) part.userData.vehicleBodyPart = 'mirror-housing';
  }
  surface.userData.mountDirection = new T.Vector3(...c.position).sub(new T.Vector3(...start)).normalize();
  return surface;
}
