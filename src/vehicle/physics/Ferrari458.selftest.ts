import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createVehiclePhysicsConfig, getVehicleDescriptor } from '../VehicleCatalog';
import { DualClutchTransmissionSystem } from '../transmission/dct/DualClutchTransmissionSystem';
import { AutomaticShiftController } from '../transmission/automatic/AutomaticShiftController';
import type { TransmissionContext } from '../transmission/TransmissionSystem';
import { Gearbox } from './Gearbox';
import { DriverAssistSystem } from './DriverAssistSystem';
import { VehicleDynamics } from './VehicleDynamics';
import { WHEEL_IDS } from './WheelContact';

export function runFerrari458SelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`458: ${message}`); };
  const c = createVehiclePhysicsConfig('ferrari-458-italia'), gt = createVehiclePhysicsConfig('sport-coupe');
  const car = new VehicleDynamics(c), dt = 1 / 120, neutral = createNeutralVehicleInputState();
  assert(c.enginePlacement === 'MID' && c.drivetrainType === 'RWD' && c.frontTorqueSplit === 0, 'MID and rear propulsion are independent');
  assert(gt.enginePlacement === 'FRONT_MID' && gt.drivetrainType === 'RWD', 'GT front-mid topology');
  assert(c.yawInertia < gt.yawInertia && c.frontWeightBias < gt.frontWeightBias, 'comparison: lower inertia and greater rear static share');
  const staticState = car.getSnapshot();
  const load = WHEEL_IDS.reduce((sum, id) => sum + staticState.wheels[id].normalLoad, 0);
  assert(Math.abs((staticState.wheels.frontLeft.normalLoad + staticState.wheels.frontRight.normalLoad) / load - .42) < 1e-9, 'real suspension has 42:58 distribution');
  assert(car.effectiveVehicleMass > 1450 && car.effectiveVehicleMass < 1500, 'road-ready mass includes fuel');
  assert(car.transmission instanceof DualClutchTransmissionSystem && car.gearbox.getMaximumForwardGear() === 7, 'shared 7DCT instantiated');
  assert(c.engine.layout === 'V' && c.engine.cylinderCount === 8 && !c.engine.turbo && c.engine.redlineRPM === 9000, 'high-revving NA V8');
  const power = Math.max(...c.engine.torqueCurve.map(p => p.torque * p.rpm * Math.PI / 30 / 1000));
  assert(power > 415 && power < 425 && car.engine.getTorqueAtRPM(2000) < car.engine.getTorqueAtRPM(6000) * .7, 'high RPM power, no low RPM turbo plateau');
  const curve = JSON.stringify(c.engine.torqueCurve);
  assert(car.driveMode === 'SPORT', 'default SPORT');
  car.cycleDriveMode(); assert(car.driveMode === 'RACE' && c.transmission.shiftTime === .08 && c.driverAids.stabilityControlEnabled, 'RACE later intervention stays enabled');
  const raceSlip = c.driverAids.tcs!.slipThresholdMultiplier;
  car.cycleDriveMode(); assert(car.driveMode === 'WET' && c.driverAids.tcs!.slipThresholdMultiplier < raceSlip, 'WET earlier intervention');
  car.reset(); assert(car.driveMode === 'SPORT' && c.transmission.shiftTime === .11 && JSON.stringify(c.engine.torqueCurve) === curve, 'reset and modes preserve peak power');
  const context = (gear: 3 | 4, rpm: number, brake = 0): TransmissionContext => {
    const speed = rpm * Math.PI / 30 * c.wheelRadius / (c.transmission.gearRatios[gear]! * c.transmission.finalDriveRatio);
    return { dt, engineRPM: rpm, engineAngularVelocity: rpm * Math.PI / 30, engineRunning: true,
      engineInertia: c.engine.engineInertia, idleRPM: c.engine.idleRPM, stallRPM: c.engine.stallRPM,
      redlineRPM: c.engine.redlineRPM, availableEngineTorque: 100, throttle: .15, brake,
      vehicleSpeed: speed, drivenWheelAngularVelocity: speed / c.wheelRadius };
  };
  const gearbox = new Gearbox(c.transmission, 4);
  const controller = new AutomaticShiftController(c.transmission.dct!.shiftStrategy, gearbox, c.wheelRadius);
  controller.requestManualSelection(-1);
  assert(controller.decide(context(4, 3500), false)?.gear === 3, 'paddle downshift works');
  controller.requestManualSelection(-1);
  assert(controller.decide(context(4, 8000), false) === null && controller.manualSelectionRejectedReason === 'engine-over-speed', 'downshift overrev protection');
  controller.requestManualSelection(-1);
  assert(controller.decide({ ...context(4, 8000), drivenWheelAngularVelocity: 0 }, false) === null, 'locked wheel cannot defeat road-speed overrev protection');
  controller.returnToAuto(); controller.reset();
  let decision = null;
  for (let i = 0; i < 60 && decision === null; i++) decision = controller.decide(context(4, 3000, .6), false);
  assert(decision?.gear === 3, 'automatic braking downshift');
  const dct = new DualClutchTransmissionSystem(new Gearbox(c.transmission, 4), c.transmission.dct!, c.wheelRadius);
  dct.reset(4, 'D'); dct.requestManualSelection(-1);
  const matching = dct.prepare(context(4, 3500));
  assert((matching.minimumThrottle ?? 0) > .1, 'rev matching requests ordinary throttle instead of assigning RPM');
  car.reset({ speed: context(4, 3500).vehicleSpeed, gear: 4, driveSelector: 'D', engineRPM: 3500 });
  car.stepFixed(dt, { ...neutral, shiftDown: true });
  for (let i = 0; i < 30; i++) car.stepFixed(dt, neutral);
  assert(car.getSnapshot().gear === 3 && car.getSnapshot().transmission.manualSelectionActive === true, 'vehicle input reaches D+paddle override');
  const auto = new VehicleDynamics(createVehiclePhysicsConfig('ferrari-458-italia'));
  assert(auto.requestDriveSelector('D', 1), 'selector D accepted');
  for (let i = 0; i < 720; i++) {
    const state = auto.stepFixed(dt, { ...neutral, throttle: .65, clutchPedal: 1 });
    assert(!state.recoveredFromInvalidState, 'automatic launch stays finite');
  }
  assert(auto.speed > 0 && auto.getSnapshot().gear !== 1 && auto.engine.isRunning, 'automatic launch and shifts ignore clutch pedal');
  assert(auto.getSnapshot().differential.type === 'lsd', 'rear LSD path active');
  const assist = new DriverAssistSystem(c); assist.reset(true);
  const wheels = car.getSnapshot().wheels;
  const spin = { ...wheels, rearLeft: { ...wheels.rearLeft, longitudinalSpeed: 10, slipRatio: .8,
    angularVelocity: 80 }, rearRight: { ...wheels.rearRight, longitudinalSpeed: 10, slipRatio: .02, angularVelocity: 30 } };
  for (let i = 0; i < 60; i++) assist.updateTraction(dt, spin, 1, true, true);
  assert(assist.getSnapshot().tcsActive && assist.electronicDifferentialActive && assist.differentialBrakeTorques[0] === 0, 'TCS/eDiff act on driven rear axle');
  const locked = { ...wheels, frontLeft: { ...wheels.frontLeft, longitudinalSpeed: 20, slipRatio: -.8 } };
  for (let i = 0; i < 30; i++) assist.updateBrakes(dt, 20, 1, locked, [4000, 4000, 3500, 3500]);
  assert(assist.getSnapshot().absActive && assist.pressures[0]! < .5, 'performance ABS modulation');
  for (let i = 0; i < 30; i++) assist.updateStability(dt, 20, .15, 1, 0, wheels, [4000, 4000, 3500, 3500], [4000, 4000, 3500, 3500]);
  assert(assist.getSnapshot().escActive && assist.esc.brakeTorques.some(t => t > 0), 'ESC correction requests service brake torque');
  const braking = new VehicleDynamics(createVehiclePhysicsConfig('ferrari-458-italia'), { speed: 20, gear: 'N', driveSelector: 'N' });
  let absSeen = false, finalModulation = false;
  for (let i = 0; i < 100; i++) {
    const s = braking.stepFixed(dt, { ...neutral, brake: 1 }, { surfaceGripMultiplier: .3 });
    absSeen ||= s.driverAssists.absActive;
    finalModulation ||= s.wheels.frontLeft.appliedBrakeTorque < s.wheels.frontLeft.requestedBrakeTorque;
  }
  assert(absSeen && finalModulation, 'ABS retains final coordinator authority in actual vehicle');
  assert(getVehicleDescriptor('ferrari-458-italia').capabilities.manualSelection, 'manual capability derives from installed DCT');
  return { assertions, powerKW: power, roadReadyMass: car.effectiveVehicleMass, launchSpeedKmh: auto.speed * 3.6 };
}
