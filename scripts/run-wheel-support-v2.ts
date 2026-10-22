import fs from 'node:fs';
import { Vector3 } from 'three';
import { CityGround } from '../src/world/city/CityGround';
import { createTaycan4SPhysicsConfig } from '../src/vehicle/config/taycan4SPhysicsConfig';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { WHEEL_IDS, sampleWheelContacts, createWheelContactBuffer } from '../src/vehicle/physics/WheelContact';
import { WheelSupportContinuity } from '../src/vehicle/physics/WheelSupportContinuity';
import { sampleGroundGeometry, surfaceResponseAliases, SURFACE_MATERIALS } from '../src/world/SurfaceMaterial';
import type { SurfaceReference } from '../src/world/SurfaceMaterial';
import { runWheelContactSelfTest } from '../src/vehicle/physics/WheelContact.selftest';
import { runVerticalDynamicsSelfTest } from '../src/vehicle/physics/VerticalDynamics.selftest';
import { VehicleContactSystem } from '../src/vehicle/physics/VehicleContactSystem';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { VehiclePhysicsBlackBox } from '../src/vehicle/diagnostics/VehiclePhysicsBlackBox';
import { runWheelSupportContinuitySelfTest } from '../src/vehicle/physics/WheelSupportContinuity.selftest';

const dir = 'artifacts/wheel-support-selection-v2', baseline = process.argv.includes('--baseline'), dt = 1 / 120;
fs.mkdirSync(dir, { recursive: true });
let assertions = 0;
function assert(ok: boolean, message: string) { assertions++; if (!ok) throw new Error(message); }
const neutral = createNeutralVehicleInputState();
const roadA: SurfaceReference = { surfaceId: 'anchor:0:road', roadId: 'anchor', segmentId: 'anchor:0', kind: 'road', segmentIndex: 0 };
const roadB: SurfaceReference = { surfaceId: 'overlap:0:road', roadId: 'overlap', segmentId: 'overlap:0', kind: 'road', segmentIndex: 0 };
const terrain: SurfaceReference = { surfaceId: 'terrain', kind: 'terrain' };
const surface = (height: number, ref = roadA) => ({ ...sampleGroundGeometry(() => height, 0, 0), reference: ref,
  ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt) });
