import type { CityMapData, CityRoad } from '../city/CityMapData';
import type { RoadSignDefinition } from '../city/RoadSignData';
import { polylineLength, roadEdges, roadPoints, rotatePoint, sampleAt } from '../city/geometry';
import { RoadClearance } from '../city/RoadClearance';
import { ROAD_SIGN_POST_Z, signDimensions } from '../city/RoadSignTemplates';
import { isControlledAccessRoad, roadFunction } from '../city/RoadClassification';

export const isFastRoad = isControlledAccessRoad;
export const isSafetySign = (sign: RoadSignDefinition) => sign.type === 'SPEED_LIMIT' || sign.type === 'CHEVRON';
type End = { roadId: string; end: 'start' | 'end' };
const readingGap = (a: RoadSignDefinition, b: RoadSignDefinition, roads: Map<string, CityRoad>) =>
  Math.max(45, Math.min(120, Math.max(roads.get(a.roadId)!.speedLimit, roads.get(b.roadId)!.speedLimit) * .9));

/** Same-facing boards whose projected horizontal and vertical reading bands overlap.
 * Opposing traffic and vertically separated decks are deliberately independent. */
export function signReadingConflict(a: RoadSignDefinition, b: RoadSignDefinition, gap = 90): boolean {
  if (Math.cos(a.heading - b.heading) < .9) return false;
  const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
  const heading = Math.atan2(Math.sin(a.heading) + Math.sin(b.heading), Math.cos(a.heading) + Math.cos(b.heading));
  if (Math.abs(-dx * Math.sin(heading) - dz * Math.cos(heading)) >= gap) return false;
  const da = signDimensions(a.template, a.size, a.postOffset, a.gantryPosts, a.mountHeight);
  const db = signDimensions(b.template, b.size, b.postOffset, b.gantryPosts, b.mountHeight);
  if (Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading)) >= (da.width + db.width) / 2 + .8) return false;
  const ya = (a.position.y ?? 0) + da.bottom, yb = (b.position.y ?? 0) + db.bottom;
  return ya < yb + db.height + .3 && yb < ya + da.height + .3;
}

