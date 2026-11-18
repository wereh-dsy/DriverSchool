const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve('artifacts/qin-plus-ehs/audit'); mkdirSync(output, { recursive: true });
const visualOnly = process.env.QIN_AUDIT_VISUAL_ONLY === '1';
app.setPath('userData', resolve('.tmp-qin-runtime-profile'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const delay = ms => new Promise(r => setTimeout(r, ms));
const timeout = setTimeout(() => { console.error('Qin runtime timeout'); app.exit(1); }, 180000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  const report = { runtime: 'real StartupApplication and DrivingGame, WebGL and Web Audio', errors: [], cases: [] };
  win.webContents.on('console-message', e => { if (e.level === 'error') report.errors.push(e.message); });
  const run = expression => win.webContents.executeJavaScript(expression, true);
  try {
    await win.loadURL('http://127.0.0.1:5187/scripts/qin-runtime-audit.html');
    for (let i = 0; i < 900; i++) {
      if (await run('!!window.qinRuntimeAudit?.ready')) break;
      const errors = await run('window.qinRuntimeAudit?.errors ?? []'); if (errors.length) throw Error(errors.join('\n'));
      await delay(100);
    }
    if (!await run('!!window.qinRuntimeAudit?.ready')) throw Error('Actual game did not reach ready');
    for (const [name, mode, speed, throttle, soc, exterior] of [
      ['exterior', 'EV', 0, 0, .85, true], ['cockpit', 'EV', 0, 0, .85, false],
      ['series-cabin', 'HOLD', 10, .18, .25, false], ['series-exterior', 'HOLD', 10, .18, .25, true],
      ['parallel', 'HOLD', 27, .2, .5, false],
    ].filter(c => !visualOnly || c[0] === 'exterior' || c[0] === 'cockpit')) {
      await run(`window.qinRuntimeAudit.scenario(${JSON.stringify(mode)},${speed},${throttle},${soc},${exterior})`);
      await delay(mode === 'EV' ? 1800 : 6500);
      const before = await run('window.qinRuntimeAudit.snapshot()');
      const clip = await run('window.qinRuntimeAudit.record(1800)');
      writeFileSync(join(output, name + '.wav'), Buffer.from(clip.base64, 'base64')); delete clip.base64;
      writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
      report.cases.push({ name, before, after: await run('window.qinRuntimeAudit.snapshot()'), audioClip: clip });
    }
    await run('window.qinRuntimeAudit.navigation()'); await delay(500);
    writeFileSync(join(output, 'navigation.png'), (await win.webContents.capturePage()).toPNG());
    report.passed = !report.errors.length && report.cases.every(c => c.before.ready && !c.before.errors.length && c.audioClip.samples > 0);
    writeFileSync(join(output, visualOnly ? 'runtime-visual.json' : 'runtime.json'), JSON.stringify(report, null, 2));
    if (!report.passed) throw Error('Runtime/WebAudio checks failed');
    console.log(JSON.stringify({ passed: report.passed, cases: report.cases.map(c => ({ name: c.name, state: c.before.ehs.state, rpm: c.before.rpm, audio: c.before.audio, clipRMS: c.audioClip.rms, renderer: c.before.renderer })) }, null, 2));
    clearTimeout(timeout); app.exit(0);
  } catch (error) {
    report.errors.push(String(error)); writeFileSync(join(output, 'runtime.json'), JSON.stringify(report, null, 2));
    console.error(error); clearTimeout(timeout); app.exit(1);
  }
});
