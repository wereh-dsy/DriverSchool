import { applyVehicleInteractionVisual } from '../src/vehicle/interaction/VehicleInteractionDefinition';
import { checkJeskoCockpit } from './jesko-cockpit-checks';
import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getVehicleDescriptor } from '../src/vehicle/VehicleCatalog';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { DriverCamera } from '../src/camera/DriverCamera';

const config=getVehicleDescriptor('koenigsegg-jesko-attack').visualConfig;
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.localClippingEnabled=true;renderer.setPixelRatio(1);renderer.setSize(1280,720);renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
document.body.style.margin='0';document.body.appendChild(renderer.domElement);
const scene=new T.Scene(),room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
const sky=new T.HemisphereLight(0xcbd9eb,0x4a423c,2),sun=new T.DirectionalLight(0xfff5e8,2.2);
sun.position.set(-3,7,-4);scene.add(sky,sun);
const road=new T.Mesh(new T.PlaneGeometry(16,500),new T.MeshStandardMaterial({color:0x373c40,roughness:.95}));
road.rotation.x=-Math.PI/2;road.position.set(0,-.015,-220);scene.add(road);
for(const x of [-3,3]){const line=new T.Mesh(new T.PlaneGeometry(.12,500),new T.MeshBasicMaterial({color:0xc6c8c4}));line.rotation.x=-Math.PI/2;line.position.set(x,-.014,-220);scene.add(line);}
const visual=new VehicleVisual(config);visual.root.position.y=config.staticBodyOffsetY??0;scene.add(visual.root);
const camera=new DriverCamera({driverEyePosition:new T.Vector3(...config.driverEyePosition)}).camera;
camera.layers.enableAll();camera.position.set(...config.driverEyePosition);
const views:Record<string,{night:boolean;yaw:number;pitch:number;steer:number;aspect:number;detail?:boolean;warnings?:boolean;off?:boolean;boot?:boolean}>={day:{night:false,yaw:0,pitch:0,steer:0,aspect:16/9},night:{night:true,yaw:0,pitch:0,steer:0,aspect:16/9},
  console:{night:false,yaw:-.30,pitch:-.18,steer:.5,aspect:16/9},narrow:{night:false,yaw:0,pitch:0,steer:0,aspect:4/3},
  consoleNight:{night:true,yaw:-.30,pitch:-.18,steer:0,aspect:16/9},
  detail:{night:false,yaw:0,pitch:0,steer:0,aspect:16/9,detail:true},
  detailNight:{night:true,yaw:0,pitch:0,steer:0,aspect:16/9,detail:true},
  steer:{night:false,yaw:0,pitch:0,steer:1.5,aspect:16/9},
  warnings:{night:true,yaw:0,pitch:0,steer:0,aspect:16/9,detail:true,warnings:true},
  startup:{night:true,yaw:0,pitch:0,steer:0,aspect:16/9,detail:true,boot:true},
  off:{night:false,yaw:0,pitch:0,steer:0,aspect:16/9,detail:true,off:true}};
Object.assign(window,{captureJeskoCockpit:(name:keyof typeof views)=>{
  const exterior=['exterior','doorOpen','windowOpen'].includes(name);
  const view=views[name]??views.day!;
  applyVehicleInteractionVisual(visual.interactionDefinition!,name==='doorOpen'?1:0,name==='windowOpen'?1:0);
  camera.position.set(...config.driverEyePosition);scene.background=new T.Color(view.night?0x080f19:0x93aec4);
  scene.environmentIntensity=view.night?.16:.75;sky.intensity=view.night?.25:2;sun.intensity=view.night?.08:2.2;
  renderer.setSize(view.aspect===4/3?960:1280,720);camera.aspect=view.aspect;camera.fov=view.detail?26:62;camera.updateProjectionMatrix();
  camera.rotation.set(view.pitch,view.yaw,0,'YXZ');visual.setSteeringWheelAngle(view.steer);
  if(view.detail)camera.lookAt(visual.root.getObjectByName('Jesko digital instrument face')!.getWorldPosition(new T.Vector3()));
  for(let i=0;i<(view.boot?8:45);i++)visual.updateInstruments({speedKmh:view.boot?0:187,rpm:view.boot?0:view.warnings?8500:6300,gear:'D5',ignitionOn:!view.off,engineRunning:!view.off,
    driveAvailable:true,fuelLevel:.68,coolantTemperatureC:94,ambientDaylight:view.night?0:1,
    activeSpoilerDeployment:1,indicators:{headlights:view.night,positionLights:true,absWarning:view.warnings,tcsActive:view.warnings,engineWarning:view.warnings,leftTurn:view.warnings,highBeam:view.warnings}},1/60);
  if(exterior){camera.position.set(-3.7,2.25,-4.8);camera.fov=46;camera.updateProjectionMatrix();camera.lookAt(0,.72,0);}
  renderer.render(scene,camera);
  return {png:renderer.domElement.toDataURL('image/png'),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries};
}});

Object.assign(window,{checkJeskoCockpit:()=>checkJeskoCockpit(visual,config)});
