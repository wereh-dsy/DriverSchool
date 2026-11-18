import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const result = await build({ entryPoints: [fileURLToPath(new URL('./mapctl.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
