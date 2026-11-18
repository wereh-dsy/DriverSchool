import * as T from 'three';
import {getVehicleDescriptor,createVehiclePhysicsConfig} from './VehicleCatalog';
import {VehicleVisual} from './visual/VehicleVisual';
import {VehicleAssetRegistry} from './visual/VehicleAssetRegistry';
import {VehicleInteractionController} from './interaction/VehicleInteractionController';
import {applyVehicleInteractionVisual} from './interaction/VehicleInteractionDefinition';
import {calculateElectricAudioMix} from '../audio/ElectricAudioMix';
import {evaluateCabinAcoustics} from '../audio/VehicleCabinAcoustics';
import {VehicleDynamics} from './physics/VehicleDynamics';
import type {ElectricPowertrain} from './powertrain/ElectricPowertrain';
import {createNeutralVehicleInputState} from '../input/VehicleInputState';
import {DEFAULT_DRIVER_FOV_DEGREES} from '../camera/DriverCamera';
import {SU7_PRIMARY_READOUT_HEIGHT} from './visual/SU7InstrumentGraphics';
import {cabinAmbientTarget} from './visual/CabinLightResponse';

/** Basic presentation/access smoke only. No performance tuning or full suites. */
export function runSU7PresentationSelfTest(){
  let assertions=0;const assert=(ok:boolean,text:string)=>{assertions++;if(!ok)throw Error('SU7 presentation: '+text);};
  const missing=typeof document==='undefined';
  if(missing)Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:1,height:1,getContext:()=>null})}});
  const d=getVehicleDescriptor('xiaomi-su7-max-2026'),assets=new VehicleAssetRegistry();
  const visual=new VehicleVisual(d.visualConfig,assets),other=new VehicleVisual(d.visualConfig,assets);
  try {
    const def=visual.interactionDefinition!;assert(!!def&&visual.hasDriverAccessVisual,'registered usable door/window definition');
    const access=new VehicleInteractionController();access.configure(def);
    assert(!access.requestExitVehicle(3).accepted&&access.requestExitVehicle(0).accepted,'moving exit is rejected, stationary exit accepted');
    assert(access.requestEnterVehicle(0,{x:-1.55,z:-.12},{x:0,z:0,yaw:0}).accepted,'authored entry anchor is reachable');
    assert(!access.requestEnterVehicle(0,{x:4,z:4},{x:0,z:0,yaw:0}).accepted,'far entry rejected');
    const card=visual.root.getObjectByName('SU7 driver door card')!;
    assert(!!card&&!!def.driverDoor.doorNode.getObjectById(card.id),'inner door card follows same hinge');
    assert(!!def.driverDoor.doorNode.getObjectByName('SU7 driver outer door skin'),'outer door is a moving panel');
    assert(!!def.driverDoor.doorNode.getObjectByName('left mirror optical folding hinge'),'optical mirror follows moving door');
    visual.root.updateMatrixWorld(true);const closed=card.getWorldPosition(new T.Vector3());
    access.openDriverDoor();for(let n=0;n<90;n++)access.update(1/120);
    applyVehicleInteractionVisual(def,access.driverDoorOpenFraction,0);visual.root.updateMatrixWorld(true);
    assert(card.getWorldPosition(new T.Vector3()).distanceTo(closed)>.3,'door animation moves real trim');
    const glassY=def.driverWindow.node.position.y;
    for(let n=0;n<300;n++)access.driverWindowDown(1/120);
    applyVehicleInteractionVisual(def,access.driverDoorOpenFraction,access.driverWindowOpenFraction);
    assert(access.driverWindowOpenFraction===1&&def.driverWindow.node.position.y<glassY-.4,'window lowers through full physical travel');
    assert(!!def.driverWindow.beltClipPlane&&def.driverWindow.beltClipPlane!==other.interactionDefinition!.driverWindow.beltClipPlane,'glass clips at belt with per-instance plane');
    access.closeDriverDoor();for(let n=0;n<150;n++)access.update(1/120);
    for(let n=0;n<300;n++)access.driverWindowUp(1/120);
    applyVehicleInteractionVisual(def,access.driverDoorOpenFraction,access.driverWindowOpenFraction);visual.root.updateMatrixWorld(true);
    assert(access.driverDoorOpenFraction===0&&access.driverWindowOpenFraction===0&&card.getWorldPosition(new T.Vector3()).distanceTo(closed)<1e-8,'door/window return to exact closed pose');
    const mesh=(name:string)=>visual.root.getObjectByName(name) as T.Mesh;
    const screen=mesh('SU7 isolated navigation display');
    assert(screen.material!==mesh('SU7 sculpted upper dashboard').material,'navigation material isolated from upholstery');
    const skins=['SU7 sculpted upper dashboard','SU7 wrapped passenger fascia','SU7 upholstered lower dashboard']
      .map(name=>mesh(name).geometry.getAttribute('position'));
    let seamGap=0;
    for(let row=0;row<25;row++)for(let layer=0;layer<2;layer++){
      const a=new T.Vector3().fromBufferAttribute(skins[layer]!,row*17);
      const b=new T.Vector3().fromBufferAttribute(skins[layer+1]!,row*17+16);
      seamGap=Math.max(seamGap,a.distanceTo(b));
    }
    assert(seamGap<1e-6,'dashboard skins meet along their complete shared seams');
    const screenSize=(screen.geometry as T.PlaneGeometry).parameters;
    assert(Math.abs(screenSize.width/screenSize.height-1024/620)<.01,'screen matches canvas aspect');
    const cluster=mesh('SU7 driver display');
    const camera=new T.PerspectiveCamera(DEFAULT_DRIVER_FOV_DEGREES,16/9,.025,100);
    camera.position.set(...d.visualConfig.driverEyePosition);camera.updateMatrixWorld(true);
    const clusterSize=(cluster.geometry as T.PlaneGeometry).parameters;
    const lower=cluster.localToWorld(new T.Vector3(-clusterSize.width/2,-clusterSize.height/2,0)).project(camera);
    const upper=cluster.localToWorld(new T.Vector3(clusterSize.width/2,clusterSize.height/2,0)).project(camera);
    const clusterPixels={width:(upper.x-lower.x)*1280/2,height:(upper.y-lower.y)*720/2};
    // The vector numeral has an explicit physical height, independent of OS font metrics.
    assert(clusterPixels.width>=250&&clusterPixels.height*SU7_PRIMARY_READOUT_HEIGHT/280>=35,'default 720p view retains a readable primary speed numeral');
    assert(!!mesh('SU7 wrapped instrument sun hood')&&!!mesh('SU7 angled instrument glass wing'),'instrument has an integrated sun hood and recessed glass wings');
    const wheel=visual.root.getObjectByName('SU7 steering wheel rim')!;
    const grip=(wheel as T.Mesh).geometry.getAttribute('position');
    let lowerGripMin=Infinity,lowerGripMax=-Infinity;
    for(let i=0;i<grip.count;i++)if(Math.abs(grip.getX(i))<.01&&grip.getY(i)<-.11){
      lowerGripMin=Math.min(lowerGripMin,grip.getY(i));lowerGripMax=Math.max(lowerGripMax,grip.getY(i));
    }
    assert(lowerGripMax-lowerGripMin>.030,'flat-bottom grip retains its full physical section');
    const stalkBox=new T.Box3();
    visual.root.traverse(o=>{if(o.name==='SU7 column stalk')stalkBox.union(new T.Box3().setFromObject(o,true));});
    let sweptClearance=Infinity;
    for(let i=0;i<8;i++){
      visual.setSteeringWheelAngle(i*Math.PI/4);visual.root.updateMatrixWorld(true);
      sweptClearance=Math.min(sweptClearance,new T.Box3().setFromObject(wheel,true).min.z-stalkBox.max.z);
    }
    visual.setSteeringWheelAngle(0);visual.root.updateMatrixWorld(true);
    assert(sweptClearance>.025,'turning grip clears the stationary column stalks by 25 mm');
    const ray=new T.Raycaster();
    for(const y of [-clusterSize.height*.40,0,clusterSize.height*.40]){
      const target=cluster.localToWorld(new T.Vector3(0,y,0));
      ray.set(camera.position,target.clone().sub(camera.position).normalize());ray.far=camera.position.distanceTo(target);
      assert(ray.intersectObject(wheel,true).length===0,'steering rim does not hide speed or lower instrument row');
    }
    const grain=mesh('SU7 sculpted upper dashboard').material as T.MeshStandardMaterial;
    assert(grain.roughnessMap?.name==='SU7 Nappa micrograin'&&grain.bumpMap===null,'physical-scale roughness grain avoids false dashboard bump facets');
    assert(grain instanceof T.MeshPhysicalMaterial&&grain.sheen>0&&grain.metalness===0,'upholstery uses dielectric roughness and grazing sheen');
    assert(grain.envMap?.name==='SU7 cabin window-aperture reflection probe'&&grain.envMap!==(other.root.getObjectByName('SU7 sculpted upper dashboard') as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>).material.envMap,'cabin reflection resources are isolated per vehicle instance');
    assert((mesh('SU7 long sculpted bonnet').material as T.MeshStandardMaterial).envMap===null,'cabin probe does not replace exterior/world reflection settings');
    assert(!!mesh('SU7 sculpted front headliner')&&!!mesh('SU7 interior A pillar'),'windshield surround has upholstered interior surfaces');
    assert(!mesh('SU7 panoramic windshield').castShadow&&!mesh('SU7 movable driver glass').castShadow,'clear glazing cannot cast an opaque cabin shadow');
    const guide=mesh('SU7 ambient dash ribbon'),guideUV=guide.geometry.getAttribute('uv');
    assert(guideUV.getY(0)===0&&guideUV.getY(1)===1&&guideUV.getX(0)===guideUV.getX(1),'light-guide diffusion runs across the strip, not along its length');
    const guideMaterial=guide.material as T.MeshBasicMaterial;
    const instrumentState={speedKmh:0,rpm:0,gear:'P',ignitionOn:true,ambientDaylight:.025};
    for(let n=0;n<20;n++)visual.updateInstruments(instrumentState,.1);
    const lit=guideMaterial.opacity;
    assert(Math.abs(lit-cabinAmbientTarget(d.visualConfig.interiorAmbientLighting!,true,true,.025))<.002,'night guides settle at the configured restrained brightness');
    for(let n=0;n<20;n++)visual.updateInstruments({...instrumentState,ignitionOn:false},.1);
    assert(guideMaterial.opacity<.001,'operational-off fades ambient guides to dark');
    let spillCount=0;visual.root.traverse(o=>{if(o instanceof T.PointLight){spillCount++;assert(!o.castShadow&&o.distance<=.85,'ambient spill stays local without additional shadow passes');}});
    assert(spillCount===2,'two bounded light-guide spill sources only');
    let triangles=0,invalid=0;const textures=new Set<T.Texture>();
    visual.root.traverse(o=>{if(o instanceof T.Mesh){const p=o.geometry.getAttribute('position');triangles+=(o.geometry.index?.count??p.count)/3;
      for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)))invalid++;
      for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);}});
    // Exterior detail work adds one immutable 1024×512 atlas; the geometry ceiling stays unchanged.
    const exteriorAtlas=(mesh('SU7 nose badge').material as T.MeshStandardMaterial).map;
    assert(invalid===0&&triangles<60000&&textures.size<=7&&exteriorAtlas?.name==='SU7 exterior detail atlas','bounded geometry and one shared exterior detail atlas');
    const voice=d.audioProfile!.electric!,profile=d.audioProfile!.cabinAcoustics!;
    const closedAcoustics=evaluateCabinAcoustics(profile,{windowPosition:0,doorOpenAmount:0,speedMetersPerSecond:10});
    const openAcoustics=evaluateCabinAcoustics(profile,{windowPosition:1,doorOpenAmount:0,speedMetersPerSecond:10});
    const options={vehicleSpeed:10,maximumRPM:22000,maximumTorque:528,frontMotorRPM:3400,voice,cockpit:true,driving:true,operational:true};
    const quiet=calculateElectricAudioMix(3400,220,{...options,cabinAcoustics:closedAcoustics});
    const open=calculateElectricAudioMix(3400,220,{...options,cabinAcoustics:openAcoustics});
    assert(open.road>quiet.road&&open.wind>quiet.wind&&open.motor>quiet.motor,'opening glass changes real acoustic mix');
    const legacy=calculateElectricAudioMix(3400,220,{...options,voice:undefined});
    assert(quiet.frequency!==legacy.frequency&&quiet.harmonicFrequency!==legacy.harmonicFrequency,'SU7 has independently calibrated EV voice');
    assert(calculateElectricAudioMix(0,0,{...options,vehicleSpeed:0}).motor===0,'no fake electric idle');
    assert(calculateElectricAudioMix(1000,50,{...options,vehicleSpeed:3}).pedestrian>0,'low speed exterior warning');
    const off=calculateElectricAudioMix(3400,220,{...options,operational:false});assert(off.motor===0&&off.pedestrian===0,'power-off silences propulsion/warning');
    const car=new VehicleDynamics<ElectricPowertrain>(createVehiclePhysicsConfig('xiaomi-su7-max-2026'),{driveSelector:'D'});
    const command={...createNeutralVehicleInputState(),throttle:.3};for(let n=0;n<120;n++)car.stepFixed(1/120,command);
    assert(car.speed>0&&!car.getSnapshot().recoveredFromInvalidState,'basic fixed-step drive still works');
    return {assertions,triangles,textures:textures.size,dashboardSeamGapMeters:seamGap,clusterPixelsAt720p:clusterPixels,steeringStalkClearanceMeters:sweptClearance,driverAccess:true,independentElectricVoice:true};
  }finally{visual.dispose();other.dispose();assets.dispose();if(missing)Reflect.deleteProperty(globalThis,'document');}
}
