import type {CityMapData,CityPoint,CityRoad} from '../CityMapData';
import {roadPoints,roadEdges,sampleAt} from '../geometry';
import {cityV4LockedRoad} from './CityMainV4Recipe';
import {cityGroundHeightAt} from '../CityGroundGeometry';
import {buildCityRoadNetwork} from '../CityRoadNetwork';
import {junctionSurfaceContains} from '../JunctionSurface';

// Logical road contact lies 16 mm above the existing terrain. RoadBuilder's
// existing 24 mm asphalt offset makes the visible pavement 40 mm above terrain.
export const CITY_GROUND_ROAD_OFFSET=.016;
const deckSeparation=6.4,maxGrade=.1;
export const cityElevationProtectedRoad=(r:CityRoad)=>cityV4LockedRoad(r)||r.type==='highway'||r.type==='ramp_1'||!!r.structure?.enclosure||r.elevationMode==='elevated'||r.centerline.some(p=>(p.y??0)<-.25)||r.id.startsWith('urban-direct-');
interface Path {road:CityRoad;points:CityPoint[];stations:number[];minX:number;maxX:number;minZ:number;maxZ:number}
export interface UrbanElevationCrossing {a:string;b:string;da:number;db:number;sinAngle:number;oldA:number;oldB:number}
function paths(map:CityMapData):Path[]{return map.roads.map(road=>{const points=roadPoints(road),stations=[0];for(let i=1;i<points.length;i++)stations.push(stations.at(-1)!+Math.hypot(points[i]!.x-points[i-1]!.x,points[i]!.z-points[i-1]!.z));return{road,points,stations,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};});}
/** XZ crossings without a logical connection. No road or junction is created. */
export function cityUrbanElevationCrossings(map:CityMapData):UrbanElevationCrossing[]{
 const all=paths(map),nodes=buildCityRoadNetwork(map).endpointNodes.filter(n=>n.ends.length>1),out:UrbanElevationCrossing[]=[];
 for(let ai=0;ai<all.length;ai++)for(let bi=ai+1;bi<all.length;bi++){
  const aa=all[ai]!,bb=all[bi]!;if(cityElevationProtectedRoad(aa.road)&&cityElevationProtectedRoad(bb.road))continue;
  if(aa.maxX<bb.minX||bb.maxX<aa.minX||aa.maxZ<bb.minZ||bb.maxZ<aa.minZ)continue;
  const joined=nodes.filter(n=>n.ends.some(e=>e.roadId===aa.road.id)&&n.ends.some(e=>e.roadId===bb.road.id)),junctions=map.intersections.filter(j=>j.connections.some(c=>c.roadId===aa.road.id)&&j.connections.some(c=>c.roadId===bb.road.id));
  for(let i=1;i<aa.points.length;i++)for(let k=1;k<bb.points.length;k++){
   const a=aa.points[i-1]!,b=aa.points[i]!,c=bb.points[k-1]!,d=bb.points[k]!;
   if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z))continue;
   const ax=b.x-a.x,az=b.z-a.z,bx=d.x-c.x,bz=d.z-c.z,den=ax*bz-az*bx;if(Math.abs(den)<1e-7)continue;
   const t=((c.x-a.x)*bz-(c.z-a.z)*bx)/den,u=((c.x-a.x)*az-(c.z-a.z)*ax)/den;if(t<-1e-6||t>1+1e-6||u<-1e-6||u>1+1e-6)continue;
   const p={x:a.x+t*ax,z:a.z+t*az};
   if(joined.some(n=>Math.hypot(p.x-n.position.x,p.z-n.position.z)<180)||junctions.some(j=>junctionSurfaceContains(j,map,p,1)))continue;
   const da=aa.stations[i-1]!+t*Math.hypot(ax,az),db=bb.stations[k-1]!+u*Math.hypot(bx,bz);
   if(out.some(q=>q.a===aa.road.id&&q.b===bb.road.id&&Math.abs(q.da-da)<.1))continue;
   out.push({a:aa.road.id,b:bb.road.id,da,db,sinAngle:Math.abs(den)/(Math.hypot(ax,az)*Math.hypot(bx,bz)),oldA:(a.y??0)+t*((b.y??0)-(a.y??0)),oldB:(c.y??0)+u*((d.y??0)-(c.y??0))});
  }
 }return out;
}

