import * as T from 'three';
import { surfaceGrid, surfaceMesh, surfaceQuad, surfaceRounded as roundedBox } from './SurfaceVehicleGeometry';
import { fitExteriorOverhangs } from './ExteriorEnvelope';
import { vehiclePaint, vehicleGlass } from './VehicleMaterials';
import { buildRefinedWheels } from './RefinedVehicleExterior';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';
import type { InstrumentTelemetry } from './InstrumentCluster';

// Independently authored SU7 stations. Origin is axle midpoint; 0.9985 m
// overhangs are estimates pending a verified front/rear bumper datum.
// z / shoulder half-width / belt Y / belt half-width / shoulder Y.
const BODY: readonly (readonly number[])[] = [
  [-2.4985,.77,.73,.65,.51],[-2.35,.88,.80,.77,.62],[-2.1,.956,.87,.84,.72],
  [-1.8,.979,.925,.873,.77],[-1.5,.9815,.945,.883,.79],[-1.15,.968,.947,.887,.80],
  [-.7,.954,.951,.886,.80],[0,.950,.956,.883,.81],[.6,.967,.968,.887,.82],
  [1.15,.9815,.977,.897,.83],[1.5,.9815,.967,.890,.81],[1.85,.963,.948,.869,.76],
  [2.2,.918,.92,.831,.67],[2.4985,.80,.875,.72,.53],
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
  return a.map((v,k) => k ? T.MathUtils.lerp(v,b[k]!,t) : z);
}

