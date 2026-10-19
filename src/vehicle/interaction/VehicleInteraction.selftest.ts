import * as THREE from 'three';

import { getVehicleDescriptor } from '../../vehicle/VehicleCatalog';
import { VehicleVisual } from '../../vehicle/visual/VehicleVisual';
import { canExitVehicle } from './DriverAccessController';
import { VehicleInteractionController } from './VehicleInteractionController';
import {
  applyVehicleInteractionVisual,
  type VehicleInteractionDefinition,
} from './VehicleInteractionDefinition';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import {
  DEFAULT_KEYBOARD_BINDINGS,
  KEYBOARD_BINDING_DEFINITIONS,
  type KeyboardBindings,
} from '../../input/KeyboardBindings';
import { KeyboardInput } from '../../input/KeyboardInput';
import { VehicleInputSystem } from '../../input/VehicleInputSystem';
import {
  driverExitWorldPoint,
  isInsideDriverInteractionZone,
  vehicleLocalToWorld,
  worldToVehicleLocal,
} from '../../player/DriverEntryZone';
import { OnFootController } from '../../player/OnFootController';
import { PlayerModeController } from '../../player/PlayerModeController';
import { vehicleControlsForPlayerMode } from '../../player/PlayerInput';
import {
  A6L_CABIN_ACOUSTICS_PROFILE,
  AUDI_A6L_AUDIO_PROFILE,
} from '../../audio/VehicleAudioProfile';
import {
  evaluateCabinAcoustics,
  type CabinAcousticState,
} from '../../audio/VehicleCabinAcoustics';
import { calculateEngineAudioMix } from '../../audio/EngineAudio';
import { calculateWeatherAudioMix, createWeatherAudioMix } from '../../audio/WeatherAudioMix';
import type { DriverAccessVisualConfig } from '../../vehicle/visual/VehicleVisualConfig';

export interface VehicleInteractionSelfTestResult {
  readonly passed: true;
  readonly assertions: number;
}

const activeActions: readonly (keyof KeyboardBindings)[] = [
  'enterExitVehicle', 'toggleDriverDoor', 'driverWindowUp', 'driverWindowDown',
];

const dispatchKey = (target: Window, type: 'keydown' | 'keyup', code: string): void => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    ctrlKey: { value: false },
    metaKey: { value: false },
    altKey: { value: false },
    repeat: { value: false },
  });
  target.dispatchEvent(event);
};

/**
 * Generic definition used to prove the shared controller is vehicle-agnostic.
 * The real A6L definition is checked separately from VehicleVisual.
 */
const createTestDefinition = (access: DriverAccessVisualConfig): VehicleInteractionDefinition => {
  const hinge = new THREE.Group();
  hinge.name = 'Test hinge';
  const door = new THREE.Group();
  door.name = 'Test door';
  hinge.add(door);
  const window = new THREE.Group();
  window.name = 'Test window';
  door.add(window);
  return {
    id: 'test-vehicle',
    driverDoor: {
      doorNode: door,
      hingeNode: hinge,
      closedTransform: { position: [0, 0, 0], rotation: [0, 0, 0] },
      openTransform: { position: [0, 0, 0], rotation: [0, access.openAngleRadians, 0] },
      openSeconds: access.openSeconds,
      closeSeconds: access.closeSeconds,
    },
    driverWindow: {
      node: window,
      closedTransform: { position: [0.1, 0.05, 0.8], rotation: [0, 0, 0] },
      localTravelDirection: access.windowTravelDirection,
      travelDistance: access.windowTravelDistance,
      movementSeconds: access.windowTravelSeconds,
    },
    driverEyePoint: [0, 1.2, 0.3],
    driverEntryPoint: access.driverEntryPoint,
    driverExitPoint: access.driverExitPoint,
    driverInteractionZone: access.driverInteractionZone,
    stationarySpeedEpsilon: access.stationarySpeedEpsilon,
    cabinAcoustics: A6L_CABIN_ACOUSTICS_PROFILE,
  };
};

