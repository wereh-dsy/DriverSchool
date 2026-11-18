import fs from 'node:fs';
const output=new URL('./',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL(name+'.json',output)));
const stats=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>a[Math.max(0,Math.ceil(a.length*p)-1)];return{n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1)};};
const frames=values=>({...stats(values),...Object.fromEntries([33,50,100].map(limit=>['over'+limit,values.filter(x=>x>limit).length]))});
const summary={};
for(const variant of ['before','validated','accepted','highway','rain']){
 const name=variant==='rain'?'rain-night':'cold-day',r=read(variant+'-'+name),c=read(variant+'-'+name+'-completeness'),clock=read(variant+'-stall-recovery'),exit=read(variant+'-'+(variant==='rain'?'rain':'day')+'-release'),heaps=read('heaps-'+variant);
 const closestToSector=(key,rows)=>{const[sx,sz]=key.split(',').map(Number);return Math.min(...rows.map(row=>Math.hypot(Math.max(0,Math.abs((sx+.5)*500-row.x)-250),Math.max(0,Math.abs((sz+.5)*500-row.z)-250))));};
 const exposured=(c.final?.completed??[]).filter(row=>row.delayMs>0).map(row=>({key:row.key,delayMs:row.delayMs,minDistanceOnRoute:closestToSector(row.key,r.rows)}));
 summary[variant]={conditions:r.conditions,loadingMs:r.loadMs,loading:frames(r.loadingFrames),driving:frames(r.rows.map(x=>x.dt)),
   mainPerformanceMemoryMiB:stats(r.rows.map(x=>x.heap/1048576)),cdpHeaps:Object.fromEntries([...new Set(heaps.map(x=>x.type))].map(type=>[type,{usedMiB:stats(heaps.filter(x=>x.type===type).map(x=>x.usedSize/1048576)),backingMiB:stats(heaps.filter(x=>x.type===type).map(x=>x.backingStorageSize/1048576))}])),
   gpuExecutionMs:stats(r.frameTiming.gpuSamples.map(x=>x.gpuMs)),gpuBufferPeakMiB:r.gpu.bufferPeak/1048576,
   draws:stats(r.rows.map(x=>x.draws.calls)),shadowDraws:stats(r.rows.map(x=>x.draws.shadowCalls)),triangles:stats(r.rows.map(x=>x.draws.triangles)),
   route:{maxKph:Math.max(...r.rows.map(x=>x.speed))*3.6,sectors:[...new Set(r.rows.map(x=>x.sector))],turnFinished:r.turnFinished,finalPhase:r.finalPhase,finalStation:r.rows.at(-1).station},
   regularClock:{steps:stats(r.rows.map(x=>x.physicsSteps)),debtMs:stats(r.rows.map(x=>x.debtSeconds*1000)),surrenderedMs:r.rows.reduce((sum,x)=>sum+(x.surrenderedMs||0),0)},
   artificialStall:{injected:clock.injected,maxSteps:Math.max(...clock.rows.map(x=>x.steps)),maxDebtMs:Math.max(...clock.rows.map(x=>x.debtSeconds*1000)),surrenderedMs:clock.rows.reduce((sum,x)=>sum+(x.surrenderedMs||0),0),maxConsecutiveSpeedChange:Math.max(...clock.rows.slice(1).map((x,i)=>Math.abs(x.speed-clock.rows[i].speed))),maxPoseStep:Math.max(...clock.rows.slice(1).map((x,i)=>Math.hypot(x.x-clock.rows[i].x,x.z-clock.rows[i].z)))},
   completeness:c.final?{forwardReady:c.final.forwardReady,forwardTotal:c.final.forwardTotal,remaining:c.final.incompleteVisible,exposured,
      roadCorridorSamples:c.samples.map(s=>({elapsed:s.elapsed,ready:s.forwardReady,total:s.forwardTotal})),lookahead:c.final.lookaheadMetres,latency:c.final.preparationSeconds}:null,
   worker:r.resources.worker.jobs,workerRemaining:{queued:r.resources.worker.queued,inFlight:r.resources.worker.inFlight},publication:stats(r.resources.publications.map(x=>x.maxStepMs)),
   recipes:{roadMiB:r.resources.cachedRoadBytes/1048576,terrainMiB:r.resources.terrainCacheBytes/1048576,pinnedMiB:r.resources.pinnedRoadBytes/1048576,totalBudgetMiB:r.resources.recipeBudgetBytes/1048576},
   resourcesReleased:exit.state.resourcesReleased,releaseGpuBytes:exit.gpu.bufferBytes,releaseRecipes:exit.state.cachedRoadBytes+exit.state.terrainCacheBytes,errors:[...r.errors,...exit.errors]};
}
fs.writeFileSync(new URL('final-summary.json',output),JSON.stringify(summary,null,2));
for(const[key,value]of Object.entries(summary))console.log(key,{frames:value.driving,heap:value.mainPerformanceMemoryMiB.max,gpu:value.gpuBufferPeakMiB,draw95:value.draws.p95,artificialStall:value.artificialStall,remaining:value.completeness?.remaining,release:value.resourcesReleased});
