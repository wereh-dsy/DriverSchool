import { Group, Mesh, type Camera, type Object3D, type Vector3, type Box3 } from 'three';
import type { RuntimeCoordinator } from '../../game/runtime/RuntimeCoordinator';
import { FogVisibility } from '../city/FogVisibility';
import { StaticBatchBuilder } from './StaticBatchBuilder';
import { WorldRenderResources } from './WorldRenderResources';
/** Common multi-view spatial index, preparation and resource ownership. */
export class WorldRenderClusters {
    readonly resources = new WorldRenderResources();
    readonly batches = new StaticBatchBuilder(this.resources);
    private readonly visibility = new FogVisibility();
    private readonly clusters = new WeakMap<Object3D, Object3D[]>();
    private readonly owners = new Map<string, Group>();
    private revision = 0;
    publish(owner: string, root: Group): void {
        if (!this.clusters.has(root)) {
            throw Error('World owner must be prepared before publication');
        }
        this.owners.set(owner, root);
        this.revision++;
    }
    unpublish(owner: string, root: Group): void {
        if (this.owners.get(owner) === root) {
            this.owners.delete(owner);
            this.revision++;
        }
    }
    *prepareSteps(root: Group): Generator<void> {
        yield* this.batches.buildSteps(root);
        root.updateMatrixWorld(true);
        const groups = (root.userData.worldClusters ?? []) as Group[];
        this.clusters.set(root, groups);
        for (const group of groups) {
            yield* this.visibility.prepareSteps(group);
        }
        yield* this.visibility.prepareSteps(root);
    }
    configure(eye: Vector3, far: number, cameras: readonly Camera[]): void {
        this.visibility.configure(eye, far, cameras);
    }
    roadBoxVisible(box: Box3): boolean {
        return this.visibility.roadBoxVisible(box);
    }
    update(root: Object3D): void {
        this.visibility.update(root);
        if (root.visible) {
            for (const group of this.clusters.get(root) ?? []) {
                if (group.parent) {
                    this.visibility.update(group);
                }
            }
        }
    }
    includePrepared(root: Object3D, child: Object3D): void {
        this.visibility.includePrepared(root, child);
        const added = this.clusters.get(child);
        if (added) {
            const groups = this.clusters.get(root) ?? [];
            groups.push(...added);
            this.clusters.set(root, groups);
        }
    }
    transfer(root: Object3D, previous: Object3D): void {
        this.visibility.includePrepared(root, previous);
        const groups = this.clusters.get(root) ?? [];
        for (const group of this.clusters.get(previous) ?? []) {
            if (group.parent === root) {
                groups.push(group);
            }
        }
        this.clusters.set(root, groups);
    }
    private *externalSteps(root: Group): Generator<void> {
        for (const object of root.children) {
            if (object instanceof Mesh) {
                object.geometry = yield* this.resources.acquireSteps(object.geometry);
                object.userData.worldGeometryLease = true;
                yield* this.visibility.prepareSteps(object);
            }
        }
    }
    async prepareExternal(root: Group, runtime: RuntimeCoordinator | undefined, warmup: (root: Group) => Promise<unknown>): Promise<void> {
        const steps = this.externalSteps(root);
        try {
            if (runtime) {
                const handle = runtime.enqueue({ id: 'world:proxy:' + root.uuid, phase: 'assets', priority: () => 'background', valid: () => root.userData.streamingWarmupCancelled !== true, step: deadline => {
                        let count = 0;
                        while (count++ < 32 && performance.now() < deadline) {
                            if (steps.next().done) {
                                return true;
                            }
                        }
                        return false;
                    } });
                await handle.done;
                if (handle.state !== 'complete') {
                    root.userData.streamingWarmupCancelled = true;
                }
            }
            else {
                for (const _ of steps) {
                }
            }
            if (!root.userData.streamingWarmupCancelled) {
                await warmup(root);
            }
        }
        finally {
            steps.return(undefined);
        }
    }
    attachExternal(parent: Object3D, child: Object3D, added: boolean): void {
        const groups = this.clusters.get(parent) ?? [];
        if (added) {
            groups.push(child);
            this.visibility.includePrepared(parent, child);
        }
        else {
            const at = groups.indexOf(child);
            if (at >= 0) {
                groups.splice(at, 1);
            }
        }
        this.clusters.set(parent, groups);
    }
    get statistics() {
        let cells = 0;
        for (const root of this.owners.values()) {
            cells += this.clusters.get(root)?.length ?? 0;
        }
        return { owners: this.owners.size, cells, revision: this.revision, batching: { ...this.batches.statistics }, resources: this.resources.state };
    }
    dispose(): void {
        this.owners.clear();
        this.resources.dispose();
    }
}
