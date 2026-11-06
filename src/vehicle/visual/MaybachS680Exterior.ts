import { maybachTexture } from './MaybachS680Textures';
import * as T from 'three';
import { vehicleGlass, vehiclePaint } from './VehicleMaterials';
import { beam, grid, label, mesh, path, polygon, rounded, starEmblem } from './MercedesE300LGeometry';
import { localWheelPositions, VEHICLE_WHEEL_IDS, type VehicleWheelId } from '../VehicleDimensions';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

const lerp=T.MathUtils.lerp;
/** Side glazing shares the cabin seal/outer rail datums. */
export const maybachWindow=(s:number,rear=false,inner=false):P[]=>{
  const d=inner?.014:0;
  return rear?[[s*(.857-d),.995,.34],[s*(.841-d),1.003,1.49],
    [s*(.724-d),1.448,1.23],[s*(.729-d),1.476,.34]]:
    [[s*(.856-d),.993,-1.04],[s*(.857-d),.995,.26],
      [s*(.729-d),1.476,.26],[s*(.725-d),1.458,-.39]];
};

/** Z223 body stations: rounded nose, full fenders, a long rear door and a
 * tapering deck. A few continuous surfaces carry the shape; details use maps. */
const STATIONS:readonly (readonly[number,number,number,number])[]=[
  [-2.7345,.865,.922,.815],[-2.61,.905,.954,.839],[-2.35,.932,.969,.852],
  [-1.698,.9605,.998,.869],[-1.08,.957,1.005,.861],[-.35,.955,1.003,.857],
  [.34,.956,1.006,.857],[1.10,.959,1.015,.854],[1.698,.958,1.014,.841],
  [2.12,.936,.995,.813],[2.51,.885,.956,.779],[2.7345,.810,.907,.742],
];
function station(z:number){
  let i=0;while(i<STATIONS.length-2&&STATIONS[i+1]![0]<z)i++;
  const a=STATIONS[i]!,b=STATIONS[i+1]!,t=T.MathUtils.smoothstep(z,a[0],b[0]);
  return {width:lerp(a[1],b[1],t),y:lerp(a[2],b[2],t),belt:lerp(a[3],b[3],t)};
}
export function buildMaybachS680Exterior(root:T.Group,c:VehicleVisualConfig):void{
  const black=vehiclePaint(c.body.color,{side:T.DoubleSide,roughness:.27});
  const silver=vehiclePaint(0x858b91,{side:T.DoubleSide,roughness:.29,metalness:.48});
  const chrome=new T.MeshStandardMaterial({color:0xbfc6cc,metalness:.80,roughness:.27,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:0x090c10,roughness:.65,side:T.DoubleSide});
  const glass=vehicleGlass(c.windowGlass!.color,c.windowGlass!.windowOpacity);
  const windshield=glass.clone();windshield.opacity=c.windowGlass!.windshieldOpacity;
  const lens=new T.MeshPhysicalMaterial({color:0x7e8d99,transparent:true,opacity:.12,
    roughness:.10,clearcoat:.65,side:T.DoubleSide,depthWrite:false});
  const redLens=lens.clone();redLens.color.set(0x500d18);redLens.opacity=.35;
  const half=c.dimensions.length/2,arch=c.wheelRadius+c.body.wheelArchClearance;
  const underfloor=polygon('Maybach sealed underfloor datum',[[-.60,c.body.groundClearance,-half+.15],[.60,c.body.groundClearance,-half+.15],[.60,c.body.groundClearance,half-.15],[-.60,c.body.groundClearance,half-.15]],dark);
  underfloor.userData.vehicleBodyPart='underfloor';root.add(underfloor);
  const archY=c.body.wheelArchCenterY??c.wheelRadius;
  const corner=(x:number,z:number)=>z-Math.sign(z)*.26*(Math.abs(x)/.96)**3*T.MathUtils.smoothstep(Math.abs(z),2.17,half);
  const bottom=(z:number)=>{const d=Math.min(Math.abs(z+c.wheelBase/2),Math.abs(z-c.wheelBase/2));
    return d<arch?Math.max(.225,archY+Math.sqrt(arch*arch-d*d)):.225;};
  const sidePoint=(s:number,z:number,y:number):P=>{
    const a=station(z),f=T.MathUtils.clamp((y-.225)/(a.y-.225),0,1);
    const x=s*(f<.66?lerp(a.width-.050,a.width,Math.sin(f/.66*Math.PI/2)):
      lerp(a.width,a.belt,((f-.66)/.34)**1.7));
    return [x,y,corner(x,z)];
  };
  const access=c.driverAccess!,hinge=new T.Group(),door=new T.Group();
  hinge.name='Driver door hinge';hinge.position.set(-.861,.994,access.doorFrontZ);
  door.name='Driver door';hinge.add(door);root.add(hinge);
  // All patches use the original loft function. The opening is a real gap in
  // the body, not an extra panel laid on top of an uncut opaque shell.
  const onDoor=(object:T.Object3D)=>{object.position.sub(hinge.position);door.add(object);};
  for(const s of [-1,1]){
    const side=s<0?'Left':'Right';
    for(const upper of [false,true]){
      const name=side+(upper?' Maybach silver upper shoulder':' Maybach sculpted lower body');
      const ranges=s<0?[[-half,access.doorFrontZ,false],[access.doorFrontZ,access.doorRearZ,true],[access.doorRearZ,half,false]] as const:
        [[-half,half,false]] as const;
      for(const [z0,z1,moving]of ranges){
        const part=grid(name+(moving?' hinged door':z0>0?' rear':''),Math.ceil((z1-z0)/.025),14,(u,v)=>{
          const z=lerp(z0,z1,u),a=station(z),low=moving?.270:bottom(z),split=Math.max(low,.862);
          return sidePoint(s,z,upper?lerp(split,a.y,v):lerp(low,split,v));
        },upper?silver:black);
        if(moving)onDoor(part);else root.add(part);
      }
    }
    if(s<0){
      root.add(grid('Maybach fixed driver threshold',52,2,(u,v)=>sidePoint(s,lerp(access.doorFrontZ,access.doorRearZ,u),lerp(.225,.270,v)),black));
      // Painted edge returns and seals give the open door thickness without
      // a dense duplicate body. The inner card is attached by VehicleVisual.
      for(const z of [access.doorFrontZ,access.doorRearZ]){
        onDoor(grid('Maybach painted driver door edge '+z,2,18,(u,v)=>{
          const y=lerp(.270,station(z).y,v),p=sidePoint(s,z,y);return [lerp(p[0],-.816,u),y,z];
        },black));
      }
      onDoor(grid('Maybach door lower return',48,2,(u,v)=>{
        const z=lerp(access.doorFrontZ,access.doorRearZ,u);return [lerp(sidePoint(s,z,.270)[0],-.816,v),.270,z];
      },black));
      root.add(path('Maybach fixed driver aperture weather seal',[
        [-.817,.282,access.doorFrontZ],[-.817,.282,access.doorRearZ],[-.817,.990,access.doorRearZ],
        [-.713,1.469,access.doorRearZ],[-.713,1.448,-.39],[-.842,.991,access.doorFrontZ]],.006,dark,true));
      root.add(rounded('Maybach brushed illuminated entry sill',[.065,.016,1.11],[-.795,.271,-.35],chrome,.004));
    }
    for(const axle of [-c.wheelBase/2,c.wheelBase/2]){
      root.add(grid(side+' curved rolled wheel arch',48,2,(u,v)=>{
        const a=u*Math.PI,z=axle+Math.cos(a)*(arch+v*.009);
        return [s*(station(z).width-.006+v*.005),archY+Math.sin(a)*(arch+v*.009),z];
      },black));
      root.add(grid(side+' recessed wheel well liner',40,3,(u,v)=>{
        const a=u*Math.PI,radius=arch+.006+v*.012,z=axle+Math.cos(a)*radius;
        return [s*lerp(station(z).width-.012,.63,v),archY+Math.sin(a)*radius,z];
      },dark));
    }
    root.add(path(side+' chrome lower sill',[[s*.916,.270,-1.22],[s*.931,.259,0],[s*.923,.270,1.24]],.007,chrome));
    for(const rear of [false,true]){
      const points=maybachWindow(s,rear);
      const pane=polygon(side+(rear?' long rear door acoustic glass':' front acoustic glass'),points,glass);
      const seal=path(side+' acoustic window rubber seal '+rear,points,.010,dark,true);
      const frame=path(side+' chrome window surround '+rear,points,.0045,chrome,true);
      if(s<0&&!rear){
        const mount=new T.Group();mount.name='Driver window glass mount';
        const material=glass.clone(),localPlane=new T.Plane(new T.Vector3(0,1,0),-(.995-hinge.position.y));
        material.name='Maybach movable acoustic glass exclusive material';
        material.clippingPlanes=[localPlane.clone()];pane.material=material;
        pane.geometry.translate(-hinge.position.x,-hinge.position.y,-hinge.position.z);
        mount.userData.driverWindowClipPlaneLocal=localPlane;mount.userData.driverWindowClipPlane=material.clippingPlanes[0];
        mount.userData.driverWindowBeltHeight=.995-hinge.position.y;
        mount.add(pane);door.add(mount);onDoor(seal);onDoor(frame);
      }else root.add(pane,seal,frame);
    }
    const quarter:P[]=[[s*.843,1.003,1.53],[s*.813,1.010,1.76],[s*.720,1.436,1.30]];
    root.add(polygon(side+' fixed quarter acoustic glass',quarter,glass),path(side+' rear quarter chrome frame',quarter,.0045,chrome,true));
    root.add(polygon(side+' dark B pillar',[[s*.860,.994,.26],[s*.860,.994,.34],[s*.733,1.478,.34],[s*.733,1.478,.26]],dark));
    root.add(grid(side+' sculpted Maybach C pillar',28,8,(u,v)=>{
      const y=lerp(1.45,1.006,u),z=lerp(1.27+u*.48,1.35+u*.66,v);
      return [s*lerp(.724,.842,u)-s*v*.015,y,z];
    },silver));
    root.add(path(side+' painted roof side rail',[[s*.725,1.468,-.40],[s*.731,1.487,.40],[s*.721,1.452,1.30]],.022,silver));
    root.add(beam(side+' silver A pillar',[s*.856,.993,-1.04],[s*.725,1.458,-.39],.030,silver));
    const frontBelt=path(side+' front door chrome belt',[[s*.861,.992,-1.04],[s*.861,.994,.26]],.0045,chrome);
    if(s<0)onDoor(frontBelt);else root.add(frontBelt);
    root.add(path(side+' continuous rear chrome belt',[[s*.861,.994,.26],[s*.861,.995,.34],[s*.843,1.003,1.50],[s*.815,1.01,1.77]],.0045,chrome));
    for(const z of [-1.04,.26,1.51]){
      const seam=path(side+' fitted door shutline '+z,[sidePoint(s,z,.987),sidePoint(s,z,.72),sidePoint(s,z,.39),sidePoint(s,z,.271)],.0012,dark);
      if(s<0&&z===.26)onDoor(seam);else root.add(seam);
    }
    for(const z of [.11,1.28]){
      const p=sidePoint(s,z,.897);
      const handle=rounded(side+' chrome flush handle '+z,[.011,.022,.156],[p[0]+s*.003,p[1],p[2]],chrome,.004);
      if(s<0&&z===.11)onDoor(handle);else root.add(handle);
    }
    root.add(label(side+' C pillar double M badge','M M',.063,.045,[s*.806,1.235,1.58],[0,s*Math.PI/2,0]));
  }
  root.add(grid('Maybach V12 crowned bonnet',50,36,(u,v)=>{
    const z=lerp(-half,-1.04,u),a=station(z),q=v*2-1,x=q*a.belt;
    const crown=.025*(1-q*q),dome=.012*Math.exp(-(((Math.abs(q)-.46)/.10)**2))*Math.sin(Math.PI*u);
    return [x,a.y+crown+dome,corner(x,z)];
  },silver));
  root.add(path('Maybach polished bonnet centre spear',[[0,.924,-2.63],[0,1.012,-1.95],[0,1.031,-1.10]],.003,chrome));
  root.add(grid('Maybach long trunk deck',30,28,(u,v)=>{
    const z=lerp(2.01,half,u),a=station(z),q=v*2-1,x=q*a.belt;
    return [x,a.y+.014*(1-q*q),corner(x,z)];
  },silver));
  root.add(grid('Maybach silver long roof',32,28,(u,v)=>{
    const z=lerp(-.40,1.35,u),q=v*2-1,x=q*lerp(.725,.720,u);
    return [x,1.510-.038*q*q-.018*(2*u-1)**2,z];
  },silver));
  for(const rear of [false,true])root.add(grid(rear?'Maybach rear acoustic screen':'Maybach acoustic windshield',26,28,(u,v)=>{
    const q=v*2-1,x=q*lerp(rear?.813:.856,.725,u);
    return [x,lerp(rear?1.010:.993,1.459,u)+.010*(1-q*q)*Math.sin(Math.PI*u),
      lerp(rear?2.01:-1.04,rear?1.35:-.40,u)-(rear?-1:1)*.024*(1-q*q)*Math.sin(Math.PI*u)];
  },rear?glass:windshield));
  // End caps share the very same section as side body and bonnet/deck.
  // This closes the nose without a separate box or disconnected corner plates.
  for(const rear of [false,true]){
    const z=rear?half:-half,a=station(z);
    for(const upper of [false,true])root.add(grid(rear?'Maybach continuous rear bumper cap':'Maybach continuous front bumper cap',48,upper?8:18,(u,v)=>{
      const q=u*2-1,y=upper?lerp(.862,a.y,v):lerp(.225,.862,v),edge=sidePoint(1,z,y),x=q*edge[0];
      const crown=upper?.025*(1-q*q)*v**6:0;
      return [x,y+crown,corner(x,z)];
    },upper?silver:black));
    root.add(path(rear?'Rear chrome bumper sweep':'Front chrome bumper sweep',[-.74,-.40,0,.40,.74].map(x=>[x,.291,corner(x,z)+(rear?.002:-.002)] as P),.0045,chrome));
  }
  const grille:P[]=[[-.343,.536,-half-.014],[.343,.536,-half-.014],[.432,.625,-half-.014],
    [.438,.852,-half-.014],[.364,.936,-half-.014],[-.364,.936,-half-.014],[-.438,.852,-half-.014],[-.432,.625,-half-.014]];
  const grilleMat=new T.MeshStandardMaterial({map:maybachTexture('grille'),metalness:.72,roughness:.31,side:T.DoubleSide});
  const panel=polygon('Maybach vertical waterfall grille',grille,grilleMat),positions=panel.geometry.getAttribute('position');
  panel.geometry.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:positions.count},(_,i)=>[(positions.getX(i)+.438)/.876,(positions.getY(i)-.536)/.4]).flat(),2));
  root.add(panel,path('Maybach chrome grille surround',grille,.009,chrome,true));
  root.add(label('Maybach grille wordmark','M A Y B A C H',.22,.020,[0,.911,-half-.022],[0,Math.PI,0]));
  root.add(grid('Maybach lower intake shadow',32,4,(u,v)=>{const x=(u*2-1)*lerp(.76,.71,v);return [x,lerp(.34,.465,v),corner(x,-half)-.007];},dark));
  const star=starEmblem('Maybach standing bonnet star',.033,chrome,dark);star.position.set(0,1.039,-2.49);
  root.add(star,beam('Maybach ornament stem',[0,.967,-2.49],[0,1.010,-2.49],.0055,chrome));
  root.add(label('Maybach S680 boot lettering','MAYBACH                         S 680',.68,.031,[0,.919,half+.002]));
  const light=(name:string,key:string,points:P[],r:number)=>{
    const material=new T.MeshStandardMaterial({color:0x11151a,emissive:key==='head'||key==='position'?0xeff4ff:key==='tail'||key==='brake'?0xb81022:0xff971d,emissiveIntensity:0,roughness:.24});
    const m=path(name,points,r,material);m.userData.lightingKey=key;root.add(m);return m;
  };
  const masked=(name:string,key:string,points:P[],mask:T.Texture,back?:T.Material)=>{
    const m=polygon(name,points,back??new T.MeshStandardMaterial({color:0x11151a,alphaMap:mask,emissiveMap:mask,alphaTest:.08,side:T.DoubleSide}));
    const a=m.geometry.getAttribute('position');const xs=points.map(p=>Math.abs(p[0])),ys=points.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    m.geometry.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:a.count},(_,i)=>[(Math.abs(a.getX(i))-minX)/(maxX-minX),(a.getY(i)-minY)/(maxY-minY)]).flat(),2));
    if(!back){m.userData.lightingKey=key;m.userData.textureMaskedLight=true;}root.add(m);return m;
  };
  const optic=new T.MeshStandardMaterial({map:maybachTexture('head-optic'),roughness:.28,metalness:.48,side:T.DoubleSide});
  const headMask=maybachTexture('head-mask');
  for(const s of [-1,1]){
    const side=s<0?'Left':'Right',turn=s<0?'left':'right';
    const points:P[]=[[s*.48,.816,-half+.003],[s*.56,.887,-half+.014],[s*.810,.915,-half+.124],
      [s*.886,.871,-half+.223],[s*.878,.782,-half+.216],[s*.563,.768,-half+.014]];
    masked(side+' Maybach dark multi projector housing','',points,headMask,optic);
    masked(side+' Maybach masked digital LED projectors','head',points.map(([x,y,z])=>[x,y,z-.002] as P),headMask);
    root.add(polygon(side+' Maybach clear headlamp lens',points.map(([x,y,z])=>[x,y,z-.009] as P),lens));
    root.add(path(side+' Maybach fitted headlamp surround',points,.003,dark,true));
    light(side+' Maybach position eyebrow','position',[[s*.49,.85,-half-.004],[s*.66,.898,-half+.036],[s*.825,.909,-half+.117],[s*.910,.873,-half+.209]],.0045);
    for(let n=0;n<3;n++){
      const x=.62+n*.084,z=-half+.024+((x-.60)/.3)**2*.16;
      light(side+' Maybach three jewel position marker '+n,'position',[[s*x,.893,z],[s*x,.872,z-.002],[s*(x+.021),.862,z+.006]],.0035);
    }
    light(side+' Maybach front indicator',turn,[[s*.52,.790,-half+.001],[s*.69,.808,-half+.048],[s*.88,.817,-half+.188]],.004);
    light(side+' Maybach mirror indicator',turn,[[s*1.174,.996,-1.016],[s*1.074,.991,-1.043],[s*.981,.996,-1.021]],.003);
    const tail:P[]=[[s*.17,.892,half+.002],[s*.58,.973,half-.020],[s*.872,.977,half-.116],[s*.850,.819,half-.112],[s*.53,.853,half-.015]];
    root.add(polygon(side+' Maybach dark tail optic backing',tail,dark),polygon(side+' Maybach ruby tail lens',tail.map(([x,y,z])=>[x,y,z+.012] as P),redLens));
    for(let n=0;n<3;n++){
      const y=.012*n;
      light(side+' Maybach layered ruby tail guide '+n,'tail',[[s*.21,.896-y,half+.016],[s*.56,.954-y,half-.003],[s*.835,.960-y,half-.091],[s*.818,.846+y*.3,half-.089],[s*.55,.873,half+.001],[s*.21,.896-y,half+.016]],.0038);
    }
    light(side+' Maybach brake modules','brake',[[s*.37,.897,half+.015],[s*.60,.908,half-.004],[s*.812,.909,half-.087]],.008);
    light(side+' Maybach rear indicator',turn,[[s*.39,.863,half+.015],[s*.59,.875,half-.004],[s*.80,.880,half-.087]],.0035);
    light(side+' Maybach rear reverse','reverse',[[s*.53,.850,half+.018],[s*.68,.853,half-.027]],.003);
    root.add(rounded(side+' Maybach exhaust chrome surround',[.23,.060,.026],[s*.63,.286,half-.030],chrome));
    root.add(rounded(side+' Maybach dark exhaust aperture',[.202,.037,.029],[s*.63,.285,half-.010],dark));
  }
}

