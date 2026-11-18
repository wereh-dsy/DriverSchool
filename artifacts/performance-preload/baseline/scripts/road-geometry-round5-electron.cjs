const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve('artifacts/road-geometry-round5'),mode=process.argv[2]??'round5';
if(!['round4','round5','game'].includes(mode))throw new Error('Unknown validation mode');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'browser-process.json'),JSON.stringify({pid:process.pid,script:__filename}));
// Windows GUI processes can outlive their launching console pipe. Never write
// to that pipe; an EPIPE otherwise opens Electron's native exception dialog.
const log=message=>fs.appendFileSync(path.join(output,'browser-launcher-'+mode+'.log'),String(message)+'\n');
process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
process.on('uncaughtException',error=>{log(error.stack??String(error));app.exit(1);});
process.on('unhandledRejection',error=>{log(error?.stack??String(error));app.exit(1);});
app.setPath('userData',path.resolve('.tmp-road-round5-browser'));
app.commandLine.appendSwitch('disable-renderer-backgrounding');app.commandLine.appendSwitch('disable-background-timer-throttling');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false,offscreen:true}});
 win.webContents.setFrameRate(60);win.webContents.startPainting();
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 const logs=[];win.webContents.on('console-message',(_event,...args)=>{const message=typeof args[1]==='string'?args[1]:JSON.stringify(args);if(message.includes('R5:')||message.includes('Error'))log(message);logs.push(message);if(logs.length>200)logs.shift();});
 win.webContents.on('render-process-gone',(_event,details)=>{fs.writeFileSync(path.join(output,'renderer-failure-'+mode+'.json'),JSON.stringify(details,null,2));app.exit(1);});
 win.webContents.on('page-title-updated',async(_event,title)=>{if(title==='R5:GAME_READY'){const shot=await win.webContents.capturePage();fs.writeFileSync(path.join(output,'game-entry.png'),shot.toPNG());}if(title==='R5:DONE'){fs.writeFileSync(path.join(output,'browser-console-'+mode+'.json'),JSON.stringify(logs,null,2));setTimeout(()=>app.quit(),1000);}});
 await win.loadURL(mode==='game'?'http://127.0.0.1:5196/scripts/road-geometry-round5-game.html':'http://127.0.0.1:5196/scripts/road-geometry-round5.html?run=1&variant='+mode);
 fs.writeFileSync(path.join(output,'browser-runtime-'+mode+'.json'),JSON.stringify({runtime:process.versions,features:app.getGPUFeatureStatus(),gpu:await app.getGPUInfo('basic'),hiddenWindow:true,offscreen:true,targetFrameRate:60,backgroundThrottling:false},null,2));
});
setTimeout(()=>{log('R5: bounded runtime check timed out');app.exit(2);},600000).unref();
