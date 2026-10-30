// Low-cost, hidden Chromium render of the actual production vehicle builders.
const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { join, resolve, basename, dirname } = require('node:path');
const root = resolve(__dirname, '..'), phase = process.argv.includes('--before') ? 'before' : 'after';
const output = process.argv.find(a=>a.startsWith('--output-dir='))?.slice(13);
const directory = output ? resolve(root,output) : join(root, 'artifacts/vehicle-exterior-refinement', `renders-${phase}`);
const temporary = join(root, '.tmp-vehicle-exterior-preview');
mkdirSync(directory, { recursive: true }); mkdirSync(temporary, { recursive: true });
app.setPath('userData', join(temporary, 'profile'));
// Optional original-source snapshot lets before/after use identical lighting.
const snapshot = process.argv.find(a => a.startsWith('--baseline-dir='))?.slice(15);
const compilation = build({ entryPoints: [join(__dirname, 'vehicle-exterior-preview.ts')], bundle: true,
  platform: 'browser', format: 'iife', outfile: join(temporary, 'preview.js'),
  plugins: snapshot ? [{ name: 'original-visual-snapshot', setup(builder) {
    builder.onLoad({ filter: /[\\/]visual[\\/][^\\/]+\.ts$/ }, args => {
      const saved = join(resolve(root, snapshot), basename(args.path));
      if (existsSync(saved)) return { contents: readFileSync(saved, 'utf8'), loader: 'ts', resolveDir: dirname(args.path) };
    });
  } }] : [] });
writeFileSync(join(temporary, 'index.html'), '<!doctype html><html><body style="margin:0"><script src="preview.js"></script></body></html>');
const deadline = setTimeout(() => { console.error('Exterior rendering timeout'); app.exit(1); }, 180000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 820, height: 540,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const errors = [];
  let resolveConsoleProbe;
  const consoleProbe = new Promise(resolve => { resolveConsoleProbe=resolve; });
  window.webContents.on('console-message', event => {
    if(event.message==='EXTERIOR_RENDER_LOG_PROBE'){resolveConsoleProbe();return;}
    if(event.level==='error')errors.push(event.message);
  });
  try {
    await compilation;
    await window.loadFile(join(temporary, 'index.html'));
    await Promise.all([consoleProbe,window.webContents.executeJavaScript('console.warn("EXTERIOR_RENDER_LOG_PROBE")')]);
    const ids = await window.webContents.executeJavaScript('window.vehicleIds');
    const selected = process.argv.find(a => a.startsWith('--vehicle='))?.slice(10);
    const results = [];
    for (const id of ids.filter(id => !selected || id === selected)) {
      const result = await window.webContents.executeJavaScript(`window.captureVehicle(${JSON.stringify(id)})`);
      writeFileSync(join(directory, `${id}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
      results.push({ id, calls: result.calls, triangles: result.triangles, geometries: result.geometries,
        textures: result.textures, constructionMs: result.constructionMs });
      console.log(`${id}: ${result.calls} draw calls, ${result.triangles} rendered triangles`);
    }
    writeFileSync(join(directory, 'render-results.json'), JSON.stringify({ results, errors, consoleCaptureVerified: true }, null, 2) + '\n');
    if (errors.length) throw Error(errors.join('\n'));
    clearTimeout(deadline); app.exit(0);
  } catch (error) { console.error(error); clearTimeout(deadline); app.exit(1); }
});
