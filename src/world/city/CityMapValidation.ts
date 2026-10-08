import { INTERSECTION_LANES, PREFAB_IDS, ROAD_LANES, type CityMapData, type CityPoint, type RoadEndpoint } from './CityMapData';
import { directionalPortLabel, portsFor, roadPoints } from './geometry';
import { ROAD_STYLES } from './RoadStyles';
import catalog from './presets/catalog.json';
import { validatePresetGeometry } from './presets/PresetGeometryValidation';
export interface MapIssue { severity: 'error' | 'warning'; code: string; path: string; message: string }
export interface MapValidation { valid: boolean; errors: MapIssue[]; warnings: MapIssue[]; errorCount: number; warningCount: number }
export const RECOMMENDED_GRADE = 0.12;
export const MAXIMUM_GRADE = 0.25;
export const pointHeight = (p: CityPoint): number => p.y ?? 0;
export function validateMap(value: unknown): MapValidation {
  const errors: MapIssue[] = [], warnings: MapIssue[] = [];
  const result = (): MapValidation => ({ valid: errors.length === 0, errors, warnings, errorCount: errors.length, warningCount: warnings.length });
  const issue = (code: string, path: string, message: string, severity: 'error' | 'warning' = 'error') => (severity === 'error' ? errors : warnings).push({ severity, code, path, message });
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const point = (v: CityPoint | undefined): boolean => !!v && finite(v.x) && finite(v.z) && (v.y === undefined || finite(v.y) && v.y >= -50 && v.y <= 100);
  if (!value || typeof value !== 'object') { issue('map.invalid', '$', 'Expected CityMap object.'); return result(); }
  const m = value as CityMapData;
  if (typeof m.id !== 'string' || !m.id || typeof m.name !== 'string') issue('metadata.invalid', '$', 'Nonempty id and name required.');
  if (!Number.isInteger(m.version) || m.version < 1) issue('version.invalid', 'version', 'Expected positive integer.');
  if (m.schemaVersion !== undefined && ![1, 2].includes(m.schemaVersion)) issue('schema.invalid', 'schemaVersion', 'Supported schema versions: 1, 2.');
  if (!finite(m.sectorSize) || m.sectorSize < 50 || m.sectorSize > 2000) issue('sector.invalid', 'sectorSize', 'Expected 50–2000 metres.');
  const b = m.bounds;
  if (!b || ![b.minX, b.maxX, b.minZ, b.maxZ].every(finite) || b.minX >= b.maxX || b.minZ >= b.maxZ || b.maxX - b.minX > 200000 || b.maxZ - b.minZ > 200000) issue('bounds.invalid', 'bounds', 'Finite ordered bounds, at most 200km per axis, required.');
  for (const key of ['roads', 'intersections', 'objects'] as const) if (!Array.isArray(m[key])) issue('array.required', key, 'Expected array.');
  if (errors.some(e => e.code === 'array.required')) return result();
  const ids = new Set<string>();
  for (const key of ['roads', 'intersections', 'objects', 'roadLinks', 'connectionPorts'] as const) {
    const list = m[key]; if (list === undefined) continue;
    if (!Array.isArray(list)) { issue('array.invalid', key, 'Expected array.'); continue; }
    list.forEach((e, index) => {
      const path = `${key}[${index}]`;
      if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id)) issue('id.duplicate', path, 'Missing or duplicate element ID.'); else ids.add(e.id);
      if (e && typeof e === 'object' && 'presetSource' in e && e.presetSource && !catalog.presets.some(p => p.id === e.presetSource)) issue('preset.invalid', path, `Unknown presetSource: ${e.presetSource}`);
    });
  }
  for (let index = 0; index < m.roads.length; index++) {
    const r = m.roads[index], path = `roads[${index}]`; if (!r) continue;
    if (!Object.hasOwn(ROAD_LANES, r.type) || !Number.isInteger(r.laneCount) || (r.type === 'highway' ? r.laneCount < 1 || r.laneCount > 6 : r.laneCount !== ROAD_LANES[r.type])) issue('lanes.invalid', path, 'Highway supports 1–6 lanes; urban/ramp type fixes count.');
    if (!finite(r.laneWidth) || r.laneWidth < 2 || r.laneWidth > 6 || !finite(r.speedLimit) || r.speedLimit <= 0 || r.speedLimit > 200) issue('road.properties', path, 'Lane width 2–6m, speed 1–200km/h required.');
    if (!['two-way', 'forward', 'reverse'].includes(r.travelDirection) || r.travelDirection === 'two-way' && r.laneCount % 2 !== 0) issue('direction.invalid', path, 'Two-way roads require an even lane count.');
    if (r.styleId && !ROAD_STYLES.some(s => s.id === r.styleId)) issue('style.invalid', path, `Unknown road style: ${r.styleId}`);
    if (r.curve && !['polyline', 'smooth'].includes(r.curve)) issue('curve.invalid', path, 'Expected polyline or smooth.');
    if (r.elevationMode && !['ground', 'elevated', 'custom'].includes(r.elevationMode)) issue('elevation.mode', path, 'Expected ground/elevated/custom.');
    if (r.elevationMode === 'elevated' && (!finite(r.elevation ?? 6) || (r.elevation ?? 6) < 2.5 || (r.elevation ?? 6) > 100)) issue('elevation.invalid', path, 'Elevated height must be 2.5–100m.');
    if (r.sidewalk && (typeof r.sidewalk.enabled !== 'boolean' || !finite(r.sidewalk.width) || r.sidewalk.width < 0.5 || r.sidewalk.width > 10)) issue('sidewalk.invalid', path, 'Sidewalk width must be 0.5–10m.');
    if (r.shoulders && ![r.shoulders.left, r.shoulders.right].every(v=>finite(v)&&v>=0&&v<=5)) issue('shoulders.invalid',path,'Paved shoulder widths must be 0–5m.');
    if (r.structure?.barrierOffset !== undefined && (!finite(r.structure.barrierOffset)||r.structure.barrierOffset<0||r.structure.barrierOffset>2)) issue('barrier.offset',path,'Barrier offset must be 0–2m outside pavement.');
    if (r.gore && (typeof r.gore.start!=='boolean'||typeof r.gore.end!=='boolean'||!finite(r.gore.length)||r.gore.length<10||r.gore.length>300)) issue('gore.invalid',path,'Gore needs boolean endpoints and 10–300m length.');
    const s = r.structure;
    if (s && (s.pierSpacing !== undefined && (!finite(s.pierSpacing) || s.pierSpacing < 10 || s.pierSpacing > 100) || s.pierStyle !== undefined && !['round', 'rectangular'].includes(s.pierStyle) || s.barrierEnabled !== undefined && typeof s.barrierEnabled !== 'boolean' || s.piersEnabled !== undefined && typeof s.piersEnabled !== 'boolean')) issue('structure.invalid', path, 'Pier spacing 10–100m, style round/rectangular, flags boolean.');
    if (!Array.isArray(r.centerline) || r.centerline.length < 2 || !r.centerline.every(point)) { issue('elevation.node', path, 'Two finite {x,y?,z} nodes required; Y range -50–100m.'); continue; }
    const separation = (a: CityPoint, b: CityPoint) => Math.hypot(a.x - b.x, a.z - b.z);
    if (separation(r.centerline[0]!, r.centerline.at(-1)!) < 0.05 || r.centerline.some((p, i) => i > 0 && separation(p, r.centerline[i - 1]!) < 0.05)) {
      issue('road.degenerate', `${path}.centerline`, 'Distinct start/end and consecutive nodes need at least 0.05m horizontal separation.'); continue;
    }
    let maxGrade = 0;
    const points = roadPoints(r);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, c = points[i]!, length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 0.05) { issue('road.degenerate', `${path}.centerline`, 'Consecutive nodes need horizontal separation.'); break; }
      maxGrade = Math.max(maxGrade, Math.abs(pointHeight(c) - pointHeight(a)) / length);
    }
    if (maxGrade > MAXIMUM_GRADE) issue('slope.extreme', path, `Grade ${(maxGrade * 100).toFixed(1)}% exceeds hard limit 25%.`);
    else if (maxGrade > RECOMMENDED_GRADE) issue('slope.recommended', path, `Grade ${(maxGrade * 100).toFixed(1)}% exceeds recommended 12%.`, 'warning');
  }
  const endpoint = (e: RoadEndpoint | undefined, path: string): CityPoint | undefined => {
    const r = e && m.roads.find(r => r?.id === e.roadId);
    if (!e || !r || !['start', 'end'].includes(e.end) || !Array.isArray(r.centerline) || !r.centerline.length) { issue('connection.broken', path, 'Unknown roadId or invalid endpoint.'); return; }
    const p = e.end === 'start' ? r.centerline[0] : r.centerline.at(-1);
    return p && { ...p, y: r.elevationMode === 'ground' ? 0 : r.elevationMode === 'elevated' ? r.elevation ?? 6 : pointHeight(p) };
  };
  const used = new Set<string>();
  for (let index = 0; index < m.intersections.length; index++) {
    const j = m.intersections[index], path = `intersections[${index}]`; if (!j) continue;
    if (!Object.hasOwn(INTERSECTION_LANES, j.type) || !point(j.position) || !finite(j.rotation) || typeof j.signalized !== 'boolean' || !Array.isArray(j.connections)) { issue('junction.invalid', path, 'Invalid type, position, rotation, signalized or connections.'); continue; }
    const ports = new Set<string>();
    const expected = j.type.startsWith('t_') ? 3 : 4;
    if (j.connections.length < expected) issue('junction.weak', path, `${j.id}: ${j.connections.length}/${expected} arms. Preserve the authored junction; inspect missing approaches.`, 'warning');
    for (const c of j.connections) {
      const p = endpoint(c, path), key = `${c?.roadId}:${c?.end}`;
      if (!c || !portsFor(j).includes(c.port) || ports.has(c.port) || used.has(key)) issue('port.conflict', path, 'A port and road endpoint each allow one junction connection.');
      if (c) { ports.add(c.port); used.add(key); }
      if (p && Math.abs(pointHeight(p) - pointHeight(j.position)) > 0.2) issue('height.mismatch', path, `Road ${c.roadId}:${c.end} Y=${p.y} differs from junction Y=${pointHeight(j.position)}.`);
    }
    if (j.signals && (j.signals.offsetSeconds !== undefined && !finite(j.signals.offsetSeconds) || j.signals.headHeight !== undefined && (!finite(j.signals.headHeight) || j.signals.headHeight < 3 || j.signals.headHeight > 12))) issue('signals.invalid', path, 'Invalid signal offset/head height.');
  }
  const linkedPairs = new Set<string>();
  if (Array.isArray(m.roadLinks)) for (const link of m.roadLinks) {
    for (const e of [link?.from, link?.to]) if (e && Object.keys(e).some(k => k !== 'roadId' && k !== 'end')) issue('connection.shape', `roadLinks.${link?.id}`, 'Expected exactly {roadId,end}; not a node/port object.');
    if (link?.from && link?.to) {
      const pair = [`${link.from.roadId}:${link.from.end}`, `${link.to.roadId}:${link.to.end}`].sort().join('|');
      if (linkedPairs.has(pair)) issue('connection.duplicate', `roadLinks.${link.id}`, 'Duplicate undirected endpoint connection.');
      linkedPairs.add(pair);
    }
    const a = endpoint(link?.from, `roadLinks.${link?.id}`), c = endpoint(link?.to, `roadLinks.${link?.id}`);
    if (a && c && Math.abs(pointHeight(a) - pointHeight(c)) > 0.2) issue('height.mismatch', `roadLinks.${link.id}`, 'Linked endpoints have different heights.');
    if (a && c && Math.hypot(a.x - c.x, a.z - c.z) > 0.2) issue('connection.gap', `roadLinks.${link.id}`, 'Linked endpoints must coincide within 0.2m.');
    if ([link?.from, link?.to].some(e => e && used.has(`${e.roadId}:${e.end}`))) issue('port.conflict', `roadLinks.${link?.id}`, 'An endpoint attached to a junction cannot also use a roadLink.');
    if (link?.from?.roadId === link?.to?.roadId && link?.from?.end === link?.to?.end) issue('connection.self', `roadLinks.${link?.id}`, 'Cannot connect an endpoint to itself.');
  }
  if (Array.isArray(m.connectionPorts)) for (const port of m.connectionPorts) {
    const p = endpoint(port?.endpoint, `connectionPorts.${port?.id}`);
    if (!port || typeof port.label !== 'string' || !port.label) issue('port.invalid', `connectionPorts.${port?.id}`, 'Nonempty port label required.');
    if (port?.endpoint && Object.keys(port.endpoint).some(k => k !== 'roadId' && k !== 'end')) issue('connection.shape', `connectionPorts.${port.id}`, 'Port endpoint must be exactly {roadId,end}.');
    const e = port?.endpoint;
    if(port?.position && (!point(port.position)||p&&Math.hypot(port.position.x-p.x,port.position.z-p.z,(port.position.y??0)-(p.y??0))>0.2)) issue('port.endpointMismatch',`connectionPorts.${port.id}`,'Port pose differs from its actual endpoint.');
    if(port?.heading!==undefined) {
      const r=m.roads.find(r=>r.id===e?.roadId);
      if(!finite(port.heading)) issue('port.headingMismatch',`connectionPorts.${port.id}`,'Finite port heading required.');
      else if(r&&e&&r.centerline.length>=2&&r.centerline.every(point)) {
        if(directionalPortLabel(port.label,port.heading)!==port.label) issue('port.directionMismatch',`connectionPorts.${port.id}`,'Directional label does not match world heading.');
        const pts=roadPoints(r),a=e.end==='start'?pts[0]!:pts.at(-1)!,b=e.end==='start'?pts[1]!:pts.at(-2)!;
        const expected=Math.atan2(a.x-b.x,-(a.z-b.z));
        if(Math.abs(Math.atan2(Math.sin(port.heading-expected),Math.cos(port.heading-expected)))>0.05) issue('port.headingMismatch',`connectionPorts.${port.id}`,'Port heading differs from outward endpoint tangent.');
      }
    }
    if (p && e && !used.has(`${e.roadId}:${e.end}`) && !(Array.isArray(m.roadLinks) && m.roadLinks.some(l => [l?.from, l?.to].some(q => q?.roadId === e.roadId && q.end === e.end)))) {
      issue('port.unused', `connectionPorts.${port.id}`, `${port.label}: external endpoint reserved for future continuation.`, 'warning');
    }
  }
  m.objects.forEach((o, i) => {
    if (!o || !PREFAB_IDS.includes(o.prefabId) || !point(o.position) || !finite(o.rotation)) issue('prefab.invalid', `objects[${i}]`, 'Unknown prefab or invalid transform.');
    if (o?.scale && ![o.scale.x, o.scale.y, o.scale.z].every(v => finite(v) && v > 0 && v <= 20)) issue('scale.invalid', `objects[${i}]`, 'Scale axes must be positive and ≤20.');
    if (o?.color && !/^#[0-9a-f]{6}$/i.test(o.color)) issue('color.invalid', `objects[${i}]`, 'Color must be #RRGGBB.');
  });
  if (!m.environment || !Array.isArray(m.environment.districts) || !Array.isArray(m.environment.spawnPoints) || !m.environment.spawnPoints.length) issue('spawn.missing', 'environment', 'District array and at least one spawn required.');
  else for (const s of m.environment.spawnPoints) if (!s || typeof s.id !== 'string' || !point(s.position) || !finite(s.rotation)) issue('spawn.invalid', 'environment.spawnPoints', 'Invalid spawn.');
  if (errors.length === 0 && b) for (const e of [...m.roads.flatMap(r => r.centerline), ...m.intersections.map(j => j.position), ...m.objects.map(o => o.position)]) {
    if (e.x < b.minX || e.x > b.maxX || e.z < b.minZ || e.z > b.maxZ) { issue('bounds.outside', 'bounds', 'Elements outside bounds; expand before driving there.', 'warning'); break; }
  }
  if (!errors.length && m.roads.length > 1) {
    const parent = new Map(m.roads.map(r => [r.id, r.id]));
    const root = (id: string): string => {
      let current = id;
      while (parent.get(current) !== current) current = parent.get(current)!;
      while (id !== current) { const next = parent.get(id)!; parent.set(id, current); id = next; }
      return current;
    };
    const join = (a: string, b: string): void => { parent.set(root(a), root(b)); };
    for (const l of m.roadLinks ?? []) join(l.from.roadId, l.to.roadId);
    for (const j of m.intersections) for (const c of j.connections.slice(1)) join(j.connections[0]!.roadId, c.roadId);
    const components = new Set(m.roads.map(r => root(r.id))).size;
    if (components > 1) issue('network.sparse', 'roads', `${components} separate road components; projected crossings do not imply connectivity.`, 'warning');
  }
  if (!errors.length && m.environment.metadata?.productionGeometry === 'true') errors.push(...validatePresetGeometry(m));
  return result();
}
