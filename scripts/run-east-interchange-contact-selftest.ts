import fs from 'node:fs';
import { CityGround } from '../src/world/city/CityGround';
import { validateMap } from '../src/world/city/CityMapValidation';
import { createTeslaModel3PhysicsConfig } from '../src/vehicle/config/teslaModel3PhysicsConfig';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../src/vehicle/physics/VehicleContactSystem';
import { VehiclePhysicsBlackBox } from '../src/vehicle/diagnostics/VehiclePhysicsBlackBox';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { WHEEL_IDS } from '../src/vehicle/physics/WheelContact';
import { runWheelContactSelfTest } from '../src/vehicle/physics/WheelContact.selftest';
import { runVerticalDynamicsSelfTest } from '../src/vehicle/physics/VerticalDynamics.selftest';
import { runSuspensionMechanicsSelfTest } from '../src/vehicle/physics/SuspensionMechanics.selftest';

const dir = 'artifacts/east-interchange-contact-stability-fix';
const original = JSON.parse(fs.readFileSync(`${dir}/original-local-map.json`, 'utf8'));
const source = JSON.parse(fs.readFileSync('src/world/regional/regional-main.json', 'utf8'));
const ids = new Set(original.roads.map((r: any) => r.id));
const local = { ...original, version: source.version,
  roads: source.roads.filter((r: any) => ids.has(r.id)).map((r: any) => r.id.includes('turbine')
    ? { ...r, centerline: r.centerline.filter((p: any) => p.x >= 2500 && p.z < 0) } : r) };
const config = createTeslaModel3PhysicsConfig(), dt = 1 / 120;
let assertions = 0;
function assert(value: boolean, message: string) { assertions++; if (!value) throw new Error(message); }

function badCandidateRegression() {
  const ground = new CityGround(local, { editor: true });
  const car = new VehicleDynamics(config, { x: 2675, z: -159.625, yaw: Math.PI / 2, driveSelector: 'N' });
  const adapter = new VehicleContactSystem(ground, config); adapter.collisionSystem.setColliders([]);
  adapter.synchronize(car);
  const neutral = createNeutralVehicleInputState(), sample = ground.sampleRoadSurfaceForSupport.bind(ground);
  const bad = { surfaceId: 'fixture-bad-layer', roadId: 'fixture-bad-road', segmentId: 'fixture-bad-segment' };
  const box = new VehiclePhysicsBlackBox({ mapId: local.id, mapName: local.name, mapVersion: local.version,
    vehicleId: 'tesla-model-3-rwd', vehicleConfigVersion: 2, buildVersion: 'bad-candidate-regression' });
  box.arm(); adapter.blackBox = box;
  try {
    ground.sampleRoadSurfaceForSupport = (x, z, hint) => ({ ...sample(x, z, hint),
      height: hint.height + .65, reference: bad });
    const airborne = adapter.step(dt, neutral, car);
    assert(WHEEL_IDS.every(id => airborne.wheels[id].grounded === false && airborne.wheels[id].normalLoad === 0),
      'unreachable candidate is airborne, never full bump');
    assert(car.chassisMotion.contactImpulses.every(v => v === 0), 'rejected support cannot enter limit impulse path');
    assert(adapter.supportContinuity.rejectedSamples >= 4, 'bad-layer fixture actually exercises rejection');
    ground.sampleRoadSurfaceForSupport = sample;
    const landed = adapter.step(dt, neutral, car);
    assert(WHEEL_IDS.every(id => landed.wheels[id].grounded), 'next tick can reacquire valid support');
    let samples = 0;
    ground.sampleRoadSurfaceForSupport = (x, z, hint) => {
      const real = sample(x, z, hint);
      return Math.floor(samples++ / 4) % 2 === 0 ? { ...real, height: hint.height + .65, reference: bad } : real;
    };
    adapter.step(dt, neutral, car);
    assert(car.chassisMotion.contactImpulses.every(v => v === 0), 'within-tick alternating bad layer creates no mechanical impulse');
    ground.sampleRoadSurfaceForSupport = sample;
    box.requestManualTrigger(); adapter.step(dt, neutral, car); box.freezeInterrupted('bad-candidate fixture complete');
    const trace = box.createExport();
    assert(trace.events.some(e => e.type === 'support-candidate-rejected'), 'Black Box records rejection');
    assert(!trace.events.some(e => e.type === 'support-surface-changed' && (e.detail as any).returnedToPreviousSurface),
      'rejected candidates never become support A-B-A');
    assert(car.chassisMotion.safetyInterventions === 0, 'rejection needs no safety recovery');
    fs.writeFileSync(`${dir}/bad-candidate-blackbox.json`, JSON.stringify(trace));
    return { rejectedSamples: adapter.supportContinuity.rejectedSamples, impulse: [...car.chassisMotion.contactImpulses],
      safety: car.chassisMotion.safetyInterventions };
  } finally { ground.dispose(); }
}

