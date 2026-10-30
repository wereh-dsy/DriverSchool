import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const dir='artifacts/remaining-interchange-ramp-repair/',inv=JSON.parse(fs.readFileSync(dir+'interchange-inventory.json','utf8'));
for(const c of inv.clusters){const result=spawnSync(process.execPath,[dir+'replay.mjs','--cluster',c.id,'--ramps','--resume'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});fs.writeFileSync(dir+'clusters/'+c.file+'-replay-v2.log',result.stdout+result.stderr);if(result.status!==0){console.error(result.stderr.slice(-1000));process.exit(result.status??1);}fs.writeFileSync(dir+'replay-v2-progress.json',JSON.stringify({cluster:c.id,at:new Date().toISOString()})+'\n');}
const result=spawnSync(process.execPath,[dir+'replay.mjs','--central','--resume'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});fs.writeFileSync(dir+'central-replay-v2.log',result.stdout+result.stderr);process.exitCode=result.status??1;
