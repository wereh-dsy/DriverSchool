import * as T from 'three';
import { surfaceGrid, surfaceMesh, surfaceQuad, surfaceRounded as roundedBox } from './SurfaceVehicleGeometry';
import { fitExteriorOverhangs } from './ExteriorEnvelope';
import { vehiclePaint, vehicleGlass } from './VehicleMaterials';
import { buildRefinedWheels } from './RefinedVehicleExterior';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';
import type { InstrumentTelemetry } from './InstrumentCluster';
import {SU7ExteriorDetails} from './SU7ExteriorDetails';

// Independently authored SU7 stations. Origin is axle midpoint; 0.9985 m
// overhangs are estimates pending a verified front/rear bumper datum.
// z / shoulder half-width / belt Y / belt half-width / shoulder Y.
const BODY: readonly (readonly number[])[] = [
  [-2.4985,.77,.695,.65,.49],[-2.35,.88,.755,.77,.59],[-2.1,.956,.82,.84,.69],
  [-1.8,.979,.875,.873,.75],[-1.5,.9815,.904,.883,.78],[-1.15,.968,.936,.887,.80],
  [-.7,.954,.951,.886,.80],[0,.950,.956,.883,.81],[.6,.967,.968,.887,.82],
  [1.15,.9815,.977,.897,.83],[1.5,.9815,.967,.890,.81],[1.85,.963,.948,.869,.76],
  [2.2,.918,.92,.831,.67],[2.4985,.84,.956,.77,.53],
];
// z / roof centre Y / half width / transverse crown.
const CANOPY: readonly (readonly number[])[] = [
  [-1.02,.943,.847,.012],[-.73,1.13,.772,.025],[-.33,1.365,.686,.035],
  [0,1.431,.681,.041],[.30,1.445,.678,.041],[.64,1.423,.667,.037],
  [.92,1.36,.655,.033],[1.28,1.18,.706,.025],[1.72,.958,.835,.014],
];
function sample(stations: readonly (readonly number[])[], z: number): number[] {
  let i = 0; while (i < stations.length - 2 && stations[i + 1]![0]! < z) i++;
  const a = stations[i]!, b = stations[i + 1]!, t = T.MathUtils.clamp((z-a[0]!)/(b[0]!-a[0]!),0,1);
  // Monotone Hermite tangents smooth the silhouette without overshooting its
  // dimensional envelope. Construction only; no per-frame tessellation.
  return a.map((v,k) => {
    if(!k)return z;
    const slope=(b[k]!-v)/(b[0]!-a[0]!);
    const tangent=(j:number)=>{
      if(j===0)return (stations[1]![k]!-stations[0]![k]!)/(stations[1]![0]!-stations[0]![0]!);
      if(j===stations.length-1)return slope;
      const p=stations[j-1]!,q=stations[j]!,r=stations[j+1]!;
      const l=(q[k]!-p[k]!)/(q[0]!-p[0]!),h=(r[k]!-q[k]!)/(r[0]!-q[0]!);
      return l*h<=0?0:2*l*h/(l+h);
    };
    const h=b[0]!-a[0]!,m0=tangent(i),m1=tangent(i+1);
    return (2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*h*m0+(-2*t*t*t+3*t*t)*b[k]!+(t*t*t-t*t)*h*m1;
  });
}

/** Shared mirror/door datum, in the same authored frame as this exterior. */
export function su7DoorSkinAnchor(z:number):T.Vector3 {
  const s=sample(BODY,z);return new T.Vector3(s[3]!,s[2]!-.008,z);
}

export function buildSU7MaxExterior(root: T.Group, c: VehicleVisualConfig): void {
  const paint = vehiclePaint(c.body.color, { side: T.DoubleSide,metalness:.52,roughness:.255,
    clearcoat:.92,clearcoatRoughness:.15,envMapIntensity:1.08,shadowSide:T.FrontSide });
  paint.name='SU7 mineral green metallic clearcoat';
  const details=new SU7ExteriorDetails();
  const trim = new T.MeshStandardMaterial({ color: c.body.trimColor, roughness: .58, side: T.DoubleSide });
  const lens = new T.MeshPhysicalMaterial({ color: 0xffffff,map:details.texture,metalness:.14,roughness:.20,
    clearcoat:.75,clearcoatRoughness:.10,side:T.DoubleSide });
  const pillarFinish=new T.MeshPhysicalMaterial({color:0x141b1d,roughness:.24,clearcoat:.55,side:T.DoubleSide});
  const grilleFinish=new T.MeshStandardMaterial({color:0xb2bab8,map:details.texture,roughness:.58,metalness:.22,side:T.DoubleSide});
  const badgeFinish=new T.MeshStandardMaterial({color:0xffffff,map:details.texture,metalness:.75,roughness:.29,alphaTest:.5,side:T.DoubleSide});
  const projectorFinish=new T.MeshStandardMaterial({color:0xffffff,alphaMap:details.texture,emissiveMap:details.texture,
    alphaTest:.64,roughness:.18,side:T.DoubleSide});
  const white = new T.MeshStandardMaterial({ color: 0xd6e5ef, side: T.DoubleSide });
  const red = new T.MeshStandardMaterial({ color: 0x76101c, side: T.DoubleSide });
  const glass = vehicleGlass(c.windowGlass!.color, c.windowGlass!.windowOpacity);
  const frontGlass = glass.clone(); frontGlass.opacity = c.windowGlass!.windshieldOpacity;
  frontGlass.roughness=.08;frontGlass.clearcoat=.6;
  const rearGlass=glass.clone();rearGlass.opacity=.90;rearGlass.color.set(0x263b32);
  const roofGlass=glass.clone();roofGlass.opacity=.94;roofGlass.color.set(0x13212b);
  const y = (height: number) => height - (c.staticBodyOffsetY ?? 0);
  const canopyPoint=(a:number,z:number):P=>{
    const s=sample(CANOPY,z),t=T.MathUtils.clamp((z+1.02)/.69,0,1);
    // Double curvature, including a rearward wrap at the A-pillar. Boundaries
    // stay on their original cowl/roof datums; all bordering panels use this surface.
    return [a*s[2]!,y(s[1]!-s[3]!*a*a),z+.032*a*a*Math.sin(t*Math.PI)];
  };
  const add = (mesh: T.Mesh, part: string, key?: string): T.Mesh => {
    mesh.userData.vehicleBodyPart = part;
    // Alpha-blended clear glass must not cast an opaque shadow over the cabin.
    // The dark panoramic roof retains its separately authored roof occlusion.
    if(part==='glass')mesh.castShadow=false;
    if (key) { mesh.userData.lightingKey = key; mesh.userData.refinedOptics = true; }
    root.add(mesh); return mesh;
  };
  const grid = (name: string, rows: number, columns: number, point: (u:number,v:number)=>P,
    mat: T.Material, part: string) => {
    const mesh=surfaceGrid(name,rows,columns,point,mat);
    if(mat===paint){
      // Give both flanks and the rear the same outward-facing winding. The
      // explicit one-sided depth pass avoids two coincident shadow faces on a skin.
      const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');let outward=0;
      for(let i=0;i<p.count;i++)outward+=p.getX(i)*n.getX(i)+(p.getY(i)-.65)*n.getY(i)+p.getZ(i)*n.getZ(i);
      if(outward<0){const index=mesh.geometry.index!;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}mesh.geometry.computeVertexNormals();}
    }
    return add(mesh,part);
  };
  const path = (name: string, points: P[], radius: number, mat: T.Material, part: string, key?: string) => {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    const mesh = new T.Mesh(new T.TubeGeometry(curve,Math.max(12,points.length*3),radius,5,false),mat);
    mesh.name = name; return add(mesh,part,key);
  };
  const corner = (x:number,z:number) => z + (z<0 ? .13 : -.11) *
    (Math.abs(x)/.9815)**3 * T.MathUtils.smoothstep(Math.abs(z),2.02,2.4985);
  const arch = (z:number) => {
    const distance = Math.min(Math.abs(z+1.5),Math.abs(z-1.5));
    const r = c.wheelRadius + c.body.wheelArchClearance;
    return distance < r ? Math.max(.245,c.wheelRadius+Math.sqrt(r*r-distance*distance)) : .245;
  };
  const flank = (sign:number,z:number,height:number):P => {
    const s=sample(BODY,z), shoulder=s[4]!, top=Math.max(s[2]!,arch(z)+.018);
    const half=height<shoulder ? s[1]!*(.94+.06*Math.sin(T.MathUtils.clamp((height-.245)/(shoulder-.245),0,1)*Math.PI/2))
      : T.MathUtils.lerp(s[1]!,s[3]!,T.MathUtils.clamp((height-shoulder)/(top-shoulder),0,1)**1.6);
    return [sign*half,y(height),corner(half,z)];
  };
  const hoodHalf=(z:number)=>.50+.20*T.MathUtils.smoothstep(z,-2.45,-1.02);
  const hoodPoint=(x:number,z:number):P=>{
    const s=sample(BODY,z),a=x/s[3]!,t=T.MathUtils.clamp((z+2.4985)/1.4785,0,1);
    const crown=Math.sin(t*Math.PI)*(.028*(1-a*a)+.0045*Math.exp(-(((Math.abs(a)-.65)/.14)**2)));
    return [x,y(s[2]!+crown),corner(x,z)];
  };
  const deckPoint=(a:number,z:number):P=>{
    const s=sample(BODY,z),blend=T.MathUtils.smoothstep(z,1.72,1.92),join=canopyPoint(a,1.72);
    return [a*T.MathUtils.lerp(.835,s[3]!,blend),T.MathUtils.lerp(join[1],y(s[2]!+.018*(1-a*a)),blend),corner(a*s[3]!,z)];
  };
  const access=c.driverAccess!,hinge=new T.Group(),door=new T.Group();
  const anchor=su7DoorSkinAnchor(access.doorFrontZ);
  hinge.name='Driver door hinge';hinge.position.set(-anchor.x,y(anchor.y),access.doorFrontZ);
  door.name='Driver door';hinge.add(door);root.add(hinge);
  const onDoor=(mesh:T.Object3D)=>{mesh.position.sub(hinge.position);door.add(mesh);};
  const sideGlass=(name:string,sign:number,from:number,to:number,material:T.Material)=>grid(name,to-from<.1?4:20,6,(u,v)=>{
    const z=T.MathUtils.lerp(from,to,u),s=sample(BODY,z),roof=sample(CANOPY,z);
    const edge=canopyPoint(sign,z);
    return [sign*T.MathUtils.lerp(s[3]!-.008,roof[2]!,v),y(T.MathUtils.lerp(s[2]!+.008,roof[1]!-roof[3]!,v)),T.MathUtils.lerp(z,edge[2],v)];
  },material,'glass');
  for (const sign of [-1,1]) {
    const label=sign<0?'Left':'Right';
    for(const [from,to,moving] of sign<0?[[-2.4985,access.doorFrontZ,false],[access.doorFrontZ,access.doorRearZ,true],[access.doorRearZ,2.4985,false]] as const:[[-2.4985,2.4985,false]] as const) {
      const skin=grid(moving?'SU7 driver outer door skin':label+' SU7 flowing shoulder',Math.ceil((to-from)*23),10,(u,v)=>{
      const z=T.MathUtils.lerp(from,to,u), s=sample(BODY,z), low=arch(z);
      return flank(sign,z,T.MathUtils.lerp(low,Math.max(low+.018,s[2]!),v));
      },paint,moving?'door':'main-shell');
      if(moving)onDoor(skin);
    }
    for (const axle of [-1.5,1.5]) {
      grid(label+' SU7 closed inner wheelhouse',36,2,(u,v)=>{
        const a=u*Math.PI,r=T.MathUtils.lerp(c.wheelRadius*.88,c.wheelRadius+c.body.wheelArchClearance-.004,v);
        return [sign*.714,y(c.wheelRadius+Math.sin(a)*r),axle+Math.cos(a)*r];
      },trim,'wheel-liner');
      grid(label+' SU7 wheel arch liner',36,3,(u,v)=>{
        const a=u*Math.PI,r=c.wheelRadius+c.body.wheelArchClearance-.004;
        return [sign*T.MathUtils.lerp(.72,.976,v),y(c.wheelRadius+Math.sin(a)*r),axle+Math.cos(a)*r];
      },trim,'wheel-liner');
      grid(label+' SU7 rolled wheel arch',36,2,(u,v)=>{
      const r=c.wheelRadius+c.body.wheelArchClearance+v*.008, a=u*Math.PI;
      const p=flank(sign,axle+Math.cos(a)*r,c.wheelRadius+Math.sin(a)*r);
      return [p[0]+sign*.002,p[1],p[2]];
      },paint,'wheel-arch');
    }
    if(sign<0) {
      sideGlass('SU7 fixed driver quarter glass',sign,-.98,access.doorFrontZ,glass);
      sideGlass('SU7 fixed left rear glass',sign,access.doorRearZ+.039,1.40,glass);
      const pane=sideGlass('SU7 movable driver glass',sign,access.doorFrontZ,access.doorRearZ-.039,glass.clone());
      pane.geometry.translate(-hinge.position.x,-hinge.position.y,-hinge.position.z);
      const mount=new T.Group();mount.name='Driver window glass mount';
      mount.userData.driverWindowBeltHeight=y(.957)-hinge.position.y;
      mount.add(pane);door.add(mount);
    } else {
      sideGlass(label+' SU7 front side glass',sign,-.98,access.doorRearZ-.039,glass);
      sideGlass(label+' SU7 rear side glass',sign,access.doorRearZ+.039,1.40,glass);
    }
    const lower:P[]=[];
    for(let i=0;i<=40;i++){
      const z=T.MathUtils.lerp(-1.02,1.72,i/40),b=sample(BODY,z);
      lower.push([sign*b[3]!,y(b[2]!+.006),z]);
    }
    grid(label+' SU7 continuous painted roof frame',40,2,(u,v)=>{
      const z=T.MathUtils.lerp(-1.02,1.72,u),p=canopyPoint(sign,z);
      return [p[0]+sign*v*.028,p[1]-.010*v,p[2]];
    },paint,'roof-rail');
    const pillarCorners=[[-.006,.002,-.004],[.044,-.014,.007],[.038,-.034,.038],[-.008,-.024,.028]] as const;
    const pillarPositions:number[]=[],pillarUV:number[]=[],pillarIndex:number[]=[];
    for(let i=0;i<=20;i++){
      const p=canopyPoint(sign,T.MathUtils.lerp(-1.02,-.33,i/20));
      for(let j=0;j<4;j++){const q=pillarCorners[j]!;pillarPositions.push(p[0]+sign*q[0],p[1]+q[1],p[2]+q[2]);pillarUV.push(i/20,j/3);}
    }
    for(let i=0;i<20;i++)for(let j=0;j<4;j++){
      const a=i*4+j,b=i*4+(j+1)%4;pillarIndex.push(a,b,a+4,b,b+4,a+4);
    }
    pillarIndex.push(0,2,1,0,3,2,80,81,82,80,82,83);
    add(surfaceMesh(label+' SU7 structural A pillar',pillarPositions,pillarIndex,pillarUV,paint),'pillar');
    grid(label+' SU7 gloss B pillar',12,3,(u,v)=>{
      const z=access.doorRearZ+(u-.5)*.082,b=sample(BODY,z),p=canopyPoint(sign,z);
      return [T.MathUtils.lerp(sign*(b[3]!+.001),p[0]+sign*.004,v),T.MathUtils.lerp(y(b[2]!+.003),p[1],v),z];
    },pillarFinish,'pillar');
    grid(label+' SU7 swept C pillar',10,4,(u,v)=>{
      const z=T.MathUtils.lerp(1.395,1.72,u),b=sample(BODY,z),p=canopyPoint(sign,z);
      return [T.MathUtils.lerp(sign*b[3]!,p[0],v),T.MathUtils.lerp(y(b[2]!),p[1],v),z];
    },paint,'pillar');
    if(sign<0) {
      for(const [from,to,moving] of [[-1.02,access.doorFrontZ,false],[access.doorFrontZ,access.doorRearZ,true],[access.doorRearZ,1.72,false]] as const) {
        const points:P[]=[];for(let i=0;i<=20;i++){const z=T.MathUtils.lerp(from,to,i/20),b=sample(BODY,z);points.push([sign*b[3]!,y(b[2]!+.006),z]);}
        const seal=path(label+' SU7 window lower seal',points,.004,trim,'window-trim');if(moving)onDoor(seal);
      }
    }else path(label+' SU7 window lower seal',lower,.004,trim,'window-trim');
    for(const z of [.29,1.35]) {
      const points:P[]=[];
      for(let i=0;i<=12;i++){const h=T.MathUtils.lerp(Math.max(.27,arch(z)),sample(BODY,z)[2]!,i/12);const p=flank(sign,z,h);points.push([p[0]+sign*.002,p[1],p[2]]);}
      const seam=path(label+' SU7 door shut line',points,.0017,trim,'panel-gap');if(sign<0&&z<.30)onDoor(seam);
    }
    for(const z of [.07,1.09]) {
      const p=flank(sign,z,.895);
      const recess=path(label+' SU7 handle recess',[[p[0]+sign*.003,p[1],z-.067],[p[0]+sign*.006,p[1],z+.067]],.012,trim,'door-handle');
      const handle=path(label+' SU7 semi-recessed mechanical handle',[[p[0]+sign*.005,p[1],z-.065],[p[0]+sign*.009,p[1],z+.065]],.009,paint,'door-handle');
      if(sign<0&&z<.30){onDoor(handle);onDoor(recess);}
    }
    path(label+' SU7 lower rocker',[[sign*.923,y(.275),-1.05],[sign*.928,y(.265),1.06]],.012,trim,'sill');
  }
  for(const z of [access.doorFrontZ,access.doorRearZ])grid('SU7 driver door return',8,1,(u,v)=>{
    const h=T.MathUtils.lerp(.265,sample(BODY,z)[2]!,u),p=flank(-1,z,h);
    return [T.MathUtils.lerp(p[0],-.825,v),p[1],p[2]];
  },trim,'door-jamb');
  add(roundedBox('SU7 driver sill threshold',[.12,.035,1.18],[-.855,y(.26),-.32],trim,.009),'sill');
  grid('SU7 long sculpted bonnet',32,14,(u,v)=>{
    const z=T.MathUtils.lerp(-2.4985,-1.02,u);return hoodPoint((2*v-1)*hoodHalf(z),z);
  },paint,'hood');
  for(const sign of [-1,1]){
    grid((sign<0?'Left':'Right')+' SU7 separate front wing',32,4,(u,v)=>{
      const z=T.MathUtils.lerp(-2.4985,-1.02,u),s=sample(BODY,z);
      return hoodPoint(sign*T.MathUtils.lerp(hoodHalf(z),s[3]!,v),z);
    },paint,'fender');
    grid((sign<0?'Left':'Right')+' SU7 bonnet panel gap',32,1,(u,v)=>{
      const z=T.MathUtils.lerp(-2.43,-1.035,u),p=hoodPoint(sign*(hoodHalf(z)+(v-.5)*.0022),z);return [p[0],p[1]+.0007,p[2]];
    },trim,'panel-gap');
  }
  grid('SU7 recessed windscreen cowl',24,2,(u,v)=>{
    const a=2*u-1,p=hoodPoint(a*.847,-1.048),q=canopyPoint(a,-1.02);
    return [T.MathUtils.lerp(p[0],q[0],v),T.MathUtils.lerp(p[1],q[1],v)+.0007,T.MathUtils.lerp(p[2],q[2],v)];
  },trim,'cowl');
  grid('SU7 short rear deck',24,16,(u,v)=>{
    return deckPoint(2*v-1,T.MathUtils.lerp(1.72,2.4985,u));
  },paint,'trunk');
  for(const sign of [-1,1])grid((sign<0?'Left':'Right')+' SU7 rear deck shoulder closure',12,2,(u,v)=>{
    const z=T.MathUtils.lerp(1.72,1.92,u),p=deckPoint(sign,z),q=flank(sign,z,sample(BODY,z)[2]!);
    return [T.MathUtils.lerp(p[0],q[0],v),T.MathUtils.lerp(p[1],q[1],v),T.MathUtils.lerp(p[2],q[2],v)];
  },paint,'trunk');
  for(const [name,from,to,mat,part] of [
    ['SU7 panoramic windshield',-1.02,-.33,frontGlass,'glass'],['SU7 panoramic glass roof',-.33,.92,roofGlass,'roof'],
    ['SU7 fastback rear glass',.92,1.72,rearGlass,'glass'],
  ] as const) grid(name,part==='roof'?24:28,part==='roof'?16:20,(u,v)=>{
    return canopyPoint(2*v-1,T.MathUtils.lerp(from,to,u));
  },mat,part);
  for(const sign of [-1,1])grid((sign<0?'Left':'Right')+' SU7 windscreen ceramic edge',24,1,(u,v)=>{
    const p=canopyPoint(sign*(.976+.024*v),T.MathUtils.lerp(-1.02,-.33,u));return [p[0],p[1]+.0008,p[2]];
  },trim,'window-trim');
  for(const z of [-1.02,-.33])grid('SU7 windscreen end frit',24,1,(u,v)=>{
    const p=canopyPoint(2*u-1,z+(z<-.5?1:-1)*v*.014);return [p[0],p[1]+.0008,p[2]];
  },trim,'window-trim');
  for(const sign of [-1,1])grid((sign<0?'Left':'Right')+' SU7 rear glass ceramic edge',24,1,(u,v)=>{
    const p=canopyPoint(sign*(.965+.035*v),T.MathUtils.lerp(.92,1.72,u));return [p[0],p[1]+.0008,p[2]];
  },trim,'window-trim');
  for(const front of [true,false]) {
    const z=front?-2.4985:2.4985,s=sample(BODY,z);
    grid(front?'SU7 closed nose':'SU7 rear bumper',12,28,(u,v)=>{
      const a=2*v-1,top=s[2]!+(front?0:.018*(1-a*a));
      const h=T.MathUtils.lerp(.245,top,u),half=Math.abs(flank(1,z,h)[0]),x=a*half;
      return [x,y(h),corner(x,z)+(front?-.035:.030)*Math.sin(u*Math.PI)*(1-(x/half)**2)];
    },paint,'bumper');
  }
  const faceZ=(x:number,front:boolean,height=.47)=>{
    const end=front?-2.4985:2.4985,half=Math.abs(flank(1,end,height)[0]),fade=Math.max(0,1-(x/half)**2);
    return corner(x,end)+(front?-.035*Math.sin(T.MathUtils.clamp((height-.245)/.45,0,1)*Math.PI)*fade-.004:
      .030*Math.sin(T.MathUtils.clamp((height-.245)/.711,0,1)*Math.PI)*fade+.006);
  };
  const rearPoint=(x:number,h:number):P=>{
    const sign=Math.sign(x)||1,half=Math.abs(flank(1,2.4985,h)[0]);
    if(Math.abs(x)<=half)return [x,y(h),faceZ(x,false,h)];
    // Solve the existing flank surface once while authoring: the lamp's outer
    // return sits on the quarter panel rather than floating beside the bumper.
    let lo=1.85,hi=2.4985;
    for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(Math.abs(flank(1,mid,h)[0])>Math.abs(x))lo=mid;else hi=mid;}
    const p=flank(sign,(lo+hi)/2,h);return [p[0]+sign*.002,p[1],p[2]+.006];
  };
  const lampPoint=(sign:number,x:number,z:number):P=>{
    const p=hoodPoint(sign*x,z);return [p[0],p[1]+.009,p[2]];
  };
  for(const sign of [-1,1]) {
    const label=sign<0?'Left':'Right';
    // Waterdrop lens travels back over the fender, rather than a flat rectangle.
    const outline:readonly (readonly [number,number])[]=[[.51,-2.395],[.63,-2.43],[.79,-2.32],[.855,-2.13],
      [.82,-1.99],[.72,-2.00],[.60,-2.17],[.51,-2.34]];
    const curve=new T.CatmullRomCurve3(outline.map(([x,z])=>new T.Vector3(x,0,z)),true,'centripetal');
    const points:P[]=curve.getPoints(48).map(p=>lampPoint(sign,p.x,p.z));
    const positions:number[]=[],indices:number[]=[],uv:number[]=[];
    const centre=lampPoint(sign,.708,-2.223);
    positions.push(...centre);uv.push((.708-.49)/.38,(-2.223+2.45)/.48);
    for(const p of points.slice(0,-1)){positions.push(...p);uv.push((Math.abs(p[0])-.49)/.38,(p[2]+2.45)/.48);}
    for(let i=0;i<48;i++)indices.push(0,i+1,(i+1)%48+1);
    const housing=add(details.apply(surfaceMesh(label+' SU7 waterdrop lamp',positions,indices,uv,lens),'lamp'),'headlamp');
    housing.userData.refinedOptics=true;
    const projector=new T.Mesh(housing.geometry,projectorFinish);projector.name=label+' SU7 four projector optics';projector.position.y=.0015;
    projector.userData.textureMaskedLight=true;add(projector,'lamp-lens','head');
    grid(label+' SU7 inset lamp seal',48,1,(u,v)=>{
      const p=curve.getPoint(u),x=T.MathUtils.lerp(.708,p.x,1+v*.025),z=T.MathUtils.lerp(-2.223,p.z,1+v*.025);
      const q=lampPoint(sign,x,z);return [q[0],q[1]+.0005,q[2]];
    },trim,'headlamp-seal');
    path(label+' SU7 waterdrop DRL',[lampPoint(sign,.54,-2.377),lampPoint(sign,.675,-2.269),lampPoint(sign,.823,-2.115)],.0055,white,'lamp-lens','position');
    path(label+' SU7 front indicator',[lampPoint(sign,.55,-2.401),lampPoint(sign,.69,-2.336),lampPoint(sign,.80,-2.238)],.0035,white,'lamp-lens',sign<0?'left':'right');
    path(label+' SU7 rear indicator',[rearPoint(sign*.58,.865),rearPoint(sign*.72,.868),rearPoint(sign*.82,.876)],.0045,red,'lamp-lens',sign<0?'left':'right');
    path(label+' SU7 reverse optic',[rearPoint(sign*.54,.849),rearPoint(sign*.65,.849)],.0035,white,'lamp-lens','reverse');
    path(label+' SU7 brake arc',[rearPoint(sign*.45,.889),rearPoint(sign*.65,.895),rearPoint(sign*.81,.889)],.006,red,'lamp-lens','brake');
    grid(label+' SU7 recessed air curtain',4,3,(u,v)=>{
      const h=T.MathUtils.lerp(.29,.60,u),inner=T.MathUtils.lerp(.72,.785,u),outer=T.MathUtils.lerp(.78,.855,u),x=sign*T.MathUtils.lerp(inner,outer,v);
      return [x,y(h),faceZ(x,true,h)-.001];
    },trim,'intake');
    const mirror=sign<0?c.leftMirrorTransform:c.rightMirrorTransform;
    const repeater=path(label+' SU7 mirror repeater',[[mirror.position[0]-.04,mirror.position[1]-.027,mirror.position[2]-.043],
      [mirror.position[0]+.04,mirror.position[1]-.027,mirror.position[2]-.043]],.004,white,'lamp-lens',sign<0?'left':'right');
    repeater.userData.mirrorSide=sign<0?'left':'right';
  }
  const tailCurve=new T.CatmullRomCurve3([[-.875,.866],[-.84,.890],[-.69,.902],[-.36,.890],[0,.887],
    [.36,.890],[.69,.902],[.84,.890],[.875,.866],[.80,.844],[.60,.835],[0,.831],[-.60,.835],[-.80,.844]]
    .map(([x,h])=>new T.Vector3(x,h,0)),true,'centripetal');
  const ring=tailCurve.getPoints(40).map(p=>rearPoint(p.x,p.y));
  const tailPositions:number[]=[...rearPoint(0,.866)],tailUV:number[]=[.5,.5],tailIndex:number[]=[];
  for(const p of ring.slice(0,-1)){tailPositions.push(...p);tailUV.push((p[0]+.9)/1.8,(p[1]-.82)/.1);}
  for(let i=0;i<40;i++)tailIndex.push(0,i+1,(i+1)%40+1);
  add(surfaceMesh('SU7 wrapped halo lamp housing',tailPositions,tailIndex,tailUV,pillarFinish.clone()),'tail-lamp');
  const halo=path('SU7 continuous halo tail lamp',ring.map((p):P=>[p[0],p[1],p[2]+.0015]),.0045,red,'lamp-lens','tail');
  halo.userData.wrappedRearSurface=true;
  path('SU7 high mounted stop',[[ -.14,y(1.296),1.02],[.14,y(1.296),1.02]],.006,red,'lamp-lens','brake');
  path('SU7 rear fog lamp',[[-.085,y(.30),2.51],[.085,y(.30),2.51]],.007,red,'lamp-lens','fogRear');
  const grille=grid('SU7 lower cooling inlet',24,4,(u,v)=>{
    const h=T.MathUtils.lerp(.278,.435,v),half=T.MathUtils.lerp(.56,.665,v),x=(2*u-1)*half;
    return [x,y(h),faceZ(x,true,h)-.001];
  },grilleFinish,'intake');
  const grilleUV=grille.geometry.getAttribute('uv');
  for(let i=0;i<grilleUV.count;i++){const a=grilleUV.getX(i),b=grilleUV.getY(i);grilleUV.setXY(i,1-b,a);}
  details.apply(grille,'grille');
  add(roundedBox('SU7 recessed grille radar cover',[.16,.048,.010],[0,y(.410),faceZ(0,true,.410)-.004],pillarFinish,.011),'intake');
  grid('SU7 rear diffuser',24,4,(u,v)=>{
    const x=(2*u-1)*T.MathUtils.lerp(.70,.76,v),h=T.MathUtils.lerp(.248,.385,v);return rearPoint(x,h);
  },trim,'diffuser');
  for(const x of [-.53,-.27,0,.27,.53]) add(roundedBox('SU7 diffuser fin',[.012,.09,.20],[x,y(.255),2.39],trim,.004),'diffuser');
  add(roundedBox('SU7 rear plate recess',[.46,.10,.018],[0,y(.61),faceZ(0,false,.61)],trim,.007),'license-plate');
  add(roundedBox('SU7 lidar fairing',[.18,.045,.11],[0,y(1.423),-.22],trim,.02),'sensor-housing');
  const badge=grid('SU7 nose badge',4,4,(u,v)=>{
    const p=hoodPoint((u-.5)*.045,-2.27+(v-.5)*.032);return [p[0],p[1]+.0012,p[2]];
  },badgeFinish,'badge');
  const badgeUV=badge.geometry.getAttribute('uv');
  for(let i=0;i<badgeUV.count;i++){const a=badgeUV.getX(i),b=badgeUV.getY(i);badgeUV.setXY(i,1-b,a);}
  details.apply(badge,'badge');badge.castShadow=false;
  add(surfaceQuad('SU7 sealed battery underfloor',[[-.70,y(.134),-2.15],[.70,y(.134),-2.15],[.70,y(.134),2.14],[-.70,y(.134),2.14]],trim),'underfloor');
  const spoiler=new T.Group();spoiler.name='SU7 electric spoiler';spoiler.position.set(0,y(.939),2.19);
  spoiler.add(roundedBox('SU7 spoiler blade',[1.43,.025,.19],[0,0,0],paint,.011));
  const strut=new T.BoxGeometry(.028,.14,.034);
  for(const sign of [-1,1]) {const mesh=new T.Mesh(strut,trim);mesh.position.set(sign*.49,-.075,0);spoiler.add(mesh);}
  root.add(spoiler);root.userData.exteriorShape='2026 SU7 Max independent body';
  fitExteriorOverhangs(root,c,.9985,.9985);
}

