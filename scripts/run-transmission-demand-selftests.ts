import { mkdirSync, writeFileSync } from 'node:fs';
import { createBMW530LiPhysicsConfig } from '../src/vehicle/config/bmw530LiPhysicsConfig';
import { createFerrari458PhysicsConfig, createTest6ATVehiclePhysicsConfig,
  createTest7DCTVehiclePhysicsConfig, createExecutiveSedanPhysicsConfig,
  createRoadSUVPhysicsConfig, createCVTSedanPhysicsConfig,
  type VehiclePhysicsConfig, type VehicleDriveMode, type ForwardGear } from '../src/vehicle/config';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { Engine } from '../src/vehicle/physics/Engine';
import { Gearbox } from '../src/vehicle/physics/Gearbox';
import { AutomaticShiftController } from '../src/vehicle/transmission/automatic/AutomaticShiftController';
import type { TransmissionContext } from '../src/vehicle/transmission/TransmissionSystem';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { runVehicleInputSystemSelfTest } from '../src/input/VehicleInputSystem.selftest';
import { runTransmissionBackendSelfTest, runTransmissionVehicleSelfTest,
  runTransmissionShiftSelfTest } from '../src/vehicle/transmission/Transmission.selftest';
import { runAutomaticSelectorInputSelfTest } from '../src/vehicle/transmission/AutomaticSelectorInput.selftest';
import { runCVTSelfTest } from '../src/vehicle/transmission/cvt/CVTTransmission.selftest';

const dt = 1 / 120;
let assertions = 0;
const failures: string[] = [];
function check(condition: boolean, message: string) {
  assertions++;
  if (!condition) failures.push(message);
}
type Factory = () => VehiclePhysicsConfig;
const vehicles: [string, Factory, VehicleDriveMode[]][] = [
  ['BMW530', createBMW530LiPhysicsConfig, ['ECO', 'NORMAL', 'SPORT']],
  ['Ferrari458', createFerrari458PhysicsConfig, ['SPORT', 'RACE']],
  ['Mazda6AT', createTest6ATVehiclePhysicsConfig, ['NORMAL']],
  ['Jetta7DCT', createTest7DCTVehiclePhysicsConfig, ['NORMAL']],
  ['A6L', createExecutiveSedanPhysicsConfig, ['ECO', 'NORMAL', 'SPORT']],
  ['Touareg', createRoadSUVPhysicsConfig, ['ECO', 'NORMAL', 'SPORT']],
  ['CVT', createCVTSedanPhysicsConfig, ['NORMAL']],
];
const runs: Record<string, unknown>[] = [];
const scheduleChecks: Record<string, unknown>[] = [];

