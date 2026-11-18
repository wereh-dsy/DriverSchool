import { build } from 'esbuild';
await build({ entryPoints: ['desktop/main.ts', 'desktop/preload.ts'], outdir: '.desktop',
  outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node22' });
