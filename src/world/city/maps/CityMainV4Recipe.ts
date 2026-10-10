import { CatmullRomCurve3, Vector3 } from 'three';
import type { CityMapData, CityPoint, CityRoad, RoadEndpoint } from '../CityMapData';
import { loadCityMap } from '../CityMapLoader';
import { createRoad, connectRoads } from '../MapAPI';
import { roadPoints, polylineLength, sampleAt, syncConnections, connectionPoint } from '../geometry';
import { ease } from '../presets/BackbonePresets';
import { connectUrbanSkeleton, trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { populateIntersectionMarkingMetadata } from '../MarkingOwnership';
import { setJunctionPavementFootprint } from '../JunctionSurface';
import { crossingDistance } from '../presets/CompactInterchangePresets';
import { relocateV4Signs, cleanupV4Landscape } from './CityMainV4Surroundings';
export const cityV4LockedRoad = (r: CityRoad) => ['expressway', 'motorway'].includes(r.district ?? '') || !!r.gore || ['diamond-west', 'diamond-east', 'east-main-aux', 'north-roundabout', 'urban-rail-underpass'].includes(r.groupId ?? '') || r.id.startsWith('direct-') || r.id.startsWith('urban-underpass-') || r.id.startsWith('urban-roundabout-');
type XY = [
    number,
    number
];
const line = (a: CityPoint, b: CityPoint) => { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5)); return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t }; }); };
function path(nodes: XY[], closed = false): CityPoint[] {
    const curve = new CatmullRomCurve3(nodes.map(([x, z]) => new Vector3(x, 0, z)), closed, 'centripetal');
    return curve.getPoints(Math.ceil(curve.getLength() / 5)).map(p => ({ x: p.x, y: 0, z: p.z }));
}
/** V4 upgrades only the ordinary skeleton; all six hubs and through corridors are immutable inputs. */
export function buildCityMainV4(source: unknown): CityMapData {
    const original = loadCityMap(source), map = structuredClone(original);
    if (original.environment.metadata?.backboneVersion !== '3' || original.environment.metadata?.urbanSkeletonVersion === '4')
        throw new Error('V4 requires the saved V3 baseline');
    const baseLocked = new Set(original.roads.filter(cityV4LockedRoad).map(r => r.id));
    const lockedJ = original.intersections.filter(j => j.connections.some(c => baseLocked.has(c.roadId))), lockedIds = new Set([...baseLocked, ...lockedJ.flatMap(j => j.connections.map(c => c.roadId))]);
    const anchors: RoadEndpoint[] = [];
    for (const j of original.intersections.filter(j => !lockedJ.includes(j)))
        for (const c of j.connections)
            if (lockedIds.has(c.roadId))
                anchors.push({ roadId: c.roadId, end: c.end });
    for (const l of original.roadLinks ?? [])
        if (lockedIds.has(l.from.roadId) !== lockedIds.has(l.to.roadId))
            anchors.push(lockedIds.has(l.from.roadId) ? l.from : l.to);
    map.roads = original.roads.filter(r => lockedIds.has(r.id));
    map.intersections = lockedJ;
    map.roadLinks = original.roadLinks!.filter(l => lockedIds.has(l.from.roadId) && lockedIds.has(l.to.roadId));
    map.connectionPorts = original.connectionPorts!.filter(p => lockedIds.has(p.endpoint.roadId));
    map.signs = original.signs!.filter(s => lockedIds.has(s.roadId));
    const added: CityRoad[] = [], axes: CityRoad[] = [];
    const regionalHeight = (p: CityPoint) => Math.max(14.5 * (1 - ease((Math.abs(p.z + 150) - 240) / 400)), p.z < -650 || p.z > 1700 ? 8 * (1 - ease((Math.abs(p.x) - 60) / 230)) : 0, 14.5 * ease((p.x - 350) / 500) * (1 - ease((Math.abs(p.z - 350) - 120) / 370))) * ease((Math.hypot(p.x - 650, p.z - 400) - 80) / 220);
    const originalMouths = original.roads.filter(r => lockedIds.has(r.id)).flatMap(r => [r.centerline[0]!, r.centerline.at(-1)!]);
    const add = (id: string, name: string | undefined, nodes: CityPoint[], lanes: number, district: string) => { const r = createRoad(map, { id, groupId: id.startsWith('v4-inner') ? 'inner-boulevard' : 'v4-urban', centerline: nodes, type: lanes === 6 ? 'urban_6lane' : lanes === 4 ? 'urban_4lane' : 'urban_2lane', styleId: lanes === 6 ? 'urban_boulevard_6' : lanes === 4 ? 'urban_street_4' : 'urban_local_2', laneCount: lanes, laneWidth: 3.75, speedLimit: lanes === 2 ? 30 : 50, travelDirection: 'two-way', elevationMode: 'custom', streetlights: false, district, structure: { barrierEnabled: false, piersEnabled: true, pierSpacing: 50 } }); r.roadNameId = name; added.push(r); return r; };
    // Phase 5: eight coherent axes precede any local/collector authoring.
    const inner = path([[-1030, 80], [-910, -430], [-420, -700], [250, -700], [790, -400], [1000, 80], [780, 550], [180, 710], [-520, 630], [-980, 370]], true);
    for (let i = 0; i < 4; i++) {
        const a = Math.floor(i * (inner.length - 1) / 4), b = Math.floor((i + 1) * (inner.length - 1) / 4);
        axes.push(add('v4-inner-' + i, 'inner-boulevard', inner.slice(a, b + 1), i === 2 ? 6 : 4, 'central'));
    }
    for (const [id, name, nodes, lanes, district] of [
        ['v4-central', 'central-avenue', [[-1490, 350], [-700, 350], [150, 350], [1450, 350]], 6, 'central'],
        ['v4-diagonal', 'new-city-avenue', [[-1450, 1250], [-700, 930], [-300, 700], [450, 60], [1100, -850]], 6, 'central'],
        ['v4-north', 'north-avenue', [[-1450, -800], [-650, -820], [250, -800], [950, -790], [1450, -750]], 4, 'north'],
        ['v4-south', 'south-avenue', [[-1450, 1130], [-550, 1170], [450, 1130], [1300, 1130]], 6, 'south'],
        ['v4-west', 'west-avenue', [[-1300, -1200], [-1280, -650], [-1250, 100], [-1310, 760], [-1350, 1250]], 4, 'west'],
        ['v4-industrial', 'industrial-avenue', [[-1400, 1790], [-650, 1810], [350, 1790], [1450, 1750]], 4, 'south'],
    ] as [
        string,
        string,
        XY[],
        number,
        string
    ][])
        axes.push(add(id, name, path(nodes), lanes, district));
    // The established East Avenue and all main/aux carriageways are retained rather than duplicated.
    // Phase 6: sparse district collectors; no tracing of the reference's decorative street grid.
    const collectors: [
        string,
        XY[],
        number,
        string
    ][] = [
        ['west-market', [[-1470, 50], [-1450, 350], [-1400, 610], [-1000, 660]], 2, 'west'],
        ['west-offset', [[-1520, 970], [-1325, 940], [-1090, 1060]], 2, 'west'],
        ['west-residential', [[-1450, -530], [-1110, -440], [-880, -170]], 2, 'west'],
        ['civic-collector', [[-720, -500], [-480, -410], [-330, -200], [-290, 350]], 4, 'central'],
        ['cbd-east-collector', [[250, -580], [550, -450], [620, -10], [650, 493.5988372093023]], 4, 'central'],
        ['north-residential', [[-1050, -1090], [-830, -1040], [-620, -820]], 2, 'north'],
        ['university', [[950, -1017.5], [980, -900], [980, -800]], 2, 'north'],
        ['east-new-district', [[1100, -600], [1470, -600], [1480, 350], [1470, 650], [1200, 650]], 4, 'east'],
        ['south-logistics-west', [[-1450, 1130], [-1490, 1330], [-1440, 1500], [-1400, 1790]], 4, 'south'],
        ['south-logistics-east', [[1300, 1130], [1450, 1210], [1510, 1510], [1450, 1750]], 4, 'south'],
    ];
    for (const [id, nodes, lanes, district] of collectors)
        add('v4-' + id, undefined, path(nodes), lanes, district);
    for (const r of added.filter(r => !axes.includes(r)))
        for (const end of ['start', 'end'] as const) {
            const index = end === 'start' ? 0 : r.centerline.length - 1, p = r.centerline[index]!;
            let best = 35, q = p;
            for (const a of axes)
                for (const v of a.centerline) {
                    const d = Math.hypot(p.x - v.x, p.z - v.z);
                    if (d < best) {
                        best = d;
                        q = v;
                    }
                }
            r.centerline[index] = { ...q };
        }
    // Retained external mouths are reconnected to the nearest coherent axis, without moving a locked endpoint.
    const extra = map.roads.filter(r => !baseLocked.has(r.id) && !added.includes(r));
    for (const r of extra)
        if (r.roadNameId === 'new-city-avenue')
            delete r.roadNameId;
    // Shorten the redundant westward tail of the retained university approach.
    const universityApproach = extra.find(r => r.id === 'urban-north-arterial-split');
    if (universityApproach)
        universityApproach.centerline = line({ x: 1280, y: 0, z: -750 }, universityApproach.centerline.at(-1)!);
    const key = (e: RoadEndpoint) => e.roadId + ':' + e.end, unique = [...new Map(anchors.map(e => [key(e), e])).values()];
    const targets: CityPoint[] = [];
    for (const [i, e] of unique.entries()) {
        const r = map.roads.find(r => r.id === e.roadId)!, pts = roadPoints(r), p = e.end === 'start' ? pts[0]! : pts.at(-1)!;
        if (added.some(a => [a.centerline[0]!, a.centerline.at(-1)!].some(q => Math.hypot(q.x - p.x, q.z - p.z) < .04)))
            continue;
        if (e.roadId === 'urban-diagonal-split-split' && e.end === 'start') {
            const collector = added.find(a => a.id === 'v4-cbd-east-collector')!, q = collector.centerline.reduce((a, b) => Math.abs(a.z - 440) < Math.abs(b.z - 440) ? a : b);
            targets.push(q);
            add('v4-access-' + i, undefined, path([[p.x, p.z], [620, 400], [q.x, q.z]]), 4, 'central');
            continue;
        }
        const adjacent = e.end === 'start' ? pts[1]! : pts.at(-2)!, out = { x: p.x - adjacent.x, z: p.z - adjacent.z }, outLen = Math.hypot(out.x, out.z);
        let nearest: CityPoint | undefined, best = Infinity;
        // Prefer the already retained continuation at the north-west diamond mouth.
        const target = e.roadId === 'diamond-west:east-local' ? extra.find(a => a.id === 'urban-diamond-west--1-split-split-2') : undefined;
        for (const a of target ? [target] : [...axes, ...added.filter(a => !a.id.startsWith('v4-access-')), ...extra.filter(a => a.id !== r.id)])
            for (const q of roadPoints(a)) {
                if (e.roadId === 'urban-east-arterial-split' && e.end === 'start' && (a.id !== 'v4-north' || q.x < 1100 || q.x > 1150))
                    continue;
                const d = Math.hypot(p.x - q.x, p.z - q.z), mouth = originalMouths.find(m => Math.hypot(m.x - q.x, m.z - q.z) < .04), y = mouth?.y ?? regionalHeight(q);
                if (Math.abs(y - (p.y ?? 0)) * 1.9 / Math.max(d, 1) > .09 || !target && ((q.x - p.x) * out.x + (q.z - p.z) * out.z) / outLen < 40 || targets.some(t => Math.hypot(t.x - q.x, t.z - q.z) < 100))
                    continue;
                if (d < best) {
                    best = d;
                    nearest = q;
                }
            }
        if (!nearest || best < .05)
            continue;
        targets.push(nearest);
        add('v4-access-' + i, r.roadNameId === 'north-avenue' ? 'north-avenue' : undefined, line(p, nearest), r.laneCount >= 4 ? 4 : 2, r.district ?? 'east');
    }
    // Shared spatial height patches keep ordinary intersections at one elevation. Projected
    // expressway/locked auxiliary crossings get a bridge, never an inferred access junction.
    const protectedPaths = map.roads.filter(r => baseLocked.has(r.id)).map(r => ({ r, pts: roadPoints(r) }));
    const patches: {
        p: CityPoint;
        y: number;
        radius: number;
    }[] = [];
    for (const r of added)
        for (const other of protectedPaths)
            for (const d of crossingDistance(r.centerline, other.pts)) {
                if (d < 18 || d > polylineLength(r.centerline) - 18)
                    continue;
                const p = sampleAt(r.centerline, d).point;
                let distance = Infinity, y = 0;
                for (let i = 1; i < other.pts.length; i++) {
                    const a = other.pts[i - 1]!, b = other.pts[i]!, dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))), gap = Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
                    if (gap < distance) {
                        distance = gap;
                        y = (a.y ?? 0) + t * ((b.y ?? 0) - (a.y ?? 0));
                    }
                }
                if (!other.r.id.startsWith('ring-') || Math.abs(y) >= 6.3)
                    continue;
                patches.push({ p, y: 8, radius: 230 });
            }
    const height = (p: CityPoint) => Math.max(regionalHeight(p), patches.reduce((y, a) => Math.max(y, a.y * (1 - ease((Math.hypot(p.x - a.p.x, p.z - a.p.z) - 65) / a.radius))), 0));
    for (const r of extra) {
        const old = roadPoints(r);
        if (polylineLength(old) < 500)
            continue;
        r.centerline = old.map(p => ({ ...p, y: height(p) }));
        r.elevationMode = 'custom';
        for (const end of ['start', 'end'] as const) {
            const pts = end === 'start' ? r.centerline : [...r.centerline].reverse(), y = old[end === 'start' ? 0 : old.length - 1]!.y ?? 0, transition = Math.min(400, polylineLength(pts) * .4);
            let d = 0;
            for (let i = 0; i < pts.length; i++) {
                if (i)
                    d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
                if (d > transition)
                    break;
                pts[i]!.y = y + ((pts[i]!.y ?? 0) - y) * ease(d / transition);
            }
        }
    }
    for (const r of added) {
        const pts = r.centerline;
        r.centerline = pts.map(p => ({ ...p, y: height(p) }));
        if (r.id.startsWith('v4-access-')) {
            const len = polylineLength(pts), a = pts[0]!, b = r.centerline.at(-1)!, end = pts.at(-1)!, lockedEnd = original.roads.filter(a => lockedIds.has(a.id)).flatMap(a => [a.centerline[0]!, a.centerline.at(-1)!]).find(q => Math.hypot(end.x - q.x, end.z - q.z) < .04);
            if (lockedEnd)
                b.y = lockedEnd.y ?? 0;
            const n = r.centerline.length;
            let d = 0;
            for (let i = 0; i < n; i++) {
                if (i)
                    d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
                r.centerline[i]!.y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * ease(d / len);
            }
            continue;
        }
        for (const e of ['start', 'end'] as const) {
            const p = pts[e === 'start' ? 0 : pts.length - 1]!;
            const anchored = original.roads.filter(a => lockedIds.has(a.id)).some(a => [a.centerline[0]!, a.centerline.at(-1)!].some(q => Math.hypot(p.x - q.x, p.z - q.z) < .04));
            if (anchored) {
                let d = 0;
                const ordered = e === 'start' ? r.centerline : [...r.centerline].reverse(), transition = Math.min(200, polylineLength(ordered) * .4);
                for (let i = 0; i < ordered.length; i++) {
                    if (i)
                        d += Math.hypot(ordered[i]!.x - ordered[i - 1]!.x, ordered[i]!.z - ordered[i - 1]!.z);
                    if (d > transition)
                        break;
                    ordered[i]!.y = (p.y ?? 0) + ((ordered[i]!.y ?? 0) - (p.y ?? 0)) * ease(d / transition);
                }
            }
        }
    }
    const native = [...extra, ...added].map(r => ({ id: r.id, pts: structuredClone(r.centerline) }));
    for (const r of [...extra, ...added]) {
        const pts = r.centerline;
        let grade = 0;
        for (let i = 1; i < pts.length; i++)
            grade = Math.max(grade, Math.abs((pts[i]!.y ?? 0) - (pts[i - 1]!.y ?? 0)) / Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z));
        if (grade > .24)
            throw new Error('V4 profile ' + r.id + ' grade ' + grade + ' length ' + polylineLength(pts) + ' ends ' + JSON.stringify([pts[0], pts.at(-1)]));
    }
    const nativeHeight = (id: string, p: CityPoint) => { const pts = native.filter(a => id === a.id || id.startsWith(a.id + '-split')).sort((a, b) => b.id.length - a.id.length)[0]!.pts; let best = Infinity, y = 0; for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!, dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))), d = Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
        if (d < best) {
            best = d;
            y = (a.y ?? 0) + t * ((b.y ?? 0) - (a.y ?? 0));
        }
    } return y; };
    connectUrbanSkeleton(map, [...extra, ...added], 5.6, (j, arms) => { j.position.y = arms.reduce((sum, a) => sum + nativeHeight(a.endpoint.roadId, j.position), 0) / arms.length; j.pavementHeights = {}; for (const a of arms)
        j.pavementHeights[a.port] = nativeHeight(a.endpoint.roadId, connectionPoint(j, a.port, map)); });
    // Phase 7: only affected ordinary junctions get the authoritative width-aware outline.
    const lockedJIds = new Set(lockedJ.map(j => j.id));
    const affected = map.intersections.filter(j => !lockedJIds.has(j.id));
    for (const j of affected) {
        j.position.y = j.connections.reduce((y, c) => y + nativeHeight(c.roadId, j.position), 0) / j.connections.length;
        j.pavementHeights = {};
        for (const c of j.connections)
            j.pavementHeights[c.port] = nativeHeight(c.roadId, connectionPoint(j, c.port, map));
    }
    syncConnections(map);
    const mutable = { ...map, intersections: affected };
    trimCityJunctionApproaches(mutable, false);
    // A street junction is one level landing. Blend only its mutable approach ends;
    // native bridge/tunnel profiles and every locked feeder remain untouched.
    const endpointHeights = new Map<string, number>();
    const junctionByRoad = new Map<string, typeof affected>();
    for (const j of affected)
        for (const c of j.connections) {
            const list = junctionByRoad.get(c.roadId) ?? [];
            list.push(j);
            junctionByRoad.set(c.roadId, list);
        }
    for (let pass = 0; pass < affected.length; pass++) {
        let changed = false;
        for (const r of map.roads) {
            const js = junctionByRoad.get(r.id);
            if (js?.length !== 2 || polylineLength(r.centerline) >= 80)
                continue;
            const y = Math.max(...js.map(j => j.position.y ?? 0));
            for (const j of js)
                if (Math.abs((j.position.y ?? 0) - y) > .001) {
                    j.position.y = y;
                    changed = true;
                }
        }
        if (!changed)
            break;
    }
    // Fixed street mouths bound nearby landing elevations. Reserve gradient headroom
    // for smooth entry/exit transitions rather than putting the height change in a stub.
    for (let pass = 0; pass < affected.length; pass++) {
        let changed = false;
        for (const r of map.roads.filter(r => !baseLocked.has(r.id))) {
            const js = junctionByRoad.get(r.id) ?? [], start = js.find(j => j.connections.some(c => c.roadId === r.id && c.end === 'start')), end = js.find(j => j.connections.some(c => c.roadId === r.id && c.end === 'end')), a = start?.position.y ?? r.centerline[0]!.y ?? 0, b = end?.position.y ?? r.centerline.at(-1)!.y ?? 0, change = polylineLength(r.centerline) * .075;
            if (start && a > b + change + .0001) {
                start.position.y = b + change;
                changed = true;
            }
            if (end && b > a + change + .0001) {
                end.position.y = a + change;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    for (const j of affected) {
        for (const c of j.connections)
            endpointHeights.set(c.roadId + ':' + c.end, j.position.y ?? 0);
        j.pavementHeights = Object.fromEntries(j.connections.map(c => [c.port, j.position.y ?? 0]));
    }
    for (const r of map.roads.filter(r => !baseLocked.has(r.id))) {
        const pts = r.centerline, len = polylineLength(pts), span = Math.min(140, len * .45), originalPoints = structuredClone(pts);
        for (const end of ['start', 'end'] as const) {
            const target = endpointHeights.get(r.id + ':' + end);
            if (target === undefined)
                continue;
            const ordered = end === 'start' ? pts : [...pts].reverse(), source = originalPoints[end === 'start' ? 0 : pts.length - 1]!.y ?? 0;
            let d = 0;
            for (let i = 0; i < ordered.length; i++) {
                if (i)
                    d += Math.hypot(ordered[i]!.x - ordered[i - 1]!.x, ordered[i]!.z - ordered[i - 1]!.z);
                if (d > span)
                    break;
                const t = d / span, weight = 1 - t * t * (3 - 2 * t);
                ordered[i]!.y = (ordered[i]!.y ?? 0) + (target - source) * weight;
            }
        }
    }
    syncConnections(map);
    for (const r of map.roads.filter(r => !baseLocked.has(r.id))) {
        const pts = r.centerline, len = polylineLength(pts);
        let grade = 0;
        for (let i = 1; i < pts.length; i++)
            grade = Math.max(grade, Math.abs((pts[i]!.y ?? 0) - (pts[i - 1]!.y ?? 0)) / Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z));
        if (grade <= .119 || len >= 700)
            continue;
        const a = pts[0]!.y ?? 0, b = pts.at(-1)!.y ?? 0;
        let d = 0;
        for (let i = 0; i < pts.length; i++) {
            if (i)
                d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
            const t = d / len;
            pts[i]!.y = a + (b - a) * t * t * (3 - 2 * t);
        }
    }
    for (const j of affected) {
        setJunctionPavementFootprint(j, map);
        delete j.approaches;
    }
    populateIntersectionMarkingMetadata(map);
    syncConnections(map);
    // Explicit links at newly coincident external mouths (two-way streets may join one-way frontage arms).
    for (const e of unique) {
        const r = map.roads.find(r => r.id === e.roadId);
        if (!r)
            continue;
        const p = r.centerline[e.end === 'start' ? 0 : r.centerline.length - 1]!;
        if (map.intersections.some(j => j.connections.some(c => c.roadId === e.roadId && c.end === e.end)))
            continue;
        for (const a of map.roads.filter(a => !baseLocked.has(a.id) && a.id !== r.id))
            for (const end of ['start', 'end'] as const) {
                const q = a.centerline[end === 'start' ? 0 : a.centerline.length - 1]!;
                if (Math.hypot(p.x - q.x, p.z - q.z) < .06 && Math.abs((p.y ?? 0) - (q.y ?? 0)) < .2 && !map.roadLinks!.some(l => [l.from, l.to].some(v => key(v) === key(e)) && [l.from, l.to].some(v => v.roadId === a.id && v.end === end)))
                    connectRoads(map, e, { roadId: a.id, end });
            }
    }
    map.version = original.version + 1;
    map.environment.metadata = { ...map.environment.metadata, author: 'scripts/build-city-main-v4.mjs', urbanSkeletonVersion: '4', ordinaryRoadsReplaced: String(original.roads.length - lockedIds.size), innerBoulevardLengthMetres: polylineLength(inner).toFixed(1), innerBoulevardExtent: `${(Math.max(...inner.map(p => p.x)) - Math.min(...inner.map(p => p.x))).toFixed(0)} x ${(Math.max(...inner.map(p => p.z)) - Math.min(...inner.map(p => p.z))).toFixed(0)} m; ordinary 2+2 with southern 3+3`, diagonalLengthMetres: polylineLength(native.find(r => r.id === 'v4-diagonal')!.pts).toFixed(1) };
    relocateV4Signs(map, original);
    cleanupV4Landscape(map, baseLocked);
    return map;
}
