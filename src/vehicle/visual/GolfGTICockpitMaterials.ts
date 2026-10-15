import * as T from 'three';

export const GTI_COCKPIT_SURFACES=['soft','leather','tartan','technical','rubber','lower','fascia','controls','console-deck','light-controls'] as const;
export type GTICockpitSurface=typeof GTI_COCKPIT_SURFACES[number];
const label=(c:CanvasRenderingContext2D,s:string,x:number,y:number,size=24,color='#d4d6d7')=>{
  c.font=`500 ${size}px Segoe UI, Microsoft YaHei, sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(s,x,y);
};
const stroke=(c:CanvasRenderingContext2D,x:number,y:number,w:number,color:string,width=1)=>{
  c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x+w,y);c.stroke();
};
const sample=(x:number,y:number)=>{
  let n=Math.imul(x+3147,374761393)^Math.imul(y+1783,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
};
const setup=(w:number,h:number)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function finish(cv:HTMLCanvasElement):T.CanvasTexture {
  const t=new T.CanvasTexture(cv);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;
}

/** Original style-matched artwork. Fine fittings never add scene nodes. */
export function gtiCockpitArtwork(kind:GTICockpitSurface):T.CanvasTexture {
  const tile=['soft','leather','tartan','technical'].includes(kind);
  const cv=setup(kind==='fascia'||kind==='lower'?2048:kind==='console-deck'?512:1024,kind==='fascia'||kind==='lower'?256:kind==='console-deck'?1024:1024);
  const c=cv.getContext('2d')!,w=cv.width,h=cv.height;
  const base=kind==='soft'?43:kind==='leather'?32:kind==='technical'?39:29;
  c.fillStyle=`rgb(${base},${base+1},${base+2})`;c.fillRect(0,0,w,h);
  if(tile) {
    for(let y=0;y<h;y+=2) for(let x=0;x<w;x+=2) {
      const n=sample(x,y),value=base+Math.round((n-.5)*9);
      c.fillStyle=`rgb(${value},${value+1},${value+2})`;c.fillRect(x,y,2,2);
    }
  }
  if(kind==='technical') {
    for(let y=-16;y<h+16;y+=8) for(let x=-16;x<w+16;x+=8) {
      const bright=(Math.floor(x/8)+Math.floor(y/8))%4<2;
      c.fillStyle=bright?'rgba(137,139,141,.07)':'rgba(11,13,15,.08)';
      c.beginPath();c.moveTo(x,y);c.lineTo(x+8,y+2);c.lineTo(x+8,y+7);c.lineTo(x,y+5);c.fill();
      stroke(c,x,y+3,7,'rgba(201,204,205,.07)',.7);
    }
  } else if(kind==='tartan') {
    c.fillStyle='#292b2e';c.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=4) stroke(c,0,y,w,y%8?'#4b4e51':'#34373a',.8);
    for(let x=0;x<w;x+=4) {c.fillStyle='rgba(184,186,188,.14)';c.fillRect(x,0,1,h);}
    for(let x=0;x<w;x+=128) {
      c.fillStyle='rgba(7,8,10,.28)';c.fillRect(x,0,23,h);
      for(const d of [29,35,41]) {c.fillStyle=d===35?'#888b8e':'#62666a';c.fillRect(x+d,0,1,h);}
      c.fillStyle='#9b3a43';c.fillRect(x+83,0,1.5,h);
    }
    for(let y=0;y<h;y+=128) {
      c.fillStyle='rgba(7,8,10,.25)';c.fillRect(0,y,w,21);
      for(const d of [27,33,39]) stroke(c,0,y+d,w,d===33?'#888b8e':'#62666a',1);
      stroke(c,0,y+81,w,'#91343f',1.5);
    }
  } else if(kind==='leather') {
    c.setLineDash([3,7]);c.strokeStyle='#79323b';c.lineWidth=1.4;
    for(const x of [18,1006]) {c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}c.setLineDash([]);
  } else if(kind==='fascia') {
    c.fillStyle='#0c0e10';c.fillRect(0,0,w,h);
    // A long, shallow vent belt. The centre control island is a separate large surface.
    for(const [x0,x1] of [[8,183],[625,1020],[1051,2038]]) {
      const shadow=c.createLinearGradient(0,37,0,222);shadow.addColorStop(0,'#030405');shadow.addColorStop(1,'#171a1c');c.fillStyle=shadow;c.fillRect(x0!,37,x1!-x0!,185);
      for(let y=61;y<215;y+=43) {
        const blade=c.createLinearGradient(0,y,0,y+9);blade.addColorStop(0,'#777d82');blade.addColorStop(.3,'#373d41');blade.addColorStop(1,'#12171a');
        c.fillStyle=blade;c.fillRect(x0!+6,y,x1!-x0!-12,9);stroke(c,x0!+6,y+10,x1!-x0!-12,'#030506',3);
      }
      for(let x=x0!+65;x<x1!-20;x+=160) {c.fillStyle='#71777b';c.fillRect(x,93,3,64);c.fillStyle='#1c2227';c.fillRect(x+3,93,4,64);}
    }
    stroke(c,0,17,w,'#747b81',2);stroke(c,0,237,w,'#535b61',3);
  } else if(kind==='lower') {
    c.fillStyle='#242729';c.fillRect(0,0,w,h);
    c.strokeStyle='#111416';c.lineWidth=2;c.beginPath();c.moveTo(1280,8);c.lineTo(1265,223);c.quadraticCurveTo(1620,240,1995,221);c.lineTo(2008,8);c.stroke();
    stroke(c,1570,45,152,'#0d1012',7);stroke(c,1572,48,147,'#41474a',1.2);
  } else if(kind==='rubber') {
    c.fillStyle='#24282b';c.fillRect(0,0,w,h);
    for(let y=230;y<h;y+=9) for(let x=0;x<w;x+=9) {
      c.fillStyle=(Math.floor(x/9)+Math.floor(y/9))%2?'#2c3135':'#1d2226';
      c.beginPath();c.moveTo(x,y-3);c.lineTo(x+3,y);c.lineTo(x,y+3);c.lineTo(x-3,y);c.fill();
    }
    c.fillStyle='#101518';c.fillRect(0,0,w,205);
    for(const x of [340,680]) {c.strokeStyle='#747b80';c.lineWidth=4;c.strokeRect(x-31,70,62,20);label(c,'↔',x+81,81,31,'#aeb7bd');}
  } else if(kind==='controls') {
    c.fillStyle='#101316';c.fillRect(0,0,w,h);
    label(c,'ASSIST',270,172,64);label(c,'CLIMA',752,172,64);label(c,'MENU',270,784,64);label(c,'MODE',752,784,64);
    c.strokeStyle='#c3313e';c.lineWidth=11;c.beginPath();c.moveTo(512,390);c.lineTo(621,592);c.lineTo(403,592);c.closePath();c.stroke();label(c,'!',512,538,110,'#c3313e');
  } else if(kind==='light-controls') {
    c.fillStyle='#0a0e12';c.fillRect(0,0,w,h);label(c,'AUTO',512,170,63,'#d8a561');
    for(const [s,x,y] of [['FRONT',265,390],['MODE',740,390],['REAR',265,690],['MAX',740,690]] as const) {
      c.strokeStyle='#505b64';c.lineWidth=3;c.strokeRect(x-180,y-100,360,220);label(c,s,x,y,50,'#d3d9de');
    }
    stroke(c,105,930,810,'#626c73',2);
  } else if(kind==='console-deck') {
    const sheen=c.createLinearGradient(0,0,w,0);sheen.addColorStop(0,'#30373c');sheen.addColorStop(.2,'#0d1216');sheen.addColorStop(.9,'#151b20');sheen.addColorStop(1,'#62696d');c.fillStyle=sheen;c.fillRect(0,0,w,h);
    c.strokeStyle='#899197';c.lineWidth=4;c.strokeRect(11,11,w-22,h-22);c.strokeStyle='#06090d';c.lineWidth=10;c.strokeRect(23,24,w-46,h-48);
    label(c,'ENGINE',256,84,25,'#b13643');label(c,'START/STOP',256,119,27,'#b13643');
    stroke(c,57,173,398,'#68747d',2);label(c,'P',256,224,45);
    label(c,'R',256,397,39);label(c,'N',256,465,39);label(c,'D/S',256,533,35);
    c.fillStyle='#a9b1b5';c.fillRect(70,694,372,12);label(c,'Ⓟ',256,773,63);stroke(c,70,838,372,'#343e46',3);label(c,'AUTO',256,896,30);label(c,'HOLD',256,939,30);
  }
  const texture=finish(cv);
  if(tile) {texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(kind==='technical'?1.6:1,kind==='technical'?1.6:1);}
  return texture;
}

/** Shared tangent-space normals and linear ORM channels: AO=R, roughness=G, metalness=B. */
export function gtiMicroMaps(kind:GTICockpitSurface):{normal:T.DataTexture;orm:T.DataTexture} {
  const size=256,heights=new Float32Array(size*size),normal=new Uint8Array(size*size*4),orm=new Uint8Array(size*size*4);
  const tile=['soft','leather','tartan','technical','rubber'].includes(kind);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const n=sample(x,y);let h=(n-.5)*.16;
    if(kind==='technical') h+=Math.sin((x+y)*Math.PI/4)*.10+Math.sin((x-y)*Math.PI/4)*.05;
    if(kind==='tartan') h+=Math.sin(x*Math.PI/2)*Math.cos(y*Math.PI/2)*.16;
    if(kind==='rubber') h+=Math.max(0,Math.cos(x*Math.PI/4)*Math.cos(y*Math.PI/4))*.28;
    heights[y*size+x]=h;
    let rough=kind==='technical'?155:kind==='console-deck'||kind==='controls'||kind==='light-controls'?56:kind==='rubber'?235:kind==='tartan'?234:kind==='fascia'?205:205;
    rough+=Math.round((n-.5)*(tile?24:5));orm.set([255,rough,kind==='technical'?44:0,255],(y*size+x)*4);
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const dx=(heights[y*size+(x+1)%size]!-heights[y*size+(x+size-1)%size]!)*.75;
    const dy=(heights[((y+1)%size)*size+x]!-heights[((y+size-1)%size)*size+x]!)*.75;
    const v=new T.Vector3(-dx,-dy,1).normalize();normal.set([Math.round(v.x*127+128),Math.round(v.y*127+128),Math.round(v.z*127+128),255],(y*size+x)*4);
  }
  const make=(data:Uint8Array)=>{const t=new T.DataTexture(data,size,size);t.wrapS=t.wrapT=tile?T.RepeatWrapping:T.ClampToEdgeWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;return t;};
  const normalTexture=make(normal);if(tile)normalTexture.repeat.setScalar(kind==='rubber'?4:2);
  return {normal:normalTexture,orm:make(orm)};
}

/** Static, low-energy window/roof reflection; no reflection cameras or added cabin lights. */
export function gtiCabinReflection():T.DataTexture {
  const w=128,h=64,data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const nx=x/w,ny=y/h;
    const windows=Math.exp(-(((ny-.44)/.09)**4))*(Math.exp(-(((nx-.25)/.11)**4))+Math.exp(-(((nx-.75)/.11)**4)));
    const roof=ny<.30?.035:.015,value=Math.round((roof+windows*.30)*255);data.set([value,Math.round(value*1.03),Math.round(value*1.07),255],(y*w+x)*4);
  }
  const texture=new T.DataTexture(data,w,h);texture.mapping=T.EquirectangularReflectionMapping;texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
