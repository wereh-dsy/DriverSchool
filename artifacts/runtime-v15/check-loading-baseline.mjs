import {build} from 'esbuild';
await build({entryPoints:['artifacts/runtime-v15/baseline/scripts/loading-selftests.ts'],outfile:'artifacts/runtime-v15/loading-baseline.bundle.mjs',bundle:true,platform:'node',format:'esm',define:{'__CITY_MAIN_RUNTIME_URL__':JSON.stringify('./assets/runtime.json'),'import.meta.env.DEV':'false'},logLevel:'silent'});
await import('./loading-baseline.bundle.mjs');
