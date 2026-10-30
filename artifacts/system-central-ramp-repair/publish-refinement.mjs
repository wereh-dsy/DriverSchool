// Execute only after the user's explicit authorization for one additional build.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const dir='artifacts/system-central-ramp-repair/',ref=dir+'refinement/',source='src/world/regional/regional-main.json',read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ready=read(ref+'ready-for-publication.json');assert(ready.ready);assert.equal(hash(source),ready.sourceHash);assert.equal(hash(ref+'candidate-map.json'),ready.candidateHash);
assert(!fs.existsSync(dir+'second-build-result.json'),'The explicitly authorized extra build already has a result');
const archive=dir+'first-publication/';fs.mkdirSync(archive,{recursive:true});
for(const f of ['REPORT.md','geometry-validation.json','facility-marking-validation.json','acceptance-summary.json','publication.json','validation.json','build-result.json','build.log'])if(fs.existsSync(dir+f))fs.copyFileSync(dir+f,archive+f);
for(const f of ['candidate-map.json','repair-plans.json','scope-guard.json','geometry-validation.json','shared-pavement-after.json','facility-marking-validation.json','facility-object-originals.json'])fs.copyFileSync(ref+f,dir+f);
for(const f of fs.readdirSync(ref+'after/'))if(fs.statSync(ref+'after/'+f).isFile())fs.copyFileSync(ref+'after/'+f,dir+'after/'+f);
fs.writeFileSync(source,fs.readFileSync(dir+'candidate-map.json'));
const publication=read(dir+'publication.json');Object.assign(publication,{sourceHash:hash(source),refinementRoadId:ready.changedRoadId,minimumRadiusBeforeRefinement:ready.minimumRadiusBefore,minimumRadiusAfterRefinement:ready.minimumRadiusAfter,secondBuildExplicitlyAuthorized:true,publishedAt:new Date().toISOString()});fs.writeFileSync(dir+'publication.json',JSON.stringify(publication,null,2)+'\n');
const startedAt=new Date().toISOString(),stream=fs.createWriteStream(dir+'second-build.log');let log='';
const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-Command','pnpm run build -BasicValidation'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
for(const pipe of [child.stdout,child.stderr])pipe.on('data',chunk=>{log+=chunk.toString();stream.write(chunk);process.stdout.write(chunk);});child.on('error',e=>{log+=e.message;});
child.on('close',exitCode=>{stream.end();const result={command:'pnpm run build -BasicValidation',launchCount:2,thisInvocation:1,extraBuildExplicitlyAuthorized:true,exitCode,published:exitCode===0&&log.includes('Checkpoint published.'),startedAt,completedAt:new Date().toISOString(),sourceHash:hash(source),log:dir+'second-build.log',coreSelftestsSkippedByExplicitUserRequest:true};fs.writeFileSync(dir+'second-build-result.json',JSON.stringify(result,null,2)+'\n');fs.writeFileSync(dir+'build-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=exitCode??1;});
