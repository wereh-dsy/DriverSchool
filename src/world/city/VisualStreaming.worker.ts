import { Mesh, MeshBasicMaterial, Float32BufferAttribute } from 'three';
import { createSubject3Materials } from '../subject3/materials';
import { RegionalTerrain } from '../regional/RegionalTerrain';
import { RoadVisualCompiler } from './RoadVisualCompiler';
import { compileMidRoadVisualSteps } from './MidRoadVisual';
import type { CityMapData, CityRoad } from './CityMapData';
import { exportVisualGeometry, visualTransfers, type TerrainVisualData, type VisualWorkerReply, type VisualWorkerRequest } from './VisualStreamingData';
import { cityGroundSectorGeometrySteps } from './CityGroundGeometry';
import { runBatched } from '../../loading/Loading';
import {RegionalTerrainClearance} from '../regional/RegionalTerrainClearance';
import {shareCityRuntimePaths} from './CityRuntimeData';
const scope = globalThis as unknown as { onmessage: (e: MessageEvent<VisualWorkerRequest | { kind: 'loadRuntime'; url: string }>) => void; postMessage: (data: VisualWorkerReply, transfer?: Transferable[]) => void };
let roads: RoadVisualCompiler, terrain: RegionalTerrain;
let map: CityMapData, roadIndex: Map<string, CityRoad>;
let groundTint:number[];
let activeJob: AbortController | undefined;
function* compileTerrain(key: string, tier: TerrainVisualData['tier']): Generator<void, TerrainVisualData> {
  const group = yield* terrain.buildSteps(key, tier);
  const data: TerrainVisualData = { key, tier, geometries: [] };
  group.traverse(o => { if (o instanceof Mesh) { data.geometries.push(exportVisualGeometry(o.geometry, false)); o.geometry.dispose(); } });
  {
    const task=cityGroundSectorGeometrySteps(map,key,tier==='far'?map.sectorSize/8:20,terrain.clearance);
    let maxStep=0, activeMs=0;
    for(;;) {
      const stepStarted=performance.now(),step=task.next(),elapsed=performance.now()-stepStarted;
      activeMs += elapsed;
      maxStep=Math.max(maxStep,elapsed);
      if(step.done) {data.ground=step.value.map(g=>{
        if(tier==='far'){const colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3)colors.set(groundTint,i);g.setAttribute('color',new Float32BufferAttribute(colors,3));}
        const result=exportVisualGeometry(g, false);g.dispose();return result;});break;}
      yield;
    }
    data.groundBuildMs=activeMs;data.maxGroundStepMs=maxStep;
  }
  return data;
}
scope.onmessage = async e => {
  const request = e.data;
  if (request.kind === 'cancel') {
    activeJob?.abort();
    return;
  }
  const started = performance.now();
  const reply = (data: VisualWorkerReply, transfer?: Transferable[]) => scope.postMessage({ ...data, cpuMs: performance.now() - started,workerStartedAt:performance.timeOrigin+started,workerFinishedAt:performance.timeOrigin+performance.now(),transferBytes:transfer?.reduce<number>((n,b)=>n+(b instanceof ArrayBuffer?b.byteLength:0),0),workerHeapBytes:(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize??null }, transfer);
  try {
    if (request.kind === 'loadRuntime') {
      const response = await fetch(request.url);
      if (!response.ok) throw new Error(`Map resource: HTTP ${response.status}`);
      const text = await response.text(), parsedAt = performance.now();
      const runtime = shareCityRuntimePaths(JSON.parse(text) as import('./CityRuntimeData').CityRuntimeData);
      map = runtime.map;
      (scope.postMessage as (data: unknown) => void)({kind:'runtime',data:runtime,loadMs:parsedAt-started,parseMs:performance.now()-parsedAt});
    } else if (request.kind === 'init') {
      map = request.map ?? map;
      if (!map) throw new Error('Visual worker requires map data'); roadIndex = new Map(map.roads.map(r => [r.id, r]));
      const materials=createSubject3Materials();groundTint=materials.grass.color.toArray();
      roads = new RoadVisualCompiler(map, { ...materials, tunnelLight: new MeshBasicMaterial({ color: 0xffefd0 }) }, undefined,request.diagnostics);
      terrain = new RegionalTerrain(map,new RegionalTerrainClearance(map)); reply({ kind: 'ready' });
    } else {
      const job: Extract<VisualWorkerRequest, { kind: 'road' | 'terrain' | 'background' }> = request;
      const controller = activeJob = new AbortController();
      let activeMs = 0, maxStepMs = 0;
      function* work(): Generator<void, VisualWorkerReply> {
        if (job.kind === 'road') {
          const data = yield* roads.compileSteps(job.id);
          return { kind: 'road', data, metrics: roads.lastMetrics, cache: roads.cacheStatistics };
        }
        if (job.kind === 'background') {
          const data: TerrainVisualData[] = [];
          for (const key of job.keys) data.push(yield* compileTerrain(key, 'far'));
          return { kind: 'background', data };
        }
        const data = yield* compileTerrain(job.key, job.tier);
        if (job.tier === 'mid') {
          const selected = (job.roadIds ?? []).map(id => roadIndex.get(id)!);
          data.roadSurface = yield* compileMidRoadVisualSteps(job.key, selected, map, terrain);
        }
        return { kind: 'terrain', data };
      }
      function* measured(): Generator<void, VisualWorkerReply> {
        const task = work();
        try {
          for (;;) {
            const before = performance.now(), step = task.next(), elapsed = performance.now() - before;
            activeMs += elapsed;
            maxStepMs = Math.max(maxStepMs, elapsed);
            if (step.done) return step.value;
            yield;
          }
        } finally { task.return(undefined as never); }
      }
      try {
        const result = await runBatched(measured(), 8, controller.signal, false);
        const transfer = result.kind === 'background' ? result.data.flatMap(visualTransfers) :
          result.kind === 'road' || result.kind === 'terrain' ? visualTransfers(result.data) : undefined;
        reply({ ...result, activeMs, maxStepMs }, transfer);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        reply({ kind: 'cancelled', activeMs, maxStepMs });
      } finally { activeJob = undefined; }
    }
  } catch (error) { reply({ kind: 'error', message: String(error) }); }
};
