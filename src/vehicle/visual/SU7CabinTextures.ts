import * as T from 'three';

type Detail='leather'|'seat'|'speaker'|'keys'|'climate'|'pedal'|'badge'|'switches';
const regions:Detail[]=['leather','seat','speaker','keys','climate','pedal','badge','switches'];

/** One small procedural atlas: no downloaded upholstery, per-button meshes or decals. */
export class SU7CabinTextures {
  private readonly texture:T.CanvasTexture;
  private readonly grain:T.DataTexture;
  private readonly materials=new Map<T.Material,Map<Detail,T.MeshStandardMaterial>>();
  public constructor() {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
    const c=canvas.getContext('2d');
    if(c)for(let tile=0;tile<regions.length;tile++) {
      c.save();c.translate(tile%4*256,Math.floor(tile/4)*256);
      c.fillStyle=tile===6?'#ffffff':tile===4?'#cec1ae':tile<2?'#dedede':tile===2?'#bababa':'#20272d';c.fillRect(0,0,256,256);
      c.lineWidth=1;c.strokeStyle='#969696';c.fillStyle='#a4a4a4';
      // Low-contrast, decorrelated pores stay subtle when upholstery UVs stretch.
      if(tile<2){let seed=731;for(let n=0;n<2400;n++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%256;
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=(seed>>>16)%256;
        c.fillStyle=n%2?'#d7d7d7':'#e4e4e4';c.fillRect(x,y,1,1);
      }}
      if(tile===1){c.strokeStyle='#c9c9c9';for(let x=24;x<256;x+=42){c.beginPath();c.moveTo(x,12);c.lineTo(x,244);c.stroke();}}
      if(tile===2){c.fillStyle='#333333';for(let x=5;x<256;x+=8)for(let y=5;y<256;y+=8){c.beginPath();c.arc(x,y,1.5,0,Math.PI*2);c.fill();}}
      c.strokeStyle='#c8d1d6';c.fillStyle='#e6ecee';c.textAlign='center';c.textBaseline='middle';
      if(tile===3){c.font='30px sans-serif';c.fillText('＋',66,75);c.fillText('−',66,184);c.fillText('◀',185,75);c.fillText('▶',185,184);c.strokeRect(36,34,184,188);}
      if(tile===4){c.font='22px sans-serif';c.fillText('TEMP     FAN     AUTO',128,102);c.fillText('−       ＋       A/C',128,163);}
      if(tile===5){c.fillStyle='#a8adb1';for(let x=25;x<240;x+=30)c.fillRect(x,20,11,216);}
      if(tile===6){c.fillStyle='#73716e';c.font='28px sans-serif';c.fillText('xiaomi',128,128);}
      if(tile===7){c.font='26px sans-serif';c.fillText('▱   ▱',128,85);c.fillText('◁    ▷',128,177);c.strokeRect(32,35,192,180);}
      c.restore();
    }
    this.texture=new T.CanvasTexture(canvas);this.texture.name='SU7 front cabin detail atlas';
    this.texture.colorSpace=T.SRGBColorSpace;this.texture.anisotropy=4;
    const pores=new Uint8Array(256*256*4);let seed=1457;
    for(let i=0;i<pores.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const level=208+(seed>>>27);pores[i]=pores[i+1]=pores[i+2]=level;pores[i+3]=255;}
    this.grain=new T.DataTexture(pores,256,256);this.grain.name='SU7 Nappa micrograin';
    this.grain.wrapS=this.grain.wrapT=T.RepeatWrapping;this.grain.magFilter=T.LinearFilter;
    this.grain.minFilter=T.LinearMipmapLinearFilter;this.grain.generateMipmaps=true;this.grain.needsUpdate=true;
  }
  public apply(mesh:T.Mesh,detail:Detail):T.Mesh {
    const source=mesh.material as T.MeshStandardMaterial;
    let kinds=this.materials.get(source);if(!kinds){kinds=new Map();this.materials.set(source,kinds);}
    let material=kinds.get(detail);
    if(!material){material=source.clone();material.name='SU7 '+detail+' atlas material';
      // Sub-pixel pores modulate roughness only; bump derivatives create visible
      // triangle bands on the shallow dashboard at the driving camera distance.
      if(detail==='leather')material.roughnessMap=this.grain;
      else material.map=this.texture;
      kinds.set(detail,material);}
    mesh.material=material;
    const index=regions.indexOf(detail),uv=mesh.geometry.getAttribute('uv');
    if(detail==='leather'){
      // Use one continuous chart per trim piece. Switching projection at each vertex
      // folds UVs across triangles, producing broad false highlights in roughness/bump.
      const p=mesh.geometry.getAttribute('position');
      mesh.geometry.computeBoundingBox();
      const size=mesh.geometry.boundingBox!.getSize(new T.Vector3());
      const side=size.x<=size.y&&size.x<=size.z,top=!side&&size.y<=size.z;
      for(let i=0;i<uv.count;i++){
        const u=side?p.getZ(i):p.getX(i),v=top?p.getZ(i):p.getY(i);
        uv.setXY(i,u*8,v*8);
      }
      return mesh;
    }
    for(let i=0;i<uv.count;i++)uv.setXY(i,(index%4+uv.getX(i))/4,(1-Math.floor(index/4)+uv.getY(i))/2);
    return mesh;
  }
}
