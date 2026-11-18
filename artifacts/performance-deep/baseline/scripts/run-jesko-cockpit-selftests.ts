import { jeskoWindshieldPoint } from '../src/vehicle/visual/JeskoCanopy';
import * as T from 'three';
import { VehicleInteractionController } from '../src/vehicle/interaction/VehicleInteractionController';
import { applyVehicleInteractionVisual } from '../src/vehicle/interaction/VehicleInteractionDefinition';
import { writeFileSync } from 'node:fs';
import { getVehicleDescriptor } from '../src/vehicle/VehicleCatalog';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { checkJeskoCockpit } from './jesko-cockpit-checks';

const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:1,height:1,
  getContext:()=>new Proxy({}, {get:(_t,key)=>key==='measureText'?()=>({width:20}):key==='createLinearGradient'||key==='createRadialGradient'
    ?()=>({addColorStop:()=>{}}):()=>{},set:()=>true})})}});
const config=getVehicleDescriptor('koenigsegg-jesko-attack').visualConfig;
const visual=new VehicleVisual(config);
try {
  const report=checkJeskoCockpit(visual,config);
  const assert=(ok:boolean,label:string)=>{if(!ok)throw Error(label);};
  const windshield=visual.root.getObjectByName('Jesko wraparound windshield') as T.Mesh;
  assert(windshield.geometry.getAttribute('position').count===429,'windshield uses a curved 32 by 12 surface');
  assert(jeskoWindshieldPoint(1,0).z-jeskoWindshieldPoint(0,0).z>.15,'windshield wraps rearward at both sides');
  for(const sign of [-1,1]){
    const pillar=visual.cockpitRoot.getObjectByName(sign<0?'Left A-pillar':'Right A-pillar') as T.Mesh;
    const bounds=new T.Box3().setFromObject(pillar);
    for(let j=0;j<=12;j++)assert(bounds.containsPoint(jeskoWindshieldPoint(sign,j/12).add(new T.Vector3(-sign*.012,0,.012))),'inner pillar follows shared canopy datum');
  }
  const task=visual.root.getObjectByName('Jesko shielded footwell task light') as T.PointLight;
  const lit={speedKmh:0,rpm:1000,gear:'P',ignitionOn:true,indicators:{positionLights:true}};
  visual.updateInstruments({...lit,ambientDaylight:1},2);const dayLight=task.intensity;
  visual.updateInstruments({...lit,ambientDaylight:0},2);const nightLight=task.intensity;
  assert(nightLight>dayLight&&nightLight<=.022,'night task lighting is brighter but bounded');
  visual.updateInstruments({...lit,ignitionOn:false,ambientDaylight:0},2);
  assert(task.intensity<nightLight*.01,'task lighting fades off with cabin power');
  const definition=visual.interactionDefinition!;
  assert(!!definition,'Jesko registers shared interaction');
  const controller=new VehicleInteractionController();controller.configure(definition);
  assert(controller.requestExitVehicle(0).accepted&&!controller.requestExitVehicle(2).accepted,'stationary exit interlock');
  assert(controller.requestEnterVehicle(0,{x:-1.55,z:.20},{x:0,z:0,yaw:0}).accepted,'entry anchor is inside access zone');
  assert(!controller.requestEnterVehicle(0,{x:3,z:3},{x:0,z:0,yaw:0}).accepted,'remote entry refused');
  const door=definition.driverDoor.doorNode,window=definition.driverWindow;
  assert(!!door.getObjectByName('Left door card'),'interior door trim follows hinge');
  controller.toggleDriverDoor(0);controller.update(.55);
  assert(controller.driverDoorOpenFraction>0&&controller.driverDoorOpenFraction<1,'progressive opening');
  const fraction=controller.driverDoorOpenFraction;controller.toggleDriverDoor(0);
  assert(controller.driverDoorOpenFraction===fraction,'reversal preserves position');
  applyVehicleInteractionVisual(definition,1,0);visual.root.updateMatrixWorld(true);
  assert(definition.driverDoor.hingeNode.rotation.x<-1,'door lifts rather than only yawing');
  const glass=window.node.getObjectByName('Driver window glass') as T.Mesh;
  const top=new T.Vector3(-.55,1.165,-.39).sub(new T.Vector3(...definition.driverDoor.closedTransform.position));
  applyVehicleInteractionVisual(definition,0,1);visual.root.updateMatrixWorld(true);
  assert(window.beltClipPlane!.distanceToPoint(top.applyMatrix4(window.node.matrixWorld))<0,'lowered glass is below door belt clip');
  for(const amount of [0,.25,.5,.75,1]){
    applyVehicleInteractionVisual(definition,amount,.4);
    assert(window.beltClipPlane!.normal.toArray().every(Number.isFinite),'clip plane follows compound door pose');
  }
  applyVehicleInteractionVisual(definition,0,0);visual.root.updateMatrixWorld(true);
  assert(visual.getVisualBodyBounds().getSize(new T.Vector3()).x<=2.03001,'closed exterior width matches collider');
  const ordinary=new VehicleVisual(getVehicleDescriptor('executive-lwb-2t').visualConfig);
  const ordinaryDefinition=ordinary.interactionDefinition!;
  assert(ordinaryDefinition.driverDoor.openTransform.rotation[0]===0,'ordinary hinge retains yaw-only opening');ordinary.dispose();
  writeFileSync('artifacts/jesko-cockpit/visibility-results.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.failures.length)throw Error(report.failures.join('; '));
} finally {
  visual.dispose();
  if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');
}