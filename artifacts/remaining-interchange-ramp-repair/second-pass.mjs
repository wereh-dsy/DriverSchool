import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const dir='artifacts/remaining-interchange-ramp-repair/',inv=JSON.parse(fs.readFileSync(dir+'interchange-inventory.json','utf8'));
function run(args,file){const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});fs.writeFileSync(dir+file,result.stdout+result.stderr);if(result.status!==0){console.error(JSON.stringify({args,error:result.stderr.slice(-1500)}));process.exit(result.status??1);}}
for(const c of inv.clusters){
 run([dir+'run.mjs','repair','--cluster',c.id],'clusters/'+c.file+'-second-repair.log');
 run([dir+'run.mjs','facilities','--cluster',c.id],'clusters/'+c.file+'-second-facilities.log');
 run([dir+'run.mjs','validate','--cluster',c.id],'clusters/'+c.file+'-second-validation.log');
 run([dir+'replay.mjs','--cluster',c.id],'clusters/'+c.file+'-second-replay.log');
 fs.writeFileSync(dir+'clusters/'+c.file+'-second-checkpoint.json',JSON.stringify({cluster:c.id,complete:true,at:new Date().toISOString()})+'\n');
}
