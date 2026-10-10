import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createVehiclePhysicsConfig, getVehicleDescriptor } from '../VehicleCatalog';
import { ElectricPowertrain } from './ElectricPowertrain';
import { BatteryPack } from './BatteryPack';
import { ElectricMotor } from './ElectricMotor';
import { FixedReductionTransmission } from '../transmission/FixedReductionTransmission';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { WHEEL_IDS } from '../physics/WheelContact';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import type { PowertrainUpdateContext } from './Powertrain';

export function runElectricPowertrainSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Electric powertrain: ${message}`); };
  const close = (a: number, b: number, tolerance = 1e-8) => Math.abs(a - b) <= tolerance;
  const dt = 1 / 120, config = createVehiclePhysicsConfig('tesla-model-3-rwd');
  const input = createNeutralVehicleInputState();
  const create = (speed = 0, stateOfCharge = .8, selector: 'P' | 'R' | 'N' | 'D' = 'D') => {
    const c = createVehiclePhysicsConfig('tesla-model-3-rwd');
    return new VehicleDynamics<ElectricPowertrain>(c, { speed, stateOfCharge, driveSelector: selector }, new ElectricPowertrain(c));
  };
  validateVehiclePlatformConfig(config, getVehicleDescriptor('tesla-model-3-rwd').visualConfig);
  assert(!('engine' in config) && !('fuel' in config) && !('clutch' in config) && !('transmission' in config), 'clean EV config without pseudo ICE components');
  const ev = new ElectricPowertrain(config);
  assert(!('engine' in ev) && !('fuel' in ev) && !('clutch' in ev), 'EV provider does not expose ICE machinery');
  assert(ev.getSnapshot().ice === undefined && ev.getSnapshot().kind === 'EV' && ev.gear === null, 'no fabricated ICE telemetry or physical gear');
  const capabilities = getVehicleDescriptor('tesla-model-3-rwd').capabilities;
  assert(!capabilities.manualSelection && !capabilities.awd && !capabilities.startStop && capabilities.autoHold && capabilities.electronicParkingBrake, 'capabilities derive from installed topology');
  const motor = new ElectricMotor(config.motor);
  motor.setShaftSpeed(100); assert(close(motor.driveLimit(1e6), config.motor.maxDriveTorque), 'low speed constant torque');
  motor.setShaftSpeed(1000); assert(close(motor.driveLimit(1e6) * 1000, config.motor.maxDrivePower), 'high speed constant power');
  assert(motor.driveLimit(50000) * 1000 <= 50000 * config.motor.motoringEfficiency + 1e-6, 'discharge power physically limits motor torque');
  motor.setShaftSpeed(config.motor.maxRPM * Math.PI / 30); assert(motor.driveLimit(1e6) === 0, 'maximum motor speed removes propulsion');
  const battery = new BatteryPack(config.battery), initialEnergy = battery.remainingEnergyKWh;
  battery.integrate(60, 60000);
  assert(close(initialEnergy - battery.remainingEnergyKWh, 1 / config.battery.dischargeEfficiency), 'W seconds converted to kWh with discharge loss');
  const beforeCharge = battery.remainingEnergyKWh; battery.integrate(60, -30000);
  assert(close(battery.remainingEnergyKWh - beforeCharge, .5 * config.battery.chargeEfficiency), 'recovery uses charge efficiency');
  battery.setStateOfCharge(1); assert(battery.chargeLimit(dt) === 0 && battery.integrate(dt, -50000) === 0, 'full battery rejects energy');
  battery.setStateOfCharge(0); assert(battery.dischargeLimit(dt) === 0 && battery.integrate(dt, 1e6) === 0, 'empty battery cannot create energy');
  battery.setStateOfCharge(2); assert(battery.stateOfCharge === 1, 'SOC upper clamp');
  battery.setStateOfCharge(-1); assert(battery.stateOfCharge === 0, 'SOC lower clamp');
  const reduction = new FixedReductionTransmission(config.fixedReduction);
  assert(!reduction.requestSelector('D', 0, 0, 0), 'D requires brake');
  assert(reduction.requestSelector('D', 0, 0, .2), 'safe D selection');
  assert(!reduction.requestSelector('R', 12, 0, 1) && reduction.mode === 'D', 'reverse lockout');
  assert(!reduction.requestSelector('P', 10, 0, 1), 'park lockout');
  assert(!reduction.requestSelector('P', 0, 2, 1), 'park considers lateral motion');
  assert(reduction.requestSelector('R', 0, 0, 1) && reduction.update(-10, -100) < 0, 'reverse is signed motor torque through positive ratio');
  assert(reduction.getSnapshot().currentPhysicalGear === null && !reduction.getSnapshot().shiftInProgress, 'no D1 or simulated shift');
  reduction.reset('D');
  const wheelPower = reduction.update(20, -100) * 20, shaftPower = -100 * 20 * config.fixedReduction.ratio;
  assert(close(shaftPower, wheelPower * config.fixedReduction.efficiency), 'backdrive reduction dissipates energy rather than generating it');
  const context: PowertrainUpdateContext = { dt, throttle: 1, brake: 0, vehicleSpeed: 15, vehicleLateralSpeed: 0,
    drivenWheelAngularVelocity: 15 / config.wheelRadius, torqueLimitFactor: 1, clutchPedal: 0 };
  ev.reset({ driveSelector: 'D' });
  const startEnergy = ev.battery.remainingEnergyKWh; let work = 0;
  for (let i = 0; i < 240; i++) { ev.prepare(context); ev.update(context); work += ev.motor.deliveredDriveTorque * ev.motor.shaftAngularVelocity * dt / 3600000; ev.finishStep(15); }
  assert(close(startEnergy - ev.battery.remainingEnergyKWh, work / config.motor.motoringEfficiency / config.battery.dischargeEfficiency, 1e-7), 'drive battery loss matches actual delivered motor work');
  const regainStart = ev.battery.remainingEnergyKWh; let recoveredWork = 0;
  context.throttle = 0;
  for (let i = 0; i < 240; i++) { ev.prepare(context); ev.update(context); recoveredWork += Math.max(0, -ev.motor.deliveredDriveTorque * ev.motor.shaftAngularVelocity) * dt / 3600000; ev.finishStep(15); }
  assert(ev.battery.remainingEnergyKWh > regainStart && ev.getSnapshot().ev!.regenPowerKw > 0, 'lift-off returns actual motor work to battery');
  assert(ev.getSnapshot().ev!.tripEnergyRecoveredKWh <= recoveredWork + 1e-8, 'recovered energy cannot exceed motor work');
  ev.reset({ driveSelector: 'D', ev: { stateOfCharge: .5 } });
  for (let i = 0; i < 8400; i++) { ev.prepare(context); ev.update(context); ev.finishStep(15); }
  const downhill = ev.getSnapshot().ev!;
  assert(downhill.averageConsumptionKWhPer100km! < 0, 'net-recovery trip reports its actual signed energy consumption');
  assert(close(downhill.estimatedRangeKm, downhill.remainingEnergyKWh / config.regen.referenceConsumptionKWhPer100km * 100), 'nonpositive net consumption uses a finite default range estimate');
  const rest = create(); for (let i = 0; i < 120; i++) rest.stepFixed(dt, input);
  assert(Math.abs(rest.speed) < .001 && rest.powertrain.motor.deliveredDriveTorque === 0, 'Tesla does not creep or invent idle torque');
  const empty = create(0, 0); const depleted = empty.stepFixed(dt, { ...input, throttle: 1 });
  assert(depleted.vehicleOperational && !depleted.driveAvailable && depleted.powertrain.ev!.motorTorque === 0 && depleted.autoHold.enabled, 'zero SOC retains electronic controls while propulsion is unavailable');
  const low = create(0, .02); for (let i = 0; i < 120; i++) low.stepFixed(dt, { ...input, throttle: 1 });
  assert(low.powertrain.motor.deliveredDriveTorque < config.motor.maxDriveTorque * .3, 'low SOC progressively derates torque');
  const full = create(20, 1), partial = create(20, .8);
  for (let i = 0; i < 120; i++) { full.stepFixed(dt, input); partial.stepFixed(dt, input); }
  assert(full.powertrain.getSnapshot().ev!.regenPowerKw === 0 && partial.powertrain.getSnapshot().ev!.regenPowerKw > 0, 'high SOC limiting makes lift-off coast farther');
  assert(partial.speed < full.speed, 'regeneration is physical deceleration');
  assert(partial.powertrain.getSnapshot().ev!.regenBrakeLight && !full.powertrain.getSnapshot().ev!.regenBrakeLight, 'brake lamp request follows actual available recovery, including SOC limits');
  const slow = create(.3), fast = create(10); for (let i = 0; i < 12; i++) { slow.stepFixed(dt, input); fast.stepFixed(dt, input); }
  assert(Math.abs(slow.powertrain.motor.deliveredDriveTorque) < Math.abs(fast.powertrain.motor.deliveredDriveTorque), 'low-speed regeneration fades');
  const coastStop = create(1); for (let i = 0; i < 600; i++) coastStop.stepFixed(dt, input);
  assert(Math.abs(coastStop.speed) < .01, 'common physical friction/hold finishes a lift-off stop');
  assert(coastStop.getSnapshot().autoHold.holding, 'one-pedal stop captures the existing Auto Hold controller');
  for (let i = 0; i < 240; i++) coastStop.stepFixed(dt, input, { gradeRadians: .10 });
  assert(Math.abs(coastStop.speed) < .01 && coastStop.getSnapshot().autoHold.holding, 'Auto Hold supports a grade with physical brakes');
  coastStop.powertrain.setStateOfCharge(0);
  for (let i = 0; i < 120; i++) coastStop.stepFixed(dt, { ...input, throttle: 1 }, { gradeRadians: .10 });
  assert(coastStop.getSnapshot().autoHold.holding && Math.abs(coastStop.speed) < .01, 'hold remains until depleted battery can supply propulsion');
  const neutralCar = create(15, .8, 'N'); for (let i = 0; i < 120; i++) neutralCar.stepFixed(dt, input);
  assert(neutralCar.powertrain.motor.deliveredDriveTorque === 0 && neutralCar.powertrain.getSnapshot().ev!.regenPowerKw === 0, 'N coasts without normal propulsion or lift-off recovery');
  const parked = create(0, .8, 'P'); for (let i = 0; i < 120; i++) parked.stepFixed(dt, { ...input, throttle: 1 }, { gradeRadians: .15 });
  assert(parked.speed === 0 && parked.getSnapshot().transmission.parkingLocked && parked.powertrain.motor.deliveredDriveTorque === 0, 'P uses common parking constraint without motor holding torque');
  const combined = create(20); let maximumUsage = 0;
  for (let i = 0; i < 240; i++) {
    const s = combined.stepFixed(dt, { ...input, steering: .22, brake: .18 }, { surfaceGripMultiplier: .55 });
    maximumUsage = Math.max(maximumUsage, ...WHEEL_IDS.map(id => s.wheels[id].gripUsage));
    assert(!s.recoveredFromInvalidState && Number.isFinite(s.yawRate), 'combined wet turning/braking remains finite');
  }
  assert(maximumUsage <= 1.001, 'EV regen, toe and camber all share the same combined tyre budget');
  assert(close(combined.powertrain.motor.shaftAngularVelocity,
    (combined.wheelRotation.getAngularVelocity('rearLeft') + combined.wheelRotation.getAngularVelocity('rearRight')) / 2 * config.fixedReduction.ratio, 1e-8), 'motor shaft follows actual persistent driven-wheel carrier');
  assert(close(combined.getSnapshot().transmission.inputRPM, combined.powertrain.motor.shaftAngularVelocity * 30 / Math.PI), 'transmission telemetry follows the completed motor/wheel step');
  const blend = create(20); blend.setDriverAssistOptions({ absEnabled: false, ebdEnabled: false, tractionControlEnabled: true, stabilityControlEnabled: false });
  let blended = blend.getSnapshot();
  for (let i = 0; i < 45; i++) blended = blend.stepFixed(dt, { ...input, brake: .25 });
  const totalFriction = WHEEL_IDS.reduce((sum, id) => sum + blended.wheels[id].brakeTorque, 0);
  assert(blended.powertrain.ev!.regenerativeBrakeTorque > 0 && close(totalFriction + blended.powertrain.ev!.regenerativeBrakeTorque, blended.powertrain.ev!.requestedBrakeTorque, .5), 'pedal brake allocation subtracts actual regeneration instead of stacking');
  const abs = create(20); for (let i = 0; i < 60; i++) abs.stepFixed(dt, input);
  abs.wheelRotation.constrainAngularVelocity('rearLeft', 0, 20, 0); abs.wheelRotation.constrainAngularVelocity('rearRight', 0, 20, 0);
  abs.stepFixed(dt, input); // expose physical slip to the shared observer
  const absResult = abs.stepFixed(dt, input);
  assert(absResult.driverAssists.absActive && absResult.powertrain.ev!.regenerativeBrakeTorque === 0, 'same-step driven-wheel ABS immediately cuts motor recovery without pedal braking');
  const tcs = create(); let tcsSeen = false;
  for (let i = 0; i < 180; i++) { const s = tcs.stepFixed(dt, { ...input, throttle: 1 }, { surfaceGripMultiplier: .15 }); tcsSeen ||= s.driverAssists.tcsActive; }
  assert(tcsSeen && tcs.powertrain.motor.deliveredDriveTorque < config.motor.maxDriveTorque, 'shared TCS limits real motor torque on low grip');
  const brakingEmpty = create(20, 0); for (let i = 0; i < 240; i++) brakingEmpty.stepFixed(dt, { ...input, brake: 1 });
  assert(brakingEmpty.speed < 3, 'friction braking survives depleted battery');
  const savedSOC = partial.powertrain.battery.stateOfCharge; partial.reset();
  assert(close(savedSOC, partial.powertrain.battery.stateOfCharge), 'ordinary reset preserves SOC');
  partial.reset({ stateOfCharge: .3 }); assert(close(partial.powertrain.battery.stateOfCharge, .3), 'explicit energy reset is available');
  const reverse = create(0, .8, 'R'); for (let i = 0; i < 240; i++) reverse.stepFixed(dt, { ...input, throttle: .5 });
  assert(reverse.speed < -1 && reverse.powertrain.battery.stateOfCharge < .8, 'reverse uses signed torque and consumes stored energy');
  const launch = create(); let zeroTo100 = Infinity;
  for (let i = 0; i < 1200; i++) { const s = launch.stepFixed(dt, { ...input, throttle: 1 }); if (s.speedKmh >= 100) { zeroTo100 = (i + 1) * dt; break; } }
  assert(zeroTo100 >= 5.7 && zeroTo100 <= 6.6, `0–100 sanity window, actual ${zeroTo100.toFixed(3)} s`);
  const top = create(45); for (let i = 0; i < 10800; i++) top.stepFixed(dt, { ...input, throttle: 1 });
  const topSpeedKmh = top.speed * 3.6;
  assert(topSpeedKmh >= 195 && topSpeedKmh <= 205 && top.speed < config.safety.maxForwardSpeed - 10, `physical maximum motor speed/drag sanity, actual ${topSpeedKmh.toFixed(2)} km/h`);
  assert(top.getSnapshot().powertrain.ev!.averageConsumptionKWhPer100km !== null && top.powertrain.battery.stateOfCharge < .8, 'distance-based net consumption and estimated range available after 1 km');
  assert(!top.getSnapshot().recoveredFromInvalidState && WHEEL_IDS.every(id => top.getSnapshot().wheels[id].gripUsage <= 1.001), 'Tesla combined dynamics remain finite and within tyre budget');
  return { assertions, zeroTo100Seconds: zeroTo100, topSpeedKmh, remainingEnergyKWh: top.powertrain.battery.remainingEnergyKWh };
}
