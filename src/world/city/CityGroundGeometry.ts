import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { CityMapData } from './CityMapData';
import { roadEdgeChains } from './RoadEdgeChain';
import type { CityPoint } from './CityMapData';
import {cityTerrainOffsetAt} from './CityTerrain';

/** Default support plane; optional authored landforms add local relief. */
export const CITY_GROUND_HEIGHT = -0.04;
export const cityGroundHeightAt = (_x:number,_z:number):number => CITY_GROUND_HEIGHT;

/** A single batched ground surface with openings for authored open cuts.
 * Roofed bores retain their ground cover. No terrain/streaming subsystem. */
export function cityGroundGeometry(map: CityMapData, bounds = map.bounds): BufferGeometry {
  const hasArea=(polygon:CityPoint[])=>polygon.length>=3&&Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length]!;return sum+p.x*q.z-q.x*p.z;},0))>1e-6;
  const open=map.roads.filter(r=>r.structure?.enclosure?.kind==='cutting'),chains=roadEdgeChains(map);
  const cells=new Map<string,CityPoint[][]>();
  // The opening follows the same edges as the retaining walls. Only the
  // negative-height portion is excavated; elevated portions retain their ground.
  for(const road of open){
    const left=chains.barrierEdge(road,-1),right=chains.barrierEdge(road,1);
    for(let i=1;i<left.length;i++){
      const a=left[i-1]!,c=left[i]!,d=right[i]!,e=right[i-1]!;
      let polygon=[a,c,d,e];const below:CityPoint[]=[];
      for(let k=0;k<polygon.length;k++){
        const p=polygon[k]!,q=polygon[(k+1)%polygon.length]!,pin=(p.y??0)<-.1,qin=(q.y??0)<-.1;
        if(pin)below.push(p);if(pin!==qin){const t=(-.1-(p.y??0))/((q.y??0)-(p.y??0));below.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
      }polygon=below;if(polygon.length<3)continue;
      const area=polygon.reduce((s,p,k)=>{const q=polygon[(k+1)%polygon.length]!;return s+p.x*q.z-q.x*p.z;},0);
      if(Math.abs(area)<1e-8)continue;if(area<0)polygon.reverse();
      for(let x=Math.floor(Math.min(...polygon.map(p=>p.x))/20);x<=Math.floor(Math.max(...polygon.map(p=>p.x))/20);x++)for(let z=Math.floor(Math.min(...polygon.map(p=>p.z))/20);z<=Math.floor(Math.max(...polygon.map(p=>p.z))/20);z++){
        const key=x+','+z,bucket=cells.get(key)??[];bucket.push(polygon);cells.set(key,bucket);
      }
    }
  }
  const positions:number[]=[],b=bounds;
  const step=open.length||map.environment.landforms?.length?20:Math.max(b.maxX-b.minX,b.maxZ-b.minZ);
  for(let x=b.minX;x<b.maxX;x+=step)for(let z=b.minZ;z<b.maxZ;z+=step) {
    const x1=Math.min(b.maxX,x+step),z1=Math.min(b.maxZ,z+step);
    let pieces:CityPoint[][]=[[{x,z},{x:x1,z},{x:x1,z:z1},{x,z:z1}]];
    const masks=new Set<CityPoint[]>();
    for(let cx=Math.floor(x/20);cx<=Math.floor(x1/20);cx++)for(let cz=Math.floor(z/20);cz<=Math.floor(z1/20);cz++)for(const mask of cells.get(cx+','+cz)??[])masks.add(mask);
    for(const mask of masks){const next:CityPoint[][]=[];
      for(const piece of pieces){let inside=piece;
        for(let k=0;k<mask.length&&inside.length>=3;k++){
          const a=mask[k]!,c=mask[(k+1)%mask.length]!,side=(p:CityPoint)=>(c.x-a.x)*(p.z-a.z)-(c.z-a.z)*(p.x-a.x);
          const cut=(keepInside:boolean)=>{const result:CityPoint[]=[];for(let n=0;n<inside.length;n++){const p=inside[n]!,q=inside[(n+1)%inside.length]!,sp=side(p),sq=side(q),pin=keepInside?sp>=0:sp<=0,qin=keepInside?sq>=0:sq<=0;if(pin)result.push(p);if(pin!==qin){const t=sp/(sp-sq);result.push({x:p.x+t*(q.x-p.x),z:p.z+t*(q.z-p.z)});}}return result;};
          const outside=cut(false);if(hasArea(outside))next.push(outside);inside=cut(true);if(!hasArea(inside))break;
        }
      }pieces=next;
    }
    for(const piece of pieces)for(let k=1;k+1<piece.length;k++)for(const p of [piece[0]!,piece[k+1]!,piece[k]!])positions.push(p.x,CITY_GROUND_HEIGHT+cityTerrainOffsetAt(map.environment.landforms,p.x,p.z),p.z);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}
