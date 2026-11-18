const{app,BrowserWindow,screen,net,powerMonitor}=require('electron'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const variant=process.argv.includes('--baseline')?'phase21':'phase3',port=variant==='phase21'?5280:5281,out=path.resolve('artifacts/runtime-v3'),conditions=[],events=[],heaps=[],runtime=[];let win,finished=false;
const plan=String(execFileSync('powercfg',['/GETACTIVESCHEME'])).match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i)?.[0]??'unknown';
app.setPath('userData',path.resolve('.tmp-runtime3-'+variant));process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
const persist=()=>fs.writeFileSync(out+'/'+variant+'-native.json',JSON.stringify({variant,plan,conditions,events,heaps,runtime},null,2));
process.on('uncaughtException',error=>{fs.writeFileSync(out+'/'+variant+'-runner-error.txt',error.stack);persist();app.exit(1);});
app.whenReady().then(async()=>{
 const power={battery:powerMonitor.isOnBatteryPower(),plan};
 if(variant==='phase21')fs.writeFileSync(out+'/comparison-power.json',JSON.stringify(power));else if(JSON.stringify(power)!==fs.readFileSync(out+'/comparison-power.json','utf8'))throw Error('Power condition changed between runs');
 win=new BrowserWindow({show:false,width:1200,height:720,frame:true,alwaysOnTop:false,fullscreen:false,kiosk:false,minimizable:true,movable:true,resizable:true,webPreferences:{backgroundThrottling:true}});
 for(const event of ['focus','blur','minimize','restore','resize','move'])win.on(event,()=>events.push({event,time:Date.now()}));
 for(const event of ['on-ac','on-battery'])powerMonitor.on(event,()=>events.push({event,time:Date.now()}));
 const debug=win.webContents.debugger,sessions=new Map();debug.attach('1.3');await debug.sendCommand('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
 debug.on('message',(_event,method,p)=>{if(method==='Target.attachedToTarget')sessions.set(p.sessionId,p.targetInfo);if(method==='Target.detachedFromTarget')sessions.delete(p.sessionId);});
 let sampleRunning=false;
 const timer=setInterval(async()=>{if(win.isDestroyed()||sampleRunning)return;sampleRunning=true;try{
  conditions.push({time:Date.now(),focused:win.isFocused(),minimized:win.isMinimized(),battery:powerMonitor.isOnBatteryPower(),bounds:win.getContentBounds(),dpr:screen.getDisplayMatching(win.getBounds()).scaleFactor});
  const result=await debug.sendCommand('Runtime.evaluate',{expression:'(()=>{const g=window.__preloadApp?.game;return g?{time:performance.now(),phase:window.__preloadApp.ui.state.screen,graph:g.renderGraph?.state,world:g.ground?.sectors?.visualStatistics?.worldRendering?.renderWorld}:null;})()',returnByValue:true});if(result.result?.value)runtime.push(result.result.value);
 }finally{sampleRunning=false;}},500);
 let heapBusy=false;const heapTimer=setInterval(async()=>{if(win.isDestroyed()||heapBusy)return;heapBusy=true;try{for(const[id,target]of[['',{type:'page',url:'main'}],...sessions]){const usage=await debug.sendCommand('Runtime.getHeapUsage',{},id||undefined).catch(()=>null);if(usage)heaps.push({time:Date.now(),type:target.type,url:target.url,title:target.title,...usage});}}finally{heapBusy=false;}},10000);
 win.webContents.on('console-message',(_,...args)=>fs.appendFileSync(out+'/'+variant+'-console.log',JSON.stringify(args)+'\n'));
 win.webContents.on('render-process-gone',(_,details)=>{fs.writeFileSync(out+'/'+variant+'-process-error.json',JSON.stringify(details));persist();app.exit(2);});
 win.on('closed',()=>{clearInterval(timer);clearInterval(heapTimer);persist();if(!finished)app.exit(2);});
 await net.fetch(`http://127.0.0.1:${port}/scripts/performance-preload.html`);
 win.webContents.on('page-title-updated',async(_,title)=>{
  if(title.startsWith('PRELOAD:SHOT:')||title.startsWith('PRELOAD:DRIVE:'))fs.writeFileSync(out+'/'+variant+'-'+title.split(':')[1].toLowerCase()+'.png',(await win.webContents.capturePage()).toPNG());
  if(title==='PRELOAD:DONE'||title==='PRELOAD:ERROR'){finished=true;persist();win.close();app.exit(title==='PRELOAD:DONE'?0:1);}
 });
 win.show();await win.loadURL(`http://127.0.0.1:${port}/scripts/performance-preload.html?variant=${variant}&regionalSpawn=preload-profile&final=1&timing=1`);
 const presentation=await debug.sendCommand('Runtime.evaluate',{expression:'({origin:performance.timeOrigin,width:innerWidth,height:innerHeight,dpr:devicePixelRatio})',returnByValue:true});fs.writeFileSync(out+'/'+variant+'-presentation.json',JSON.stringify(presentation.result.value));
 setTimeout(()=>{persist();win.destroy();app.exit(3);},300000).unref();
}).catch(error=>{fs.writeFileSync(out+'/'+variant+'-runner-error.txt',error.stack);persist();app.exit(1);});
