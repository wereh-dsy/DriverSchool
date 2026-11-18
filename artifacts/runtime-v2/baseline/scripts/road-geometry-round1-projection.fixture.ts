/** Preserved round-one projection baseline, 2026-11-06. Test-only; never imported by the game. */
import { BufferGeometry, Float32BufferAttribute } from 'three';
const ROAD_GEOMETRY_BUDGET = { markingClearance: .008 };

function geometry(positions: number[], uv: number[], indices?: number[]): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(positions, 3));
  result.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (indices) result.setIndex(indices);
  result.computeVertexNormals(); result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

interface SurfaceVertex { x: number; y: number; z: number }
interface SurfaceTriangle { a: SurfaceVertex; b: SurfaceVertex; c: SurfaceVertex; den: number }
/** Small spatial index of FINAL visible triangles, built once during compilation.
 * Exact polygon intersection clips paint to its owner and interpolates the same
 * plane, including grade/bank. Upstairs triangles cannot capture downstairs paint. */
export class PavementTriangleIndex {
  private readonly buckets = new Map<string, SurfaceTriangle[]>();
  constructor(surfaces: readonly BufferGeometry[]) {
    for (const surface of surfaces) {
      const p = surface.getAttribute('position'), index = surface.index;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const v = [0, 1, 2].map(k => { const n = index ? index.getX(i + k) : i + k; return { x: p.getX(n), y: p.getY(n), z: p.getZ(n) }; });
        let [a, b, c] = v as [SurfaceVertex, SurfaceVertex, SurfaceVertex];
        let den = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        if (Math.abs(den) < 1e-8) continue;
        if (den < 0) { [b, c] = [c, b]; den = -den; }
        const triangle = { a, b, c, den };
        for (const key of this.keys(v)) { const list = this.buckets.get(key) ?? []; list.push(triangle); this.buckets.set(key, list); }
      }
    }
  }
  private *keys(points: readonly SurfaceVertex[]): Generator<string> {
    for (let x = Math.floor(Math.min(...points.map(p => p.x)) / 16); x <= Math.floor(Math.max(...points.map(p => p.x)) / 16); x++)
      for (let z = Math.floor(Math.min(...points.map(p => p.z)) / 16); z <= Math.floor(Math.max(...points.map(p => p.z)) / 16); z++) yield x + ',' + z;
  }
  heightAt(x: number, z: number, referenceY: number): number | undefined {
    // Float32 world coordinates at city-scale junctions round by fractions of a
    // millimetre. Use a distance tolerance, not a dimensionless barycentric one
    // (which becomes too strict on short clipped triangles).
    const epsilon = .0005;
    for (let bx = Math.floor((x - epsilon) / 16); bx <= Math.floor((x + epsilon) / 16); bx++)
    for (let bz = Math.floor((z - epsilon) / 16); bz <= Math.floor((z + epsilon) / 16); bz++)
    for (const t of this.buckets.get(bx + ',' + bz) ?? []) {
      const u = ((x - t.a.x) * (t.c.z - t.a.z) - (z - t.a.z) * (t.c.x - t.a.x)) / t.den;
      const v = ((t.b.x - t.a.x) * (z - t.a.z) - (t.b.z - t.a.z) * (x - t.a.x)) / t.den;
      const y = t.a.y + u * (t.b.y - t.a.y) + v * (t.c.y - t.a.y);
      const eu = epsilon * Math.hypot(t.c.x - t.a.x, t.c.z - t.a.z) / t.den;
      const ev = epsilon * Math.hypot(t.b.x - t.a.x, t.b.z - t.a.z) / t.den;
      const es = epsilon * Math.hypot(t.c.x - t.b.x, t.c.z - t.b.z) / t.den;
      if (u >= -eu && v >= -ev && u + v <= 1 + es && Math.abs(y - referenceY) < .5) return y;
    }
    return undefined;
  }
  projectPaint(source: BufferGeometry): BufferGeometry {
    const positions: number[] = [], uv: number[] = [], p = source.getAttribute('position'), index = source.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const original = [0, 1, 2].map(k => { const n = index ? index.getX(i + k) : i + k; return { x: p.getX(n), y: p.getY(n), z: p.getZ(n) }; });
      const candidates = new Set<SurfaceTriangle>();
      for (const key of this.keys(original)) for (const t of this.buckets.get(key) ?? []) candidates.add(t);
      for (const t of candidates) {
        let polygon = original;
        const height = (p: SurfaceVertex) => t.a.y + ((p.x - t.a.x) * (t.c.z - t.a.z) - (p.z - t.a.z) * (t.c.x - t.a.x)) / t.den * (t.b.y - t.a.y)
          + ((t.b.x - t.a.x) * (p.z - t.a.z) - (t.b.z - t.a.z) * (p.x - t.a.x)) / t.den * (t.c.y - t.a.y);
        if (original.some(v => Math.abs(v.y - height(v)) > .5)) continue;
        const corners = [t.a, t.b, t.c];
        for (let edge = 0; edge < 3 && polygon.length; edge++) {
          const a = corners[edge]!, b = corners[(edge + 1) % 3]!, clipped: SurfaceVertex[] = [];
          const side = (p: SurfaceVertex) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
          for (let k = 0; k < polygon.length; k++) {
            const a = polygon[k]!, b = polygon[(k + 1) % polygon.length]!, sa = side(a), sb = side(b);
            if (sa >= -1e-8) clipped.push(a);
            if ((sa >= 0) !== (sb >= 0)) { const u = sa / (sa - sb); clipped.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u }); }
          }
          polygon = clipped;
        }
        for (let k = 1; k + 1 < polygon.length; k++) {
          const triangle = [polygon[0]!, polygon[k + 1]!, polygon[k]!];
          const [a, b, c] = triangle as [SurfaceVertex, SurfaceVertex, SurfaceVertex];
          if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-8) continue;
          // Normalize top-facing winding independently of the input paint mesh.
          if ((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) > 0) triangle.reverse();
          for (const v of triangle) { positions.push(v.x, height(v) + ROAD_GEOMETRY_BUDGET.markingClearance, v.z); uv.push(v.x, v.z); }
        }
      }
    }
    return geometry(positions, uv);
  }
}