export function buildSU7MaxExterior(root: T.Group, c: VehicleVisualConfig): void {
  const paint = vehiclePaint(c.body.color, { side: T.DoubleSide });
  const trim = new T.MeshStandardMaterial({ color: c.body.trimColor, roughness: .58, side: T.DoubleSide });
  const alloy = new T.MeshStandardMaterial({ color: 0xadb6bc, metalness: .8, roughness: .26 });
  const lens = new T.MeshStandardMaterial({ color: 0x14212c, metalness: .2, roughness: .19, side: T.DoubleSide });
  const white = new T.MeshStandardMaterial({ color: 0xd6e5ef, side: T.DoubleSide });
  const red = new T.MeshStandardMaterial({ color: 0x76101c, side: T.DoubleSide });
  const glass = vehicleGlass(c.windowGlass!.color, c.windowGlass!.windowOpacity);
  const frontGlass = glass.clone(); frontGlass.opacity = c.windowGlass!.windshieldOpacity;
  const roofGlass=glass.clone();roofGlass.opacity=.94;roofGlass.color.set(0x13212b);
  const y = (height: number) => height - (c.staticBodyOffsetY ?? 0);
  const add = (mesh: T.Mesh, part: string, key?: string): T.Mesh => {
    mesh.userData.vehicleBodyPart = part;
    if (key) { mesh.userData.lightingKey = key; mesh.userData.refinedOptics = true; }
    root.add(mesh); return mesh;
  };
  const grid = (name: string, rows: number, columns: number, point: (u:number,v:number)=>P,
    mat: T.Material, part: string) => add(surfaceGrid(name,rows,columns,point,mat),part);
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
  for (const sign of [-1,1]) {
    const label=sign<0?'Left':'Right';
    grid(label+' SU7 flowing shoulder',112,10,(u,v)=>{
      const z=T.MathUtils.lerp(-2.4985,2.4985,u), s=sample(BODY,z), low=arch(z);
      return flank(sign,z,T.MathUtils.lerp(low,Math.max(low+.018,s[2]!),v));
    },paint,'main-shell');
    for (const axle of [-1.5,1.5]) {
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
    grid(label+' SU7 curved side glass',45,10,(u,v)=>{
      const z=T.MathUtils.lerp(-.98,1.68,u), s=sample(BODY,z), roof=sample(CANOPY,z);
      const h=T.MathUtils.lerp(s[2]!+.008,roof[1]!-roof[3]!,v);
      return [sign*T.MathUtils.lerp(s[3]!-.008,roof[2]!,v),y(h),z];
    },glass,'glass');
    const upper:P[]=[],lower:P[]=[];
    for(let i=0;i<=40;i++){
      const z=T.MathUtils.lerp(-1.02,1.72,i/40),b=sample(BODY,z),r=sample(CANOPY,z);
      upper.push([sign*r[2]!,y(r[1]!-r[3]!),z]);lower.push([sign*b[3]!,y(b[2]!+.006),z]);
    }
    path(label+' SU7 painted roof rail',upper,.012,paint,'roof-rail');
    path(label+' SU7 window lower seal',lower,.004,trim,'window-trim');
    for (const z of [-.96,.30,1.30]) {
      const b=sample(BODY,z),r=sample(CANOPY,z);
      path(label+' SU7 window pillar',[[sign*b[3]!,y(b[2]!),z],[sign*r[2]!,y(r[1]!-r[3]!),z]],z===.30?.018:.012,trim,'pillar');
    }
    for(const z of [.29,1.35]) {
      const points:P[]=[];
      for(let i=0;i<=12;i++){const h=T.MathUtils.lerp(Math.max(.27,arch(z)),sample(BODY,z)[2]!,i/12);const p=flank(sign,z,h);points.push([p[0]+sign*.002,p[1],p[2]]);}
      path(label+' SU7 door shut line',points,.0017,trim,'panel-gap');
    }
    for(const z of [.07,1.09]) {
      const p=flank(sign,z,.895);
      path(label+' SU7 semi-recessed mechanical handle',[[p[0]+sign*.005,p[1],z-.065],[p[0]+sign*.009,p[1],z+.065]],.009,paint,'door-handle');
    }
    path(label+' SU7 lower rocker',[[sign*.923,y(.275),-1.05],[sign*.928,y(.265),1.06]],.012,trim,'sill');
  }
  for(const [name,from,to,mat,part] of [
    ['SU7 long sculpted bonnet',-2.4985,-1.02,paint,'hood'],['SU7 short rear deck',1.72,2.4985,paint,'trunk'],
  ] as const) grid(name,32,22,(u,v)=>{
    const z=T.MathUtils.lerp(from,to,u),s=sample(BODY,z),a=2*v-1;
    return [a*s[3]!,y(s[2]!+.018*(1-a*a)),corner(a*s[3]!,z)];
  },mat,part);
  for(const [name,from,to,mat,part] of [
    ['SU7 panoramic windshield',-1.02,-.33,frontGlass,'glass'],['SU7 panoramic glass roof',-.33,.92,roofGlass,'roof'],
    ['SU7 fastback rear glass',.92,1.72,glass,'glass'],
  ] as const) grid(name,28,20,(u,v)=>{
    const z=T.MathUtils.lerp(from,to,u),s=sample(CANOPY,z),a=2*v-1;
    return [a*s[2]!,y(s[1]!-s[3]!*a*a),z];
  },mat,part);
  for(const front of [true,false]) {
    const z=front?-2.4985:2.4985,s=sample(BODY,z);
    grid(front?'SU7 closed nose':'SU7 rear bumper',12,28,(u,v)=>{
      const h=T.MathUtils.lerp(.245,s[2]!,u),half=Math.abs(flank(1,z,h)[0]),x=(2*v-1)*half;
      return [x,y(h),corner(x,z)];
    },paint,'bumper');
  }
  const faceZ=(x:number,front:boolean)=>corner(x,front?-2.4985:2.4985)+(front?-.014:.014);
  const lampPoint=(sign:number,x:number,z:number):P=>{
    const s=sample(BODY,z);return [sign*x,y(s[2]!+.024+.018*(1-(x/s[3]!)**2)),z];
  };
  for(const sign of [-1,1]) {
    const label=sign<0?'Left':'Right';
    // Waterdrop lens travels back over the fender, rather than a flat rectangle.
    const outline:readonly (readonly [number,number])[]=[[.56,-2.395],[.66,-2.43],[.79,-2.32],[.825,-2.13],
      [.79,-1.99],[.72,-2.00],[.64,-2.14],[.56,-2.33]];
    const points:P[]=outline.map(([x,z])=>lampPoint(sign,x,z));points.push(points[0]!);
    const positions:number[]=[],indices:number[]=[],uv:number[]=[];
    for(const p of points.slice(0,-1)){positions.push(...p);uv.push(p[0],p[2]);}
    for(let i=1;i<outline.length-1;i++)indices.push(0,i,i+1);
    add(surfaceMesh(label+' SU7 waterdrop lamp',positions,indices,uv,lens),'headlamp');
    path(label+' SU7 waterdrop DRL',points,.008,white,'lamp-lens','position');
    path(label+' SU7 headlamp projector',[lampPoint(sign,.64,-2.285),lampPoint(sign,.77,-2.19)],.022,white,'lamp-lens','head');
    path(label+' SU7 front indicator',[lampPoint(sign,.59,-2.405),lampPoint(sign,.76,-2.32)],.006,white,'lamp-lens',sign<0?'left':'right');
    path(label+' SU7 rear indicator',[[sign*.58,y(.83),faceZ(sign*.58,false)],[sign*.79,y(.83),faceZ(sign*.79,false)]],.006,red,'lamp-lens',sign<0?'left':'right');
    path(label+' SU7 reverse optic',[[sign*.54,y(.81),faceZ(sign*.54,false)],[sign*.65,y(.81),faceZ(sign*.65,false)]],.005,white,'lamp-lens','reverse');
    path(label+' SU7 brake arc',[[sign*.50,y(.856),faceZ(sign*.50,false)],[sign*.78,y(.86),faceZ(sign*.78,false)]],.009,red,'lamp-lens','brake');
    path(label+' SU7 front air curtain',[[sign*.75,y(.34),faceZ(sign*.75,true)],[sign*.82,y(.45),faceZ(sign*.82,true)]],.023,trim,'intake');
    const mirror=sign<0?c.leftMirrorTransform:c.rightMirrorTransform;
    path(label+' SU7 mirror repeater',[[mirror.position[0]-.04,mirror.position[1]-.027,mirror.position[2]-.043],
      [mirror.position[0]+.04,mirror.position[1]-.027,mirror.position[2]-.043]],.004,white,'lamp-lens',sign<0?'left':'right');
  }
  const ring:P[]=[];
  for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,x=.82*Math.cos(a),h=.857+.028*Math.sin(a);ring.push([x,y(h),faceZ(x,false)]);}
  path('SU7 continuous halo tail lamp',ring,.0065,red,'lamp-lens','tail');
  path('SU7 high mounted stop',[[ -.14,y(1.296),1.02],[.14,y(1.296),1.02]],.006,red,'lamp-lens','brake');
  path('SU7 rear fog lamp',[[-.085,y(.30),2.51],[.085,y(.30),2.51]],.007,red,'lamp-lens','fogRear');
  add(roundedBox('SU7 lower cooling inlet',[1.20,.095,.025],[0,y(.355),-2.50],trim,.018),'intake');
  add(roundedBox('SU7 rear diffuser',[1.52,.13,.11],[0,y(.31),2.44],trim,.022),'diffuser');
  for(const x of [-.53,-.27,0,.27,.53]) add(roundedBox('SU7 diffuser fin',[.012,.09,.20],[x,y(.255),2.39],trim,.004),'diffuser');
  add(roundedBox('SU7 rear plate recess',[.46,.10,.018],[0,y(.61),2.508],trim,.007),'license-plate');
  add(roundedBox('SU7 lidar fairing',[.18,.045,.11],[0,y(1.423),-.22],trim,.02),'sensor-housing');
  add(roundedBox('SU7 nose badge',[.039,.025,.003],[0,y(.765),-2.502],alloy,.003),'badge');
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
