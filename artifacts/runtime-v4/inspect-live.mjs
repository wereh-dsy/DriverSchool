import fs from 'node:fs';
const pages=await(await fetch('http://127.0.0.1:5484/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.includes('functional.html'));
if(!page)throw Error('Functional page unavailable');
const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let id=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=event=>{const message=JSON.parse(String(event.data));if(message.id){const task=pending.get(message.id);pending.delete(message.id);if(message.error)task?.reject(message.error);else task?.resolve(message.result);}};
const call=(method,params)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
try{
 const result=await call('Runtime.evaluate',{expression:`(async()=>{const game=window.__phase4App?.game;if(!game)return {loading:window.__phase4App?.ui.state};const capture=await game.renderer.command('capture');return {phase:window.__phase4App.ui.state,client:game.renderer.state,source:game.publishRender.toString().includes('R.focus'),warmup:capture.warmup,publications:capture.publications,world:capture.world,statistics:capture.sectors,runtime:{jobs:capture.performance.jobs,queued:capture.performance.queued,atoms:capture.performance.atomicCosts?.slice(-8)}};})()`,awaitPromise:true,returnByValue:true});
 fs.writeFileSync('artifacts/runtime-v4/live-inspection.json',JSON.stringify(result,null,2));const data=result.result?.value;console.log(JSON.stringify({error:result.exceptionDetails,phase:data?.phase?.screen,loading:data?.phase?.loading?.progress,warmup:data?.warmup,publications:data?.publications?.slice(0,5),world:data?.world,renderWorld:data?.statistics?.worldRendering,runtime:data?.runtime},null,2));
}finally{socket.close();}
