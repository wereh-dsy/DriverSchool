import { createTeslaModel3PhysicsConfig } from '../config/teslaModel3PhysicsConfig';
import { createTaycan4SPhysicsConfig } from '../config/taycan4SPhysicsConfig';
import { createMercedesE300LPhysicsConfig } from '../config/mercedesE300LPhysicsConfig';
import { cloneVehiclePhysicsConfig } from '../config/defaultVehiclePhysicsConfig';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { Engine } from '../physics/Engine';
import { BatteryPack } from './BatteryPack';
import { ElectricPowertrain } from './ElectricPowertrain';
import { ICEPowertrain } from './ICEPowertrain';
import { MildHybridSystem } from './MildHybridSystem';
import { EVTwoSpeedTransmission } from '../transmission/EVTwoSpeedTransmission';
import type { EVTwoSpeedConfig } from '../config/ElectricVehiclePhysicsConfig';
import type { Powertrain, PowertrainUpdateContext } from './Powertrain';

/** Short component benches and three-car integration sanity; no pace/soak benchmarks. */
export function runElectrifiedPowertrainSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, label: string) => { assertions++; if (!ok) throw new Error('Electrified: ' + label); };
  const dt = 1 / 120, tesla = createTeslaModel3PhysicsConfig(), taycan = createTaycan4SPhysicsConfig();
  const c: PowertrainUpdateContext = { dt, throttle: .1, brake: 0, vehicleSpeed: 25, vehicleLateralSpeed: 0,
    drivenWheelAngularVelocity: 25 / taycan.wheelRadius, torqueLimitFactor: 1, clutchPedal: 0, driveMode: 'NORMAL' };
  const tick = (p: ElectricPowertrain, steps = 120) => {
    for (let i = 0; i < steps; i++) { p.prepare(c); p.update(c); p.finishStep(c.vehicleSpeed); }
  };
  // Tiny pedal changes across coast must not remove nearly full recovery or
  // jump straight to positive torque. Exercise both installed EV topologies.
  for (const config of [tesla, taycan]) {
    let previous: number | undefined;
    for (const throttle of [.0198, .0199, .02, .0201, .0202]) {
      const crossing = new ElectricPowertrain(config); crossing.reset({ driveSelector: 'D' });
      const context = { ...c, throttle, vehicleSpeed: 15, drivenWheelAngularVelocity: 15 / config.wheelRadius };
      for (let i = 0; i < 240; i++) { crossing.prepare(context); crossing.update(context); crossing.finishStep(15); }
      const torque = crossing.axleOutput.drivenWheelTorque;
      if (previous !== undefined) assert(torque >= previous && torque - previous < 25,
        'continuous monotonic coast/drive boundary for single and dual motors');
      previous = torque;
    }
  }
  const b = new BatteryPack(tesla.battery), ocv = b.openCircuitVoltage, energy = b.remainingEnergyKWh;
  const power = b.integrate(dt, 150000);
  assert(b.voltage < ocv && b.current > 0 && Math.abs(b.current * b.voltage - power) < 1e-6, 'terminal voltage/current sag and power identity');
  assert(Math.abs(energy - b.remainingEnergyKWh - (power + b.resistiveLoss) / tesla.battery.dischargeEfficiency * dt / 3600000) < 1e-9,
    'chemical energy includes explicit resistance and conversion losses');
  const warm = b.availableDischargePower;
  b.setStateOfCharge(.15); assert(b.availableDischargePower < warm, 'low SOC reduces electrical capability before empty knee');
  b.thermal!.temperature = -15; assert(b.availableDischargePower < warm * .6, 'cold pack capability');
  b.setStateOfCharge(1); assert(b.availableChargePower === 0, 'full pack blocks recovery');
  b.setStateOfCharge(.5); b.thermal!.temperature = 25; b.integrate(dt, -30000);
  assert(b.current < 0 && b.voltage > b.openCircuitVoltage, 'charge current and voltage have correct sign');
  const p = new ElectricPowertrain(tesla); p.reset({ driveSelector: 'D' });
  const m = p.motor; m.setShaftSpeed(100);
  const low = m.driveLimit(1e6); m.setShaftSpeed(800); const mid = m.driveLimit(1e6) * 800;
  m.setShaftSpeed(1000); assert(Math.abs(m.driveLimit(1e6) * 1000 - mid) < 100, 'constant power region');
  m.voltageFactor = .85; assert(m.driveLimit(1e6) * 1000 < mid && low === tesla.motor.maxDriveTorque, 'voltage shifts base speed, preserves low RPM torque');
  m.voltageFactor = 1; m.setShaftSpeed(14000 * Math.PI / 30); assert(m.driveLimit(1e6) * m.shaftAngularVelocity < mid, 'natural high speed rolloff');
  m.thermal!.temperature = 130; assert(m.availablePower < tesla.motor.maxDrivePower, 'motor thermal derate');
  const awd = new ElectricPowertrain(taycan); awd.reset({ driveSelector: 'D' });
  c.frontAxleTorqueRatio = .4; c.rearAxleTorqueRatio = .6; tick(awd, 180);
  assert(awd.frontDriveUnit!.disconnectState === 'disconnected' && awd.frontDriveUnit!.motor.shaftAngularVelocity === 0,
    'shared AWD preference still allows rear-only light cruise and front disconnect');
  c.throttle = 1; tick(awd, 1);
  assert(awd.frontDriveUnit!.disconnectState === 'connecting' && awd.frontDriveUnit!.wheelTorque === 0 && awd.frontDriveUnit!.synchronizationPower > 0,
    'front synchronizes with accounted electrical work before delivering torque');
  tick(awd, 60);
  assert(awd.frontDriveUnit!.disconnectState === 'connected' && awd.axleOutput.frontWheelTorque! > 0 && awd.axleOutput.rearWheelTorque! > 0, 'high demand uses both axles');
  assert(awd.frontDriveUnit!.electricalPower + awd.rearDriveUnit!.electricalPower + taycan.auxiliaryPower! <= awd.battery.availableDischargePower + 1,
    'both axles respect one terminal power budget');
  c.throttle = .8; tick(awd, 60);
  const normalRear = awd.rearDriveUnit!.wheelTorque;
  awd.frontDriveUnit!.inverter.thermal.temperature = 139; tick(awd, 60);
  assert(awd.rearDriveUnit!.wheelTorque > normalRear, 'healthy rear compensates front thermal derate');
  awd.frontDriveUnit!.inverter.thermal.temperature = 25; c.throttle = 1; tick(awd, 60);
  const initialFront = awd.frontDriveUnit!.wheelTorque;
  c.frontTorqueLimitFactor = .05; tick(awd, 60); assert(awd.frontDriveUnit!.wheelTorque < initialFront * .2, 'independent axle traction limit');
  c.frontTorqueLimitFactor = 1; c.throttle = 0; c.brake = .3;
  c.totalServiceBrakeTorque = 4000; c.frontAxleBrakeTorque = 2500; c.rearAxleBrakeTorque = 1500; tick(awd, 60);
  assert(awd.axleOutput.regenerativeWheelTorque! > 0, 'pedal regeneration');
  awd.limitAxleRegeneration(0, 1500); assert(awd.frontDriveUnit!.motor.deliveredDriveTorque === 0, 'same-step front ABS cancels corresponding regeneration');
  const tr = new EVTwoSpeedTransmission(taycan.driveUnits![1]!.transmission as EVTwoSpeedConfig);
  tr.reset('D'); tr.advance(dt, 0, 1, 'sport-plus', true); assert(tr.physicalGear === 1, 'launch first gear');
  let interrupted = false;
  for (let i = 0; i < 120; i++) { tr.advance(dt, 30, 1, 'normal', false); interrupted ||= tr.torqueTransfer === 0; }
  assert(tr.physicalGear === 2 && interrupted, 'rear upshift retains interruption and recovery');

  const blend = (soc: number) => {
    const car = new VehicleDynamics<ElectricPowertrain>(taycan, { speed: 25, stateOfCharge: soc, driveSelector: 'D' });
    car.setDriverAssistOptions({ absEnabled: false, ebdEnabled: false, tractionControlEnabled: true, stabilityControlEnabled: false });
    const input = createNeutralVehicleInputState(); input.brake = .25;
    for (let i = 0; i < 45; i++) car.stepFixed(dt, input);
    const state = car.getSnapshot();
    const friction = Object.values(state.wheels).reduce((sum, wheel) => sum + wheel.brakeTorque, 0);
    assert(Math.abs(friction + state.powertrain.ev!.regenerativeBrakeTorque - state.powertrain.ev!.requestedBrakeTorque) < 1,
      'physical regen and hydraulic complement preserve pedal demand');
    return { friction, regen: state.powertrain.ev!.regenerativeBrakeTorque };
  };
  const midBlend = blend(.8), fullBlend = blend(1);
  assert(midBlend.regen > fullBlend.regen && fullBlend.friction > midBlend.friction, 'full-SOC friction replacement');
  const lifted = new ElectricPowertrain(tesla); lifted.reset({ driveSelector: 'D' });
  c.throttle = c.brake = c.totalServiceBrakeTorque = 0; tick(lifted, 60);
  const teslaLift = lifted.axleOutput.regenerativeWheelTorque!;
  awd.reset({ driveSelector: 'D' }); tick(awd, 60);
  assert(teslaLift > awd.axleOutput.regenerativeWheelTorque! * 3, 'Model 3 strong lift-off versus Taycan coasting');
  const launch = new ElectricPowertrain(taycan); launch.reset({ driveSelector: 'D' });
  launch.applyDriveMode(taycan.driveModes!.SPORT_PLUS!);
  c.throttle = 1; c.brake = 1; c.vehicleSpeed = c.drivenWheelAngularVelocity = 0; c.driveMode = 'SPORT_PLUS';
  tick(launch, 100); c.brake = 0; tick(launch, 1);
  assert(launch.launchControl!.state === 'LAUNCHING', 'Launch Control remains available');
  c.vehicleSpeed = 50; c.drivenWheelAngularVelocity = 50 / taycan.wheelRadius; tick(launch, 120);
  const launchPower = launch.frontDriveUnit!.mechanicalPower + launch.rearDriveUnit!.mechanicalPower;
  assert(launchPower > taycan.normalSystemPower! && launchPower <= taycan.launchControl!.overboostPower + 1,
    'new capability still supports temporary dual-motor overboost');
  c.vehicleSpeed = 25; c.drivenWheelAngularVelocity = 25 / taycan.wheelRadius;

  const cfg = createMercedesE300LPhysicsConfig(), engine = new Engine(cfg.engine), hybrid = new MildHybridSystem(cfg.mildHybrid!);
  const copy = cloneVehiclePhysicsConfig(cfg); copy.mildHybrid!.motor.maxDriveTorque = 1;
  assert(cfg.mildHybrid!.motor.maxDriveTorque === 205, 'hybrid configs detached across catalog instances');
  const ice = new ICEPowertrain(cfg); ice.reset({ driveSelector: 'D' });
  const snapshot = ice.transmission.getSnapshot();
  c.throttle = .8; c.brake = 0; c.totalServiceBrakeTorque = 0; c.driveMode = 'NORMAL';
  engine.currentRPM = 1400;
  for (let i = 0; i < 15; i++) hybrid.prepare(c, engine, snapshot);
  const unspooled = hybrid.torque;
  for (let i = 0; i < 360; i++) { engine.currentRPM = 1400; engine.requestDrive(.8, dt); engine.updateState(dt, 100); }
  hybrid.reset(); for (let i = 0; i < 15; i++) hybrid.prepare(c, engine, snapshot);
  assert(unspooled > hybrid.torque && unspooled > 0, 'ISG fills real unspooled turbo torque gap');
  snapshot.torqueConverter = { pumpRPM: 1400, turbineRPM: 1400, speedRatio: 1, slipRPM: 0, torqueRatio: 1, lockupEngagement: 1 };
  c.throttle = 0; c.brake = .25; hybrid.reset(); const chargeSOC = hybrid.soc;
  hybrid.prepare(c, engine, snapshot); hybrid.finish(dt, engine.angularVelocity, 25);
  assert(hybrid.torque < 0 && hybrid.soc > chargeSOC && hybrid.electricalPower < 0, 'locked converter mild recovery charges the 48 V pack');
  hybrid.cancelRegeneration(); assert(hybrid.torque === 0, 'ISG regeneration cancellation');
  hybrid.reset(.99); hybrid.prepare(c, engine, snapshot); assert(hybrid.torque === 0, 'full 48 V pack rejects regeneration');
  hybrid.reset(.1); c.throttle = 1; c.brake = 0; hybrid.prepare(c, engine, snapshot);
  assert(hybrid.torque === 0 && !hybrid.restartAvailable, 'depleted 48 V pack prevents assist and automatic stopping');
  ice.reset({ driveSelector: 'D', gear: 6, ice: { engineRPM: 2000 } });
  c.throttle = .15;
  for (let i = 0; i < 240; i++) { ice.prepare(c); ice.update(c); ice.finishStep(25); }
  c.throttle = 0; c.brake = .2;
  let cancelled = false;
  for (let i = 0; i < 120; i++) {
    ice.prepare(c); const output = ice.update(c);
    if (ice.shaftRegenerating) {
      const before = output.drivenWheelTorque;
      ice.cancelShaftRegeneration(); ice.finishStep(25);
      cancelled = ice.mildHybrid!.torque === 0 && ice.mildHybrid!.electricalPower === 0 && output.drivenWheelTorque >= before;
      break;
    }
    ice.finishStep(25);
  }
  assert(cancelled, 'same-step ISG cancellation resamples real 9AT coupling and removes recovered electrical work');
  c.brake = 0;
  ice.reset({ driveSelector: 'P' , ice: { engineRunning: false, mildHybridSOC: .65 } });
  const restartSOC = ice.mildHybrid!.soc;
  assert(ice.requestStart(), 'ISG start accepted in P');
  let catchTime = 0;
  for (let i = 0; i < 60; i++) {
    ice.prepare(c); ice.update(c); ice.finishStep(0);
    if (ice.engine.isRunning) { catchTime = (i + 1) * dt; break; }
  }
  assert(catchTime > 0 && catchTime < .25 && ice.mildHybrid!.soc < restartSOC, 'physical ISG cranking reaches ignition quickly and draws pack energy');
  const baseline = new Engine(cfg.engine); baseline.start();
  for (let i = 0; i < 20; i++) baseline.updateState(dt, 0);
  assert(!baseline.isRunning, 'traditional starter retains original sequence for unmodified engines');
  ice.reset({ driveSelector: 'D' }); ice.setStartStopEnabled(true);
  c.throttle = 0; c.brake = .6; c.vehicleSpeed = c.drivenWheelAngularVelocity = 0;
  for (let i = 0; i < 260; i++) { ice.prepare(c); ice.update(c); ice.finishStep(0); }
  assert(ice.getSnapshot().ice.startStop!.state === 'AUTO_STOPPED' && ice.vehicleOperational, 'auto stop preserves operational state');
  c.autoHoldHolding = true; c.throttle = .2; c.brake = 0;
  for (let i = 0; i < 180; i++) { ice.prepare(c); ice.update(c); ice.finishStep(0); }
  assert(ice.driveAvailable && ice.getSnapshot().ice.startStop!.state === 'READY', 'ISG restart restores propulsion with hold support');
  for (const config of [tesla, taycan, cfg]) {
    const car = new VehicleDynamics<Powertrain>(config, { driveSelector: 'D' });
    const input = createNeutralVehicleInputState(); input.throttle = .6;
    let valid = true;
    for (let i = 0; i < 120; i++) { const s = car.stepFixed(dt, input); valid &&= !s.recoveredFromInvalidState && Number.isFinite(s.speed); }
    assert(valid && car.speed > 0 && car.powertrain.numericallyValid, 'three-car initialization and positive finite wheel propulsion');
  }
  return { assertions, isgCatchSeconds: catchTime };
}
