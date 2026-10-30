import * as T from 'three';
import { drawJeskoWordmark } from './JeskoCabinGeometry';

/** Deterministic instance-owned microstructure, never rebuilt during driving. */
export function jeskoSurfaceTile(carbon: boolean): T.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const vertical = (Math.floor(x / 8) + Math.floor(y / 8)) % 4 < 2;
    const strand = (vertical ? x : y) % 8;
    const value = carbon ? 54 + Math.sin((strand + .5) / 8 * Math.PI) * 9 + (vertical ? 3 : 0) + hash % 3 : 84 + hash % 19;
    const n = (y * size + x) * 4;
    data[n] = value; data[n + 1] = value + 2; data[n + 2] = value + 3; data[n + 3] = 255;
  }
  const texture = new T.DataTexture(data, size, size);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(carbon ? 12 : 4, carbon ? 12 : 4);
  texture.magFilter = T.LinearFilter; texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  texture.name = carbon ? 'Jesko woven carbon tile' : 'Jesko fine upholstery grain';
  return texture;
}

/** One static atlas for vents, seams, steering key caps and selector legends. */
export function jeskoDetailAtlas(): T.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const c=canvas.getContext('2d')!;c.clearRect(0,0,1024,1024);
  const text=(label:string,x:number,y:number,size:number,color='#bec5c8')=>{
    c.font=`400 ${size}px "Segoe UI",Arial,sans-serif`;c.fillStyle=color;c.textAlign='center';c.fillText(label,x,y);
  };
  // Oval vents use a shaded honeycomb texture inside a real metal rim.
  c.save();c.beginPath();c.rect(2,2,508,252);c.clip();
  c.fillStyle='#040608';c.fillRect(0,0,512,256);
  for(let row=0;row<9;row++)for(let col=0;col<15;col++){
    const x=col*36.373+(row%2)*18.187,y=row*31.5;
    c.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3+Math.PI/6;const px=x+21*Math.cos(a),py=y+21*Math.sin(a);if(k===0)c.moveTo(px,py);else c.lineTo(px,py);}c.closePath();
    c.strokeStyle=row%2?'#485259':'#6b757b';c.lineWidth=4;c.stroke();
  }
  c.strokeStyle='#a3afb6';c.lineWidth=5;c.beginPath();c.moveTo(245,56);c.lineTo(245,190);c.moveTo(265,56);c.lineTo(265,190);c.stroke();
  c.restore();
  // Transparent passenger embroidery/seam, instead of another rigid panel.
  c.strokeStyle='#141a1d';c.lineWidth=3;c.beginPath();c.roundRect(530,16,474,222,36);c.stroke();
  drawJeskoWordmark(c,637,105,258,'#d1d6d8');text('AIRBAG',928,47,13,'#4b5357');
  // Embossed dark shield: subdued like the airbag centre in the reference.
  c.beginPath();c.moveTo(459,281);c.lineTo(565,281);c.lineTo(563,398);c.lineTo(512,457);c.lineTo(461,398);c.closePath();
  c.strokeStyle='#263139';c.lineWidth=8;c.stroke();
  for(let n=0;n<6;n++){c.beginPath();c.moveTo(478,308+n*18);c.lineTo(548,308+n*18);c.strokeStyle='#242e35';c.lineWidth=4;c.stroke();}
  // The stalk's metallic oval deck: legends and hazard icon need no tiny meshes.
  const metal=c.createLinearGradient(0,512,512,512);metal.addColorStop(0,'#777f85');metal.addColorStop(.45,'#d2d6d8');metal.addColorStop(.7,'#878f94');metal.addColorStop(1,'#c4cbcf');
  c.fillStyle=metal;c.fillRect(0,512,512,512);
  c.strokeStyle='#364046';c.lineWidth=5;c.beginPath();c.roundRect(70,544,372,435,148);c.stroke();
  text('R  N  D',256,617,38,'#202a30');text('LST',256,956,30,'#344047');
  c.beginPath();c.moveTo(256,878);c.lineTo(234,916);c.lineTo(278,916);c.closePath();c.strokeStyle='#8a3232';c.lineWidth=4;c.stroke();
  c.fillStyle='#949fa6';c.fillRect(512,512,512,128);text('Koenigsegg',768,599,57,'#1b252d');
  c.strokeStyle='#bdc6cc';c.lineWidth=5;c.beginPath();c.moveTo(566,944);c.lineTo(678,944);c.moveTo(622,905);c.lineTo(622,983);c.stroke();
  c.beginPath();c.moveTo(824,944);c.lineTo(936,944);c.stroke();
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;texture.name='Jesko reference cockpit detail atlas';return texture;
}
export function atlasPlane(width: number, height: number, material: T.Material,
  rect: readonly [number, number, number, number], segments:readonly [number,number]=[1,1]): T.Mesh {
  const geometry = new T.PlaneGeometry(width, height, ...segments), uv = geometry.getAttribute('uv');
  const [x, y, w, h] = rect;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + 2 + uv.getX(i) * (w - 4)) / 1024,
    1 - (y + h - 2 - uv.getY(i) * (h - 4)) / 1024);
  return new T.Mesh(geometry, material);
}

/** Only this cabin's section shells need planar UVs; keep the shared builder intact. */
export function ensureJeskoSurfaceUV(geometry: T.BufferGeometry, remapExisting = false): void {
  if (geometry.hasAttribute('uv') && !remapExisting) return;
  const p = geometry.getAttribute('position'), uv = new Float32Array(p.count * 2);
  geometry.computeBoundingBox(); const size = geometry.boundingBox!.getSize(new T.Vector3());
  const axes = size.x < size.y && size.x < size.z ? [2, 1] : size.y < size.z ? [0, 2] : [0, 1];
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getComponent(i, axes[0]!) * 2; uv[i * 2 + 1] = p.getComponent(i, axes[1]!) * 2;
  }
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
}
