import { build } from 'esbuild';
const result = await build({ entryPoints: ['scripts/build-city-main.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
try {
  await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
} catch (error) {
  console.error(error instanceof Error ? error.stack?.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, '<city-main-bundle>') : String(error));
  process.exitCode = 1;
}
