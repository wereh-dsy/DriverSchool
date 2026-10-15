import * as T from 'three';
import { surfaceMesh, surfaceLoft } from './SurfaceVehicleGeometry';

type Point = [number, number, number];
export const GTI_CENTER_SCREEN = { position: [.17,.909,-.575], rotation: [-.10,-.055,0] } as const;

function roundedRing(width:number,height:number,radius:number,z:number):Point[] {
  const result:Point[]=[];
  for(let corner=0;corner<4;corner++) {
    const angle=corner*Math.PI/2,x=Math.cos(angle+Math.PI/4)>0?width/2-radius:-width/2+radius;
    const y=Math.sin(angle+Math.PI/4)>0?height/2-radius:-height/2+radius;
    for(let step=0;step<=8;step++) {const a=angle+step/8*Math.PI/2;result.push([x+radius*Math.cos(a),y+radius*Math.sin(a),z]);}
  }
  return result;
}

/** Compact black visor: glass is about 55 mm behind the lip, inside the raised driver area. */
export function gtiInstrumentRecess(material:T.Material):T.Mesh {
  const rings=[roundedRing(.525,.207,.029,-.045),roundedRing(.538,.214,.031,.049),
    roundedRing(.535,.211,.029,.056),roundedRing(.522,.202,.025,.057),roundedRing(.491,.185,.013,.001)];
  const p:number[]=[],uv:number[]=[],idx:number[]=[],n=rings[0]!.length,colors:number[]=[];
  rings.forEach((ring,r)=>ring.forEach(([x,y,z],i)=>{p.push(x,y,z);uv.push(i/(n-1),r/(rings.length-1));const c=r===4?.42:r===3?.70:1;colors.push(c,c,c);}));
  for(let r=0;r<rings.length-1;r++) for(let i=0;i<n;i++) {const j=(i+1)%n,a=r*n+i,b=r*n+j;idx.push(a,b,a+n,b,b+n,a+n);}
  const mesh=surfaceMesh('GTI instrument recessed binnacle',p,idx,uv,material);
  mesh.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));return mesh;
}

/** The floating display has a short, wide foot, independent of the lower console. */
export function gtiCenterDisplayMount(material:T.Material):T.Mesh {
  return surfaceLoft('GTI center display pedestal',[
    {at:-.611,ring:[[.112,.796],[.112,.815],[.228,.815],[.228,.796]]},
    {at:-.563,ring:[[.119,.791],[.119,.821],[.221,.821],[.221,.791]]},
    {at:-.535,ring:[[.094,.787],[.094,.799],[.246,.799],[.246,.787]]},
  ],material);
}