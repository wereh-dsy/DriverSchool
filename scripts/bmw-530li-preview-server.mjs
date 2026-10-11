import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/bmw-530li/front-cabin-v6');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5188, strictPort: true },
  plugins: [{ name: 'bmw-local-review-capture', configureServer(s) {
    s.middlewares.use('/__bmw_capture', async (req, res) => {
      if (req.method !== 'POST' || !['http://127.0.0.1:5188', 'http://localhost:5188'].includes(req.headers.origin)) {
        res.statusCode = 403; res.end(); return;
      }
      try {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 8_000_000) throw new Error('Capture too large'); chunks.push(chunk); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!/^v6-(driver-day|driver-night|instruments-day|instruments-night|instruments-sport|instruments-p|instruments-r|instruments-n)$/.test(data.name) ||
          !data.image.startsWith('data:image/png;base64,')) throw new Error('Invalid BMW capture');
        await mkdir(output, { recursive: true });
        await writeFile(resolve(output, data.name + '.png'), Buffer.from(data.image.slice('data:image/png;base64,'.length), 'base64'));
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ saved: data.name + '.png' }));
      } catch (error) { res.statusCode = 400; res.end(String(error)); }
    });
  } }] });
await server.listen(); server.printUrls();
