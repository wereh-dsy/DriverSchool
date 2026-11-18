const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
app.disableHardwareAcceleration();app.setPath('userData',path.resolve('.tmp-runtime-window-policy'));
app.whenReady().then(()=>{
  const source=fs.readFileSync('artifacts/runtime-v2-phase2/runner.cjs','utf8');
  const literal=source.match(/new BrowserWindow\((\{.*?\})\);win\.setAlwaysOnTop/)[1];
  const options=vm.runInNewContext('('+literal+')',{variant:'window-policy',mode:'check'});
  const win=new BrowserWindow(options);
  const result={minimizable:win.isMinimizable(),movable:win.isMovable(),resizable:win.isResizable(),alwaysOnTop:win.isAlwaysOnTop(),fullscreen:win.isFullScreen(),fullscreenable:win.isFullScreenable(),kiosk:win.isKiosk(),visible:win.isVisible(),frame:options.frame,taskbar:!options.skipTaskbar};
  fs.writeFileSync('artifacts/runtime-v2-phase2/window-policy-check.json',JSON.stringify(result,null,2));
  const passed=result.minimizable&&result.movable&&result.resizable&&!result.alwaysOnTop&&!result.fullscreen&&!result.fullscreenable&&!result.kiosk&&!result.visible&&result.frame&&result.taskbar;
  win.destroy();app.exit(passed?0:1);
}).catch(e=>{fs.writeFileSync('artifacts/runtime-v2-phase2/window-policy-error.log',e.stack);app.exit(1);});
