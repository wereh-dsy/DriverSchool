/** Correctness-only relocation between real map objects, outside performance
 * sampling. No topology/physics rules are modified; each stop uses normal preload. */
export async function runWorldTour(app:any,game:any,save:(name:string,data:unknown)=>Promise<void>,variant:string){
 const stops=await(await fetch('/artifacts/runtime-v2-phase2/tour.json')).json(),results:any[]=[];
 const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
 for(const stop of stops){
  document.title='PRELOAD:CASE:world-tour-'+stop.id;
  app.ui.pause();game.ground.setSurfaceReferenceHeight?.(stop.y);
  // Use the normal spawn/reset support-layer contract. A horizontal teleport
  // alone intentionally retains no underground/elevated support selection.
  game.ground.spawnPose.position.set(stop.x,stop.y+.04,stop.z);
  game.ground.spawnPose.yawRadians=stop.yaw;game.contacts.reset();
  game.ground.preparePhysicsStep?.(stop.x,stop.z,0,0,1/120,3);
  game.snapshot=game.dynamics.reset({x:stop.x,z:stop.z,yaw:stop.yaw,speed:0,driveSelector:'P',engineRunning:true});
  game.snapshot=game.contacts.synchronize(game.dynamics);game.runtime.suspend();
  game.renderPose.reset(game.snapshot,game.vehicleVisual.config.staticBodyOffsetY);
  game.updateVehicleVisual(0);game.updatePlayerCamera(0);game.updateWorldVisibility();
  game.ground.beginVisualPreload();const started=performance.now();
  do{await frame();if(game.ground.visualLoadingError)throw game.ground.visualLoadingError;if(performance.now()-started>90000)throw Error('World tour preload timed out: '+stop.id);}
  while(!game.ground.visualReady||!game.streamingWarmup.idle);
  game.ground.finishVisualPreload();app.ui.resume();for(let i=0;i<12;i++)await frame();
  const supportHeight=(Object.values(game.contacts.wheelContacts) as any[]).reduce((sum,wheel)=>sum+wheel.height,0)/4;
  if(Math.abs(supportHeight-stop.y)>1)throw Error('Incorrect authored support layer: '+stop.id+' / '+supportHeight);
  results.push({stop,supportHeight,loadMs:performance.now()-started,pose:{x:game.snapshot.x,chassisY:game.snapshot.chassis.chassisY,z:game.snapshot.z},resources:game.ground.sectors.visualStatistics,
   completeness:game.ground.sectors.completenessStatistics,mirrors:[game.mirrors.getView('left').valid,game.mirrors.getView('right').valid],shadow:!!game.sun.shadow.map});
  document.title='PRELOAD:TOUR:'+stop.id;for(let i=0;i<20;i++)await frame();
  await save(variant+'-world-tour',{results});
 }
}