function localGeometryRegression() {
  const ground = new CityGround(local, { editor: true });
  let maxGap = 0, originalGap = 0, conflicts = 0, maxGrade = 0;
  try {
    for (let x = 2630; x >= 2550; x -= .5) for (let z = -153; z >= -171; z -= .5) {
      const query = ground.debugSurfaceCandidates(x, z, 7.5);
      const main = query.candidates.filter(c => c.roadId === 'ew-wb-split-4-split' && c.distance === 0);
      const ramp = query.candidates.filter(c => c.roadId === 'system-east:E-to-S-turbine' && c.distance === 0);
      for (const a of main) for (const b of ramp) { conflicts++; maxGap = Math.max(maxGap, Math.abs(a.height - b.height)); }
    }
    for (const road of local.roads) for (let i = 1; i < road.centerline.length; i++) {
      const a = road.centerline[i - 1], b = road.centerline[i];
      maxGrade = Math.max(maxGrade, Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z));
    }
    const oldGround = new CityGround(original, { editor: true });
    try {
      // Last valid FL location immediately before step 4382 loses the ramp edge.
      const query = oldGround.debugSurfaceCandidates(2601.9990234375, -158.87364196777344, 6.975581184041686);
      const contained = query.candidates.filter(c => c.distance === 0);
      originalGap = Math.max(...contained.map(c => c.height)) - Math.min(...contained.map(c => c.height));
    } finally { oldGround.dispose(); }
    assert(conflicts > 0 && originalGap > .64, `exact incident candidate pair is retained in original fixture (${conflicts}, ${originalGap})`);
    assert(maxGap < .04, `shared split pavement has continuous height (${maxGap})`);
    assert(maxGrade < .12, 'local ramp profile keeps recommended grade');
    return { coincidentSamples: conflicts, maxGap, originalGap, maxGrade };
  } finally { ground.dispose(); }
}

function drive(map: any, speed: number, name: string, protectedContact = true, ramp = false) {
  const ground = new CityGround(map, { editor: true });
  const car = new VehicleDynamics(config, { x: 2675, z: -159.625, yaw: Math.PI / 2,
    speed: speed / 3.6, driveSelector: 'N', engineRunning: false });
  // Surface regression deliberately excludes solid barriers: a barrier crossing
  // would obscure whether the road support itself is continuous.
  const adapter = new VehicleContactSystem(ground, config); adapter.collisionSystem.setColliders([]);
  adapter.synchronize(car);
  if (!protectedContact) adapter.supportContinuity.sample = (g, _id, x, z) => g.sampleRoadSurface(x, z);
  const box = new VehiclePhysicsBlackBox({ mapId: map.id, mapName: map.name, mapVersion: map.version,
    vehicleId: 'tesla-model-3-rwd', vehicleConfigVersion: 2, buildVersion: name });
  box.arm(); adapter.blackBox = box;
  const controls = createNeutralVehicleInputState();
  const rampRoad = map.roads.find((r: any) => r.id === 'system-east:E-to-S-turbine');
  const heightAtX = (points: any[], x: number, key: string) => {
    for (let i = 1; i < points.length; i++) if (points[i].x <= x) {
      const a = points[i - 1], b = points[i], t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
      return a[key] + t * (b[key] - a[key]);
    }
    return points.at(-1)[key];
  };
  let maxImpulse = 0, maxFz = 0, maxAY = 0, maxRollRate = 0, maxVY = 0;
  let steps = 0, invalidABA = 0, rampSeen = false, mainlineAfterRamp = 0, recovery = 0;
  let speedAtIncident: number | undefined;
  const history = WHEEL_IDS.map(() => ({ road: '', previous: '', height: 0, tick: 0 }));
  const observe = box.observeContacts.bind(box);
  box.observeContacts = (contacts, g) => {
    observe(contacts, g);
    WHEEL_IDS.forEach((id, i) => {
      const c = contacts[id], h = history[i]!, road = c.reference?.roadId ?? '';
      if (road !== h.road) {
        if (road === h.previous && steps - h.tick <= 3 && Math.abs(c.height - h.height) > .1) invalidABA++;
        h.previous = h.road; h.road = road; h.tick = steps;
      }
      h.height = c.height;
    });
  };
  const recover = car as unknown as { resolvePenetration(): boolean };
  const resolve = recover.resolvePenetration.bind(car);
  recover.resolvePenetration = () => { const y = car.chassisY; const result = resolve(); recovery += Math.abs(car.chassisY - y); return result; };
  let state = car.getSnapshot();
  try {
    for (; steps < 1800 && state.x > (ramp ? 2570 : 2540); steps++) {
      // Prescribed longitudinal boundary for the contact regression, so the
      // three named speeds cross the incident at that speed rather than coast
      // down on the approach. Heave, roll, pitch and contact forces remain free.
      if (!ramp) car.speed = speed / 3.6;
      if (ramp && state.x < 2640) {
        const look = 8, targetZ = heightAtX(rampRoad.centerline, state.x - look, 'z');
        const desired = Math.atan2(look, -(targetZ - state.z));
        const error = Math.atan2(Math.sin(desired - state.yaw), Math.cos(desired - state.yaw));
        controls.steering = Math.max(-1, Math.min(1, -error * 2.5 + state.yawRate * .4));
      }
      if (state.x < (ramp ? 2572 : 2542) && box.recording) box.requestManualTrigger();
      state = adapter.step(dt, controls, car);
      if (speedAtIncident === undefined && state.x <= 2603.16) speedAtIncident = state.speed * 3.6;
      maxImpulse = Math.max(maxImpulse, ...car.chassisMotion.contactImpulses);
      maxFz = Math.max(maxFz, ...WHEEL_IDS.map(id => state.wheels[id].normalLoad));
      maxAY = Math.max(maxAY, Math.abs(state.chassis.verticalAcceleration));
      maxRollRate = Math.max(maxRollRate, Math.abs(state.chassis.rollAngularVelocity ?? 0));
      maxVY = Math.max(maxVY, Math.abs(state.chassis.verticalVelocity));
      if (state.x < 2580) {
        const roads = WHEEL_IDS.map(id => adapter.wheelContacts![id].reference?.roadId);
        if (roads.every(id => id === rampRoad.id)) rampSeen = true;
        if (rampSeen && roads.some(id => id !== rampRoad.id)) mainlineAfterRamp++;
      }
      if (car.chassisMotion.safetyInterventions > 0 && !protectedContact) break;
    }
    if (box.status !== 'FROZEN') {
      box.requestManualTrigger(); adapter.step(dt, controls, car); box.freezeInterrupted('targeted route complete');
    }
    const trace = box.createExport();
    fs.writeFileSync(`${dir}/${name}-blackbox.json`, JSON.stringify(trace));
    const summary = { name, speed, prescribedLongitudinalSpeed: !ramp, speedAtIncident,
      steps, x: state.x, z: state.z, maxImpulse, maxFz, maxAY,
      maxRollRate, maxVY, safety: car.chassisMotion.safetyInterventions,
      recovery, invalidABA, rejectedSamples: adapter.supportContinuity.rejectedSamples, rampSeen, mainlineAfterRamp };
    console.log(JSON.stringify(summary)); return summary;
  } finally { ground.dispose(); }
}

