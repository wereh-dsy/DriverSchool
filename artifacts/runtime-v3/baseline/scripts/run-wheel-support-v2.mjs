import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const baseline = process.argv.includes('--baseline');
const names = new Set(['WheelSupportContinuity.ts', 'VehicleContactSystem.ts', 'ChassisDynamics.ts',
  'SuspensionSystem.ts', 'WheelContact.ts', 'CityGround.ts', 'VehiclePhysicsBlackBox.ts', 'BlackBoxSchema.ts']);
await build({ entryPoints: ['scripts/run-wheel-support-v2.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: '.tmp-wheel-support-v2.mjs', logLevel: 'silent', plugins: baseline ? [{ name: 'frozen-baseline', setup(b) {
    b.onLoad({ filter: /\.ts$/ }, args => {
      const name = path.basename(args.path);
      if (names.has(name)) return { contents: fs.readFileSync(`artifacts/wheel-support-selection-v2/baseline/${name}.txt`, 'utf8'), loader: 'ts', resolveDir: path.dirname(args.path) };
    });
  }}] : [] });
await import(new URL('../.tmp-wheel-support-v2.mjs', import.meta.url).href);
