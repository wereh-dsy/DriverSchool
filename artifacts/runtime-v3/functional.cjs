const{app,BrowserWindow,powerMonitor}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.resolve('.tmp-runtime3-functional'));process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
app.whenReady().then(async()=>{
 const out='artifacts/runtime-v3/',win=new BrowserWindow({show:false,width:1200,height:720,webPreferences:{backgroundThrottling:false}}),logs=[];
 fs.writeFileSync(out+'functional-conditions.json',JSON.stringify({onBattery:powerMonitor.isOnBatteryPower(),presentation:'hidden functional only; not performance evidence'}));
 win.webContents.on('console-message',(_event,...args)=>{logs.push(args);fs.writeFileSync(out+'functional-console.json',JSON.stringify(logs));});
 win.webContents.on('page-title-updated',async(_event,title)=>{
  if(title==='PHASE3:DAY'||title==='PHASE3:NIGHT'){const shot=await win.webContents.capturePage();fs.writeFileSync(out+(title==='PHASE3:DAY'?'functional-day.png':'functional-night.png'),shot.toPNG());}
  if(title==='PHASE3:DONE'||title==='PHASE3:ERROR'){console.log(title);win.destroy();app.exit(title==='PHASE3:DONE'?0:1);}
 });
 await win.loadURL('http://127.0.0.1:5281/artifacts/runtime-v3/functional.html?regionalSpawn=preload-profile');
 setTimeout(()=>{win.destroy();app.exit(3);},240000).unref();
});
