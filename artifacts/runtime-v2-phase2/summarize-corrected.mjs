import fs from 'node:fs';
const dir=new URL('./',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL(name+'.json',dir)));
const stats=values=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y),at=p=>a[Math.max(0,Math.ceil(p*a.length)-1)]??null;return{n:a.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};};
const frames=values=>({...stats(values),...Object.fromEntries([33,50,100].map(n=>['over'+n,values.filter(x=>x>n).length]))});
const pairs=['before','corrected'].map(name=>({name,r:read(name+'-cold-day'),t:read(name+'-cold-day-runtime')}));
const start=Math.max(...pairs.map(({r,t})=>t.frames[0].time-r.driveAt));
const result={datasets:{before:'Valid Phase 1.5 source snapshot, original foreground window.',corrected:'Geometry-correct candidate, ordinary inactive window, no topmost/focus forcing.',excluded:['occluded-before: timer occlusion invalidates RAF comparison','cancelled-after: user closed the window','after/final/highway/rain: superseded by corrected model-part anchors; not accepted final performance/lighting evidence'],presentationWarning:'Window presentation conditions differ. RAF distributions cannot establish a controlled performance win. CPU spans and sparse GPU queries are separate measurements, not display presentation time.'}};
for(const{name,r,t}of pairs){
 const exit=read(name+'-day-release'),heaps=read('heaps-'+name).filter(x=>x.case==='cold-day'),common=t.frames.filter(f=>f.time-r.driveAt>=start&&f.time-r.driveAt<=60000);
 result[name]={conditions:r.conditions,loadingMs:r.loadMs,loadingFrames:frames(r.loadingFrames),drivingFrames:frames(r.rows.map(x=>x.dt)),drawCalls:stats(r.rows.map(x=>x.draws.calls)),shadowCalls:stats(r.rows.map(x=>x.draws.shadowCalls)),triangles:stats(r.rows.map(x=>x.draws.triangles)),gpuExecutionMs:stats(r.frameTiming.gpuSamples.map(x=>x.gpuMs)),gpuAvailable:r.frameTiming.gpuTimerAvailable,mainHeapMiB:stats(r.rows.map(x=>x.heap/1048576)),glBufferPeakMiB:r.gpu.bufferPeak/1048576,gl:r.gpu,initialization:r.initialization,
  cdp:Object.fromEntries([...new Set(heaps.map(x=>x.type))].map(type=>[type,{heapMiB:stats(heaps.filter(x=>x.type===type).map(x=>x.usedSize/1048576)),backingMiB:stats(heaps.filter(x=>x.type===type).map(x=>x.backingStorageSize/1048576))}])),
  commonWindow:{fromMs:start,toMs:60000,cpuMs:stats(common.map(x=>x.cpuMs)),sceneMs:stats(common.map(x=>x.scene)),renderSubmissionMs:stats(common.map(x=>x.render)),backgroundMs:stats(common.map(x=>x.streaming+x.assets+x.background+x.maintenance))},
  counts:{geometries:stats(common.map(x=>x.geometries)),textures:stats(common.map(x=>x.textures)),programs:stats(common.map(x=>x.programs)),visibleObjects:stats(common.map(x=>x.visibleObjects))},
  route:{maxSpeedKph:Math.max(...r.rows.map(x=>x.speed))*3.6,sectors:[...new Set(r.rows.map(x=>x.sector))],returned:r.turnFinished,phase:r.finalPhase,turnDistance:r.turnDistance},
  overlay:{mounted:r.overlayMounted,removed:r.overlayDetachedAfterReady,monotonic:r.progress.map(x=>x.percent).filter(Number.isFinite).every((x,i,a)=>!i||x>=a[i-1])},
  resources:r.resources,warmup:r.warmup,lifecycle:{released:exit.state.resourcesReleased,glBytes:exit.gpu.bufferBytes,recipeBytes:exit.state.cachedRoadBytes+exit.state.terrainCacheBytes,registry:exit.state.worldRendering?.resources,owners:exit.state.worldRendering?.owners,errors:[...r.errors,...exit.errors]},limitations:t.limitations};
}
result.corrected.windowEvents=read('corrected-window-events');
result.validation={structures:read('corrected-world-tour').results.map(x=>({id:x.stop.id,roadId:x.stop.roadId,junctionId:x.stop.junctionId,supportHeight:x.supportHeight,expectedHeight:x.stop.y,mirrors:x.mirrors,shadow:x.shadow,loadMs:x.loadMs,owners:x.resources.worldRendering.owners,cells:x.resources.worldRendering.cells})),cache:read('corrected-cache-settle'),stall:read('corrected-stall-recovery')};
result.validation.rain=read('corrected-rain-runtime-regression');
result.validation.rainMeasurementLimit='Correctness only: overlapped the normal build. No performance comparison is claimed.';
fs.writeFileSync(new URL('comparison-corrected.json',dir),JSON.stringify(result,null,2));
for(const name of ['before','corrected']){const r=result[name];console.log(name,JSON.stringify({loadMs:r.loadingMs,loadingFrames:r.loadingFrames,frames:r.drivingFrames,calls95:r.drawCalls.p95,shadow95:r.shadowCalls.p95,triangles95:r.triangles.p95,gpu:r.gpuExecutionMs,mainHeap:r.mainHeapMiB.max,buffer:r.glBufferPeakMiB,cdp:r.cdp,cpu:r.commonWindow,counts:r.counts,workerJobs:r.resources.worker.jobs,lifecycle:r.lifecycle},null,2));}
