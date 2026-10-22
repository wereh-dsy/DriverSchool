import fs from 'node:fs';
import { createBMW530LiPhysicsConfig } from '../src/vehicle/config/bmw530LiPhysicsConfig';
import { createExecutiveSedanPhysicsConfig } from '../src/vehicle/config/executiveSedanPhysicsConfig';
import { createMercedesE300LPhysicsConfig } from '../src/vehicle/config/mercedesE300LPhysicsConfig';
import { createTeslaModel3PhysicsConfig } from '../src/vehicle/config/teslaModel3PhysicsConfig';
import { createTaycan4SPhysicsConfig } from '../src/vehicle/config/taycan4SPhysicsConfig';
import { createRoadSUVPhysicsConfig } from '../src/vehicle/config/roadSUVPhysicsConfig';
import type { VehicleChassisConfig } from '../src/vehicle/config';
import type { Powertrain } from '../src/vehicle/powertrain/Powertrain';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { VehicleDynamics, type VehicleEnvironment } from '../src/vehicle/physics/VehicleDynamics';
import { WHEEL_IDS, sampleWheelContacts, createWheelContactBuffer } from '../src/vehicle/physics/WheelContact';
import { WheelSupportContinuity } from '../src/vehicle/physics/WheelSupportContinuity';
import { sampleGroundGeometry, surfaceResponseAliases, SURFACE_MATERIALS } from '../src/world/SurfaceMaterial';
import { VehiclePhysicsBlackBox } from '../src/vehicle/diagnostics/VehiclePhysicsBlackBox';

const fleet = process.argv.includes('--fleet');
const dir = fleet ? 'artifacts/fleet-calibration' : 'artifacts/vehicle-physics-p0-p1'; fs.mkdirSync(dir, { recursive: true });
const factories = { bmw: createBMW530LiPhysicsConfig, audi: createExecutiveSedanPhysicsConfig,
  mercedes: createMercedesE300LPhysicsConfig, tesla: createTeslaModel3PhysicsConfig, taycan: createTaycan4SPhysicsConfig,
  touareg: createRoadSUVPhysicsConfig };
const masses = { bmw: [44, 46], audi: [48, 46], mercedes: [47, 49], tesla: [43, 46], taycan: [55, 58], touareg: [58, 60] };
type Car = keyof typeof factories;
type Scenario = 'A-static' | 'B-acceleration' | 'C-braking' | 'D-steer' | 'E-rough' | 'F-bump' | 'G-grade' | 'H-landing'
  | 'I-single-wheel' | 'J-crossfall' | 'K-crest';
const scenarios: Scenario[] = ['A-static', 'B-acceleration', 'C-braking', 'D-steer', 'E-rough', 'F-bump', 'G-grade', 'H-landing'];
if (fleet) scenarios.push('I-single-wheel', 'J-crossfall', 'K-crest');
const baselineConfigs = fleet ? undefined : JSON.parse(fs.readFileSync(`${dir}/baseline-configs.json`, 'utf8')) as Record<Car, VehicleChassisConfig>;
const baselineResults = fs.existsSync(`${dir}/baseline.json`) ? JSON.parse(fs.readFileSync(`${dir}/baseline.json`, 'utf8')) : undefined;
const baseline = process.argv.includes('--baseline'), probe = process.argv.includes('--probe'), sweep = process.argv.includes('--sweep');
const refine = process.argv.includes('--refine');
const radialRefine = process.argv.includes('--radial-refine');
const selection = process.argv.find(v => v.startsWith('--car='))?.slice(6) as Car | undefined;
const dt = 1 / 120;

