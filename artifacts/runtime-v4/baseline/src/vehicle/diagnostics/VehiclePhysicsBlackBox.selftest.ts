import { Group, Vector2, Vector3 } from 'three';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import type { DrivingGround } from '../../world/DrivingGround';
import { CityGround } from '../../world/city/CityGround';
import { newCityMap } from '../../world/city/CityMapData';
import { SURFACE_MATERIALS, surfaceResponseAliases, type SurfaceReference } from '../../world/SurfaceMaterial';
import { createDefaultVehiclePhysicsConfig } from '../config';
import { createStaticOBBCollider, createVehicleOBB, type CollisionResolution } from '../physics/CollisionSystem';
import { VehicleContactSystem } from '../physics/VehicleContactSystem';
import { VehicleDynamics, type VehicleRuntimeSnapshot } from '../physics/VehicleDynamics';
import { WHEEL_IDS } from '../physics/WheelContact';
import { BLACK_BOX_SETTINGS as S, FRAME_FLOAT_FIELDS, WHEEL_FLOAT_FIELDS, type BlackBoxMetadata } from './BlackBoxSchema';
import { VehiclePhysicsBlackBox, blackBoxFilename } from './VehiclePhysicsBlackBox';

const DT = 1 / 120;
const metadata: BlackBoxMetadata = { mapId: 'blackbox-test-map', mapName: 'Black box fixture', mapVersion: 7,
  vehicleId: 'fixture', vehicleConfigVersion: 2, buildVersion: 'targeted-test' };
const neutral = createNeutralVehicleInputState();

export function blackBoxFixture() {
  const reference: SurfaceReference = { surfaceId: 'road-a:0:road', roadId: 'road-a', segmentId: 'road-a:0' };
  const sample = { ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt), height: 0,
    gradient: new Vector2(), normal: new Vector3(0, 1, 0), grade: 0, reference, referenceHeight: 0 };
  let queries = 0;
  const ground: DrivingGround = { root: new Group(), metadata: { id: metadata.mapId, version: 7,
    displayName: metadata.mapName, description: 'targeted fixture' },
    colliders: [], worldBounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    spawnPose: { position: new Vector3(12, .04, -33), yawRadians: .3 },
    sampleRoadSurface: () => sample, getRoadHeightAt: () => sample.height, getRoadPitchAt: () => 0,
    debugSurfaceCandidates: (x, z, referenceHeight) => { queries++; return { x, z, referenceHeight,
      chosen: sample.reference.surfaceId, candidates: [{ id: sample.reference.surfaceId,
        roadId: sample.reference.roadId, segmentIndex: 0, segmentId: sample.reference.segmentId, height: sample.height, normal: { ...sample.normal },
        distance: 0, score: Math.abs(sample.height - referenceHeight), accepted: true, reason: 'selected-lowest-score' }] }; },
    dispose: () => {},
  };
  const config = createDefaultVehiclePhysicsConfig();
  const dynamics = new VehicleDynamics(config, { x: 12, z: -33, yaw: .3, gear: 'N', engineRunning: false });
  const contacts = new VehicleContactSystem(ground, config);
  const snapshot = contacts.synchronize(dynamics);
  const recorder = new VehiclePhysicsBlackBox(metadata);
  const tick = (s: VehicleRuntimeSnapshot = snapshot) => {
    recorder.beginStep(DT);
    recorder.capture(s, neutral, contacts.wheelContacts!, dynamics.suspension.getVerticalSnapshot(), dynamics.chassisMotion, ground);
  };
  return { sample, ground, dynamics, contacts, snapshot, recorder, tick, get queries() { return queries; } };
}

