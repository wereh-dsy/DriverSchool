// Read-only renderer readiness plus isolated IPC roundtrip; no automated driving.
const { app } = require('electron');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '..');
app.setPath('userData', join(root, '.desktop/smoke-profile'));
const deadline = setTimeout(() => { console.error('Desktop smoke timed out'); app.exit(1); }, 45000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('did-fail-load', (_event, code, message) => { console.error(code, message); app.exit(1); });
  window.webContents.once('did-finish-load', async () => {
    try {
      const poll = setInterval(async () => {
        try {
          const ready = await window.webContents.executeJavaScript(`!!document.querySelector('[data-action="start"]:not(:disabled)') && !!document.querySelector('canvas.webgl') && performance.getEntriesByName('loading:menuSceneReady').length > 0`);
          if (!ready) return;
          clearInterval(poll);
          const result = await window.webContents.executeJavaScript(`(async () => {
            const platform = window.driverSchoolPlatform;
            await platform.storage.saveText('config/smoke.json', 'desktop-bridge');
            const value = await platform.storage.loadText('config/smoke.json');
            let traversalRejected = false;
            try { await platform.storage.loadText('../outside'); } catch { traversalRejected = true; }
            return { kind: platform.kind, value, traversalRejected, require: typeof require, process: typeof process,
              canvas: !!document.querySelector('canvas.webgl'), fullscreen: await platform.isFullscreen(),
              directories: Object.keys(await platform.getDirectories()), title: document.title };
          })()`);
          if (result.kind !== 'desktop' || result.value !== 'desktop-bridge' || !result.traversalRejected ||
              result.require !== 'undefined' || result.process !== 'undefined' || !result.canvas || result.directories.length !== 4) throw new Error(JSON.stringify(result));
          clearTimeout(deadline); console.log('Desktop smoke PASS', JSON.stringify(result)); app.exit(0);
        } catch (error) { clearInterval(poll); console.error(error); app.exit(1); }
      }, 300);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require(process.env.DRIVERSCHOOL_SMOKE_MAIN || join(root, '.desktop/main.cjs'));