function run(config: VehicleChassisConfig, name: Scenario, exportBox = false) {
  const rough = name === 'E-rough', bump = name === 'F-bump', grade = name === 'G-grade', landing = name === 'H-landing';
  const single = name === 'I-single-wheel', crossfall = name === 'J-crossfall', crest = name === 'K-crest';
  const accel = name === 'B-acceleration', brake = name === 'C-braking', steer = name === 'D-steer';
  const prescribed = rough || bump || grade || single || crossfall || crest;
  const speed = prescribed ? 60 / 3.6 : brake ? 20 : steer ? 15 : accel ? 4 : 0;
  const height = (x: number, z: number) => {
    const s = -z;
    if (rough) return .004 * Math.sin(2 * Math.PI * s / 2.7) + .002 * Math.sin(2 * Math.PI * s / .92 + x * .65) +
      .001 * Math.sin(2 * Math.PI * s / .43 + x * 1.1);
    if (bump && s > 20 && s < 21.5) return .025 * Math.sin(Math.PI * (s - 20) / 1.5) ** 2;
    if (single && x < 0 && s > 20 && s < 21.5) return .025 * Math.sin(Math.PI * (s - 20) / 1.5) ** 2;
    if (crossfall) return x * .03;
    if (crest) return s > 0 && s < 80 ? 1.2 * Math.sin(Math.PI * s / 80) ** 2 : 0;
    if (grade) return s <= 0 ? 0 : s >= 80 ? 1.2 : .6 * (1 - Math.cos(Math.PI * s / 80));
    return 0;
  };
  let mapQueries = 0, passes = 0, rejects = 0;
  const ground = { sampleRoadSurface: (x: number, z: number) => { mapQueries++;
    return { ...sampleGroundGeometry(height, x, z), ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt) }; } };
  const car = new VehicleDynamics<Powertrain>(config, { speed, driveSelector: accel || brake ? 'D' : 'N',
    engineRunning: accel || brake, gear: 1 });
  let contacts = sampleWheelContacts(ground, car.getSnapshot(), config);
  car.syncWheelContacts(contacts);
  const continuity = new WheelSupportContinuity(); continuity.seed(contacts);
  const buffer = createWheelContactBuffer(), pose = { x: 0, z: 0, yaw: 0, wheels: {
    frontLeft: { worldPosition: { x: 0, z: 0 } }, frontRight: { worldPosition: { x: 0, z: 0 } },
    rearLeft: { worldPosition: { x: 0, z: 0 } }, rearRight: { worldPosition: { x: 0, z: 0 } } } };
  let measured = false;
  const box = exportBox ? new VehiclePhysicsBlackBox({ mapId: 'scripted-calibration', mapName: name,
    mapVersion: 1, vehicleId: 'porsche-taycan-4s', vehicleConfigVersion: 3, buildVersion: 'p0-p1' }) : undefined;
  box?.arm();
  const sample: NonNullable<VehicleEnvironment['sampleVerticalContacts']> = (x, z, yaw, _y, geometry, dimensions) => {
    pose.x = x; pose.z = z; pose.yaw = yaw;
    for (const id of WHEEL_IDS) pose.wheels[id].worldPosition = geometry.wheels[id].wheelCenterWorld;
    continuity.prepare(geometry, config.wheelRadius); passes++;
    const result = sampleWheelContacts(ground, pose, dimensions, 0, 1, buffer, continuity);
    for (const id of WHEEL_IDS) if (measured && result[id].supportValid === false) rejects++;
    if (box) box.observeContacts(result, ground as never); return result;
  };
  const grounded = [true, true, true, true], bumped = [false, false, false, false];
  let transitions = 0, fullBump = 0, minGrounded = 4, maxImpulse = 0, totalImpulse = 0, recovery = 0;
  car.chassisMotion.diagnosticObserver = (_m, frame) => {
    let count = 0;
    for (let i = 0; i < 4; i++) {
      const c = frame.wheels[WHEEL_IDS[i]!]!, b = c.suspensionLength <= c.minSuspensionLength + .001;
      if (c.grounded) count++;
      if (measured) { if (c.grounded !== grounded[i]) transitions++; if (b && !bumped[i]) fullBump++; }
      grounded[i] = c.grounded; bumped[i] = b;
    }
    if (measured) minGrounded = Math.min(minGrounded, count);
  };
  car.diagnosticRecoveryObserver = () => { if (measured) recovery++; };
  let sumAY2 = 0, peakAY = 0, pitchRate = 0, rollRate = 0, peakPitch = 0, peakRoll = 0, peakHubVelocity = 0,
    hubVelocity2 = 0, peakHubAcceleration = 0, peakTyreCompression = 0, n = 0, maxRestVelocity = 0,
    peakAcceleration = 0, peakLateralAcceleration = 0, peakFrontFz = 0, minFrontFz = Infinity,
    frontSquat = 0, rearSquat = 0, settleStart = -1, settlingTime: number | null = null, releaseDone = false;
  let frontLoadTransfer = 0, rearLoadTransfer = 0, peakTyreForce = 0, landingContactTime: number | null = null,
    landingNormalImpulse = 0, wasAirborne = false;
  const fzSum = [0, 0, 0, 0], fz2 = [0, 0, 0, 0];
  const controls = createNeutralVehicleInputState();
  let state = car.getSnapshot();
  const duration = grade || crest ? 8 : rough ? 4 : landing ? 5 : 4;
  for (let tick = 0; tick < duration / dt; tick++) {
    const t = tick * dt;
    if (prescribed) { car.x = 0; car.z = -speed * t; car.yaw = 0; car.speed = speed; car.lateralVelocity = car.yawRate = 0; }
    if (landing && t >= 1 && !releaseDone) { car.chassisY += .18; car.verticalVelocity = 0; releaseDone = true; }
    controls.throttle = accel && t > .5 ? .65 : 0;
    controls.brake = brake && t > .5 ? .65 : 0;
    controls.steering = steer && t > .7 ? .16 : 0;
    measured = t >= (landing ? .9 : .5);
    continuity.beginStep(); box?.beginStep(dt);
    if (tick >= duration / dt - 2) box?.requestManualTrigger();
    state = car.stepFixed(dt, controls, { wheelContacts: contacts, sampleVerticalContacts: sample }); contacts = buffer;
    if (box) box.capture(state, controls, contacts, car.suspension.getVerticalSnapshot(), car.chassisMotion, ground as never);
    if (!measured) continue;
    n++; sumAY2 += state.chassis.verticalAcceleration ** 2;
    peakAY = Math.max(peakAY, Math.abs(state.chassis.verticalAcceleration));
    pitchRate = Math.max(pitchRate, Math.abs(state.chassis.pitchAngularVelocity ?? 0));
    rollRate = Math.max(rollRate, Math.abs(state.chassis.rollAngularVelocity ?? 0));
    peakPitch = Math.max(peakPitch, Math.abs(state.chassis.pitch)); peakRoll = Math.max(peakRoll, Math.abs(state.chassis.roll));
    peakAcceleration = Math.max(peakAcceleration, Math.abs(state.acceleration));
    peakLateralAcceleration = Math.max(peakLateralAcceleration, Math.abs(state.lateralAcceleration));
    maxRestVelocity = Math.max(maxRestVelocity, Math.abs(state.chassis.verticalVelocity));
    let hub2 = 0, hubMax = 0;
    for (let i = 0; i < 4; i++) {
      const w = state.wheels[WHEEL_IDS[i]!]!, g = w.geometry!;
      const v = g.unsprungVelocity ?? 0;
      hub2 += v * v; hubMax = Math.max(hubMax, Math.abs(v));
      peakHubAcceleration = Math.max(peakHubAcceleration, Math.abs(g.unsprungAcceleration ?? 0));
      peakTyreCompression = Math.max(peakTyreCompression, g.tyreCompression ?? 0);
      peakTyreForce = Math.max(peakTyreForce, w.normalLoad);
      fzSum[i]! += w.normalLoad; fz2[i]! += w.normalLoad ** 2;
      if (!Number.isFinite(w.normalLoad + v + state.chassis.chassisY) || w.normalLoad < 0) throw new Error('invalid physical state');
      if (!w.grounded && w.normalLoad !== 0) throw new Error('airborne tyre force');
    }
    hubVelocity2 += hub2 / 4; peakHubVelocity = Math.max(peakHubVelocity, hubMax);
    const front = state.wheels.frontLeft.normalLoad + state.wheels.frontRight.normalLoad;
    const rear = state.wheels.rearLeft.normalLoad + state.wheels.rearRight.normalLoad;
    frontLoadTransfer = Math.max(frontLoadTransfer, Math.abs(state.wheels.frontLeft.normalLoad - state.wheels.frontRight.normalLoad));
    rearLoadTransfer = Math.max(rearLoadTransfer, Math.abs(state.wheels.rearLeft.normalLoad - state.wheels.rearRight.normalLoad));
    if (landing) {
      if (front + rear === 0) wasAirborne = true;
      if (wasAirborne && front + rear > 0 && landingContactTime === null) landingContactTime = t;
      if (landingContactTime !== null && t - landingContactTime < .3) landingNormalImpulse += (front + rear) * dt;
    }
    peakFrontFz = Math.max(peakFrontFz, front); minFrontFz = Math.min(minFrontFz, front);
    frontSquat = Math.max(frontSquat, Math.abs(state.wheels.frontLeft.suspensionCompression - state.wheels.frontLeft.suspensionRestCompression));
    rearSquat = Math.max(rearSquat, Math.abs(state.wheels.rearLeft.suspensionCompression - state.wheels.rearLeft.suspensionRestCompression));
    maxImpulse = Math.max(maxImpulse, ...car.chassisMotion.contactImpulses);
    totalImpulse += car.chassisMotion.contactImpulses.reduce((a, b) => a + b, 0);
    const endInput = bump || single ? 21.5 / speed : landing ? 1.7 : Infinity;
    if (t > endInput) {
      if (Math.abs(state.chassis.verticalVelocity) < .01 && Math.abs(state.chassis.pitchAngularVelocity ?? 0) < .01 && hubMax < .025) {
        if (settleStart < 0) settleStart = t;
        if (t - settleStart >= .35 && settlingTime === null) settlingTime = settleStart - endInput;
      } else settleStart = -1;
    }
  }
  if (box) { box.freezeInterrupted('scripted calibration completed'); fs.writeFileSync(`${dir}/taycan-rough-blackbox.json`, JSON.stringify(box.createExport())); }
  const means = fzSum.map(v => v / n), fzCv = means.map((v, i) => Math.sqrt(Math.max(0, fz2[i]! / n - v * v)) / Math.max(1, v));
  return { duration, samples: n, rmsAY: Math.sqrt(sumAY2 / n), peakAY, pitchRate, rollRate, peakPitch, peakRoll,
    finalPitch: state.chassis.pitch, finalRoll: state.chassis.roll, finalY: state.chassis.chassisY, finalSpeed: state.speed,
    effectiveMass: state.effectiveVehicleMass,
    finalVerticalVelocity: state.chassis.verticalVelocity, loadedRideHeight: config.suspension.rideHeight + state.chassis.chassisY,
    peakAcceleration, peakLateralAcceleration, frontFzMean: means[0]! + means[1]!, rearFzMean: means[2]! + means[3]!,
    frontFzPeak: peakFrontFz, frontFzMin: minFrontFz, frontSquat, rearSquat, fzCv, wheelHopRms: Math.sqrt(hubVelocity2 / n),
    peakHubVelocity, peakHubAcceleration, peakTyreCompression, settlingTime, maxRestVelocity,
    frontLoadTransfer, rearLoadTransfer, peakTyreForce, landingContactTime, landingNormalImpulse,
    minGrounded, transitions, fullBump, rejections: rejects, maxImpulse, totalImpulse,
    safety: car.chassisMotion.safetyInterventions, recovery, mapQueries, contactPasses: passes,
    finalSuspensionCompression: WHEEL_IDS.map(id => state.wheels[id].suspensionCompression),
    finalFz: WHEEL_IDS.map(id => state.wheels[id].normalLoad),
    finalTravel: WHEEL_IDS.map(id => { const g = state.wheels[id].geometry!;
      return { bump: g.suspensionLength - g.minSuspensionLength, rebound: g.maxSuspensionLength - g.suspensionLength }; }),
    finalTyreCompression: WHEEL_IDS.map(id => state.wheels[id].geometry!.tyreCompression),
    finalControl: { throttle: controls.throttle, brake: controls.brake, steering: controls.steering } };
}

