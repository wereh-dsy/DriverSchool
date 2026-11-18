import { RuntimeCoordinator, type RuntimeTask } from './RuntimeCoordinator';
import { FixedStepClock } from './FixedStepClock';
import { VehicleRenderPose } from './VehicleRenderPose';
import { VehicleDynamics } from '../../vehicle/physics';
import { createVehiclePhysicsConfig } from '../../vehicle/VehicleCatalog';

export async function runRuntimeCoordinatorSelfTest() {
  let assertions = 0;
  const check = (ok: boolean, message: string) => {
    assertions++;
    if (!ok) throw Error('Runtime coordinator: ' + message);
  };
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-8;
  let cpu = 0;
  const clock = new FixedStepClock(() => cpu);
  clock.begin(0, true);
  clock.begin(.35, true);
  let steps = 0;
  while (clock.canStep()) { clock.completeStep(); steps++; }
  check(steps === 2 && close(clock.debtSeconds,0), 'a stalled frame advances only a normal display interval');
  for (let frame = 0; frame < 3; frame++) {
    clock.begin(0, true);
    while (clock.canStep()) { clock.completeStep(); steps++; }
  }
  check(steps === 2 && close(clock.surrenderedSeconds,1/3), 'stalled wall time is recorded and never replayed');
  clock.begin(.04, true);
  check(clock.canStep(), 'physics starts before background work');
  cpu = 6; clock.completeStep();
  check(!clock.canStep() && clock.debtSeconds > .03, 'CPU bound limits the current frame');
  cpu=0;clock.begin(1/60,true);
  let recoverySteps=0;
  while(clock.canStep()){clock.completeStep();recoverySteps++;}
  check(recoverySteps<=3&&clock.surrenderedFrameSeconds>.02,'unprocessed whole steps expire before recovery');
  clock.reset(); clock.begin(60, true);
  check(!clock.canStep(), 'resume excludes suspended wall time');

  const dynamics = new VehicleDynamics(createVehiclePhysicsConfig('test-6at-sedan'));
  const first = dynamics.getSnapshot();
  const interpolator = new VehicleRenderPose();
  interpolator.reset(first);
  const next = { ...first, x:first.x + 2, z:first.z + 4, yaw:Math.PI-.01 };
  interpolator.push(next);
  interpolator.sample(.5);
  check(close(interpolator.body.x,first.x+1)&&close(interpolator.body.z,first.z+2), 'body interpolates between immutable physics poses');
  for (const id of ['frontLeft','frontRight','rearLeft','rearRight'] as const) {
    check(close(interpolator.wheelPositions[id].y,first.wheels[id].worldPosition.y),'wheel world pose remains physically anchored');
  }
  interpolator.push({ ...next, yaw:-Math.PI+.01 });
  interpolator.sample(.5);
  check(close(Math.abs(interpolator.body.yaw),Math.PI),'yaw interpolates across the wrap without a full turn');
  check(first.x !== next.x && first.yaw !== next.yaw,'render capture does not edit physics snapshots');
  interpolator.reset(next);
  interpolator.sample(0);
  check(close(interpolator.body.x,next.x),'teleport resets both interpolation endpoints');

  const oldRaf = Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame');
  const oldCancel = Object.getOwnPropertyDescriptor(globalThis,'cancelAnimationFrame');
  const frames = new Map<number,FrameRequestCallback>();
  let sequence = 0;
  Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:(callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence;}});
  Object.defineProperty(globalThis,'cancelAnimationFrame',{configurable:true,value:(id:number)=>frames.delete(id)});
  const runtime = new RuntimeCoordinator();
  const frame = async (time:number) => {
    const [id,callback]=frames.entries().next().value!;
    frames.delete(id);
    callback(time);
    for(let i=0;i<5;i++)await Promise.resolve();
  };
  try {
    runtime.start(()=>{});
    const order:string[]=[];
    const task=(id:string,priority:RuntimeTask['priority'],step:RuntimeTask['step']):RuntimeTask=>({id,priority,step,phase:'background',valid:()=>true});
    runtime.enqueue(task('far',()=> 'background',()=>{order.push('far');return true;}));
    runtime.enqueue(task('visible',()=> 'visible',()=>{order.push('visible');return true;}));
    let continuation=0;
    const resumable=runtime.enqueue(task('resumable',()=> 'upcoming',()=>++continuation===2));
    const paused=runtime.enqueue(task('paused',()=> 'visible',()=>{order.push('paused');return true;}));
    paused.pause();
    const cancelled=runtime.enqueue(task('cancelled',()=> 'visible',()=>{throw Error('Cancelled work ran');}));
    cancelled.cancel();
    const obsolete=runtime.enqueue({...task('obsolete',()=> 'visible',()=>{throw Error('Obsolete work ran');}),valid:()=>false});
    await frame(0);
    check(order[0]==='visible' && order.includes('far'),'visible work wins admission over far work');
    check(resumable.state==='queued'&&continuation===1,'bounded work runs once and retains its continuation');
    check(paused.state==='paused'&&cancelled.state==='cancelled'&&obsolete.state==='cancelled','pause and cancellation own task lifecycle');
    paused.resume();
    await frame(16);
    await resumable.done;
    check(continuation===2&&paused.state==='complete','continuations resume on the following frame');
    const repeated=runtime.enqueue(task('same',()=> 'background',()=>false));
    const merged=runtime.enqueue(task('same',()=> 'visible',()=>true));
    check(merged===repeated,'duplicate work shares one lifecycle');
    await frame(32);
    check(merged.state==='complete','merged task uses latest priority and work');
    const old=runtime.enqueue(task('reused',()=> 'background',()=>{throw Error('Superseded work ran');}));
    let replacementRan=false;
    runtime.enqueue(task('replace-owner',()=> 'visible',()=>{
      old.cancel();
      runtime.enqueue(task('reused',()=> 'background',()=>{replacementRan=true;return true;}));
      return true;
    }));
    await frame(48);await frame(64);
    check(replacementRan,'a stale frame entry cannot cancel a new owner reusing the same task ID');
    for(let i=3;i<4100;i++)await frame(i*16);
    const report=runtime.report();
    check(report.frames.length===4096&&report.slowFrames.length<=96,'performance history is bounded');
    check(report.gpuBufferBytes===null&&report.presentationIntervals===null,'unsupported measurements are explicit');
    const pending=runtime.enqueue(task('dispose',()=> 'background',()=>false));
    runtime.dispose();
    await pending.done;
    check(pending.state==='cancelled'&&frames.size===0,'dispose resolves queued work and cancels its frame callback');
  } finally {
    runtime.dispose();
    if(oldRaf)Object.defineProperty(globalThis,'requestAnimationFrame',oldRaf);else Reflect.deleteProperty(globalThis,'requestAnimationFrame');
    if(oldCancel)Object.defineProperty(globalThis,'cancelAnimationFrame',oldCancel);else Reflect.deleteProperty(globalThis,'cancelAnimationFrame');
  }
  return { passed:true, assertions };
}
