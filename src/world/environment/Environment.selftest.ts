import { Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshStandardMaterial, PointLight, Scene, ShaderMaterial } from 'three';
import { createDrivingGround, DRIVING_GROUND_CATALOG } from '../DrivingGroundCatalog';
import { CityGround } from '../city/CityGround';
import { SURFACE_MATERIALS } from '../SurfaceMaterial';
import { sampleWheelContacts } from '../../vehicle/physics/WheelContact';
import { VehicleContactSystem } from '../../vehicle/physics/VehicleContactSystem';
import { VehicleDynamics } from '../../vehicle/physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { DEFAULT_VEHICLE_PHYSICS_CONFIG } from '../../vehicle/config/defaultVehiclePhysicsConfig';
import { DEFAULT_VEHICLE_ID, getVehicleDescriptor, VEHICLE_CATALOG } from '../../vehicle/VehicleCatalog';
import { WiperController, WIPER_PARK_ANGLE, autoWiperMode } from '../../vehicle/control/WiperController';
import { WindshieldRain } from '../../camera/WindshieldRain';
import {
  WeatherSystem, WEATHER_PRESETS, WEATHER_SEQUENCE, WEATHER_WETNESS, wetGripScale,
  type EnvironmentTime, type Weather,
} from './WeatherSystem';
import { EnvironmentVisual } from './EnvironmentVisual';

