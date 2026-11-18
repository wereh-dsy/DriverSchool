import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { EhsHybridSystem } from './powertrain/EhsHybridSystem';
import { createQinPlusDmiPhysicsConfig } from './config/qinPlusDmiPhysicsConfig';
import { createVehiclePhysicsConfig, getVehicleDescriptor, VEHICLE_IDS } from './VehicleCatalog';
import { isEhsHybridConfig } from './config/EhsHybridConfig';
import { createVehiclePowertrain } from './powertrain/createVehiclePowertrain';
import { createWheelContactBuffer, WHEEL_IDS } from './physics/WheelContact';
import { SURFACE_MATERIALS } from '../world/SurfaceMaterial';

export function runEhsVehicleSelfTests() {
  let assertions = 0;
  const check = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`EHS vehicle: ${message}`); };
  const dt = 1 / 120, input = createNeutralVehicleInputState(), results: Record<string, unknown> = {};
  const contacts = createWheelContactBuffer();
  for (const id of WHEEL_IDS) Object.assign(contacts[id], SURFACE_MATERIALS.asphalt, { supportValid: true, height: 0 });
  const environment = { wheelContacts: contacts };
  const id = 'byd-qin-plus-dmi-210-2026';
  check(VEHICLE_IDS.includes(id), 'stable menu registration');
  const config = createVehiclePhysicsConfig(id), second = createVehiclePhysicsConfig(id);
  check(isEhsHybridConfig(config) && isEhsHybridConfig(second) && config.ehs !== second.ehs &&
    config.ehs.p1 !== second.ehs.p1 && config.ehs.battery !== second.ehs.battery, 'detached per-instance EHS calibration');
  const descriptor = getVehicleDescriptor(id);
  check(descriptor.capabilities.navigation && !descriptor.capabilities.awd && !descriptor.capabilities.lka &&
    !descriptor.capabilities.acc && !descriptor.capabilities.manualSelection, 'installed capability boundary');
  for (const [id, kind] of [['family-sedan', 'ICE'], ['tank-500-hi4-t', 'P2_PHEV'], ['tesla-model-3-rwd', 'EV']] as const) {
    const p = createVehiclePowertrain(createVehiclePhysicsConfig(id));
    check(p.getSnapshot().kind === kind, `existing factory topology ${id}`);
  }
  const car = new VehicleDynamics<EhsHybridSystem>(config, { driveSelector: 'D', stateOfCharge: .85 });
  car.powertrain.setHybridMode('HEV');
  let time100: number | null = null, maxWheelW = 0, generation = 0, previousWheelNm = 0, maximumTorqueDrop = 0;
  let firstJointDriveKmh: number | null = null;
  const trace: unknown[] = [];
  for (let i = 0; i < 1800; i++) {
    const s = car.stepFixed(dt, { ...input, throttle: 1 }, environment);
    check(car.powertrain instanceof EhsHybridSystem && s.powertrain.kind === 'EHS_PHEV', 'factory installs EHS');
    check(!s.recoveredFromInvalidState && s.speed >= -.05, 'forward launch without recovery');
    check(s.powertrain.ehs!.directClutch.torqueNm === 0 || s.powertrain.ehs!.path === 'PARALLEL', 'real mechanical path');
    maxWheelW = Math.max(maxWheelW, s.powertrain.ehs!.wheelPowerW);
    generation = Math.max(generation, s.powertrain.ehs!.p1GenerationPowerW);
    const wheelNm = car.powertrain.axleOutput.drivenWheelTorque;
    maximumTorqueDrop = Math.max(maximumTorqueDrop, previousWheelNm - wheelNm); previousWheelNm = wheelNm;
    if (firstJointDriveKmh === null && s.powertrain.ehs!.directClutch.torqueNm > 30 && s.powertrain.ehs!.p3MechanicalPowerW > 80000)
      firstJointDriveKmh = s.speedKmh;
    if (time100 === null && s.speed >= 100 / 3.6) time100 = (i + 1) * dt;
    if (i % 240 === 239) trace.push({ seconds: (i + 1) * dt, speedKmh: s.speedKmh,
      state: s.powertrain.ehs!.state, rpm: s.rpm, soc: s.powertrain.ev!.stateOfCharge });
  }
  check(time100 !== null && time100 < 15, 'full-chain 0-100 reaches road speed');
  check(firstJointDriveKmh !== null && firstJointDriveKmh < 90, 'P1 actively synchronizes the crank for assistance before 90 km/h');
  check(maximumTorqueDrop < 180, 'full-load path transition cannot withdraw the whole engine branch in one tick');
  check(car.getSnapshot().trip.totalDistanceKm > 0, 'trip receives real simulated distance');
  results.launch = { time100, maxWheelW, maximumGenerationW: generation, firstJointDriveKmh, maximumTorqueDrop, trace };
  const braking: { soc: number; speed: number; distanceM: number; regenSamples: number; hydraulicSamples: number; absSamples: number }[] = [];
  for (const soc of [.6, 1]) {
    const stop = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', speed: 20, stateOfCharge: soc });
    let distanceM = 0, regenSamples = 0, hydraulicSamples = 0, absSamples = 0;
    for (let i = 0; i < 600; i++) {
      const s = stop.stepFixed(dt, { ...input, brake: .7 }, environment);
      distanceM += Math.abs(s.speed) * dt;
      if (s.powertrain.ev!.regenerativeBrakeTorque > 20) regenSamples++;
      if (s.wheels.frontLeft.appliedBrakeTorque + s.wheels.rearLeft.appliedBrakeTorque > 20) hydraulicSamples++;
      if (stop.driverAssists.pressures.some(p => p < .98)) absSamples++;
      check(!s.recoveredFromInvalidState && s.powertrain.ev!.motorTorque <= 0, 'brake blend never propels');
    }
    check(stop.speed < .1 && hydraulicSamples > 0, 'mechanical brakes finish stop with any SOC');
    if (soc < 1) check(regenSamples > 0, 'P3 regenerates through chassis brake coordinator');
    braking.push({ soc, speed: stop.speed, distanceM, regenSamples, hydraulicSamples, absSamples });
  }
  check(Math.abs(braking[0]!.distanceM - braking[1]!.distanceM) < 5, 'hydraulics replace unavailable recovery');
  results.braking = braking;
  const slippery = createWheelContactBuffer();
  for (const id of WHEEL_IDS) Object.assign(slippery[id], SURFACE_MATERIALS.ice, { supportValid: true, height: 0 });
  const absCar = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'D', speed: 20, stateOfCharge: .6 });
  let absReleases = 0, absRegenCuts = 0;
  for (let i = 0; i < 480; i++) {
    const s = absCar.stepFixed(dt, { ...input, brake: 1 }, { wheelContacts: slippery });
    const pressure = Math.min(absCar.driverAssists.pressures[0]!, absCar.driverAssists.pressures[1]!);
    if (pressure < .98) {
      absReleases++;
      check(s.powertrain.ev!.regenerativeBrakeTorque <= absCar.brakes.axleBrakeDemand(true) * pressure + 1,
        'same-tick ABS pressure bounds physical P3 regeneration');
      if (s.powertrain.ev!.regenerativeBrakeTorque < 1) absRegenCuts++;
    }
    check(!s.recoveredFromInvalidState, 'ABS road test remains finite');
  }
  check(absReleases > 0 && absRegenCuts > 0, `low-adhesion braking really exercises ABS and P3 release: ${absReleases}/${absRegenCuts}`);
  results.lowGripABS = { absReleases, absRegenCuts, finalSpeed: absCar.speed };
  const reverse = new VehicleDynamics<EhsHybridSystem>(createQinPlusDmiPhysicsConfig(), { driveSelector: 'R' });
  for (let i = 0; i < 360; i++) reverse.stepFixed(dt, { ...input, throttle: .3 }, environment);
  check(reverse.speed < -.5 && reverse.powertrain.getSnapshot().ehs.directClutch.torqueNm === 0, 'reverse is P3 only');
  check(!reverse.requestDriveSelector('P', 1), 'park lockout while moving');
  results.reverse = { speed: reverse.speed };
  return { assertions, results };
}
