import { mkdirSync, writeFileSync } from 'node:fs';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { createQinPlusDmiPhysicsConfig } from '../src/vehicle/config/qinPlusDmiPhysicsConfig';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { EhsHybridSystem } from '../src/vehicle/powertrain/EhsHybridSystem';
import { createWheelContactBuffer, WHEEL_IDS } from '../src/vehicle/physics/WheelContact';
import { SURFACE_MATERIALS } from '../src/world/SurfaceMaterial';

const dt = 1 / 120, input = createNeutralVehicleInputState();
const contacts = createWheelContactBuffer();
for (const id of WHEEL_IDS) Object.assign(contacts[id], SURFACE_MATERIALS.asphalt, { supportValid: true, height: 0 });
const environment = { wheelContacts: contacts };
type Config = ReturnType<typeof createQinPlusDmiPhysicsConfig>;
function launch(name: string, edit: (c: Config) => void = () => {}, mode: 'EV' | 'HEV' | 'SPORT' = 'HEV', prepared = false) {
  const c = createQinPlusDmiPhysicsConfig(); edit(c);
  const car = new VehicleDynamics<EhsHybridSystem>(c, { driveSelector: 'D', stateOfCharge: .85 });
  car.powertrain.setHybridMode(mode);
  if (prepared) for (let i = 0; i < 360; i++) car.stepFixed(dt, { ...input, throttle: .5, brake: 1 }, environment);
  const trace: unknown[] = []; let time100: number | null = null;
  let lastEngine = false, minimumTorque = Infinity, previousWheelNm = 0, maximumDip = 0;
  const transitions: unknown[] = [];
  let dip: unknown;
  let path = '';
  for (let i = 0; i < 1800; i++) {
    const s = car.stepFixed(dt, { ...input, throttle: 1 }, environment), e = s.powertrain.ehs!, p = car.powertrain;
    if (s.recoveredFromInvalidState) throw Error(name + ' numeric recovery');
    minimumTorque = Math.min(minimumTorque, p.axleOutput.drivenWheelTorque);
    if (previousWheelNm - p.axleOutput.drivenWheelTorque > maximumDip) dip = { t: (i + 1) * dt, previousWheelNm,
      wheelNm: p.axleOutput.drivenWheelTorque, engineRPM: s.rpm, p3Nm: p.p3.deliveredDriveTorque,
      direct: e.directClutch, wheelOmega: s.wheels.frontLeft.angularVelocity,
      priv: (() => { const d = p as unknown as { previousRoadOmega: number; omegaBefore: number; generatorNm: number };
        return { previousRoadOmega: d.previousRoadOmega, omegaBefore: d.omegaBefore, generatorNm: d.generatorNm }; })() };
    maximumDip = Math.max(maximumDip, previousWheelNm - p.axleOutput.drivenWheelTorque);
    previousWheelNm = p.axleOutput.drivenWheelTorque;
    if (path !== e.state || lastEngine !== (s.engineRunning ?? false)) {
      transitions.push({ t: (i + 1) * dt, kmh: s.speedKmh, state: e.state, engine: s.engineRunning,
        torqueNm: p.axleOutput.drivenWheelTorque, motorNm: p.p3.deliveredDriveTorque });
      path = e.state; lastEngine = s.engineRunning ?? false;
    }
    if (i % 60 === 59) trace.push({ t: (i + 1) * dt, kmh: s.speedKmh, throttle: s.throttle, p3Nm: s.powertrain.ev!.motorTorque,
      motorLimitNm: p.p3.driveLimit(1e9), p3KW: e.p3MechanicalPowerW / 1000, packKW: e.busPowerW / 1000,
      dischargeLimitKW: p.battery.availableDischargePower / 1000, generatorKW: e.p1GenerationPowerW / 1000,
      engineRPM: s.rpm, engineKW: e.enginePowerW / 1000, directNm: e.directClutch.torqueNm,
      wheelNm: p.axleOutput.drivenWheelTorque, wheelKW: e.wheelPowerW / 1000,
      tractionFactor: car.driverAssists.torqueLimitFactor, slip: s.wheels.frontLeft.slipRatio,
      dragN: s.forces.aerodynamicDragForce, rollingN: s.forces.rollingResistanceForce,
      massKg: s.effectiveVehicleMass, batteryC: e.battery.temperatureC, motorC: e.p3TemperatureC });
    if (time100 === null && s.speed >= 100 / 3.6) { time100 = (i + 1) * dt; break; }
  }
  return { name, mode, time100, minimumTorque, maximumDip, dip, transitions, trace };
}
const report = [
  launch('HEV'), launch('EV', undefined, 'EV'), launch('SPORT', undefined, 'SPORT'), launch('SPORT-prepared', undefined, 'SPORT', true),
  launch('demand-ceiling-removed', c => c.ehs.control.acceleration = 20),
  launch('fast-pedal-demand', c => c.ehs.control.torqueResponse = 100),
  launch('fast-P3-response', c => c.ehs.p3.driveResponseRate = 100),
  launch('no-direct-path', c => { c.ehs.directDrive.minimumRPM = 6100; c.ehs.directDrive.maximumRPM = 6150; }),
  launch('battery-headroom', c => { c.ehs.battery.maxDischargePower = 200000; c.ehs.battery.electrical!.maxDischargeCurrent = 800; }),
  launch('zero-aero-and-rolling', c => { c.aero.dragCoefficient = 0; c.tires.rollingResistance = 0; }),
];
mkdirSync('artifacts/qin-plus-ehs/audit', { recursive: true });
writeFileSync('artifacts/qin-plus-ehs/audit/acceleration.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.map(({ name, time100, maximumDip }) => ({ name, time100, maximumDip })), null, 2));
