import * as T from 'three';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import { executiveCabinMaterials, executiveCabinUV, executiveCabinBoxUV, type ExecutiveCabinCell } from './ExecutiveCabinMaterials';

function resources(root: T.Object3D): { geometry: Set<T.BufferGeometry>; material: Set<T.Material> } {
  const geometry = new Set<T.BufferGeometry>(), material = new Set<T.Material>();
  root.traverse(o => { if (o instanceof T.Mesh) {
    geometry.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) material.add(m);
  } });
  return { geometry, material };
}

function extrusion(points: readonly (readonly [number, number])[], depth: number,
  hole?: readonly (readonly [number, number])[]): T.ExtrudeGeometry {
  const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
  if (hole) shape.holes.push(new T.Path(hole.map(([x, y]) => new T.Vector2(x, y))));
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .0015, bevelThickness: .0015, bevelSegments: 1, steps: 1 });
  return g.translate(0, 0, -depth / 2);
}

/** Reuses the executive shell and its existing draw objects. Only the palm
 * selector and two steering inserts need silhouette changes; detail is atlased. */
export function applyExecutiveCabinAppearance(root: T.Group, config: VehicleVisualConfig, assets?: VehicleAssetRegistry): void {
  const before = resources(root), p = executiveCabinMaterials(config, assets);
  const mesh = (name: string): T.Mesh | undefined => {
    const o = root.getObjectByName(name); return o instanceof T.Mesh ? o : undefined;
  };
  const decorate = (o: T.Mesh | undefined, cell: ExecutiveCabinCell, material: T.Material = p.veneer,
    axis: 'xy' | 'xz' | 'zy' = 'xy') => {
    if (!o) return;
    o.material = material; executiveCabinUV(o.geometry, cell, axis);
  };
  const box = (name: string, front: ExecutiveCabinCell, top?: ExecutiveCabinCell, material: T.Material = p.gloss) => {
    const o = mesh(name); if (!o) return;
    o.material = material;
    if (o.geometry instanceof T.BoxGeometry) executiveCabinBoxUV(o.geometry, front, top);
  };

  const dash = mesh('Dashboard upper surface');
  if (dash) {
    const old = Array.isArray(dash.material) ? dash.material : [dash.material];
    // Retain the flat cowl / smooth shoulder shading boundary and all anchors.
    dash.material = old.map(m => { const next = p.soft.clone(); next.flatShading = (m as T.MeshStandardMaterial).flatShading; return next; });
    executiveCabinUV(dash.geometry, undefined, 'xz');
  }
  root.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    if (o.name === 'Centre stack fascia') decorate(o, 'glass', p.gloss);
    if (['Centre stack side panel', 'Transmission tunnel side panel', 'Transmission tunnel rear return',
      'Dashboard driver lower return', 'Dashboard driver knee panel', 'Executive front cabin bulkhead',
      'Left dashboard door junction', 'Right dashboard door junction'].includes(o.name)) o.material = p.soft;
  });
  decorate(mesh('Dashboard passenger lower panel'), 'wood');
  decorate(mesh('Executive centre control surround'), 'glass', p.gloss);
  box('Executive upper display surround', 'bezel');
  box('Executive upper centre display glass', 'glass');
  box('Executive lower climate glass', 'climate');
  const lower = mesh('Executive lower climate glass'); if (lower) lower.scale.y = 1.5;
  const lowerEdge = mesh('Executive glass satin lower border');
  if (lowerEdge) { lowerEdge.position.y = -.073; lowerEdge.scale.y = 4; box(lowerEdge.name, 'controls'); }
  root.traverse(o => {
    if (o instanceof T.Mesh && o.name === 'Centre air vent') {
      o.position.y = .137; o.scale.y = 1.35; boxVent(o);
    }
  });
  function boxVent(o: T.Mesh): void {
    if (o.geometry instanceof T.BoxGeometry) executiveCabinBoxUV(o.geometry, 'vent');
    o.material = p.veneer;
  }
  const passengerVent = mesh('Passenger dashboard accent');
  if (passengerVent) { passengerVent.scale.y = 4.5; passengerVent.position.y += .041; boxVent(passengerVent); }

  box('Centre console top', 'glass', 'console', p.veneer);
  box('Executive front console storage lid', 'glass', 'wood', p.veneer);
  for (const name of ['Executive console padded armrest', 'Steering wheel rim']) {
    const o = mesh(name); if (o) o.material = p.leather;
  }
  const hub = mesh('Steering wheel hub');
  if (hub) {
    hub.geometry = extrusion([[-.079, .037], [-.059, .053], [.059, .053], [.079, .037], [.061, -.044], [.043, -.059], [-.043, -.059], [-.061, -.044]], .030);
    decorate(hub, 'hub');
  }
  for (const [name, cell] of [['Left wheel key panel', 'leftKeys'], ['Right wheel key panel', 'rightKeys']] as const) {
    const o = mesh(name); if (o) { o.scale.set(1.8, 1.4, 1); box(name, cell); }
  }
  for (const name of ['Steering wheel left spoke', 'Steering wheel right spoke']) decorate(mesh(name), 'glass', p.gloss);
  const lowerSpoke = mesh('Steering wheel lower spoke');
  if (lowerSpoke) {
    lowerSpoke.geometry = extrusion([[-.058, -.040], [.058, -.040], [.037, -.156], [-.037, -.156]], .023,
      [[-.030, -.068], [-.019, -.141], [.019, -.141], [.030, -.068]]);
    lowerSpoke.position.set(0, 0, 0); lowerSpoke.rotation.set(0, 0, 0); decorate(lowerSpoke, 'spoke', p.gloss);
  }

  const knob = mesh('Gear knob');
  if (knob) {
    const g = new T.BoxGeometry(.112, .052, .116, 4, 2, 4), positions = g.getAttribute('position');
    executiveCabinBoxUV(g, 'selectorFront', 'selectorTop');
    // A few rounded edge vertices replace the existing spherical knob.
    const inner = new T.Vector3(.044, .014, .046), v = new T.Vector3(), nearest = new T.Vector3();
    for (let i = 0; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i); nearest.copy(v).clamp(inner.clone().negate(), inner);
      v.sub(nearest).normalize().multiplyScalar(.012).add(nearest); positions.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); knob.geometry = g; knob.material = p.veneer;
    knob.scale.set(1, 1, 1); knob.position.y = .067;
  }
  const shaft = mesh('Gear lever shaft'); if (shaft) { shaft.scale.y = .36; shaft.position.y = .045; shaft.material = p.trim; }
  const gaiter = mesh('Gear lever gaiter'); if (gaiter) { gaiter.scale.set(.85, .55, .85); gaiter.position.y = .021; gaiter.material = p.leather; }

  for (const side of ['Left', 'Right']) {
    decorate(mesh(side + ' door card'), 'door', p.veneer, 'zy');
    decorate(mesh(side + ' executive rear door interior closure'), 'door', p.veneer, 'zy');
    for (const suffix of [' door upper rail', ' door armrest', ' executive rear door armrest']) {
      const o = mesh(side + suffix); if (o) o.material = p.leather;
    }
    const handle = mesh(side + ' door handle'); if (handle) handle.material = p.trim;
  }
  // Drop only replaced, unshared resources. Instrument/ambient materials remain
  // owned by their existing systems and retain their per-frame updates.
  const after = resources(root);
  for (const g of before.geometry) if (!after.geometry.has(g) && !assets?.owns(g)) g.dispose();
  for (const m of before.material) if (!after.material.has(m) && !assets?.owns(m)) m.dispose();
}
