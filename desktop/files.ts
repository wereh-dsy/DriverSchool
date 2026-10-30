import { join, resolve, relative, isAbsolute } from 'node:path';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { validStorageKey } from '../src/platform/Platform';
export function containedFile(root: string, path: string): string {
  const file = resolve(root, path), rel = relative(root, file);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path outside application directory');
  return file;
}
export function createFileStorage(root: string) {
  async function target(key: string): Promise<string> {
    if (!validStorageKey(key)) throw new Error('Invalid storage key');
    const folder = join(root, key.split('/')[0]!);
    await mkdir(folder, { recursive: true });
    const canonicalRoot = await realpath(root);
    containedFile(canonicalRoot, relative(canonicalRoot, await realpath(folder)));
    const file = containedFile(root, key);
    try { containedFile(canonicalRoot, relative(canonicalRoot, await realpath(file))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return file;
  }
  return {
    async loadText(key: string): Promise<string | null> {
      try { return await readFile(await target(key), 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    },
    async saveText(key: string, content: string): Promise<void> { await writeFile(await target(key), content, 'utf8'); },
  };
}
