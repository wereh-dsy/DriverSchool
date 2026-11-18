import { packager } from '@electron/packager';
import { mkdir, copyFile, readFile, writeFile, rm, cp, mkdtemp, rename, lstat, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, basename, dirname, join } from 'node:path';

const releaseRoot = resolve(process.env.DRIVERSCHOOL_RELEASE_DIR?.trim() || 'D:/DriverSchoolRelease');
const projectRoot = await realpath(resolve('.'));
function assertExternal(path) {
  const fromProject = relative(projectRoot, path);
  if (!fromProject || (!isAbsolute(fromProject) && fromProject !== '..' && !fromProject.startsWith('..\\') && !fromProject.startsWith('../'))) {
    throw new Error('DRIVERSCHOOL_RELEASE_DIR must be outside the project directory');
  }
}
assertExternal(releaseRoot);

async function publishPackage(source) {
  await mkdir(releaseRoot, { recursive: true });
  // Resolve junctions too: publication must not lead back into the project.
  const root = await realpath(releaseRoot);
  assertExternal(root);
  const name = basename(source);
  const destination = join(root, name);
  const existing = await lstat(destination).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new Error(`Refusing to replace a non-directory or linked package: ${destination}`);
  }
  const incoming = await mkdtemp(join(root, `.${name}-stage-`));
  const backup = `${incoming}-previous`;
  async function removeTemporary(path) {
    if (dirname(path) !== root || !basename(path).startsWith(`.${name}-stage-`)) throw new Error('Invalid publication cleanup path');
    await rm(path, { recursive: true, force: true });
  }
  try {
    // Copy the entire runtime; newly created files inherit destination ACLs.
    // Never copy project ACLs or overlay an older runtime.
    await cp(source, incoming, { recursive: true });
    for (const file of ['DriverSchool.exe', 'resources/app.asar', 'icudtl.dat', 'resources.pak']) {
      if (!(await stat(join(incoming, file))).isFile()) throw new Error(`Incomplete desktop package: ${file}`);
    }
    if (!(await stat(join(incoming, 'locales'))).isDirectory()) throw new Error('Missing desktop locales');
    if (existing) await rename(destination, backup);
    try {
      await rename(incoming, destination);
    } catch (error) {
      if (existing) {
        try { await rename(backup, destination); }
        catch (rollbackError) { throw new AggregateError([error, rollbackError], `Publication failed; previous package retained at ${backup}`); }
      }
      throw error;
    }
    if (existing) await removeTemporary(backup);
    return destination;
  } finally {
    await removeTemporary(incoming);
  }
}
await import('./desktop-build.mjs');
// Explicit payload, excluding source, tools and authoring data.
const stage = resolve('.desktop/payload');
if (!stage.startsWith(resolve('.desktop') + '\\') && !stage.startsWith(resolve('.desktop') + '/')) throw new Error('Invalid staging path');
await rm(stage, { recursive: true, force: true });
await mkdir(`${stage}/.desktop`, { recursive: true });
const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
const files = new Set(['index.html', 'city-alpha.json']);
for (const chunk of Object.values(manifest)) {
  files.add(chunk.file);
  for (const file of [...(chunk.css ?? []), ...(chunk.assets ?? [])]) files.add(file);
}
// Follow current JS references, including Vite workers and plugin-emitted map data.
for (const file of files) if (file.endsWith('.js')) {
  const source = await readFile(`dist/${file}`, 'utf8');
  for (const match of source.matchAll(/assets\/[a-zA-Z0-9_.-]+\.(?:json|js|wasm|png|svg|jpg|webp|woff2?)\b/g)) files.add(match[0]);
}
for (const file of files) {
  await mkdir(resolve(stage, 'dist', file, '..'), { recursive: true });
  await copyFile(`dist/${file}`, `${stage}/dist/${file}`);
}
for (const name of ['main.cjs', 'preload.cjs']) await copyFile(`.desktop/${name}`, `${stage}/.desktop/${name}`);
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(`${stage}/package.json`, JSON.stringify({ name: 'driverschool', version, main: '.desktop/main.cjs', productName: 'DriverSchool' }));
// Verify the cached runtime against the installed official Electron checksums.
const checksums = JSON.parse(await readFile('node_modules/electron/checksums.json', 'utf8'));
const paths = await packager({ dir: stage, name: 'DriverSchool', out: 'release', overwrite: true, asar: true, platform: 'win32', arch: 'x64', download: { checksums } });
for (const path of paths) {
  console.log(`Internal package: ${path}`);
  console.log(`Playable package: ${await publishPackage(path)}`);
}