export function buildSU7MaxWheels(root:T.Group,c:VehicleVisualConfig) {
  const result=buildRefinedWheels(root,c,{wheelInches:20,spokes:5});
  const red=new T.MeshStandardMaterial({color:0xb82a2e,roughness:.4,metalness:.28});
  const geometry=new T.BoxGeometry(.052,.14,.07);
  for(const [id,pivot] of Object.entries(result.pivots)) {
    const caliper=new T.Mesh(geometry,red);caliper.name='SU7 fixed brake caliper';
    caliper.position.set((id.endsWith('Left')?-1:1)*.073,0,-.14);pivot.add(caliper);
    const wheel=pivot.children[0]!,face=wheel.children.find(o=>o.name.includes('spoke alloy face')) as T.Mesh;
    const front=id.startsWith('front'),width=(front?c.dimensions.frontWheelWidth:c.dimensions.rearWheelWidth)??c.dimensions.wheelWidth;
    const sign=id.endsWith('Left')?-1:1,positions:number[]=[],indices:number[]=[];
    for(let spoke=0;spoke<5;spoke++){
      const angle=spoke*Math.PI*2/5,ca=Math.cos(angle),sa=Math.sin(angle),base=positions.length/3;
      for(const [t,r] of [[-.023,.048],[-.035,.145],[-.024,.238],[.024,.238],[.035,.145],[.023,.048]])positions.push(sign*(width/2-.012),t!*ca-r!*sa,t!*sa+r!*ca);
      for(let n=1;n<5;n++)indices.push(base,base+n,base+n+1);
    }
    const faceGeometry=new T.BufferGeometry();faceGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));faceGeometry.setIndex(indices);faceGeometry.computeVertexNormals();
    face.geometry.dispose();face.geometry=faceGeometry;face.name='SU7 20 inch five petal alloy face';
  }
  return result;
}

/** Presentation follows the fixed-step physical actuator, including hysteresis/smoothing. */
export class SU7Spoiler {
  private readonly baseY:number;
  public constructor(private readonly mesh:T.Object3D) {this.baseY=mesh.position.y;}
  public update(t:InstrumentTelemetry):void {
    const deployment=t.activeSpoilerDeployment??0;
    this.mesh.position.y=this.baseY+.115*deployment;
    this.mesh.rotation.x=-.10*deployment;
  }
}
