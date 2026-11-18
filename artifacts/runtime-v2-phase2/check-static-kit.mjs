import fs from 'node:fs';
import {build} from 'esbuild';
await build({stdin:{contents:"export {runCityStaticKitSelfTest} from './src/world/city/CityMainV62.selftest';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'artifacts/runtime-v2-phase2/check-static-kit.bundle.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'silent'});
const {runCityStaticKitSelfTest}=await import('./check-static-kit.bundle.mjs');
const {map}=JSON.parse(fs.readFileSync('artifacts/performance-preload/runtime-fixture.json'));
const result=runCityStaticKitSelfTest(map);console.log({...result,landmarks:result.landmarks.map(o=>o.id)});
