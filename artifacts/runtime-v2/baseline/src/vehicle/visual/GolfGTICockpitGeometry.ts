import * as T from 'three';
import { surfaceMesh, surfaceLoft } from './SurfaceVehicleGeometry';
import type { Vector3Tuple as P } from './VehicleVisualConfig';

/** Golf-only surface batch. UVs for trim/controls are atlases; padding uses continuous metric UVs. */
class Skin {
  private readonly positions:number[]=[];
  private readonly uv:number[]=[];
  private readonly colors:number[]=[];
  private readonly indices:number[]=[];
  patch(rows:number,columns:number,point:(u:number,v:number)=>P,
    tex:(u:number,v:number,p:P)=>[number,number]=(u,v)=>[v,1-u],shade:(u:number,v:number)=>number=()=>1):void {
    const start=this.positions.length/3;
    for(let r=0;r<=rows;r++) for(let c=0;c<=columns;c++) {
      const u=r/rows,v=c/columns,p=point(u,v),s=shade(u,v);
      this.positions.push(...p);this.uv.push(...tex(u,v,p));this.colors.push(s,s,s);
    }
    for(let r=0;r<rows;r++) for(let c=0;c<columns;c++) {
      const a=start+r*(columns+1)+c,b=a+columns+1;this.indices.push(a,b,a+1,b,b+1,a+1);
    }
  }
  mesh(name:string,material:T.Material):T.Mesh {
    const mesh=surfaceMesh(name,this.positions,this.indices,this.uv,material);
    mesh.geometry.setAttribute('color',new T.Float32BufferAttribute(this.colors,3));return mesh;
  }
}
const smooth=(u:number)=>u*u*(3-2*u);
const grainUV=(_u:number,_v:number,p:P):[number,number]=>[p[0]*2,(p[1]+p[2])*2];

export function gtiUpperDashboard(width:number,material:T.Material):T.Mesh {
  const b=new Skin(),hood=(x:number)=>Math.exp(-(((x+.37)/.315)**10));
  const front=(x:number):P=>[x,.815+.180*hood(x),-.535-.025*hood(x)];
  b.patch(20,64,(u,v)=>{
    const x=T.MathUtils.lerp(-width,width,v),h=hood(x),f=front(x);
    return [x,T.MathUtils.lerp(.855,.815,smooth(u))+.180*h*Math.sin(u*Math.PI/2)**2,T.MathUtils.lerp(-.91,f[2],u)];
  },grainUV);
  // Soft rolled nose on the passenger side; leave the compact cluster aperture open.
  for(const [left,right] of [[-width,-.644],[-.096,width]]) b.patch(5,28,(u,v)=>{
    const x=T.MathUtils.lerp(left!,right!,v),f=front(x);
    return [x,T.MathUtils.lerp(f[1],.781,u),f[2]+.022*Math.sin(u*Math.PI/2)];
  },grainUV,u=>1-.12*u);
  b.patch(2,32,(u,v)=>{
    const x=T.MathUtils.lerp(-.644,-.096,v);return [x,.780-.010*u,-.546+.008*u];
  },grainUV,u=>.80-.10*u);
  return b.mesh('GTI continuous sculpted upper dashboard',material);
}

/** A shallow, proud carbon shelf. Its front is 45–60 mm ahead of the vent face. */
export function gtiTrimShelf(width:number,material:T.Material):T.Mesh {
  const b=new Skin(),profile=[[.795,-.544],[.788,-.505],[.762,-.440],[.753,-.434],[.748,-.445]] as const;
  b.patch(profile.length-1,48,(u,v)=>{
    const x=T.MathUtils.lerp(-width,width,v),n=Math.round(u*(profile.length-1)),p=profile[n]!;
    return [x,p[0]-.006*(x/width)**4,p[1]-.012*(x/width)**4];
  },(_u,_v,p)=>[p[0]*3,(p[1]+p[2])*5],u=>u>.75?.65:1);
  return b.mesh('GTI projecting technical trim shelf',material);
}

