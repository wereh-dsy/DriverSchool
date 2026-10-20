import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createVehiclePhysicsConfig, getVehicleDescriptor } from '../VehicleCatalog';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { ElectricPowertrain } from './ElectricPowertrain';
import { BatteryPack } from './BatteryPack';
import { ElectricMotor } from './ElectricMotor';
import { EVTwoSpeedTransmission } from '../transmission/EVTwoSpeedTransmission';
import { EVThermalState } from './EVThermalState';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { WHEEL_IDS } from '../physics/WheelContact';
import type { PowertrainUpdateContext } from './Powertrain';
import type { ElectricVehiclePhysicsConfig, EVTwoSpeedConfig } from '../config/ElectricVehiclePhysicsConfig';

export function runEVPlatformV2SelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, label: string): void => { assertions++; if (!ok) throw new Error(`EV V2: ${label}`); };
  const close = (a: number, b: number, tolerance = 1e-6): boolean => Math.abs(a - b) < tolerance;
  const dt = 1 / 120, input = createNeutralVehicleInputState();
  const tesla = createVehiclePhysicsConfig('tesla-model-3-rwd'), taycan = createVehiclePhysicsConfig('porsche-taycan-4s');
  validateVehiclePlatformConfig(taycan, getVehicleDescriptor('porsche-taycan-4s').visualConfig);
  validateVehiclePlatformConfig(tesla);
  const capabilities = getVehicleDescriptor('porsche-taycan-4s').capabilities;
  assert(capabilities.awd && capabilities.multiMotor && capabilities.evMultiSpeed && capabilities.launchControl && capabilities.airSuspension && capabilities.adaptiveDamping,
    'Taycan catalog support derives from installed systems');
  assert(!getVehicleDescriptor('tesla-model-3-rwd').capabilities.launchControl && !getVehicleDescriptor('tesla-model-3-rwd').capabilities.multiMotor, 'Tesla catalog remains single motor');
  const vehicle = (c: ElectricVehiclePhysicsConfig, speed = 0, soc = .8) => new VehicleDynamics<ElectricPowertrain>(c,
    { speed, stateOfCharge: soc, driveSelector: 'D' }, new ElectricPowertrain(c));
  const context = (speed = 20, throttle = 1): PowertrainUpdateContext => ({ dt, vehicleSpeed: speed, vehicleLateralSpeed: 0,
    throttle, brake: 0, drivenWheelAngularVelocity: speed / taycan.wheelRadius, torqueLimitFactor: 1, clutchPedal: 0, driveMode: 'NORMAL' });
  const runProvider = (p: ElectricPowertrain, c: PowertrainUpdateContext, steps = 120): void => {
    for (let i = 0; i < steps; i++) { p.prepare(c); p.update(c); p.finishStep(c.vehicleSpeed); }
  };

  // Regression: the in-game F3 and shift-button routes must select BOTH EV
  // units. Initializing a benchmark directly in D used to conceal a front
  // unit left in P/N, with motor/battery work but zero front wheel torque.
  for (const route of ['direct-ui', 'shift-buttons', 'input-selector'] as const) {
    const car = new VehicleDynamics<ElectricPowertrain>(createVehiclePhysicsConfig('porsche-taycan-4s'), { driveSelector: 'N' });
    const p = car.powertrain, f = p.frontDriveUnit!, r = p.rearDriveUnit!;
    const command = createNeutralVehicleInputState(); command.brake = 1;
    const energy = p.battery.remainingEnergyKWh;
    if (route === 'direct-ui') {
      assert(car.requestDriveSelector('D', 1), 'UI D accepted');
      assert(p.battery.remainingEnergyKWh === energy && car.speed === 0, 'UI request does not integrate energy or motion');
    } else if (route === 'shift-buttons') command.shiftUp = true;
    else command.driveSelector = 'D';
    car.stepFixed(dt, command);
    assert(f.transmission.mode === 'D' && r.transmission.mode === 'D', `${route}: all installed units enter D`);
    command.shiftUp = false; command.driveSelector = undefined; command.brake = 0; command.throttle = 1;
    let drivenFront = false, drivenRear = false;
    for (let n = 0; n < 120; n++) {
      const state = car.stepFixed(dt, command);
      const expectedF = f.motor.deliveredDriveTorque * f.transmission.ratio * f.transmission.efficiency;
      const expectedR = r.motor.deliveredDriveTorque * r.transmission.ratio * r.transmission.efficiency;
      assert(close(state.wheels.frontLeft.driveTorque + state.wheels.frontRight.driveTorque, expectedF), `${route}: delivered front motor torque reaches tyres`);
      assert(close(state.wheels.rearLeft.driveTorque + state.wheels.rearRight.driveTorque, expectedR), `${route}: delivered rear motor torque reaches tyres`);
      drivenFront ||= expectedF > 100; drivenRear ||= expectedR > 100;
    }
    assert(drivenFront && drivenRear, `${route}: both axles propel after calipers release`);
    assert(!car.requestDriveSelector('P', 1), `${route}: moving park rejected`);
    assert(!car.requestDriveSelector('R', 1), `${route}: moving reverse rejected`);
    assert(!car.requestDriveSelector('N', 0), `${route}: brake-required preserved`);
    assert(f.transmission.mode === 'D' && r.transmission.mode === 'D', `${route}: rejected requests leave both selectors unchanged`);
  }
  const selector = new VehicleDynamics<ElectricPowertrain>(createVehiclePhysicsConfig('porsche-taycan-4s'), { driveSelector: 'P' });
  const units = selector.powertrain;
  for (const mode of ['R', 'N', 'D', 'P', 'D'] as const) {
    assert(selector.requestDriveSelector(mode, 1), `stationary ${mode} accepted`);
    assert(units.frontDriveUnit!.transmission.mode === mode && units.rearDriveUnit!.transmission.mode === mode, `${mode} synchronized at rest`);
    const c = context(0, 1); units.prepare(c); units.update(c);
    if (mode === 'N' || mode === 'P') assert(units.axleOutput.drivenWheelTorque === 0, `${mode}: no wheel drive`);
    if (mode === 'R') assert(units.axleOutput.frontWheelTorque! < 0 && units.axleOutput.rearWheelTorque! < 0, 'reverse torque reaches both axles');
  }
  // Torque, constant-power and high-speed voltage envelope; component limits at rest stay finite.
  const m = new ElectricMotor(tesla.motor);
  m.setShaftSpeed(0); assert(m.driveLimit(230000) === tesla.motor.maxDriveTorque, 'zero RPM finite torque region');
  m.setShaftSpeed(100); assert(close(m.driveLimit(1e6), tesla.motor.maxDriveTorque), 'low speed torque envelope');
  m.setShaftSpeed(800); const midPower = m.driveLimit(1e6) * 800;
  m.setShaftSpeed(1100); assert(close(midPower, m.driveLimit(1e6) * 1100, 1000), 'constant-power region');
  m.setShaftSpeed(14200 * Math.PI / 30); assert(m.driveLimit(1e6) * m.shaftAngularVelocity < midPower, 'voltage rolloff before maximum RPM');
  m.setShaftSpeed(tesla.motor.maxRPM * Math.PI / 30); assert(m.driveLimit(1e6) === 0, 'maximum RPM');
  m.setShaftSpeed(800); assert(m.driveLimit(40000) * 800 <= 40000, 'battery power cap');
  const initialPower = m.availablePower; m.thermal!.temperature = 130;
  assert(m.availablePower < initialPower && m.driveLimit(1e6) * 800 < midPower, 'motor thermal limits affect torque');
  m.thermal!.temperature = tesla.motor.thermal!.criticalTemperature;
  assert(close(m.availablePower, tesla.motor.continuousPower!), 'hot peak converges smoothly to continuous power');
  m.setShaftSpeed(0); m.deliveredDriveTorque = -100; m.constrainRegeneration(0, 1);
  assert(m.deliveredDriveTorque === 0, 'ABS releases a fully locked motor axle using vehicle direction');

  const b = new BatteryPack(taycan.battery), normalDraw = b.availableDischargePower, normalCharge = b.availableChargePower;
  assert(b.grossEnergyKWh === 105 && b.config.usableCapacityKWh === 97 && b.temperature > 20 && b.temperature < 35, 'pack energy and ambient influenced spawn');
  b.setStateOfCharge(.99); assert(b.availableChargePower < normalCharge * .04, '99% SOC restricts regen');
  b.setStateOfCharge(1); assert(b.chargeLimit(dt) === 0, 'full pack rejects regen');
  b.setStateOfCharge(.02); assert(b.availableDischargePower < normalDraw * .1, 'very low SOC reduces discharge');
  b.setStateOfCharge(.8); b.thermal!.temperature = -10;
  assert(b.availableDischargePower < normalDraw * .6 && b.availableChargePower < normalCharge * .1, 'cold discharge and regen have different limits');
  b.thermal!.temperature = 68;
  assert(b.availableDischargePower < normalDraw && b.availableChargePower < normalCharge, 'hot battery limits both directions');
  const t0 = b.temperature; b.thermal!.integrate(10, 0, 0);
  assert(b.temperature < t0 && b.temperature > t0 - 2, 'stationary cooldown has thermal inertia');
  b.thermal!.temperature = 27; b.setStateOfCharge(.5); const energy = b.remainingEnergyKWh;
  b.integrate(60, 60000); assert(close(energy - b.remainingEnergyKWh, (60000 + b.resistiveLoss) * 60 / 3600000 / taycan.battery.dischargeEfficiency), 'stored discharge accounts for electrical and conversion losses');
  const energy2 = b.remainingEnergyKWh; b.integrate(60, -30000);
  assert(close(b.remainingEnergyKWh - energy2, (30000 - b.resistiveLoss) * 60 / 3600000 * taycan.battery.chargeEfficiency), 'charge energy accounting');
  b.setStateOfCharge(.03); const p1 = b.availableDischargePower; b.setStateOfCharge(.030001);
  assert(Math.abs(b.availableDischargePower - p1) < 20, 'SOC limits continuous');

  const single = new ElectricPowertrain(tesla), dual = new ElectricPowertrain(taycan);
  single.reset({ driveSelector: 'D' }); dual.reset({ driveSelector: 'D' });
  assert(!single.frontDriveUnit && !!single.rearDriveUnit && single.launchControl === undefined, 'Model 3 truly single rear unit, no launch');
  assert(single.getSnapshot().ev!.frontMotorTemperature === undefined && single.getSnapshot().ev!.frontMotorRPM === undefined, 'no fake front telemetry');
  assert(dual.frontDriveUnit?.transmission.type === 'FIXED_REDUCTION' && dual.rearDriveUnit?.transmission.type === 'EV_TWO_SPEED', 'front fixed / rear two speed');
  const independent = context(20); independent.frontWheelAngularVelocity = 50; independent.rearWheelAngularVelocity = 70;
  runProvider(dual, independent);
  assert(close(dual.frontDriveUnit!.motor.shaftAngularVelocity, 50 * dual.frontDriveUnit!.transmission.ratio) &&
    close(dual.rearDriveUnit!.motor.shaftAngularVelocity, 70 * dual.rearDriveUnit!.transmission.ratio), 'independent physical axle RPM');
  const rearLimit = dual.rearDriveUnit!.powerLimit;
  dual.frontDriveUnit!.inverter.thermal.temperature = 139;
  assert(dual.frontDriveUnit!.powerLimit < taycan.driveUnits![0]!.motor.maxDrivePower && close(dual.rearDriveUnit!.powerLimit, rearLimit), 'front inverter limiting independent of rear');
  dual.frontDriveUnit!.inverter.thermal.temperature = 25;

  const rearConfig = taycan.driveUnits![1]!.transmission as EVTwoSpeedConfig;
  const gear = (strategy: 'normal' | 'sport' | 'sport-plus') => {
    const tr = new EVTwoSpeedTransmission(rearConfig); tr.reset('D'); tr.advance(dt, 0, 1, strategy, true); return tr;
  };
  const normal = gear('normal'), sport = gear('sport'), plus = gear('sport-plus');
  assert(normal.physicalGear === 1 && normal.ratio === rearConfig.ratio, 'launch preselects first');
  const rpmFirst = normal.update(50, 100); let minimumTransfer = 1, maximumRatioStep = 0, oldRatio = normal.ratio;
  for (let i = 0; i < 240; i++) {
    normal.advance(dt, 18, 1, 'normal', false); sport.advance(dt, 18, 1, 'sport', false); plus.advance(dt, 18, 1, 'sport-plus', false);
    minimumTransfer = Math.min(minimumTransfer, normal.torqueTransfer); maximumRatioStep = Math.max(maximumRatioStep, Math.abs(normal.ratio - oldRatio)); oldRatio = normal.ratio;
    assert(Number.isFinite(normal.update(50, 100 * normal.torqueTransfer)), 'finite shift delivery');
  }
  assert(normal.physicalGear === 2 && sport.physicalGear === 1 && plus.physicalGear === 1, 'Normal shifts earlier than performance modes');
  assert(normal.update(50, 100) < rpmFirst && close(normal.getSnapshot().inputRPM, 50 * rearConfig.secondRatio * 30 / Math.PI), 'post-shift real motor RPM');
  assert(minimumTransfer === 0 && maximumRatioStep < rearConfig.ratio - rearConfig.secondRatio, 'torque interruption and continuous ratio transition');
  for (let i = 0; i < 600; i++) normal.advance(dt, 13 + Math.sin(i * .1) * .8, .6, 'normal', false);
  assert(normal.physicalGear === 2 && !normal.getSnapshot().shiftInProgress, 'hysteresis prevents hunting');

  const awd = new ElectricPowertrain(createVehiclePhysicsConfig('porsche-taycan-4s')); awd.reset({ driveSelector: 'D' });
  const c = context(20, .12); runProvider(awd, c);
  const lightFront = Math.abs(awd.axleOutput.frontWheelTorque!) / Math.max(1, awd.axleOutput.drivenWheelTorque);
  c.throttle = .6; runProvider(awd, c); const mediumFront = awd.axleOutput.frontWheelTorque! / awd.axleOutput.drivenWheelTorque;
  c.throttle = 1; runProvider(awd, c); const hardFront = awd.axleOutput.frontWheelTorque! / awd.axleOutput.drivenWheelTorque;
  assert(lightFront < mediumFront && mediumFront < hardFront && hardFront > .15, 'AWD allocation varies with demand');
  c.frontTorqueLimitFactor = .1; runProvider(awd, c); const cutFront = awd.frontDriveUnit!.motor.deliveredDriveTorque;
  assert(cutFront < awd.frontDriveUnit!.config.motor.maxDriveTorque * .15 && awd.rearDriveUnit!.motor.deliveredDriveTorque > 100, 'front TCS reduces front motor first');
  c.frontTorqueLimitFactor = 1; c.rearTorqueLimitFactor = .1; runProvider(awd, c);
  assert(awd.rearDriveUnit!.motor.deliveredDriveTorque < 45 && awd.frontDriveUnit!.motor.deliveredDriveTorque > cutFront, 'rear TCS independent');
  c.rearTorqueLimitFactor = 1; c.vehicleSpeed = 50; c.drivenWheelAngularVelocity = 50 / taycan.wheelRadius; runProvider(awd, c);
  assert(awd.frontDriveUnit!.mechanicalPower + awd.rearDriveUnit!.mechanicalPower <= 380001 &&
    awd.frontDriveUnit!.electricalPower + awd.rearDriveUnit!.electricalPower + taycan.auxiliaryPower! <= taycan.battery.maxDischargePower + 1, 'shared normal system and pack power budget');

  const launch = new ElectricPowertrain(createVehiclePhysicsConfig('porsche-taycan-4s'));
  launch.reset({ driveSelector: 'D' }); const lc = context(0); lc.driveMode = 'SPORT_PLUS'; lc.brake = 1;
  launch.applyDriveMode(taycan.driveModes!.SPORT_PLUS!); runProvider(launch, lc, 120);
  assert(launch.launchControl!.state === 'READY' && (launch.transmission as EVTwoSpeedTransmission).physicalGear === 1, 'real launch arming and first gear');
  assert(launch.motor.deliveredDriveTorque === 0 && launch.frontDriveUnit!.motor.deliveredDriveTorque === 0, 'brake-held launch produces no fake preloaded wheel torque');
  lc.brake = 0; runProvider(launch, lc, 1); assert(launch.launchControl!.state === 'LAUNCHING', 'brake release launches');
  lc.vehicleSpeed = 50; lc.drivenWheelAngularVelocity = 50 / taycan.wheelRadius; runProvider(launch, lc, 120);
  const overboost = launch.frontDriveUnit!.mechanicalPower + launch.rearDriveUnit!.mechanicalPower;
  assert(overboost > 380000 && overboost <= 440001, 'temporary real motor overboost');
  runProvider(launch, lc, 1100); assert(launch.launchControl!.state === 'COOLDOWN' && launch.getSnapshot().ev!.systemPowerLimitKW === 380, 'timer and energy reserve end overboost');
  launch.reset({ driveSelector: 'D', ev: { stateOfCharge: .05 } }); lc.vehicleSpeed = 0; lc.brake = 1;
  runProvider(launch, lc); assert(launch.launchControl!.state === 'UNAVAILABLE', 'low SOC rejects launch');
  launch.reset({ driveSelector: 'D', ev: { stateOfCharge: .8, batteryTemperature: -5 } }); runProvider(launch, lc);
  assert(launch.launchControl!.state === 'UNAVAILABLE', 'cold battery rejects launch');

  // Real brake blending at both axles, high SOC friction replacement, ABS releasing either unit.
  const liftedTesla = vehicle(createVehiclePhysicsConfig('tesla-model-3-rwd'), 20), liftedTaycan = vehicle(createVehiclePhysicsConfig('porsche-taycan-4s'), 20);
  for (let i = 0; i < 120; i++) { liftedTesla.stepFixed(dt, input); liftedTaycan.stepFixed(dt, input); }
  assert(20 - liftedTesla.speed > (20 - liftedTaycan.speed) * 3, 'Tesla lift-off much stronger than Taycan coasting');
  const blend = (soc: number) => {
    const car = vehicle(createVehiclePhysicsConfig('porsche-taycan-4s'), 25, soc);
    car.setDriverAssistOptions({ absEnabled: false, ebdEnabled: false, tractionControlEnabled: true, stabilityControlEnabled: false });
    for (let i = 0; i < 45; i++) car.stepFixed(dt, { ...input, brake: .25 });
    const s = car.getSnapshot(), friction = WHEEL_IDS.reduce((sum, id) => sum + s.wheels[id].brakeTorque, 0);
    assert(close(friction + s.powertrain.ev!.regenerativeBrakeTorque, s.powertrain.ev!.requestedBrakeTorque, 1), 'regen + friction matches requested braking');
    return { car, friction, regen: s.powertrain.ev!.regenerativeBrakeTorque };
  };
  const midBlend = blend(.8), highBlend = blend(1);
  assert(midBlend.regen > highBlend.regen && highBlend.friction > midBlend.friction, 'high SOC friction compensates');
  const absCar = vehicle(createVehiclePhysicsConfig('porsche-taycan-4s'), 25);
  for (let i = 0; i < 90; i++) absCar.stepFixed(dt, { ...input, brake: .25 });
  absCar.wheelRotation.constrainAngularVelocity('frontLeft', 0, 20, 0); absCar.wheelRotation.constrainAngularVelocity('frontRight', 0, 20, 0);
  absCar.stepFixed(dt, input); const frontABS = absCar.stepFixed(dt, { ...input, brake: .25 });
  assert(frontABS.driverAssists.absActive && absCar.powertrain.frontDriveUnit!.motor.deliveredDriveTorque === 0, 'front ABS cancels front regen');
  absCar.wheelRotation.constrainAngularVelocity('rearLeft', 0, 20, 0); absCar.wheelRotation.constrainAngularVelocity('rearRight', 0, 20, 0);
  absCar.stepFixed(dt, input); const rearABS = absCar.stepFixed(dt, { ...input, brake: .25 });
  assert(rearABS.driverAssists.absActive && absCar.powertrain.rearDriveUnit!.motor.deliveredDriveTorque === 0, 'rear ABS cancels rear regen');

  const thermalRun = (config: ElectricVehiclePhysicsConfig) => {
    const p = new ElectricPowertrain(config); p.reset({ driveSelector: 'D' });
    const c = context(40); c.drivenWheelAngularVelocity = 40 / config.wheelRadius;
    const startTemp = p.motor.temperature; runProvider(p, c, 240);
    const peak = p.motor.availablePower;
    // Controlled SOC thermal bench: isolates heat limits from eventual energy depletion.
    for (let i = 0; i < 86400; i++) {
      if (i % 7200 === 0) p.setStateOfCharge(.8);
      runProvider(p, c, 1);
    }
    const hotTemp = p.motor.temperature, hotPower = p.motor.availablePower, delivered = (p.frontDriveUnit?.mechanicalPower ?? 0) + p.rearDriveUnit!.mechanicalPower;
    c.throttle = 0; c.selectorRequest = 'N'; c.brake = .2;
    runProvider(p, c, 24000);
    return { startTemp, peak, hotTemp, hotPower, cooledTemperature: p.motor.temperature, recoveredPower: p.motor.availablePower, sustainedMechanicalKW: delivered / 1000 };
  };
  const teslaThermal = thermalRun(createVehiclePhysicsConfig('tesla-model-3-rwd'));
  const taycanThermal = thermalRun(createVehiclePhysicsConfig('porsche-taycan-4s'));
  assert(teslaThermal.hotTemp > teslaThermal.startTemp + 20 && teslaThermal.hotPower < teslaThermal.peak, 'sustained Tesla power heats and gradually derates');
  assert(teslaThermal.cooledTemperature < teslaThermal.hotTemp && teslaThermal.recoveredPower > teslaThermal.hotPower, 'cooling gradually restores capability');
  assert(taycanThermal.sustainedMechanicalKW > teslaThermal.sustainedMechanicalKW * 1.4, 'Taycan has higher sustained output');
  assert(taycanThermal.hotPower < taycanThermal.peak && taycanThermal.recoveredPower > taycanThermal.hotPower, 'Taycan heat feedback and recovery remain physical');
  const thermalCap = new ElectricPowertrain(createVehiclePhysicsConfig('porsche-taycan-4s')); thermalCap.reset({ driveSelector: 'D' });
  const hotContext = context(40); runProvider(thermalCap, hotContext);
  const coldDelivery = thermalCap.frontDriveUnit!.mechanicalPower + thermalCap.rearDriveUnit!.mechanicalPower;
  thermalCap.frontDriveUnit!.motor.thermal!.temperature = 112; thermalCap.rearDriveUnit!.motor.thermal!.temperature = 115;
  runProvider(thermalCap, hotContext);
  assert(thermalCap.frontDriveUnit!.mechanicalPower + thermalCap.rearDriveUnit!.mechanicalPower < coldDelivery - 20000, 'combined hot drive unit envelope reduces actual vehicle propulsion');
  const standaloneThermal = new EVThermalState(tesla.motor.thermal!); standaloneThermal.temperature = 90;
  const cap1 = standaloneThermal.capability; standaloneThermal.temperature = 90.001;
  assert(Math.abs(standaloneThermal.capability - cap1) < .001, 'smooth thermal threshold');

  const suspension = vehicle(createVehiclePhysicsConfig('porsche-taycan-4s'));
  const initialHeight = suspension.suspension.getSnapshot().restLength;
  suspension.cycleDriveMode(); suspension.cycleDriveMode();
  assert(suspension.suspension.rideHeightTarget < taycan.suspension.rideHeight - .02, 'ride height target changes before struts settle');
  for (let i = 0; i < 1200; i++) suspension.stepFixed(dt, input);
  const sportSuspension = suspension.suspension.getSnapshot();
  assert(suspension.driveMode === 'SPORT_PLUS' && sportSuspension.restLength < initialHeight - .015 && sportSuspension.dampingMultiplier > 1.45, 'air rest geometry and PASM mode actually change');
  assert(sportSuspension.chassis.rideOffset < -.01 && Number.isFinite(sportSuspension.chassis.verticalVelocity), 'body follows resting height smoothly');
  assert(!tesla.suspension.airSuspension && !tesla.suspension.adaptiveDamping && !tesla.driveModes, 'Tesla suspension/modes unchanged');
  assert(taycan.driveModes!.RANGE!.throttleExponent > taycan.driveModes!.NORMAL!.throttleExponent &&
    taycan.driveModes!.SPORT_PLUS!.throttleExponent < taycan.driveModes!.SPORT!.throttleExponent, 'measurable accelerator mapping');
  assert(taycan.driveModes!.SPORT_PLUS!.ev!.coolingMultiplier > taycan.driveModes!.NORMAL!.ev!.coolingMultiplier &&
    taycan.driveModes!.RANGE!.ev!.frontParticipation < taycan.driveModes!.SPORT!.ev!.frontParticipation, 'mode thermal and allocation differences');
  const rangeCar = vehicle(createVehiclePhysicsConfig('porsche-taycan-4s')); rangeCar.cycleDriveMode(); rangeCar.cycleDriveMode(); rangeCar.cycleDriveMode();
  assert(rangeCar.driveMode === 'RANGE', 'four modes cycle to Range');
  for (let i = 0; i < 120; i++) rangeCar.stepFixed(dt, { ...input, throttle: .4 });
  assert(rangeCar.powertrain.getSnapshot().ev!.systemPowerLimitKW! < 380 && rangeCar.powertrain.throttle < .4, 'Range changes actual throttle and reserve');

  // Fixed-condition measurements, no artificial mass/grip/power overrides.
  const performance = (config: ElectricVehiclePhysicsConfig, useLaunch: boolean) => {
    const car = vehicle(config);
    if (useLaunch) {
      car.cycleDriveMode(); car.cycleDriveMode();
      for (let i = 0; i < 120; i++) car.stepFixed(dt, { ...input, brake: 1, throttle: 1 });
      assert(car.powertrain.launchControl!.state === 'READY', 'full vehicle launch ready');
    }
    let zeroTo100 = Infinity;
    for (let i = 0; i < 1800; i++) {
      const s = car.stepFixed(dt, { ...input, throttle: 1 });
      assert(!s.recoveredFromInvalidState, 'acceleration finite');
      if (s.speedKmh >= 100) { zeroTo100 = (i + 1) * dt; break; }
    }
    const top = vehicle(config, 60);
    for (let i = 0; i < 12000; i++) top.stepFixed(dt, { ...input, throttle: 1 });
    return { zeroTo100Seconds: zeroTo100, topSpeedKmh: top.speed * 3.6, hardAccelerationEnergyKWh: car.powertrain.getSnapshot().ev!.energyUsedKWh };
  };
  const taycanPerformance = performance(createVehiclePhysicsConfig('porsche-taycan-4s'), true);
  const model3Performance = performance(createVehiclePhysicsConfig('tesla-model-3-rwd'), false);
  assert(taycanPerformance.zeroTo100Seconds >= 3.4 && taycanPerformance.zeroTo100Seconds <= 4.1 && taycanPerformance.topSpeedKmh > 245 && taycanPerformance.topSpeedKmh < 256, 'Taycan physical performance target class');
  assert(model3Performance.zeroTo100Seconds > 5.7 && model3Performance.zeroTo100Seconds < 6.6, 'Model 3 migration performance class');
  const consumption = (config: ElectricVehiclePhysicsConfig, speedKmh: number, urban = false) => {
    const target = speedKmh / 3.6, car = vehicle(config, urban ? 0 : target);
    let distance = 0;
    for (let i = 0; i < 14400; i++) {
      const desired = urban ? ((i % 7200) < 6000 ? target : 0) : target;
      const error = desired - car.speed;
      const rolling = config.mass * config.gravity * config.tires.rollingResistance;
      const drag = .5 * config.aero.airDensity * config.aero.dragCoefficient * config.aero.frontalArea * car.speed ** 2;
      const unit = car.powertrain.rearDriveUnit!;
      const maintenance = (rolling + drag) * config.wheelRadius / (unit.config.motor.maxDriveTorque * unit.transmission.ratio * unit.transmission.efficiency);
      car.stepFixed(dt, { ...input, throttle: desired > 0 ? Math.max(.021, Math.min(.65, maintenance + error * .08)) : 0,
        brake: error < -.5 ? Math.min(.25, -error * .06) : 0 });
      distance += Math.abs(car.speed) * dt / 1000;
    }
    const e = car.powertrain.getSnapshot().ev!;
    assert(Number.isFinite(e.estimatedRangeKm) && e.estimatedRangeKm > 0 && e.energyUsedKWh! > 0, 'energy and dynamic range telemetry');
    return { kWhPer100Km: (e.energyUsedKWh! - e.energyRecoveredKWh!) / distance * 100, finalRangeKm: e.estimatedRangeKm };
  };
  const energyComparison = {
    model3Urban: consumption(createVehiclePhysicsConfig('tesla-model-3-rwd'), 50, true), taycanUrban: consumption(createVehiclePhysicsConfig('porsche-taycan-4s'), 50, true),
    model3At100: consumption(createVehiclePhysicsConfig('tesla-model-3-rwd'), 100), taycanAt100: consumption(createVehiclePhysicsConfig('porsche-taycan-4s'), 100),
    model3At120: consumption(createVehiclePhysicsConfig('tesla-model-3-rwd'), 120), taycanAt120: consumption(createVehiclePhysicsConfig('porsche-taycan-4s'), 120),
  };
  assert(energyComparison.model3Urban.kWhPer100Km < energyComparison.taycanUrban.kWhPer100Km && energyComparison.model3At100.kWhPer100Km < energyComparison.taycanAt100.kWhPer100Km &&
    energyComparison.model3At120.kWhPer100Km < energyComparison.taycanAt120.kWhPer100Km, 'Model 3 more efficient in moderate fixed conditions');
  assert(taycanPerformance.hardAccelerationEnergyKWh! > model3Performance.hardAccelerationEnergyKWh!, 'Taycan high-performance acceleration consumes more energy');
  return { assertions, taycanPerformance, model3Performance, teslaThermal, taycanThermal,
    awdFrontShares: { lightFront, mediumFront, hardFront }, overboostMechanicalKW: overboost / 1000,
    brakeBlending: { normalRegenNm: midBlend.regen, fullRegenNm: highBlend.regen, normalFrictionNm: midBlend.friction, fullFrictionNm: highBlend.friction }, energyComparison };
}
