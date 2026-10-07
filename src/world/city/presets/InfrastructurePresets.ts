import { newCityMap, type CityIntersection, type CityMapData, type CityPoint, type CityRoad, type RoadEndpoint } from '../CityMapData';
import { connectionPoint, syncConnections } from '../geometry';
import { point3, transformPoint3 } from '../coordinates';
import { CityMapIds } from '../CityMapIds';
import { connectRoads } from '../RoadConnections';
import { validateMap } from '../CityMapValidation';
import { applyRoadStyle } from '../RoadStyles';
import catalog from './catalog.json';
export const PRESET_CATALOG = catalog.presets;
export type PresetId = typeof catalog.presets[number]['id'];
export interface PresetParameters {
    position?: CityPoint;
    rotation?: number;
    mainRoadLanes?: number;
    crossRoadLanes?: number;
    mainElevation?: number;
    rampLaneCount?: number;
    rampRadius?: number;
    groupId?: string;
}
export interface PresetStamp {
    roads: CityRoad[];
    intersections: CityIntersection[];
    objects: CityMapData['objects'];
    roadLinks: NonNullable<CityMapData['roadLinks']>;
    connectionPorts: NonNullable<CityMapData['connectionPorts']>;
    groupId: string;
}
/** Presets are authoring recipes only. Every generated element is ordinary editable data. */
export function expandPreset(id: string, parameters: PresetParameters = {}): PresetStamp {
    const descriptor = catalog.presets.find(p => p.id === id);
    if (!descriptor)
        throw new Error(`preset.unknown: ${id}`);
    const lanes = parameters.mainRoadLanes ?? 6, cross = parameters.crossRoadLanes ?? 4, height = parameters.mainElevation ?? 6, rampLanes = parameters.rampLaneCount ?? 1, radius = parameters.rampRadius ?? 55;
    if (![4, 6].includes(lanes) || ![4, 6].includes(cross) || ![1, 2].includes(rampLanes) || !Number.isFinite(height) || height < 5 || height > 12 || !Number.isFinite(radius) || radius < 40 || radius > 100)
        throw new Error('preset.parameters: lanes 4/6, ramp lanes 1/2, elevation 5–12m, radius 40–100m required.');
    const position = parameters.position ?? { x: 0, y: 0, z: 0 }, rotation = parameters.rotation ?? 0;
    if (![position.x, position.y ?? 0, position.z, rotation].every(Number.isFinite))
        throw new Error('preset.transform: finite position/rotation required.');
    const groupId = parameters.groupId ?? id;
    const m = newCityMap(), meta = { groupId, presetSource: id };
    const ids = new CityMapIds();
    const name = (label: string) => ids.allocate(`${groupId}:${label}`);
    const end = (r: CityRoad, e: 'start' | 'end'): RoadEndpoint => ({ roadId: r.id, end: e });
    const link = (from: RoadEndpoint, to: RoadEndpoint) => connectRoads(m, from, to, { id: name('link') });
    const port = (label: string, endpoint: RoadEndpoint) => m.connectionPorts!.push({ id: name('port'), label, endpoint, groupId });
    const road = (label: string, points: CityPoint[], laneCount = lanes, oneWay = false, ramp = false): CityRoad => {
        const authoredPoints = points.map(p => ({ ...p }));
        const r: CityRoad = { id: name(label), ...meta, type: 'highway', centerline: points, laneCount, laneWidth: 3.6, speedLimit: ramp ? 40 : 80, travelDirection: oneWay ? 'forward' : 'two-way' };
        applyRoadStyle(r, ramp ? 'ramp_1' : 'highway_6');
        r.type = laneCount === 1 ? 'ramp_1' : 'highway';
        r.laneCount = laneCount;
        r.travelDirection = oneWay ? 'forward' : 'two-way';
        r.speedLimit = ramp ? 40 : 80;
        r.elevationMode = 'custom';
        r.centerline = authoredPoints;
        r.streetlights = false;
        m.roads.push(r);
        return r;
    };
    // Road style assignment changes Y defaults, so preserve authored elevations separately.
    const makeRoad = (label: string, points: CityPoint[], laneCount = lanes, oneWay = false, ramp = false): CityRoad => road(label, points.map(p => ({ ...p })), laneCount, oneWay, ramp);
    const arc = (cx: number, cz: number, rx: number, rz: number, a: number, sweep: number, y0: number, y1: number): CityPoint[] => {
        const count = Math.max(12, Math.ceil(Math.abs(sweep) * Math.max(rx, rz) / 3));
        return Array.from({ length: count + 1 }, (_, i) => { const t = i / count, angle = a + sweep * t, blend = t * t * (3 - 2 * t); return point3(cx + rx * Math.cos(angle), y0 + (y1 - y0) * blend, cz + rz * Math.sin(angle)); });
    };
    const nodeKey = (p: CityPoint) => `${p.x.toFixed(4)},${p.z.toFixed(4)},${(p.y ?? 0).toFixed(4)}`;
    const nodes = new Map<string, {
        incoming?: RoadEndpoint;
        outgoing?: RoadEndpoint;
    }>();
    const chain = (label: string, points: CityPoint[], count: number, startLabel: string | null, endLabel: string | null): void => {
        let previous: CityRoad | undefined;
        for (let i = 1; i < points.length; i++) {
            const r = makeRoad(label, [points[i - 1]!, points[i]!], count, true);
            const start = nodes.get(nodeKey(points[i - 1]!)) ?? {};
            start.outgoing = end(r, 'start');
            nodes.set(nodeKey(points[i - 1]!), start);
            const finish = nodes.get(nodeKey(points[i]!)) ?? {};
            finish.incoming = end(r, 'end');
            nodes.set(nodeKey(points[i]!), finish);
            if (previous)
                link(end(previous, 'end'), end(r, 'start'));
            else if (startLabel)
                port(startLabel, end(r, 'start'));
            if (i === points.length - 1 && endLabel)
                port(endLabel, end(r, 'end'));
            previous = r;
        }
    };
    const ramp = (label: string, points: CityPoint[]): CityRoad => {
        const r = makeRoad(label, points, rampLanes, true, true);
        const a = nodes.get(nodeKey(points[0]!)), b = nodes.get(nodeKey(points.at(-1)!));
        if (a?.incoming)
            link(a.incoming, end(r, 'start'));
        if (b?.outgoing)
            link(end(r, 'end'), b.outgoing);
        return r;
    };
    const L = Math.max(400, radius * 5 + 100), A = Math.max(180, radius * 2 + 40), bm = lanes / 2 * 3.6 / 2 + 1.8, bc = cross / 2 * 3.6 / 2 + 1.8;
    if (id === 'urban_overpass') {
        const run = Math.max(260, height / 0.06 + 160);
        const main = makeRoad('overpass', [point3(0, 0, run), point3(0, height, 140), point3(0, height, -140), point3(0, 0, -run)], lanes);
        const street = makeRoad('cross-street', [point3(-210, 0, 0), point3(210, 0, 0)], cross);
        street.sidewalk = { enabled: true, width: 2.5 };
        street.structure!.barrierEnabled = false;
        street.speedLimit = 40;
        port('South Mainline', end(main, 'start'));
        port('North Mainline', end(main, 'end'));
        port('West Crossroad', end(street, 'start'));
        port('East Crossroad', end(street, 'end'));
    }
    else if (id === 'highway_entry' || id === 'highway_exit') {
        chain('mainline', [point3(0, height, 250), point3(0, height, 0), point3(0, height, -250)], lanes / 2, 'Mainline In', 'Mainline Out');
        const points = id === 'highway_entry' ? [point3(220, 0, 180), point3(180, 0, 180), point3(80, height / 2, 120), point3(0, height, 60), point3(0, height, 0)] : [point3(0, height, 0), point3(0, height, -60), point3(80, height / 2, -120), point3(180, 0, -180), point3(220, 0, -180)];
        points.forEach(point => { point.x *= radius / 55; });
        const r = ramp(id, points);
        r.curve = 'smooth';
        port(id === 'highway_entry' ? 'Local Entry' : 'Local Exit', end(r, id === 'highway_entry' ? 'start' : 'end'));
    }
    else if (id === 'diamond_interchange') {
        const span = Math.max(310, height / 0.05 + 180), merge = Math.max(160, height / 0.06 + 60), x = 55 + radius;
        chain('northbound', [point3(bm, height, span), point3(bm, height, merge), point3(bm, height, -merge), point3(bm, height, -span)], lanes / 2, 'South Mainline In', 'North Mainline Out');
        chain('southbound', [point3(-bm, height, -span), point3(-bm, height, -merge), point3(-bm, height, merge), point3(-bm, height, span)], lanes / 2, 'North Mainline In', 'South Mainline Out');
        const junction = (label: string, x: number): CityIntersection => { const j: CityIntersection = { id: name(label), ...meta, type: cross === 6 ? 'cross_6lane' : 'cross_4lane', position: point3(x, 0, 0), rotation: 0, connections: [], signalized: true }; m.intersections.push(j); return j; };
        const west = junction('west-signal', -x), east = junction('east-signal', x);
        const connect = (j: CityIntersection, portName: 'north' | 'south' | 'east' | 'west', r: CityRoad, which: 'start' | 'end') => j.connections.push({ roadId: r.id, end: which, port: portName });
        const cp = (j: CityIntersection, portName: 'north' | 'south' | 'east' | 'west') => connectionPoint(j, portName, m);
        const w = makeRoad('west-local', [point3(-span, 0, 0), cp(west, 'west')], cross), mid = makeRoad('local-link', [cp(west, 'east'), cp(east, 'west')], cross), e = makeRoad('east-local', [cp(east, 'east'), point3(span, 0, 0)], cross);
        connect(west, 'west', w, 'end');
        connect(west, 'east', mid, 'start');
        connect(east, 'west', mid, 'end');
        connect(east, 'east', e, 'start');
        for (const r of [w, mid, e]) {
            r.structure!.barrierEnabled = false;
            r.speedLimit = 40;
        }
        port('West Crossroad', end(w, 'start'));
        port('East Crossroad', end(e, 'end'));
        const bend = x * 70 / 110;
        const ne = ramp('northbound-exit', [point3(bm, height, merge), point3(bm, height, merge - 25), point3(bend, height / 2, 65), point3(x, 0, 45), cp(east, 'south')]);
        ne.curve = 'smooth';
        connect(east, 'south', ne, 'end');
        const ni = ramp('northbound-entry', [cp(east, 'north'), point3(x, 0, -45), point3(bend, height / 2, -65), point3(bm, height, -merge + 25), point3(bm, height, -merge)]);
        ni.curve = 'smooth';
        connect(east, 'north', ni, 'start');
        const se = ramp('southbound-exit', [point3(-bm, height, -merge), point3(-bm, height, -merge + 25), point3(-bend, height / 2, -65), point3(-x, 0, -45), cp(west, 'north')]);
        se.curve = 'smooth';
        connect(west, 'north', se, 'end');
        const si = ramp('southbound-entry', [cp(west, 'south'), point3(-x, 0, 45), point3(-bend, height / 2, 65), point3(-bm, height, merge - 25), point3(-bm, height, merge)]);
        si.curve = 'smooth';
        connect(west, 'south', si, 'start');
    }
    else if (id === 'cloverleaf_interchange' || id === 'trumpet_interchange') {
        const B = radius + bc, C = radius + bm, trumpet = id === 'trumpet_interchange';
        chain('northbound', [L, A, B, -B, -A, -L].map(z => point3(bm, height, z)), lanes / 2, 'South Mainline In', 'North Mainline Out');
        chain('southbound', [-L, -A, -B, B, A, L].map(z => point3(-bm, height, z)), lanes / 2, 'North Mainline In', 'South Mainline Out');
        chain('eastbound', (trumpet ? [-C, C, A, L] : [-L, -A, -C, C, A, L]).map(x => point3(x, 0, bc)), cross / 2, trumpet ? null : 'West Crossroad In', trumpet ? 'East Branch Out' : 'East Crossroad Out');
        chain('westbound', (trumpet ? [L, A, C, -C] : [L, A, C, -C, -A, -L]).map(x => point3(x, 0, -bc)), cross / 2, trumpet ? 'East Branch In' : 'East Crossroad In', trumpet ? null : 'West Crossroad Out');
        ramp('N-to-E-right', arc(A, A, A - bm, A - bc, Math.PI, Math.PI / 2, height, 0));
        ramp('W-to-N-right', arc(A, -A, A - bm, A - bc, Math.PI / 2, Math.PI / 2, 0, height));
        ramp('S-to-E-loop', arc(-C, B, radius, radius, 0, Math.PI * 1.5, height, 0));
        ramp('W-to-S-loop', arc(-C, -B, radius, radius, Math.PI / 2, Math.PI * 1.5, 0, height));
        if (!trumpet) {
            ramp('E-to-S-right', arc(-A, A, A - bm, A - bc, -Math.PI / 2, Math.PI / 2, 0, height));
            ramp('S-to-W-right', arc(-A, -A, A - bm, A - bc, 0, Math.PI / 2, height, 0));
            ramp('N-to-W-loop', arc(C, -B, radius, radius, Math.PI, Math.PI * 1.5, height, 0));
            ramp('E-to-N-loop', arc(C, B, radius, radius, -Math.PI / 2, Math.PI * 1.5, 0, height));
        }
    }
    else if (id === 'roundabout') {
        const r = radius, delta = 0.2, angles = Array.from({ length: 8 }, (_, i) => -Math.PI / 2 + delta - i * Math.PI / 4), ring: CityRoad[] = [];
        for (let i = 0; i < 8; i++)
            ring.push(makeRoad('ring', arc(0, 0, r, r, angles[i]!, -Math.PI / 4, 0, 0), rampLanes, true, true));
        ring.forEach((road, i) => { road.structure!.barrierEnabled = false; road.speedLimit = 25; link(end(road, 'end'), end(ring[(i + 1) % 8]!, 'start')); });
        const directions = ['North', 'West', 'South', 'East'];
        for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 - i * Math.PI / 2, outNode = i * 2, inNode = (outNode + 1) % 8;
            const d = { x: Math.cos(a), z: Math.sin(a) }, right = { x: -d.z, z: d.x };
            const input = makeRoad('entry', [point3(d.x * 160 - right.x * 5, 0, d.z * 160 - right.z * 5), { ...ring[inNode]!.centerline[0]! }], rampLanes, true, true);
            const output = makeRoad('exit', [{ ...ring[outNode]!.centerline[0]! }, point3(d.x * 160 + right.x * 5, 0, d.z * 160 + right.z * 5)], rampLanes, true, true);
            for (const road of [input, output]) {
                road.structure!.barrierEnabled = false;
                road.speedLimit = 25;
            }
            link(end(input, 'end'), end(ring[inNode]!, 'start'));
            link(end(ring[(outNode + 7) % 8]!, 'end'), end(output, 'start'));
            port(`${directions[i]} In`, end(input, 'start'));
            port(`${directions[i]} Out`, end(output, 'end'));
        }
    }
    else {
        const prefab = (prefabId: CityMapData['objects'][number]['prefabId'], x: number, z: number) => m.objects.push({ id: name(prefabId), ...meta, prefabId, position: point3(x, 0, z), rotation: 0 });
        if (id === 'residential_block') {
            prefab('residential_low', -35, -20);
            prefab('residential_mid', 30, -20);
            prefab('residential_low', -35, 25);
            prefab('parking', 30, 30);
        }
        if (id === 'commercial_block') {
            prefab('office', -40, -25);
            prefab('commercial', 25, -25);
            prefab('parking', -25, 30);
            prefab('parking', 25, 30);
            prefab('bus_stop', 65, 45);
        }
        if (id === 'industrial_block') {
            prefab('industrial', -40, -25);
            prefab('industrial', 25, -25);
            prefab('garage', -40, 30);
            prefab('parking', 20, 30);
            prefab('guardrail', 65, 40);
        }
        for (const x of [-60, -20, 20, 60]) {
            prefab('tree', x, -48);
            prefab('streetlight', x, 52);
        }
    }
    const transform = (q: CityPoint): CityPoint => transformPoint3(q, position, rotation);
    for (const r of m.roads)
        r.centerline = r.centerline.map(transform);
    for (const e of [...m.intersections, ...m.objects]) {
        e.position = transform(e.position);
        e.rotation += rotation;
    }
    syncConnections(m);
    const report = validateMap(m);
    if (!report.valid)
        throw new Error(`preset.output ${id}: ${report.errors.map(e => `${e.code} ${e.path}: ${e.message}`).join('; ')}`);
    return { roads: m.roads, intersections: m.intersections, objects: m.objects, roadLinks: m.roadLinks!, connectionPorts: m.connectionPorts!, groupId };
}
