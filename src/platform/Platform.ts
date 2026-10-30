export type StorageArea = 'config' | 'saves' | 'logs' | 'mods';
/** Portable keys, e.g. config/ui.json, never operating-system paths. */
export interface StorageService {
  loadText(path: string): Promise<string | null>;
  saveText(path: string, content: string): Promise<void>;
}
export interface Platform {
  readonly kind: 'browser' | 'desktop';
  readonly storage: StorageService;
  setFullscreen(enabled: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  getDirectories(): Promise<Partial<Record<StorageArea, string>>>;
  importText(): Promise<string | null>;
  exportText(content: string): Promise<void>;
}
export function validStorageKey(key: string): boolean {
  return /^(config|saves|logs|mods)\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,119}$/.test(key);
}
