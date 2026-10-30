import { createBrowserPlatform } from './browser/BrowserPlatform';
import { desktopPlatform } from './electron/ElectronPlatform';
export const platform = desktopPlatform() ?? createBrowserPlatform();
