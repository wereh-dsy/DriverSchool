import * as T from 'three';
import type { Vector3Tuple as P } from './VehicleVisualConfig';

/** Local construction tools for this reference vehicle; no shared visual framework. */
export function mesh(name: string, geometry: T.BufferGeometry, material: T.Material): T.Mesh {
  const m = new T.Mesh(geometry, material); m.name = name; m.castShadow = true; m.receiveShadow = true; return m;
}

export function grid(name: string, rows: number, columns: number,
  point: (u: number, v: number) => P, material: T.Material): T.Mesh {
  const positions: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) positions.push(...point(r / rows, c / columns));
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const a = r * (columns + 1) + c, b = a + columns + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals(); return mesh(name, g, material);
}

export function polygon(name: string, points: readonly P[], material: T.Material): T.Mesh {
  const a = new T.Vector3(...points[0]!), b = new T.Vector3(...points[1]!), c = new T.Vector3(...points[2]!);
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const dominant = Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? 'x' : Math.abs(n.y) > Math.abs(n.z) ? 'y' : 'z';
  const outline = points.map(p => new T.Vector2(...(dominant === 'x' ? [p[2], p[1]] as const : dominant === 'y' ? [p[0], p[2]] as const : [p[0], p[1]] as const)));
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
  g.setIndex(T.ShapeUtils.triangulateShape(outline, []).flat()); g.computeVertexNormals(); return mesh(name, g, material);
}

export function path(name: string, points: readonly P[], radius: number, material: T.Material, closed = false): T.Mesh {
  // Window apertures and panel outlines must retain their exact corners;
  // Catmull-Rom overshoot would cross the roof and the separate glass polygon.
  const line = new T.CurvePath<T.Vector3>();
  if (closed) for (let i = 0; i < points.length; i++) line.add(new T.LineCurve3(new T.Vector3(...points[i]!), new T.Vector3(...points[(i + 1) % points.length]!)));
  const curve = closed ? line : new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), false, 'centripetal');
  return mesh(name, new T.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 6, closed), material);
}

export function beam(name: string, a: P, b: P, radius: number, material: T.Material): T.Mesh {
  const from = new T.Vector3(...a), to = new T.Vector3(...b), d = to.clone().sub(from);
  const m = mesh(name, new T.CylinderGeometry(radius, radius, d.length(), 12), material);
  m.position.copy(from).add(to).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); return m;
}

export function roundShape(w: number, h: number, r: number): T.Shape {
  const s = new T.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}

export function rounded(name: string, size: P, position: P, material: T.Material, radius = .012): T.Mesh {
  const r = Math.min(radius, size[0] * .3, size[1] * .3, size[2] * .3);
  const g = new T.ExtrudeGeometry(roundShape(size[0] - 2 * r, size[1] - 2 * r, r),
    { depth: size[2] - 2 * r, steps: 1, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -size[2] / 2 + r);
  const m = mesh(name, g, material); m.position.set(...position); return m;
}

/** Smooth upholstered volume; broad faces and soft shoulders without stacked bolsters. */
export function upholstered(name: string, size: P, position: P, material: T.Material, power = .55): T.Mesh {
  const geometry = new T.SphereGeometry(1, 32, 20);
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const normal = new T.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const unit = [positions.getX(i), positions.getY(i), positions.getZ(i)];
    const p = unit.map((v, axis) => Math.sign(v) * Math.abs(v) ** power * size[axis]! / 2);
    positions.setXYZ(i, p[0]!, p[1]!, p[2]!);
    normal.set(...unit.map((v, axis) => Math.sign(v) * Math.abs(v) ** (2 - power) / size[axis]!) as [number, number, number]).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const m = mesh(name, geometry, material); m.position.set(...position); return m;
}

export function loft(name: string, sections: readonly { z: number; points: readonly (readonly [number, number])[] }[], material: T.Material): T.Mesh {
  const positions = sections.flatMap(s => s.points.flatMap(([x, y]) => [x, y, s.z]));
  const n = sections[0]!.points.length, indices: number[] = [];
  for (let s = 0; s < sections.length - 1; s++) for (let i = 0; i < n; i++) {
    const a = s * n + i, b = s * n + (i + 1) % n, c = a + n, d = b + n;
    indices.push(a, c, b, b, c, d);
  }
  const cap = T.ShapeUtils.triangulateShape(sections[0]!.points.map(p => new T.Vector2(...p)), []);
  const end = (sections.length - 1) * n;
  for (const [a, b, c] of cap) indices.push(a!, b!, c!, end + c!, end + b!, end + a!);
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals(); return mesh(name, g, material);
}

/** Capped world-space rings for the oblique front-window frame and shaped spokes. */
export function sweep(name: string, rings: readonly (readonly P[])[], material: T.Material): T.Mesh {
  const count = rings[0]!.length, positions = rings.flatMap(ring => ring.flat()), indices: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < count; i++) {
    const a = r * count + i, b = r * count + (i + 1) % count;
    indices.push(a, a + count, b, b, a + count, b + count);
  }
  for (const index of [0, rings.length - 1]) {
    const ring = rings[index]!, p = new T.Vector3(...ring[0]!);
    const normal = new T.Vector3(...ring[1]!).sub(p).cross(new T.Vector3(...ring[2]!).sub(p));
    const axis = Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z) ? 'x' : Math.abs(normal.y) > Math.abs(normal.z) ? 'y' : 'z';
    const outline = ring.map(([x,y,z]) => new T.Vector2(...(axis === 'x' ? [z,y] : axis === 'y' ? [x,z] : [x,y]) as [number,number]));
    for (const face of T.ShapeUtils.triangulateShape(outline, [])) indices.push(...(index === 0 ? face : face.reverse()).map(i => index * count + i));
  }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return mesh(name, geometry, material);
}

