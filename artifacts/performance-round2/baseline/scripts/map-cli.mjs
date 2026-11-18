import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({ entryPoints: [resolve(root, 'scripts/map-cli.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
