import fs from 'node:fs';
import { MountainProvingGround } from '../src/world/mountain/MountainProvingGround';
import { createTaycan4SPhysicsConfig } from '../src/vehicle/config/taycan4SPhysicsConfig';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { VehicleDynamics, type VehicleEnvironment } from '../src/vehicle/physics/VehicleDynamics';
import { VehiclePhysicsBlackBox } from '../src/vehicle/diagnostics/VehiclePhysicsBlackBox';
import { WheelSupportContinuity } from '../src/vehicle/physics/WheelSupportContinuity';
import { createWheelContactBuffer, sampleWheelContacts, WHEEL_IDS } from '../src/vehicle/physics/WheelContact';

const dir = process.env.MOUNTAIN_CONTACT_ARTIFACT_DIR ?? 'artifacts/mountain-rough-contact-fix'; fs.mkdirSync(dir, { recursive: true });
const phase = process.argv[2] ?? 'contact-only', legacy = phase === 'before';
const ground = new MountainProvingGround({ shadows: false, props: false });
const query = legacy ? { sampleRoadSurface: ground.sampleRoadSurface.bind(ground),
  sampleRoadSurfaceForSupport: (x: number, z: number) => ground.sampleRoadSurface(x, z) } : ground;
const config = createTaycan4SPhysicsConfig(), dt = 1 / 120, speed = 60 / 3.6;
if (phase === 'massless-baseline' || phase === 'unsprung-probe' || phase === 'unsprung-sweep') Object.assign(config,
  JSON.parse(fs.readFileSync('artifacts/vehicle-physics-p0-p1/baseline-configs.json', 'utf8')).taycan);
if (phase === 'unsprung-probe' || phase === 'unsprung-sweep') config.suspension.unsprungMass = { front: 55, rear: 58 };
if (phase === 'before' || phase === 'contact-only') config.tires.verticalCompliance = undefined;