/** Repairs only the vertical coordinates of the completed V5 ordinary network.
 * Ground is the default. Only actual unconnected crossings demand a local deck;
 * its transitions propagate along the road, never through a regional height field. */
export function repairCityMainGroundElevation(map:CityMapData){
 const all=paths(map),byId=new Map(all.map(p=>[p.road.id,p])),ordinary=all.filter(p=>!cityElevationProtectedRoad(p.road)),crossings=cityUrbanElevationCrossings(map);
 const ground=cityGroundHeightAt(0,0)+CITY_GROUND_ROAD_OFFSET;
 interface Node {y:number;fixed?:number;edges:{to:number;distance:number}[];label:string}
 const graph:Node[]=[],roadNodes=new Map<string,number[]>(),junctionNodes=new Map<string,number>();
 const node=(label:string,fixed?:number)=>{graph.push({y:fixed??ground,fixed,edges:[],label});return graph.length-1;};
 const link=(a:number,b:number,distance:number)=>{graph[a]!.edges.push({to:b,distance});graph[b]!.edges.push({to:a,distance});};
 for(const p of ordinary){const ids=p.points.map((_,i)=>node(p.road.id+':'+i));roadNodes.set(p.road.id,ids);for(let i=1;i<ids.length;i++)link(ids[i-1]!,ids[i]!,p.stations[i]!-p.stations[i-1]!);}
 for(const j of map.intersections){
  if(!j.connections.some(c=>roadNodes.has(c.roadId)))continue;
  const fixed=j.connections.some(c=>cityElevationProtectedRoad(byId.get(c.roadId)!.road))?j.position.y??0:undefined,id=node(j.id,fixed);junctionNodes.set(j.id,id);
  for(const c of j.connections){const ids=roadNodes.get(c.roadId);if(!ids)continue;link(id,ids[c.end==='start'?0:ids.length-1]!,0);
   // A shared footprint is one flat landing, including extended skewed mouths.
   const p=byId.get(c.roadId)!;for(let i=0;i<ids.length;i++)if(junctionSurfaceContains(j,map,p.points[i]!,1e-5))link(id,ids[i]!,0);
  }
 }
 for(const l of map.roadLinks??[]){const a=roadNodes.get(l.from.roadId),b=roadNodes.get(l.to.roadId),end=(ids:number[],e:'start'|'end')=>ids[e==='start'?0:ids.length-1]!;
  if(a&&b)link(end(a,l.from.end),end(b,l.to.end),0);
  else if(a||b){const moving=a?l.from:l.to,fixed=a?l.to:l.from,p=byId.get(fixed.roadId)!.points,y=p[fixed.end==='start'?0:p.length-1]!.y??0;link(end((a??b)!,moving.end),node('fixed:'+fixed.roadId,y),0);}
 }
 // Maximum-first propagation gives the smallest profile satisfying each local
 // deck constraint and a bounded continuous gradient. Fixed infrastructure never moves.
 const heap:{id:number;y:number}[]=[];
 const push=(id:number,y:number)=>{let i=heap.length;heap.push({id,y});while(i){const p=(i-1)>>1;if(heap[p]!.y>=y)break;heap[i]=heap[p]!;i=p;}heap[i]={id,y};};
 const pop=()=>{const top=heap[0]!,last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1]!.y>heap[c]!.y)c++;if(heap[c]!.y<=last.y)break;heap[i]=heap[c]!;i=c;}heap[i]=last;}return top;};
 const raise=(id:number,y:number)=>{const n=graph[id]!;if(n.fixed!==undefined){if(y>n.fixed+.001)throw new Error('Ground elevation: local bridge cannot reach fixed landing '+n.label+' required '+y.toFixed(3));return;}if(y>n.y+1e-8){n.y=y;push(id,y);}};
 const propagate=()=>{while(heap.length){const a=pop();if(a.y<graph[a.id]!.y-1e-8)continue;for(const e of graph[a.id]!.edges)raise(e.to,a.y-maxGrade*e.distance);}};
 for(let i=0;i<graph.length;i++)if(graph[i]!.fixed!==undefined)push(i,graph[i]!.y);propagate();
 const heightAt=(id:string,d:number)=>{const p=byId.get(id)!,ids=roadNodes.get(id);if(!ids)return sampleAt(p.points,d).point.y??0;for(let i=1;i<ids.length;i++)if(d<=p.stations[i]!||i===ids.length-1){const t=Math.max(0,Math.min(1,(d-p.stations[i-1]!)/(p.stations[i]!-p.stations[i-1]!)));return graph[ids[i-1]!]!.y+t*(graph[ids[i]!]!.y-graph[ids[i-1]!]!.y);}return graph[ids[0]!]!.y;};
 const decks=new Set<string>();
 const deck=(id:string,d:number,y:number,width:number)=>{const p=byId.get(id)!,ids=roadNodes.get(id)!;decks.add(id);for(let i=0;i<ids.length;i++)if(Math.abs(p.stations[i]!-d)<=width+7)raise(ids[i]!,y);};
 for(let pass=0;pass<25;pass++){
  let changes=0;
  for(const c of crossings){const ay=heightAt(c.a,c.da),by=heightAt(c.b,c.db);if(Math.abs(ay-by)>=deckSeparation-.001)continue;
   const ma=roadNodes.has(c.a),mb=roadNodes.has(c.b),upper=ma&&!mb?c.a:mb&&!ma?c.b:c.oldA>=c.oldB?c.a:c.b,lower=upper===c.a?c.b:c.a,d=upper===c.a?c.da:c.db,y=upper===c.a?by:ay;
   const width=(roadEdges(byId.get(lower)!.road).width/2+2)/Math.max(.2,c.sinAngle);
   deck(upper,d,y+deckSeparation,width);changes++;
  }propagate();if(!changes)break;if(pass===24)throw new Error('Ground elevation: crossing constraints did not converge');
 }
 let changedRoads=0,groundRoads=0,transitions=0;
 for(const p of ordinary){const ids=roadNodes.get(p.road.id)!;const values=ids.map(id=>graph[id]!.y);if(values.some((y,i)=>Math.abs(y-(p.points[i]!.y??0))>1e-7))changedRoads++;
  p.road.centerline.forEach((q,i)=>q.y=values[i]);
  const flat=values.every(y=>Math.abs(y-values[0]!)<1e-7)&&Math.abs(values[0]!-ground)<.051;
  p.road.elevationMode=flat?'ground':'custom';if(flat){p.road.elevation=values[0]!;groundRoads++;}else{delete p.road.elevation;transitions++;}
 }
 for(const j of map.intersections){const id=junctionNodes.get(j.id);if(id===undefined)continue;j.position.y=graph[id]!.y;for(const c of j.connections)(j.pavementHeights??={})[c.port]=j.position.y;
  for(const p of j.pavementFootprint??[])p.y=0;if(j.markingFootprint?.kind==='polygon')for(const p of j.markingFootprint.points)p.y=0;
 }
 for(const port of map.connectionPorts??[]){const p=byId.get(port.endpoint.roadId);if(port.position&&p&&roadNodes.has(p.road.id))port.position.y=p.road.centerline[port.endpoint.end==='start'?0:p.road.centerline.length-1]!.y;}
 const report={ordinaryRoads:ordinary.length,changedRoads,groundRoads,localBridgeOrTransitionRoads:transitions,localDeckRoads:decks.size,crossingsChecked:crossings.length,protectedRoads:all.length-ordinary.length,terrainY:cityGroundHeightAt(0,0),groundContactY:ground,visibleGroundPavementOffset:.04,maxTransitionGrade:maxGrade};
 map.environment.metadata={...map.environment.metadata,groundElevationVersion:'1',groundElevationRepair:JSON.stringify(report)};return report;
}
