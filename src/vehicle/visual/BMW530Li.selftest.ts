import * as T from 'three';
import { getVehicleDescriptor, createVehiclePhysicsConfig, isVehicleId, getNextVehicleId } from '../VehicleCatalog';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { VehicleVisual } from './VehicleVisual';
import { VehicleLighting } from './VehicleLighting';
import { VehicleLightingController } from '../control/VehicleLightingController';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { BMW_CABIN_CLOSURE_RAYS } from './BMW530Cabin';
import { computePlanarMirrorView, createPlanarMirrorViewComputation } from '../../camera/MirrorMath';
import { BMW530Instruments, drawBMWLightingSymbols } from './BMW530Instruments';
import { cabinAmbientTarget } from './CabinLightResponse';

export function runBMW530LiSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error('BMW 530Li: ' + message); };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvases: { texts: string[]; width: number; height: number }[] = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => {
    const texts: string[] = [], canvas = { texts, width: 0, height: 0, getContext: () => ctx };
    const ctx = new Proxy<Record<string, unknown>>({}, { get(target, k: string) {
      if (k in target) return target[k];
      if (k === 'fillText') return (v: string) => texts.push(v);
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      return (...args: unknown[]) => assert(args.every(v => typeof v !== 'number' || Number.isFinite(v)), 'finite canvas ' + k);
    }, set(target, k: string, v) { target[k] = v; return true; } });
    canvases.push(canvas); return canvas;
  } } });
  let visual: VehicleVisual | undefined, lights: VehicleLighting | undefined;
  try {
    const strokes: string[] = [], rays: number[][] = [], scales: number[][] = [];
    const symbolContext = new Proxy<Record<string, unknown>>({}, {
      get(target, key: string) {
        if (key in target) return target[key];
        if (key === 'stroke') return () => strokes.push(target.strokeStyle as string);
        if (key === 'lineTo') return (...args: number[]) => rays.push(args);
        if (key === 'scale') return (...args: number[]) => scales.push(args);
        if (key === 'fillText') return () => assert(false, 'lighting symbol must not draw text');
        return () => undefined;
      }, set(target, key: string, value) { target[key] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    drawBMWLightingSymbols(symbolContext, {}); assert(strokes.length === 0, 'inactive lighting symbols hidden');
    drawBMWLightingSymbols(symbolContext, { positionLights: true, headlights: true, highBeam: true, frontFogLights: true, rearFogLights: true });
    assert(strokes.filter(color => color === '#70d69f').length === 19 &&
      strokes.filter(color => color === '#58aaff').length === 5 && strokes.filter(color => color === '#e1b05f').length === 6,
      'position / dipped / high / fog symbol geometry and standard colours');
    assert(rays.some(([x, y]) => x === -33 && y === -4) && rays.some(([x, y]) => x === -33 && y === -12),
      'dipped slanted rays and main beam horizontal rays');
    assert(scales.some(([x, y]) => x === -1 && y === 1), 'rear fog symbol faces opposite direction');
    const beforeCombinedFog = strokes.length;
    drawBMWLightingSymbols(symbolContext, { fogLights: true });
    assert(strokes.length - beforeCombinedFog === 12, 'existing combined fog command illuminates both pictograms');
    const beforeExplicitFogOff = strokes.length;
    drawBMWLightingSymbols(symbolContext, { fogLights: true, frontFogLights: false, rearFogLights: false });
    assert(strokes.length === beforeExplicitFogOff, 'explicit independent fog states override combined fallback');
    const d = getVehicleDescriptor('bmw-530li-g38'), p = createVehiclePhysicsConfig('bmw-530li-g38'), v = d.visualConfig;
    validateVehiclePlatformConfig(p, v);
    assert(isVehicleId(d.id) && getNextVehicleId('tesla-model-3-rwd') === d.id, 'catalog registration and cycle');
    assert(p.length === 5.106 && p.width === 1.868 && p.height === 1.5 && p.wheelBase === 3.105, 'G38 China shared dimensions');
    assert(p.mass === 1745 && p.frontWeightBias === .51 && p.yawInertia > 3500, 'executive mass and polar inertia');
    assert(p.drivetrainType === 'RWD' && p.frontTorqueSplit === 0 && p.rearTorqueSplit === 1 && !p.awd, 'pure rear drive');
    assert(p.engine.displacementL === 2 && p.engine.cylinderCount === 4 && p.engine.turbo?.enabled === true, '2.0T inline four');
    const power = Math.max(...p.engine.torqueCurve.map(q => q.torque * q.rpm * Math.PI / 30000));
    assert(power > 175 && power < 190 && Math.max(...p.engine.torqueCurve.map(q => q.torque)) === 350, '180 kW / 350 Nm class curve');
    assert(Object.keys(p.transmission.gearRatios).length === 8 && p.transmission.type === 'TORQUE_CONVERTER_AT', 'eight physical automatic ratios');
    assert(p.suspension.kinematics?.front.topology === 'DOUBLE_WISHBONE' && p.suspension.kinematics.rear.topology === 'MULTI_LINK', 'front and rear independent suspension');
    assert(d.capabilities.electronicParkingBrake && d.capabilities.autoHold && d.capabilities.cruiseControl && d.capabilities.manualSelection, 'existing runtime functions');
    assert(p.driveModes!.ECO!.shiftStrategy!.map![1]!.upshiftRPM! < p.driveModes!.NORMAL!.shiftStrategy!.map![1]!.upshiftRPM! &&
      p.driveModes!.NORMAL!.shiftStrategy!.map![1]!.upshiftRPM! < p.driveModes!.SPORT!.shiftStrategy!.map![1]!.upshiftRPM!, 'mode shift ordering');
    p.engine.torqueCurve[0]!.torque = 1;
    assert(createVehiclePhysicsConfig(d.id).engine.torqueCurve[0]!.torque !== 1, 'spawn config detached');
    visual = new VehicleVisual(v); lights = new VehicleLighting(visual); visual.root.updateMatrixWorld(true);
    const bounds = visual.getVisualBodyBounds(), size = bounds.getSize(new T.Vector3());
    assert(size.x < v.dimensions.width + .025 && size.z < v.dimensions.length + .03 && bounds.max.y < v.dimensions.height + .005,
      'body / optics inside collision envelope: ' + size.toArray().join(',') + ' top=' + bounds.max.y);
    const anchors = localWheelPositions(v.dimensions);
    for (const id of VEHICLE_WHEEL_IDS) {
      const a = anchors[id], pivot = visual.wheelPivots[id];
      assert(pivot.position.distanceTo(new T.Vector3(a.x, a.y - (v.staticBodyOffsetY ?? 0), a.z)) < 1e-10, id + ' physical anchor');
      const tyre = pivot.getObjectByName('245/45 R18 touring tyre') as T.Mesh;
      tyre.geometry.computeBoundingBox(); assert(Math.abs(tyre.geometry.boundingBox!.getSize(new T.Vector3()).x - .245) < 1e-6, id + ' tyre width');
    }
    const names = ['Left thick kidney chrome frame', 'Right thick kidney chrome frame', 'Crowned multi-section hood',
      'Left Front side window', 'Left Long rear door window', 'Left Hofmeister quarter glass', 'Tapered curved windshield',
      'BMW continuous sculpted dashboard shell', 'BMW compact electronic selector', 'BMW continuous recessed display backing',
      'Driver shaped leather seat back', 'Passenger shaped leather seat back', 'Rear continuous three-seat cushion', 'Rear continuous three-seat back',
      'Rear Left comfort headrest', 'Rear Centre comfort headrest', 'Rear Right comfort headrest', 'Rear bench continuous lumbar transition',
      'BMW complete curved headliner', 'BMW discreet overhead console', 'BMW unlit reading lamp lens',
      'BMW continuous display lower ledge', 'BMW closed storage and cupholder cover', 'BMW flowing dashboard to centre tunnel',
      'BMW centre mirror housing', 'BMW Brake pedal', 'BMW Accelerator pedal'];
    for (const name of names) assert(visual.root.getObjectByName(name) !== undefined, 'component exists: ' + name);
    for (const name of ['BMW front cupholder well', 'BMW pierced twin cupholder deck', 'BMW iDrive knurled edge',
      'BMW physical centre controls', 'BMW front cabin illumination', 'BMW rear cabin illumination'])
      assert(!visual.root.getObjectByName(name), 'removed distracting cabin component: ' + name);
    assert(!visual.root.getObjectByName('Simplified cabin seats') && !visual.root.getObjectByName('Gear lever shaft'), 'independent full cabin');
    let vertices = 0, meshes = 0, materialCount = new Set<T.Material>();
    visual.root.traverse(o => {
      if (!(o instanceof T.Mesh)) return; meshes++;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materialCount.add(m);
      const points = o.geometry.getAttribute('position'); vertices += points.count;
      for (let i = 0; i < points.count; i++) assert(Number.isFinite(points.getX(i)) && Number.isFinite(points.getY(i)) && Number.isFinite(points.getZ(i)), 'finite vertex');
    });
    assert(materialCount.size < 85 && meshes < 510, `bounded material and object budget: ${materialCount.size} materials, ${meshes} meshes`);
    const ray = new T.Raycaster(); ray.layers.enableAll();
    for (const direction of BMW_CABIN_CLOSURE_RAYS) {
      ray.set(new T.Vector3(...v.driverEyePosition), new T.Vector3(...direction).normalize());
      const hit = ray.intersectObjects(visual.cockpitRoot.children, true).find(h => h.object instanceof T.Mesh &&
        !((h.object as T.Mesh).material instanceof T.MeshBasicMaterial));
      assert(!!hit && hit.distance < 3, 'closed interior ray ' + direction.join(','));
    }
    for (const side of ['left', 'right'] as const) {
      const m = visual.getMirrorWorldTransform(side);
      const r = computePlanarMirrorView({ eye: new T.Vector3(...v.driverEyePosition), center: m.position, right: new T.Vector3(1, 0, 0).applyQuaternion(m.quaternion),
        up: new T.Vector3(0, 1, 0).applyQuaternion(m.quaternion), normal: m.normal, size: m.size, near: .05, far: 100 }, createPlanarMirrorViewComputation());
      assert(r.valid, side + ' optical mirror');
    }
    assert(visual.centerMirrorSurface === null && !!visual.root.getObjectByName('BMW dark static centre mirror glass'), 'dark central mirror requires no realtime render target');
    const instrumentFace = visual.root.getObjectByName('BMW opposed-arc digital display')!;
    for (const [name, x, y] of [['speed', -.11467, -.00287], ['gear', .11467, .00466], ['mode', 0, .0774]] as const) {
      const target = instrumentFace.localToWorld(new T.Vector3(x, y, 0)), eye = new T.Vector3(...v.driverEyePosition);
      ray.set(eye, target.clone().sub(eye).normalize());
      const obstruction = ray.intersectObjects(visual.cockpitRoot.children, true).find(h => h.distance < target.distanceTo(eye) - .002);
      assert(!obstruction, 'driver can read ' + name + ': ' + obstruction?.object.name);
    }
    const controller = new VehicleLightingController(), neutral = createNeutralVehicleInputState();
    controller.setMainLightMode('high');
    const state = controller.update(0, { ...neutral, hazard: true, brake: .5 }, { ignitionOn: true, actualGear: 'R', steeringWheelAngle: 0 });
    lights.applyState(state, true);
    for (const key of ['head', 'position', 'tail', 'brake', 'reverse', 'left', 'right']) {
      const modules: T.Mesh[] = []; visual.exteriorRoot.traverse(o => { if (o instanceof T.Mesh && o.userData.lightingOutput === key) modules.push(o); });
      assert(modules.length > 0 && modules.every(m => (m.material as T.MeshStandardMaterial).emissiveIntensity > 0), 'lighting output ' + key);
    }
    const repeater = visual.root.getObjectByName('left mirror amber repeater')!;
    assert(repeater.parent?.name === 'left mirror assembly', 'mirror repeater stays in housing after lamp binding');
    controller.update(.6, neutral, { ignitionOn: true, actualGear: 'N', steeringWheelAngle: 0 }); lights.applyState(controller.state, true);
    assert((visual.root.getObjectByName('Left front amber indicator') as T.Mesh).material instanceof T.MeshStandardMaterial &&
      ((visual.root.getObjectByName('Left front amber indicator') as T.Mesh).material as T.MeshStandardMaterial).emissiveIntensity === 0, 'controller blink phase shared');
    visual.updateInstruments({ ignitionOn: true, engineRunning: true, speedKmh: 87, rpm: 2350, gear: 'D6', driveMode: 'SPORT', fuelLevel: .42,
      coolantTemperatureC: 93, cruiseTargetSpeedKmh: 90, ambientDaylight: .025, indicators: { headlights: true, cruise: true, autoHold: true } }, 1);
    const face = canvases.find(cv => cv.width === 1440 && cv.height === 540)!;
    assert(face.texts.includes('87') && face.texts.includes('D6') && face.texts.includes('SPORT') && face.texts.includes('FUEL 42%') &&
      face.texts.includes('93 °C') && face.texts.includes('CRUISE 90') && face.texts.includes('HOLD'), 'live digital telemetry');
    assert(!face.texts.includes('LIGHT') && !face.texts.includes('HIGH') && !face.texts.includes('FOG'), 'lamp indicators use pictograms, not text');
    const liveFace = visual.root.getObjectByName('BMW Live Cockpit digital face') as BMW530Instruments;
    liveFace.update({ speedKmh: 0, rpm: 750, gear: 'P', indicators: { headlights: true } });
    const lowBeamVersion = liveFace.texture.version;
    liveFace.update({ speedKmh: 0, rpm: 750, gear: 'P', indicators: { highBeam: true } });
    assert(liveFace.texture.version > lowBeamVersion, 'changing the active lamp redraws even with equal indicator value counts');
    const cabinLights: T.PointLight[] = []; visual.cockpitRoot.traverse(o => { if (o instanceof T.PointLight) cabinLights.push(o); });
    assert(cabinLights.length === 3 && cabinLights.every(l => l.position.y < .7 && l.intensity > 0 && l.intensity < .046), 'restrained footwell and console spill; no overhead fill');
    const profile = v.interiorAmbientLighting!;
    const day = cabinAmbientTarget(profile, true, true, 1), dusk = cabinAmbientTarget(profile, true, true, .32), night = cabinAmbientTarget(profile, true, true, .025);
    assert(day === profile.dayIntensity && day < dusk && dusk < night && night <= profile.nightIntensity, 'day / dusk / night ambient response');
    assert(cabinAmbientTarget(profile, true, false, .025) === 0 && cabinAmbientTarget(profile, false, true, .025) === 0, 'darkness cannot enable lights; ignition off takes precedence');
    const ambientMaterial = (visual.root.getObjectByName('Dashboard ambient line') as T.Mesh).material as T.MeshStandardMaterial;
    visual.updateInstruments({ speedKmh: 0, rpm: 750, gear: 'P', ignitionOn: true, ambientDaylight: .025, indicators: {} }, 2);
    assert(ambientMaterial.emissiveIntensity < .001 && cabinLights.every(l => l.intensity < .001), 'lamp off extinguishes interior in dark environment');
    visual.updateInstruments({ speedKmh: 0, rpm: 750, gear: 'P', ignitionOn: true, ambientDaylight: 1, indicators: { positionLights: true } }, 2);
    assert(ambientMaterial.emissiveIntensity < .005 && cabinLights.every(l => l.intensity < .001), 'daytime position lights stay weak');
    visual.updateInstruments({ speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: false }, 2);
    assert(cabinLights.every(l => l.intensity < .001), 'ignition off interior fade');
    const dynamics = new VehicleDynamics(createVehiclePhysicsConfig(d.id), { driveSelector: 'D', gear: 1 });
    let zeroTo100 = 0, snapshot = dynamics.getSnapshot();
    for (let step = 0; step < 2400; step++) {
      snapshot = dynamics.stepFixed(1 / 120, { ...neutral, throttle: 1 });
      assert(Number.isFinite(snapshot.speed) && Number.isFinite(snapshot.rpm), 'finite 120 Hz powertrain');
      if (!zeroTo100 && snapshot.speed * 3.6 >= 100) zeroTo100 = (step + 1) / 120;
    }
    assert(snapshot.transmission.type === 'TORQUE_CONVERTER_AT' && snapshot.speed > 25, '8AT integrated propulsion');
    const speedAfter20SecondsKmh = snapshot.speed * 3.6;
    snapshot = dynamics.stepFixed(1 / 120, { ...neutral, shiftDown: true });
    for (let j = 0; j < 60; j++) snapshot = dynamics.stepFixed(1 / 120, neutral);
    assert(snapshot.transmission.manualSelectionActive === true, 'moving D accepts paddle manual selection');
    snapshot = dynamics.stepFixed(1 / 120, { ...neutral, returnToAuto: true });
    assert(snapshot.transmission.manualSelectionActive === false, 'return to automatic selection');
    const selector = new VehicleDynamics(createVehiclePhysicsConfig(d.id), { driveSelector: 'P' });
    for (const mode of ['R', 'N', 'D', 'P'] as const) {
      assert(selector.requestDriveSelector(mode, 1), 'brake gated ' + mode + ' selector request');
      for (let j = 0; j < 60; j++) selector.stepFixed(1 / 120, { ...neutral, brake: 1 });
      assert(selector.getSnapshot().transmission.selectedMode === mode, 'actual ' + mode + ' selector');
    }
    return { assertions, meshes, vertices, materials: materialCount.size, zeroTo100Seconds: zeroTo100,
      speedAfter20SecondsKmh, bodySize: size.toArray(), closureRays: BMW_CABIN_CLOSURE_RAYS.length };
  } finally {
    lights?.dispose(); visual?.dispose(); if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
}
