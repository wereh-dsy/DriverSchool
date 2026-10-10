import type { CityMapData, CityPoint } from '../CityMapData';
import { roadPoints, polylineLength, sampleAt, rotatePoint, roadEdges, portDirection } from '../geometry';
import { RoadClearance } from '../RoadClearance';
import { signDimensions } from '../RoadSignTemplates';
import { PrefabRegistry } from '../PrefabRegistry';
import { createSubject3Materials } from '../../subject3/materials';
/** Placement/data update only; V3 templates, canvas renderer and content cache are untouched. */
export function relocateV4Signs(map: CityMapData, original: CityMapData): void {
    const pool = original.signs!.filter(s => s.type === 'URBAN_DIRECTION' || s.type === 'ROAD_NAME'), directionPool = pool.filter(s => s.type === 'URBAN_DIRECTION'), namePool = pool.filter(s => s.type === 'ROAD_NAME');
    map.signs = original.signs!.filter(s => s.type !== 'URBAN_DIRECTION' && s.type !== 'ROAD_NAME');
    const clearance = new RoadClearance(map);
    let used = 0;
    const roads = new Map(map.roads.map(r => [r.id, r]));
    const safeSign = (s: NonNullable<CityMapData['signs']>[number]) => { const dims = signDimensions(s.template, s.size), y = s.position.y ?? 0; return dims.posts.every(x => { const q = rotatePoint({ x, z: 0 }, s.heading); return !clearance.roadAt({ x: s.position.x + q.x, z: s.position.z + q.z }, .7, y - 1, y + dims.poleTop); }) && [-dims.width / 2, 0, dims.width / 2].every(x => { const q = rotatePoint({ x, z: 0 }, s.heading); return !clearance.roadAt({ x: s.position.x + q.x, z: s.position.z + q.z }, .2, y + dims.bottom - .4, y + dims.bottom + dims.height + .4); }); };
    const relocated: string[] = [];
    for (const old of [...map.signs]) {
        if (safeSign(old))
            continue;
        const r = roads.get(old.roadId)!, pts = roadPoints(r), len = polylineLength(pts);
        let best = Infinity, at = 0, d = 0, offset = 0;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1]!, b = pts[i]!, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((old.position.x - a.x) * dx + (old.position.z - a.z) * dz) / (l * l))), gap = Math.hypot(old.position.x - a.x - t * dx, old.position.z - a.z - t * dz);
            if (gap < best) {
                best = gap;
                at = d + t * l;
                offset = (-(old.position.x - a.x) * dz + (old.position.z - a.z) * dx) / l;
            }
            d += l;
        }
        let placed = false;
        for (const shift of [20, -20, 40, -40, 60, -60, 80, -80, 100, -100, 140, -140, 180, -180, 220, -220]) {
            const distance = at - shift;
            if (distance < 15 || distance > len - 15)
                continue;
            const advance = old.advanceMetres === undefined ? undefined : old.advanceMetres + shift;
            if (old.type === 'EXPRESSWAY_ADVANCE' && advance! < 255 || old.type === 'EXPRESSWAY_DIVERGE' && (advance! < 55 || advance! > 145))
                continue;
            const s = sampleAt(pts, distance), candidate = { ...old, position: { x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset }, heading: Math.atan2(-s.tangent.x, -s.tangent.z), advanceMetres: advance };
            if (safeSign(candidate)) {
                map.signs[map.signs.indexOf(old)] = candidate;
                relocated.push(old.id);
                placed = true;
                break;
            }
        }
        if (!placed)
            throw new Error('V4: no safe existing sign position ' + old.id);
    }
    map.environment.metadata!.expresswaySignsRelocated = relocated.join(',');
    const joints = [...map.intersections].sort((a, b) => Number(!a.connections.some(c => roads.get(c.roadId)?.roadNameId === 'central-avenue')) - Number(!b.connections.some(c => roads.get(c.roadId)?.roadNameId === 'central-avenue')));
    for (const j of joints) {
        const named = j.connections.map(c => ({ c, r: roads.get(c.roadId)! })).filter(a => a.r.roadNameId && map.roadNames![a.r.roadNameId]?.kind === 'urban');
        if (new Set(named.map(a => a.r.roadNameId)).size < 2)
            continue;
        for (const { c, r } of named) {
            if (used >= directionPool.length)
                break;
            if (r.travelDirection !== 'two-way' && c.end === 'start')
                continue;
            const pts = roadPoints(r), len = polylineLength(pts);
            if (len < 110)
                continue;
            for (const d of [65, 85, 105]) {
                if (d > len - 25)
                    continue;
                const s = sampleAt(pts, c.end === 'start' ? d : len - d), t = c.end === 'start' ? { x: -s.tangent.x, z: -s.tangent.z } : s.tangent, heading = Math.atan2(-t.x, -t.z), dims = signDimensions('dual-post', 'medium'), edge = roadEdges(r), offset = (c.end === 'start' ? -edge.left : edge.right) + dims.width / 2 + 2.4, q = rotatePoint({ x: offset, z: 0 }, heading), position = { x: s.point.x + q.x, y: s.point.y ?? 0, z: s.point.z + q.z };
                const safe = (p: CityPoint) => !clearance.junctionAt(p, 2, (p.y ?? 0) - 1, (p.y ?? 0) + 6) && safeSign({ ...directionPool[used]!, position: p, heading, template: 'dual-post', size: 'medium' });
                const plaquePosition = { ...position, x: position.x - t.x * 12, z: position.z - t.z * 12 };
                if (!safe(position) || !safe(plaquePosition))
                    continue;
                const destinations = [...new Set(named.filter(a => a.r.roadNameId !== r.roadNameId).map(a => a.r.roadNameId!))].slice(0, 2).map(id => { const choices = named.filter(a => a.r.roadNameId === id).map(a => rotatePoint(portDirection(j, a.c.port), j.rotation)).sort((a, b) => (b.x * t.x + b.z * t.z) - (a.x * t.x + a.z * t.z)), out = choices[0]!, angle = Math.atan2(t.x * out.z - t.z * out.x, t.x * out.x + t.z * out.z); return { roadNameId: id, arrow: Math.abs(angle) < .5 ? 'straight' as const : angle > 0 ? 'right' as const : 'left' as const }; });
                map.signs.push({ ...structuredClone(directionPool[used]!), roadId: r.id, position, heading, laneDirection: c.end === 'start' ? 'reverse' : 'forward', destinations });
                map.signs.push({ ...structuredClone(namePool[used]!), roadId: r.id, position: plaquePosition, heading, laneDirection: c.end === 'start' ? 'reverse' : 'forward', destinations: [{ roadNameId: r.roadNameId!, arrow: 'straight' }] });
                used++;
                break;
            }
        }
    }
    map.environment.metadata!.navigationSignCount = String(map.signs.length);
    map.environment.metadata!.urbanSignsRelocated = String(used * 2);
    map.environment.metadata!.urbanSignsRetired = String(pool.length - used * 2);
}
/** Only remove existing objects that conflict with changed streets; never regenerate the landscape. */
export function cleanupV4Landscape(map: CityMapData, lockedRoads: ReadonlySet<string>): void {
    const clearance = new RoadClearance(map);
    const removed: string[] = [];
    const materials = createSubject3Materials(), prefabs = new PrefabRegistry(materials);
    map.objects = map.objects.filter(o => {
        if (['green_strip', 'hardscape', 'embankment'].includes(o.prefabId))
            return true;
        const size = prefabs.entries.get(o.prefabId)!.size, radius = o.prefabId === 'tree' ? 2.2 : Math.hypot(size[0] * (o.scale?.x ?? 1) / 2, size[2] * (o.scale?.z ?? 1) / 2), height = size[1] * (o.scale?.y ?? 1), y = o.position.y ?? 0;
        const modified = clearance.roadAt(o.position, radius + 1, y - 1, y + height, undefined, id => !lockedRoads.has(id));
        const junction = map.intersections.filter(j => j.pavementFootprint).some(j => Math.hypot(j.position.x - o.position.x, j.position.z - o.position.z) < radius + 24 && Math.abs((j.position.y ?? 0) - y) < height + 1);
        if (modified || junction) {
            removed.push(o.id);
            return false;
        }
        return true;
    });
    prefabs.dispose();
    Object.values(materials).forEach(m => m.dispose());
    map.environment.metadata!.landscapeObjects = String(map.objects.length);
    map.environment.metadata!.landscapePass = 'V4 local conflict cleanup only; removed ' + removed.length + ' existing props; added 0';
    map.environment.metadata!.v4RemovedProps = removed.join(',');
}
