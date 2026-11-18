import { Group, Matrix4, Mesh, type Camera, type Object3D, type Vector3, type Box3 } from 'three';
import type { RuntimeCoordinator } from '../../game/runtime/RuntimeCoordinator';
import { FogVisibility } from '../city/FogVisibility';
import { StaticBatchBuilder } from './StaticBatchBuilder';
import { WorldRenderResources } from './WorldRenderResources';
import { canPackGeometry, packStaticGeometrySteps } from './StaticGeometryPacking';
import { RenderWorld } from './RenderWorld';
/** Common multi-view spatial index, preparation and resource ownership. */
export class WorldRenderClusters {
    readonly resources = new WorldRenderResources();
    readonly batches = new StaticBatchBuilder(this.resources);
    readonly renderWorld = new RenderWorld();
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
            this.renderWorld.deactivate(root);
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
        yield* this.renderWorld.registerSteps(root,groups);
    }
    configure(eye: Vector3, far: number, cameras: readonly Camera[],shadows:readonly Camera[]=[]): void {
        this.visibility.configure(eye, far, cameras);
        this.renderWorld.configure(eye,far,cameras,shadows);
    }
    roadBoxVisible(box: Box3): boolean {
        return this.visibility.roadBoxVisible(box);
    }
    update(root: Object3D): void {
        // Coarse sector fog gate also drives streaming priority/downgrade.
        // Fine static draw visibility and per-view packets belong to the Worker.
        this.visibility.update(root);
        this.renderWorld.visit(root,root.visible);
    }
    finishVisibility():void {this.renderWorld.finish();}
    beforeView(camera:Camera,shadow=false):void {this.renderWorld.beforeView(camera,shadow);}
    releaseObject(object:Object3D):void {this.renderWorld.release(object);}
    updateTransform(mesh:Mesh,matrix:Matrix4):void {const changed=this.renderWorld.updateTransform(mesh,matrix);this.visibility.expandPrepared(changed.root,changed.sphere);}
    includePrepared(root: Object3D, child: Object3D): void {
        this.visibility.includePrepared(root, child);
        this.renderWorld.adopt(root,child);
        const added = this.clusters.get(child);
        if (added) {
            const groups = this.clusters.get(root) ?? [];
            groups.push(...added);
            this.clusters.set(root, groups);
        }
    }
    transfer(root: Object3D, previous: Object3D): void {
        this.visibility.includePrepared(root, previous);
        this.renderWorld.adopt(root,previous);
        const groups = this.clusters.get(root) ?? [];
        for (const group of this.clusters.get(previous) ?? []) {
            if (group.parent === root) {
                groups.push(group);
            }
        }
        this.clusters.set(root, groups);
    }
    private *externalSteps(root: Group,generation?:Generator<void>): Generator<void> {
        if(generation)yield* generation;
        for (const object of root.children) {
            if (object instanceof Mesh) {
                if (canPackGeometry(object.geometry)) {
                    const source = object.geometry;
                    object.geometry = yield* packStaticGeometrySteps([{ geometry: source, transform: new Matrix4() }]);
                    source.dispose();
                }
                object.geometry = yield* this.resources.acquireSteps(object.geometry);
                object.userData.worldGeometryLease = true;
                yield* this.visibility.prepareSteps(object);
            }
        }
        yield* this.renderWorld.registerSteps(root,root.children);
    }
    async prepareExternal(root: Group, runtime: RuntimeCoordinator | undefined, warmup: (root: Group) => Promise<unknown>,generation?:Generator<void>): Promise<void> {
        const steps = this.externalSteps(root,generation);
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
            if(child instanceof Mesh)this.renderWorld.adoptMesh(parent,child);
            groups.push(child);
            this.visibility.includePrepared(parent, child);
        }
        else {
            if(child instanceof Mesh)this.renderWorld.release(child);
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
        return { owners: this.owners.size, cells, revision: this.revision, batching: { ...this.batches.statistics }, resources: this.resources.state,renderWorld:this.renderWorld.state };
    }
    dispose(): void {
        this.owners.clear();
        this.renderWorld.dispose();
        this.resources.dispose();
    }
}
