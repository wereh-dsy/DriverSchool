// Launch the actual published executable with its normal app.asar and sandbox.
// A temporary CDP port is used only to observe menu readiness; no driving.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const dir='artifacts/remaining-interchange-ramp-repair/',release=JSON.parse(fs.readFileSync(dir+'release-result.json','utf8'));
assert(release.payloadExactMatch&&release.distConsistent);
const profile=path.resolve('.desktop/release-smoke-'+Date.now());
fs.mkdirSync(profile,{recursive:true});
const args=['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile];
const child=spawn(release.executable,args,{cwd:path.dirname(release.executable),windowsHide:true,stdio:['ignore','pipe','pipe']});
const startedAt=new Date().toISOString(),deadline=Date.now()+55000;
let output='',socket,requestId=0;
const pending=new Map();
for(const pipe of [child.stdout,child.stderr])pipe.on('data',b=>output+=b.toString());
let exited=false;child.on('exit',()=>{exited=true;});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++requestId,timer=setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(new Error('CDP timeout: '+method));}},8000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
let smoke;
try{
  const portFile=path.join(profile,'DevToolsActivePort');
  while(!fs.existsSync(portFile)){assert(!exited,'Published executable exited before exposing its renderer');assert(Date.now()<deadline,'No DevToolsActivePort');await pause(200);}
  const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
  let page;
  while(!page){assert(Date.now()<deadline,'No application page');const pages=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());page=pages.find(p=>p.type==='page'&&p.url.startsWith('driverschool://game/'));if(!page)await pause(200);}
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data),entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);if(message.error)entry.reject(new Error(JSON.stringify(message.error)));else entry.resolve(message.result);}});
  socket.addEventListener('close',()=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error('CDP connection closed'));}pending.clear();});
  const expression=`(() => ({title:document.title,url:location.href,kind:window.driverSchoolPlatform?.kind,require:typeof require,process:typeof process,canvas:!!document.querySelector('canvas.webgl'),menuReady:!!document.querySelector('[data-action="start"]:not(:disabled)'),menuSceneReady:performance.getEntriesByName('loading:menuSceneReady').length>0}))()`;
  let state;
  while(true){assert(!exited,'Published executable exited while loading');assert(Date.now()<deadline,'Menu/renderer readiness timed out');const evaluated=await call('Runtime.evaluate',{expression,returnByValue:true});assert(!evaluated.exceptionDetails,JSON.stringify(evaluated.exceptionDetails));state=evaluated.result.value;if(state.menuReady&&state.canvas&&state.menuSceneReady)break;await pause(300);}
  assert.equal(state.kind,'desktop');assert.equal(state.require,'undefined');assert.equal(state.process,'undefined');
  const capabilities=await call('Runtime.evaluate',{expression:'window.driverSchoolPlatform.getDirectories().then(d=>Object.keys(d))',awaitPromise:true,returnByValue:true});
  assert.deepEqual(capabilities.result.value.sort(),['config','logs','mods','saves']);
  smoke={passed:true,executable:release.executable,pid:child.pid,startedAt,completedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-Date.parse(startedAt))/1000,isolatedChromiumProfile:profile,launchArgs:args,state,desktopDirectories:capabilities.result.value,sandboxUnchanged:true,noDriving:true};
}catch(error){smoke={passed:false,executable:release.executable,pid:child.pid,startedAt,error:String(error),completedAt:new Date().toISOString()};process.exitCode=1;}
finally{
  if(socket?.readyState===WebSocket.OPEN){await call('Browser.close').catch(()=>{});socket.close();}
  if(!exited){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),pause(3000)]);if(!exited)child.kill();}
  fs.writeFileSync(dir+'external-release-smoke.log',output);
  fs.writeFileSync(dir+'external-release-smoke.json',JSON.stringify(smoke,null,2)+'\n');
  release.smoke=smoke;fs.writeFileSync(dir+'release-result.json',JSON.stringify(release,null,2)+'\n');
}
console.log(JSON.stringify(smoke));
