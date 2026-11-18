import { BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix3, Matrix4, Mesh, Object3D, Vector3, type Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WorldRenderResources } from './WorldRenderResources';
import { canPackGeometry, packStaticGeometrySteps } from './StaticGeometryPacking';
interface Part {
    mesh: Mesh;
    transform: Matrix4;
    critical: boolean;
    origin: Vector3;
    key: string;
    owner?: Mesh;
}
const MAX_VERTICES = 65536, MAX_INSTANCES = 2048;
/** Compact a reusable model once, before instancing it in any sector. Keep
 * structural metadata in the key (facades, labels, emissive lamp parts). */
export function* staticTemplateSteps(source: Group): Generator<void, Group> {
    source.updateMatrixWorld(true);
    const root = new Group(), groups = new Map<string, Mesh[]>();
    source.traverse(object => {
        if (object instanceof Mesh && Array.isArray(object.material)) {
            const mesh = object.clone();
            mesh.geometry = object.geometry.clone();
            object.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
            root.add(mesh);
        }
        else if (object instanceof Mesh) {
            const attributes = Object.entries((object.geometry as BufferGeometry).attributes).map(([name, a]) => name + ':' + a.itemSize).sort().join(',');
            const lampAnchor = object.userData.environmentLamp ? object.matrixWorld.elements.slice(12, 15).join(',') : '';
            const key = [object.material.uuid, object.material.transparent ? object.uuid : 'opaque', attributes, !!object.geometry.index, JSON.stringify(object.userData), lampAnchor, object.layers.mask, object.renderOrder, object.castShadow, object.receiveShadow, object.visible].join('|');
            const list = groups.get(key) ?? [];
            list.push(object);
            groups.set(key, list);
        }
    });
    let completed = false;
    try {
        for (const meshes of groups.values()) {
            const originals: BufferGeometry[] = [];
            // Keep the original model-part frame: facade variants replace a
            // part's geometry, and lamp sampling reads its instance transform.
            const anchor = meshes[0]!.matrixWorld.clone(), inverseAnchor = anchor.clone().invert();
            try {
                for (const mesh of meshes) {
                    originals.push(mesh.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverseAnchor, mesh.matrixWorld)));
                    yield;
                }
                let geometry = originals.length === 1 ? originals.pop()! : mergeGeometries(originals);
                if (!geometry) {
                    throw Error('Incompatible world template');
                }
                if (canPackGeometry(geometry)) {
                    const packed = yield* packStaticGeometrySteps([{ geometry, transform: new Matrix4() }]);
                    geometry.dispose(); geometry = packed;
                }
                const first = meshes[0]!, mesh = new Mesh(geometry, first.material);
                mesh.userData = { ...first.userData };
                mesh.name = first.name;
                mesh.layers.mask = first.layers.mask;
                mesh.renderOrder = first.renderOrder;
                mesh.castShadow = first.castShadow;
                mesh.receiveShadow = first.receiveShadow;
                mesh.visible = first.visible;
                mesh.matrix.copy(anchor);
                mesh.matrixAutoUpdate = false;
                root.add(mesh);
            }
            finally {
                for (const geometry of originals) {
                    geometry.dispose();
                }
            }
        }
        completed = true;
        return root;
    }
    finally {
        if (!completed) {
            root.traverse(o => {
                if (o instanceof Mesh) {
                    o.geometry.dispose();
                }
            });
        }
    }
}
/** Publication-time, spatially bounded batches. Dynamic signals, transparent
 * surfaces and custom callbacks remain independent. Cancellation is transactional. */