for (const [vehicle, factory, modes] of vehicles) for (const mode of modes) {
  for (const scenario of ['light', 'medium', 'strong', 'WOT', 'kickdown', 'release', 'cruise']) {
    const config = factory();
    if (config.driveModes?.[mode]) config.defaultDriveMode = mode;
    const rolling = scenario === 'light' || scenario === 'kickdown';
    const initialGear: ForwardGear = scenario === 'light' ? 3 : 5;
    const initialSpeed = 20;
    const car = new VehicleDynamics(config, rolling ? { driveSelector: 'D', gear: initialGear, speed: initialSpeed,
      engineRPM: config.transmission.type === 'CVT' ? 1600 : initialSpeed / config.wheelRadius *
        config.transmission.finalDriveRatio * config.transmission.gearRatios[initialGear]! * 30 / Math.PI }
      : { driveSelector: 'D' });
    const input = createNeutralVehicleInputState();
    const events: Record<string, unknown>[] = [];
    const samples: Record<string, unknown>[] = [];
    const gearChanges: { time: number; from: number; to: number }[] = [];
    let previous = car.getSnapshot();
    let maxRPM = 0, highRPMHold = 0, longestHighRPMHold = 0, kickdown = false;
    let firstUpshiftRPM: number | null = null;
    let releaseGear = 0, finalGear = 0;
    let cruiseThrottle = .15;
    // Long enough to observe several gears and a settled light-pedal cruise.
    const duration = scenario === 'light' || scenario === 'cruise' ? 40 : 28;
    for (let frame = 0; frame < duration * 120; frame++) {
      const time = frame * dt;
      input.throttle = scenario === 'light' ? .15 : scenario === 'medium' ? .4
        : scenario === 'strong' ? .75 : scenario === 'WOT' ? 1
        : scenario === 'kickdown' ? (time < 16 ? .35 : .98)
        : scenario === 'release' ? (time < 16 ? .75 : 0) : cruiseThrottle;
      if (scenario === 'cruise') {
        // A test driver settles at 60 km/h through the normal pedal path.
        cruiseThrottle = Math.max(0, Math.min(.65, cruiseThrottle + (16.67 - previous.speed) * dt * .012));
        input.throttle = cruiseThrottle;
      }
      if (scenario === 'release' && frame === 16 * 120 && typeof previous.gear === 'number') releaseGear = previous.gear;
      const state = car.stepFixed(dt, input);
      const event = !previous.transmission.shiftInProgress && state.transmission.shiftInProgress;
      const sample = { time: +time.toFixed(3), gear: state.transmission.currentPhysicalGear,
        rpm: +state.rpm.toFixed(1), speedKmh: +state.speedKmh.toFixed(2), throttle: +input.throttle.toFixed(4),
        driverDemand: +car.driverThrottleCommand(input.throttle).toFixed(4), shiftEvent: event,
        kickdown: state.transmission.kickdown, targetRPM: state.transmission.cvt?.targetRPM };
      if (frame % 120 === 0) samples.push(sample);
      if (event) {
        events.push({ ...sample, rpmBeforeShift: previous.rpm, fromGear: previous.gear });
        if (firstUpshiftRPM === null && !state.transmission.kickdown) firstUpshiftRPM = previous.rpm;
      }
      if (state.gear !== previous.gear && typeof state.gear === 'number' && typeof previous.gear === 'number')
        gearChanges.push({ time, from: previous.gear, to: state.gear });
      if (state.transmission.kickdown && time >= 16) kickdown = true;
      maxRPM = Math.max(maxRPM, state.rpm);
      const gear = state.transmission.currentPhysicalGear;
      const highest = car.gearbox.getMaximumForwardGear();
      const ceiling = vehicle === 'Ferrari458' ? 6500 : mode === 'SPORT' ? 5500 : 4800;
      if (input.throttle <= .6 && gear !== null && gear < highest && state.rpm > ceiling &&
          !state.transmission.shiftInProgress) highRPMHold += dt;
      else highRPMHold = 0;
      longestHighRPMHold = Math.max(longestHighRPMHold, highRPMHold);
      if (!Number.isFinite(state.rpm) || !Number.isFinite(state.speed) || !state.engineRunning) {
        check(false, `${vehicle}/${mode}/${scenario}: finite running powertrain at ${time}`); break;
      }
      if (vehicle === 'CVT') {
        if (state.transmission.shiftInProgress || state.transmission.currentPhysicalGear !== null ||
            Math.abs(state.transmission.cvt!.ratio - previous.transmission.cvt!.ratio) > config.transmission.cvt!.ratioChangeRate * dt + 1e-8)
          check(false, `${vehicle}/${scenario}: continuous variator at ${time}`);
      }
      previous = state;
    }
    finalGear = typeof previous.gear === 'number' ? previous.gear : 0;
    const allowedLift = scenario === 'release' ? (config.transmission.dct?.shiftStrategy ??
      config.transmission.automatic?.shiftStrategy)?.liftHoldTime ?? 0 : 0;
    check(longestHighRPMHold < 1.5 + allowedLift, `${vehicle}/${mode}/${scenario}: moderate pedal high RPM hold ${longestHighRPMHold.toFixed(2)}s`);
    check(maxRPM <= config.engine.maxRPM, `${vehicle}/${mode}/${scenario}: configured engine ceiling`);
    if (vehicle === 'BMW530') check(maxRPM <= 6700, `BMW/${mode}/${scenario}: reasonable maximum ${maxRPM}`);
    if (['light', 'medium', 'strong', 'WOT', 'cruise'].includes(scenario)) {
      for (let i = 3; i < gearChanges.length; i++) {
        const a = gearChanges[i - 3]!, b = gearChanges[i - 2]!, c = gearChanges[i - 1]!, d = gearChanges[i]!;
        check(!(a.from === b.to && a.to === b.from && a.from === c.from && a.to === c.to &&
          a.from === d.to && a.to === d.from && d.time - a.time < 8), `${vehicle}/${mode}/${scenario}: repeated gear hunting`);
      }
      if (vehicle !== 'CVT') check(gearChanges.some(e => e.to > e.from), `${vehicle}/${mode}/${scenario}: automatic upshift`);
      if (scenario === 'WOT' && vehicle !== 'CVT')
        check(gearChanges.every(e => e.to > e.from), `${vehicle}/${mode}: WOT shifts do not reverse after an upshift`);
    }
    if (scenario === 'kickdown' && vehicle !== 'CVT') check(kickdown, `${vehicle}/${mode}: sudden kickdown`);
    if (scenario === 'release' && vehicle !== 'CVT') check(finalGear >= releaseGear, `${vehicle}/${mode}: release returns toward cruise gears`);
    if (vehicle === 'CVT' && scenario === 'medium') check(previous.transmission.cvt!.targetRPM < 2800, 'CVT moderate target remains economical');
    runs.push({ vehicle, mode, scenario, firstUpshiftRPM, maxRPM, longestHighRPMHold,
      finalGear, finalRPM: previous.rpm, finalSpeedKmh: previous.speedKmh, kickdown, events, samples });
  }
}

