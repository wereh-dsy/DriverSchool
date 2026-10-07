import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:net';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), args = process.argv.slice(2);
const noOpen = args.some(a => /^--?no-?open$/i.test(a)), portIndex = args.findIndex(a => /^--?port$/i.test(a));
const firstPort = portIndex >= 0 ? Number(args[portIndex + 1]) : 5173;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function editorServer(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/src/world/city/CityMapData.ts`, { signal: AbortSignal.timeout(600) }); return r.ok && (await r.text()).includes('urban_4lane'); } catch { return false; }
}
async function free(port) {
  return await new Promise(r => { const server = createServer(); server.on('error', () => r(false)); server.listen(port, '127.0.0.1', () => server.close(() => r(true))); });
}
function open(port) {
  const url = `http://127.0.0.1:${port}/?editor=city`; console.log(`City Map Editor ready: ${url}`);
  if (!noOpen) { const child = process.platform === 'win32' ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' }) : spawn('xdg-open', [url], { stdio: 'ignore' }); child.on('error', () => console.log('Open the URL above in your browser.')); child.unref(); }
}
try {
  if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65515) throw new Error('Port must be 1–65515.');
  let available;
  for (let port = firstPort; port < firstPort + 20; port++) {
    if (await editorServer(port)) { console.log('Reusing an existing DriverGame development server.'); open(port); process.exit(0); }
    if (available === undefined && await free(port)) available = port;
  }
  if (available === undefined) throw new Error('All 20 candidate ports are busy. Use --port <number>.');
  const vite = resolve(root, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) throw new Error('Dependencies are missing. Install the project dependencies with pnpm install, then launch again.');
  const server = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(available), '--strictPort'], { cwd: root, windowsHide: true, stdio: 'inherit' });
  let exited = false; server.on('exit', code => { exited = true; process.exitCode = code ?? 1; });
  process.on('SIGINT', () => server.kill()); process.on('SIGTERM', () => server.kill());
  let ready = false;
  for (let attempt = 0; attempt < 80 && !exited; attempt++) { if (await editorServer(available)) { ready = true; break; } await pause(250); }
  if (!ready) { server.kill(); throw new Error('The editor server did not become ready within 20 seconds.'); }
  open(available);
} catch (error) { console.error(String(error)); process.exitCode = 1; }