class Placement {
  readonly roads: Map<string, CityRoad>;
  readonly paths: Map<string, ReturnType<typeof roadPoints>>;
  readonly lengths: Map<string, number>;
  readonly links = new Map<string, End[]>();
  readonly clearance: RoadClearance;
  constructor(readonly map: CityMapData) {
    this.roads = new Map(map.roads.map(r => [r.id, r]));
    this.paths = new Map(map.roads.map(r => [r.id, roadPoints(r)]));
    this.lengths = new Map([...this.paths].map(([id, p]) => [id, polylineLength(p)]));
    this.clearance = new RoadClearance(map);
    for (const link of map.roadLinks ?? []) for (const [a, b] of [[link.from, link.to], [link.to, link.from]]) {
      const key = a!.roadId + ':' + a!.end, list = this.links.get(key) ?? [];
      list.push(b!); this.links.set(key, list);
    }
  }
  continuation(road: CityRoad, reverse: boolean, backwards = false): { road: CityRoad; reverse: boolean } | undefined {
    const end = reverse !== backwards ? 'start' : 'end', frame = sampleAt(this.paths.get(road.id)!, end === 'start' ? 0 : this.lengths.get(road.id)!);
    const travel = (reverse ? -1 : 1) * (backwards ? -1 : 1);
    const candidates = (this.links.get(road.id + ':' + end) ?? []).map(e => {
      const next = this.roads.get(e.roadId)!, at = e.end === 'start' ? 0 : this.lengths.get(next.id)!;
      const tangent = sampleAt(this.paths.get(next.id)!, at).tangent, entering = e.end === 'start' ? 1 : -1;
      return { road: next, reverse: backwards ? e.end === 'start' : e.end === 'end', dot: (tangent.x * frame.tangent.x + tangent.z * frame.tangent.z) * travel * entering };
    }).filter(c => isFastRoad(c.road) && c.road.roadNameId === road.roadNameId && c.road.laneCount === road.laneCount &&
      !!c.road.highwayTransition === !!road.highwayTransition && c.dot > .94 &&
      (c.road.travelDirection === 'two-way' || c.road.travelDirection === (c.reverse ? 'reverse' : 'forward')));
    return candidates.sort((a, b) => b.dot - a.dot || a.road.id.localeCompare(b.road.id))[0];
  }
  move(sign: RoadSignDefinition, move: number): RoadSignDefinition | undefined {
    let road = this.roads.get(sign.roadId)!, reverse = sign.laneDirection === 'reverse';
    if (sign.stationMetres === undefined) return move === 0 ? structuredClone(sign) : undefined;
    let station: number = sign.stationMetres;
    station += (reverse ? -1 : 1) * move;
    const seen = new Set<string>();
    while (station < 0 || station > this.lengths.get(road.id)!) {
      if (seen.has(road.id)) return undefined; seen.add(road.id);
      const length = this.lengths.get(road.id)!, overflow: number = station < 0 ? -station : station - length;
      const next = this.continuation(road, reverse, move < 0); if (!next) return undefined;
      road = next.road; reverse = next.reverse;
      station = (move < 0 ? !reverse : reverse) ? this.lengths.get(road.id)! - overflow : overflow;
    }
    const frame = sampleAt(this.paths.get(road.id)!, station), result = structuredClone(sign);
    result.roadId = road.id; result.stationMetres = station; result.position = frame.point;
    result.heading = Math.atan2(-frame.tangent.x, -frame.tangent.z) + (reverse ? Math.PI : 0);
    result.laneDirection = reverse ? 'reverse' : 'forward';
    if (!['gantry', 'highway-gantry', 'ceiling'].includes(sign.template)) {
      const old = sampleAt(this.paths.get(sign.roadId)!, sign.stationMetres), dx = sign.position.x - old.point.x, dz = sign.position.z - old.point.z;
      const lateral = rotatePoint({ x: dx * Math.cos(sign.heading) - dz * Math.sin(sign.heading), z: 0 }, result.heading);
      result.position = { x: frame.point.x + lateral.x, y: frame.point.y, z: frame.point.z + lateral.z };
    }
    if (result.advanceMetres !== undefined) {
      result.actualAdvanceMetres = (sign.actualAdvanceMetres ?? sign.advanceMetres!) - move;
      result.destinations.forEach(d => { if (d.distanceMetres !== undefined) d.distanceMetres = Math.round(result.actualAdvanceMetres!); });
    }
    if (result.template === 'ceiling') {
      const own = road.structure?.enclosure, deck = this.clearance.lowestDeckHeight(frame.point, (frame.point.y ?? 0) + 6.5, (frame.point.y ?? 0) + 25, road.id, 0);
      if (own && own.kind !== 'cutting') result.mountHeight = own.clearance;
      else if (deck !== undefined) result.mountHeight = deck - .65 - (frame.point.y ?? 0);
      else return undefined;
    }
    return result;
  }
  safe(sign: RoadSignDefinition): boolean {
    const d = signDimensions(sign.template, sign.size, sign.postOffset, sign.gantryPosts, sign.mountHeight), y = sign.position.y ?? 0;
    const at = (x: number, z = 0) => { const p = rotatePoint({ x, z }, sign.heading); return { x: sign.position.x + p.x, z: sign.position.z + p.z }; };
    for (const x of d.posts) if (this.clearance.roadAt(at(x, ROAD_SIGN_POST_Z), .44, (sign.postBaseY ?? y) - .3, y + d.poleTop, undefined, undefined, true) ||
      this.clearance.roadAt(at(x, ROAD_SIGN_POST_Z), .3, sign.postBaseY ?? y, y + d.poleTop, sign.roadId) || this.clearance.junctionAt(at(x), .6, y, y + d.poleTop)) return false;
    for (let x = -d.width / 2; x <= d.width / 2 + .01; x += Math.min(1, d.width / 2)) {
      if (this.clearance.roadAt(at(x), .15, y + d.bottom - .2, y + d.bottom + d.height + .2, sign.roadId)) return false;
      if (d.bottom < 4.5 && this.clearance.roadAt(at(x), .15, y - .3, y + d.bottom + d.height, undefined, undefined, true)) return false;
    }
    const enclosed = this.roads.get(sign.roadId)!.structure?.enclosure;
    return !(enclosed && enclosed.kind !== 'cutting' && d.bottom + d.height > enclosed.clearance - .1);
  }
  roadside(road: CityRoad, station: number, reverse: boolean, type: 'SPEED_LIMIT' | 'CHEVRON', id: string, turn?: 'left' | 'right'): RoadSignDefinition | undefined {
    const frame = sampleAt(this.paths.get(road.id)!, station), edges = roadEdges(road), half = road.laneCount * road.laneWidth / 2;
    const shoulder = reverse ? road.shoulders?.left ?? 0 : road.shoulders?.right ?? 0;
    if (shoulder < 1.2 && (frame.point.y ?? 0) > .5) return undefined;
    const offset = shoulder >= 1.2 ? half + shoulder - .45 : (reverse ? -edges.left : edges.right) + (road.sidewalk?.enabled ? road.sidewalk.width : 0) + 1.1;
    const heading = Math.atan2(-frame.tangent.x, -frame.tangent.z) + (reverse ? Math.PI : 0), lateral = rotatePoint({ x: offset, z: 0 }, heading);
    const sign: RoadSignDefinition = { id, type, template: type === 'SPEED_LIMIT' ? 'speed-limit' : 'chevron', size: 'small', roadId: road.id,
      position: { x: frame.point.x + lateral.x, y: frame.point.y, z: frame.point.z + lateral.z }, heading, laneDirection: reverse ? 'reverse' : 'forward',
      destinations: [], language: 'zh-CN', stationMetres: station, ...(type === 'SPEED_LIMIT' ? { speedLimitKmh: road.speedLimit } : { chevronDirection: turn! }) };
    if (!this.safe(sign)) return undefined;
    if (this.map.objects.some(o => Math.abs((o.position.y ?? 0) - (sign.position.y ?? 0)) < 4 && Math.hypot(o.position.x - sign.position.x, o.position.z - sign.position.z) < 2.5)) return undefined;
    return sign;
  }
  compactPreview(sign: RoadSignDefinition): RoadSignDefinition | undefined {
    if (sign.stationMetres === undefined) return undefined;
    const road = this.roads.get(sign.roadId)!, reverse = sign.laneDirection === 'reverse';
    const anchor = this.roadside(road, sign.stationMetres, reverse, 'SPEED_LIMIT', sign.id);
    const positions = anchor ? [anchor.position] : [];
    // A ground-level central reserve is a safe alternative when an auxiliary
    // lane occupies the right shoulder. Never invent a floating bridge footing.
    const frame = sampleAt(this.paths.get(road.id)!, sign.stationMetres);
    if ((frame.point.y ?? 0) < .5) {
      const edges = roadEdges(road), offset = (reverse ? -edges.right : edges.left) - 1.8, lateral = rotatePoint({ x: offset, z: 0 }, sign.heading);
      positions.push({ x: frame.point.x + lateral.x, y: frame.point.y, z: frame.point.z + lateral.z });
    }
    const compact: RoadSignDefinition = { ...sign, template: 'ramp-confirmation', size: 'small', highwayLayout: false,
      destinations: sign.destinations.filter(d => d.arrow !== 'straight') };
    if (!compact.destinations.length) compact.destinations = sign.destinations.slice(0, 1);
    delete compact.gantryPosts; delete compact.postOffset; delete compact.postBaseY; delete compact.mountHeight;
    for (const position of positions) {
      const candidate = { ...compact, position };
      if (this.safe(candidate) && !this.map.objects.some(o => Math.abs((o.position.y ?? 0) - (position.y ?? 0)) < 4 && Math.hypot(o.position.x - position.x, o.position.z - position.z) < 2.5)) return candidate;
    }
    return undefined;
  }
}

