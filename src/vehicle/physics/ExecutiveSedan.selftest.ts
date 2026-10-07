import { createVehiclePhysicsConfig, getVehicleDescriptor } from '../VehicleCatalog';
import type { VehicleDriveMode } from '../config';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import type { TransmissionContext } from '../transmission/TransmissionSystem';
import { VehicleDynamics } from './VehicleDynamics';

/** Small integration regressions for live mode calibration, config isolation and AWD/DCT. */
export function runExecutiveSedanSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++; if (!ok) throw new Error(`Executive sedan: ${message}`);
  };
  const config = createVehiclePhysicsConfig('executive-lwb-2t');
  const vehicle = new VehicleDynamics(config);
  const input = createNeutralVehicleInputState();
  const originalSuspension = JSON.stringify(config.suspension);
  const originalEngineEnvelope = JSON.stringify(config.engine.torqueCurve);
  assert(vehicle.driveMode === 'NORMAL', 'spawn defaults to NORMAL');
  for (const expected of ['SPORT', 'ECO', 'NORMAL'] as const) {
    input.cycleDriveMode = true;
    assert(vehicle.stepFixed(1 / 120, input).driveMode === expected, 'latched input cycles all three modes');
    input.cycleDriveMode = false;
    assert(vehicle.stepFixed(1 / 120, input).driveMode === expected, 'ordinary fixed steps preserve mode');
  }
  const throttleSamples: number[] = [];
  const steeringSamples: number[] = [];
  const rearSplits: number[] = [];
  const shiftAt = (rpm: number): boolean => {
    vehicle.transmission.reset(2, 'D');
    const wheelOmega = rpm * Math.PI * 2 / 60 / config.transmission.finalDrive / config.transmission.gearRatios[2]!;
    const context: TransmissionContext = { dt: 2, throttle: .25, brake: 0, engineRunning: true,
      engineAngularVelocity: rpm * Math.PI * 2 / 60, engineRPM: rpm, engineInertia: config.engine.engineInertia,
      idleRPM: config.engine.idleRPM, stallRPM: config.engine.stallRPM, redlineRPM: config.engine.redlineRPM,
      availableEngineTorque: 300, vehicleSpeed: wheelOmega * config.wheelRadius, drivenWheelAngularVelocity: wheelOmega };
    vehicle.transmission.prepare(context);
    return vehicle.transmission.getSnapshot().shiftInProgress;
  };
  // Exercise the same live DCT/controller instance, then restore NORMAL after SPORT/ECO.
  for (const mode of ['NORMAL', 'SPORT', 'ECO', 'NORMAL'] as const) {
    while (vehicle.driveMode !== mode) vehicle.cycleDriveMode();
    assert(shiftAt(1850) === (mode === 'ECO'), `${mode} low-load early shift threshold applies to live DCT`);
    assert(shiftAt(2300) === (mode !== 'SPORT'), `${mode} low-load gear holding applies to live DCT`);
  }
  for (const mode of ['ECO', 'NORMAL', 'SPORT'] as const satisfies readonly VehicleDriveMode[]) {
    vehicle.reset({ gear: 3, driveSelector: 'D', speed: 20, engineRPM: 3300 });
    while (vehicle.driveMode !== mode) vehicle.cycleDriveMode();
    input.throttle = .5; input.steering = .3;
    for (let i = 0; i < 24; i++) vehicle.stepFixed(1 / 120, input);
    throttleSamples.push(vehicle.engine.throttle);
    steeringSamples.push(vehicle.steering.steeringInput);
    input.throttle = 1; input.steering = 0;
    for (let i = 0; i < 120; i++) vehicle.stepFixed(1 / 120, input);
    const snapshot = vehicle.getSnapshot();
    rearSplits.push(snapshot.awd!.rearTorqueSplit);
    assert(snapshot.engineRunning && snapshot.transmission.type === 'DCT', `${mode} existing engine/DCT runs`);
    assert(snapshot.awd !== undefined && Object.values(snapshot.wheels).every(w => Number.isFinite(w.driveTorque)), `${mode} AWD supplies finite wheel torques`);
    assert(snapshot.wheels.rearLeft.driveTorque > 0 && snapshot.wheels.frontLeft.driveTorque > 0, `${mode} both open axle carriers receive drive torque`);
    assert(JSON.stringify(config.suspension) === originalSuspension, 'modes never change springs/dampers');
    assert(JSON.stringify(config.engine.torqueCurve) === originalEngineEnvelope, 'modes preserve engine full-load envelope');
  }
  assert(throttleSamples[0]! < throttleSamples[1]! && throttleSamples[1]! < throttleSamples[2]!, 'ECO/NORMAL/SPORT actually order throttle response');
  assert(steeringSamples[0]! < steeringSamples[1]! && steeringSamples[1]! < steeringSamples[2]!, 'rack response actually changes across modes');
  assert(rearSplits[0]! < rearSplits[1]! && rearSplits[1]! < rearSplits[2]!, 'AWD adds rear participation progressively in sport');
  const clean = createVehiclePhysicsConfig('executive-lwb-2t');
  assert(clean.transmission.dct!.shiftStrategy.map[1]!.upshiftRPM === 1900 &&
    getVehicleDescriptor('executive-lwb-2t').physicsConfig.engine.throttleResponse === 3.2, 'switching modes never mutates catalog or fresh vehicles');
  config.driveModes!.ECO.shiftStrategy.map[0]!.upshiftRPM = 1;
  assert(clean.driveModes!.ECO.shiftStrategy.map[0]!.upshiftRPM === 1400, 'mode tables are detached per vehicle');
  const existing = new VehicleDynamics(createVehiclePhysicsConfig('test-7dct-sedan'));
  const before = JSON.stringify(existing.config);
  existing.cycleDriveMode();
  assert(existing.driveMode === undefined && JSON.stringify(existing.config) === before, 'existing cars ignore mode command without configuration changes');
  vehicle.reset();
  assert(vehicle.driveMode === 'NORMAL' && config.engine.throttleResponse === 3.2, 'reset restores NORMAL after SPORT');
  return { assertions, throttleSamples, steeringSamples, rearSplits };
}
