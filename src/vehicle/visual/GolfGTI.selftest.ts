import * as T from 'three';
import { createVehiclePhysicsConfig, getVehicleDescriptor, getNextVehicleId, isVehicleId } from '../VehicleCatalog';
import { localWheelPositions, VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { SuspensionSystem } from '../physics/SuspensionSystem';
import { chassisBodyPose } from '../physics/WheelPhysicsState';
import { VehicleVisual } from './VehicleVisual';
import { VehicleLighting } from './VehicleLighting';
import { VehicleLightingController } from '../control/VehicleLightingController';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { SharedVehicleData } from '../SharedVehicleData';
import { DrivingSceneDisplayContext } from './DrivingSceneDisplayContext';
import { createStaticOBBCollider } from '../physics/CollisionSystem';
import { computePlanarMirrorView, createPlanarMirrorViewComputation } from '../../camera/MirrorMath';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import type { GolfGTIInstruments } from './GolfGTIDisplays';

/** The authored cabin has a flattened rim and surface shells, rather than the legacy box layout. */
export function runGolfGTIStructureSelfTest(visual: VehicleVisual) {
  let assertions = 0, closureRays = 0, wheelClearanceRays = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error('Golf GTI structure: ' + message); };
  const v = visual.config;
  visual.root.updateMatrixWorld(true);
  const column = visual.root.getObjectByName('GTI steering column') as T.Mesh<T.CylinderGeometry> | undefined;
  assert(column instanceof T.Mesh && column.geometry instanceof T.CylinderGeometry, 'physical steering column exists');
  const ends = [-1, 1].map(sign => new T.Vector3(0, sign * column!.geometry.parameters.height / 2, 0).applyMatrix4(column!.matrixWorld));
  const hub = visual.root.localToWorld(new T.Vector3(...v.steeringWheelPosition));
  const mount = visual.root.localToWorld(new T.Vector3(...v.steeringColumnMountPosition!));
  assert(Math.min(...ends.map(p => p.distanceTo(hub))) < .03, 'column joins steering hub');
  assert(Math.min(...ends.map(p => p.distanceTo(mount))) < 1e-8, 'column reaches configured dashboard mount');
  const axis = new T.Vector3(0, 0, -1).transformDirection(visual.cockpitRoot.steeringWheelBase.matrixWorld);
  assert(mount.clone().sub(hub).normalize().dot(axis) > .999, 'column and animated wheel axes agree');
  const rim = visual.root.getObjectByName('GTI flat bottom leather wheel rim') as T.Mesh<T.TorusGeometry> | undefined;
  assert(rim instanceof T.Mesh && rim.geometry instanceof T.TorusGeometry, 'dedicated wheel rim exists');
  const diameter = (rim!.geometry.parameters.radius + rim!.geometry.parameters.tube) * 2;
  assert(diameter >= .35 && diameter <= .39 && rim!.geometry.parameters.arc === 2 * Math.PI, 'closed full-size steering rim');
  rim!.geometry.computeBoundingBox();
  const rimBounds = rim!.geometry.boundingBox!;
  assert(rimBounds.min.y > -v.steeringWheelRadius && rimBounds.max.y > v.steeringWheelRadius,
    'authored flat bottom retains its full upper arc');
  const eye = visual.root.localToWorld(new T.Vector3(...v.driverEyePosition));
  const ray = new T.Raycaster(); ray.layers.enableAll();
  const obstructions: T.Mesh[] = [];
  visual.root.traverse(o => {
    if (o instanceof T.Mesh && !visual.cockpitRoot.steeringWheelBase.getObjectById(o.id)) obstructions.push(o);
  });
  try {
    for (const angle of [0, Math.PI * .25, Math.PI * .5, Math.PI, -Math.PI * .5]) {
      visual.setSteeringWheelAngle(angle); visual.root.updateMatrixWorld(true);
      for (let step = 0; step < 24; step++) {
        const theta = step / 24 * Math.PI * 2, radius = rim!.geometry.parameters.radius;
        const y = Math.sin(theta) * radius;
        const target = rim!.localToWorld(new T.Vector3(Math.cos(theta) * radius, y < -.132 ? -.132 + (y + .132) * .35 : y, 0));
        ray.set(eye, target.clone().sub(eye).normalize()); ray.far = eye.distanceTo(target) - .002;
        assert(ray.intersectObjects(obstructions, false).length === 0, 'steering rim remains clear of cabin at ' + angle + '/' + step);
        wheelClearanceRays++;
      }
    }
  } finally { visual.setSteeringWheelAngle(0); visual.root.updateMatrixWorld(true); }
  const floor = visual.root.getObjectByName('GTI continuous carpet floor') as T.Mesh | undefined;
  assert(floor instanceof T.Mesh, 'continuous cabin floor exists');
  floor!.geometry.computeBoundingBox();
  assert(floor!.geometry.boundingBox!.getSize(new T.Vector3()).y <= .03, 'floor remains a thin surface');
  // Lower trim/footwell closure rays. Side-window sightlines intentionally stay open.
  ray.far = 3;
  for (const dir of [[0,-.5,-1],[.7,-.8,-1],[-.7,-.8,-1],[0,1,0],[1,-.5,0],[-1,-1,0]]) {
    ray.set(eye,new T.Vector3(...dir as [number,number,number]).transformDirection(visual.root.matrixWorld));
    assert(ray.intersectObject(visual.cockpitRoot,true).length > 0, 'cabin closure ' + dir.join(',')); closureRays++;
  }
  const face = visual.root.getObjectByName('GTI live digital face')!;
  for (const [name,x,y] of [['speed',0,.044],['gear',0,-.069],['mode',0,.078],['rpm',-.15,0]] as const) {
    const target = face.localToWorld(new T.Vector3(x,y,0)); ray.set(eye,target.clone().sub(eye).normalize());
    ray.far = target.distanceTo(eye) - .002;
    assert(ray.intersectObject(visual.root,true).length === 0,'unobstructed instrument '+name);
  }
  // Recessed trim must leave both display corners and the textured vents visible.
  const centerFace = visual.root.getObjectByName('GTI map car TPMS parking touchscreen')!;
  for (const screen of [face,centerFace]) for (const x of [-1,1]) for (const y of [-1,1]) {
    const target = screen.localToWorld(new T.Vector3(x * (screen === face ? .23 : .14), y * (screen === face ? .078 : .075), 0));
    ray.set(eye,target.clone().sub(eye).normalize());ray.far=target.distanceTo(eye)-.002;
    const cornerHits=ray.intersectObject(visual.root,true);
    assert(cornerHits.length===0,'recess leaves screen corner visible '+screen.name+'/'+x+'/'+y+': '+cornerHits.map(hit=>hit.object.name+' at '+hit.point.toArray().join(',')).join(';'));
  }
  for(const x of [-.67,.05,.26,.63]) {
    const side=(x/(v.cabin.width/2-.01))**4;
    const target=visual.root.localToWorld(new T.Vector3(x,.710-.006*side,-.500-.012*side));
    ray.set(eye,target.clone().sub(eye).normalize());ray.far=target.distanceTo(eye)-.001;
    assert(ray.intersectObject(visual.root,true).length===0,'dashboard leaves textured vent surface visible '+x);
  }
  const mesh=(name:string)=>visual.root.getObjectByName(name) as T.Mesh;
  const bounds=(name:string)=>new T.Box3().setFromObject(mesh(name));
  const upper=bounds('GTI continuous sculpted upper dashboard'),trim=bounds('GTI projecting technical trim shelf');
  const vent=bounds('GTI recessed horizontal vent atlas'),lower=bounds('GTI receding lower dash and glovebox');
  assert(upper.max.z-upper.min.z>.35&&upper.max.y<1.025,'deep, restrained upper dashboard shell');
  assert(trim.max.z-vent.min.z>.045,'trim shelf is proud of the vent face');
  assert(face.getWorldPosition(new T.Vector3()).z<trim.min.z-.05,'instrument glass sits deeper than the transverse trim');
  assert(lower.max.z-lower.min.z>.22&&lower.min.z<vent.min.z-.20,'lower dash recedes toward the firewall');
  assert(!visual.root.getObjectByName('GTI integrated screen and climate carrier'),'massive waterfall carrier removed');
  const housing=bounds('GTI centre display recessed housing'),pedestal=bounds('GTI center display pedestal');
  assert(housing.max.z-housing.min.z>.025&&housing.max.z-housing.min.z<.08,'floating display has a thin physical rear housing');
  assert(pedestal.intersectsBox(housing)&&pedestal.min.y<trim.max.y+.02,'display pedestal joins housing and trim');
  const down=(x:number,z:number)=>{
    ray.set(visual.root.localToWorld(new T.Vector3(x,.70,z)),new T.Vector3(0,-1,0));ray.far=.40;
    return ray.intersectObject(visual.cockpitRoot,true)[0]?.point.y??Infinity;
  };
  const tray=down(.04,-.20),island=down(.025,.25),phone=down(.17,.25);
  assert(tray>.44&&tray<.49,'front storage tray has real recessed geometry');
  assert(island-phone>.015,'phone channel is lower than the shifter island');
  const selector=bounds('GTI compact shift by wire selector');
  assert(selector.max.y-selector.min.y<.06,'short electronic selector replaces tall mechanical lever');
  for(const name of ['GTI continuous sculpted upper dashboard','GTI projecting technical trim shelf','GTI rubber storage and USB atlas','Driver GTI check cushion surface']) {
    const mat=mesh(name).material as T.MeshStandardMaterial;
    assert(!!mat.map&&!!mat.normalMap&&!!mat.roughnessMap&&!!mat.aoMap,'shared PBR surface maps '+name);
    assert(mat.map!.colorSpace===T.SRGBColorSpace&&mat.normalMap!.colorSpace===T.NoColorSpace&&mat.roughnessMap!.colorSpace===T.NoColorSpace,'correct color and linear channels '+name);
  }
  for (const side of ['left','right'] as const) {
    const m = visual.getMirrorWorldTransform(side);
    assert(computePlanarMirrorView({eye,center:m.position,right:new T.Vector3(1,0,0).applyQuaternion(m.quaternion),
      up:new T.Vector3(0,1,0).applyQuaternion(m.quaternion),normal:m.normal,size:m.size,near:.05,far:100},createPlanarMirrorViewComputation()).valid,'usable optical mirror '+side);
  }
  return { assertions, closureRays, wheelClearanceRays };
}

