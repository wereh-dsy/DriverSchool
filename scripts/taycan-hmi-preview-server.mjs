import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/taycan-hmi-v1');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5191, strictPort: true }, plugins: [{
  name: 'taycan-local-capture', configureServer(s) { s.middlewares.use('/__taycan_capture', async (req, res) => {
    if (req.method !== 'POST' || !['http://127.0.0.1:5191', 'http://localhost:5191'].includes(req.headers.origin)) { res.statusCode = 403; res.end(); return; }
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 10_000_000) throw new Error('Too large'); chunks.push(chunk); }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (!/^hmi-(driver-day|driver-night|instrument-primary|instrument-assistance|instrument-navigation|center-navigation|center-energy|center-parking|lower-climate|dashboard)$/.test(data.name) || !data.image.startsWith('data:image/png;base64,')) throw new Error('Invalid capture');
      await mkdir(output, { recursive: true }); await writeFile(resolve(output, data.name + '.png'), Buffer.from(data.image.slice(22), 'base64'));
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ saved: data.name }));
    } catch (error) { res.statusCode = 400; res.end(String(error)); }
  }); }
}] });
await server.listen(); server.printUrls();
