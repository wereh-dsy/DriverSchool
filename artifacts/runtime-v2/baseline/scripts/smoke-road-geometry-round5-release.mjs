import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
const output=resolve('artifacts/road-geometry-round5'),release=resolve(process.env.DRIVERSCHOOL_RELEASE_DIR?.trim()||'D:/DriverSchoolRelease','DriverSchool-win32-x64'),exe=join(release,'DriverSchool.exe');await mkdir(output,{recursive:true});
const require=createRequire(import.meta.url),asar=createRequire(require.resolve('@electron/packager'))('@electron/asar');
const archive=join(release,'resources/app.asar'),index=await readFile('dist/index.html'),packedIndex=asar.extractFile(archive,'dist/index.html');
if(!index.equals(packedIndex))throw new Error('Published app contains a different dist index');
const portServer=createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
// Automation can leave the production window occluded: avoid testing Chromium's
// background timer throttle instead of the actual loading lifecycle.
const automationFlags=['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'];
const child=spawn(exe,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',...automationFlags,`--user-data-dir=${resolve('.tmp-road-round5-release-profile')}`],{env,stdio:'ignore',windowsHide:true});
const result={exe,automationFlags,packageIndexMatchesDist:true,indexSHA256:createHash('sha256').update(index).digest('hex'),pid:child.pid,errors:[],requestsFailed:[],passed:false};let ws,sequence=0;const pending=new Map();
const persist=()=>writeFile(join(output,'release-smoke.json'),JSON.stringify(result,null,2)+'\n');
try{
 let target;for(let i=0;i<100;i++){try{const list=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();target=list.find(p=>p.type==='page'&&p.url.startsWith('driverschool://game/'));if(target)break;}catch{}await delay(200);}if(!target)throw new Error('Published EXE did not expose its expected game page');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const data=JSON.parse(String(event.data));if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(JSON.stringify(data.error))):p.resolve(data.result);}}else if(data.method==='Runtime.exceptionThrown')result.errors.push(data.params.exceptionDetails);else if(data.method==='Network.loadingFailed')result.requestsFailed.push(data.params);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(new Error('CDP timeout '+method));},20000).unref();});
 const evaluate=async expression=>{const data=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(data.exceptionDetails)throw new Error(data.exceptionDetails.text);return data.result.value;};
 await call('Runtime.enable');await call('Network.enable');await call('Page.bringToFront');
 let menu;for(let i=0;i<100;i++){menu=await evaluate(`({url:location.href,phase:document.querySelector('#app')?.dataset.uiPhase,startEnabled:!!document.querySelector('[data-action="start"]:not(:disabled)'),platform:window.driverSchoolPlatform?.kind,nodeExposed:typeof require!=='undefined'||typeof process!=='undefined'})`);if(menu.startEnabled)break;await delay(200);}if(!menu.startEnabled||menu.platform!=='desktop'||menu.nodeExposed)throw new Error('Published menu/platform/security boundary failed');result.menu=menu;
 result.directories=await evaluate('window.driverSchoolPlatform.getDirectories()');
 await evaluate(`(()=>{window.__r5Prefs={map:localStorage.getItem('drivergame.ground-id.v1'),vehicle:localStorage.getItem('drivergame.vehicle-id.v1')};document.querySelector('[data-map="city-main"]').click();const picker=document.querySelector('[data-vehicle-picker]');picker.value='family-sedan';picker.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-action="start"]').click();return true;})()`);
 const started=performance.now();let state;for(let i=0;i<600;i++){state=await evaluate(`({phase:document.querySelector('#app')?.dataset.uiPhase,screen:document.querySelector('.ds-shell')?.dataset.activeScreen,message:document.querySelector('[data-screen="loading"]')?.textContent,canvases:document.querySelectorAll('canvas').length,map:document.querySelector('[data-current-map]')?.textContent})`);if(state.phase==='driving')break;if(state.message?.includes('场景暂时无法载入'))throw new Error(state.message);if(child.exitCode!==null)throw new Error('Published EXE exited during load');if(i%10===0){result.progress={...state,elapsedMs:performance.now()-started};await persist();}await delay(300);}if(state.phase!=='driving')throw new Error('Published city drive did not become ready');
 await delay(2000);result.driving=state;result.loadMs=performance.now()-started;result.measures=await evaluate(`performance.getEntriesByType('measure').filter(e=>e.name.startsWith('city:')).map(e=>({name:e.name,duration:e.duration}))`);
 const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(join(output,'release-game.png'),Buffer.from(screenshot.data,'base64'));
 await evaluate(`(()=>{const p=window.__r5Prefs;for(const [key,value]of [['drivergame.ground-id.v1',p.map],['drivergame.vehicle-id.v1',p.vehicle]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}return true;})()`);
 result.passed=result.errors.length===0&&result.requestsFailed.filter(r=>!r.canceled).length===0;
 await persist();
 // Browser.close may close its socket without returning a CDP reply. Keep the
 // shutdown bounded and preserve the completed entry result before closing it.
 try{await Promise.race([call('Browser.close'),delay(1000)]);}catch{}
}catch(e){result.errors.push(String(e));process.exitCode=1;}
finally{ws?.close();if(child.exitCode===null){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)]);if(child.exitCode===null)child.kill();}await persist();}
if(!result.passed)process.exitCode=1;console.log(JSON.stringify({passed:result.passed,exe,loadMs:result.loadMs,errors:result.errors.length,failedRequests:result.requestsFailed.length}));
