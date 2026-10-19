import { newCityMap, type CityMapData, type CityRoad, type CityPoint, type CityIntersection, type RoadEndpoint, type IntersectionPort } from '../world/city/CityMapData';
import { createRoad, placePrefab } from '../world/city/MapAPI';
import { validateMap } from '../world/city/CityMapValidation';
import { connectionPoint, portsFor, refreshPortPoses, rotatePoint, syncConnections } from '../world/city/geometry';
import { setJunctionPavementFootprint } from '../world/city/JunctionSurface';
import { populateIntersectionMarkingMetadata } from '../world/city/MarkingOwnership';
import { roadFunction } from '../world/city/RoadClassification';
import { expandPreset } from '../world/city/presets/InfrastructurePresets';
import type { RoadSignDefinition } from '../world/city/RoadSignData';
import { adoptEditorMetadata } from './EditorMapMetadata';
import { CityEditorHistory } from './CityEditorHistory';
import { EDITOR_ROAD_PRESETS, type EditorCommand, type EditorArea, type EditorIssue, type EditSummary, type CrossingMode } from './EditorCommands';
import { bounds, union, overlaps, distance, project, slicePath, parallelPath, crossings, maxGrade, polylineLength, roadPoints, sampleAt, EditorSpatialIndex, cubicPath } from './EditorGeometry';
import { diagnoseMap, type DiagnosticReport, type DiagnosticScope } from './RoadDiagnostics';
import { cubicHandles, elevationRepairForRoad, gradeMetrics, repairElevation, simplifyPoints, smoothAlignment } from './RoadRepair';

const editing = (map: CityMapData): NonNullable<CityMapData['editing']> => map.editing ?? { corridors: [], groups: [], attachments: [], ramps: [] };
const endpoint = (map: CityMapData, e: RoadEndpoint): CityPoint => { const r = map.roads.find(r => r.id === e.roadId); if (!r) throw new Error(`Missing road ${e.roadId}`); return roadPoints({ ...r, curve: 'polyline' })[e.end === 'start' ? 0 : r.centerline.length - 1]!; };
const sameEnd = (a: RoadEndpoint, b: RoadEndpoint): boolean => a.roadId === b.roadId && a.end === b.end;
const areaOf = (e: CityRoad | CityIntersection | CityMapData['objects'][number]): EditorArea => 'centerline' in e ? bounds(roadPoints(e), e.laneCount * e.laneWidth / 2 + 10) : bounds([e.position], 40);

