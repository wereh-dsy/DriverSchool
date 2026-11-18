import { readFileSync, writeFileSync } from 'node:fs';
const read = name => JSON.parse(readFileSync(new URL(name+'.json',import.meta.url)));
const summary = values => {
  const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const at=p=>rows[Math.max(0,Math.ceil(rows.length*p)-1)]??null;
  return { n:rows.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1) };
};
const result={};
for(const variant of ['before','after','final']){
  const data=read(variant+'-cold-day');
  const entry={
    draws:Object.fromEntries(['calls','shadowCalls','backgroundCalls'].map(key=>[key,summary(data.rows.map(row=>row.draws[key]))])),
    // The preliminary candidate used cumulative renderer.info counters. Its
    // triangle tally is excluded. Baseline and final use per-render deltas.
    triangles:variant==='after'?null:summary(data.rows.map(row=>row.draws.triangles)),
    sectors:summary(data.rows.map(row=>Number(row.sector?.split(',')[0]))),
  };
  if(variant!=='before'){
    const runtime=read(variant+'-cold-day-runtime'),driving=runtime.frames.filter(row=>row.driving);
    entry.runtime={
      samples:driving.length,historyCapacity:runtime.capacity,jobs:runtime.jobs,
      phases:Object.fromEntries(['cpuMs','simulation','scene','render','streaming','assets','maintenance','debtMs','steps'].map(key=>[key,summary(driving.map(row=>row[key]))])),
      gpu:summary(runtime.gpu.map(row=>row.gpuMs)),
      renderCounters:variant==='final'?Object.fromEntries(['viewCalls','shadowCalls','backgroundCalls','visibleObjects','geometries','textures','programs'].map(key=>[key,summary(driving.map(row=>row[key]))])):null,
      stillQueued:runtime.queued,
      slowFramesOver100:runtime.slowFrames.filter(row=>row.rafMs>100),
      atomicMaxMs:Math.max(0,...runtime.atomicCosts.map(row=>row.ms)),
    };
  }
  result[variant]=entry;
}
writeFileSync(new URL('runtime-comparison.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
for(const [name,entry]of Object.entries(result))console.log(name,entry.draws,entry.runtime?.phases,entry.runtime?.renderCounters);
