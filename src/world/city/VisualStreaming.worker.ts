import { Mesh, MeshBasicMaterial, Float32BufferAttribute } from 'three';
import { createSubject3Materials } from '../subject3/materials';
import { RegionalTerrain } from '../regional/RegionalTerrain';
import { RoadVisualCompiler } from './RoadVisualCompiler';
import { compileMidRoadVisual } from './MidRoadVisual';
import type { CityMapData, CityRoad } from './CityMapData';
import { exportVisualGeometry, visualTransfers, type TerrainVisualData, type VisualWorkerReply, type VisualWorkerRequest } from './VisualStreamingData';
import { cityGroundSectorGeometrySteps } from './CityGroundGeometry';
import { runBatched } from '../../loading/Loading';
const scope = globalThis as unknown as { onmessage: (e: MessageEvent<VisualWorkerRequest | { kind: 'loadRuntime'; url: string }>) => void; postMessage: (data: VisualWorkerReply, transfer?: Transferable[]) => void };
let roads: RoadVisualCompiler, terrain: RegionalTerrain;
let map: CityMapData, roadIndex: Map<string, CityRoad>;
let groundTint:number[];
function compileTerrain(key: string, tier: TerrainVisualData['tier']): TerrainVisualData {
  const group = terrain.build(key, tier), data: TerrainVisualData = { key, tier, geometries: [] };
  group.traverse(o => { if (o instanceof Mesh) { data.geometries.push(exportVisualGeometry(o.geometry)); o.geometry.dispose(); } });
  {
    const task=cityGroundSectorGeometrySteps(map,key,tier==='far'?map.sectorSize/8:20),started=performance.now();let maxStep=0;
    for(;;) {
      const stepStarted=performance.now(),step=task.next();maxStep=Math.max(maxStep,performance.now()-stepStarted);
      if(step.done) {data.ground=step.value.map(g=>{
        if(tier==='far'){const colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3)colors.set(groundTint,i);g.setAttribute('color',new Float32BufferAttribute(colors,3));}
        const result=exportVisualGeometry(g);g.dispose();return result;});break;}
    }
    data.groundBuildMs=performance.now()-started;data.maxGroundStepMs=maxStep;
  }
  return data;
}
scope.onmessage = async e => {
  const started = performance.now();
  const reply = (data: VisualWorkerReply, transfer?: Transferable[]) => scope.postMessage({ ...data, cpuMs: performance.now() - started }, transfer);
  try {
    const request = e.data;
    if (request.kind === 'loadRuntime') {
      const response = await fetch(request.url);
      if (!response.ok) throw new Error(`Map resource: HTTP ${response.status}`);
      const text = await response.text(), parsedAt = performance.now();
      const runtime = JSON.parse(text) as import('./CityRuntimeData').CityRuntimeData;
      map = runtime.map;
      (scope.postMessage as (data: unknown) => void)({kind:'runtime',data:runtime,loadMs:parsedAt-started,parseMs:performance.now()-parsedAt});
    } else if (request.kind === 'init') {
      map = request.map ?? map;
      if (!map) throw new Error('Visual worker requires map data'); roadIndex = new Map(map.roads.map(r => [r.id, r]));
      const materials=createSubject3Materials();groundTint=materials.grass.color.toArray();
      roads = new RoadVisualCompiler(map, { ...materials, tunnelLight: new MeshBasicMaterial({ color: 0xffefd0 }) });
      terrain = new RegionalTerrain(map); reply({ kind: 'ready' });
    } else if (request.kind === 'road') {
      const data = await runBatched(roads.compileSteps(request.id),8); reply({ kind: 'road', data }, visualTransfers(data));
    } else if (request.kind === 'background') {
      const data = request.keys.map(key => compileTerrain(key, 'far'));
      reply({ kind: 'background', data }, data.flatMap(visualTransfers));
    } else {
      const data = compileTerrain(request.key, request.tier);
      if (request.tier === 'mid') data.roadSurface = compileMidRoadVisual(request.key, (request.roadIds ?? []).map(id => roadIndex.get(id)!), map, terrain);
      reply({ kind: 'terrain', data }, visualTransfers(data));
    }
  } catch (error) { reply({ kind: 'error', message: String(error) }); }
};
