import fs from 'node:fs';
import { Vector3 } from 'three';
import { CityGround, type SurfaceQueryDebug } from '../../src/world/city/CityGround';
import { createDefaultVehiclePhysicsConfig } from '../../src/vehicle/config';
import { createNeutralVehicleInputState } from '../../src/input/VehicleInputState';
import { VehicleDynamics } from '../../src/vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../../src/vehicle/physics/VehicleContactSystem';
import { WHEEL_IDS } from '../../src/vehicle/physics/WheelContact';

const folder='artifacts/east-interchange-overlap-launch-fix';
fs.mkdirSync(folder,{recursive:true});
const playableFile=fs.readdirSync('dist/assets').find(name=>name.startsWith('city-main.runtime-'));
const source=process.argv.includes('--playable') ? JSON.parse(fs.readFileSync(`dist/assets/${playableFile}`,'utf8')).map
  : JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8'));
const roads=source.roads.filter((r: any)=>{
  const xs=r.centerline.map((p:any)=>p.x),zs=r.centerline.map((p:any)=>p.z);
  return Math.max(...xs)>=2100&&Math.min(...xs)<=2800&&Math.max(...zs)>=-400&&Math.min(...zs)<=100;
});
const ids=new Set(roads.map((r:any)=>r.id));
// Exact authored roads from the reported region, no rebuilding profiles or synthetic ramp.
const local={...source,regional:undefined,editing:undefined,roads,
  intersections:[],objects:[],signs:[],connectionPorts:[],
  roadLinks:source.roadLinks.filter((l:any)=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),
  environment:{...source.environment,landmarks:[],spawnPoints:[{id:'east-probe',position:{x:2675,y:6.04,z:-161.875},rotation:Math.PI/2}]}};
const DT=1/120,controls=createNeutralVehicleInputState(),config=createDefaultVehiclePhysicsConfig();
const phase=process.argv[2]??'before', speeds=process.argv[3]?process.argv[3].split(',').map(Number):[80,120,140];
const summaries=[];
for(const speed of speeds){
  const ground=new CityGround(local,{editor:true});
  Object.defineProperty(ground,'spawnPose',{value:{position:new Vector3(2675,6.04,-161.875),yawRadians:Math.PI/2}});
  const car=new VehicleDynamics(config,{x:2675,z:-161.875,yaw:Math.PI/2,speed:speed/3.6,gear:'N',engineRunning:false});
  const adapter=new VehicleContactSystem(ground,config); adapter.synchronize(car);
  let queries: (SurfaceQueryDebug & {wheel:string})[]=[];
  ground.surfaceQueryObserver=query=>queries.push({...query,wheel:WHEEL_IDS[queries.length%4]!});
  const observed=car as unknown as {resolvePenetration():boolean},resolve=observed.resolvePenetration.bind(car);
  let correction=0;
  observed.resolvePenetration=()=>{const before=car.chassisY,ret=resolve();correction+=car.chassisY-before;return ret;};
  const integrate=car.chassisMotion.integrate.bind(car.chassisMotion);
  let micro: unknown[]=[];
  car.chassisMotion.integrate=(...args)=>{
    const before={vY:car.verticalVelocity,pitchRate:car.chassisMotion.pitchAngularVelocity,rollRate:car.chassisMotion.rollAngularVelocity};
    const impulses=car.chassisMotion.contactImpulses.slice();
    const input=WHEEL_IDS.map(id=>{const w=args[4].wheels[id];return {id,length:w.suspensionLength,penetration:w.penetration,
      height:w.surfaceHeight,normal:{...w.surfaceNormal},Fz:w.normalLoad,spring:w.springForce,damper:w.damperForce,bump:w.bumpStopForce};});
    integrate(...args);
    micro.push({dt:args[0],before,after:{vY:car.verticalVelocity,pitchRate:car.chassisMotion.pitchAngularVelocity,rollRate:car.chassisMotion.rollAngularVelocity},
      input,impulses:car.chassisMotion.contactImpulses.map((v,i)=>v-impulses[i]!)});
  };
  const rows:any[]=[],firstByWheel=new Map<string,string|null>();
  let firstBad:any=null,maxImpulse=0,maxAY=0,maxPitchRate=0,maxRollRate=0,maxCorrection=0;
  let previous=car.getSnapshot();
  for(let step=0;step<120*24;step++){
    queries=[];micro=[];correction=0;
    const s=adapter.step(DT,controls,car);
    const wheels=Object.fromEntries(WHEEL_IDS.map((id,i)=>{const w=s.wheels[id],g=w.geometry!,p=g.surfacePoint,n=g.surfaceNormal,a=g.attachmentWorldPosition,axis=g.suspensionAxis;
      const required=((a.x-p.x)*n.x+(a.y-p.y)*n.y+(a.z-p.z)*n.z-config.wheelRadius)/Math.max(1e-6,-axis.x*n.x-axis.y*n.y-axis.z*n.z);
      return [id,{...w,requiredLength:required,mechanicalImpulse:car.chassisMotion.contactImpulses[i]}];}));
    const row={step,x:s.x,z:s.z,chassis:s.chassis,wheels,micro,queries,correction};rows.push(row);
    const jump=WHEEL_IDS.find(id=>s.wheels[id].geometry!.surfaceHeight-previous.wheels[id].geometry!.surfaceHeight>.1);
    if(!firstBad&&(jump||Math.abs(s.chassis.verticalAcceleration)>100||Math.abs(s.chassis.rollAngularVelocity!)>1)){
      firstBad={step,wheel:jump??'impulse',x:s.x,z:s.z,from:jump?previous.wheels[jump].geometry!.surfaceHeight:null,
        to:jump?s.wheels[jump].geometry!.surfaceHeight:null,vY:s.chassis.verticalVelocity,aY:s.chassis.verticalAcceleration,
        pitchRate:s.chassis.pitchAngularVelocity,rollRate:s.chassis.rollAngularVelocity,
        impulses:car.chassisMotion.contactImpulses.slice()};
    }
    for(const q of queries)firstByWheel.set(q.wheel,q.chosen);
    maxImpulse=Math.max(maxImpulse,...car.chassisMotion.contactImpulses);maxAY=Math.max(maxAY,Math.abs(s.chassis.verticalAcceleration));
    maxPitchRate=Math.max(maxPitchRate,Math.abs(s.chassis.pitchAngularVelocity!));maxRollRate=Math.max(maxRollRate,Math.abs(s.chassis.rollAngularVelocity!));
    maxCorrection=Math.max(maxCorrection,correction);previous=s;
    if(firstBad&&step>=firstBad.step+120||s.x<2200)break;
  }
  const summary={speed,phase,start:{x:2675,z:-161.875,yaw:Math.PI/2},steps:rows.length,firstBad,maxImpulse,maxAY,maxPitchRate,maxRollRate,maxCorrection,
    final:{x:previous.x,z:previous.z,y:previous.chassis.chassisY},safety:car.chassisMotion.safetyInterventions};
  summaries.push(summary);console.log(JSON.stringify(summary));
  fs.writeFileSync(`${folder}/${phase}-${speed}.json`,JSON.stringify(rows));ground.dispose();
}
fs.writeFileSync(`${folder}/${phase}-summary.json`,JSON.stringify(summaries,null,2));
