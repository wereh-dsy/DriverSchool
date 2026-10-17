import { BoxGeometry, ExtrudeGeometry, Shape, type BufferGeometry } from 'three';
import type { CityObject } from './CityMapData';

export function cityFacadeHeightBand(scale:number):number {
  return scale<=.8?.75:scale<=1.35?1:scale<=2?1.75:scale<=3?2.5:scale<=4.5?4:5.5;
}
/** One complete extrusion per building silhouette, never stacked floor boxes.
 * Height bands change shared UV density, not the object's physical height. */
export function cityBuildingGeometry(w:number,h:number,d:number,shape:CityObject['buildingShape'],heightBand:number,roof=false):BufferGeometry {
  let geometry:BufferGeometry;
  if(!shape||shape==='box'||shape==='slab')geometry=new BoxGeometry(shape==='slab'?w*.62:w,h,d);
  else {
    const x=w/2,z=d/2,c=Math.min(w,d)*.16;
    const points=shape==='chamfered'?[[-x+c,-z],[x-c,-z],[x,-z+c],[x,z-c],[x-c,z],[-x+c,z],[-x,z-c],[-x,-z+c]]:
      [[-x,-z],[x,-z],[x,z],[w*.2,z],[w*.2,0],[-w*.2,0],[-w*.2,z],[-x,z]];
    const footprint=new Shape();points.forEach(([a,b],i)=>i?footprint.lineTo(a!,-b!):footprint.moveTo(a!,-b!));footprint.closePath();
    geometry=new ExtrudeGeometry(footprint,{depth:h,bevelEnabled:false,steps:1,curveSegments:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,-h/2,0);
  }
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++) {
    if(Math.abs(normals.getY(i))>.7||roof){uv.setXY(i,positions.getX(i)/w+.5,positions.getZ(i)/d+.5);continue;}
    const u=Math.abs(normals.getX(i))>.7?positions.getZ(i):positions.getX(i);
    uv.setXY(i,u/(2.4*16),((positions.getY(i)+h/2)*heightBand)/(3.3*16));
  }
  uv.needsUpdate=true;return geometry;
}
