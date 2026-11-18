import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createDefaultVehiclePhysicsConfig } from '../config';
import { createBMW530LiPhysicsConfig } from '../config/bmw530LiPhysicsConfig';
import { createExecutiveSedanPhysicsConfig } from '../config/executiveSedanPhysicsConfig';
import { createTeslaModel3PhysicsConfig } from '../config/teslaModel3PhysicsConfig';
import { createTaycan4SPhysicsConfig } from '../config/taycan4SPhysicsConfig';
import { createRoadSUVPhysicsConfig } from '../config/roadSUVPhysicsConfig';
import { createTyreThermalPressureConfig } from '../config/TyreThermalPressureConfig';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { TPMSSensor } from '../TPMSState';
import { TyreThermalPressureSystem, TYRE_ATMOSPHERIC_PRESSURE_PA } from './TyreThermalPressureSystem';
import { TyreGripModel } from './TyreGripModel';
import { VehicleDynamics } from './VehicleDynamics';
import { WHEEL_IDS, type WheelId } from './WheelContact';
import type { Powertrain } from '../powertrain/Powertrain';
import { WheelRotationSystem } from './WheelRotationSystem';

export function runTyreThermalPressureSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Tyre thermal/TPMS: ${message}`); };
  const config = createDefaultVehiclePhysicsConfig();
  config.tires.thermalPressureFront = createTyreThermalPressureConfig(245);
  config.tires.thermalPressureRear = createTyreThermalPressureConfig(260);
  const system = new TyreThermalPressureSystem(config.tires, 20);
  const state = system.states.frontLeft;
  const setRatio = (id: WheelId, ratio: number) => {
    const c = system.configs[id];
    system.states[id].temperatureC = (c.referenceTemperatureC + 273.15) *
      (c.referenceColdPressureKPa * ratio * 1000 + TYRE_ATMOSPHERIC_PRESSURE_PA) /
      (c.referenceColdPressureKPa * 1000 + TYRE_ATMOSPHERIC_PRESSURE_PA) - 273.15;
    system.refresh(id);
  };
  assert(Math.abs(state.gaugePressureKPa - 245) < 1e-9 && system.states.rearLeft.gaugePressureKPa === 260, 'reference gauge pressures and axle targets');
  assert(state.absolutePressurePa === 346325, 'reference gauge to absolute adds standard atmosphere');
  state.temperatureC = 40; system.refresh('frontLeft');
  assert(Math.abs(state.absolutePressurePa - 346325 * 313.15 / 293.15) < 1e-8, 'Kelvin absolute gas relation');
  assert(state.gaugePressureKPa > 245 && state.warningState === 'NORMAL', 'ordinary hot pressure rises without high warning');
  const hotPressure = state.gaugePressureKPa;
  state.temperatureC = 30; system.refresh('frontLeft');
  assert(state.gaugePressureKPa < hotPressure && state.gaugePressureKPa > 245, 'pressure falls monotonically as temperature falls');
  system.reset(-10);
  assert(state.temperatureC === -10 && state.gaugePressureKPa < 245 && state.gaugePressureKPa > 0, 'spawn uses actual cold ambient');
  system.configs.frontLeft.initialTemperatureOffsetC = 3; system.reset(10);
  assert(state.temperatureC === 13, 'optional preconditioning offset');
  system.configs.frontLeft.initialTemperatureOffsetC = 0;
  const run = (seconds: number, rolling: number, speed: number, fx = 0, slip = 0, fy = 0, side = 0, id: WheelId = 'frontLeft') => {
    for (let i = 0; i < seconds * 120; i++) system.accumulate(id, 1 / 120, 20, rolling, speed, fx, slip, fy, side);
  };
  system.reset(20); state.temperatureC = 60; system.refresh('frontLeft'); run(20, 0, 0);
  assert(state.temperatureC < 60 && state.temperatureC > 59, 'parking cooldown stays slow over twenty seconds');
  const slowCooldown = state.temperatureC;
  state.temperatureC = 60; run(20, 0, 30);
  assert(state.temperatureC < slowCooldown && state.temperatureC > 55, 'airflow strengthens gradual cooling');
  system.reset(20); run(300, 45, 28);
  const cruiseC = state.temperatureC;
  assert(cruiseC > 24 && cruiseC < 40 && state.gaugePressureKPa > 245, 'five-minute rolling cruise warms moderately and raises pressure');
  system.reset(20); run(10, 45, 28);
  assert(state.temperatureC < 21, 'ten-second cruise cannot jump forty degrees');
  const rollingC = state.temperatureC;
  system.reset(20); run(10, 45, 28, 2000, 2);
  assert(state.temperatureC > rollingC, 'traction slip work adds heat');
  system.reset(20); run(10, 45, 28, -2000, -2);
  assert(state.temperatureC > rollingC, 'braking slip work adds heat with either sign');
  system.reset(20); run(10, 45, 28, 0, 0, -2000, 1);
  run(10, 30, 28, 0, 0, -800, .4, 'frontRight');
  assert(state.temperatureC > system.states.frontRight.temperatureC && system.states.rearLeft.temperatureC === 20,
    'corner work produces independent loaded/slipping wheel heat without extra load multiplier');
  const beforeCooling = state.temperatureC, beforePressure = state.gaugePressureKPa;
  run(120, 0, 0);
  assert(state.temperatureC < beforeCooling && state.temperatureC > 20 && state.gaugePressureKPa < beforePressure, 'cooling closes pressure loop');
  setRatio('frontLeft', .8);
  assert(state.rollingResistanceFactor > 1 && state.longitudinalStiffnessFactor < 1 && state.lateralStiffnessFactor < 1,
    'low pressure adds road load and softens stiffness');
  assert(state.rollingResistanceFactor < 1.08 && state.lateralStiffnessFactor > .97, 'moderate low-pressure effects are restrained');
  setRatio('frontLeft', 1.2);
  assert(state.rollingResistanceFactor < 1 && state.rollingResistanceFactor > .97 && state.lateralStiffnessFactor > 1 && state.lateralStiffnessFactor < 1.03,
    'moderate high pressure mildly reduces rolling resistance and sharpens stiffness');
  const grip = new TyreGripModel(config.tires);
  for (const ratio of [.8, 1, 1.2]) {
    setRatio('frontLeft', ratio);
    assert(Math.abs(grip.longitudinalForce(config.tires.peakSlipRatio / state.longitudinalStiffnessFactor, 3000,
      state.longitudinalStiffnessFactor) - 3000) < 1e-7, 'pressure stiffness preserves longitudinal peak capability');
    assert(Math.abs(grip.lateralForce(config.tires.peakSlipAngle, 30000 * state.lateralStiffnessFactor, 3000)) === 3000,
      'pressure stiffness preserves lateral peak capability');
  }
  setRatio('frontLeft', .5);
  assert(state.rollingResistanceFactor <= 1.4 && state.lateralStiffnessFactor >= .85, 'abnormally low corrections are bounded');
  const lowFactor = state.rollingResistanceFactor;
  setRatio('frontLeft', .501);
  assert(Math.abs(state.rollingResistanceFactor - lowFactor) < .002, 'low-pressure correction remains continuous');
  const sensor = new TPMSSensor(system, true);
  setRatio('frontLeft', 1); setRatio('frontRight', .75); setRatio('rearLeft', .55); setRatio('rearRight', 1.5);
  sensor.reset();
  assert(sensor.state.frontLeft.pressureState === 'NORMAL' && sensor.state.frontRight.pressureState === 'LOW' &&
    sensor.state.rearLeft.pressureState === 'CRITICAL_LOW' && sensor.state.rearRight.pressureState === 'HIGH' && sensor.state.warning,
    'four independent warnings aggregate in shared state');
  for (const id of WHEEL_IDS) setRatio(id, 1);
  sensor.reset(); const coldDisplay = sensor.state.frontLeft.pressureKPa!;
  state.temperatureC = 60; system.refresh('frontLeft'); sensor.update(.49);
  assert(sensor.state.frontLeft.pressureKPa === coldDisplay, 'sensor does not publish physics-tick fluctuations');
  sensor.update(.01);
  assert(sensor.state.frontLeft.pressureKPa! > coldDisplay && sensor.state.frontLeft.pressureKPa! < state.gaugePressureKPa &&
    Number.isInteger(sensor.state.frontLeft.pressureKPa), 'time filter and 1 kPa quantization');
  state.gaugePressureKPa = NaN; sensor.update(.5);
  assert(!sensor.state.frontLeft.valid && sensor.state.frontLeft.pressureKPa === null && !sensor.state.warning, 'invalid sensor safely clears reading and stale warning');
  system.refresh('frontLeft'); sensor.update(.5);
  assert(sensor.state.frontLeft.valid, 'sensor recovers without NaN contaminating filter');
  const absent = new TPMSSensor(system, false);
  assert(!absent.state.available && !absent.state.frontLeft.valid && state.gaugePressureKPa > 245, 'physical tyres exist without TPMS presentation');
  state.temperatureC = NaN; system.refresh('frontLeft');
  system.accumulate('frontLeft', NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN);
  assert(Number.isFinite(state.absolutePressurePa) && state.gaugePressureKPa > 0, 'invalid physical input stays finite');
  const invalid = createBMW530LiPhysicsConfig(); invalid.tires.thermalPressureFront!.thermalCapacity = -1;
  let rejected = false; try { validateVehiclePlatformConfig(invalid); } catch { rejected = true; }
  assert(rejected, 'invalid thermal config rejected at startup');
  const wheelForces = (temperatureC: number) => {
    const wheels = new WheelRotationSystem(config.tires, config.wheelRadius);
    wheels.reset(15); wheels.tyres.states.frontLeft.temperatureC = temperatureC; wheels.tyres.refresh('frontLeft');
    return wheels.updateWheel('frontLeft', 0, { longitudinalSpeed: 14.8, lateralSpeed: .2,
      driveTorque: 0, brakeTorque: 0, handbrakeTorque: 0, normalLoad: 4000, surfaceLongitudinalGrip: 1, corneringStiffness: 35000 });
  };
  setRatio('frontLeft', .8); const lowForces = wheelForces(state.temperatureC);
  const nominalForces = wheelForces(20);
  setRatio('frontLeft', 1.2); const highForces = wheelForces(state.temperatureC);
  assert(Math.abs(lowForces.longitudinalForce) < Math.abs(nominalForces.longitudinalForce) &&
    Math.abs(highForces.longitudinalForce) > Math.abs(nominalForces.longitudinalForce), 'pressure stiffness reaches actual longitudinal wheel force solver');
  assert(Math.abs(lowForces.lateralForce) < Math.abs(nominalForces.lateralForce) &&
    Math.abs(highForces.lateralForce) > Math.abs(nominalForces.lateralForce), 'pressure stiffness reaches actual small-angle lateral wheel forces');
  const roadLoadVehicle = new VehicleDynamics(createBMW530LiPhysicsConfig(), { speed: 25, driveSelector: 'N' });
  const normalRoadLoad = Math.abs(roadLoadVehicle.update(1 / 120, createNeutralVehicleInputState()).forces.rollingResistanceForce);
  roadLoadVehicle.setPose(0, 0, 0, 25);
  for (const id of WHEEL_IDS) {
    const c = roadLoadVehicle.wheelRotation.tyres.configs[id], physical = roadLoadVehicle.wheelRotation.tyres.states[id];
    physical.temperatureC = 293.15 * (c.referenceColdPressureKPa * .8 * 1000 + TYRE_ATMOSPHERIC_PRESSURE_PA) /
      (c.referenceColdPressureKPa * 1000 + TYRE_ATMOSPHERIC_PRESSURE_PA) - 273.15;
    roadLoadVehicle.wheelRotation.tyres.refresh(id);
  }
  const lowRoadLoad = Math.abs(roadLoadVehicle.update(1 / 120, createNeutralVehicleInputState()).forces.rollingResistanceForce);
  assert(lowRoadLoad > normalRoadLoad * 1.04 && lowRoadLoad < normalRoadLoad * 1.08, 'low pressure modifies existing chassis rolling road load, without an energy multiplier');

  const factories = { BMW: createBMW530LiPhysicsConfig, Tesla: createTeslaModel3PhysicsConfig,
    Taycan: createTaycan4SPhysicsConfig, Audi: createExecutiveSedanPhysicsConfig };
  const regression: Record<string, { maxSpeedDifferenceMps: number; maxYawDifferenceRad: number; maximumTemperatureC: number }> = {};
  for (const [name, factory] of Object.entries(factories)) {
    const actualConfig = factory(), baselineConfig = factory();
    for (const tyre of [baselineConfig.tires.thermalPressureFront!, baselineConfig.tires.thermalPressureRear!]) {
      tyre.rollingResistancePressureSensitivity = tyre.longitudinalStiffnessPressureSensitivity = tyre.lateralStiffnessPressureSensitivity = 0;
    }
    const actual = new VehicleDynamics<Powertrain>(actualConfig, { driveSelector: 'D' });
    const baseline = new VehicleDynamics<Powertrain>(baselineConfig, { driveSelector: 'D' });
    assert(actual.getSnapshot().tpmsState.available, `${name} supplies shared TPMS from physics`);
    let maxSpeed = 0, maxYaw = 0, maximumTemperatureC = 20;
    const drive = (seconds: number, throttle: number, brake = 0, steering = 0) => {
      const input = { ...createNeutralVehicleInputState(), throttle, brake, steering };
      for (let i = 0; i < seconds * 120; i++) {
        const a = actual.update(1 / 120, input), b = baseline.update(1 / 120, input);
        maxSpeed = Math.max(maxSpeed, Math.abs(a.speed - b.speed)); maxYaw = Math.max(maxYaw, Math.abs(a.yaw - b.yaw));
        for (const id of WHEEL_IDS) maximumTemperatureC = Math.max(maximumTemperatureC, a.wheels[id].tyre!.temperatureC);
      }
    };
    drive(6, .55);
    actual.setPose(0, 0, 0, 28); baseline.setPose(0, 0, 0, 28);
    drive(4, .12); // 80–120 km/h short cruise
    drive(3, .12, 0, .025); drive(3, 0, .55);
    assert(maxSpeed < .10 && maxYaw < .01, `${name} normal acceleration/cruise/corner/brake remains near pressure-neutral baseline`);
    assert(maximumTemperatureC < 25 && !actual.tpms.state.warning, `${name} short normal drive has gradual heat and no warning`);
    const heat = actual.wheelRotation.tyres.states.rearLeft.temperatureC;
    actual.setPose(2, 2, 0, 0);
    assert(actual.wheelRotation.tyres.states.rearLeft.temperatureC === heat, 'pose/respawn preserves tyre heat');
    actual.reset({ driveSelector: 'D', ambientTemperatureC: 10 });
    assert(actual.wheelRotation.tyres.states.rearLeft.temperatureC === 10, 'full reset returns cold state deterministically');
    regression[name] = { maxSpeedDifferenceMps: maxSpeed, maxYawDifferenceRad: maxYaw, maximumTemperatureC };
  }
  const tesla = new VehicleDynamics<Powertrain>(createTeslaModel3PhysicsConfig(), { driveSelector: 'D' });
  const taycan = new VehicleDynamics<Powertrain>(createTaycan4SPhysicsConfig(), { driveSelector: 'D' });
  const hardInput = { ...createNeutralVehicleInputState(), throttle: 1 };
  for (let i = 0; i < 8 * 120; i++) { tesla.update(1 / 120, hardInput); taycan.update(1 / 120, hardInput); }
  const rearHeat = tesla.wheelRotation.tyres.states.rearLeft.temperatureC;
  assert(rearHeat > tesla.wheelRotation.tyres.states.frontLeft.temperatureC, 'actual RWD acceleration heats driven rear tyres more');
  const totalHeat = (vehicle: VehicleDynamics<Powertrain>) => WHEEL_IDS.reduce((sum, id) => sum + vehicle.wheelRotation.tyres.states[id].temperatureC - 20, 0);
  assert(totalHeat(taycan) > totalHeat(tesla), 'actual Taycan loads/calibration warm more under hard acceleration than efficiency Tesla');
  const accelerationHeat = { Tesla: totalHeat(tesla), Taycan: totalHeat(taycan) };
  const hotC = taycan.wheelRotation.tyres.states.frontLeft.temperatureC;
  const brakeInput = { ...createNeutralVehicleInputState(), brake: 1 };
  for (let i = 0; i < 2 * 120; i++) taycan.update(1 / 120, brakeInput);
  assert(taycan.wheelRotation.tyres.states.frontLeft.temperatureC > hotC, 'actual braking force/slip feeds thermal pipeline');
  const suv = new VehicleDynamics(createRoadSUVPhysicsConfig());
  assert(suv.tpms.state.available && suv.tpms.state.frontLeft.targetColdPressureKPa !== suv.tpms.state.rearLeft.targetColdPressureKPa,
    'SUV available with independent axle targets');
  return { assertions, cruiseTemperatureC: cruiseC, regression, hardAccelerationHeatC: accelerationHeat };
}
