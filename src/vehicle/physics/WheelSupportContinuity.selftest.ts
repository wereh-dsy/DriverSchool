import { Vector3 } from 'three';
import { createTaycan4SPhysicsConfig } from '../config/taycan4SPhysicsConfig';
import { VehicleDynamics } from './VehicleDynamics';
import { WheelSupportContinuity } from './WheelSupportContinuity';
import { sampleWheelContacts, createWheelContactBuffer, WHEEL_IDS } from './WheelContact';
import { sampleGroundGeometry, surfaceResponseAliases, SURFACE_MATERIALS, type SurfaceReference } from '../../world/SurfaceMaterial';
import { wheelMechanicalRejectReason } from './WheelMechanicalEligibility';
import { VehiclePhysicsBlackBox } from '../diagnostics/VehiclePhysicsBlackBox';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import type { Powertrain } from '../powertrain/Powertrain';
import { VehicleContactSystem } from './VehicleContactSystem';
import type { DrivingGround } from '../../world/DrivingGround';

export function runWheelSupportContinuitySelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error('Support v2: ' + message); };
  const config = createTaycan4SPhysicsConfig(), dt = 1 / 120;
  const a: SurfaceReference = { surfaceId: 'a:0', roadId: 'a', segmentIndex: 0, kind: 'road', connectedRoadIds: new Set(['b']) };
  const b: SurfaceReference = { surfaceId: 'b:0', roadId: 'b', segmentIndex: 0, kind: 'road' };
  const sample = (y: number, reference = a) => ({ ...sampleGroundGeometry(() => y, 0, 0), reference,
    ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt) });
  function fixture(y = 0) {
    const car = new VehicleDynamics<Powertrain>(config, { driveSelector: 'N' }); car.chassisY = y;
    const contacts = sampleWheelContacts({ sampleRoadSurface: () => sample(y) }, car.getSnapshot(), config);
    car.syncWheelContacts(contacts);
    const continuity = new WheelSupportContinuity(); continuity.seed(contacts); continuity.beginStep(dt);
    continuity.prepare(car.suspension.getVerticalSnapshot(), config.wheelRadius);
    return { car, contacts, continuity };
  }
  const f = fixture();
  let candidates = [sample(.15, b), sample(0, a)], queries = 0;
  const ground = { sampleRoadSurface: () => candidates[0]!, sampleRoadSurfaceForSupport: (_x: number, _z: number,
    hint: import('../../world/SurfaceMaterial').SurfaceSupportHint) => {
    queries++;
    let best = Infinity, chosen = candidates[0]!;
    for (const c of candidates) {
      const d = hint.evaluateCandidate!(c.height, c.normal.x, c.normal.y, c.normal.z, c.reference);
      if (d.eligible && d.predictedError < best) { best = d.predictedError; chosen = c; }
    }
    return chosen;
  } };
  const buffer = createWheelContactBuffer();
  for (let tick = 0; tick < 240; tick++) {
    f.continuity.beginStep(dt);
    const contacts = sampleWheelContacts(ground, f.car.getSnapshot(), config, 0, 1, buffer, f.continuity);
    for (const id of WHEEL_IDS) assert(contacts[id].supportValid === true && contacts[id].reference === a &&
      contacts[id].rejectedThisOuterTick === false, 'eligible old surface survives a rejected overlapping candidate');
  }
  assert(queries === 240 * 4, 'four wheel queries per refresh; no candidate re-query');
  const adjacent = { ...a, surfaceId: 'a:1', segmentIndex: 1 };
  for (const ref of [adjacent, b, a, b]) {
    candidates = [sample(0, ref)]; f.continuity.beginStep(dt);
    const contacts = sampleWheelContacts(ground, f.car.getSnapshot(), config, 0, 1, buffer, f.continuity);
    assert(WHEEL_IDS.every(id => contacts[id].supportValid && contacts[id].layerSwitchConfirmationState === 'not-required'),
      'same-layer segment and linked split/merge switch without delay');
  }
  const h = fixture(); let height = .06;
  const onlyB = { sampleRoadSurface: () => sample(height, b), sampleRoadSurfaceForSupport: () => sample(height, b) };
  for (let micro = 0; micro < 8; micro++) h.continuity.sample(onlyB, 'frontLeft', 0, 0);
  assert(!h.continuity.valid('frontLeft'), 'microsteps cannot satisfy two-outer-tick confirmation');
  h.continuity.beginStep(dt); h.continuity.sample(onlyB, 'frontLeft', 0, 0);
  assert(h.continuity.valid('frontLeft'), 'physically reachable moderate layer change confirmed on next tick');
  const competition = fixture();
  const alternative = { ...b, surfaceId: 'b:other', roadId: 'other' };
  for (let tick = 0; tick < 2; tick++) {
    competition.continuity.beginStep(dt);
    competition.continuity.sample({ sampleRoadSurface: () => sample(.07, alternative), sampleRoadSurfaceForSupport: () => sample(.07, alternative) }, 'frontLeft', 0, 0);
    competition.continuity.sample(onlyB, 'frontLeft', 0, 0);
  }
  assert(competition.continuity.valid('frontLeft'), 'competing candidates cannot reset each other\'s outer-tick confirmation');
  const enclosed = fixture();
  enclosed.continuity.seed(Object.fromEntries(WHEEL_IDS.map(id => [id, { ...enclosed.contacts[id], reference: { ...a, structureKind: 'elevated' } }])) as typeof enclosed.contacts);
  enclosed.continuity.sample({ sampleRoadSurface: () => sample(.01, { ...b, roadId: 'unlinked', structureKind: 'tunnel' }),
    sampleRoadSurfaceForSupport: () => sample(.01, { ...b, roadId: 'unlinked', structureKind: 'tunnel' }) }, 'frontLeft', 0, 0);
  assert(!enclosed.continuity.valid('frontLeft'), 'known structural incompatibility cannot win from near-identical height alone');
  const latch = fixture(); height = .15;
  latch.continuity.sample(onlyB, 'frontLeft', 0, 0);
  assert(!latch.continuity.valid('frontLeft'), 'unreachable surface rejected');
  height = .015; latch.continuity.sample(onlyB, 'frontLeft', 0, 0);
  assert(!latch.continuity.valid('frontLeft') && latch.continuity.diagnostics('frontLeft').rejectedThisOuterTick,
    'same surface remains latched after geometry/height becomes feasible');
  latch.continuity.beginStep(dt); latch.continuity.sample(onlyB, 'frontLeft', 0, 0);
  assert(latch.continuity.valid('frontLeft'), 'latch expires at next outer tick, not permanently');
  for (const y of [-6, 0, 8]) {
    const layer = fixture(y);
    candidates = [sample(y + .79, b), sample(y, a), sample(y - .79, b)];
    const contacts = sampleWheelContacts(ground, layer.car.getSnapshot(), config, 0, 1, createWheelContactBuffer(), layer.continuity);
    assert(WHEEL_IDS.every(id => contacts[id].reference === a && contacts[id].supportValid), 'bridge/tunnel does not pick highest or lowest layer');
  }
  const oldBad = fixture(); height = .65; oldBad.continuity.sample(onlyB, 'frontLeft', 0, 0);
  assert(!oldBad.continuity.valid('frontLeft') && oldBad.continuity.rejectionReason('frontLeft') === 'unreachable-layer-switch',
    'old +0.65 m bad-layer fixture remains rejected');
  const cached = fixture(); let faulty = false, refreshQueries = 0;
  const refreshGround = { colliders: [], spawnPose: { position: new Vector3(0, .04, 0), yawRadians: 0 },
    worldBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, sampleRoadSurface: () => sample(0),
    sampleRoadSurfaceForSupport: () => faulty ? sample(refreshQueries++ < 4 ? .65 : .015, b) : sample(0) } as unknown as DrivingGround;
  const adapter = new VehicleContactSystem(refreshGround, config); adapter.synchronize(cached.car);
  adapter.setWetness(.01); faulty = true;
  const refreshed = adapter.step(dt, createNeutralVehicleInputState(), cached.car);
  assert(WHEEL_IDS.every(id => adapter.wheelContacts![id].supportValid === false && !refreshed.wheels[id].grounded) &&
    cached.car.chassisMotion.contactImpulses.every(v => v === 0), 'pre-step cache refresh and microsteps share one rejection latch epoch');
  const g = f.car.suspension.getVerticalSnapshot().wheels.frontLeft;
  assert(wheelMechanicalRejectReason({ ...g, requiredLength: g.minSuspensionLength - .01 }, -.01, dt, -1) === undefined,
    'real small bump-stop constraint remains eligible');
  for (const [corner, gap, reason] of [
    [{ ...g, requiredLength: -.1 }, -.27, 'negative-required-length'],
    [{ ...g, requiredLength: g.minSuspensionLength }, -4.01, 'excessive-penetration'],
    [{ ...g, suspensionAxis: new Vector3(1, 0, 0) }, -4.01, 'invalid-suspension-projection'],
    [{ ...g, rejectedThisOuterTick: true }, -.01, 'same-tick-rejection-latch'],
    [{ ...g, layerSwitchConfirmationState: 'pending-1-tick' }, -.01, 'unconfirmed-layer-switch']
  ] as const) assert(wheelMechanicalRejectReason(corner, gap, dt, 0) === reason, 'independent mechanical gate: ' + reason);

  const box = new VehiclePhysicsBlackBox({ mapId: 'support-v2', mapName: 'episode fixture', mapVersion: 1,
    vehicleId: 'porsche-taycan-4s', vehicleConfigVersion: 1, buildVersion: 'targeted' });
  box.arm();
  const rejected = Object.fromEntries(WHEEL_IDS.map(id => [id, { ...f.contacts[id], supportValid: false,
    reference: b, height: .65, rejectionReason: 'unreachable-layer-switch' as const,
    predictedSurfaceHeight: 0, candidateLayerClass: 'GRADE_SEPARATED' as const,
    previousLayerClass: 'SAME_LAYER' as const, supportSelectionReason: 'same-tick-rejection-latch',
    rejectedThisOuterTick: true, layerSwitchConfirmationState: 'not-required' }])) as typeof f.contacts;
  const controls = createNeutralVehicleInputState();
  // Isolate the event sink over a long episode without requesting extra physics
  // driving or triggering its normal short post-incident recording window.
  for (let tick = 0; tick < 3000; tick++) {
    box.beginStep(dt);
    for (let sampleIndex = 0; sampleIndex < 4; sampleIndex++) box.observeContacts(rejected, {} as never);
  }
  box.requestManualTrigger();
  box.capture(f.car.getSnapshot(), controls, rejected, f.car.suspension.getVerticalSnapshot(), f.car.chassisMotion, {} as never);
  box.freezeInterrupted('episode test');
  const trace = box.createExport();
  const episodes = trace.events.filter(e => e.type === 'support-candidate-rejected');
  assert(episodes.length === 4 && trace.metadata.droppedEvents === 0, '3000 rejected ticks coalesce into four root episodes without overflow');
  assert(episodes.every(e => (e.detail as { count: number; firstStep: number; lastStep: number }).count >= 12000 &&
    (e.detail as { firstStep: number }).firstStep === 1 && (e.detail as { lastStep: number }).lastStep === 3000), 'episodes retain first/last/count');
  const wheels = trace.frames[0]!.wheels as Record<string, unknown>[];
  assert(wheels.every(w => w.candidateLayerClass === 'GRADE_SEPARATED' && w.rejectedThisOuterTick === 1 && w.predictedSurfaceHeight === 0),
    'new support decision fields survive typed Black Box export');
  assert(box.allocatedFrameBytes < 1024 * 1024, 'typed frame memory remains below 1 MiB');
  return { assertions, queries, episodes: episodes.length, droppedEvents: trace.metadata.droppedEvents,
    allocatedFrameBytes: box.allocatedFrameBytes };
}
