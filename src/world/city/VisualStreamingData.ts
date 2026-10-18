import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
export interface VisualGeometryData {
  position: Float32Array; normal: Float32Array; uv?: Float32Array; color?: Float32Array;
  index?: Uint32Array; bounds: number[]; sphere: number[];
}
export interface CompiledRoadVisual {
  id: string;
  surfaces: { key: string; material: string; geometry: VisualGeometryData; barrierTriangles: number }[];
  instances: { key: string; material: string; geometryId: string; geometry?: VisualGeometryData; matrices: Float32Array; lamp: boolean }[];
}
export interface TerrainVisualData { key: string; tier: 'near' | 'mid' | 'far'; geometries: VisualGeometryData[]; roadSurface?: VisualGeometryData }
export type VisualWorkerRequest = { kind: 'init'; map: import('./CityMapData').CityMapData }
  | { kind: 'road'; id: string } | { kind: 'terrain'; key: string; tier: 'near' | 'mid' | 'far'; roadIds?: string[] }
  | { kind: 'background'; keys: string[] };
export type VisualWorkerReply = ({ kind: 'ready' } | { kind: 'road'; data: CompiledRoadVisual }
  | { kind: 'terrain'; data: TerrainVisualData } | { kind: 'background'; data: TerrainVisualData[] } | { kind: 'error'; message: string }) & { cpuMs?: number };

export function exportVisualGeometry(g: BufferGeometry): VisualGeometryData {
  g.computeBoundingBox(); g.computeBoundingSphere();
  const copy = (name: string) => g.getAttribute(name) ? new Float32Array(g.getAttribute(name).array) : undefined;
  const box = g.boundingBox!, sphere = g.boundingSphere!;
  return { position: copy('position')!, normal: copy('normal')!, uv: copy('uv'), color: copy('color'),
    index: g.index ? new Uint32Array(g.index.array) : undefined,
    bounds: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z],
    sphere: [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius] };
}
export function importVisualGeometry(d: VisualGeometryData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(d.position, 3)); g.setAttribute('normal', new BufferAttribute(d.normal, 3));
  if (d.uv) g.setAttribute('uv', new BufferAttribute(d.uv, 2));
  if (d.color) g.setAttribute('color', new BufferAttribute(d.color, 3));
  if (d.index) g.setIndex(new BufferAttribute(d.index, 1));
  g.boundingBox = new Box3(new Vector3(d.bounds[0], d.bounds[1], d.bounds[2]), new Vector3(d.bounds[3], d.bounds[4], d.bounds[5]));
  g.boundingSphere = new Sphere(new Vector3(d.sphere[0], d.sphere[1], d.sphere[2]), d.sphere[3]);
  return g;
}
export function visualTransfers(data: CompiledRoadVisual | TerrainVisualData): Transferable[] {
  const result: Transferable[] = [];
  const add = (g: VisualGeometryData) => { for (const a of [g.position, g.normal, g.uv, g.color, g.index]) if (a) result.push(a.buffer as ArrayBuffer); };
  if ('surfaces' in data) {
    for (const p of data.surfaces) add(p.geometry);
    for (const p of data.instances) { if (p.geometry) add(p.geometry); result.push(p.matrices.buffer as ArrayBuffer); }
  } else { for (const g of data.geometries) add(g); if (data.roadSurface) add(data.roadSurface); }
  return result;
}
