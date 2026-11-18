import * as T from 'three';
import { VehicleVisual } from './VehicleVisual';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { QinPlusDisplay } from './QinPlusDisplays';
import { getVehicleDescriptor } from '../VehicleCatalog';
import { createQinPlusDmiPhysicsConfig } from '../config/qinPlusDmiPhysicsConfig';
import { EhsHybridSystem } from '../powertrain/EhsHybridSystem';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import type { InstrumentTelemetry } from './InstrumentCluster';

/** Geometry/material/HMI integration only. Subjective visual acceptance stays manual. */
export function runQinPlusVisualSelfTests() {
  let assertions = 0;
  const check = (ok: boolean, m: string) => { assertions++; if (!ok) throw new Error(`Qin visual: ${m}`); };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const texts: string[] = [];
  const context = new Proxy({ fillText: (s: string) => texts.push(s), measureText: (s: string) => ({ width: s.length * 14 }) }, {
    get: (target, key) => key in target ? Reflect.get(target, key) : key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => ({ addColorStop() {} }) : () => {},
  });
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  const visuals: VehicleVisual[] = [];
  const assets = new VehicleAssetRegistry();
  try {
    const c = getVehicleDescriptor('byd-qin-plus-dmi-210-2026').visualConfig;
    const a = new VehicleVisual(c, assets); visuals.push(a);
    const b = new VehicleVisual(c, assets); visuals.push(b);
    const materials = (visual: VehicleVisual) => {
      const set = new Set<T.Material>();
      visual.root.traverse(o => { if (o instanceof T.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) set.add(m); });
      return set;
    };
    const first = materials(a), second = materials(b);
    check([...first].every(m => !second.has(m)), 'two Qin vehicles own independent interior/exterior/display materials');
    const displays: QinPlusDisplay[] = [];
    a.root.traverse(o => { if (o instanceof QinPlusDisplay) displays.push(o); });
    check(displays.length === 2 && displays[0]!.texture !== displays[1]!.texture, 'instrument and navigation canvases are independent');
    const bounds = new T.Box3().setFromObject(a.exteriorRoot);
    check(Math.abs(bounds.min.z + c.vehicleLength / 2) < .003 && Math.abs(bounds.max.z - c.vehicleLength / 2) < .003,
      'bumper envelope matches collision length');
    const wheelPositions = localWheelPositions(c.dimensions);
    for (const id of VEHICLE_WHEEL_IDS) {
      const w = wheelPositions[id], p = a.wheelPivots[id].position;
      check(Math.abs(p.x - w.x) < .001 && Math.abs(p.z - w.z) < .001, `physical/visual wheel datum ${id}`);
      check(b.wheelPivots[id].userData.wheelId === id && b.wheelPivots[id].children[0]!.name.includes('tyre'),
        `cached second instance binds spinning tyre ${id}`);
    }
    let meshes = 0; a.root.traverse(o => { if (o instanceof T.Mesh) meshes++; });
    check(meshes < 180, 'bounded procedural mesh count');
    const p = new EhsHybridSystem(createQinPlusDmiPhysicsConfig()); p.reset({ driveSelector: 'D' });
    const snapshot = p.getSnapshot();
    const t: InstrumentTelemetry = { speedKmh: 40, rpm: 0, gear: 'D', ignitionOn: true,
      engineRunning: false, ehs: snapshot.ehs, ev: snapshot.ev };
    a.updateInstruments(t, 1);
    check(texts.some(s => s.includes('SOC 80.0%')) && texts.some(s => s.includes('发动机停止')), 'real EHS/pack display data');
    texts.length = 0; a.cockpitRoot.cycleCenterDisplayPage(); a.updateInstruments(t, 1);
    check(texts.some(s => s.includes('导航数据不可用')), 'navigation has honest unavailable state');
    texts.length = 0; a.updateInstruments({ ...t, ignitionOn: false }, 1);
    check(texts.length === 0, 'powered-off screens blank');
    const center = displays.find(d => d.name.includes('DiLink'))!;
    texts.length = 0; center.update({ ...t, ignitionOn: false, ehs: { ...snapshot.ehs,
      battery: { ...snapshot.ehs.battery, connector: 'AC', state: 'CHARGING', gridPowerW: 6600 } } }, 1);
    check(texts.some(s => s.includes('6.6 kW')) && texts.some(s => s.includes('外接AC充电')), 'powered-off charging display');
    check(p.energyManagement.mode === snapshot.ehs.mode, 'display updates never change physical control mode');
    return { assertions, meshes, bumperBounds: { minZ: bounds.min.z, maxZ: bounds.max.z }, materialsPerInstance: first.size };
  } finally {
    visuals.forEach(v => v.dispose());
    assets.dispose();
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
}