/** A private copy-on-write transaction. Only touched entities and small relationship tables are cloned. */
class EditTransaction {
  readonly map: CityMapData;
  readonly changed = new Set<string>();
  readonly notes: EditorIssue[] = [];
  readonly metrics: Record<string, unknown> = {};
  private used: Set<string>;
  constructor(readonly before: CityMapData, private readonly index: EditorSpatialIndex) {
    this.map = { ...before, bounds: { ...before.bounds }, roads: [...before.roads], intersections: [...before.intersections], objects: [...before.objects],
      signs: [...before.signs ?? []],roadLinks: structuredClone(before.roadLinks ?? []), connectionPorts: structuredClone(before.connectionPorts ?? []), editing: structuredClone(editing(before)) };
    this.used = new Set([...before.roads, ...before.intersections, ...before.objects,...before.signs??[], ...before.roadLinks ?? [], ...before.connectionPorts ?? [], ...editing(before).corridors, ...editing(before).groups, ...editing(before).ramps, ...editing(before).attachments].map(e => e.id));
  }
  id(base: string, explicit = false): string { let id = base, n = 2; if (explicit && this.used.has(id)) throw new Error(`ID already exists: ${id}`); while (this.used.has(id)) id = `${base}-${n++}`; this.used.add(id); return id; }
  record(id: string, value: Record<string, unknown>): void {
    const previous = this.metrics[id];
    this.metrics[id] = previous && typeof previous === 'object' && !Array.isArray(previous) ? { ...(previous as Record<string, unknown>), ...value } : value;
  }
  /** Name references are semantic, independent of the road carrying the sign. */
  remapSignNames(oldIds: Set<string>, nameId: string): void {
    if (!oldIds.size) return;
    this.map.signs = this.map.signs!.map(sign => {
      let changed = false;
      const destinations = sign.destinations.map(destination => {
        const roadNameId = oldIds.has(destination.roadNameId) ? nameId : destination.roadNameId;
        const directionId = destination.directionId && oldIds.has(destination.directionId) ? nameId : destination.directionId;
        if (roadNameId === destination.roadNameId && directionId === destination.directionId) return destination;
        changed = true; return { ...destination, roadNameId, ...(destination.directionId ? { directionId } : {}) };
      });
      const next = { ...sign, destinations };
      if (sign.approachRoadNameId && oldIds.has(sign.approachRoadNameId)) { next.approachRoadNameId = nameId; changed = true; }
      if (sign.interchangeId && oldIds.has(sign.interchangeId)) { next.interchangeId = nameId; changed = true; }
      if (changed) this.changed.add(sign.id);
      return changed ? next : sign;
    });
  }
  assertUnlocked(id: string): void {
    const group = editing(this.map).groups.find(g => g.locked && (g.id === id || g.memberIds.includes(id)));
    if (group) throw new Error(`Locked group ${group.name}: unlock before editing ${id}`);
  }
  road(id: string): CityRoad {
    this.assertUnlocked(id); const i = this.map.roads.findIndex(r => r.id === id); if (i < 0) throw new Error(`Missing road ${id}`);
    if (!this.changed.has(id)) { this.map.roads[i] = structuredClone(this.map.roads[i]!); this.changed.add(id); }
    return this.map.roads[i]!;
  }
  junction(id: string): CityIntersection {
    this.assertUnlocked(id); const i = this.map.intersections.findIndex(j => j.id === id); if (i < 0) throw new Error(`Missing intersection ${id}`);
    if (!this.changed.has(id)) { this.map.intersections[i] = structuredClone(this.map.intersections[i]!); this.changed.add(id); }
    return this.map.intersections[i]!;
  }
  roadsFor(id: string): CityRoad[] {
    const corridor = editing(this.map).corridors.find(c => c.id === id);
    const group=editing(this.map).groups.find(g=>g.id===id);
    return (corridor ? corridor.roadIds : group ? group.memberIds.filter(id=>this.map.roads.some(r=>r.id===id)) : [id]).map(id => this.road(id));
  }
  nearby(area: EditorArea): CityRoad[] {
    const ids = new Set([...this.index.query(area), ...this.changed]);
    return this.map.roads.filter(r => ids.has(r.id) && overlaps(areaOf(r), area));
  }
  detach(e: RoadEndpoint): void {
    for (const j of this.map.intersections) if (j.connections.some(c => sameEnd(c, e))) this.junction(j.id).connections = j.connections.filter(c => !sameEnd(c, e));
    this.map.roadLinks = this.map.roadLinks!.filter(l => !sameEnd(l.from, e) && !sameEnd(l.to, e));
  }
  link(from: RoadEndpoint, to: RoadEndpoint): void {
    this.assertUnlocked(from.roadId);this.assertUnlocked(to.roadId);
    if (sameEnd(from, to)) throw new Error('Cannot connect an endpoint to itself');
    if (this.map.intersections.some(j => j.connections.some(c => sameEnd(c, from) || sameEnd(c, to)))) throw new Error('Intersection owns this endpoint');
    const a = endpoint(this.map, from), b = endpoint(this.map, to);
    if (Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z) > 0.2) throw new Error('Connection endpoints must coincide in XYZ');
    if (!this.map.roadLinks!.some(l => sameEnd(l.from, from) && sameEnd(l.to, to) || sameEnd(l.from, to) && sameEnd(l.to, from)))
      this.map.roadLinks!.push({ id: this.id('link'), from: { ...from }, to: { ...to } });
  }
  remapEnd(id: string, to: string): void {
    const remap = (e: RoadEndpoint) => { if (e.roadId === id && e.end === 'end') e.roadId = to; };
    for (const l of this.map.roadLinks!) { remap(l.from); remap(l.to); }
    for (const j of this.map.intersections) if (j.connections.some(c => c.roadId === id && c.end === 'end')) for (const c of this.junction(j.id).connections) remap(c);
    for (const p of this.map.connectionPorts!) remap(p.endpoint);
    for (const ramp of editing(this.map).ramps) { remap(ramp.from); remap(ramp.to); }
  }
  remapCollections(id:string,replacements:string[]):void {
    if(this.map.regional){
      // Route/service membership is authoring metadata, separate from explicit drivable endpoint links.
      if(this.map.regional===this.before.regional)this.map.regional=structuredClone(this.map.regional);
      const regional=this.map.regional,h=regional.highways;
      for(const collection of [regional.routes,regional.structures,regional.exits,h?.routes??[],h?.junctions??[],h?.exits??[],h?.services??[]])for(const item of collection)if(item.roadIds.includes(id)){const next=[...new Set(item.roadIds.flatMap(old=>old===id?replacements:[old]))];if(!next.length)throw new Error(`Cannot remove the last road referenced by regional record ${item.id}`);item.roadIds=next;}
    }
    if(this.map.environment.landmarks?.some(l=>l.roadIds.includes(id))){this.map.environment={...this.map.environment,landmarks:this.map.environment.landmarks.map(l=>({...l,roadIds:[...new Set(l.roadIds.flatMap(old=>old===id?replacements:[old]))]})).filter(l=>l.roadIds.length)};}
  }
  split(id: string, point: CityPoint): { from: RoadEndpoint; to: RoadEndpoint } {
    const road = this.road(id), points = roadPoints(road), q = project(points, point), length = polylineLength(points);
    if (q.distance > 0.25 || Math.abs((q.point.y ?? 0) - (point.y ?? q.point.y ?? 0)) > 0.25) throw new Error('Split point must lie on the road in XYZ');
    if (q.along < 0.1) return { from: { roadId: id, end: 'start' }, to: { roadId: id, end: 'start' } };
    if (q.along > length - 0.1) return { from: { roadId: id, end: 'end' }, to: { roadId: id, end: 'end' } };
    const after = { ...structuredClone(road), id: this.id(`${id}-section`), centerline: slicePath(points, q.along, length), curve: 'polyline' as const, elevationMode: 'custom' as const };
    road.centerline = slicePath(points, 0, q.along); road.curve = 'polyline'; road.elevationMode = 'custom';
    this.remapEnd(id, after.id); this.map.roads.push(after); this.changed.add(after.id);
    this.remapCollections(id,[id,after.id]);
    if(editing(this.map).curves?.[id])delete editing(this.map).curves![id];
    this.map.signs=this.map.signs!.map(sign=>{
      if(sign.roadId!==id)return sign;
      const station=sign.stationMetres??project(points,sign.position).along;
      const next={...structuredClone(sign),stationMetres:station>q.along?station-q.along:station,roadId:station>q.along?after.id:id};
      if(next.incomingRoadId===id)next.incomingRoadId=next.roadId;
      this.changed.add(sign.id);return next;
    });
    for (const c of editing(this.map).corridors) if (c.roadIds.includes(id)) c.roadIds.splice(c.roadIds.indexOf(id) + 1, 0, after.id);
    for (const g of editing(this.map).groups) if (g.memberIds.includes(id)) g.memberIds.push(after.id);
    const from: RoadEndpoint = { roadId: id, end: 'end' }, to: RoadEndpoint = { roadId: after.id, end: 'start' }; this.link(from, to);
    return { from, to };
  }
  addRoad(command: Extract<EditorCommand, { op: 'createRoad' }>): CityRoad {
    const id = this.id(command.id ?? 'road', !!command.id);
    const fragment = newCityMap();
    const r = createRoad(fragment, { ...structuredClone(EDITOR_ROAD_PRESETS[command.preset ?? 'local'].properties), ...structuredClone(command.properties), id, type: undefined,
      centerline: command.points, curve: command.properties?.curve ?? (command.points.length > 2 ? 'smooth' : 'polyline') });
    this.map.roads.push(r); this.changed.add(id);
    if (command.corridorId) { const c = editing(this.map).corridors.find(c => c.id === command.corridorId); if (!c) throw new Error(`Missing corridor ${command.corridorId}`); c.roadIds.push(id); }
    return r;
  }
  intersection(position: CityPoint, roadIds: string[], signalized = true, explicitId?: string): CityIntersection {
    let j = this.map.intersections.find(j => distance(j.position, position) < 8 && Math.abs((j.position.y ?? 0) - (position.y ?? 0)) < 0.5);
    if (j) j = this.junction(j.id);
    else { j = { id: this.id(explicitId ?? 'intersection', !!explicitId), type: 'irregular', position: { ...position }, rotation: 0, connections: [], signalized,
      signals: { profile: 'lane-countdown', headHeight: 7.2 }, portAngles: {}, approachOffsets: {}, markingFootprint: { kind: 'junction', margin: 0.4 } }; this.map.intersections.push(j); this.changed.add(j.id); }
    // One pavement object can own up to six arms, including both divided carriageways.
    const arms: RoadEndpoint[] = [];
    for (const id of [...new Set(roadIds)]) {
      const r = this.road(id), points = roadPoints(r), q = project(points, position), length = polylineLength(points);
      if (q.distance > Math.max(25, r.laneCount * r.laneWidth) || Math.abs((q.point.y ?? 0) - (position.y ?? 0)) > 0.5) throw new Error('Impossible intersection: approaches must share elevation and location');
      const cut = this.split(id, q.point); arms.push(cut.from); if (!sameEnd(cut.from, cut.to)) arms.push(cut.to);
      if (length < 4) throw new Error('Intersection approach is too short');
    }
    const count = j.connections.length + arms.filter(a => !j!.connections.some(c => sameEnd(c, a))).length;
    if (count > 6) throw new Error('This foundation supports at most six junction arms');
    j.type = count <= 3 ? 't_4lane' : count === 4 ? 'cross_4lane' : count === 5 ? 'irregular' : 'divided_cross';
    const allPorts: IntersectionPort[] = portsFor(j);
    // Each mouth must clear the actual ribbon of every non-parallel approach.
    // This is what makes skewed junctions and divided carriageways irregular
    // instead of forcing one square footprint around the centerline crossing.
    interface ArmInfo { pts: CityPoint[]; len: number; start: boolean; half: number; outward: CityPoint; mouth: CityPoint; }
    const info = new Map<RoadEndpoint, ArmInfo>();
    for (const arm of arms) {
      if (j.connections.some(c => sameEnd(c, arm))) continue;
      const r = this.road(arm.roadId), pts = roadPoints(r), len = polylineLength(pts), start = arm.end === 'start', q = project(pts, position);
      const half = r.laneCount * r.laneWidth / 2 + Math.max(r.shoulders?.left ?? 0, r.shoulders?.right ?? 0);
      const mouth = sampleAt(pts, Math.max(0, Math.min(len, q.along))).point;
      const a = start ? pts[0]! : pts.at(-1)!, b = start ? pts[1] ?? pts[0]! : pts.at(-2) ?? pts.at(-1)!;
      const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz) || 1;
      info.set(arm, { pts, len, start, half, outward: { x: dx / dl, z: dz / dl }, mouth });
    }
    const extentFor = (arm: RoadEndpoint): number => {
      const own = info.get(arm); if (!own) return 12;
      let needed = 8;
      for (const [other, oi] of info) {
        if (other.roadId === arm.roadId && other.end === arm.end) continue;
        const cross = own.outward.x * oi.outward.z - own.outward.z * oi.outward.x;
        if (Math.abs(cross) < 0.2) continue; // collinear continuation or parallel carriageway
        const px = oi.mouth.x - position.x, pz = oi.mouth.z - position.z;
        const along = Math.abs((px * oi.outward.z - pz * oi.outward.x) / cross);
        needed = Math.max(needed, along + oi.half / Math.abs(cross) + 3.2);
      }
      return Math.max(8, Math.min(80, needed));
    };
    for (const arm of arms) {
      if (j.connections.some(c => sameEnd(c, arm))) continue;
      const r = this.road(arm.roadId), pts = info.get(arm)!.pts, len = info.get(arm)!.len, start = arm.end === 'start', extent = extentFor(arm);
      const q = project(pts, position), cut = Math.min(len - 0.2, start ? q.along + extent : Math.max(0.2, q.along - extent));
      if (len < extent + 2) throw new Error('Intersection would leave a tiny approach; move crossing farther from the endpoint');
      const mouth = sampleAt(pts, cut).point, port = allPorts.find(p => !j!.connections.some(c => c.port === p))!;
      this.detach(arm); r.centerline = slicePath(pts, start ? cut : 0, start ? len : cut); r.curve = 'polyline'; r.elevationMode = 'custom';
      this.map.signs=this.map.signs!.map(s=>s.roadId===r.id?{...s,stationMetres:Math.max(0,Math.min(polylineLength(r.centerline),(s.stationMetres??project(pts,s.position).along)-(start?cut:0)))}:s);
      j.portAngles![port] = Math.atan2(mouth.x - position.x, -(mouth.z - position.z)) + j.rotation;
      const localMouth = rotatePoint({ x: mouth.x - position.x, z: mouth.z - position.z }, -j.rotation);
      j.approachOffsets![port] = { x: localMouth.x, y: (mouth.y ?? 0) - (position.y ?? 0), z: localMouth.z };
      (j.pavementHeights ??= {})[port] = mouth.y ?? position.y ?? 0;
      j.connections.push({ ...arm, port });
    }
    return j;
  }
  autoConnect(roadId: string, mode: CrossingMode): void {
    const r = this.road(roadId), pts = roadPoints(r), nearby = this.nearby(bounds(pts, 50)).filter(o => o.id !== roadId);
    // Endpoint continuations take priority; junction mouths are connected explicitly.
    for (const end of ['start', 'end'] as const) {
      const ep = endpoint(this.map, { roadId, end }); let connected = false;
      for (const j of this.map.intersections.filter(j => overlaps(bounds([j.position], 100), bounds([ep], 1)))) for (const port of portsFor(j)) {
        if (j.connections.some(c => c.port === port)) continue; const cp = connectionPoint(j, port, this.map);
        if (distance(cp, ep) < 0.2 && Math.abs((cp.y ?? 0) - (ep.y ?? 0)) < 0.2) { this.junction(j.id).connections.push({ roadId, end, port }); connected = true; break; }
      }
      if (connected) continue;
      for (const o of nearby) for (const otherEnd of ['start', 'end'] as const) {
        const target = { roadId: o.id, end: otherEnd }, op = endpoint(this.map, target);
        if (distance(ep, op) < 0.2 && Math.abs((ep.y ?? 0) - (op.y ?? 0)) < 0.2 && !this.map.intersections.some(j => j.connections.some(c => sameEnd(c, target)))) this.link({ roadId, end }, target);
      }
    }
    const candidates = nearby.flatMap(o => crossings(pts, roadPoints(o)).map(c => ({ ...c, other: o })));
    if (mode === 'overpass' || mode === 'underpass') {
      if(candidates.length){const stations=candidates.map(c=>project(pts,c.point).along),length=polylineLength(pts),h=mode==='overpass'?Math.max(...candidates.map(c=>c.otherY))+8:Math.min(...candidates.map(c=>c.otherY))-6;
        this.elevation(r,h,Math.max(0,Math.min(...stations)-15),Math.min(length,Math.max(...stations)+15),Math.max(120,Math.abs(h-(pts[0]!.y??0))*12.5));}
      return;
    }
    if (mode === 'none') return;
    const handled: CityPoint[] = [];
    for (const c of candidates) {
      if (Math.abs((c.point.y ?? 0) - c.otherY) > 0.5 || handled.some(p => distance(p, c.point) < 8)) continue;
      if (['expressway', 'ramp'].includes(roadFunction(r)) || ['expressway', 'ramp'].includes(roadFunction(c.other))) {
        this.notes.push({ severity: 'error', code: 'expressway.crossing', ids: [roadId, c.other.id], message: 'Choose overpass, underpass or an explicit ramp; controlled-access crossing cannot become an ordinary junction.' }); continue;
      }
      if (this.map.roadLinks!.some(l => [l.from.roadId, l.to.roadId].includes(roadId) && [l.from.roadId, l.to.roadId].includes(c.other.id))) continue;
      const pair=c.other.travelDirection!=='two-way'&&c.other.roadNameId?candidates.filter(other=>other.other.id!==c.other.id&&other.other.roadNameId===c.other.roadNameId&&other.other.travelDirection!=='two-way'&&distance(other.point,c.point)<50&&Math.abs(other.otherY-c.otherY)<0.5):[];
      const position=pair.length?{x:(c.point.x+pair[0]!.point.x)/2,y:c.point.y,z:(c.point.z+pair[0]!.point.z)/2}:c.point;
      const local = this.nearby(bounds([position], 35)).filter(o => (project(roadPoints(o), position).distance < 0.3||pair.some(p=>p.other.id===o.id)||o.id===c.other.id) && Math.abs((project(roadPoints(o), position).point.y ?? 0) - c.otherY) < 0.5);
      this.intersection(position, local.map(o => o.id)); handled.push(c.point,...pair.map(p=>p.point));
    }
  }
  elevation(r: CityRoad, height: number, start?: number, end?: number, transition = 100, profile?: { distance: number; height: number }[]): void {
    const pts = roadPoints(r), length = polylineLength(pts);
    if (start === undefined && end === undefined && !profile) { this.detach({ roadId: r.id, end: 'start' }); this.detach({ roadId: r.id, end: 'end' }); r.centerline = r.centerline.map(p => ({ ...p, y: height })); }
    else {
      const a = start ?? 0, b = end ?? length;
      if (a < 0 || b > length || a >= b || transition <= 0) throw new Error('Elevation section requires 0 ≤ start < end ≤ road length and positive transition');
      if (profile && (profile.length < 2 || profile.some((p, i) => !Number.isFinite(p.distance) || !Number.isFinite(p.height) || p.distance < 0 || p.distance > length || i > 0 && p.distance <= profile[i - 1]!.distance))) throw new Error('Profile needs increasing distances within the road');
      const stations = new Set([0, length, a, b, Math.max(0, a - transition), Math.min(length, b + transition), ...(profile?.map(p => p.distance) ?? [])]);
      for (let d = 0; d < length; d += 5) stations.add(d);
      r.centerline = [...stations].sort((x, y) => x - y).map(d => {
        const p = sampleAt(pts, d).point;
        if (profile) { const sorted = profile; const i = Math.max(0, sorted.findIndex(p => p.distance >= d)); const right = sorted[i]!, left = sorted[Math.max(0, i - 1)]!;
          p.y = d >= sorted.at(-1)!.distance ? sorted.at(-1)!.height : left.height + (right.height - left.height) * (right.distance === left.distance ? 0 : (d - left.distance) / (right.distance - left.distance));
        } else { const t = d < a ? Math.max(0, 1 - (a - d) / transition) : d > b ? Math.max(0, 1 - (d - b) / transition) : 1; const s = t * t * (3 - 2 * t); p.y = (p.y ?? 0) + (height - (p.y ?? 0)) * s; }
        return p;
      }); r.curve = 'polyline';
      if (Math.abs((r.centerline[0]!.y ?? 0) - (pts[0]!.y ?? 0)) > 0.01) this.detach({ roadId: r.id, end: 'start' });
      if (Math.abs((r.centerline.at(-1)!.y ?? 0) - (pts.at(-1)!.y ?? 0)) > 0.01) this.detach({ roadId: r.id, end: 'end' });
    }
    r.elevationMode = 'custom'; r.elevation = height;
    r.structure = { ...r.structure, piersEnabled: height > 2.5, barrierEnabled: height !== 0, ...(height < 0 ? { enclosure: { kind: 'cutting' as const, clearance: 5.5 } } : {}) };
    if (height >= 0 && r.structure.enclosure?.kind === 'cutting') delete r.structure.enclosure;
  }
  delete(id: string): void {
    this.assertUnlocked(id);
    this.detach({ roadId: id, end: 'start' }); this.detach({ roadId: id, end: 'end' });
    this.map.roads = this.map.roads.filter(r => r.id !== id); this.map.objects = this.map.objects.filter(o => o.id !== id); this.map.intersections = this.map.intersections.filter(j => j.id !== id);
    this.map.connectionPorts = this.map.connectionPorts!.filter(p => p.endpoint.roadId !== id);
    if (this.map.signs) this.map.signs = this.map.signs.filter(s => s.roadId !== id).map(s=>{
      if(s.incomingRoadId!==id&&!s.outgoingRoadIds?.includes(id))return s;
      this.changed.add(s.id);return{...s,incomingRoadId:s.incomingRoadId===id?undefined:s.incomingRoadId,outgoingRoadIds:s.outgoingRoadIds?.filter(r=>r!==id)};
    });
    this.remapCollections(id,[]);
    for (const c of editing(this.map).corridors) c.roadIds = c.roadIds.filter(r => r !== id);
    for (const g of editing(this.map).groups) g.memberIds = g.memberIds.filter(r => r !== id);
    editing(this.map).attachments = editing(this.map).attachments.filter(a => a.roadId !== id && a.sourceRoadId !== id);
    editing(this.map).ramps = editing(this.map).ramps.filter(r => r.roadId !== id && r.from.roadId !== id && r.to.roadId !== id);
    if(editing(this.map).curves?.[id])delete editing(this.map).curves![id];
    this.changed.add(id);
  }
  directionalInterchange(c:Extract<EditorCommand,{op:'createInterchange'}>):void {
    const groupId=this.id(c.parameters.groupId??'directional-t'),height=c.parameters.mainElevation??8;
    const mainIn=this.addRoad({op:'createRoad',id:`${groupId}-northbound`,preset:'expressway6',points:[{x:8,y:height,z:600},{x:8,y:height,z:-600}],properties:{laneCount:3,travelDirection:'forward'}});
    const mainOut=this.addRoad({op:'createRoad',id:`${groupId}-southbound`,preset:'expressway6',points:[{x:-8,y:height,z:-600},{x:-8,y:height,z:600}],properties:{laneCount:3,travelDirection:'forward'}});
    const branchOut=this.addRoad({op:'createRoad',id:`${groupId}-branch-out`,preset:'expressway6',points:[{x:100,y:0,z:8},{x:650,y:0,z:8}],properties:{laneCount:2,travelDirection:'forward'}});
    const branchIn=this.addRoad({op:'createRoad',id:`${groupId}-branch-in`,preset:'expressway6',points:[{x:650,y:0,z:-8},{x:100,y:0,z:-8}],properties:{laneCount:2,travelDirection:'forward'}});
    const families=[mainIn.id,mainOut.id,branchOut.id,branchIn.id];
    const locate=(family:string,point:CityPoint)=>{const candidates=this.map.roads.filter(r=>r.id===family||r.id.startsWith(family+'-section')).map(r=>({id:r.id,q:project(roadPoints(r),point)})).sort((a,b)=>a.q.distance-b.q.distance);return candidates[0]!;};
    const movements=[{a:mainIn.id,p:{x:8,y:height,z:400},b:branchOut.id,q:{x:300,y:0,z:8},kind:'off' as const},{a:mainOut.id,p:{x:-8,y:height,z:-400},b:branchOut.id,q:{x:400,y:0,z:8},kind:'off' as const},{a:branchIn.id,p:{x:400,y:0,z:-8},b:mainIn.id,q:{x:8,y:height,z:-400},kind:'on' as const},{a:branchIn.id,p:{x:300,y:0,z:-8},b:mainOut.id,q:{x:-8,y:height,z:400},kind:'on' as const}];
    const initial=new Set(this.map.roads.map(r=>r.id));
    for(const movement of movements){const a=locate(movement.a,movement.p),b=locate(movement.b,movement.q);this.execute({op:'createRamp',fromRoadId:a.id,toRoadId:b.id,fromDistance:a.q.along,toDistance:b.q.along,kind:movement.kind,lanes:(c.parameters.rampLaneCount??1) as 1|2});}
    for(const r of [...this.map.roads])if((r.id===branchOut.id||r.id.startsWith(branchOut.id+'-section'))&&Math.abs(r.centerline[0]!.x-100)<0.01||(r.id===branchIn.id||r.id.startsWith(branchIn.id+'-section'))&&Math.abs(r.centerline.at(-1)!.x-100)<0.01)this.delete(r.id);
    const ids=new Set([...families.filter(id=>this.map.roads.some(r=>r.id===id)),...this.map.roads.filter(r=>!initial.has(r.id)).map(r=>r.id)]),angle=c.parameters.rotation??0,position=c.parameters.position??{x:0,y:0,z:0};
    const transform=(p:CityPoint):CityPoint=>({x:position.x+p.x*Math.cos(angle)+p.z*Math.sin(angle),y:(position.y??0)+(p.y??0),z:position.z-p.x*Math.sin(angle)+p.z*Math.cos(angle)});
    for(const r of this.map.roads)if(ids.has(r.id)){r.groupId=groupId;r.centerline=r.centerline.map(transform);if(editing(this.map).curves?.[r.id])editing(this.map).curves![r.id]=editing(this.map).curves![r.id]!.map(transform);}
    editing(this.map).groups.push({id:groupId,name:'Directional T / Y',kind:'interchange',memberIds:[...ids],locked:false});this.changed.add(groupId);
    for(const id of families)for(const end of ['start','end'] as const){const parts=this.map.roads.filter(r=>r.id===id||r.id.startsWith(id+'-section'));const target=end==='start'?parts[0]!:parts.at(-1)!;const e={roadId:target.id,end};if(!this.map.roadLinks!.some(l=>sameEnd(l.from,e)||sameEnd(l.to,e)))this.map.connectionPorts!.push({id:this.id('port'),label:`${id} ${end}`,endpoint:e,groupId});}
  }
  /** Rebuild one junction from its real approach mouths, without deleting it. */
  repairJunction(j: CityIntersection, options: { rebuildFootprint?: boolean; rebuildMarkings?: boolean; approachMargin?: number } = {}): Record<string, unknown> {
    const margin = options.approachMargin ?? 3.2;
    const readArms = () => j.connections.flatMap(c => {
      const r = this.map.roads.find(r => r.id === c.roadId); if (!r) return [];
      const pts = roadPoints(r), start = c.end === 'start';
      const mouth = start ? pts[0]! : pts.at(-1)!;
      const neighbour = start ? pts[1] ?? pts[0]! : pts.at(-2) ?? pts.at(-1)!;
      const dx = neighbour.x - mouth.x, dz = neighbour.z - mouth.z, length = Math.hypot(dx, dz) || 1;
      const half = r.laneCount * r.laneWidth / 2 + Math.max(r.shoulders?.left ?? 0, r.shoulders?.right ?? 0);
      return [{ c, r, pts, start, mouth, outward: { x: dx / length, z: dz / length }, half, along: 0 }];
    });
    let arms = readArms();
    const before = arms.map(a => ({ roadId: a.r.id, along: Math.round((a.mouth.x - j.position.x) * a.outward.x + (a.mouth.z - j.position.z) * a.outward.z) }));
    for (const arm of arms) arm.along = (arm.mouth.x - j.position.x) * arm.outward.x + (arm.mouth.z - j.position.z) * arm.outward.z;
    const needs = new Map<string, number>();
    for (const arm of arms) {
      let needed = 8;
      for (const other of arms) {
        if (other.r.id === arm.r.id && other.c.end === arm.c.end) continue;
        const cross = arm.outward.x * other.outward.z - arm.outward.z * other.outward.x;
        if (Math.abs(cross) < 0.2) continue;
        const px = other.mouth.x - j.position.x, pz = other.mouth.z - j.position.z;
        const along = Math.abs((px * other.outward.z - pz * other.outward.x) / cross);
        needed = Math.max(needed, along + other.half / Math.abs(cross) + margin);
      }
      needs.set(`${arm.r.id}:${arm.c.end}`, Math.max(8, Math.min(80, needed)));
    }
    for (const arm of arms) {
      const needed = needs.get(`${arm.r.id}:${arm.c.end}`)!;
      if (needed <= arm.along + 0.05) continue;
      const delta = needed - arm.along;
      if (polylineLength(arm.pts) - delta < 8) continue;
      const outwardPath = arm.start ? arm.pts : [...arm.pts].reverse();
      const kept = slicePath(outwardPath, delta, polylineLength(outwardPath));
      const r = this.road(arm.r.id);
      r.centerline = arm.start ? kept : kept.reverse();
      r.curve = 'polyline'; r.elevationMode = 'custom'; this.changed.add(r.id);
      if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves![r.id];
    }
    arms = readArms();
    j.portAngles = {}; j.approachOffsets = {}; j.pavementHeights = {};
    for (const arm of arms) {
      if (arm.c.port === undefined) continue;
      const localMouth = rotatePoint({ x: arm.mouth.x - j.position.x, z: arm.mouth.z - j.position.z }, -j.rotation);
      j.portAngles[arm.c.port] = Math.atan2(arm.outward.x, -arm.outward.z) + j.rotation;
      j.approachOffsets[arm.c.port] = { x: localMouth.x, y: (arm.mouth.y ?? 0) - (j.position.y ?? 0), z: localMouth.z };
      j.pavementHeights[arm.c.port] = arm.mouth.y ?? j.position.y ?? 0;
    }
    delete j.approaches;
    setJunctionPavementFootprint(j, this.map);
    if (options.rebuildMarkings !== false) populateIntersectionMarkingMetadata({ ...this.map, intersections: [j] });
    const after = arms.map(a => ({ roadId: a.r.id, along: Math.round((a.mouth.x - j.position.x) * a.outward.x + (a.mouth.z - j.position.z) * a.outward.z) }));
    const area = (j.pavementFootprint ?? []).reduce((sum, p, i, list) => { const q = list[(i + 1) % list.length]!; return sum + p.x * q.z - q.x * p.z; }, 0) / 2;
    return { arms: arms.length, beforeApproachExtents: before, afterApproachExtents: after, footprintPoints: j.pavementFootprint?.length ?? 0, pavementArea: Math.round(Math.abs(area)) };
  }

  execute(c: EditorCommand): void {
    switch (c.op) {
      case 'modifyMap': {Object.assign(this.map,structuredClone(c.properties));if(c.spawn)this.map.environment={...this.map.environment,spawnPoints:[{...this.map.environment.spawnPoints[0]!,...structuredClone(c.spawn)},...this.map.environment.spawnPoints.slice(1)]};break;}
      case 'createRoad': { const r = this.addRoad(c); this.autoConnect(r.id, c.crossing ?? 'intersection'); break; }
      case 'extendRoad': { const r = this.road(c.roadId); this.detach({ roadId: r.id, end: c.end }); r.centerline = c.end === 'end' ? [...r.centerline, ...structuredClone(c.points)] : [...structuredClone(c.points), ...r.centerline]; if(editing(this.map).curves?.[r.id])delete editing(this.map).curves![r.id]; this.autoConnect(r.id, c.crossing ?? 'intersection'); break; }
      case 'moveRoad': case 'moveCorridor': {
        const roads = this.roadsFor(c.id), ids = new Set(roads.map(r => r.id));
        for (const a of editing(this.map).attachments) if (ids.has(a.sourceRoadId)) { ids.add(a.roadId); roads.push(this.road(a.roadId)); }
        for (const j of this.map.intersections) if (j.connections.length && j.connections.every(e => ids.has(e.roadId))) { const w = this.junction(j.id); w.position = { x: w.position.x + c.delta.x, y: (w.position.y ?? 0) + (c.delta.y ?? 0), z: w.position.z + c.delta.z }; }
        for (const r of roads) {
          for (const end of ['start', 'end'] as const) {
            const e = { roadId: r.id, end }; const owned = this.map.intersections.some(j => j.connections.some(o => sameEnd(o, e)) && j.connections.every(o => ids.has(o.roadId)));
            if (!owned) { for (const j of this.map.intersections) if (j.connections.some(o => sameEnd(o, e))) this.junction(j.id).connections = j.connections.filter(o => !sameEnd(o, e)); }
          }
          r.centerline = roadPoints({ ...r, curve: 'polyline' }).map(p => ({ x: p.x + c.delta.x, y: (p.y ?? 0) + (c.delta.y ?? 0), z: p.z + c.delta.z })); r.elevationMode = 'custom';
          const controls=editing(this.map).curves?.[r.id];if(controls)editing(this.map).curves![r.id]=controls.map(p=>({x:p.x+c.delta.x,y:(p.y??0)+(c.delta.y??0),z:p.z+c.delta.z}));
        }
        this.map.roadLinks = this.map.roadLinks!.filter(l => ids.has(l.from.roadId) === ids.has(l.to.roadId)); break;
      }
      case 'editControlPoint': {
        const r=this.road(c.roadId),controls=editing(this.map).curves?.[r.id];
        if(controls){if(!controls[c.index])throw new Error('Control handle missing');if(c.index===0||c.index===3)throw new Error('Move ramp merge points through road connections; edit its two tangent handles');controls[c.index]={...c.point};r.centerline=cubicPath(controls);}
        else{if(!r.centerline[c.index])throw new Error('Control point index missing');const isEnd=c.index===0||c.index===r.centerline.length-1;if(isEnd)this.detach({roadId:r.id,end:c.index===0?'start':'end'});r.centerline=roadPoints({...r,curve:'polyline'});r.centerline[c.index]={...c.point};r.elevationMode='custom';if(isEnd)this.autoConnect(r.id,'intersection');}break;
      }
      case 'splitRoad': this.split(c.roadId, c.point); break;
      case 'mergeRoads': {
        const a = this.road(c.roadIds[0]), b = this.road(c.roadIds[1]);
        if (a.id === b.id || distance(endpoint(this.map, { roadId: a.id, end: 'end' }), endpoint(this.map, { roadId: b.id, end: 'start' })) > 0.2 || a.laneCount !== b.laneCount || a.laneWidth !== b.laneWidth || a.travelDirection !== b.travelDirection || roadFunction(a) !== roadFunction(b)) throw new Error('Merge requires compatible ordered end/start roads');
        if(Math.abs((roadPoints(a).at(-1)!.y??0)-(roadPoints(b)[0]!.y??0))>0.2)throw new Error('Merge endpoints must share elevation');
        if (this.map.intersections.some(j => j.connections.some(e => e.roadId === a.id && e.end === 'end' || e.roadId === b.id && e.end === 'start')) || this.map.roadLinks!.some(l => [l.from,l.to].some(e => e.roadId === b.id && e.end === 'start' || e.roadId === a.id && e.end === 'end') && [l.from,l.to].some(e => e.roadId !== a.id && e.roadId !== b.id))) throw new Error('Merge would remove a branching or intersection connection');
        const aLength=polylineLength(roadPoints(a));
        // The surviving road keeps its own logical name; if it had none, adopt
        // the merged continuation's name instead of inventing a duplicate.
        if(!a.roadNameId&&b.roadNameId)a.roadNameId=b.roadNameId;
        a.centerline = [...roadPoints(a), ...roadPoints(b).slice(1)]; a.curve = 'polyline'; a.elevationMode = 'custom';if(editing(this.map).curves?.[a.id])delete editing(this.map).curves![a.id];
        this.map.signs=this.map.signs!.map(sign=>{if(sign.roadId!==b.id)return sign;this.changed.add(sign.id);return{...sign,roadId:a.id,stationMetres:(sign.stationMetres??project(roadPoints(b),sign.position).along)+aLength,incomingRoadId:sign.incomingRoadId===b.id?a.id:sign.incomingRoadId};});
        this.detach({ roadId: a.id, end: 'end' }); this.detach({ roadId: b.id, end: 'start' }); this.remapEnd(b.id, a.id);
        this.remapCollections(b.id,[a.id]);
        for (const corridor of editing(this.map).corridors) corridor.roadIds = [...new Set(corridor.roadIds.map(id => id === b.id ? a.id : id))];
        for(const group of editing(this.map).groups)group.memberIds=[...new Set(group.memberIds.map(id=>id===b.id?a.id:id))];
        this.map.signs=this.map.signs!.map(s=>s.incomingRoadId===b.id||s.outgoingRoadIds?.includes(b.id)?{...s,incomingRoadId:s.incomingRoadId===b.id?a.id:s.incomingRoadId,outgoingRoadIds:s.outgoingRoadIds?.map(id=>id===b.id?a.id:id)}:s);
        this.delete(b.id); break;
      }
      case 'connectRoads': this.road(c.from.roadId); this.road(c.to.roadId); this.link(c.from, c.to); break;
      case 'deleteRoad': case 'deleteObject': this.delete(c.id); break;
      case 'createCorridor': {
        for (const id of c.roadIds) this.road(id);
        const id = this.id(c.id ?? 'corridor', !!c.id); editing(this.map).corridors.push({ id, name: c.name, roadIds: [...new Set(c.roadIds)], district: c.district }); this.changed.add(id); break;
      }
      case 'createParallelRoad': case 'generateFrontageRoads': {
        if (!Number.isFinite(c.offset) || c.offset <= 0) throw new Error('Offset must be positive');
        const sources = [...this.roadsFor(c.id)], sides = c.op === 'generateFrontageRoads' && c.side === 'both' ? ['left', 'right'] as const : [c.side];
        for (const side of sides) {
          const ids: string[] = [];
          for (const source of sources) {
            const offset = c.offset * (side === 'left' ? -1 : 1), r = this.addRoad({ op: 'createRoad', preset: c.preset ?? (c.op === 'generateFrontageRoads' ? 'frontage2' : 'local'), points: parallelPath(source, offset).map(p=>c.elevation===undefined?p:{...p,y:c.elevation}), properties: { curve: 'polyline',...(c.op==='generateFrontageRoads'?{roadClass:'frontage'}:{}) } }); ids.push(r.id);
            if(c.offset<(source.laneCount*source.laneWidth+r.laneCount*r.laneWidth)/2)this.notes.push({severity:'warning',code:'parallel.overlap',ids:[source.id,r.id],message:'Parallel pavement overlaps the source; increase offset unless this is intentional'});
            if (c.op === 'generateFrontageRoads' || c.attached) editing(this.map).attachments.push({ id: this.id('attachment'), sourceRoadId: source.id, roadId: r.id, offset });
          }
          const id = this.id('parallel-corridor'); editing(this.map).corridors.push({ id, name: `${c.id} ${side}`, roadIds: ids }); this.changed.add(id);
          for (let i = 1; i < ids.length; i++) { const from = { roadId: ids[i - 1]!, end: 'end' as const }, to = { roadId: ids[i]!, end: 'start' as const }; if (distance(endpoint(this.map, from), endpoint(this.map, to)) < 0.2) this.link(from, to); }
        } break;
      }
      case 'detach': { const ids = new Set(this.roadsFor(c.id).map(r => r.id)); editing(this.map).attachments = editing(this.map).attachments.filter(a => !ids.has(a.roadId)); break; }
      case 'createRamp': {
        if (c.fromRoadId === c.toRoadId) throw new Error('Select distinct ramp roads');
        const fromRoad = this.road(c.fromRoadId), toRoad = this.road(c.toRoadId), fp = roadPoints(fromRoad), tp = roadPoints(toRoad);
        if (c.fromDistance < 0 || c.fromDistance > polylineLength(fp) || c.toDistance < 0 || c.toDistance > polylineLength(tp)) throw new Error('Ramp distances are outside road lengths');
        const a = sampleAt(fp, c.fromDistance), b = sampleAt(tp, c.toDistance), span = distance(a.point, b.point), handle = Math.max(25, span * 0.4);
        if (span < 10) throw new Error('Ramp endpoints need at least 10m separation');
        const signA = fromRoad.travelDirection === 'reverse' ? -1 : 1, signB = toRoad.travelDirection === 'reverse' ? -1 : 1;
        const controls = [a.point, { x: a.point.x + a.tangent.x * handle * signA, y: a.point.y, z: a.point.z + a.tangent.z * handle * signA }, { x: b.point.x - b.tangent.x * handle * signB, y: b.point.y, z: b.point.z - b.tangent.z * handle * signB }, b.point];
        // Cubic horizontal alignment with a smooth monotonic vertical transition.
        const points = cubicPath(controls);
        const fromCut = this.split(fromRoad.id, a.point), toCut = this.split(toRoad.id, b.point);
        const from = signA > 0 ? fromCut.from : fromCut.to, to = signB > 0 ? toCut.to : toCut.from;
        const r = this.addRoad({ op: 'createRoad', id: c.id, preset: c.lanes === 2 ? 'ramp2' : 'ramp1', points, properties: { curve: 'polyline', structure: { barrierEnabled: true, piersEnabled: true, pierSpacing: 30 } } });
        this.link(from, { roadId: r.id, end: 'start' }); this.link({ roadId: r.id, end: 'end' }, to);
        (editing(this.map).curves??={})[r.id]=structuredClone(controls);
        editing(this.map).ramps.push({ id: this.id(`${r.id}-ramp`), roadId: r.id, kind: c.kind, from, to }); break;
      }
      case 'modifyRamp': { const ramp = editing(this.map).ramps.find(r => r.id === c.id || r.roadId === c.id); if (!ramp) throw new Error('Missing ramp'); const r = this.road(ramp.roadId); if (c.points) { const a = endpoint(this.map, ramp.from), b = endpoint(this.map, ramp.to); if (distance(c.points[0]!,a)>.2 || distance(c.points.at(-1)!,b)>.2) throw new Error('Ramp endpoint edits must preserve merge connections'); r.centerline = c.points.length===4?cubicPath(c.points):structuredClone(c.points);if(c.points.length===4)(editing(this.map).curves??={})[r.id]=structuredClone(c.points);else if(editing(this.map).curves?.[r.id])delete editing(this.map).curves![r.id]; } if (c.lanes) r.laneCount = c.lanes; if (c.kind) ramp.kind = c.kind; break; }
      case 'createIntersection': this.intersection(c.position, c.roadIds ?? this.nearby(bounds([c.position], 3)).filter(r => project(roadPoints(r), c.position).distance < 0.3).map(r => r.id), c.signalized, c.id); break;
      case 'modifyIntersection': { const j = this.junction(c.id); for (const e of [...j.connections, ...c.properties.connections ?? []]) this.road(e.roadId); Object.assign(j, structuredClone(c.properties)); break; }
      case 'changeRoadClass': for (const r of this.roadsFor(c.id)) r.roadClass = c.roadClass; break;
      case 'changeCrossSection': for (const r of this.roadsFor(c.id)) Object.assign(r, structuredClone(EDITOR_ROAD_PRESETS[c.preset].properties), structuredClone(c.properties), { type: undefined }); break;
      case 'setElevationProfile': for (const r of this.roadsFor(c.id)){this.elevation(r,c.height,c.start,c.end,c.transition,c.profile);if(editing(this.map).curves?.[r.id])delete editing(this.map).curves![r.id];} break;
      case 'modifyRoad': for (const r of this.roadsFor(c.id)) Object.assign(r, structuredClone(c.properties)); break;
      case 'placePreset': case 'createInterchange': {
        if(c.op==='createInterchange'&&c.template==='directional-t'){this.directionalInterchange(c);break;}
        const presetId = c.op === 'placePreset' ? c.presetId : ({ 'compact-diamond': 'diamond_interchange', diamond: 'diamond_interchange', 'directional-t': 'trumpet_interchange', 'ramp-pair': 'urban_side_access' } as const)[c.template];
        const defaults=c.op==='createInterchange'&&c.template==='compact-diamond'?{length:780,rampRadius:80}:{};
        const groupId = this.id(c.parameters.groupId ?? presetId), stamp = expandPreset(presetId, { ...defaults,...c.parameters, groupId });
        const names = new Map<string,string>(); for (const e of [...stamp.roads,...stamp.intersections,...stamp.objects,...stamp.roadLinks,...stamp.connectionPorts]) { const previous = e.id; e.id = this.id(previous); names.set(previous,e.id); this.changed.add(e.id); }
        const remap = (e: RoadEndpoint) => { e.roadId = names.get(e.roadId) ?? e.roadId; };
        for (const j of stamp.intersections) for (const e of j.connections) remap(e);
        for (const l of stamp.roadLinks) { remap(l.from); remap(l.to); } for (const p of stamp.connectionPorts) remap(p.endpoint);
        this.map.roads.push(...stamp.roads); this.map.intersections.push(...stamp.intersections); this.map.objects.push(...stamp.objects); this.map.roadLinks!.push(...stamp.roadLinks); this.map.connectionPorts!.push(...stamp.connectionPorts);
        editing(this.map).groups.push({ id: groupId, name: presetId, kind: 'interchange', locked: false, memberIds: [...stamp.roads,...stamp.intersections,...stamp.objects].map(e=>e.id) }); this.changed.add(groupId); break;
      }
      case 'createGroup': { const members=[...new Set(c.memberIds.flatMap(id=>editing(this.map).corridors.find(c=>c.id===id)?.roadIds??editing(this.map).groups.find(g=>g.id===id)?.memberIds??[id]))];for(const id of members){this.assertUnlocked(id);if(![...this.map.roads,...this.map.intersections,...this.map.objects].some(e=>e.id===id))throw new Error(`Missing group member ${id}`);}const id=this.id(c.id??'group',!!c.id);editing(this.map).groups.push({id,name:c.name,kind:c.kind,memberIds:members,locked:false});this.changed.add(id);break;}
      case 'setLocked': { const group = editing(this.map).groups.find(g => g.id === c.id); if (!group) throw new Error('Missing group'); group.locked = c.locked; this.changed.add(group.id); break; }
      case 'placeObject': { const fragment = newCityMap(), o = placePrefab(fragment, { ...c.properties, id: this.id(c.properties.id ?? c.properties.prefabId, !!c.properties.id) }); this.map.objects.push(o); this.changed.add(o.id); break; }
      case 'modifyObject': { this.assertUnlocked(c.id); const i = this.map.objects.findIndex(o=>o.id===c.id); if(i<0) throw new Error('Missing object'); this.map.objects[i] = {...structuredClone(this.map.objects[i]!),...structuredClone(c.properties)}; this.changed.add(c.id); break; }
      case 'setRoadName': {
        const roads = this.roadsFor(c.id), oldIds = new Set(roads.map(r => r.roadNameId).filter((id): id is string => !!id && id !== c.nameId));
        this.map.roadNames = { ...this.map.roadNames, [c.nameId]: { ...this.map.roadNames?.[c.nameId], ...structuredClone(c.entry) } };
        for (const r of roads) { r.roadNameId = c.nameId; delete r.displayName; this.changed.add(r.id); }
        this.remapSignNames(oldIds, c.nameId);
        break;
      }
      case 'setCorridorName': {
        const roads = c.roadIds?.length ? c.roadIds.map(id => this.road(id)) : this.roadsFor(c.id);
        const existing = roads.map(r => r.roadNameId).filter((id): id is string => !!id);
        const nameId = c.nameId ?? (existing.length && existing.every(id => id === existing[0]) ? existing[0]! : `name:${c.id}`);
        const entry = { ...this.map.roadNames?.[nameId], primaryText: c.name, kind: c.kind ?? this.map.roadNames?.[nameId]?.kind ?? (roads.some(r => roadFunction(r) === 'expressway') ? 'expressway' as const : 'urban' as const) };
        this.map.roadNames = { ...this.map.roadNames, [nameId]: entry };
        const oldIds = new Set(existing.filter(id => id !== nameId));
        for (const r of roads) { r.roadNameId = nameId; delete r.displayName; this.changed.add(r.id); }
        const corridor = editing(this.map).corridors.find(corridor => corridor.id === c.id); if (corridor) corridor.name = c.name;
        this.remapSignNames(oldIds, nameId);
        this.record(c.id, { nameId, roads: roads.length, name: c.name });
        break;
      }
      case 'smoothRoad': {
        for (const r of this.roadsFor(c.id)) {
          const source = roadPoints(r), result = smoothAlignment(source, { start: c.start, end: c.end, strength: c.strength, preserveEndpoints: c.preserveEndpoints, simplifyTolerance: c.tolerance });
          const partial = (c.start ?? 0) > 0 || (c.end ?? Infinity) < polylineLength(source);
          const ramp = roadFunction(r) === 'ramp';
          r.centerline = result.points.map(point => ({ ...point }));
          // A second whole-road spline pass would reshape the untouched exterior.
          r.curve = partial ? 'polyline' : r.curve === 'smooth' || ramp ? 'smooth' : 'polyline';
          if (editing(this.map).curves?.[r.id]) {
            if (ramp && !partial) { const handles = cubicHandles(result.points); editing(this.map).curves![r.id] = handles; r.centerline = cubicPath(handles); r.curve = 'polyline'; }
            else delete editing(this.map).curves![r.id];
          }
          this.changed.add(r.id); this.record(r.id, { smooth: result.metrics });
        }
        break;
      }
      case 'repairElevation': {
        for (const r of this.roadsFor(c.id)) {
          const partial = (c.start ?? 0) > 0 || (c.end ?? Infinity) < polylineLength(roadPoints(r));
          const result = elevationRepairForRoad(r, { start: c.start, end: c.end, strength: c.strength, preserveEndpoints: c.preserveEndpoints, maxGrade: c.maxGrade, monotonic: c.monotonic, simplifyTolerance: c.tolerance });
          r.centerline = result.points.map(point => ({ ...point }));
          r.curve = !partial && r.curve === 'smooth' ? 'smooth' : 'polyline';
          r.elevationMode = 'custom';
          if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves![r.id];
          this.changed.add(r.id); this.record(r.id, { elevation: result.metrics });
        }
        break;
      }
      case 'simplifyRoad': {
        for (const r of this.roadsFor(c.id)) {
          const source = roadPoints(r), simplified = simplifyPoints(source, c.tolerance ?? 0.25, 0.04);
          r.centerline = simplified.map(point => ({ ...point })); r.curve = 'polyline';
          if (editing(this.map).curves?.[r.id]) delete editing(this.map).curves![r.id];
          this.changed.add(r.id);
          this.record(r.id, { simplify: { beforePoints: source.length, afterPoints: simplified.length, removedControlPoints: Math.max(0, source.length - simplified.length) } });
        }
        break;
      }
      case 'repairRamp': {
        const ramp = editing(this.map).ramps.find(entry => entry.id === c.id || entry.roadId === c.id);
        const r = ramp ? this.road(ramp.roadId) : this.road(c.id);
        const source = roadPoints(r);
        const aligned = smoothAlignment(source, { strength: Math.max(1.1, c.strength ?? 1.25), preserveEndpoints: true, simplifyTolerance: 0.9 });
        const net = Math.abs((aligned.points.at(-1)?.y ?? 0) - (aligned.points[0]?.y ?? 0));
        let variation = 0;
        for (let i = 1; i < aligned.points.length; i++) variation += Math.abs((aligned.points[i]!.y ?? 0) - (aligned.points[i - 1]!.y ?? 0));
        const vertical = repairElevation(aligned.points, { strength: Math.max(1.2, c.strength ?? 1.5), preserveEndpoints: true, maxGrade: c.maxGrade ?? 0.08, monotonic: c.monotonic ?? (net > 1.2 && variation < net * 2.5) });
        let points = vertical.points;
        if (editing(this.map).curves?.[r.id]) { const handles = cubicHandles(points); editing(this.map).curves![r.id] = handles; points = cubicPath(handles); }
        r.centerline = points.map(point => ({ ...point })); r.curve = 'polyline'; r.elevationMode = 'custom'; this.changed.add(r.id);
        const finalGrade = gradeMetrics(points);
        this.record(r.id, { ramp: { ...aligned.metrics, ...vertical.metrics, afterMaxGrade: Math.round(finalGrade.maxGrade * 1000) / 10, afterGradeReversals: finalGrade.reversals } });
        break;
      }
      case 'repairIntersection': {
        const j = this.junction(c.id), metrics = this.repairJunction(j, { rebuildFootprint: c.rebuildFootprint, rebuildMarkings: c.rebuildMarkings, approachMargin: c.approachMargin });
        this.record(j.id, { intersection: metrics }); break;
      }
      case 'repairIntersections': {
        const ids = new Set(c.intersectionIds ?? []);
        if (!ids.size) {
          if (!c.bbox) throw new Error('repairIntersections requires a bbox or explicit intersectionIds');
          const report = diagnoseMap(this.map, { bbox: c.bbox, codes: c.codes ?? ['intersection.', 'marking.'], minSeverity: 'warning', limit: c.limit ?? 40 }, {});
          for (const issue of report.issues) if (issue.intersectionId && issue.repair?.op === 'repairIntersection') ids.add(issue.intersectionId);
        }
        let repaired = 0;
        for (const id of [...ids].slice(0, c.limit ?? 20)) { try { this.repairJunction(this.junction(id), {}); repaired++; } catch (error) { this.notes.push({ severity: 'warning', code: 'intersection.repairSkipped', ids: [id], message: String(error) }); } }
        this.record('intersections', { repaired }); break;
      }
      case 'createSign': {
        const r=this.map.roads.find(r=>r.id===c.roadId);if(!r)throw new Error('Missing sign road');this.assertUnlocked(r.id);
        const pts=roadPoints(r),length=polylineLength(pts);if(c.station<0||c.station>length)throw new Error('Sign station lies outside road');
        const s=sampleAt(pts,c.station),offset=c.offset??r.laneCount*r.laneWidth/2+2,direction=c.direction??'forward';
        const sign:RoadSignDefinition={type:'ROAD_NAME',template:'urban-name',size:'small',language:'zh-CN',laneDirection:direction,destinations:r.roadNameId?[{roadNameId:r.roadNameId,arrow:'straight'}]:[],...structuredClone(c.properties),id:this.id(c.id??'sign',!!c.id),roadId:r.id,stationMetres:c.station,position:{x:s.point.x-s.tangent.z*offset,y:s.point.y,z:s.point.z+s.tangent.x*offset},heading:Math.atan2(-s.tangent.x,-s.tangent.z)+(direction==='reverse'?Math.PI:0)};
        this.map.signs!.push(sign);this.changed.add(sign.id);break;
      }
      case 'modifySign': {
        const i=this.map.signs!.findIndex(s=>s.id===c.id);if(i<0)throw new Error('Missing sign');const old=this.map.signs![i]!;this.assertUnlocked(old.roadId);
        const sign={...structuredClone(old),...structuredClone(c.properties)};
        if(c.properties.stationMetres!==undefined){const road=this.map.roads.find(r=>r.id===sign.roadId);if(!road)throw new Error('Missing sign road');const pts=roadPoints(road),length=polylineLength(pts);if(sign.stationMetres!<0||sign.stationMetres!>length)throw new Error('Sign station outside road');const previous=project(pts,old.position),next=sampleAt(pts,sign.stationMetres!),offset=(old.position.x-previous.point.x)*-previous.tangent.z+(old.position.z-previous.point.z)*previous.tangent.x;sign.position={x:next.point.x-next.tangent.z*offset,y:next.point.y,z:next.point.z+next.tangent.x*offset};sign.heading+=Math.atan2(next.tangent.x,next.tangent.z)-Math.atan2(previous.tangent.x,previous.tangent.z);}
        this.map.signs![i]=sign;this.changed.add(c.id);break;
      }
      case 'deleteSign': {const sign=this.map.signs!.find(s=>s.id===c.id);if(!sign)throw new Error('Missing sign');this.assertUnlocked(sign.roadId);this.map.signs=this.map.signs!.filter(s=>s.id!==c.id);this.changed.add(c.id);break;}
      default: throw new Error(`Unknown editor operation: ${(c as {op:string}).op}`);
    }
  }
  finish(): void {
    // Reconcile only changed junctions and their immediate approaches.
    for (const j of this.map.intersections) if (this.changed.has(j.id) || j.connections.some(c => this.changed.has(c.roadId))) {
      const w = this.junction(j.id); for (const e of w.connections) this.road(e.roadId);
      const local = { ...this.map, roads: this.map.roads.filter(r => w.connections.some(c => c.roadId === r.id)), intersections: [w], connectionPorts: [] };
      syncConnections(local);
      // The outline must see neighbouring junctions too, so an approach reach
      // stops at the next shared junction instead of the full road length.
      setJunctionPavementFootprint(w, this.map);
    }
    refreshPortPoses(this.map);
    // Stationed signs follow road transforms/profile edits; split/merge remaps ownership above.
    const shape=(r:CityRoad)=>JSON.stringify([r.centerline,r.curve,r.elevation,r.elevationMode]);
    const geometryChanged=new Set(this.map.roads.filter(r=>this.changed.has(r.id)&&(!this.before.roads.some(old=>old.id===r.id)||shape(r)!==shape(this.before.roads.find(old=>old.id===r.id)!))).map(r=>r.id));
    this.map.signs=this.map.signs!.map(sign=>{
      if(!geometryChanged.has(sign.roadId))return sign;
      const oldSign=this.before.signs?.find(s=>s.id===sign.id);if(!oldSign)return sign;
      const before=this.before.roads.find(r=>r.id===oldSign.roadId),after=this.map.roads.find(r=>r.id===sign.roadId);if(!before||!after)return sign;
      const previous=project(roadPoints(before),oldSign.position),pts=roadPoints(after),station=Math.min(sign.stationMetres??previous.along,polylineLength(pts)),next=sampleAt(pts,station);
      const offset=(oldSign.position.x-previous.point.x)*-previous.tangent.z+(oldSign.position.z-previous.point.z)*previous.tangent.x;
      const angle=Math.atan2(next.tangent.x,next.tangent.z)-Math.atan2(previous.tangent.x,previous.tangent.z);
      this.changed.add(sign.id);return{...structuredClone(sign),stationMetres:station,position:{x:next.point.x-next.tangent.z*offset,y:next.point.y,z:next.point.z+next.tangent.x*offset},heading:oldSign.heading+angle};
    });
    for (const r of this.map.roads) if (this.changed.has(r.id)) { const b = areaOf(r); this.map.bounds = { minX: Math.min(this.map.bounds.minX, b.minX), maxX: Math.max(this.map.bounds.maxX, b.maxX), minZ: Math.min(this.map.bounds.minZ, b.minZ), maxZ: Math.max(this.map.bounds.maxZ, b.maxZ) }; }
    this.map.version = this.before.version + 1;
  }
}