// Fleet-only observations fill the pedal/brake/low-grip gaps in the vertical scenes above.
// No driver robot, performance target fitting, or historical artifact replacement.
function longitudinal(config: VehicleChassisConfig) {
  const observations: Record<string, unknown>[] = [];
  const pedals = [.05, .1, .2, .5, 1];
  for (const scenario of ['pedal', 'creep', 'brake', 'launch', 'split-brake', 'low-grip', 'motorway', 'corner', 'limit', 'lift'] as const) {
    for (const pedal of scenario === 'pedal' || scenario === 'brake' || scenario === 'creep' ? pedals : [1]) {
      const braking = scenario === 'brake' || scenario === 'split-brake';
      const launching = scenario === 'launch' || scenario === 'low-grip';
      const speed = launching || scenario === 'creep' ? 0 : braking ? 100 / 3.6 : scenario === 'motorway' ? 35
        : scenario === 'corner' || scenario === 'limit' ? 20 : 10;
      const car = new VehicleDynamics<Powertrain>(config, { speed, driveSelector: 'D', gear: launching || scenario === 'creep' ? 1 : 3, engineRunning: true });
      const contacts = createWheelContactBuffer();
      if (scenario === 'split-brake' || scenario === 'low-grip') for (const id of WHEEL_IDS) {
        const mu = scenario === 'low-grip' || id.endsWith('Left') ? .35 : 1;
        Object.assign(contacts[id], { friction: mu, longitudinalGrip: mu, lateralGrip: mu });
      }
      const input = createNeutralVehicleInputState();
      input.throttle = scenario === 'pedal' || scenario === 'creep' ? pedal : launching ? 1 : 0;
      input.brake = braking ? pedal : 0;
      input.steering = scenario === 'motorway' ? .035 : scenario === 'corner' ? .08 : scenario === 'limit' ? .5 : 0;
      const duration = launching ? 18 : braking ? 7 : 4;
      let distance = 0, zeroTo100: number | null = null, stoppingDistance: number | null = null;
      let maxAcceleration = 0, meanAcceleration = 0, n = 0, abs = 0, tcs = 0, esc = 0, maxBeta = 0, maxYaw = 0;
      let maxFactorDelta = 0, previousFactor = 1, shiftCount = 0, previousGear: unknown = 1;
      let maxRegen = 0, maxPower = 0, peakRoll = 0, maxRearSplitDelta = 0, previousRearSplit: number | undefined;
      let regenAbsViolations = 0, maxGripUsage = 0;
      let last = car.getSnapshot();
      for (let tick = 0; tick < duration / dt; tick++) {
        const s = car.stepFixed(dt, input, { wheelContacts: contacts }); last = s;
        distance += Math.abs(s.speed) * dt;
        if (!Number.isFinite(s.speed + s.yawRate + s.chassis.chassisY + s.chassis.verticalVelocity) || s.recoveredFromInvalidState)
          throw new Error(`${scenario}: invalid state`);
        if (s.speedKmh >= 100 && zeroTo100 === null) zeroTo100 = (tick + 1) * dt;
        if (braking && s.speed < .1 && stoppingDistance === null) stoppingDistance = distance;
        if (s.transmission.currentPhysicalGear !== previousGear) shiftCount++;
        previousGear = s.transmission.currentPhysicalGear;
        maxAcceleration = Math.max(maxAcceleration, Math.abs(s.acceleration));
        maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(s.lateralVelocity, Math.max(1, Math.abs(s.speed)))));
        maxYaw = Math.max(maxYaw, Math.abs(s.yawRate)); peakRoll = Math.max(peakRoll, Math.abs(s.chassis.roll));
        const a = car.vehicleControl.getSnapshot();
        const ev = s.powertrain.ev;
        if (ev && ((a.absActiveWheels.slice(0, 2).some(Boolean) && (ev.frontMotorTorque ?? 0) < -.001) ||
          (a.absActiveWheels.slice(2).some(Boolean) && (ev.rearMotorTorque ?? 0) < -.001))) regenAbsViolations++;
        maxGripUsage = Math.max(maxGripUsage, ...WHEEL_IDS.map(id => s.wheels[id].gripUsage));
        if (tick > 60) { abs += +a.absActive; tcs += +a.tcsActive; esc += +a.escActive; }
        maxFactorDelta = Math.max(maxFactorDelta, Math.abs(a.engineTorqueFactor - previousFactor)); previousFactor = a.engineTorqueFactor;
        const rearSplit = car.vehicleControl.awd?.rearAxleTorqueRatio;
        if (rearSplit !== undefined && previousRearSplit !== undefined) maxRearSplitDelta = Math.max(maxRearSplitDelta, Math.abs(rearSplit - previousRearSplit));
        previousRearSplit = rearSplit;
        maxRegen = Math.max(maxRegen, s.powertrain.ev?.regenerativeBrakeTorque ?? 0);
        maxPower = Math.max(maxPower, s.powertrain.ev?.drivePowerKw ?? 0);
        if (tick > 120 && tick < 360) { meanAcceleration += s.acceleration; n++; }
        if (launching && zeroTo100 !== null || braking && stoppingDistance !== null) break;
      }
      observations.push({ scenario, pedal, mappedPedal: car.driverThrottleCommand(pedal), meanAcceleration: meanAcceleration / Math.max(1, n),
        maxAcceleration, finalSpeedKmh: last.speedKmh, zeroTo100, stoppingDistance, absTicks: abs, tcsTicks: tcs, escTicks: esc,
        maxBeta, maxYaw, peakRoll, maxFactorDelta, maxRearSplitDelta, shiftCount, maxRegen, maxPower, regenAbsViolations, maxGripUsage });
    }
  }
  return observations;
}

