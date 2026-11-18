import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
/** Prepared model proxies only. Authored road/safety geometry never passes
 * through this simplifier. Silhouette extrema, UV seams and normals survive. */
export class WorldLODProxies {
    private readonly cache = new Map<BufferGeometry, BufferGeometry>();
    readonly statistics = { sourceTriangles: 0, proxyTriangles: 0 };
    *geometrySteps(source: BufferGeometry): Generator<void, BufferGeometry> {
        const cached = this.cache.get(source);
        if (cached) {
            return cached;
        }
        const p = source.getAttribute('position');
        source.computeBoundingBox();
        const bounds = source.boundingBox!, extent = bounds.getSize(new Vector3());
        const snapped = new Float32Array(p.count * 3), axis = ['x', 'y', 'z'] as const;
        for (let start = 0; start < p.count; start += 256) {
            for (let i = start; i < Math.min(start + 256, p.count); i++) {
                for (let j = 0; j < 3; j++) {
                    const span = extent[axis[j]!]!, minimum = bounds.min[axis[j]!]!, value = p.getComponent(i, j), bins = Math.max(1, Math.ceil(span / .25));
                    snapped[i * 3 + j] = span ? minimum + Math.round((value - minimum) / span * bins) * span / bins : value;
                }
            }
            yield;
        }
        const count = source.index?.count ?? p.count, vertices: number[] = [], indices: number[] = [], used = new Map<number, number>(), a = new Vector3(), b = new Vector3(), c = new Vector3();
        for (let start = 0; start < count; start += 384) {
            for (let i = start; i < Math.min(start + 384, count); i += 3) {
                const ids = [source.index?.getX(i) ?? i, source.index?.getX(i + 1) ?? i + 1, source.index?.getX(i + 2) ?? i + 2];
                a.fromArray(snapped, ids[0]! * 3);
                b.fromArray(snapped, ids[1]! * 3).sub(a);
                c.fromArray(snapped, ids[2]! * 3).sub(a);
                if (b.cross(c).lengthSq() < 1e-12) {
                    continue;
                }
                for (const id of ids) {
                    let at = used.get(id);
                    if (at === undefined) {
                        at = vertices.length;
                        used.set(id, at);
                        vertices.push(id);
                    }
                    indices.push(at);
                }
            }
            yield;
        }
        const result = new BufferGeometry();
        let complete = false;
        try {
            for (const [name, attribute] of Object.entries(source.attributes)) {
                const array = new (attribute.array.constructor as {
                    new (length: number): typeof attribute.array;
                })(vertices.length * attribute.itemSize);
                for (let start = 0; start < vertices.length; start += 256) {
                    for (let i = start; i < Math.min(start + 256, vertices.length); i++) {
                        for (let j = 0; j < attribute.itemSize; j++) {
                            array[i * attribute.itemSize + j] = name === 'position' ? snapped[vertices[i]! * 3 + j]! : attribute.array[vertices[i]! * attribute.itemSize + j]!;
                        }
                    }
                    yield;
                }
                result.setAttribute(name, new BufferAttribute(array, attribute.itemSize, attribute.normalized));
            }
            result.setIndex(indices);
            result.computeBoundingBox();
            result.computeBoundingSphere();
            this.cache.set(source, result);
            this.statistics.sourceTriangles += count / 3;
            this.statistics.proxyTriangles += indices.length / 3;
            complete = true;
            return result;
        }
        finally {
            if (!complete) {
                result.dispose();
            }
        }
    }
    dispose(): void {
        for (const geometry of this.cache.values()) {
            geometry.dispose();
        }
        this.cache.clear();
    }
}
