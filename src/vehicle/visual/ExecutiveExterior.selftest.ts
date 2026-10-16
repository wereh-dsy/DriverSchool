import * as T from 'three';
import { getVehicleDescriptor } from '../VehicleCatalog';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { VehicleVisual } from './VehicleVisual';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';

export function runExecutiveExteriorSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Executive exterior: ${message}`); };
  const needsDocument = typeof document === 'undefined';
  if (needsDocument) Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) } });
  const config = getVehicleDescriptor('executive-lwb-2t').visualConfig;
  const assets = new VehicleAssetRegistry();
  const inspect = (visual: VehicleVisual) => {
    const fascia = visual.exteriorRoot.getObjectByName('Executive single-frame textured grille and intakes') as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
    const map = fascia.material.map!;
    assert(map.image.width === 1024 && map.image.height === 1024, 'bounded 1024px static atlas');
    const nose = fascia.geometry.getAttribute('position');
    const middle = Math.floor(nose.count / 2), outer = Math.floor(middle / 17) * 17;
    assert(nose.getZ(outer) - nose.getZ(middle) > .15, 'front fascia corners sweep rearward instead of using a flat rectangular panel');
    for (const name of ['Sedan sculpted bonnet', 'Sedan boot lid']) {
      const deck = visual.exteriorRoot.getObjectByName(name) as T.Mesh;
      const normals = deck.geometry.getAttribute('normal'), positions = deck.geometry.getAttribute('position');
      let minY = 1, maxY = -1;
      for (let i = 4; i < positions.count; i += 9) { minY = Math.min(minY, normals.getY(i)); maxY = Math.max(maxY, normals.getY(i)); }
      assert(maxY - minY > .08, `${name} has a changing vertical slope instead of a flat slab and right-angle end`);
    }
    const expected = localWheelPositions(config.dimensions);
    let wheelMeshes = 0;
    for (const id of VEHICLE_WHEEL_IDS) {
      const pivot = visual.wheelPivots[id], tyre = pivot.children[0] as T.Mesh;
      assert(pivot.position.distanceTo(new T.Vector3(expected[id].x, expected[id].y - (config.staticBodyOffsetY ?? 0), expected[id].z)) < 1e-8,
        `${id} remains on the physical wheel datum`);
      tyre.geometry.computeBoundingBox(); const size = tyre.geometry.boundingBox!.getSize(new T.Vector3());
      assert(Math.abs(size.y / 2 - config.wheelRadius) < 1e-6 && Math.abs(size.z / 2 - config.wheelRadius) < 1e-6 &&
        Math.abs(size.x - config.dimensions.wheelWidth) < 1e-6, `${id} tyre silhouette preserves radius and width`);
      tyre.traverse(o => { if (o instanceof T.Mesh) wheelMeshes++; });
      const face = tyre.getObjectByName('Executive textured split-spoke wheel face') as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
      assert(face.material.map === map && face.material.alphaTest === .5 && !face.material.transparent,
        `${id} shares the fascia atlas and uses cutout pockets without transparent sorting`);
    }
    assert(wheelMeshes === 16, 'four complete wheels use sixteen meshes instead of sixty-four');
    const bounds = visual.getVisualBodyBounds(), size = bounds.getSize(new T.Vector3());
    assert(Math.abs(size.x - config.dimensions.width) < .02 && Math.abs(size.z - config.dimensions.length) < .02 &&
      Math.abs(bounds.max.y - config.dimensions.height) < .02, 'exterior retains the collision envelope');
    return map;
  };
  try {
    const direct = new VehicleVisual(config); const map = inspect(direct); let disposed = 0;
    map.addEventListener('dispose', () => disposed++); direct.dispose();
    assert(disposed === 1, 'instance-owned atlas is disposed exactly once');
    const cached = { ...config, assetCache: true };
    VehicleVisual.prepareAssets(cached, assets);
    const first = new VehicleVisual(cached, assets), second = new VehicleVisual(cached, assets);
    const shared = inspect(first);
    assert(inspect(second) === shared && assets.owns(shared), 'cached instances borrow one registry-owned atlas');
    let sharedDisposals = 0; shared.addEventListener('dispose', () => sharedDisposals++);
    first.dispose(); second.dispose(); assert(sharedDisposals === 0, 'instance disposal retains shared static resources');
    assets.dispose(); assert(sharedDisposals === 1, 'registry disposes the atlas after its last borrower');
    return { assertions, wheelMeshes: 16, atlasSize: 1024 };
  } finally {
    if (needsDocument) delete (globalThis as unknown as { document?: Document }).document;
  }
}