export function runEnvironmentSelfTest(): { assertions: number; maps: number; vehicles: number } {
  let assertions = 0;
  const assert = (condition: boolean, message: string) => {
    assertions++;
    if (!condition) throw new Error(`Environment self-test: ${message}`);
  };
  const lowTraction = new Set(['packed-snow', 'fresh-snow', 'ice', 'sand', 'mud']);
  for (const surface of Object.values(SURFACE_MATERIALS)) {
    const light = wetGripScale(surface, WEATHER_WETNESS.DRIZZLE);
    const heavy = wetGripScale(surface, WEATHER_WETNESS.HEAVY_RAIN);
    assert(wetGripScale(surface, 0) === 1 && heavy < light && light < 1, `${surface.surfaceType}: ordered grip, exact dry restoration`);
    if (lowTraction.has(surface.surfaceType)) {
      assert(surface.longitudinalGrip * heavy > 0 && surface.longitudinalGrip * heavy < .45 &&
        surface.lateralGrip * heavy > 0 && surface.lateralGrip * heavy < .45, `${surface.surfaceType}: retains authored low traction in rain`);
    } else assert(surface.longitudinalGrip * heavy > 0.45, `${surface.surfaceType}: remains drivable`);
  }
  for (const axis of ['longitudinalGrip', 'lateralGrip'] as const) {
    const wet = (type: keyof typeof SURFACE_MATERIALS) => SURFACE_MATERIALS[type][axis] * wetGripScale(SURFACE_MATERIALS[type], 1);
    assert(wet('asphalt') > wet('packed-snow') && wet('packed-snow') > wet('fresh-snow') && wet('fresh-snow') > wet('ice'),
      `${axis}: rain preserves asphalt/snow/ice traction ordering`);
    assert(wet('grass') > wet('sand') && wet('sand') > wet('mud'), `${axis}: soft-ground traction remains distinct`);
  }
  assert(wetGripScale(SURFACE_MATERIALS.asphalt, 1) > 0.6, 'heavy rain is a moderate grip reduction');
  assert(wetGripScale(SURFACE_MATERIALS.asphalt, 1) > SURFACE_MATERIALS.grass.lateralGrip * wetGripScale(SURFACE_MATERIALS.grass, 1), 'wet asphalt remains better than wet grass');

  // Continuous state: presets only move targets, cloud leads rain, wetness lags both.
  const weatherGrip = (weather: Weather): number => {
    const state = new WeatherSystem(weather);
    return state.roadGripMultiplier;
  };
  assert(weatherGrip('CLEAR') === 1, 'dry grip multiplier is exactly 1');
  assert(weatherGrip('DRIZZLE') > .96 && weatherGrip('DRIZZLE') < .99, 'drizzle grip stays close to dry');
  assert(weatherGrip('RAIN') >= .91 && weatherGrip('RAIN') <= .95, 'rain grip matches V1 range');
  assert(weatherGrip('HEAVY_RAIN') >= .86 && weatherGrip('HEAVY_RAIN') <= .92, 'heavy rain grip matches V1 range');
  assert(weatherGrip('HEAVY_RAIN') < weatherGrip('RAIN') && weatherGrip('RAIN') < weatherGrip('DRIZZLE'), 'grip order follows rain severity');

  const state = new WeatherSystem();
  assert(state.wetness === 0 && state.cloudiness === 0, 'default weather starts clear');
  state.setWeather('HEAVY_RAIN');
  assert(state.weather === 'HEAVY_RAIN' && state.rainIntensity === 0, 'preset change does not snap rain in one call');
  state.update(.5);
  assert(state.rainIntensity > 0 && state.rainIntensity < WEATHER_PRESETS.HEAVY_RAIN.rainIntensity, 'rain ramps smoothly');
  const cloudBefore = state.cloudiness;
  state.update(1);
  assert(state.cloudiness > cloudBefore, 'cloud cover rises first');
  assert(state.wetness < .05, 'wetness still lags the rain');
  for (let i = 0; i < 600; i++) state.update(1 / 60);
  assert(state.wetness > .02 && state.wetness < .95, 'wetness accumulates gradually');
  for (let i = 0; i < 6_000; i++) state.update(1 / 60);
  assert(state.wetness > .8 && state.roadGripMultiplier < .9, 'heavy rain approaches its wet equilibrium');
  const wetBeforeDry = state.wetness;
  state.setWeather('CLEAR');
  state.update(1 / 60);
  assert(state.wetness > wetBeforeDry - .01, 'rain stopping never dries the road in one frame');
  for (let i = 0; i < 300; i++) state.update(1 / 60);
  assert(state.wetness > .3, 'road stays wet for minutes after rain stops');
  for (let i = 0; i < 18_000; i++) state.update(1 / 60);
  assert(state.wetness < .05, 'clear weather eventually dries the road');

  const storm = new WeatherSystem('THUNDERSTORM');
  let flashed = false, thundered = false;
  for (let i = 0; i < 60 * 30; i++) {
    storm.update(1 / 60);
    if (storm.lightningFlash > 0) flashed = true;
    if (storm.consumeThunderDelay() !== null) thundered = true;
  }
  assert(flashed && thundered, 'thunderstorm emits event-driven lightning and thunder');
  storm.setWeather('CLEAR', 0);
  assert(storm.lightningFlash === 0 && storm.consumeThunderDelay() === null, 'leaving the storm clears any flash');

  // Minimal canvas records opacity to verify visibility recovery, without a GPU.
  let drawnWater = 0;
  const context = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 0,
    clearRect: () => { drawnWater = 0; }, beginPath: () => {}, ellipse: () => {},
    fill() { drawnWater += this.globalAlpha; }, stroke: () => {}, moveTo: () => {}, lineTo: () => {},
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvasContext = new Proxy({} as CanvasRenderingContext2D, { get: (_target, key: string) =>
    key === 'measureText' ? (value: string) => ({ width: value.length * 12 }) :
    key.startsWith('create') ? () => ({ addColorStop: () => {} }) : () => {}, set: () => true });
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement: () => ({ width: 1, height: 1, getContext: () => canvasContext }) },
  });
  try {
    const scene = new Scene();
    scene.background = new Color();
    scene.fog = new Fog(0, 180, 1100);
    const sun = new DirectionalLight();
    const hemisphere = new HemisphereLight();
    const sky = new ShaderMaterial({ uniforms: {
      topColor: { value: new Color() }, horizonColor: { value: new Color() }, groundColor: { value: new Color() },
    } });
    const environment = new WeatherSystem();
    const visual = new EnvironmentVisual(scene, environment, sun, hemisphere, sky);
    const sharedRoad = new MeshStandardMaterial({ color: 0x808080, roughness: .8 }); sharedRoad.userData.wetRoad = true;
    const roadA = new Mesh(undefined, sharedRoad), roadB = new Mesh(undefined, sharedRoad);
    const rootA = new Group().add(roadA), rootB = new Group().add(roadB), dryShared = sharedRoad.color.clone();
    environment.setWeather('HEAVY_RAIN', 0);
    visual.addVisualRoot(rootA); const wetShared = sharedRoad.color.clone();
    visual.addVisualRoot(rootA); visual.addVisualRoot(rootB);
    assert(sharedRoad.color.equals(wetShared) && !sharedRoad.color.equals(dryShared), 'incremental publication never captures an already wet baseline');
    visual.removeVisualRoot(rootA); visual.removeVisualRoot(rootA); visual.applyState();
    assert(sharedRoad.color.equals(wetShared), 'unloading one root retains shared wet road state without double removal');
    visual.removeVisualRoot(rootB);
    assert(sharedRoad.color.equals(dryShared) && sharedRoad.roughness === .8, 'last streamed owner restores the original material');
    roadA.geometry.dispose(); roadB.geometry.dispose(); sharedRoad.dispose(); environment.setWeather('CLEAR', 0);
    for (const descriptor of DRIVING_GROUND_CATALOG) {
      const ground = createDrivingGround(descriptor.id);
      if (ground instanceof CityGround) {
        const spawn = ground.spawnPose;
        for (let i = 0; i < 220 && !ground.sectors.ready; i++) ground.updatePlayerPosition(spawn.position.x, spawn.position.z, spawn.yawRadians, 0);
        assert(ground.sectors.ready, `${descriptor.id}: initial visual sectors finish loading before material inspection`);
      }
      visual.setGround(ground);
      const roads: MeshStandardMaterial[] = [];
      const markings: MeshStandardMaterial[] = [];
      let markingCount = 0;
      let markingsLit = true;
      let markingNormals = true;
      ground.root.traverse(object => {
        if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && object.material.userData.wetRoad) roads.push(object.material);
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if ((!material.polygonOffset && !material.userData.roadMarking) || material.userData.wetRoad || material.userData.regionalTerrain) continue;
          markingCount++;
          if (material instanceof MeshStandardMaterial && !markings.includes(material)) markings.push(material);
          markingsLit &&= material instanceof MeshStandardMaterial && material.emissive.getHex() === 0 && material.toneMapped;
          markingNormals &&= object.geometry.getAttribute('normal') !== undefined;
        }
      });
      assert(markingCount > 0 && markingsLit, `${descriptor.id}: road paint responds to ambient and lamp lighting without self emission`);
      assert(markingNormals, `${descriptor.id}: marking geometry supplies normals for lighting`);
      assert(roads.length > 0, `${descriptor.id}: existing shared paved material is bound`);
      assert(markings.length > 0, `${descriptor.id}: road paint enters the weather material registry`);
      const dryColor = roads[0]!.color.clone();
      const dryMarkingRoughness = markings[0]!.roughness;
      const spawn = ground.spawnPose;
      const pose = { x: spawn.position.x, z: spawn.position.z, yaw: spawn.yawRadians };
      const dry = sampleWheelContacts(ground, pose, DEFAULT_VEHICLE_PHYSICS_CONFIG);
      const wet = sampleWheelContacts(ground, pose, DEFAULT_VEHICLE_PHYSICS_CONFIG, 1);
      const weatherLimited = sampleWheelContacts(ground, pose, DEFAULT_VEHICLE_PHYSICS_CONFIG, 1, .88);
      assert(wet.frontLeft.lateralGrip < dry.frontLeft.lateralGrip && wet.frontLeft.longitudinalGrip < dry.frontLeft.longitudinalGrip, `${descriptor.id}: both tyre axes use wet grip`);
      assert(weatherLimited.frontLeft.lateralGrip < wet.frontLeft.lateralGrip, `${descriptor.id}: shared weather grip layers on surface wetness`);
      assert(wet.frontLeft.height === dry.frontLeft.height && wet.frontLeft.rollingResistance === dry.frontLeft.rollingResistance, 'weather leaves contact geometry and rolling resistance intact');
      const vehicle = new VehicleDynamics(DEFAULT_VEHICLE_PHYSICS_CONFIG, { ...pose, gear: 'N' });
      const contacts = new VehicleContactSystem(ground, getVehicleDescriptor(DEFAULT_VEHICLE_ID).visualConfig.collisionDimensions);
      const controls = createNeutralVehicleInputState();
      contacts.step(1 / 120, controls, vehicle);
      contacts.setWetness(1);
      assert(contacts.wheelContacts === null, 'weather change invalidates cached contacts before physics');
      contacts.step(1 / 120, controls, vehicle);
      const wetGrip = contacts.wheelContacts!.frontLeft.lateralGrip;
      contacts.step(1 / 120, controls, vehicle);
      assert(Math.abs(contacts.wheelContacts!.frontLeft.lateralGrip - wetGrip) < 1e-9, 'successive physics steps do not compound wetness');
      contacts.setRoadGripMultiplier(.88);
      contacts.step(1 / 120, controls, vehicle);
      assert(contacts.wheelContacts!.frontLeft.lateralGrip < wetGrip, 'contact adapter consumes the shared weather grip multiplier');
      contacts.setRoadGripMultiplier(1);
      contacts.setWetness(0);
      contacts.step(1 / 120, controls, vehicle);
      assert(contacts.wheelContacts!.frontLeft.lateralGrip > wetGrip, 'CLEAR restores dry contacts through the existing physics adapter');
      for (const weather of Object.keys(WEATHER_WETNESS) as Weather[]) {
        for (const time of ['DAY', 'DUSK', 'NIGHT'] as EnvironmentTime[]) {
          environment.setWeather(weather, 0); environment.setTime(time); visual.applyState(); visual.update(.25, spawn.position);
          assert(Number.isFinite(sun.intensity) && Number.isFinite(hemisphere.intensity), `${descriptor.id}: ${weather}/${time} finite lighting`);
          assert(roads[0]!.roughness >= 0.379 && roads[0]!.roughness <= 1, 'wet road never becomes a mirror');
          assert(Number.isFinite(scene.fog instanceof Fog ? scene.fog.far : 1), `${descriptor.id}: ${weather}/${time} finite fog`);
          if (weather === 'FOG' && scene.fog instanceof Fog) {
            assert(scene.fog.near <= 10 && scene.fog.far <= 400, `${descriptor.id}: fog exists near the driver, not only at distance`);
            if (time === 'NIGHT') assert(scene.background instanceof Color &&
              scene.background.r + scene.background.g + scene.background.b < .9, 'night fog stays dark');
          }
        }
      }
      environment.setWeather('CLEAR', 0); environment.setTime('DAY'); visual.applyState();
      assert(roads[0]!.color.equals(dryColor), 'clear restores original road color without cumulative darkening');
      assert(Math.abs(markings[0]!.roughness - dryMarkingRoughness) < 1e-9, 'clear restores original road paint without cumulative gloss');
      // Next bind restores lamp material ownership before disposing this ground.
      visual.setGround({ root: new Group() });
      ground.dispose();
    }
    const streetLights = scene.children.filter(object => object instanceof PointLight);
    assert(streetLights.length === 6 && streetLights.every(light => !light.castShadow), 'bounded unshadowed road lighting pool');
    visual.dispose(); sky.dispose();

    const controller = new WiperController();
    for (const expected of ['AUTO', 'INTERMITTENT', 'LOW', 'HIGH', 'OFF']) assert(controller.cycle() === expected, 'complete wiper mode cycle');
    assert(autoWiperMode(0) === 'OFF' && autoWiperMode(.2) === 'INTERMITTENT' &&
      autoWiperMode(.5) === 'LOW' && autoWiperMode(1) === 'HIGH', 'AUTO resolves all four speeds');
    controller.setMode('AUTO');
    for (let i = 0; i < 90; i++) controller.update(1 / 30, .9);
    assert(controller.effectiveMode === 'HIGH', 'AUTO follows heavy rain');
    for (let i = 0; i < 30; i++) controller.update(1 / 30, 0);
    assert(controller.effectiveMode === 'OFF', 'AUTO parks in clear weather');
    controller.setMode('INTERMITTENT');
    for (let i = 0; i < 46; i++) controller.update(1 / 30, 0);
    assert(controller.angle === WIPER_PARK_ANGLE, 'intermittent completes one out-and-back stroke');
    controller.update(1 / 30, 0);
    assert(!controller.sweeping, 'intermittent waits between complete strokes');

    Object.defineProperty(globalThis, 'document', { configurable: true,
      value: { createElement: () => ({ width: 1, height: 1, getContext: () => context }) },
    });
    for (const descriptor of VEHICLE_CATALOG) {
      const glass = new WindshieldRain({ config: descriptor.visualConfig, root: new Group() });
      controller.setMode('OFF');
      for (let i = 0; i < 360; i++) { controller.update(1 / 30, 1); glass.update(1 / 30, 1, controller); }
      const obscured = drawnWater;
      controller.setMode('HIGH');
      for (let i = 0; i < 120; i++) { controller.update(1 / 30, 1); glass.update(1 / 30, 1, controller); }
      assert(drawnWater < obscured * 0.85, `${descriptor.displayName}: real sweep improves wet visibility`);
      controller.setMode('OFF');
      for (let i = 0; i < 600; i++) { controller.update(1 / 30, 0); glass.update(1 / 30, 0, controller); }
      assert(drawnWater === 0 && controller.angle === WIPER_PARK_ANGLE, 'clear weather dries glass and OFF parks blades');
      glass.dispose();
    }
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  assert(WEATHER_SEQUENCE.length === 7, 'all V1 presets remain available');
  return { assertions, maps: DRIVING_GROUND_CATALOG.length, vehicles: VEHICLE_CATALOG.length };
}
