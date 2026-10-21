import { createTaycan4SPhysicsConfig } from '../config/taycan4SPhysicsConfig';
import { createBMW530LiPhysicsConfig } from '../config/bmw530LiPhysicsConfig';
import { createExecutiveSedanPhysicsConfig } from '../config/executiveSedanPhysicsConfig';
import { createMercedesE300LPhysicsConfig } from '../config/mercedesE300LPhysicsConfig';
import { createTeslaModel3PhysicsConfig } from '../config/teslaModel3PhysicsConfig';
import { VehicleDynamics } from './VehicleDynamics';
import type { Powertrain } from '../powertrain/Powertrain';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { sampleWheelContacts, WHEEL_IDS } from './WheelContact';
import { surfaceResponseAliases, SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import { sprungMass } from './UnsprungWheelDynamics';
import { VehiclePhysicsBlackBox } from '../diagnostics/VehiclePhysicsBlackBox';
import { Vector2, Vector3 } from 'three';

export function runUnsprungWheelDynamicsSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(message); };
  const dt = 1 / 120, neutral = createNeutralVehicleInputState();
  const ground = { sampleRoadSurface: () => ({ height: 0, normal: new Vector3(0, 1, 0),
    gradient: new Vector2(0, 0), grade: 0,
    ...surfaceResponseAliases(SURFACE_MATERIALS.asphalt) }) };
  const rest = [];
  for (const factory of [createBMW530LiPhysicsConfig, createExecutiveSedanPhysicsConfig,
    createMercedesE300LPhysicsConfig, createTeslaModel3PhysicsConfig, createTaycan4SPhysicsConfig]) {
    const config = factory(), car = new VehicleDynamics<Powertrain>(config, { driveSelector: 'N', engineRunning: false });
    const contacts = sampleWheelContacts(ground, car.getSnapshot(), config); car.syncWheelContacts(contacts);
    let state = car.getSnapshot(), maxY = 0;
    for (let i = 0; i < 480; i++) {
      state = car.stepFixed(dt, neutral, { wheelContacts: contacts });
      maxY = Math.max(maxY, Math.abs(state.chassis.chassisY));
      assert(state.chassis.groundedWheels === 4 && car.chassisMotion.safetyInterventions === 0, 'quiet supported rest');
    }
    const frame = car.suspension.getVerticalSnapshot();
    const fz = WHEEL_IDS.reduce((sum, id) => sum + frame.wheels[id].normalLoad, 0);
    const masslessConfig = structuredClone(config); masslessConfig.suspension.unsprungMass = undefined;
    const reference = new VehicleDynamics<Powertrain>(masslessConfig, { driveSelector: 'N', engineRunning: false });
    reference.syncWheelContacts(contacts);
    let referenceMaxY = 0;
    for (let i = 0; i < 480; i++) {
      reference.stepFixed(dt, neutral, { wheelContacts: contacts });
      referenceMaxY = Math.max(referenceMaxY, Math.abs(reference.chassisY));
    }
    // Fuel is added to authored curb mass at startup. Compare that real load
    // transient against the same massless tyre reference, then test equilibrium.
    assert(maxY <= referenceMaxY + .0005 && Math.abs(state.chassis.chassisY - reference.chassisY) < .001,
      `hub model preserves loaded ride datum and fuel transient: ${maxY}, ${referenceMaxY}`);
    assert(Math.abs(state.chassis.chassisY) < .004 && Math.abs(state.chassis.verticalVelocity) < 1e-5,
      'loaded equilibrium within 4 mm, with no residual rest motion');
    assert(Math.abs(fz - car.effectiveVehicleMass * config.gravity) < 1, 'one tyre Fz supports total vehicle mass');
    for (const id of WHEEL_IDS) {
      const c = frame.wheels[id];
      assert(c.tyreNormalForce === c.normalLoad && c.unsprungMass > 0, 'single normal load, configurable hub mass');
      assert(Math.abs(c.unsprungVelocity) < 1e-5 && Math.abs(c.unsprungAcceleration) < .001, 'no wheel hop at rest');
      assert(Math.abs(c.tyreNormalForce - config.tires.verticalCompliance!.stiffness * c.tyreCompression!) < .1,
        'static tyre force agrees with radial compression, including variable fuel mass');
      const before = c.unsprungPosition;
      car.suspension.refreshVerticalGeometry({ chassisY: car.chassisY, verticalVelocity: 0, contacts });
      assert(c.unsprungPosition === before, 'geometry preview does not advance hub');
    }
    rest.push({ mass: config.mass, sprungMass: sprungMass(config), y: state.chassis.chassisY, fz, maxY });
  }
  // Symmetric, level fixture: total vertical momentum exposes duplicated tyre
  // forces or a missing opposite spring / droop-stop reaction immediately.
  const config = createTaycan4SPhysicsConfig(); config.frontWeightBias = .5;
  config.suspension.unsprungMass = { front: 50, rear: 50 };
  config.suspension.springRateRear = config.suspension.springRateFront;
  config.suspension.damperCompressionRear = config.suspension.damperCompressionFront;
  config.suspension.damperReboundRear = config.suspension.damperReboundFront;
  const fixture = (offset: number) => {
    const car = new VehicleDynamics<Powertrain>(config, { driveSelector: 'N' });
    const contacts = sampleWheelContacts(ground, car.getSnapshot(), config); car.syncWheelContacts(contacts);
    car.chassisY += offset;
    return { car, contacts };
  };
  const momentum = (car: VehicleDynamics<Powertrain>) => config.mass * car.verticalVelocity -
    WHEEL_IDS.reduce((sum, id) => sum + 50 * car.suspension.getVerticalSnapshot().wheels[id].unsprungVelocity, 0);
  let maximumMomentumResidual = 0;
  for (const offset of [-.005, -.04, .3]) {
    const { car, contacts } = fixture(offset);
    for (let tick = 0; tick < 18; tick++) {
      const previous = momentum(car);
      car.stepFixed(dt, neutral, { wheelContacts: contacts });
      const frame = car.suspension.getVerticalSnapshot();
      const roadForce = WHEEL_IDS.reduce((sum, id) => sum + frame.wheels[id].tyreNormalForce, 0);
      const residual = Math.abs(momentum(car) - previous - dt * (roadForce - config.mass * config.gravity));
      maximumMomentumResidual = Math.max(maximumMomentumResidual, residual);
      assert(residual < 1e-7, `wheel/body force pairs conserve momentum (${residual})`);
      for (const id of WHEEL_IDS) {
        const c = frame.wheels[id], n = c.surfaceNormal, p = c.wheelCenterWorld, road = c.surfacePoint;
        const actualCompression = config.wheelRadius + config.mass * config.gravity / 4 / config.tires.verticalCompliance!.stiffness -
          ((p.x - road.x) * n.x + (p.y - road.y) * n.y + (p.z - road.z) * n.z);
        assert(actualCompression <= config.tires.verticalCompliance!.maximumCompression + 1e-8,
          'finite radial stop bounds geometric closure, not only telemetry');
      }
      if (offset > 0) assert(roadForce === 0, 'airborne tyre cannot pull or push ground');
    }
  }
  const { car, contacts } = fixture(0);
  const rejected = Object.fromEntries(WHEEL_IDS.map(id => [id, { ...contacts[id], height: .65, supportValid: false }])) as typeof contacts;
  for (let i = 0; i < 12; i++) car.stepFixed(dt, neutral, { wheelContacts: rejected });
  assert(WHEEL_IDS.every(id => car.suspension.getVerticalSnapshot().wheels[id].tyreNormalForce === 0), 'rejected +0.65 m plane never enters hub tyre force');
  assert(car.chassisMotion.contactImpulses.every(v => v === 0) && car.chassisMotion.safetyInterventions === 0,
    'rejected plane never enters mechanical or safety path');
  const invalid = createTaycan4SPhysicsConfig(); invalid.suspension.unsprungMass!.front = -1;
  let rejectedConfig = false;
  try { new VehicleDynamics<Powertrain>(invalid); } catch { rejectedConfig = true; }
  assert(rejectedConfig, 'invalid hub mass fails at configuration boundary');
  const convergence = [];
  for (const microsteps of [2, 4] as const) {
    const { car, contacts } = fixture(.18);
    let peakAY = 0;
    for (let i = 0; i < 360; i++) {
      car.stepFixed(dt, neutral, { wheelContacts: contacts, contactMicrosteps: microsteps });
      peakAY = Math.max(peakAY, Math.abs(car.verticalAcceleration));
    }
    convergence.push({ microsteps, peakAY, y: car.chassisY, velocity: car.verticalVelocity });
  }
  assert(Math.abs(convergence[0]!.y - convergence[1]!.y) < .002 &&
    Math.abs(convergence[0]!.velocity - convergence[1]!.velocity) < .01, '2/4 microstep landing converges to same loaded datum');
  assert(Math.max(convergence[0]!.peakAY, convergence[1]!.peakAY) /
    Math.min(convergence[0]!.peakAY, convergence[1]!.peakAY) < 1.35,
    `landing peak is not microstep-dependent explosion: ${JSON.stringify(convergence)}`);
  const box = new VehiclePhysicsBlackBox({ mapId: 'unsprung-test', mapName: 'flat', mapVersion: 1,
    vehicleId: 'test', vehicleConfigVersion: 3, buildVersion: 'targeted' });
  box.arm(); box.beginStep(dt); box.requestManualTrigger();
  const telemetry = fixture(0);
  const snapshot = telemetry.car.stepFixed(dt, neutral, { wheelContacts: telemetry.contacts });
  box.capture(snapshot, neutral, telemetry.contacts, telemetry.car.suspension.getVerticalSnapshot(), telemetry.car.chassisMotion, ground as never);
  box.freezeInterrupted('targeted telemetry');
  const trace = box.createExport();
  for (const wheel of trace.frames[0]!.wheels as Record<string, unknown>[]) {
    for (const field of ['unsprungPosition', 'unsprungVelocity', 'unsprungAcceleration', 'unsprungMass',
      'tyreNormalForce', 'tyreCompression', 'tyreCompressionVelocity', 'effectiveRadius'])
      assert(typeof wheel[field] === 'number' && Number.isFinite(wheel[field]), `Black Box exports ${field}`);
    assert(wheel.Fz === wheel.tyreNormalForce, 'Black Box retains one Fz');
  }
  return { assertions, maximumMomentumResidual, rest, convergence };
}
