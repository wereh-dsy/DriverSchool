import * as T from 'three';
import { getVehicleDescriptor } from '../VehicleCatalog';
import { VehicleVisual } from './VehicleVisual';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';

/** Appearance budgets, instrument isolation and shared texture lifetime. */
export function runExecutiveCabinSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Executive cabin: ${message}`); };
  const needsDocument = typeof document === 'undefined';
  if (needsDocument) Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) } });
  const config = getVehicleDescriptor('executive-lwb-2t').visualConfig, assets = new VehicleAssetRegistry();
  const inspect = (visual: VehicleVisual) => {
    const cabin = visual.cockpitRoot;
    const find = (name: string) => cabin.getObjectByName(name) as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
    const upper = find('Executive upper centre display glass'), lower = find('Executive lower climate glass');
    const map = upper.material.map!;
    assert(map === lower.material.map && map === find('Left wheel key panel').material.map && map === find('Centre console top').material.map,
      'screen surrounds, keys and wood use one static atlas');
    assert(map.image.width === 1024 && map.image.height === 1024, 'color atlas remains within 1024px');
    assert(upper.material.bumpMap!.image.width === 512 && upper.material.roughnessMap!.image.width === 512,
      'relief and roughness use half-resolution maps');
    assert(upper.material.emissiveIntensity === 1 && upper.material.emissive.getHex() === 0,
      'static glass does not fabricate luminous display readings');
    const navigation = find('Executive centre navigation screen');
    assert(navigation !== undefined && navigation !== upper, 'navigation owns a separate display plane');
    const navigationMaterial = navigation.material;
    assert(navigationMaterial !== upper.material && upper.material.map !== navigationMaterial.map &&
      upper.material.emissiveMap !== navigationMaterial.emissiveMap,
      'navigation canvas stays out of the shared cabin atlas material');
    assert(navigation.geometry instanceof T.PlaneGeometry &&
      navigation.geometry.parameters.width <= .321 && navigation.geometry.parameters.height <= .116,
      'navigation plane remains inside the centre display aperture');
    cabin.traverse(o => { if (o instanceof T.Mesh && o !== navigation) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        assert(m !== navigationMaterial && m.map !== navigationMaterial.map &&
          (m as T.MeshStandardMaterial).emissiveMap !== navigationMaterial.emissiveMap,
          'navigation texture never leaks onto ' + o.name);
      }
    } });
    visual.updateInstruments({ speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: true,
      ambientDaylight: .025, indicators: { headlights: true } }, 2);
    const nightScreen = navigationMaterial.emissiveIntensity;
    visual.updateInstruments({ speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: true,
      ambientDaylight: 1, indicators: {} }, 2);
    const dayScreen = navigationMaterial.emissiveIntensity;
    assert(nightScreen > .8 && dayScreen > .7 && nightScreen > dayScreen,
      'navigation screen is legible by day and brighter at night');
    visual.updateInstruments({ speedKmh: 0, rpm: 0, gear: 'P', ignitionOn: false }, 2);
    assert(navigationMaterial.emissiveIntensity < .01, 'navigation screen follows ignition off');
    assert(navigation.material === navigationMaterial && upper.material.map === map &&
      upper.material.emissiveIntensity === 1,
      'display updates never swap cockpit materials or canvases');
    assert(find('Steering wheel rim').material.bumpMap !== null, 'wheel grain is shaded without extra mesh detail');
    const knob = find('Gear knob'); knob.geometry.computeBoundingBox();
    const size = knob.geometry.boundingBox!.getSize(new T.Vector3());
    assert(size.y < .06 && size.x > .10 && knob.position.y < .09, 'selector has a low palm-rest silhouette');
    const instrument = cabin.instrumentCluster;
    assert(instrument.position.distanceTo(new T.Vector3(...config.instrumentClusterTransform.position)) < 1e-8 &&
      instrument.scale.x === config.instrumentClusterTransform.scale, 'existing instrument position and scale retained');
    instrument.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        assert(!m.name.startsWith('Executive cabin') && (m as T.MeshStandardMaterial).map !== map,
          'cabin surface processing never adopts instrument materials or canvases');
      }
    });
    const textures = new Set<T.Texture>(); let meshes = 0, triangles = 0;
    cabin.traverse(o => { if (o instanceof T.Mesh) {
      meshes++; triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m.name.startsWith('Executive cabin')) for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value);
    } });
    assert(textures.size === 6, 'only six shared static surface textures; no per-button or per-slat textures');
    assert(meshes <= 170 && triangles < 18000, 'cabin retains its inexpensive mesh budget');
    return { map, textures, meshes, triangles };
  };
  try {
    const direct = new VehicleVisual(config), footprint = inspect(direct); let disposed = 0;
    footprint.textures.forEach(t => t.addEventListener('dispose', () => disposed++)); direct.dispose();
    assert(disposed === 6, 'all instance-owned surface textures disposed exactly once');
    const first = new VehicleVisual(config, assets), second = new VehicleVisual(config, assets);
    const shared = inspect(first); assert(inspect(second).map === shared.map && assets.owns(shared.map), 'registry shares immutable atlas between instances');
    let sharedDisposals = 0; shared.textures.forEach(t => t.addEventListener('dispose', () => sharedDisposals++));
    assert(first.cockpitRoot.getObjectByName('Gear knob') !== second.cockpitRoot.getObjectByName('Gear knob'), 'mutable cabin nodes remain instance-owned');
    first.dispose(); second.dispose(); assert(sharedDisposals === 0, 'borrowers retain registry textures');
    assets.dispose(); assert(sharedDisposals === 6, 'registry destroys shared textures exactly once after borrowers');
    return { assertions, cabinMeshes: footprint.meshes, cabinTriangles: footprint.triangles, surfaceTextures: 6, atlasSize: 1024 };
  } finally {
    if (needsDocument) delete (globalThis as unknown as { document?: Document }).document;
  }
}