export function runGolfGTISelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error('Golf GTI: ' + message); };
  const previous = Object.getOwnPropertyDescriptor(globalThis,'document');
  const canvases: { texts: string[]; width: number; height: number }[] = [];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:() => {
    const cv = {texts:[] as string[],width:0,height:0,getContext:() => ctx};
    const ctx = new Proxy<Record<string,unknown>>({}, {get(target,key:string) {
      if (key in target) return target[key];
      if (key === 'fillText') return (s:string) => cv.texts.push(s);
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({addColorStop:() => undefined});
      return (...args:unknown[]) => { if (args.some(v => typeof v === 'number' && !Number.isFinite(v))) throw new Error('Nonfinite canvas '+key); };
    },set(target,key:string,value) {target[key] = value; return true;} });
    canvases.push(cv); return cv;
  }}});
  const assets = new VehicleAssetRegistry(); let visual: VehicleVisual | undefined, second: VehicleVisual | undefined, lights: VehicleLighting | undefined;
  const shared = new SharedVehicleData({lanes:true,navigation:true,proximity:true,tpms:true});
  const display = new DrivingSceneDisplayContext({lanes:true,proximity:true},shared);
  try {
    const d = getVehicleDescriptor('volkswagen-golf-gti'), c = createVehiclePhysicsConfig(d.id), v = d.visualConfig;
    validateVehiclePlatformConfig(c,v);
    assert(isVehicleId(d.id) && getNextVehicleId('porsche-taycan-4s') === d.id, 'stable selection/save identifier');
    for (const key of ['length','width','height','wheelBase','frontTrackWidth','rearTrackWidth','wheelRadius','wheelWidth'] as const)
      assert(c[key] === v.dimensions[key], 'shared physical dimensions '+key);
    assert(c.engine.displacementL === 2 && c.engine.cylinderCount === 4 && c.transmission.type === 'DCT' && Object.keys(c.transmission.gearRatios).length === 7,'2.0T four cylinder seven DCT');
    assert(c.frontTorqueSplit === 1 && c.rearTorqueSplit === 0 && !c.awd && !!c.electronicDifferential,'FWD front eDiff, no AWD');
    assert(d.capabilities.tpms && d.capabilities.lka && d.capabilities.lcc && !d.capabilities.acc && !d.capabilities.bsd,'supported platform functions');
    for (let i = 0; i < 6; i++) {
      const rpm = (mode:'ECO'|'NORMAL'|'SPORT') => c.driveModes![mode]!.shiftStrategy!.map[i]!.upshiftRPM;
      assert(rpm('ECO') < rpm('NORMAL') && rpm('NORMAL') < rpm('SPORT'),'mode schedule ordering '+i);
    }
    c.engine.torqueCurve[0]!.torque = 1;
    assert(createVehiclePhysicsConfig(d.id).engine.torqueCurve[0]!.torque !== 1,'spawn configuration detached');
    VehicleVisual.prepareAssets(v,assets); visual = new VehicleVisual(v,assets); lights = new VehicleLighting(visual); visual.root.updateMatrixWorld(true);
    const body = visual.getVisualBodyBounds(), size = body.getSize(new T.Vector3());
    assert(size.x <= v.vehicleWidth + .025 && size.z <= v.vehicleLength + .04 && body.max.y <= v.dimensions.height + .005,
      'exterior bounds aligned '+size.toArray().join(',')+' top='+body.max.y);
    const rest = new SuspensionSystem(d.physicsConfig).getSnapshot();
    const poseAtRest = chassisBodyPose(rest.chassis,v.staticBodyOffsetY);
    visual.setWorldPose(0,poseAtRest.y,0,0,poseAtRest.pitch,poseAtRest.roll);
    visual.root.updateMatrixWorld(true);
    let floorY = Infinity;
    visual.exteriorRoot.traverse(o => {
      if (o instanceof T.Mesh && o.userData.vehicleBodyPart === 'main-shell') floorY = Math.min(floorY,new T.Box3().setFromObject(o).min.y);
    });
    assert(Math.abs(floorY-d.physicsConfig.suspension.rideHeight)<1e-6,'metadata locates visible underfloor at loaded ride height: '+floorY);
    visual.setWorldPose(0,0,0,0); visual.root.updateMatrixWorld(true);
    const anchors = localWheelPositions(v.dimensions);
    for (const id of VEHICLE_WHEEL_IDS) {
      const a = anchors[id]; assert(visual.wheelPivots[id].position.distanceTo(new T.Vector3(a.x,a.y-(v.staticBodyOffsetY??0),a.z)) < 1e-8,'physical wheel anchor '+id);
    }
    let meshes = 0, vertices = 0; const materials = new Set<T.Material>(), textures = new Set<T.Texture>();
    visual.root.traverse(o => { if (!(o instanceof T.Mesh)) return; meshes++; const p = o.geometry.getAttribute('position'); vertices += p.count;
      for(let i=0;i<p.count;i++) if (![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite)) throw new Error('Nonfinite mesh '+o.name);
      for(const m of Array.isArray(o.material)?o.material:[o.material]) { materials.add(m); Object.values(m).forEach(v => {if(v instanceof T.Texture) textures.add(v);}); }
    });
    assert(meshes < 150 && materials.size < 55 && vertices < 35000,'surface production resource budget '+meshes+'/'+materials.size+'/'+vertices);
    assert(!visual.root.getObjectByName('Simplified cabin seats'),'dedicated front cabin');
    const structure = runGolfGTIStructureSelfTest(visual); assertions += structure.assertions;
    const ray = new T.Raycaster(); ray.layers.enableAll(); const eye = new T.Vector3(...v.driverEyePosition);
    const controller = new VehicleLightingController(), neutral = createNeutralVehicleInputState(); controller.setMainLightMode('high');
    const state = controller.update(0,{...neutral,hazard:true,brake:.5},{ignitionOn:true,actualGear:'R',steeringWheelAngle:0}); lights.applyState(state,true);
    for(const key of ['head','position','tail','brake','reverse','left','right']) {
      const modules:T.Mesh[]=[]; visual.exteriorRoot.traverse(o => {if(o instanceof T.Mesh && o.userData.lightingOutput === key) modules.push(o);});
      assert(modules.length > 0 && modules.every(m => (m.material as T.MeshStandardMaterial).emissiveIntensity > 0),'controller bound lamps '+key);
    }
    lights.applyState({...state,brakeLight:false,reverseLight:false,leftBlinkOn:false,rightBlinkOn:false},false);
    assert((visual.root.getObjectByName('Left GTI low high module') as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>).material.emissiveIntensity === 0,'ignition off extinguishes main lamps');
    const car = new VehicleDynamics(createVehiclePhysicsConfig(d.id),{driveSelector:'D',gear:1});
    let zeroTo100 = 0, s = car.getSnapshot();
    for(let step=0;step<1800;step++) {
      s = car.stepFixed(1/120,{...neutral,throttle:1});
      if (!Number.isFinite(s.speed) || !Number.isFinite(s.rpm) || s.recoveredFromInvalidState) throw new Error('Nonfinite driving physics');
      if(!zeroTo100 && s.speed*3.6 >= 100) zeroTo100=(step+1)/120;
    }
    assert(s.transmission.type === 'DCT' && zeroTo100 > 4 && zeroTo100 < 15,'integrated driving and automatic upshifts, 0-100='+zeroTo100);
    assert(s.differential.axle === 'front' && !s.rearDifferential && !s.awd,'runtime propulsion stays on the front axle');
    const firstUpshiftRPM = {} as Record<'ECO'|'NORMAL'|'SPORT',number>;
    for (const mode of ['ECO','NORMAL','SPORT'] as const) {
      const config=createVehiclePhysicsConfig(d.id); config.defaultDriveMode=mode;
      const probe=new VehicleDynamics(config,{driveSelector:'D',gear:1}); let previousRPM=0;
      for (let step=0;step<3600;step++) {
        const next=probe.stepFixed(1/120,{...neutral,throttle:.25});
        if (next.transmission.currentPhysicalGear===2) {firstUpshiftRPM[mode]=previousRPM; break;} previousRPM=next.rpm;
      }
      const end=probe.getSnapshot();
      assert(firstUpshiftRPM[mode]>1000 && firstUpshiftRPM[mode]<4000,'light throttle automatic upshift '+mode+' rpm='+firstUpshiftRPM[mode]+' final='+end.rpm+'/'+end.speedKmh+'/'+end.transmission.currentPhysicalGear);
    }
    assert(firstUpshiftRPM.ECO<firstUpshiftRPM.NORMAL && firstUpshiftRPM.NORMAL<firstUpshiftRPM.SPORT,'actual economical/normal/sport upshift ordering');
    const accelerationEndSpeed=s.speed*3.6;
    for (let step=0;step<1200;step++) s=car.stepFixed(1/120,{...neutral,brake:1});
    assert(Math.abs(s.speed)<.3,'service brakes stop the spawned Golf');
    assert(car.requestDriveSelector('R',1),'reverse selector brake interlock');
    for (let step=0;step<480;step++) s=car.stepFixed(1/120,{...neutral,throttle:.5});
    assert(s.speed<-.5 && s.transmission.currentPhysicalGear==='R','physical reverse propulsion');
    assert(s.tpmsState.available && s.tpmsState.frontLeft.valid,'physical TPMS sensor'); shared.publishTPMS(s.tpmsState);
    const network:RoadNetworkData = {mapId:'gti-test',bounds:{minimumX:-30,maximumX:30,minimumZ:-100,maximumZ:100},intersections:[],
      segments:[{id:'road',centerline:[{x:0,z:90},{x:0,z:-90}],width:7,laneWidth:3.5,laneCountPerDirection:1,length:180,travelDirection:'two-way'}]};
    const pose={x:1.75,z:0,y:0,yaw:0,width:v.vehicleWidth,length:v.vehicleLength};
    const obstacle=createStaticOBBCollider({id:'parking',x:pose.x,z:-3,width:.5,length:.5,minHeight:0,maxHeight:1}); let queries=0;
    shared.update(0,pose,'D',6,true,network,()=>{queries++;return[obstacle];}); display.update(0,pose,'D',6,true,network,()=>{throw new Error('adapter must borrow data');});
    assert(display.data.lanes.length === 2 && display.data.map.available && queries === 1,'borrowed map lane obstacle observations');
    const telemetry={ignitionOn:true,engineRunning:true,speedKmh:87,rpm:3100,gear:'D4',driveMode:'SPORT' as const,
      fuelLevel:.42,coolantTemperatureC:93,cruiseTargetSpeedKmh:90,tpmsState:s.tpmsState,sharedVehicle:shared,
      drivingScene:display.data,ambientDaylight:.025,outsideTemperatureC:17.5,indicators:{headlights:true,cruise:true}};
    visual.updateInstruments(telemetry,1);
    const cv=canvases.find(cv=>cv.width===1280&&cv.height===480)!;
    assert(['87','D4','SPORT','42 %','93 °C','90','17.5 °C'].every(text=>cv.texts.includes(text)),'live instrument telemetry');
    const center=visual.cockpitRoot.gtiCabin!.center;
    const centerScreen=visual.root.getObjectByName('GTI map car TPMS parking touchscreen')!;
    const tabTarget=centerScreen.localToWorld(new T.Vector3((.38-.5)*.305,(.95-.5)*.179,0));
    ray.set(eye,tabTarget.sub(eye).normalize());
    assert(visual.cockpitRoot.handleDisplayClick(ray) && center.page==='car','scene ray reaches the center display tabs');
    assert(center.click(new T.Vector2(.63,.95)) && center.page==='tyres','touch tabs');
    visual.updateInstruments(telemetry,1);
    const centerCV=canvases.find(cv=>cv.width===1024&&cv.height===600)!;
    assert(centerCV.texts.includes(String(s.tpmsState.frontLeft.pressureKPa)),'display uses measured kPa');
    shared.update(0,pose,'R',0,true,network,()=>[obstacle]); display.update(0,pose,'R',0,true,network,()=>[]);
    visual.updateInstruments({...telemetry,gear:'R'},1);
    assert(center.effectivePage==='park' && centerCV.texts.includes(shared.parking.nearestDistanceM!.toFixed(2)+' m'),'reverse selects real parking proximity');
    visual.updateInstruments(telemetry,1); assert(center.effectivePage==='tyres','leaving reverse restores selected page');
    const live=visual.root.getObjectByName('GTI twin circular digital instruments') as GolfGTIInstruments;
    const version=live.texture.version; visual.updateInstruments({...telemetry,ignitionOn:false},0);
    assert(live.texture.version>version && !center.click(new T.Vector2(.2,.95)),'power changes immediate, powered-off controls disabled');
    visual.updateInstruments(telemetry,1); const spill=visual.root.getObjectByName('GTI restrained console spill') as T.PointLight;
    assert(spill.intensity>0&&spill.intensity<=.025,'restrained night lighting');
    visual.updateInstruments({...telemetry,indicators:{}},2); assert(spill.intensity<.001,'lamp-off cabin fade');
    second=new VehicleVisual(v,assets);
    const a=visual.root.getObjectByName('GTI continuous sculpted upper dashboard') as T.Mesh;
    const b=second.root.getObjectByName('GTI continuous sculpted upper dashboard') as T.Mesh;
    assert(a.geometry===b.geometry && a.material!==b.material,'shared immutable geometry, isolated instance materials');
    let sharedDisposed=false; a.geometry.addEventListener('dispose',()=>{sharedDisposed=true;});
    lights.dispose(); lights=undefined; visual.dispose(); visual=undefined;
    assert(!sharedDisposed,'instance disposal retains registry geometry');
    second.dispose(); second=undefined; assets.dispose(); assert(sharedDisposed,'registry eventually frees static resources');
    return {assertions,structure,meshes,materials:materials.size,textures:textures.size,vertices,zeroTo100Seconds:zeroTo100,accelerationEndSpeedKmh:accelerationEndSpeed,firstUpshiftRPM};
  } finally {
    lights?.dispose(); visual?.dispose(); second?.dispose(); display.dispose(); shared.dispose(); assets.dispose();
    if(previous) Object.defineProperty(globalThis,'document',previous); else Reflect.deleteProperty(globalThis,'document');
  }
}
