import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { containedFile, createFileStorage } from './files';
protocol.registerSchemesAsPrivileged([{ scheme: 'driverschool', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
} }]);
app.setName('DriverSchool');
const devUrl = !app.isPackaged ? process.env.DRIVERSCHOOL_DEV_URL : undefined;
if (devUrl && !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(devUrl)) throw new Error('Expected local Vite URL');
const entry = devUrl ?? 'driverschool://game/index.html';
let mainWindow: BrowserWindow | null = null;
function createWindow(): void {
  const window = new BrowserWindow({ title: 'DriverSchool', width: 1600, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#101214', show: false, webPreferences: {
      preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
    } });
  mainWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const next = new URL(url), initial = new URL(entry);
    if (next.protocol !== initial.protocol || next.host !== initial.host) event.preventDefault();
  });
  window.webContents.once('dom-ready', () => window.show());
  window.once('ready-to-show', () => { if (!window.isVisible()) window.show(); });
  window.on('closed', () => { mainWindow = null; });
  void window.loadURL(entry);
}
void app.whenReady().then(async () => {
  const directories = Object.fromEntries(['config', 'saves', 'logs', 'mods'].map(area => [area, join(app.getPath('userData'), area)]));
  await Promise.all(Object.values(directories).map(path => mkdir(path, { recursive: true })));
  app.setAppLogsPath(directories.logs);
  const storage = createFileStorage(app.getPath('userData'));
  const dist = join(__dirname, '..', 'dist');
  protocol.handle('driverschool', request => {
    const url = new URL(request.url);
    if (url.host !== 'game') return new Response(null, { status: 403 });
    try { return net.fetch(pathToFileURL(containedFile(dist, decodeURIComponent(url.pathname).slice(1))).href); }
    catch { return new Response(null, { status: 403 }); }
  });
  const handle = (channel: string, callback: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Untrusted sender');
      return callback(...args);
    });
  };
  handle('storage:load', (key: string) => storage.loadText(key));
  handle('storage:save', (key: string, text: string) => storage.saveText(key, text));
  handle('window:fullscreen', (enabled: boolean) => mainWindow?.setFullScreen(enabled === true));
  handle('window:is-fullscreen', () => mainWindow?.isFullScreen() ?? false);
  handle('app:directories', () => directories);
  handle('file:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'Text / JSON', extensions: ['json', 'txt'] }] });
    return result.canceled ? null : readFile(result.filePaths[0]!, 'utf8');
  });
  handle('file:export', async (content: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: join(directories.saves!, 'export.json') });
    if (!result.canceled && result.filePath) await writeFile(result.filePath, content, 'utf8');
  });
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
