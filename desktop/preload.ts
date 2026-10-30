import { contextBridge, ipcRenderer } from 'electron';
import type { Platform } from '../src/platform/Platform';
const platform: Platform = {
  kind: 'desktop',
  storage: {
    loadText: (key) => ipcRenderer.invoke('storage:load', key),
    saveText: (key, content) => ipcRenderer.invoke('storage:save', key, content),
  },
  setFullscreen: (enabled) => ipcRenderer.invoke('window:fullscreen', enabled),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  getDirectories: () => ipcRenderer.invoke('app:directories'),
  importText: () => ipcRenderer.invoke('file:import'),
  exportText: (content) => ipcRenderer.invoke('file:export', content),
};
contextBridge.exposeInMainWorld('driverSchoolPlatform', platform);
