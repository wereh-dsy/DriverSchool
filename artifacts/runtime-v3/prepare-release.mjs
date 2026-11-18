import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out='artifacts/runtime-v3/release/';fs.mkdirSync(out,{recursive:true});
fs.copyFileSync('artifacts/runtime-v3/hide-startup-window.mjs',out+'hide-startup-window.mjs');
const root='D:/DriverSchoolRelease/DriverSchool-RuntimeV2-Phase3-20261117';
if(fs.existsSync(root))throw Error('Independent release directory already exists: '+root);
for(const item of ['.desktop','.desktop/payload','release','release/DriverSchool-win32-x64']){
 if(!fs.existsSync(item))continue;
 const real=fs.realpathSync(item),base=fs.realpathSync('.');
 if(!real.startsWith(base+path.sep)||fs.lstatSync(item).isSymbolicLink())throw Error('Unsafe package staging path: '+item);
}
for(const file of ['smoke-release.mjs','verify-package.mjs']){
 let source=fs.readFileSync('artifacts/runtime-v2-phase2/release/'+file,'utf8');
 source=source.replaceAll('artifacts/runtime-v2-phase2/release','artifacts/runtime-v3/release').replaceAll('DriverSchool-RuntimeV2-Phase2-20261116','DriverSchool-RuntimeV2-Phase3-20261117').replaceAll('.tmp-runtime-phase2-release-profile','.tmp-runtime-phase3-release-profile');
 if(file==='smoke-release.mjs'){
  source="import {hideStartupWindow} from './hide-startup-window.mjs';\n"+source;
  source=source.replace('const child=spawn(exe,[',"const inspectorServer=createServer();await new Promise(resolve=>inspectorServer.listen(0,'127.0.0.1',resolve));const inspectPort=inspectorServer.address().port;await new Promise(resolve=>inspectorServer.close(resolve));\nconst child=spawn(exe,['--inspect-brk=127.0.0.1:'+inspectPort,");
  source=source.replace('try{\n let target;',"try{\n await hideStartupWindow(inspectPort);result.hiddenPresentation=true;\n let target;");
  source=source.replace('ordinary production window; no topmost, fullscreen or bringToFront operations; movable and minimizable','hidden presentation via temporary startup inspector hook; packaged game and renderer unchanged; functional evidence only');
 }
 if(file==='smoke-release.mjs')source=source.replace("else if(data.method==='Network.loadingFailed')", "else if(data.method==='Runtime.consoleAPICalled'&&data.params.type==='error')result.errors.push({consoleError:data.params.args.map(a=>a.value??a.description).join(' ')});else if(data.method==='Network.loadingFailed')");
 if(file==='smoke-release.mjs')source=source.replace(' result.passed=result.errors.length',` await evaluate("(()=>{document.querySelector('[data-weather=RAIN]').click();document.querySelector('[data-time=NIGHT]').click();return true;})()");
 await delay(9000);
 result.rainNight=await evaluate("({phase:document.querySelector('#app')?.dataset.uiPhase,rain:document.querySelector('[data-weather=RAIN]')?.classList.contains('active'),night:document.querySelector('[data-time=NIGHT]')?.classList.contains('active')})");
 if(result.rainNight.phase!=='driving'||!result.rainNight.rain||!result.rainNight.night)throw Error('Rain/night functional transition failed');
 const rainShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(join(output,'release-rain-night.png'),Buffer.from(rainShot.data,'base64'));
 result.passed=result.errors.length`);
 fs.writeFileSync(out+file,source);
}
const files=[];function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())visit(file);else if(entry.isFile())files.push(file);}}
for(const dir of ['src','scripts','desktop'])visit(dir);
files.push('package.json','pnpm-lock.yaml','tsconfig.json','desktop/tsconfig.json','vite.config.ts','index.html');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(out+'source-before.json',JSON.stringify([...new Set(files)].sort().map(file=>({path:file,sha256:hash(file)})),null,2));
fs.writeFileSync(out+'preflight.json',JSON.stringify({releaseRoot:root,oldArchiveSHA256:hash('D:/DriverSchoolRelease/DriverSchool-win32-x64/resources/app.asar'),checkedAt:new Date().toISOString(),sourceFiles:files.length},null,2));
console.log({releaseRoot:root,sourceFiles:files.length});

