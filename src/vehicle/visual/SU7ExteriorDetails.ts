import * as T from 'three';

type Tile='badge'|'grille'|'lamp';
const TILES={badge:[0,0,256,256],grille:[256,0,768,256],lamp:[0,256,512,256]} as const;

/** One immutable 1024×512 atlas for small exterior details. Built once per
 * registry template; mutable materials are cloned by VehicleAssetRegistry. */
export class SU7ExteriorDetails {
  public readonly texture:T.CanvasTexture;
  public constructor(){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
    const c=canvas.getContext('2d');
    if(c){
      c.fillStyle='#101518';c.fillRect(0,0,1024,512);
      c.clearRect(0,0,256,256);
      const silver=c.createLinearGradient(0,12,0,244);
      silver.addColorStop(0,'#e2e5e1');silver.addColorStop(.45,'#a5ada9');silver.addColorStop(1,'#d0d5ce');
      c.fillStyle=silver;c.beginPath();c.roundRect(6,35,244,186,38);c.fill();
      c.strokeStyle='#6f7873';c.lineWidth=3;c.stroke();
      // Independently drawn Mi mark, rather than a font-dependent plain plaque.
      c.fillStyle='#555e59';c.beginPath();c.moveTo(43,83);c.lineTo(136,83);c.quadraticCurveTo(160,83,160,107);
      c.lineTo(160,178);c.lineTo(137,178);c.lineTo(137,112);c.lineTo(66,112);c.lineTo(66,178);c.lineTo(43,178);c.closePath();c.fill();
      c.fillRect(88,126,23,52);c.fillRect(184,83,24,95);
      const [gx,gy,gw,gh]=TILES.grille;
      const depth=c.createLinearGradient(0,gy,0,gy+gh);depth.addColorStop(0,'#0a0d0f');depth.addColorStop(.5,'#182025');depth.addColorStop(1,'#080b0d');
      c.fillStyle=depth;c.fillRect(gx,gy,gw,gh);
      for(let x=gx+12;x<gx+gw;x+=22){
        c.fillStyle='#30383a';c.fillRect(x,12,4,230);c.fillStyle='#06090a';c.fillRect(x+4,12,9,230);
        c.fillStyle='#505858';c.fillRect(x,15,1,226);
      }
      c.fillStyle='#444c4d';c.fillRect(gx,122,gw,3);c.fillStyle='#070b0e';c.fillRect(gx,125,gw,8);
      c.fillStyle='#10171b';c.fillRect(0,256,512,256);
      const sheen=c.createLinearGradient(0,256,512,512);sheen.addColorStop(0,'#283239');sheen.addColorStop(.5,'#11191f');sheen.addColorStop(1,'#27323a');
      c.fillStyle=sheen;c.fillRect(0,256,512,256);
      // Four square projector cavities plus fine reflector fins, without four
      // separately modelled lenses. Bright projector pixels also mask real light output.
      for(const x of [170,334])for(const y of [298,423]){
        c.fillStyle='#05090d';c.beginPath();c.roundRect(x-36,y-28,77,58,13);c.fill();
        c.strokeStyle='#5b6870';c.lineWidth=3;c.stroke();
        const optic=c.createLinearGradient(x-25,y-21,x+26,y+21);optic.addColorStop(0,'#c7d6dc');optic.addColorStop(.45,'#768c98');optic.addColorStop(1,'#c4d2da');
        c.fillStyle=optic;c.beginPath();c.roundRect(x-22,y-19,45,39,9);c.fill();
        c.strokeStyle='#394750';c.lineWidth=1.5;c.stroke();
      }
      c.strokeStyle='#48575f';c.lineWidth=2;
      for(let x=145;x<450;x+=19){c.beginPath();c.moveTo(x,370);c.lineTo(x+16,354);c.stroke();}
    }
    this.texture=new T.CanvasTexture(canvas);this.texture.name='SU7 exterior detail atlas';
    this.texture.colorSpace=T.SRGBColorSpace;this.texture.anisotropy=4;
  }
  /** Caller supplies normalized UVs; every material borrows the same atlas. */
  public apply(mesh:T.Mesh,tile:Tile):T.Mesh {
    const [x,y,w,h]=TILES[tile],uv=mesh.geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setXY(i,(x+2+uv.getX(i)*(w-4))/1024,1-(y+2+(1-uv.getY(i))*(h-4))/512);
    return mesh;
  }
}
