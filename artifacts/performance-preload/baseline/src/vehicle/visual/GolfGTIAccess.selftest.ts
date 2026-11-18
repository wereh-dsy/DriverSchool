import * as T from 'three';
import { getVehicleDescriptor } from '../VehicleCatalog';
import { VehicleVisual } from './VehicleVisual';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { VehicleInteractionController } from '../interaction/VehicleInteractionController';
import { applyVehicleInteractionVisual } from '../interaction/VehicleInteractionDefinition';
import { driverExitWorldPoint } from '../../player/DriverEntryZone';
import {gtiSidePoint} from './GolfGTIExterior';

/** Golf's authored moving aperture, cached-glass ownership and existing walk/enter boundary. */
export function runGolfGTIAccessSelfTest() {
  let assertions=0;const assert=(ok:boolean,s:string)=>{assertions++;if(!ok)throw new Error('Golf access: '+s);};
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>new Proxy({}, {
    get:(_t,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true})})}});
  const assets=new VehicleAssetRegistry();let car:VehicleVisual|undefined,other:VehicleVisual|undefined;
  try {
    const config=getVehicleDescriptor('volkswagen-golf-gti').visualConfig;
    car=new VehicleVisual(config,assets);other=new VehicleVisual(config,assets);
    const def=car.interactionDefinition!,second=other.interactionDefinition!,door=def.driverDoor.doorNode;
    assert(!!def&&!!second,'both instances register the shared driver access contract');
    for(const name of [...config.driverAccess!.doorMountedPartNames!,...config.driverAccess!.doorMountedExteriorPartNames!])assert(!!door.getObjectByName(name),'door carries '+name);
    assert(def.driverWindow.beltClipPlane instanceof T.Plane&&def.driverWindow.beltClipPlane!==second.driverWindow.beltClipPlane,'per-instance glass clipping');
    const control=new VehicleInteractionController();control.configure(def);
    assert(!control.toggleDriverDoor(2).accepted&&!control.requestExitVehicle(2).accepted,'moving car prevents door toggle and exit');
    assert(control.toggleDriverDoor(0).accepted,'stationary door command');control.update(.34);
    assert(Math.abs(control.driverDoorOpenFraction-.5)<1e-6,'continuous half-open door');control.update(1);
    assert(control.driverDoorOpenFraction===1,'full open');control.closeDriverDoor();control.update(1);
    assert(control.driverDoorOpenFraction===0,'full close');
    control.driverWindowDown(1.05);control.stopDriverWindow();control.update(1);
    assert(Math.abs(control.driverWindowOpenFraction-.5)<1e-6,'hold-to-move glass stops halfway on release');
    applyVehicleInteractionVisual(def,0,0);car.root.updateMatrixWorld(true);
    const pane=door.getObjectByName('Left GTI front door glass') as T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>;
    const tipIndex=pane.geometry.getAttribute('position').count-1;
    const first=new T.Vector3().fromBufferAttribute(pane.geometry.getAttribute('position'),tipIndex).applyMatrix4(pane.matrixWorld);
    assert(Math.abs(def.driverWindow.beltClipPlane!.distanceToPoint(car.root.localToWorld(new T.Vector3(-.80,.945,-.20))))<1e-8,'belt clip lies at the real body belt height, not a twice-translated door height');
    const closedPaneOrigin=pane.getWorldPosition(new T.Vector3());
    const mirror=car.mirrorSurfaces.left.getWorldPosition(new T.Vector3());
    const rear=car.root.getObjectByName('Left GTI fixed rear door card')!,fixed=rear.getWorldPosition(new T.Vector3());
    applyVehicleInteractionVisual(def,0,.5);car.root.updateMatrixWorld(true);
    assert(Math.abs(pane.getWorldPosition(new T.Vector3()).y-closedPaneOrigin.y-def.driverWindow.localTravelDirection[1]*def.driverWindow.travelDistance*.5)<1e-6,'half window lowers by half the authored travel');
    const halfTop=new T.Vector3().fromBufferAttribute(pane.geometry.getAttribute('position'),tipIndex).applyMatrix4(pane.matrixWorld);
    assert(Math.abs(halfTop.x-gtiSidePoint(config,-1,halfTop.z,halfTop.y)[0])<.001,'descending glass stays aligned with the sloped door plane '+halfTop.toArray()+' expected '+gtiSidePoint(config,-1,halfTop.z,halfTop.y)[0]);
    assert(pane.material.clippingPlanes?.[0]===def.driverWindow.beltClipPlane,'rendering hides glass below the door belt');
    applyVehicleInteractionVisual(def,1,.5);car.root.updateMatrixWorld(true);
    const moved=new T.Vector3().fromBufferAttribute(pane.geometry.getAttribute('position'),tipIndex).applyMatrix4(pane.matrixWorld);
    assert(moved.distanceTo(first)>.7&&Math.abs(def.driverDoor.hingeNode.rotation.y+1.1)<1e-6,'real window and skin rotate with hinge');
    assert(car.mirrorSurfaces.left.getWorldPosition(new T.Vector3()).distanceTo(mirror)>.1,'optical mirror follows front door');
    assert(rear.getWorldPosition(new T.Vector3()).distanceTo(fixed)<1e-8,'rear door remains attached to body');
    assert(second.driverDoor.hingeNode.rotation.y===0&&second.driverWindow.node.position.length()===0,'cached second instance unaffected');
    const pose={x:8,z:-3,yaw:.65},exit=driverExitWorldPoint(pose,def);
    assert(control.requestExitVehicle(0).accepted&&control.requestEnterVehicle(0,exit,pose).accepted,'existing exit anchor also permits re-entry');
    assert(!control.requestEnterVehicle(0,{x:100,z:100},pose).accepted,'re-entry requires being beside driver door');
    // No original full-length left flank may seal the new opening.
    const ray=new T.Raycaster(new T.Vector3(-2,.60,-.12),new T.Vector3(1,0,0),0,1.5);ray.layers.enableAll();
    assert(!ray.intersectObject(car.root,true).some(h=>h.object.name.includes('door skin')||h.object.name==='Left GTI shaped door card'),'opened doorway has no stationary duplicate panel');
    return {assertions,scope:'driver-front door / window / existing exit and re-entry'};
  } finally {car?.dispose();other?.dispose();assets.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
}
