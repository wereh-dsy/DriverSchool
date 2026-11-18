import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Rounded open shell; the configured rectangular optical aperture is untouched. */
export function exteriorMirrorHousing(width: number, height: number, depth: number): BufferGeometry {
  const positions: number[] = [], indices: number[] = [], segments = 32;
  for (let ring = 0; ring < 5; ring++) {
    const t = ring / 4, scale = .45 + .55 * Math.sin(t * Math.PI / 2);
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2, x = Math.cos(a), y = Math.sin(a);
      positions.push(Math.sign(x) * Math.abs(x) ** .24 * width / 2 * scale,
        Math.sign(y) * Math.abs(y) ** .28 * height / 2 * scale, -depth / 2 + depth * t);
      if (ring < 4) { const k = ring * segments + i, next = ring * segments + (i + 1) % segments;
        indices.push(k, next, next + segments, k, next + segments, k + segments); }
    }
  }
  const center = positions.length / 3; positions.push(0, 0, -depth / 2);
  for (let i = 0; i < segments; i++) indices.push(center, (i + 1) % segments, i);
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
