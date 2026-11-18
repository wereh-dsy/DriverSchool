import { BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { continuousRibbon, PavementTriangleIndex, solidifySurface, sweepFrames, sweepSolid } from './ContinuousRoadGeometry';

export function runContinuousRoadGeometrySelfTest(): { assertions: number } {
  let assertions = 0;
  const check = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error('Continuous road: ' + message); };
  const near = (a: number, b: number, tolerance = 1e-5) => Math.abs(a - b) <= tolerance;
  const frames = sweepFrames([{ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: -20 }, { x: 10, y: 5, z: -40 }]);
  check(frames.some(f => f.tangent.y > .1), 'frames include the true XYZ grade');
  for (const f of frames) {
    check(near(f.tangent.length(), 1) && near(f.normal.length(), 1), 'unit XYZ frame');
    check(Math.abs(f.normal.dot(f.tangent)) < 1e-6 && f.normal.y > .9, 'normal follows longitudinal grade');
  }
  const left = frames.map((f, i) => ({ x: f.point.x - f.right.x * (3 + i * .04), y: f.point.y - .08, z: f.point.z - f.right.z * (3 + i * .04) }));
  const right = frames.map((f, i) => ({ x: f.point.x + f.right.x * (3 + i * .08), y: f.point.y + .08, z: f.point.z + f.right.z * (3 + i * .08) }));
  const ribbon = continuousRibbon(left, right, 0), p = ribbon.getAttribute('position');
  check(near(p.getY(1) - p.getY(0), .16), 'bank is retained rather than flattened');
  check(p.count === frames.length * 2, 'one shared pair of vertices per width station');
  check(p.getX(p.count - 1) - p.getX(p.count - 2) > p.getX(1) - p.getX(0), 'varying width is retained');
  const solid = sweepSolid(frames, () => [{ offset: -.12, height: 0 }, { offset: .12, height: 0 }, { offset: .12, height: 1.1 }, { offset: -.12, height: 1.1 }]);
  const manifold = (g: BufferGeometry) => {
    const edges = new Map<string, number>(), p = g.getAttribute('position'), index = g.index;
    const vertex = (n: number) => [p.getX(n), p.getY(n), p.getZ(n)].map(v => Math.round(v * 10000)).join(',');
    for (let i = 0; i < (index?.count ?? p.count); i += 3) for (let k = 0; k < 3; k++) {
      const a = vertex(index ? index.getX(i + k) : i + k), b = vertex(index ? index.getX(i + (k + 1) % 3) : i + (k + 1) % 3), key = a < b ? a + '|' + b : b + '|' + a;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    return [...edges.values()].every(n => n === 2);
  };
  check(manifold(solid), 'curved graded modular extrusion is watertight');
  const roof = solidifySurface(continuousRibbon([{ x: -3, y: 6.65, z: 0 }, { x: -3, y: 6.65, z: -20 }], [{ x: 3, y: 6.65, z: 0 }, { x: 3, y: 6.65, z: -20 }], 0), .65);
  check(manifold(roof), 'roof has underside, top, both sides and both portal fascias');
  const material = new MeshBasicMaterial(), mesh = new Mesh(roof, material); mesh.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(0, 1, -10), new Vector3(0, 1, 0));
  const hits = ray.intersectObject(mesh);
  check(!!hits.length && near(hits[0]!.point.y, 6), 'ceiling is visible from inside with normal front-face culling');
  const index = new PavementTriangleIndex([ribbon]);
  const small = continuousRibbon([{ x: -1, y: .15, z: -1 }, { x: -1, y: 2.85, z: -19 }], [{ x: 1, y: .15, z: -1 }, { x: 1, y: 2.85, z: -19 }], .032);
  const paint = index.projectPaint(small), paintPositions = paint.getAttribute('position');
  check(paintPositions.count > 0, 'paint survives final-surface clipping');
  for (let i = 0; i < paintPositions.count; i++) {
    const y = index.heightAt(paintPositions.getX(i), paintPositions.getZ(i), paintPositions.getY(i));
    check(y !== undefined && near(paintPositions.getY(i) - y, .008), 'every paint vertex follows its exact final surface');
  }
  const upper = ribbon.clone().translate(0, 8, 0), upstairs = new PavementTriangleIndex([upper]);
  const rejected = upstairs.projectPaint(small);
  check(rejected.getAttribute('position').count === 0, 'upstairs pavement never captures downstairs markings');
  for (const g of [ribbon, solid, roof, small, paint, upper, rejected]) g.dispose(); material.dispose();
  return { assertions };
}
