import * as T from 'three';
import { Tank500Display } from './Tank500Displays';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { createTank500Hi4TPhysicsConfig } from '../config/tank500Hi4TPhysicsConfig';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { createTPMSState } from '../TPMSState';
import { WHEEL_IDS } from '../physics/WheelContact';

export function runTank500DisplaysSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Tank HMI: ${message}`); };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const texts: string[] = [];
  const context = new Proxy({ fillStyle: '', font: '', textAlign: '', fillRect() {}, fillText(s: string) { texts.push(s); } }, {
    get: (target, key) => key in target ? Reflect.get(target, key) : key === 'createLinearGradient' || key === 'createRadialGradient' ?
      () => ({ addColorStop() {} }) : () => {},
  });
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  const displays: Tank500Display[] = [];
  try {
    const snapshot = new VehicleDynamics(createTank500Hi4TPhysicsConfig()).getSnapshot();
    const tpms = createTPMSState(true);
    WHEEL_IDS.forEach((id, i) => Object.assign(tpms[id], { valid: true, pressureKPa: 240 + i, temperatureC: 20, targetColdPressureKPa: 240 }));
    const instrument = new Tank500Display(), center = new Tank500Display(true); displays.push(instrument, center);
    const telemetry: InstrumentTelemetry = { speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: true,
      driveAvailable: true, hybrid: snapshot.powertrain.hybrid, fuelLevel: .7, tpmsState: tpms };
    instrument.update(telemetry, 1);
    assert(texts.includes('READY') && texts.includes('燃油 70%') && texts.includes('胎压正常'), 'live READY, measured fuel and TPMS states');
    texts.length = 0; tpms.warning = true; tpms.frontLeft.pressureState = 'LOW';
    instrument.update({ ...telemetry, fuelLevel: .03 }, 1 / 120);
    assert(texts.includes('燃油 3% · 低油量') && texts.includes('胎压告警'), 'warning transition bypasses display rate gate');
    texts.length = 0; center.update(telemetry, 1);
    assert(texts.includes('左前 240 kPa') && texts.includes('右后 243 kPa'), 'all four sensor pressures retain kPa units');
    texts.length = 0; tpms.frontLeft.valid = false; tpms.frontLeft.pressureKPa = null; center.update(telemetry, 1);
    assert(texts.includes('左前 —'), 'invalid sensor never invents a pressure');
    texts.length = 0; instrument.update({ ...telemetry, ignitionOn: false, driveAvailable: false }, 1 / 120);
    assert(texts.length === 0 && context.fillStyle === '#000000', 'shutdown immediately blanks the instrument');
    texts.length = 0; center.update({ ...telemetry, ignitionOn: false, driveAvailable: false }, 1 / 120);
    assert(texts.length === 0, 'disconnected shutdown blanks the centre display');
    const charging = { ...snapshot.powertrain.hybrid!, battery: { ...snapshot.powertrain.hybrid!.battery,
      connector: 'AC' as const, state: 'CHARGING' as const, gridPowerW: 6600 } };
    center.update({ ...telemetry, ignitionOn: false, driveAvailable: false, hybrid: charging }, 1 / 120);
    assert(texts.includes('外接充电 · 车辆电源关闭') && texts.some(t => t.includes('6.6 kW')) && !texts.includes('READY'), 'powered-off charging has its own truthful status page');
    return { assertions };
  } finally {
    displays.forEach(display => display.traverse(object => {
      if (object instanceof T.Mesh) { object.geometry.dispose(); for (const m of Array.isArray(object.material) ? object.material : [object.material]) m.dispose(); }
    }));
    displays.forEach(display => display.texture.dispose());
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
}
