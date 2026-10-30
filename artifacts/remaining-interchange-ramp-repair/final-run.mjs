import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const dir='artifacts/remaining-interchange-ramp-repair/',inv=JSON.parse(fs.readFileSync(dir+'interchange-inventory.json','utf8'));
function run(args,file){const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:12*1024*1024});fs.writeFileSync(dir+file,result.stdout+result.stderr);if(result.status!==0){console.error(JSON.stringify({args,error:result.stderr.slice(-1500)}));process.exit(result.status??1);}}
for(const c of inv.clusters){run([dir+'run.mjs','facilities','--cluster',c.id],'clusters/'+c.file+'-final-facilities.log');fs.writeFileSync(dir+'final-progress.json',JSON.stringify({phase:'facilities',cluster:c.id})+'\n');}
run([dir+'run.mjs','prepare-final'],'prepare-final.log');
run([dir+'run.mjs','validate'],'final-geometry.log');
for(const c of inv.clusters){run([dir+'replay.mjs','--cluster',c.id,'--ramps'],'clusters/'+c.file+'-final-replay.log');fs.writeFileSync(dir+'final-progress.json',JSON.stringify({phase:'replay',cluster:c.id})+'\n');}
run([dir+'run.mjs','central-regression'],'central-regression.log');
run([dir+'replay.mjs','--central'],'central-regression-replay.log');
run([dir+'run.mjs','ns-wall-validation'],'ns-wall-validation.log');
fs.writeFileSync(dir+'final-progress.json',JSON.stringify({phase:'targeted-complete',at:new Date().toISOString()})+'\n');