// Controller boundary cases isolate decisions from converter/clutch dynamics.
function fixture(factory: Factory, mode?: VehicleDriveMode, gear: ForwardGear = 3, rpm = 3000) {
  const config = factory();
  const strategy = config.driveModes?.[mode ?? 'NORMAL']?.shiftStrategy ??
    config.transmission.automatic?.shiftStrategy ?? config.transmission.dct!.shiftStrategy;
  const gearbox = new Gearbox(config.transmission); gearbox.setGear(gear);
  const engine = new Engine(config.engine);
  const controller = new AutomaticShiftController(strategy, gearbox, config.wheelRadius);
  const omega = rpm * Math.PI / 30;
  const wheelOmega = omega / gearbox.getRatio(gear) / config.transmission.finalDriveRatio;
  const context: TransmissionContext = { dt, engineAngularVelocity: omega, engineRPM: rpm, engineRunning: true,
    engineInertia: config.engine.engineInertia, idleRPM: config.engine.idleRPM, stallRPM: config.engine.stallRPM,
    redlineRPM: config.engine.redlineRPM, availableEngineTorque: engine.getTorqueAtRPM(rpm) * .4,
    engineTorqueAtRPM: value => engine.getTorqueAtRPM(value), throttle: .4, brake: 0,
    vehicleSpeed: wheelOmega * config.wheelRadius, drivenWheelAngularVelocity: wheelOmega };
  return { config, strategy, gearbox, controller, context };
}
// Measure settled schedule boundaries independently of rolling initial RPM,
// launch slip and traction interventions in the integration scenarios above.
for (const [vehicle, factory, modes] of vehicles) {
  if (vehicle === 'CVT') continue;
  for (const mode of modes) for (const pedal of [.15, .4, .75, 1]) {
    const f = fixture(factory, mode, 3, 1200);
    const demand = Math.pow(pedal, f.config.driveModes?.[mode]?.throttleExponent ?? 1);
    const context = { ...f.context, throttle: demand };
    for (let i = 0; i < 240; i++) f.controller.decide(context, false);
    let shiftRPM = 0;
    for (let rpm = 1200; rpm <= f.config.engine.redlineRPM; rpm += 10) {
      const scale = rpm / 1200;
      const decision = f.controller.decide({ ...context, engineRPM: rpm,
        engineAngularVelocity: context.engineAngularVelocity * scale,
        vehicleSpeed: context.vehicleSpeed * scale,
        drivenWheelAngularVelocity: context.drivenWheelAngularVelocity * scale,
        availableEngineTorque: context.engineTorqueAtRPM!(rpm) * demand }, false);
      if (decision?.gear === 4) { shiftRPM = rpm; break; }
    }
    check(shiftRPM > 0, `${vehicle}/${mode}/${pedal}: settled schedule upshifts`);
    if (vehicle === 'BMW530') {
      const range = mode === 'ECO' ? (pedal === .15 ? [1400, 1800] : pedal === .4 ? [1800, 2400] : pedal === .75 ? [2500, 3800] : [5800, 6400])
        : mode === 'NORMAL' ? (pedal === .15 ? [1600, 2100] : pedal === .4 ? [2000, 2900] : pedal === .75 ? [3800, 5000] : [6100, 6500])
        : pedal === .15 ? [2200, 3000] : pedal === .4 ? [3000, 4200] : pedal === .75 ? [4200, 6000] : [6300, 6600];
      check(shiftRPM >= range[0]! && shiftRPM <= range[1]!, `BMW/${mode}/${pedal}: calibrated band ${shiftRPM}`);
    }
    if (vehicle === 'Ferrari458') {
      check(pedal === 1 ? shiftRPM >= 8500 && shiftRPM <= 9000
        : pedal <= .4 ? shiftRPM < 5200 : shiftRPM >= 6500 && shiftRPM <= 8500,
        `Ferrari/${mode}/${pedal}: demand-appropriate AUTO ${shiftRPM}`);
    }
    scheduleChecks.push({ vehicle, mode, pedal, demand, shiftRPM });
  }
}
for (const mode of ['SPORT', 'RACE'] as const) {
  const f = fixture(createFerrari458PhysicsConfig, mode, 3, 7200);
  f.controller.requestManualSelection(1);
  check(f.controller.decide(f.context, false)?.gear === 4, `Ferrari/${mode}: paddle upshift`);
  f.gearbox.setGear(3); f.controller.gearChanged();
  for (let i = 0; i < 11 * 120; i++)
    check(f.controller.decide(f.context, false) === null, `Ferrari/${mode}: MANUAL held below existing timeout`);
  check(f.controller.manualSelectionActive, `Ferrari/${mode}: manual state retained`);
  f.controller.returnToAuto();
  check(f.controller.decide(f.context, false)?.gear === 4, `Ferrari/${mode}: AUTO moderate high RPM upshift`);
  const red = fixture(createFerrari458PhysicsConfig, mode, 3, 8900);
  red.controller.requestManualSelection(-1);
  red.controller.decide(red.context, false);
  check(red.controller.manualSelectionRejectedReason === 'engine-over-speed', `Ferrari/${mode}: manual overrev rejection`);
  check(red.controller.decide({ ...red.context, engineRPM: 8950 }, false)?.gear === 4, `Ferrari/${mode}: existing manual redline protection`);
  const auto = fixture(createFerrari458PhysicsConfig, mode, 3, 8900);
  check(auto.controller.decide({ ...auto.context, throttle: 1 }, false)?.gear === 4, `Ferrari/${mode}: AUTO ceiling bypasses dwell`);
}
for (const mode of ['ECO', 'NORMAL', 'SPORT'] as const) {
  const f = fixture(createBMW530LiPhysicsConfig, mode, 3, 6450);
  check(f.controller.decide({ ...f.context, throttle: 1 }, false)?.gear === 4, `BMW/${mode}: AUTO cannot hang at limiter`);
}
const reserve = fixture(createBMW530LiPhysicsConfig, 'NORMAL', 3, 2500);
let reserveDecision;
for (let i = 0; i < 240; i++) reserveDecision = reserve.controller.decide(reserve.context, false);
check(reserveDecision?.gear === 4, 'torque reserve allows earlier economical upshift');
const weak = fixture(createBMW530LiPhysicsConfig, 'NORMAL', 3, 2500);
let weakDecision;
for (let i = 0; i < 240; i++) weakDecision = weak.controller.decide({ ...weak.context,
  engineTorqueAtRPM: rpm => rpm < 2400 ? 5 : 350 }, false);
