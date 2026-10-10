import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { CityMapData } from './CityMapData';
import { RoadClearance } from './RoadClearance';

/** A single batched ground surface with openings for authored open cuts.
 * Roofed bores retain their ground cover. No terrain/streaming subsystem. */
export function cityGroundGeometry(map: CityMapData): BufferGeometry {
  const clearance=new RoadClearance(map),open=new Set(map.roads.filter(r=>r.structure?.enclosure?.kind==='cutting').map(r=>r.id));
  const positions:number[]=[],b=map.bounds;
  const step=open.size?20:Math.max(b.maxX-b.minX,b.maxZ-b.minZ);
  for(let x=b.minX;x<b.maxX;x+=step)for(let z=b.minZ;z<b.maxZ;z+=step) {
    const x1=Math.min(b.maxX,x+step),z1=Math.min(b.maxZ,z+step);
    if(open.size && clearance.roadAt({x:(x+x1)/2,z:(z+z1)/2},step*0.72,-50,-0.1,undefined,id=>open.has(id)))continue;
    positions.push(x,-0.04,z,x,-0.04,z1,x1,-0.04,z1,x,-0.04,z,x1,-0.04,z1,x1,-0.04,z);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}