function fixture() {
  const config = createTaycan4SPhysicsConfig(); config.suspension.unsprungMass = undefined;
  const car = new VehicleDynamics(config, { driveSelector: 'N' });
  const contacts = sampleWheelContacts({ sampleRoadSurface: () => surface(0) }, car.getSnapshot(), config);
  car.syncWheelContacts(contacts);
  const support = new WheelSupportContinuity(); support.seed(contacts); support.beginStep(dt);
  const g = car.suspension.getVerticalSnapshot(); support.prepare(g, config.wheelRadius);
  return { config, car, contacts, support, g };
}
function response(car: VehicleDynamics, contacts: ReturnType<typeof sampleWheelContacts>) {
  const h = dt, m = car.chassisMotion;
  m.beginStep(1);
  const frame = car.suspension.updateVertical(h, { chassisY: car.chassisY, verticalVelocity: m.velocity, contacts });
  let peakImpulse = 0, gap = 0, mechanicalReason: unknown, preSafetyVY = 0, preSafetyAY = 0;
  const initialVelocity = m.velocity;
  m.diagnosticObserver = (_body, _frame, constraints) => {
    peakImpulse = Math.max(...constraints.map(c => c.impulse)); gap = Math.min(...constraints.map(c => c.gap));
    mechanicalReason = (constraints[0] as any).rejectReason;
    preSafetyVY = _body.velocity; preSafetyAY = (_body.velocity - initialVelocity) / dt;
  };
  m.integrate(h, car.x, car.z, car.yaw, frame, car.getSnapshot().wheels); m.finishStep(h);
  return { peakImpulse, vY: m.velocity, aY: m.acceleration, preSafetyVY, preSafetyAY, gap, mechanicalReason, safety: m.safetyInterventions };
}
function selectedReplay(name: string, x: number, z: number, delta: number) {
  const f = fixture(); f.car.x = x; f.car.z = z;
  const query = { sampleRoadSurface: () => surface(delta, roadB), sampleRoadSurfaceForSupport: () => surface(delta, roadB) };
  const buffer = createWheelContactBuffer();
  const contacts = sampleWheelContacts(query, f.car.getSnapshot(), f.config, 0, 1, buffer, f.support);
  const result = { name, x, z, delta, accepted: contacts.frontLeft.supportValid, reason: contacts.frontLeft.rejectionReason,
    ...response(f.car, contacts) };
  if (!baseline) assert(!result.accepted && result.peakImpulse === 0 && result.safety === 0, name + ': invalid overlap isolated');
  return result;
}
function latchReplay() {
  const f = fixture(), id = 'frontLeft', c = f.g.wheels[id] as any;
  // Captured numerical boundary: 0.25755 > 0.25716, then 0.24969 < 0.26732.
  c.minSuspensionLength = .1; c.maxSuspensionLength = .44288;
  c.attachmentWorldPosition.y = .45; c.wheelCenterWorld.y = .35;
  let height = 0;
  const query = { sampleRoadSurface: () => surface(height, roadB), sampleRoadSurfaceForSupport: () => surface(height, roadB) };
  f.support.sample({ sampleRoadSurface: () => surface(0, roadA), sampleRoadSurfaceForSupport: () => surface(0, roadA) }, id, 0, 0);
  height = .25755;
  f.support.sample(query, id, 0, 0);
  const first = { valid: f.support.valid(id), threshold: f.support.heightTolerance(id), reason: f.support.rejectionReason(id) };
  height = .24969; c.attachmentWorldPosition.y += .01016;
  f.support.sample(query, id, 0, 0);
  const second = { valid: f.support.valid(id), threshold: f.support.heightTolerance(id), reason: f.support.rejectionReason(id) };
  // Now make geometry actually reachable: the explicit latch must still win.
  c.attachmentWorldPosition.y = height + .35 + .2;
  f.support.sample(query, id, 0, 0);
  const reachableSameTick = f.support.valid(id);
  f.support.beginStep(dt); f.support.sample(query, id, 0, 0);
  const nextTick = f.support.valid(id);
  const car = fixture(); car.car.chassisY = -.10;
  const poisoned = Object.fromEntries(WHEEL_IDS.map(id => [id, { ...car.contacts[id], height: .24969,
    reference: roadB, supportValid: second.valid, rejectionReason: second.reason }])) as typeof car.contacts;
  const result = { name: 'B-same-tick-boundary', x: 4, z: -1160, first, second, reachableSameTick, nextTick,
    ...response(car.car, poisoned) };
  if (baseline) assert(!first.valid && second.valid, 'frozen old selector reproduces reject -> accept');
  else assert(!first.valid && !second.valid && !reachableSameTick && result.peakImpulse === 0, 'same tick latch survives threshold/geometry changes');
  return result;
}
function bridgeReplay() {
  const f = fixture(); f.car.chassisY = 20;
  const elevated = Object.fromEntries(WHEEL_IDS.map(id => [id, { ...f.contacts[id], height: 20 }])) as typeof f.contacts;
  f.car.syncWheelContacts(elevated); f.support.seed(elevated);
  f.support.prepare(f.car.suspension.getVerticalSnapshot(), f.config.wheelRadius);
  f.support.beginStep(dt);
  const ground = { sampleRoadSurface: () => surface(0, terrain), sampleRoadSurfaceForSupport: () => surface(0, terrain) };
  const lost = sampleWheelContacts(ground, f.car.getSnapshot(), f.config, 0, 1, createWheelContactBuffer(), f.support);
  const lostResult = { valid: lost.frontLeft.supportValid, reason: lost.frontLeft.rejectionReason, ...response(f.car, lost) };
  // Teleport only in this short contact fixture to represent the end of a real
  // 20 m fall; the selector must use current reach, not the old deck anchor.
  f.car.chassisY = .015; f.car.chassisMotion.velocity = -.1;
  f.car.suspension.refreshVerticalGeometry({ chassisY: .015, verticalVelocity: -.1, contacts: lost });
  f.support.beginStep(dt);
  const landed = sampleWheelContacts(ground, f.car.getSnapshot(), f.config, 0, 1, createWheelContactBuffer(), f.support);
  const result = { name: 'D-bridge-terrain', lost: lostResult, acquired: landed.frontLeft.supportValid,
    acquisitionReason: landed.frontLeft.supportSelectionReason };
  if (!baseline) assert(!lostResult.valid && lostResult.peakImpulse === 0 && result.acquired &&
    result.acquisitionReason === 'terrain-support-acquired', 'road support loss is distinct from terrain landing');
  return result;
}
function actualBridgeFall() {
  const f = fixture(); f.car.chassisY = 20;
  let contacts = Object.fromEntries(WHEEL_IDS.map(id => [id, { ...f.contacts[id], height: 20 }])) as typeof f.contacts;
  f.car.syncWheelContacts(contacts); f.support.seed(contacts);
  const buffer = createWheelContactBuffer();
  const ground = { sampleRoadSurface: () => surface(0, terrain), sampleRoadSurfaceForSupport: () => surface(0, terrain) };
  const box = new VehiclePhysicsBlackBox({ mapId: 'bridge-fall', mapName: '20m release', mapVersion: 1,
    vehicleId: 'porsche-taycan-4s', vehicleConfigVersion: 1, buildVersion: baseline ? 'before' : 'after' }); box.arm();
  box.beginStep(dt);
  box.capture(f.car.getSnapshot(), neutral, contacts, f.car.suspension.getVerticalSnapshot(), f.car.chassisMotion, {} as never);
  let firstContact: number | null = null, airborne = false, maxImpulse = 0, maxVY = 0, maxAY = 0, mapQueries = 0;
  for (let tick = 0; tick < 420; tick++) {
    f.support.beginStep(dt, f.car.verticalVelocity); box.beginStep(dt);
    if (tick === 418) box.requestManualTrigger();
    const state = f.car.stepFixed(dt, neutral, { wheelContacts: contacts,
      sampleVerticalContacts: (_x, _z, _yaw, _y, geometry) => {
        f.support.prepare(geometry, f.config.wheelRadius);
        mapQueries += 4;
        const sampled = sampleWheelContacts(ground, f.car.getSnapshot(), f.config, 0, 1, buffer, f.support);
        box.observeContacts(sampled, {} as never); return sampled;
      } });
    contacts = buffer;
    if (state.chassis.groundedWheels === 0) airborne = true;
    if (airborne && state.chassis.groundedWheels > 0 && firstContact === null) firstContact = tick * dt;
    maxImpulse = Math.max(maxImpulse, ...f.car.chassisMotion.contactImpulses);
    maxVY = Math.max(maxVY, Math.abs(f.car.verticalVelocity)); maxAY = Math.max(maxAY, Math.abs(f.car.verticalAcceleration));
    box.capture(state, neutral, contacts, f.car.suspension.getVerticalSnapshot(), f.car.chassisMotion, {} as never);
  }
  box.freezeInterrupted('short integrated fall complete');
  const trace = box.createExport();
  fs.writeFileSync(dir + '/' + (baseline ? 'before' : 'after') + '-bridge-blackbox.json', JSON.stringify(trace));
  const result = { airborne, firstContact, maxImpulse, maxVY, maxAY, finalY: f.car.chassisY,
    safety: f.car.chassisMotion.safetyInterventions, mapQueries, events: trace.events.map(e => e.type) };
  if (!baseline) {
    assert(airborne && firstContact !== null && firstContact > 1.5 && Math.abs(f.car.chassisY) < .04 && result.safety === 0,
      'integrated fall acquires terrain only after actually falling near it: ' + JSON.stringify(result));
    assert(result.maxImpulse < 20000 && result.maxVY < 25, 'real 20 m landing remains bounded without impulse clamp');
    assert(result.events.includes('road-support-lost') && result.events.includes('terrain-support-acquired') &&
      !result.events.includes('surface-height-jump'), 'Black Box separates pavement exit and terrain acquisition');
  }
  return result;
}
function rolloverReplay() {
  const f = fixture(); f.car.chassisY = -4.01; f.car.chassisMotion.roll = Math.PI / 2;
  f.car.suspension.setDynamicPose(0, Math.PI / 2);
  const result = { name: 'E-rollover', ...response(f.car, f.contacts) };
  if (!baseline) assert(result.peakImpulse === 0 && result.safety === 0, 'sideways wheel ray cannot create meter-gap impulse');
  return result;
}
function rejectionEpisodeReplay() {
  const f = fixture();
  const box = new VehiclePhysicsBlackBox({ mapId: 'episode-replay', mapName: 'diagnostic sink only', mapVersion: 1,
    vehicleId: 'test', vehicleConfigVersion: 1, buildVersion: baseline ? 'before' : 'after' });
  const rejected = Object.fromEntries(WHEEL_IDS.map(id => [id, { ...f.contacts[id], reference: roadB,
    height: .65, supportValid: false, rejectionReason: 'unreachable-layer-switch' as const }])) as typeof f.contacts;
  box.arm();
  for (let tick = 0; tick < 3000; tick++) {
    box.beginStep(dt);
    for (let n = 0; n < 4; n++) box.observeContacts(rejected, {} as never);
  }
  box.requestManualTrigger(); box.capture(f.car.getSnapshot(), neutral, rejected, f.g, f.car.chassisMotion, {} as never);
  box.freezeInterrupted('episode replay');
  const trace = box.createExport();
  return { droppedEvents: trace.metadata.droppedEvents, retainedEvents: trace.events.length,
    firstOccurrenceRetained: trace.events.some(e => e.step === 1), peakCount: Math.max(...trace.events.map(e => (e.detail as any).count ?? 0)) };
}

