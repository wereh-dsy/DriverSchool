import { BufferGeometry } from 'three';
interface Data { schema: string; views: Uint8Array[]; bytes: number }
interface Entry { key: string; geometry: BufferGeometry; references: number; bytes: number; buffers: number }
/** Include layout and each interleaved backing array exactly once. */
function describe(geometry: BufferGeometry): Data {
  const views: Uint8Array[] = [], ids = new Map<unknown, number>();
  let schema = geometry.drawRange.start + ':' + geometry.drawRange.count + '|', bytes = 0;
  for (const [name, attribute] of [...Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b)), ...geometry.index ? [['index', geometry.index] as const] : []]) {
    const interleaved = 'isInterleavedBufferAttribute' in attribute ? attribute : undefined;
    const array = attribute.array;
    let id = ids.get(array);
    if (id === undefined) {
      id = views.length; ids.set(array, id);
      views.push(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)); bytes += array.byteLength;
      schema += array.constructor.name + ':' + array.length + '|';
    }
    schema += [name, attribute.itemSize, attribute.normalized, id, interleaved?.offset ?? 0, interleaved?.data.stride ?? attribute.itemSize].join(':') + '|';
  }
  for (const group of geometry.groups) schema += [group.start, group.count, group.materialIndex].join(':') + '|';
  return { schema, views, bytes };
}
/** Whole immutable geometries share GPU ownership; partial attribute disposal
 * must never invalidate a buffer still used by a different geometry. */
export class WorldRenderResources {
  private readonly entries = new Map<string, Entry>();
  private owners = new WeakMap<BufferGeometry, Entry>();
  private readonly idle = new Map<Entry, true>();
  private bytes = 0;
  private idleBytes = 0;
  private buffers = 0;
  constructor(readonly idleBudgetBytes = 12 * 1024 * 1024) {}
  readonly statistics = { hits: 0, misses: 0, releases: 0, evictions: 0 };
  *acquireSteps(geometry: BufferGeometry): Generator<void, BufferGeometry> {
    const owned = this.owners.get(geometry);
    if (owned) { this.retain(owned); this.statistics.hits++; return geometry; }
    const data = describe(geometry);
    let a = 2166136261, b = 5381;
    for (const bytes of data.views) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), words = bytes.length & ~3;
      for (let start = 0; start < words; start += 16384) {
        for (let i = start; i < Math.min(words, start + 16384); i += 4) { const word = view.getUint32(i, true); a = Math.imul(a ^ word, 16777619); b = Math.imul(b, 33) ^ word; }
        yield;
      }
      for (let i = words; i < bytes.length; i++) { a = Math.imul(a ^ bytes[i]!, 16777619); b = Math.imul(b, 33) ^ bytes[i]!; }
    }
    let key = data.schema + (a >>> 0) + ':' + (b >>> 0), entry = this.entries.get(key);
    if (entry) {
      // Comparison yields across frames. Borrow the candidate until it either
      // becomes the returned lease or is released by mismatch/cancellation.
      const candidateEntry = entry;
      this.retain(candidateEntry);
      let adopted = false;
      try {
      const candidate = describe(entry.geometry);
      let equal = true;
      for (let n = 0; n < data.views.length && equal; n++) {
        const x = data.views[n]!, y = candidate.views[n]!, words = x.length & ~3;
        const left = new DataView(x.buffer, x.byteOffset, x.byteLength), right = new DataView(y.buffer, y.byteOffset, y.byteLength);
        for (let start = 0; start < words && equal; start += 16384) {
          for (let i = start; i < Math.min(words, start + 16384); i += 4) if (left.getUint32(i, true) !== right.getUint32(i, true)) { equal = false; break; }
          yield;
        }
        for (let i = words; i < x.length && equal; i++) equal = x[i] === y[i];
      }
      if (equal) { adopted = true; this.statistics.hits++; geometry.dispose(); return candidateEntry.geometry; }
      key += ':collision:' + geometry.uuid; entry = undefined;
      } finally {
        if (!adopted) this.release(candidateEntry.geometry);
      }
    }
    entry = { key, geometry, references: 1, bytes: data.bytes, buffers: data.views.length };
    this.entries.set(key, entry); this.owners.set(geometry, entry);
    this.bytes += entry.bytes; this.buffers += entry.buffers; this.statistics.misses++;
    return geometry;
  }
  private retain(entry: Entry): void {
    if (!entry.references) { this.idleBytes -= entry.bytes; this.idle.delete(entry); }
    entry.references++;
  }
  release(geometry: BufferGeometry): void {
    const entry = this.owners.get(geometry);
    if (entry && entry.references > 0 && !--entry.references) { this.idleBytes += entry.bytes; this.idle.set(entry, true); this.statistics.releases++; }
  }
  get underPressure(): boolean { return this.idleBytes > this.idleBudgetBytes; }
  releaseExpired(deadline: number): void {
    let released = 0;
    while (this.underPressure && released++ < 4 && performance.now() < deadline) {
      const entry = this.idle.keys().next().value!;
      this.idle.delete(entry); this.entries.delete(entry.key); this.owners.delete(entry.geometry);
      this.idleBytes -= entry.bytes; this.bytes -= entry.bytes; this.buffers -= entry.buffers;
      entry.geometry.dispose(); this.statistics.evictions++;
    }
  }
  get state() { return { ...this.statistics, entries: this.entries.size, buffers: this.buffers, bytes: this.bytes, idleBytes: this.idleBytes, idleBudgetBytes: this.idleBudgetBytes }; }
  dispose(): void {
    for (const entry of this.entries.values()) entry.geometry.dispose();
    this.entries.clear(); this.idle.clear(); this.owners = new WeakMap(); this.bytes = this.idleBytes = this.buffers = 0;
  }
}
