import * as T from 'three';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { VOLKSWAGEN_MARK_PATH } from './assets/volkswagenMark';
import { GTI_COCKPIT_SURFACES, gtiCockpitArtwork, gtiMicroMaps, gtiCabinReflection, type GTICockpitSurface } from './GolfGTICockpitMaterials';

export type GTISurface = GTICockpitSurface | 'badge' | 'front' | 'rear' | 'side' | 'display-trim';
const line = (c: CanvasRenderingContext2D, points: number[][], color: string, width: number) => {
  c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x!,y!):c.moveTo(x!,y!));c.stroke();
};

/** Existing exterior/badge artwork is retained; cockpit uses its shared PBR palette. */
function artwork(kind:GTISurface):T.CanvasTexture {
  if((GTI_COCKPIT_SURFACES as readonly string[]).includes(kind))return gtiCockpitArtwork(kind as GTICockpitSurface);
  const cv=document.createElement('canvas');cv.width=kind==='badge'?512:kind==='display-trim'?768:1024;cv.height=512;
  const c=cv.getContext('2d')!;c.fillStyle=kind==='side'?'#e1e0da':'#222528';c.fillRect(0,0,1024,512);
  const text=(s:string,x:number,y:number,size=28,color='#d3d5d5')=>{c.font=`600 ${size}px Segoe UI, sans-serif`;c.fillStyle=color;c.textAlign='center';c.fillText(s,x,y);};
  if(kind==='display-trim') {
    c.fillStyle='#0c1014';c.fillRect(0,0,768,512);
    line(c,[[22,20],[745,20]],'#525b62',2);line(c,[[24,490],[744,490]],'#747b80',2);
  } else if (kind === 'badge') {
    c.clearRect(0, 0, 512, 512); c.save();
    c.translate(24,24); c.scale(464/24,464/24); c.fillStyle = '#d7dddf';
    // Browser-native vector rasterization, synchronously ready for staged warmup.
    // Node geometry tests have no Path2D; their canvas stub does not render pixels.
    if (typeof Path2D !== 'undefined') c.fill(new Path2D(VOLKSWAGEN_MARK_PATH));
    c.restore();
  } else if (kind === 'front') {
    c.fillStyle = '#070b0e'; c.fillRect(0, 0, 1024, 512);
    for (let y = 15; y < 512; y += 24) for (let x = y % 48; x < 1024; x += 28) {
      c.strokeStyle = '#34393d'; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 7; i++) { const a = i * Math.PI / 3; const px = x + Math.cos(a) * 12, py = y + Math.sin(a) * 12; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke();
    }
    line(c, [[0, 62], [1024, 62]], '#c22d3e', 14); text('GTI', 810, 155, 64, '#e3e4e5');
  } else if (kind === 'rear') {
    c.fillStyle = '#e1e0da'; c.fillRect(0, 0, 1024, 512);
    line(c, [[80, 70], [80, 470], [944, 470], [944, 70]], '#55585a', 3);
    c.fillStyle = '#14181b'; c.fillRect(340, 265, 344, 90); text('GOLF GTI', 512, 328, 36, '#d7d9da'); text('GTI', 190, 210, 36, '#ad2734');
  } else {
    for (const x of [382, 724]) {
      line(c, [[x, 18], [x, 442]], '#727575', 2);
      c.fillStyle = '#999c9a'; c.fillRect(x - 85, 83, 70, 9); c.fillStyle = '#3d4245'; c.fillRect(x - 83, 91, 65, 3);
    }
    line(c, [[0, 470], [1024, 470]], '#1c2023', 28); text('GTI', 205, 130, 29, '#b21c32');
  }
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function reflection(assets?:VehicleAssetRegistry):T.Texture {
  const build=()=>new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshStandardMaterial({envMap:gtiCabinReflection()}));
  const holder=assets?assets.mesh(assets,'gti-static-cabin-reflection',build):build();
  const m=holder.material as T.MeshStandardMaterial,result=m.envMap!;
  m.dispose();if(!assets)holder.geometry.dispose();return result;
}

function microSurface(kind:GTICockpitSurface,assets?:VehicleAssetRegistry) {
  const key=['console-deck','controls','light-controls'].includes(kind)?'console-deck':kind;
  if(!assets)return gtiMicroMaps(key);
  const holder=assets.mesh(assets,'gti-micro/'+key,()=>{
    const maps=gtiMicroMaps(key);
    return new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshStandardMaterial({normalMap:maps.normal,roughnessMap:maps.orm,aoMap:maps.orm}));
  });
  const material=holder.material as T.MeshStandardMaterial,result={normal:material.normalMap!,orm:material.roughnessMap!};material.dispose();return result;
}

export function gtiMaterial(kind: GTISurface, owner: object, assets?: VehicleAssetRegistry): T.MeshStandardMaterial {
  const build = () => {
    const map = artwork(kind);
    const gloss=['display-trim','console-deck','controls','light-controls'].includes(kind);
    const Constructor=gloss?T.MeshPhysicalMaterial:T.MeshStandardMaterial;
    const material = new Constructor({ color: 0xffffff, map, side: T.DoubleSide,
      roughness: kind==='display-trim'?.65:(GTI_COCKPIT_SURFACES as readonly string[]).includes(kind)?1:.88, metalness:0,
      vertexColors:kind==='soft'||kind==='technical'||kind==='lower'||kind==='fascia'||kind==='rubber',transparent:kind==='badge',depthWrite:kind!=='badge' });
    material.name='GTI surface '+kind;
    if((GTI_COCKPIT_SURFACES as readonly string[]).includes(kind)||kind==='display-trim') {
      const micro=microSurface(kind==='display-trim'?'console-deck':kind as GTICockpitSurface,assets);
      material.normalMap=micro.normal;material.roughnessMap=micro.orm;material.aoMap=micro.orm;
      material.normalScale.setScalar(gloss?.015:kind==='technical'?.16:kind==='rubber'?.45:kind==='tartan'?.30:.12);
      if(kind==='technical') {material.metalness=.35;material.metalnessMap=micro.orm;}
    }
    if(material instanceof T.MeshPhysicalMaterial) {material.specularIntensity=.30;material.clearcoat=.10;material.clearcoatRoughness=.18;}
    if(['display-trim','console-deck','controls','light-controls','technical'].includes(kind)) {
      material.envMap=reflection(assets);material.envMapIntensity=kind==='technical'?.22:.65;
    }
    return new T.Mesh(new T.PlaneGeometry(1, 1), material);
  };
  if (!assets) { const m = build(); m.geometry.dispose(); return m.material; }
  const m = assets.mesh(owner, 'surface/' + kind, build); return m.material as T.MeshStandardMaterial;
}