export function gtiVentBand(width:number,material:T.Material):T.Mesh {
  const b=new Skin(),profile=[[.747,-.452],[.738,-.478],[.731,-.500],[.686,-.500],[.676,-.474]] as const;
  b.patch(profile.length-1,48,(u,v)=>{
    const x=T.MathUtils.lerp(-width,width,v),p=profile[Math.round(u*(profile.length-1))]!;
    return [x,p[0]-.006*(x/width)**4,p[1]-.012*(x/width)**4];
  },(u,v)=>[v,1-u],u=>u<.25?.65:u>.75?.78:1);
  return b.mesh('GTI recessed horizontal vent atlas',material);
}

export function gtiLowerDashboard(width:number,material:T.Material):T.Mesh {
  const b=new Skin();
  b.patch(12,48,(u,v)=>{
    const x=T.MathUtils.lerp(-width,width,v),driver=Math.exp(-(((x+.37)/.29)**6));
    return [x,T.MathUtils.lerp(.675,.445-.045*driver,u),T.MathUtils.lerp(-.491,-.765-.025*driver,smooth(u))];
  },(u,v)=>[v,1-u],u=>T.MathUtils.lerp(.88,.56,u));
  return b.mesh('GTI receding lower dash and glovebox',material);
}

/** The outer tunnel contains the centimetre-scale recesses; no USB, grille or button meshes. */
export function gtiConsoleShell(material:T.Material):T.Mesh {
  const stations=[
    {z:-.370,left:-.065,right:.245,top:.545,bed:.545,phone:.545},
    {z:-.318,left:-.067,right:.247,top:.535,bed:.480,phone:.480},
    {z:-.105,left:-.080,right:.250,top:.515,bed:.455,phone:.455},
    {z:-.045,left:-.080,right:.250,top:.510,bed:.510,phone:.510},
    {z:.005,left:-.082,right:.252,top:.507,bed:.507,phone:.486},
    {z:.305,left:-.085,right:.255,top:.487,bed:.487,phone:.467},
    {z:.360,left:-.088,right:.258,top:.476,bed:.476,phone:.476},
    {z:.405,left:-.090,right:.260,top:.472,bed:.420,phone:.420},
    {z:.545,left:-.090,right:.260,top:.493,bed:.420,phone:.420},
    {z:.605,left:-.085,right:.255,top:.532,bed:.532,phone:.532},
    {z:.845,left:-.080,right:.240,top:.510,bed:.510,phone:.510},
  ];
  const mesh=surfaceLoft('GTI flowing central tunnel',stations.map(s=>({at:s.z,ring:[
    [s.left,.20],[s.left,s.top-.038],[s.left+.010,s.top-.008],[s.left+.027,s.top],
    [s.left+.037,s.bed],[.101,s.bed],[.112,s.phone],[s.right-.037,s.phone],
    [s.right-.027,s.top],[s.right-.010,s.top-.008],[s.right,s.top-.038],[s.right,.20],
  ] as [number,number][]})),material);
  const positions=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv'),colors:number[]=[];
  for(let i=0;i<positions.count;i++) {
    uv.setXY(i,positions.getX(i)*2,positions.getZ(i)*2);
    const shade=positions.getY(i)<.465?.55:positions.getY(i)<.50?.82:1;colors.push(shade,shade,shade);
  }
  mesh.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));return mesh;
}

export function gtiStorageSurfaces(material:T.Material):T.Mesh {
  const b=new Skin();
  // Rubber tray, the long phone channel and rear storage bed share one material/mesh.
  b.patch(1,1,(u,v)=>[T.MathUtils.lerp(-.029,.209,v),T.MathUtils.lerp(.482,.457,u),T.MathUtils.lerp(-.315,-.107,u)],
    (u,v)=>[v,.72-u*.57]);
  b.patch(1,1,(u,v)=>[T.MathUtils.lerp(.113,.213,v),T.MathUtils.lerp(.487,.468,u),T.MathUtils.lerp(.006,.303,u)],
    (u,v)=>[v*.5,.72-u*.57]);
  b.patch(1,1,(u,v)=>[T.MathUtils.lerp(-.049,.217,v),.422,T.MathUtils.lerp(.408,.542,u)],
    (u,v)=>[v,.72-u*.57]);
  // USB icons are drawn in the top atlas cell, rather than constructed as ports.
  b.patch(1,1,(u,v)=>[T.MathUtils.lerp(-.030,.211,v),.545-u*.018,-.353+u*.029],(u,v)=>[v,1-u*.20]);
  return b.mesh('GTI rubber storage and USB atlas',material);
}
