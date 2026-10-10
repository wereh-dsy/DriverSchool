import { newCityMap, type CityIntersection, type CityMapData, type CityPoint, type CityRoad, type RoadEndpoint } from '../CityMapData';
import { connectionPoint, directionalPortLabel, polylineLength, roadEdges, roadPoints, sampleAt, syncConnections } from '../geometry';
import { RoadClearance } from '../RoadClearance';
import { point3, transformPoint3 } from '../coordinates';
import { CityMapIds } from '../CityMapIds';
import { connectRoads } from '../RoadConnections';
import { validateMap } from '../CityMapValidation';
import { applyRoadStyle } from '../RoadStyles';
import catalog from './catalog.json';
import { validatePresetGeometry } from './PresetGeometryValidation';
import { expandBackbonePreset, isBackbonePreset } from './BackbonePresets';
import { COMPACT_INTERCHANGE_IDS, expandCompactInterchange } from './CompactInterchangePresets';
export const PRESET_CATALOG = catalog.presets;
export type PresetId = typeof catalog.presets[number]['id'];
export interface PresetParameters {
    designProfile?: 'urban' | 'motorway';
    mainApproach?: number;
    crossApproach?: number;
    crossCarriagewayOffset?: number;
    position?: CityPoint;
    rotation?: number;
    mainRoadLanes?: number;
    crossRoadLanes?: number;
    mainElevation?: number;
    rampLaneCount?: number;
    rampRadius?: number;
    groupId?: string;
    length?: number;
    mainProfile?: { offset: number; height: number }[];
    crossProfile?: { offset: number; height: number }[];
    crossElevation?: number;
    collectorAxis?: 'main' | 'cross';
    profileInterpolation?: 'smooth' | 'linear';
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
    if(COMPACT_INTERCHANGE_IDS.includes(id as never)) {
      const stamp=expandCompactInterchange(id,parameters),map={...newCityMap(),...stamp},issues=validatePresetGeometry(map);
      if(issues.length)throw new Error(`preset.geometry ${id}: ${JSON.stringify(issues)}`);return stamp;
    }
    if (isBackbonePreset(id)) return expandBackbonePreset(id, parameters);
    const lanes = parameters.mainRoadLanes ?? 6, cross = parameters.crossRoadLanes ?? 4, height = parameters.mainElevation ?? 8, rampLanes = parameters.rampLaneCount ?? 1, radius = parameters.rampRadius ?? 100;
    if (![4, 6].includes(lanes) || ![4, 6].includes(cross) || ![1, 2].includes(rampLanes) || !Number.isFinite(height) || height < 5 || height > 12 || !Number.isFinite(radius) || radius < 40 || radius > 100)
        throw new Error('preset.parameters: lanes 4/6, ramp lanes 1/2, elevation 5–12m, radius 40–100m required.');
    const loopRadius = Math.max(80, radius);
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
        const r: CityRoad = { id: name(label), ...meta, type: 'highway', centerline: points, laneCount, laneWidth: 3.75, speedLimit: ramp ? 40 : 80, travelDirection: oneWay ? 'forward' : 'two-way' };
        applyRoadStyle(r, ramp ? 'ramp_1' : 'highway_6');
        r.type = laneCount === 1 ? 'ramp_1' : 'highway';
        r.laneCount = laneCount;
        r.travelDirection = oneWay ? 'forward' : 'two-way';
        r.speedLimit = ramp ? 40 : 80;
        if (!ramp) { r.shoulders = { left: 0.75, right: 1.75 }; r.structure!.barrierOffset = 0.25; }
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
        return Array.from({ length: count + 1 }, (_, i) => { const t = i / count, angle = a + sweep * t, u = Math.max(0, Math.min(1, (t - 0.2) / 0.6)), blend = u * u * (3 - 2 * u); return point3(cx + rx * Math.cos(angle), y0 + (y1 - y0) * blend, cz + rz * Math.sin(angle)); });
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
        r.gore = { start: !!a, end: !!b, length: 140 };
        if (a?.incoming)
            link(a.incoming, end(r, 'start'));
        if (b?.outgoing)
            link(end(r, 'end'), b.outgoing);
        return r;
    };
    const A = loopRadius * 7 + 120, L = A + 200, bm = lanes / 2 * 3.75 / 2 + 2.5, bc = cross / 2 * 3.75 / 2 + 2.5;
    const urban = (label: string, points: CityPoint[], count: number): CityRoad => {
        const r = makeRoad(label, points, count);
        r.type = count === 6 ? 'urban_6lane' : count === 4 ? 'urban_4lane' : 'urban_2lane';
        r.styleId = count === 6 ? 'urban_boulevard_6' : count === 4 ? 'urban_street_4' : 'urban_local_2';
        r.laneWidth = count === 6 ? 3.75 : 3.6;
        r.shoulders = undefined; r.sidewalk = { enabled: true, width: 3 };
        r.curb = true; r.streetlights = false; r.structure!.barrierEnabled = false; r.speedLimit = 50;
        return r;
    };
    const bezier = (a: CityPoint, b: CityPoint, c: CityPoint, d: CityPoint): CityPoint[] => {
        const count = Math.ceil((Math.hypot(b.x-a.x,b.z-a.z)+Math.hypot(c.x-b.x,c.z-b.z)+Math.hypot(d.x-c.x,d.z-c.z))/3);
        return Array.from({length: count+1}, (_,i) => {
            const t=i/count, u=1-t, v=Math.max(0,Math.min(1,(t-0.2)/0.6)), blend=v*v*(3-2*v);
            return point3(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
                (a.y??0)+((d.y??0)-(a.y??0))*blend, u*u*u*a.z+3*u*u*t*b.z+3*u*t*t*c.z+t*t*t*d.z);
        });
    };
    if (id.startsWith('signal_cross_') || id.startsWith('t_')) {
        const t = id.startsWith('t_'), mainCount = id.includes('6x') ? 6 : 4, sideCount = id.endsWith('x2') ? 2 : id.endsWith('x6') ? 6 : 4;
        const j: CityIntersection = { id: name('junction'), ...meta, type: t ? 't_4lane' : mainCount === 6 ? 'cross_6lane' : 'cross_4lane',
            position: point3(0,0,0), rotation: 0, connections: [], signalized: true, signals: {headHeight: 6}, channelized: id.includes('channelized') };
        m.intersections.push(j);
        for (const [label, x, z, p] of [['North',0,-220,'north'],['East',220,0,'east'],['South',0,220,'south'],['West',-220,0,'west']] as const) {
            if(t && p === 'south') continue;
            const r = urban(label.toLowerCase(), [point3(x,0,z), connectionPoint(j,p,m)], p === 'north' || p === 'south' ? (t ? sideCount : mainCount) : (t ? mainCount : sideCount));
            j.connections.push({roadId:r.id,end:'end',port:p}); port(label, end(r,'start'));
        }
    }
    else if (['urban_boulevard_straight','urban_boulevard_curve','elevated_expressway_straight','elevated_expressway_curve'].includes(id)) {
        const elevated = id.startsWith('elevated'), curved = id.endsWith('curve'), y = elevated ? height : 0;
        const points = curved ? arc(-300,0,300,300,0,-Math.PI/2,y,y) : [point3(0,y,300),point3(0,y,-300)];
        if(elevated) {
            for(const [label, offset, reverse] of [['northbound',bm,false],['southbound',-bm,true]] as const) {
                const pts = curved ? arc(-300,0,300+offset,300+offset,0,-Math.PI/2,y,y) : points.map(p=>point3(offset,y,p.z));
                const r=makeRoad(label,reverse?pts.reverse():pts,lanes/2,true);
                port(curved ? (reverse ? 'West In' : 'South In') : (reverse ? 'North In' : 'South In'),end(r,'start'));
                port(curved ? (reverse ? 'South Out' : 'West Out') : (reverse ? 'South Out' : 'North Out'),end(r,'end'));
            }
        } else { const r=urban('boulevard',points,lanes); port('South',end(r,'start'));port(curved?'West':'North',end(r,'end')); }
    }
    else if (id === 'urban_overpass') {
        const run = Math.max(600, height / 0.022 + 200);
        const rise=bezier(point3(0,0,run),point3(0,0,run-100),point3(0,height,240),point3(0,height,140));
        const fall=bezier(point3(0,height,-140),point3(0,height,-240),point3(0,0,-run+100),point3(0,0,-run));
        const main = urban('overpass',[...rise,point3(0,height,-140),...fall.slice(1)],lanes);
        main.sidewalk={enabled:false,width:3};main.shoulders={left:0.75,right:1.75};main.structure!.barrierEnabled=true;
        const street=urban('cross-street',[point3(-300,0,0),point3(300,0,0)],cross);
        port('South Mainline', end(main, 'start'));
        port('North Mainline', end(main, 'end'));
        port('West Crossroad', end(street, 'start'));
        port('East Crossroad', end(street, 'end'));
    }
    else if (id === 'highway_entry' || id === 'highway_exit') {
        const entry=id==='highway_entry', span=Math.max(420,height/0.035+180), merge=140;
        chain('mainline',[point3(0,height,span),point3(0,height,entry?-merge:merge),point3(0,height,-span)],lanes/2,'South Mainline In','North Mainline Out');
        const pts=bezier(point3(100,0,span),point3(100,0,span-200),point3(0,height,80),point3(0,height,-merge));
        const r=ramp(id, entry?pts:pts.map(p=>point3(p.x,p.y??0,-p.z)).reverse());
        port(entry?'South Local Entry':'North Local Exit',end(r,entry?'start':'end'));
    }
    else if (id === 'diamond_interchange') {
        const merge = parameters.length ? Math.max(250,parameters.length/2-100) : Math.max(420, height / 0.035 + 180), span = merge + (parameters.length?100:180), x = 160 + loopRadius;
        chain('northbound', [point3(bm, height, span), point3(bm, height, merge), point3(bm, height, -merge), point3(bm, height, -span)], lanes / 2, 'South Mainline In', 'North Mainline Out');
        chain('southbound', [point3(-bm, height, -span), point3(-bm, height, -merge), point3(-bm, height, merge), point3(-bm, height, span)], lanes / 2, 'North Mainline In', 'South Mainline Out');
        const junction = (label: string, x: number): CityIntersection => { const j: CityIntersection = { id: name(label), ...meta, type: cross === 6 ? 'cross_6lane' : 'cross_4lane', position: point3(x, 0, 0), rotation: 0, connections: [], signalized: true }; m.intersections.push(j); return j; };
        const west = junction('west-signal', -x), east = junction('east-signal', x);
        const connect = (j: CityIntersection, portName: 'north' | 'south' | 'east' | 'west', r: CityRoad, which: 'start' | 'end') => j.connections.push({ roadId: r.id, end: which, port: portName });
        const cp = (j: CityIntersection, portName: 'north' | 'south' | 'east' | 'west') => connectionPoint(j, portName, m);
        const w = urban('west-local', [point3(-span, 0, 0), cp(west, 'west')], cross), mid = urban('local-link', [cp(west, 'east'), cp(east, 'west')], cross), e = urban('east-local', [cp(east, 'east'), point3(span, 0, 0)], cross);
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
        const tangent=parameters.length?merge*0.4:230, terminal=parameters.length?merge*0.5:190;
        const ne = ramp('northbound-exit', bezier(point3(bm,height,merge),point3(bm,height,merge-tangent),point3(x,0,terminal),cp(east,'south')));
        connect(east,'south',ne,'end');
        const ni = ramp('northbound-entry', bezier(cp(east,'north'),point3(x,0,-terminal),point3(bm,height,-merge+tangent),point3(bm,height,-merge)));
        connect(east,'north',ni,'start');
        const se = ramp('southbound-exit',bezier(point3(-bm,height,-merge),point3(-bm,height,-merge+tangent),point3(-x,0,-terminal),cp(west,'north')));
        connect(west,'north',se,'end');
        const si = ramp('southbound-entry',bezier(cp(west,'south'),point3(-x,0,terminal),point3(-bm,height,merge-tangent),point3(-bm,height,merge)));
        connect(west,'south',si,'start');
    }
    else if (id === 'cloverleaf_interchange' || id === 'trumpet_interchange') {
        const B = loopRadius + bc, C = loopRadius + bm, trumpet = id === 'trumpet_interchange';
        chain('northbound', [L, A, B, -B, -A, -L].map(z => point3(bm, height, z)), lanes / 2, 'South Mainline In', 'North Mainline Out');
        chain('southbound', [-L, -A, -B, B, A, L].map(z => point3(-bm, height, z)), lanes / 2, 'North Mainline In', 'South Mainline Out');
        chain('eastbound', (trumpet ? [-C, C, A, L] : [-L, -A, -C, C, A, L]).map(x => point3(x, 0, bc)), cross / 2, trumpet ? null : 'West Crossroad In', trumpet ? 'East Branch Out' : 'East Crossroad Out');
        chain('westbound', (trumpet ? [L, A, C, -C] : [L, A, C, -C, -A, -L]).map(x => point3(x, 0, -bc)), cross / 2, trumpet ? 'East Branch In' : 'East Crossroad In', trumpet ? null : 'West Crossroad Out');
        ramp('N-to-E-right', arc(A, A, A - bm, A - bc, Math.PI, Math.PI / 2, height, 0));
        ramp('W-to-N-right', arc(A, -A, A - bm, A - bc, Math.PI / 2, Math.PI / 2, 0, height));
        ramp('S-to-E-loop', arc(-C, B, loopRadius, loopRadius, 0, Math.PI * 1.5, height, 0));
        ramp('W-to-S-loop', arc(-C, -B, loopRadius, loopRadius, Math.PI / 2, Math.PI * 1.5, 0, height));
        if (!trumpet) {
            ramp('E-to-S-right', arc(-A, A, A - bm, A - bc, -Math.PI / 2, Math.PI / 2, 0, height));
            ramp('S-to-W-right', arc(-A, -A, A - bm, A - bc, 0, Math.PI / 2, height, 0));
            ramp('N-to-W-loop', arc(C, -B, loopRadius, loopRadius, Math.PI, Math.PI * 1.5, height, 0));
            ramp('E-to-N-loop', arc(C, B, loopRadius, loopRadius, -Math.PI / 2, Math.PI * 1.5, 0, height));
        }
    }
    else if (id === 'roundabout') {
        const r = Math.max(60,radius), delta = Math.PI / 8, angles = Array.from({ length: 8 }, (_, i) => -Math.PI / 2 + delta - i * Math.PI / 4), ring: CityRoad[] = [];
        for (let i = 0; i < 8; i++)
            ring.push(makeRoad('ring', arc(0, 0, r, r, angles[i]!, -Math.PI / 4, 0, 0), rampLanes, true, true));
        ring.forEach((road, i) => { road.structure!.barrierEnabled = false; road.speedLimit = 25; link(end(road, 'end'), end(ring[(i + 1) % 8]!, 'start')); });
        const directions = ['North', 'West', 'South', 'East'];
        for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 - i * Math.PI / 2, outNode = i * 2, inNode = (outNode + 1) % 8;
            const d = { x: Math.cos(a), z: Math.sin(a) }, right = { x: -d.z, z: d.x };
            const reach=Math.max(220,r+140), separation=rampLanes*3.9/2+3;
            const q=ring[inNode]!.centerline[0]!, angle=angles[inNode]!;
            const tangent={x:Math.sin(angle),z:-Math.cos(angle)};
            const aIn=point3(d.x*reach-right.x*separation,0,d.z*reach-right.z*separation);
            const input=makeRoad('entry',bezier(aIn,point3(aIn.x-d.x*70,0,aIn.z-d.z*70),point3(q.x-tangent.x*25,0,q.z-tangent.z*25),q),rampLanes,true,true);
            const qOut=ring[outNode]!.centerline[0]!, outAngle=angles[outNode]!;
            const tOut={x:Math.sin(outAngle),z:-Math.cos(outAngle)};
            const aOut=point3(d.x*reach+right.x*separation,0,d.z*reach+right.z*separation);
            const output=makeRoad('exit',bezier(qOut,point3(qOut.x+tOut.x*25,0,qOut.z+tOut.z*25),point3(aOut.x-d.x*70,0,aOut.z-d.z*70),aOut),rampLanes,true,true);
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
    // Exit warnings precede the branch, outside paved shoulders and junction sight zones.
    const clearance = new RoadClearance(m);
    for (const r of m.roads.filter(r=>r.gore?.start)) {
        const source = m.roadLinks!.find(l=>l.to.roadId===r.id && l.to.end==='start');
        const main = source && m.roads.find(r=>r.id===source.from.roadId);
        if (!main) continue;
        const pts=roadPoints(main), s=sampleAt(pts,Math.max(0,polylineLength(pts)-100)), offset=roadEdges(main).right+1.2;
        const p=point3(s.point.x-s.tangent.z*offset,s.point.y??0,s.point.z+s.tangent.x*offset);
        if(clearance.permitsProp(p,0.8)) m.objects.push({id:name('exit-sign'),...meta,prefabId:'traffic_sign',position:p,rotation:Math.atan2(s.tangent.x,s.tangent.z)});
    }
    const transform = (q: CityPoint): CityPoint => transformPoint3(q, position, rotation);
    for (const r of m.roads)
        r.centerline = r.centerline.map(transform);
    for (const e of [...m.intersections, ...m.objects]) {
        e.position = transform(e.position);
        e.rotation += rotation;
    }
    syncConnections(m);
    for(const p of m.connectionPorts!) {
        const r=m.roads.find(r=>r.id===p.endpoint.roadId)!, pts=r.centerline;
        const start=p.endpoint.end==='start', a=start?pts[0]!:pts.at(-1)!, b=start?pts[1]!:pts.at(-2)!;
        p.position={...a};p.heading=Math.atan2(a.x-b.x,-(a.z-b.z));
        p.label=directionalPortLabel(p.label,p.heading);
    }
    const report = validateMap(m);
    if (!report.valid)
        throw new Error(`preset.output ${id}: ${report.errors.map(e => `${e.code} ${e.path}: ${e.message}`).join('; ')}`);
    if (descriptor.production) {
        const issues=validatePresetGeometry(m);
        if(issues.length) throw new Error(`preset.geometry ${id}: ${JSON.stringify(issues)}`);
    }
    return { roads: m.roads, intersections: m.intersections, objects: m.objects, roadLinks: m.roadLinks!, connectionPorts: m.connectionPorts!, groupId };
}
