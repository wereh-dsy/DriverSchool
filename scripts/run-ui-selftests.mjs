import { build } from 'esbuild';
await build({ entryPoints: ['scripts/ui-selftests.ts'], outfile: '.tmp-ui-selftests.mjs', bundle: true, platform: 'node', format: 'esm' });
await import('../.tmp-ui-selftests.mjs');