export interface RoadQuery { id?: string; roadClass?: string; corridor?: string; district?: string; group?:string;roadNameId?:string;name?:string;section?:string;presetSource?:string;bbox?: EditorArea; center?: CityPoint; radius?: number; connectedTo?: string; limit?: number }
export class CityEditingKernel {
  private index = new EditorSpatialIndex();
  private byId = new Map<string, CityRoad | CityIntersection | CityMapData['objects'][number]>();
  private pending = new Map<string, { transaction: EditTransaction; summary: EditSummary }>();
  private sequence = 0;
  private revision = 0;
  constructor(private map: CityMapData, readonly history = new CityEditorHistory()) { this.map=adoptEditorMetadata(map);this.reindex(); }
  /** Borrowed immutable snapshot. Write through commands only. */
  get data(): CityMapData { return this.map; }
  private reindex(): void { this.index = new EditorSpatialIndex(); this.byId.clear(); for (const e of [...this.map.roads,...this.map.intersections,...this.map.objects]) { this.byId.set(e.id,e); this.index.set(e.id,areaOf(e)); } }
  private restore(map:CityMapData):void {
    const next=new Map([...map.roads,...map.intersections,...map.objects].map(e=>[e.id,e]));
    for(const[id,e]of this.byId)if(!next.has(id)||next.get(id)!==e)this.index.delete(id);
    for(const[id,e]of next)if(this.byId.get(id)!==e)this.index.set(id,areaOf(e));
    this.byId=next;this.map=map;this.revision++;this.pending.clear();
  }
  getRoad(id: string): CityRoad | undefined { const e = this.byId.get(id); return e && 'centerline' in e ? structuredClone(e) : undefined; }
  getControlPoints(id:string):CityPoint[] {const r=this.getRoad(id);if(!r)throw new Error('Missing road');return structuredClone(editing(this.map).curves?.[id]??r.centerline);}
  getCorridor(id: string) { const c = editing(this.map).corridors.find(c=>c.id===id); return c ? structuredClone(c) : undefined; }
  listCorridors(name='') {return editing(this.map).corridors.filter(c=>!name||c.name.includes(name)||c.id.includes(name)).map(c=>({id:c.id,name:c.name,roadCount:c.roadIds.length}));}
  getGroup(id:string) {const g=editing(this.map).groups.find(g=>g.id===id);return g?structuredClone(g):undefined;}
  getIntersection(id: string): CityIntersection | undefined { const e = this.byId.get(id); return e && 'connections' in e ? structuredClone(e) : undefined; }
  getSign(id:string):RoadSignDefinition|undefined {const sign=this.map.signs?.find(s=>s.id===id);return sign?structuredClone(sign):undefined;}
  findSigns(query:{roadId?:string;type?:string;center?:CityPoint;radius?:number;bbox?:EditorArea;limit?:number}={}) {return structuredClone((this.map.signs??[]).filter(s=>(!query.roadId||s.roadId===query.roadId)&&(!query.type||s.type===query.type)&&(!query.center||distance(s.position,query.center)<=(query.radius??100))&&(!query.bbox||overlaps(bounds([s.position]),query.bbox))).slice(0,query.limit??50));}
  getConnectedRoads(id: string): string[] { return this.connected(this.map,id); }
  private connected(map: CityMapData,id: string): string[] {
    const ids = new Set<string>(); for (const l of map.roadLinks ?? []) { if(l.from.roadId===id)ids.add(l.to.roadId); if(l.to.roadId===id)ids.add(l.from.roadId); }
    for(const j of map.intersections) if(j.connections.some(c=>c.roadId===id)) for(const c of j.connections)if(c.roadId!==id)ids.add(c.roadId); return [...ids];
  }
  findRoads(query: RoadQuery = {}): ReturnType<CityEditingKernel['briefRoad']>[] {
    const area = query.bbox ?? (query.center ? bounds([query.center],query.radius??100) : undefined);
    const candidates = area ? this.index.query(area).map(id=>this.byId.get(id)).filter((e):e is CityRoad=>!!e&&'centerline'in e) : this.map.roads;
    const corridor = query.corridor ? this.getCorridor(query.corridor) : undefined, connected = query.connectedTo ? new Set(this.getConnectedRoads(query.connectedTo)) : undefined;
    return candidates.filter(r=>(!query.id||r.id===query.id)&&(!query.roadClass||roadFunction(r)===query.roadClass)&&(!query.corridor||!!corridor?.roadIds.includes(r.id))&&(!query.district||r.district===query.district)&&(!query.group||r.groupId===query.group||editing(this.map).groups.some(g=>g.id===query.group&&g.memberIds.includes(r.id)))&&(!query.roadNameId||r.roadNameId===query.roadNameId)&&(!query.name||(r.displayName??this.map.roadNames?.[r.roadNameId??'']?.primaryText??'').includes(query.name))&&(!query.section||r.corridorSection===query.section)&&(!query.presetSource||r.presetSource===query.presetSource)&&(!connected||connected.has(r.id))&&(!query.center||project(roadPoints(r),query.center).distance <= (query.radius??100))).slice(0,query.limit??100).map(r=>this.briefRoad(r));
  }
  getNearbyRoads(center: CityPoint,radius=100) { return this.findRoads({center,radius}); }
  private briefRoad(r: CityRoad) { const pts = roadPoints(r); return { id:r.id,name:r.displayName??this.map.roadNames?.[r.roadNameId??'']?.primaryText,roadNameId:r.roadNameId,groupId:r.groupId,section:r.corridorSection,presetSource:r.presetSource,roadClass:roadFunction(r),lanes:r.laneCount,length:Math.round(polylineLength(pts)*10)/10,elevation:[Math.min(...pts.map(p=>p.y??0)),Math.max(...pts.map(p=>p.y??0))],bounds:bounds(pts),corridors:editing(this.map).corridors.filter(c=>c.roadIds.includes(r.id)).map(c=>c.id) }; }
  inspectArea(query: RoadQuery) {
    if(!query.bbox&&!query.center&&!query.corridor&&!query.id&&!query.group&&!query.roadNameId&&!query.name)throw new Error('inspectArea requires bbox, center/radius, corridor, group, name or road ID');
    const roads=this.findRoads(query),ids=new Set(roads.map(r=>r.id));
    const intersections=this.map.intersections.filter(j=>j.connections.some(c=>ids.has(c.roadId)) || !!query.bbox&&overlaps(bounds([j.position]),query.bbox));
    return structuredClone({revision:this.revision,roads,corridors:editing(this.map).corridors.filter(c=>c.roadIds.some(id=>ids.has(id))).map(c=>({id:c.id,name:c.name,roadCount:c.roadIds.length,localRoadIds:c.roadIds.filter(id=>ids.has(id))})),groups:editing(this.map).groups.filter(g=>g.memberIds.some(id=>ids.has(id))).map(g=>({id:g.id,name:g.name,kind:g.kind,locked:g.locked,memberCount:g.memberIds.length})),intersections:intersections.map(j=>({id:j.id,position:j.position,signalized:j.signalized,arms:j.connections})),ramps:editing(this.map).ramps.filter(r=>ids.has(r.roadId)),structures:roads.flatMap(r=>{const road=this.map.roads.find(o=>o.id===r.id)!;return road.structure?[{roadId:r.id,...road.structure}]:[];}),signs:(this.map.signs??[]).filter(s=>ids.has(s.roadId)).slice(0,30).map(s=>({id:s.id,roadId:s.roadId,type:s.type,template:s.template,position:s.position,destinations:s.destinations})),connectivity:roads.map(r=>({id:r.id,connected:this.getConnectedRoads(r.id)})),warnings:this.validateIds(this.map,ids).slice(0,50),truncated:roads.length===(query.limit??100)});
  }
  preview(commands: EditorCommand | EditorCommand[], label = 'Edit map'): EditSummary {
    this.pending.clear();
    const transaction = new EditTransaction(this.map,this.index);
    for(const command of Array.isArray(commands)?commands:[commands]) transaction.execute(command);
    transaction.finish();
    const after=transaction.map,old=new Map([...this.map.roads,...this.map.intersections,...this.map.objects,...this.map.signs??[],...editing(this.map).corridors,...editing(this.map).groups].map(e=>[e.id,e]));
    const fresh=new Map([...after.roads,...after.intersections,...after.objects,...after.signs??[],...editing(after).corridors,...editing(after).groups].map(e=>[e.id,e]));
    const created=[...fresh.keys()].filter(id=>!old.has(id)),deleted=[...old.keys()].filter(id=>!fresh.has(id));
    const modified=[...transaction.changed].filter(id=>old.has(id)&&fresh.has(id));
    const areas=[...new Set([...created,...deleted,...modified])].flatMap(id=>[this.byId.get(id),after.roads.find(r=>r.id===id),after.intersections.find(j=>j.id===id),after.objects.find(o=>o.id===id),this.map.signs?.find(s=>s.id===id),after.signs?.find(s=>s.id===id)].filter(e=>!!e).map(e=>'position'in e!?bounds([e!.position],40):areaOf(e!)));
    const ids=new Set([...transaction.changed,...created]);
    const warnings=[...transaction.notes,...this.validateIds(after,ids)];
    const summary:EditSummary={id:`preview-${++this.sequence}`,revision:this.revision,label,created,modified,deleted,area:union(areas),warnings,valid:!warnings.some(w=>w.severity==='error'),...(Object.keys(transaction.metrics).length?{metrics:transaction.metrics}:{})};
    this.pending.clear();this.pending.set(summary.id,{transaction,summary}); return structuredClone(summary);
  }
  dryRun(commands: EditorCommand | EditorCommand[],label?:string):EditSummary {return this.preview(commands,label);}
  previewData(id:string):{roads:CityRoad[];intersections:CityIntersection[];objects:CityMapData['objects'];signs:RoadSignDefinition[];beforeRoads:CityRoad[];beforeIntersections:CityIntersection[]} {
    const p=this.pending.get(id);if(!p)throw new Error('Preview expired');const ids=new Set([...p.summary.created,...p.summary.modified,...p.summary.deleted]);
    return structuredClone({roads:p.transaction.map.roads.filter(r=>ids.has(r.id)),intersections:p.transaction.map.intersections.filter(j=>ids.has(j.id)),objects:p.transaction.map.objects.filter(o=>ids.has(o.id)),signs:(p.transaction.map.signs??[]).filter(s=>ids.has(s.id)),
      beforeRoads:this.map.roads.filter(r=>ids.has(r.id)),beforeIntersections:this.map.intersections.filter(j=>ids.has(j.id))});
  }
  commit(id:string):EditSummary {
    const p=this.pending.get(id);if(!p||p.summary.revision!==this.revision)throw new Error('Preview is stale; preview again');
    if(!p.summary.valid)throw new Error(p.summary.warnings.filter(w=>w.severity==='error').map(w=>w.message).join('\n'));
    this.history.recordTransaction(this.map,p.transaction.map,p.summary.label);this.map=p.transaction.map;this.revision++;
    for(const id of [...p.summary.deleted,...p.summary.modified,...p.summary.created]) {this.byId.delete(id);this.index.delete(id);const e=[...this.map.roads,...this.map.intersections,...this.map.objects].find(e=>e.id===id);if(e){this.byId.set(id,e);this.index.set(id,areaOf(e));}}
    this.pending.clear();return structuredClone(p.summary);
  }
  cancelPreview():void {this.pending.clear();}
  apply(commands:EditorCommand|EditorCommand[],label?:string):EditSummary {const p=this.preview(commands,label);return this.commit(p.id);}
  undo():boolean {const previous=this.history.undo(this.map);if(!previous)return false;this.restore(previous);return true;}
  redo():boolean {const next=this.history.redo(this.map);if(!next)return false;this.restore(next);return true;}
  validateRoad(id:string):EditorIssue[]{return this.getRoad(id)?this.validateIds(this.map,new Set([id])):[{severity:'error',code:'road.missing',ids:[id],message:'Missing road'}];}
  validateSelection(id:string):EditorIssue[]{const group=this.getGroup(id),corridor=this.getCorridor(id),j=this.getIntersection(id),sign=this.getSign(id);return this.validateIds(this.map,new Set(group?group.memberIds:corridor?corridor.roadIds:j?[id,...j.connections.map(c=>c.roadId)]:sign?[sign.id,sign.roadId]:[id]));}
  validateCorridor(id:string):EditorIssue[]{const c=this.getCorridor(id);return c?this.validateIds(this.map,new Set(c.roadIds)):[{severity:'error',code:'corridor.missing',ids:[id],message:'Missing corridor'}];}
  validateIntersection(id:string):EditorIssue[]{const j=this.getIntersection(id);return this.validateIds(this.map,new Set([id,...j?.connections.map(c=>c.roadId)??[]]));}
  validateArea(area:EditorArea):EditorIssue[]{return this.validateIds(this.map,new Set(this.index.query(area)));}
  /** Quality diagnostics; distinct from structural validation. */
  diagnose(scope: DiagnosticScope = {}, options: { retainAllIssues?: boolean } = {}): DiagnosticReport { return diagnoseMap(this.map, scope, { index: this.index, revision: this.revision, retainAllIssues: options.retainAllIssues }); }
  /** Explicit full-map schema validation. Never called implicitly by an edit. */
  validateFull(): EditorIssue[] {
    const report = validateMap(this.map);
    return [...report.errors, ...report.warnings].map(issue => ({ severity: issue.severity, code: issue.code, ids: [], message: `${issue.path}: ${issue.message}` }));
  }
  private validateIds(map:CityMapData,ids:Set<string>):EditorIssue[]{
    const result:EditorIssue[]=[],add=(severity:EditorIssue['severity'],code:string,objects:string[],message:string)=>result.push({severity,code,ids:objects,message});
    const selected=map.roads.filter(r=>ids.has(r.id));
    const js=map.intersections.filter(j=>ids.has(j.id)||j.connections.some(c=>ids.has(c.roadId)));
    const closure=new Set([...ids,...js.flatMap(j=>j.connections.map(c=>c.roadId))]);
    for(const l of map.roadLinks??[])if(ids.has(l.from.roadId)||ids.has(l.to.roadId)){closure.add(l.from.roadId);closure.add(l.to.roadId);}
    const signs=(map.signs??[]).filter(s=>ids.has(s.id)||ids.has(s.roadId));
    for(const s of signs){closure.add(s.roadId);if(s.incomingRoadId)closure.add(s.incomingRoadId);for(const id of s.outgoingRoadIds??[])closure.add(id);}
    const fragment={...newCityMap(),id:map.id,name:map.name,version:map.version,sectorSize:map.sectorSize,bounds:map.bounds,environment:{districts:map.environment.districts,spawnPoints:map.environment.spawnPoints},roadNames:map.roadNames,signs,roads:map.roads.filter(r=>closure.has(r.id)),intersections:js,objects:map.objects.filter(o=>ids.has(o.id)),roadLinks:(map.roadLinks??[]).filter(l=>ids.has(l.from.roadId)||ids.has(l.to.roadId)),connectionPorts:(map.connectionPorts??[]).filter(p=>ids.has(p.endpoint.roadId))};
    const report=validateMap(fragment);
    for(const issue of [...report.errors,...report.warnings])add(issue.severity,issue.code,[...ids],`${issue.path}: ${issue.message}`);
    for(const route of map.regional?.highways?.routes??[])for(const id of route.roadIds)if(ids.has(id)&&map.roads.find(r=>r.id===id)?.roadNameId!==route.id)add('error','highway.ownership',[id],`Road must retain route registry ${route.id}; rename its existing name entry instead`);
    for(const r of selected){
      const pts=roadPoints(r),length=polylineLength(pts),grade=maxGrade(r);
      if(length<3)add('warning','tiny.fragment',[r.id],'Road shorter than 3m');
      if(grade>0.12)add(grade>0.25?'error':'warning','extreme.grade',[r.id],`Maximum grade ${(grade*100).toFixed(1)}%`);
      if(!this.connected(map,r.id).length)add('warning','disconnected.road',[r.id],'No explicit road or intersection connections');
      const nearbyIds=new Set([...this.index.query(bounds(pts,30)),...ids]);
      for(const other of map.roads)if(other.id!==r.id&&nearbyIds.has(other.id)){
        if(selected.some(s=>s.id===other.id)&&other.id<r.id)continue;
        for(const c of crossings(pts,roadPoints(other))){
          const gap=Math.abs((c.point.y??0)-c.otherY);
          if(gap<0.5&&!this.connected(map,r.id).includes(other.id)&&!js.some(j=>distance(j.position,c.point)<40))add('warning',roadFunction(r)==='expressway'||roadFunction(other)==='expressway'?'expressway.unconnected-crossing':'unconnected.crossing',[r.id,other.id],'Same-level crossing has no junction; verify the chosen no-connection intent');
          else if(gap>=0.5&&gap<5.5)add('warning','structure.clearance',[r.id,other.id],`Crossing clearance ${gap.toFixed(1)}m is below 5.5m`);
        }
      }
    }
    for(const j of js)for(const other of js)if(j.id<other.id&&distance(j.position,other.position)<8&&Math.abs((j.position.y??0)-(other.position.y??0))<0.5)add('warning','duplicate.intersection',[j.id,other.id],'Adjacent junction centers may be one divided-road intersection');
    return result;
  }
}
