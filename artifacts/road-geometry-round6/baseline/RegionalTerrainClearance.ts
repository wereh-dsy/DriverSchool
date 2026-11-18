import type { CityMapData, CityPoint } from '../city/CityMapData';
import { polylineLength, roadEdges, roadPoints,rotatePoint } from '../city/geometry';
import { roadEdgeChains } from '../city/RoadEdgeChain';
import type { RoadGeometryTrialSelection } from '../city/RoadGeometryTrial';
import {junctionPavementGeometry} from '../city/JunctionSurface';

interface PortalCut { outline:CityPoint[];a:CityPoint;b:CityPoint;roof?:number;heightAt?:(p:CityPoint)=>number;selected?:boolean;floor?:number;minX:number;maxX:number;minZ:number;maxZ:number }
/** Portal earthworks must leave the complete road/tunnel volume open. This is
 * mesh clipping at sector construction time, never a vehicle contact query. */
export class RegionalTerrainClearance {
  private readonly cells=new Map<string,PortalCut[]>();
  private readonly mapCityAreas:CityMapData['bounds'][];
  private readonly landforms:CityMapData['environment']['landforms'];
  readonly statistics={selectedPlanes:0,skippedBelowPavement:0,coveredByRegionalEarthworks:0};
  constructor(map:CityMapData,selection?:RoadGeometryTrialSelection){
    this.mapCityAreas=map.regional?[map.regional.cityBounds,...map.regional.cityExtensions??[]]:[map.bounds];this.landforms=map.environment.landforms;
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
    // The opt-in reuses portal volume clipping for city terrain too. Only the
    // selected authored footprint is excavated; tunnel cover above the roof is
    // retained. This never changes terrain/support sampling or colliders.
    for(const id of selection?.roadIds??map.roads.map(r=>r.id)){
      const road=roads.get(id);if(!road)continue;
      const centre=chains.edge(road,0),edges=roadEdges(road),enclosure=road.structure?.enclosure,walk=road.sidewalk?.enabled?road.sidewalk.width:0,half=road.laneCount*road.laneWidth/2;
      const outside=(side:number)=>{if(!enclosure)return chains.edge(road,side<0?Math.min(edges.left,-half-walk):Math.max(edges.right,half+walk));const edge=chains.barrierEdge(road,side),unit=chains.edge(road,side);return edge.map((p,i)=>({x:p.x+(unit[i]!.x-centre[i]!.x)*.3,y:p.y,z:p.z+(unit[i]!.z-centre[i]!.z)*.3}));};
      const left=outside(-1),right=outside(1);
      const roof=enclosure&&enclosure.kind!=='cutting'?enclosure.clearance+.65:undefined;
      // Open regional roads already have a 25m margin of lower terrain in the
      // shared earthwork sampler. Reuse it; don't index that same excavation twice.
      const regionalOpen=road.id.startsWith('regional:')&&road.corridorSection!=='TUNNEL'&&(!enclosure||enclosure.kind==='cutting');
      for(let i=1;i<centre.length;i++){this.insertPlane(left[i-1]!,right[i-1]!,left[i]!,roof,regionalOpen);this.insertPlane(right[i-1]!,right[i]!,left[i]!,roof,regionalOpen);}
    }
    for(const id of selection?.intersectionIds??map.intersections.map(j=>j.id)){
      const j=map.intersections.find(j=>j.id===id);if(!j?.pavementFootprint)continue;
      const surface=junctionPavementGeometry(j,map),p=surface.getAttribute('position');
      for(let i=0;i<p.count;i+=3){const triangle=[0,1,2].map(k=>{const q=rotatePoint({x:p.getX(i+k),z:p.getZ(i+k)},j.rotation);return {x:j.position.x+q.x,y:(j.position.y??0)+p.getY(i+k)-.024,z:j.position.z+q.z};});this.insertPlane(triangle[0]!,triangle[1]!,triangle[2]!);}
      surface.dispose();
    }
  }
  private insertPlane(a:CityPoint,b:CityPoint,c:CityPoint,roof?:number,regionalOpen=false):void{
    // Most city asphalt already sits above flat terrain. A conservative landform
    // bound avoids retaining an index plane for every harmless road triangle.
    const minX=Math.min(a.x,b.x,c.x),maxX=Math.max(a.x,b.x,c.x),minZ=Math.min(a.z,b.z,c.z),maxZ=Math.max(a.z,b.z,c.z),areas=this.mapCityAreas;
    if(regionalOpen&&!areas.some(area=>maxX>=area.minX&&minX<=area.maxX&&maxZ>=area.minZ&&minZ<=area.maxZ)){this.statistics.coveredByRegionalEarthworks++;return;}
    if(areas.some(area=>minX>=area.minX&&maxX<=area.maxX&&minZ>=area.minZ&&maxZ<=area.maxZ)){
      let upper=-.04;for(const form of this.landforms??[]){if(form.height<=0)continue;const x=Math.max(minX,Math.min(maxX,form.center.x)),z=Math.max(minZ,Math.min(maxZ,form.center.z)),q=((x-form.center.x)/form.radiusX)**2+((z-form.center.z)/form.radiusZ)**2;if(q<1)upper+=form.height*(1-q)**2;}
      if(upper<=Math.min(a.y??0,b.y??0,c.y??0)+.02){this.statistics.skippedBelowPavement++;return;}
    }
    const den=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(den)<1e-8)return;
    const gx=(((b.y??0)-(a.y??0))*(c.z-a.z)-((c.y??0)-(a.y??0))*(b.z-a.z))/den,gz=((b.x-a.x)*((c.y??0)-(a.y??0))-(c.x-a.x)*((b.y??0)-(a.y??0)))/den;
    this.insert([a,b,c],a,b,roof,p=>(a.y??0)+gx*(p.x-a.x)+gz*(p.z-a.z));
  }
  private insert(outline:CityPoint[],a:CityPoint,b:CityPoint,roof?:number,heightAt?:(p:CityPoint)=>number):void{
    const area=outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length]!;return sum+p.x*q.z-q.x*p.z;},0);if(Math.abs(area)<1e-8)return;if(area<0)outline.reverse();
    // Leave terrain already below the visible pavement alone; excavating that
    // hidden surface would only add triangles. Four mm of separation remains.
    const cut:PortalCut={outline,a,b,roof,heightAt,selected:true,floor:.02,minX:Math.min(...outline.map(p=>p.x)),maxX:Math.max(...outline.map(p=>p.x)),minZ:Math.min(...outline.map(p=>p.z)),maxZ:Math.max(...outline.map(p=>p.z))};
    this.statistics.selectedPlanes++;
    for(let x=Math.floor(cut.minX/100);x<=Math.floor(cut.maxX/100);x++)for(let z=Math.floor(cut.minZ/100);z<=Math.floor(cut.maxZ/100);z++){const key=x+','+z,list=this.cells.get(key)??[];list.push(cut);this.cells.set(key,list);}
  }
  clip(triangle:CityPoint[],selectedOnly=false):CityPoint[][] {
    const minX=Math.min(...triangle.map(p=>p.x)),maxX=Math.max(...triangle.map(p=>p.x)),minZ=Math.min(...triangle.map(p=>p.z)),maxZ=Math.max(...triangle.map(p=>p.z)),cuts=new Set<PortalCut>();
    for(let x=Math.floor(minX/100);x<=Math.floor(maxX/100);x++)for(let z=Math.floor(minZ/100);z<=Math.floor(maxZ/100);z++)for(const cut of this.cells.get(x+','+z)??[])if(cut.maxX>=minX&&cut.minX<=maxX&&cut.maxZ>=minZ&&cut.minZ<=maxZ)cuts.add(cut);
    // Boundary-only pieces otherwise survive every >= / <= clip and multiply
    // exponentially where many road triangles share the same terrain edge.
    const hasArea=(polygon:CityPoint[])=>{if(polygon.length<3)return false;const a=polygon[0]!;let area=0;for(let i=1;i+1<polygon.length;i++){const b=polygon[i]!,c=polygon[i+1]!;area+=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);}return Math.abs(area)>1e-8;};
    let pieces=hasArea(triangle)?[triangle]:[];
    const clip=(polygon:CityPoint[],side:(p:CityPoint)=>number,inside:boolean):CityPoint[]=>{const result:CityPoint[]=[];for(let i=0;i<polygon.length;i++){const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,sa=side(a),sb=side(b),ia=inside?sa>=0:sa<=0,ib=inside?sb>=0:sb<=0;if(ia)result.push(a);if(ia!==ib){const t=sa/(sa-sb);result.push({x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t});}}return hasArea(result)?result:[];};
    for(const cut of cuts){if(selectedOnly&&!cut.selected)continue;const dx=cut.b.x-cut.a.x,dz=cut.b.z-cut.a.z,squared=dx*dx+dz*dz;if(squared<1e-8)continue;
      const roadY=cut.heightAt??((p:CityPoint)=>(cut.a.y??0)+((cut.b.y??0)-(cut.a.y??0))*((p.x-cut.a.x)*dx+(p.z-cut.a.z)*dz)/squared);
      const floor=cut.floor??-.04;
      const next:CityPoint[][]=[];
      for(const piece of pieces){let inside=piece;
        // Re-query each fragment's bounds. Splitting a distant fragment by a
        // cut's infinite edge planes adds work without removing any terrain.
        if(piece.every(p=>p.x<cut.minX)||piece.every(p=>p.x>cut.maxX)||piece.every(p=>p.z<cut.minZ)||piece.every(p=>p.z>cut.maxZ)){next.push(piece);continue;}
        if(piece.every(p=>(p.y??0)<=roadY(p)+floor)||cut.roof!==undefined&&piece.every(p=>(p.y??0)>=roadY(p)+cut.roof!)){next.push(piece);continue;}
        for(let i=0;i<cut.outline.length&&inside.length>=3;i++){const a=cut.outline[i]!,b=cut.outline[(i+1)%cut.outline.length]!,side=(p:CityPoint)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x),outside=clip(inside,side,false);if(outside.length>=3)next.push(outside);inside=clip(inside,side,true);}
        if(inside.length>=3){const below=clip(inside,p=>roadY(p)+floor-(p.y??0),true);if(below.length>=3)next.push(below);if(cut.roof!==undefined){const above=clip(inside,p=>(p.y??0)-roadY(p)-cut.roof!,true);if(above.length>=3)next.push(above);}}
      }pieces=next;
    }
    return pieces;
  }
}
