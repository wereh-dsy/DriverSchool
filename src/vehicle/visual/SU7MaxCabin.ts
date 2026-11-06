import * as T from 'three';
import {InstrumentCluster,type InstrumentTelemetry} from './InstrumentCluster';
import {SU7CenterDisplay} from './SU7CenterDisplay';
import {SU7CabinTextures} from './SU7CabinTextures';
import {surfaceRounded as box,surfaceQuad,surfaceGrid} from './SurfaceVehicleGeometry';
import {su7DashboardSurface,su7DriverPodLift,su7PaddedPanel as pad,su7LightGuideMaterial,su7LightGuide} from './SU7CabinSurfaces';
import {cabinAmbientTarget} from './CabinLightResponse';
import {createSU7CabinEnvironment} from './SU7CabinEnvironment';
import type {VehicleVisualConfig,Vector3Tuple as P} from './VehicleVisualConfig';

interface SteeringGroups {steeringWheelBase:T.Group;steeringWheelRotationGroup:T.Group;gearLever:T.Group}
export interface SU7MaxCabinState {instrument:InstrumentCluster;update(t:InstrumentTelemetry,dt:number):void}

/** Sand ceramic interior: proportions/colour blocking follow the 2026 official Max cabin photographs.
 * Grain, light-guide diffusion and metal response are inexpensive engineering approximations. */