export function auditFastRoadSigns(map: CityMapData) {
  const roads = new Map(map.roads.map(r => [r.id, r]));
  const navigation = (map.signs ?? []).filter(s => isFastRoad(roads.get(s.roadId)!) && !isSafetySign(s));
  const conflicts: { a: string; b: string }[] = [];
  for (let i = 0; i < navigation.length; i++) for (let j = i + 1; j < navigation.length; j++)
    if (signReadingConflict(navigation[i]!, navigation[j]!, readingGap(navigation[i]!, navigation[j]!, roads))) conflicts.push({ a: navigation[i]!.id, b: navigation[j]!.id });
  return { navigation: navigation.length, speedLimits: map.signs?.filter(s => s.type === 'SPEED_LIMIT').length ?? 0,
    chevrons: map.signs?.filter(s => s.type === 'CHEVRON').length ?? 0, conflicts };
}

/** Offline authoring only: no runtime scans or physics work. IDs and logical roads stay stable. */
export function optimizeFastRoadSigns(map: CityMapData) {
  const ctx = new Placement(map), before = auditFastRoadSigns(map), original = (map.signs ?? []).filter(s => !s.id.startsWith('road-safety:'));
  const fast = original.filter(s => isFastRoad(ctx.roads.get(s.roadId)!)), kept = original.filter(s => !isFastRoad(ctx.roads.get(s.roadId)!));
  const removed: string[] = [], moved: string[] = [], compacted: string[] = [], unresolved: string[] = [];
  const legacyMovements = new Set(map.regional?.structures.filter(s => s.kind === 'interchange').flatMap(s => s.roadIds));
  const fixedExitMovements = new Set(map.regional?.highways?.exits.flatMap(s => s.roadIds));
  const fixedExit = (s: RoadSignDefinition) => s.decisionIds?.some(id => fixedExitMovements.has(id));
  const priority = (s: RoadSignDefinition) => s.type === 'EXPRESSWAY_DIVERGE' ? 0 : fixedExit(s) ? .5 : s.decisionIds?.length ? 1 : 2;
  for (const authored of fast.sort((a, b) => priority(a) - priority(b) || ctx.lengths.get(a.roadId)! - ctx.lengths.get(b.roadId)! || (a.advanceMetres ?? Infinity) - (b.advanceMetres ?? Infinity) || a.id.localeCompare(b.id))) {
    let sign = authored;
    // 200 m is redundant between the retained 500 m and actual exit board.
    if (sign.advanceMetres === 200 && fast.some(s => s.advanceMetres === 500 && s.incomingRoadId === sign.incomingRoadId)) {
      if (!sign.decisionIds?.some(id => legacyMovements.has(id))) { removed.push(sign.id); continue; }
      const compact = ctx.compactPreview(sign); if (compact) { sign = compact; compacted.push(sign.id); }
    }
    if (sign.id.endsWith(':sign:2000') && (sign.actualAdvanceMetres ?? sign.advanceMetres ?? 2000) < 1600 &&
      fast.some(s => s.advanceMetres === 1000 && s.decisionIds?.some(id => sign.decisionIds?.includes(id)))) { removed.push(sign.id); continue; }
    const optional = !sign.decisionIds?.length && ![...legacyMovements].some(id => sign.id === id + ':confirm');
    if (optional && kept.some(s => s.type === sign.type && JSON.stringify(s.destinations) === JSON.stringify(sign.destinations) && signReadingConflict(s, sign, 450))) { removed.push(sign.id); continue; }
    let placed: RoadSignDefinition | undefined;
    for (const amount of [0, -15, 15, -30, 30, -45, 45, -60, 60, -90, 90, -120, 120, -180, 180, -250, 250, -350, 350, -450, 450]) {
      const advance = (sign.actualAdvanceMetres ?? sign.advanceMetres ?? Infinity) - amount;
      if (fixedExit(sign) && sign.advanceMetres !== undefined && Math.abs(advance - sign.advanceMetres) > 30) continue;
      if (sign.type === 'EXPRESSWAY_DIVERGE' && (advance < 15 || advance > 165) || sign.advanceMetres !== undefined && sign.type !== 'EXPRESSWAY_DIVERGE' && advance < 100) continue;
      const candidate = amount === 0 ? structuredClone(sign) : ctx.move(sign, amount);
      if (!candidate || kept.some(s => signReadingConflict(s, candidate, readingGap(s, candidate, ctx.roads)))) continue;
      const alternatives = [candidate];
      if (amount && candidate.template === 'gantry' && candidate.postOffset !== undefined) for (const extra of [0, 3, 6, 9, 12]) for (const side of [1, -1]) {
        const offset = side * (Math.abs(candidate.postOffset) + extra);
        if (Math.abs(offset) <= 30) alternatives.push({ ...candidate, postOffset: offset });
      }
      // Ground-level auxiliary lanes can block one gantry leg after a shift.
      // Use the existing cantilever template when its roadside foundation fits.
      if (amount && candidate.template === 'highway-gantry' && (candidate.position.y ?? 0) < .5) {
        const edges = roadEdges(ctx.roads.get(candidate.roadId)!);
        for (const extra of [1, 4, 7, 10]) for (const offset of [edges.right + extra, edges.left - extra]) {
          const alternate = { ...candidate, template: 'gantry' as const, postOffset: offset }; delete alternate.gantryPosts;
          alternatives.push(alternate);
        }
      }
      placed = alternatives.find(s => amount === 0 || ctx.safe(s));
      if (placed) { if (amount) moved.push(sign.id); break; }
    }
    if (!placed && sign.type !== 'EXPRESSWAY_DIVERGE' && sign.decisionIds?.length) {
      for (const amount of [0, -15, 15, -30, 30, -60, 60, -90, 90, -120, 120]) {
        const advance = (authored.actualAdvanceMetres ?? authored.advanceMetres ?? Infinity) - amount;
        if (advance < 100 || fixedExit(authored) && Math.abs(advance - authored.advanceMetres!) > 30) continue;
        const shifted = amount === 0 ? authored : ctx.move(authored, amount), compact = shifted && ctx.compactPreview(shifted);
        if (compact && !kept.some(s => signReadingConflict(s, compact, readingGap(s, compact, ctx.roads)))) {
          placed = compact; if (!compacted.includes(sign.id)) compacted.push(sign.id); if (amount) moved.push(sign.id); break;
        }
      }
    }
    if (placed) kept.push(placed);
    else if (optional) removed.push(sign.id);
    else { kept.push(sign); unresolved.push(sign.id); }
  }
  // Walk continuous carriageways, carrying repeat distance across JSON splits.
  // A changed limit resets the spacing; segment count does not create more boards.
  const visited = new Set<string>();
  const directions = (r: CityRoad) => r.travelDirection === 'two-way' ? [false, true] : [r.travelDirection === 'reverse'];
  const ordered = map.roads.filter(r => isFastRoad(r) && !r.highwayTransition).flatMap(road => directions(road).map(reverse => ({ road, reverse })));
  ordered.sort((a, b) => Number(!!ctx.continuation(a.road, a.reverse, true)) - Number(!!ctx.continuation(b.road, b.reverse, true)) || a.road.id.localeCompare(b.road.id));
  for (const start of ordered) {
    let current: typeof start | undefined = start, until = 65, limit = start.road.speedLimit;
    while (current) {
      const { road, reverse } = current, key = road.id + ':' + reverse; if (visited.has(key)) break; visited.add(key);
      if (road.speedLimit !== limit) { until = 35; limit = road.speedLimit; }
      const length = ctx.lengths.get(road.id)!;
      for (; until < length; until += 2000) {
        let placed = false;
        for (const shift of [0, 15, 30, 50, 80]) {
          const distance = until + shift; if (distance >= length) continue;
          const sign = ctx.roadside(road, reverse ? length - distance : distance, reverse, 'SPEED_LIMIT', `road-safety:${key}:speed:${Math.round(until)}`);
          if (sign && !kept.some(s => signReadingConflict(s, sign, 80))) { kept.push(sign); placed = true; break; }
        }
        // Retry in the next segment when a short span is obstructed.
        if (!placed) { until = length + 15; break; }
      }
      until -= length; current = ctx.continuation(road, reverse);
    }
  }
  for (const road of map.roads.filter(r => isFastRoad(r) && !r.highwayTransition && (roadFunction(r) === 'ramp' || r.gore?.start || r.speedLimit >= 70))) {
    const path = ctx.paths.get(road.id)!, length = ctx.lengths.get(road.id)!;
    for (const reverse of directions(road)) {
      let count = 0;
      for (let d = 55; d < length - 25 && count < 4; d += 75) {
        const at = reverse ? length - d : d, a = sampleAt(path, Math.max(0, at - 25)).tangent, b = sampleAt(path, Math.min(length, at + 25)).tangent;
        const angle = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z) * (reverse ? -1 : 1);
        if (Math.abs(angle) < .13 && !(road.gore?.start && d < 135)) continue;
        const turn = angle > 0 ? 'right' : angle < 0 ? 'left' : 'right';
        const sign = ctx.roadside(road, at, reverse, 'CHEVRON', `road-safety:${road.id}:${reverse}:guide:${Math.round(d)}`, turn);
        if (sign && !kept.some(s => signReadingConflict(s, sign, 65))) { kept.push(sign); count++; }
      }
    }
  }
  map.signs = kept.sort((a, b) => a.id.localeCompare(b.id));
  return { before, after: auditFastRoadSigns(map), removed, moved, compacted, unresolved };
}
