import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: "export { nextPaint } from './src/loading/Loading'", resolveDir: process.cwd() },
  platform: 'node', bundle: true, format: 'esm', write: false, logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false' },
});
const { nextPaint } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
let cancelled;
globalThis.document = { hidden: false };
globalThis.requestAnimationFrame = () => 9;
globalThis.cancelAnimationFrame = frame => { cancelled = frame; };
const start = performance.now(), suspended = nextPaint();
document.hidden = true;
await Promise.race([suspended, new Promise((_, reject) => setTimeout(() => reject(Error('Suspended animation frame stalled loading')), 350).unref())]);
const fallbackMs = performance.now() - start;
assert.equal(cancelled, 9);
document.hidden = false;
let usedFrame = false;
globalThis.requestAnimationFrame = callback => {
  setTimeout(() => { usedFrame = true; callback(performance.now()); }, 2);
  return 10;
};
await nextPaint();
assert.equal(usedFrame, true);
assert.equal(cancelled, 9);
const report = { passed: true, fallbackMs, visibleCallbackUsed: usedFrame };
writeFileSync(new URL('loading-visibility-check.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(report);
