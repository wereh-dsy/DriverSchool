import * as THREE from 'three';
import { createDrivingGround, DRIVING_GROUND_CATALOG, isDrivingGroundId } from '../DrivingGroundCatalog';
import { MountainProvingGround } from './MountainProvingGround';
import { SERVICE } from './MountainSurface';
import { SURFACE_MATERIALS } from '../SurfaceMaterial';
import { sampleWheelContacts, wheelContactsAsArray } from '../../vehicle/physics/WheelContact';
import { ICE_VEHICLE_CATALOG } from '../../vehicle/VehicleCatalog';
import { VehicleDynamics } from '../../vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../../vehicle/physics/VehicleContactSystem';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';

/** Geometry/contact acceptance only. Subjective driving and vehicle calibration remain manual. */
export function runMountainProvingGroundSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++;
    if (!ok) throw new Error(`Mountain ground self-test: ${message}`);
  };
  assert(isDrivingGroundId('mountain-proving-ground'), 'stable catalog identifier');
  assert(DRIVING_GROUND_CATALOG.some(d => d.id === 'mountain-proving-ground'), 'normal game map selector entry');
  const ground = createDrivingGround('mountain-proving-ground');
  assert(ground instanceof MountainProvingGround, 'catalog constructs handcrafted ground');
  const g = ground as MountainProvingGround, main = g.route.main;
  try {
    assert(main.length >= 6500 && main.length <= 7500, 'main loop length target');
    assert(g.metadata.maximumHeight - g.metadata.minimumHeight >= 80 && g.metadata.maximumHeight <= 100, '80–100 m relief');
    const spawn = g.spawnPose.position, sample = g.sampleRoadSurface(spawn.x, spawn.z);
    assert(sample.surfaceType === 'asphalt' && Math.abs(sample.height - SERVICE.height) < 1e-6, 'level paved spawn');
    assert(Math.abs(spawn.y - sample.height - 0.04) < 1e-8, 'spawn/reset support clearance');
    assert(Math.abs(g.spawnPose.yawRadians - Math.PI / 2) < 1e-6, 'spawn faces route');
    for (let x = -35; x <= 35; x += 7) for (let z = 679; z <= 729; z += 5) {
      assert(Math.abs(g.getRoadHeightAt(x, z) - SERVICE.height) < 1e-6, '80 × 60 m level service apron');
      assert(g.sampleRoadSurface(x, z).surfaceType === 'asphalt', 'service apron paved');
    }
    const first = main.point(0), last = main.point(main.length);
    assert(Math.hypot(first.x - last.x, first.z - last.z) < 1e-8, 'closed loop seam');
    assert(Math.abs(g.getRoadHeightAt(first.x, first.z) - g.getRoadHeightAt(last.x, last.z)) < 1e-8, 'closed height seam');
    const bounds = g.worldBounds;
    const metrics: Array<{ id: string; length: number; maxGrade: number; maxCrossfallDegrees: number }> = [];
    for (const route of g.route.paths) {
      let maxGrade = 0, maxCrossfall = 0;
      let previous = route.point(0);
      for (let s = 0; s < route.length; s += 0.5) {
        const p = route.point(s);
        assert(Math.hypot(p.x - previous.x, p.z - previous.z) < 0.55, `${route.id}: connected horizontal route`);
        assert(p.x > bounds.minX + 250 && p.x < bounds.maxX - 250 && p.z > bounds.minZ + 250 && p.z < bounds.maxZ - 250, 'remote safety bounds');
        for (const lateral of [-route.width(s) / 2, -1, 0, 1, route.width(s) / 2]) {
          const x = p.x - p.tz * lateral, z = p.z + p.tx * lateral;
          const road = g.sampleRoadSurface(x, z, { x: p.tx, y: p.tz });
          assert([road.height, road.grade, road.gradient.x, road.gradient.y, road.normal.length(), road.longitudinalGrip,
            road.lateralGrip, road.rollingResistance].every(Number.isFinite), `${route.id}: finite complete road contact`);
          assert(Math.abs(road.height - g.getRoadHeightAt(x, z)) < 1e-8 && Math.abs(road.normal.length() - 1) < 1e-8, 'shared support and unit normal');
          maxGrade = Math.max(maxGrade, Math.abs(road.grade));
          maxCrossfall = Math.max(maxCrossfall, Math.abs(-road.gradient.x * p.tz + road.gradient.y * p.tx));
        }
        previous = p;
      }
      const degrees = Math.atan(maxCrossfall) * 180 / Math.PI;
      assert(maxGrade <= (route.id === 'main' ? 0.12 : 0.18), `${route.id}: maximum grade ${maxGrade}`);
      assert(degrees <= (route.id === 'main' ? 8 : 12), `${route.id}: maximum crossfall ${degrees}`);
      if (route.connection) {
        for (const [branchS, mainS] of [[0, route.connection[0]], [route.length, route.connection[1]]]) {
          const a = route.point(branchS!), b = main.point(mainS!);
          assert(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6, `${route.id}: exact reconnection`);
          assert(Math.abs(g.getRoadHeightAt(a.x, a.z) - g.getRoadHeightAt(b.x, b.z)) < 1e-6, `${route.id}: shared junction height`);
        }
      }
      metrics.push({ id: route.id, length: route.length, maxGrade, maxCrossfallDegrees: degrees });
    }
    assert(g.route.branches.length === 3, 'three short technical branches');
    assert(g.route.branches[0]!.length >= 100 && g.route.branches[0]!.length <= 180, 'short steep maintenance road');
    const climb = main.section('climb'), ridge = main.section('ridge'), broken = main.section('broken-dirt');
    const erosion = main.section('articulation'), descent = main.section('descent'), valley = main.section('valley');
    assert(main.height(climb.end) - main.height(climb.start) >= 50 && main.height(climb.end) - main.height(climb.start) <= 70, 'climb rise');
    assert(ridge.end - ridge.start > 900 && descent.end - descent.start > 1000, 'ridge and sustained descent');
    assert(broken.end - broken.start >= 500 && broken.end - broken.start <= 700, 'broken dirt length');
    const surfaceCases = [
      { p: main.point(100), type: 'asphalt' }, { p: main.point(800), type: 'compact-gravel' },
      { p: main.point(broken.start + 120), type: 'dirt' }, { p: main.point(valley.start + 90), type: 'damp-dirt' },
      { p: g.route.branches[0]!.point(g.route.branches[0]!.length / 2), type: 'loose-gravel' },
      { p: { x: 0, z: 0 }, type: 'grass' },
    ];
    for (const { p, type } of surfaceCases) {
      const surface = g.sampleRoadSurface(p.x, p.z);
      assert(surface.surfaceType === type, `actual contact surface: ${type}, got ${surface.surfaceType}`);
      assert(surface.gripMultiplier === surface.lateralGrip && surface.rollingResistanceMultiplier === surface.rollingResistance, 'one calibration, shared aliases');
    }
    const ordered = ['asphalt', 'compact-gravel', 'dirt', 'loose-gravel', 'damp-dirt', 'grass'] as const;
    for (let i = 1; i < ordered.length; i++) {
      const a = SURFACE_MATERIALS[ordered[i - 1]!], b = SURFACE_MATERIALS[ordered[i]!];
      assert(a.longitudinalGrip > b.longitudinalGrip && a.lateralGrip > b.lateralGrip, 'ordered drivable surface grip');
    }
    // Erosion is actual road relief, with a conservative depth budget including crown.
    let mainRutDepth = 0, technicalRutDepth = 0;
    for (let s = erosion.start; s <= erosion.end; s += 0.5) for (const lateral of [-0.85, 0, 0.85]) {
      mainRutDepth = Math.max(mainRutDepth, -main.disturbance(s, lateral));
    }
    const deep = g.route.branches[2]!;
    for (let s = 0; s <= deep.length; s += 0.5) for (const lateral of [-0.85, 0, 0.85]) {
      technicalRutDepth = Math.max(technicalRutDepth, -deep.disturbance(s, lateral));
    }
    assert(mainRutDepth > 0.1 && mainRutDepth <= 0.18, 'main shallow erosion depth');
    assert(technicalRutDepth > 0.2 && technicalRutDepth <= 0.25, 'optional deeper erosion depth');
    // Independently check mesh triangle interiors rather than the authored height function.
    const positions = g.terrain.mesh.geometry.getAttribute('position');
    assert(g.terrain.paving.geometry.getAttribute('position') === positions, 'paving and terrain share seam vertices');
    for (const geometry of [g.terrain.mesh.geometry, g.terrain.paving.geometry]) {
      const indices = geometry.index!;
      for (let i = 0; i < indices.count; i += 3003) {
        const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
        const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
        const z = (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3;
        const y = (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
        assert(Math.abs(g.getRoadHeightAt(x, z) - y) < 1e-5, 'rendered triangle equals physical contact');
      }
    }
    for (let x = bounds.minX + 1; x < bounds.maxX; x += 43) for (let z = bounds.minZ + 1; z < bounds.maxZ; z += 41) {
      assert(Number.isFinite(g.getRoadHeightAt(x, z)), 'terrain coverage without holes');
    }
    for (let i = 0; i < g.terrain.leaves.length; i += 311) {
      const cell = g.terrain.leaves[i]!, x = cell.x + cell.size, z = cell.z + cell.size * 0.37;
      if (x < bounds.maxX) assert(Math.abs(g.getRoadHeightAt(x - 1e-5, z) - g.getRoadHeightAt(x + 1e-5, z)) < 0.002, 'stitched adaptive edge contact');
    }
    assert(positions.count < 400000, 'local refinement without million-vertex terrain');
    let instanceBatches = 0;
    g.root.traverse(object => { if (object instanceof THREE.InstancedMesh) instanceBatches++; });
    assert(instanceBatches === 6, 'trees/shrubs/rocks/posts/rails batched');
    // All shipping vehicles use four separate support samples through the normal adapter.
    const controls = { ...createNeutralVehicleInputState(), brake: 1 };
    for (const vehicle of ICE_VEHICLE_CATALOG) {
      for (const s of [800, main.section('mountain-side').start + 150, erosion.start + 22, valley.start + 80]) {
        const p = main.point(s), yaw = Math.atan2(-p.tx, -p.tz);
        const contacts = wheelContactsAsArray(sampleWheelContacts(g, { x: p.x, z: p.z, yaw }, vehicle.physicsConfig));
        for (const wheel of contacts) {
          const support = g.sampleRoadSurface(wheel.x, wheel.z);
          assert(wheel.height === support.height && wheel.longitudinalGrip === support.longitudinalGrip && wheel.lateralGrip === support.lateralGrip, 'vehicle reads terrain and single surface scaling');
        }
        const dynamics = new VehicleDynamics(vehicle.physicsConfig, { x: p.x, z: p.z, yaw, speed: 0, gear: 'N' });
        const adapter = new VehicleContactSystem(g, vehicle.visualConfig.collisionDimensions);
        for (let tick = 0; tick < 24; tick++) {
          const snapshot = adapter.step(1 / 120, controls, dynamics);
          assert([snapshot.x, snapshot.z, snapshot.speed, snapshot.chassis.groundHeight, snapshot.chassis.pitch,
            snapshot.chassis.roll].every(Number.isFinite), `${vehicle.id}: 120 Hz map contact remains finite`);
        }
      }
    }
    return { assertions, routeLength: main.length, minimumHeight: g.metadata.minimumHeight,
      maximumHeight: g.metadata.maximumHeight, routes: metrics, mainRutDepth, technicalRutDepth,
      terrainVertices: positions.count, instanceBatches, vehicles: ICE_VEHICLE_CATALOG.length };
  } finally { g.dispose(); }
}
