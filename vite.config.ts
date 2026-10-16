import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Only the editor Reload endpoint is public. Map recipes/selftests are source,
// and other built-in maps already travel in the runtime bundle.
export default defineConfig({ publicDir: false, plugins: [{
  name: 'editor-reload-map',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'city-alpha.json',
      source: readFileSync(new URL('./src/world/city/maps/city-alpha.json', import.meta.url), 'utf8') });
  },
}] });
