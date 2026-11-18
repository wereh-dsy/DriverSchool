// Production desktop entry, isolated preferences, actual keyboard and HUD path.
const { app } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '..'), out = join(root, 'artifacts/p2-launch-fix-2026-11-13');
mkdirSync(out, { recursive: true });
app.setPath('userData', join(root, '.tmp-p2-launch-smoke-profile'));
const deadline = setTimeout(() => { console.error('P2 production launch timeout'); app.exit(1); }, 90000);
app.on('browser-window-created', (_event, win) => {
  const errors = []; win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message', e => { if (e.level === 'error') errors.push(e.message); });
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        const wait = async (test, limit = 45000) => { const start = performance.now(); while (!test()) {
          if (performance.now() - start > limit) throw Error('P2 UI timeout: ' + document.body.innerText.slice(-1000)); await delay(40);
        } };
        const key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code, bubbles: true}));
        await wait(() => performance.getEntriesByName('loading:menuSceneReady').length > 0);
        document.querySelector('[data-action="vehicles"]').click();
        await wait(() => !!document.querySelector('[data-vehicle-picker]'));
        const picker = document.querySelector('[data-vehicle-picker]'); picker.value = 'tank-500-hi4-t'; picker.dispatchEvent(new Event('change', {bubbles: true}));
        await delay(500); document.querySelector('[data-action="confirm-vehicle"]').click(); document.querySelector('[data-action="start"]').click();
        await wait(() => document.querySelector('#app').dataset.uiPhase === 'driving' && document.querySelector('[data-screen="loading"]').hidden);
        await wait(() => [...document.querySelectorAll('summary')].some(s => s.textContent.startsWith('Hi4-T · 混动')));
        const panel = [...document.querySelectorAll('summary')].find(s => s.textContent.startsWith('Hi4-T · 混动')).parentElement;
        panel.open = true; const mode = panel.querySelector('select'); mode.value = 'EV'; mode.dispatchEvent(new Event('change')); mode.blur();
        key('KeyS'); await delay(1000); key('BracketRight'); await delay(120); key('BracketRight', false); await delay(500);
        key('KeyS', false); key('KeyW');
        const speed = () => Number(document.querySelector('[data-speed]').textContent);
        await wait(() => speed() >= 30, 15000); const firstLaunchKmh = speed(); key('KeyW', false);
        key('KeyS'); await wait(() => speed() === 0, 12000); await delay(500);
        key('KeyS', false); key('KeyW'); await wait(() => speed() >= 30, 15000); const relaunchKmh = speed(); key('KeyW', false);
        return { vehicle: picker.value, mode: mode.value, firstLaunchKmh, relaunchKmh, origin: location.origin };
      })()`);
      writeFileSync(join(out, 'production-launch.png'), (await win.webContents.capturePage()).toPNG());
      writeFileSync(join(out, 'production-launch.json'), JSON.stringify({ result, errors }, null, 2));
      if (errors.length) throw Error(errors.join('\n'));
      console.log(JSON.stringify({ result, errors }, null, 2)); clearTimeout(deadline); app.exit(0);
    } catch (error) {
      writeFileSync(join(out, 'production-error.json'), JSON.stringify({ error: String(error), errors }, null, 2));
      console.error(error); clearTimeout(deadline); app.exit(1);
    }
  });
});
require('../.desktop/main.cjs');
