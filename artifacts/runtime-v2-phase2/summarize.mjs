import fs from 'node:fs';
const output=new URL('./',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL(name+'.json',output)));
const stats=values=>{const data=values.filter(Number.isFinite).sort((a,b)=>a-b),at=p=>data[Math.max(0,Math.ceil(data.length*p)-1)]??null;return{n:data.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};};
const frames=values=>({...stats(values),...Object.fromEntries([33,50,100].map(limit=>['over'+limit,values.filter(x=>x>limit).length]))});
const comparison={};
for(const variant of ['before','after','final','highway','rain']){
 const rain=variant==='rain',name=rain?'rain-night':'cold-day',r=read(variant+'-'+name),t=read(variant+'-'+name+'-runtime'),exit=read(variant+'-'+(rain?'rain':'day')+'-release'),heaps=read('heaps-'+variant);
 const data=t.frames.map(frame=>({...frame,elapsed:frame.time-r.driveAt})).filter(frame=>frame.elapsed>=0&&frame.elapsed<=r.conditions.durationMs);
 comparison[variant]={conditions:r.conditions,loadingMs:r.loadMs,loading:frames(r.loadingFrames),driving:frames(r.rows.map(row=>row.dt)),
  calls:stats(r.rows.map(row=>row.draws.calls)),shadowCalls:stats(r.rows.map(row=>row.draws.shadowCalls)),triangles:stats(r.rows.map(row=>row.draws.triangles)),
  gpuExecutionMs:stats(r.frameTiming.gpuSamples.map(row=>row.gpuMs)),gpuTimerSupported:r.frameTiming.gpuTimerAvailable,geometryBufferPeakMiB:r.gpu.bufferPeak/1048576,
  heapMiB:stats(r.rows.map(row=>row.heap/1048576)),cdp:Object.fromEntries([...new Set(heaps.map(row=>row.type))].map(type=>[type,{heapMiB:stats(heaps.filter(row=>row.type===type).map(row=>row.usedSize/1048576)),backingMiB:stats(heaps.filter(row=>row.type===type).map(row=>row.backingStorageSize/1048576))}])),
  resources:{geometries:stats(data.map(row=>row.geometries)),textures:stats(data.map(row=>row.textures)),programs:stats(data.map(row=>row.programs)),world:r.resources.worldRendering,background:r.resources.background,worker:r.resources.worker.jobs,publication:stats(r.resources.publications.map(row=>row.maxStepMs))},
  route:{maxSpeedKph:Math.max(...r.rows.map(row=>row.speed))*3.6,sectors:[...new Set(r.rows.map(row=>row.sector))],returned:r.turnFinished,phase:r.finalPhase},
  overlay:{mounted:r.overlayMounted,removed:r.overlayDetachedAfterReady,monotonic:r.progress.map(row=>row.percent).filter(Number.isFinite).every((percent,i,all)=>!i||percent>=all[i-1])},
  lifecycle:{released:exit.state.resourcesReleased,gpuBytes:exit.gpu.bufferBytes,recipeBytes:exit.state.cachedRoadBytes+exit.state.terrainCacheBytes,registry:exit.state.worldRendering?.resources,owners:exit.state.worldRendering?.owners,errors:[...r.errors,...exit.errors]},
  gpuLimitations:t.limitations};
}
const pair=['before','final'].map(name=>({name,r:read(name+'-cold-day'),t:read(name+'-cold-day-runtime')}));
const start=Math.max(...pair.map(({r,t})=>t.frames[0].time-r.driveAt));
for(const{name,r,t}of pair){const data=t.frames.filter(frame=>frame.time-r.driveAt>=start&&frame.time-r.driveAt<=60000);comparison[name].commonWindow={fromMs:start,toMs:60000,cpuMs:stats(data.map(row=>row.cpuMs)),sceneMs:stats(data.map(row=>row.scene)),renderSubmissionMs:stats(data.map(row=>row.render)),streamAndAssetsMs:stats(data.map(row=>row.streaming+row.assets+row.background+row.maintenance))};}
comparison.validation={structures:read('verified-structures-world-tour').results.map(result=>({id:result.stop.id,roadId:result.stop.roadId,junctionId:result.stop.junctionId,supportHeight:result.supportHeight,expectedHeight:result.stop.y,mirrors:result.mirrors,shadow:result.shadow,loadMs:result.loadMs,owners:result.resources.worldRendering.owners,cells:result.resources.worldRendering.cells})),rain:read('rain-runtime-regression'),cache:read('final-cache-settle')};
fs.writeFileSync(new URL('comparison.json',output),JSON.stringify(comparison,null,2));
for(const[name,row]of Object.entries(comparison))if(row.driving)console.log(name,{frames:row.driving,calls95:row.calls.p95,triangles95:row.triangles.p95,heap:row.heapMiB.max,gpuBuffer:row.geometryBufferPeakMiB,gpu95:row.gpuExecutionMs.p95,cpu:row.commonWindow});
