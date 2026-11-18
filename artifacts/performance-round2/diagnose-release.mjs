import { writeFileSync } from 'node:fs';
const port = Number(process.argv[2]);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find(t => t.type === 'page' && t.url.startsWith('driverschool://game/'));
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const reply = new Promise(resolve => socket.addEventListener('message', e => resolve(JSON.parse(e.data)), { once: true }));
socket.send(JSON.stringify({
  id: 1, method: 'Runtime.evaluate', params: {
    expression: `(async()=>({now: performance.now(), visibility: document.visibilityState, state: document.querySelector('#app').dataset.uiPhase,
      marks: performance.getEntriesByType('mark').map(x=>[x.name,x.startTime]),
      measures: performance.getEntriesByType('measure').map(x=>[x.name,x.startTime,x.duration,x.detail]),
      rafMs: await new Promise(r=>{const t=performance.now();requestAnimationFrame(()=>r(performance.now()-t));setTimeout(()=>r(null),700);})}))()`,
    returnByValue: true, awaitPromise: true,
  },
}));
const result = await Promise.race([reply, new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 2500))]);
socket.close();
writeFileSync(new URL('release-stall-diagnostic.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
