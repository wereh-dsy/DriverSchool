// Presentation-only test hook. The packaged game/render code stays byte-identical.
import {setTimeout as delay} from 'node:timers/promises';
export async function hideStartupWindow(port){
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json())[0];if(target)break;}catch{}await delay(100);}if(!target)throw Error('Main inspector did not start');
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let sequence=0,pausedResolve;const pending=new Map(),paused=new Promise(resolve=>{pausedResolve=resolve;});
 socket.addEventListener('message',event=>{const value=JSON.parse(String(event.data));if(value.method==='Debugger.paused')pausedResolve(value.params);if(value.id){const task=pending.get(value.id);if(task){pending.delete(value.id);value.error?task.reject(Error(JSON.stringify(value.error))):task.resolve(value.result);}}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error('Main inspector timeout: '+method));},15000).unref();});
 try{
  await call('Debugger.enable');await call('Runtime.runIfWaitingForDebugger');
  const state=await Promise.race([paused,delay(15000).then(()=>{throw Error('Main did not pause');})]);
  const result=await call('Debugger.evaluateOnCallFrame',{callFrameId:state.callFrames[0].callFrameId,expression:"(()=>{const load=typeof require==='function'?require:process.getBuiltinModule('module').createRequire(process.execPath);load('electron').BrowserWindow.prototype.show=function(){};return true;})()",returnByValue:true});
  if(result.exceptionDetails||result.result?.value!==true)throw Error('Unable to hide functional window safely');
  await call('Debugger.resume');
 }finally{socket.close();}
}
