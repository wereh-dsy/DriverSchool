import type { CityMapData, CityPoint } from '../city/CityMapData';
import { polylineLength, roadEdges, roadPoints } from '../city/geometry';
import { roadEdgeChains } from '../city/RoadEdgeChain';

interface PortalCut { outline:CityPoint[];a:CityPoint;b:CityPoint;roof?:number;minX:number;maxX:number;minZ:number;maxZ:number }
/** Portal earthworks must leave the complete road/tunnel volume open. This is
 * mesh clipping at sector construction time, never a vehicle contact query. */
export class RegionalTerrainClearance {
  private readonly cells=new Map<string,PortalCut[]>();
  constructor(map:CityMapData){
    const roads=new Map(map.roads.map(r=>[r.id,r])),portals=new Map<string,Set<'start'|'end'>>();
    for(const link of map.roadLinks??[]){
      const a=roads.get(link.from.roadId)!,b=roads.get(link.to.roadId)!;
      if((a.structure?.enclosure?.kind==='tunnel')===(b.structure?.enclosure?.kind==='tunnel'))continue;
      for(const end of [link.from,link.to]){const list=portals.get(end.roadId)??new Set();list.add(end.end);portals.set(end.roadId,list);}
    }
    const chains=roadEdgeChains(map);
    for(const [id,ends]of portals){const road=roads.get(id)!,path=roadPoints(road),length=polylineLength(path),edges=roadEdges(road),left=chains.edge(road,edges.left-.6),right=chains.edge(road,edges.right+.6);let station=0;
      for(let i=1;i<path.length;i++){
        const before=station;station+=Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z);
        if(!(ends.has('start')&&before<200||ends.has('end')&&length-station<200))continue;
        const outline=[left[i-1]!,right[i-1]!,right[i]!,left[i]!];
        const area=outline.reduce((s,p,k)=>{const q=outline[(k+1)%outline.length]!;return s+p.x*q.z-q.x*p.z;},0);if(area<0)outline.reverse();
        const cut:PortalCut={outline,a:path[i-1]!,b:path[i]!,roof:road.structure?.enclosure?.kind==='tunnel'?road.structure.enclosure.clearance+.65:undefined,minX:Math.min(...outline.map(p=>p.x)),maxX:Math.max(...outline.map(p=>p.x)),minZ:Math.min(...outline.map(p=>p.z)),maxZ:Math.max(...outline.map(p=>p.z))};
        for(let x=Math.floor(cut.minX/100);x<=Math.floor(cut.maxX/100);x++)for(let z=Math.floor(cut.minZ/100);z<=Math.floor(cut.maxZ/100);z++){const key=x+','+z,list=this.cells.get(key)??[];list.push(cut);this.cells.set(key,list);}
      }
    }
  }
  clip(triangle:CityPoint[]):CityPoint[][] {
    const minX=Math.min(...triangle.map(p=>p.x)),maxX=Math.max(...triangle.map(p=>p.x)),minZ=Math.min(...triangle.map(p=>p.z)),maxZ=Math.max(...triangle.map(p=>p.z)),cuts=new Set<PortalCut>();
    for(let x=Math.floor(minX/100);x<=Math.floor(maxX/100);x++)for(let z=Math.floor(minZ/100);z<=Math.floor(maxZ/100);z++)for(const cut of this.cells.get(x+','+z)??[])if(cut.maxX>=minX&&cut.minX<=maxX&&cut.maxZ>=minZ&&cut.minZ<=maxZ)cuts.add(cut);
    let pieces=[triangle];
    const clip=(polygon:CityPoint[],side:(p:CityPoint)=>number,inside:boolean):CityPoint[]=>{const result:CityPoint[]=[];for(let i=0;i<polygon.length;i++){const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,sa=side(a),sb=side(b),ia=inside?sa>=0:sa<=0,ib=inside?sb>=0:sb<=0;if(ia)result.push(a);if(ia!==ib){const t=sa/(sa-sb);result.push({x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t});}}return result;};
    for(const cut of cuts){const dx=cut.b.x-cut.a.x,dz=cut.b.z-cut.a.z,squared=dx*dx+dz*dz;if(squared<1e-8)continue;
      const roadY=(p:CityPoint)=>(cut.a.y??0)+((cut.b.y??0)-(cut.a.y??0))*((p.x-cut.a.x)*dx+(p.z-cut.a.z)*dz)/squared;
      const next:CityPoint[][]=[];
      for(const piece of pieces){let inside=piece;
        if(piece.every(p=>(p.y??0)<=roadY(p)-.04)||cut.roof!==undefined&&piece.every(p=>(p.y??0)>=roadY(p)+cut.roof!)){next.push(piece);continue;}
        for(let i=0;i<cut.outline.length&&inside.length>=3;i++){const a=cut.outline[i]!,b=cut.outline[(i+1)%cut.outline.length]!,side=(p:CityPoint)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x),outside=clip(inside,side,false);if(outside.length>=3)next.push(outside);inside=clip(inside,side,true);}
        if(inside.length>=3){const below=clip(inside,p=>roadY(p)-.04-(p.y??0),true);if(below.length>=3)next.push(below);if(cut.roof!==undefined){const above=clip(inside,p=>(p.y??0)-roadY(p)-cut.roof!,true);if(above.length>=3)next.push(above);}}
      }pieces=next;
    }
    return pieces;
  }
}
