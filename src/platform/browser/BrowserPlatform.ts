import type { Platform } from '../Platform';
import { validStorageKey } from '../Platform';
export function createBrowserPlatform(): Platform {
  const memory = new Map<string, string>();
  return {
    kind: 'browser',
    storage: {
      async loadText(key) {
        if (!validStorageKey(key)) throw new Error('Invalid storage key');
        try { return localStorage.getItem(`drivergame.platform.v1.${key}`) ?? memory.get(key) ?? null; }
        catch { return memory.get(key) ?? null; }
      },
      async saveText(key, content) {
        if (!validStorageKey(key)) throw new Error('Invalid storage key');
        memory.set(key, content);
        try { localStorage.setItem(`drivergame.platform.v1.${key}`, content); } catch { /* Optional storage. */ }
      },
    },
    async setFullscreen(enabled) {
      if (enabled && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (!enabled && document.fullscreenElement) await document.exitFullscreen();
    },
    async isFullscreen() { return !!document.fullscreenElement; },
    async getDirectories() { return {}; },
    async importText() {
      return new Promise(resolve => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.txt';
        input.onchange = () => { void (input.files?.[0]?.text() ?? Promise.resolve(null)).then(resolve); };
        input.oncancel = () => resolve(null); input.click();
      });
    },
    async exportText(content) {
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'driverschool-export.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
