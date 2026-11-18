import { createTank500Hi4TPhysicsConfig } from './config/tank500Hi4TPhysicsConfig';
import { P2HybridPowertrain } from './powertrain/P2HybridPowertrain';
import { HybridBattery } from './powertrain/HybridBattery';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import type { PowertrainUpdateContext } from './powertrain/Powertrain';
import { createVehiclePhysicsConfig, getVehicleDescriptor } from './VehicleCatalog';
import { validateVehiclePlatformConfig } from './config/validateVehiclePlatformConfig';
import { SURFACE_MATERIALS } from '../world/SurfaceMaterial';
import { createWheelContactBuffer, WHEEL_IDS } from './physics/WheelContact';
import { buildTank500Exterior, buildTank500Wheels } from './visual/Tank500Exterior';
import * as T from 'three';
import { VehicleFeedbackSystem } from './feedback/VehicleFeedbackSystem';

export function runP2HybridSelfTest() {
  const dt = 1 / 120, input = createNeutralVehicleInputState();
  let assertions = 0;
  function check(ok: boolean, label: string) { assertions++; if (!ok) throw new Error(`P2 hybrid: ${label}`); }
  const results: Record<string, unknown> = {};
  function car(soc = .75, speed = 0) {
    return new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { stateOfCharge: soc, speed, driveSelector: 'D' });
  }
  function shaft(p: P2HybridPowertrain, seconds: number, overrides: Partial<PowertrainUpdateContext> = {}) {
    const c: PowertrainUpdateContext = { dt, throttle: .55, brake: 0, vehicleSpeed: 16, vehicleLateralSpeed: 0,
      drivenWheelAngularVelocity: 16 / p.config.wheelRadius, torqueLimitFactor: 1, clutchPedal: 0,
      drivenWheelInertia: 40, drivenWheelReactionTorque: 1500, ...overrides };
    for (let i = 0; i < seconds / dt; i++) { p.prepare(c); p.update(c); p.finishStep(c.vehicleSpeed); }
    return p.getSnapshot();
  }

  // 1. Real chassis EV launch, speed, cruise; motor must remain ahead of the HAT.
  const ev = car(); ev.powertrain.setHybridMode('EV'); let evFuel = 0;
  for (let i = 0; i < 1200; i++) {
    const s = ev.stepFixed(dt, { ...input, throttle: i < 600 ? .6 : .18 });
    evFuel += s.powertrain.ice!.fuel.currentFuelFlowLPerHour * dt / 3600;
    check(!s.engineRunning && s.powertrain.hybrid!.clutchEngagement === 0, 'EV engine remains stopped and physically disconnected');
  }
  check(ev.speed > 8 && ev.powertrain.battery.stateOfCharge < .75 && evFuel === 0, 'EV launch/cruise consume pack without fuel');
  results.ev = { speed: ev.speed, soc: ev.powertrain.battery.stateOfCharge, fuelL: evFuel };
  check(ev.requestEngineToggle() === 'stopped' && !ev.powertrain.vehicleOperational, 'I toggles READY off while the ICE is already stopped');
  check(ev.requestEngineToggle() === 'started' && ev.powertrain.vehicleOperational, 'I restores READY without forcing combustion');

  // 2/3/4. Low SOC takeover, both sources, and power/torque ceilings at the same shaft speed.
  const low = car(.14); low.powertrain.setHybridMode('EV');
  let maxClutch = 0;
  for (let i = 0; i < 1800; i++) { const s = low.stepFixed(dt, { ...input, throttle: .6 }); maxClutch = Math.max(maxClutch, s.clutchEngagement); }
  check(low.powertrain.engine.isRunning && maxClutch > .5 && low.speed > 5, 'low SOC starts and couples ICE during EV request');
  check(low.powertrain.fuel.getSnapshot().fuelUsedL > 0, 'takeover burns measured fuel');
  results.lowSOC = { speed: low.speed, rpm: low.powertrain.engine.currentRPM, clutch: maxClutch, soc: low.powertrain.battery.stateOfCharge };
  for (const mode of ['HYBRID', 'SPORT'] as const) {
    const p = new P2HybridPowertrain(createTank500Hi4TPhysicsConfig()); p.reset({ driveSelector: 'D', gear: 4 }); p.setHybridMode(mode);
    const s = shaft(p, 10, { throttle: .85 });
    check(s.hybrid.enginePowerW > 1000 && s.hybrid.motorPowerW > 1000, `${mode} combines actual engine/motor work: ${JSON.stringify(s.hybrid)}`);
    check(s.availableDriveTorque <= 750.001 && s.hybrid.wheelPowerW <= 300001, `${mode} system envelopes`);
    results[mode] = s.hybrid;
  }

  // 5. Stationary generation in N and moving hold use crank load + existing fuel losses.
  const charge = new P2HybridPowertrain(createTank500Hi4TPhysicsConfig());
  charge.reset({ driveSelector: 'N', ev: { stateOfCharge: .4 } }); charge.setHybridMode('CHARGE');
  const chargeEnergy = charge.battery.remainingEnergyKWh;
  const charged = shaft(charge, 60, { throttle: 0, vehicleSpeed: 0, drivenWheelAngularVelocity: 0, drivenWheelReactionTorque: 0 });
  check(charge.battery.remainingEnergyKWh > chargeEnergy, 'engine generator restores actual stored energy');
  check(charged.hybrid.generationPowerW > 1000 && charged.ice.fuel.fuelUsedL > .01, 'generation incurs engine work and fuel');
  check(charged.hybrid.wheelPowerW === 0, 'neutral generation cannot drive wheels');
  const fuelJ = charged.ice.fuel.fuelUsedL * charge.config.fuel.fuelDensity * 43200000;
  check((charge.battery.remainingEnergyKWh - chargeEnergy) * 3600000 < fuelJ * .4, 'fuel to stored electricity obeys thermal efficiency ceiling');
  results.charge = { gainedKWh: charge.battery.remainingEnergyKWh - chargeEnergy, fuelL: charged.ice.fuel.fuelUsedL, generatorW: charged.hybrid.generationPowerW };
  const hold = new P2HybridPowertrain(createTank500Hi4TPhysicsConfig());
  hold.reset({ driveSelector: 'D', gear: 5, ev: { stateOfCharge: .45 } }); hold.setHybridMode('CHARGE_HOLD', .5);
  const holdStart = hold.battery.remainingEnergyKWh, hs = shaft(hold, 30, { throttle: .1 });
  check(hs.hybrid.engineRequested && hold.battery.remainingEnergyKWh >= holdStart, 'hold below target loads ICE and recovers SOC under light load');

  // 6. AC and DC coulomb/energy integration, no SOC assignment during charging.
  for (const type of ['AC', 'DC'] as const) {
    const h = createTank500Hi4TPhysicsConfig().hybrid, b = new HybridBattery(h); b.initializeSOC(.4);
    const start = b.remainingEnergyKWh; b.connect(type);
    for (let i = 0; i < 600; i++) b.step(1, 0, 0, true);
    const gain = b.remainingEnergyKWh - start;
    const efficiency = type === 'AC' ? h.charging.acEfficiency : h.charging.dcEfficiency;
    check(gain > 0 && gain < b.gridEnergyKWh * efficiency, `${type} charger + battery losses are physical`);
    check(Math.abs(b.gridEnergyKWh - (type === 'AC' ? 6600 : 50000) * 600 / 3600000) < .001, `${type} input power * time`);
    check(b.gridEnergyKWh - gain - b.chargerLossKWh > 0, `${type} battery loss accounted`);
    const prior = b.remainingEnergyKWh; b.step(1, 0, 1, false); check(b.remainingEnergyKWh === prior, 'driving/unsafe charge inhibited');
    results[`plug${type}`] = { gainKWh: gain, inputKWh: b.gridEnergyKWh };
  }
  const plugged = new P2HybridPowertrain(createTank500Hi4TPhysicsConfig()); plugged.reset({ driveSelector: 'P', vehicleOperational: false });
  check(plugged.connectCharger('AC') && !plugged.requestStart(), 'connector interlocks READY');
  shaft(plugged, 2, { vehicleSpeed: 0, throttle: 1, drivenWheelAngularVelocity: 0 });
  check(plugged.getSnapshot().availableDriveTorque === 0 && plugged.battery.getSnapshot().gridPowerW > 0, 'charger funds energy while propulsion inhibited');

  // 7. Same-step ABS release must reduce motor output before electrical integration.
  const regen = new P2HybridPowertrain(createTank500Hi4TPhysicsConfig()); regen.reset({ driveSelector: 'D', gear: 4 }); regen.setHybridMode('EV');
  shaft(regen, 1, { throttle: 0, brake: .4, totalServiceBrakeTorque: 4000 });
  check(regen.getSnapshot().ev.regenerativeBrakeTorque > 100 && regen.getSnapshot().ev.regenerativeBrakeTorque <= 4000, 'motor regen bounded by service brake request');
  const rc: PowertrainUpdateContext = { dt, throttle: 0, brake: .6, totalServiceBrakeTorque: 6000,
    vehicleSpeed: 16, vehicleLateralSpeed: 0, drivenWheelAngularVelocity: 16 / .386, torqueLimitFactor: 1, clutchPedal: 0 };
  regen.prepare(rc); regen.update(rc); regen.limitAxleRegeneration(0, 5000);
  check(regen.axleOutput.drivenWheelTorque === 0 && regen.motor.deliveredDriveTorque === 0, 'either mechanical branch ABS release cancels common motor');
  const beforeABS = regen.battery.remainingEnergyKWh; regen.finishStep(16);
  check(regen.battery.remainingEnergyKWh <= beforeABS, 'cancelled regen cannot restore energy');
  // Steady shaft audit includes gear/transfer, inverter/motor and pack losses.
  const audit = new P2HybridPowertrain(createTank500Hi4TPhysicsConfig()); audit.reset({ driveSelector: 'D', gear: 4 }); audit.setHybridMode('EV');
  for (const brakingMode of [false, true]) {
    const s = shaft(audit, 2, { throttle: brakingMode ? 0 : .4, brake: brakingMode ? .4 : 0, totalServiceBrakeTorque: brakingMode ? 4000 : 0 });
    const h = s.hybrid, electrical = s.ev.batteryPowerKw * 1000;
    const residual = electrical - audit.config.hybrid.auxiliaryPower - h.wheelPowerW - h.electricalLossW - h.transmissionLossW;
    check(Math.abs(residual) < 1, `steady ${brakingMode ? 'regen' : 'drive'} energy closes at terminal/shaft/wheels: ${residual} W`);
    check(brakingMode ? -h.wheelPowerW > -h.motorPowerW && -h.motorPowerW > -electrical : electrical > h.motorPowerW && h.motorPowerW > h.wheelPowerW, 'every conversion dissipates, never creates energy');
    results[brakingMode ? 'regenEnergyResidualW' : 'driveEnergyResidualW'] = residual;
  }
  // Backdrive during an overlap must still pay for all generator work.
  audit.transmission.requestManualSelection(1);
  for (let i = 0; i < 90; i++) {
    const s = shaft(audit, dt, { throttle: 0, brake: .4, totalServiceBrakeTorque: 4000 });
    check(-s.hybrid.wheelPowerW + 1 >= -s.hybrid.motorPowerW, 'overlap regeneration never exceeds wheel mechanical work');
  }
  const braking = car(.75, 20); braking.powertrain.setHybridMode('EV'); let regenSamples = 0, hydraulicSamples = 0;
  for (let i = 0; i < 400; i++) { const s = braking.stepFixed(dt, { ...input, brake: .6 });
    if (s.powertrain.ev!.regenerativeBrakeTorque > 10) regenSamples++;
    if (Object.values(s.wheels).some(w => w.appliedBrakeTorque > 10)) hydraulicSamples++;
  }
  check(regenSamples > 0 && hydraulicSamples > 0 && braking.speed < 10, 'chassis blends motor and hydraulic braking through normal coordinator');
  results.braking = { regenSamples, hydraulicSamples, finalSpeed: braking.speed };

  // 8. Temperature/SOC output limitations.
  const thermal = new HybridBattery(createTank500Hi4TPhysicsConfig().hybrid), nominal = thermal.availableDischargePower, normalCharge = thermal.availableChargePower;
  thermal.thermal!.temperature = -15; check(thermal.availableDischargePower < nominal && thermal.availableChargePower < normalCharge * .15, 'cold pack limits both ports');
  thermal.thermal!.temperature = 65; check(thermal.availableDischargePower === 0 && thermal.availableChargePower === 0, 'hot pack safety cutoff');
  thermal.initializeSOC(1); check(thermal.availableChargePower === 0, 'full pack rejects charge/regen');
  thermal.initializeSOC(.02); check(thermal.availableDischargePower === 0, 'empty usable reserve cannot deliver motor power');

  // 9. Restart/synchronization and overlap: finite ramp, no duplicate torque during shifts.
  const shifting = car(); shifting.powertrain.setHybridMode('SPORT'); let shifts = 0, previous = 0, jump = 0;
  for (let i = 0; i < 2400; i++) {
    const s = shifting.stepFixed(dt, { ...input, throttle: .8 });
    if (s.transmission.shiftInProgress) { shifts++; const torque = Math.abs(shifting.powertrain.axleOutput.drivenWheelTorque); jump = Math.max(jump, Math.abs(torque - previous)); }
    previous = Math.abs(shifting.powertrain.axleOutput.drivenWheelTorque);
    check(!s.recoveredFromInvalidState && Number.isFinite(s.rpm), 'finite engine / gear / chassis integration');
    check(s.clutchEngagement >= 0 && s.clutchEngagement <= 1, 'bounded K0 actuator');
    check(s.powertrain.hybrid!.wheelPowerW <= 300001, 'no repeated engine torque after gear multiplication');
  }
  check(shifts > 0 && jump < 5000, `finite overlap without whole-drive interruption (${jump} Nm maximum step)`);
  results.shifts = { samples: shifts, maximumWheelTorqueStep: jump, speed: shifting.speed };

  // 10/11. Mechanical low range and real contacts: grade, mud/gravel/wet and split adhesion.
  const crawler = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'N', stateOfCharge: .14 });
  check(!crawler.powertrain.requestTransferMode('4L', 1, 1), 'low-range shift rejected while moving');
  check(crawler.powertrain.requestTransferMode('4L', 0, 1), 'stopped N/brake enables low reduction');
  check(crawler.requestDriveSelector('D', 1), 'select D after low range');
  for (let i = 0; i < 1800; i++) crawler.stepFixed(dt, { ...input, throttle: .45 }, { groundNormal: { x: 0, y: Math.cos(.16), z: Math.sin(.16) } });
  check(crawler.speed > .5 && crawler.powertrain.engine.isRunning && crawler.powertrain.transfer.ratio === 2.64, 'low SOC low-range climb physically propels chassis');
  check(crawler.getSnapshot().forces.gradeForce < 0 && crawler.speed < 12, 'verified uphill gravity and low-range propulsion-speed limit');
  results.climb = { speed: crawler.speed, soc: crawler.powertrain.battery.stateOfCharge, rpm: crawler.powertrain.engine.currentRPM };
  for (const surface of ['mud', 'gravel', 'wet-asphalt', 'sand'] as const) {
    const v = car(), contacts = createWheelContactBuffer();
    for (const id of WHEEL_IDS) Object.assign(contacts[id], SURFACE_MATERIALS[surface], { height: 0, supportValid: true });
    Object.assign(contacts.frontLeft, SURFACE_MATERIALS.ice);
    for (let i = 0; i < 900; i++) v.stepFixed(dt, { ...input, throttle: .45 }, { wheelContacts: contacts });
    check(v.speed > .1 && v.powertrain.numericallyValid, `${surface} / one-wheel low adhesion remains drivable`);
    check(v.config.tires.longitudinalGrip === .90, 'no surface or four-wheel mode grip inflation');
    results[surface] = { speed: v.speed, frontShare: v.powertrain.transfer.frontShare };
  }
  const cross = car(), contacts = createWheelContactBuffer();
  Object.assign(contacts.frontLeft, { supportValid: false }); Object.assign(contacts.rearRight, { supportValid: false });
  for (let i = 0; i < 600; i++) cross.stepFixed(dt, { ...input, throttle: .4 }, { wheelContacts: contacts });
  check(cross.powertrain.numericallyValid && !cross.getSnapshot().recoveredFromInvalidState, 'diagonal unsupported wheels remain numerically stable; no invented axle locks');

  // 12. Ten simulated minutes of demand (necessary sustained-load check, not a benchmark).
  const sustained = new P2HybridPowertrain(createTank500Hi4TPhysicsConfig()); sustained.reset({ driveSelector: 'D', gear: 6, ev: { stateOfCharge: .18 } }); sustained.setHybridMode('SPORT');
  const ls = shaft(sustained, 600, { throttle: .7, vehicleSpeed: 25, drivenWheelAngularVelocity: 25 / .386 });
  check(sustained.numericallyValid && ls.ice.engineRunning && ls.hybrid.battery.soc >= .02, 'sustained low SOC engine-supported operation');
  check(ls.hybrid.battery.temperatureC < 65 && ls.ice.thermal!.temperatureC < 135, 'battery/engine heat remains bounded');
  results.sustained = { soc: ls.hybrid.battery.soc, batteryTemperature: ls.hybrid.battery.temperatureC,
    motorTemperature: ls.ev.rearMotorTemperature, engineTemperature: ls.ice.thermal!.temperatureC, fuelL: ls.ice.fuel.fuelUsedL };

  // Normal EMS stop preserves READY and must not become an ICE stall event.
  const transitioning = car(); transitioning.powertrain.setHybridMode('SPORT');
  for (let i = 0; i < 720; i++) transitioning.stepFixed(dt, { ...input, throttle: .45 });
  check(transitioning.engine.isRunning, 'hybrid feedback fixture has running combustion');
  const feedback = new VehicleFeedbackSystem(); feedback.setVehicleConfig(transitioning.config); feedback.reset(transitioning.getSnapshot());
  transitioning.powertrain.setHybridMode('EV');
  let stoppedAutomatically = false;
  for (let i = 0; i < 240; i++) {
    const s = transitioning.stepFixed(dt, { ...input, throttle: .1 });
    check(!feedback.update(dt, s).hapticPulses.some(p => p.kind === 'stall'), 'EMS transition never emits a false stall pulse');
    if (!s.engineRunning) {
      stoppedAutomatically = true;
      check(s.automaticEngineStop === true && s.vehicleOperational && s.driveAvailable, 'source marks automatic stop while READY and propulsion remain available');
    }
  }
  check(stoppedAutomatically, 'engine actually stopped during EV transition');

  // Fleet sampling only, no full fleet suite.
  for (const id of ['mercedes-e300l-v214', 'tesla-model-3-rwd', 'porsche-taycan-4s', 'xiaomi-su7-max-2026'] as const) {
    const descriptor = getVehicleDescriptor(id), c = createVehiclePhysicsConfig(id); validateVehiclePlatformConfig(c, descriptor.visualConfig);
    const v = new VehicleDynamics(c as never, { driveSelector: 'D' });
    for (let i = 0; i < 600; i++) v.stepFixed(dt, { ...input, throttle: .4 });
    check(!v.getSnapshot().powertrain.hybrid && v.speed > 1 && !v.getSnapshot().recoveredFromInvalidState, `${id} keeps original powertrain and launches`);
    results[id] = { speed: v.speed, kind: v.getSnapshot().powertrain.kind };
  }
  const descriptor = getVehicleDescriptor('tank-500-hi4-t'); validateVehiclePlatformConfig(descriptor.physicsConfig, descriptor.visualConfig);
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  if (typeof document === 'undefined') Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_target, key) =>
      key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true }) }),
  } });
  try {
  const root = new T.Group(); buildTank500Exterior(root, descriptor.visualConfig); const wheels = buildTank500Wheels(root, descriptor.visualConfig);
  check(wheels.wheels.length === 4 && Object.keys(wheels.pivots).length === 4 && !!root.getObjectByName('Tank tailgate external spare tyre'), 'dedicated body / four wheels / spare');
  check(WHEEL_IDS.every(id => wheels.pivots[id].userData.wheelId === id && wheels.pivots[id].children[0] instanceof T.Mesh), 'cached wheel pivots preserve runtime binding metadata');
  const bounds = new T.Box3().setFromObject(root); check(bounds.max.z <= 2.539 + .02 && bounds.min.z >= -2.539 - .08, 'body and spare fit declared collision length');
  } finally { if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document'); }
  const detached = createVehiclePhysicsConfig('tank-500-hi4-t'); detached.hybrid!.battery.usableCapacityKWh = 1;
  check(createVehiclePhysicsConfig('tank-500-hi4-t').hybrid!.battery.usableCapacityKWh === 37.1, 'per-instance hybrid config isolated');

  return { assertions, results };
}
