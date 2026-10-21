import { build } from 'esbuild';
await build({ entryPoints: ['scripts/run-mountain-contact-selftest.ts'], bundle: true,
  platform: 'node', format: 'esm', outfile: '.tmp-mountain-contact.mjs', logLevel: 'silent' });
await import(new URL('../.tmp-mountain-contact.mjs', import.meta.url).href);
