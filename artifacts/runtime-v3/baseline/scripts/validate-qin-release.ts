import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { createVehiclePhysicsConfig, type VehicleId } from '../src/vehicle/VehicleCatalog';
import { isElectricConfig } from '../src/vehicle/config/ElectricVehiclePhysicsConfig';
import { isP2HybridConfig } from '../src/vehicle/config/P2HybridConfig';
import { ICEPowertrain } from '../src/vehicle/powertrain/ICEPowertrain';
import { P2HybridPowertrain } from '../src/vehicle/powertrain/P2HybridPowertrain';
import { ElectricPowertrain } from '../src/vehicle/powertrain/ElectricPowertrain';
import type { Powertrain } from '../src/vehicle/powertrain/Powertrain';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { createQinPlusDmiPhysicsConfig } from '../src/vehicle/config/qinPlusDmiPhysicsConfig';
import { EhsHybridSystem } from '../src/vehicle/powertrain/EhsHybridSystem';
import { createWheelContactBuffer, WHEEL_IDS } from '../src/vehicle/physics/WheelContact';
import { SURFACE_MATERIALS } from '../src/world/SurfaceMaterial';

const out = 'artifacts/qin-plus-ehs/audit'; mkdirSync(out, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(`${out}/${name}.json`, JSON.stringify(data, null, 2) + '\n');
const dt = 1 / 120, input = createNeutralVehicleInputState(), contacts = createWheelContactBuffer();
for (const id of WHEEL_IDS) Object.assign(contacts[id], SURFACE_MATERIALS.asphalt, { supportValid: true, height: 0 });
const environment = { wheelContacts: contacts };
let assertions = 0;
const check = (ok: boolean, m: string) => { assertions++; if (!ok) throw new Error(m); };

const compatibility: unknown[] = [];
for (const id of ['family-sedan', 'mercedes-e300l-v214', 'tank-500-hi4-t', 'xiaomi-su7-max-2026', 'tesla-model-3-rwd', 'porsche-taycan-4s'] as VehicleId[]) {
  const c = createVehiclePhysicsConfig(id), b = createVehiclePhysicsConfig(id);
  // Exactly the constructor dispatch before EHS extraction, including unmodified P2.
  const original = isElectricConfig(b) ? new ElectricPowertrain(b) : isP2HybridConfig(b) ? new P2HybridPowertrain(b) : new ICEPowertrain(b);
  const state = { gear: 1 as const, driveSelector: 'D' as const, stateOfCharge: .7 };
  const current = new VehicleDynamics<Powertrain>(c, state);
  const reference = new VehicleDynamics<Powertrain>(b, state, original);
  const samples: unknown[] = [];
  const digestA = createHash('sha256'), digestB = createHash('sha256');
  for (let i = 0; i < 2400; i++) {
    const t = i * dt;
    const command = { ...input, throttle: t < 10 ? .65 : t < 13 ? .2 : 0,
      steer: t > 8 && t < 11 ? .08 : 0, brake: t > 13 ? .6 : 0 };
    const a = current.stepFixed(dt, command, environment), s = reference.stepFixed(dt, command, environment);
    check(!a.recoveredFromInvalidState && !s.recoveredFromInvalidState, `${id} numeric recovery`);
    if (i % 24 === 23) {
      const jsonA = JSON.stringify(a), jsonB = JSON.stringify(s);
      check(jsonA === jsonB, `${id} existing constructor vs EHS-aware factory behavior changed`);
      digestA.update(jsonA); digestB.update(jsonB);
      if (i % 240 === 239) samples.push({ t: (i + 1) * dt, speedKmh: a.speedKmh,
        rpm: a.rpm, soc: a.powertrain.ev?.stateOfCharge, fuelL: a.fuel?.currentFuelL });
    }
  }
  compatibility.push({ id, identical: true, factoryDigest: digestA.digest('hex'), referenceDigest: digestB.digest('hex'), samples });
}
write('compatibility', { scope: '20 s acceleration/steering/coast/service-brake traces vs original constructor dispatch; not a full vehicle suite', assertions, compatibility });
console.log('Six-vehicle shared-boundary regression passed:', assertions);

const thermal: unknown[] = [];
for (const ambientC of [20, 35]) {
  const c = createQinPlusDmiPhysicsConfig(); c.ambientTemperature = ambientC; c.engine.thermal!.initialTemperatureC = ambientC;
  const car = new VehicleDynamics<EhsHybridSystem>(c, { driveSelector: 'D', stateOfCharge: .30 });
  car.powertrain.setHybridMode('HOLD', .60);
  let batteryHeatJ = 0, engineHeatJ = 0, maxErrorW = 0, generationSeconds = 0;
  const trace: unknown[] = [];
  for (let i = 0; i < 72000; i++) {
    const t = i * dt;
    const target = t < 120 ? (Math.floor(t / 30) % 2 === 0 ? 12 : 0) : t < 480 ? 100 / 3.6 : 50 / 3.6;
    const error = target - car.speed;
    const throttle = target > 0 ? Math.max(0, Math.min(.8, error * .13 + .08)) : 0;
    const brake = target === 0 ? .6 : error < -.7 ? Math.min(.4, -error * .12) : 0;
    const s = car.stepFixed(dt, { ...input, throttle, brake }, environment), h = s.powertrain.ehs!;
    check(!s.recoveredFromInvalidState, 'thermal drive numeric recovery');
    maxErrorW = Math.max(maxErrorW, Math.abs(h.energy.residualW));
    batteryHeatJ += h.losses.batteryW * dt;
    engineHeatJ += (h.losses.fuelW * c.engine.thermal!.heatFraction + h.losses.frictionW) * dt;
    if (h.p1GenerationPowerW > 1000) generationSeconds += dt;
    if (i % 7200 === 7199) trace.push({ seconds: (i + 1) * dt, targetKmh: target * 3.6, speedKmh: s.speedKmh,
      batteryC: h.battery.temperatureC, p1C: h.p1TemperatureC, p3C: h.p3TemperatureC,
      coolantC: car.powertrain.thermal!.temperatureC, soc: h.battery.soc, generationKW: h.p1GenerationPowerW / 1000,
      batteryHeatW: h.losses.batteryW, engineFuelL: s.fuel!.fuelUsedL, state: h.state });
  }
  check(maxErrorW < 2, 'energy conservation while driving actual wheel/chassis dynamics');
  const snapshot = car.powertrain.getSnapshot();
  check(snapshot.ehs.battery.temperatureC > ambientC && car.powertrain.thermal!.temperatureC > ambientC,
    'battery and coolant heat from losses during real driving');
  check(generationSeconds > 100 && batteryHeatJ > 0 && engineHeatJ > 0, 'sustained generation and measured heat inputs');
  thermal.push({ ambientC, simulatedSeconds: 600, generationSeconds, batteryHeatJ, engineHeatJ, maxErrorW, trace });
  console.log('Driving thermal trace complete:', ambientC, 'C');
}
write('thermal-driving', { scope: 'Closed-loop driving through wheel/chassis physics; temperature accuracy remains engineering calibration, not real-vehicle validation', thermal });
console.log('Release-focused checks passed:', assertions);
