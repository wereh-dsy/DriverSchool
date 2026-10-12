import type { CityMapData, CityRoad } from '../city/CityMapData';
import type { RoadSignDefinition, RoadSignDestination } from '../city/RoadSignData';
import { polylineLength, sampleAt } from '../city/geometry';

/** Sign authoring follows directed graph links; crossings never create destinations. */
export function generateHighwaySigns(map: CityMapData): void {
  const highway = map.regional!.highways!, names = map.roadNames!, roads = new Map(map.roads.map(r => [r.id, r]));
  map.signs = (map.signs ?? []).filter(s => !s.id.startsWith('regional:') && !s.id.startsWith('highway:'));
  for (const route of highway.routes) for (const direction of ['forward', 'reverse'] as const) names[`${route.id}:${direction}`] = { primaryText: route.direction[direction], kind: 'destination' };
  for (const exit of highway.exits) names[exit.id + ':destinations'] = { primaryText: exit.destinations.join(' / '), kind: 'destination' };
  const previous = new Map<string, CityRoad[]>();
  for (const link of map.roadLinks!) if (link.from.end === 'end' && link.to.end === 'start') { const list = previous.get(link.to.roadId) ?? []; list.push(roads.get(link.from.roadId)!); previous.set(link.to.roadId, list); }
  const upstream = (road: CityRoad, distance: number) => {
    let station = polylineLength(road.centerline) - distance, travelled = 0; const seen = new Set<string>();
    while (station < 0 && !seen.has(road.id)) {
      seen.add(road.id); const candidates = (previous.get(road.id) ?? []).filter(r => r.type === 'highway' || r.type === 'ramp_1').sort((a, b) => Number(b.roadNameId === road.roadNameId) - Number(a.roadNameId === road.roadNameId) || b.laneCount - a.laneCount);
      const next = candidates.find(r => !seen.has(r.id)); if (!next) break;
      travelled += polylineLength(road.centerline); road = next; station += polylineLength(road.centerline);
    }
    return { road, station: Math.max(0, station), actualDistance: station < 0 ? travelled + polylineLength(road.centerline) : distance };
  };
  const direction = (road: CityRoad) => road.id.includes(':in') || road.id.includes('wb') || road.id.includes('sb') ? 'reverse' : 'forward';
  const straight = (road: CityRoad): RoadSignDestination => ({ roadNameId: road.roadNameId!, directionId: names[`${road.roadNameId}:${direction(road)}`]?`${road.roadNameId}:${direction(road)}`:undefined, arrow: 'straight' });
  const used = new Map<string, RoadSignDefinition>();
  const board = (source: CityRoad, distance: number, id: string, destinations: RoadSignDestination[], node?: string, decisions?: string[], exitNumber?: string, facilities?: string[]) => {
    const location = upstream(source, distance), s = sampleAt(location.road.centerline, location.station), half = location.road.laneCount * location.road.laneWidth / 2;
    // Keep different decisions readable when their advance positions coincide.
    const key = location.road.id + ':' + Math.round(location.station / 12), existing = used.get(key);
    if (existing && existing.interchangeId === node && existing.advanceMetres===Math.round(location.actualDistance) && decisions?.length) { existing.decisionIds = [...new Set([...(existing.decisionIds ?? []), ...(decisions ?? [])])];for(const d of destinations)if(existing.destinations.length<4&&!existing.destinations.some(e=>e.roadNameId===d.roadNameId&&e.directionId===d.directionId&&e.arrow===d.arrow))existing.destinations.push({...d,distanceMetres:d.arrow==='straight'?undefined:Math.round(location.actualDistance)});return existing; }
    const shift = existing ? 25 : 0, at = Math.max(0, location.station - shift), pose = sampleAt(location.road.centerline, at);
    const sign: RoadSignDefinition = { id, type: distance <= 35 ? 'EXPRESSWAY_DIVERGE' : 'EXPRESSWAY_ADVANCE', template: 'highway-gantry', size: 'large', roadId: location.road.id, position: pose.point, heading: Math.atan2(-pose.tangent.x, -pose.tangent.z), laneDirection: 'forward', destinations: destinations.map(d => ({ ...d, distanceMetres: d.arrow === 'straight' && d.distanceMetres === undefined ? undefined : Math.round(location.actualDistance + shift) })), language: 'zh-CN', interchangeId: node, exitNumber, advanceMetres: Math.round(location.actualDistance + shift), stationMetres: at, decisionIds: decisions, incomingRoadId: source.id, gantryPosts: [-half - (location.road.shoulders?.left ?? 1) - .6, half + (location.road.shoulders?.right ?? 3) + .6], highwayLayout: true, facilities };
    // Supports sit inside paved shoulders, including on bridge decks.
    if(sign.gantryPosts)sign.gantryPosts=[-half-(location.road.shoulders?.left??1)+.35,half+(location.road.shoulders?.right??3)-.35];
    sign.actualAdvanceMetres=location.actualDistance+location.station-at;sign.advanceMetres=Math.round(location.actualDistance);
    sign.destinations.forEach(d=>{if(d.distanceMetres!==undefined)d.distanceMetres=sign.advanceMetres;});
    if (!decisions?.length) { sign.type = 'RAMP_CONFIRMATION'; sign.advanceMetres = undefined;sign.actualAdvanceMetres=undefined; }
    // An advance marker on a single-lane predecessor uses an ordinary support;
    // the lane-spanning diverge board always remains on its mainline.
    if (location.road.laneCount === 1) { sign.template = 'dual-post'; sign.gantryPosts = undefined; sign.size = 'medium'; sign.position = { x: s.point.x - s.tangent.z * (half + 6), y: s.point.y, z: s.point.z + s.tangent.x * (half + 6) }; }
    if(sign.type==='EXPRESSWAY_DIVERGE'&&sign.template==='highway-gantry')sign.laneArrows=Array.from({length:location.road.laneCount},(_,i)=>i===location.road.laneCount-1?(destinations.find(d=>d.arrow.startsWith('exit-'))?.arrow??'straight'):'straight');
    map.signs!.push(sign); used.set(key, sign);return sign;
  };
  const decisions = new Map<string, CityRoad[]>();
  for (const ramp of map.roads.filter(r => r.id.startsWith('regional:') && (r.gore?.start || r.highwayTransition?.kind === 'deceleration'))) {
    const incoming = map.roadLinks!.find(l => l.to.roadId === ramp.id && l.to.end === 'start'), source = incoming && roads.get(incoming.from.roadId);
    if (!source || source.laneCount < 2 || !source.roadNameId) continue;
    const list = decisions.get(source.id) ?? []; list.push(ramp); decisions.set(source.id, list);
  }
  for (const [sourceId, ramps] of decisions) {
    const source = roads.get(sourceId)!, destinations: RoadSignDestination[] = [straight(source)];
    const exit = highway.exits.find(e => e.roadIds.includes(ramps[0]!.id)), service = highway.services.find(e => e.roadIds.includes(ramps[0]!.id)), hub = highway.junctions.find(e => e.roadIds.includes(ramps[0]!.id));
    for (const ramp of ramps) {
      const turn = ramp.highwayTransition ? roads.get(ramp.highwayTransition.decisionId)! : ramp;
      const next = map.roadLinks!.find(l => l.from.roadId === turn.id && l.from.end === 'end');let receiving=next&&roads.get(next.to.roadId);
      if(receiving?.highwayTransition){const merged=map.roadLinks!.find(l=>l.from.roadId===receiving!.id&&l.from.end==='end');receiving=merged&&roads.get(merged.to.roadId);}
      const frame = sampleAt(source.centerline, polylineLength(source.centerline)), q = sampleAt(ramp.centerline, Math.min(20, polylineLength(ramp.centerline))).point;
      const side = (q.x - frame.point.x) * -frame.tangent.z + (q.z - frame.point.z) * frame.tangent.x;
      const roadNameId = exit ? exit.id : service ? service.id : receiving?.roadNameId ?? ramp.roadNameId!;
      // An auxiliary lane is authored on the driver's right. Its distant ramp
      // destination may lie anywhere on the map; that cannot change its arrow.
      const target: RoadSignDestination = { roadNameId, directionId: exit?exit.id+':destinations':!service && receiving?.roadNameId ? `${receiving.roadNameId}:${direction(receiving)}` : undefined, arrow: ramp.highwayTransition?'exit-right':side < -.15 ? 'exit-left' : 'exit-right' };
      if (!destinations.some(d => d.roadNameId === target.roadNameId && d.directionId === target.directionId)) destinations.push(target);
    }
    const ids = ramps.map(r => r.highwayTransition?.decisionId ?? r.id), node = exit?.id ?? service?.id ?? hub?.id;
    for (const distance of [2000, 1000, 500, 200, 35]) {const sign=board(source, distance, `${ids[0]!}:sign:${distance}`, destinations.slice(0, 4), node, ids, exit?.exitNumber, service?.facilities);if(service&&distance>35)sign.type='EXPRESSWAY_SERVICE';}
  }
  for (const route of highway.routes) for (const directionName of ['out', 'in']) {
    const list = route.roadIds.map(id => roads.get(id)!).filter(r => r.id.includes(':' + directionName));
    const first = list.find(r => !(previous.get(r.id) ?? []).some(p => list.includes(p))) ?? list[0]!;
    const length = polylineLength(first.centerline);
    board(first, Math.max(0, length - Math.min(170, length * .65)), `highway:${route.id}:${directionName}:confirmation`, [straight(first)]);
  }
  for(const hub of highway.junctions.filter(h=>h.roadIds.some(id=>roads.get(id)!.laneCount>1))){
    for(const link of map.roadLinks!.filter(l=>hub.roadIds.includes(l.from.roadId)&&hub.roadIds.includes(l.to.roadId))){
      const source=roads.get(link.from.roadId)!,target=roads.get(link.to.roadId)!;if(source.roadNameId===target.roadNameId)continue;
      for(const distance of [2000,1000,500,35])board(source,distance,`${hub.id}:${source.id}:sign:${distance}`,[straight(source),{...straight(target),distanceMetres:distance}],hub.id,[link.id]);
    }
  }
  for(const ramp of map.roads.filter(r=>r.id.startsWith('regional:')&&r.gore?.start&&r.roadNameId)){
    const next=map.roadLinks!.find(l=>l.from.roadId===ramp.id&&l.from.end==='end'),receiving=next&&roads.get(next.to.roadId),road=receiving&&receiving.laneCount>1&&receiving.roadNameId?receiving:ramp;
    board(road,Math.max(0,polylineLength(road.centerline)-Math.min(140,polylineLength(road.centerline)*.65)),`${ramp.id}:confirm`,[straight(road)]);
  }
  for(const ramp of map.roads.filter(r=>r.id.startsWith('regional:')&&r.gore?.end)){
    const next=map.roadLinks!.find(l=>l.from.roadId===ramp.id&&l.from.end==='end');let target=next&&roads.get(next.to.roadId);
    if(target?.highwayTransition){const end=map.roadLinks!.find(l=>l.from.roadId===target!.id&&l.from.end==='end');target=end&&roads.get(end.to.roadId);}
    if(!target?.roadNameId)continue;
    const entry=board(ramp,Math.max(0,polylineLength(ramp.centerline)-Math.min(100,polylineLength(ramp.centerline)*.7)),`${ramp.id}:entry`,[straight(target)]);
    entry.type='EXPRESSWAY_ENTRY';
  }
  // Sparse continuous-section mileage boards. Distances follow the directed
  // mainline graph, not Euclidean distance or a made-up fixed kilometre value.
  const nextMain=new Map<string,CityRoad[]>();
  for(const l of map.roadLinks!)if(l.from.end==='end'&&l.to.end==='start'){const a=roads.get(l.from.roadId)!,b=roads.get(l.to.roadId)!;if(a.roadNameId===b.roadNameId&&b.type==='highway'){const list=nextMain.get(a.id)??[];list.push(b);nextMain.set(a.id,list);}}
  const mileageNodes=[...highway.junctions,...highway.exits,...highway.services].map(node=>({id:node.id,approaches:new Set([...node.roadIds,...map.roadLinks!.filter(l=>node.roadIds.includes(l.to.roadId)&&roads.get(l.from.roadId)!.type==='highway').map(l=>l.from.roadId)])}));
  for(const route of highway.routes)for(const dir of ['out','in']){
    const list=route.roadIds.map(id=>roads.get(id)!).filter(r=>r.id.includes(':'+dir)),first=list.find(r=>!(previous.get(r.id)??[]).some(p=>list.includes(p)));if(!first)continue;
    let road:CityRoad|undefined=first,covered=0,lastBoard=-4500;const seen=new Set<string>();
    while(road&&!seen.has(road.id)){
      seen.add(road.id);const length=polylineLength(road.centerline);
      if(length>200&&covered-lastBoard>=4500){
        const records: {id:string;distance:number}[]=[],todo=[{r:road,d:-150}],visited=new Set<string>();
        while(todo.length){const state=todo.shift()!;if(visited.has(state.r.id))continue;visited.add(state.r.id);const endDistance=state.d+polylineLength(state.r.centerline);
          for(const node of mileageNodes)if(node.approaches.has(state.r.id)&&endDistance>500&&!records.some(v=>v.id===node.id))records.push({id:node.id,distance:endDistance});
          for(const r of nextMain.get(state.r.id)??[])todo.push({r,d:endDistance});
        }
        const destinations=records.sort((a,b)=>a.distance-b.distance).slice(0,3).map(v=>({roadNameId:v.id,arrow:'straight' as const,distanceMetres:Math.round(v.distance/100)*100}));
        if(destinations.length){const sign=board(road,length-150,`highway:${route.id}:${dir}:mileage:${Math.round(covered)}`,destinations);sign.type='EXPRESSWAY_DISTANCE';sign.destinations=destinations;lastBoard=covered;}
      }
      covered+=length;road=nextMain.get(road.id)?.[0];
    }
  }
  const airport=roads.get('regional:airport-terminal-access');
  if(airport){
    const s=sampleAt(airport.centerline,35),offset=airport.laneCount*airport.laneWidth/2+(airport.shoulders?.right??0)+4;
    names['airport:terminal']={primaryText:'T1 / T2 航站楼',kind:'destination'};
    map.signs!.push({id:'highway:airport-local:terminal',type:'URBAN_DIRECTION',template:'dual-post',size:'medium',roadId:airport.id,position:{x:s.point.x-s.tangent.z*offset,y:s.point.y,z:s.point.z+s.tangent.x*offset},heading:Math.atan2(-s.tangent.x,-s.tangent.z),laneDirection:'forward',destinations:[{roadNameId:'airport:terminal',arrow:'straight'}],language:'zh-CN',stationMetres:35});
  }
}

