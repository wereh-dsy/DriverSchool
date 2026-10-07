import * as THREE from 'three';
import { distanceToPolyline, polylineLength } from './math';
import { SUBJECT3_PLACES } from './Subject3GroundConfig';
import { Subject3Ground } from './Subject3Ground';

export interface Subject3GroundSelfTestResult {
  readonly assertions: number;
  readonly roadLength: number;
  readonly roadSegmentCount: number;
  readonly junctionCount: number;
  readonly signalisedJunctionCount: number;
  readonly teeJunctionCount: number;
  readonly signalHeadCount: number;
  readonly signalCycleSeconds: number;
  readonly nextSignalColour: string;
  readonly asphaltGrip: number;
  readonly sidewalkGrip: number;
  readonly grassGrip: number;
  readonly markingVertices: number;
  readonly markingClearanceError: number;
  readonly spawnOnAsphalt: boolean;
}

/** Short map-only regressions: topology, geometry, clear roads and signal timing. */
export function runSubject3GroundSelfTest(): Subject3GroundSelfTestResult {
  const ground = new Subject3Ground({ shadows: false });
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Subject-3-ground self-test failed: ${message}`);
  };
  try {
    const { metadata, topology } = ground;
    assert(metadata.id === 'subject-3-shared-city-map', 'stable shared map id');
    assert(metadata.bounds.maximumX - metadata.bounds.minimumX >= 700
      && metadata.bounds.maximumX - metadata.bounds.minimumX <= 900, 'site width');
    assert(metadata.bounds.maximumZ - metadata.bounds.minimumZ >= 700
      && metadata.bounds.maximumZ - metadata.bounds.minimumZ <= 900, 'site depth');
    const roadLength = metadata.totalRoadLength;
    assert(roadLength >= 3_000 && roadLength <= 4_100, `street length: ${roadLength}`);
    assert(topology.segments.filter((s) => s.width >= 14 && s.width <= 16).length === 2, 'two wide streets');
    assert(topology.segments.some((s) => s.width >= 7 && s.width <= 8), 'ordinary two-way roads');
    assert(topology.segments.some((s) => s.width < 7), 'narrow meeting street');

    const signalised = topology.junctions.filter((j) => j.hasTrafficSignals);
    const crossings = topology.junctions.filter((j) => j.arms.length === 4);
    const tees = topology.junctions.filter((j) => j.arms.length === 3);
    assert(signalised.length >= 2 && signalised.every((j) => j.arms.length === 4), 'two full signalised crosses');
    assert(crossings.length >= 4, 'at least four genuine four-way crossings');
    assert(tees.length >= 1, 'real three-way junctions');
    assert(ground.getTrafficSignalHeadCount() === signalised.reduce((n, j) => n + j.arms.length, 0),
      'one head per incoming approach, including BOTH directions of through roads');

    const reached = new Set([topology.segments[0]!.id]);
    for (let pass = 0; pass < topology.segments.length; pass += 1) {
      for (const j of topology.junctions) {
        if (j.arms.some((arm) => reached.has(arm.segmentId))) j.arms.forEach((arm) => reached.add(arm.segmentId));
      }
    }
    assert(reached.size === topology.segments.length, 'one connected shared street network');
    for (const j of topology.junctions) {
      assert(j.arms.length >= 3, `${j.id}: connected junction`);
      for (const arm of j.arms) {
        assert(Math.abs(Math.hypot(arm.outward.x, arm.outward.z) - 1) < 1e-6, 'unit approach direction');
        assert(Math.abs(Math.sin(arm.approachYawRadians - Math.atan2(arm.outward.x, arm.outward.z))) < 1e-6,
          'arrow points IN, not out');
        const road = topology.segments.find((s) => s.id === arm.segmentId)!;
        assert(distanceToPolyline(j.center.x, j.center.z, road.centerline) < 0.03, 'arm touches its road');
        let distance = 0, contactDistance = -1;
        for (let i = 1; i < road.centerline.length; i += 1) {
          const a = road.centerline[i - 1]!, b = road.centerline[i]!;
          const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
          const t = Math.max(0, Math.min(1, ((j.center.x - a.x) * dx + (j.center.z - a.z) * dz) / (length * length)));
          if (Math.hypot(a.x + t * dx - j.center.x, a.z + t * dz - j.center.z) < 0.03) contactDistance = distance + t * length;
          distance += length;
        }
        assert((topology.gapRangesBySegment.get(road.id) ?? []).some((gap) =>
          gap.startDistance <= contactDistance + 1e-6 && gap.endDistance >= contactDistance - 1e-6),
          `${j.id}:${road.id}: kerb/paint gap at an interior contact`);
      }
    }
    // Read the truly uninterrupted intervals, not the total length of a trunk.
    const freeRun = (id: string): number => {
      const road = topology.segments.find((s) => s.id === id)!;
      const gaps = [...(topology.gapRangesBySegment.get(id) ?? [])].sort((a, b) => a.startDistance - b.startDistance);
      let cursor = 0, longest = 0;
      for (const gap of gaps) { longest = Math.max(longest, gap.startDistance - cursor); cursor = Math.max(cursor, gap.endDistance); }
      return Math.max(longest, polylineLength(road.centerline) - cursor);
    };
    assert(freeRun('main-west') >= 300 && freeRun('main-west') <= 450, 'west long straight');
    assert(freeRun('main-east') >= 250 && freeRun('main-east') <= 400, 'east long straight');

    const first = ground.getTrafficSignalSnapshot();
    assert(first.northSouth === 'green' && first.eastWest === 'red', 'initial NS green / EW red');
    ground.update(20.1);
    assert(ground.getTrafficSignalSnapshot().northSouth === 'amber', 'amber phase');
    ground.update(3);
    const allRed = ground.getTrafficSignalSnapshot();
    assert(allRed.northSouth === 'red' && allRed.eastWest === 'red', 'all-red clearance');
    ground.update(1.5);
    const later = ground.getTrafficSignalSnapshot();
    assert(later.northSouth === 'red' && later.eastWest === 'green', 'EW green / NS red');
    for (const j of signalised) {
      const snapshot = ground.getTrafficSignalSnapshot(j.id);
      assert(!(snapshot.northSouth === 'green' && snapshot.eastWest === 'green'), 'conflicting directions never green together');
    }

    const spawn = ground.spawnPose.position;
    const spawnSample = ground.sampleRoadSurface(spawn.x, spawn.z);
    assert(spawnSample.surfaceType === 'asphalt' && Math.abs(spawn.x + 274.6) < 1e-6, 'spawn centred in right-hand lane');
    for (const dx of [-1.1, 1.1]) for (const dz of [-2.5, 2.5, -25]) {
      assert(ground.sampleRoadSurface(spawn.x + dx, spawn.z + dz).surfaceType === 'asphalt', 'spawn footprint and launch space clear');
    }
    const pavement = ground.sampleRoadSurface(-270, 170);
    assert(pavement.surfaceType === 'concrete', 'kerbside pavement surface');
    assert(ground.sampleRoadSurface(210, 100).surfaceType === 'grass', 'unbuilt blocks remain grass');

    ground.root.updateMatrixWorld(true);
    let markings = 0, sidewalks = 0, lampCount = 0, schoolCrossing = false;
    const point = new THREE.Vector3();
    ground.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.name === '路灯灯杆' && object instanceof THREE.InstancedMesh) lampCount = object.count;
      if (object.userData.subject3RoadMarking || object.name.endsWith(' 人行道')) {
        const normals = object.geometry.getAttribute('normal');
        assert(normals !== undefined && normals.getY(0) > 0.98, `${object.name}: visible upward face`);
        if (object.userData.subject3RoadMarking) markings += 1; else sidewalks += 1;
      }
      if (object.name === '校门前人行横道') schoolCrossing = true;
      if (object.name.startsWith('停止线')) {
        object.geometry.computeBoundingBox();
        object.geometry.boundingBox!.getCenter(point);
        object.localToWorld(point);
        const parts = object.name.split(' ');
        const junction = topology.junctions.find((j) => j.id === parts[1])!;
        const arm = junction.arms.find((a) => a.segmentId === parts[2] &&
          (point.x - junction.center.x) * a.outward.x + (point.z - junction.center.z) * a.outward.z > 0)!;
        assert(arm !== undefined, 'stop line is on its approach, not the opposite arm');
        const distance = (point.x - junction.center.x) * arm.outward.x + (point.z - junction.center.z) * arm.outward.z;
        assert(distance > arm.axialDistance + ground.config.junction.crosswalkWidth + 1,
          'stop line sits upstream of zebra crossing');
      }
    });
    assert(markings > 100 && sidewalks > 8 && lampCount > 30, 'visible paint, both sidewalks, working lamp generation');
    assert(schoolCrossing, 'school gate crossing exists');
    const signs: string[] = [];
    ground.root.traverse((o) => { if (typeof o.userData.subject3SignText === 'string') signs.push(o.userData.subject3SignText); });
    assert(signs.some((s) => s.includes('STOP')) && signs.includes('30') && signs.includes('50'), 'readable stop and speed signs');

    for (const solid of ground.colliders) {
      let area = 0;
      for (let i = 0; i < solid.corners.length; i += 1) {
        const a = solid.corners[i]!, b = solid.corners[(i + 1) % solid.corners.length]!;
        area += a.x * b.z - a.z * b.x;
      }
      assert(Math.abs(area) > 0.001, `${solid.id}: non-degenerate collision footprint`);
      // Sample edges and interior: no building/wall should obstruct a shared road.
      for (const c of [...solid.corners, solid.center]) {
        assert(ground.sampleRoadSurface(c.x, c.z).surfaceType !== 'asphalt', `${solid.id}: clear of roads`);
        assert(c.x >= metadata.bounds.minimumX && c.x <= metadata.bounds.maximumX
          && c.z >= metadata.bounds.minimumZ && c.z <= metadata.bounds.maximumZ, 'solid inside map bounds');
      }
    }
    assert(ground.sampleRoadSurface(SUBJECT3_PLACES.supermarket.drivewayX, 285).surfaceType === 'concrete',
      'supermarket driveway has a paved connection');
    const diagnostics = ground.getRoadMarkingDiagnostics();
    assert(diagnostics.vertexCount > 2_000 && diagnostics.maximumClearanceError < 0.001, 'paint conforms to flat road height');
    return {
      assertions, roadLength, roadSegmentCount: topology.segments.length, junctionCount: topology.junctions.length,
      signalisedJunctionCount: signalised.length, teeJunctionCount: tees.length,
      signalHeadCount: ground.getTrafficSignalHeadCount(), signalCycleSeconds: first.cycleSeconds,
      nextSignalColour: later.northSouth, asphaltGrip: spawnSample.longitudinalGrip,
      sidewalkGrip: pavement.longitudinalGrip, grassGrip: ground.sampleRoadSurface(210, 100).longitudinalGrip,
      markingVertices: diagnostics.vertexCount, markingClearanceError: diagnostics.maximumClearanceError,
      spawnOnAsphalt: true,
    };
  } finally { ground.dispose(); }
}
