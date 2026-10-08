import * as THREE from 'three';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import {
  VehicleLightingController, type VehicleLightingState, type VehicleLightMode,
} from '../control/VehicleLightingController';
import { VehicleVisual } from './VehicleVisual';
import { DEFAULT_SEDAN_VISUAL_CONFIG, SPORTS_COUPE_VISUAL_CONFIG, EXECUTIVE_SEDAN_VISUAL_CONFIG } from './VehicleVisualConfig';
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
  controller.setMainLightMode('high');
  const executiveTelemetry = { ...telemetry, autoOffWithIgnition: true, ignitionOn: false };
  const sleeping = controller.update(1 / 120, input, executiveTelemetry);
  assert(!sleeping.positionLight && !sleeping.lowBeam && !sleeping.effectiveHighBeam && sleeping.mainLightMode === 'off',
    'configured ignition cut removes all executive main lamp states');
  assert(controller.update(1 / 120, input, { ...executiveTelemetry, ignitionOn: true }).effectiveHighBeam,
    'ignition restores the selected lighting mode');
  assert(controller.update(1 / 120, input, { ...executiveTelemetry, autoOffWithIgnition: false }).effectiveHighBeam,
    'legacy lamp controls retain their independent ignition behavior');
  controller.reset();

  const needsDocument = typeof document === 'undefined';
  if (needsDocument) Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) },
  });
  try {
    for (const config of [DEFAULT_SEDAN_VISUAL_CONFIG, SPORTS_COUPE_VISUAL_CONFIG, EXECUTIVE_SEDAN_VISUAL_CONFIG]) {
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
        if (config.exteriorLighting) {
          const beams = spotlights.filter(light => !light.name.includes('fog') && !light.name.includes('near fill'));
          const modules = all.filter(mesh => mesh.userData.lightingOutput === 'head');
          assert(modules.length === 8 && modules.every(mesh => mesh.geometry instanceof THREE.BoxGeometry && mesh.geometry.parameters.width < .06),
            'luxury lamps expose separate optical modules');
          for (const beam of beams) assert(modules.some(mesh => Math.abs(mesh.position.x - beam.position.x) < .05 && Math.abs(mesh.position.y - beam.position.y) < .01 && Math.abs(mesh.position.z - beam.position.z) < .03),
            'real light origin stays inside its visible optical housing');
          lamps.setMode('low');
          const lowRange = beams[0]!.distance, lowAngle = beams[0]!.angle, lowPower = beams[0]!.intensity;
          lamps.setMode('high');
          assert(beams.every(light => light.distance >= lowRange * 1.8 && light.intensity > lowPower && light.angle < lowAngle),
            'high beam adds actual forward reach and central illumination');
          assert(spotlights.filter(light => light.name.includes('near fill')).every(light => light.intensity === lowPower && light.distance === lowRange),
            'high beam retains wide near-road illumination');
          const ribbon = visual.cockpitRoot.getObjectByName('Ambient dashboard indirect ribbon') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
          assert(!!ribbon && visual.cockpitRoot.getObjectsByProperty('name', 'Steering hub satin four-ring badge').length === 4,
            'luxury cockpit has the configured ambient trim and four-ring badge');
          const cockpit = visual.cockpitRoot;
          const frame = { speedKmh: 0, rpm: 780, gear: 'P', ignitionOn: true, engineRunning: true };
          cockpit.updateInstruments({ ...frame, indicators: {} }, 1);
          const daytime = ribbon.material.emissiveIntensity;
          cockpit.updateInstruments({ ...frame, indicators: { positionLights: true } }, 1);
          assert(ribbon.material.emissiveIntensity > daytime * 10, 'position lamps wake the restrained cabin lighting');
          const lit = ribbon.material.emissiveIntensity;
          cockpit.updateInstruments({ ...frame, ignitionOn: false, engineRunning: false, indicators: { positionLights: true } }, .1);
          assert(ribbon.material.emissiveIntensity > 0 && ribbon.material.emissiveIntensity < lit, 'ignition off fades cabin lighting even with exterior lamps enabled');
          cockpit.updateInstruments({ ...frame, ignitionOn: false, engineRunning: false }, 1);
          assert(ribbon.material.emissiveIntensity < .003, 'ambient trim settles to darkness');
        } else assert(!visual.cockpitRoot.getObjectByName('Ambient dashboard indirect ribbon'), 'legacy cabins do not inherit luxury lighting');
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
        assert(spotlights.length === (config.exteriorLighting?.retainLowBeamOnHigh ? 7 : 5) && spotlights.every((light) => !light.castShadow && light.intensity === 0),
          'lamp effects remain lightweight and OFF removes all real beam output');
        if (config.exteriorLighting?.autoOffWithIgnition) {
          lamps.applyState(shown, false, 1 / 60);
          assert(spotlights.every(light => light.intensity === 0) && all.filter(mesh => ['head', 'position', 'tail', 'fogFront', 'fogRear'].includes(mesh.userData.lightingOutput))
            .every(mesh => mesh.material.emissiveIntensity === 0), 'ignition cut also guards direct visual state updates');
          lamps.applyState(controller.state, true, .2);
          const drl = all.filter(mesh => mesh.name.includes('DRL segment'));
          assert(drl.some(mesh => mesh.material.emissiveIntensity > 0) && drl.some(mesh => mesh.material.emissiveIntensity === 0),
            'welcome light advances across the real DRL segments');
          lamps.applyState(controller.state, true, 1);
          assert(drl.every(mesh => mesh.material.emissiveIntensity === 0), 'short welcome finishes without leaving unwanted lights on');
          for (const direction of ['left', 'right', 'hazard'] as const) {
            const blinking = { ...controller.state, leftBlinkOn: direction !== 'right', rightBlinkOn: direction !== 'left' };
            lamps.applyState(controller.state, true, .01);
            lamps.applyState(blinking, true, .01);
            const selected = all.filter(mesh => mesh.name.includes('front turn segment') && mesh.userData.lightingOutput === (direction === 'right' ? 'right' : 'left'));
            assert(selected.some(mesh => mesh.material.emissiveIntensity > 0) && selected.some(mesh => mesh.material.emissiveIntensity === 0),
              `${direction}: amber signature starts sequentially`);
            lamps.applyState(blinking, true, .2);
            assert(selected.every(mesh => mesh.material.emissiveIntensity >= 3), `${direction}: complete front amber signature is clearly lit`);
            assert(selected.every(mesh => mesh.geometry instanceof THREE.BoxGeometry && mesh.geometry.parameters.height >= .025),
              'front amber diffuser has a readable physical area');
            const spills = visual.root.children.filter(object => object instanceof THREE.PointLight && object.name.includes('indicator spill')) as THREE.PointLight[];
            assert(spills.length === 2 && spills.every(light => !light.castShadow && (light.name.startsWith('Left')
              ? light.intensity > 0 === blinking.leftBlinkOn : light.intensity > 0 === blinking.rightBlinkOn)),
              `${direction}: amber illumination follows the same left/right lamp state`);
            if (direction === 'hazard') for (let i = 1; i <= 5; i++) {
              const l = all.find(mesh => mesh.name === `Left front turn segment ${i}`)!;
              const r = all.find(mesh => mesh.name === `Right front turn segment ${i}`)!;
              assert(l.material.emissiveIntensity === r.material.emissiveIntensity, 'hazard sweeps both sides together');
            }
          }
          lamps.applyState(controller.state, true, .01);
          assert(visual.root.children.filter(object => object instanceof THREE.PointLight && object.name.includes('indicator spill'))
            .every(object => (object as THREE.PointLight).intensity === 0), 'indicator OFF removes the amber spill');
          const glass: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>[] = [];
          visual.exteriorRoot.traverse(object => { if (object instanceof THREE.Mesh && object.userData.vehicleBodyPart === 'glass') glass.push(object); });
          assert(glass.length === 6 && glass.every(mesh => mesh.material.transparent && mesh.material.opacity > .1 && mesh.material.opacity < .4 && mesh.material.side === THREE.DoubleSide),
            'all six executive windows have moderate, two-sided tint');
          const windscreen = glass.find(mesh => mesh.name === 'Exterior front windshield')!;
          assert(glass.filter(mesh => mesh !== windscreen).every(mesh => mesh.material.opacity > windscreen.material.opacity),
            'windscreen remains lighter than side and rear glazing');
          for (const side of [-1, 1]) {
            const point = new THREE.Vector3(side * (config.dimensions.width * .5 - .005) * .973, .727,
              -(config.dimensions.length - .0226) * .5 + .10);
            const eye = point.clone().add(new THREE.Vector3(side * 2, .1, -2));
            caster.set(eye, point.clone().sub(eye).normalize());
            const first = caster.intersectObject(visual.exteriorRoot, true)
              .find(hit => hit.object.userData.vehicleBodyPart !== 'glass');
            assert(first?.object.name === `${side < 0 ? 'Left' : 'Right'} front turn corner`,
              'front amber diffuser is exposed from the forward flank');
          }
          for (const name of ['Executive closed windshield cowl', 'Executive closed rear glass deck return',
            'Left sealed window sill 1', 'Right sealed window sill 3', 'Left sealed C-pillar shoulder', 'Right sealed C-pillar shoulder']) {
            assert(!!visual.exteriorRoot.getObjectByName(name), 'body closure remains present around glazing');
          }
          const frame = { speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: true, engineRunning: false };
          visual.updateInstruments(frame, 3);
          for (const side of ['left', 'right'] as const) {
            const hinge = visual.exteriorRoot.getObjectByName(`${side} mirror folding hinge`)!;
            const optical = visual.mirrorSurfaceRoot.getObjectByName(`${side} mirror optical folding hinge`)!;
            visual.updateInstruments({ ...frame, ignitionOn: false }, .1);
            assert(Math.abs(hinge.rotation.y) > .01 && Math.abs(hinge.rotation.y) < config.automaticMirrorFold!.angleRadians,
              `${side}: folding progresses without a teleport`);
            visual.updateInstruments({ ...frame, ignitionOn: false }, 3);
            assert(Math.abs(hinge.rotation.y - optical.rotation.y) < 1e-8 && Math.abs(hinge.rotation.y) > 1,
              `${side}: optical surface folds with its housing`);
            const bounds = new THREE.Box3().setFromObject(visual.root.getObjectByName(`${side} mirror housing`) ?? hinge);
            assert(side === 'left' ? bounds.max.x < -.85 : bounds.min.x > .85, `${side}: folded housing stays outside the cabin`);
            visual.updateInstruments(frame, 3);
            assert(Math.abs(hinge.rotation.y) < .00001, `${side}: ignition restores the original mirror optics`);
          }
          assert(visual.cockpitRoot.getObjectsByProperty('name', 'Ambient door upper trim').length === 4 &&
            !!visual.cockpitRoot.getObjectByName('Executive upper centre display glass') && !!visual.cockpitRoot.getObjectByName('Executive front cabin bulkhead'),
            'front cabin and door ambient trim are complete');
        }
      } finally { lamps.dispose(); visual.dispose(); }
    }
  } finally {
    if (needsDocument) delete (globalThis as unknown as { document?: Document }).document;
  }
  return { assertions, testedVehicles: 3, realLampMeshes, maximumBodyLengthIncreaseMetres };
}
