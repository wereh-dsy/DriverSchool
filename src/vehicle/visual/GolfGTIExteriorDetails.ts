import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { surfaceMesh } from './SurfaceVehicleGeometry';
import type { Vector3Tuple as P } from './VehicleVisualConfig';

type Detail='nose'|'grille'|'rear'|'head-mask'|'fog-mask';
function artwork(kind:Detail):T.CanvasTexture {
  const cv=document.createElement('canvas');cv.width=kind.endsWith('mask')?256:1024;cv.height=kind.endsWith('mask')?128:512;
  const c=cv.getContext('2d')!,w=cv.width,h=cv.height;
  const line=(points:number[][],color:string,width:number)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x!,y!):c.moveTo(x!,y!));c.stroke();};
  const text=(s:string,x:number,y:number,size:number,color='#c5cbd0')=>{c.fillStyle=color;c.font=`italic 600 ${size}px Segoe UI,sans-serif`;c.textAlign='center';c.fillText(s,x,y);};
  c.fillStyle=kind==='nose'||kind==='rear'?'#ffffff':'#050709';c.fillRect(0,0,w,h);
  if(kind==='head-mask') {
    c.fillStyle='#000';c.fillRect(0,0,w,h);c.fillStyle='#fff';
    for(const x of [77,166]) {c.beginPath();c.ellipse(x,67,25,22,0,0,Math.PI*2);c.fill();}
  } else if(kind==='fog-mask') {
    c.fillStyle='#000';c.fillRect(0,0,w,h);c.fillStyle='#fff';
    for(const [x,y] of [[60,29],[196,29],[128,64],[60,100],[196,100]]) {c.beginPath();c.arc(x!,y!,16,0,Math.PI*2);c.fill();}
  } else if(kind==='grille') {
    for(let y=104;y<414;y+=23) for(let x=(y/23)%2?0:14;x<1024;x+=28) {
      c.strokeStyle='#363d42';c.lineWidth=2;c.beginPath();
      for(let i=0;i<=6;i++){const a=i*Math.PI/3;const px=x+Math.cos(a)*13,py=y+Math.sin(a)*11;i?c.lineTo(px,py):c.moveTo(px,py);}c.stroke();
    }
    for(let y=16;y<92;y+=18)line([[0,y],[1024,y]],'#20282d',5);
    line([[0,16],[1024,16]],'#c22336',12);text('GTI',839,67,48,'#c73143');
    for(let x=75;x<1000;x+=190) {c.fillStyle='#242a2e';c.fillRect(x,433,11,75);line([[x+12,435],[x+12,505]],'#090b0d',10);}
  } else if(kind==='nose') {
    for(const side of [-1,1]) {
      c.save();if(side>0){c.translate(1024,0);c.scale(-1,1);}
      const glass=c.createLinearGradient(0,7,0,98);glass.addColorStop(0,'#172028');glass.addColorStop(.45,'#111820');glass.addColorStop(1,'#333f48');
      c.fillStyle=glass;c.beginPath();c.moveTo(20,8);c.lineTo(287,25);c.lineTo(273,75);c.lineTo(153,101);c.lineTo(20,65);c.closePath();c.fill();
      for(const x of [91,190]) {c.strokeStyle='#7f8c96';c.lineWidth=3;c.beginPath();c.ellipse(x,54,24,17,0,0,Math.PI*2);c.stroke();c.strokeStyle='#29343e';c.lineWidth=5;c.beginPath();c.ellipse(x,54,14,12,0,0,Math.PI*2);c.stroke();}
      line([[26,17],[149,20],[273,34]],'#adb6be',3);line([[29,100],[40,272],[130,306]],'#555e65',2);
      c.fillStyle='#171d22';c.beginPath();c.moveTo(12,244);c.lineTo(91,309);c.lineTo(250,340);c.lineTo(50,331);c.lineTo(12,294);c.fill();c.restore();
    }
    line([[289,23],[735,23]],'#b41f32',5);
    // The painted bridge and plate separate the slim optics from the low intake.
    c.fillStyle='#171c20';c.fillRect(365,137,294,69);
    c.fillStyle='#d8dcdf';c.fillRect(370,142,284,59);
    c.fillStyle='#154b8b';c.fillRect(370,142,24,59);text('GTI  245',524,184,30,'#172026');
  } else {
    for(const side of [-1,1]) {
      c.save();if(side>0){c.translate(1024,0);c.scale(-1,1);}
      const lens=c.createLinearGradient(0,33,0,122);lens.addColorStop(0,'#181316');lens.addColorStop(.45,'#3a1420');lens.addColorStop(1,'#190f15');
      c.fillStyle=lens;c.beginPath();c.moveTo(6,29);c.lineTo(282,49);c.lineTo(301,100);c.lineTo(53,115);c.lineTo(7,91);c.closePath();c.fill();
      line([[18,46],[273,65],[283,88],[54,101]],'#8e2637',5);line([[36,76],[245,84]],'#3a1721',7);c.restore();
    }
    line([[160,18],[160,228],[865,228],[865,18]],'#81898e',2);
    c.fillStyle='#11171c';c.fillRect(341,281,342,90);text('GOLF GTI',512,344,42);
    text('G T I',512,172,30,'#a32334');line([[82,418],[943,418]],'#525b61',2);
  }
  const texture=new T.CanvasTexture(cv);texture.anisotropy=8;if(!kind.endsWith('mask'))texture.colorSpace=T.SRGBColorSpace;return texture;
}

export function gtiExteriorTexture(kind:Detail,owner:object,assets?:VehicleAssetRegistry):T.Texture {
  const build=()=>new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshStandardMaterial({map:artwork(kind)}));
  const holder=assets?assets.mesh(owner,'gti-exterior-detail/'+kind,build):build();
  const mat=holder.material as T.MeshStandardMaterial,result=mat.map!;mat.dispose();if(!assets)holder.geometry.dispose();return result;
}

/** Batch disconnected large surfaces sharing one material; no per-honeycomb/LED meshes. */
export function gtiJoin(name:string,parts:T.Mesh[],material:T.Material):T.Mesh {
  const geometries=parts.map(part=>{part.updateMatrix();let g=part.geometry.clone().applyMatrix4(part.matrix);if(g.index){const indexed=g;g=g.toNonIndexed();indexed.dispose();}part.geometry.dispose();return g;});
  const geometry=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}

export function gtiRibbon(name:string,points:P[],width:number,material:T.Material):T.Mesh {
  const p:number[]=[],uv:number[]=[],idx:number[]=[];
  points.forEach(([x,y,z],i)=>{p.push(x,y-width/2,z,x,y+width/2,z);uv.push(i/(points.length-1),0,i/(points.length-1),1);if(i){const n=i*2;idx.push(n-2,n-1,n,n-1,n+1,n);}});
  return surfaceMesh(name,p,idx,uv,material);
}
