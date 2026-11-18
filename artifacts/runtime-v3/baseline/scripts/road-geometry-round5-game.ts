import '../src/styles.css';
import '../src/ui/design/system.css';
import {StartupApplication} from '../src/game/startup/StartupApplication';
import type {CityGround} from '../src/world/city/CityGround';
const errors:string[]=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const save=async(name:string,report:unknown)=>{const r=await fetch('/__road_r5_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'report',name,report})});if(!r.ok)throw new Error(await r.text());};
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())),started=performance.now(),application=new StartupApplication(document.getElementById('app')!);
application.ui.selectVehicle('family-sedan');application.ui.selectMap('city-main');application.ui.startDrive();
const pulse=setInterval(()=>{void save('browser-progress',{phase:'actual-game-entry',state:application.ui.state,errors});},3000);
try{
  while(application.ui.state.screen!=='driving'){if(application.ui.state.loading.phase==='error')throw new Error(application.ui.state.loading.message);if(performance.now()-started>180000)throw new Error('Actual game entry timeout');await frame();}
  document.title='R5:GAME_READY';const game=(application as unknown as {game:{ground:CityGround;snapshot:{x:number;z:number;speed:number};renderer:{info:{memory:unknown}}}}).game,first={x:game.snapshot.x,z:game.snapshot.z,speed:game.snapshot.speed};
  for(let i=0;i<120;i++)await frame();
  await save('game-entry',{passed:errors.length===0&&game.ground.visualReady,loadAndRunMs:performance.now()-started,state:application.ui.state,first,pose:{x:game.snapshot.x,z:game.snapshot.z,speed:game.snapshot.speed},finitePose:[game.snapshot.x,game.snapshot.z,game.snapshot.speed].every(Number.isFinite),mapId:game.ground.metadata.id,ready:game.ground.visualReady,loadingError:String(game.ground.visualLoadingError??''),sectors:game.ground.sectors.loadStatistics,gpu:game.renderer.info.memory,errors});
  const sectors=game.ground.sectors;application.dispose();for(let i=0;i<120&&!sectors.visualStatistics.resourcesReleased;i++)await frame();await save('game-release',{state:sectors.visualStatistics,errors});
}catch(e){errors.push(String(e));await save('game-entry',{passed:false,state:application.ui.state,errors});application.dispose();}
finally{clearInterval(pulse);await save('browser-progress',{phase:'actual-game-finished',errors});document.title='R5:DONE';}
