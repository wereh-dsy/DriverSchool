import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';
const root=process.cwd(), changed=new Set(execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split('\n'));
function installRuntimeProbe(g) {
  const panel=document.createElement('section');panel.style.cssText='position:fixed;left:8px;top:8px;z-index:100000;background:#000d;color:#9ef;font:11px monospace;padding:8px;max-height:28vh;overflow:auto;max-width:500px';
  panel.innerHTML='<button id="probe-start">开始性能对照</button><button id="probe-stop">停止</button><pre id="probe-output">等待进入练习场</pre>';
  document.body.append(panel);const out=panel.querySelector('pre');
  let active=null,prepare=null,rows=[],queue=[],stopped=false,frameCosts={},last=0,fixture=null;
  const fixturePanel=document.createElement('div');fixturePanel.innerHTML='<pre id="mirror-state"></pre>';panel.append(fixturePanel);
  const passCounts={left:0,right:0,interior:0},originalRender=g.renderer.render;
  g.renderer.render=function(scene,camera){if(camera===g.mirrors.getView('left').camera)passCounts.left++;if(camera===g.mirrors.getView('right').camera)passCounts.right++;if(camera===g.mirrors.interiorMirror?.camera)passCounts.interior++;return originalRender.call(this,scene,camera);};
  const metric={};
  const wrap=(o,k,label)=>{if(!o||typeof o[k]!=='function')return;const f=o[k];o[k]=function(...a){if(!active||performance.now()-active.start<3000)return f.apply(this,a);const t=performance.now(),r=f.apply(this,a),d=performance.now()-t,m=metric[label]||(metric[label]={calls:0,total:0,max:0});m.calls++;m.total+=d;m.max=Math.max(m.max,d);frameCosts[label]=(frameCosts[label]||0)+d;return r;};};
  wrap(g.contacts,'step','physics');wrap(g.dynamics,'getSnapshot','snapshot');wrap(g.ground,'updatePlayerPosition','streaming');
  wrap(g.ground.sectors,'compileRoad','roadCompile');wrap(g.ground.sectors,'receiveRoad','roadInstall');
  wrap(g.ground.sectors,'load','sectorLoad');wrap(g.environmentVisual,'setGround','environment');wrap(g,'updateVehicleVisual','visual');
  wrap(g.mirrors,'render','mirrors');wrap(g.mirrors,'renderAdaptive','adaptiveMirrors');wrap(g.hud,'update','hud');
  wrap(g.renderer,'render','render');wrap(g,'storeCurrentFuel','storage');
  wrap(g.ground.sectors.signRenderer,'materialFor','signMaterial');wrap(g.renderer,'initTexture','textureUpload');
  wrap(g.ground.sectors.intersectionBuilder,'build','junctionBuild');wrap(g.ground.sectors.prefabs,'buildInstances','prefabBuild');
  wrap(g.ground.sectors,'mergeSurface','surfaceMerge');wrap(g.ground.sectors.terrain,'fromCompiled','terrainInstall');wrap(g.ground.sectors.backgroundBatches,'append','backgroundInstall');
  const oldFrame=g.frame, graph=g.ground.roadNetwork, solids=g.ground.colliders;
  const stats=a=>{a.sort((x,y)=>x-y);return {n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over33:a.filter(x=>x>33).length,over50:a.filter(x=>x>50).length,over100:a.filter(x=>x>100).length};};
  g.frame=time=>{
    const dt=last?time-last:0;last=time;for(const k in frameCosts)frameCosts[k]=0;passCounts.left=passCounts.right=passCounts.interior=0;
    const t=performance.now();oldFrame(time);const cpu=performance.now()-t;
    if(fixture)fixturePanel.querySelector('pre').textContent=JSON.stringify({fixture,speed:g.snapshot.speed*3.6,selector:g.snapshot.transmission.selectedMode,head:g.driverCamera.getHeadLook(),context:g.mirrorContext,mask:g.mirrors.adaptive?.renderMask,overlay:g.mirrors.adaptive?.showRightOverlay,overlayHidden:document.querySelector('.mirror-pod').hidden,passes:passCounts});
    if(prepare){if(g.ground.sectors.ready && !g.ground.sectors.publications?.size && !g.ground.sectors.backgroundPending.length){const c=prepare;prepare=null;launch(c);}else if(time-prepare.wait>240000){out.textContent=JSON.stringify({state:'PREPARE_TIMEOUT',case:prepare,rows,error:String(g.ground.visualLoadingError)});prepare=null;queue=[];}}
    if(active){
      const sec=(time-active.start)/1000;
      if(sec>=3){active.frame.push(dt);active.cpu.push(cpu);active.speed.push(Math.abs(g.snapshot.speed)*3.6);if(dt>33||cpu>25)active.peaks.push({t:sec,frame:dt,cpu,cost:{...frameCosts}});}
      if(sec-active.memoryAt>=.5){active.memoryAt=sec;const h=performance.memory?.usedJSHeapSize;if(h)active.memory.push(h);}
      if(sec>=15){
        const a=active;active=null;
        const m={};for(const [k,v]of Object.entries(metric)){m[k]={...v,mean:v.total/v.calls};delete metric[k];}
        const mirrors=g.mirrors.adaptive;
        const row={name:a.name,frame:stats(a.frame),cpu:stats(a.cpu),speed:stats(a.speed),metric:m,heap:a.memory.length?[Math.min(...a.memory),Math.max(...a.memory)]:null,
          peaks:a.peaks.sort((x,y)=>y.cpu-x.cpu).slice(0,8),graphStable:g.ground.roadNetwork===graph,collidersStable:g.ground.colliders===solids,
          collisions:g.contacts.collision?.collided,selector:g.snapshot.transmission.selectedMode,operational:g.snapshot.vehicleOperational,
          viewport:[innerWidth,innerHeight],visibility:document.visibilityState,mirrors:mirrors?{mask:mirrors.renderMask,overlay:mirrors.showRightOverlay}:null,resources:g.ground.sectors.loadStatistics};
        rows.push(row);fetch('/result/'+(location.pathname.includes('before')?'before':'after'),{method:'POST',body:JSON.stringify(rows)});out.textContent=JSON.stringify({state:'RESULT',rows},null,2);console.log('PROBE_RESULT '+JSON.stringify(row));g.cruiseControl.reset();if(!stopped)setTimeout(next,300);
      }
    }
  };
  const origin=c=>{
    if(c.place==='complex'){return {x:6048,z:-341.375,y:18,yaw:-Math.PI/2};}
    const road=g.ground.roadNetwork.segments.find(r=>r.id==='ring-cw-0-split-split'),p=road.centerline[230],q=road.centerline[231];return {x:p.x,z:p.z,y:p.y||0,yaw:Math.atan2(p.x-q.x,p.z-q.z)};
  };
  const reset=(c,speed)=>{const p=origin(c);g.ground.spawnPose.position.set(p.x,p.y+.04,p.z);g.ground.setSurfaceReferenceHeight(p.y);g.contacts.reset();g.snapshot=g.dynamics.reset({x:p.x,z:p.z,yaw:p.yaw,speed:speed/3.6,gear:8,driveSelector:speed?'D':'P',engineRunning:true,vehicleOperational:true,engineRPM:speed>100?3500:800,clutchEngagement:1});g.feedback.reset(g.snapshot);g.accumulator=0;g.sharedVehicleData?.resetLanes();g.lateralAssist.reset();g.cruiseControl.reset();};
  const launch=c=>{
    fixture=null;
    reset(c,140);g.lateralAssist.setPreferences(true,true);
    const input={...g.input.peekState(),throttle:0,brake:0,handbrake:0,steering:0,cruiseToggle:true};
    g.cruiseControl.update(1/120,input,{available:true,speedMetersPerSecond:140/3.6,engineRunning:true,currentThrottle:.15,driverThrottleCommand:0,torqueLimitFactor:1,parkingBrakeActive:false,autoHoldHolding:false,gear:8,driveSelector:'D'});
    active={name:c.name,start:performance.now(),frame:[],cpu:[],speed:[],peaks:[],memory:[],memoryAt:0};out.textContent=JSON.stringify({state:'RUNNING',case:c,rows},null,2);
  };
  const next=()=>{if(stopped||!queue.length){out.textContent=JSON.stringify({state:'DONE',rows},null,2);return;}const c=queue.shift();if(c.warm){reset(c,0);prepare={...c,wait:performance.now()};out.textContent=JSON.stringify({state:'PREPARING',case:c,rows},null,2);}else launch(c);};
  panel.querySelector('#probe-start').onclick=()=>{if(active||prepare)return;if(!g.gameStarted||!g.vehicleLoading.ready||g.groundVisualLoading){out.textContent='等待车辆/场地准备好并进入练习场';return;}stopped=false;queue=[{name:'straight-cold',place:'straight'},{name:'straight-warm',place:'straight',warm:true},{name:'complex-cold',place:'complex'},{name:'complex-warm',place:'complex',warm:true}];next();};
  panel.querySelector('#probe-stop').onclick=()=>{stopped=true;active=prepare=null;queue=[];g.cruiseControl.reset();out.textContent=JSON.stringify({state:'STOPPED',rows},null,2);};
  for(const name of ['高速常态','高速向右观察','高速右转向灯','29 km/h','31 km/h','倒车','城市低速']){const button=document.createElement('button');button.textContent=name;fixturePanel.append(button);button.onclick=()=>{
    stopped=true;active=prepare=null;queue=[];fixture=name;g.driverCamera.resetHeadLook(true);g.lightController.reset();
    reset({place:'straight'},name==='29 km/h'?29:name==='31 km/h'?31:name==='倒车'?0:name==='城市低速'?20:140);
    if(name==='倒车'){g.snapshot=g.dynamics.reset({x:g.snapshot.x,z:g.snapshot.z,yaw:g.snapshot.yaw,speed:0,gear:'R',driveSelector:'R',engineRunning:true,vehicleOperational:true,engineRPM:800,clutchEngagement:1});}
    if(name==='高速向右观察')g.driverCamera.setHeadLook(-.9,0);
    if(name==='高速右转向灯')g.lightController.update(0,{...g.input.peekState(),rightIndicator:true},{ignitionOn:true,actualGear:8,steeringWheelAngle:0});
    if(name==='城市低速')g.switchGround('city-alpha');
  };}
}
const bundles={};
for(const version of ['before','after']){
  const result=await esbuild.build({entryPoints:['src/main.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',define:{'import.meta.env':'{"DEV":false,"PROD":true,"MODE":"production"}'},logLevel:'silent',plugins:[{name:'probe',setup(b){b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));b.onLoad({filter:/\.ts$/},a=>{
    const relative=path.relative(root,a.path).replaceAll('\\','/');
    let contents=version==='before'&&changed.has(relative)?execFileSync('git',['show','HEAD:'+relative],{encoding:'utf8',maxBuffer:30e6}):fs.readFileSync(a.path,'utf8');
    if(relative==='src/main.ts')contents=contents.replace('  game.start();','  installRuntimeProbe(game);\n  game.start();')+'\n'+installRuntimeProbe.toString();
    return {contents,loader:'ts',resolveDir:path.dirname(a.path)};
  });}}]});
  bundles[version]=result.outputFiles[0].contents;
}
const worker=await esbuild.build({entryPoints:['src/world/city/VisualStreaming.worker.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
http.createServer((req,res)=>{
  if(req.url.startsWith('/result/')){let body='';req.on('data',d=>body+=d);req.on('end',()=>{const version=req.url.endsWith('before')?'before':'after';const rows=JSON.parse(body);fs.mkdirSync('artifacts/runtime-hitch-2026-10-13',{recursive:true});fs.writeFileSync('artifacts/runtime-hitch-2026-10-13/'+version+'.json',JSON.stringify({version,baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mirrorPolicy:version==='before'?'original all mirrors every frame; overlay always visible':'every-visible-frame; overlay below30-or-R',rows},null,2));res.end('saved');});return;}
  const p=req.url.split('?')[0],version=p.startsWith('/before/')?'before':'after';res.setHeader('Cache-Control','no-store');
  if(p.endsWith('runtime.js')){res.setHeader('Content-Type','text/javascript');res.end(bundles[version]);}
  else if(p.endsWith('VisualStreaming.worker.ts')){res.setHeader('Content-Type','text/javascript');res.end(worker.outputFiles[0].contents);}
  else if(p.endsWith('styles.css')){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync('src/styles.css'));}
  else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>DriverGame '+version+' performance</title><link rel="stylesheet" href="styles.css"><body><script>const orig=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k==="drivergame.vehicle-id.v1"?"bmw-530li-g38":orig.call(this,k)}</script><div id="app"></div><script type="module" src="runtime.js"></script>');}
}).listen(5189,'127.0.0.1',()=>console.log('PROBE_READY /before/?city=city-main /after/?city=city-main'));