export function runVehicleInteractionSelfTest(): VehicleInteractionSelfTestResult {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Vehicle interaction self-test failed: ${message}`);
  };
  const near = (actual: number, expected: number, tolerance: number, message: string): void => {
    assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
  };

  const config = getVehicleDescriptor('executive-lwb-2t').visualConfig;
  const driverAccess = config.driverAccess;
  assert(driverAccess !== undefined && driverAccess.side === 'left',
    'A6L authors the left driver door');
  if (driverAccess === undefined) throw new Error('A6L driver access configuration is missing');

  // A generic definition drives the shared runtime; no vehicle identity is used.
  const testDefinition = createTestDefinition(driverAccess);
  const access = new VehicleInteractionController();
  access.configure(testDefinition);
  assert(access.available, 'a vehicle interaction definition registers');
  assert(access.toggleDriverDoor(0).accepted, 'stationary door command is accepted');
  assert(access.door.state === 'OPENING', 'accepted toggle starts OPENING');
  access.update(0.15);
  const partialDoor = access.driverDoorOpenFraction;
  assert(partialDoor > 0 && partialDoor < 1, 'door opening is continuous, not an instant switch');
  assert(!access.toggleDriverDoor(1.4).accepted, 'moving door command is rejected');
  assert(access.door.state === 'OPENING', 'rejected moving command leaves the door opening');
  access.window.setPosition(0);
  access.driverWindowDown(1);
  assert(access.driverWindowOpenFraction > 0,
    'window still operates while the vehicle is moving');
  access.update(2);
  assert(access.door.state === 'OPEN' && access.driverDoorOpenFraction === 1, 'door reaches OPEN');
  access.door.toggle();
  assert(access.door.state === 'CLOSING' && access.driverDoorOpenFraction === 1,
    'reversing an open door starts CLOSING without a position jump');
  access.update(0.2);
  const closingAmount = access.driverDoorOpenFraction;
  access.door.toggle();
  assert(access.door.state === 'OPENING' && access.driverDoorOpenFraction === closingAmount,
    'repeated input during CLOSING reverses without restarting the mesh');
  access.update(0.1);
  assert(access.driverDoorOpenFraction > closingAmount, 'reversed door continues from its current angle');

  // Exit interlock: engine running is allowed, motion is not.
  assert(canExitVehicle({ driving: true, engineRunning: true, speedMetersPerSecond: 0 }),
    'engine running + stationary may exit');
  assert(!canExitVehicle({ driving: true, engineRunning: true, speedMetersPerSecond: 4 }),
    'moving may not exit');
  assert(access.requestExitVehicle(0).accepted, 'stationary exit request is accepted');
  assert(!access.requestExitVehicle(0.8).accepted, 'moving exit request is rejected');

  // Electric-window travel: arbitrary hold positions, clamps and immediate reversal.
  const window = access.window;
  window.setPosition(0);
  window.update(1, false, true);
  const quarter = window.openFraction;
  assert(quarter > 0 && quarter < 1, 'window moves continuously while held down');
  window.update(0.4, false, false);
  near(window.openFraction, quarter, 1e-12, 'released window holds its intermediate position');
  window.update(10, false, false);
  near(window.openFraction, quarter, 1e-12, 'window does not drift after release');
  window.update(10, false, true);
  assert(window.openFraction === 1, 'window clamps fully open at 1');
  window.update(10, false, true);
  assert(window.openFraction === 1, 'continued down input cannot exceed 1');
  window.update(0.2, true, false);
  const reversed = window.openFraction;
  assert(reversed < 1, 'window reverses from fully open immediately');
  window.update(0.05, false, true);
  assert(window.openFraction > reversed, 'window reverses from rising to falling without a jump');
  window.setPosition(0.73);
  near(window.openFraction, 0.73, 1e-12, 'window supports an arbitrary 0.73 position');
  window.setPosition(4);
  assert(window.openFraction === 1, 'window position clamps at 1');
  window.setPosition(-4);
  assert(window.openFraction === 0, 'window position clamps at 0');

  // Fraction-to-node mapping, and the glass remains a child of the door.
  const testRoot = new THREE.Group();
  testRoot.add(testDefinition.driverDoor.hingeNode);
  applyVehicleInteractionVisual(testDefinition, 0.5, 0.5);
  near(testDefinition.driverDoor.hingeNode.rotation.y,
    driverAccess.openAngleRadians * 0.5, 1e-12, 'door fraction drives the hinge transform');
  near(testDefinition.driverWindow.node.position.y,
    testDefinition.driverWindow.closedTransform.position[1] +
      driverAccess.windowTravelDirection[1] * driverAccess.windowTravelDistance * 0.5,
    1e-12, 'window fraction drives glass local travel');
  assert(testDefinition.driverDoor.doorNode === testDefinition.driverWindow.node.parent,
    'driver glass is parented to the door local hierarchy');
  applyVehicleInteractionVisual(testDefinition, 0, 0.5);
  testRoot.updateWorldMatrix(true, true);
  const glassAtClosedDoor = testDefinition.driverWindow.node.getWorldPosition(new THREE.Vector3());
  applyVehicleInteractionVisual(testDefinition, 1, 0.5);
  testRoot.updateWorldMatrix(true, true);
  const glassAtOpenDoor = testDefinition.driverWindow.node.getWorldPosition(new THREE.Vector3());
  assert(glassAtOpenDoor.distanceTo(glassAtClosedDoor) > 0.3,
    'half-open glass follows the door when it opens');

  // Driving inputs never leak into the vehicle while on foot.
  const raw = {
    ...createNeutralVehicleInputState(),
    throttle: 1,
    brake: 1,
    steering: 0.8,
    handbrake: 1,
    enterExitVehicle: true,
  };
  const onFootControls = vehicleControlsForPlayerMode(raw, 'OnFoot');
  assert(onFootControls.throttle === 0 && onFootControls.brake === 0 &&
    onFootControls.steering === 0, 'OnFoot clears throttle, brake and steering to the vehicle');
  assert(onFootControls.handbrake === 1, 'OnFoot preserves the parking-brake latch');
  assert(vehicleControlsForPlayerMode(raw, 'Driving') === raw,
    'Driving forwards the existing driving input unchanged');

  // Driver entry proximity comes from the definition, not vehicle-specific code.
  const zone = testDefinition.driverInteractionZone;
  const pose = { x: 12, z: -7, yaw: 0.73 };
  const exit = driverExitWorldPoint(pose, testDefinition);
  assert(isInsideDriverInteractionZone(exit, pose, zone), 'exit anchor is inside the entry zone');
  const roundTrip = worldToVehicleLocal(exit, pose);
  near(roundTrip.x, zone.centerLocal[0], 1e-9, 'world/local conversion round-trips X');
  near(roundTrip.z, zone.centerLocal[1], 1e-9, 'world/local conversion round-trips Z');
  const passenger = vehicleLocalToWorld({ x: -zone.centerLocal[0], z: zone.centerLocal[1] }, pose);
  assert(!isInsideDriverInteractionZone(passenger, pose, zone), 'passenger side cannot enter');
  const trunk = vehicleLocalToWorld({ x: zone.centerLocal[0], z: zone.centerLocal[1] + 5 }, pose);
  assert(!isInsideDriverInteractionZone(trunk, pose, zone), 'boot/tail area cannot enter');
  const distant = vehicleLocalToWorld({ x: zone.centerLocal[0] - 5, z: zone.centerLocal[1] }, pose);
  assert(!isInsideDriverInteractionZone(distant, pose, zone), 'several metres away cannot enter');
  const wrongDoor = vehicleLocalToWorld({ x: zone.centerLocal[0], z: zone.centerLocal[1] - 4 }, pose);
  assert(!isInsideDriverInteractionZone(wrongDoor, pose, zone), 'front-of-car point cannot enter');
  assert(access.requestEnterVehicle(0, exit, pose).accepted, 'stationary near entry is accepted');
  assert(access.requestEnterVehicle(4, exit, pose).reason === 'vehicle-moving',
    'moving entry is rejected');
  assert(access.requestEnterVehicle(0, distant, pose).reason === 'not-near',
    'distant entry is rejected as not-near');
  assert(access.cabinAcoustics === A6L_CABIN_ACOUSTICS_PROFILE,
    'cabin acoustics comes from the definition profile');
  assert(AUDI_A6L_AUDIO_PROFILE.cabinAcoustics === A6L_CABIN_ACOUSTICS_PROFILE,
    'A6L audio profile owns its cabin acoustics calibration');

  // A missing definition is a silent graceful fallback, not an error.
  const unsupported = new VehicleInteractionController();
  unsupported.configure(null);
  assert(!unsupported.available, 'no interaction definition reports unavailable');
  assert(!unsupported.toggleDriverDoor(0).accepted && !unsupported.requestExitVehicle(0).accepted,
    'no interaction definition rejects commands without throwing');
  assert(unsupported.driverExitPoint(pose) === null, 'no interaction definition has no exit anchor');

  // Walker stays out of the vehicle OBB and on the ground.
  const walker = new OnFootController();
  walker.placeAt(-3, 0, 0.4, 0);
  for (let step = 0; step < 180; step += 1) {
    walker.update(1 / 60, 0, 1, {
      groundHeightAt: () => 0.4,
      nearbyColliders: () => [],
      vehicle: { x: 0, z: 0, yaw: 0, dimensions: config.dimensions },
    });
  }
  assert(walker.position.x < -1.2 && walker.position.x > -1.6,
    'walking into the A6L is stopped by its collision envelope');
  near(walker.position.y, 0.4, 1e-9, 'walker follows the ground height');
  walker.addLook(0.2, 4);
  assert(walker.pitch <= 1.15, 'walking look pitch is clamped');

  // Player mode transition commits only at the end.
  const playerMode = new PlayerModeController({ exitSeconds: 0.8, enterSeconds: 0.8 });
  assert(playerMode.beginExit(), 'exit transition starts from Driving');
  assert(playerMode.mode === 'Driving', 'mode stays Driving during the exit camera blend');
  let update = playerMode.update(0.4);
  assert(update !== null && !update.completed && update.progress > 0 && update.progress < 1,
    'halfway through the exit transition the camera progress is partial');
  update = playerMode.update(0.4);
  assert(update !== null && update.completed && playerMode.mode === 'OnFoot',
    'exit transition switches to OnFoot only when complete');
  assert(playerMode.beginEnter(), 'enter transition starts from OnFoot');
  update = playerMode.update(0.8);
  assert(update !== null && update.completed && playerMode.mode === 'Driving',
    'enter transition returns to Driving');

  // Continuous cabin acoustics: window, door and speed.
  const closed = evaluateCabinAcoustics(A6L_CABIN_ACOUSTICS_PROFILE,
    { windowPosition: 0, doorOpenAmount: 0, speedMetersPerSecond: 20 });
  const half = evaluateCabinAcoustics(A6L_CABIN_ACOUSTICS_PROFILE,
    { windowPosition: 0.5, doorOpenAmount: 0, speedMetersPerSecond: 20 });
  const open = evaluateCabinAcoustics(A6L_CABIN_ACOUSTICS_PROFILE,
    { windowPosition: 1, doorOpenAmount: 0, speedMetersPerSecond: 20 });
  const doorOpen = evaluateCabinAcoustics(A6L_CABIN_ACOUSTICS_PROFILE,
    { windowPosition: 0, doorOpenAmount: 1, speedMetersPerSecond: 20 });
  const openFast = evaluateCabinAcoustics(A6L_CABIN_ACOUSTICS_PROFILE,
    { windowPosition: 0, doorOpenAmount: 1, speedMetersPerSecond: 40 });
  assert(closed.isolation > half.isolation && half.isolation > open.isolation,
    'isolation falls continuously as the window opens');
  assert(open.isolation > doorOpen.isolation,
    'an open door loses more isolation than a fully open window');
  assert(closed.windScale < half.windScale && half.windScale < open.windScale,
    'wind exposure rises continuously with window position');
  assert(closed.roadScale < half.roadScale && half.roadScale < open.roadScale,
    'road noise rises continuously with window position');
  assert(closed.engineScale < half.engineScale && half.engineScale < open.engineScale,
    'exterior engine presence rises continuously with window position');
  assert(closed.ambienceScale < half.ambienceScale && half.ambienceScale < open.ambienceScale,
    'exterior ambience rises continuously with window position');
  assert(closed.lowpassHz < half.lowpassHz && half.lowpassHz < open.lowpassHz,
    'cabin low-pass opens continuously with window position');
  assert(openFast.windScale > doorOpen.windScale && openFast.lowpassHz > doorOpen.lowpassHz,
    'speed further exposes the cabin once open');

  // The engine and weather mixes consume the same continuous state.
  const engineMix = (acoustics: CabinAcousticState) => calculateEngineAudioMix(2_500, 0.5, {
    profile: AUDI_A6L_AUDIO_PROFILE, cockpit: true, vehicleSpeed: 32, roadRoughness: 0.35,
    cabinAcoustics: acoustics,
  });
  const engineClosed = engineMix(closed), engineHalf = engineMix(half), engineOpen = engineMix(open);
  assert(engineClosed.wind < engineHalf.wind && engineHalf.wind < engineOpen.wind,
    'engine mix wind gain follows the continuous cabin state');
  assert(engineClosed.road < engineHalf.road && engineHalf.road < engineOpen.road,
    'engine mix road gain follows the continuous cabin state');
  assert(engineClosed.exhaust < engineHalf.exhaust && engineHalf.exhaust < engineOpen.exhaust,
    'cabin engine presence follows the continuous cabin state');
  assert(engineClosed.cabinLowpassHz < engineHalf.cabinLowpassHz &&
    engineHalf.cabinLowpassHz < engineOpen.cabinLowpassHz,
    'engine mix low-pass cutoff follows the continuous cabin state');
  const weather = (acoustics: CabinAcousticState) => calculateWeatherAudioMix(
    createWeatherAudioMix(), 0.7, 0.6, 0.3, true, 25, AUDI_A6L_AUDIO_PROFILE, acoustics);
  const weatherClosed = weather(closed), weatherHalf = weather(half), weatherOpen = weather(open);
  assert(weatherClosed.rainAmbient < weatherHalf.rainAmbient &&
    weatherHalf.rainAmbient < weatherOpen.rainAmbient,
    'weather ambience follows the continuous cabin state');
  assert(weatherClosed.wind < weatherHalf.wind && weatherHalf.wind < weatherOpen.wind,
    'weather wind follows the continuous cabin state');
  assert(weatherClosed.rainLowpassHz < weatherHalf.rainLowpassHz &&
    weatherHalf.rainLowpassHz < weatherOpen.rainLowpassHz,
    'weather low-pass cutoff follows the continuous cabin state');

  // Settings registration, defaults and rebinding.
  for (const action of activeActions) {
    assert(KEYBOARD_BINDING_DEFINITIONS.some(definition => definition.action === action),
      `${action} is registered in the settings definitions`);
    assert(typeof DEFAULT_KEYBOARD_BINDINGS[action] === 'string' &&
      DEFAULT_KEYBOARD_BINDINGS[action].length > 0, `${action} has a default key`);
  }
  const defaultCodes = Object.values(DEFAULT_KEYBOARD_BINDINGS);
  assert(new Set(defaultCodes).size === defaultCodes.length, 'default keyboard bindings stay conflict-free');
  assert(DEFAULT_KEYBOARD_BINDINGS.enterExitVehicle === 'Tab', 'Enter/Exit defaults to Tab');
  assert(DEFAULT_KEYBOARD_BINDINGS.toggleDriverDoor === 'Digit0', 'driver door defaults to 0');
  assert(DEFAULT_KEYBOARD_BINDINGS.driverWindowUp === 'Digit8', 'window up defaults to 8');
  assert(DEFAULT_KEYBOARD_BINDINGS.driverWindowDown === 'Digit9', 'window down defaults to 9');

  const target = new EventTarget() as unknown as Window;
  const storage = new Map<string, string>();
  const keyboard = new KeyboardInput({
    target,
    storage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
      removeItem: key => { storage.delete(key); },
    },
    bindings: {},
  });
  const updateKeyboard = (): void => keyboard.update({
    deltaTime: 1 / 60, controlMode: 'normal', manualClutchPedal: 1, actualClutchEngagement: 0,
  });
  try {
    keyboard.setBinding('enterExitVehicle', 'KeyY');
    assert(keyboard.getBindings().enterExitVehicle === 'KeyY',
      'Enter/Exit can be rebound through the existing input abstraction');
    assert(storage.size > 0, 'rebound keys are persisted');
    keyboard.setBinding('driverWindowDown', 'KeyY');
    const rebound = keyboard.getBindings();
    assert(new Set(Object.values(rebound)).size === Object.values(rebound).length,
      'a rebind conflict swaps keys without duplicating them');
    keyboard.resetBindings();
    assert(keyboard.getBindings().enterExitVehicle === 'Tab', 'reset restores the default action');

    dispatchKey(target, 'keydown', 'Tab');
    updateKeyboard();
    let state = keyboard.consumeState();
    assert(state.enterExitVehicle === true, 'Tab emits one Enter/Exit edge');
    assert(keyboard.consumeState().enterExitVehicle === false, 'the Enter/Exit edge is consumed once');
    dispatchKey(target, 'keyup', 'Tab');

    dispatchKey(target, 'keydown', 'Digit8');
    updateKeyboard();
    state = keyboard.consumeState();
    assert(state.driverWindowUp === true && state.driverWindowDown === false,
      'window up is a held control');
    dispatchKey(target, 'keydown', 'Digit9');
    updateKeyboard();
    state = keyboard.consumeState();
    assert(state.driverWindowUp === true && state.driverWindowDown === true,
      'opposing window switches are both visible to the controller');
    dispatchKey(target, 'keyup', 'Digit8');
    updateKeyboard();
    state = keyboard.consumeState();
    assert(state.driverWindowUp === false && state.driverWindowDown === true,
      'releasing up leaves down held');
    dispatchKey(target, 'keyup', 'Digit9');
    updateKeyboard();
    state = keyboard.consumeState();
    assert(state.driverWindowUp === false && state.driverWindowDown === false,
      'released window switches stop the glass');
  } finally {
    keyboard.dispose();
  }

  // The unified input system forwards the same edges and held switches.
  const systemTarget = new EventTarget() as unknown as Window;
  const systemInput = new VehicleInputSystem({
    gamepad: false,
    keyboard: {
      target: systemTarget,
      storage: {
        getItem: () => null, setItem: () => undefined, removeItem: () => undefined,
      },
    },
  });
  try {
    dispatchKey(systemTarget, 'keydown', 'Digit0');
    systemInput.update(1 / 60, 0);
    let systemState = systemInput.consumeState();
    assert(systemState.toggleDriverDoor === true, 'the unified input system forwards the door edge');
    assert(systemInput.consumeState().toggleDriverDoor === false, 'the door edge is consumed once');
    dispatchKey(systemTarget, 'keyup', 'Digit0');

    dispatchKey(systemTarget, 'keydown', 'Tab');
    systemInput.update(1 / 60, 0);
    systemState = systemInput.consumeState();
    assert(systemState.enterExitVehicle === true, 'the unified input system forwards the enter/exit edge');
    dispatchKey(systemTarget, 'keyup', 'Tab');

    dispatchKey(systemTarget, 'keydown', 'Digit9');
    systemInput.update(1 / 60, 0);
    systemState = systemInput.consumeState();
    assert(systemState.driverWindowDown === true && systemState.driverWindowUp === false,
      'the unified input system forwards the held window switch');
    dispatchKey(systemTarget, 'keyup', 'Digit9');
    systemInput.update(1 / 60, 0);
    systemState = systemInput.consumeState();
    assert(systemState.driverWindowDown === false, 'window release reaches the unified state');
  } finally {
    systemInput.dispose();
  }

  // Visual split: hinge, moving skin/glass and the relocated interior card.
  const needsDocument = typeof document === 'undefined';
  if (needsDocument) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => {
          const canvas = { width: 1, height: 1, getContext: () => context };
          const context = new Proxy<Record<string, unknown>>({}, {
            get(target, key: string) {
              if (key in target) return target[key];
              if (key === 'measureText') return () => ({ width: 0 });
              if (key === 'createLinearGradient' || key === 'createRadialGradient') {
                return () => ({ addColorStop: () => undefined });
              }
              return () => undefined;
            },
            set(target, key: string, value) { target[key] = value; return true; },
          });
          context.canvas = canvas;
          return canvas;
        },
      },
    });
  }
  let visual: VehicleVisual | null = null;
  try {
    visual = new VehicleVisual(config);
    assert(visual.hasDriverAccessVisual, 'A6L visual exposes the driver door and glass');
    const hinge = visual.exteriorRoot.getObjectByName('Driver door hinge');
    const door = visual.exteriorRoot.getObjectByName('Driver door');
    const mount = visual.exteriorRoot.getObjectByName('Driver window glass mount');
    assert(hinge instanceof THREE.Group && door instanceof THREE.Group && mount instanceof THREE.Group,
      'separate hinge, door and glass mount exist in the exterior hierarchy');
    if (!(hinge instanceof THREE.Group) || !(door instanceof THREE.Group) ||
      !(mount instanceof THREE.Group)) {
      throw new Error('driver access visual hierarchy is incomplete');
    }
    near(hinge.position.z, driverAccess.doorFrontZ, 1e-9, 'hinge sits on the front shut line');
    assert(hinge.position.x < -0.8, 'hinge sits on the driver side of the body');
    const definition = visual.interactionDefinition;
    assert(definition !== null, 'A6L visual registers a VehicleInteractionDefinition');
    if (definition === null) throw new Error('A6L interaction definition is missing');
    assert(definition.driverDoor.hingeNode === hinge && definition.driverDoor.doorNode === door &&
      definition.driverWindow.node === mount,
      'the definition exposes the A6L hinge, door and window nodes');
    near(definition.driverExitPoint[0], driverAccess.driverExitPoint[0], 1e-12,
      'exit anchor comes from the A6L interaction config');
    near(definition.driverEntryPoint[2], driverAccess.driverEntryPoint[2], 1e-12,
      'entry anchor comes from the A6L interaction config');
    near(definition.driverEyePoint[1], config.driverEyePosition[1], 1e-12,
      'eye anchor comes from the A6L visual config');
    assert(definition.driverWindow.travelDistance === driverAccess.windowTravelDistance,
      'window travel distance comes from the A6L interaction config');
    applyVehicleInteractionVisual(definition, 0, 0);
    near(hinge.rotation.y, 0, 1e-12, 'closed door angle is zero');
    near(mount.position.y, 0, 1e-12, 'closed window is fully raised');
    applyVehicleInteractionVisual(definition, 1, 0.5);
    near(hinge.rotation.y, driverAccess.openAngleRadians, 1e-12,
      'fully open door uses the authored hinge angle');
    near(hinge.position.z, driverAccess.doorFrontZ, 1e-12,
      'the shared visual applier preserves the authored hinge mount');
    const travel = definition.driverWindow.travelDistance;
    assert(travel > 0.3, 'glass travel is a real vertical distance');
    near(mount.position.y, definition.driverWindow.localTravelDirection[1] * travel * 0.5, 1e-12,
      'half-open window lowers the glass continuously');
    assert(visual.cockpitRoot.getObjectByName('Left door card') === undefined,
      'driver door card moved onto the hinged door');
    assert(door.getObjectByName('Left door card') !== undefined,
      'interior driver card follows the door');
    assert(visual.exteriorRoot.getObjectByName('Left front side window') === undefined,
      'the old static driver window was replaced');
    const glassMesh = visual.exteriorRoot.getObjectByName('Driver window glass');
    assert(glassMesh instanceof THREE.Mesh,
      'the hinged door owns one continuous driver glass pane');
    if (!(glassMesh instanceof THREE.Mesh)) throw new Error('driver glass mesh is missing');
    const glassMaterial = glassMesh.material as THREE.MeshPhysicalMaterial;
    const clippingPlanes = glassMaterial.clippingPlanes;
    assert(clippingPlanes?.length === 1,
      'the driver glass is clipped at the door belt plane instead of entering trim geometry');
    assert(clippingPlanes?.[0]?.normal.y === 1,
      'the belt clip plane is horizontal in door space');
    assert(door.getObjectByName('Ambient door upper trim') !== undefined,
      'the driver-door light ribbon follows the hinged door');
    assert(visual.cockpitRoot.getObjectByName('Ambient door upper trim') !== undefined,
      'the remaining cabin light ribbons stay on the body');

    const migrated = [
      { id: 'bmw-530li-g38', ambient: 'Left front ambient door trim' },
      { id: 'mercedes-e300l-v214', ambient: 'Left front ambient door ribbon' },
    ] as const;
    for (const vehicle of migrated) {
      const descriptor = getVehicleDescriptor(vehicle.id);
      const migratedConfig = descriptor.visualConfig;
      const access = migratedConfig.driverAccess;
      assert(access !== undefined, `${vehicle.id} authors driver interaction`);
      if (access === undefined) continue;
      const migratedVisual = new VehicleVisual(migratedConfig);
      try {
        const migratedDefinition = migratedVisual.interactionDefinition;
        assert(migratedDefinition !== null, `${vehicle.id} registers an interaction definition`);
        if (migratedDefinition === null) continue;
        const migratedHinge = migratedDefinition.driverDoor.hingeNode;
        applyVehicleInteractionVisual(migratedDefinition, 1, 0.5);
        near(migratedHinge.rotation.y, access.openAngleRadians, 1e-12,
          `${vehicle.id} door fraction drives the hinge`);
        near(migratedDefinition.driverWindow.node.position.y,
          migratedDefinition.driverWindow.localTravelDirection[1] *
            migratedDefinition.driverWindow.travelDistance * 0.5, 1e-12,
          `${vehicle.id} window fraction drives the glass`);
        assert(migratedDefinition.driverDoor.doorNode.getObjectByName('Left front closed door trim surface') !== undefined,
          `${vehicle.id} front door card follows the hinge`);
        assert(migratedVisual.cockpitRoot.getObjectByName('Left front closed door trim surface') === undefined,
          `${vehicle.id} front door card is removed from the static cabin root`);
        assert(migratedDefinition.driverDoor.doorNode.getObjectByName(vehicle.ambient) !== undefined,
          `${vehicle.id} door ambient ribbon follows the hinge`);
        assert(migratedVisual.cockpitRoot.getObjectByName(vehicle.ambient) === undefined,
          `${vehicle.id} door ambient ribbon is removed from the static cabin root`);
        const migratedGlass = migratedDefinition.driverDoor.doorNode.getObjectByName('Left Front side window');
        assert(migratedGlass instanceof THREE.Mesh, `${vehicle.id} driver glass is parented to the door`);
        if (migratedGlass instanceof THREE.Mesh) {
          const material = migratedGlass.material as THREE.MeshPhysicalMaterial;
          assert(material.clippingPlanes?.length === 1,
            `${vehicle.id} driver glass uses the shared belt clip`);
          applyVehicleInteractionVisual(migratedDefinition, 0, 0.5);
          migratedVisual.root.updateMatrixWorld(true);
          const glassAtClosedDoor = migratedGlass.getWorldPosition(new THREE.Vector3());
          applyVehicleInteractionVisual(migratedDefinition, 1, 0.5);
          migratedVisual.root.updateMatrixWorld(true);
          const glassAtOpenDoor = migratedGlass.getWorldPosition(new THREE.Vector3());
          assert(glassAtOpenDoor.distanceTo(glassAtClosedDoor) > 0.3,
            `${vehicle.id} half-open glass follows the opening door`);
        }
        const migratedController = new VehicleInteractionController();
        migratedController.configure({
          ...migratedDefinition,
          cabinAcoustics: descriptor.audioProfile?.cabinAcoustics,
        });
        assert(migratedController.available, `${vehicle.id} controller configures`);
        assert(migratedController.cabinAcoustics !== undefined,
          `${vehicle.id} cabin acoustics comes from its audio profile`);
        const migratedPose = { x: 4, z: -3, yaw: .42 };
        const migratedExit = driverExitWorldPoint(migratedPose, migratedDefinition);
        assert(migratedController.requestExitVehicle(0).accepted, `${vehicle.id} stationary exit accepted`);
        assert(migratedController.requestEnterVehicle(0, migratedExit, migratedPose).accepted,
          `${vehicle.id} authored exit anchor is inside the entry zone`);
        assert(!migratedController.toggleDriverDoor(2).accepted, `${vehicle.id} moving door rejected`);
      } finally {
        migratedVisual.dispose();
      }
    }

    const plain = new VehicleVisual(getVehicleDescriptor('family-sedan').visualConfig);
    try {
      assert(plain.interactionDefinition === null,
        'a vehicle without driver interaction returns null instead of throwing');
    } finally {
      plain.dispose();
    }
  } finally {
    visual?.dispose();
    if (needsDocument) delete (globalThis as unknown as { document?: Document }).document;
  }

  return { passed: true, assertions };
}
