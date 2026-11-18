import {build} from 'esbuild';
await build({entryPoints:['scripts/run-runtime-rendering-selftests.ts'],outfile:'.tmp-runtime3-visibility.mjs',bundle:true,platform:'node',format:'esm',logLevel:'error'});
await import('../../.tmp-runtime3-visibility.mjs');

