import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = new URL('worker-check.bundle.mjs', import.meta.url);
await build({
  stdin: { contents: "export { VisualStreamingWorker } from './src/world/city/VisualStreamingWorker'", resolveDir: process.cwd() },
  platform: 'node', bundle: true, format: 'esm', outfile: fileURLToPath(bundle), logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false' },
});
const { VisualStreamingWorker } = await import(bundle);
const sent = [];
let transport;
globalThis.Worker = class {
  constructor() { transport = this; }
  postMessage(message) { sent.push(message); }
  reply(data) { this.onmessage({ data }); }
  terminate() { this.terminated = true; }
};
const published = [], cancelled = [];
const worker = new VisualStreamingWorker({}, data => published.push(data), data => published.push(data), undefined, false, key => cancelled.push(key));
assert.equal(sent.at(-1).kind, 'init');
transport.reply({ kind: 'ready' });
worker.request('background:old', { kind: 'background', keys: ['old'] }, 10000);
worker.advance();
assert.equal(sent.at(-1).kind, 'background');
worker.request('road:near', { kind: 'road', id: 'near' }, 0);
worker.request('road:stale', { kind: 'road', id: 'stale' }, 50);
assert.deepEqual(worker.retainRequests(new Set(['near']), new Set()), ['road:stale']);
assert.equal(sent.at(-1).kind, 'cancel');
const beforeAck = sent.length;
worker.retainRequests(new Set(['near']), new Set());
worker.advance();
assert.equal(sent.length, beforeAck, 'No duplicate cancel or new work before the acknowledgement');
transport.reply({ kind: 'cancelled' });
assert.deepEqual(cancelled, ['background:old']);
assert.deepEqual(published, []);
worker.advance();
assert.equal(sent.at(-1).id, 'near');
transport.reply({ kind: 'road', data: { id: 'near' } });
assert.deepEqual(published, [{ id: 'near' }]);
worker.dispose();
assert.equal(transport.terminated, true);
assert.equal(worker.state.queued, 0);
assert.equal(worker.state.inFlight, undefined);
assert.equal(worker.jobs.cancelledQueued, 1);
assert.equal(worker.jobs.cancelledInFlight, 1);
const report = { passed: true, checks: ['stale queue removal', 'one cancel per in-flight task', 'no publication on acknowledgement', 'near work resumes after acknowledgement', 'queue clears on dispose'], jobs: worker.jobs };
writeFileSync(new URL('worker-check.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(report);
