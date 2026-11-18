import * as T from 'three';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';

/** Small static surface maps: detail lives in texels, not decorative meshes. */
export function maybachTexture(kind:'quilt'|'wood'|'grille'|'wheel'|'speaker'|'head-optic'|'head-mask'|'vent'|'controls'|'wheel-controls'|'seat-controls'|'window-controls',assets?:VehicleAssetRegistry):T.CanvasTexture {
  const draw=(c:CanvasRenderingContext2D)=>{
    c.fillStyle=kind==='quilt'?'#cabb9f':kind==='wood'?'#292025':kind==='grille'?'#11151b':'#a5a7a6';
    c.fillRect(0,0,512,512);
    if(kind==='quilt'){
      c.lineWidth=1.4;
      for(let n=-512;n<=1024;n+=64){
        c.strokeStyle='rgba(69,47,28,.25)';c.beginPath();c.moveTo(n,0);c.lineTo(n+512,512);c.moveTo(n,0);c.lineTo(n-512,512);c.stroke();
        c.strokeStyle='rgba(255,246,219,.65)';c.setLineDash([3,3]);c.beginPath();c.moveTo(n+3,0);c.lineTo(n+515,512);c.moveTo(n-3,0);c.lineTo(n-515,512);c.stroke();c.setLineDash([]);
      }
      c.fillStyle='rgba(68,48,31,.24)';for(let y=7;y<512;y+=12)for(let x=7;x<512;x+=12)c.fillRect(x,y,1,1);
    }else if(kind==='wood'){
      for(let y=0;y<512;y+=2){c.strokeStyle=`rgba(176,137,100,${.10+.10*Math.sin(y*.11)**2})`;c.lineWidth=1;
        c.beginPath();c.moveTo(0,y);c.bezierCurveTo(180,y+Math.sin(y*.04)*20,330,y-12,512,y+8);c.stroke();}
      c.strokeStyle='rgba(219,193,152,.38)';for(let x=32;x<512;x+=64){c.beginPath();c.moveTo(x,0);c.lineTo(x,512);c.stroke();}
    }else if(kind==='grille'){
      for(let x=12;x<512;x+=14){const g=c.createLinearGradient(x,0,x+6,0);g.addColorStop(0,'#363c42');g.addColorStop(.5,'#e2e2dd');g.addColorStop(1,'#77818b');c.fillStyle=g;c.fillRect(x,0,5,512);}
    }else if(kind==='speaker'){
      c.strokeStyle='#d9c9ad';c.lineWidth=2;
      for(let radius=14;radius<360;radius+=12){c.beginPath();c.arc(256,256,radius,0,Math.PI*2);c.stroke();}
      c.fillStyle='#4e4b49';for(let y=4;y<512;y+=9)for(let x=4;x<512;x+=9)c.fillRect(x+(y%18?4:0),y,2,2);
    }else if(kind==='head-optic'||kind==='head-mask'){
      c.fillStyle=kind==='head-mask'?'#000':'#0a1018';c.fillRect(0,0,512,512);
      for(const [x,y,r]of [[130,246,58],[272,259,52],[390,270,43]]){
        if(kind==='head-mask'){
          const g=c.createRadialGradient(x!,y!,r!*.08,x!,y!,r!*.47);
          g.addColorStop(0,'#fff');g.addColorStop(.40,'#f4f2e8');g.addColorStop(.78,'#889196');g.addColorStop(1,'#000');
          c.fillStyle=g;c.beginPath();c.arc(x!,y!,r!*.47,0,Math.PI*2);c.fill();
        }else{
          const g=c.createRadialGradient(x!-15,y!-15,2,x!,y!,r!);
          g.addColorStop(0,'#6d7c8e');g.addColorStop(.38,'#1f2a37');g.addColorStop(.70,'#090e17');g.addColorStop(.81,'#8a929a');g.addColorStop(1,'#141c26');
          c.fillStyle=g;c.beginPath();c.arc(x!,y!,r!,0,Math.PI*2);c.fill();
          c.strokeStyle='#677380';c.lineWidth=3;c.beginPath();c.arc(x!-10,y!-9,r!*.42,Math.PI,Math.PI*1.65);c.stroke();
          c.strokeStyle='#3f4b5a';c.lineWidth=1;
          for(let n=-2;n<=2;n++){c.beginPath();c.moveTo(x!+n*6,y!-r!*.35);c.lineTo(x!+n*6,y!+r!*.35);c.stroke();}
        }
      }
      if(kind==='head-optic'){
        c.fillStyle='#99a5ae';c.font='12px Segoe UI';c.fillText('DIGITAL LIGHT',74,390);
        c.strokeStyle='#384653';c.lineWidth=2;c.beginPath();c.moveTo(70,405);c.lineTo(396,405);c.stroke();
      }
    }else if(kind==='vent'){
      c.fillStyle='#101319';c.fillRect(0,0,512,512);
      for(let y=60;y<470;y+=64){c.fillStyle='#343b42';c.fillRect(18,y,476,10);c.fillStyle='#070a0e';c.fillRect(18,y+10,476,21);}
      c.fillStyle='#8d9296';c.fillRect(252,40,8,422);
      const g=c.createLinearGradient(0,0,0,512);g.addColorStop(0,'rgba(1,3,7,.6)');g.addColorStop(.5,'rgba(1,3,7,0)');g.addColorStop(1,'rgba(1,3,7,.45)');c.fillStyle=g;c.fillRect(0,0,512,512);
    }else if(kind==='controls'||kind==='wheel-controls'){
      c.fillStyle='#0a0c11';c.fillRect(0,0,512,512);c.fillStyle='#b4b7ba';c.textAlign='center';c.textBaseline='middle';c.font='42px Segoe UI';
      if(kind==='controls')for(const [n,t]of ['⌂','DYNAMIC','◁','VOL','☆'].entries())c.fillText(t,52+n*102,256);
      else{c.font='50px Segoe UI';c.fillText('◀   ▣   ▶',256,185);c.fillText('−    SET    +',256,335);}
    }else if(kind==='window-controls'){
      c.fillStyle='#101216';c.fillRect(0,0,512,512);c.strokeStyle='#b5ada1';c.lineWidth=5;
      for(const x of [92,204,316,428]){
        c.strokeRect(x-34,154,68,178);c.beginPath();c.moveTo(x-18,214);c.lineTo(x+18,214);
        c.lineTo(x+14,258);c.lineTo(x-14,258);c.closePath();c.stroke();
      }
    }else if(kind==='seat-controls'){
      c.fillStyle='#6d5e53';c.fillRect(0,0,512,512);c.strokeStyle='#c0c1bd';c.lineWidth=21;
      c.beginPath();c.moveTo(155,125);c.lineTo(145,300);c.lineTo(330,320);c.moveTo(145,115);c.lineTo(180,115);c.moveTo(185,360);c.lineTo(330,360);c.stroke();
      c.fillStyle='#b4b4b0';c.font='30px Segoe UI';c.fillText('M  1  2  3',150,440);
    }else{
      // The face geometry owns the five openings. No baked white highlight or
      // fake reflection: this map only carries faint machining and engraving.
      const g=c.createRadialGradient(256,256,25,256,256,255);g.addColorStop(0,'#858d94');g.addColorStop(.55,'#a1a8ae');g.addColorStop(1,'#8c959e');
      c.fillStyle=g;c.fillRect(0,0,512,512);
      c.strokeStyle='rgba(235,239,240,.13)';c.lineWidth=.7;
      for(let r=72;r<248;r+=3){c.beginPath();c.arc(256,256,r,0,Math.PI*2);c.stroke();}
      for(let n=0;n<5;n++){
        const a=n*Math.PI*2/5,x=256+Math.cos(a)*77,y=256+Math.sin(a)*77;
        c.fillStyle='#3e474f';c.beginPath();c.arc(x,y,7.5,0,Math.PI*2);c.fill();
        c.strokeStyle='#a4abb0';c.lineWidth=1.5;c.beginPath();c.arc(x,y,5,0,Math.PI*2);c.stroke();
      }
      c.fillStyle='#434d55';c.font='13px Segoe UI';c.textAlign='center';
      for(const [n,letter]of [...'MAYBACH'].entries()){
        const a=(n-3)*.22-Math.PI/2;c.save();c.translate(256+Math.cos(a)*54,256+Math.sin(a)*54);c.rotate(a+Math.PI/2);c.fillText(letter,0,0);c.restore();
      }

    }
  };
  const canvas=assets?assets.canvas('maybach-s680/'+kind,512,512,draw):(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;draw(canvas.getContext('2d')!);return canvas;
  })();
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture;
}
