import * as THREE from 'three';
import { getVehicleDescriptor } from '../VehicleCatalog';
import { wheelLocalPosition, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { VehicleVisual } from './VehicleVisual';
import { VehicleLighting } from './VehicleLighting';
import { SUPERCAR_INSTRUMENT_CLUSTER_LAYOUT as L } from './InstrumentCluster';

/** Geometry and drawing commands; subjective appearance remains a driving review. */
export function runFerrari458VisualSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`458 visual: ${message}`); };
  const config = getVehicleDescriptor('ferrari-458-italia').visualConfig;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const recorder = () => {
    const texts: string[] = [];
    const context = new Proxy<Record<string, unknown>>({}, {
      get: (target, key: string) => key in target ? target[key] : key === 'fillText'
        ? (text: string) => texts.push(text) : key === 'createLinearGradient' || key === 'createRadialGradient'
          ? () => ({ addColorStop: () => undefined }) : (...args: unknown[]) => {
            assert(args.every(v => typeof v !== 'number' || Number.isFinite(v)), `finite ${key}`);
          },
      set: (target, key: string, value: unknown) => { target[key] = value; return true; },
    });
    return { width: 1, height: 1, getContext: () => context, texts };
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: recorder } });
  let visual: VehicleVisual | undefined;
  let lighting: VehicleLighting | undefined;
  try {
    visual = new VehicleVisual(config); lighting = new VehicleLighting(visual);
    visual.root.updateMatrixWorld(true);
    const size = visual.getVisualBodyBounds().getSize(new THREE.Vector3());
    assert(size.x <= config.dimensions.width + .02 && size.z <= config.dimensions.length + .02 &&
      size.y <= config.dimensions.height + .04, 'body and lighting stay within declared collision envelope');
    assert(config.body.design === 'mid-supercar' && config.body.roofCenterZ < 0 && config.body.trunkLength > config.body.hoodLength, 'cab-forward mid-engine proportions');
    assert(visual.root.getObjectByName('Mid-engine glazed engine cover') !== undefined &&
      visual.root.getObjectByName('Mid-engine side intake') !== undefined, 'independent engine-bay geometry');
    for (const id of VEHICLE_WHEEL_IDS) {
      const anchor = wheelLocalPosition(config.dimensions, id);
      assert(visual.wheelPivots[id].position.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z)) < 1e-12, `${id}: contact and mesh anchor agree`);
      const tyre = visual.wheelPivots[id].children[0] as THREE.Mesh;
      tyre.geometry.computeBoundingBox();
      const width = tyre.geometry.boundingBox!.getSize(new THREE.Vector3()).x * tyre.scale.x;
      const desired = id.startsWith('front') ? .235 : .295;
      assert(Math.abs(width - desired) < 1e-6, `${id}: staggered road tyre width`);
    }
    const badge = visual.root.getObjectByName('Ferrari steering wheel badge');
    assert(badge?.parent === visual.cockpitRoot.steeringWheelRotationGroup && badge.getObjectByName('Ferrari black prancing horse') !== undefined, 'yellow Ferrari horse badge turns with hub');
    const paddle = visual.root.getObjectByName('Fixed upshift paddle')!;
    const before = paddle.getWorldPosition(new THREE.Vector3());
    visual.setSteeringWheelAngle(1); visual.root.updateMatrixWorld(true);
    assert(before.distanceTo(paddle.getWorldPosition(new THREE.Vector3())) < 1e-12 &&
      visual.root.getObjectByName('Fixed downshift paddle') !== undefined, 'two fixed column paddles');
    assert(visual.root.getObjectByName('Gear lever shaft') === undefined &&
      visual.root.getObjectByName('Rear bench back') === undefined, 'two-seat DCT cabin');
    assert(L.tachRadius < L.wingCenterX - L.wingHalfWidth, 'central tach and side screens do not overlap');
    const cluster = visual.cockpitRoot.instrumentCluster;
    const canvasFor = (name: string) => (((cluster.getObjectByName(name) as THREE.Mesh).material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture).image as ReturnType<typeof recorder>;
    const tach = canvasFor('Supercar central tachometer face');
    const left = canvasFor('Supercar left information screen'), right = canvasFor('Supercar right information screen');
    for (let i = 0; i < 30; i++) cluster.update({ speedKmh: 180, rpm: 6500, gear: 'D4', driveMode: 'RACE',
      fuelLevel: .6, coolantTemperatureC: 90, indicators: { cruise: true, absWarning: true } }, 1 / 60);
    assert(tach.texts.includes('4') && tach.texts.includes('RPM'), 'reference face contains real gear and RPM');
    assert(left.texts.includes('RACE') && left.texts.includes('COOLANT 90 C') && right.texts.includes('km/h'), 'live mode/coolant and right speed dial');
    left.texts.length = 0;
    cluster.update({ speedKmh: 180, rpm: 6500, gear: 'D4', driveMode: 'WET', fuelLevel: .6, coolantTemperatureC: 90 }, 1 / 60);
    assert(left.texts.includes('WET'), 'mode-only update redraws screen');
  } finally {
    lighting?.dispose(); visual?.dispose();
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
  return { assertions };
}
