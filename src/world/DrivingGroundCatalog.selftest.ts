import { Scene } from 'three';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import { createVehiclePhysicsConfig, DEFAULT_VEHICLE_ID, getVehicleDescriptor } from '../vehicle/VehicleCatalog';
import { VehicleDynamics } from '../vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../vehicle/physics/VehicleContactSystem';
import {
  createDrivingGround, DEFAULT_DRIVING_GROUND_ID, DRIVING_GROUND_CATALOG, DRIVING_GROUND_IDS,
  getDrivingGroundDescriptor, getInitialDrivingGroundId, getNextDrivingGroundId, isDrivingGroundId,
} from './DrivingGroundCatalog';
import { DrivingTestTrack } from './DrivingTestTrack';
import { CircuitGround } from './circuit';
import { Subject2Ground } from './subject2';
import { Subject3Ground } from './subject3';
import { MountainProvingGround } from './mountain/MountainProvingGround';
import { CityGround } from './city/CityGround';
import { CITY_EDITOR_STORAGE_KEY } from './city/CityMapLoader';
import cityAlpha from './city/maps/city-alpha.json';

export function runDrivingGroundCatalogSelfTest(): { assertions: number; maps: number; reloads: number } {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++;
    if (!ok) throw new Error(`Driving ground catalog: ${message}`);
  };
  assert(DRIVING_GROUND_CATALOG.length === 8, 'all eight existing grounds retained');
  assert(new Set(DRIVING_GROUND_CATALOG.map(d => d.id)).size === DRIVING_GROUND_CATALOG.length, 'unique ground IDs');
  assert(isDrivingGroundId(DEFAULT_DRIVING_GROUND_ID), 'registered default');
  assert(getInitialDrivingGroundId(null, '') === DEFAULT_DRIVING_GROUND_ID, 'initial default');
  assert(getInitialDrivingGroundId('missing-map', '?city=missing-map') === DEFAULT_DRIVING_GROUND_ID, 'unknown selection fallback');
  assert(getInitialDrivingGroundId('road-course', '?city=editor') === 'city-editor-map', 'existing editor URL shortcut');
  assert(getInitialDrivingGroundId('road-course', '?city=preset-showcase') === 'preset-showcase', 'existing preset URL shortcut');
  assert(!isDrivingGroundId('missing-map'), 'unknown map is not selectable');

  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let editorMap: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => key === CITY_EDITOR_STORAGE_KEY ? editorMap : null,
  } });
  const implementations = {
    'road-course': DrivingTestTrack, 'simple-circuit': CircuitGround,
    'subject-2-training-ground': Subject2Ground, 'subject-3-shared-city-map': Subject3Ground,
    'mountain-proving-ground': MountainProvingGround,
    'city-alpha': CityGround, 'preset-showcase': CityGround, 'city-editor-map': CityGround,
  };
  const scene = new Scene();
  try {
    for (const id of DRIVING_GROUND_IDS) {
      assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), `${id}: lowercase kebab-case`);
      assert(getInitialDrivingGroundId(id, '') === id, `${id}: saved ID compatibility`);
      const descriptor = getDrivingGroundDescriptor(id);
      assert(descriptor.displayName.length > 0 && descriptor.description.length > 20, `${id}: readable metadata`);
      const first = createDrivingGround(id);
      const firstSpawn = first.spawnPose.position.clone();
      const firstYaw = first.spawnPose.yawRadians;
      scene.add(first.root);
      const car = new VehicleDynamics(createVehiclePhysicsConfig(DEFAULT_VEHICLE_ID));
      const contacts = new VehicleContactSystem(first, getVehicleDescriptor(DEFAULT_VEHICLE_ID).visualConfig.collisionDimensions);
      scene.remove(first.root);
      first.dispose();
      const reloaded = createDrivingGround(id);
      try {
        scene.add(reloaded.root);
        assert(first !== reloaded && first.root !== reloaded.root && scene.children.length === 1, `${id}: fresh reload replaces scene root`);
        assert(reloaded instanceof implementations[id], `${id}: original implementation retained`);
        assert(reloaded.metadata.id === id && reloaded.metadata.displayName === descriptor.displayName
          && reloaded.metadata.description === descriptor.description, `${id}: catalog owns loading metadata`);
        assert(reloaded.spawnPose.position.distanceTo(firstSpawn) < 1e-9 && reloaded.spawnPose.yawRadians === firstYaw, `${id}: reload preserves spawn`);
        contacts.setGround(reloaded);
        contacts.reset();
        car.reset({ x: firstSpawn.x, z: firstSpawn.z, yaw: firstYaw, gear: 'N' });
        contacts.step(1 / 120, createNeutralVehicleInputState(), car);
        assert(Number.isFinite(car.getSnapshot().speedKmh) && contacts.wheelContacts !== null, `${id}: common spawn reset and contact lifecycle`);
        assert(Number.isFinite(reloaded.getRoadHeightAt(firstSpawn.x, firstSpawn.z)), `${id}: loaded surface query`);
        if (reloaded instanceof CityGround) {
          assert(reloaded.roadNetwork.segments.length > 0, `${id}: City-system data and network retained`);
          if (id === 'city-editor-map') assert(reloaded.data.id === cityAlpha.id, 'empty editor storage falls back to city data');
        }
      } finally {
        scene.remove(reloaded.root);
        reloaded.dispose();
      }
    }
    editorMap = JSON.stringify({ ...cityAlpha, id: 'saved-city-fixture', name: 'Saved City Fixture' });
    const saved = createDrivingGround('city-editor-map');
    try {
      assert(saved instanceof CityGround && saved.data.id === 'saved-city-fixture', 'editor entry loads saved City data');
      assert(saved.metadata.id === 'city-editor-map', 'saved data keeps stable catalog loading ID');
    } finally { saved.dispose(); }
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
  let current = DEFAULT_DRIVING_GROUND_ID;
  const visited = new Set<string>();
  for (let n = 0; n < DRIVING_GROUND_IDS.length; n++) {
    visited.add(current);
    current = getNextDrivingGroundId(current);
  }
  assert(visited.size === DRIVING_GROUND_CATALOG.length && current === DEFAULT_DRIVING_GROUND_ID, 'ID-based cycle visits every ground exactly once');
  return { assertions, maps: DRIVING_GROUND_CATALOG.length, reloads: DRIVING_GROUND_CATALOG.length };
}
