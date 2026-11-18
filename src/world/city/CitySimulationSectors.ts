import { Group, type Camera, type Texture, type Vector3 } from 'three';
import type { CityMapData, CityRoad } from './CityMapData';
import { CityTrafficSignals } from './CityTrafficSignals';
import { prepareRoadEdgeChainsSteps } from './RoadEdgeChain';
import { roadPoints, roadEdges } from './geometry';
import { prepareRegionalTerrainSamplerSteps, regionalTerrainSampler, type RegionalTerrainSampler } from '../regional/RegionalTerrain';
import type { RuntimeCoordinator } from '../../game/runtime/RuntimeCoordinator';
/** Physics membership and signal clock only. The Renderer Worker owns visual sectors. */
export class CitySimulationSectors {
    private releaseResolve!: () => void;
    readonly whenReleased = new Promise<void>(resolve => { this.releaseResolve = resolve; });
    readonly root = new Group();
    readonly active = new Map<string, Group>();
    readonly ready = true;
    readonly streamsGround = true;
    readonly signals: CityTrafficSignals;
    private readonly roads = new Map<string, Set<CityRoad>>();
    terrain?: {
        sampler: RegionalTerrainSampler;
    };
    readonly spawnReady = true;
    readonly renderReady = true;
    readonly loadingError = undefined;
    readonly initialProgress = undefined;
    readonly groundStatistics = {
        owner: 'RendererWorker'
    };
    readonly loadStatistics = {
        sectorCount: 0, totalSectors: 0, roadCount: 0, compiledRoadCount: 0, signCount: 0, barrierCount: 0, backgroundSectors: 0, backgroundBatches: 0, constructorMs: 0, publicationMs: 0, worker: undefined, firstVisibleMs: undefined as number | undefined, firstLoadMs: undefined as number | undefined
    };
    constructor(readonly map: CityMapData) { this.signals = new CityTrafficSignals(map); }
    *prepareSteps(): Generator<void> {
        yield* prepareRoadEdgeChainsSteps(this.map);
        if (this.map.regional) {
            yield* prepareRegionalTerrainSamplerSteps(this.map);
            this.terrain = {
                sampler: regionalTerrainSampler(this.map)
            };
        }
        const size = this.map.sectorSize;
        for (const road of this.map.roads) {
            const points = roadPoints(road), edges = roadEdges(road), margin = Math.max(-edges.left, edges.right) + Math.abs(road.structure?.barrierOffset ?? 0) + 12;
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1]!, b = points[i]!;
                for (let x = Math.floor((Math.min(a.x, b.x) - margin) / size); x <= Math.floor((Math.max(a.x, b.x) + margin) / size); x++)
                    for (let z = Math.floor((Math.min(a.z, b.z) - margin) / size); z <= Math.floor((Math.max(a.z, b.z) + margin) / size); z++) {
                        const key = `${x},${z}`;
                        let set = this.roads.get(key);
                        if (!set)
                            this.roads.set(key, set = new Set());
                        set.add(road);
                    }
            }
            yield;
        }
    }
    roadsForSector(key: string): ReadonlySet<CityRoad> | undefined { return this.roads.get(key); }
    sectorKey(x: number, z: number): string { return `${Math.floor(x / this.map.sectorSize)},${Math.floor(z / this.map.sectorSize)}`; }
    update(dt: number): void { this.signals.update(dt); }
    updatePosition(_x: number, _z: number, _yaw = 0, _speed = 0, _frameMs?: number, _height?: number): boolean { return false; }
    beginInitialPreparation(): void { }
    finishInitialPreparation(): void { }
    setRuntimeCoordinator(_runtime: RuntimeCoordinator): void { }
    setResourcePreparation(_prepare: (texture: Texture) => void, _warmup?: (root: Group) => Promise<unknown>): void { }
    setVisualObserver(_observer: (root: import('three').Object3D, added: boolean) => void): void { }
    updateVisibility(_eye: Vector3, _fogFar: number, _cameras: readonly Camera[], _shadows: readonly Camera[]): void { }
    prepareRenderView(_camera: Camera, _shadow = false): void { }
    runtimeState() {
        return {
            owner: 'simulation', visualResources: 0, physicsSectors: this.roads.size
        };
    }
    dispose(afterRelease?: () => void): void { this.signals.dispose(); this.roads.clear(); this.root.clear(); afterRelease?.(); this.releaseResolve(); }
}
