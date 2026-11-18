const{app,BrowserWindow,powerMonitor}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.resolve('.tmp-runtime4-targeted'));process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
app.whenReady().then(async()=>{
 const out='artifacts/runtime-v4/',win=new BrowserWindow({show:false,width:1200,height:720,webPreferences:{backgroundThrottling:false}}),logs=[];
 fs.writeFileSync(out+'targeted-conditions.json',JSON.stringify({onBattery:powerMonitor.isOnBatteryPower(),presentation:'hidden targeted only; not performance evidence'}));
 win.webContents.on('console-message',(_event,...args)=>{logs.push(args);fs.writeFileSync(out+'targeted-console.json',JSON.stringify(logs));});
 win.webContents.on('page-title-updated',async(_event,title)=>{
  if(title==='PHASE4:DAY'||title==='PHASE4:NIGHT'||title.startsWith('PHASE4:CAR:')){const shot=await win.webContents.capturePage();fs.writeFileSync(out+(title==='PHASE4:DAY'?'targeted-day.png':title==='PHASE4:NIGHT'?'targeted-night.png':title.split(':')[2]+'.png'),shot.toPNG());}
  if(title==='PHASE4:DONE'||title==='PHASE4:ERROR'){console.log(title);win.destroy();app.exit(title==='PHASE4:DONE'?0:1);}
 });
 await win.loadURL('http://127.0.0.1:5284/artifacts/runtime-v4/targeted.html?regionalSpawn=preload-profile&from=18');
 setTimeout(()=>{win.destroy();app.exit(3);},360000).unref();
});
