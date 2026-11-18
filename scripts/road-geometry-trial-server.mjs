import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url)), output = resolve(root, 'artifacts/road-geometry-trial');
const allowed = new Set(['arterial','median','junction','divided','bridge','underground','skew','arterial-detail','median-detail','junction-detail','bridge-detail','underground-interior']);
const server = await createServer({ configFile: false, root, publicDir: false, cacheDir: '.vite/road-geometry-trial',
  optimizeDeps: { noDiscovery: true, include: ['three','three/addons/utils/BufferGeometryUtils.js','three/addons/controls/OrbitControls.js'] },
  server: { host: '127.0.0.1', port: 5192, strictPort: true,
    watch: { ignored: ['**/artifacts/**','**/.tmp-*/**','**/.checkpoint-builds/**','**/.desktop/**','**/release/**'] } },
  plugins: [{ name: 'local-road-geometry-trial', configureServer(s) {
    s.middlewares.use('/__road_trial_map', async (_req, res) => {
      try { res.setHeader('Content-Type','application/json'); res.end(await readFile(resolve(root, 'src/world/regional/regional-main.json'))); }
      catch (e) { res.statusCode = 500; res.end(String(e)); }
    });
    s.middlewares.use('/__road_trial_capture', async (req, res) => {
      if (req.method !== 'POST' || req.headers.origin !== 'http://127.0.0.1:5192') { res.statusCode = 403; res.end(); return; }
      try {
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 12_000_000) throw new Error('Capture too large'); chunks.push(c); }
        const data = JSON.parse(Buffer.concat(chunks).toString()); await mkdir(output, { recursive:true });
        if (data.kind === 'report') await writeFile(resolve(output,'browser-checks.json'), JSON.stringify(data.report,null,2) + '\n');
        else if (allowed.has(data.name) && typeof data.image === 'string' && data.image.startsWith('data:image/png;base64,'))
          await writeFile(resolve(output,data.name + '.png'),Buffer.from(data.image.slice(22),'base64'));
        else throw new Error('Invalid capture');
        res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({saved:true}));
      } catch (e) { res.statusCode = 400; res.end(String(e)); }
    });
  } }] });
await server.listen(); console.log('Local trial: http://127.0.0.1:5192/scripts/road-geometry-trial.html');
