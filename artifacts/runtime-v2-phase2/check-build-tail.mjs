import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const source=fs.readFileSync('scripts/run-core-selftests.ts','utf8');
const start=source.indexOf('const results = {'),tail=source.indexOf('  vehicleCatalog: runVehicleCatalogSelfTest(),',start);
if(start<0||tail<0)throw Error('Core entry changed');
await build({stdin:{contents:source.slice(0,start)+'const results = {\n'+source.slice(tail),resolveDir:path.resolve('scripts'),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'artifacts/runtime-v2-phase2/check-build-tail.bundle.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'silent'});
await import('./check-build-tail.bundle.mjs');

