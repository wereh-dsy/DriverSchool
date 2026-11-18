import * as T from 'three';
import { VehicleVisual } from './VehicleVisual';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { QinPlusDisplay } from './QinPlusDisplays';
import { getVehicleDescriptor } from '../VehicleCatalog';
import { createQinPlusDmiPhysicsConfig } from '../config/qinPlusDmiPhysicsConfig';
import { EhsHybridSystem } from '../powertrain/EhsHybridSystem';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { QIN_PLUS_DMI_VISUAL_CONFIG } from './QinPlusVisualConfig';
import { MirrorAdjustmentController } from '../../camera/MirrorAdjustmentController';
import { MirrorSystem } from '../../camera/MirrorSystem';

/** Independent surface cabin: validate physical envelopes and sightlines rather
 * than requiring legacy cockpit names or BoxGeometry-only panels. */
export function runQinPlusStructureSelfTest(visual: VehicleVisual) {
  let assertions = 0, closureRays = 0;
  const check = (ok: boolean, message: string) => { assertions++; if (!ok) throw Error('Qin structure: ' + message); };
  const c = QIN_PLUS_DMI_VISUAL_CONFIG, root = visual.root;
  root.updateMatrixWorld(true);
  const part = (name: string) => {
    const object = root.getObjectByName(name);
    check(object instanceof T.Mesh, name + ' exists');
    return object as T.Mesh;
  };
  const column = part('Qin enclosed steering column') as T.Mesh<T.CylinderGeometry>;
  const hub = new T.Vector3(...c.steeringWheelPosition), mount = new T.Vector3(...c.steeringColumnMountPosition!);
  const ends = [-1, 1].map(s => new T.Vector3(0, s * column.geometry.parameters.height / 2, 0).applyMatrix4(column.matrixWorld));
  check(Math.min(...ends.map(p => p.distanceTo(hub))) < .03, 'column joins hub');
  check(Math.min(...ends.map(p => p.distanceTo(mount))) < 1e-8, 'column reaches authored dashboard mount');
  check(mount.clone().sub(hub).normalize().dot(new T.Vector3(0, 0, -1).transformDirection(visual.cockpitRoot.steeringWheelBase.matrixWorld)) > .999,
    'column follows configured wheel axis');
  const rim = part('Qin three-spoke leather steering rim') as T.Mesh<T.TorusGeometry>;
  const diameter = 2 * (rim.geometry.parameters.radius + rim.geometry.parameters.tube);
  check(diameter >= .35 && diameter <= .39 && rim.geometry.parameters.arc === Math.PI * 2, 'closed full-size wheel');
  const floor = part('Qin carpet floor'), dash = part('Qin flowing two-tone dashboard');
  const floorBox = new T.Box3().setFromObject(floor);
  check(floorBox.max.y - floorBox.min.y <= .03, 'thin actual floor');
  const screens: QinPlusDisplay[] = [], opaque: T.Mesh[] = [];
  root.traverse(o => {
    if (o instanceof QinPlusDisplay) screens.push(o);
    if (o instanceof T.Mesh && (Array.isArray(o.material) ? o.material : [o.material]).every(m => !m.transparent)) opaque.push(o);
  });
  check(screens.length === 2, 'independent instrument and centre screens');
  const instrument = screens.find(o => !o.name.includes('DiLink'))!;
  const eye = new T.Vector3(...c.driverEyePosition), ray = new T.Raycaster(); ray.layers.enableAll();
  const clear = (target: T.Vector3, objects: T.Object3D[]) => {
    ray.set(eye, target.clone().sub(eye).normalize()); ray.far = target.distanceTo(eye) - .002;
    return ray.intersectObjects(objects, false).length === 0;
  };
  for (const angle of [0, -.5, .5]) {
    visual.setSteeringWheelAngle(angle); root.updateMatrixWorld(true);
    for (const x of [-.07, 0, .07]) for (const y of [-.02, 0, .02]) {
      const target = instrument.screen.localToWorld(new T.Vector3(x, y, .0001));
      check(clear(target, opaque.filter(o => o !== instrument.screen)), 'actual primary instrument readout visible');
    }
    for (let i = 0; i < 24; i++) {
      const theta = i / 24 * Math.PI * 2;
      const target = rim.localToWorld(new T.Vector3(Math.cos(theta) * rim.geometry.parameters.radius, Math.sin(theta) * rim.geometry.parameters.radius, 0));
      const obstacles = opaque.filter(o => !visual.cockpitRoot.steeringWheelBase.getObjectById(o.id));
      const visible = clear(target, obstacles);
      check(visible, `full rim clears actual cabin (${angle}/${i}: ${visible ? '' : ray.intersectObjects(obstacles, false)[0]?.object.name})`);
    }
  }
  visual.setSteeringWheelAngle(0); root.updateMatrixWorld(true);
  const envelope = opaque.filter(o => visual.cockpitRoot.getObjectById(o.id) && !visual.cockpitRoot.steeringWheelBase.getObjectById(o.id));
  for (const x of [eye.x, -eye.x]) {
    ray.set(new T.Vector3(x, floorBox.max.y + .2, .12), new T.Vector3(0, 0, -1));
    ray.far = .12 - (c.cabin.windshieldBottomZ + .04);
    check(ray.intersectObjects(opaque, false).length === 0, 'open footwell');
    for (const target of [new T.Vector3(x, floorBox.max.y - .1, c.cabin.windshieldBottomZ - .2), new T.Vector3(x, c.body.hoodTopY, c.cabin.windshieldBottomZ - .08)]) {
      const origin = new T.Vector3(x, eye.y, eye.z);
      ray.set(origin, target.clone().sub(origin).normalize()); ray.far = origin.distanceTo(target);
      check(ray.intersectObjects(envelope, false).length > 0, 'cabin closes engine/ground sightline'); closureRays++;
    }
    ray.set(new T.Vector3(x, floorBox.max.y + .1, .12), new T.Vector3(0, -1, 0)); ray.far = .15;
    check(ray.intersectObject(floor, false).length > 0, 'footwell floor is real geometry');
  }
  for (const offset of [-.32, 0, .32]) {
    check(clear(new T.Vector3(eye.x + offset, eye.y - .06, c.cabin.windshieldBottomZ - 2), [dash]), 'dashboard leaves road aperture open');
  }
  check(eye.z > hub.z && hub.z > c.instrumentClusterTransform.position[2] && c.instrumentClusterTransform.position[2] > c.cabin.windshieldBottomZ,
    'eye/wheel/display/windshield order');
  const camera = new T.PerspectiveCamera(62, 16 / 9, .025, 2500); camera.position.copy(eye); root.add(camera);
  const mirrors = new MirrorSystem({ capabilities: { maxTextureSize: 4096 } } as T.WebGLRenderer, new T.Scene(), {
    driverCamera: camera, vehicleRoot: root, autoBindSurfaces: false, mirrors: {
      left: { surface: visual.mirrorSurfaces.left, size: c.leftMirrorTransform.size },
      right: { surface: visual.mirrorSurfaces.right, size: c.rightMirrorTransform.size },
    },
  });
  const adjustment = new MirrorAdjustmentController(visual.mirrorSurfaces, { storage: null });
  try {
    for (const side of ['left', 'right'] as const) for (const yaw of [-10, 0, 10]) for (const pitch of [-7, 0, 7]) {
      adjustment.reset(side); adjustment.nudge(side, T.MathUtils.degToRad(yaw), T.MathUtils.degToRad(pitch)); mirrors.update();
      const view = mirrors.getView(side);
      check(view.valid && view.worldNormal.dot(visual.getMirrorWorldTransform(side).normal) > .999999, 'adjusted mirror uses actual glass normal');
      check(mirrors.getTexture(side) === view.texture, 'mirror shares reflection target');
    }
  } finally { adjustment.reset('left'); adjustment.reset('right'); mirrors.dispose(); camera.removeFromParent(); }
  return { assertions, closureRays };
}

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
    const structure = runQinPlusStructureSelfTest(a);
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
    return { assertions, structure, meshes, bumperBounds: { minZ: bounds.min.z, maxZ: bounds.max.z }, materialsPerInstance: first.size };
  } finally {
    visuals.forEach(v => v.dispose());
    assets.dispose();
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
}
