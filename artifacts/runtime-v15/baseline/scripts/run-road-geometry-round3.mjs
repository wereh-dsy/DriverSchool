import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir='artifacts/road-geometry-round3',exports=await readFile(`${dir}/baseline-exports.txt`,'utf8');
await build({stdin:{contents:exports,resolveDir:resolve('.')},bundle:true,platform:'node',format:'esm',outfile:'.tmp-road-round3-optimized.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'warning'});
const baseline=await import(pathToFileURL(resolve(dir,'round2-baseline.mjs')).href),profile=JSON.parse(await readFile(`${dir}/baseline-profile.json`,'utf8'));
// The whitelist is unchanged. Four old-renderer hot roads are attribution/control
// samples only, never additional new-renderer opt-ins.
const runtime=baseline.compileCityRuntimeData(JSON.parse(await readFile('src/world/regional/regional-main.json','utf8'))),ids=[...new Set([...baseline.round2Selection(runtime.map).roadIds,...profile.slowRound2.slice(0,4).map(s=>s.id.slice(5))])];
const results=[];
for(const [variant,module]of [['round2',resolve(dir,'round2-baseline.mjs')],['round3',resolve('.tmp-road-round3-optimized.mjs')]]){
 const result=await new Promise((done,fail)=>{const worker=new Worker(new URL('./road-geometry-round3-node-worker.mjs',import.meta.url),{workerData:{variant,module:pathToFileURL(module).href,ids}});let data;worker.on('message',r=>{data=r;});worker.on('error',fail);worker.on('exit',code=>code||!data?fail(new Error('Worker failed '+code)):done({...data,isolateExited:true}));});results.push(result);
}
let assertions=0;const check=(ok,message)=>{assertions++;if(!ok)throw new Error(message);};
for(let i=0;i<ids.length;i++){const a=results[0].jobs[i],b=results[1].jobs[i];check(a.geometrySHA256===b.geometrySHA256,'Final geometry differs: '+a.id);check(a.colliderSHA256===b.colliderSHA256,'Collision envelope differs: '+a.id);}
for(let i=0;i<results[0].junctions.length;i++)check(results[0].junctions[i].geometrySHA256===results[1].junctions[i].geometrySHA256,'Junction ownership/geometry differs: '+results[0].junctions[i].id);
await writeFile(`${dir}/targeted-worker-comparison.json`,JSON.stringify({assertions,ids,results},null,2)+'\n');
console.log(JSON.stringify({assertions,roads:ids.length,junctions:results[0].junctions.length,peak:results.map(r=>({variant:r.variant,peak:r.peak})),slow:results.map(r=>({variant:r.variant,jobs:r.jobs.toSorted((a,b)=>b.activeMs-a.activeMs).slice(0,4).map(j=>({id:j.id,activeMs:j.activeMs,maxStepMs:j.maxStepMs,phases:j.metrics?.phases}))}))}));
