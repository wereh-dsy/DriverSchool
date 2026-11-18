import {build} from 'esbuild';
await build({stdin:{contents:"import data from './artifacts/city-main-v4/v3-base.json';import {loadCityMap} from './src/world/city/CityMapLoader';import {runCityPrefabBatchSelfTest} from './src/world/city/CityMain.selftest';console.log(runCityPrefabBatchSelfTest(loadCityMap(data)));",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'artifacts/runtime-v2-phase2/check-city-batch.bundle.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'silent'});
await import('./check-city-batch.bundle.mjs');
