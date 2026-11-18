import * as T from 'three';
import { InstrumentCluster } from './InstrumentCluster';
import { MaybachS680CenterDisplay } from './MaybachS680Displays';
import type { MercedesE300LCabinState } from './MercedesE300LCabin';
import { maybachTexture } from './MaybachS680Textures';
import { beam, grid, label, loft, mesh, path, polygon, rounded, starEmblem, sweep, upholstered } from './MercedesE300LGeometry';
import { maybachWindow } from './MaybachS680Exterior';
import { MaybachAmbientSettings, MaybachS680AmbientLighting } from './MaybachS680AmbientLighting';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

/** Front-row datums are shared by the continuous pad, veneer, vents, display
 * mounts and door-card returns. The rear keeps the visible seat/screen silhouette. */
export function buildMaybachS680Cabin(root:T.Group,c:VehicleVisualConfig,
  steering:{steeringWheelBase:T.Group;steeringWheelRotationGroup:T.Group;gearLever:T.Group},
  assets?:VehicleAssetRegistry):MercedesE300LCabinState{
  const leather=new T.MeshStandardMaterial({color:0xbeb09a,roughness:.91,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:0x15171b,roughness:.94,side:T.DoubleSide});
  const insert=new T.MeshStandardMaterial({map:maybachTexture('quilt',assets),roughness:.88,side:T.DoubleSide});
  const carpet=new T.MeshStandardMaterial({color:0x262327,roughness:1,side:T.DoubleSide});
  const wood=new T.MeshPhysicalMaterial({map:maybachTexture('wood',assets),color:0xc2afa3,roughness:.52,
    clearcoat:.10,clearcoatRoughness:.4,specularIntensity:.22,envMapIntensity:.4,side:T.DoubleSide});
  const metal=new T.MeshStandardMaterial({color:0x9ba0a5,metalness:.66,roughness:.36,side:T.DoubleSide});
  const piano=new T.MeshPhysicalMaterial({color:0x080b10,roughness:.26,clearcoat:.18,
    clearcoatRoughness:.32,specularIntensity:.22,envMapIntensity:.30,side:T.DoubleSide});
  const glass=new T.MeshPhysicalMaterial({color:0x080a0e,roughness:.28,clearcoat:.08,
    specularIntensity:.08,envMapIntensity:.025});glass.name='Maybach interior glass independent material';
  const ventMat=new T.MeshStandardMaterial({map:maybachTexture('vent',assets),roughness:.60,metalness:.35});
  const speakerMat=new T.MeshStandardMaterial({map:maybachTexture('speaker',assets),metalness:.48,roughness:.48});
  const ambientProfile=c.interiorAmbientLighting!;
  const ambientSettings=new MaybachAmbientSettings(),ambient=new MaybachS680AmbientLighting(ambientSettings,ambientProfile);
  const courtesy=new T.PointLight(0xffddac,0,1.5,2);
  courtesy.name='Left door courtesy lamp';courtesy.position.set(-.794,.306,-.30);root.add(courtesy);
  for(const sign of [-1,1]){
    const light=new T.PointLight(ambientProfile.color,0,.9,2);
    light.name='Front Maybach indirect footwell illumination';light.position.set(sign*.43,.38,-.46);root.add(light);ambient.spill(light,'indirect',.065);
  }
  const dashWash=new T.PointLight(0xe7c8a8,0,1.10,2);dashWash.name='Maybach concealed fascia wash';
  dashWash.position.set(.27,.85,-.43);root.add(dashWash);ambient.spill(dashWash,'active',.045);
  const bow=(x:number)=>.032*(1-(Math.abs(x)/.85)**2);
  const xs=[-.85,-.78,-.65,-.44,-.22,0,.22,.44,.65,.78,.85];
  const dashRing=(x:number):P[]=>{
    const b=bow(x);return [[x,.982,-1.035],[x,.986,-.92],[x,.977,-.74+b],[x,.948,-.605+b],
      [x,.910,-.565+b],[x,.869,-.565+b],[x,.790,-.591+b],[x,.691,-.667+b],
      [x,.648,-.80],[x,.696,-1.035]];
  };
  root.add(sweep('Maybach continuous wrapped leather dashboard',xs.map(dashRing),dark));
  // Veneer follows the face curvature, with no protruding rectangle or exposed ends.
  root.add(grid('Maybach curved open pore dashboard veneer',50,8,(u,v)=>{
    const x=T.MathUtils.lerp(-.844,.844,u),y=T.MathUtils.lerp(.786,.884,v);
    const z=y>=.869?-.565:T.MathUtils.lerp(-.591,-.565,(y-.790)/.079);
    return [x,y,z+bow(x)+.0025];
  },wood));
  root.add(grid('Maybach sculpted lower leather fascia',48,8,(u,v)=>{
    const x=T.MathUtils.lerp(-.845,.845,u),y=T.MathUtils.lerp(.663,.784,v);
    return [x,y,T.MathUtils.lerp(-.651,-.583,v)+bow(x)];
  },leather));
  for(const [y,z]of [[.886,-.582],[.784,-.582]] as const)root.add(path('Maybach fine satin veneer edge',xs.map(x=>[x,y,z+bow(x)+.003] as P),.0015,metal));
  const dashBand=(y:number,z:number,halfWidth:number)=>Array.from({length:81},(_,n)=>{
    const x=(n/80*2-1)*halfWidth;return [x,y,z+bow(x)] as P;
  });
  root.add(ambient.ribbon('Maybach continuous upper dashboard ambient zone',dashBand(.895,-.562,.818),'active',.013,[0,1,0],.34,.66));
  root.add(ambient.ribbon('Maybach lower fascia indirect light',dashBand(.777,-.584,.799),'direct',.010));
  // Four central outlets and two outer outlets are dark louvred apertures.
  for(const [x,w,h]of [[-.745,.130,.048],[-.125,.105,.034],[.006,.105,.034],[.137,.105,.034],[.268,.105,.034],[.745,.130,.048]] as const){
    const y=.931,z=-.588+bow(x);
    root.add(rounded('Maybach recessed vent satin frame',[w+.005,h+.005,.009],[x,y,z],metal,.005));
    const outlet=mesh('Maybach dark louvred air outlet',new T.PlaneGeometry(w,h),ventMat);
    outlet.position.set(x,y,z+.005);root.add(outlet);
  }
  const instrument=new InstrumentCluster(c.instrumentCluster,assets);
  instrument.position.set(...c.instrumentClusterTransform.position);instrument.rotation.set(...c.instrumentClusterTransform.rotation);
  instrument.scale.setScalar(c.instrumentClusterTransform.scale??1);root.add(instrument);
  const clusterMount=upholstered('Maybach integrated instrument pedestal',[.31,.045,.105],[-.43,.918,-.596],dark,.6);root.add(clusterMount);
  const display=new MaybachS680CenterDisplay(ambientSettings);
  const screenMaterial=new T.MeshPhysicalMaterial({color:0x050505,map:display.texture,emissive:0xffffff,
    emissiveMap:display.texture,emissiveIntensity:.92,roughness:.38,clearcoat:0,specularIntensity:.04,
    envMapIntensity:.015,toneMapped:false});screenMaterial.name='Maybach navigation exclusive material';
  const rearMaterials:T.MeshPhysicalMaterial[]=[];
  const center=new T.Group();center.name='Maybach floating portrait MBUX centre assembly';
  center.position.set(.06,.718,-.432);center.rotation.x=-.30;
  center.add(rounded('Maybach centre display satin rim',[.287,.373,.020],[0,0,-.004],metal,.009));
  center.add(rounded('Maybach centre display black glass bezel',[.280,.366,.018],[0,0,0],glass,.008));
  const centerScreen=mesh('Maybach live portrait centre navigation screen',new T.PlaneGeometry(.260,.3467),screenMaterial);
  centerScreen.position.z=.0105;center.add(centerScreen);root.add(center);
  root.add(sweep('Maybach continuous waterfall console and display support',[-.18,-.15,0,.15,.18].map(dx=>{
    const x=.06+dx,edge=Math.abs(dx)/.18,drop=.014*edge*edge;
    return [[x,.805-drop,-.582],[x,.907-drop,-.515],[x,.538-drop,-.401],
      [x,.531-drop,-.27],[x,.515-drop,.16],[x,.510-drop,.44],
      [x,.427,.51],[x,.418,-.582]] as P[];
  }),piano));
  // The display lower edge meets this deck; the shoulders flow into the tunnel.
  root.add(grid('Maybach curved front wood console deck',30,10,(u,v)=>{
    const z=T.MathUtils.lerp(-.31,.48,u),x=.025+(v*2-1)*.146;
    return [x,.511+.029*(1-u)**2+.005*(1-(v*2-1)**2),z];
  },wood));
  for(const s of [-1,1]){
    // Follow the waterfall outer shoulder, then stop before the padded armrest.
    // These routes stay outside the screen and never cross the fascia band.
    const points:P[]=[[.06+s*.179,.846,-.497],[.06+s*.179,.741,-.461],[.06+s*.179,.526,-.398],
      [.06+s*.179,.520,-.27],[.06+s*.179,.507,.216]];
    root.add(ambient.ribbon('Maybach console ambient shoulder '+s,points,'direct',.008,[s*.35,.94,0]));
  }
  root.add(upholstered('Maybach front padded armrest',[.305,.095,.36],[.025,.548,.43],leather,.55));
  const keyPanel=mesh('Maybach console touch key strip',new T.PlaneGeometry(.258,.038),new T.MeshStandardMaterial({map:maybachTexture('controls',assets),roughness:.40,metalness:.22}));
  keyPanel.rotation.x=-Math.PI/2;keyPanel.position.set(.04,.537,-.28);root.add(keyPanel);
  root.add(label('Maybach passenger fascia lettering','M A Y B A C H',.18,.018,[.59,.830,-.582+bow(.59)+.010]));
  // Real wheel groups keep the normal steering input path. Thin metal edges,
  // black touch pads and ivory leather replace the former solid chrome bars.
  const base=steering.steeringWheelBase,wheel=steering.steeringWheelRotationGroup;
  base.position.set(...c.steeringWheelPosition);base.rotation.set(...c.steeringWheelRotation);
  const rim=mesh('Maybach ivory leather steering rim',new T.TorusGeometry(c.steeringWheelRadius,.0185,12,64,Math.PI*1.4),leather);rim.rotation.z=Math.PI*.80;wheel.add(rim);
  const woodArc=mesh('Maybach polished upper steering wood',new T.TorusGeometry(c.steeringWheelRadius,.0185,12,32,Math.PI*.60),wood);
  woodArc.rotation.z=Math.PI*.20;wheel.add(woodArc);
  const controlMat=new T.MeshStandardMaterial({map:maybachTexture('wheel-controls',assets),roughness:.4,metalness:.10});
  for(const s of [-1,1]){
    const pad=rounded('Maybach black double steering spoke',[.112,.047,.022],[s*.100,-.004,.008],piano,.007);wheel.add(pad);
    const touch=mesh('Maybach steering touch controls',new T.PlaneGeometry(.095,.034),controlMat);
    touch.position.set(s*.100,-.004,.021);wheel.add(touch);
    wheel.add(beam('Maybach thin spoke metal edge',[s*.052,-.032,.017],[s*.145,-.032,.017],.0025,metal));
  }
  wheel.add(upholstered('Maybach sculpted leather airbag hub',[.127,.113,.058],[0,.005,.023],leather,.62));
  const badge=starEmblem('Maybach steering star',.024,metal,dark);badge.position.set(0,.009,.054);wheel.add(badge);
  const spoke:P[]=[[-.028,-.042,.004],[.028,-.042,.004],[.019,-.151,.004],[-.019,-.151,.004]];
  wheel.add(polygon('Maybach tapered lower steering spoke',spoke,piano),path('Maybach lower steering spoke satin edge',spoke,.0023,metal,true));
  base.add(wheel);root.add(base,beam('Maybach enclosed steering column',c.steeringColumnMountPosition!,c.steeringWheelPosition,.036,dark));
  steering.gearLever.position.set(-.245,.81,-.370);
  steering.gearLever.add(beam('Maybach column selector stalk',[0,0,0],[.071,0,-.047],.006,dark),
    rounded('Maybach column PRND selector',[.032,.026,.055],[.081,0,-.047],piano,.006));root.add(steering.gearLever);
  root.add(beam('Maybach indicator stalk',[-.61,.807,-.37],[-.68,.807,-.39],.006,dark));
  for(const [name,x]of [['brake',-.45],['accelerator',-.30]] as const)root.add(rounded('Maybach '+name+' pedal',
    [name==='brake'?.084:.043,.100,.016],[x,.33,-.80],dark));
  // Closed floor and footwells.
  root.add(loft('Maybach carpeted four seat cabin floor',[
    {z:-1.035,points:[[-.836,.245],[.836,.245],[.836,.220],[-.836,.220]]},
    {z:1.99,points:[[-.811,.26],[.811,.26],[.811,.235],[-.811,.235]]},
  ],carpet));
  root.add(polygon('Maybach closed front footwell firewall',[[-.84,.245,-1.035],[.84,.245,-1.035],[.84,.975,-1.035],[-.84,.975,-1.035]],dark));
  root.add(rounded('Maybach upholstered rear bulkhead',[1.62,.68,.04],[0,.68,1.97],leather));
  root.add(rounded('Maybach rear parcel shelf',[1.62,.045,.27],[0,.995,1.89],dark));
  const seat=(name:string,x:number,rear:boolean)=>{
    const z=rear?1.43:.17;
    root.add(upholstered(name+' independent cushion',[.53,.13,.57],[x,.465,z],leather));
    const back=upholstered(name+' reclining sculpted back',[.515,.59,.145],[x,.81,z+.29],leather);back.rotation.x=rear?.23:.12;root.add(back);
    const quilt=upholstered(name+' quilted insert',[.37,.41,.035],[x,.81,z+.203],insert);quilt.rotation.x=back.rotation.x;root.add(quilt);
    root.add(upholstered(name+' comfort headrest',[.29,.18,.125],[x,1.16,z+.36],leather));
    if(!rear){
      root.add(rounded(name+' rear entertainment frame',[.302,.190,.020],[x,.98,z+.405],glass));
      const material=screenMaterial.clone();material.name=name+' rear display exclusive material';material.map=material.emissiveMap=display.rearTexture;rearMaterials.push(material);
      const screen=mesh(name+' live rear navigation screen',new T.PlaneGeometry(.279,.157),material);screen.position.set(x,.98,z+.417);root.add(screen);
    }
  };
  seat('Driver',-.43,false);seat('Front passenger',.43,false);seat('Rear left executive',-.45,true);seat('Rear right executive',.45,true);
  root.add(rounded('Maybach full length rear centre console',[.25,.26,.96],[0,.39,1.22],wood));
  root.add(upholstered('Maybach rear centre armrest',[.25,.08,.52],[0,.565,1.45],leather));
  for(const s of [-1,1]){
    const side=s<0?'Left':'Right';
    for(const rear of [false,true]){
      const z0=rear?.34:-1.04,z1=rear?1.76:.26;
      root.add(grid(side+(rear?' rear':' front')+' continuous sculpted door card',36,20,(u,v)=>{
        const z=T.MathUtils.lerp(z0,z1,u),y=T.MathUtils.lerp(.26,.991,v),f=(y-.26)/.731;
        const x=s*(.818-.037*Math.exp(-(((f-.48)/.22)**2))+.024*f*f);
        return [x,y,z];
      },leather));
      root.add(grid(side+' fitted curved door veneer '+rear,32,6,(u,v)=>{
        const z=T.MathUtils.lerp(z0+.025,z1-.018,u),t=T.MathUtils.smoothstep(u,0,.30),y=T.MathUtils.lerp(.790,.882,v)+.009*(1-t);
        return [s*(.805+.011*v),y,z];
      },wood));
      // Small bevel returns support both optical bands. They close the former
      // floating gap between the veneer and the leather door card.
      for(const upper of [false,true])root.add(grid(side+' door veneer ambient bevel '+rear+' '+upper,32,3,(u,v)=>{
        const z=T.MathUtils.lerp(z0+.025,z1-.018,u),rise=.009*(1-T.MathUtils.smoothstep(u,0,.30));
        return [s*(upper?T.MathUtils.lerp(.816,.835,v):T.MathUtils.lerp(.816,.805,v)),
          (upper?T.MathUtils.lerp(.882,.906,v):T.MathUtils.lerp(.769,.790,v))+rise,z];
      },dark));
      const upperPoints:P[]=[],lowerPoints:P[]=[];
      if(!rear){
        // Rounded dash/door junction, authored explicitly instead of allowing
        // a Catmull-Rom curve to overshoot and cross the dashboard.
        for(let n=0;n<=12;n++){
          const t=n/12,a=1-t;
          upperPoints.push([s*(.818*a*a+2*.825*a*t+.825*t*t),.895,-.559*a*a-2*.559*a*t-.528*t*t]);
          lowerPoints.push([s*(.799*a*a+2*.809*a*t+.809*t*t),T.MathUtils.lerp(.777,.778,t),-.580*a*a-2*.580*a*t-.528*t*t]);
        }
      }
      const start=rear?z0+.025:-.528,end=z1-.023;
      for(let n=rear?0:1;n<=48;n++){
        const t=n/48,z=T.MathUtils.lerp(start,end,t);
        upperPoints.push([s*T.MathUtils.lerp(.825,.8218,t),T.MathUtils.lerp(.895,.891,t),z]);
        lowerPoints.push([s*.809,T.MathUtils.lerp(.778,.775,t),z]);
      }
      const reverse=s<0;
      if(reverse){upperPoints.reverse();lowerPoints.reverse();}
      const blend=(u:number)=>rear?1:Math.min(1,(reverse?1-u:u)/.20);
      root.add(ambient.ribbon(side+' ambient upper zone '+rear,upperPoints,'active',.012,u=>[s*.62*blend(u),T.MathUtils.lerp(1,.78,blend(u)),0],
        s<0?(rear?0:.17):(rear?.83:.66),s<0?(rear?.17:.34):(rear?1:.83)));
      root.add(ambient.ribbon(side+' ambient lower zone '+rear,lowerPoints,'direct',.009,u=>[-s*.47*blend(u),T.MathUtils.lerp(1,.88,blend(u)),0]));
      root.add(upholstered(side+' integrated leather armrest '+rear,[.102,.083,(z1-z0)*.67],[s*.752,.63,(z0+z1)/2],leather,.60));
      root.add(rounded(side+' flush door release '+rear,[.010,.027,.107],[s*.795,.748,z0+.24],metal,.004));
      root.add(ambient.ribbon(side+' concealed armrest indirect light '+rear,
        [[s*.731,.583,z0+.25],[s*.731,.583,z1-.24]],'indirect',.012,[1,0,0]));
      if(!rear){
        const wash=new T.PointLight(ambientProfile.color,0,.72,2);
        wash.name=side+' concealed active door wash';wash.position.set(s*.757,.855,-.14);
        root.add(wash);ambient.spill(wash,'active',.006);
        const switches=mesh(side+' illuminated window switch panel',new T.PlaneGeometry(.13,.048),
          new T.MeshStandardMaterial({map:maybachTexture('window-controls',assets),roughness:.43,metalness:.2}));
        switches.rotation.x=-Math.PI/2;switches.position.set(s*.751,.674,z0+.50);root.add(switches);
        const speaker=mesh(side+' Burmester textured speaker grille',new T.PlaneGeometry(.17,.135),speakerMat);
        speaker.rotation.y=-s*Math.PI/2;speaker.position.set(s*.788,.424,z0+.28);root.add(speaker);
        const controls=mesh(side+' front seat adjustment controls',new T.PlaneGeometry(.13,.055),new T.MeshStandardMaterial({map:maybachTexture('seat-controls',assets),roughness:.5,metalness:.3}));
        controls.rotation.y=-s*Math.PI/2;controls.position.set(s*.802,.822,z0+.24);root.add(controls);
      }
      root.add(path(side+' interior window seal '+rear,maybachWindow(s,rear,true),.007,dark,true));
    }
    root.add(beam(side+' padded A pillar',[s*.835,.990,-1.04],[s*.707,1.451,-.39],.020,leather));
    root.add(rounded(side+' upholstered B pillar',[.031,.62,.071],[s*.792,1.105,.30],leather));
    root.add(polygon(side+' upholstered C pillar',[[s*.709,1.445,1.27],[s*.827,1.00,1.76],[s*.785,1.00,1.99],[s*.689,1.430,1.35]],leather));
  }
  root.add(grid('Maybach curved suede headliner',28,24,(u,v)=>{
    const x=(v*2-1)*.710,z=T.MathUtils.lerp(-.40,1.35,u);return [x,1.483-.038*(x/.725)**2-.018*(2*u-1)**2,z];
  },leather));
  for(const z of [-.40,1.35])root.add(beam('Maybach padded roof header',[-.71,1.439,z],[.71,1.439,z],.019,leather));
  root.add(ambient.ribbon('Maybach overhead console accent',[[ -.17,1.417,-.405],[.17,1.417,-.405]],'accent',.009,[0,0,1]));
  const mirror=c.centerMirrorTransform!;
  root.add(rounded('Maybach interior mirror housing',[mirror.size[0]+.012,mirror.size[1]+.012,.025],
    [mirror.position[0],mirror.position[1],mirror.position[2]-.014],dark));
  root.add(beam('Maybach interior mirror mount',[0,1.42,-.40],mirror.position,.006,dark));
  root.traverse(o=>{if(o instanceof T.Mesh)o.userData.vehicleInteriorPart='maybach-cabin';});
  return {instrument,cyclePage(){display.cyclePage();},click(ray){const hit=ray.intersectObject(centerScreen,false)[0];return !!hit?.uv&&display.click(hit.uv);},
    update(t,dt){
      const on=t.ignitionOn??t.engineRunning??true,day=t.ambientDaylight??1;
      const doorOpen=t.driverAccess?.doorOpen??0;
      courtesy.intensity=T.MathUtils.damp(courtesy.intensity,doorOpen>.015?.22*(1-day*.75):0,5,dt);
      ambient.update(t,dt);
      for(const material of [screenMaterial,...rearMaterials]){material.emissiveIntensity=on?.88+.12*day:0;material.color.setScalar(on?.025:0);}
      display.update(t,dt);
    }};
}
