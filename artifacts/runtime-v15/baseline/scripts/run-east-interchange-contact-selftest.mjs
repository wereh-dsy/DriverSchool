import { build } from 'esbuild';
const output = '.tmp-east-interchange.mjs';
await build({ entryPoints: ['scripts/run-east-interchange-contact-selftest.ts'], bundle: true,
  platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
await import(new URL('../' + output, import.meta.url).href);