check(weakDecision === null, 'poor next-gear torque prevents early reserve upshift');
const sudden = fixture(createBMW530LiPhysicsConfig, 'NORMAL', 7, 1700);
for (let i = 0; i < 30; i++) sudden.controller.decide({ ...sudden.context, throttle: .2 }, false);
const kick = sudden.controller.decide({ ...sudden.context, throttle: .98 }, false);
check(kick?.kickdown === true && kick.gear < 7, 'rapid kickdown bypasses ordinary dwell safely');
const wheelspin = fixture(createFerrari458PhysicsConfig, 'SPORT', 3, 4500);
let spinDecision;
for (let i = 0; i < 240; i++) spinDecision = wheelspin.controller.decide({ ...wheelspin.context,
  throttle: .75, drivenWheelAngularVelocity: wheelspin.context.drivenWheelAngularVelocity * 1.7 }, false);
check(spinDecision === null, 'wheelspin alone cannot trigger a high-demand upshift');
const slipping = fixture(createFerrari458PhysicsConfig, 'SPORT', 2, 4000);
let slipDecision;
for (let i = 0; i < 240; i++) slipDecision = slipping.controller.decide({ ...slipping.context,
  throttle: 1, engineRPM: 7500 }, false);
check(slipDecision === null, 'high crank RPM after an upshift prevents slip-induced kickdown');
const lift = fixture(createBMW530LiPhysicsConfig, 'SPORT', 3, 4500);
for (let i = 0; i < 240; i++) lift.controller.decide({ ...lift.context, throttle: .8 }, false);
check(lift.controller.decide({ ...lift.context, throttle: 0 }, false) === null, 'Sport lift briefly holds gear');
let recovered;
for (let i = 0; i < 240; i++) recovered = lift.controller.decide({ ...lift.context, throttle: 0 }, false);
check(recovered?.gear === 4, 'Sport lift hold expires');

const existing: Record<string, unknown> = {};
for (const [label, test] of Object.entries({ input: runVehicleInputSystemSelfTest,
  backend: runTransmissionBackendSelfTest, vehicle: runTransmissionVehicleSelfTest,
  shift: runTransmissionShiftSelfTest, selector: runAutomaticSelectorInputSelfTest, cvt: runCVTSelfTest })) {
  try { existing[label] = test(); }
  catch (error) { check(false, `${label}: ${String(error)}`); }
}
mkdirSync('artifacts/transmission-demand', { recursive: true });
writeFileSync('artifacts/transmission-demand/results.json', JSON.stringify({ assertions, failures, existing, scheduleChecks, runs }, null, 2));
console.log(JSON.stringify({ assertions, failures, scenarios: runs.length,
  results: runs.map(({ vehicle, mode, scenario, firstUpshiftRPM, maxRPM, longestHighRPMHold, kickdown }) =>
    ({ vehicle, mode, scenario, firstUpshiftRPM, maxRPM, longestHighRPMHold, kickdown })) }, null, 2));
if (failures.length) throw new Error(`${failures.length} transmission/input checks failed; see artifacts/transmission-demand/results.json`);
