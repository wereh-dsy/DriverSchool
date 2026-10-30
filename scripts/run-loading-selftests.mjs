import { build } from 'esbuild';
await build({ entryPoints: ['scripts/loading-selftests.ts'], outfile: '.tmp-loading-selftests.mjs', bundle: true, platform: 'node', format: 'esm', define: {'__CITY_MAIN_RUNTIME_URL__':JSON.stringify('./assets/runtime.json'), 'import.meta.env.DEV':'false'} });
await import('../.tmp-loading-selftests.mjs');
