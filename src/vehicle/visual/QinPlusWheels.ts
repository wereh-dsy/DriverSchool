import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

function normalizeAndMerge(parts: T.BufferGeometry[]): T.BufferGeometry {
  const normalized = parts.map(raw => {
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    raw.dispose();
    return g;
  });
  const merged = mergeGeometries(normalized, false)!;
  normalized.forEach(g => g.dispose());
  return merged;
}

function createQinTyreTexture(): T.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  // Base matte charcoal tyre rubber
  ctx.fillStyle = '#1b1f24'; ctx.fillRect(0, 0, 512, 256);

  // Sidewall subtle shading bands (top & bottom regions of lathe profile UV)
  for (const [y0, y1] of [[0, 76], [180, 256]] as const) {
    const grad = ctx.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, '#14171b');
    grad.addColorStop(0.5, '#22272d');
    grad.addColorStop(1, '#181c20');
    ctx.fillStyle = grad; ctx.fillRect(0, y0, 512, y1 - y0);
  }
  // Subtle sidewall concentric molding ribs
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2;
  for (const y of [22, 42, 62, 194, 214, 234]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
  }
  // Tread crown band (center V = 0.30..0.70 -> y = 76..180)
  ctx.fillStyle = '#191d22'; ctx.fillRect(0, 76, 512, 104);
  // 4 deep circumferential rain grooves
  ctx.fillStyle = '#0c0f12';
  for (const gy of [96, 118, 138, 160]) ctx.fillRect(0, gy - 3, 512, 6);
  // Angled shoulder tread blocks & sipes
  ctx.strokeStyle = '#0f1317'; ctx.lineWidth = 3;
  for (let x = 0; x < 512; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, 76); ctx.lineTo(x + 9, 96); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 9, 160); ctx.lineTo(x, 180); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 4, 100); ctx.lineTo(x + 11, 116); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 11, 140); ctx.lineTo(x + 4, 156); ctx.stroke();
  }

  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = T.RepeatWrapping; tex.wrapT = T.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** 2026 Qin PLUS DM-i 16-inch low-drag dual-tone alloy & 225/60 R16 tyre; brakes stay on uprights. */
