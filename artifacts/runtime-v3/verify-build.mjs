import fs from 'node:fs';
import {createHash} from 'node:crypto';
const out='artifacts/runtime-v3/', log=fs.readFileSync(out+'build.log','utf8');
if(fs.readFileSync(out+'build.exit.txt','utf8').replace(/^\uFEFF/,'').trim()!=='0'||!log.includes('Checkpoint published.'))throw Error('Normal complete build did not publish');
const manifest=JSON.parse(fs.readFileSync('dist/.vite/manifest.json','utf8')),assets=new Set();
for(const chunk of Object.values(manifest))for(const file of [chunk.file,...chunk.css??[],...chunk.assets??[]]){if(!fs.statSync('dist/'+file).isFile())throw Error('Missing asset: '+file);assets.add(file);}
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const result={passed:true,command:'pnpm run build',basicValidation:false,checkpointPublished:true,sourceFingerprintVerifiedByBuild:true,manifestEntries:Object.keys(manifest).length,manifestAssets:assets.size,indexModifiedAt:fs.statSync('dist/index.html').mtime.toISOString(),indexSHA256:hash('dist/index.html'),mapSHA256:hash('src/world/regional/regional-main.json'),oldReleaseArchiveSHA256:hash('D:/DriverSchoolRelease/DriverSchool-win32-x64/resources/app.asar')};
fs.writeFileSync(out+'build-result.json',JSON.stringify(result,null,2));console.log(result);

