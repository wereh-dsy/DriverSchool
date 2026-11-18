import {writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
const pid=Number(process.argv[2]);
let targets=[];try{targets=await(await fetch('http://127.0.0.1:9229/json/list')).json();}catch{}
if(targets.length&&!targets.some(t=>t.url?.includes('.tmp-core-selftests.mjs')))throw new Error('Inspector belongs to another task');
if(!targets.length){process._debugProcess(pid);await delay(300);targets=await(await fetch('http://127.0.0.1:9229/json/list')).json();}
const target=targets.find(t=>t.url?.includes('.tmp-core-selftests.mjs'));if(!target)throw new Error('Core target not found');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
let seq=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(new Error('Inspector timeout'));},10000).unref();});
try{await call('Profiler.enable');await call('Profiler.start');await delay(200);const {profile}=await call('Profiler.stop');const count=new Map();for(const id of profile.samples??[])count.set(id,(count.get(id)??0)+1);const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();for(const n of profile.nodes)for(const child of n.children??[])parents.set(child,n.id);const hot=[...count].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([id,samples])=>{const stack=[];let at=id;while(nodes.has(at)){stack.push(nodes.get(at).callFrame.functionName);at=parents.get(at);}return {samples,...nodes.get(id).callFrame,stack};});await writeFile('artifacts/road-geometry-round5/release-core-location.json',JSON.stringify({pid,hot},null,2)+'\n');console.log(JSON.stringify(hot));}finally{ws.close();}