const baselineOnly = process.argv.includes('--baseline');
if (baselineOnly) {
  const rows = [80, 120, 140].map(speed => drive(original, speed, `before-${speed}`, false));
  fs.writeFileSync(`${dir}/before-summary.json`, JSON.stringify(rows, null, 2));
} else if (process.argv.includes('--geometry-only')) {
  console.log(localGeometryRegression());
} else if (process.argv.includes('--ramp-only')) {
  drive(local, 80, 'ramp-80', true, true);
} else {
  const rows = [80, 120, 140].map(speed => drive(local, speed, `after-${speed}`));
  rows.push(drive(original, 140, 'original-map-protected-140'));
  rows.push(drive(local, 80, 'ramp-80', true, true));
  for (const row of rows) {
    assert(row.x < (row.name === 'ramp-80' ? 2570 : 2540), `${row.name}: traverse complete`);
    assert(row.invalidABA === 0, `${row.name}: no large A-B-A`);
    assert(row.safety === 0 && row.recovery === 0, `${row.name}: no safety recovery`);
    assert(row.maxImpulse < 1000 && row.maxFz < 50000 && row.maxVY < 2 && row.maxRollRate < 1, `${row.name}: bounded physical support`);
    if (row.prescribedLongitudinalSpeed) assert(Math.abs(row.speedAtIncident! - row.speed) < .2, `${row.name}: specified speed at incident`);
  }
  assert(rows.at(-1)!.rampSeen && rows.at(-1)!.mainlineAfterRamp === 0, 'legitimate ramp transition remains available');
  const badCandidate = badCandidateRegression(), geometry = localGeometryRegression();
  const validation = validateMap(local);
  assert(validation.valid, `local map: ${JSON.stringify(validation.errors)}`);
  const targeted = process.argv.includes('--overlap-only') ? undefined : {
    wheelContact: runWheelContactSelfTest(), vertical: runVerticalDynamicsSelfTest(), suspension: runSuspensionMechanicsSelfTest() };
  const result = { assertions, rows, badCandidate, geometry, validation, targeted };
  fs.writeFileSync(`${dir}/validation.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ assertions, validation: { errors: validation.errorCount, warnings: validation.warningCount },
    targeted: targeted ? { wheelContact: targeted.wheelContact.assertions, vertical: targeted.vertical.assertions,
      suspension: targeted.suspension.assertions } : undefined }));
}
