import { BufferAttribute, BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from 'three';
import type { CityPoint } from './CityMapData';
import { sampleRibbonPolyline } from '../subject3/geometry';

/** Load-time geometry only. Offsets use the existing horizontal miter; elevation
 * remains authored Y. A full XYZ tangent/normal is supplied for module placement.
 * Vertical structures follow gravity rather than tilting into a graded lane. */
export interface SweepFrame {
  point: Vector3;
  right: Vector3;
  tangent: Vector3;
  normal: Vector3;
  station: number;
}
export interface SweepProfilePoint { offset: number; height: number }
export const ROAD_GEOMETRY_BUDGET = {
  maximumStructureSpacing: 4,
  postSpacing: 4,
  markingClearance: .008,
  maxTrianglesRatio: 2.5,
  maxBufferRatio: 2.5,
  maxExtraSectorDraws: 4,
  maxAddedGenerationMs: 150,
  maxGenerationRatio: 2,
} as const;

/** Keep exact bend vertices and interpolate XYZ, never re-smooth authored roads. */
export function sweepFrames(points: readonly CityPoint[], spacing: number = ROAD_GEOMETRY_BUDGET.maximumStructureSpacing): SweepFrame[] {
  if (points.length < 2) throw new Error('A road sweep needs at least two points');
  const samples = sampleRibbonPolyline(points, spacing);
  let station = 0;
  return samples.map((sample, i) => {
    const p = sample.point, a = samples[Math.max(0, i - 1)]!.point, b = samples[Math.min(samples.length - 1, i + 1)]!.point;
    const tangent = new Vector3(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z).normalize();
    const right = new Vector3(-sample.tangent.z, 0, sample.tangent.x);
    const normal = new Vector3().crossVectors(right, tangent).normalize();
    if (i) {
      const previous = samples[i - 1]!.point;
      station += Math.hypot(p.x - previous.x, (p.y ?? 0) - (previous.y ?? 0), p.z - previous.z);
    }
    return { point: new Vector3(p.x, p.y ?? 0, p.z), right, tangent, normal, station };
  });
}

function geometry(positions: number[] | Float32Array, uv: number[] | Float32Array, indices?: number[] | Uint32Array | Uint16Array): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', positions instanceof Float32Array?new BufferAttribute(positions,3):new Float32BufferAttribute(positions, 3));
  result.setAttribute('uv', uv instanceof Float32Array?new BufferAttribute(uv,2):new Float32BufferAttribute(uv, 2));
  if (indices) result.setIndex(Array.isArray(indices)?indices:new BufferAttribute(indices,1));
  result.computeVertexNormals(); result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

/** One indexed ribbon. Width and bank may vary at every station. The map adapter
 * supplies its authoritative edge pairs, so the experiment never changes contact
 * planes, centreline Y, navigation or cross-section data. */
export function continuousRibbon(left: readonly CityPoint[], right: readonly CityPoint[], height = .024): BufferGeometry {
  if (left.length !== right.length || left.length < 2) throw new Error('Mismatched road boundaries');
  const positions = new Float32Array(left.length*6), uv = new Float32Array(left.length*4), indices = left.length*2>65535?new Uint32Array((left.length-1)*6):new Uint16Array((left.length-1)*6);
  let station = 0;
  for (let i = 0; i < left.length; i++) {
    const a = left[i]!, b = right[i]!;
    if (i) { const p = left[i - 1]!; station += Math.hypot(a.x - p.x, (a.y ?? 0) - (p.y ?? 0), a.z - p.z); }
    positions.set([a.x, (a.y ?? 0) + height, a.z, b.x, (b.y ?? 0) + height, b.z],i*6);
    uv.set([0, station, Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z), station],i*4);
    if (i + 1 < left.length) { const k = i * 2; indices.set([k, k + 1, k + 2, k + 1, k + 3, k + 2],i*6); }
  }
  return geometry(positions, uv, indices);
}

/** Continuous closed cross-section, with hard profile corners and shared
 * longitudinal vertices. No Mesh per station and no scaled straight boxes at bends.
 * Profile winding is normalized; omitFaces can leave an asphalt-covered deck open.
 */