export function runVehiclePhysicsBlackBoxSelfTest() {
  let assertions = 0;
  const assert = (condition: unknown, message: string): void => {
    assertions++;
    if (!condition) throw new Error(`Black box: ${message}`);
  };
  const complete = (f: ReturnType<typeof blackBoxFixture>) => {
    for (let i = 0; i < S.postSteps; i++) f.tick();
    assert(f.recorder.status === 'FROZEN', 'freeze after exact post window');
    return f.recorder.createExport();
  };
  const off = blackBoxFixture();
  off.recorder.requestManualTrigger();
  for (let i = 0; i < 10; i++) off.tick();
  assert(off.recorder.status === 'OFF' && off.recorder.frameCount === 0 && off.queries === 0, 'OFF: no frames, triggers, events or diagnostics');
  assert(off.recorder.intern('stable-id') === off.recorder.intern('stable-id'), 'stable dictionary handle');
  assert(off.recorder.intern(undefined) === 0, 'unknown dictionary handle');

  const ring = blackBoxFixture(); ring.recorder.arm();
  for (let i = 0; i < 2400; i++) ring.tick();
  assert(ring.recorder.frameCount === 601 && ring.queries === 0, 'armed prehistory bounded; no ordinary candidate queries');
  ring.recorder.requestManualTrigger(); ring.tick();
  const triggerStep = 2401;
  for (let i = 0; i < S.postSteps - 1; i++) ring.tick();
  assert(ring.recorder.status === 'CAPTURING POST-EVENT', 'not frozen before final post step');
  ring.tick(); const exported = ring.recorder.createExport();
  assert(exported.frames.length === 781 && exported.incident.preSteps === 600 && exported.incident.postSteps === 180, '5s pre + trigger + 1.5s post');
  assert(exported.incident.triggerStep === triggerStep && exported.incident.reason === 'manual', 'manual trigger aligned');
  assert(exported.frames[600]!.step === triggerStep, 'trigger sample exists');
  assert(exported.frames.every((f, i) => f.step === triggerStep - 600 + i), 'ring wrap exported oldest to newest');
  assert(exported.events.every((e, i, a) => i === 0 || e.step >= a[i - 1]!.step), 'events sorted by step');
  const location = exported.incident.location!;
  assert(location.x === ring.snapshot.x && location.z === ring.snapshot.z && location.map.id === metadata.mapId, 'absolute incident location');
  assert(exported.dictionaries.strings[location.road!] === 'road-a' && exported.dictionaries.strings[location.segment!] === 'road-a:0', 'location handles resolve');
  assert(location.wheels.every(w => w.grounded && exported.dictionaries.strings[w.surface!] === 'road-a:0:road'), 'per-wheel trigger support');
  assert(exported.schemaVersion === 1 && exported.metadata.physicsHz === 120 && exported.frames[0]!.worldPositionY !== undefined, 'export schema and world position');
  assert(FRAME_FLOAT_FIELDS.every(k => k in exported.frames[0]!), 'all chassis/input fields exported');
  const wheel = (exported.frames[0]!.wheels as Record<string, unknown>[])[0]!;
  assert(WHEEL_FLOAT_FIELDS.every(k => k in wheel), 'all wheel fields exported');
  const json = JSON.stringify(exported);
  assert(JSON.parse(json).frames.length === 781, 'export roundtrip readable JSON');
  assert(blackBoxFilename(new Date(2026, 9, 21, 3, 4, 5)) === 'vehicle-blackbox-20261021-030405.json', 'filename format');
  ring.recorder.markSaved(); ring.tick();
  assert(ring.recorder.status === 'SAVED' && ring.recorder.frameCount === 1, 'saved automatically resumes armed history');

  const auto = blackBoxFixture(); auto.recorder.arm(); auto.tick();
  auto.tick({ ...auto.snapshot, chassis: { ...auto.snapshot.chassis, verticalVelocity: 9 } });
  assert(auto.recorder.highDetail, 'automatic delta-v trigger');
  const autoExport = complete(auto);
  assert(autoExport.incident.reason === 'vertical-velocity-jump' && autoExport.events.some(e => e.type === 'automatic-trigger'), 'automatic trigger event');

  const surface = blackBoxFixture(); surface.recorder.arm(); surface.tick();
  surface.sample.reference = { surfaceId: 'road-b:3:road', roadId: 'road-b', segmentId: 'road-b:3' };
  surface.sample.height = 1.2;
  surface.contacts.synchronize(surface.dynamics); surface.tick();
  assert(surface.recorder.highDetail, 'suspicious surface switch triggers');
  const surfaceExport = complete(surface);
  const switchEvent = surfaceExport.events.find(e => e.type === 'support-surface-changed');
  assert(switchEvent && surface.queries > 0, 'sparse switch includes candidates');
  const switchDetail = switchEvent!.detail as { candidates: { candidates: { reason: string }[] }; previousRoad: number };
  assert(switchDetail.candidates.candidates[0]!.reason === 'selected-lowest-score' &&
    surfaceExport.dictionaries.strings[switchDetail.previousRoad] === 'road-a', 'candidate reason and previous road retained');
  assert(surfaceExport.dictionaries.strings[surfaceExport.incident.location!.previousRoad!] === 'road-a', 'previous road in incident');

  const cycle = blackBoxFixture(); cycle.recorder.arm(); cycle.tick();
  const original = cycle.sample.reference;
  cycle.sample.reference = { surfaceId: 'road-b:0:road', roadId: 'road-b', segmentId: 'road-b:0' };
  cycle.sample.height = .3; cycle.contacts.synchronize(cycle.dynamics); cycle.tick();
  cycle.sample.reference = original; cycle.sample.height = 0; cycle.contacts.synchronize(cycle.dynamics); cycle.tick();
  assert(cycle.recorder.highDetail, 'short A-B-A with geometric discontinuity triggers');
  assert(complete(cycle).incident.reason === 'support-A-B-A', 'A-B-A reason');

  const eventWrap = blackBoxFixture(); eventWrap.recorder.arm(); eventWrap.tick();
  for (let i = 0; i < 300; i++) {
    eventWrap.sample.reference = { surfaceId: `seam-${i}`, roadId: 'road-a', segmentId: 'road-a:0' };
    eventWrap.contacts.synchronize(eventWrap.dynamics); eventWrap.tick();
  }
  eventWrap.recorder.requestManualTrigger(); eventWrap.tick();
  const eventExport = complete(eventWrap);
  assert(eventExport.metadata.droppedEvents > 0 && eventExport.events.length <= S.eventCapacity, 'event ring bounded after wrap');
  assert(eventExport.events.every((e, i, all) => !i || e.sequence > all[i - 1]!.sequence), 'wrapped event order');
  assert(eventExport.events.some(e => e.type === 'manual-trigger'), 'trigger retained after event wrap');

  const evTelemetry = blackBoxFixture(); evTelemetry.recorder.arm();
  const evSnapshot = { ...evTelemetry.snapshot, rpm: undefined, gear: null };
  evTelemetry.tick(evSnapshot);
  assert(!evTelemetry.recorder.highDetail, 'absent ICE telemetry does not trigger anomaly');
  evTelemetry.recorder.requestManualTrigger(); evTelemetry.tick(evSnapshot);
  for (let i = 0; i < S.postSteps; i++) evTelemetry.tick(evSnapshot);
  assert(evTelemetry.recorder.createExport().frames[0]!.engineRPM === null, 'absent ICE RPM exports null');

  const invalid = blackBoxFixture(); invalid.recorder.arm(); invalid.tick();
  invalid.tick({ ...invalid.snapshot, recoveredFromInvalidState: true });
  assert(invalid.recorder.highDetail, 'non-finite recovery triggers');
  assert(complete(invalid).events.some(e => e.type === 'non-finite-recovery'), 'non-finite recovery event');

  const impact = blackBoxFixture(); impact.recorder.arm(); impact.tick(); impact.recorder.beginStep(DT);
  const collider = createStaticOBBCollider({ id: 'test-wall', type: 'wall', x: 0, z: 0, width: 4, length: 1 });
  const collision: CollisionResolution = { collided: true, pose: { x: 0, z: 0, yaw: 0 }, velocity: { x: 2, z: 0 },
    vehicleOBB: createVehicleOBB({ x: 0, z: 0, yaw: 0 }, impact.dynamics.config), nearbyColliders: [collider],
    contacts: [{ colliderId: collider.id, point: { x: 1, z: 2 }, normal: { x: 0, z: 1 }, penetration: .02, inwardSpeed: 12 }] };
  const beforeImpact = { ...impact.snapshot, speed: 12, yaw: 0, chassis: { ...impact.snapshot.chassis, pitch: .5 } };
  const afterImpact = { ...beforeImpact, speed: 0, lateralVelocity: 2 };
  impact.recorder.collision(beforeImpact, afterImpact, collision);
  impact.recorder.capture(afterImpact, neutral, impact.contacts.wheelContacts!, impact.dynamics.suspension.getVerticalSnapshot(), impact.dynamics.chassisMotion, impact.ground);
  const impactExport = complete(impact);
  const collisionDetail = impactExport.events.find(e => e.type === 'collision')!.detail as {
    signedSpeedBefore: number; signedSpeedAfter: number; contacts: { collider: number; colliderType: number }[] };
  assert(collisionDetail.signedSpeedBefore === 12 && collisionDetail.signedSpeedAfter === 0, 'collision before/after signed speed');
  assert(impactExport.dictionaries.strings[collisionDetail.contacts[0]!.collider] === 'test-wall' &&
    impactExport.dictionaries.strings[collisionDetail.contacts[0]!.colliderType] === 'wall', 'collider dictionary/type');

  // Small production-adapter integration: OFF, ARMED, high detail and diagnostic failure preserve exact physics.
  const plain = blackBoxFixture(), recorded = blackBoxFixture();
  recorded.recorder.arm(); recorded.contacts.blackBox = recorded.recorder;
  recorded.recorder.requestManualTrigger();
  let plainState = plain.snapshot, recordedState = recorded.snapshot;
  for (let i = 0; i < 190; i++) {
    plainState = plain.contacts.step(DT, neutral, plain.dynamics);
    recordedState = recorded.contacts.step(DT, neutral, recorded.dynamics);
    assert(JSON.stringify(plainState) === JSON.stringify(recordedState), 'recorder cannot change production physics step ' + i);
  }
  assert(recorded.recorder.status === 'FROZEN', 'production adapter freezes');
  const integratedExport = recorded.recorder.createExport();
  assert(integratedExport.events.some(e => e.type === 'post-event-detail' && (e.detail as { microsteps: unknown[] }).microsteps.length > 0), 'actual microstep/constraint detail captured');
  assert(plain.queries === 0, 'OFF production adapter makes no diagnostic queries');
  const broken = blackBoxFixture(); broken.recorder.arm(); broken.contacts.blackBox = broken.recorder;
  broken.recorder.requestManualTrigger(); broken.contacts.step(DT, neutral, broken.dynamics);
  broken.ground.debugSurfaceCandidates = () => { throw new Error('injected diagnostics failure'); };
  const plainBroken = blackBoxFixture(); plainBroken.contacts.step(DT, neutral, plainBroken.dynamics);
  assert(JSON.stringify(broken.contacts.step(DT, neutral, broken.dynamics)) ===
    JSON.stringify(plainBroken.contacts.step(DT, neutral, plainBroken.dynamics)), 'diagnostic failure isolated from physics');
  assert(broken.recorder.status === 'ERROR', 'diagnostics failure visible');

  // Real city sampler: diagnostics retain selection and do not change persistent support reference.
  const map = newCityMap();
  map.roads.push({ id: 'overlap-ground', type: 'urban_2lane', laneCount: 2, laneWidth: 3.5, travelDirection: 'two-way', speedLimit: 40,
    centerline: [{ x: -30, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }], elevationMode: 'ground' });
  map.roads.push({ ...map.roads[0]!, id: 'overlap-upper', elevationMode: 'elevated', elevation: 6 });
  const city = new CityGround(map, { editor: true }); city.setSurfaceReferenceHeight(0);
  const selected = city.sampleRoadSurface(0, 0), candidates = city.debugSurfaceCandidates(0, 0, 6);
  assert(selected.reference?.roadId === 'overlap-ground' && candidates.candidates.some(c => c.roadId === 'overlap-upper' && c.accepted), 'real sampler identities and candidates');
  assert(city.sampleRoadSurface(0, 0).reference === selected.reference, 'debug requery cannot change support reference');
  city.dispose();
  assert(WHEEL_IDS.length === 4, 'four-wheel field contract');
  return { assertions, frameBytes: ring.recorder.allocatedFrameBytes, eventCapacity: S.eventCapacity,
    sampleIncident: integratedExport };
}
