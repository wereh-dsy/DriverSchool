import { InstancedMesh, Mesh, MeshBasicMaterial } from 'three';
import type { CityMapData } from '../city/CityMapData';
import { newCityMap } from '../city/CityMapData';
import type { RoadSignDefinition } from '../city/RoadSignData';
import { RoadSignRenderer } from '../city/RoadSignRenderer';
import { validateRoadSignData } from '../city/RoadSignValidation';
import { roadSignColliders, signDimensions } from '../city/RoadSignTemplates';
import { RoadClearance } from '../city/RoadClearance';
import { polylineLength, roadPoints, rotatePoint, sampleAt } from '../city/geometry';
import { auditFastRoadSigns, isSafetySign, optimizeFastRoadSigns, signReadingConflict } from './FastRoadSignPlacement';

export function runFastRoadSignPlacementSelfTest(maps: readonly CityMapData[]) {
  let assertions = 0;
  const check = (value: unknown, message: string) => { assertions++; if (!value) throw new Error('Fast road signs: ' + message); };
  const fixture = newCityMap(); fixture.roads = [{ id: 'trunk', type: 'highway', centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -3200 }],
    laneCount: 4, laneWidth: 3.75, travelDirection: 'two-way', speedLimit: 100, roadNameId: 'route', shoulders: { left: 3, right: 3 } }];
  fixture.roadNames = { route: { primaryText: '测试快速路', kind: 'expressway' } }; fixture.signs = []; fixture.objects = []; fixture.intersections = [];
  const topology = JSON.stringify(fixture.roads), authored = optimizeFastRoadSigns(fixture);
  const speed = fixture.signs!.filter(s => s.type === 'SPEED_LIMIT');
  check(speed.length === 4 && speed.filter(s => s.laneDirection === 'reverse').length === 2, 'speed repeats follow distance and both travel directions');
  check(speed.every(s => s.speedLimitKmh === 100), 'speed values derive from the road');
  check(authored.after.conflicts.length === 0 && JSON.stringify(fixture.roads) === topology, 'authoring never changes road geometry');
  const firstPass = JSON.stringify(fixture.signs); optimizeFastRoadSigns(fixture);
  check(firstPass === JSON.stringify(fixture.signs), 'repeated authoring preserves IDs, positions and counts');
  const split = structuredClone(fixture); split.signs = []; split.roads = Array.from({ length: 32 }, (_, i) => ({ ...fixture.roads[0]!, id: 'piece-' + i,
    centerline: [{ x: 0, y: 0, z: -100 * i }, { x: 0, y: 0, z: -100 * (i + 1) }] }));
  split.roadLinks = split.roads.slice(1).map((r, i) => ({ id: 'join-' + i, from: { roadId: split.roads[i]!.id, end: 'end' }, to: { roadId: r.id, end: 'start' } }));
  optimizeFastRoadSigns(split);
  check(split.signs.filter(s => s.type === 'SPEED_LIMIT').length === speed.length, 'JSON splits do not multiply speed boards');
  split.roads[16]!.speedLimit = 80; optimizeFastRoadSigns(split);
  check(split.signs.some(s => s.type === 'SPEED_LIMIT' && s.roadId === 'piece-16' && s.speedLimitKmh === 80), 'a changed speed receives a new actual-limit board');

  const board: RoadSignDefinition = { id: 'a', type: 'EXPRESSWAY_ADVANCE', template: 'gantry', size: 'large', roadId: 'trunk',
    position: { x: 0, y: 0, z: -500 }, heading: 0, laneDirection: 'forward', destinations: [{ roadNameId: 'route', arrow: 'straight' }], language: 'zh-CN' };
  const nearby = { ...board, id: 'b', position: { x: 0, y: 0, z: -550 }, heading: .1 };
  check(signReadingConflict(board, nearby) && signReadingConflict(nearby, board), 'reading exclusion is symmetric on bends');
  check(!signReadingConflict(board, { ...nearby, heading: Math.PI }), 'opposing directions stay independent');
  check(!signReadingConflict(board, { ...nearby, position: { x: 0, y: 15, z: -550 } }), 'separate decks stay independent');
  check(!signReadingConflict(board, { ...nearby, position: { x: 30, y: 0, z: -550 } }), 'separate lateral reading bands stay independent');
  const linked = structuredClone(fixture); linked.roads = [0, 1].map(i => ({ ...fixture.roads[0]!, id: 'link-' + i, travelDirection: 'forward',
    centerline: [{ x: 0, y: 0, z: -1000 * i }, { x: 0, y: 0, z: -1000 * (i + 1) }] }));
  linked.roadLinks = [{ id: 'seam', from: { roadId: 'link-0', end: 'end' }, to: { roadId: 'link-1', end: 'start' } }];
  linked.signs = [{ ...board, id: 'future', roadId: 'link-1', position: { x: 0, y: 0, z: -1010 }, stationMetres: 10, advanceMetres: 990, actualAdvanceMetres: 990,
    decisionIds: ['future-exit'], destinations: [{ roadNameId: 'route', arrow: 'exit-right', distanceMetres: 990 }] },
    { ...board, id: 'now', roadId: 'link-1', type: 'EXPRESSWAY_DIVERGE', position: { x: 0, y: 0, z: -1025 }, stationMetres: 25, advanceMetres: 35, decisionIds: ['near-exit'] }];
  optimizeFastRoadSigns(linked); const relocated = linked.signs.find(s => s.id === 'future')!;
  check(relocated.roadId === 'link-0', 'a crowded advance board crosses a real continuation split');
  check(relocated.actualAdvanceMetres === 2000 + relocated.position.z && relocated.destinations[0]!.distanceMetres === relocated.actualAdvanceMetres,
    'relocated distance equals independently measured distance to the decision');
  const invalid = structuredClone(fixture); invalid.signs![0]!.speedLimitKmh = 200;
  check(validateRoadSignData(invalid).some(i => i.message.includes('5–160')), 'invalid speed values are rejected');
  invalid.signs![0]!.speedLimitKmh = 100; invalid.signs![0]!.destinations = [{ roadNameId: 'route', arrow: 'straight' }];
  check(validateRoadSignData(invalid).some(i => i.message.includes('do not contain')), 'safety signs cannot invent navigation destinations');

  const results = [];
  for (const map of maps) {
    const audit = auditFastRoadSigns(map), roads = new Map(map.roads.map(r => [r.id, r])), clearance = new RoadClearance(map);
    check(!audit.conflicts.length, map.name + ': no same-facing reading-band conflicts');
    check(!validateRoadSignData(map).length, map.name + ': valid sign schema');
    check(audit.speedLimits > 0 && audit.chevrons > 0, map.name + ': both safety categories exist');
    for (const sign of map.signs!.filter(isSafetySign)) {
      const road = roads.get(sign.roadId)!, path = roadPoints(road), frame = sampleAt(path, sign.stationMetres!), reverse = sign.laneDirection === 'reverse';
      const heading = Math.atan2(-frame.tangent.x, -frame.tangent.z) + (reverse ? Math.PI : 0);
      check(Math.abs(Math.atan2(Math.sin(sign.heading - heading), Math.cos(sign.heading - heading))) < 1e-7, 'face follows driver approach ' + sign.id);
      check(Math.abs((sign.position.y ?? 0) - (frame.point.y ?? 0)) < 1e-7, 'footing follows physical road height ' + sign.id);
      const d = signDimensions(sign.template, sign.size);
      for (const x of [-d.width / 2, 0, d.width / 2]) {
        const q = rotatePoint({ x, z: 0 }, sign.heading), point = { x: sign.position.x + q.x, z: sign.position.z + q.z }, y = sign.position.y ?? 0;
        check(!clearance.roadAt(point, .1, y - .3, y + d.bottom + d.height, undefined, undefined, true), 'low sign stays outside traffic lanes ' + sign.id);
      }
      check(roadSignColliders(sign).length === 2, 'one physical post and one matching board ' + sign.id);
      if (sign.type === 'SPEED_LIMIT') check(sign.speedLimitKmh === road.speedLimit, 'posted limit matches actual road ' + sign.id);
      else {
        const at = sign.stationMetres!, a = sampleAt(path, Math.max(0, at - 25)).tangent, b = sampleAt(path, Math.min(polylineLength(path), at + 25)).tangent;
        const turn = (a.x * b.z - a.z * b.x) * (reverse ? -1 : 1);
        check(Math.abs(turn) < .001 || sign.chevronDirection === (turn > 0 ? 'right' : 'left'), 'chevron follows the driver-relative curve ' + sign.id);
      }
    }
    // Repeated safety content must reuse tiny textures, independently of sign count.
    const painted: string[] = [], context = new Proxy({ font: '' }, { get: (t, k) => k === 'font' ? t.font : k === 'fillText' ? (text: string) => painted.push(text) : () => {}, set: (t, k, v) => { if (k === 'font') t.font = v; return true; } });
    const canvases: { width: number; height: number }[] = [];
    const renderer = new RoadSignRenderer(map.roadNames!, () => { const canvas = { width: 0, height: 0, getContext: () => context }; canvases.push(canvas); return canvas as unknown as HTMLCanvasElement; });
    const safety = map.signs!.filter(isSafetySign), root = renderer.buildInstances(safety);
    const unique = new Set(safety.map(s => renderer.contentKey(s))).size;
    check(renderer.cacheStats.textures === unique && unique <= 30, 'all speed/chevron repeats share a bounded material cache');
    check(canvases.every(c => c.width <= 384 && c.height <= 256), 'safety boards never allocate large gantry textures');
    check(painted.some(s => /^\d+$/.test(s)), 'limit numerals were painted');
    root.traverse(o => { if (o instanceof InstancedMesh) { check(o.count > 0 && o.material instanceof MeshBasicMaterial, 'batched safety geometry'); o.dispose(); } else if (o instanceof Mesh) o.geometry.dispose(); }); renderer.dispose();
    results.push({ name: map.name, navigation: audit.navigation, speedLimits: audit.speedLimits, chevrons: audit.chevrons, readingConflicts: audit.conflicts.length, uniqueSafetyTextures: unique });
  }
  return { assertions, maps: results };
}
