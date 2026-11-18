import '../../src/styles.css';
import '../../src/ui/design/system.css';
import {StartupApplication} from '../../src/game/startup/StartupApplication';
const errors:string[]=[];window.addEventListener('error',event=>errors.push(event.message));window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
localStorage.setItem('drivergame.environment.v1',JSON.stringify({weather:'CLEAR',time:'DAY'}));
const app=new StartupApplication(document.getElementById('app')!);(window as any).__phase3App=app;
const save=async(report:unknown)=>{await fetch('/__remediation_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'functional',report})});};
try{
 await wait(1000);app.ui.selectVehicle('test-6at-sedan');app.ui.selectMap('city-main');app.ui.startDrive();const started=performance.now();
 while(app.ui.state.screen!=='driving'){
  await wait(500);const game=(app as any).game;await save({stage:'loading',elapsed:performance.now()-started,loading:app.ui.state.loading,world:game?.ground.sectors.visualStatistics.worldRendering,errors});
  if(app.ui.state.loading.phase==='error'||performance.now()-started>180000)throw Error('Functional load failed');
 }
 const game=(app as any).game,sectors=game.ground.sectors;await wait(2000);
 const result:any={stage:'day',world:sectors.visualStatistics.worldRendering,graph:game.renderGraph.state,mirrorLeft:game.mirrors.getView('left').valid,mirrorRight:game.mirrors.getView('right').valid,shadow:!!game.sun.shadow.map,errors};
 if(result.world.renderWorld.backend!=='worker'||!result.world.renderWorld.ready||!result.graph.draws.main||!result.shadow||errors.length)throw Error('RenderWorld/graph readiness failed');
 await save(result);document.title='PHASE3:DAY';await wait(1500);
 game.setWeather('RAIN',.2);game.setEnvironmentTime('NIGHT');await wait(2000);result.stage='night';result.night={world:sectors.visualStatistics.worldRendering,graph:game.renderGraph.state,rain:game.environment.rainIntensity};await save(result);document.title='PHASE3:NIGHT';await wait(1500);
 app.dispose();for(let i=0;i<200&&!sectors.visualStatistics.resourcesReleased;i++)await wait(25);result.stage='done';result.released=sectors.visualStatistics;result.errors=errors;
 if(!result.released.resourcesReleased||result.released.worldRendering.renderWorld.records||errors.length)throw Error('RenderWorld lifecycle failed');
 await save(result);document.title='PHASE3:DONE';
}catch(error){await save({stage:'error',message:String(error),errors,world:(app as any).game?.ground.sectors.visualStatistics.worldRendering});document.title='PHASE3:ERROR';}
