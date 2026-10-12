import type { CityMapData, CityPoint, CityRoad, RoadEndpoint } from '../city/CityMapData';
import type { RegionalRoute } from './RegionalData';
import { polylineLength, sampleAt } from '../city/geometry';
import { generateRegionalSigns } from './RegionalSigns';
import { addHighwayTransitions } from './HighwayMarkings';
import { RegionalTerrainSampler } from './RegionalTerrain';

type Knot = [number, number, number, number, number];
const point = (x: number, z: number, y = 0): CityPoint => ({ x, y, z });
const ease = (t: number) => t * t * (3 - 2 * t);
function path(knots: Knot[]): CityPoint[] {
  const result: CityPoint[] = [];
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1]!, b = knots[i]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.ceil(length / 15);
    for (let j = i === 1 ? 0 : 1; j <= count; j++) {
      const t = j / count, u = 1 - t, c = length / 3;
      result.push(point(u ** 3 * a[0] + 3 * u * u * t * (a[0] + a[2] * c) + 3 * u * t * t * (b[0] - b[2] * c) + t ** 3 * b[0],
        u ** 3 * a[1] + 3 * u * u * t * (a[1] + a[3] * c) + 3 * u * t * t * (b[1] - b[3] * c) + t ** 3 * b[1], a[4] + (b[4] - a[4]) * ease(t)));
    }
  }
  return result;
}
function offset(points: CityPoint[], width: number): CityPoint[] {
  return points.map((p, i) => { const a = points[Math.max(0, i - 1)]!, b = points[Math.min(points.length - 1, i + 1)]!, l = Math.hypot(b.x - a.x, b.z - a.z); return point(p.x - (b.z - a.z) / l * width, p.z + (b.x - a.x) / l * width, p.y); });
}