export class StaticBatchBuilder {
    readonly statistics = { sources: 0, batches: 0, instances: 0, vertices: 0 };
    constructor(private readonly resources: WorldRenderResources, readonly cellSize = 500) {
    }
    private compatible(mesh: Mesh): boolean {
        if (mesh.userData.environmentLamp && !(mesh instanceof InstancedMesh)) {
            return false;
        }
        return (mesh.geometry.getAttribute('position')?.count ?? 0) > 0 && !Array.isArray(mesh.material) && !mesh.material.transparent && !(mesh.material as Material & {
            isShaderMaterial?: boolean;
        }).isShaderMaterial && mesh.frustumCulled && !mesh.userData.worldDynamic && !mesh.customDepthMaterial && !mesh.customDistanceMaterial && !(mesh as Mesh & {
            isSkinnedMesh?: boolean;
        }).isSkinnedMesh && !mesh.morphTargetInfluences && mesh.onBeforeRender === Object3D.prototype.onBeforeRender && mesh.onAfterRender === Object3D.prototype.onAfterRender && mesh.geometry.drawRange.start === 0 && mesh.geometry.drawRange.count === Infinity && Object.values(mesh.geometry.attributes).every(a => (mesh instanceof InstancedMesh || !('isInterleavedBufferAttribute' in a)) && !('isInstancedBufferAttribute' in a)) && ['position', 'normal'].every(name => !mesh.geometry.getAttribute(name) || mesh.geometry.getAttribute(name).array instanceof Float32Array || mesh.geometry.getAttribute(name).array instanceof Float64Array) && !Object.keys(mesh.geometry.morphAttributes).length;
    }
    *buildSteps(root: Group): Generator<void> {
        root.updateMatrixWorld(true);
        const inverse = new Matrix4().copy(root.matrixWorld).invert(), parts: Part[] = [], stack = [{ object: root as Object3D, dynamic: false, critical: !!root.userData.roadCritical }];
        while (stack.length) {
            const { object, dynamic, critical } = stack.pop()!, live = dynamic || !object.visible || object.userData.worldDynamic === true, road = critical || object.userData.roadCritical === true;
            if (!live && object instanceof Mesh && this.compatible(object)) {
                const transform = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
                if (object instanceof InstancedMesh) {
                    if (!object.boundingSphere) {
                        object.computeBoundingSphere();
                    }
                }
                else if (!object.geometry.boundingSphere) {
                    object.geometry.computeBoundingSphere();
                }
                const center = (object instanceof InstancedMesh ? object.boundingSphere! : object.geometry.boundingSphere!).center.clone().applyMatrix4(transform), origin = new Vector3(Math.floor(center.x / this.cellSize) * this.cellSize, road ? Math.floor((center.y + 4) / 8) * 8 : 0, Math.floor(center.z / this.cellSize) * this.cellSize);
                const attributes = Object.entries((object.geometry as BufferGeometry).attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, a]) => name + ':' + a.itemSize + ':' + a.normalized + ':' + a.array.constructor.name).join(',');
                const key = [origin.toArray(), attributes, !!object.geometry.index, (object.material as Material).uuid, object.castShadow, object.receiveShadow, object.layers.mask, object.renderOrder, road, !!object.userData.environmentLamp, object instanceof InstancedMesh ? object.geometry.uuid + ':' + !!object.instanceColor : canPackGeometry(object.geometry)?'static':object.uuid].join('|');
                const radius = (object instanceof InstancedMesh ? object.boundingSphere! : object.geometry.boundingSphere!).radius;
                const part = { mesh: object, transform, critical: road, origin, key };
                if (!(object instanceof InstancedMesh) && radius > this.cellSize * .75) {
                    parts.push(...yield* this.splitSteps(part));
                }
                else {
                    parts.push(part);
                }
            }
            for (let i = object.children.length - 1; i >= 0; i--) {
                stack.push({ object: object.children[i]!, dynamic: live, critical: road });
            }
            yield;
        }
        const buckets = new Map<string, Part[]>();
        for (const part of parts) {
            const list = buckets.get(part.key) ?? [];
            list.push(part);
            buckets.set(part.key, list);
        }
        const staged: Group[] = [], removed: Mesh[] = [];
        let committed = false;
        try {
            for (const group of buckets.values()) {
                const instanced = group[0]!.mesh instanceof InstancedMesh;
                let selected: Part[] = [], count = 0;
                for (const part of group) {
                    const size = instanced ? (part.mesh as InstancedMesh).count : part.mesh.geometry.getAttribute('position').count;
                    if (instanced && size > MAX_INSTANCES) {
                        continue;
                    }
                    if (count && count + size > (instanced ? MAX_INSTANCES : MAX_VERTICES)) {
                        staged.push(yield* (instanced ? this.instances(selected) : this.staticMeshes(selected)));
                        removed.push(...selected.map(x => x.mesh));
                        selected = [];
                        count = 0;
                    }
                    selected.push(part);
                    count += size;
                }
                if (selected.length) {
                    staged.push(yield* (instanced ? this.instances(selected) : this.staticMeshes(selected)));
                    removed.push(...selected.map(x => x.mesh));
                }
            }
            for (const part of parts) {
                if (part.owner) {
                    part.mesh.geometry.dispose();
                }
            }
            const sourceOwners = new Map(parts.map(part => [part.mesh, part.owner ?? part.mesh]));
            const owners = new Set(removed.map(mesh => sourceOwners.get(mesh)!));
            // These are unpublished source meshes. Shared source geometry belongs to
            // the model/Worker owner, and may already be borrowed by another sector.
            for (const mesh of owners) {
                let parent = mesh.parent;
                mesh.removeFromParent();
                if (mesh instanceof InstancedMesh) {
                    mesh.dispose();
                }
                while (parent && parent !== root && !parent.children.length && !parent.userData.worldDynamic) {
                    const next = parent.parent;
                    parent.removeFromParent();
                    parent = next;
                }
            }
            // Visibility belongs to a spatial cell, not each material submission.
            const cells = new Map<string, Group>();
            for (const group of staged) {
                const key = group.position.toArray() + ':' + !!group.userData.roadCritical, cell = cells.get(key);
                if (cell) {
                    for (const child of [...group.children]) {
                        cell.add(child);
                    }
                }
                else {
                    cells.set(key, group);
                    root.add(group);
                }
            }
            root.userData.worldClusters = [...cells.values()];
            this.statistics.sources += removed.length;
            this.statistics.batches += staged.length;
            root.updateMatrixWorld(true);
            committed = true;
        }
        finally {
            if (!committed) {
                for (const group of staged) {
                    group.traverse(o => {
                        if (o instanceof InstancedMesh) {
                            o.dispose();
                        }
                        else if (o instanceof Mesh) {
                            if (o.userData.worldGeometryLease) {
                                this.resources.release(o.geometry);
                            }
                            else {
                                o.geometry.dispose();
                            }
                        }
                    });
                }
            }
        }
    }
    private *splitSteps(part: Part): Generator<void, Part[]> {
        const geometry = part.mesh.geometry as BufferGeometry, p = geometry.getAttribute('position'), count = geometry.index?.count ?? p.count, groups = new Map<string, {
            origin: Vector3;
            indices: number[];
        }>(), center = new Vector3(), v = new Vector3();
        for (let start = 0; start < count; start += 384) {
            for (let i = start; i < Math.min(start + 384, count); i += 3) {
                center.set(0, 0, 0);
                for (let j = 0; j < 3; j++) {
                    center.add(v.fromBufferAttribute(p, geometry.index?.getX(i + j) ?? i + j).applyMatrix4(part.transform));
                }
                center.multiplyScalar(1 / 3);
                const origin = new Vector3(Math.floor(center.x / this.cellSize) * this.cellSize, part.critical ? Math.floor((center.y + 4) / 8) * 8 : 0, Math.floor(center.z / this.cellSize) * this.cellSize), key = origin.toArray().join(','), group = groups.get(key) ?? { origin, indices: [] };
                for (let j = 0; j < 3; j++) {
                    group.indices.push(geometry.index?.getX(i + j) ?? i + j);
                }
                groups.set(key, group);
            }
            yield;
        }
        const output: Part[] = [];
        for (const group of groups.values()) {
            const unique: number[] = [], lookup = new Map<number, number>(), indices = new Uint32Array(group.indices.length);
            for (let start = 0; start < indices.length; start += 512) {
                for (let i = start; i < Math.min(start + 512, indices.length); i++) {
                    const id = group.indices[i]!;
                    let index = lookup.get(id);
                    if (index === undefined) {
                        index = unique.length;
                        unique.push(id);
                        lookup.set(id, index);
                    }
                    indices[i] = index;
                }
                yield;
            }
            const g = new BufferGeometry();
            for (const [name, a] of Object.entries(geometry.attributes)) {
                const array = new (a.array.constructor as {
                    new (n: number): typeof a.array;
                })(unique.length * a.itemSize);
                for (let start = 0; start < unique.length; start += 256) {
                    for (let i = start; i < Math.min(start + 256, unique.length); i++) {
                        for (let j = 0; j < a.itemSize; j++) {
                            array[i * a.itemSize + j] = a.array[unique[i]! * a.itemSize + j]!;
                        }
                    }
                    yield;
                }
                g.setAttribute(name, new BufferAttribute(array, a.itemSize, a.normalized));
            }
            g.setIndex(new BufferAttribute(unique.length <= 65536 ? new Uint16Array(indices) : indices, 1));
            const mesh = new Mesh(g, part.mesh.material);
            this.state(part.mesh, mesh);
            output.push({ ...part, mesh, owner: part.mesh, origin: group.origin, key: part.key + '|split:' + group.origin.toArray() });
            yield;
        }
        return output;
    }
    private container(part: Part): Group {
        const root = new Group();
        root.name = 'World cluster ' + part.origin.toArray().join(',');
        root.position.copy(part.origin);
        root.userData.roadCritical = part.critical;
        root.userData.worldRenderCluster = true;
        return root;
    }
    private state(source: Mesh, target: Mesh): void {
        target.name = source.name;
        target.castShadow = source.castShadow;
        target.receiveShadow = source.receiveShadow;
        target.layers.mask = source.layers.mask;
        target.renderOrder = source.renderOrder;
        target.userData = { ...source.userData };
        target.userData.worldRenderBatch = true;
    }
    private *staticMeshes(parts: Part[]): Generator<void, Group> {
        if (parts.every(part => canPackGeometry(part.mesh.geometry))) {
            const first = parts[0]!;
            const geometry = yield* packStaticGeometrySteps(parts.map(part => ({ geometry: part.mesh.geometry, transform: part.transform })), first.origin);
            let leased = false;
            try {
                const shared = yield* this.resources.acquireSteps(geometry); leased = true;
                const mesh = new Mesh(shared, first.mesh.material); this.state(first.mesh, mesh);
                mesh.userData.worldGeometryLease = true;
                const root = this.container(first); root.add(mesh);
                this.statistics.vertices += shared.getAttribute('position').count;
                return root;
            } finally { if (!leased) geometry.dispose(); }
        }
        const first = parts[0]!, geometries: BufferGeometry[] = [];
        let output: BufferGeometry | undefined;
        try {
            for (const part of parts) {
                const g = part.mesh.geometry.clone(), matrix = part.transform.clone();
                geometries.push(g);
                matrix.elements[12]! -= first.origin.x;
                matrix.elements[13]! -= first.origin.y;
                matrix.elements[14]! -= first.origin.z;
                const normalMatrix = new Matrix3().getNormalMatrix(matrix), p = g.getAttribute('position'), n = g.getAttribute('normal'), t = g.getAttribute('tangent'), v = new Vector3(), handedness = matrix.determinant() < 0 ? -1 : 1;
                for (let start = 0; start < p.count; start += 512) {
                    for (let i = start; i < Math.min(start + 512, p.count); i++) {
                        v.fromBufferAttribute(p, i).applyMatrix4(matrix);
                        p.setXYZ(i, v.x, v.y, v.z);
                        if (n) {
                            v.fromBufferAttribute(n, i).applyNormalMatrix(normalMatrix);
                            n.setXYZ(i, v.x, v.y, v.z);
                        }
                        if (t) {
                            v.fromBufferAttribute(t, i).transformDirection(matrix);
                            t.setXYZW(i, v.x, v.y, v.z, t.getW(i) * handedness);
                        }
                    }
                    yield;
                }
                if (matrix.determinant() < 0) {
                    if (!g.index) {
                        const indices = new Uint32Array(p.count);
                        for (let i = 0; i < indices.length; i++) {
                            indices[i] = i;
                        }
                        g.setIndex(new BufferAttribute(indices, 1));
                    }
                    const index = g.index!;
                    for (let i = 0; i < index.count; i += 3) {
                        const b = index.getX(i + 1);
                        index.setX(i + 1, index.getX(i + 2));
                        index.setX(i + 2, b);
                    }
                }
                g.boundingBox = null;
                g.boundingSphere = null;
                yield;
            }
            output = geometries.length === 1 ? geometries.pop()! : mergeGeometries(geometries) ?? undefined;
            if (!output) {
                throw Error('Incompatible static world batch');
            }
            output.computeBoundingBox();
            output.computeBoundingSphere();
            const shared = yield* this.resources.acquireSteps(output);
            output = undefined;
            const mesh = new Mesh(shared, first.mesh.material);
            this.state(first.mesh, mesh);
            mesh.userData.worldGeometryLease = true;
            const root = this.container(first);
            root.add(mesh);
            this.statistics.vertices += shared.getAttribute('position').count;
            return root;
        }
        finally {
            for (const g of geometries) {
                g.dispose();
            }
            output?.dispose();
        }
    }
    private *instances(parts: Part[]): Generator<void, Group> {
        const first = parts[0]!, source = first.mesh as InstancedMesh, count = parts.reduce((sum, p) => sum + (p.mesh as InstancedMesh).count, 0), mesh = new InstancedMesh(source.geometry, source.material, count), matrix = new Matrix4(), local = new Matrix4();
        this.state(source, mesh);
        mesh.userData.cityObjectIds = parts.flatMap(p => p.mesh.userData.cityObjectIds ?? []);
        let at = 0;
        try {
            for (const part of parts) {
                const from = part.mesh as InstancedMesh;
                local.copy(part.transform);
                local.elements[12]! -= first.origin.x;
                local.elements[13]! -= first.origin.y;
                local.elements[14]! -= first.origin.z;
                for (let i = 0; i < from.count; i++) {
                    from.getMatrixAt(i, matrix);
                    matrix.premultiply(local);
                    mesh.setMatrixAt(at, matrix);
                    if (from.instanceColor) {
                        mesh.instanceColor ??= new InstancedBufferAttribute(new Float32Array(count * 3), 3);
                        mesh.instanceColor!.array.set(from.instanceColor.array.subarray(i * 3, i * 3 + 3), at * 3);
                    }
                    at++;
                    if (i % 128 === 0) {
                        yield;
                    }
                }
            }
            mesh.computeBoundingSphere();
            mesh.computeBoundingBox();
            const root = this.container(first);
            root.add(mesh);
            this.statistics.instances += count;
            return root;
        }
        catch (error) {
            mesh.dispose();
            throw error;
        }
    }
}
