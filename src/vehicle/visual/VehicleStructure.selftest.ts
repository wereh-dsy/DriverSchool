import * as THREE from 'three';
import { VEHICLE_CATALOG } from '../VehicleCatalog';
import { VehicleVisual } from './VehicleVisual';

/** Small solid-clearance check, not appearance/handling optimisation. */
export function runVehicleStructureSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Vehicle structure: ${message}`); };
  const needsDocument = typeof document === 'undefined';
  if (needsDocument) Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => ({ width: 1, height: 1, getContext: () => null }) },
  });
  try {
    for (const car of VEHICLE_CATALOG) {
      const visual = new VehicleVisual(car.visualConfig);
      try {
        visual.root.updateMatrixWorld(true);
        const config = car.visualConfig;
        const column = visual.root.getObjectByName('Steering column') as THREE.Mesh<THREE.CylinderGeometry>;
        assert(column !== undefined, `${car.id}: column exists`);
        const ends = [-1, 1].map(sign => new THREE.Vector3(0, sign * column.geometry.parameters.height / 2, 0).applyMatrix4(column.matrixWorld));
        assert(Math.min(...ends.map(p => p.distanceTo(new THREE.Vector3(...config.steeringWheelPosition)))) < .03,
          `${car.id}: column joins hub`);
        assert(Math.min(...ends.map(p => p.distanceTo(new THREE.Vector3(...config.steeringColumnMountPosition!)))) < 1e-8,
          `${car.id}: column reaches dashboard anchor`);
        const rim = visual.root.getObjectByName('Steering wheel rim') as THREE.Mesh;
        const points = rim.geometry.getAttribute('position');
        const solids: THREE.Mesh[] = [];
        visual.root.traverse(o => { if (o instanceof THREE.Mesh && /Dashboard|Instrument binnacle|Centre stack/.test(o.name)) solids.push(o); });
        for (const solid of solids) {
          solid.geometry.computeBoundingBox();
          const inverse = solid.matrixWorld.clone().invert();
          const box = solid.geometry.boundingBox!.clone().expandByScalar(-.002);
          let hits = 0;
          for (let i = 0; i < points.count; i += 4) {
            const p = new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(rim.matrixWorld).applyMatrix4(inverse);
            if (box.containsPoint(p)) hits++;
          }
          assert(hits === 0, `${car.id}: wheel rim penetrates ${solid.name}`);
        }
        assert(visual.root.getObjectByName('Front windshield glass') === undefined, `${car.id}: no duplicate windshield pane`);
        for (const side of ['left', 'right'] as const) {
          const optical = side === 'left' ? config.leftMirrorTransform : config.rightMirrorTransform;
          assert(optical.mountPosition !== undefined && optical.mountPosition[1] < optical.position[1], `${car.id}/${side}: low door mounting point`);
          const housing = visual.root.getObjectByName(`${side} mirror housing`)!;
          const bounds = new THREE.Box3().setFromObject(housing);
          const inward = side === 'left' ? -bounds.max.x : bounds.min.x;
          assert(inward > config.cabin.width / 2 + .03, `${car.id}/${side}: housing stays outside glass`);
          assert(visual.root.getObjectByName(`${side} door mirror sail mount`) !== undefined &&
            visual.root.getObjectByName(`${side} mirror stalk`) !== undefined, `${car.id}/${side}: connected mount/stalk/housing`);
        }
      } finally { visual.dispose(); }
    }
  } finally { if (needsDocument) Reflect.deleteProperty(globalThis, 'document'); }
  return { assertions, vehicles: VEHICLE_CATALOG.length };
}
