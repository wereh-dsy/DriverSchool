import { build } from 'esbuild';
const output = '.tmp-vehicle-blackbox-selftests.mjs';
await build({ entryPoints: ['scripts/run-vehicle-blackbox-selftests.ts'], bundle: true,
  platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
await import(new URL('../' + output, import.meta.url).href);
