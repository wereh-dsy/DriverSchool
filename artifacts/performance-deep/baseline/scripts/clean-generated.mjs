import { readdirSync, readFileSync, lstatSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0'));
const dist = resolve(root, 'dist'), assets = resolve(dist, 'assets');
const candidates = [], preserved = new Set();
function candidate(path) {
  const full = resolve(path);
  if (!full.startsWith(root + sep) || !realpathSync(full).startsWith(realpathSync(root) + sep) || full === root || lstatSync(full).isSymbolicLink())
    throw new Error(`Refusing unexpected cleanup target: ${full}`);
  const relative = full.slice(root.length + 1).replaceAll('\\', '/');
  if ([...tracked].some(file => file === relative || file.startsWith(relative + '/'))) return;
  candidates.push(full);
}
// Resolve both playable and rollback entry graphs before selecting any assets.
if (existsSync(resolve(dist, 'index.html')) && existsSync(assets)) {
  const names = new Set(readdirSync(assets)), queue = [resolve(dist, 'index.html')];
  const rollback = resolve(root, '.checkpoint-builds/last-good-index.html');
  if (existsSync(rollback)) queue.push(rollback);
  while (queue.length) {
    const path = queue.pop();
    const content = readFileSync(path, 'utf8');
    for (const match of content.matchAll(/[A-Za-z0-9_.-]+\.(?:js|css|json|png|jpe?g|webp|svg|woff2?|mp3|ogg)\b/g)) {
      const name = match[0];
      if (!names.has(name) || preserved.has(name)) continue;
      preserved.add(name);
      if (/\.(?:js|css)$/.test(name)) queue.push(resolve(assets, name));
    }
  }
  if (![...preserved].some(name => name.endsWith('.js'))) throw new Error('No playable asset graph; cleanup cancelled.');
  for (const name of names) if (!preserved.has(name)) candidate(resolve(assets, name));
  // Files previously copied by publicDir; no current runtime/editor fetch uses them.
  const obsolete = readdirSync(resolve(root, 'src/world/city/maps')).filter(name => name !== 'city-alpha.json');
  for (const name of obsolete) if (existsSync(resolve(dist, name))) candidate(resolve(dist, name));
}
const checkpoint = resolve(root, '.checkpoint-builds');
if (existsSync(checkpoint)) {
  const stages = readdirSync(checkpoint).filter(name => /^stage-[a-f0-9]{32}$/.test(name))
    .map(name => ({ path: resolve(checkpoint, name), modified: lstatSync(resolve(checkpoint, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified);
  for (const stage of stages.slice(2)) candidate(stage.path);
}
// Leave authored candidate .ts files, JSON evidence, attachments and artifacts alone.
for (const name of readdirSync(root)) if (/^\.tmp-.+\.(?:mjs|cjs|log|tsbuildinfo)$/.test(name)) candidate(resolve(root, name));
function bytes(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`Refusing linked cleanup content: ${path}`);
  return stat.isDirectory() ? readdirSync(path).reduce((sum, name) => sum + bytes(resolve(path, name)), 0) : stat.size;
}
// Resolve and inspect every recursive target before the first deletion.
const report = { apply, paths: candidates.length, bytes: candidates.reduce((sum, path) => sum + bytes(path), 0),
  preservedAssets: [...preserved].sort(), targets: candidates.map(path => path.slice(root.length + 1)) };
if (apply) for (const path of candidates) rmSync(path, { recursive: lstatSync(path).isDirectory() });
console.log(JSON.stringify(report, null, 2));
