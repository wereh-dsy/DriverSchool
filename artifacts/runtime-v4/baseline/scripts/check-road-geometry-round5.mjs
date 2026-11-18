import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['scripts/check-road-geometry-round5.ts'],bundle:true,platform:'node',format:'esm',outfile:'.tmp-road-round5-check.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'warning'});
process.exitCode=spawnSync(process.execPath,['.tmp-road-round5-check.mjs',...process.argv.slice(2)],{stdio:'inherit'}).status??1;