export function buildQinPlusWheels(root: T.Group, c: VehicleVisualConfig) {
  const pivots = {} as Record<VehicleWheelId, T.Group>, wheels: T.Mesh[] = [];
  const tyreTex = createQinTyreTexture();
  const rubber = new T.MeshStandardMaterial({
    color: 0xffffff, map: tyreTex ?? undefined, roughness: .88, metalness: .04,
  });
  if (!tyreTex) rubber.color.setHex(0x1a1e22);

  const machinedAlloy = new T.MeshStandardMaterial({ color: 0xcbd4d9, metalness: .86, roughness: .20 });
  const darkAlloy = new T.MeshStandardMaterial({ color: 0x20272d, metalness: .62, roughness: .36, side: T.DoubleSide });
  const rotorSteel = new T.MeshStandardMaterial({ color: 0x8a939a, metalness: .82, roughness: .34 });
  const caliperMat = new T.MeshStandardMaterial({ color: 0x353e46, metalness: .55, roughness: .46 });

  const r = c.wheelRadius;
  const hw = c.dimensions.wheelWidth / 2; // 0.1125 m (225 mm)
  const rimR = .204; // 16-inch rim radius (~203.2 mm)

  // 1. Sculpted 225/60 R16 rounded sidewall + shoulder + tread tyre profile (economical 22-seg lathe)
  const profile = [
    new T.Vector2(rimR - .003, -hw * .86),
    new T.Vector2(rimR + .046, -hw * .99),
    new T.Vector2(r - .018, -hw * .94),
    new T.Vector2(r - .002, -hw * .70),
    new T.Vector2(r, 0),
    new T.Vector2(r - .002, hw * .70),
    new T.Vector2(r - .018, hw * .94),
    new T.Vector2(rimR + .046, hw * .99),
    new T.Vector2(rimR - .003, hw * .86),
  ];
  const tireGeometry = new T.LatheGeometry(profile, 24);
  tireGeometry.rotateZ(-Math.PI / 2);

  // 2. Dark metallic 16" inner barrel + aero pocket web + recessed lug hub (outer face at +X)
  const darkParts: T.BufferGeometry[] = [];
  const barrel = new T.CylinderGeometry(rimR, rimR, hw * 1.72, 18, 1, true);
  barrel.rotateZ(Math.PI / 2);
  darkParts.push(barrel);

  const hubDish = new T.CylinderGeometry(.062, .054, .036, 12);
  hubDish.rotateZ(Math.PI / 2); hubDish.translate(.074, 0, 0);
  darkParts.push(hubDish);

  // 5 dark low-drag aerodynamic backing webs between the twin machined spokes
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
    const web = new T.BoxGeometry(.010, .056, .135);
    web.translate(.080, 0, .120);
    web.rotateX(a);
    darkParts.push(web);
  }
  const darkRimGeometry = normalizeAndMerge(darkParts);

  // 3. Machined bright silver outer lip + 5 twin-Y aero spokes + center cap & 5 lug nuts (outer face at +X)
  const brightParts: T.BufferGeometry[] = [];
  const lip = new T.TorusGeometry(rimR - .004, .009, 5, 22);
  lip.rotateY(Math.PI / 2); lip.translate(hw * .84, 0, 0);
  brightParts.push(lip);

  const centerCap = new T.CylinderGeometry(.032, .034, .014, 12);
  centerCap.rotateZ(Math.PI / 2); centerCap.translate(hw * .82, 0, 0);
  brightParts.push(centerCap);

  // 5 sculpted twin-spoke pairs (2026 aerodynamic dual-tone Qin PLUS 16" pattern)
  for (let i = 0; i < 5; i++) {
    const baseAngle = (i / 5) * Math.PI * 2;
    for (const pairSign of [-1, 1]) {
      const spoke = new T.BoxGeometry(.012, .019, .148);
      // Slight concave dish from hub (.086) out to lip (.096) and gentle V-spread
      spoke.rotateY(pairSign * .045);
      spoke.rotateZ(-.055);
      spoke.translate(hw * .80, pairSign * .018, .122);
      spoke.rotateX(baseAngle + pairSign * .085);
      brightParts.push(spoke);
    }
    // 5 chrome lug nut heads around center hub
    const lug = new T.CylinderGeometry(.0075, .0075, .014, 6);
    lug.rotateZ(Math.PI / 2);
    lug.translate(hw * .77, Math.sin(baseAngle) * .044, Math.cos(baseAngle) * .044);
    brightParts.push(lug);
  }
  const brightRimGeometry = normalizeAndMerge(brightParts);

  // 4. Non-spinning vented brake rotor + caliper (shared across uprights)
  const rotorParts: T.BufferGeometry[] = [];
  const disc = new T.CylinderGeometry(.144, .144, .016, 16);
  disc.rotateZ(Math.PI / 2);
  rotorParts.push(disc);
  const hat = new T.CylinderGeometry(.072, .076, .034, 10);
  hat.rotateZ(Math.PI / 2); hat.translate(.010, 0, 0);
  rotorParts.push(hat);
  const rotorGeometry = normalizeAndMerge(rotorParts);

  const caliperParts: T.BufferGeometry[] = [];
  const calBody = new T.BoxGeometry(.044, .112, .062);
  caliperParts.push(calBody);
  const calBridge = new T.BoxGeometry(.052, .074, .042);
  calBridge.translate(.006, 0, -.004);
  caliperParts.push(calBridge);
  const caliperGeometry = normalizeAndMerge(caliperParts);

  const positions = localWheelPositions(c.dimensions);
  for (const id of VEHICLE_WHEEL_IDS) {
    const p = positions[id];
    const side = id.endsWith('Left') ? -1 : 1;
    const isFront = id.startsWith('front');

    const pivot = new T.Group();
    pivot.name = `Qin ${id} upright`;
    pivot.userData.wheelId = id;
    pivot.position.set(p.x, p.y - (c.staticBodyOffsetY ?? 0), p.z);

    // Registry discovery requires the spinning tyre at child zero; upright
    // brakes remain subsequent children and do not rotate with wheel spin.
    const wheel = new T.Mesh(tireGeometry, rubber);
    wheel.name = `Qin ${id} tyre`;
    wheel.castShadow = true; wheel.receiveShadow = true;
    pivot.add(wheel);

    const darkRim = new T.Mesh(darkRimGeometry, darkAlloy);
    darkRim.name = `Qin ${id} alloy barrel`;
    if (side < 0) darkRim.rotation.y = Math.PI;
    wheel.add(darkRim);

    const brightRim = new T.Mesh(brightRimGeometry, machinedAlloy);
    brightRim.name = `Qin ${id} machined alloy face`;
    if (side < 0) brightRim.rotation.y = Math.PI;
    wheel.add(brightRim);

    const rotor = new T.Mesh(rotorGeometry, rotorSteel);
    rotor.name = `Qin ${id} brake rotor`;
    rotor.position.x = side * .038;
    if (side < 0) rotor.rotation.y = Math.PI;
    pivot.add(rotor);

    const caliper = new T.Mesh(caliperGeometry, caliperMat);
    caliper.name = `Qin ${id} brake caliper`;
    caliper.position.set(side * .040, .016, isFront ? .106 : -.106);
    if (side < 0) caliper.rotation.y = Math.PI;
    pivot.add(caliper);

    root.add(pivot);
    pivots[id] = pivot;
    wheels.push(wheel);
  }
  return { pivots, wheels };
}
