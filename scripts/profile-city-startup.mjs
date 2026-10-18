import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

await build({ stdin: { contents: `
  export {CityGround} from './src/world/city/CityGround';
  export {compileCityRuntimeData} from './src/world/city/CityRuntimeData';
  export {VehicleCollisionSystem} from './src/vehicle/physics/CollisionSystem';
  export {runCityRoadModelSelfTest} from './src/world/city/CityRoadModel.selftest';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: '.tmp-city-startup-profile-api.mjs', logLevel: 'silent' });
const api = await import('../.tmp-city-startup-profile-api.mjs');
const start = performance.now();
const source = JSON.parse(readFileSync('src/world/regional/regional-main.json', 'utf8'));
const readParseMs = performance.now() - start, compileStarted = performance.now();
const compiled = api.compileCityRuntimeData(source), compileMs = performance.now() - compileStarted;
const json = JSON.stringify(compiled), parseStarted = performance.now();
const runtime = JSON.parse(json), runtimeParseMs = performance.now() - parseStarted;
// CPU-only: exercise the browser's deferred visual branch without pretending to
// measure Worker/GPU readiness. Browser performance entries cover that path.
globalThis.Worker = class { postMessage() {} terminate() {} };
const ground = new api.CityGround(runtime.map, { runtime });
const indexStarted = performance.now();
const collision = new api.VehicleCollisionSystem(ground.colliders);
const colliderIndexMs = performance.now() - indexStarted;
assert.equal(ground.sampleRoadSurface(ground.spawnPose.position.x, ground.spawnPose.position.z).surfaceType, 'asphalt');
assert.equal(ground.roadNetwork.segments.length, source.roads.length);
assert.equal(JSON.stringify(runtime.roadNetwork), JSON.stringify(compiled.roadNetwork));
assert.ok(ground.colliders.length > 0 && collision);
let surfaceChecks = 0;
for (const road of runtime.map.roads.filter(r => r.elevationMode === 'custom' && r.centerline.length > 2).slice(0, 12)) {
  const a = road.centerline[0], b = road.centerline[1];
  const sample = ground.sampleRoadSurface((a.x + b.x) / 2, (a.z + b.z) / 2, undefined, (a.y + b.y) / 2);
  assert.equal(sample.surfaceType, 'asphalt'); surfaceChecks++;
}
console.log(JSON.stringify({ readParseMs, compileMs, runtimeBytes: Buffer.byteLength(json), runtimeParseMs,
  initializationMs: ground.initializationMs, colliderIndexMs, colliders: ground.colliders.length,
  surfaceChecks, roadModel: api.runCityRoadModelSelfTest() }, null, 2));
ground.dispose();
