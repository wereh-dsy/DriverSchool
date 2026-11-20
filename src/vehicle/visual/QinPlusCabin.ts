import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstrumentCluster, type InstrumentTelemetry } from './InstrumentCluster';
import { QinPlusDisplay } from './QinPlusDisplays';
import { surfaceGrid, surfaceLoft, surfaceQuad } from './SurfaceVehicleGeometry';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

function joinCabin(name: string, parts: T.Mesh[], material: T.Material, shadow = true): T.Mesh {
  const geometries = parts.map(part => {
    part.updateMatrix();
    let g = part.geometry.clone().applyMatrix4(part.matrix);
    if (g.index) { const idx = g; g = g.toNonIndexed(); idx.dispose(); }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    part.geometry.dispose();
    return g;
  });
  const merged = mergeGeometries(geometries, false)!;
  geometries.forEach(g => g.dispose());
  const mesh = new T.Mesh(merged, material);
  mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = shadow;
  return mesh;
}

/** Lightweight rounded prism (curveSegments=2 -> 36 tris vs 116 in ExtrudeGeometry(6)). */
function lowRounded(name: string, size: P, at: P, material: T.Material, radius = .02): T.Mesh {
  const [w, h, d] = size, x = -w / 2, y = -h / 2, r = Math.min(radius, w / 2, h / 2);
  const s = new T.Shape();
  s.moveTo(x + r, y); s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -d / 2);
  const m = new T.Mesh(g, material); m.name = name; m.position.set(...at);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function createWheelEmblemTexture(): T.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#141a20'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#c4cfd6'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#e4edf2'; ctx.font = 'bold 64px "Microsoft YaHei", "SimHei", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('秦', 64, 68);
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export function buildQinPlusCabin(root: T.Group, c: VehicleVisualConfig, rig: {
  steeringWheelBase: T.Group; steeringWheelRotationGroup: T.Group; gearLever: T.Group;
}) {
  // Distinct PBR material calibration: balanced daylight (no white wash-out), clear material hierarchy.
  const leather = new T.MeshStandardMaterial({ color: c.body.interiorColor, roughness: .74, metalness: .02, side: T.DoubleSide });
  const darkSoft = new T.MeshStandardMaterial({ color: 0x222930, roughness: .88, metalness: .02, side: T.DoubleSide });
  const carpet = new T.MeshStandardMaterial({ color: 0x191e23, roughness: .96, metalness: 0, side: T.DoubleSide });
  const headliner = new T.MeshStandardMaterial({ color: 0xc6c1b7, roughness: .95, metalness: 0, side: T.DoubleSide });
  const piano = new T.MeshStandardMaterial({ color: 0x0d1217, roughness: .16, metalness: .10 });
  const satin = new T.MeshStandardMaterial({ color: 0xb4bdc3, metalness: .78, roughness: .28 });
  const backlight = new T.MeshStandardMaterial({
    color: 0x1a222a, emissive: 0xd8eeff, emissiveIntensity: 0, roughness: .42, metalness: .06, toneMapped: false,
  });
  const ambient = new T.MeshStandardMaterial({
    color: 0x17262a, emissive: 0x55d8c0, emissiveIntensity: 0, roughness: .45, metalness: .10, toneMapped: false,
  });

  const leatherParts: T.Mesh[] = [];
  const darkParts: T.Mesh[] = [];
  const carpetParts: T.Mesh[] = [];
  const headlinerParts: T.Mesh[] = [];
  const pianoParts: T.Mesh[] = [];
  const satinParts: T.Mesh[] = [];
  const backlightParts: T.Mesh[] = [];
  const ambientParts: T.Mesh[] = [];

  const pushBox = (bucket: T.Mesh[], size: P, at: P, mat: T.Material, rot?: P, radius = 0) => {
    const m = radius > 0
      ? lowRounded('p', size, at, mat, radius)
      : (() => { const o = new T.Mesh(new T.BoxGeometry(...size), mat); o.position.set(...at); return o; })();
    if (rot) m.rotation.set(...rot);
    bucket.push(m);
    return m;
  };
  const pushCyl = (bucket: T.Mesh[], rt: number, rb: number, h: number, segs: number, at: P, mat: T.Material, rot?: P) => {
    const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, segs), mat);
    o.position.set(...at);
    if (rot) o.rotation.set(...rot);
    bucket.push(o);
    return o;
  };
  const pushRing = (bucket: T.Mesh[], r: number, tube: number, segs: number, at: P, mat: T.Material, rot?: P) => {
    const o = new T.Mesh(new T.TorusGeometry(r, tube, 5, segs), mat);
    o.position.set(...at);
    if (rot) o.rotation.set(...rot);
    bucket.push(o);
    return o;
  };

  // ── 1. NAMED STRUCTURAL MESHES (Floor & Wraparound Dashboard) ─────────────
  const floor = new T.Mesh(new T.BoxGeometry(1.64, .024, 2.68), carpet);
  floor.name = 'Qin carpet floor';
  floor.position.set(0, .255, .30);
  floor.receiveShadow = true;
  root.add(floor);

  // Flowing BYD Dynasty wraparound lower dashboard (named mesh for sightline selftest)
  const dash = surfaceLoft('Qin flowing two-tone dashboard', [-.82, -.62, -.38, 0, .38, .62, .82].map(x => {
    const sideFlare = Math.min(1, Math.abs(x) / .82) ** 2;
    const zRear = -.455 - .030 * (1 - sideFlare);
    return {
      at: x,
      ring: [
        [.982, -.98],
        [.996, -.74],
        [.935, zRear],
        [.805, zRear + .025],
        [.735, -.61],
        [.840, -.95],
      ],
    };
  }), leather, 'x');
  root.add(dash);

  // ── 2. LAYERED DASHBOARD ARCHITECTURE ─────────────────────────────────────
  darkParts.push(surfaceLoft('Upper dash pad', [-.82, -.45, 0, .45, .82].map(x => ({
    at: x,
    ring: [[.986, -.98], [1.006, -.77], [.995, -.58], [.952, -.50], [.932, -.56], [.968, -.96]],
  })), darkSoft, 'x'));
  pushBox(pianoParts, [.92, .006, .036], [0, 1.007, -.85], piano);

  // Continuous sweeping piano-black middle fascia band & flowing satin-silver Dynasty trim
  pushBox(pianoParts, [1.58, .088, .024], [0, .885, -.462], piano);
  pushBox(satinParts, [.46, .010, .014], [-.54, .932, -.452], satin);
  pushBox(satinParts, [.68, .010, .014], [.44, .932, -.452], satin);
  pushBox(satinParts, [1.54, .007, .012], [0, .838, -.448], satin);
  // Subtle indirect BYD jade-cyan ambient accent ribbon tucked under the satin trim
  pushBox(ambientParts, [.44, .004, .005], [-.54, .923, -.449], ambient);
  pushBox(ambientParts, [.66, .004, .005], [.44, .923, -.449], ambient);

  // 4 sculpted horizontal air vents
  for (const [vx, vw] of [[-.68, .15], [-.085, .135], [.115, .135], [.68, .15]] as const) {
    pushBox(pianoParts, [vw + .018, .046, .018], [vx, .882, -.448], piano);
    pushBox(darkParts, [vw, .034, .012], [vx, .882, -.442], darkSoft);
    pushBox(satinParts, [vw - .016, .0045, .010], [vx, .882, -.436], satin);
    pushBox(satinParts, [.020, .014, .012], [vx, .882, -.434], satin);
  }
  // Passenger glovebox seam & satin release latch + display mounting pedestals
  pushBox(darkParts, [.52, .004, .010], [.47, .792, -.465], darkSoft);
  pushBox(satinParts, [.075, .013, .012], [.32, .775, -.466], satin);
  pushBox(pianoParts, [.086, .052, .038], [-.37, 1.018, -.552], piano);
  pushBox(pianoParts, [.092, .055, .056], [.015, .970, -.528], piano);

  // ── 3. SLEEK OPEN 2026 CENTER BRIDGE CONSOLE (Electronic Column Shifter) ──
  // Low sleek sloped ramp connecting under-dash smoothly to the wireless charging pad (no bulky wedge!)
  pushBox(darkParts, [.28, .095, .26], [.015, .665, -.385], darkSoft, [.34, 0, 0]);
  pushBox(pianoParts, [.24, .012, .22], [.015, .712, -.380], piano, [.34, 0, 0]);
  pushBox(darkParts, [.215, .009, .185], [.015, .718, -.378], darkSoft, [.34, 0, 0]);
  pushBox(satinParts, [.008, .012, .165], [.015, .722, -.376], satin, [.34, 0, 0]);
  pushBox(satinParts, [.255, .007, .012], [.015, .658, -.280], satin);

  // Main center tunnel body reaching cleanly down to the carpet floor + padded leather knee bolsters
  pushBox(darkParts, [.32, .37, 1.06], [.015, .445, .17], darkSoft);
  for (const sign of [-1, 1]) {
    pushBox(leatherParts, [.042, .118, .68], [.015 + sign * .152, .605, -.04], leather, undefined, .016);
  }
  // Piano-black upper console island (shortcut key row + volume roller + recessed dual cupholders)
  pushBox(pianoParts, [.265, .016, .54], [.015, .638, .01], piano);
  for (let i = 0; i < 5; i++) {
    const kx = -.085 + i * .050;
    pushBox(satinParts, [.034, .010, .026], [kx, .649, -.165], satin);
    pushBox(pianoParts, [.028, .012, .020], [kx, .651, -.165], piano);
    pushBox(backlightParts, [.014, .002, .005], [kx, .658, -.165], backlight);
  }
  pushCyl(satinParts, .011, .011, .024, 10, [.015, .653, -.112], satin, [0, 0, Math.PI / 2]);

  // True recessed dual cupholders: deep dark matte inner wells + hollow satin-chrome perimeter rings!
  for (const cz of [-.018, .088]) {
    pushCyl(carpetParts, .041, .038, .006, 14, [.015, .6465, cz], carpet);
    pushRing(satinParts, .043, .0032, 16, [.015, .648, cz], satin, [Math.PI / 2, 0, 0]);
  }

  // Sculpted two-tone central armrest box with rounded stitched top lid
  pushBox(darkParts, [.29, .12, .40], [.015, .640, .48], darkSoft);
  pushBox(leatherParts, [.295, .062, .41], [.015, .718, .48], leather, undefined, .024);
  pushBox(satinParts, [.12, .008, .012], [.015, .695, .275], satin);

  // ── 4. FULL CABIN ENCLOSURE (Zero Exterior Paint Leaks) ───────────────────
  carpetParts.push(surfaceQuad('Lower firewall', [[-.82, .255, -1.02], [-.82, .86, -.96],
    [.82, .86, -.96], [.82, .255, -1.02]], carpet));
  pushBox(satinParts, [.085, .052, .012], [-.41, .39, -.965], satin, [-.35, 0, 0]);
  pushBox(satinParts, [.044, .115, .012], [-.28, .38, -.968], satin, [-.42, 0, 0]);
  pushBox(carpetParts, [1.56, .030, .34], [0, .965, 1.62], carpet);

  // Curved inset roof headliner (exact 0.028 m inward clearance from outer roof crown)
  headlinerParts.push(surfaceGrid('Qin inset curved roof lining', 8, 10, (u, v) => {
    const s = u * 2 - 1;
    const z = T.MathUtils.lerp(-.44, 1.20, v);
    const t = T.MathUtils.clamp((z + .47) / 1.70, 0, 1);
    const halfW = .612 + .042 * Math.sin(t * Math.PI) - .032;
    const yEdge = 1.466 - .046 * (t * 2 - 1) ** 2;
    return [s * halfW, yEdge + .049 * (1 - s * s) - .028, z];
  }, headliner));
  pushBox(headlinerParts, [.22, .024, .14], [0, 1.425, -.34], headliner);
  pushBox(backlightParts, [.045, .004, .022], [0, 1.412, -.34], backlight);
  for (const side of [-1, 1]) {
    pushBox(headlinerParts, [.34, .016, .11], [side * .34, 1.420, -.40], headliner, [.28, 0, 0]);
  }
  // Tucked sleek interior rear-view mirror near windshield header
  pushBox(pianoParts, [.020, .048, .020], [0, 1.402, -.52], piano);
  pushBox(pianoParts, [.20, .050, .018], [0, 1.375, -.535], piano, [.08, 0, 0]);

  // ── 5. MULTI-TIER DOOR CARDS, SILL LINERS, PILLARS & SCULPTED SEATS ───────
  for (const side of [-1, 1]) {
    pushBox(carpetParts, [.036, .36, 2.58], [side * .825, .43, .28], carpet);

    // Front Door Card
    pushBox(darkParts, [.055, .13, 1.22], [side * .802, .915, -.24], darkSoft);
    pushBox(satinParts, [.014, .010, 1.12], [side * .774, .882, -.24], satin);
    pushBox(ambientParts, [.005, .004, .88], [side * .772, .874, -.20], ambient);
    pushBox(pianoParts, [.022, .040, .16], [side * .776, .898, -.52], piano);
    pushBox(satinParts, [.018, .016, .125], [side * .764, .898, -.52], satin);
    pushBox(leatherParts, [.048, .22, 1.18], [side * .805, .755, -.24], leather);
    pushBox(leatherParts, [.095, .052, .56], [side * .758, .772, -.02], leather, undefined, .018);
    pushBox(pianoParts, [.048, .014, .18], [side * .752, .800, -.16], piano, [.06, 0, 0]);
    pushBox(backlightParts, [.016, .002, .075], [side * .750, .808, -.16], backlight, [.06, 0, 0]);
    pushBox(darkParts, [.048, .20, 1.18], [side * .806, .555, -.24], darkSoft);
    // Clean circular speaker grille accent ring
    pushRing(satinParts, .064, .004, 16, [side * .780, .545, -.56], satin, [0, Math.PI / 2, 0]);

    // Rear Door Card
    pushBox(darkParts, [.052, .12, .94], [side * .804, .920, .92], darkSoft);
    pushBox(leatherParts, [.046, .22, .92], [side * .806, .760, .92], leather);
    pushBox(leatherParts, [.086, .048, .44], [side * .762, .775, .96], leather, undefined, .016);
    pushBox(darkParts, [.046, .19, .92], [side * .806, .560, .92], darkSoft);
    pushBox(satinParts, [.016, .015, .11], [side * .768, .898, .68], satin);

    // Inner A-pillar, B-pillar & C-pillar cabin trims
    headlinerParts.push(surfaceQuad('Inner A pillar', [[side * .79, 1.00, -.96], [side * .58, 1.40, -.45],
      [side * .61, 1.40, -.39], [side * .81, .98, -.88]], headliner));
    darkParts.push(surfaceQuad('Inner B pillar', [[side * .81, .98, .20], [side * .62, 1.41, .21],
      [side * .62, 1.41, .30], [side * .81, .98, .29]], darkSoft));
    headlinerParts.push(surfaceQuad('Inner C pillar', [[side * .80, 1.00, 1.56], [side * .59, 1.39, 1.18],
      [side * .59, 1.39, 1.24], [side * .80, 1.00, 1.72]], headliner));

    // Sculpted Two-Tone Ergonomic Front Seat
    const sx = side * .39;
    pushBox(darkParts, [.38, .13, .42], [sx, .325, .46], darkSoft);
    pushBox(leatherParts, [.36, .115, .48], [sx, .435, .46], leather, [.06, 0, 0], .036);
    for (const bSide of [-1, 1]) {
      pushBox(darkParts, [.082, .135, .46], [sx + bSide * .205, .455, .46], darkSoft, [.06, 0, bSide * -.12], .028);
    }
    pushBox(leatherParts, [.35, .54, .105], [sx, .765, .735], leather, [-.14, 0, 0], .032);
    for (const bSide of [-1, 1]) {
      pushBox(darkParts, [.088, .50, .135], [sx + bSide * .202, .755, .720], darkSoft, [-.14, bSide * -.18, 0], .028);
    }
    pushBox(darkParts, [.46, .52, .036], [sx, .765, .785], darkSoft, [-.14, 0, 0]);
    pushBox(satinParts, [.15, .020, .060], [sx, 1.032, .775], satin, [-.10, 0, 0]);
    pushBox(leatherParts, [.22, .165, .100], [sx, 1.115, .795], leather, [-.08, 0, 0], .032);
  }

  // Sculpted Rear Bench Seat
  pushBox(darkParts, [1.44, .12, .44], [0, .33, 1.28], darkSoft);
  pushBox(leatherParts, [1.38, .125, .45], [0, .445, 1.27], leather, [.05, 0, 0], .036);
  pushBox(leatherParts, [1.38, .48, .115], [0, .745, 1.50], leather, [-.16, 0, 0], .034);
  for (const side of [-1, 1]) {
    pushBox(darkParts, [.10, .46, .13], [side * .68, .74, 1.48], darkSoft, [-.16, 0, 0], .026);
  }
  for (const hx of [-.46, 0, .46]) {
    pushBox(leatherParts, [.21, .145, .090], [hx, 1.045, 1.545], leather, [-.10, 0, 0], .024);
  }

  // Merge static same-material cabin assemblies into low-draw-call meshes
  root.add(joinCabin('Qin cabin two-tone leather trim and seats', leatherParts, leather));
  root.add(joinCabin('Qin cabin dark soft-touch bolsters and console', darkParts, darkSoft));
  root.add(joinCabin('Qin cabin carpet sill liners and firewall', carpetParts, carpet));
  root.add(joinCabin('Qin cabin headliner and A-C pillar trims', headlinerParts, headliner, false));
  root.add(joinCabin('Qin cabin piano black fascia and console island', pianoParts, piano));
  root.add(joinCabin('Qin cabin satin silver trims and handles', satinParts, satin));
  root.add(joinCabin('Qin cabin console and door key backlights', backlightParts, backlight, false));
  root.add(joinCabin('Qin cabin subtle indirect accent strips', ambientParts, ambient, false));

  // ── 6. STEERING COLUMN, 2026 电子怀挡 & 3-SPOKE DYNASTY STEERING WHEEL ────
  rig.steeringWheelBase.position.set(...c.steeringWheelPosition);
  rig.steeringWheelBase.rotation.set(...c.steeringWheelRotation);
  rig.steeringWheelBase.add(rig.steeringWheelRotationGroup);
  root.add(rig.steeringWheelBase);

  const hub = new T.Vector3(...c.steeringWheelPosition), mount = new T.Vector3(...c.steeringColumnMountPosition!);
  const columnAxis = mount.clone().sub(hub);
  const column = new T.Mesh(new T.CylinderGeometry(.028, .036, columnAxis.length(), 10), darkSoft);
  column.name = 'Qin enclosed steering column';
  column.position.copy(hub).addScaledVector(columnAxis, .5);
  column.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), columnAxis.normalize());
  root.add(column);

  // Molded steering column shroud + left turn/wiper stalk
  const shroudParts: T.Mesh[] = [];
  pushBox(shroudParts, [.112, .088, .162], [-.37, .855, -.315], darkSoft, [.24, 0, 0], .018);
  pushCyl(shroudParts, .009, .011, .115, 8, [-.445, .872, -.255], darkSoft, [0, .15, Math.PI / 2 + .10]);
  root.add(joinCabin('Qin steering column shroud and left stalk', shroudParts, darkSoft));

  // Right 2026 集成式电子怀挡 (electronic column shifter stalk on rig.gearLever)
  rig.gearLever.position.set(...c.gearLeverPosition);
  const stalkParts: T.Mesh[] = [];
  pushCyl(stalkParts, .009, .011, .105, 8, [.048, .004, 0], darkSoft, [0, -.15, Math.PI / 2 - .10]);
  pushBox(stalkParts, [.024, .022, .026], [.098, .010, .008], darkSoft);
  rig.gearLever.add(joinCabin('Qin 2026 column electronic shifter stalk', stalkParts, darkSoft));
  const pCap = new T.Mesh(new T.CylinderGeometry(.009, .009, .006, 10), satin);
  pCap.name = 'Qin column shifter P-button tip';
  pCap.rotation.z = Math.PI / 2;
  pCap.position.set(.111, .010, .008);
  rig.gearLever.add(pCap);
  root.add(rig.gearLever);

  // Named closed full-size leather steering rim (diameter 0.381 m in [0.35, 0.39])
  const rim = new T.Mesh(new T.TorusGeometry(c.steeringWheelRadius, c.steeringWheelRimTubeRadius, 8, 36), darkSoft);
  rim.name = 'Qin three-spoke leather steering rim';
  rig.steeringWheelRotationGroup.add(rim);

  // Sculpted 3-spoke Dynasty steering wheel internals
  const wheelSatinParts: T.Mesh[] = [];
  const wheelPianoParts: T.Mesh[] = [];
  const wheelBacklightParts: T.Mesh[] = [];
  for (const side of [-1, 1]) {
    pushBox(wheelSatinParts, [.095, .028, .018], [side * .095, -.005, -.002], satin);
    pushBox(wheelPianoParts, [.054, .042, .022], [side * .108, .002, .006], piano);
    pushCyl(wheelSatinParts, .007, .007, .014, 8, [side * .108, .002, .017], satin);
    pushBox(wheelBacklightParts, [.009, .003, .002], [side * .092, .010, .018], backlight);
    pushBox(wheelBacklightParts, [.009, .003, .002], [side * .092, -.008, .018], backlight);
    pushBox(wheelBacklightParts, [.009, .003, .002], [side * .124, .010, .018], backlight);
    pushBox(wheelBacklightParts, [.009, .003, .002], [side * .124, -.008, .018], backlight);
    pushBox(wheelSatinParts, [.016, .112, .018], [side * .022, -.105, -.002], satin, [0, 0, side * -.10]);
  }
  pushBox(wheelSatinParts, [.056, .014, .018], [0, -.156, -.002], satin);
  rig.steeringWheelRotationGroup.add(joinCabin('Qin steering wheel satin spokes', wheelSatinParts, satin));
  rig.steeringWheelRotationGroup.add(joinCabin('Qin steering wheel multifunction pods', wheelPianoParts, piano));
  rig.steeringWheelRotationGroup.add(joinCabin('Qin steering wheel key backlights', wheelBacklightParts, backlight, false));

  // Sculpted central airbag boss + crisp "秦" Dynasty emblem
  const airbag = lowRounded('Qin steering airbag', [.122, .092, .036], [0, .002, .010], darkSoft, .020);
  rig.steeringWheelRotationGroup.add(airbag);
  const emblemTex = createWheelEmblemTexture();
  const emblemMat = new T.MeshStandardMaterial({
    color: 0xffffff, map: emblemTex ?? undefined, roughness: .30, metalness: .45,
  });
  if (!emblemTex) emblemMat.color.setHex(0xb8c3ca);
  const wheelEmblem = new T.Mesh(new T.CircleGeometry(.023, 18), emblemMat);
  wheelEmblem.name = 'Qin steering center emblem';
  wheelEmblem.position.set(0, .002, .0295);
  rig.steeringWheelRotationGroup.add(wheelEmblem);

  // ── 7. INSTRUMENT CLUSTER (8.8") & CENTERED DILINK DISPLAY (10.1") ────────
  const instrument = new InstrumentCluster(c.instrumentCluster);
  instrument.position.set(...c.instrumentClusterTransform.position);
  instrument.rotation.set(...c.instrumentClusterTransform.rotation);
  root.add(instrument);

  const center = new QinPlusDisplay(true);
  center.position.set(.015, 1.022, -.498);
  center.rotation.set(-.10, -.05, 0);
  root.add(center);

  // Per-frame lightweight backlight & indirect ambient update (zero allocations, zero traversals, zero PointLights)
  let lightLevel = 0;
  return {
    instrument,
    center,
    update: (t: InstrumentTelemetry, dt: number) => {
      center.update(t, dt);
      const on = t.ignitionOn !== false;
      const lamps = !!(t.indicators?.positionLights || t.indicators?.headlights || t.indicators?.highBeam);
      const daylight = T.MathUtils.clamp(t.ambientDaylight ?? 1, 0, 1);
      const target = on ? (lamps ? T.MathUtils.lerp(.95, .20, daylight) : T.MathUtils.lerp(.55, .04, daylight)) : 0;
      lightLevel = T.MathUtils.damp(lightLevel, target, 8, Math.min(.1, Math.max(0, dt)));
      backlight.emissiveIntensity = lightLevel * 1.15;
      ambient.emissiveIntensity = lightLevel * .68;
    },
    cyclePage: () => center.cyclePage(),
    click: (ray: T.Raycaster) => {
      if (!ray.intersectObject(center.screen).length) return false;
      center.cyclePage();
      return true;
    },
  };
}
