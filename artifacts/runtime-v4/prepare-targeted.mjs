import fs from 'node:fs';
const base='artifacts/runtime-v4/';
let source=fs.readFileSync(base+'functional.ts','utf8');
source=source.replace("name:'functional'","name:'targeted'");
source=source.replace("result.capture=await renderer.command('capture');",`
 result.maps=[];
 for(const id of ['road-course','subject-3-shared-city-map','city-main']){
  const since=performance.now();
  if(!await game.switchGround(id))throw Error('Map switch failed: '+id);
  await wait(1200);
  if(renderer.error)throw renderer.error;
  result.maps.push({id,elapsed:performance.now()-since,main:game.ground.metadata.id,renderer:renderer.state});
  await save({...result,stage:'maps'});
 }
 const frames=Number(renderer.state.frames);
 await renderer.command('visibility',false);await wait(1200);
 const hiddenFrames=Number(renderer.state.frames);
 await renderer.command('visibility',true);await wait(1500);
 result.visibility={before:frames,hidden:hiddenFrames,resumed:renderer.state.frames};
 if(Number(renderer.state.frames)<=hiddenFrames)throw Error('Renderer did not resume');
 renderer.setSize(1000,600);await wait(250);renderer.setSize(innerWidth,innerHeight);await wait(350);
 result.capture=await renderer.command('capture');
 `);
source=source.replace("await save(result);document.title='PHASE4:DONE';",`
 const retryHost=document.createElement('div');document.body.append(retryHost);
 const retry=new StartupApplication(retryHost);
 await wait(500);retry.ui.selectMap('city-main');retry.ui.startDrive();
 await wait(250);retry.ui.cancelLoading();await wait(900);
 result.cancelled=retry.ui.state.screen==='main'&&!retry.ui.state.busy;
 retry.ui.selectMap('road-course');retry.ui.startDrive();const retryStarted=performance.now();
 while(retry.ui.state.screen!=='driving'){
  if(performance.now()-retryStarted>60000||retry.ui.state.loading.phase==='error')throw Error('Retry failed');
  await wait(250);
 }
 result.retried=true;retry.dispose();await wait(600);retryHost.remove();
 if(!result.cancelled||errors.length)throw Error('Cancel/retry failed');
 await save(result);document.title='PHASE4:DONE';
 `);
fs.writeFileSync(base+'targeted.ts',source);
fs.writeFileSync(base+'targeted.html',fs.readFileSync(base+'functional.html','utf8').replace('./functional.ts?complete=5','./targeted.ts?complete=1'));
fs.writeFileSync(base+'targeted.cjs',fs.readFileSync(base+'functional.cjs','utf8').replaceAll('functional','targeted').replace('from=13','from=18'));
