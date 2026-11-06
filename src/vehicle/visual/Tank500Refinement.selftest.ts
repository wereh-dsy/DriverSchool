import * as T from 'three';
import { VehicleVisual } from './VehicleVisual';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { TANK500_HI4T_VISUAL_CONFIG as config } from './Tank500VisualConfig';
import { Tank500Display } from './Tank500Displays';
import { VehicleInteractionController } from '../interaction/VehicleInteractionController';
import { applyVehicleInteractionVisual } from '../interaction/VehicleInteractionDefinition';
import { driverExitWorldPoint } from '../../player/DriverEntryZone';
import type { InstrumentTelemetry } from './InstrumentCluster';

/** Targeted Tank integration: authored aperture, live cabin and modest resource budget. */
export function runTank500RefinementSelfTest() {
  let assertions = 0;
  const check = (ok: boolean, message: string) => { assertions++; if (!ok) throw Error('Tank refinement: ' + message); };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0,
    getContext: () => new Proxy({}, { get: (_t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ?
      () => ({ addColorStop() {} }) : () => {}, set: () => true }) }) } });
  const assets = new VehicleAssetRegistry(); let car: VehicleVisual | undefined, other: VehicleVisual | undefined;
  try {
    car = new VehicleVisual(config, assets); other = new VehicleVisual(config, assets);
    const def = car.interactionDefinition!, second = other.interactionDefinition!, door = def.driverDoor.doorNode;
    check(!!def && !!second, 'shared driver access installed');
    for (const name of [...config.driverAccess!.doorMountedPartNames!, ...config.driverAccess!.doorMountedExteriorPartNames!])
      check(!!door.getObjectByName(name), 'door carries ' + name);
    check(def.driverWindow.beltClipPlane instanceof T.Plane && def.driverWindow.beltClipPlane !== second.driverWindow.beltClipPlane, 'glass clips belong to instances');
    const control = new VehicleInteractionController(); control.configure(def);
    check(!control.toggleDriverDoor(2).accepted && !control.requestExitVehicle(2).accepted, 'moving access interlocks');
    check(control.toggleDriverDoor(0).accepted, 'stationary door opens'); control.update(.41);
    check(Math.abs(control.driverDoorOpenFraction - .5) < 1e-6, 'door takes calibrated time'); control.update(1);
    check(control.driverDoorOpenFraction === 1, 'full opening'); control.closeDriverDoor(); control.update(1);
    check(control.driverDoorOpenFraction === 0, 'full close');
    control.driverWindowDown(1.2); control.stopDriverWindow(); control.update(1);
    check(Math.abs(control.driverWindowOpenFraction - .5) < 1e-6, 'hold/release stops window halfway');
    applyVehicleInteractionVisual(def, 0, 0); car.root.updateMatrixWorld(true);
    const pane = door.getObjectByName('Left Tank front door glass') as T.Mesh<T.BufferGeometry, T.MeshPhysicalMaterial>;
    const origin = pane.getWorldPosition(new T.Vector3()), mirror = car.mirrorSurfaces.left.getWorldPosition(new T.Vector3());
    const rear = car.root.getObjectByName('Left Tank fixed rear door card')!, fixedRear = rear.getWorldPosition(new T.Vector3());
    check(Math.abs(def.driverWindow.beltClipPlane!.distanceToPoint(car.root.localToWorld(new T.Vector3(-.9, 1.285, -.2)))) < 1e-6, 'glass clips at actual belt');
    applyVehicleInteractionVisual(def, 0, .5); car.root.updateMatrixWorld(true);
    check(Math.abs(pane.getWorldPosition(new T.Vector3()).y - origin.y - def.driverWindow.localTravelDirection[1] * def.driverWindow.travelDistance * .5) < 1e-6, 'window travels down inclined door plane');
    check(pane.material.clippingPlanes?.[0] === def.driverWindow.beltClipPlane, 'lowered glass is hidden inside door');
    applyVehicleInteractionVisual(def, 1, .5); car.root.updateMatrixWorld(true);
    check(Math.abs(def.driverDoor.hingeNode.rotation.y + 1.12) < 1e-6, 'skin and glazing use physical hinge transform');
    check(car.mirrorSurfaces.left.getWorldPosition(new T.Vector3()).distanceTo(mirror) > .1, 'mirror follows door');
    check(rear.getWorldPosition(new T.Vector3()).distanceTo(fixedRear) < 1e-8, 'rear cabin stays fixed');
    check(second.driverDoor.hingeNode.rotation.y === 0 && second.driverWindow.node.position.length() === 0, 'second cached instance unchanged');
    const ray = new T.Raycaster(new T.Vector3(-2, .70, -.12), new T.Vector3(1, 0, 0), 0, 1.5); ray.layers.enableAll();
    check(!ray.intersectObject(car.root, true).some(h => h.object.name.includes('hinged door skin') || h.object.name === 'Tank driver shaped door card'), 'no stationary duplicate closes opened aperture');
    const pose = { x: 8, z: -3, yaw: .65 }, exit = driverExitWorldPoint(pose, def);
    check(control.requestExitVehicle(0).accepted && control.requestEnterVehicle(0, exit, pose).accepted, 'exit anchor supports existing re-entry');
    check(!control.requestEnterVehicle(0, { x: 100, z: 100 }, pose).accepted, 'entry requires standing beside driver door');
    const display = car.root.getObjectByName('Tank Hi4-T centre energy / off-road display') as Tank500Display;
    const next = other.root.getObjectByName(display.name) as Tank500Display;
    check(display.canvas !== next.canvas && display.texture !== next.texture, 'independent live display textures');
    display.cyclePage(); check(display.page === 'OFFROAD' && next.page === 'ENERGY', 'page changes isolated');
    display.updateMatrixWorld(true);
    const hitPoint = display.screen.localToWorld(new T.Vector3(.11, -.08, 0));
    const normal = new T.Vector3(0, 0, 1).transformDirection(display.screen.matrixWorld);
    const touch = new T.Raycaster(hitPoint.clone().addScaledVector(normal, .15), normal.clone().negate()); touch.layers.enableAll();
    check(display.click(touch) && display.page === 'STATUS', 'actual screen bottom tab responds to ray');
    const ribbon = car.root.getObjectByName('Tank dashboard ambient ribbon') as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
    const independent = other.root.getObjectByName(ribbon.name) as typeof ribbon;
    const t: InstrumentTelemetry = { speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: true, ambientDaylight: 0,
      indicators: { positionLights: true }, driverAccess: { doorOpen: 1, windowOpen: .5 } };
    for (let i = 0; i < 60; i++) car.updateInstruments(t, 1 / 60);
    check(ribbon.material.opacity > .2 && independent.material.opacity === 0, 'night welcome/ambient is animated per instance');
    const courtesy = car.root.getObjectByName('Tank door courtesy illumination') as T.PointLight;
    check(courtesy.intensity > .5 && !courtesy.castShadow, 'open door softly lights cabin without shadow map');
    for (let i = 0; i < 180; i++) car.updateInstruments({ ...t, ignitionOn: false, driverAccess: { doorOpen: 0, windowOpen: .5 } }, 1 / 60);
    check(ribbon.material.opacity < .001 && courtesy.intensity < .001, 'shutdown and closed door fade lights out');
    applyVehicleInteractionVisual(def, 0, 0); car.root.updateMatrixWorld(true);
    // Five active instrument samples must be visible from the authored driver eye.
    const instrument = car.root.getObjectByName('Tank instrument screen') as T.Mesh;
    const blockers = ['Tank sculpted cross-car dashboard', 'Tank dark leather cowl'].map(n => car!.root.getObjectByName(n)!);
    const eye = car.root.localToWorld(new T.Vector3(...config.driverEyePosition));
    for (const [x, y] of [[0, 0], [-.13, -.045], [.13, -.045], [-.13, .045], [.13, .045]]) {
      const point = instrument.localToWorld(new T.Vector3(x, y, 0)), path = point.clone().sub(eye), distance = path.length();
      const sight = new T.Raycaster(eye, path.normalize(), 0, distance - .002); sight.layers.enableAll();
      check(sight.intersectObjects(blockers, true).length === 0, 'driver sees instrument through authored dashboard recess');
    }
    let meshes = 0, vertices = 0; const textures = new Set<T.Texture>();
    car.root.traverse(o => { if (!(o instanceof T.Mesh)) return; meshes++; vertices += o.geometry.getAttribute('position').count;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value); });
    check(meshes <= 175 && vertices < 30000 && textures.size <= 10, 'lightweight authored geometry / texture budget');
    return { assertions, meshes, vertices, textures: textures.size };
  } finally {
    car?.dispose(); other?.dispose(); assets.dispose();
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
}