/** Twenty-inch Maybach five-hole forged wheel. One perforated dished face
 * provides real depth/occlusion; fine machining, bolts and lettering are mapped. */
export function buildMaybachS680Wheels(root:T.Group,c:VehicleVisualConfig){
  const pivots={} as Record<VehicleWheelId,T.Group>,wheels:T.Mesh[]=[];
  const tyre=new T.MeshStandardMaterial({color:0x111214,roughness:.94});
  const alloy=new T.MeshStandardMaterial({color:0xa7b1bb,metalness:.89,roughness:.23,envMapIntensity:1.15});
  const faceMaterial=new T.MeshStandardMaterial({map:maybachTexture('wheel'),color:0xb8c0c7,
    metalness:.87,roughness:.24,envMapIntensity:1.15});
  const dark=new T.MeshStandardMaterial({color:0x22292f,metalness:.50,roughness:.46});
  const anchors=localWheelPositions(c.dimensions);
  for(const id of VEHICLE_WHEEL_IDS){
    const front=id.startsWith('front'),left=id.endsWith('Left'),sign=left?-1:1;
    const width=(front?c.dimensions.frontWheelWidth:c.dimensions.rearWheelWidth)??c.dimensions.wheelWidth;
    const p=anchors[id],pivot=new T.Group();pivot.userData.wheelId=id;pivot.name=id+' Maybach wheel pivot';
    pivot.position.set(p.x,p.y-(c.staticBodyOffsetY??0),p.z);
    const r=c.wheelRadius;
    const tyreGeometry=new T.LatheGeometry([[.254,-width/2],[r*.91,-width/2],[r*.984,-width*.36],
      [r,0],[r*.984,width*.36],[r*.91,width/2],[.254,width/2]].map(([x,y])=>new T.Vector2(x,y)),64);
    tyreGeometry.rotateZ(Math.PI/2);const wheel=mesh('Maybach touring tyre',tyreGeometry,tyre);
    const barrel=new T.CylinderGeometry(.251,.251,width*.86,64,1,true);barrel.rotateZ(Math.PI/2);
    wheel.add(mesh('Maybach deep forged wheel barrel',barrel,dark));
    const brake=mesh('Maybach recessed brake disc',new T.CircleGeometry(.210,48),dark);
    brake.rotation.y=sign*Math.PI/2;brake.position.x=sign*(width*.5-.058);wheel.add(brake);
    const shape=new T.Shape();shape.absarc(0,0,.249,0,Math.PI*2,false);
    for(let n=0;n<5;n++){
      const a=n*Math.PI*2/5,cut=new T.Path();
      // Tangential kidney-shaped openings, with a visibly rounded forged edge.
      const points=Array.from({length:41},(_,i)=>{
        const t=-i/40*Math.PI*2,radial=.183+.033*Math.cos(t),tangent=.064*Math.sin(t);
        return new T.Vector2(Math.cos(a)*radial-Math.sin(a)*tangent,Math.sin(a)*radial+Math.cos(a)*tangent);
      });cut.setFromPoints(points);cut.closePath();shape.holes.push(cut);
    }
    const forged=new T.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:true,bevelThickness:.0028,
      bevelSize:.0028,bevelSegments:3,curveSegments:48,steps:1});
    const positions=forged.getAttribute('position'),uv=forged.getAttribute('uv'),normals=forged.getAttribute('normal');
    const normal=new T.Vector3();
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),radius=Math.hypot(x,y);
      positions.setZ(i,positions.getZ(i)+.024*T.MathUtils.smoothstep(radius,.075,.245));
      const t=T.MathUtils.clamp((radius-.075)/.170,0,1),slope=.024*6*t*(1-t)/.170;
      if(slope>0){
        // Transform the original smooth/bevel normals with the dishing surface;
        // recomputing each non-indexed triangle would leave chrome facet wedges.
        normal.set(normals.getX(i),normals.getY(i),normals.getZ(i));
        normal.set(normal.x-slope*x/radius*normal.z,normal.y-slope*y/radius*normal.z,normal.z).normalize();
        normals.setXYZ(i,normal.x,normal.y,normal.z);
      }
      uv.setXY(i,(x+.254)/.508,(y+.254)/.508);
    }
    forged.rotateY(sign*Math.PI/2);
    const face=mesh('Maybach five hole dished forged face',forged,faceMaterial);
    face.position.x=sign*(width*.5-.018);wheel.add(face);
    const rimGeometry=new T.TorusGeometry(.250,.0038,8,64);rimGeometry.rotateY(Math.PI/2);
    const rim=mesh('Maybach machined rolled outer lip',rimGeometry,alloy);
    rim.position.x=sign*(width*.5+.010);wheel.add(rim);
    const capGeometry=new T.CylinderGeometry(.040,.040,.009,40);capGeometry.rotateZ(Math.PI/2);
    const cap=mesh('Maybach recessed centre cap',capGeometry,dark);cap.position.x=sign*(width*.5-.005);wheel.add(cap);
    const badge=starEmblem('Maybach wheel hub star',.026,alloy,dark);badge.rotation.y=sign*Math.PI/2;
    badge.position.x=sign*(width*.5+.001);wheel.add(badge);
    pivot.add(wheel);root.add(pivot);pivots[id]=pivot;wheels.push(wheel);
  }
  return {pivots,wheels};
}
