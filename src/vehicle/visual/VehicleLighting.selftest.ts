import * as THREE from 'three';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import {
  VehicleLightingController, type VehicleLightingState, type VehicleLightMode,
} from '../control/VehicleLightingController';
import { VehicleVisual } from './VehicleVisual';
import { DEFAULT_SEDAN_VISUAL_CONFIG, SPORTS_COUPE_VISUAL_CONFIG } from './VehicleVisualConfig';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';
import { VehicleLighting } from './VehicleLighting';

export interface VehicleLightingSelfTestResult {
  readonly assertions: number;
  readonly testedVehicles: number;
  readonly realLampMeshes: number;
  readonly maximumBodyLengthIncreaseMetres: number;
}

export function runVehicleLightingSelfTest(): VehicleLightingSelfTestResult {
  let assertions = 0;
  let realLampMeshes = 0;
  let maximumBodyLengthIncreaseMetres = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Vehicle lighting self-test failed: ${message}`);
  };
  const controller = new VehicleLightingController();
  const input = createNeutralVehicleInputState();
  const telemetry = { ignitionOn: false, actualGear: 'N' as number | string, steeringWheelAngle: 0 };
  const step = (dt = 1 / 120): VehicleLightingState => controller.update(dt, input, telemetry);
  for (const expected of ['position', 'low', 'high', 'off'] as const) {
    input.cycleLights = true;
    const state = step();
    input.cycleLights = false;
    assert(state.mainLightMode === expected, `main cycle must include ${expected}`);
    assert(state.positionLight === (expected !== 'off'), 'low/high retain the position/tail base');
  }
  for (const mode of ['off', 'position', 'low', 'high'] as VehicleLightMode[]) {
    controller.setMainLightMode(mode);
    input.highBeamFlash = true;
    let state = step();
    assert(state.effectiveHighBeam && state.mainLightMode === mode, `held flash does not overwrite ${mode}`);
    input.highBeamFlash = false;
    state = step();
    assert(state.effectiveHighBeam === (mode === 'high') && state.mainLightMode === mode,
      `flash release restores ${mode}`);
  }
  controller.setMainLightMode('off');
  input.fogToggle = true;
  let state = step();
  input.fogToggle = false;
  assert(state.fogLightsEnabled && state.mainLightMode === 'position', 'fog from OFF enables at least position');
  for (const expected of ['low', 'high', 'off'] as const) {
    input.cycleLights = true; state = step(); input.cycleLights = false;
    assert(state.mainLightMode === expected && state.fogLightsEnabled === (expected !== 'off'),
      'fog persists in low/high, then clears on OFF');
  }
  input.handbrake = 1; input.brake = 0;
  assert(!step().brakeLight, 'parking brake must not illuminate service-brake lamps');
  input.brake = 0.039;
  assert(!step().brakeLight, 'trigger noise does not flicker the brake lamps');
  input.brake = 0.041;
  assert(step().brakeLight, 'a light real brake input illuminates the brake lamps');
  input.brake = 0;
  telemetry.actualGear = 'R';
  assert(!step().reverseLight, 'reverse lamps require ignition, not just engaged reverse');
  telemetry.ignitionOn = true;
  assert(step().reverseLight, 'actual engaged R with ignition illuminates reverse lamps');
  telemetry.actualGear = 'N'; input.directGear = 'R';
  assert(!step().reverseLight, 'a requested reverse is not an actual reverse gear');
  delete input.directGear;

  input.leftIndicator = true; step(); input.leftIndicator = false;
  telemetry.steeringWheelAngle = -60 * Math.PI / 180; step();
  telemetry.steeringWheelAngle = 0;
  assert(step().leftTurnSignal, 'small unarmed lane change does not auto-cancel');
  telemetry.steeringWheelAngle = -90 * Math.PI / 180; step();
  assert(controller.autoCancel.armed, 'actual left wheel rotation arms after a real turn');
  telemetry.steeringWheelAngle = -45 * Math.PI / 180;
  assert(step().leftTurnSignal, 'partial return outside the central band retains turn signal');
  telemetry.steeringWheelAngle = -19 * Math.PI / 180;
  assert(!step().leftTurnSignal, 'left turn cancels after arm and centre return');
  input.rightIndicator = true; step(); input.rightIndicator = false;
  telemetry.steeringWheelAngle = 90 * Math.PI / 180; step();
  telemetry.steeringWheelAngle = 19 * Math.PI / 180;
  assert(!step().rightTurnSignal, 'right auto-cancel mirrors left');
  input.leftIndicator = true; step(); input.leftIndicator = false;
  telemetry.steeringWheelAngle = -90 * Math.PI / 180; step();
  input.rightIndicator = true; state = step(); input.rightIndicator = false;
  assert(!state.leftTurnSignal && state.rightTurnSignal && !controller.autoCancel.armed,
    'direction change clears opposite lamp and old cancellation arm');
  input.hazard = true; state = step(); input.hazard = false;
  assert(state.hazard && !state.leftTurnSignal && !state.rightTurnSignal,
    'hazard replaces old unilateral signals');
  for (let tick = 0; tick < 130; tick += 1) {
    state = step();
    assert(state.leftBlinkOn === state.rightBlinkOn, 'hazard corners blink synchronously');
  }
  input.hazard = true; state = step(); input.hazard = false;
  assert(!state.hazard && !state.leftTurnSignal && !state.rightTurnSignal, 'hazard OFF does not revive old unilateral state');
  controller.reset();

  const needsDocument = typeof document === 'undefined';
  if (needsDocument) Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) },
  });
  try {
    for (const config of [DEFAULT_SEDAN_VISUAL_CONFIG, SPORTS_COUPE_VISUAL_CONFIG]) {
      const visual = new VehicleVisual(config);
      const baselineLength = visual.getVisualBodyBounds().getSize(new THREE.Vector3()).z;
      const lamps = new VehicleLighting(visual);
      try {
        const all: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
        visual.exteriorRoot.traverse((object) => {
          if (object instanceof THREE.Mesh && object.userData.lightingOutput !== undefined) all.push(object);
        });
        realLampMeshes += all.length;
        assert(all.length >= 28, `${config.name}: complete lightweight lamp outputs are real exterior meshes`);
        assert(all.every((mesh) => mesh.layers.mask === 1 << VEHICLE_RENDER_LAYERS.EXTERIOR),
          `${config.name}: all lamp output meshes are on the real mirror-visible exterior layer`);
        const keys = ['head', 'position', 'tail', 'brake', 'reverse', 'fogFront', 'fogRear', 'left', 'right'];
        for (const key of keys) assert(all.some((mesh) => mesh.userData.lightingOutput === key),
          `${config.name}: missing real ${key} lamp geometry`);
        assert(all.every((mesh) => mesh.material.emissiveIntensity === 0), 'OFF has no emissive lamp output');
        const shown = { ...controller.state, mainLightMode: 'high' as const, positionLight: true, lowBeam: true,
          effectiveHighBeam: true, fogLightsEnabled: true, brakeLight: true, reverseLight: true,
          leftBlinkOn: true, rightBlinkOn: true };
        lamps.applyState(shown);
        assert(all.every((mesh) => mesh.material.emissiveIntensity > 0), 'each resolved lamp channel emits when enabled');
        for (const key of ['tail', 'brake', 'reverse', 'fogRear', 'left', 'right']) {
          assert(all.some((mesh) => mesh.userData.lightingOutput === key && mesh.name.includes('corner lens')),
            `${config.name}: ${key} has a physical rear-side lens, not a fake mirror output`);
        }
        visual.root.updateWorldMatrix(true, true);
        const caster = new THREE.Raycaster();
        caster.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR);
        for (const key of keys) {
          const mesh = all.find((object) => object.userData.lightingOutput === key && !object.name.includes('corner lens'))!;
          const centre = mesh.getWorldPosition(new THREE.Vector3());
          const eye = centre.clone().add(new THREE.Vector3(0, 0, centre.z < 0 ? -3 : 3));
          caster.set(eye, centre.clone().sub(eye).normalize());
          assert(caster.intersectObject(mesh).length > 0, `${config.name}: ${key} geometry is optically accessible from outside`);
          const first = caster.intersectObject(visual.exteriorRoot, true)
            .find((hit) => hit.object.userData.vehicleBodyPart !== 'glass');
          assert(first?.object.userData.lightingOutput === key,
            `${config.name}: the actual body must not cover the ${key} output lens`);
        }
        const growth = visual.getVisualBodyBounds().getSize(new THREE.Vector3()).z - baselineLength;
        maximumBodyLengthIncreaseMetres = Math.max(maximumBodyLengthIncreaseMetres, growth);
        assert(growth < 0.008, `${config.name}: lamp lenses must not enlarge the contact/body envelope materially`);
        const spotlights = visual.root.children.filter((object) => object instanceof THREE.SpotLight) as THREE.SpotLight[];
        const fogBeams = spotlights.filter(light => light.name.includes('fog'));
        lamps.applyState({ ...controller.state, mainLightMode: 'position', positionLight: true, fogLightsEnabled: true });
        assert(fogBeams.length === 3 && fogBeams.every(light => light.intensity > 0 && !light.castShadow),
          'fog-only mode supplies actual lightweight front and rear illumination');
        assert(spotlights.filter(light => !light.name.includes('fog')).every(light => light.intensity === 0),
          'fog does not switch on the low/high beams');
        const frontFog = fogBeams.filter(light => light.name.includes('front'));
        const rearFog = fogBeams.find(light => light.name.includes('Rear'))!;
        assert(frontFog.every(light => light.target.position.z < light.position.z && light.angle > Math.PI / 4 && light.distance <= 24),
          'front fog lights illuminate a wide, short range ahead of the vehicle');
        assert(rearFog.target.position.z > rearFog.position.z && rearFog.color.r > rearFog.color.g && rearFog.distance <= 6,
          'rear fog supplies only a short red spill behind the vehicle');
        lamps.applyState(controller.state);
        assert(all.every((mesh) => mesh.material.emissiveIntensity === 0), 'all outputs return to OFF without hidden lamp states');
        assert(spotlights.length === 5 && spotlights.every((light) => !light.castShadow && light.intensity === 0),
          'lamp effects remain lightweight and OFF removes all real beam output');
      } finally { lamps.dispose(); visual.dispose(); }
    }
  } finally {
    if (needsDocument) delete (globalThis as unknown as { document?: Document }).document;
  }
  return { assertions, testedVehicles: 2, realLampMeshes, maximumBodyLengthIncreaseMetres };
}
