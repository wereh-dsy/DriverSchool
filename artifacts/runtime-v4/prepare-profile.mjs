import fs from 'node:fs';
import ts from 'typescript';
import {transform} from 'esbuild';
let source=fs.readFileSync('scripts/performance-preload.ts','utf8').replaceAll("'../src/","'../../src/").replace("'./performance-deep-instrument'","'../../scripts/performance-deep-instrument'");
const tree=ts.createSourceFile('profile.ts',source,ts.ScriptTarget.Latest,true);
const fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='measureFrames');
source=source.slice(0,fn.getStart(tree))+`function measureFrames(game:any){
 const cpuSlow:any[]=[],original=game.frame;
 game.frame=(time:number)=>{const start=performance.now();try{return original(time);}finally{const cpuMs=performance.now()-start;if(cpuMs>14)cpuSlow.push({start,cpuMs});}};
 return{cpuSlow,gpuSamples:[] as any[],gpuTimerAvailable:false,get draws(){return game.runtime.performance.latest?.();}};
}
function trackerFor(game:any){return typeof game.renderer.getContext==='function'?instrumentStreaming(game,false):{take:()=>({owner:'RendererWorker',bufferBytes:null,bufferPeak:null}),memory:()=>({owner:'RendererWorker',bufferBytes:null,bufferPeak:null})};}
`+source.slice(fn.end);
source=source.replaceAll('instrumentStreaming(game)','trackerFor(game)');
source=source.replace('  const report={variant,name,',`  const rendererCapture=typeof game.renderer.getContext==='function'?null:await game.renderer.command('capture');
  const renderPerformance=rendererCapture?.performance??game.runtime.report();
  if(frameTiming){frameTiming.gpuSamples=renderPerformance.gpu;frameTiming.gpuTimerAvailable=renderPerformance.gpu.length>0;}
  if(rendererCapture)await save(variant+'-renderer',rendererCapture);
  const report={rendererClock:renderPerformance.clock,variant,name,`);
source=source.replace('resources:game.ground.sectors.visualStatistics,','resources:rendererCapture?.sectors??game.ground.sectors.visualStatistics,');
source=source.slice(0,source.indexOf("try{\r\n if(params.has('cancel-switch'))")>=0?source.indexOf("try{\r\n if(params.has('cancel-switch'))"):source.indexOf("try{\n if(params.has('cancel-switch'))"));
source+=`try{
 const game=await runCase('cold-day',60000),remote=typeof game.renderer.getContext!=='function',renderer=game.renderer,sectors=game.ground.sectors,tracker=trackerFor(game);
 app.dispose();await new Promise(resolve=>setTimeout(resolve,700));
 await save(variant+'-day-release',{remote,state:remote?renderer.lifecycle:sectors.visualStatistics,gpu:remote?null:tracker.memory(),errors});document.title='PRELOAD:DONE';
}catch(error){await save(variant+'-error',{message:String(error),errors,state:app.ui.state,renderer:(app as any).game?.renderer.state});document.title='PRELOAD:ERROR';}
`;
fs.writeFileSync('artifacts/runtime-v4/profile.ts',source);
fs.writeFileSync('artifacts/runtime-v4/profile.html','<!doctype html><html><head><meta charset="utf-8"><title>Runtime comparison</title></head><body><div id="app"></div><script type="module" src="./profile.ts"></script></body></html>');
const instrumentation=fs.readFileSync('scripts/performance-deep-instrument.ts','utf8'),itree=ts.createSourceFile('i.ts',instrumentation,ts.ScriptTarget.Latest,true),instrument=itree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='instrumentContext');
const javascript=(await transform(instrument.getText(itree),{loader:'ts',target:'es2022'})).code;
fs.writeFileSync('artifacts/runtime-v4/worker-instrument.js',`(()=>{${javascript}\nconst get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(...args){const gl=get.apply(this,args);if(gl&&args[0]==='webgl2'&&!globalThis.__rendererGL){globalThis.__rendererGL=instrumentContext(gl);}return gl;};return true;})()`);
let runner=fs.readFileSync('artifacts/runtime-v3/compare.cjs','utf8').replaceAll("'phase21'","'phase3'").replaceAll("'phase3'","'phase4'");
// Replace identifiers separately so the baseline remains Phase 3.
runner=runner.replace("const variant=process.argv.includes('--baseline')?'phase4':'phase4',port=variant==='phase4'?5280:5281","const variant=process.argv.includes('--baseline')?'phase3':'phase4',port=variant==='phase3'?5285:5284");
runner=runner.replaceAll('runtime-v3','runtime-v4').replaceAll('runtime3-','runtime4-').replaceAll("variant==='phase4')fs.writeFileSync","variant==='phase3')fs.writeFileSync");
runner=runner.replaceAll('/scripts/performance-preload.html','/artifacts/runtime-v4/profile.html');
runner=runner.replace("waitForDebuggerOnStart:false","waitForDebuggerOnStart:variant==='phase4'");
runner=runner.replace("if(method==='Target.attachedToTarget')sessions.set(p.sessionId,p.targetInfo);",`if(method==='Target.attachedToTarget'){sessions.set(p.sessionId,p.targetInfo);void(async()=>{try{if(variant==='phase4'&&p.targetInfo.type==='worker'&&p.targetInfo.url.includes('Renderer.worker'))await debug.sendCommand('Runtime.evaluate',{expression:fs.readFileSync(out+'/worker-instrument.js','utf8'),returnByValue:true},p.sessionId);}finally{if(variant==='phase4')await debug.sendCommand('Runtime.runIfWaitingForDebugger',{},p.sessionId).catch(()=>{});}})();}`);
runner=runner.replace("graph:g.renderGraph?.state,world:g.ground?.sectors?.visualStatistics?.worldRendering?.renderWorld","graph:g.renderGraph?.state??g.renderer.state?.renderGraph,world:g.ground?.sectors?.visualStatistics?.worldRendering?.renderWorld??g.renderer.state?.world,renderer:g.renderer.state");
runner=runner.replace("if(result.result?.value)runtime.push(result.result.value);",`if(result.result?.value)runtime.push(result.result.value);if(variant==='phase4')for(const[id,target]of sessions)if(target.type==='worker'&&target.url.includes('Renderer.worker')){const gl=await debug.sendCommand('Runtime.evaluate',{expression:'({origin:performance.timeOrigin,gl:globalThis.__rendererGL?.take()})',returnByValue:true},id).catch(()=>null);if(gl?.result?.value)runtime.push({time:Date.now(),rendererGL:gl.result.value});}`);
fs.writeFileSync('artifacts/runtime-v4/compare.cjs',runner);
console.log('Reused route/input/GL instrumentation; separate Worker CPU/GPU ownership added.');
