import type { CityMapData } from './CityMapData';
import type { SweepFrame } from './ContinuousRoadGeometry';
import type { PavementTriangleIndex } from './PavementProjection';
import type { VisualGeometryData } from './VisualStreamingData';
import { invalidateRoadEdgeChains } from './RoadEdgeChain';
import { invalidateRoadClearance } from './RoadClearance';
import { invalidateRoadCarriageways } from './RoadCarriageway';
import { drain } from '../../loading/Loading';

/** A compile scope is an immutable map snapshot. Fingerprint actual values at the
 * scope boundary, including neighbours/links, not only map.version or object ID.
 * Runtime snapshots are immutable; an editor starts a fresh builder after edits.
 * This never scans map data during a frame or a geometry-cache lookup. */
export function roadGeometryRevision(map: CityMapData): string {
  return drain(roadGeometryRevisionSteps(map));
}

function* roadGeometryRevisionSteps(map: CityMapData): Generator<void, string> {
  let a = 2166136261, b = 2246822519;
  const number = new DataView(new ArrayBuffer(8));
  const byte = (v: number) => { a = Math.imul(a ^ v, 16777619); b = Math.imul(b ^ v, 3266489917); };
  const value = (v: unknown): void => {
    if (typeof v === 'number') { byte(1); number.setFloat64(0, v); for (let i = 0; i < 8; i++) byte(number.getUint8(i)); }
    else if (typeof v === 'string') { byte(2); for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); byte(c & 255); byte(c >>> 8); } byte(0); }
    else if (typeof v === 'boolean') byte(v ? 3 : 4);
    else if (Array.isArray(v)) { byte(5); for (const child of v) value(child); byte(6); }
    else if (v && typeof v === 'object') { byte(7); for (const key of Object.keys(v)) { value(key); value((v as Record<string, unknown>)[key]); } byte(8); }
    else byte(9);
  };
  // Keep the same byte stream as hashing the whole tuple synchronously.
  byte(5);
  for (const field of [map.version, map.sectorSize, map.bounds, map.roads, map.intersections, map.roadLinks, map.objects, map.environment, map.regional]) {
    if (Array.isArray(field)) {
      byte(5);
      for (const item of field) { value(item); yield; }
      byte(6);
    } else {
      value(field);
      yield;
    }
  }
  byte(6);
  return 'continuous-v5:' + (a >>> 0).toString(16) + (b >>> 0).toString(16);
}
export interface RoadGeometryCacheEntry { frames?: SweepFrame[]; pavement?: VisualGeometryData; index?: PavementTriangleIndex; bytes: number }
export class RoadGeometryCompilationCache {
  private readonly entries = new Map<string, RoadGeometryCacheEntry>();
  private bytes = 0;
  readonly statistics = { hits: 0, misses: 0, evictions: 0, peakBytes: 0 };
  constructor(readonly revision: string, readonly maxBytes = 8 * 1024 * 1024, readonly maxEntries = 32) {}
  entry(key: string): RoadGeometryCacheEntry {
    let entry = this.entries.get(key);
    if (entry) { this.statistics.hits++; this.entries.delete(key); }
    else { this.statistics.misses++; entry = { bytes: 0 }; }
    this.entries.set(key, entry); return entry;
  }
  account(key: string): void {
    const entry = this.entries.get(key); if (!entry) return;
    this.bytes -= entry.bytes;
    const p = entry.pavement;
    entry.bytes = (entry.frames?.length ?? 0) * 160 + (entry.index?.byteLength ?? 0) + (p ? p.position.byteLength + p.normal.byteLength + (p.uv?.byteLength ?? 0) + (p.index?.byteLength ?? 0) : 0);
    this.bytes += entry.bytes;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const key = this.entries.keys().next().value!; this.bytes -= this.entries.get(key)!.bytes; this.entries.delete(key); this.statistics.evictions++;
    }
    this.statistics.peakBytes = Math.max(this.statistics.peakBytes, this.bytes);
  }
  get state() { return { ...this.statistics, bytes: this.bytes, entries: this.entries.size, maxBytes: this.maxBytes, maxEntries: this.maxEntries, revision: this.revision }; }
}
const caches = new WeakMap<CityMapData, RoadGeometryCompilationCache>();
const immutableRevisions = new WeakMap<CityMapData,string>();
/** A content-addressed runtime resource can seal its geometry once, outside frame
 * work. Frozen inputs cannot change under a cached plane. Mutable editor maps use
 * the actual-value fingerprint instead; a caller-supplied version alone is never
 * enough to bypass validation. */
export function registerImmutableRoadGeometry(map:CityMapData,contentRevision:string):void {
  if(immutableRevisions.get(map)===contentRevision)return;
  const seen=new WeakSet<object>();
  const seal=(value:unknown):void=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);if(Array.isArray(value)){for(const child of value)seal(child);}else for(const key of Object.keys(value))seal((value as Record<string,unknown>)[key]);Object.freeze(value);};
  seal(map);immutableRevisions.set(map,contentRevision);
}
/** Development spawn overrides share exactly the immutable geometry inputs, not
 * a shortened road list or altered terrain. A changed dependency is rejected. */
export function registerImmutableRoadGeometryView(source:CityMapData,view:CityMapData):void{
  const revision=immutableRevisions.get(source);if(!revision)throw new Error('Source geometry is not sealed');
  for(const key of ['roads','intersections','roadLinks','objects','regional','bounds','sectorSize','version'] as const)if(source[key]!==view[key])throw new Error('Changed immutable geometry dependency '+key);
  for(const key of Object.keys(source.environment))if(key!=='spawnPoints'&&(source.environment as unknown as Record<string,unknown>)[key]!== (view.environment as unknown as Record<string,unknown>)[key])throw new Error('Changed environment geometry dependency '+key);
  Object.freeze(view.environment.spawnPoints);Object.freeze(view.environment);Object.freeze(view);immutableRevisions.set(view,revision);
}
export function roadGeometryCompilationCache(map: CityMapData): RoadGeometryCompilationCache {
  return drain(roadGeometryCompilationCacheSteps(map));
}

export function* roadGeometryCompilationCacheSteps(map: CityMapData): Generator<void, RoadGeometryCompilationCache> {
  const revision = immutableRevisions.get(map) ?? (yield* roadGeometryRevisionSteps(map));
  const previous = caches.get(map);
  if (previous?.revision === revision) return previous;
  invalidateRoadEdgeChains(map); invalidateRoadClearance(map); invalidateRoadCarriageways(map);
  const cache = new RoadGeometryCompilationCache(revision); caches.set(map, cache); return cache;
}
