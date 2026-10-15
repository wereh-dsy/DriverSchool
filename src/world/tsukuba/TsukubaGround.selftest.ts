import * as THREE from 'three';
import { VehicleCollisionSystem } from '../../vehicle/physics/CollisionSystem';
import { VEHICLE_CATALOG, createVehiclePhysicsConfig } from '../../vehicle/VehicleCatalog';
import { VehicleDynamics } from '../../vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../../vehicle/physics/VehicleContactSystem';
import type { Powertrain } from '../../vehicle/powertrain/Powertrain';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { TsukubaGround } from './TsukubaGround';
import { TSUKUBA_LENGTH } from './TsukubaLayout';
import { TsukubaSurface } from './TsukubaSurface';

/** Real layout constraints and physical/visual integration; no driving AI or tuning. */
export function runTsukubaGroundSelfTest() {
  const ground = new TsukubaGround(), layout = ground.layout;
  const referenceSurface = new TsukubaSurface(layout);
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++; if (!ok) throw new Error(`TC2000: ${message}`);
  };
  let minJoinDot = 1, meshes = 0, instances = 0, kerbVertices = 0;
  let minimumHeight = Infinity, maximumHeight = -Infinity, maximumGrade = 0, maximumPitGrade = 0;
  try {
    assert(Math.abs(layout.length - TSUKUBA_LENGTH) < 0.01, '2,045 m scale');
    assert(layout.curve.getPointAt(0).distanceTo(layout.curve.getPointAt(1)) < 1e-7, 'closed loop');
    const home = layout.section('home').end + layout.length - layout.section('home-return').start;
    const back = layout.section('back').end - layout.section('back').start;
    assert(Math.abs(home - 282) < 12 && Math.abs(back - 437) < 22, 'short official straight proportions');
    for (let i = 0; i < layout.curve.curves.length; i++) {
      const a = layout.curve.curves[i]!, b = layout.curve.curves[(i + 1) % layout.curve.curves.length]!;
      assert(a.getPoint(1).distanceTo(b.getPoint(0)) < 1e-7, `section ${i} joins without gap`);
      const dot = a.getTangent(1).dot(b.getTangent(0)); minJoinDot = Math.min(minJoinDot, dot);
      assert(dot > 0.998, `section ${i} has smooth tangent (${dot})`);
    }
    let signedArea = 0;
    for (let i = 1; i < layout.samples.length; i++) {
      const a = layout.samples[i - 1]!, b = layout.samples[i]!;
      signedArea += a.x * b.z - a.z * b.x;
      assert(b.width >= 10 && b.width <= 15, '10–15 m width');
      assert(ground.sampleRoadSurface(b.x, b.z).surfaceType === 'asphalt', `continuous asphalt at ${b.distance}`);
    }
    assert(signedArea > 0, 'clockwise driving direction in +X/+Z plan');
    const collision = new VehicleCollisionSystem(ground.colliders);
    // Sweep a large road vehicle envelope down the centre and near both edges.
    const dimensions = { width: 2.1, length: 5.4, height: 2 };
    for (let d = 0; d < layout.length; d += 4) {
      for (const offset of [0, -layout.widthAt(d) / 2 + 1.6, layout.widthAt(d) / 2 - 1.6]) {
        const p = layout.poseAt(d, offset), pose = { x: p.position.x, z: p.position.z,
          y: ground.getRoadHeightAt(p.position.x, p.position.z), yaw: p.yawRadians };
        const result = collision.resolve({ previousPose: pose, pose, dimensions, dt: 1 / 120, velocity: { x: 0, z: 0 } });
        assert(!result.collided, `track clearance d=${d} offset=${offset}: ${result.contacts.map(c => c.colliderId)}`);
      }
    }
    const pitLength = layout.pitCurve.getLength();
    for (let d = 0; d <= pitLength; d += 2) {
      const p = layout.pitCurve.getPointAt(d / pitLength), t = layout.pitCurve.getTangentAt(d / pitLength);
      assert(ground.sampleRoadSurface(p.x, p.z).surfaceType === 'asphalt', `paved pit lane d=${d}`);
      const sample = ground.sampleRoadSurface(p.x, p.z, { x: t.x, y: t.z });
      maximumPitGrade = Math.max(maximumPitGrade, Math.abs(sample.grade));
      assert(Math.abs(sample.grade) < 0.12, `pit gradient remains driveable d=${d}: ${sample.grade}`);
      const pose = { x: p.x, z: p.z, y: sample.height, yaw: Math.atan2(-t.x, -t.z) };
      const result = collision.resolve({ previousPose: pose, pose, dimensions, dt: 1 / 120, velocity: { x: 0, z: 0 } });
      assert(!result.collided, `pit clearance d=${d}: ${result.contacts.map(c => c.colliderId)}`);
    }
    for (const t of [0, 1]) {
      const p = layout.pitCurve.getPointAt(t);
      let distance = Infinity;
      for (const sample of layout.samples) distance = Math.min(distance, Math.hypot(sample.x - p.x, sample.z - p.z));
      assert(distance < 4, 'pit branch overlaps the track');
    }
    for (const k of layout.kerbs) {
      const d = (k.start + k.end) / 2, offset = k.side * (layout.widthAt(d) / 2 + k.width / 2);
      const p = layout.poseAt(d, offset).position, sample = ground.sampleRoadSurface(p.x, p.z);
      const raised = sample.height - referenceSurface.baseHeightAt(p.x, p.z);
      assert(sample.surfaceType === 'curb' && raised > 0.025 && raised < 0.08, 'physical raised kerb above the banked road bed');
      assert(sample.roughness > 0.1 && sample.lateralGrip < 1 && sample.normal.y < 1, 'kerb contact feedback');
    }
    const grass = ground.sampleRoadSurface(ground.worldBounds.minX + 5, ground.worldBounds.minZ + 5);
    assert(grass.surfaceType === 'grass' && grass.lateralGrip < 0.7 && grass.rollingResistance > 2, 'shared grass response');
    for (const band of layout.runoffs) {
      const d = (band.start + band.end) / 2, p = layout.poseAt(d, band.side * (layout.widthAt(d) / 2 + 3)).position;
      assert(ground.sampleRoadSurface(p.x, p.z).surfaceType === 'loose-gravel', 'physical gravel bed');
    }
    for (let d = 0; d < layout.length; d += 2) {
      const pose = layout.poseAt(d), forward = { x: -Math.sin(pose.yawRadians), y: -Math.cos(pose.yawRadians) };
      const sample = ground.sampleRoadSurface(pose.position.x, pose.position.z, forward);
      minimumHeight = Math.min(minimumHeight, sample.height); maximumHeight = Math.max(maximumHeight, sample.height);
      maximumGrade = Math.max(maximumGrade, Math.abs(sample.grade));
      assert(Math.abs(sample.height - layout.elevation.heightAt(d)) < 0.015, 'contact follows authored longitudinal profile');
      assert(Math.abs(sample.grade) < 0.09 && Math.abs(sample.normal.length() - 1) < 1e-9, 'bounded grade and normalized ground normal');
      assert(Math.abs(ground.getRoadPitchAt(pose.position.x, pose.position.z, pose.yawRadians) - Math.atan(sample.grade)) < 1e-9,
        'camera/physics pitch comes from the same support surface');
    }
    assert(Math.abs(maximumHeight - minimumHeight - 5.3) < 0.02, 'approximately 5.3 m centreline elevation range');
    const crest = layout.section('t1-entry'), descent = layout.section('s-entry');
    assert(layout.elevation.heightAt(crest.end - 20) > 5 && layout.elevation.heightAt(descent.end) < 1.4,
      'T1 crest and descending exit follow the official profile order');
    for (const [id, sign, minimumBank] of [['hairpin-1', -1, 0.07], ['hairpin-2', 1, 0.05]] as const) {
      const s = layout.section(id), d = THREE.MathUtils.lerp(s.start, s.end, 0.45);
      const a = layout.poseAt(d, -3).position, b = layout.poseAt(d, 3).position;
      const slope = (ground.getRoadHeightAt(a.x, a.z) - ground.getRoadHeightAt(b.x, b.z)) / 6;
      assert(slope * sign > minimumBank, `${id}: actual tyre support banks toward the inside`);
    }
    for (const d of [0, layout.length]) {
      const a = layout.poseAt(d - 0.02).position, b = layout.poseAt(d + 0.02).position;
      assert(Math.abs(ground.getRoadHeightAt(a.x, a.z) - ground.getRoadHeightAt(b.x, b.z)) < 0.002, 'continuous start/finish height seam');
      assert(Math.abs(ground.getRoadPitchAt(a.x, a.z, layout.poseAt(d - 0.02).yawRadians)
        - ground.getRoadPitchAt(b.x, b.z, layout.poseAt(d + 0.02).yawRadians)) < 0.001,
      'continuous start/finish grade seam');
    }
    for (const sample of layout.samples.filter((_, i) => i % 40 === 0)) {
      for (const side of [-1, 1]) {
        let previous = layout.poseAt(sample.distance, side * sample.width / 2).position;
        let y = ground.getRoadHeightAt(previous.x, previous.z);
        for (let offset = 0.5; offset < 22; offset += 0.5) {
          const p = layout.poseAt(sample.distance, side * (sample.width / 2 + offset)).position;
          const nextY = ground.getRoadHeightAt(p.x, p.z);
          assert(Math.abs(nextY - y) < 0.3,
            `road/grass/pit terrain has no vertical off-track step: d=${sample.distance}, side=${side}, offset=${offset}, ${y}->${nextY}`);
          previous = p; y = nextY;
        }
      }
    }
    ground.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++; if (object instanceof THREE.InstancedMesh) instances++;
      const position = object.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        assert(Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i)), 'finite mesh vertices');
        if (object.name === 'Grass infield and surroundings') {
          assert(Math.abs(position.getY(i) - referenceSurface.baseHeightAt(position.getX(i), position.getZ(i)) + 0.045) < 2e-5,
            'visible terrain follows the same continuous base height');
        }
        if (object.name !== 'Red and white physical kerb') continue;
        kerbVertices++;
        assert(Math.abs(position.getY(i) - ground.getRoadHeightAt(position.getX(i), position.getZ(i)) - 0.025) < 1e-5,
          'kerb mesh agrees with contact height');
      }
    });
    assert(meshes < 110 && instances >= 10 && kerbVertices > 100, 'bounded scene and repeated object instancing');
    assert(ground.roadNetwork.segments.length === layout.sections.length + 1, 'shared minimap main route and pit');
    assert(ground.roadNetwork.segments.every(s => !s.lanes), 'no invented logical lane assistance on a racing circuit');
    assert(ground.roadNetwork.segments.every(s => s.roadType === 'circuit'), 'shared cockpit map circuit contrast classification');
    const annotations = ground.roadNetwork.mapAnnotations!;
    assert(annotations.filter(a => a.kind === 'corner').length === 6
      && annotations.filter(a => a.kind === 'pit').length === 2
      && annotations.some(a => a.kind === 'start-finish')
      && annotations.filter(a => a.kind === 'direction').length === 4, 'shared map corner, pit, start and direction annotations');
    for (const a of annotations) {
      assert(a.position.x > ground.worldBounds.minX && a.position.x < ground.worldBounds.maxX
        && a.position.z > ground.worldBounds.minZ && a.position.z < ground.worldBounds.maxZ,
      'landmarks use world coordinates in shared map bounds');
    }
    assert(ground.lapCourse.checkpoints.length === 4 && ground.lapCourse.startFinish.center.x === 0, 'existing lap timer metadata');
    for (const gate of [ground.lapCourse.startFinish, ...ground.lapCourse.checkpoints]) {
      assert(Math.abs(gate.center.y! - ground.getRoadHeightAt(gate.center.x, gate.center.z)) < 1e-9, 'timing gates follow elevation');
    }
    const elevatedRail = ground.colliders.find(c => c.type === 'guardrail' && c.minHeight > 3)!;
    assert(elevatedRail !== undefined, 'high-section rail colliders are elevated');
    const railPose = { x: elevatedRail.center.x, z: elevatedRail.center.z, y: elevatedRail.minHeight, yaw: elevatedRail.yaw };
    assert(collision.resolve({ previousPose: railPose, pose: railPose, dimensions, dt: 1 / 120,
      velocity: { x: 0, z: 0 } }).collided, 'elevated safety barrier retains physical collision');
    for (const vehicle of VEHICLE_CATALOG) {
      const car = new VehicleDynamics<Powertrain>(createVehiclePhysicsConfig(vehicle.id));
      const contacts = new VehicleContactSystem(ground, vehicle.visualConfig.collisionDimensions);
      const p = ground.spawnPose;
      car.reset({ x: p.position.x, z: p.position.z, yaw: p.yawRadians, gear: 'N' });
      for (let i = 0; i < 12; i++) contacts.step(1 / 120, createNeutralVehicleInputState(), car);
      assert(Number.isFinite(car.getSnapshot().speedKmh) && contacts.wheelContacts !== null, `${vehicle.id} shared spawn and contacts`);
      for (const id of ['s-entry', 'hairpin-1', 'hairpin-2']) {
        const s = layout.section(id), pose = layout.poseAt((s.start + s.end) / 2);
        car.reset({ x: pose.position.x, z: pose.position.z, yaw: pose.yawRadians, gear: 'N' }); contacts.reset();
        for (let i = 0; i < 12; i++) contacts.step(1 / 120, { ...createNeutralVehicleInputState(), brake: 1 }, car);
        const wheels = Object.values(contacts.wheelContacts!);
        const mean = wheels.reduce((sum, wheel) => sum + wheel.height, 0) / 4;
        assert(Math.abs(car.getSnapshot().chassis.groundHeight - mean) < 0.015,
          `${vehicle.id}: chassis support follows elevated four-wheel contacts`);
        assert(Math.max(...wheels.map(w => w.height)) - Math.min(...wheels.map(w => w.height)) > 0.025,
          `${vehicle.id}: grade/bank produces distinct wheel contact heights at ${id}`);
      }
    }
    return { assertions, lapLength: layout.length, homeStraight: home, backStraight: back,
      minimumHeight, maximumHeight, maximumGrade, maximumPitGrade,
      pitLength, minJoinDot, meshes, instances, colliders: ground.colliders.length, vehicles: VEHICLE_CATALOG.length };
  } finally { referenceSurface.dispose(); ground.dispose(); }
}