export function sweepSolid(frames: readonly SweepFrame[], profileAt: (frame: SweepFrame) => SweepProfilePoint[],
  options: { caps?: boolean; capStart?:boolean;capEnd?:boolean; omitFaces?: readonly number[] } = {}): BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  let profiles = frames.map(profileAt);
  if (!profiles.length) return geometry([], [], []);
  const count = profiles[0]!.length;
  if (profiles.some(p => p.length !== count) || count < 3) throw new Error('Inconsistent sweep profile');
  const area = profiles[0]!.reduce((sum, p, i, a) => { const q = a[(i + 1) % a.length]!; return sum + p.offset * q.height - q.offset * p.height; }, 0);
  if (area < 0) profiles = profiles.map(p => [...p].reverse());
  const at = (i: number, p: SweepProfilePoint) => {
    const f = frames[i]!;
    return [f.point.x + f.right.x * p.offset, f.point.y + p.height, f.point.z + f.right.z * p.offset];
  };
  for (let side = 0; side < count; side++) {
    if (options.omitFaces?.includes(side)) continue;
    const base = positions.length / 3;
    for (let i = 0; i < frames.length; i++) {
      positions.push(...at(i, profiles[i]![side]!), ...at(i, profiles[i]![(side + 1) % count]!));
      uv.push(0, frames[i]!.station, 1, frames[i]!.station);
      if (i + 1 < frames.length) { const k = base + i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
  }
  if (options.caps !== false) for (const end of [0, frames.length - 1]) {
    if(end===0&&options.capStart===false||end===frames.length-1&&options.capEnd===false)continue;
    const profile = profiles[end]!, base = positions.length / 3;
    for (const p of profile) { positions.push(...at(end, p)); uv.push(p.offset, p.height); }
    for (const face of ShapeUtils.triangulateShape(profile.map(p => new Vector2(p.offset, p.height)), [])) {
      const [a, b, c] = face as [number, number, number];
      indices.push(base + a, base + (end === 0 ? b : c), base + (end === 0 ? c : b));
    }
  }
  return geometry(positions, uv, indices);
}

/** Turn the final clipped surface into one solid. Boundary counting closes curb
 * ends at junction cuts too; internal triangle edges never produce duplicate walls.
 * The supplied top is consumed. Hard rim normals stay separate from the top. */
export function solidifySurface(top: BufferGeometry, thickness: number,options:{omitTop?:boolean;skipBoundary?:(a:readonly number[],b:readonly number[])=>boolean}={}): BufferGeometry {
  const p = top.getAttribute('position'), tex = top.getAttribute('uv'), index = top.index;
  const positions: number[] = [], uv: number[] = [];
  type Vertex = [number, number, number];
  const boundaries = new Map<string, { a: Vertex; b: Vertex; count: number }>();
  const key = (v: Vertex) => v.map(n => Math.round(n * 10000)).join(',');
  const emit = (vertices: Vertex[]) => { for (const v of vertices) { positions.push(...v); uv.push(v[0], v[2]); } };
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const vertices: Vertex[] = [];
    for (let k = 0; k < 3; k++) {
      const n = index ? index.getX(i + k) : i + k;
      vertices.push([p.getX(n), p.getY(n), p.getZ(n)]);
      if(!options.omitTop){positions.push(p.getX(n), p.getY(n), p.getZ(n)); uv.push(tex?.getX(n) ?? 0, tex?.getY(n) ?? 0);}
    }
    emit([...vertices].reverse().map(v => [v[0], v[1] - thickness, v[2]]));
    for (let k = 0; k < 3; k++) {
      const a = vertices[k]!, b = vertices[(k + 1) % 3]!, ka = key(a), kb = key(b), id = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const edge = boundaries.get(id);
      if (edge) edge.count++; else boundaries.set(id, { a, b, count: 1 });
    }
  }
  for (const { a, b, count } of boundaries.values()) if (count === 1) {
    if(options.skipBoundary?.(a,b))continue;
    const c: Vertex = [a[0], a[1] - thickness, a[2]], d: Vertex = [b[0], b[1] - thickness, b[2]];
    emit([a, c, b, b, c, d]);
  }
  top.dispose();
  return geometry(positions, uv);
}

export { PavementTriangleIndex } from './PavementProjection';

/** Exact Float32 attribute indexing, not positional welding. All XYZ, hard
 * normals, UVs and triangle order survive; work yields before Worker publication. */
export function* indexRoadGeometrySteps(source:BufferGeometry):Generator<void,BufferGeometry>{
  if(source.index||Object.keys(source.attributes).some(k=>!['position','normal','uv'].includes(k)))return source;
  const position=source.getAttribute('position'),normal=source.getAttribute('normal'),uv=source.getAttribute('uv');
  if(!normal||!uv||position.count<12)return source;
  const count=position.count,p=new Float32Array(count*3),n=new Float32Array(count*3),u=new Float32Array(count*2),indices=new Uint32Array(count);
  const sp=position.array as Float32Array,sn=normal.array as Float32Array,su=uv.array as Float32Array;
  const bits=(a:Float32Array)=>new Uint32Array(a.buffer,a.byteOffset,a.length),pb=bits(p),nb=bits(n),ub=bits(u),sbp=bits(sp),sbn=bits(sn),sbu=bits(su);
  let capacity=16;while(capacity<count*2)capacity*=2;const table=new Uint32Array(capacity),mask=capacity-1;let used=0;
  for(let i=0;i<count;i++){
    if(i%2048===0)yield;
    const a=i*3,b=i*2;let hash=2166136261;for(let k=0;k<3;k++){hash=Math.imul(hash^sbp[a+k]!,16777619);hash=Math.imul(hash^sbn[a+k]!,16777619);}for(let k=0;k<2;k++)hash=Math.imul(hash^sbu[b+k]!,16777619);
    let slot=hash&mask;
    for(;;){const value=table[slot]!;
      if(!value){const c=used*3,d=used*2;p.set(sp.subarray(a,a+3),c);n.set(sn.subarray(a,a+3),c);u.set(su.subarray(b,b+2),d);indices[i]=used;table[slot]=++used;break;}
      const candidate=value-1,c=candidate*3,d=candidate*2;
      if(pb[c]===sbp[a]&&pb[c+1]===sbp[a+1]&&pb[c+2]===sbp[a+2]&&nb[c]===sbn[a]&&nb[c+1]===sbn[a+1]&&nb[c+2]===sbn[a+2]&&ub[d]===sbu[b]&&ub[d+1]===sbu[b+1]){indices[i]=candidate;break;}slot=(slot+1)&mask;
    }
  }
  if(used*32+indices.byteLength>=count*32)return source;
  const result=new BufferGeometry();result.setAttribute('position',new BufferAttribute(p.slice(0,used*3),3));result.setAttribute('normal',new BufferAttribute(n.slice(0,used*3),3));result.setAttribute('uv',new BufferAttribute(u.slice(0,used*2),2));result.setIndex(new BufferAttribute(indices,1));source.dispose();return result;
}
