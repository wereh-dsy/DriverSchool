// One launch, no driving or UI manipulation. Reports observable lifecycle marks.
const { app, session } = require('electron');
const { join, resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const root = resolve(__dirname, '..'), started = performance.now(), requests = new Map();
app.setPath('userData', join(root, '.desktop/baseline-profile'));
app.whenReady().then(() => session.defaultSession.webRequest.onBeforeRequest({urls:['driverschool://game/*']}, (details, callback) => {
  requests.set(details.url, (requests.get(details.url) ?? 0) + 1); callback({});
}));
let exeToInteractiveMs;
const deadline = setTimeout(() => { console.error('Startup timing timed out'); app.exit(1); }, 45000);
app.on('browser-window-created', (_event, window) => window.webContents.once('did-finish-load', () => {
  let polling = false;
  const poll = setInterval(async () => {
    if (polling) return; polling = true;
    try {
      const result = await window.webContents.executeJavaScript(`(() => ({
        ready: !!document.querySelector('[data-action="start"]:not(:disabled)'),
        canvas: !!document.querySelector('canvas.webgl'),
        phases: performance.getEntriesByType('mark').filter(e=>e.name.startsWith('loading:')).map(e=>({name:e.name,ms:e.startTime})),
        batches: performance.getEntriesByName('loading:batched').map(e=>({ms:e.duration,...e.detail}))
      }))()`);
      if (result.ready && exeToInteractiveMs === undefined) exeToInteractiveMs = performance.now() - started;
      if (!result.phases.some(p=>p.name==='loading:menuSceneReady')) return;
      clearInterval(poll); clearTimeout(deadline);
      const report = {exeToInteractiveMs,exeToMenuSceneMs:performance.now()-started,...result,requests:[...requests].map(([url,count])=>({url,count})),runtimeRequestedBeforeDrive:[...requests.keys()].some(url=>/DrivingGame-|city-main.runtime/.test(url))};
      writeFileSync(join(root, process.env.DRIVERSCHOOL_TIMING_OUT || '.tmp-startup-after.json'), JSON.stringify(report,null,2));
      console.log(JSON.stringify(report,null,2)); app.exit(0);
    } catch(error) { console.error(error); app.exit(1); } finally {polling=false;}
  }, 100);
}));
require(process.env.DRIVERSCHOOL_SMOKE_MAIN || join(root,'.desktop/main.cjs'));