const results: Record<string, unknown> = {};
let assertions = 0;
const failures: string[] = [];
function assert(ok: boolean, message: string) {
  assertions++;
  if (!ok) { if (fleet) failures.push(message); else throw new Error(message); }
}
for (const id of Object.keys(factories) as Car[]) {
  if (!fleet && id === 'touareg') continue;
  if (selection && selection !== id) continue;
  const config: VehicleChassisConfig = !fleet && (baseline || probe || sweep) ? structuredClone(baselineConfigs![id]) : factories[id]();
  if ((probe || sweep) && !baseline) config.suspension.unsprungMass = { front: masses[id][0]!, rear: masses[id][1]! };
  if (sweep) {
    const candidates = [];
    if (refine) config.tires.verticalCompliance = { stiffness: ({ bmw: 280000, audi: 300000, mercedes: 270000,
      tesla: 320000, taycan: 280000, touareg: 280000 })[id], damping: 1200, maximumCompression: .055 };
    if (radialRefine) config.tires.verticalCompliance = { stiffness: ({ bmw: 220000, audi: 240000, mercedes: 200000,
      tesla: 240000, taycan: 200000, touareg: 260000 })[id], damping: 2400, maximumCompression: .055 };
    for (const scale of radialRefine ? [.75, .85] : refine ? [.55, .65, .75] : [.65, .85, 1]) {
      const c = structuredClone(config);
      c.suspension.damperCompressionFront *= scale; c.suspension.damperCompressionRear *= scale;
      c.suspension.damperReboundFront *= scale; c.suspension.damperReboundRear *= scale;
      const e = run(c, 'E-rough'), f = run(c, 'F-bump'), h = run(c, 'H-landing');
      candidates.push({ scale, rough: e, bump: f, landing: h });
      console.log(JSON.stringify({ id, scale, rmsAY: e.rmsAY, peakAY: e.peakAY, settling: f.settlingTime,
        landingPeak: h.peakAY, transitions: e.transitions, safety: h.safety, recovery: h.recovery }));
    }
    fs.writeFileSync(`${dir}/${radialRefine ? 'radial-refine' : refine ? 'refine' : 'sweep'}-${id}.json`, JSON.stringify(candidates, null, 2)); continue;
  }
  const metrics: Record<string, ReturnType<typeof run>> = {};
  for (const scenario of scenarios) metrics[scenario] = run(config, scenario, !baseline && !probe && id === 'taycan' && scenario === 'E-rough');
  const driving = fleet ? longitudinal(config) : undefined;
  if (!baseline && !probe) {
    const a = metrics['A-static']!, b = metrics['B-acceleration']!, c = metrics['C-braking']!, d = metrics['D-steer']!,
      e = metrics['E-rough']!, f = metrics['F-bump']!, g = metrics['G-grade']!, h = metrics['H-landing']!;
    for (const [name, m] of Object.entries(metrics)) {
      assert(m.safety === 0 && m.recovery === 0 && m.rejections === 0, `${id}/${name}: no safety/recovery/rejection`);
      assert(m.mapQueries === (m.contactPasses + 1) * 4, `${id}/${name}: exactly four queries per pass`);
    }
    assert(Math.abs(a.finalY) < .004 && Math.abs(a.finalVerticalVelocity) < 1e-5 && a.transitions === 0, `${id}: stable static ride`);
    assert(b.peakAcceleration > 1 && b.peakPitch > .001 && b.frontFzMin < a.frontFzMean * .99, `${id}: acceleration squat/load transfer`);
    assert(c.peakAcceleration > 3 && c.peakPitch > .001 && c.frontFzPeak > a.frontFzMean * 1.02, `${id}: brake dive/load transfer`);
    assert(d.peakLateralAcceleration > 1 && d.peakRoll > .001 && d.frontLoadTransfer > 100 && d.rearLoadTransfer > 100,
      `${id}: step steer rolls and redistributes axle loads`);
    assert(e.transitions === 0 && e.fullBump === 0 && e.maxImpulse === 0, `${id}: rough contact remains continuous`);
    const old = baselineResults?.vehicles[id]?.metrics;
    if (!fleet) {
      assert(!!old && e.rmsAY < old['E-rough'].rmsAY && e.peakAY < old['E-rough'].peakAY, `${id}: rough chassis response improves`);
      assert(Math.abs(a.finalY - old['A-static'].finalY) < .001, `${id}: static datum retained within 1 mm`);
    } else {
      assert(e.rmsAY < 1.5 && e.peakAY < 5, `${id}: bounded rough-road response`);
      assert(Math.abs(a.finalFz.reduce((a, b) => a + b, 0) - a.effectiveMass * config.gravity) < a.effectiveMass * config.gravity * .005,
        `${id}: static tyre loads balance weight`);
      assert(a.finalTravel.every(t => t.bump > .035 && t.rebound > .035), `${id}: usable static bump/rebound travel`);
      assert(metrics['I-single-wheel']!.settlingTime !== null && metrics['I-single-wheel']!.settlingTime! < 1.2,
        `${id}: single-wheel bump settles`);
      assert(Math.abs(metrics['J-crossfall']!.finalRoll) > .02 && Math.abs(metrics['J-crossfall']!.finalRoll) < .04,
        `${id}: chassis follows crossfall`);
      assert(Math.abs(metrics['K-crest']!.finalY) < .004 && metrics['K-crest']!.peakPitch > .02,
        `${id}: crest and grade-bottom recovery`);
      for (const d of driving!) {
        assert(d.regenAbsViolations === 0 && (d.maxGripUsage as number) <= 1.001, `${id}/${d.scenario}/${d.pedal}: ABS regen authority and combined tyre budget`);
        assert((d.maxRearSplitDelta as number) <= .65 * dt + 1e-8, `${id}/${d.scenario}: bounded AWD allocation rate`);
        if ((d.scenario === 'pedal' && (d.pedal as number) <= .5) || d.scenario === 'motorway' || d.scenario === 'corner')
          assert(d.tcsTicks === 0 && d.escTicks === 0, `${id}/${d.scenario}/${d.pedal}: no ordinary driving false intervention`);
      }
    }
    assert(f.settlingTime !== null && f.settlingTime < 1 && f.maxImpulse === 0, `${id}: small bump settles without limit impulse`);
    assert(Math.abs(g.finalY - 1.2) < .004 && g.peakPitch > .020 && g.peakPitch < .027, `${id}: long grade retained`);
    assert(h.minGrounded === 0 && h.transitions === 8 && h.settlingTime !== null && h.settlingTime < 2 && h.maxImpulse === 0,
      `${id}: one takeoff/landing per wheel, bounded settling`);
  }
  const vehicleIds = { bmw: 'bmw-530li-g38', audi: 'executive-lwb-2t', mercedes: 'mercedes-e300l-v214',
    tesla: 'tesla-model-3-rwd', taycan: 'porsche-taycan-4s', touareg: 'road-suv-v6-8at' };
  results[id] = { vehicleId: vehicleIds[id], parameters: { mass: config.mass, frontWeightBias: config.frontWeightBias,
    centerOfMassHeight: config.centerOfMassHeight, suspension: config.suspension, tyreRadial: config.tires.verticalCompliance },
    calibration: config, metrics, driving, baselineMetrics: !baseline ? baselineResults?.vehicles[id]?.metrics : undefined };
  console.log(JSON.stringify(fleet ? { id, phase: baseline ? 'baseline' : 'final', roughRms: metrics['E-rough']!.rmsAY,
    driving } : { id, phase: baseline ? 'baseline' : probe ? 'probe' : 'final', metrics }));
}
if (!sweep) fs.writeFileSync(`${dir}/${baseline ? 'baseline' : probe ? 'probe' : 'calibration-results'}.json`, JSON.stringify({
  assertions, failures,
  methodology: '120 Hz production VehicleDynamics/contact continuity. B/C/D use real throttle/brake/steering. E/F/G prescribe only planar 60 km/h. H releases body from +0.18 m; vertical dynamics always integrated.',
  vehicles: results }, null, 2));
if (!baseline && !probe && !sweep) {
  console.log(JSON.stringify({ assertions, failures, result: failures.length ? 'failed' : 'passed' }));
  if (failures.length) throw new Error(`${failures.length} fleet checks failed; see ${dir}/calibration-results.json`);
}
