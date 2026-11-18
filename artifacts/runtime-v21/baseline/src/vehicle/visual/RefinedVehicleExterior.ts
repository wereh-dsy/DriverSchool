import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceGrid, surfaceQuad } from './SurfaceVehicleGeometry';
import { vehicleGlass, vehiclePaint } from './VehicleMaterials';
import { exteriorShapeProfile, type ExteriorShapeProfile } from './ExteriorShapeProfiles';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';
import { fitExteriorOverhangs } from './ExteriorEnvelope';
import { ExteriorDetailAtlas } from './ExteriorDetailAtlas';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

const mix = T.MathUtils.lerp;
type Station = readonly number[];
/** Linear station sampling deliberately cannot overshoot an authored envelope. */
function sample(stations: readonly Station[], z: number): number[] {
  let i = 0;
  while (i < stations.length - 2 && stations[i + 1]![0]! < z) i++;
  const a = stations[i]!, b = stations[i + 1]!;
  const t = T.MathUtils.clamp((z - a[0]!) / (b[0]! - a[0]!), 0, 1);
  return a.map((v, j) => j ? mix(v, b[j]!, t) : z);
}

/** Shared meshing only. All silhouette stations are independently authored per vehicle. */
export function buildRefinedVehicleExterior(root: T.Group, c: VehicleVisualConfig): boolean {
  const p = exteriorShapeProfile(c); if (!p) return false;
  const details=new ExteriorDetailAtlas();
  const offset = c.staticBodyOffsetY ?? 0;
  const groundY = (y: number) => y - offset;
  const paint = vehiclePaint(c.body.color, { side: T.DoubleSide });
  const trim = new T.MeshStandardMaterial({ color: c.body.trimColor, roughness: .65, side: T.DoubleSide });
  const chrome = new T.MeshStandardMaterial({ color: 0x9ca8b2, metalness: .86, roughness: .25, side: T.DoubleSide });
  const glass = vehicleGlass(c.windowGlass?.color ?? 0x526976, Math.max(.45,c.windowGlass?.windowOpacity ?? .38));
  const windshield = glass.clone(); windshield.opacity = c.windowGlass?.windshieldOpacity ?? .18;
  const lens = new T.MeshStandardMaterial({ color: 0x34414b, roughness: .18, metalness: .38, side: T.DoubleSide });
  const red = new T.MeshStandardMaterial({ color: 0x69121d, roughness: .22, metalness: .22, side: T.DoubleSide });
  const white = lens.clone(); white.color.set(0xd0ddea);
  const first = p.body[0]![0], last = p.body[p.body.length - 1]![0];
  const frontGlass = p.canopy[0]![0], rearGlass = p.canopy[p.canopy.length - 1]![0];
  const body = (z: number) => sample(p.body, z);
  const canopy = (z: number) => sample(p.canopy, z);
  const cornerZ = (x: number, z: number) => {
    const t = z < 0 ? T.MathUtils.clamp((first + .48 - z) / .48, 0, 1)
      : T.MathUtils.clamp((z - last + .48) / .48, 0, 1);
    return z + (z < 0 ? .15 : -.12) * (Math.abs(x) / (c.vehicleWidth / 2)) ** 3 * t;
  };
  const archR = c.wheelRadius + c.body.wheelArchClearance;
  const archBottom = (z: number) => {
    const d = Math.min(Math.abs(z + c.wheelBase / 2), Math.abs(z - c.wheelBase / 2));
    return d < archR ? Math.max(p.sill, c.wheelRadius + Math.sqrt(archR * archR - d * d)) : p.sill;
  };
  const sidePoint = (sign: number, z: number, y: number): P => {
    const s = body(z), top = Math.max(s[2]!, archBottom(z) + .018), shoulder = Math.min(top - .025, s[4]!);
    const f = T.MathUtils.clamp((y - p.sill) / (shoulder - p.sill), 0, 1);
    // A round shoulder rolls in towards the glass; the lower rocker tucks in.
    let half = y < shoulder ? s[1]! * (.935 + .065 * Math.sin(f * Math.PI / 2))
      : mix(s[1]!, s[3]!, ((y - shoulder) / (top - shoulder)) ** 1.65);
    half -= .013*Math.exp(-(((y-.53)/.13)**2))*Math.exp(-((z/1.1)**6));
    return [sign * half, groundY(y), cornerZ(half, z)];
  };
  // Lamps turn back over tapered shoulders instead of hanging above the low
  // end station. Locate the first supported section, keeping authored X/Y.
  const reverseBody=[...p.body].reverse();
  const supportZ = (x:number,y:number,front:boolean) => {
    const stations=front?p.body:reverseBody;
    const supported=(z:number)=>body(z)[2]!>=y+.004&&Math.abs(sidePoint(1,z,y)[0])>=Math.abs(x)+.001;
    let outside=front?first:last;
    if(supported(outside))return outside;
    for(const station of stations) {
      const inside=station[0];
      if(supported(inside)) {
        let a=outside,b=inside;
        for(let i=0;i<9;i++){const middle=(a+b)/2;if(supported(middle))b=middle;else a=middle;}
        return b;
      }
      outside=inside;
    }
    return front?first:last;
  };
  const faceZ=(x:number,y:number,front:boolean)=>cornerZ(x,supportZ(x,y,front));
  const add = (mesh: T.Mesh, part: string, key?: string) => {
    mesh.userData.vehicleBodyPart = part; mesh.userData.refinedOptics = true;
    if (key) {
      mesh.userData.lightingKey = key;
      mesh.geometry.computeBoundingBox();const center=mesh.geometry.boundingBox!.getCenter(new T.Vector3());
      mesh.geometry.translate(-center.x,-center.y,-center.z);mesh.position.add(center);
    }
    mesh.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR); root.add(mesh); return mesh;
  };
  const grid = (name: string, rows: number, columns: number, point: (u:number,v:number)=>P,
    material: T.Material, part: string, key?: string) => add(surfaceGrid(name, rows, columns, point, material), part, key);
  const line = (name: string, points: P[], radius: number, material: T.Material, part='panel-gap', key?: string) => {
    const curve = new T.CurvePath<T.Vector3>();
    for (let i=1;i<points.length;i++) curve.add(new T.LineCurve3(new T.Vector3(...points[i-1]!),new T.Vector3(...points[i]!)));
    return add(new T.Mesh(new T.TubeGeometry(curve, Math.max(4,points.length*3),radius,4,false),material),part,key).name=name;
  };
  for (const sign of [-1,1]) {
    const label = sign < 0 ? 'Left' : 'Right';
    const flank=grid(`${label} ${p.name} sectioned body shell`,180,12,(u,v)=>{
      const z=mix(first,last,u), s=body(z), low=archBottom(z), high=Math.max(s[2]!,low+.018);
      return sidePoint(sign,z,mix(low,high,v));
    },paint,'main-shell');
    details.side(flank.geometry,sign,p,offset,z=>body(z)[2]!);
    flank.material=details.material(paint,true);
    // Rolled, body-colour lip is a ribbon, not the former oversized tubular flare.
    for(const axle of [-c.wheelBase/2,c.wheelBase/2]) {
      grid(`${label} rolled wheel arch`,48,2,(u,v)=>{
        const angle=u*Math.PI, r=archR+v*.009, z=axle+Math.cos(angle)*r;
        const y=c.wheelRadius+Math.sin(angle)*r, point=sidePoint(sign,z,y);
        return [point[0]+sign*.001,groundY(y),point[2]];
      },paint,'wheel-arch');
      grid(`${label} dark wheelhouse`,48,3,(u,v)=>{
        const angle=u*Math.PI,z=axle+Math.cos(angle)*(archR+.012),y=c.wheelRadius+Math.sin(angle)*(archR+.012);
        const width=body(z)[1]!;
        return [sign*mix(width-.01,(axle<0?c.dimensions.frontTrackWidth:c.dimensions.rearTrackWidth)/2-c.dimensions.wheelWidth/2-.04,v),groundY(y),z];
      },trim,'wheelhouse');
    }
    const sideGlassPoint = (z:number, t:number):P => {
      const s=body(z), roof=canopy(z), low=s[2]!+.006, high=Math.max(low,roof[1]!-roof[3]!-.022);
      return [sign*mix(s[3]!-.006,roof[2]!+.006,t),groundY(mix(low,high,t)),z];
    };
    const frontWindowEdge=(v:number):P=>{
      const bottom=sideGlassPoint(frontGlass+.045,0), top=sideGlassPoint(p.roofStart+.04,1);
      return [mix(bottom[0],top[0],v),mix(bottom[1],top[1],v),mix(bottom[2],top[2],v)];
    };
    const pane=(name:string,from:number,to:number)=>grid(`${label} ${name}`,32,4,(u,v)=>sideGlassPoint(mix(from,to,u),v),glass,'glass');
    grid(`${label} front side window`,32,6,(u,v)=>{
      const leading=frontWindowEdge(v),trailing=sideGlassPoint(p.bPillar-.032,v);
      return [mix(leading[0],trailing[0],u),mix(leading[1],trailing[1],u),mix(leading[2],trailing[2],u)];
    },glass,'glass');
    pane('rear door side window',p.bPillar+.032,p.rearDivider-.018);
    const rearSail = p.grille==='touareg'?.19:p.grille==='ferrari'?.20:.29;
    if(p.rearDivider+.018<rearGlass-rearSail) pane('quarter window',p.rearDivider+.018,rearGlass-rearSail);
    for(const [name,z,width] of [['B',p.bPillar,.064],['rear divider',p.rearDivider,.035]] as const) {
      grid(`${label} ${name} pillar`,2,4,(u,v)=>sideGlassPoint(z+(u-.5)*width,v),trim,'pillar');
    }
    // Continuous roof rail and full A/C/D sails close the glasshouse to the shoulder.
    grid(`${label} raked A pillar sail`,20,3,(u,v)=>{
      const z=mix(frontGlass,p.roofStart+.04,u),s=canopy(z),inner:P=[sign*s[2]!,groundY(s[1]!-s[3]!),z];
      const outer=frontWindowEdge(u);
      return [mix(inner[0],outer[0],v),mix(inner[1],outer[1],v),mix(inner[2],outer[2],v)];
    },paint,'pillar');
    for(const [name,from,to] of [['C/D',rearGlass-rearSail,rearGlass]] as const) {
      grid(`${label} ${name} pillar sail`,16,6,(u,v)=>sideGlassPoint(mix(from,to,u),v),paint,'pillar');
    }
    grid(`${label} curved roof rail`,64,2,(u,v)=>{
      const z=mix(frontGlass,rearGlass,u), point=sideGlassPoint(z,1), roof=canopy(z);
      return [mix(point[0],sign*roof[2]!,v),mix(point[1],groundY(roof[1]!-roof[3]!),v),z];
    },paint,'pillar');
    const beltPoints:P[]=[],upperPoints:P[]=[];
    for(let i=0;i<=40;i++) {
      const z=mix(frontGlass+.025,rearGlass-.025,i/40), bottom=sideGlassPoint(z,0), top=sideGlassPoint(z,1);
      beltPoints.push([bottom[0]+sign*.003,bottom[1],z]); upperPoints.push([top[0]+sign*.002,top[1],z]);
    }
    line(`${label} window lower seal`,beltPoints,.0035,trim,'window-trim');
    line(`${label} curved window upper trim`,upperPoints,.0035,p.grille==='touareg'||p.grille==='vw'?chrome:trim,'window-trim');
    for(const doorZ of p.grille==='ferrari'||p.grille==='gt'?[.47]:[p.bPillar,p.rearDivider+.08]) {
      const z=doorZ-.16,y=body(z)[2]!-.065,pt=sidePoint(sign,z,y);
      line(`${label} door handle`,[[pt[0]+sign*.004,pt[1],z-.06],[pt[0]+sign*.004,pt[1],z+.055]],.008,p.grille==='taycan'?paint:chrome,'door-handle');
    }
    grid(`${label} recessed rocker sill`,28,2,(u,v)=>{
      const z=mix(-c.wheelBase/2+archR+.02,c.wheelBase/2-archR-.02,u),point=sidePoint(sign,z,p.sill+.012+v*.035);
      return [point[0]+sign*.002,point[1],point[2]];
    },trim,'sill');
  }
  const deck = (name:string,from:number,to:number,part:string) => grid(name,40,28,(u,v)=>{
    const z=mix(from,to,u),s=body(z),a=v*2-1,x=a*s[3]!;
    // Bring the peak back to the side-shell boundary so it cannot leave a slit.
    const edgeBlend=Math.min(1,(1-a*a)/.2256);
    const fender= p.grille==='taycan' ? .085*edgeBlend*Math.exp(-(((Math.abs(a)-.88)/.17)**2))*Math.exp(-(((z+1.5)/.55)**2)) : 0;
    const y=s[2]!+.018*(1-a*a)+fender;
    return [x,groundY(y),cornerZ(x,z)];
  },paint,part);
  deck(p.grille==='gt'?'Sports power-dome bonnet':'Sculpted multi-station bonnet',first,frontGlass,'hood');
  deck(p.grille==='touareg'?'Short hatch shoulder':'Sedan boot lid',rearGlass,last,'trunk');
  const canopyPoint=(z:number,a:number):P=>{const s=canopy(z);return [a*s[2]!,groundY(s[1]!-s[3]!*a*a),z];};
  for(const [name,from,to,material,part] of [
    ['Curved exterior windshield',frontGlass,p.roofStart,windshield,'glass'],
    [p.grille==='gt'?'Fastback roof outer shell':'Crowned roof outer shell',p.roofStart,p.roofEnd,paint,'roof'],
    [p.grille==='ferrari'?'Glazed rear engine cover':'Curved exterior rear windshield',p.roofEnd,rearGlass,glass,'glass'],
  ] as const) grid(name,40,24,(u,v)=>canopyPoint(mix(from,to,u),v*2-1),material,part);
  for(const z of [frontGlass,p.roofStart,p.roofEnd,rearGlass]) {
    const pts:P[]=[];for(let i=0;i<=20;i++)pts.push(canopyPoint(z,i/10-1));
    line('Bonded glass edge seal',pts,.003,trim,'window-trim');
  }
  if(p.grille==='ferrari') {
    grid('Mid-engine glazed engine cover',24,16,(u,v)=>{
      const z=mix(1.18,1.84,u),a=v*2-1;
      return [a*.50,groundY(body(z)[2]!+.021*(1-a*a)+.003),z];
    },glass,'engine-cover');
    for(const sign of [-1,1]) grid('Mid-engine side intake',20,3,(u,v)=>{
      const z=mix(1.18,1.76,u),a=mix(.54,.64,v);
      return [sign*a,groundY(body(z)[2]!+.014),z];
    },trim,'intake');
  }
  // Fascias turn into the same corner map as the flanks and decks.
  for(const front of [true,false]) {
    const z=front?first:last,s=body(z);
    grid(front?'Front bumper fascia':'Rear bumper fascia',18,36,(u,v)=>{
      const y=mix(p.sill,s[2]!,u),half=sidePoint(1,z,y)[0],a=v*2-1,x=a*half;
      return [x,groundY(y),cornerZ(x,z)+(front?-.014:.012)*Math.sin(u*Math.PI)*(1-a*a)];
    },paint,'bumper');
    grid(front?'Lower front lip':'Rear diffuser',3,28,(u,v)=>{
      const x=(v*2-1)*s[1]!*.9,y=p.sill+.04+u*.07;
      return [x,groundY(y),cornerZ(x,z)+(front?-.018:.018)];
    },trim,front?'aero':'diffuser');
  }
  const facePolygon=(name:string,points:readonly (readonly [number,number])[],front:boolean,mat:T.Material,part:string,sign=1,key?:string)=>{
    const positions:number[]=[],uv:number[]=[],indices:number[]=[];
    const standOff=part==='lamp-lens'?.023:.020;
    const outline=points.map(([x,y])=>new T.Vector2(x*sign,y));
    const extent=Math.max(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),
      Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])));
    const subdivisions=T.MathUtils.clamp(Math.ceil(extent/.12),2,6);
    // Project small triangles onto the curved fascia. A single flat triangle
    // chords through its convex surface and makes the grille/lens disappear.
    for(const triangle of T.ShapeUtils.triangulateShape(outline,[])) {
      const a=outline[triangle[0]!]!,b=outline[triangle[1]!]!,d=outline[triangle[2]!]!,n=subdivisions;
      const rows:number[][]=[];
      for(let i=0;i<=n;i++) {const row:number[]=[];for(let j=0;j<=n-i;j++) {
        const x=a.x+(b.x-a.x)*i/n+(d.x-a.x)*j/n,y=a.y+(b.y-a.y)*i/n+(d.y-a.y)*j/n;
        row.push(positions.length/3);positions.push(x,groundY(y),faceZ(x,y,front)+(front?-standOff:standOff));uv.push(x,y);
      }rows.push(row);}
      for(let i=0;i<n;i++)for(let j=0;j<n-i;j++) {
        indices.push(rows[i]![j]!,rows[i+1]![j]!,rows[i]![j+1]!);
        if(j<n-i-1)indices.push(rows[i+1]![j]!,rows[i+1]![j+1]!,rows[i]![j+1]!);
      }
    }
    if(front)for(let i=0;i<indices.length;i+=3){const b=indices[i+1]!;indices[i+1]=indices[i+2]!;indices[i+2]=b;}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    if(!key&&mat instanceof T.MeshStandardMaterial){
      const region=details.polygon(name,points.map(([x,y])=>[x*sign,y]),mat.color,part==='grille'?p.grille:undefined);
      details.uv(geometry,region);mat=details.material(mat);
    }
    const mesh=add(new T.Mesh(geometry,mat),part,key);mesh.name=name;return mesh;
  };
  for(const sign of [-1,1]) {
    const side=sign<0?'Left':'Right';
    if(p.grille==='ferrari') {
      grid(`${side} swept vertical 458 lamp`,18,4,(u,v)=>{
        const y=mix(.55,.87,u),x=sign*mix(.66+u*.04,.78+u*.02,v),z=mix(first+.10,-1.48,u);
        return [x,groundY(y),z];
      },lens,'headlamp');
      const lamp=new T.Mesh(new T.CylinderGeometry(.058,.058,.014,24),red);lamp.rotation.x=Math.PI/2;lamp.position.set(sign*.72,groundY(.72),cornerZ(sign*.72,last)+.021);lamp.name=side+' circular 458 tail lamp';add(lamp,'tail-lamp');
    } else {
      facePolygon(`${side} shaped headlamp housing`,p.head,true,lens,'headlamp',sign);
      facePolygon(`${side} shaped tail lamp housing`,p.tail,false,red,'tail-lamp',sign);
    }
    const frontSignature:P[]=p.head.slice(0,3).map(([x,y])=>[sign*x,groundY(y+.008),faceZ(sign*x,y+.008,true)-.026]);
    if(p.grille!=='ferrari') line(`${side} headlamp DRL contour`,frontSignature,.005,white,'lamp-lens','position');
    if(p.grille==='taycan') {
      for(const x of [.61,.75]) for(const y of [.78,.815]) facePolygon(`${side} four-point LED`,[[x-.014,y-.007],[x+.014,y-.007],[x+.014,y+.007],[x-.014,y+.007]],true,white,'lamp-lens',sign,'head');
      facePolygon(`${side} facelift lower air curtain`,[[.57,.33],[.83,.38],[.88,.63],[.81,.60],[.73,.41],[.56,.39]],true,trim,'intake',sign);
    }
    const center=(points:readonly (readonly [number,number])[])=>points.reduce((a,b)=>[a[0]!+b[0]/points.length,a[1]!+b[1]/points.length],[0,0]);
    const inset=(points:readonly (readonly [number,number])[],sx:number,sy:number,dy=0):[number,number][]=>{
      const mid=center(points);return points.map(([x,y])=>[mix(mid[0]!,x,sx),mix(mid[1]!,y,sy)+dy]);
    };
    if(p.grille!=='ferrari') {
      facePolygon(`${side} low high optical module`,inset(p.head,.75,.30),true,white,'lamp-lens',sign,'head');
      facePolygon(`${side} tail optical contour`,inset(p.tail,.92,.28,.022),false,red,'lamp-lens',sign,'tail');
      facePolygon(`${side} brake optical contour`,inset(p.tail,.86,.24,-.005),false,red,'lamp-lens',sign,'brake');
      facePolygon(`${side} reverse optical module`,inset(p.tail,.26,.15,-.030),false,white,'lamp-lens',sign,'reverse');
      facePolygon(`${side} front indicator`,inset(p.head,.72,.12,-.022),true,white,'lamp-lens',sign,sign<0?'left':'right');
      facePolygon(`${side} rear indicator`,inset(p.tail,.72,.12,-.017),false,red,'lamp-lens',sign,sign<0?'left':'right');
      // Short, genuinely wrapped surfaces keep rear outputs visible obliquely
      // and to the real planar mirrors without floating rectangular lenses.
      const tailY=center(p.tail)[1]!;
      for(const [key,yy] of [['tail',tailY+.022],['brake',tailY],['reverse',tailY-.027],
        [sign<0?'left':'right',tailY-.046],['fogRear',.32]] as const) {
        const end=Math.min(last-.025,supportZ(0,yy+.012,false)-.035);
        const wrap=grid(`${side} ${key} corner lens`,6,1,(u,v)=>{
          const z=mix(end-.135,end,u),pt=sidePoint(sign,z,yy+(v-.5)*.010);
          return [pt[0]+sign*.003,pt[1],pt[2]];
        },key==='reverse'?white:red,'lamp-lens',key);
        if(sign>0){const index=wrap.geometry.index!;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}wrap.geometry.computeVertexNormals();}
      }
    } else {
      const light=new T.Mesh(new T.CircleGeometry(.041,20),red);light.position.set(sign*.72,groundY(.72),cornerZ(sign*.72,last)+.030);light.name=side+' 458 brake optic';add(light,'lamp-lens','brake');
      const tail=new T.Mesh(new T.RingGeometry(.045,.053,24),red);tail.position.set(sign*.72,groundY(.72),cornerZ(sign*.72,last)+.031);tail.name=side+' 458 tail ring';add(tail,'lamp-lens','tail');
      const pts:P[]=[];for(let i=0;i<=6;i++)pts.push([sign*(.735+i*.005),groundY(.63+i*.033),mix(first+.35,-1.49,i/6)]);
      line(side+' 458 vertical LED row',pts,.005,white,'lamp-lens','position');
      const module=surfaceQuad(side+' 458 head projector',[[sign*.65,groundY(.59),first+.14],[sign*.75,groundY(.59),first+.14],[sign*.76,groundY(.65),first+.35],[sign*.67,groundY(.65),first+.35]],white);add(module,'lamp-lens','head');
      facePolygon(side+' 458 rear indicator',[[.66,.70],[.70,.70],[.70,.715],[.66,.715]],false,white,'lamp-lens',sign,sign<0?'left':'right');
      facePolygon(side+' 458 reverse lamp',[[.46,.40],[.52,.40],[.52,.42],[.46,.42]],false,white,'lamp-lens',sign,'reverse');
      facePolygon(side+' 458 front indicator',[[.66,.52],[.76,.52],[.76,.535],[.66,.535]],true,white,'lamp-lens',sign,sign<0?'left':'right');
    }
    if(p.grille!=='ferrari'&&p.grille!=='taycan') facePolygon(side+' front fog optic',[[.60,.34],[.69,.34],[.69,.38],[.60,.38]],true,white,'lamp-lens',sign,'fogFront');
  }
  const high=canopyPoint(p.roofEnd+.06,0);
  line('High mounted stop lamp',[[ -.105,high[1]-.018,high[2]+.005],[.105,high[1]-.018,high[2]+.005]],.006,red,'lamp-lens','brake');
  if(p.grille==='taycan') {
    const points:P[]=[];for(let i=0;i<=40;i++){const x=mix(-.81,.81,i/40),y=.813+.02*(Math.abs(x)/.81)**2;points.push([x,groundY(y),faceZ(x,y,false)+.026]);}
    line('Taycan continuous rear light bridge',points,.007,red,'lamp-lens','tail');
  } else addGrille(p,facePolygon,trim);
  if(p.grille!=='ferrari') {
    const low=p.grille==='touareg'?.39:.27,high=p.grille==='touareg'?.56:.39;
    facePolygon('Wide lower cooling aperture',[[-.60,low],[.60,low],[.65,high],[-.65,high]],true,trim,'intake');
  }
  if(p.grille==='gt')for(const sign of [-1,1])facePolygon(`${sign<0?'Left':'Right'} brake intake`,[[.65,.42],[.79,.45],[.78,.60],[.67,.56]],true,trim,'intake',sign);
  const plateY=p.grille==='touareg'?.66:p.grille==='ferrari'?.49:.53;
  facePolygon('Recessed rear licence plate',[[ -.25,plateY-.055],[.25,plateY-.055],[.25,plateY+.055],[-.25,plateY+.055]],false,trim,'license-plate');
  facePolygon('Rear fog optic',[[-.38,.28],[-.29,.28],[-.29,.30],[-.38,.30]],false,red,'lamp-lens',1,'fogRear');
  if(p.grille==='ferrari'||p.grille==='gt') for(const x of p.grille==='ferrari'?[-.09,0,.09]:[-.63,.63]) {
    const pipe=new T.Mesh(new T.CylinderGeometry(.032,.032,.065,16,1,true),chrome);
    pipe.rotation.x=Math.PI/2;pipe.position.set(x,groundY(.31),last-.015);pipe.name='Hollow exhaust outlet';add(pipe,'exhaust');
  }
  const floorY=c.body.groundClearance;
  const floor=surfaceQuad('Sealed underfloor',[[ -.61,floorY,first],[.61,floorY,first],[.61,floorY,last],[-.61,floorY,last]],trim);
  add(floor,'main-shell');
  root.userData.exteriorShape=p.name;
  root.userData.exteriorDetailRegions=details.regions;
  const shift=(first+last)/2,halfOverhang=(c.dimensions.length-c.wheelBase)/2;
  if(p.grille==='ferrari')fitExteriorOverhangs(root,c,1.107,.770);
  else fitExteriorOverhangs(root,c,halfOverhang-shift,halfOverhang+shift);
  return true;
}

