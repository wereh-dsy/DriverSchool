import * as T from 'three';
import { BMW_530LI_VISUAL_CONFIG as config } from './BMW530LiVisualConfig';
import { VehicleVisual } from './VehicleVisual';
import { BMW530Instruments, BMW_INSTRUMENT_LAYOUT, drawBMWLightingSymbols, bmwDrivingView, projectBMWDrivingPoint } from './BMW530Instruments';
import { bmwWindshieldPoint, bmwFrontWindowCorners, bmwFrontWindowLeadingPoint } from './BMW530FrontFrame';
import { roofHeight } from './BMW530Geometry';
import { cabinAmbientTarget } from './CabinLightResponse';
import { DrivingSceneDisplayContext } from './DrivingSceneDisplayContext';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { drawLuxuryVehicleStatusPage, luxuryVehicleStatusKey } from './LuxuryVehicleStatusPage';
import { BMW530CenterDisplay } from './BMW530CenterDisplay';

/** Front-cabin integration checks only: no drivetrain run or unrelated vehicle suite. */
export function runBMW530FrontCabinSelfTest() {
  let assertions = 0, meshes = 0, vertices = 0, closureSamples = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error('BMW front cabin: '+message); };
  const previous = Object.getOwnPropertyDescriptor(globalThis,'document');
  const canvases: { width:number; height:number; texts:string[]; draws:{text:string;font:string;color:unknown}[]; moves:number[][]; clips:number; ellipses:number;
    getContext:(type?:string)=>unknown }[] = [];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>{
    const canvas = {width:0,height:0,texts:[] as string[],draws:[] as {text:string;font:string;color:unknown}[],moves:[] as number[][],clips:0,ellipses:0,getContext:()=>context};
    const context = new Proxy<Record<string,unknown>>({}, {
      get(target,key:string) {
        if(key in target) return target[key];
        if(key==='fillText') return (value:string)=>{canvas.texts.push(value);canvas.draws.push({text:value,font:String(target.font),color:target.fillStyle});};
        if(key==='moveTo') return (x:number,y:number)=>{assert(Number.isFinite(x)&&Number.isFinite(y),'finite canvas moveTo');canvas.moves.push([x,y]);};
        if(key==='clip') return ()=>canvas.clips++;
        if(key==='ellipse') return ()=>canvas.ellipses++;
        if(key==='createLinearGradient'||key==='createRadialGradient') return ()=>({addColorStop:()=>undefined});
        return (...values:unknown[])=>assert(values.every(v=>typeof v!=='number'||Number.isFinite(v)),'finite canvas '+key);
      },set(target,key:string,value) {target[key]=value;return true;},
    }); canvases.push(canvas); return canvas;
  }}});
  let visual:VehicleVisual|undefined;
  const sceneData = new DrivingSceneDisplayContext({lanes:true,proximity:true});
  try {
    visual = new VehicleVisual(config); visual.root.updateMatrixWorld(true);
    const cabin = visual.cockpitRoot, materials = new Set<T.Material>();
    cabin.traverse(object=>{
      if(!(object instanceof T.Mesh)) return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]) materials.add(material);
      // Only geometry that reaches the front cabin is part of this round's check.
      if(new T.Box3().setFromObject(object).min.z>.5) return;
      meshes++; const points = object.geometry.getAttribute('position'); vertices+=points.count;
      let finite = true;
      for(let i=0;i<points.count;i++) finite &&= Number.isFinite(points.getX(i))&&Number.isFinite(points.getY(i))&&Number.isFinite(points.getZ(i));
      assert(finite,'finite geometry: '+object.name);
    });
    for(const name of ['BMW continuous sculpted dashboard shell','BMW shaped passenger and driver fascia',
      'BMW continuous recessed display backing','BMW continuous display lower ledge','BMW integrated centre display',
      'BMW closed windshield lower cowl','BMW windshield roof header','BMW compact padded airbag hub'])
      assert(!!cabin.getObjectByName(name),'front structure exists: '+name);
    for(const name of ['BMW low rotary controller','BMW screen mounting plinth','BMW front cupholder well',
      'Hazard switch marking','BMW physical centre controls','BMW downshift paddle','BMW upshift paddle',
      'BMW turn and light stalk','BMW wiper stalk']) assert(!cabin.getObjectByName(name),'deleted ornament: '+name);
    const badge = cabin.getObjectByName('BMW steering hub decal') as T.Mesh;
    assert(badge.geometry instanceof T.PlaneGeometry && (badge.material as T.MeshBasicMaterial).map instanceof T.CanvasTexture,'single canvas steering badge');
    assert(!cabin.getObjectByName('Roundel blue and white quadrants'),'no multipart steering logo');
    assert(config.driverEyePosition.join(',')==='-0.4,1.225,0.3','normal driver eye retained');
    const eye = new T.Vector3(...config.driverEyePosition), ray = new T.Raycaster(); ray.layers.enableAll();
    const frontOpaque:T.Object3D[] = [];
    cabin.traverse(object=>{if(object instanceof T.Mesh && !(object.material instanceof T.MeshBasicMaterial)) frontOpaque.push(object);});
    const closure = (point:readonly [number,number,number],label:string) => {
      const target = new T.Vector3(...point); ray.set(eye,target.clone().sub(eye).normalize());
      const hit = ray.intersectObjects(frontOpaque,false)[0]; closureSamples++;
      assert(!!hit&&hit.distance<=target.distanceTo(eye)+.035,'closed '+label+': '+hit?.object.name);
    };
    for(const sign of [-1,1]) {
      for(let n=0;n<=16;n++) {
        const u=n/16, a=bmwWindshieldPoint(u,sign<0?0:1), b=bmwFrontWindowLeadingPoint(sign,u);
        closure([(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],sign+' A-pillar '+u);
      }
      const corners = bmwFrontWindowCorners(sign);
      for(const [label,start,end] of [['upper',corners[1]!,corners[2]!],['lower',corners[0]!,corners[3]!]] as const)
        for(let n=0;n<=16;n++) closure(start.map((v,j)=>T.MathUtils.lerp(v,end[j]!,n/16)) as [number,number,number],sign+' side '+label+' '+n);
      closure([sign*.817,.966,-.798],sign+' mirror triangle');
    }
    for(let n=0;n<=32;n++) {
      const v=n/32, top=bmwWindshieldPoint(1,v);
      assert(Math.abs(top[1]-roofHeight(top[2],top[0]))<1e-9,'windshield/roof shared camber');
      closure(top,'windshield header '+n); closure(bmwWindshieldPoint(0,v),'windshield lower '+n);
    }
    const face = cabin.getObjectByName('BMW opposed-arc digital display')!;
    for(const name of ['speed','gear','mode'] as const) {
      const [x,y] = BMW_INSTRUMENT_LAYOUT[name];
      const target=face.localToWorld(new T.Vector3((x/1440-.5)*.516,(.5-y/540)*.1935,0));
      ray.set(eye,target.clone().sub(eye).normalize());
      const obstruction=ray.intersectObjects(cabin.children,true).find(hit=>hit.distance<target.distanceTo(eye)-.002);
      assert(!obstruction,'driver can read '+name+': '+obstruction?.object.name);
    }
    const instrument = cabin.getObjectByName('BMW Live Cockpit digital face') as BMW530Instruments;
    const canvas = canvases.find(c=>c.width===1440&&c.height===540)!;
    canvas.texts.length=0;
    const telemetry:InstrumentTelemetry = {ignitionOn:true,engineRunning:true,speedKmh:87,rpm:2350,gear:'D6',driveMode:'SPORT',fuelLevel:.42,
      coolantTemperatureC:93,indicators:{headlights:true}};
    instrument.update(telemetry,.1);
    for(const text of ['87','D6','2350','SPORT','FUEL 42%','93 °C']) assert(canvas.texts.includes(text),'live UI: '+text);
    const sportRpm=canvas.draws.find(d=>d.text==='2350')!;
    const sportMode=canvas.draws.find(d=>d.text==='SPORT')!;
    const version = instrument.texture.version; instrument.update(telemetry,.1);
    assert(instrument.texture.version===version,'unchanged telemetry does not upload texture');
    instrument.update({...telemetry,indicators:{highBeam:true}},0);
    assert(instrument.texture.version>version,'lamp state changes redraw immediately');
    canvas.draws.length=0; const beforeMode=instrument.texture.version;
    instrument.update({...telemetry,driveMode:'NORMAL'},0);
    const comfortSpeed=canvas.draws.find(d=>d.text==='87')!, comfortRpm=canvas.draws.find(d=>d.text==='2350')!;
    assert(instrument.texture.version>beforeMode&&canvas.draws.some(d=>d.text==='COMFORT'),'mode change redraws immediately');
    assert(parseInt(sportRpm.font.split(' ')[1]!)>parseInt(comfortRpm.font.split(' ')[1]!)&&
      parseInt(comfortSpeed.font.split(' ')[1]!)>parseInt(comfortRpm.font.split(' ')[1]!),'sport emphasises RPM; comfort prioritises speed');
    assert(sportMode.color!==canvas.draws.find(d=>d.text==='COMFORT')!.color,'sport and comfort have distinct palettes');
    assert([comfortSpeed,comfortRpm,sportRpm].every(d=>d.font.startsWith('300 ')&&d.font.includes('Segoe UI Light')),
      'primary driving numbers use the light numeral face');
    assert(parseInt(comfortSpeed.font.split(' ')[1]!)<=104&&parseInt(sportRpm.font.split(' ')[1]!)<=68,
      'primary readings keep the requested restrained scale');
    assert(!canvas.texts.some(t=>['HIGH','LIGHT','FOG'].includes(t)),'lamps use pictograms');
    const symbolContext = new Proxy({}, {get:(_,key)=>key==='fillText'?()=>assert(false,'lamp glyph cannot use text'):()=>undefined,
      set:()=>true}) as CanvasRenderingContext2D;
    drawBMWLightingSymbols(symbolContext,{positionLights:true,headlights:true,highBeam:true,frontFogLights:true,rearFogLights:true});
    const clips=canvas.clips;
    instrument.update({...telemetry,drivingScene:sceneData.data},.1);
    assert(canvas.clips===clips,'absent lane data does not draw a road');
    sceneData.data.lanes=[[{x:-1.7,forward:1},{x:-1.7,forward:20}],[{x:1.7,forward:1},{x:1.7,forward:20}]];
    sceneData.data.laneMarkings=['solid','dashed']; sceneData.data.version++;
    instrument.update({...telemetry,drivingScene:sceneData.data},.1);
    assert(canvas.clips>clips,'existing shared lane data reaches BMW skin');
    const ellipses=canvas.ellipses; sceneData.data.proximity.active=true;
    sceneData.data.proximity.zones[0]!.distanceM=.5; sceneData.data.proximity.zones[0]!.severity='NEAR'; sceneData.data.version++;
    instrument.update({...telemetry,drivingScene:sceneData.data},.1);
    assert(canvas.ellipses>ellipses,'existing optional proximity data reaches skin');
    for(const gear of ['P','R','N','D6',0,3,-1] as const) {
      canvas.moves.length=0; const before=instrument.texture.version, clips=canvas.clips;
      instrument.update({...telemetry,gear,drivingScene:sceneData.data},0);
      assert(instrument.texture.version>before,'selector changes refresh the central view immediately');
      const overhead=canvas.moves.some(([x,y])=>x===-26&&y===-83);
      assert(overhead!==bmwDrivingView(gear),'P/R retain overhead; N/D use the driving perspective: '+gear);
      assert(bmwDrivingView(gear)?canvas.clips>clips:canvas.clips===clips,'parking view does not inherit perspective lanes: '+gear);
      if(bmwDrivingView(gear)) {
        const rear=projectBMWDrivingPoint(-.95,-2.4,.84), lane=projectBMWDrivingPoint(-1.7,1);
        assert([rear,lane].every(p=>canvas.moves.some(q=>Math.hypot(p[0]-q[0]!,p[1]-q[1]!)<1e-6)),
          'car and actual lane vertices use the same projection');
      }
    }
    const pa=projectBMWDrivingPoint(1.7,0),pb=projectBMWDrivingPoint(1.7,12),pc=projectBMWDrivingPoint(1.7,36);
    assert(Math.abs((pb[0]-pa[0])*(pc[1]-pa[1])-(pb[1]-pa[1])*(pc[0]-pa[0]))<1e-6,
      'straight world lanes remain straight in perspective');
    const profile = config.interiorAmbientLighting!, day=cabinAmbientTarget(profile,true,true,1), night=cabinAmbientTarget(profile,true,true,.025);
    assert(day<.005&&night>day&&night<=.24,'restrained day/night ambient target');
    const pointLights:T.PointLight[]=[]; cabin.traverse(o=>{if(o instanceof T.PointLight) pointLights.push(o);});
    assert(pointLights.length===3&&pointLights.every(l=>l.position.y<.7),'no extra or overhead illumination');
    const line=(cabin.getObjectByName('Dashboard ambient line') as T.Mesh).material as T.MeshStandardMaterial;
    visual.updateInstruments({...telemetry,ambientDaylight:.025},2);
    assert(line.emissiveIntensity>day&&pointLights.every(l=>l.intensity<=.045),'night lighting settles below calibrated limit');
    const rearLine=(cabin.getObjectByName('Left long rear ambient door trim') as T.Mesh).material as T.MeshStandardMaterial;
    assert(line.emissiveIntensity>rearLine.emissiveIntensity&&line.emissiveIntensity<.26,'front-only gentle ambient boost');
    const statusFace=cabin.getObjectByName('BMW live iDrive vehicle information') as T.Mesh;
    const tabTarget = statusFace.localToWorld(new T.Vector3((.34-.5)*.408,(.92-.5)*.16575,0));
    const clickRay = new T.Raycaster(new T.Vector3(...config.driverEyePosition),tabTarget.clone().sub(new T.Vector3(...config.driverEyePosition)).normalize());
    clickRay.layers.enableAll();
    assert(cabin.handleDisplayClick(clickRay),'physical status tab consumes its actual driver-eye click');
    visual.updateInstruments(telemetry,.1);
    const statusCanvas=canvases.find(c=>c.width===1024&&c.height===416)!;
    for(const text of ['VEHICLE STATUS','BMW 530Li','Fuel','42 %','Engine Temperature','93 °C',
      'Tyre Pressure','kPa','FL:','FR:','RL:','RR:','~ 250','~ 260','Transmission Temperature','~ 80 °C','~ Reference values'])
      assert(statusCanvas.texts.includes(text),'vehicle status live/default content: '+text);
    const statusMaterial=statusFace.material as T.MeshPhysicalMaterial, statusVersion=statusMaterial.map!.version;
    visual.updateInstruments({...telemetry,coolantTemperatureC:101},.1);
    assert(statusCanvas.texts.includes('101 °C')&&statusMaterial.map!.version>statusVersion,'temperature-only change invalidates status page');
    const nextVersion=statusMaterial.map!.version; visual.updateInstruments({...telemetry,coolantTemperatureC:101,speedKmh:100},.1);
    assert(statusMaterial.map!.version===nextVersion,'irrelevant driving changes do not upload status page');
    statusCanvas.texts.length=0;
    const liveStatus={vehicleName:'Luxury test vehicle',fuelLevel:.5,engineTemperatureC:94,transmissionTemperatureC:82,
      tyrePressureKPa:{FL:242,FR:243,RL:252,RR:253}};
    drawLuxuryVehicleStatusPage(statusCanvas.getContext('2d') as CanvasRenderingContext2D,liveStatus,true);
    assert(statusCanvas.texts.includes('Luxury test vehicle')&&statusCanvas.texts.includes('242')&&statusCanvas.texts.includes('82 °C')&&
      !statusCanvas.texts.some(t=>t.startsWith('~')),'shared page accepts actual readings for any vehicle');
    assert(luxuryVehicleStatusKey(liveStatus,true)!==luxuryVehicleStatusKey({...liveStatus,tyrePressureKPa:{...liveStatus.tyrePressureKPa,RR:260}},true),
      'pressure changes invalidate shared status key');
    assert(statusMaterial.emissiveMap===statusMaterial.map&&statusMaterial.clearcoat>0,'one-layer emissive glass screen');
    const center = new BMW530CenterDisplay('BMW 530Li');
    assert(center.page==='map','navigation is the default page');
    const network = {mapId:'BMW-display-test',bounds:{minimumX:-100,maximumX:100,minimumZ:-100,maximumZ:100},intersections:[],
      segments:[{id:'actual-road',centerline:[{x:0,z:90},{x:0,z:-90}],width:7,laneWidth:3.5,laneCountPerDirection:1,length:180,travelDirection:'two-way' as const}]};
    sceneData.update(.1,{x:1.75,z:3,yaw:.3,y:0,width:1.868,length:5.106},'D',6,true,network,()=>[]);
    const mapUploads = instrument.texture.version;
    center.update({...telemetry,drivingScene:sceneData.data},.1);
    const rasters = sceneData.data.map.rasterizations;
    assert(rasters>0&&instrument.texture.version===mapUploads,'only centre map consumes the existing tile cache');
    const mapVersion=center.texture.version;
    center.update({...telemetry,drivingScene:sceneData.data},.1);
    assert(center.texture.version===mapVersion&&sceneData.data.map.rasterizations===rasters,'unchanged map skips upload and rasterization');
    assert(center.click(new T.Vector2(.34,.92))&&center.page==='status','status tab switches pages');
    center.update({...telemetry,drivingScene:sceneData.data},0,liveStatus);
    const centerCanvas=canvases.find(c=>(c as unknown)===center.canvas)!;
    assert(centerCanvas.texts.includes('242')&&!centerCanvas.texts.some(t=>t==='~ 250'),'BMW page accepts real TPMS through existing status contract');
    statusCanvas.texts.length=0;
    visual.updateInstruments({...telemetry,vehicleStatus:{vehicleName:'BMW 530Li',tyrePressureKPa:liveStatus.tyrePressureKPa}},.1);
    assert(statusCanvas.texts.includes('242')&&statusCanvas.texts.includes('42 %')&&statusCanvas.texts.includes('93 °C'),
      'optional measured TPMS reaches the actual cabin while retaining live fuel and coolant');
    assert(!center.click(new T.Vector2(.5,.5)),'content does not consume head-look gestures');
    center.update({...telemetry,ignitionOn:false},0);
    assert(!center.click(new T.Vector2(.14,.92)),'powered-off screen cannot consume clicks');
    center.texture.dispose();
    visual.updateInstruments({...telemetry,ambientDaylight:.025,indicators:{}},2);
    assert(line.emissiveIntensity<.001&&pointLights.every(l=>l.intensity<.001),'lamps off fades ambient out');
    const lens=(cabin.getObjectByName('BMW unlit reading lamp lens') as T.Mesh).material as T.MeshStandardMaterial;
    assert(lens.emissive.getHex()===0,'reading lamp remains unlit');
    instrument.update({...telemetry,ignitionOn:false},0); const blankVersion=instrument.texture.version;
    assert(blankVersion>version,'ignition off blanks UI immediately');
    return {assertions,frontMeshes:meshes,frontVertices:vertices,cabinMaterials:materials.size,closureSamples};
  } finally {
    sceneData.dispose(); visual?.dispose(); if(previous) Object.defineProperty(globalThis,'document',previous); else Reflect.deleteProperty(globalThis,'document');
  }
}
