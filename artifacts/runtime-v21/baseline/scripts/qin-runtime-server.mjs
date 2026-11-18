import { createServer, loadConfigFromFile } from 'vite';
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' });
const server = await createServer({ ...loaded.config, configFile: false,
  cacheDir: '.vite/qin-audit', optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 5187, strictPort: true,
    watch: { ignored: ['**/.tmp*/**', '**/artifacts/**', '**/.desktop/**', '**/release/**', '**/.checkpoint-builds/**'] } } });
await server.listen(); console.log('Qin runtime audit listening http://127.0.0.1:5187');
process.on('SIGINT', async () => { await server.close(); process.exit(0); });
