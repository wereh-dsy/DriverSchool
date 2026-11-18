import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['scripts/run-road-geometry-trial.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.tmp-road-geometry-trial.mjs', logLevel: 'warning' });
const result = spawnSync(process.execPath, ['.tmp-road-geometry-trial.mjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
