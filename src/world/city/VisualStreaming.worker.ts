import { Mesh, MeshBasicMaterial } from 'three';
import { createSubject3Materials } from '../subject3/materials';
import { RegionalTerrain } from '../regional/RegionalTerrain';
import { RoadVisualCompiler } from './RoadVisualCompiler';
import { compileMidRoadVisual } from './MidRoadVisual';
import type { CityMapData, CityRoad } from './CityMapData';
import { exportVisualGeometry, visualTransfers, type TerrainVisualData, type VisualWorkerReply, type VisualWorkerRequest } from './VisualStreamingData';
const scope = globalThis as unknown as { onmessage: (e: MessageEvent<VisualWorkerRequest>) => void; postMessage: (data: VisualWorkerReply, transfer?: Transferable[]) => void };
let roads: RoadVisualCompiler, terrain: RegionalTerrain;
let map: CityMapData, roadIndex: Map<string, CityRoad>;
function compileTerrain(key: string, tier: TerrainVisualData['tier']): TerrainVisualData {
  const group = terrain.build(key, tier), data: TerrainVisualData = { key, tier, geometries: [] };
  group.traverse(o => { if (o instanceof Mesh) { data.geometries.push(exportVisualGeometry(o.geometry)); o.geometry.dispose(); } });
  return data;
}
scope.onmessage = e => {
  const started = performance.now();
  const reply = (data: VisualWorkerReply, transfer?: Transferable[]) => scope.postMessage({ ...data, cpuMs: performance.now() - started }, transfer);
  try {
    const request = e.data;
    if (request.kind === 'init') {
      map = request.map; roadIndex = new Map(map.roads.map(r => [r.id, r]));
      roads = new RoadVisualCompiler(request.map, { ...createSubject3Materials(), tunnelLight: new MeshBasicMaterial({ color: 0xffefd0 }) });
      terrain = new RegionalTerrain(request.map); reply({ kind: 'ready' });
    } else if (request.kind === 'road') {
      const data = roads.compile(request.id); reply({ kind: 'road', data }, visualTransfers(data));
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
