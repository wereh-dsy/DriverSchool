import * as T from 'three';
import { createBMW530LiPhysicsConfig } from '../config/bmw530LiPhysicsConfig';
import { createTaycan4SPhysicsConfig } from '../config/taycan4SPhysicsConfig';
import { createTeslaModel3PhysicsConfig } from '../config/teslaModel3PhysicsConfig';
import { TyreThermalPressureSystem } from '../physics/TyreThermalPressureSystem';
import { TPMSSensor } from '../TPMSState';
import { WHEEL_IDS } from '../physics/WheelContact';
import { SharedVehicleData } from '../SharedVehicleData';
import { BMW530CenterDisplay } from './BMW530CenterDisplay';
import { TaycanCenterDisplay } from './TaycanCenterDisplay';
import { PremiumEVInstruments } from './PremiumEVInstruments';
import { ElectricCenterDisplay } from './ElectricCenterDisplay';
import { ElectricDisplayContext } from './ElectricDisplayContext';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { luxuryVehicleStatusKey, tyrePressureReading, drawLuxuryVehicleStatusPage } from './LuxuryVehicleStatusPage';
import type { InstrumentTelemetry } from './InstrumentCluster';

/** TPMS-only canvas integration; no full cockpit/geometry/visual suite. */
export function runTPMSDisplaysSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`TPMS display: ${message}`); };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const texts: { text: string; color: unknown }[] = [];
  const makeCanvas = () => {
    const values: Record<string, unknown> = {};
    const context = new Proxy({} as CanvasRenderingContext2D, {
      get: (_target, key: string) => {
        if (key === 'fillText') return (text: string) => texts.push({ text, color: values.fillStyle });
        if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (key.startsWith('create')) return () => ({ addColorStop: () => {} });
        return values[key] ?? (() => {});
      }, set: (_target, key: string, value) => { values[key] = value; return true; },
    });
    return { width: 1024, height: 640, getContext: () => context } as unknown as HTMLCanvasElement;
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: makeCanvas } });
  const assets = new VehicleAssetRegistry();
  const shared = new SharedVehicleData({ lanes: false, navigation: false, proximity: false, tpms: true });
  try {
    const system = new TyreThermalPressureSystem(createBMW530LiPhysicsConfig().tires);
    const sensor = new TPMSSensor(system, true);
    for (let i = 0; i < 4; i++) { system.states[WHEEL_IDS[i]!].temperatureC = 30 + i * 5; system.refresh(WHEEL_IDS[i]!); }
    sensor.reset(); shared.publishTPMS(sensor.state);
    const telemetry: InstrumentTelemetry = { speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: true,
      driveAvailable: true, tpmsState: sensor.state, sharedVehicle: shared };
    const expected = WHEEL_IDS.map(id => String(sensor.state[id].pressureKPa));
    const bmw = new BMW530CenterDisplay('BMW 530Li');
    bmw.update(telemetry, .5);
    bmw.click(new T.Vector2(.34, .92)); texts.length = 0; bmw.update(telemetry, .5);
    assert(expected.every(pressure => texts.some(v => v.text === pressure)), 'BMW four wheels consume measured shared sensor pressures');
    assert(!texts.some(v => /^~ (250|260)$/.test(v.text)), 'BMW removes fixed tyre references');
    const version = bmw.texture.version; bmw.update(telemetry, .5);
    assert(bmw.texture.version === version, 'unchanged sensor reading does not redraw BMW');
    const status = { vehicleName: 'Audi A6L', tpmsState: sensor.state };
    const key = luxuryVehicleStatusKey(status, true);
    texts.length = 0; drawLuxuryVehicleStatusPage(makeCanvas().getContext('2d')!, status, true);
    assert(expected.every(pressure => texts.some(v => v.text === pressure)), 'shared luxury status accepts the same source');
    sensor.state.frontLeft.pressureKPa! += 1;
    assert(key !== luxuryVehicleStatusKey(status, true), 'measured pressure invalidates common page key');
    sensor.state.frontLeft.valid = false; sensor.state.frontLeft.pressureKPa = null;
    texts.length = 0; bmw.update(telemetry, .5);
    assert(texts.some(v => v.text === '--') && tyrePressureReading(status, 0) === undefined, 'invalid BMW/shared reading has blank fallback');
    sensor.reset();
    const taycanSystem = new TyreThermalPressureSystem(createTaycan4SPhysicsConfig().tires);
    const taycanSensor = new TPMSSensor(taycanSystem, true);
    taycanSystem.states.frontLeft.temperatureC = -45; taycanSystem.refresh('frontLeft'); taycanSensor.reset();
    const center = new TaycanCenterDisplay(assets), instrument = new PremiumEVInstruments(assets);
    center.selectVehiclePage('status');
    const porsche = { ...telemetry, tpmsState: taycanSensor.state };
    texts.length = 0; center.update(porsche, .5); instrument.update(porsche, .5);
    assert(WHEEL_IDS.every(id => texts.some(v => v.text === String(taycanSensor.state[id].pressureKPa))), 'Taycan four-wheel status uses identical shared contract');
    assert(texts.some(v => v.text === 'Tyre pressure warning') && texts.some(v => v.text === 'TPMS'), 'Taycan overall warning reaches existing status and instrument area');
    const drawCount = center.surface.regions[1]!.redraws;
    for (let i = 0; i < 120; i++) center.update(porsche, 1 / 120);
    assert(center.surface.regions[1]!.redraws === drawCount, 'unchanged Taycan sensor reading does not redraw');
    const teslaSystem = new TyreThermalPressureSystem(createTeslaModel3PhysicsConfig().tires);
    const teslaSensor = new TPMSSensor(teslaSystem, true);
    teslaSystem.states.rearLeft.temperatureC = -40; teslaSystem.refresh('rearLeft'); teslaSensor.reset();
    const context = new ElectricDisplayContext(shared), display = new ElectricCenterDisplay(assets), canvas = makeCanvas();
    const tesla = { ...telemetry, tpmsState: teslaSensor.state, electricDisplay: context.data };
    texts.length = 0; display.update(canvas, tesla, .5);
    assert(texts.some(v => v.text === String(teslaSensor.state.rearLeft.pressureKPa)) && texts.some(v => v.text === 'kPa'), 'Tesla parking status displays sensor values');
    assert(texts.some(v => v.text === 'TYRE PRESSURE'), 'Tesla uses shared aggregate warning');
    texts.length = 0; context.data.parking = false; context.data.version++; display.update(canvas, tesla, .5);
    assert(!texts.some(v => v.text === 'kPa'), 'compact tyre readings confined to parking status');
    bmw.texture.dispose(); context.dispose();
    for (const surface of [center.surface, instrument.surface]) {
      for (const region of surface.regions) { region.texture.dispose(); region.material.dispose(); region.mesh.geometry.dispose(); }
    }
  } finally {
    shared.dispose(); assets.dispose();
    if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document');
  }
  return { assertions };
}
