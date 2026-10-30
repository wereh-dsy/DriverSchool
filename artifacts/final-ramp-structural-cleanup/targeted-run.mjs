import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const d='artifacts/final-ramp-structural-cleanup/',inventory=JSON.parse(fs.readFileSync(d+'interchange-inventory.json'));
const phase=process.argv[2]??'runtime';
function run(args,file){const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});fs.writeFileSync(d+file,(result.stdout??'')+(result.stderr??''));if(result.status!==0){process.stderr.write(result.stderr??'');throw Error('Failed '+args.join(' '));}console.log(file+' complete');fs.writeFileSync(d+phase+'-progress.json',JSON.stringify({file,completedAt:new Date().toISOString()},null,2));}
if(phase==='static'){run([d+'run.mjs','validate'],'final-static.log');run([d+'run.mjs','central-regression'],'final-central-static.log');}
else {for(const c of inventory.clusters){run([d+'replay.mjs','--cluster',c.id,'--ramps','--max-seconds','60'],c.file+'-replay.log');run([d+'replay-full.mjs','--cluster',c.id,'--ramps','--max-seconds','60'],c.file+'-full-replay.log');}run([d+'replay.mjs','--central','--max-seconds','40'],'central-replay.log');}
console.log(phase+' targeted checks complete');
