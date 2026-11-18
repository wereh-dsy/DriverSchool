import { BufferGeometry } from 'three';
interface Entry {
    geometry: BufferGeometry;
    references: number;
    bytes: number;
}
/** Immutable GPU leases; materials/textures stay borrowed from their existing
 * owners so weather uniforms and display contents have one source of truth. */
export class WorldRenderResources {
    private readonly entries = new Map<string, Entry>();
    private readonly owners = new WeakMap<BufferGeometry, Entry>();
    private bytes = 0;
    private idleBytes = 0;
    private cursor?: MapIterator<[
        string,
        Entry
    ]>;
    readonly idleBudgetBytes = 12 * 1024 * 1024;
    readonly statistics = { hits: 0, misses: 0, releases: 0, evictions: 0 };
    *acquireSteps(geometry: BufferGeometry): Generator<void, BufferGeometry> {
        let a = 2166136261, b = 5381, bytes = 0, key = '';
        const arrays = [...Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, v]) => ({ name: name + ':' + v.itemSize + ':' + v.normalized, array: v.array })), ...geometry.index ? [{ name: 'index', array: geometry.index.array }] : []];
        for (const { name, array } of arrays) {
            key += name + ':' + array.constructor.name + ':' + array.length + '|';
            bytes += array.byteLength;
            const data = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
            for (let start = 0; start < data.length; start += 16384) {
                for (let i = start; i < Math.min(start + 16384, data.length); i++) {
                    a = Math.imul(a ^ data[i]!, 16777619);
                    b = Math.imul(b, 33) ^ data[i]!;
                }
                yield;
            }
        }
        key += (a >>> 0) + ':' + (b >>> 0);
        let entry = this.entries.get(key);
        // Hashes only select a candidate. Exact comparison prevents collisions.
        if (entry) {
            const candidate = [...Object.entries(entry.geometry.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v.array), ...entry.geometry.index ? [entry.geometry.index.array] : []];
            let same = true;
            for (let n = 0; n < arrays.length && same; n++) {
                const source = arrays[n]!.array, target = candidate[n]!, x = new Uint8Array(source.buffer, source.byteOffset, source.byteLength), y = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
                for (let start = 0; start < x.length && same; start += 16384) {
                    for (let i = start; i < Math.min(start + 16384, x.length); i++) {
                        if (x[i] !== y[i]) {
                            same = false;
                            break;
                        }
                    }
                    yield;
                }
            }
            if (!same) {
                key += ':collision:' + geometry.uuid;
                entry = undefined;
            }
        }
        if (entry) {
            if (!entry.references) {
                this.idleBytes -= entry.bytes;
            }
            entry.references++;
            this.statistics.hits++;
            geometry.dispose();
            return entry.geometry;
        }
        entry = { geometry, references: 1, bytes };
        this.entries.set(key, entry);
        this.owners.set(geometry, entry);
        this.bytes += bytes;
        this.statistics.misses++;
        return geometry;
    }
    release(geometry: BufferGeometry): void {
        const entry = this.owners.get(geometry);
        if (entry && entry.references > 0 && !--entry.references) {
            this.idleBytes += entry.bytes;
            this.statistics.releases++;
        }
    }
    get underPressure(): boolean {
        return this.idleBytes > this.idleBudgetBytes;
    }
    releaseExpired(deadline: number): void {
        let count = 0, scanned = 0;
        this.cursor ??= this.entries.entries();
        while (this.underPressure && count < 4 && scanned++ < 16 && performance.now() < deadline) {
            const next = this.cursor.next();
            if (next.done) {
                this.cursor = undefined;
                break;
            }
            const [key, entry] = next.value;
            if (entry.references) {
                continue;
            }
            this.entries.delete(key);
            this.owners.delete(entry.geometry);
            this.idleBytes -= entry.bytes;
            this.bytes -= entry.bytes;
            entry.geometry.dispose();
            this.statistics.evictions++;
            count++;
        }
    }
    get state() {
        return { ...this.statistics, entries: this.entries.size, bytes: this.bytes, idleBytes: this.idleBytes, idleBudgetBytes: this.idleBudgetBytes };
    }
    dispose(): void {
        for (const entry of this.entries.values()) {
            entry.geometry.dispose();
        }
        this.entries.clear();
        this.cursor = undefined;
        this.bytes = this.idleBytes = 0;
    }
}
