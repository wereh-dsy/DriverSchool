import { build } from 'esbuild';
await build({entryPoints:['scripts/physics-sector-selftests.ts'],outfile:'.tmp-physics-sector-selftests.mjs',bundle:true,platform:'node',format:'esm',define:{'__CITY_MAIN_RUNTIME_URL__':JSON.stringify('./assets/runtime.json'),'import.meta.env.DEV':'false'}});
await import('../.tmp-physics-sector-selftests.mjs');