export function buildSU7MaxCabin(root:T.Group,c:VehicleVisualConfig,steering:SteeringGroups):SU7MaxCabinState {
  const details=new SU7CabinTextures();
  const upper=new T.MeshPhysicalMaterial({color:0x665d54,roughness:.70,sheen:.22,sheenRoughness:.85,side:T.DoubleSide});
  const leather=new T.MeshPhysicalMaterial({color:c.body.interiorColor,roughness:.66,sheen:.30,sheenRoughness:.8,side:T.DoubleSide});
  const wheelLeather=new T.MeshPhysicalMaterial({color:0xbfb5a3,roughness:.57,sheen:.18,side:T.DoubleSide});
  const fascia=new T.MeshPhysicalMaterial({color:0x49413d,roughness:.71,sheen:.18,side:T.DoubleSide});
  const headliner=new T.MeshPhysicalMaterial({color:0xc8c0ad,roughness:.95,sheen:.55,sheenRoughness:1,side:T.DoubleSide});
  const satin=new T.MeshStandardMaterial({color:0xb8afa1,roughness:.27,metalness:.86});
  const dark=new T.MeshStandardMaterial({color:0x232322,roughness:.76,side:T.DoubleSide});
  const consoleFinish=new T.MeshPhysicalMaterial({color:0x978879,roughness:.36,metalness:.24,clearcoat:.35,clearcoatRoughness:.3});
  const upholstered=(mesh:T.Mesh)=>details.apply(mesh,'leather');
  const profile=(points:readonly (readonly [number,number])[])=>new T.CatmullRomCurve3(points.map(([y,z])=>new T.Vector3(0,y,z)));
  const topProfile=profile([[.934,-.955],[.933,-.78],[.924,-.64],[.887,-.550]]);
  const frontProfile=profile([[.887,-.550],[.852,-.525],[.807,-.519],[.769,-.529],[.750,-.554]]);
  const lowerProfile=profile([[.750,-.554],[.721,-.568],[.693,-.600],[.681,-.690]]);
  root.add(upholstered(su7DashboardSurface('SU7 sculpted upper dashboard',topProfile,upper,true)));
  // Both stitch rows share one static mesh; no per-stitch objects or textures.
  const stitchPositions:number[]=[];
  for(let i=0;i<96;i++)for(const row of [0,.003]){
    const x=-.78+i*1.56/96,base=topProfile.getPoint(.67),edge=(Math.abs(x)/.85)**8;
    const y=base.y+su7DriverPodLift(x,base.z)-.010*edge+.0007,z=base.z-.014*edge+row,w=.006,h=.00065;
    stitchPositions.push(x,y,z,x+w,y,z,x,y,z+h,x+w,y,z,x+w,y,z+h,x,y,z+h);
  }
  const stitchGeometry=new T.BufferGeometry();stitchGeometry.setAttribute('position',new T.Float32BufferAttribute(stitchPositions,3));stitchGeometry.computeVertexNormals();
  const stitches=new T.Mesh(stitchGeometry,new T.MeshStandardMaterial({color:0xbaa992,roughness:.9,side:T.DoubleSide}));
  stitches.name='SU7 saddle stitch rows';root.add(stitches);
  root.add(upholstered(su7DashboardSurface('SU7 wrapped passenger fascia',frontProfile,fascia)));
  root.add(upholstered(su7DashboardSurface('SU7 upholstered lower dashboard',lowerProfile,leather)));
  const outline=[...topProfile.getPoints(12),...frontProfile.getPoints(12).slice(1),...lowerProfile.getPoints(12).slice(1)];
  const capFaces=T.ShapeUtils.triangulateShape(outline.map(p=>new T.Vector2(p.y,p.z)),[]);
  for(const side of [-1,1]){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(outline.flatMap(p=>[side*.85,p.y-.010,p.z-.014]),3));
    g.setIndex(capFaces.flatMap(f=>side>0?[...f].reverse():f));g.computeVertexNormals();
    const end=new T.Mesh(g,upper);end.name='SU7 closed dashboard end';root.add(end);
  }
  root.add(box('SU7 recessed continuous air vent',[1.56,.012,.008],[0,.747,-.553],dark,.004));
  root.add(box('SU7 fine champagne dash edge',[1.58,.0025,.004],[0,.752,-.550],satin,.001));
  root.add(box('SU7 cabin floor',[1.69,.025,2.65],[0,.255,.36],dark,.008));
  root.add(surfaceQuad('SU7 front footwell bulkhead',[[-.845,.267,-.97],[.845,.267,-.97],[.845,.827,-.94],[-.845,.827,-.94]],dark));
  for(const side of [-1,1])root.add(surfaceQuad('SU7 front footwell kick panel',[
    [side*.838,.267,-.97],[side*.838,.267,-.36],[side*.838,.57,-.36],[side*.838,.80,-.94]],dark));

  root.add(upholstered(pad('SU7 floating console',[.34,.145,1.08],[.04,.51,.30],leather,.05)));
  const trayFrame=pad('SU7 champagne charging surround',[.29,.32,.018],[.04,.615,-.105],consoleFinish,.043);
  trayFrame.rotation.x=-Math.PI/2;root.add(trayFrame);
  const tray=pad('SU7 twin wireless charging tray',[.255,.275,.009],[.04,.629,-.105],fascia,.03);
  tray.rotation.x=-Math.PI/2;root.add(upholstered(tray));
  root.add(box('SU7 charging centre divider',[.007,.012,.238],[.04,.638,-.105],satin,.003));
  const climate=pad('SU7 horizontal climate keys',[.267,.035,.01],[.04,.612,.095],satin,.012);
  climate.rotation.x=-Math.PI/2;root.add(details.apply(climate,'climate'));
  root.add(upholstered(pad('SU7 centre armrest',[.30,.085,.39],[.04,.605,.66],leather,.04)));
  for(const x of [-.025,.105]){
    const well=new T.Mesh(new T.CylinderGeometry(.046,.040,.028,24),dark);well.name='SU7 recessed cup well';well.position.set(x,.590,.31);root.add(well);
    const lip=new T.Mesh(new T.TorusGeometry(.046,.0025,6,24),satin);lip.rotation.x=Math.PI/2;lip.position.set(x,.605,.31);lip.name='SU7 cup holder rim';root.add(lip);
  }
  for(const x of [-.40,.40]){
    root.add(upholstered(pad('SU7 front sport seat cushion',[.46,.105,.49],[x,.475,.32],leather,.075)));
    const back=pad('SU7 front sport seat back',[.44,.53,.095],[x,.80,.60],leather,.075);back.rotation.x=-.10;root.add(details.apply(back,'seat'));
    root.add(upholstered(pad('SU7 front head restraint',[.235,.19,.095],[x,1.13,.64],leather,.06)));
    for(const side of [-1,1])root.add(upholstered(pad('SU7 seat sculpted bolster',[.075,.34,.13],[x+side*.19,.75,.55],leather,.035)));
  }
  root.add(upholstered(pad('SU7 rear bench cushion',[1.33,.10,.43],[0,.50,1.06],leather,.045)));
  root.add(details.apply(pad('SU7 rear bench back',[1.31,.45,.10],[0,.78,1.37],leather,.04),'seat'));
  for(const x of [-.44,0,.44])root.add(upholstered(pad('SU7 rear head restraint',[.20,.13,.085],[x,1.066,1.36],leather,.035)));

  const instrument=new InstrumentCluster(c.instrumentCluster);
  instrument.position.set(...c.instrumentClusterTransform.position);instrument.rotation.set(...c.instrumentClusterTransform.rotation);root.add(instrument);
  const hood=instrument.getObjectByName('SU7 wrapped instrument sun hood') as T.Mesh;
  const formerHoodMaterial=hood.material as T.Material;hood.material=upper;upholstered(hood);formerHoodMaterial.dispose();
  const map=new SU7CenterDisplay(),screenMaterial=new T.MeshBasicMaterial({map:map.texture,toneMapped:false});
  const centre=new T.Group();centre.name='SU7 16.1 inch centre display';centre.position.set(.04,.942,-.515);centre.rotation.x=-.08;
  centre.add(pad('SU7 centre screen surround',[.352,.216,.010],[0,0,0],dark,.007));
  const screen=new T.Mesh(new T.PlaneGeometry(.344,.2083),screenMaterial);screen.name='SU7 isolated navigation display';screen.position.z=.008;centre.add(screen);root.add(centre);
  const glass=new T.MeshPhysicalMaterial({color:0xaab6bc,roughness:.14,clearcoat:1,clearcoatRoughness:.13,transparent:true,opacity:.035,depthWrite:false});
  const cover=new T.Mesh(screen.geometry,glass);cover.name='SU7 centre optical cover';cover.position.z=.009;centre.add(cover);
  root.add(pad('SU7 display flush saddle',[.18,.040,.055],[.04,.830,-.540],fascia,.017));

  steering.steeringWheelBase.position.set(...c.steeringWheelPosition);steering.steeringWheelBase.rotation.set(...c.steeringWheelRotation);
  const wheel=steering.steeringWheelRotationGroup;steering.steeringWheelBase.add(wheel);root.add(steering.steeringWheelBase);
  // Shape the centreline, preserving the grip's tube section at the flat bottom.
  const rimPath=new T.CatmullRomCurve3([[0,.166],[.083,.145],[.145,.083],[.164,0],[.145,-.083],
    [.105,-.128],[.050,-.135],[-.050,-.135],[-.105,-.128],[-.145,-.083],[-.164,0],[-.145,.083],[-.083,.145]]
    .map(([x,y])=>new T.Vector3(x,y,0)),true,'centripetal');
  const rim=new T.Mesh(new T.TubeGeometry(rimPath,64,.0175,10,true),wheelLeather);rim.name='SU7 steering wheel rim';wheel.add(upholstered(rim));
  const hub=new T.Mesh(new T.SphereGeometry(1,20,12),wheelLeather);hub.name='SU7 padded steering airbag';hub.scale.set(.066,.060,.026);hub.position.set(0,-.006,.014);wheel.add(hub);
  wheel.add(details.apply(box('SU7 steering badge',[.041,.012,.001],[0,0,.041],wheelLeather,.002),'badge'));
  wheel.add(box('SU7 steering centre marker',[.004,.024,.003],[0,.165,.017],satin,.002));
  const columnStart=new T.Vector3(...(c.steeringColumnMountPosition??
    [c.steeringWheelPosition[0],c.cabin.dashboardTopY-.08,c.dashboard.position[2]+.04]));
  const columnEnd=new T.Vector3(...c.steeringWheelPosition);columnEnd.z-=.045;
  const columnAxis=columnEnd.clone().sub(columnStart),column=new T.Mesh(new T.CylinderGeometry(.040,.052,columnAxis.length(),16),dark);
  column.name='SU7 steering column shroud';column.position.copy(columnStart).add(columnEnd).multiplyScalar(.5);
  column.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),columnAxis.normalize());root.add(column);
  for(const side of [-1,1]){
    const spoke=pad('SU7 wheel sculpted horizontal spoke',[.095,.039,.018],[side*.104,-.003,.009],consoleFinish,.015);wheel.add(spoke);
    const rocker=box('SU7 wheel multifunction rocker',[.033,.010,.009],[side*.100,.002,.020],satin,.003);wheel.add(rocker);
    const lower=pad('SU7 split lower steering spoke',[.017,.070,.012],[side*.032,-.084,.007],satin,.007);lower.rotation.z=side*-.26;wheel.add(lower);
    const support=new T.Mesh(new T.SphereGeometry(1,12,8),wheelLeather);support.name='SU7 steering button support';
    support.scale.set(.019,.024,.014);support.position.set(side*.079,-.046,.014);wheel.add(support);
    const button=new T.Mesh(new T.CylinderGeometry(.011,.011,.005,20),consoleFinish);button.rotation.x=Math.PI/2;button.position.set(side*.079,-.052,.027);button.name='SU7 steering round button';wheel.add(button);
    const ring=new T.Mesh(new T.TorusGeometry(.0125,.0015,6,24),side>0?new T.MeshStandardMaterial({color:0x8e5043,roughness:.4,metalness:.65}):satin);
    ring.position.set(side*.079,-.052,.032);ring.name='SU7 steering button bezel';wheel.add(ring);
    root.add(box('SU7 column stalk',[.075,.014,.018],[-.40+side*.095,.821,-.405],dark,.006));
  }

  const ambient=su7LightGuideMaterial(c.interiorAmbientLighting!.color);
  const dashPoints=(y:number,z:number):P[]=>Array.from({length:25},(_,i)=>{
    const x=T.MathUtils.lerp(-.82,.82,i/24),edge=(Math.abs(x)/.85)**8;return [x,y-.010*edge,z-.014*edge];
  });
  const upperGuide:P[]=[[-.805,.884,-.94],[-.827,.880,-.72],...dashPoints(.887,-.5485),[.827,.880,-.72],[.805,.884,-.94]];
  root.add(su7LightGuide('SU7 ambient dash ribbon',upperGuide,.016,ambient));
  root.add(su7LightGuide('SU7 lower fascia ambient ribbon',dashPoints(.750,-.5525),.007,ambient));
  for(const side of [-1,1]){
    const label=side<0?'driver':'passenger',door=new T.Group();door.name='SU7 '+label+' door card';root.add(door);
    door.add(upholstered(surfaceGrid('SU7 '+label+' sculpted door upholstery',14,12,(u,v)=>{
      const z=T.MathUtils.lerp(-.94,.30,u),y=T.MathUtils.lerp(.37,.82,v);
      return [side*(.851-.047*Math.sin(v*Math.PI)),y,z];
    },leather)));
    door.add(upholstered(pad('SU7 '+label+' upper door bolster',[.045,.075,1.23],[side*.833,.902,-.32],upper,.028)));
    door.add(box('SU7 '+label+' window inner weatherseal',[.025,.018,1.24],[side*.855,.939,-.32],dark,.008));
    door.add(box('SU7 '+label+' door inlay',[.025,.070,1.20],[side*.818,.825,-.32],consoleFinish,.018));
    const pull=pad('SU7 '+label+' door pull',[.046,.055,.25],[side*.783,.66,-.27],leather,.023);pull.rotation.x=-.48;door.add(upholstered(pull));
    door.add(upholstered(pad('SU7 '+label+' door armrest',[.105,.065,.50],[side*.784,.575,-.24],leather,.025)));
    const switches=box('SU7 '+label+' window switches',[.055,.13,.006],[side*.768,.611,-.35],dark,.006);switches.rotation.x=-Math.PI/2;door.add(details.apply(switches,'switches'));
    const speaker=box('SU7 '+label+' door speaker',[.23,.17,.003],[side*.827,.43,-.68],dark,.018);speaker.rotation.y=side*Math.PI/2;door.add(details.apply(speaker,'speaker'));
    door.add(box('SU7 '+label+' recessed ambient channel',[.004,.004,1.24],[side*.807,.884,-.32],dark,.001));
    const points:P[]=Array.from({length:17},(_,i)=>[side*.803,.884,T.MathUtils.lerp(-.94,.30,i/16)]);
    door.add(su7LightGuide('SU7 '+label+' ambient door ribbon',points,.014,ambient));
    const a=new T.Vector3(side*.826,.918,-.998),b=new T.Vector3(side*.664,1.312,-.319),axis=b.clone().sub(a);
    const pillar=new T.Mesh(new T.CylinderGeometry(.021,.029,axis.length(),12),headliner);pillar.name='SU7 interior A pillar';
    pillar.position.copy(a).add(b).multiplyScalar(.5);pillar.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());root.add(pillar);
    // The rear trim stops above the wheelhouse; a rectangular pad showed
    // through the open arch from outside. Follow its actual body-local crown.
    root.add(upholstered(surfaceGrid('SU7 rear door card',32,4,(u,v)=>{
      const z=T.MathUtils.lerp(.32,1.40,u),d=z-c.wheelBase/2;
      const radius=c.wheelRadius+c.body.wheelArchClearance+.018;
      const archY=c.wheelRadius-(c.staticBodyOffsetY??0)+Math.sqrt(Math.max(0,radius*radius-d*d));
      const bottom=Math.max(.465,archY);
      return [side*(.847-.008*Math.sin(v*Math.PI)),T.MathUtils.lerp(bottom,.795,v),z];
    },leather)));
  }
  // Close the visible roof/windshield seam with the actual light headliner, not exterior paint.
  root.add(surfaceGrid('SU7 sculpted front headliner',20,8,(u,v)=>{
    const x=T.MathUtils.lerp(-.675,.675,u);return [x,1.328+.057*v+.018*(1-(x/.675)**2),-.324+.24*v];
  },headliner));
  for(const x of [-.34,.34])root.add(pad('SU7 upholstered sun visor',[.38,.022,.15],[x,1.343,-.19],headliner,.025));
  root.add(pad('SU7 overhead control surround',[.18,.024,.12],[0,1.346,-.16],headliner,.03));
  for(const child of root.children)if(child instanceof T.Mesh&&child.material===headliner)child.receiveShadow=false;
  root.add(pad('SU7 interior mirror housing',[.205,.064,.024],[0,1.276,-.38],dark,.018));
  const mirror=new T.Mesh(new T.PlaneGeometry(.189,.050),new T.MeshStandardMaterial({color:0xabb4b5,roughness:.08,metalness:.98,envMapIntensity:.8}));
  mirror.name='SU7 interior mirror optical surface';mirror.position.set(0,1.276,-.365);root.add(mirror);
  for(const [x,width] of [[-.32,.052],[-.46,.080]] as const){const pedal=box('SU7 aluminium pedal',[width,.13,.016],[x,.34,-.66],satin,.008);pedal.rotation.x=-.40;root.add(details.apply(pedal,'pedal'));}
  root.add(surfaceQuad('SU7 rear parcel shelf',[[-.77,.91,1.38],[.77,.91,1.38],[.80,.91,1.72],[-.80,.91,1.72]],upper));
  let ambientLevel=0;
  const spills=[-.57,.57].map(x=>{
    const light=new T.PointLight(c.interiorAmbientLighting!.color,0,.85,2);
    light.name='SU7 concealed ambient spill';light.position.set(x,.75,-.43);light.castShadow=false;root.add(light);return light;
  });
  const reflectionProbe=createSU7CabinEnvironment(),finishes=new Set<T.MeshStandardMaterial>();
  root.traverse(o=>{
    if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])
      if(m instanceof T.MeshStandardMaterial){m.envMap=reflectionProbe;m.envMapIntensity=.6;finishes.add(m);}
  });
  return {instrument,update(t,dt){
    map.update(t,dt);
    const on=t.ignitionOn??true,day=T.MathUtils.clamp(t.ambientDaylight??1,0,1);
    // Cabin theme is an operational accessory, like the factory daytime reference.
    ambientLevel=T.MathUtils.damp(ambientLevel,cabinAmbientTarget(c.interiorAmbientLighting!,on,true,day),4,dt);
    ambient.opacity=ambientLevel;
    for(const light of spills)light.intensity=.012*ambientLevel/c.interiorAmbientLighting!.nightIntensity;
    for(const material of finishes){
      material.envMapIntensity=.6*day;
      material.envMapRotation.y=-(root.parent?.rotation.y??0);
    }
    screenMaterial.color.setScalar(on ? .24+.68*day : 0);
  }};
}
