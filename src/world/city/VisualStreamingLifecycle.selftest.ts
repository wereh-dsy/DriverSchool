import { MeshBasicMaterial, PlaneGeometry } from 'three';
import { newCityMap } from './CityMapData';
import { SectorManager } from './SectorManager';
import { PrefabRegistry } from './PrefabRegistry';
import { VisualStreamingWorker } from './VisualStreamingWorker';
import { exportVisualGeometry, type VisualWorkerReply, type VisualWorkerRequest } from './VisualStreamingData';
import { createSubject3Materials } from '../subject3/materials';

/** The actual browser scheduling path, with deterministic worker replies and shader promises. */
export async function runVisualStreamingLifecycleSelfTest(): Promise<{ assertions: number }> {
  let assertions = 0;
  const check = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Streaming lifecycle: ${message}`); };
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const geometry = new PlaneGeometry(1, 1), data = exportVisualGeometry(geometry); geometry.dispose();
  class FakeWorker {
    static latest: FakeWorker;
    static automatic = false;
    onmessage?: (e: { data: VisualWorkerReply }) => void;
    onerror?: (e: { message: string }) => void;
    sent: VisualWorkerRequest[] = [];
    terminated = false;
    constructor() { FakeWorker.latest = this; }
    reply(reply: VisualWorkerReply): void { this.onmessage?.({ data: reply }); }
    postMessage(request: VisualWorkerRequest): void {
      this.sent.push(request);
      if (!FakeWorker.automatic) return;
      if (request.kind === 'init') this.reply({ kind: 'ready' });
      else if (request.kind === 'terrain') this.reply({ kind: 'terrain', data: { key: request.key, tier: request.tier, geometries: [data] } });
      else if (request.kind === 'background') this.reply({ kind: 'background', data: request.keys.map(key => ({ key, tier: 'far', geometries: [data] })) });
    }
    terminate(): void { this.terminated = true; }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
  try {
    const map = newCityMap(); map.sectorSize = 150;
    map.bounds = { minX: 0, maxX: 300, minZ: 0, maxZ: 150 };
    map.regional = { version: 1, terrainBounds: map.bounds, cityBounds: map.bounds, routes: [], structures: [], exits: [] };
    let delivered = 0;
    const worker = new VisualStreamingWorker(map, () => delivered++, () => {}), fake = FakeWorker.latest;
    worker.request('far', { kind: 'road', id: 'far' }, 10);
    worker.request('near', { kind: 'road', id: 'near' }, 1);
    worker.advance(); check(fake.sent.length === 1, 'waits for initialization');
    fake.reply({ kind: 'ready' });
    worker.request('far', { kind: 'road', id: 'far' }, 0); worker.advance();
    check(fake.sent.at(-1)?.kind === 'road' && (fake.sent.at(-1) as { id: string }).id === 'far', 'moving near requests can reprioritize queued work');
    worker.request('far', { kind: 'road', id: 'far' }, 0);
    fake.reply({ kind: 'road', data: { id: 'far', surfaces: [], instances: [] } }); worker.advance();
    check((fake.sent.at(-1) as { id: string }).id === 'near', 'in-flight road is never duplicated');
    worker.dispose(); fake.reply({ kind: 'road', data: { id: 'near', surfaces: [], instances: [] } });
    check(delivered === 1 && fake.terminated, 'dispose rejects late replies and terminates worker');

    FakeWorker.automatic = true;
    const materials = { ...createSubject3Materials(), tunnelLight: new MeshBasicMaterial() }, prefabs = new PrefabRegistry(materials);
    const sectors = new SectorManager(map, materials, prefabs), completions: (() => void)[] = [];
    sectors.setResourcePreparation(() => {}, () => new Promise<void>(resolve => completions.push(resolve)));
    for (let i = 0; i < 25; i++) sectors.updatePosition(149, 20);
    await flush();
    check(completions.length > 0 && sectors.active.size === 0 && !sectors.spawnReady, 'unprepared sectors cannot become visible or ready');
    sectors.updatePosition(151, 20);
    check(sectors.debugState?.currentSector === '1,0', 'sector boundary refreshes selection inside the same 100 m bucket');
    for (const resolve of completions.splice(0)) resolve();
    await flush();
    for (let i = 0; i < 25; i++) sectors.updatePosition(151, 20);
    for (const resolve of completions.splice(0)) resolve();
    await flush();
    sectors.updatePosition(151, 20);
    check(sectors.spawnReady && sectors.active.size > 0, 'completed warmup publishes and unlocks the spawn');
    sectors.dispose(); prefabs.dispose(); for (const m of Object.values(materials)) m.dispose();

    const materials2 = createSubject3Materials(), prefabs2 = new PrefabRegistry(materials2);
    const pending = new SectorManager(map, materials2, prefabs2);
    pending.setResourcePreparation(() => {}, () => new Promise<void>(resolve => completions.push(resolve)));
    for (let i = 0; i < 25; i++) pending.updatePosition(20, 20);
    await flush();
    check(completions.length > 0, 'disposal fixture has real pending shader work');
    let released = false;
    pending.dispose(() => { released = true; prefabs2.dispose(); for (const m of Object.values(materials2)) m.dispose(); });
    check(!released, 'shared resources survive while shader compilation borrows them');
    for (const resolve of completions) resolve();
    await flush();
    check(released && !pending.updatePosition(20, 20), 'deferred disposal completes and cannot publish late');
  } finally {
    if (original) Object.defineProperty(globalThis, 'Worker', original); else Reflect.deleteProperty(globalThis, 'Worker');
  }
  return { assertions };
}
