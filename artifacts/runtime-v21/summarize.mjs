import fs from 'node:fs';
const dir='artifacts/runtime-v21/',read=n=>JSON.parse(fs.readFileSync(dir+n+'.json','utf8').replace(/^\uFEFF/,''));
const stats=v=>{const a=v.filter(Number.isFinite).sort((x,y)=>x-y),at=p=>a[Math.max(0,Math.ceil(a.length*p)-1)]??null;return{n:a.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};};
const windows=read('window-conditions'),result={};
for(const variant of ['before21','after21','final21','verified21']){
 const r=read(variant+'-cold-day'),t=read(variant+'-cold-day-runtime'),p=read((variant==='verified21'?'verified/':variant==='final21'?'final/':'')+variant+'-presentation'),exit=read(variant+'-day-release');const native=variant==='verified21'?read('verified/window-conditions'):variant==='final21'?read('final/window-conditions'):windows;
 const from=p.origin+r.clickAt,to=p.origin+r.driveAt+r.conditions.durationMs;
 const states=native.conditions.filter(x=>x.variant===variant&&x.time>=from&&x.time<=to),events=native.events.filter(x=>x.variant===variant&&x.time>=from&&x.time<=to);
 const cpu=t.frames.filter(x=>x.driving&&x.time<=r.driveAt+r.conditions.durationMs);
 result[variant]={conditions:r.conditions,loadingMs:r.loadMs,loadingFrames:stats(r.loadingFrames),raf:stats(r.rows.map(x=>x.dt)),slow:Object.fromEntries([33,50,100].map(n=>['over'+n,r.rows.filter(x=>x.dt>n).length])),
 calls:stats(r.rows.map(x=>x.draws.calls)),shadowCalls:stats(r.rows.map(x=>x.draws.shadowCalls)),triangles:stats(r.rows.map(x=>x.draws.triangles)),gpu:stats(r.frameTiming.gpuSamples.map(x=>x.gpuMs)),
 heapPeakMiB:Math.max(...r.rows.map(x=>x.heap))/1048576,glBufferMiB:r.gpu.bufferPeak/1048576,gl:r.gpu,cpu:{scene:stats(cpu.map(x=>x.scene)),render:stats(cpu.map(x=>x.render)),all:stats(cpu.map(x=>x.cpuMs))},
 geometry:stats(cpu.map(x=>x.geometries)),textures:stats(cpu.map(x=>x.textures)),programs:stats(cpu.map(x=>x.programs)),world:r.resources.worldRendering,models:r.resources.models,workerJobs:r.resources.worker.jobs,
 route:{turnFinished:r.turnFinished,turnDistance:r.turnDistance,finalPhase:r.finalPhase,maxSpeedKph:Math.max(...r.rows.map(x=>x.speed))*3.6,sectors:[...new Set(r.rows.map(x=>x.sector))]},
 presentation:{origin:p.origin,states:states.length,allFocused:states.every(x=>x.focused&&!x.minimized),batteryStates:[...new Set(states.map(x=>x.onBattery??'not recorded'))],events,bounds:[...new Set(states.map(x=>x.bounds.width+'x'+x.bounds.height+'@'+x.scaleFactor))]},
 cdp:Object.fromEntries(['page','worker'].map(type=>[type,{heapMiB:stats(native.heaps.filter(x=>x.variant===variant&&x.type===type).map(x=>x.usedSize/1048576)),backingMiB:stats(native.heaps.filter(x=>x.variant===variant&&x.type===type).map(x=>x.backingStorageSize/1048576))}])),lifecycle:{released:exit.state.resourcesReleased,gl:exit.gpu.bufferBytes,world:exit.state.worldRendering?.resources,recipeBytes:exit.state.cachedRoadBytes+exit.state.terrainCacheBytes,errors:exit.errors},errors:r.errors,warmup:r.warmup};
 console.log(variant,JSON.stringify(result[variant],null,2));
}
const start=Math.max(0,...['before21','verified21'].map(v=>{const r=read(v+'-cold-day'),t=read(v+'-cold-day-runtime');return t.frames[0].time-r.driveAt;}));
for(const v of ['before21','after21','final21','verified21']){const r=read(v+'-cold-day'),t=read(v+'-cold-day-runtime'),f=t.frames.filter(x=>x.time-r.driveAt>=start&&x.time-r.driveAt<=60000);result[v].commonCpu={fromMs:start,all:stats(f.map(x=>x.cpuMs)),scene:stats(f.map(x=>x.scene)),render:stats(f.map(x=>x.render)),assets:stats(f.map(x=>x.assets)),background:stats(f.map(x=>x.background)),maintenance:stats(f.map(x=>x.maintenance))};}
fs.writeFileSync(dir+'comparison.json',JSON.stringify(result,null,2));
