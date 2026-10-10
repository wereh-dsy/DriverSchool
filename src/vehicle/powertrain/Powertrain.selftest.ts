import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createVehiclePhysicsConfig, ICE_VEHICLE_CATALOG } from '../VehicleCatalog';
import { resolveVehicleCapabilities, type VehicleFeatureDeclarations } from '../VehicleCapabilities';
import type { VehicleChassisConfig, VehiclePhysicsConfig } from '../config';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import type { DriveTorqueSource } from '../physics/DriveTorqueSource';
import type { Powertrain, PowertrainInitialState, PowertrainTransmissionSnapshot } from './Powertrain';

/** Inert test fixture, not a motor/reduction implementation or fake ICE components. */
function createUnavailablePowertrainFixture(): Powertrain {
  let operational = true;
  const source: DriveTorqueSource = {
    shaftAngularVelocity: 0, rotationalInertia: 1, availableDriveTorque: 0,
    requestedDrive: 0, deliveredDriveTorque: 0, canDeliverTorque: false,
    requestDrive() {}, updateState() {},
  };
  const transmission: PowertrainTransmissionSnapshot = {
    type: 'FIXED_REDUCTION', selectedMode: 'D', currentPhysicalGear: null,
    currentRatio: 0, outputTorque: 0, inputRPM: 0, outputRPM: 0, transmittedTorque: 0,
    shiftInProgress: false, shiftState: 'NONE', shiftProgress: 0, kickdown: false,
    selectorRejectedReason: null, parkingLocked: false,
  };
  return {
    torqueSource: source, transmission: { type: 'FIXED_REDUCTION', getSnapshot: () => transmission, requestSelector: () => false },
    supportsManualSelection: false, get vehicleOperational() { return operational; },
    driveAvailable: false, driving: true, gear: null, throttle: 0, variableMassKg: 0, numericallyValid: true,
    reset(state) { operational = state.vehicleOperational ?? true; },
    captureState(previous: PowertrainInitialState = {}) { previous.vehicleOperational = operational; return previous; },
    requestStart() { operational = true; return true; }, requestStop() { operational = false; return true; },
    requestGear: () => 'gear-not-available', getShiftGear: () => null, setControlMode: () => 'normal',
    prepare() {}, update: () => ({ drivenWheelTorque: 0, inputLoadTorque: 0, couplingSlipAngularVelocity: 0, parkingLocked: false }),
    finishStep() {}, getSnapshot: () => ({ kind: 'fixture', vehicleOperational: operational, driveAvailable: false,
      inputShaftAngularVelocity: 0, sourceInertia: 1, availableDriveTorque: 0, transmission }),
  };
}

