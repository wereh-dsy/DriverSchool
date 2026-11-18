import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{execFileSync}from'node:child_process';
const out='artifacts/runtime-v4',files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts','docs','AGENTS.md','package.json','vite.config.ts','tsconfig.json'],{encoding:'utf8'}).trim().split('\n'),records=[];
for(const file of files){if(!fs.statSync(file).isFile())continue;const data=fs.readFileSync(file),dest=path.join(out,'baseline',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);records.push({path:file,sha256:crypto.createHash('sha256').update(data).digest('hex')});}
const release='D:/DriverSchoolRelease/DriverSchool-win32-x64/resources/app.asar';fs.writeFileSync(out+'/starting-worktree.json',JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:fs.readFileSync('.tmp-runtime4-starting-status.txt','utf8'),files:records,release:{path:release,sha256:crypto.createHash('sha256').update(fs.readFileSync(release)).digest('hex')}},null,2));console.log({snapshotted:records.length});


