import { Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshStandardMaterial, PointLight, Scene, ShaderMaterial } from 'three';
import { createDrivingGround, DRIVING_GROUND_CATALOG } from '../DrivingGroundCatalog';
import { SURFACE_MATERIALS } from '../SurfaceMaterial';
import { sampleWheelContacts } from '../../vehicle/physics/WheelContact';
import { VehicleContactSystem } from '../../vehicle/physics/VehicleContactSystem';
import { VehicleDynamics } from '../../vehicle/physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { DEFAULT_VEHICLE_PHYSICS_CONFIG } from '../../vehicle/config/defaultVehiclePhysicsConfig';
import { DEFAULT_VEHICLE_ID, getVehicleDescriptor, VEHICLE_CATALOG } from '../../vehicle/VehicleCatalog';
import { WiperController, WIPER_PARK_ANGLE } from '../../vehicle/control/WiperController';
import { WindshieldRain } from '../../camera/WindshieldRain';
import { EnvironmentState, WEATHER_WETNESS, wetGripScale, type EnvironmentTime, type Weather } from './EnvironmentState';
import { EnvironmentVisual } from './EnvironmentVisual';

export function runEnvironmentSelfTest(): { assertions: number; maps: number; vehicles: number } {
  let assertions = 0;
  const assert = (condition: boolean, message: string) => {
    assertions++;
    if (!condition) throw new Error(`Environment self-test: ${message}`);
  };
  for (const surface of Object.values(SURFACE_MATERIALS)) {
    const light = wetGripScale(surface, WEATHER_WETNESS.LIGHT_RAIN);
    const heavy = wetGripScale(surface, WEATHER_WETNESS.HEAVY_RAIN);
    assert(wetGripScale(surface, 0) === 1 && heavy < light && light < 1, `${surface.surfaceType}: ordered grip, exact dry restoration`);
    assert(surface.longitudinalGrip * heavy > 0.45, `${surface.surfaceType}: remains drivable`);
  }
  assert(wetGripScale(SURFACE_MATERIALS.asphalt, 1) > 0.6, 'heavy rain is a moderate grip reduction');
  assert(wetGripScale(SURFACE_MATERIALS.asphalt, 1) > SURFACE_MATERIALS.grass.lateralGrip * wetGripScale(SURFACE_MATERIALS.grass, 1), 'wet asphalt remains better than wet grass');

  // Minimal canvas records opacity to verify visibility recovery, without a GPU.
  let drawnWater = 0;
  const context = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 0,
    clearRect: () => { drawnWater = 0; }, beginPath: () => {}, ellipse: () => {},
    fill() { drawnWater += this.globalAlpha; }, stroke: () => {}, moveTo: () => {}, lineTo: () => {},
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) },
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
    const state = new EnvironmentState();
    const visual = new EnvironmentVisual(scene, state, sun, hemisphere, sky);
    for (const descriptor of DRIVING_GROUND_CATALOG) {
      const ground = createDrivingGround(descriptor.id);
      visual.setGround(ground);
      const roads: MeshStandardMaterial[] = [];
      let markingCount = 0;
      let markingsLit = true;
      let markingNormals = true;
      ground.root.traverse(object => {
        if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && object.material.userData.wetRoad) roads.push(object.material);
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material.polygonOffset) continue;
          markingCount++;
          markingsLit &&= material instanceof MeshStandardMaterial && material.emissive.getHex() === 0 && material.toneMapped;
          markingNormals &&= object.geometry.getAttribute('normal') !== undefined;
        }
      });
      assert(markingCount > 0 && markingsLit, `${descriptor.id}: road paint responds to ambient and lamp lighting without self emission`);
      assert(markingNormals, `${descriptor.id}: marking geometry supplies normals for lighting`);
      assert(roads.length > 0, `${descriptor.id}: existing shared paved material is bound`);
      const dryColor = roads[0]!.color.clone();
      const spawn = ground.spawnPose;
      const pose = { x: spawn.position.x, z: spawn.position.z, yaw: spawn.yawRadians };
      const dry = sampleWheelContacts(ground, pose, DEFAULT_VEHICLE_PHYSICS_CONFIG);
      const wet = sampleWheelContacts(ground, pose, DEFAULT_VEHICLE_PHYSICS_CONFIG, 1);
      assert(wet.frontLeft.lateralGrip < dry.frontLeft.lateralGrip && wet.frontLeft.longitudinalGrip < dry.frontLeft.longitudinalGrip, `${descriptor.id}: both tyre axes use wet grip`);
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
      contacts.setWetness(0);
      contacts.step(1 / 120, controls, vehicle);
      assert(contacts.wheelContacts!.frontLeft.lateralGrip > wetGrip, 'CLEAR restores dry contacts through the existing physics adapter');
      for (const weather of Object.keys(WEATHER_WETNESS) as Weather[]) {
        for (const time of ['DAY', 'DUSK', 'NIGHT'] as EnvironmentTime[]) {
          state.weather = weather; state.time = time; visual.applyState(); visual.update(0.25, spawn.position);
          assert(Number.isFinite(sun.intensity) && Number.isFinite(hemisphere.intensity), `${descriptor.id}: ${weather}/${time} finite lighting`);
          assert(roads[0]!.roughness >= 0.379 && roads[0]!.roughness <= 1, 'wet road never becomes a mirror');
        }
      }
      state.weather = 'CLEAR'; state.time = 'DAY'; visual.applyState();
      assert(roads[0]!.color.equals(dryColor), 'clear restores original road color without cumulative darkening');
      // Next bind restores lamp material ownership before disposing this ground.
      visual.setGround({ ...ground, root: new Group() });
      ground.dispose();
    }
    const streetLights = scene.children.filter(object => object instanceof PointLight);
    assert(streetLights.length === 6 && streetLights.every(light => !light.castShadow), 'bounded unshadowed road lighting pool');
    visual.dispose(); sky.dispose();

    const controller = new WiperController();
    for (const expected of ['INTERMITTENT', 'LOW', 'HIGH', 'OFF']) assert(controller.cycle() === expected, 'complete wiper mode cycle');
    controller.setMode('INTERMITTENT');
    for (let i = 0; i < 39; i++) controller.update(1 / 30);
    assert(controller.angle === WIPER_PARK_ANGLE, 'intermittent completes one out-and-back stroke');
    controller.update(1 / 30);
    assert(!controller.sweeping, 'intermittent waits between complete strokes');

    Object.defineProperty(globalThis, 'document', { configurable: true,
      value: { createElement: () => ({ width: 1, height: 1, getContext: () => context }) },
    });
    for (const descriptor of VEHICLE_CATALOG) {
      const glass = new WindshieldRain({ config: descriptor.visualConfig, root: new Group() });
      controller.setMode('OFF');
      for (let i = 0; i < 360; i++) { controller.update(1 / 30); glass.update(1 / 30, 'HEAVY_RAIN', controller); }
      const obscured = drawnWater;
      controller.setMode('HIGH');
      for (let i = 0; i < 120; i++) { controller.update(1 / 30); glass.update(1 / 30, 'HEAVY_RAIN', controller); }
      assert(drawnWater < obscured * 0.85, `${descriptor.displayName}: real sweep improves wet visibility`);
      controller.setMode('OFF');
      for (let i = 0; i < 600; i++) { controller.update(1 / 30); glass.update(1 / 30, 'CLEAR', controller); }
      assert(drawnWater === 0 && controller.angle === WIPER_PARK_ANGLE, 'clear weather dries glass and OFF parks blades');
      glass.dispose();
    }
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  return { assertions, maps: DRIVING_GROUND_CATALOG.length, vehicles: VEHICLE_CATALOG.length };
}