function traverse(name: string, startS: number, endS: number) {
  const start = ground.route.main.point(startS), yaw = Math.atan2(-start.tx, -start.tz);
  const car = new VehicleDynamics(config, { x: start.x, z: start.z, yaw, speed, driveSelector: 'N' });
  let contacts = sampleWheelContacts(ground, car.getSnapshot(), config);
  car.syncWheelContacts(contacts);
  car.verticalVelocity = ground.sampleRoadSurface(start.x, start.z, { x: start.tx, y: start.tz }).grade * speed;
  const continuity = new WheelSupportContinuity(); continuity.seed(contacts);
  const buffer = createWheelContactBuffer(), pose = { x: 0, z: 0, yaw: 0, wheels: {
    frontLeft: { worldPosition: { x: 0, z: 0 } }, frontRight: { worldPosition: { x: 0, z: 0 } },
    rearLeft: { worldPosition: { x: 0, z: 0 } }, rearRight: { worldPosition: { x: 0, z: 0 } } } };
  const box = new VehiclePhysicsBlackBox({ mapId: ground.metadata.id, mapName: ground.metadata.displayName,
    mapVersion: 1, vehicleId: 'porsche-taycan-4s', vehicleConfigVersion: 2, buildVersion: phase }); box.arm();
  const controls = createNeutralVehicleInputState();
  let sumAY2 = 0, peakAY = 0, pitchRate = 0, rollRate = 0, fullBump = 0, transitions = 0,
    samples = 0, maxImpulse = 0, totalImpulse = 0, recovery = 0;
  let measured = false;
  let mapQueries = 0, contactPasses = 0;
  const measuredQuery = { sampleRoadSurface: (x: number, z: number) => { mapQueries++; return query.sampleRoadSurface(x, z); },
    ...(legacy ? { sampleRoadSurfaceForSupport: (x: number, z: number) => { mapQueries++; return ground.sampleRoadSurface(x, z); } } : {}) };
  const grounded = WHEEL_IDS.map(id => car.getSnapshot().wheels[id].grounded === true), bumped = [false, false, false, false];
  const reasons: Record<string, number> = {};
  const sample: NonNullable<VehicleEnvironment['sampleVerticalContacts']> = (x, z, y, _chassisY, geometry, dimensions) => {
    pose.x = x; pose.z = z; pose.yaw = y;
    for (const id of WHEEL_IDS) pose.wheels[id].worldPosition = geometry.wheels[id].wheelCenterWorld;
    continuity.prepare(geometry, config.wheelRadius);
    contactPasses++;
    const result = sampleWheelContacts(measuredQuery, pose, dimensions, 0, 1, buffer, continuity);
    for (const id of WHEEL_IDS) if (measured && result[id].supportValid === false) {
      const reason = result[id].rejectionReason ?? 'unknown'; reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    box.observeContacts(result, ground); return result;
  };
  car.chassisMotion.diagnosticObserver = (_m, frame) => {
    WHEEL_IDS.forEach((id, i) => {
      const c = frame.wheels[id], bump = c.grounded && c.suspensionLength <= c.minSuspensionLength + .001;
      if (measured) { if (bump && !bumped[i]) fullBump++; if (c.grounded !== grounded[i]) transitions++; }
      grounded[i] = c.grounded; bumped[i] = bump;
    });
  };
  car.chassisMotion.safetyObserver = box.observeSafety;
  car.diagnosticRecoveryObserver = (kind, dynamics, correction) => { if (measured) recovery++; box.observeRecovery(kind, dynamics, correction); };
  const rows: unknown[] = [];
  for (let s = startS; s < endS; s += speed * dt) {
    const p = ground.route.main.point(s);
    // Only planar motion is prescribed. Real terrain queries, suspension,
    // heave/pitch/roll, mechanical contacts and tyre loads remain production code.
    car.x = p.x; car.z = p.z; car.yaw = Math.atan2(-p.tx, -p.tz);
    car.speed = speed; car.lateralVelocity = 0; car.yawRate = 0;
    measured = s >= startS + 10;
    continuity.beginStep(); box.beginStep(dt);
    if (endS - s < speed * dt * 2 && box.recording) box.requestManualTrigger();
    const state = car.stepFixed(dt, controls, { wheelContacts: contacts, sampleVerticalContacts: sample }); contacts = buffer;
    box.capture(state, controls, contacts, car.suspension.getVerticalSnapshot(), car.chassisMotion, ground);
    if (measured) {
      samples++; sumAY2 += state.chassis.verticalAcceleration ** 2;
      peakAY = Math.max(peakAY, Math.abs(state.chassis.verticalAcceleration));
      pitchRate = Math.max(pitchRate, Math.abs(state.chassis.pitchAngularVelocity ?? 0));
      rollRate = Math.max(rollRate, Math.abs(state.chassis.rollAngularVelocity ?? 0));
      maxImpulse = Math.max(maxImpulse, ...car.chassisMotion.contactImpulses);
      totalImpulse += car.chassisMotion.contactImpulses.reduce((a, b) => a + b, 0);
      rows.push({ s, x: state.x, z: state.z, aY: state.chassis.verticalAcceleration,
        pitchRate: state.chassis.pitchAngularVelocity, rollRate: state.chassis.rollAngularVelocity,
        impulse: [...car.chassisMotion.contactImpulses], grounded: WHEEL_IDS.map(id => state.wheels[id].grounded) });
    }
  }
  box.freezeInterrupted('short Mountain segment complete');
  if (phase !== 'unsprung-sweep') {
    fs.writeFileSync(`${dir}/${phase}-${name}-blackbox.json`, JSON.stringify(box.createExport()));
    fs.writeFileSync(`${dir}/${phase}-${name}-samples.json`, JSON.stringify(rows));
  }
  const result = { name, phase, startS, endS, speedKmh: 60, samples, mapQueries, contactPasses, rmsAY: Math.sqrt(sumAY2 / samples),
    peakAY, pitchRate, rollRate, fullBump, transitions, rejections: Object.values(reasons).reduce((a, b) => a + b, 0),
    reasons, maxImpulse, totalImpulse, safety: car.chassisMotion.safetyInterventions, recovery };
  console.log(JSON.stringify(result)); return result;
}

try {
  const broken = ground.route.main.section('broken-dirt');
  if (phase === 'unsprung-sweep') {
    const results = [];
    const base = { ...config.suspension };
    const refinement = process.argv.includes('--refine');
    for (const stiffness of refinement ? [200000, 240000] : [280000, 400000])
      for (const damping of refinement ? [1200, 2400] : [800, 1200]) for (const scale of refinement ? [.7, .8] : [.6, .8, 1]) {
      config.tires.verticalCompliance = { stiffness, damping, maximumCompression: .055 };
      config.suspension.damperCompressionFront = base.damperCompressionFront * scale;
      config.suspension.damperCompressionRear = base.damperCompressionRear * scale;
      config.suspension.damperReboundFront = base.damperReboundFront * scale;
      config.suspension.damperReboundRear = base.damperReboundRear * scale;
      results.push({ stiffness, damping, scale, ...traverse('rough', broken.start + 390, broken.start + 465) });
    }
    fs.writeFileSync(`${dir}/${refinement ? 'refined' : 'coarse'}-sweep.json`, JSON.stringify(results, null, 2));
    process.exitCode = 0;
  } else {
  const rows = [traverse('rough', broken.start + 390, broken.start + 465), traverse('smooth', 150, 225)];
  fs.writeFileSync(`${dir}/${phase}-summary.json`, JSON.stringify(rows, null, 2));
  if (phase === 'after' || phase === 'calibrated') {
    const before = JSON.parse(fs.readFileSync(`${dir}/${phase === 'calibrated' ? 'massless-baseline' : 'before'}-summary.json`, 'utf8'));
    const rough = rows[0]!, smooth = rows[1]!;
    if (!(rough.rmsAY < before[0].rmsAY * .95 && rough.peakAY < before[0].peakAY * .95 &&
      rough.pitchRate < before[0].pitchRate && rough.rollRate < before[0].rollRate)) throw new Error('rough-road response must improve');
    if (!(smooth.rmsAY < .1 && smooth.peakAY < .1)) throw new Error('smooth road must remain quiet');
    for (const row of rows) if (!(row.transitions === 0 && row.rejections === 0 && row.safety === 0 && row.maxImpulse === 0 &&
      row.recovery === 0 && row.mapQueries === row.contactPasses * 4)) throw new Error('contact must remain stable with four map queries per pass');
    const trace = JSON.parse(fs.readFileSync(`${dir}/${phase}-rough-blackbox.json`, 'utf8'));
    if (!trace.frames.every((f: any) => f.wheels.every((w: any) => Number.isFinite(w.tyreCompressionVelocity) &&
      w.tyreCompression >= 0 && w.tyreCompression <= config.tires.verticalCompliance!.maximumCompression && w.Fz >= 0 && w.effectiveRadius > 0)))
      throw new Error('radial telemetry must remain finite, bounded and unilateral');
    if (phase === 'calibrated' && !trace.frames.every((f: any) => f.wheels.every((w: any) =>
      Number.isFinite(w.unsprungPosition + w.unsprungVelocity + w.unsprungAcceleration) && w.unsprungMass > 0 && w.tyreNormalForce === w.Fz)))
      throw new Error('unsprung telemetry must remain finite with one Fz');
    console.log('Mountain rough/smooth response, unilateral radial telemetry and query-count assertions passed.');
  }
  }
} finally { ground.dispose(); }
