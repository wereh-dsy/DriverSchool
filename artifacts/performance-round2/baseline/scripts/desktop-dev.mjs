import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
await import('./desktop-build.mjs');
const server = await createServer({ cacheDir: '.desktop/vite-cache', server: { host: '127.0.0.1', port: 5173 } });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`DriverSchool Desktop · ${url}`);
const env = { ...process.env, DRIVERSCHOOL_DEV_URL: url };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.desktop/main.cjs'], { stdio: 'inherit', env });
async function close() { child.kill(); await server.close(); }
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
child.once('error', async error => { console.error(error); await server.close(); process.exitCode = 1; });
child.once('exit', async code => { await server.close(); process.exitCode = code ?? 0; });
