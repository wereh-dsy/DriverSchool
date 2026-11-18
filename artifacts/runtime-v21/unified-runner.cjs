const{app,BrowserWindow,screen,net,powerMonitor}=require('electron'),fs=require('node:fs'),path=require('node:path');
const output=path.resolve(process.argv.includes('--candidate-only')?'artifacts/runtime-v21/final':'artifacts/runtime-v21'),heaps=[],events=[],conditions=[];let variant=process.argv.includes('--candidate-only')?'final21':'before21',win,finished=false;
app.setPath('userData',path.resolve(process.argv.includes('--candidate-only')?'.tmp-runtime21-final':'.tmp-runtime21-unified'));process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
const log=x=>fs.appendFileSync(output+'/unified-run.log',String(x)+'\n');
const persist=()=>{fs.writeFileSync(output+'/window-conditions.json',JSON.stringify({events,conditions,heaps},null,2));};
process.on('uncaughtException',e=>{log(e.stack);persist();app.exit(1);});
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1200,height:720,frame:true,alwaysOnTop:false,fullscreen:false,fullscreenable:false,kiosk:false,minimizable:true,movable:true,resizable:true,webPreferences:{backgroundThrottling:true}});
 for(const event of['focus','blur','minimize','restore','resize','move'])win.on(event,()=>events.push({variant,event,time:Date.now()}));
 const debug=win.webContents.debugger,sessions=new Map();debug.attach('1.3');await debug.sendCommand('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
 debug.on('message',(_e,m,p)=>{if(m==='Target.attachedToTarget')sessions.set(p.sessionId,p.targetInfo);if(m==='Target.detachedFromTarget')sessions.delete(p.sessionId);});
 const states=setInterval(()=>{if(!win.isDestroyed())conditions.push({variant,time:Date.now(),focused:win.isFocused(),minimized:win.isMinimized(),onBattery:powerMonitor.isOnBatteryPower(),bounds:win.getContentBounds(),scaleFactor:screen.getDisplayMatching(win.getBounds()).scaleFactor});},500);
 let sampling=false;const heapTimer=setInterval(async()=>{if(sampling||win.isDestroyed())return;sampling=true;try{for(const[id,t]of[['',{type:'page'}],...sessions]){const h=await debug.sendCommand('Runtime.getHeapUsage',{},id||undefined).catch(()=>null);if(h)heaps.push({variant,time:Date.now(),type:t.type,...h});}}finally{sampling=false;}},10000);
 win.webContents.on('console-message',(_,...args)=>log(JSON.stringify({variant,args})));
 win.webContents.on('render-process-gone',(_,d)=>{log(JSON.stringify(d));persist();app.exit(1);});
 win.on('closed',()=>{clearInterval(states);clearInterval(heapTimer);persist();if(!finished)app.exit(2);});
 for(const event of ['on-ac','on-battery'])powerMonitor.on(event,()=>events.push({variant,event,time:Date.now()}));win.show();
 for(const[which,port]of(process.argv.includes('--candidate-only')?[['final21',5271]]:[['before21',5270],['after21',5271]])){
  variant=which;const started=Date.now();
  while(true){try{if((await net.fetch(`http://127.0.0.1:${port}/scripts/performance-preload.html`)).ok)break;}catch{}if(Date.now()-started>30000)throw Error('Preview server unavailable');await new Promise(r=>setTimeout(r,200));}
  await new Promise((resolve,reject)=>{
   const handler=async(_,title)=>{try{
    if(title.startsWith('PRELOAD:SHOT:')||title.startsWith('PRELOAD:DRIVE:')){const shot=await win.webContents.capturePage();fs.writeFileSync(output+'/'+which+'-'+title.split(':')[1].toLowerCase()+'.png',shot.toPNG());}
    if(title==='PRELOAD:DONE'||title==='PRELOAD:ERROR'){win.webContents.off('page-title-updated',handler);if(title==='PRELOAD:ERROR')reject(Error(which+' failed'));else resolve();}
   }catch(e){reject(e);}};
   win.webContents.on('page-title-updated',handler);
   win.loadURL(`http://127.0.0.1:${port}/scripts/performance-preload.html?variant=${which}&regionalSpawn=preload-profile&final=1&timing=1`).then(async()=>{
    const h=await debug.sendCommand('Runtime.evaluate',{expression:'({origin:performance.timeOrigin,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,focus:document.hasFocus(),visible:document.visibilityState})',returnByValue:true});
    fs.writeFileSync(output+'/'+which+'-presentation.json',JSON.stringify({nativeAt:Date.now(),...h.result.value},null,2));
   },reject);
  });persist();
 }
 finished=true;win.close();app.quit();
}).catch(e=>{log(e.stack);persist();app.exit(1);});
setTimeout(()=>{log('Unified comparison timeout');persist();app.exit(3);},600000).unref();
