import * as T from 'three';
import { getVehicleDescriptor } from './VehicleCatalog';
import { VehicleVisual } from './visual/VehicleVisual';
import { VehicleAssetRegistry } from './visual/VehicleAssetRegistry';
import { VehicleLighting } from './visual/VehicleLighting';
import { VehicleInteractionController } from './interaction/VehicleInteractionController';
import { applyVehicleInteractionVisual } from './interaction/VehicleInteractionDefinition';
import { driverExitWorldPoint } from '../player/DriverEntryZone';
import { evaluateCabinAcoustics } from '../audio/VehicleCabinAcoustics';
import { calculateEngineAudioMix } from '../audio/EngineAudio';
import { MAYBACH_S680_AUDIO_PROFILE as profile } from '../audio/MaybachS680AudioProfile';

/** Focused access/optics acceptance. Does not repeat longitudinal benchmarks. */
export function runMaybachS680AccessSelfTest() {
  let checks = 0;
  const assert = (condition: boolean, message: string) => {
    checks++; if (!condition) throw new Error(`Maybach access: ${message}`);
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {configurable: true, value: {createElement: () => ({
    width: 0, height: 0, getContext: () => new Proxy({}, {get: (_target, key) =>
      key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({addColorStop() {}}) :
      key === 'measureText' ? () => ({width: 30}) : () => {}, set: () => true}),
  })}});
  const registry = new VehicleAssetRegistry(), descriptor = getVehicleDescriptor('mercedes-maybach-s680-z223');
  let visual: VehicleVisual | undefined, other: VehicleVisual | undefined, lamps: VehicleLighting | undefined;
  try {
    visual = new VehicleVisual(descriptor.visualConfig, registry); other = new VehicleVisual(descriptor.visualConfig, registry);
    const definition = visual.interactionDefinition!, second = other.interactionDefinition!;
    assert(!!definition && !!second, 'cached instances register door/window access');
    const door = definition.driverDoor.doorNode, hinge = definition.driverDoor.hingeNode;
    for (const name of [...descriptor.visualConfig.driverAccess!.doorMountedPartNames!, ...descriptor.visualConfig.driverAccess!.doorMountedExteriorPartNames!]) {
      assert(door.getObjectByName(name) !== undefined, `hinged trim/mirror: ${name}`);
    }
    assert(definition.driverWindow.beltClipPlane instanceof T.Plane && definition.driverWindow.beltClipPlane !== second.driverWindow.beltClipPlane,
      'cached glass clipping is rebound per vehicle');
    const access = new VehicleInteractionController(); access.configure(definition);
    assert(access.toggleDriverDoor(0).accepted && !access.toggleDriverDoor(2).accepted, 'existing stationary interlock');
    access.update(.36); assert(Math.abs(access.driverDoorOpenFraction - .5) < .001, 'door moves continuously');
    access.update(.5); assert(access.driverDoorOpenFraction === 1, 'door reaches full opening');
    access.closeDriverDoor(); access.update(.77);
    assert(Math.abs(access.driverDoorOpenFraction - .08) < .001, 'door enters soft-close capture');
    access.update(.14); assert(Math.abs(access.driverDoorOpenFraction - .04) < .001, 'latch gently draws in final travel');
    access.update(.15); assert(access.driverDoorOpenFraction === 0, 'latch fully closes');
    access.driverWindowDown(1.35); assert(Math.abs(access.driverWindowOpenFraction - .5) < .001, 'held window supports half opening');
    access.stopDriverWindow(); access.update(1); assert(Math.abs(access.driverWindowOpenFraction - .5) < .001, 'window holds on release');
    applyVehicleInteractionVisual(definition, 0, .5); visual.root.updateMatrixWorld(true);
    const mirror = visual.mirrorSurfaces.left.getWorldPosition(new T.Vector3());
    const pane = door.getObjectByName('Left front acoustic glass') as T.Mesh<T.BufferGeometry, T.MeshPhysicalMaterial>;
    const panePoint = new T.Vector3().fromBufferAttribute(pane.geometry.getAttribute('position'), 2).applyMatrix4(pane.matrixWorld);
    applyVehicleInteractionVisual(definition, 1, .5); visual.root.updateMatrixWorld(true);
    assert(mirror.distanceTo(visual.mirrorSurfaces.left.getWorldPosition(new T.Vector3())) > .08, 'real mirror follows door');
    const moved = new T.Vector3().fromBufferAttribute(pane.geometry.getAttribute('position'), 2).applyMatrix4(pane.matrixWorld);
    assert(moved.distanceTo(panePoint) > .6 && Math.abs(hinge.rotation.y + 66 * Math.PI / 180) < .001, 'half-open glass follows real hinge');
    assert(pane.material.clippingPlanes?.[0] === definition.driverWindow.beltClipPlane, 'rendered pane uses animated belt plane');
    assert(other.interactionDefinition!.driverDoor.hingeNode.rotation.y === 0, 'other cached instance remains closed');
    const pose = {x: 5, z: -2, yaw: .6}, exit = driverExitWorldPoint(pose, definition);
    assert(access.requestEnterVehicle(0, exit, pose).accepted && access.requestExitVehicle(0).accepted, 'exit anchor permits re-entry');
    assert(!access.requestEnterVehicle(0, {x: 100, z: 100}, pose).accepted, 're-entry requires door proximity');
    const sound = (windowPosition: number, doorOpenAmount = 0) => calculateEngineAudioMix(2400, .5, {
      profile, engineCharacter: descriptor.physicsConfig.engine, cockpit: true, engineLoad: .5, vehicleSpeed: 25,
      cabinAcoustics: evaluateCabinAcoustics(profile.cabinAcoustics!, {windowPosition, doorOpenAmount, speedMetersPerSecond: 25}),
    });
    const closed = sound(0), half = sound(.5), open = sound(1), openDoor = sound(0, 1);
    assert(closed.exhaust < half.exhaust && half.exhaust < open.exhaust && open.exhaust < openDoor.exhaust, 'continuous engine isolation');
    assert(closed.exhaustCutoffHz < half.exhaustCutoffHz && half.exhaustCutoffHz < open.exhaustCutoffHz, 'opening restores engine spectral detail');
    assert(closed.wind < half.wind && half.wind < open.wind && closed.cabinLowpassHz < open.cabinLowpassHz, 'window progressively admits road/wind spectrum');
    assert(Math.abs(sound(1, 1).exhaust - openDoor.exhaust) < .000001, 'open door does not double-amplify an already open window');
    lamps = new VehicleLighting(visual); lamps.setMode('low');
    const beams: T.SpotLight[] = []; visual.root.traverse(o => {if (o instanceof T.SpotLight && o.name.includes('low/high')) beams.push(o);});
    assert(beams.length === 2 && beams.every(light => light.intensity > 0 && light.map instanceof T.DataTexture), 'two actual projected dipped beams');
    const lowMap = beams[0]!.map as T.DataTexture;
    const pixels = lowMap.image.data as Uint8Array;
    const at = (x: number, y: number) => pixels[(y * 256 + x) * 4]!;
    assert(at(128, 100) > 0 && at(128, 170) === 0, 'dipped light remains below optical cutoff');
    assert(at(158, 131) > 0 && at(98, 131) === 0, 'right-hand-traffic shoulder rise');
    lamps.setMode('high');
    assert(beams.every(light => light.map !== lowMap && light.distance === 180), 'main beam swaps angular optics and throw');
    const fill: T.SpotLight[] = []; visual.root.traverse(o => {if (o instanceof T.SpotLight && o.name.includes('near fill')) fill.push(o);});
    assert(fill.length === 2 && fill.every(light => light.map === lowMap && light.intensity > 0), 'main beam retains dipped foreground');
    lamps.setMode('off');
    assert([...beams, ...fill].every(light => light.intensity === 0), 'off removes projected illumination');
    visual.updateInstruments({speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: false, ambientDaylight: 0, driverAccess: {doorOpen: 1, windowOpen: 0}}, 1);
    assert((door.getObjectByName('Left door courtesy lamp') as T.PointLight).intensity > .1, 'door courtesy works with ignition off');
    return {checks, isolation: {closed: closed.exhaust, half: half.exhaust, open: open.exhaust}, beamMaps: '256×256 projected angular intensity; RHT cutoff'};
  } finally {
    lamps?.dispose(); visual?.dispose(); other?.dispose(); registry.dispose();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
}
