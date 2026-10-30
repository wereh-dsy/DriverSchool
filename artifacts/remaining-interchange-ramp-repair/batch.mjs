import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const dir='artifacts/remaining-interchange-ramp-repair/',inv=JSON.parse(fs.readFileSync(dir+'interchange-inventory.json','utf8'));
const start=process.argv.indexOf('--from'),from=start<0?0:inv.clusters.findIndex(c=>c.id===process.argv[start+1]);
for(const c of inv.clusters.slice(from)){
 for(const phase of ['repair','facilities','replay']){
  const file=dir+'clusters/'+c.file+'-'+phase+'.log';
  const args=phase==='replay'?[dir+'replay.mjs','--cluster',c.id,'--resume']:[dir+'run.mjs',phase,'--cluster',c.id];
  const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});fs.writeFileSync(file,result.stdout+result.stderr);if(result.status!==0){console.error(JSON.stringify({cluster:c.id,phase,exit:result.status,error:result.stderr.slice(-1000)}));process.exit(result.status??1);}
 }
 const rows=JSON.parse(fs.readFileSync(dir+c.file+'-replay.json','utf8')).rows,failures=rows.filter(r=>!r.skipped&&(!r.completed||!r.targetOwnershipReached||r.collisionTicks||r.rejectedSamples||r.allAirTicks||r.mechanicalImpulse||r.safetyInterventions||r.zeroCandidateSamples));
 console.log(JSON.stringify({cluster:c.id,replays:rows.length,failures:failures.map(r=>({ramp:r.rampId,end:r.end,completed:r.completed,target:r.targetOwnershipReached,collision:r.collisionTicks,rejection:r.rejectedSamples,air:r.allAirTicks,impulse:r.mechanicalImpulse,tracking:r.maxTrackingError}))}));
 // Persist local results before continuing; failures remain explicitly unresolved, never counted as PASS.
 fs.writeFileSync(dir+'clusters/'+c.file+'-checkpoint.json',JSON.stringify({cluster:c.id,localChecksComplete:true,replayFailures:failures.map(r=>({rampId:r.rampId,end:r.end,file:r.file})),at:new Date().toISOString()},null,2)+'\n');
}
