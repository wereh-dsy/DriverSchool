import '../../src/styles.css';
import '../../src/ui/design/system.css';
import {StartupApplication} from '../../src/game/startup/StartupApplication';
import {sampleAt,polylineLength} from '../../src/world/city/geometry';
import {createNeutralVehicleInputState} from '../../src/input/VehicleInputState';
import {installContextTracking,instrumentStreaming} from '../../scripts/performance-deep-instrument';
const params=new URLSearchParams(location.search),variant=params.get('variant')??'before',rain=params.has('rain'),quick=params.has('quick'),errors:string[]=[],tasks:any[]=[],route=await(await fetch(params.has('high-speed')?'/artifacts/runtime-v15/highway-route.json':'/artifacts/performance-preload/route.json')).json();
installContextTracking();window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
new PerformanceObserver(list=>{for(const e of list.getEntries())tasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
const save=async(name:string,report:unknown)=>{const response=await fetch('/__remediation_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,report})});if(!response.ok)throw Error(await response.text());};
const diagnostic=params.has('diagnostic'),loaf:any[]=[],slowCalls:any[]=[];
const timing=params.has('timing');
if((diagnostic||timing)&&PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'))new PerformanceObserver(list=>{for(const e of list.getEntries())loaf.push(e.toJSON());}).observe({type:'long-animation-frame',buffered:true});
function measureFrames(game:any){
 const cpuSlow:any[]=[],original=game.frame;
 game.frame=(time:number)=>{const start=performance.now();try{return original(time);}finally{const cpuMs=performance.now()-start;if(cpuMs>14)cpuSlow.push({start,cpuMs});}};
 return{cpuSlow,gpuSamples:[] as any[],gpuTimerAvailable:false,get draws(){return game.runtime.performance.latest?.();}};
}
function trackerFor(game:any){return typeof game.renderer.getContext==='function'?instrumentStreaming(game,false):{take:()=>({owner:'RendererWorker',bufferBytes:null,bufferPeak:null}),memory:()=>({owner:'RendererWorker',bufferBytes:null,bufferPeak:null})};}

function diagnose(game:any){
 const wrap=(o:any,k:string,label=k)=>{if(typeof o?.[k]!=='function')return;const original=o[k];o[k]=function(...a:any[]){const start=performance.now();try{return original.apply(this,a);}finally{const ms=performance.now()-start;if(ms>4)slowCalls.push({start,ms,label});}};};
 for(const k of ['frame','updateVehicleVisual','updateGroundVisuals','updateWorldVisibility','updateSun','updateAuxiliaryGauges','prepareFirstScreen'])wrap(game,k);
 for(const[o,k,label]of [[game.contacts,'step','contacts'],[game.contacts,'synchronize','synchronize'],[game.dynamics,'reset','reset'],[game.dynamics,'stepFixed','physics'],[game.ground,'update','groundUpdate'],[game.ground.physics,'ensure','collisionEnsure'],[game.ground.physics,'advance','collisionAdvance'],[game.ground.sectors,'updateWorkerVisuals','publication'],[game.environmentVisual,'update','weather'],[game.mirrors,'renderAdaptive','mirrors'],[game.navigation,'update','navigation'],[game.sharedVehicleData,'update','sharedData'],[game.hud,'update','hud'],[game.renderer,'render','render']])wrap(o,k,label);
 for(const k of ['updateNavigation','updateMinimap'])wrap(game.hud,k);
 const direct=game.renderer.renderBufferDirect;game.renderer.renderBufferDirect=function(...args:any[]){const start=performance.now(),before=args[3]?.type==='MeshStandardMaterial'&&args[4].name==='office instances'?[...this.properties.get(args[3]).programs?.keys()??[]]:undefined;try{return direct.apply(this,args);}finally{const ms=performance.now()-start;if(ms>8){const material=args[3],o=args[4];slowCalls.push({start,ms,label:'draw',before,object:o.name,objectType:o.type,material:material.type,materialName:material.name,materialUuid:material.uuid,attributes:Object.keys(args[2].attributes),target:this.getRenderTarget()?'offscreen':'main',program:this.properties.get(material).currentProgram?.cacheKey});}}};
}
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())),neutral=createNeutralVehicleInputState(),wrap=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v)),clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
localStorage.setItem('drivergame.environment.v1',JSON.stringify({weather:rain?'RAIN':'CLEAR',time:rain?'NIGHT':'DAY'}));
const app=new StartupApplication(document.getElementById('app')!);(window as any).__preloadApp=app;app.ui.selectVehicle('test-6at-sedan');app.ui.selectMap('city-main');
await new Promise(r=>setTimeout(r,1500));
async function runCase(name:string,duration:number){
  document.title='PRELOAD:CASE:'+name;
  const clickAt=performance.now(),loadingFrames:number[]=[],progress:any[]=[];let last=clickAt,lastSignature='',tracker:any,game:any,shot=false,lastSaved=0,overlayMounted=false,frameTiming:ReturnType<typeof measureFrames>|undefined;
  app.ui.startDrive();
  while(app.ui.state.screen!=='driving'){
    await frame();const now=performance.now();loadingFrames.push(now-last);last=now;
    if(app.ui.state.loading.phase==='error'||now-clickAt>240000)throw Error('Load failed: '+app.ui.state.loading.message);
    game=(app as any).game;if(game&&!tracker){tracker=trackerFor(game);if(diagnostic)diagnose(game);if(timing)frameTiming=measureFrames(game);}
    overlayMounted||=!!document.querySelector('[data-loading-progress]');
    const p=(app.ui.state.loading as any).progress,signature=JSON.stringify([p?.percent,p?.completed,p?.total,p?.phase,p?.resource,app.ui.state.loading.message]);
    if(signature!==lastSignature){progress.push({elapsed:now-clickAt,phase:app.ui.state.loading.phase,message:app.ui.state.loading.message,...p});lastSignature=signature;}
    if(now-lastSaved>2500){lastSaved=now;const s=game?.ground.sectors.visualStatistics;await save(`${variant}-loading`,{name,elapsed:now-clickAt,progress:p,initial:s?.initial,active:game?.ground.sectors.active.size,worker:s?.worker?{queued:s.worker.queued,inFlight:s.worker.inFlight}:undefined,background:s?.background,warmup:game?.streamingWarmup?.statistics});}
    if(!shot&&(p?.percent>=40||!p&&now-clickAt>3500)){shot=true;document.title='PRELOAD:SHOT:'+name;}
  }
  const driveAt=performance.now(),loadMs=driveAt-clickAt,loadingGL=tracker?.take();game=(app as any).game;tracker??=trackerFor(game);
  const pose=game.snapshot;
  game.snapshot=game.dynamics.reset({x:pose.x,z:pose.z,yaw:pose.yaw,speed:0,driveSelector:'D',engineRunning:true});game.snapshot=game.contacts.synchronize(game.dynamics);
  const path=route.path,length=polylineLength(path),turnDistance=route.junctions.find((j:any)=>j.distance>route.startStation+300)?.distance??route.startStation+650;
  let station=route.startStation,direction=1,phase='outbound',arc:any,turnFinished=false;const rows:any[]=[],original=game.input.consumeState.bind(game.input);last=driveAt;
  const completeness:any[]=[];let nextCompletenessAt=0;
  game.input.consumeState=()=>{
    const state=game.snapshot;let target:any,targetSpeed=params.has('high-speed')?55:26,steering=0;
    if(phase==='turn'){
      const dx=state.x-arc.cx,dz=state.z-arc.cz,angle=clamp(Math.atan2(dx*arc.fx+dz*arc.fz,dx*arc.nx+dz*arc.nz),0,Math.PI),ahead=Math.min(Math.PI,angle+.5);
      target={x:arc.cx+arc.nx*5*Math.cos(ahead)+arc.fx*5*Math.sin(ahead),z:arc.cz+arc.nz*5*Math.cos(ahead)+arc.fz*5*Math.sin(ahead)};targetSpeed=2.5;
      const error=wrap(Math.atan2(-(target.x-state.x),-(target.z-state.z))-(state.yaw-state.bodySlipAngle)),distance=Math.max(.5,Math.hypot(target.x-state.x,target.z-state.z)),c=game.dynamics.config.steering,authority=c.highSpeedMinimumAuthority+(1-c.highSpeedMinimumAuthority)/(1+(state.speed/c.highSpeedReferenceSpeed)**2),sensitivity=c.steeringWheelLock*.5/c.steeringRatio*authority;
      steering=clamp(-Math.atan2(2*game.dynamics.config.wheelBase*Math.sin(error),distance)/sensitivity,-1,1);
      if(angle>Math.PI-.15&&Math.hypot(state.x-(arc.cx-arc.nx*5),state.z-(arc.cz-arc.nz*5))<3){phase='return';direction=-1;turnFinished=true;}
    }else{
      let best=Infinity,next=station;
      for(let d=Math.max(0,station-30);d<=Math.min(length,station+35);d+=2){const p=sampleAt(path,d),x=p.point.x-p.tangent.z*route.offset*direction,z=p.point.z+p.tangent.x*route.offset*direction,dist=(x-state.x)**2+(z-state.z)**2;if(dist<best){best=dist;next=d;}}
      station=next;const look=phase==='approach'?Math.max(4,Math.abs(state.speed)*.65):Math.max(12,Math.abs(state.speed)*.7),p=sampleAt(path,clamp(station+direction*look,0,length));target={x:p.point.x-p.tangent.z*route.offset*direction,z:p.point.z+p.tangent.x*route.offset*direction};
      if(direction===1&&turnDistance-station<120)phase='approach';
      if(phase==='approach')targetSpeed=Math.min(targetSpeed,Math.sqrt(5*Math.max(0,turnDistance-station-4))+2.5);
      if(phase==='approach'&&station>=turnDistance-5&&Math.abs(state.speed)<3.7){const fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw),nx=-fz,nz=fx;arc={cx:state.x-nx*5,cz:state.z-nz*5,fx,fz,nx,nz};phase='turn';}
      const error=wrap(Math.atan2(-(target.x-state.x),-(target.z-state.z))-(state.yaw-state.bodySlipAngle));steering=clamp(-error*1.65,-.9,.9);
      if(direction===-1&&station<route.startStation-100)targetSpeed=0;
    }
    const error=targetSpeed-state.speed;
    return{...neutral,throttle:error>-.2?clamp(.15+error*.18,0,.8):0,brake:error<-.5?clamp(-error*.13,0,.75):0,steering};
  };
  for(;;){
    await frame();const now=performance.now(),elapsed=now-driveAt;if(elapsed>=duration)break;
    const gl=tracker.take(),clock=game.runtime?.simulation;
    rows.push({elapsed,dt:now-last,phase,station,speed:game.snapshot.speed,x:game.snapshot.x,z:game.snapshot.z,
      sector:game.ground.sectors.debugState?.currentSector,draws:frameTiming?.draws,gl,heap:(performance as any).memory?.usedJSHeapSize,
      physicsSteps:clock?.completedSteps,debtSeconds:clock?.debtSeconds,surrenderedMs:(clock?.surrenderedFrameSeconds??0)*1000});
    if(params.has('runtime-v15')&&elapsed>=nextCompletenessAt){
      nextCompletenessAt=elapsed+1000;
      const statistics=game.ground.sectors.completenessStatistics;
      if(statistics)completeness.push({elapsed,forwardTotal:statistics.forwardTotal,forwardReady:statistics.forwardReady,
        incompleteVisible:statistics.incompleteVisible,lookaheadMetres:statistics.lookaheadMetres,preparationSeconds:statistics.preparationSeconds});
    }
    last=now;
  }
  game.input.consumeState=original;game.input.setEnabled(false);
  const rendererCapture=typeof game.renderer.getContext==='function'?null:await game.renderer.command('capture');
  const renderPerformance=rendererCapture?.performance??game.runtime.report();
  if(frameTiming){frameTiming.gpuSamples=renderPerformance.gpu;frameTiming.gpuTimerAvailable=renderPerformance.gpu.length>0;}
  if(rendererCapture)await save(variant+'-renderer',rendererCapture);
  const report={rendererClock:renderPerformance.clock,variant,name,loadMs,clickAt,driveAt,loadingFrames,progress,overlayMounted,overlayDetachedAfterReady:!document.querySelector('[data-loading-progress]'),loadingGL,rows,turnFinished,turnDistance,finalPhase:phase,errors:[...errors],longTasks:tasks.filter(t=>t.start>=clickAt),loaf,slowCalls,frameTiming,initialization:timing?{ground:game.ground.loadStatistics,measures:performance.getEntriesByType('measure').filter(e=>e.name.startsWith('city:')||e.name.startsWith('loading:')).map(e=>({name:e.name,start:e.startTime,ms:e.duration,detail:e.detail}))}:undefined,resources:rendererCapture?.sectors??game.ground.sectors.visualStatistics,warmup:game.streamingWarmup?.statistics,gpu:tracker.memory(),conditions:{width:innerWidth,height:innerHeight,dpr:game.renderer.getPixelRatio(),rain,physicsHz:120,mapVersion:507,vehicle:'test-6at-sedan',durationMs:duration,spawn:route.spawnId,diagnostic,timing}};
  await save(`${variant}-${name}`,report);
  if (game.runtime?.report) await save(`${variant}-${name}-runtime`, game.runtime.report());
  if(params.has('runtime-v15'))await save(`${variant}-${name}-completeness`,{samples:completeness,final:game.ground.sectors.completenessStatistics});
  document.title='PRELOAD:DRIVE:'+name;await new Promise(r=>setTimeout(r,150));return game;
}
try{
 const game=await runCase('cold-day',60000),remote=typeof game.renderer.getContext!=='function',renderer=game.renderer,sectors=game.ground.sectors,tracker=trackerFor(game);
 app.dispose();await new Promise(resolve=>setTimeout(resolve,700));
 await save(variant+'-day-release',{remote,state:remote?renderer.lifecycle:sectors.visualStatistics,gpu:remote?null:tracker.memory(),errors});document.title='PRELOAD:DONE';
}catch(error){await save(variant+'-error',{message:String(error),errors,state:app.ui.state,renderer:(app as any).game?.renderer.state});document.title='PRELOAD:ERROR';}