function localRuntime(x: number, z: number) {
  const source = JSON.parse(fs.readFileSync('src/world/regional/regional-main.json', 'utf8'));
  const roads = source.roads.filter((road: any) => road.centerline.some((b: any, i: number) => {
    if (!i) return false; const a = road.centerline[i - 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < 30;
  }));
  const ids = new Set(roads.map((r: any) => r.id));
  const data = { ...source, regional: undefined, editing: undefined, bounds: { minX: x - 300, maxX: x + 300, minZ: z - 300, maxZ: z + 300 },
    roads, intersections: [], objects: [], signs: [], connectionPorts: [],
    roadLinks: source.roadLinks?.filter((l: any) => ids.has(l.from.roadId) && ids.has(l.to.roadId)),
    environment: { ...source.environment, landmarks: [], spawnPoints: [{ id: 'fixture', position: { x, y: 0, z }, rotation: 0 }] } };
  const ground = new CityGround(data, { editor: true });
  try {
    const candidates = ground.debugSurfaceCandidates(x, z, 0).candidates;
    const startY = candidates.find(c => c.distance === 0)?.height ?? 0;
    ground.spawnPose.position.set(x, startY + .04, z);
    const car = new VehicleDynamics(createTaycan4SPhysicsConfig(), { x, z, driveSelector: 'N' });
    car.chassisY = startY;
    const adapter = new VehicleContactSystem(ground, car.config); adapter.collisionSystem.setColliders([]);
    adapter.synchronize(car);
    let impulse = 0, vY = 0, aY = 0, rawVY = 0, transitions = 0, unsafeRoadSwitches = 0;
    car.chassisMotion.diagnosticObserver = m => { rawVY = Math.max(rawVY, Math.abs(m.velocity)); };
    const lastSupport = WHEEL_IDS.map(id => ({ reference: adapter.wheelContacts![id].reference, height: adapter.wheelContacts![id].height }));
    let state = car.getSnapshot(), mask = state.chassis.groundedWheels;
    for (let tick = 0; tick < 36; tick++) {
      state = adapter.step(dt, neutral, car);
      if (state.chassis.groundedWheels !== mask) transitions++; mask = state.chassis.groundedWheels;
      impulse = Math.max(impulse, ...car.chassisMotion.contactImpulses); vY = Math.max(vY, Math.abs(car.verticalVelocity));
      aY = Math.max(aY, Math.abs(car.verticalAcceleration));
      for (let i = 0; i < 4; i++) {
        const contact = adapter.wheelContacts![WHEEL_IDS[i]!]!, previous = lastSupport[i]!;
        if (contact.supportValid === false) continue;
        if (contact.reference?.roadId && previous.reference?.roadId && contact.reference.roadId !== previous.reference.roadId &&
          Math.abs(contact.height - previous.height) > .1) unsafeRoadSwitches++;
        previous.reference = contact.reference; previous.height = contact.height;
      }
    }
    if (!baseline) assert(impulse === 0 && car.chassisMotion.safetyInterventions === 0 && unsafeRoadSwitches === 0,
      'local v484 runtime remains bounded without discontinuous road transfer');
    return { x, z, mapVersion: source.version, candidates, impulse, vY, aY, rawVY, transitions, unsafeRoadSwitches,
      safety: car.chassisMotion.safetyInterventions };
  } finally { ground.dispose(); }
}

const replays = [selectedReplay('A-parallel-15cm', -44, -1287, -.15161), latchReplay(),
  selectedReplay('C-road-access-79cm', -674, -150, -.79224), bridgeReplay(), rolloverReplay()];
const runtime = [[-44.38, -1287.04], [3.34, -1159.1], [-674, -150]].map(([x, z]) => localRuntime(x!, z!));
let targeted;
if (!baseline && !process.argv.includes('--fixtures-only')) targeted = { wheelContact: runWheelContactSelfTest(),
  support: runWheelSupportContinuitySelfTest(), vertical: runVerticalDynamicsSelfTest() };
const bridgeFall = actualBridgeFall();
const episodes = rejectionEpisodeReplay();
const result = { baseline, assertions, replays, runtime, bridgeFall, episodes, targeted };
fs.writeFileSync(dir + '/' + (baseline ? 'before' : 'after') + '.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
