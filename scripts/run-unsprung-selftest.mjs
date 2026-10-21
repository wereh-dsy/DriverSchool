import { build } from 'esbuild';
import fs from 'node:fs';
await build({ entryPoints: ['src/vehicle/physics/UnsprungWheelDynamics.selftest.ts'], bundle: true,
  platform: 'node', format: 'esm', outfile: '.tmp-unsprung-selftest.mjs', logLevel: 'silent' });
const { runUnsprungWheelDynamicsSelfTest } = await import(new URL('../.tmp-unsprung-selftest.mjs', import.meta.url).href);
const result = runUnsprungWheelDynamicsSelfTest();
fs.mkdirSync('artifacts/vehicle-physics-p0-p1', { recursive: true });
fs.writeFileSync('artifacts/vehicle-physics-p0-p1/unsprung-targeted.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
