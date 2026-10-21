import { build } from 'esbuild';
await build({ entryPoints: ['scripts/run-vehicle-physics-calibration.ts'], bundle: true,
  platform: 'node', format: 'esm', outfile: '.tmp-vehicle-physics-calibration.mjs', logLevel: 'silent' });
await import(new URL('../.tmp-vehicle-physics-calibration.mjs', import.meta.url).href);
