import * as T from 'three';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';

export const GTI_STEERING_ATLAS = {
  left: [0, .625, .5, .375], right: [.5, .625, .5, .375], lower: [.15, .5, .2, .125], hub: [.5, .125, .5, .375],
} as const;

/** Static artwork based on the supplied VW steering reference. No button/input logic. */
function canvas(fill: string, height = 1024): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = height;
  const c = cv.getContext('2d')!; c.fillStyle = fill; c.fillRect(0, 0, cv.width, cv.height); return cv;
}
function texture(cv: HTMLCanvasElement, color = false): T.CanvasTexture {
  const t = new T.CanvasTexture(cv); if (color) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4; return t;
}
function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
}
function path(c: CanvasRenderingContext2D, points: readonly (readonly [number, number])[], width: number, color: string): void {
  c.strokeStyle=color; c.lineWidth=width; c.lineCap='round'; c.lineJoin='round';
  c.beginPath(); points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y)); c.stroke();
}

function buildMaterials(): { rim: T.MeshStandardMaterial; controls: T.MeshStandardMaterial; hub: T.MeshStandardMaterial } {
  const color=canvas('#242629'), relief=canvas('#808080'), roughness=canvas('#dedede'), glow=canvas('#000000');
  const c=color.getContext('2d')!, b=relief.getContext('2d')!, r=roughness.getContext('2d')!, e=glow.getContext('2d')!;
  let seed=7291;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // A distinct fine-grained wheel leather avoids stretching the seat upholstery map.
  const rimColor=canvas('#28292a',512), rimRelief=canvas('#808080',512), rimRoughness=canvas('#dbdbdb',512);
  const rc=rimColor.getContext('2d')!, rb=rimRelief.getContext('2d')!, rr=rimRoughness.getContext('2d')!;
  for(let i=0;i<42000;i++) {
    const x=Math.floor(random()*1024), y=Math.floor(random()*512), tone=31+Math.floor(random()*17);
    rc.fillStyle=`rgb(${tone},${tone+1},${tone+2})`; rc.fillRect(x,y,2,1);
    rb.fillStyle=i%2?'#929292':'#737373'; rb.fillRect(x,y,2,1);
    rr.fillStyle=i%2?'#e4e4e4':'#cfcfcf'; rr.fillRect(x,y,2,1);
  }
  // Torus U follows the circumference, V the grip cross-section. Front face is V≈.25.
  for(const center of [0,512,1024]) for(let x=center-62;x<center+62;x+=12) for(let y=260;y<425;y+=12) {
    const wrapped=(x+1024)%1024;
    rc.fillStyle='#16191b'; rc.beginPath(); rc.arc(wrapped,y,1.35,0,Math.PI*2); rc.fill();
    rb.fillStyle='#626262'; rb.beginPath(); rb.arc(wrapped,y,1.5,0,Math.PI*2); rb.fill();
  }
  for(const y of [313,438]) {
    path(rc,[[0,y],[1024,y]],2,'#19191b'); path(rb,[[0,y],[1024,y]],1,'#6a6a6a');
    for(let x=0;x<1024;x+=15) {
      path(rc,[[x,y-2],[x+7,y+2]],2,'#91313a'); path(rb,[[x,y-2],[x+7,y+2]],1,'#adadad');
    }
  }
  const label=(s:string,x:number,y:number,size:number,lit=true) => {
    for(const ctx of lit?[c,e]:[c]) { ctx.font=`600 ${size}px "Segoe UI",Arial,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=ctx===e?'#c5cdd2':'#e0e3e5'; ctx.fillText(s,x,y); }
  };
  const icon=(draw:(ctx:CanvasRenderingContext2D)=>void) => { for(const ctx of [c,e]) {ctx.save();draw(ctx);ctx.restore();} };
  for(const x of [0,512]) {
    const grad=c.createLinearGradient(x,0,x,384); grad.addColorStop(0,'#2f353b'); grad.addColorStop(.25,'#171d23'); grad.addColorStop(1,'#0c1116');
    c.fillStyle=grad; rounded(c,x+10,10,492,364,27); c.fill();
    c.strokeStyle='#6b737a'; c.lineWidth=3; c.stroke();
    b.fillStyle='#919191'; rounded(b,x+14,14,484,356,24); b.fill();
    r.fillStyle='#929292'; rounded(r,x+14,14,484,356,24); r.fill();
    // Shallow cap edges and gaps are all baked into one atlas.
    for(const [bx,by,w,h] of [[x+32,32,212,133],[x+267,32,211,133],[x+32,188,446,153]]) {
      c.fillStyle='#111820'; rounded(c,bx!,by!,w!,h!,13); c.fill();
      c.strokeStyle='#3c454d'; c.lineWidth=3; c.stroke();
      b.fillStyle='#a1a1a1'; rounded(b,bx!,by!,w!,h!,13); b.fill();
    }
    path(c,[[x+39,348],[x+473,348]],2,'#667079');
  }
  label('RES',132,75,34); label('+',132,121,38);
  label('SET',372,75,34); label('−',372,121,38);
  label('−',86,274,43); label('+',426,274,43);
  icon(ctx=>{
    ctx.strokeStyle='#d6dce0'; ctx.lineWidth=6; ctx.beginPath();ctx.arc(256,247,37,Math.PI*.85,Math.PI*2.15);ctx.stroke();
    path(ctx,[[256,247],[277,228]],6,'#d6dce0');path(ctx,[[238,280],[275,280]],4,'#d6dce0');
  });
  // Volume marks sit beside the cruise key, following the physical reference layout.
  icon(ctx=>{path(ctx,[[53,235],[65,235],[77,225],[77,254],[65,244],[53,244],[53,235]],4,'#d6dce0');});
  label('OK',768,267,35);
  icon(ctx=>{
    path(ctx,[[751,215],[768,202],[785,215]],5,'#d6dce0');path(ctx,[[751,312],[768,325],[785,312]],5,'#d6dce0');
    path(ctx,[[702,251],[686,265],[702,279]],5,'#d6dce0');path(ctx,[[835,251],[851,265],[835,279]],5,'#d6dce0');
    // Telephone and page-selection pictograms; ornamental, with no new functions.
    path(ctx,[[620,71],[610,85],[618,105],[635,121],[654,126],[667,114],[651,102],[640,111],[624,94],[635,82],[620,71]],5,'#d6dce0');
    ctx.strokeStyle='#d6dce0';ctx.lineWidth=4;ctx.strokeRect(875,70,38,42);ctx.strokeRect(887,80,38,42);
  });
  // Lower-spoke trim and airbag pad use the two bottom cells of the same texture.
  const metal=c.createLinearGradient(0,384,512,512);metal.addColorStop(0,'#9ea7ae');metal.addColorStop(.4,'#d3d8db');metal.addColorStop(1,'#727c84');
  c.fillStyle=metal;c.fillRect(0,384,512,128);r.fillStyle='#b2b2b2';r.fillRect(0,384,512,128);
  for(let y=386;y<512;y+=3) path(c,[[0,y],[512,y]],.6,'rgba(42,49,55,.18)');
  c.fillStyle='#1a2026';rounded(c,162,406,188,78,12);c.fill();label('GTI',256,446,57,false);
  path(c,[[185,480],[327,480]],3,'#a53240');
  c.fillStyle='#292b2d';c.fillRect(512,512,512,384);
  for(let i=0;i<7000;i++) {
    const x=512+Math.floor(random()*512),y=512+Math.floor(random()*384);
    c.fillStyle=i%2?'#242628':'#313335';c.fillRect(x,y,1,1);
    b.fillStyle=i%2?'#787878':'#888888';b.fillRect(x,y,1,1);
  }
  // Debossed AIRBAG uses offset light/dark impressions, no emissive text.
  c.font='500 12px "Segoe UI",Arial,sans-serif';c.textAlign='center';c.textBaseline='middle';
  c.fillStyle='#3d3f41';c.fillText('AIRBAG',768,823);c.fillStyle='#171a1d';c.fillText('AIRBAG',768,822);
  b.font=c.font;b.textAlign='center';b.textBaseline='middle';b.fillStyle='#626262';b.fillText('AIRBAG',768,822);
  const atlas=texture(color,true), bump=texture(relief), rough=texture(roughness), emit=texture(glow);
  return {
    rim:new T.MeshStandardMaterial({map:texture(rimColor,true),bumpMap:texture(rimRelief),bumpScale:.00028,
      roughnessMap:texture(rimRoughness),roughness:.9,metalness:0}),
    controls:new T.MeshStandardMaterial({map:atlas,bumpMap:bump,bumpScale:.0002,roughnessMap:rough,roughness:.62,
      metalness:.14,emissive:0xffffff,emissiveMap:emit,emissiveIntensity:0,side:T.DoubleSide}),
    hub:new T.MeshStandardMaterial({map:atlas,bumpMap:bump,bumpScale:.00024,roughnessMap:rough,roughness:.95,
      metalness:0,side:T.DoubleSide}),
  };
}

/** Registry owns all static maps; each wheel borrows them with isolated mutable materials. */
export function createGolfGTISteeringMaterials(owner: object, assets?: VehicleAssetRegistry) {
  const build=(root:T.Group) => {
    const materials=buildMaterials(), geometry=new T.PlaneGeometry(1,1);
    for(const key of ['rim','controls','hub'] as const) {const m=new T.Mesh(geometry,materials[key]);m.name=key;root.add(m);}
  };
  let palette:T.Group;
  if(assets) palette=assets.section(owner,'gti-steering/materials',build);
  else {palette=new T.Group();build(palette);(palette.children[0] as T.Mesh).geometry.dispose();}
  const material=(name:string)=>(palette.getObjectByName(name) as T.Mesh).material as T.MeshStandardMaterial;
  return {rim:material('rim'),controls:material('controls'),hub:material('hub')};
}

export function mapGolfGTISteeringAtlas(geometry:T.BufferGeometry, cell:readonly [number,number,number,number]): void {
  const uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++) uv.setXY(i,cell[0]+uv.getX(i)*cell[2],cell[1]+uv.getY(i)*cell[3]);
}
