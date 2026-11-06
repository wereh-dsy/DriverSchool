import * as T from 'three';
import type {VehicleVisualConfig,Vector3Tuple as P} from './VehicleVisualConfig';

type Knot=readonly [number,number];
function profile(knots:readonly Knot[],z:number):number {
  let i=0;while(i<knots.length-2&&z>knots[i+1]![0])i++;
  const a=knots[i]!,b=knots[i+1]!,p=knots[Math.max(0,i-1)]!,q=knots[Math.min(knots.length-1,i+2)]!;
  const span=b[0]-a[0],t=T.MathUtils.clamp((z-a[0])/span,0,1),t2=t*t,t3=t2*t;
  const m0=(b[1]-p[1])/(b[0]-p[0]),m1=(q[1]-a[1])/(q[0]-a[0]);
  return (2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*span*m0+(-2*t3+3*t2)*b[1]+(t3-t2)*span*m1;
}
const WIDTH:readonly Knot[]=[[-2.134,.928],[-1.83,.976],[-1.3155,1],[-.78,.992],[0,.985],[.80,.993],[1.3155,1],[1.80,.976],[2.134,.928]];
const BELT:readonly Knot[]=[[-2.134,.804],[-1.55,.844],[-.89,.915],[-.70,.935],[.3,.945],[1.28,.966],[1.65,.985],[1.92,.990],[2.134,.970]];
const CANOPY_BOW:readonly Knot[]=[[-.95,-.008],[-.46,-.010],[.26,0],[.85,-.006],[1.30,-.021],[1.55,-.045],[1.92,-.008]];
export const gtiBeltY=(z:number)=>profile(BELT,z);
export const gtiBodyHalfWidth=(c:VehicleVisualConfig,z:number)=>c.vehicleWidth*.5*Math.min(1,profile(WIDTH,z));

/** Cylindrical side glazing: constant vertical rake keeps the sliding glass on its own surface. */
export function gtiSidePoint(c:VehicleVisualConfig,sign:number,z:number,y:number):P {
  const roofBow=.008*Math.sin(Math.PI*T.MathUtils.clamp((z+.5)/2.05,0,1))*T.MathUtils.smoothstep(y,1.27,1.34);
  // Side-glass rake also defines the existing power-window travel, independent of cowl height.
  const actualY=y+roofBow,t=T.MathUtils.clamp((actualY-.86)/(c.cabin.roofY-.86),0,1);
  return [sign*(T.MathUtils.lerp(c.cabin.width/2+.033,c.body.roofWidth/2,t)+profile(CANOPY_BOW,z)),actualY,z];
}
export function gtiBodySideWidth(c:VehicleVisualConfig,z:number,y:number):number {
  const width=gtiBodyHalfWidth(c,z),top=gtiBeltY(z);
  const glazing=T.MathUtils.smoothstep(z,-1.05,-.89)*(1-T.MathUtils.smoothstep(z,1.72,1.98));
  const edge=T.MathUtils.lerp(width-.035,Math.abs(gtiSidePoint(c,1,z,top)[0]),glazing);
  const shoulder=T.MathUtils.smoothstep(y,top-.125,top);
  const tuck=.042*Math.exp(-(((y-.23)/.14)**2))+.018*(1-T.MathUtils.smoothstep(y,.22,.48));
  return width-(width-edge)*shoulder-tuck;
}
export function gtiFrontPoint(c:VehicleVisualConfig,x:number,y:number):P {
  // A rounded bumper section: splitter and bonnet lip recede from the impact rail.
  const setback=profile([[.135,.190],[.24,.115],[.40,.028],[.56,.035],[.70,.060],[.84,.105],[1,.170]],y);
  return [x,y,-c.vehicleLength/2+setback+.22*Math.abs(x/(c.vehicleWidth/2))**3];
}
export function gtiRearPoint(c:VehicleVisualConfig,x:number,y:number,offset=0):P {
  // The lower valance tucks underneath; the hatch rolls forward above the bumper shoulder.
  const setback=profile([[.135,.185],[.24,.125],[.40,.040],[.58,.026],[.74,.044],[.86,.078],[.99,.155]],y);
  return [x,y,c.vehicleLength/2-setback-.19*Math.abs(x/(c.vehicleWidth/2))**3+offset];
}
export function gtiWindshieldPoint(c:VehicleVisualConfig,u:number,v:number):P {
  const nx=v*2-1,half=T.MathUtils.lerp(c.cabin.width/2+.025,c.body.roofWidth/2-.035,u),bow=1-nx*nx;
  return [nx*half,T.MathUtils.lerp(c.cabin.windshieldBottomY,c.cabin.windshieldTopY,u)+.020*bow*u*u,
    T.MathUtils.lerp(c.cabin.windshieldBottomZ,c.cabin.windshieldTopZ,u)-.027*bow-.025*bow*Math.sin(Math.PI*u)];
}
/** Roof planform, crown and canopy rail use one surface on the exterior and inner headliner. */
export function gtiRoofPoint(c:VehicleVisualConfig,u:number,v:number,inset=0):P {
  const nx=v*2-1,bow=1-nx*nx,z=T.MathUtils.lerp(-.20-.025*bow,1.45+.015*bow,u);
  const rail=profile([[-.23,1.350],[.32,1.374],[.80,1.357],[1.18,1.327],[1.48,1.300]],z);
  const edge=gtiSidePoint(c,1,z,rail);
  return [nx*(edge[0]-inset),rail+.043*Math.pow(Math.max(0,bow),.8)-inset,z];
}
export function gtiRearGlassPoint(c:VehicleVisualConfig,u:number,v:number):P {
  const nx=v*2-1,bow=1-nx*nx,roof=gtiRoofPoint(c,1,v);
  return [nx*T.MathUtils.lerp(Math.abs(gtiRoofPoint(c,1,1)[0]),.758,u),
    T.MathUtils.lerp(roof[1]-.012,.995+.012*bow,u),T.MathUtils.lerp(roof[2]+.005,gtiRearPoint(c,nx*.758,.995)[2]-.012,u)];
}

/** Rounded corners plus subdivided straight runs follow the canopy bow instead of four flat trapezoids. */
function roundedOutline(corners:readonly Knot[],radius:number):Knot[] {
  const result:Knot[]=[];
  const ends=corners.map((p,i)=>{
    const prev=corners[(i+corners.length-1)%corners.length]!,next=corners[(i+1)%corners.length]!;
    const along=(q:Knot):Knot=>{const t=Math.min(.2,radius/Math.hypot(q[0]-p[0],q[1]-p[1]));return [T.MathUtils.lerp(p[0],q[0],t),T.MathUtils.lerp(p[1],q[1],t)];};
    return {p,a:along(prev),b:along(next)};
  });
  ends.forEach(({p,a,b},i)=>{
    for(let j=0;j<=3;j++){const t=j/3,s=1-t;result.push([s*s*a[0]+2*s*t*p[0]+t*t*b[0],s*s*a[1]+2*s*t*p[1]+t*t*b[1]]);}
    const next=ends[(i+1)%ends.length]!.a;for(let j=1;j<=5;j++){const t=j/6;result.push([T.MathUtils.lerp(b[0],next[0],t),T.MathUtils.lerp(b[1],next[1],t)]);}
  });return result;
}
export function gtiWindowRing(c:VehicleVisualConfig,sign:number,outer:readonly Knot[],inner:readonly Knot[],material:T.Material,name:string,inward=0):T.Mesh {
  const outside=roundedOutline(outer,.035),inside=roundedOutline(inner,.025),positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<outside.length;i++)for(const [ring,edge] of [[outside,true],[inside,false]] as const) {
    const [z,y]=ring[i]!,p=gtiSidePoint(c,sign,z,y);
    const x=edge&&y<1.02?sign*T.MathUtils.lerp(Math.abs(p[0]),gtiBodySideWidth(c,z,y),T.MathUtils.clamp((1.02-y)/.12,0,1)):p[0];
    positions.push(x-sign*inward,p[1],p[2]);uv.push(i/outside.length,edge?0:1);
  }
  for(let i=0;i<outside.length;i++){const a=i*2,b=((i+1)%outside.length)*2;indices.push(a,a+1,b,a+1,b+1,b);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new T.Mesh(g,material);mesh.name=name;return mesh;
}
export function gtiWindowFrame(c:VehicleVisualConfig,sign:number,material:T.Material,inward=0):T.Mesh {
  return gtiWindowRing(c,sign,[[-.90,.900],[-.20,1.350],[.90,1.350],[1.45,1.300],[1.84,.985]],
    [[-.79,.950],[-.13,1.323],[.90,1.322],[1.25,1.280],[1.69,.986]],material,`${sign<0?'Left':'Right'} GTI continuous A/C window frame`,inward);
}
