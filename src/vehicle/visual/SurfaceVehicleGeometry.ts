import * as T from 'three';
import type { Vector3Tuple as P } from './VehicleVisualConfig';

/** UV-bearing large surfaces for the GTI production pilot. No runtime tessellation. */
export function surfaceGrid(name: string, rows: number, columns: number,
  point: (u: number, v: number) => P, material: T.Material): T.Mesh {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    positions.push(...point(r / rows, c / columns)); uv.push(c / columns, 1 - r / rows);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const a = r * (columns + 1) + c, b = a + columns + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return surfaceMesh(name, positions, indices, uv, material);
}

export function surfaceMesh(name: string, positions: number[], indices: number[], uv: number[], material: T.Material): T.Mesh {
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  const m = new T.Mesh(g, material); m.name = name; m.castShadow = true; m.receiveShadow = true; return m;
}

/** Closed section shell with UVs; axis=x uses [y,z] sections, axis=z uses [x,y]. */
export function surfaceLoft(name: string, sections: readonly { at: number; ring: readonly (readonly [number, number])[] }[],
  material: T.Material, axis: 'x' | 'z' = 'z'): T.Mesh {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [], n = sections[0]!.ring.length;
  sections.forEach((s, j) => s.ring.forEach(([a, b], i) => {
    positions.push(...(axis === 'z' ? [a, b, s.at] : [s.at, a, b])); uv.push(j / (sections.length - 1), i / (n - 1));
  }));
  for (let j = 0; j < sections.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i, b = j * n + (i + 1) % n;
    indices.push(a, a + n, b, b, a + n, b + n);
  }
  const cap = T.ShapeUtils.triangulateShape(sections[0]!.ring.map(p => new T.Vector2(...p)), []), end = (sections.length - 1) * n;
  for (const [a, b, c] of cap) indices.push(a!, b!, c!, end + c!, end + b!, end + a!);
  return surfaceMesh(name, positions, indices, uv, material);
}

export function surfaceQuad(name: string, corners: readonly [P, P, P, P], material: T.Material): T.Mesh {
  return surfaceGrid(name, 1, 1, (u, v) => {
    const a = new T.Vector3(...corners[0]).lerp(new T.Vector3(...corners[1]), v);
    const b = new T.Vector3(...corners[3]).lerp(new T.Vector3(...corners[2]), v);
    return a.lerp(b, u).toArray() as [number, number, number];
  }, material);
}

export function surfaceRounded(name: string, size: P, position: P, material: T.Material, radius = .025): T.Mesh {
  const [w, h, d] = size, x = -w / 2, y = -h / 2, r = Math.min(radius, w / 2, h / 2);
  const s = new T.Shape(); s.moveTo(x + r, y); s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -d / 2);
  // World-sized extrusion UVs do not cover a decal. Normalize the front/back face.
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + .5, p.getY(i) / h + .5);
  const m = new T.Mesh(g, material); m.name = name; m.position.set(...position); m.castShadow = true; m.receiveShadow = true; return m;
}
