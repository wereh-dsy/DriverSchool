import type { CityMapData, RoadEndpoint } from './CityMapData';
import { syncConnections } from './geometry';
import { validateMap } from './CityMapValidation';
/** Backward-compatible normalization; validation provides actionable issue codes. */
export function loadCityMap(value: unknown): CityMapData {
  const report = validateMap(value);
  if (!report.valid) throw new Error(report.errors.map(e => `${e.code} ${e.path}: ${e.message}`).join('\n'));
  const map = structuredClone(value) as CityMapData;
  for (const r of map.roads) r.centerline.forEach(p => { p.y = r.elevationMode === 'ground' ? 0 : r.elevationMode === 'elevated' ? r.elevation ?? 6 : p.y ?? 0; });
  for (const e of [...map.intersections, ...map.objects, ...map.environment.spawnPoints]) e.position.y ??= 0;
  // V1 coincident endpoints migrate once to explicit links; no projected crossings connect.
  if (map.schemaVersion !== 2 && map.roadLinks === undefined) {
    const ends: { e: RoadEndpoint; p: { x: number; y?: number; z: number } }[] = [];
    map.roadLinks = [];
    for (const r of map.roads) for (const end of ['start', 'end'] as const) {
      if (map.intersections.some(j => j.connections.some(c => c.roadId === r.id && c.end === end))) continue;
      const p = end === 'start' ? r.centerline[0]! : r.centerline.at(-1)!;
      for (const other of ends) if (Math.hypot(p.x - other.p.x, p.z - other.p.z) < 0.1 && Math.abs((p.y ?? 0) - (other.p.y ?? 0)) < 0.1) {
        map.roadLinks.push({ id: `v1-link:${r.id}:${end}:${other.e.roadId}:${other.e.end}`, from: other.e, to: { roadId: r.id, end } });
      }
      ends.push({ e: { roadId: r.id, end }, p });
    }
  }
  map.schemaVersion = 2; map.roadLinks ??= []; map.connectionPorts ??= [];
  syncConnections(map);
  const normalized = validateMap(map);
  if (!normalized.valid) throw new Error(normalized.errors.map(e => `${e.code} ${e.path}: ${e.message}`).join('\n'));
  return map;
}
export const CITY_EDITOR_STORAGE_KEY = 'drivergame.city-editor-map.v1';