/** One small decal for the steering hub; exterior emblems keep their existing geometry. */
export function steeringBadge(radius: number): T.Mesh {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#a9b0b5'; ctx.beginPath(); ctx.arc(128,128,124,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#0c1116'; ctx.beginPath(); ctx.arc(128,128,117,0,Math.PI*2); ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#e8edf0' : '#348bb8'; ctx.beginPath(); ctx.moveTo(128,128);
    ctx.arc(128,128,77,i*Math.PI/2,(i+1)*Math.PI/2); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#b7c3c9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(128,128,78,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle = '#e7edf0'; ctx.font = '600 29px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [letter, angle] of [['B',-.64],['M',0],['W',.64]] as const) {
    ctx.save(); ctx.translate(128 + Math.sin(angle)*98,128-Math.cos(angle)*98); ctx.rotate(angle); ctx.fillText(letter,0,0); ctx.restore();
  }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  const badge = mesh('BMW steering hub decal', new T.PlaneGeometry(radius*2,radius*2),
    new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
  badge.castShadow = false; return badge;
}

export function label(name: string, text: string, width: number, height: number, position: P,
  rotation: P = [0, 0, 0], color = '#e8dfd4'): T.Mesh {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = color; ctx.font = '500 42px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 48);
  const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace;
  const m = mesh(name, new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
  m.position.set(...position); m.rotation.set(...rotation); m.castShadow = false; return m;
}

export function roundel(name: string, radius: number): T.Group {
  const g = new T.Group(); g.name = name;
  const black = new T.MeshStandardMaterial({ color: 0x080a0e, roughness: .32, metalness: .35, side: T.DoubleSide });
  const chrome = new T.MeshStandardMaterial({ color: 0xb6c0cc, metalness: .8, roughness: .25 });
  const ring = mesh('Roundel satin rim', new T.TorusGeometry(radius * .95, radius * .05, 6, 40), chrome); g.add(ring);
  g.add(mesh('Roundel black surround', new T.CircleGeometry(radius * .91, 40), black));
  const positions: number[] = [], colors: number[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 16; j++) {
    const a = (i + j / 16) * Math.PI / 2, b = (i + (j + 1) / 16) * Math.PI / 2;
    positions.push(0, 0, .001, Math.cos(a) * radius * .61, Math.sin(a) * radius * .61, .001,
      Math.cos(b) * radius * .61, Math.sin(b) * radius * .61, .001);
    const color = new T.Color(i % 2 ? 0xe4edf2 : 0x328aca);
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  }
  const quadrants = new T.BufferGeometry(); quadrants.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  quadrants.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.add(mesh('Roundel blue and white quadrants', quadrants, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide })));
  g.add(label('BMW roundel lettering', 'B M W', radius * 1.45, radius * .36, [0, radius * .72, .002])); return g;
}

export const roofHeight = (z: number, x: number): number => {
  const t = T.MathUtils.clamp((z + .31) / 1.34, 0, 1);
  return 1.435 + .065 * Math.sin(Math.PI * t) - .022 * (x / .7) ** 2;
};
export const sideGlassX = (y: number): number => .857 - .168 * T.MathUtils.clamp((y - .945) / .48, 0, 1);
