import fs from 'node:fs';import assert from 'node:assert/strict';
import {CityGround} from '../src/world/city/CityGround';
import {buildCityRoadNetwork} from '../src/world/city/CityRoadNetwork';
import {newCityMap,type CityMapData} from '../src/world/city/CityMapData';
import {roadPoints,sampleAt,polylineLength} from '../src/world/city/geometry';
import {bounds,project} from '../src/editor/EditorGeometry';
import {VehicleDynamics} from '../src/vehicle/physics/VehicleDynamics';
import {VehicleContactSystem} from '../src/vehicle/physics/VehicleContactSystem';
import {VehiclePhysicsBlackBox} from '../src/vehicle/diagnostics/VehiclePhysicsBlackBox';
import {createTeslaModel3PhysicsConfig} from '../src/vehicle/config/teslaModel3PhysicsConfig';
import {createNeutralVehicleInputState} from '../src/input/VehicleInputState';
import {WHEEL_IDS} from '../src/vehicle/physics/WheelContact';

const dir='artifacts/map-elevation-seam-audit',before:CityMapData=JSON.parse(fs.readFileSync(dir+'/continuation-before-map.json','utf8')),after:CityMapData=JSON.parse(fs.readFileSync(process.argv[2]??'src/world/regional/regional-main.json','utf8'));
type Route={name:string;road:string;start:number;length:number;speed:number;straight?:{x:number;z:number;yaw:number}};
const works=after.roads.find(r=>r.id==='v8-port-works-c91')!,logistics=after.roads.find(r=>r.id==='v4-south-logistics-east')!;
const bendStation=project(roadPoints(logistics),{x:2380,z:1822}).along;
const routes:Route[]=[
  {name:'shared-ground-junction',road:'v91-ew-1-b-3',start:0,length:55,speed:50,straight:{x:1145,z:-198,yaw:-Math.PI/2}},
  {name:'airport-ramp-terminal',road:'regional:v3:airport-distributor:S-to-W-turbine',start:8,length:45,speed:40},
  {name:'depressed-junction-landing',road:works.id,start:polylineLength(roadPoints(works))-45,length:42,speed:30},
  {name:'depressed-crossing-approach',road:works.id,start:0,length:105,speed:30},
  {name:'graded-ribbon-bend',road:logistics.id,start:Math.max(0,bendStation-12),length:24,speed:20},
];
function localMap(map:CityMapData,route:Route){
  const r=map.roads.find(r=>r.id===route.road)!,path=roadPoints(r),a=sampleAt(path,route.start).point,b=sampleAt(path,Math.min(polylineLength(path),route.start+route.length)).point,area=bounds([a,b,...(route.straight?[{x:route.straight.x,z:route.straight.z},{x:route.straight.x+route.length,z:route.straight.z}]:[])],100);
  const ids=new Set(map.roads.filter(r=>{const b=bounds(roadPoints(r),15);return b.minX<=area.maxX&&b.maxX>=area.minX&&b.minZ<=area.maxZ&&b.maxZ>=area.minZ||r.id===route.road;}).map(r=>r.id));
  for(const j of map.intersections)if(j.connections.some(c=>ids.has(c.roadId)))for(const c of j.connections)ids.add(c.roadId);
  for(let k=0;k<6;k++)for(const road of map.roads)if(ids.has(road.id)&&road.highwayTransition){ids.add(road.highwayTransition.mainRoadId);ids.add(road.highwayTransition.decisionId);}
  const roads=map.roads.filter(r=>ids.has(r.id));return {...newCityMap(),id:map.id,version:map.version,roadNames:map.roadNames,roads,intersections:map.intersections.filter(j=>j.connections.every(c=>ids.has(c.roadId))),roadLinks:map.roadLinks?.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),bounds:bounds(roads.flatMap(roadPoints),20),environment:{districts:[],metadata:map.environment.metadata,spawnPoints:[{id:'seam',position:a,rotation:0}]}};
}
function drive(map:CityMapData,route:Route,label:string){
  // Preserve full-map junction footprints; loading a cropped fixture would derive different reaches.
  const local=localMap(map,route),ground=new CityGround(local,{editor:true,runtime:{map:local,roadNetwork:buildCityRoadNetwork(local)}}),config=createTeslaModel3PhysicsConfig(),path=roadPoints(map.roads.find(r=>r.id===route.road)!),start=sampleAt(path,route.start),speed=route.speed/3.6,dt=1/120;
  const x=route.straight?.x??start.point.x,z=route.straight?.z??start.point.z,yaw=route.straight?.yaw??Math.atan2(-start.tangent.x,-start.tangent.z);
  const car=new VehicleDynamics(config,{x,z,yaw,speed,driveSelector:'N',engineRunning:false}),adapter=new VehicleContactSystem(ground,config);adapter.collisionSystem.setColliders([]);adapter.synchronize(car);
  car.verticalVelocity=(route.straight?0:start.tangent.y??0)*speed;
  const box=new VehiclePhysicsBlackBox({mapId:map.id,mapName:map.name,mapVersion:map.version,vehicleId:'tesla-model-3-rwd',vehicleConfigVersion:2,buildVersion:label+'-'+route.name});box.arm();adapter.blackBox=box;
  const input=createNeutralVehicleInputState(),previous=new Map<string,{x:number;z:number;height:number;nx:number;ny:number;nz:number;ref?:string;grounded:boolean}>();
  let state=car.getSnapshot(),minGrounded=4,airborneTransitions=0,maxImpulse=0,maxResidual=0,maxTrackingError=0,steps=0;
  try{
    const count=Math.ceil(route.length/speed/dt);
    for(;steps<count;steps++){
      car.speed=speed;
      if(!route.straight){const hit=project(path,state),target=sampleAt(path,Math.min(polylineLength(path),hit.along+Math.max(4,speed*.6))).point,desired=Math.atan2(-(target.x-state.x),-(target.z-state.z)),error=Math.atan2(Math.sin(desired-state.yaw),Math.cos(desired-state.yaw));input.steering=Math.max(-1,Math.min(1,-error*2.5+state.yawRate*.4));maxTrackingError=Math.max(maxTrackingError,hit.distance);}
      state=adapter.step(dt,input,car);let grounded=0;
      for(const id of WHEEL_IDS){const c=adapter.wheelContacts![id],g=state.wheels[id].grounded!==false,last=previous.get(id);if(g)grounded++;if(last){if(last.grounded&&!g)airborneTransitions++;
          if(last.ref!==c.reference?.surfaceId){const expected=last.height-(last.nx*(c.x-last.x)+last.nz*(c.z-last.z))/Math.max(.1,last.ny);maxResidual=Math.max(maxResidual,Math.abs(c.height-expected));}}
        previous.set(id,{x:c.x,z:c.z,height:c.height,nx:c.normal.x,ny:c.normal.y,nz:c.normal.z,ref:c.reference?.surfaceId,grounded:g});
      }
      minGrounded=Math.min(minGrounded,grounded);maxImpulse=Math.max(maxImpulse,...car.chassisMotion.contactImpulses);
    }
    box.requestManualTrigger();adapter.step(dt,input,car);box.freezeInterrupted('short pavement contact replay complete');const trace=box.createExport();
    const heightJumpEvents=trace.events.filter(e=>e.type==='surface-height-jump'||(e.detail as {heightJump?:boolean})?.heightJump).length;
    const row={name:route.name,road:route.road,speedKph:route.speed,seconds:steps*dt,minGrounded,airborneTransitions,heightJumpEvents,maxSurfaceResidual:maxResidual,rejectedSamples:adapter.supportContinuity.rejectedSamples,maxMechanicalImpulse:maxImpulse,safetyEvents:car.chassisMotion.safetyInterventions,maxTrackingError};
    fs.writeFileSync(`${dir}/contact-${label}-${route.name}.json`,JSON.stringify(trace));return row;
  }finally{ground.dispose();}
}
const rows=routes.map(route=>({before:drive(before,route,'before'),after:drive(after,route,'after')}));
const result={valid:false,scope:'Five short actual vehicle contact regressions, solid barriers excluded; preset longitudinal speed and normal steering path; no full suites',rows};
fs.writeFileSync(dir+'/continuation-contact-regression.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
for(const {after:a}of rows){assert(a.maxTrackingError<1.5,`${a.name}: trajectory stayed on the intended road`);assert(a.heightJumpEvents===0&&a.airborneTransitions===0&&a.minGrounded===4,`${a.name}: no surface-height-jump/airborne seam bounce`);assert(a.rejectedSamples===0&&a.maxMechanicalImpulse<1e-5&&a.safetyEvents===0,`${a.name}: no rejection storm, mechanical impulse or safety event`);}
result.valid=true;fs.writeFileSync(dir+'/continuation-contact-regression.json',JSON.stringify(result,null,2));
