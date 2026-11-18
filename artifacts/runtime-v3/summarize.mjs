import fs from 'node:fs';
const dir='artifacts/runtime-v3/',read=name=>JSON.parse(fs.readFileSync(dir+name+'.json','utf8').replace(/^\uFEFF/,''));
const stats=values=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y),at=p=>a[Math.max(0,Math.ceil(a.length*p)-1)]??null;return{n:a.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};};
const result={};
for(const variant of ['phase21','phase3']){
 const r=read(variant+'-cold-day'),t=read(variant+'-cold-day-runtime'),n=read(variant+'-native'),p=read(variant+'-presentation'),exit=read(variant+'-day-release');
 const from=p.origin+r.clickAt,drive=p.origin+r.driveAt,to=drive+r.conditions.durationMs;
 const conditions=n.conditions.filter(x=>x.time>=from&&x.time<=to),events=n.events.filter(x=>x.time>=from&&x.time<=to),cpu=t.frames.filter(x=>x.driving&&x.time<=r.driveAt+r.conditions.durationMs),runtime=n.runtime.filter(x=>x.phase==='driving'&&x.time>=r.driveAt&&x.time<=r.driveAt+r.conditions.durationMs);
 const drivingHeaps=n.heaps.filter(x=>x.time>=drive&&x.time<=to),kind=x=>x.type==='page'?'page':x.url.includes('RenderWorld')||x.title.includes('RenderWorld')?'renderWorker':'visualWorker';
 result[variant]={valid:conditions.length>0&&conditions.every(x=>x.focused&&!x.minimized)&&new Set(conditions.map(x=>x.battery)).size===1&&!events.some(x=>['blur','minimize','on-ac','on-battery','resize'].includes(x.event)),conditions:{...r.conditions,powerPlan:n.plan,onBattery:[...new Set(conditions.map(x=>x.battery))],bounds:[...new Set(conditions.map(x=>x.bounds.width+'x'+x.bounds.height+'@'+x.dpr))],samples:conditions.length,events},
 loadingMs:r.loadMs,loadingRAF:stats(r.loadingFrames),raf:stats(r.rows.map(x=>x.dt)),slow:Object.fromEntries([33,50,100].map(threshold=>['over'+threshold,r.rows.filter(x=>x.dt>threshold).length])),
 slowRows:r.rows.filter(x=>x.dt>33).map(x=>({elapsed:x.elapsed,dt:x.dt,sector:x.sector,phase:x.phase,steps:x.physicsSteps,uploadBytes:x.gl.uploadBytes??0})),
 gpu:stats(r.frameTiming.gpuSamples.map(x=>x.gpuMs)),gpuScope:'EXT_disjoint_timer_query_webgl2 around game.frame; includes command supply gaps, not pure GPU busy time',
 cpu:Object.fromEntries(['cpuMs','scene','render','simulation','streaming','assets','background','maintenance'].map(key=>[key,stats(cpu.map(x=>x[key]))])),
 calls:stats(r.rows.map(x=>x.draws.calls)),shadowCalls:stats(r.rows.map(x=>x.draws.shadowCalls)),triangles:stats(r.rows.map(x=>x.draws.triangles)),geometry:stats(cpu.map(x=>x.geometries)),textures:stats(cpu.map(x=>x.textures)),heapPeakMiB:Math.max(...r.rows.map(x=>x.heap))/1048576,glBufferPeakMiB:r.gpu.bufferPeak/1048576,gl:r.gpu,
 cdp:Object.fromEntries(['page','visualWorker','renderWorker'].map(type=>[type,{heapMiB:stats(drivingHeaps.filter(x=>kind(x)===type).map(x=>x.usedSize/1048576)),backingMiB:stats(drivingHeaps.filter(x=>kind(x)===type).map(x=>x.backingStorageSize/1048576))}])),
 worker:runtime.length?Object.fromEntries(['cpuMs','roundTripMs','queueMessageAndMainWaitMs','applyMs'].map(key=>[key,stats(runtime.map(x=>x.world?.jobs?.[key]))])):null,
 graph:runtime.length?{last:runtime.at(-1)?.graph,passes:Object.fromEntries(['world.visibility','additional.views','main.composite','hud.composite'].map(pass=>[pass,stats(runtime.map(x=>x.graph?.passes.find(p=>p.name===pass)?.cpuMs))]))}:null,
 world:r.resources.worldRendering,workerJobs:r.resources.worker?.jobs,route:{station:r.rows.at(-1).station,sectors:[...new Set(r.rows.map(x=>x.sector))],maxKph:Math.max(...r.rows.map(x=>x.speed))*3.6,turnFinished:r.turnFinished},
 lifecycle:{released:exit.state.resourcesReleased,glBufferBytes:exit.gpu.bufferBytes,world:exit.state.worldRendering,recipeBytes:exit.state.cachedRoadBytes+exit.state.terrainCacheBytes,errors:exit.errors},errors:r.errors};
}
const a=result.phase21,b=result.phase3;
const commonFrom=Math.max(...['phase21','phase3'].map(v=>{const r=read(v+'-cold-day'),t=read(v+'-cold-day-runtime');return t.frames[0].time-r.driveAt;}));
for(const variant of ['phase21','phase3']){
 const r=read(variant+'-cold-day'),t=read(variant+'-cold-day-runtime'),frames=t.frames.filter(x=>x.driving&&x.time-r.driveAt>=commonFrom&&x.time-r.driveAt<=60000);
 result[variant].cpuWindow={fromMs:commonFrom,toMs:60000,reason:'4096-frame RuntimePerformance ring overwrites earlier CPU rows at high FPS; compare identical retained time range'};
 result[variant].commonCpu=Object.fromEntries(['cpuMs','scene','render','simulation','streaming','assets','background','maintenance'].map(key=>[key,stats(frames.map(x=>x[key]))]));
 result[variant].fullDriveSlowGameFrames=r.frameTiming.cpuSlow.filter(x=>x.start>=r.driveAt&&x.start<=r.driveAt+60000).sort((a,b)=>b.cpuMs-a.cpuMs).slice(0,10);
 result[variant].longAnimationFrames=r.loaf.filter(x=>x.startTime>=r.driveAt&&x.startTime<r.driveAt+60000).sort((a,b)=>b.duration-a.duration).slice(0,10);
}
result.comparable=a.valid&&b.valid&&['width','height','dpr','rain','physicsHz','mapVersion','vehicle','durationMs','spawn','powerPlan'].every(key=>JSON.stringify(a.conditions[key])===JSON.stringify(b.conditions[key]))&&JSON.stringify(a.conditions.onBattery)===JSON.stringify(b.conditions.onBattery)&&JSON.stringify(a.conditions.bounds)===JSON.stringify(b.conditions.bounds);
fs.writeFileSync(dir+'comparison.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(Object.fromEntries(['phase21','phase3'].map(v=>{const x=result[v];return[v,{valid:x.valid,conditions:x.conditions,loadingMs:x.loadingMs,raf:x.raf,slow:x.slow,gpu:x.gpu,cpuWindow:x.cpuWindow,cpu:x.commonCpu,calls:x.calls,triangles:x.triangles,geometry:x.geometry,textures:x.textures,heapMiB:x.heapPeakMiB,glMiB:x.glBufferPeakMiB,worker:x.worker,cdp:x.cdp,route:x.route,lifecycle:x.lifecycle,errors:x.errors}];})),null,2));
console.log('Comparable:',result.comparable);
