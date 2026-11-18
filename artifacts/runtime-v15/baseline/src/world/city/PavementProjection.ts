import { BufferAttribute, BufferGeometry } from 'three';
import { drain } from '../../loading/Loading';

/** Packed immutable support planes. No GPU geometry is retained by this index.
 * Reusable clipping scratch and generation stamps avoid a Set/object graph per
 * paint triangle. A contained triangle and a coplanar union retain the original
 * triangle, instead of multiplying paint triangles at invisible ribbon diagonals. */
export class PavementTriangleIndex {
  private readonly planes: Float64Array;
  private readonly cells = new Map<number, Map<number, Uint32Array>>();
  private readonly seen: Uint32Array;
  private readonly candidates: Uint32Array;
  private readonly clippedIds: Uint32Array;
  private stamp = 0;
  readonly statistics = { inputTriangles: 0, candidateTests: 0, contained: 0, coplanarUnions: 0, outputTriangles: 0 };
  get byteLength(): number {
    let bytes = this.planes.byteLength + this.seen.byteLength + this.candidates.byteLength + this.clippedIds.byteLength;
    for (const column of this.cells.values()) for (const ids of column.values()) bytes += ids.byteLength;
    return bytes;
  }
  constructor(surfaces: readonly BufferGeometry[]) {
    const count = surfaces.reduce((n, g) => n + (g.index?.count ?? g.getAttribute('position').count) / 3, 0);
    const planes = new Float64Array(count * 18), cells = new Map<number, Map<number, number[]>>();
    let used = 0;
    for (const surface of surfaces) {
      const p = surface.getAttribute('position'), indices = surface.index;
      for (let i = 0; i < (indices?.count ?? p.count); i += 3) {
        const a = indices ? indices.getX(i) : i, b = indices ? indices.getX(i + 1) : i + 1, c = indices ? indices.getX(i + 2) : i + 2;
        const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a);
        let bx = p.getX(b), by = p.getY(b), bz = p.getZ(b), cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
        let den = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        if (Math.abs(den) < 1e-8) continue;
        if (den < 0) { [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; [bz, cz] = [cz, bz]; den = -den; }
        const gx = ((by - ay) * (cz - az) - (cy - ay) * (bz - az)) / den;
        const gz = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / den;
        const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx), minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
        planes.set([ax, ay, az, bx, by, bz, cx, cy, cz, den, gx, gz, ay - gx * ax - gz * az, minX, maxX, minZ, maxZ, 1 / Math.hypot(gx, 1, gz)], used * 18);
        for (let x = Math.floor(minX / 16); x <= Math.floor(maxX / 16); x++) {
          let column = cells.get(x); if (!column) cells.set(x, column = new Map());
          for (let z = Math.floor(minZ / 16); z <= Math.floor(maxZ / 16); z++) { let ids = column.get(z); if (!ids) column.set(z, ids = []); ids.push(used); }
        }
        used++;
      }
    }
    this.planes = planes.subarray(0, used * 18); this.seen = new Uint32Array(used); this.candidates = new Uint32Array(used); this.clippedIds = new Uint32Array(used);
    for (const [x, column] of cells) this.cells.set(x, new Map([...column].map(([z, ids]) => [z, new Uint32Array(ids)])));
  }
  private query(minX: number, maxX: number, minZ: number, maxZ: number): number {
    this.stamp++; if (this.stamp === 0xffffffff) { this.seen.fill(0); this.stamp = 1; }
    let count = 0;
    for (let x = Math.floor(minX / 16); x <= Math.floor(maxX / 16); x++) {
      const column = this.cells.get(x); if (!column) continue;
      for (let z = Math.floor(minZ / 16); z <= Math.floor(maxZ / 16); z++) for (const id of column.get(z) ?? []) {
        if (this.seen[id] === this.stamp) continue; this.seen[id] = this.stamp; this.candidates[count++] = id;
      }
    }
    return count;
  }
  heightAt(x: number, z: number, referenceY: number): number | undefined {
    const count = this.query(x - .0005, x + .0005, z - .0005, z + .0005), p = this.planes;
    for (let i = 0; i < count; i++) {
      const k = this.candidates[i]! * 18, ax = p[k]!, az = p[k + 2]!, bx = p[k + 3]!, bz = p[k + 5]!, cx = p[k + 6]!, cz = p[k + 8]!;
      const side = (a: number, b: number, c: number, d: number) => (c - a) * (z - b) - (d - b) * (x - a) + .0005 * Math.hypot(c - a, d - b);
      const y = p[k + 10]! * x + p[k + 11]! * z + p[k + 12]!;
      if (side(ax, az, bx, bz) >= 0 && side(bx, bz, cx, cz) >= 0 && side(cx, cz, ax, az) >= 0 && Math.abs(y - referenceY) < .5) return y;
    }
    return undefined;
  }
  projectPaint(source: BufferGeometry): BufferGeometry { return drain(this.projectPaintSteps(source)); }
  *projectPaintSteps(source: BufferGeometry): Generator<void, BufferGeometry> {
    const p = source.getAttribute('position'), index = source.index, sourceCount = index?.count ?? p.count;
    let positions = new Float32Array(Math.max(36, sourceCount * 3)), normals = new Float32Array(positions.length), uv = new Float32Array(positions.length / 3 * 2), at = 0;
    const plane = this.planes, scratchA = new Float64Array(16), scratchB = new Float64Array(16);
    // Equal summed areas alone are insufficient when duplicate/overlapping
    // pavement triangles can compensate for an unowned hole. Only coalesce a
    // disjoint decomposition; ambiguous overlapping inputs keep exact clips.
    const disjoint = (count: number): boolean => {
      for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
        const ka = this.clippedIds[a]!, kb = this.clippedIds[b]!;
        scratchA.set([plane[ka]!, plane[ka + 2]!, plane[ka + 3]!, plane[ka + 5]!, plane[ka + 6]!, plane[ka + 8]!]);
        let input = scratchA, output = scratchB, vertices = 3;
        for (let edge = 0; edge < 3 && vertices; edge++) {
          const start = kb + edge * 3, end = kb + ((edge + 1) % 3) * 3;
          const x = plane[start]!, z = plane[start + 2]!, dx = plane[end]! - x, dz = plane[end + 2]! - z;
          let out = 0;
          for (let v = 0; v < vertices; v++) {
            const next = (v + 1) % vertices, px = input[v * 2]!, pz = input[v * 2 + 1]!, qx = input[next * 2]!, qz = input[next * 2 + 1]!;
            const sp = dx * (pz - z) - dz * (px - x), sq = dx * (qz - z) - dz * (qx - x);
            if (sp >= 0) { output[out++] = px; output[out++] = pz; }
            if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); output[out++] = px + (qx - px) * t; output[out++] = pz + (qz - pz) * t; }
          }
          vertices = out / 2; [input, output] = [output, input];
        }
        for (let v = 1; v + 1 < vertices; v++) if (Math.abs((input[v * 2]! - input[0]!) * (input[(v + 1) * 2 + 1]! - input[1]!) - (input[v * 2 + 1]! - input[1]!) * (input[(v + 1) * 2]! - input[0]!)) > 1e-8) return false;
      }
      return true;
    };
    const emit = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, k: number) => {
      if (at + 9 > positions.length) {
        const capacity = Math.max(at + 9, positions.length * 2), a = new Float32Array(capacity), n = new Float32Array(capacity), u = new Float32Array(capacity / 3 * 2);
        a.set(positions); n.set(normals); u.set(uv); positions = a; normals = n; uv = u;
      }
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) { [bx, cx] = [cx, bx]; [bz, cz] = [cz, bz]; }
      const gx = plane[k + 10]!, gz = plane[k + 11]!, constant = plane[k + 12]!, scale = plane[k + 17]!;
      for (let j = 0; j < 3; j++) {
        const x = j === 0 ? ax : j === 1 ? bx : cx, z = j === 0 ? az : j === 1 ? bz : cz;
        positions[at] = x; positions[at + 1] = gx * x + gz * z + constant + .008; positions[at + 2] = z;
        normals[at] = -gx * scale; normals[at + 1] = scale; normals[at + 2] = -gz * scale;
        uv[at / 3 * 2] = x; uv[at / 3 * 2 + 1] = z; at += 3;
      }
    };
    for (let i = 0; i < sourceCount; i += 3) {
      if (i % 192 === 0) yield;
      const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
      const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a), bx = p.getX(b), by = p.getY(b), bz = p.getZ(b), cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
      const originalArea = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
      if (originalArea < 1e-8) continue;
      const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx), minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
      const count = this.query(minX, maxX, minZ, maxZ), before = at;
      let area = 0, reference = -1, coplanar = true, contained = false, clippedCount = 0;
      this.statistics.inputTriangles++;
      for (let n = 0; n < count; n++) {
        const k = this.candidates[n]! * 18;
        if (plane[k + 13]! > maxX || plane[k + 14]! < minX || plane[k + 15]! > maxZ || plane[k + 16]! < minZ) continue;
        const gx = plane[k + 10]!, gz = plane[k + 11]!, constant = plane[k + 12]!;
        if (Math.abs(gx * ax + gz * az + constant - ay) > .5 || Math.abs(gx * bx + gz * bz + constant - by) > .5 || Math.abs(gx * cx + gz * cz + constant - cy) > .5) continue;
        this.statistics.candidateTests++;
        scratchA.set([ax, az, bx, bz, cx, cz]);
        let input = scratchA, output = scratchB, vertices = 3;
        for (let edge = 0; edge < 3 && vertices; edge++) {
          const start = k + edge * 3, end = k + ((edge + 1) % 3) * 3;
          const x = plane[start]!, z = plane[start + 2]!, dx = plane[end]! - x, dz = plane[end + 2]! - z;
          let out = 0;
          for (let v = 0; v < vertices; v++) {
            const next = (v + 1) % vertices, px = input[v * 2]!, pz = input[v * 2 + 1]!, qx = input[next * 2]!, qz = input[next * 2 + 1]!;
            const sp = dx * (pz - z) - dz * (px - x), sq = dx * (qz - z) - dz * (qx - x);
            if (sp >= 0) { output[out++] = px; output[out++] = pz; }
            if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); output[out++] = px + (qx - px) * t; output[out++] = pz + (qz - pz) * t; }
          }
          vertices = out / 2; [input, output] = [output, input];
        }
        if (vertices < 3) continue;
        let clippedArea = 0;
        for (let v = 1; v + 1 < vertices; v++) clippedArea += Math.abs((input[v * 2]! - input[0]!) * (input[(v + 1) * 2 + 1]! - input[1]!) - (input[v * 2 + 1]! - input[1]!) * (input[(v + 1) * 2]! - input[0]!));
        if (clippedArea < 1e-8) continue;
        this.clippedIds[clippedCount++] = k;
        if (reference < 0) reference = k;
        else if (coplanar) {
          const dx = gx - plane[reference + 10]!, dz = gz - plane[reference + 11]!, dc = constant - plane[reference + 12]!;
          coplanar = Math.max(Math.abs(dx * ax + dz * az + dc), Math.abs(dx * bx + dz * bz + dc), Math.abs(dx * cx + dz * cz + dc)) < 1e-5;
        }
        area += clippedArea;
        for (let v = 1; v + 1 < vertices; v++) emit(input[0]!, input[1]!, input[v * 2]!, input[v * 2 + 1]!, input[(v + 1) * 2]!, input[(v + 1) * 2 + 1]!, k);
        if (Math.abs(clippedArea - originalArea) <= Math.max(1e-9, originalArea * 1e-8)) { at = before; emit(ax, az, bx, bz, cx, cz, k); contained = true; this.statistics.contained++; break; }
      }
      // Exact clipped union area is required: checking only vertices/centre can
      // bridge a concave hole or paint across an unrelated junction's territory.
      if (!contained && reference >= 0 && coplanar && Math.abs(area - originalArea) <= Math.max(1e-8, originalArea * 1e-7) && disjoint(clippedCount)) {
        at = before; emit(ax, az, bx, bz, cx, cz, reference); this.statistics.coplanarUnions++;
      }
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions.slice(0, at), 3)); result.setAttribute('normal', new BufferAttribute(normals.slice(0, at), 3)); result.setAttribute('uv', new BufferAttribute(uv.slice(0, at / 3 * 2), 2));
    result.computeBoundingBox(); result.computeBoundingSphere(); this.statistics.outputTriangles += at / 9;
    return result;
  }
}
