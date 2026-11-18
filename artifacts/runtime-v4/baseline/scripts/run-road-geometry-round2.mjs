import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({entryPoints:['scripts/road-geometry-round1-projection.fixture.ts'],bundle:true,platform:'node',format:'esm',outfile:'.tmp-road-round1-projection.mjs',logLevel:'warning'});
await build({entryPoints:['scripts/run-road-geometry-round2.ts'],bundle:true,platform:'node',format:'esm',outfile:'.tmp-road-round2-checks.mjs',logLevel:'warning',define:{'import.meta.env.DEV':'false'}});
const run=spawnSync(process.execPath,['.tmp-road-round2-checks.mjs'],{stdio:'inherit'});process.exitCode=run.status??1;
