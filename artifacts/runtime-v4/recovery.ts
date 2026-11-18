import '../../src/styles.css';
import '../../src/ui/design/system.css';
import {StartupApplication} from '../../src/game/startup/StartupApplication';
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const app=new StartupApplication(document.getElementById('app')!);
const report:any={purpose:'Functional renderer failure recovery; not performance evidence',errors:[]};
const save=()=>fetch('/__remediation_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'recovery',report})});
const until=async(test:()=>boolean)=>{const start=performance.now();while(!test()){if(performance.now()-start>60000)throw Error('Recovery check timeout');await wait(100);}};
try{
 await wait(1000);app.ui.selectVehicle('test-6at-sedan');app.ui.selectMap('road-course');app.ui.startDrive();
 await until(()=>app.ui.state.screen==='driving');
 const game=(app as any).game,renderer=game.renderer;
 const before=game.runtime.simulation.simulatedSeconds;
 try{await renderer.command('vehicle','invalid-fixture');throw Error('Expected worker rejection');}catch(error){report.expectedWorkerError=String(error);}
 await wait(300);
 report.simulationContinues=game.runtime.simulation.simulatedSeconds>before;
 report.visibleError=document.body.textContent?.includes('独立渲染线程异常');
 app.ui.navigate('main');app.ui.startDrive();
 await until(()=>app.ui.state.loading.phase==='error');
 report.failedSessionRetired=!(app as any).game;
 app.ui.cancelLoading();await wait(900);app.ui.startDrive();
 await until(()=>app.ui.state.screen==='driving');
 report.newRendererReady=(app as any).game.renderer.isReady;
 report.oldLifecycle=renderer.lifecycle;
 app.dispose();await wait(600);
 if(!report.simulationContinues||!report.visibleError||!report.failedSessionRetired||!report.newRendererReady)throw Error('Renderer error recovery failed');
 report.passed=true;await save();document.title='PHASE4:DONE';
}catch(error){report.errors.push(String(error));report.loading=app.ui.state;app.dispose();await save();document.title='PHASE4:ERROR';}
