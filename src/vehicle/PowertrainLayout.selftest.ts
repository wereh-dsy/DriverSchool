import { Box3, Group, Mesh, Raycaster, Vector3 } from 'three';
import { calculateEngineAudioMix } from '../audio/EngineAudio';
import { VehicleInputSystem } from '../input/VehicleInputSystem';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import { createVehiclePhysicsConfig, getVehicleDescriptor, VEHICLE_CATALOG } from './VehicleCatalog';
import { createDefaultVehiclePhysicsConfig, createRoadSUVPhysicsConfig, createTest6ATVehiclePhysicsConfig,
  type ForwardGear, type VehiclePhysicsConfig } from './config';
import { Engine } from './physics/Engine';
import { Gearbox } from './physics/Gearbox';
import { SuspensionSystem } from './physics/SuspensionSystem';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { AutomaticShiftController } from './transmission/automatic/AutomaticShiftController';
import type { TransmissionContext } from './transmission/TransmissionSystem';
import { buildVehicleExterior } from './visual/VehicleExterior';

/** Short acceptance checks for engine identity, TCU/input routing and the road SUV. */
export function runPowertrainLayoutSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Powertrain layout: ${message}`); };
  const dt = 1 / 120;
  for (const car of VEHICLE_CATALOG) {
    const engine = new Engine(car.physicsConfig.engine);
    assert(engine.isRunning && Number.isFinite(engine.getTorqueSample().netCrankTorque), `${car.id}: valid engine`);
    assert(car.physicsConfig.engine.layout === (car.id === 'road-suv-v6-8at' || car.id === 'ferrari-458-italia' ? 'V' : 'INLINE'), `${car.id}: explicit layout`);
    assert(car.physicsConfig.engine.cylinderCount === (car.id === 'ferrari-458-italia' ? 8 : car.id === 'sport-coupe' || car.id === 'road-suv-v6-8at' ? 6 : 4), `${car.id}: cylinders`);
  }
  const reference = createDefaultVehiclePhysicsConfig().engine;
  for (const structure of [{ layout: 'INLINE' as const, cylinderCount: 4 },
    { layout: 'V' as const, cylinderCount: 6, bankAngle: Math.PI / 2 },
    { layout: 'W' as const, cylinderCount: 12, bankAngle: Math.PI / 3 }]) {
    const engine = new Engine({ ...reference, ...structure });
    for (let i = 0; i < 120; i++) engine.integrate(dt, 0);
    assert(engine.isRunning && Math.abs(engine.currentRPM - reference.idleRPM) < 2, `${structure.layout}: finite stable idle`);
    assert(engine.firingFrequencyHz > 0 && engine.rotationalInertia > 0, `${structure.layout}: character available`);
  }
  const six = createVehiclePhysicsConfig('sport-coupe');
  const fourHz = calculateEngineAudioMix(3000, .5, { engineCharacter: reference }).firingHz;
  const sixHz = calculateEngineAudioMix(3000, .5, { engineCharacter: six.engine }).firingHz;
  assert(sixHz === fourHz * 1.5, 'six-cylinder firing density reaches existing audio');
  assert(six.engine.displacementL === 3 && six.engine.turbo?.enabled === true && six.drivetrainType === 'RWD' &&
    new Gearbox(six.transmission).getMaximumForwardGear() === 7, 'GT 3.0T L6 RWD 7MT');
  assert(Math.abs(new Engine(six.engine).getTorqueAtRPM(6500) * 6500 * Math.PI / 30 / 1000 - 268.87) < .1, 'GT original 269 kW envelope');

  const context = (config: VehiclePhysicsConfig, gear: ForwardGear, rpm: number, throttle = .2): TransmissionContext => {
    const speed = rpm * Math.PI / 30 * config.wheelRadius / (config.transmission.gearRatios[gear]! * config.transmission.finalDriveRatio);
    return { dt, engineRPM: rpm, engineAngularVelocity: rpm * Math.PI / 30,
      engineRunning: true, engineInertia: config.engine.engineInertia, idleRPM: config.engine.idleRPM,
      stallRPM: config.engine.stallRPM, redlineRPM: config.engine.redlineRPM,
      availableEngineTorque: 90, throttle, brake: 0, vehicleSpeed: speed,
      drivenWheelAngularVelocity: speed / config.wheelRadius };
  };
  for (const id of ['test-6at-sedan', 'test-7dct-sedan', 'executive-lwb-2t', 'road-suv-v6-8at'] as const) {
    const config = createVehiclePhysicsConfig(id);
    const gearbox = new Gearbox(config.transmission, 4);
    const strategy = config.transmission.automatic?.shiftStrategy ?? config.transmission.dct!.shiftStrategy;
    const controller = new AutomaticShiftController(strategy, gearbox, config.wheelRadius);
    const highest = gearbox.getMaximumForwardGear();
    gearbox.setGear(highest);
    controller.requestManualSelection(-1);
    assert(controller.decide(context(config, highest, 2200), false)?.gear === highest - 1, `${id}: top gear paddle down`);
    controller.reset(); gearbox.setGear(4);
    const ctx = context(config, 4, 2200);
    controller.requestManualSelection(-1);
    assert(controller.decide(ctx, false)?.gear === 3 && controller.manualSelectionActive, `${id}: manual downshift`);
    gearbox.setGear(3);
    controller.requestManualSelection(1);
    assert(controller.decide(ctx, false)?.gear === 4, `${id}: manual upshift`); gearbox.setGear(4);
    for (let i = 0; i < 4 * 120; i++) controller.decide(ctx, false);
    controller.requestManualSelection(-1); controller.decide(ctx, false);
    for (let i = 0; i < 4 * 120; i++) controller.decide(ctx, false);
    assert(controller.manualSelectionActive, `${id}: paddle resets timeout`);
    for (let i = 0; i < 5 * 120; i++) controller.decide({ ...ctx, brake: .6 }, false);
    assert(controller.manualSelectionActive, `${id}: timeout waits for stable driving`);
    controller.decide(ctx, false);
    assert(!controller.manualSelectionActive, `${id}: stable timeout returns AUTO`);
    controller.requestManualSelection(-1); controller.decide(ctx, false);
    for (let i = 0; i < 120; i++) assert(controller.decide({ ...ctx, throttle: 1 }, false) === null, `${id}: manual suppresses kickdown`);
    controller.returnToAuto();
    assert(!controller.manualSelectionActive, `${id}: explicit return AUTO`);
    const fast = context(config, 4, config.engine.redlineRPM * .80);
    controller.requestManualSelection(-1);
    assert(controller.decide(fast, false) === null && controller.manualSelectionRejectedReason === 'engine-over-speed', `${id}: rejects over-rev`);
    const lockedWheels = { ...fast, drivenWheelAngularVelocity: 0 };
    controller.requestManualSelection(-1);
    const guarded = controller.decide(lockedWheels, false);
    assert(guarded?.gear !== 3 && controller.manualSelectionRejectedReason === 'engine-over-speed', `${id}: road speed protects with locked wheels`);
    controller.requestManualSelection(1);
    const protectedGear = controller.decide(context(config, 4, 350), false)?.gear;
    assert(protectedGear !== undefined && protectedGear < 4, `${id}: anti-lug downshift`);
    for (const enabled of [false, true]) {
      config.transmission.manualAutoUpshiftAtRedline = enabled;
      gearbox.setGear(3); controller.reset(); controller.requestManualSelection(-1);
      const decision = controller.decide(context(config, 3, config.engine.redlineRPM * .99), false);
      assert(enabled ? decision?.gear === 4 : decision === null, `${id}: configurable redline upshift ${enabled}`);
    }

    const car = new VehicleDynamics(createVehiclePhysicsConfig(id));
    const buttons = Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false }));
    const pad = { id: 'Paddle acceptance', index: 0, mapping: 'standard', connected: true,
      timestamp: 0, axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
    const input = new VehicleInputSystem({ keyboard: false,
      gamepad: { target: null, navigator: { getGamepads: () => [pad] } } });
    const poll = (up = false, down = false, brake = 0) => {
      buttons[5] = { value: Number(up), pressed: up, touched: up };
      buttons[4] = { value: Number(down), pressed: down, touched: down };
      buttons[6] = { value: brake, pressed: brake > .5, touched: brake > 0 };
      input.update(dt, car.getSnapshot().clutchEngagement);
      return car.stepFixed(dt, { ...input.consumeState() }).transmission;
    };
    poll(); poll(true, false, 1); assert(car.getSnapshot().transmission.selectedMode === 'R', `${id}: stopped brake RB selects PRND`);
    car.reset({ speed: 15, gear: 4, driveSelector: 'D', engineRPM: 2200 });
    poll(); poll(false, true, .65);
    for (let i = 0; i < 85; i++) poll(false, false, .65);
    assert(car.getSnapshot().transmission.selectedMode === 'D' && car.getSnapshot().gear === 3,
      `${id}: moving brake LB selects D3 without PRND`);
    poll(true);
    for (let i = 0; i < 145; i++) poll(true);
    assert(!car.getSnapshot().transmission.manualSelectionActive && car.getSnapshot().transmission.selectedMode === 'D', `${id}: real held RB returns AUTO`);
    if (id === 'road-suv-v6-8at') {
      car.reset({ speed: 120 / 3.6, gear: 8, driveSelector: 'D', engineRPM: 1850 });
      poll(); poll(false, true);
      for (let i = 0; i < 70; i++) poll();
      assert(car.getSnapshot().gear === 7 && car.getSnapshot().transmission.selectedMode === 'D', 'SUV real D8 -> D7 paddle');
    }
    input.dispose();
  }
  const disabled = createTest6ATVehiclePhysicsConfig(); disabled.transmission.supportsManualSelection = false;
  const automatic = new VehicleDynamics(disabled, { speed: 15, gear: 4, driveSelector: 'D' });
  const neutral = createNeutralVehicleInputState();
  automatic.stepFixed(dt, { ...neutral, shiftDown: true, brake: .6 });
  assert(!automatic.getSnapshot().transmission.manualSelectionActive && automatic.getSnapshot().transmission.selectedMode === 'D', 'disabled AT keeps automatic behavior');
  const cvt = new VehicleDynamics(createVehiclePhysicsConfig('cvt-family-sedan'), { speed: 15, driveSelector: 'D' });
  cvt.stepFixed(dt, { ...neutral, shiftDown: true, brake: .6 });
  assert(cvt.getSnapshot().transmission.currentPhysicalGear === null && !cvt.getSnapshot().transmission.manualSelectionActive &&
    Object.keys(cvt.config.transmission.gearRatios).length === 0, 'CVT retains continuous ratio without manual gears');
  const mt = new VehicleDynamics(createDefaultVehiclePhysicsConfig());
  mt.stepFixed(dt, { ...neutral, shiftUp: true });
  assert(mt.getSnapshot().requestedGear === 1 && mt.getSnapshot().transmission.selectedMode === null, 'MT retains existing shift sequence');

  const suvConfig = createRoadSUVPhysicsConfig();
  const suv = new VehicleDynamics(suvConfig, { engineRunning: false });
  suv.engine.start();
  for (let i = 0; i < 300; i++) suv.stepFixed(dt, neutral);
  assert(suv.engine.isRunning && suv.engine.ignitionPhase === 'RUNNING', 'V6 starter catches and settles');
  assert(suv.requestDriveSelector('D', 1), 'SUV selects drive');
  for (let i = 0; i < 1200; i++) suv.stepFixed(dt, { ...neutral, throttle: .45 });
  const state = suv.getSnapshot();
  assert(state.engineRunning && state.speedKmh > 20 && typeof state.gear === 'number' && state.gear >= 3,
    'SUV launches and automatically progresses through 8AT');
  assert(state.awd !== null && state.awd !== undefined && state.awd.rearTorqueSplit >= .45, 'SUV rear axle participates');
  const cruise = new Gearbox(suvConfig.transmission, 8).getCoupledEngineRPM(120 / 3.6, suvConfig.wheelRadius);
  assert(cruise > 1700 && cruise < 2100, 'SUV eighth cruises at low RPM');
  const sedan = createTest6ATVehiclePhysicsConfig();
  const bodyRoll = (config: VehiclePhysicsConfig) => {
    const suspension = new SuspensionSystem(config);
    for (let i = 0; i < 120; i++) suspension.update(dt, { longitudinalAcceleration: -3, lateralAcceleration: 3 });
    return suspension.getSnapshot().chassis.roll;
  };
  assert(suvConfig.centerOfMassHeight > sedan.centerOfMassHeight && suvConfig.mass > sedan.mass &&
    suvConfig.steering.steeringResponse < sedan.steering.steeringResponse && bodyRoll(suvConfig) > bodyRoll(sedan), 'SUV higher/heavier/slower rack with greater roll');
  const visual = getVehicleDescriptor('road-suv-v6-8at').visualConfig;
  const root = new Group(); buildVehicleExterior(root, visual); root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  assert(bounds.getSize(new Vector3()).x <= suvConfig.width + .02 && bounds.getSize(new Vector3()).z <= suvConfig.length + .02, 'SUV envelope matches collider');
  assert(visual.driverEyePosition[1] > 1.4 && visual.body.roofLength > 2.5 &&
    suvConfig.frontTrackWidth * .5 + suvConfig.wheelWidth * .5 < suvConfig.width * .5, 'SUV upright proportion and wheels inside arches');
  const ray = new Raycaster(); ray.layers.set(1);
  for (const z of [-1.8, -.5, .8, 1.9]) {
    ray.set(new Vector3(0, 0, z), new Vector3(0, 1, 0));
    assert(ray.intersectObject(root, true).some(hit => hit.distance < .26), 'SUV sealed underside');
  }
  root.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose();
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose()); } });
  return { assertions, suvAccelerationKmh: state.speedKmh, suvCruiseRPM: cruise };
}
