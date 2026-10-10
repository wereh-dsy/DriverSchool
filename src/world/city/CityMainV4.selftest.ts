import cityMain from './maps/city-main.json';
import baselineData from '../../../artifacts/city-main-v4/v3-base.json';
import { loadCityMap } from './CityMapLoader';
import { validateMap } from './CityMapValidation';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { cityV4LockedRoad } from './maps/CityMainV4Recipe';
import { runCityMainSelfTest } from './CityMain.selftest';
import { runCityMainV3SelfTest } from './CityMainV3.selftest';
import { CityGround } from './CityGround';
import { IntersectionBuilder } from './IntersectionBuilder';
import { RoadBuilder } from './RoadBuilder';
import { createSubject3Materials } from '../subject3/materials';
import { roadPoints, polylineLength, sampleAt, rotatePoint, connectionPoint } from './geometry';
import { junctionSurfaceHeight, junctionSurfaceContains } from './JunctionSurface';
import { VehicleCollisionSystem } from '../../vehicle/physics/CollisionSystem';
import { Mesh } from 'three';
import { LocalRoadMap } from '../../ui/LocalRoadMap';
const assert = (value: unknown, message: string) => { if (!value)
    throw new Error('City Main V4: ' + message); };
export function runCityMainV4SelfTest(source: unknown = cityMain, contacts = true) {
    const map = loadCityMap(source), baseline = loadCityMap(baselineData), network = buildCityRoadNetwork(map), before = buildCityRoadNetwork(baseline), roads = new Map(map.roads.map(r => [r.id, r]));
    assert(map.environment.metadata?.urbanSkeletonVersion === '4', 'V4 playable map');
    const validation = validateMap(map);
    assert(validation.valid && !validation.warnings.some(w => w.code !== 'port.unused'), 'valid connected map without grade warnings');
    const locked = baseline.roads.filter(cityV4LockedRoad), lockedIds = new Set(locked.map(r => r.id));
    for (const r of locked)
        assert(JSON.stringify(roads.get(r.id)) === JSON.stringify(r), 'immutable expressway/access/main-aux/underpass/roundabout ' + r.id);
    const movements = (n: typeof network) => n.laneConnections.filter(l => lockedIds.has(l.fromLaneId.split(':lane:')[0]!) && lockedIds.has(l.toLaneId.split(':lane:')[0]!)).map(l => [l.fromLaneId, l.toLaneId].join('>')).sort();
    assert(JSON.stringify(movements(network)) === JSON.stringify(movements(before)), 'all locked directed lane movements unchanged');
    assert(JSON.stringify(map.bounds) === JSON.stringify(baseline.bounds) && JSON.stringify(map.roadNames) === JSON.stringify(baseline.roadNames), 'same terrain bounds and stable name registry');
    assert(map.roads.length < baseline.roads.length && map.intersections.length < baseline.intersections.length, 'fewer road fragments and junctions');
    assert(map.objects.length <= baseline.objects.length && map.objects.every(o => baseline.objects.some(b => JSON.stringify(o) === JSON.stringify(b))), 'only local removal of existing landscape');
    assert(map.signs!.length <= baseline.signs!.length && map.signs!.every(s => baseline.signs!.some(b => b.id === s.id)), 'reuse existing navigation signs');
    for (const s of baseline.signs!.filter(s => s.type !== 'URBAN_DIRECTION' && s.type !== 'ROAD_NAME')) {
        const current = map.signs!.find(v => v.id === s.id)!;
        assert(JSON.stringify({ ...current, position: s.position, heading: s.heading, advanceMetres: s.advanceMetres }) === JSON.stringify(s), 'expressway sign identity/content preserved ' + s.id);
    }
    const backbone = runCityMainSelfTest(map, false), routesAndSigns = runCityMainV3SelfTest(map);
    const graph = new Map(map.roads.map(r => [r.id, new Set<string>()]));
    network.connectivity.forEach(n => n.incomingRoadIds.forEach(a => n.outgoingRoadIds.forEach(b => { if (a !== b)
        graph.get(a)!.add(b); })));
    const namedContinuity: Record<string, number> = {};
    for (const name of ['inner-boulevard', 'central-avenue', 'new-city-avenue', 'north-avenue', 'south-avenue', 'west-avenue', 'east-avenue', 'industrial-avenue']) {
        const parts = map.roads.filter(r => r.roadNameId === name && r.groupId !== 'east-main-aux'), seen = new Set([parts[0]!.id]), queue = [parts[0]!.id];
        for (let i = 0; i < queue.length; i++)
            for (const id of graph.get(queue[i]!)!)
                if (roads.get(id)?.roadNameId === name && !seen.has(id)) {
                    seen.add(id);
                    queue.push(id);
                }
        assert(parts.every(r => seen.has(r.id)), 'named avenue continuity ' + name + ': ' + parts.filter(r => !seen.has(r.id)).map(r => r.id));
        namedContinuity[name] = parts.length;
    }
    const materials = createSubject3Materials(), builder = new IntersectionBuilder(map, materials), roadBuilder = new RoadBuilder(materials, map);
    let junctionChecks = 0, pavementSeams = 0;
    try {
        for (const j of map.intersections.filter(j => j.pavementFootprint)) {
            const root = builder.build(j), pavements = root.children.filter(o => o.name === 'junction pavement');
            assert(pavements.length === 1 && pavements[0] instanceof Mesh, 'single authoritative pavement ' + j.id);
            const mesh = pavements[0] as Mesh, position = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index!;
            assert(position.count === j.pavementFootprint!.length + 1 && indices.count === j.pavementFootprint!.length * 3, 'no fixed rectangular filler ' + j.id);
            for (let i = 0; i < indices.count; i += 3) {
                let x = 0, y = 0, z = 0;
                for (let k = 0; k < 3; k++) {
                    const v = indices.getX(i + k);
                    x += position.getX(v) / 3;
                    y += position.getY(v) / 3;
                    z += position.getZ(v) / 3;
                }
                const q = rotatePoint({ x, z }, j.rotation), p = { x: j.position.x + q.x, z: j.position.z + q.z };
                assert(junctionSurfaceContains(j, map, p) && Math.abs(junctionSurfaceHeight(j, p) - (j.position.y ?? 0) - y) < 1e-5, 'ground contact matches physical triangle ' + j.id);
            }
            const logical = network.intersections.find(v => v.id === j.id)!;
            assert(logical.pavementFootprint?.length === j.pavementFootprint!.length, 'logical map shares single junction outline ' + j.id);
            for (const c of j.connections) {
                const p = connectionPoint(j, c.port, map), r = roads.get(c.roadId)!, mouth = roadPoints(r)[c.end === 'start' ? 0 : roadPoints(r).length - 1]!;
                assert(Math.hypot(p.x - mouth.x, p.z - mouth.z) < .001 && Math.abs((mouth.y ?? 0) - junctionSurfaceHeight(j, mouth)) < .001, 'approach meets pavement boundary ' + j.id + ':' + c.port);
                const approach = roadBuilder.build(r), pavement = approach.children.find(o => o.name === 'road pavement') as Mesh, positions = pavement.geometry.getAttribute('position'), indices = pavement.geometry.index;
                for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
                    let x = 0, z = 0;
                    for (let k = 0; k < 3; k++) {
                        const n = indices ? indices.getX(i + k) : i + k;
                        x += positions.getX(n) / 3;
                        z += positions.getZ(n) / 3;
                    }
                    const q = rotatePoint({ x: x - j.position.x, z: z - j.position.z }, -j.rotation), outline = j.pavementFootprint!;
                    const interior = outline.every((a, k) => { const b = outline[(k + 1) % outline.length]!; return ((b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x)) / Math.hypot(b.x - a.x, b.z - a.z) > .001; });
                    assert(!interior, 'approach pavement does not overlap authoritative interior ' + j.id + ':' + r.id);
                }
                approach.traverse(o => { if (o instanceof Mesh)
                    o.geometry.dispose(); });
                pavementSeams++;
            }
            root.traverse(o => { if (o instanceof Mesh)
                o.geometry.dispose(); });
            junctionChecks++;
        }
    }
    finally {
        Object.values(materials).forEach(m => m.dispose());
    }
    const localMap = new LocalRoadMap();
    localMap.setNetwork(network);
    for (const j of map.intersections.filter(j => j.pavementFootprint)) {
        const view = localMap.nearby(j.position.x, j.position.z, 60).network!;
        assert(view.intersections.some(v => v.id === j.id && v.pavementFootprint), 'Tesla local map contains logical junction ' + j.id);
        assert(view.segments.every(r => roads.has(r.id)), 'local map contains no physical fillers');
    }
    let contactSamples = 0;
    if (contacts) {
        const ground = new CityGround(map, { loadRadius: 0 }), collision = new VehicleCollisionSystem(ground.colliders);
        try {
            assert(ground.sectors.active.size > 0, 'City sector loading');
            for (const j of map.intersections.filter(j => j.pavementFootprint)) {
                const surface = ground.sampleRoadSurface(j.position.x, j.position.z, undefined, j.position.y);
                assert(surface.surfaceType === 'asphalt' && Math.abs(surface.height - (j.position.y ?? 0)) < .001, 'junction wheel support ' + j.id);
                const p = { x: j.position.x, y: j.position.y ?? 0, z: j.position.z, yaw: 0 }, result = collision.resolve({ previousPose: p, pose: p, velocity: { x: 0, z: 0 }, dimensions: { width: 2.02, length: 5.05, height: 1.95 }, dt: 1 / 120 });
                assert(!result.collided, 'junction interior clearance ' + j.id + ': ' + result.contacts.map(c => c.colliderId).join(', '));
            }
            for (const r of map.roads.filter(r => !cityV4LockedRoad(r))) {
                const pts = roadPoints(r), len = polylineLength(pts);
                for (let lane = 0; lane < r.laneCount; lane++)
                    for (let d = 8; d < len - 8; d += 20) {
                        const s = sampleAt(pts, d), offset = -r.laneCount * r.laneWidth / 2 + (lane + .5) * r.laneWidth, p = { x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset, yaw: Math.atan2(-s.tangent.x, -s.tangent.z) };
                        for (const across of [-.85, .85])
                            for (const along of [-1.45, 1.45]) {
                                const sample = ground.sampleRoadSurface(p.x - s.tangent.z * across + s.tangent.x * along, p.z + s.tangent.x * across + s.tangent.z * along, undefined, p.y);
                                assert(sample.surfaceType === 'asphalt' && Math.abs(sample.height - p.y) < .25, 'four-wheel urban support ' + r.id + ' ' + d);
                            }
                        const result = collision.resolve({ previousPose: p, pose: p, velocity: { x: 0, z: 0 }, dimensions: { width: 2.02, length: 5.05, height: 1.95 }, dt: 1 / 120 });
                        assert(!result.collided, 'ordinary road clearance ' + r.id + ' ' + d + ': ' + result.contacts.map(c => c.colliderId).join(', '));
                        contactSamples++;
                    }
            }
            const spawn = ground.spawnPose.position;
            ground.updatePlayerPosition(8000, 8000);
            assert(ground.sectors.active.size === 0, 'distant sectors unload');
            ground.updatePlayerPosition(spawn.x, spawn.z);
            assert(ground.sectors.active.size > 0, 'City sectors reload');
        }
        finally {
            ground.dispose();
        }
    }
    return { lockedRoads: locked.length, lockedLaneMovements: movements(network).length, roads: [baseline.roads.length, map.roads.length], junctions: [baseline.intersections.length, map.intersections.length], objects: [baseline.objects.length, map.objects.length], signs: map.signs!.length, namedContinuity, junctionChecks, pavementSeams, contactSamples, backbone, routesAndSigns };
}