export function runPowertrainBoundarySelfTest() {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions++; if (!condition) throw new Error(`Powertrain boundary: ${message}`);
  };
  const invalid = (mutate: (config: VehiclePhysicsConfig) => void, message: string): void => {
    const config = createVehiclePhysicsConfig('executive-lwb-2t'); mutate(config);
    let rejected = false;
    try { validateVehiclePlatformConfig(config); } catch { rejected = true; }
    assert(rejected, message);
  };
  invalid(c => { c.capabilities = { awd: false } as unknown as VehicleFeatureDeclarations; }, 'AWD override rejected');
  invalid(c => { c.capabilities = { electronicParkingBrake: false } as unknown as VehicleFeatureDeclarations; }, 'EPB override rejected');
  invalid(c => { c.capabilities = { mechanicalHandbrake: true } as unknown as VehicleFeatureDeclarations; }, 'mechanical/EPB conflict rejected');
  invalid(c => { c.awd = undefined; }, 'missing AWD controller rejected');
  invalid(c => { c.drivetrainType = 'FWD'; c.drivetrainLayout = 'FWD'; }, 'AWD on FWD rejected');
  invalid(c => { c.frontTorqueSplit = .9; }, 'inconsistent axle split rejected');
  invalid(c => { c.awd!.response = NaN; }, 'invalid AWD response rejected');
  invalid(c => { c.awd!.maximumRearTorqueSplit = .1; }, 'impossible AWD maximum rejected');
  invalid(c => { c.rearDiff = { type: 'lsd', preload: NaN, lockStrength: .2, torqueBiasRatio: 2, response: 3, speedDifferenceSensitivity: 1 }; }, 'invalid LSD rejected');
  invalid(c => { c.parkingBrake!.maximumTorque = Infinity; }, 'infinite EPB torque rejected');
  invalid(c => { c.parkingBrake!.applyRate = -1; }, 'negative EPB rate rejected');
  invalid(c => { c.autoHold!.maximumCaptureSpeed = 10; }, 'unsafe hold capture speed rejected');
  invalid(c => { c.autoHold!.releaseRate = NaN; }, 'invalid hold rate rejected');
  invalid(c => { c.brakes.maxBrakeTorqueRear = 0; }, 'hold without service brakes rejected');
  invalid(c => { c.transmission.type = 'MANUAL'; }, 'manual selection/hold on MT rejected');
  const cvt = createVehiclePhysicsConfig('cvt-family-sedan');
  assert(!resolveVehicleCapabilities(cvt).manualSelection && Object.keys(cvt.transmission.gearRatios).length === 0, 'CVT has no stepped selection/gears');
  for (const fake of ['manual', 'gears']) {
    const bad = createVehiclePhysicsConfig('cvt-family-sedan');
    if (fake === 'manual') bad.transmission.supportsManualSelection = true;
    else bad.transmission.gearRatios = { 1: 2 };
    let rejected = false; try { validateVehiclePlatformConfig(bad); } catch { rejected = true; }
    assert(rejected, `CVT fake ${fake} rejected`);
  }
  // Structural fields are also forbidden at compile time.
  const forbidden: VehicleFeatureDeclarations = {
    // @ts-expect-error Installed topology cannot be a feature declaration.
    awd: false,
  };
  const topology = createVehiclePhysicsConfig('executive-lwb-2t'); topology.capabilities = forbidden;
  const resolved = resolveVehicleCapabilities(topology);
  assert(resolved.awd && resolved.electronicParkingBrake && !resolved.mechanicalHandbrake, 'override cannot change actual topology even before validation');
  topology.parkingBrake = undefined;
  assert(resolveVehicleCapabilities(topology).mechanicalHandbrake, 'cable parking is derived from absence of EPB');
  const visual = ICE_VEHICLE_CATALOG.find(d => d.id === 'executive-lwb-2t')!.visualConfig;
  const styleOnly = { ...visual, instrumentCluster: { ...visual.instrumentCluster, featureClass: undefined } };
  topology.capabilities = {};
  assert(!resolveVehicleCapabilities(topology, styleOnly).advancedInstrument, 'executive style alone does not declare instrument support');
  assert(resolveVehicleCapabilities(topology, visual).advancedInstrument, 'explicit instrument feature class declares support');
  topology.capabilities = { advancedInstrument: true };
  assert(resolveVehicleCapabilities(topology, styleOnly).advancedInstrument, 'explicit optional feature declaration works');
  assert(resolved.awd === resolveVehicleCapabilities(topology, styleOnly).awd, 'presentation profile cannot change physics layout');

  const dt = 1 / 120, neutral = createNeutralVehicleInputState();
  for (const id of ['executive-lwb-2t', 'road-suv-v6-8at'] as const) {
    for (const failure of ['stall', 'fuel']) {
      const car = new VehicleDynamics(createVehiclePhysicsConfig(id), { driveSelector: 'D', gear: 1 });
      for (let n = 0; n < 180; n++) car.stepFixed(dt, { ...neutral, brake: .7 }, { gradeRadians: .12 });
      assert(car.getSnapshot().autoHold.holding, `${id}: capture before ${failure}`);
      if (failure === 'stall') car.engine.integrate(dt, 100000); // Actual load-induced stall, no key-off.
      else car.setCurrentFuelL(0);
      const position = car.z;
      let state = car.getSnapshot();
      for (let n = 0; n < 360; n++) state = car.stepFixed(dt, { ...neutral, throttle: .6 }, { gradeRadians: .12 });
      assert(state.vehicleOperational && !state.driveAvailable, `${id}: controls remain operational after ${failure}`);
      assert(state.autoHold.holding && !state.autoHold.releasing && state.autoHold.pressure > .6, `${id}: no propulsion cannot release hold`);
      assert(Math.abs(car.z - position) < .03 && Math.abs(car.speed) < .005, `${id}: physical hydraulic hold survives ${failure}`);
      assert(state.wheels.frontLeft.appliedBrakeTorque > 100 && state.wheels.rearLeft.appliedBrakeTorque > 100, 'actual service brake support remains');
      car.setDriverAssistOptions({ absEnabled: false, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true });
      assert(car.getSnapshot().driverAssists.absWarning, 'brake assist control/diagnostic state remains operational without drive');
      car.x = NaN;
      const recovered = car.stepFixed(dt, neutral);
      assert(recovered.recoveredFromInvalidState && recovered.vehicleOperational && !recovered.driveAvailable, 'recovery preserves operational/no-drive distinction');
      car.reset({ engineRunning: false, vehicleOperational: true, driveSelector: 'D' });
      for (let n = 0; n < 180; n++) state = car.stepFixed(dt, { ...neutral, brake: .7 });
      assert(state.autoHold.holding && !state.driveAvailable, 'capture also works with operational controls and stopped source');
    }
  }
  const starvedToggle = new VehicleDynamics(createVehiclePhysicsConfig('executive-lwb-2t'));
  starvedToggle.setCurrentFuelL(0);
  assert(starvedToggle.engine.isRunning && !starvedToggle.powertrain.driveAvailable, 'fuel-starved coast is distinct from drive availability');
  assert(starvedToggle.requestEngineToggle() === 'stopped' && !starvedToggle.getSnapshot().vehicleOperational,
    'legacy ignition toggle still stops an engine with no available drive');
  for (const descriptor of ICE_VEHICLE_CATALOG) {
    validateVehiclePlatformConfig(descriptor.physicsConfig, descriptor.visualConfig);
    const car = new VehicleDynamics(createVehiclePhysicsConfig(descriptor.id), { gear: 'N', driveSelector: 'P' });
    assert(car.powertrain.getSnapshot().kind === 'ICE', 'existing car uses ICE wrapper');
    assert(car.requestEngineStop() && !car.getSnapshot().vehicleOperational, `${descriptor.id}: key-off works`);
    assert(car.requestEngineStart(), `${descriptor.id}: safe restart works`);
    for (let n = 0; n < 240; n++) car.stepFixed(dt, neutral);
    assert(car.getSnapshot().driveAvailable && car.engine.isRunning, `${descriptor.id}: restart produces available drive`);
    car.setAutoHoldEnabled(false);
    if (car.transmission.type === 'MANUAL') assert(car.requestGear(1), 'MT launch gear accepted');
    else assert(car.requestDriveSelector('D', 1), 'automatic launch selector accepted');
    const fuelBefore = car.fuel.currentFuelL;
    let state = car.getSnapshot();
    for (let n = 0; n < 720; n++) state = car.stepFixed(dt, { ...neutral, throttle: .5 });
    assert(state.speed > .5 && state.transmission.currentRatio > 0, `${descriptor.id}: wrapped powertrain propels vehicle`);
    assert(state.fuel.currentFuelL < fuelBefore && Number.isFinite(state.powertrain.inputShaftAngularVelocity), `${descriptor.id}: fuel/shaft telemetry preserved`);
  }

  const { engine: _engine, fuel: _fuel, clutch: _clutch, autoClutch: _autoClutch, transmission: _transmission,
    startStop: _startStop, ...chassis } = createVehiclePhysicsConfig('executive-lwb-2t');
  const config: VehicleChassisConfig = chassis;
  const fixture = createUnavailablePowertrainFixture();
  const car = new VehicleDynamics<Powertrain>(config, { vehicleOperational: true, driveAvailable: false }, fixture);
  let state = car.getSnapshot();
  for (let n = 0; n < 180; n++) state = car.stepFixed(dt, { ...neutral, brake: .7 }, { gradeRadians: .12 });
  const z = car.z;
  for (let n = 0; n < 240; n++) state = car.stepFixed(dt, { ...neutral, throttle: .6 }, { gradeRadians: .12 });
  assert(car.engine === undefined && car.fuel === undefined && car.clutch === undefined, 'non-ICE shape requires no fake components');
  assert(!('rpm' in state) && !('fuel' in state) && state.powertrain.ice === undefined, 'generic snapshot requires no ICE telemetry');
  assert(state.autoHold.holding && state.vehicleOperational && !state.driveAvailable && Math.abs(car.z - z) < .03, 'generic no-drive source still permits physical stop hold');
  assert(state.gear === null && state.transmission.currentPhysicalGear === null && !car.capabilities.manualSelection, 'generic provider requires no fake gears');
  car.x = NaN;
  assert(car.stepFixed(dt, neutral).recoveredFromInvalidState, 'generic provider also handles lifecycle recovery');
  return { assertions, iceVehicles: ICE_VEHICLE_CATALOG.length, nonICEFixture: true };
}
