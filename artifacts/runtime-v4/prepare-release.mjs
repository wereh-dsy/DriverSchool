import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out='artifacts/runtime-v4/release/',root='D:/DriverSchoolRelease/DriverSchool-RuntimeV2-Phase4-20261118';
fs.mkdirSync(out,{recursive:true});
if(fs.existsSync(root))throw Error('Independent release already exists');
for(const item of ['.desktop','.desktop/payload','release','release/DriverSchool-win32-x64']){
 if(!fs.existsSync(item))continue;
 if(!fs.realpathSync(item).startsWith(fs.realpathSync('.')+path.sep)||fs.lstatSync(item).isSymbolicLink())throw Error('Unsafe staging path: '+item);
}
const files=[];function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())visit(file);else if(entry.isFile())files.push(file);}}
for(const dir of ['src','scripts','desktop'])visit(dir);
files.push('package.json','pnpm-lock.yaml','tsconfig.json','desktop/tsconfig.json','vite.config.ts','index.html');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(out+'source-before.json',JSON.stringify([...new Set(files)].sort().map(file=>({path:file,sha256:hash(file)})),null,2));
fs.writeFileSync(out+'preflight.json',JSON.stringify({releaseRoot:root,checkedAt:new Date().toISOString(),sourceFiles:files.length},null,2));
console.log({releaseRoot:root,sourceFiles:files.length});
