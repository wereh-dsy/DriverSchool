import '../../src/styles.css';
import '../../src/ui/design/system.css';
import {StartupApplication} from '../../src/game/startup/StartupApplication';
import {VEHICLE_CATALOG} from '../../src/vehicle/VehicleCatalog';
const errors:string[]=[];window.addEventListener('error',event=>errors.push(event.message));window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const contexts:{kind:string;time:number}[]=[];
const getContext=HTMLCanvasElement.prototype.getContext;
(HTMLCanvasElement.prototype as any).getContext=function(kind:string,...args:any[]){if(kind.includes('webgl'))contexts.push({kind,time:performance.now()});return getContext.call(this,kind as any,...args);};
localStorage.setItem('drivergame.environment.v1',JSON.stringify({weather:'CLEAR',time:'DAY'}));
const app=new StartupApplication(document.getElementById('app')!);(window as any).__phase4App=app;
const save=async(report:unknown)=>{await fetch('/__remediation_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'functional',report})});};
try{
 await wait(1000);app.ui.selectVehicle('test-6at-sedan');app.ui.selectMap('city-main');app.ui.startDrive();const started=performance.now();
 while(app.ui.state.screen!=='driving'){
  await wait(1000);const game=(app as any).game;await save({stage:'loading',elapsed:performance.now()-started,loading:app.ui.state.loading,renderer:game?.renderer.state,contexts,errors});
  if(app.ui.state.loading.phase==='error'||performance.now()-started>180000)throw Error('Functional load failed');
 }
 const game=(app as any).game,renderer=game.renderer,contextCount=contexts.length;await wait(2000);
 const result:any={stage:'day',renderer:renderer.state,mainSectors:game.ground.runtimeState(),contexts,errors,loadMs:performance.now()-started};
 if(renderer.state.owner!=='RendererWorker'||!renderer.isReady||!renderer.state.renderGraph.offscreen||!renderer.state.shadow||errors.length)throw Error('Independent renderer readiness failed');
 await save(result);document.title='PHASE4:DAY';await wait(1000);
 game.setWeather('RAIN',.2);game.setEnvironmentTime('NIGHT');await wait(2000);result.stage='night';result.night={renderer:renderer.state,rain:game.environment.rainIntensity};await save(result);document.title='PHASE4:NIGHT';await wait(1000);
 result.vehicles=[];
 (window as any).__phase4Validation=result;
 for(const vehicle of VEHICLE_CATALOG.slice(Number(new URLSearchParams(location.search).get('from')??0))){
  app.ui.selectVehicle(vehicle.id);const since=performance.now();
  while(game.activeVehicleId!==vehicle.id||!game.vehicleLoading.ready||app.ui.state.busy){if(performance.now()-since>45000||renderer.error||game.vehicleLoading.phase==='Failed')throw Error('Vehicle migration failed: '+vehicle.id+' '+renderer.error);await wait(100);}
  await wait(200);result.vehicles.push({id:vehicle.id,elapsed:performance.now()-since,metadata:renderer.vehicleInfo.id,contextRequests:contexts.length});
  if(['xiaomi-su7-max','koenigsegg-jesko','maybach-s680','tank-500'].includes(vehicle.id)){document.title='PHASE4:CAR:'+vehicle.id;await wait(250);}
  await save({...result,stage:'vehicles'});
 }
 app.ui.pause();const paused={x:game.snapshot.x,z:game.snapshot.z};await wait(250);result.pauseStable=game.snapshot.x===paused.x&&game.snapshot.z===paused.z;app.ui.resume();
 result.capture=await renderer.command('capture');
 if(contexts.length!==contextCount)throw Error('Playable main thread created a WebGL context');
 result.stage='done';app.dispose();await wait(600);result.lifecycle=renderer.lifecycle;result.mainWebGLCount=contexts.length;result.errors=errors;if(!result.pauseStable||!renderer.lifecycle.terminated||!renderer.lifecycle.acknowledged||errors.length)throw Error('Worker release / pause failed');await save(result);document.title='PHASE4:DONE';
}catch(error){await save({stage:'error',message:String(error),vehicles:(window as any).__phase4Validation?.vehicles,errors,contexts,renderer:(app as any).game?.renderer.state,loading:app.ui.state.loading});document.title='PHASE4:ERROR';}