function addGrille(p:ExteriorShapeProfile,
  polygon:(name:string,points:readonly (readonly [number,number])[],front:boolean,mat:T.Material,part:string,sign?:number,key?:string)=>T.Mesh,
  trim:T.Material) {
  const suv=p.grille==='touareg',high=suv?1.04:p.grille==='ferrari'?.44:.79,low=suv?.67:p.grille==='ferrari'?.29:.45;
  const half=suv?.76:p.grille==='mazda'?.51:p.grille==='nissan'?.44:.48;
  const outline:readonly (readonly [number,number])[]=[[-half*.80,low],[half*.80,low],[half,high-.025],[half*.9,high],[-half*.9,high],[-half,high-.025]];
  polygon(p.grille==='school'?'Sedan chrome framed grille':'Inset model-specific grille',outline,true,trim,'grille');
}

/** Rounded rubber, calibrated rim diameter, and batched spokes; physical tyre datum unchanged. */
export function buildRefinedWheels(root:T.Group,c:VehicleVisualConfig,
  p:Pick<ExteriorShapeProfile,'wheelInches'|'spokes'>=exteriorShapeProfile(c)!) {
  const rubber=new T.MeshStandardMaterial({color:0x191b1d,roughness:.88,side:T.DoubleSide});
  const alloy=new T.MeshStandardMaterial({color:0xa3aab0,metalness:.82,roughness:.27,side:T.DoubleSide});
  const steel=new T.MeshStandardMaterial({color:0x555d64,metalness:.65,roughness:.45});
  const r=c.wheelRadius,rim=p.wheelInches*.0254/2;
  const sections=new Map<number,{tyre:T.BufferGeometry;barrel:T.BufferGeometry}>();
  const spokeFaces=new Map<number,T.BufferGeometry>();
  const discGeometry=new T.CylinderGeometry(rim*.72,rim*.72,.016,24);discGeometry.rotateZ(Math.PI/2);
  const lipGeometry=new T.TorusGeometry(rim-.006,.006,6,40);lipGeometry.rotateY(Math.PI/2);
  const hubGeometry=new T.CylinderGeometry(.035,.035,.025,16);hubGeometry.rotateZ(Math.PI/2);
  const pivots={} as Record<import('../VehicleDimensions').VehicleWheelId,T.Group>,wheels:T.Mesh[]=[];
  for(const id of ['frontLeft','frontRight','rearLeft','rearRight'] as const) {
    const front=id.startsWith('front'),sign=id.endsWith('Left')?-1:1;
    const width=(front?c.dimensions.frontWheelWidth:c.dimensions.rearWheelWidth)??c.dimensions.wheelWidth;
    let section=sections.get(width);
    if(!section){
      const profile=[[rim*.97,-width/2],[r*.90,-width/2],[r*.98,-width*.42],[r,-width*.27],[r,width*.27],[r*.98,width*.42],[r*.9,width/2],[rim*.97,width/2]];
      const tyre=new T.LatheGeometry(profile.map(([rr,x])=>new T.Vector2(rr!,x!)),40);tyre.rotateZ(Math.PI/2);
      const barrel=new T.CylinderGeometry(rim,rim,width*.86,32,1,true);barrel.rotateZ(Math.PI/2);
      section={tyre,barrel};sections.set(width,section);
    }
    const wheel=new T.Mesh(section.tyre,rubber);wheel.name='Tyre';wheel.castShadow=wheel.receiveShadow=true;
    wheel.add(new T.Mesh(section.barrel,steel),new T.Mesh(discGeometry,steel));
    const lip=new T.Mesh(lipGeometry,alloy);lip.position.x=sign*(width/2-.006);wheel.add(lip);
    let merged=spokeFaces.get(sign*width);
    if(!merged){
      const spokes:T.BufferGeometry[]=[];
      for(let i=0;i<p.spokes;i++) {
        const angle=p.spokes===10?Math.floor(i/2)*Math.PI*2/5+(i%2?-.065:.065):i*Math.PI*2/p.spokes;
        const g=new T.BoxGeometry(.018,.020,rim*.82);g.translate(sign*(width/2-.012),0,rim*.49);g.rotateX(angle);spokes.push(g);
      }
      merged=mergeGeometries(spokes);for(const g of spokes)g.dispose();spokeFaces.set(sign*width,merged);
    }
    const face=new T.Mesh(merged,alloy);face.name=`${p.wheelInches} inch ${p.spokes} spoke alloy face`;wheel.add(face);
    const hub=new T.Mesh(hubGeometry,alloy);hub.position.x=sign*(width/2-.012);wheel.add(hub);
    const pivot=new T.Group();pivot.name=id+' wheel pivot';pivot.userData.wheelId=id;
    pivot.position.set(sign*(front?c.dimensions.frontTrackWidth:c.dimensions.rearTrackWidth)/2,r-(c.staticBodyOffsetY??0),(front?-1:1)*c.wheelBase/2);
    pivot.add(wheel);root.add(pivot);pivots[id]=pivot;wheels.push(wheel);
  }
  return {pivots,wheels};
}
