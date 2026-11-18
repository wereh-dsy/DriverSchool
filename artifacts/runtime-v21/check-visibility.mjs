import {build} from 'esbuild';
await build({entryPoints:['scripts/run-runtime-rendering-selftests.ts'],outfile:'.tmp-runtime21-visibility.mjs',bundle:true,platform:'node',format:'esm',logLevel:'error'});
await import('../../.tmp-runtime21-visibility.mjs');