/** Extend the existing authored region; never rebuild the city or the original network. */
export function expandHighways(current: CityMapData): CityMapData {
  if (current.regional?.highways) throw new Error('Highway upgrade already applied; use the saved baseline to reproduce it.');
  const map = structuredClone(current), region = map.regional!, names = map.roadNames!;
  let serial = 0;
  const roads = new Map(map.roads.map(r => [r.id, r]));
  const endpoint = (road: CityRoad, end: 'start' | 'end'): RoadEndpoint => ({ roadId: road.id, end });
  const link = (from: RoadEndpoint, to: RoadEndpoint) => map.roadLinks!.push({ id: `regional:upgrade:link:${serial++}`, from, to });
  const add = (id: string, points: CityPoint[], route: string, lanes = 3, speed = 100): CityRoad => {
    const clean=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1]!.x,p.z-points[i-1]!.z)>=.05);
    const road: CityRoad = { id, type: lanes === 1 ? 'ramp_1' : 'highway', styleId:lanes===1?'ramp_1':undefined,centerline: clean, curve: 'polyline', laneCount: lanes, laneWidth: lanes===1?3.8:3.75, travelDirection: 'forward', speedLimit: speed, roadNameId: route,
      designProfile: 'motorway', elevationMode: 'custom', shoulders: { left: 1, right: lanes === 1 ? 2 : 3 }, corridorSection: 'GROUND', structure: { barrierEnabled: true, piersEnabled: false, barrierOffset: .2, medianBarrierStyle: lanes > 1 ? 'concrete' : 'metal' }, streetlights: false };
    map.roads.push(road); roads.set(id, road); return road;
  };
  const route = (id: string, name: string, terrain: string, knots: Knot[], lanes = 3, speed = 100) => {
    const centerline = path(knots), result: RegionalRoute = { id, number: id, name, terrain, lanes, speed, centerline, roadIds: [], connectedRoutes: [] };
    const width = lanes * 3.75 / 2 + 3;
    for (const [direction, points] of [['out', offset(centerline, width)], ['in', offset(centerline, -width).reverse()]] as const) {
      const length = polylineLength(points); let previous: CityRoad | undefined;
      for (let start = 0; start < length; start += 500) {
        const end = Math.min(length, start + 500), section = [sampleAt(points, start).point];
        let d = 0; for (let i = 1; i < points.length; i++) { d += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z); if (d > start && d < end) section.push(points[i]!); }
        section.push(sampleAt(points, end).point);
        const road = add(`regional:${id}:${direction}:${Math.floor(start / 500)}`, section, id, lanes, speed); result.roadIds.push(road.id);
        if (previous) link(endpoint(previous, 'end'), endpoint(road, 'start')); previous = road;
      }
    }
    region.routes.push(result); names[id] = { primaryText: name, routeNumber: id, kind: 'expressway' }; return result;
  };
  const old = (id: string) => region.routes.find(r => r.id === id)!;
  const terminal = (r: RegionalRoute, direction: 'out' | 'in', end: 'start' | 'end') => {
    const list = r.roadIds.map(id => roads.get(id)!).filter(v => v.id.includes(`:${direction}`));
    return list.find(v => !map.roadLinks!.some(l => (end === 'end' ? l.from : l.to).roadId === v.id && (end === 'end' ? l.from : l.to).end === end && list.some(o => o.id === (end === 'end' ? l.to : l.from).roadId)))!;
  };
  const fitEndpoint=(from:CityRoad,to:CityRoad,sourceEnd:'start'|'end',targetEnd:'start'|'end')=>{
    const target=sourceEnd==='end'?from.centerline.at(-1)!:from.centerline[0]!,index=targetEnd==='start'?0:to.centerline.length-1,delta={x:target.x-to.centerline[index]!.x,z:target.z-to.centerline[index]!.z,y:(target.y??0)-(to.centerline[index]!.y??0)};
    to.centerline.forEach((p,i)=>{const t=1-Math.abs(i-index)/(to.centerline.length-1);p.x+=delta.x*ease(t);p.z+=delta.z*ease(t);p.y=(p.y??0)+delta.y*ease(t);});
    const length=polylineLength(to.centerline),own=sampleAt(to.centerline,targetEnd==='start'?0:length).tangent,desired=sampleAt(from.centerline,sourceEnd==='start'?0:polylineLength(from.centerline)).tangent,original=structuredClone(to.centerline);let travelled=0;
    to.centerline.forEach((p,i)=>{if(i)travelled+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);const d=targetEnd==='start'?travelled:length-travelled,span=Math.min(150,length),weight=d*Math.max(0,1-d/span)**2*(targetEnd==='start'?1:-1);p.x+=(desired.x-own.x)*weight;p.z+=(desired.z-own.z)*weight;});
  };
  const connect = (a: RegionalRoute, b: RegionalRoute, reverseA = false) => {
    for (const dir of ['out', 'in'] as const) {
      const from = terminal(a, reverseA ? (dir === 'out' ? 'in' : 'out') : dir, dir === 'out' ? 'end' : 'start'), to = terminal(b, dir, dir === 'out' ? 'start' : 'end');
      // Preserve the actual retained terminal tangent, including lane-count transitions.
      fitEndpoint(from,to,dir==='out'?'end':'start',dir==='out'?'start':'end');
      if (dir === 'out') link(endpoint(from, 'end'), endpoint(to, 'start')); else link(endpoint(to, 'end'), endpoint(from, 'start'));
    }
    a.connectedRoutes.push(b.id); b.connectedRoutes.push(a.id);
  };
  const g42 = route('G42', '晨江高速', '东原经东临走廊接晨江；东原以东长距离平原直线', [[8550, 1800, 0, 1, 0], [9400, 2600, 1, 0, 0], [12600, 2600, 1, 0, 0], [13500, 3100, 0, 1, 0]], 3, 120);
  const g65 = route('G65', '云岭高速', '北岭以北山岭曲线、谷桥和隧道', [[3600, -5000, 1, 0, 48], [4900, -5550, .7, -.7, 62], [5300, -6900, .7, -.7, 72], [6800, -7900, 1, 0, 65], [7600, -7500, 0, 1, 58]], 2);
  const s18 = route('S18', '机场高速', '西川绕城接机场、航站楼和机场服务设施', [[-4700, 800, 0, -1, 13], [-5400, -700, -.4, -.9, 18], [-6300, -3000, 0, -1, 25], [-6300, -6700, 0, -1, 20]], 3);
  const s36 = route('S36', '城际连接高速', '外围绕城经东南至邻近新城', [[6500, 2400, 1, -.25, 12], [8000, 3200, .7, .7, 10], [9700, 6100, 1, 0, 6], [12700, 6100, 1, 0, 4]], 3);
  const s31 = route('S31', '沿江高速', '云岭经东部沿江走廊至晨江；外圈北东连接', [[7600, -7500, 0, 1, 58], [7600, -6000, 0, 1, 36], [8700, -3200, .7, .7, 18], [10800, -1800, .7, .7, 8], [14300, 3800, 0, 1, 0], [13500, 4700, -1, 0, 0], [13500, 3100, 0, -1, 0]], 2);
  connect(old('G17'), g42); connect(old('G38'), g65); connect(old('S89'), s18, true); connect(old('S89'), s36); connect(g65, s31);
  const extendRetained=(id:string,knots:Knot[])=>{
    const original=old(id),addition=route(id+'-extension',original.name,original.terrain,knots,original.lanes,original.speed);
    connect(original,addition);original.centerline.push(...addition.centerline.slice(1));original.roadIds.push(...addition.roadIds);original.connectedRoutes=original.connectedRoutes.filter(r=>r!==addition.id);
    for(const rid of addition.roadIds)roads.get(rid)!.roadNameId=id;
    region.routes=region.routes.filter(r=>r!==addition);delete names[addition.id];
  };
  // Retained short terminal approaches gain sufficient physical distance for a
  // true 2km board, rather than putting a false distance at a dead-end spawn.
  extendRetained('G4516',[[8350,4400,1,0,0],[9450,4400,1,0,0]]);
  extendRetained('S26',[[2750,3700,1,0,0],[3850,3700,1,0,0],[4900,4900,1,0,0]]);
  // The final north/south corridor joins the returning G42 carriageway in a two-way continuation.
  for (const [a, b, ae, be] of [[terminal(s31, 'out', 'end'), terminal(g42, 'in', 'start'), 'end', 'start'], [terminal(g42, 'out', 'end'), terminal(s31, 'in', 'start'), 'end', 'start']] as const) {
    fitEndpoint(a,b,ae,be);link(endpoint(a, ae), endpoint(b, be));
  }
  g42.connectedRoutes.push(s31.id); s31.connectedRoutes.push(g42.id);
  old('S37').number = 'S27'; old('S89').number = 'S12'; old('S89').name = '城市绕城高速'; names.S37!.routeNumber = 'S27'; names.S89!.routeNumber = 'S12'; names.S89!.primaryText = '城市绕城高速';

  const cut = (r: CityRoad, station: number, outgoing: boolean): RoadEndpoint => {
    const length = polylineLength(r.centerline); if (station < .1) return endpoint(r, 'start'); if (station > length - .1) return endpoint(r, 'end');
    const q = sampleAt(r.centerline, station).point, head: CityPoint[] = [], tail: CityPoint[] = []; let d = 0;
    r.centerline.forEach((p, i) => { if (i) d += Math.hypot(p.x - r.centerline[i - 1]!.x, p.z - r.centerline[i - 1]!.z); if (d < station - .01) head.push(p); if (d > station + .01) tail.push(p); });
    const following = { ...structuredClone(r), id: `${r.id}:upgrade${serial++}`, centerline: [q, ...tail] };
    r.centerline = [...head, q]; map.roads.push(following); roads.set(following.id, following);
    for (const l of map.roadLinks!) for (const e of [l.from, l.to]) if (e.roadId === r.id && e.end === 'end') e.roadId = following.id;
    for (const route of region.routes) if (route.roadIds.includes(r.id)) route.roadIds.push(following.id);
    for (const structure of region.structures) if (structure.roadIds.includes(r.id)) structure.roadIds.push(following.id);
    link(endpoint(r, 'end'), endpoint(following, 'start')); return outgoing ? endpoint(following, 'start') : endpoint(r, 'end');
  };
  const attach = (r: RegionalRoute, station: number, direction: number, outgoing: boolean) => {
    const all = r.roadIds.map(id => roads.get(id)!).filter(v => v.id.includes(direction === 1 ? ':out' : ':in'));
    const s = sampleAt(r.centerline, station), q = point(s.point.x - s.tangent.z * (r.lanes * 3.75 / 2 + 3) * direction, s.point.z + s.tangent.x * (r.lanes * 3.75 / 2 + 3) * direction, s.point.y);
    let best = Infinity, chosen = all[0]!, at = 0;
    for (const road of all) { let d = 0; for (let i = 1; i < road.centerline.length; i++) { const a = road.centerline[i - 1]!, b = road.centerline[i]!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / length ** 2)), distance = Math.hypot(q.x - a.x - t * dx, q.z - a.z - t * dz); if (distance < best) { best = distance; chosen = road; at = d + t * length; } d += length; } }
    const e = cut(chosen, at, outgoing), road = roads.get(e.roadId)!; return { end: e, point: e.end === 'start' ? road.centerline[0]! : road.centerline.at(-1)! };
  };
  const access = (r: RegionalRoute, id: string, name: string, station: number, service = false) => {
    const center = sampleAt(r.centerline, station).point, ids: string[] = [];
    names[id] = { primaryText: name, kind: service ? 'destination' : 'interchange' };
    for (const dir of [1, -1]) {
      const from = attach(r, station - dir * 350, dir, false), to = attach(r, station + dir * 350, dir, true), s = sampleAt(r.centerline, station), perpendicular = { x: -s.tangent.z * dir, z: s.tangent.x * dir };
      const c = point(center.x + perpendicular.x * 145 - s.tangent.x * dir * 70, center.z + perpendicular.z * 145 - s.tangent.z * dir * 70, center.y), d = point(center.x + perpendicular.x * 145 + s.tangent.x * dir * 70, center.z + perpendicular.z * 145 + s.tangent.z * dir * 70, center.y);
      const connector = (a: CityPoint, b: CityPoint, tangent: { x: number; z: number }) => path([[a.x, a.z, tangent.x, tangent.z, a.y ?? 0], [b.x, b.z, s.tangent.x * dir, s.tangent.z * dir, b.y ?? 0]]);
      const off = add(`${id}:off:${dir}`, connector(from.point, c, { x: s.tangent.x * dir, z: s.tangent.z * dir }), r.id, 1, 50), local = add(`${id}:local:${dir}`, [c, d], r.id, 2, 30), on = add(`${id}:on:${dir}`, connector(d, to.point, { x: s.tangent.x * dir, z: s.tangent.z * dir }), r.id, 1, 50);
      off.gore = { start: true, end: false, length: 140 }; on.gore = { start: false, end: true, length: 140 };
      link(from.end, endpoint(off, 'start')); link(endpoint(off, 'end'), endpoint(local, 'start')); link(endpoint(local, 'end'), endpoint(on, 'start')); link(endpoint(on, 'end'), to.end); ids.push(off.id, local.id, on.id);
      const pose = (along: number, across: number) => point(center.x + perpendicular.x * across + s.tangent.x * along, center.z + perpendicular.z * across + s.tangent.z * along, center.y);
      for (const [suffix, prefabId, position, scale] of [['parking', 'parking', pose(0, 180), { x: 4, y: 1, z: 2 }], ['building', 'commercial', pose(0, 225), { x: 2, y: .8, z: 1.5 }], ['fuel', 'bus_stop', pose(-70, 210), { x: 3, y: 1.5, z: 3 }], ['toilet', 'garage', pose(65, 225), { x: .6, y: .6, z: .6 }]] as const) map.objects.push({ id: `${id}:${suffix}:${dir}`, prefabId, position, rotation: Math.atan2(s.tangent.x, s.tangent.z), scale });
      for (let i = 0; i < 4; i++) map.objects.push({ id: `${id}:charger:${dir}:${i}`, prefabId: 'traffic_sign', position: pose(10 + i * 5, 200), rotation: 0, scale: { x: .3, y: .6, z: .4 }, color: '#e8f5f0' });
    }
    if (service) region.structures.push({ id, name, kind: 'service', center, roadIds: ids, radius: 450, routes: [r.id], form: 'paired service access', reference: '共享道路图和服务区设施' });
    else region.exits.push({ id, name, route: r.id, roadIds: ids });
  };
  access(g42, 'regional:chenjiang-east', '晨江东互通', 3500); access(g42, 'regional:chenjiang-service', '晨江服务区', 2300, true);
  access(g65, 'regional:yunling-exit', '云岭互通', 3500); access(s18, 'regional:airport-exit', '机场互通', 5000); access(s18, 'regional:airport-service', '机场服务区', 3100, true);
  access(s36, 'regional:newcity-exit', '新城互通', 4500); access(s31, 'regional:yanjiang-exit', '沿江互通', 5000);
  const airport = sampleAt(s18.centerline, 5000); map.objects.push({ id: 'regional:airport-terminal', prefabId: 'office', position: point(airport.point.x + 320, airport.point.z, airport.point.y), rotation: 0, scale: { x: 6, y: .7, z: 2.5 }, label: '机场 T1 / T2 航站楼' });
  const crossingRoads=s36.roadIds.filter(id=>roads.get(id)!.centerline.some(p=>Math.hypot(p.x-8569,p.z-4400)<650));
  for(const id of crossingRoads){const road=roads.get(id)!;road.corridorSection='BRIDGE';road.structure!.piersEnabled=true;road.structure!.pierSpacing=60;road.structure!.barrierStyle='concrete';}
  region.structures.push({id:'regional:newcity-overpass',name:'城际山海跨线桥',kind:'bridge',center:point(8569,4400,8.82),roadIds:crossingRoads,radius:750,routes:['S36'],form:'grade separated crossing',reference:'跨越既有 G4516 联络线；保持两条高速独立连接'});
  const airportLocal=roads.get('regional:airport-exit:local:1')!,airportStart=airportLocal.centerline.at(-1)!,airportAccess=add('regional:airport-terminal-access',path([[airportStart.x,airportStart.z,0,-1,airportStart.y??0],[airport.point.x+230,airport.point.z-150,1,0,airport.point.y??0],[airport.point.x+255,airport.point.z+70,0,1,airport.point.y??0]]),s18.id,2,30);
  airportAccess.travelDirection='two-way';airportAccess.designProfile='urban';airportAccess.structure!.barrierEnabled=false;
  link(endpoint(airportLocal,'end'),endpoint(airportAccess,'start'));
  for (const [start, end, kind, id, name] of [[1600, 2400, 'tunnel', 'regional:yunling-tunnel', '云岭隧道'], [2900, 3400, 'bridge', 'regional:yunling-bridge', '云岭谷桥']] as const) {
    for (const dir of [1, -1]) { attach(g65, start, dir, true); attach(g65, end, dir, true); }
    const ids = g65.roadIds.filter(id => { const road = roads.get(id)!, middle = road.centerline[Math.floor(road.centerline.length / 2)]!, q = sampleAt(g65.centerline, (start + end) / 2).point; return Math.hypot(middle.x - q.x, middle.z - q.z) < (end - start) / 2 + 20; });
    for (const rid of ids) { const road = roads.get(rid)!; road.corridorSection = kind === 'bridge' ? 'BRIDGE' : 'TUNNEL'; road.structure!.piersEnabled = kind === 'bridge'; road.structure!.pierSpacing = 60; road.structure!.barrierStyle = 'concrete'; if (kind === 'tunnel') road.structure!.enclosure = { kind, clearance: 6 }; }
    region.structures.push({ id, name, kind, center: sampleAt(g65.centerline, (start + end) / 2).point, radius: (end - start) / 2 + 150, routes: [g65.id], roadIds: ids, form: kind, reference: '山区连续桥隧走廊' });
  }
  addHighwayTransitions(map);
  map.roads.forEach(road=>roads.set(road.id,road));
  const direction: Record<string, [string, string]> = { G17: ['东原 / 晨江', '市中心'], G38: ['北岭 / 云岭', '市中心'], G4516: ['山海 / 东南新区', '市中心'], S26: ['南港 / 临港', '市中心'], S37: ['西川 / 河湾', '市中心'], S68: ['东原 / 南港', '青岭 / 北岭'], S89: ['东南新区 / 新城', '西川 / 机场'], G42: ['晨江东 / 沿江', '东原 / 市中心'], G65: ['云岭 / 沿江', '北岭 / 市中心'], S18: ['机场 / T1 T2 航站楼', '西川 / 市中心'], S36: ['新城 / 城际新区', '市中心 / 东南新区'], S31: ['沿江 / 晨江', '云岭 / 北岭'] };
  region.highways = { version: 1, routes: region.routes.map(r => ({ id: r.id, number: r.number ?? r.id, name: r.name, type: r.id === 'G4516' ? 'connector' : r.id.startsWith('G') ? 'national' : 'provincial', direction: { forward: direction[r.id]![0], reverse: direction[r.id]![1] }, roadIds: [...r.roadIds] })),
    exits: region.exits.map((e, i) => ({ id: e.id, highway: e.route, exitNumber: String(i + 1).padStart(2, '0'), name: e.name, destinations: e.id.includes('airport') ? ['机场', 'T1 / T2 航站楼'] : [e.name.replace('互通', '城区'), e.id.includes('newcity') ? '城际新区' : '工业园'], position: roads.get(e.roadIds[1]!)!.centerline[0]!, roadIds: [...e.roadIds] })),
    junctions: region.structures.filter(s => s.kind === 'interchange').map(s => ({ kind: 'interchange' as const, id: s.id, name: s.name, connectedRoutes: [...s.routes], directions: Object.fromEntries(s.routes.map(id => [id, { forward: direction[id]![0], reverse: direction[id]![1] }])), position: s.center, roadIds: [...s.roadIds] })),
    services: region.structures.filter(s => s.kind === 'service').map(s => ({ id: s.id, highway: s.routes[0]!, name: s.name, facilities: s.id.includes('parking') ? ['parking', 'toilet'] : ['parking', 'fuel', 'charging', 'food', 'toilet'], position: s.center, roadIds: [...s.roadIds] })) };
  map.bounds = { minX: -7500, maxX: 14500, minZ: -9000, maxZ: 7500 }; region.terrainBounds = { minX: -8500, maxX: 15500, minZ: -10000, maxZ: 8500 }; map.version++;
  for(const [id,name,a,b] of [['chenjiang-link','晨江接续枢纽','G17','G42'],['yunling-link','云岭接续枢纽','G38','G65'],['airport-link','机场枢纽','S89','S18'],['newcity-link','城际枢纽','S89','S36'],['yunjiang-link','云江接续枢纽','G65','S31'],['chenjiang-east-link','晨江东枢纽','G42','S31']] as const){
    const links=map.roadLinks!.filter(l=>{const from=roads.get(l.from.roadId)!.roadNameId,to=roads.get(l.to.roadId)!.roadNameId;return from===a&&to===b||from===b&&to===a;}),first=links[0]!,main=roads.get(first.from.roadId)!;
    region.highways.junctions.push({kind:'continuation',id:`regional:${id}`,name,connectedRoutes:[a,b],directions:Object.fromEntries([a,b].map(id=>[id,region.highways!.routes.find(r=>r.id===id)!.direction])),position:{...(first.from.end==='end'?main.centerline.at(-1)!:main.centerline[0]!)},roadIds:[...new Set(links.flatMap(l=>[l.from.roadId,l.to.roadId]))]});names[`regional:${id}`]={primaryText:name,kind:'interchange'};
  }
  for (const r of [g42, g65, s18, s36, s31]) { const s = sampleAt(r.centerline, 650); map.environment.spawnPoints.push({ id: `regional-${r.id}`, position: point(s.point.x - s.tangent.z * (r.lanes * 3.75 / 2 + 3), s.point.z + s.tangent.x * (r.lanes * 3.75 / 2 + 3), s.point.y), rotation: Math.atan2(-s.tangent.x, -s.tangent.z) }); }
  const terrain=new RegionalTerrainSampler(map);
  for(const r of [g42,g65,s18,s36,s31])for(let station=100;station<polylineLength(r.centerline);station+=180)for(const side of [-1,1]){
    const s=sampleAt(r.centerline,station),distance=110+(station%90),x=s.point.x-s.tangent.z*distance*side,z=s.point.z+s.tangent.x*distance*side;
    if(terrain.nearRoad(x,z,65)||terrain.waterAt(x,z))continue;
    map.objects.push({id:`regional:extension-tree:${r.id}:${station}:${side}`,prefabId:'tree',position:point(x,z,terrain.heightAt(x,z)),rotation:station%6.28,scale:{x:1.5,y:1.4,z:1.5},color:'#72915a'});
  }
  map.environment.metadata = { ...map.environment.metadata, highwaySystemVersion: '1', highwayAuthor: 'scripts/upgrade-regional-highways.mjs' };
  generateRegionalSigns(map); return map;
}



