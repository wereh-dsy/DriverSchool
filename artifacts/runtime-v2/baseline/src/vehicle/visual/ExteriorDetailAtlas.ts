import * as T from 'three';
import type { ExteriorShapeProfile } from './ExteriorShapeProfiles';

type Point = readonly [number,number];
interface Region { x:number; y:number; minX:number; minY:number; width:number; height:number }

/** One 1024x512 static atlas per cached exterior, not one texture per detail.
 * Upper half: lamp reflectors, grilles, vents, plates. Lower half: both side
 * panel gaps and charge/fuel doors. Nothing is repainted during simulation. */
export class ExteriorDetailAtlas {
  public readonly texture:T.CanvasTexture;
  public readonly regions:string[]=[];
  private readonly context:CanvasRenderingContext2D|null;
  private readonly materials=new Map<T.Material,T.MeshStandardMaterial>();
  private tile=0;
  public constructor() {
    const canvas=typeof document==='undefined'?null:document.createElement('canvas');
    if(canvas){canvas.width=1024;canvas.height=512;}
    // Headless geometry checks never upload the texture; browser builds always
    // supply the real canvas. Keep the same atlas dimensions in those checks.
    this.texture=new T.CanvasTexture(canvas??({width:1024,height:512} as HTMLCanvasElement));
    this.texture.name='Static exterior details 1024x512';
    this.texture.colorSpace=T.SRGBColorSpace;this.texture.anisotropy=4;
    this.context=canvas?.getContext('2d')??null;
  }
  public material(source:T.MeshStandardMaterial,preserveColor=false):T.MeshStandardMaterial {
    let material=this.materials.get(source);
    if(!material){material=source.clone();if(!preserveColor)material.color.set(0xffffff);material.map=this.texture;this.materials.set(source,material);}
    return material;
  }
  public polygon(name:string,points:readonly Point[],color:T.Color,grille?:ExteriorShapeProfile['grille']):Region {
    if(this.tile>=16)throw Error('Exterior detail atlas capacity exceeded');
    const region:Region={x:this.tile%8*128,y:Math.floor(this.tile/8)*128,
      minX:Math.min(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),
      width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),
      height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};
    this.tile++;this.regions.push(name);
    const c=this.context;if(!c)return region;
    c.save();c.translate(region.x,region.y);
    const path=()=>{c.beginPath();points.forEach(([x,y],i)=>{const u=5+(x-region.minX)/region.width*118,v=123-(y-region.minY)/region.height*118;i?c.lineTo(u,v):c.moveTo(u,v);});c.closePath();};
    c.fillStyle='#'+color.getHexString();c.fillRect(0,0,128,128);
    path();c.clip();
    if(grille){
      // Slats/mesh and their highlights are artwork, not extruded bars/tubes.
      c.fillStyle='#10161c';c.fillRect(0,0,128,128);
      c.strokeStyle='#73808a';c.lineWidth=1.4;
      if(grille==='vw'||grille==='touareg')for(let y=24;y<122;y+=21){c.beginPath();c.moveTo(0,y);c.lineTo(128,y);c.stroke();}
      else {c.strokeStyle='#303b44';c.lineWidth=1;for(let y=14;y<128;y+=12){c.beginPath();c.moveTo(0,y);c.lineTo(128,y);c.stroke();}for(let x=8;x<128;x+=13){c.beginPath();c.moveTo(x,0);c.lineTo(x-8,128);c.stroke();}}
      path();c.strokeStyle='#9ba8b2';c.lineWidth=2;c.stroke();
      if(grille==='nissan'){c.beginPath();c.moveTo(4,8);c.lineTo(35,114);c.lineTo(93,114);c.lineTo(124,8);c.strokeStyle='#abb6be';c.lineWidth=3;c.stroke();}
    } else if(name.includes('headlamp')) {
      c.fillStyle='#19232c';c.fillRect(0,0,128,128);
      for(const x of [28,78]){c.fillStyle='#596771';c.fillRect(x,45,30,32);c.fillStyle='#202c36';c.fillRect(x+3,49,24,24);}
      path();c.strokeStyle='#6a7781';c.lineWidth=2;c.stroke();
    } else if(name.includes('intake')||name.includes('cooling')||name.includes('curtain')) {
      c.strokeStyle='#303940';c.lineWidth=1;for(let y=12;y<128;y+=12){c.beginPath();c.moveTo(0,y);c.lineTo(128,y);c.stroke();}
    }
    c.restore();return region;
  }
  public uv(geometry:T.BufferGeometry,region:Region):void {
    const uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++){const x=uv.getX(i),y=uv.getY(i);uv.setXY(i,(region.x+5+(x-region.minX)/region.width*118)/1024,
      1-(region.y+123-(y-region.minY)/region.height*118)/512);}
  }
  public side(geometry:T.BufferGeometry,sign:number,p:ExteriorShapeProfile,offset:number,
    belt:(z:number)=>number):void {
    const first=p.body[0]![0],last=p.body[p.body.length-1]![0],row=sign<0?256:384;
    const c=this.context;
    const x=(z:number)=>(z-first)/(last-first)*1024,y=(h:number)=>128-h/1.4*128;
    if(c){c.save();c.translate(0,row);c.fillStyle='#ffffff';c.fillRect(0,0,1024,128);c.strokeStyle='#50565c';c.lineWidth=.8;}
    for(const z of p.grille==='ferrari'||p.grille==='gt'?[.47]:[p.bPillar,p.rearDivider+.08]) {
      this.regions.push(`${sign<0?'Left':'Right'} door shut line`);
      if(c){c.beginPath();c.moveTo(x(z),y(p.sill+.10));c.lineTo(x(z),y(belt(z)-.02));c.stroke();}
    }
    if(sign>0||p.grille==='taycan'){
      const z=p.grille==='taycan'?-1.05:1.68;
      this.regions.push(`${sign<0?'Left':'Right'} fuel or charge flap`);
      if(c){c.beginPath();c.ellipse(x(z),y(belt(z)-.16),.075/(last-first)*1024,.062/1.4*128,0,0,Math.PI*2);c.stroke();}
    }
    if(c)c.restore();
    const position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setXY(i,x(position.getZ(i))/1024,1-(row+y(position.getY(i)+offset))/512);
  }
}
