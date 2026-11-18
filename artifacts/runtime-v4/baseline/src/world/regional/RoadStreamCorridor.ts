import type { CityMapData, CityPoint, CityRoad, RoadEndpoint } from '../city/CityMapData';
import { roadEdges, roadPoints } from '../city/geometry';

interface Path { road:CityRoad; points:readonly CityPoint[]; stations:Float64Array }
interface Segment {path:Path;index:number;query:number}
interface Visit { id:string; direction:number; station:number; distance:number }

/** Immutable spatial/topological index, built with existing sector plans.
 * Only nearby road segments and explicit links are queried while driving. */
export class RoadStreamCorridor {
  private readonly paths=new Map<string,Path>();
  private readonly buckets=new Map<string,Segment[]>();
  private query=0;
  private readonly links=new Map<string,RoadEndpoint[]>();
  private readonly latency=new Float64Array(32);
  private latencyCount=0;
  private latencyAt=0;
  preparationSeconds=24;
  constructor(private readonly map:CityMapData) {
    for(const link of map.roadLinks??[]){
      this.connect(link.from,link.to);this.connect(link.to,link.from);
    }
    const roads=new Map(map.roads.map(road=>[road.id,road]));
    for(const junction of map.intersections){
      const ends:RoadEndpoint[]=[];
      for(const connection of junction.connections){
        const road=roads.get(connection.roadId);if(!road)continue;
        const a=road.centerline[0]!,b=road.centerline.at(-1)!;
        ends.push({roadId:road.id,end:Math.hypot(a.x-junction.position.x,a.z-junction.position.z)<=Math.hypot(b.x-junction.position.x,b.z-junction.position.z)?'start':'end'});
      }
      for(const from of ends)for(const to of ends)if(from.roadId!==to.roadId)this.connect(from,to);
    }
  }
  private connect(from:RoadEndpoint,to:RoadEndpoint):void {
    const key=from.roadId+':'+from.end,list=this.links.get(key)??[];
    if(!list.some(end=>end.roadId===to.roadId&&end.end===to.end))list.push(to);
    this.links.set(key,list);
  }
  register(road:CityRoad,points:readonly CityPoint[]):void {
    if(this.paths.has(road.id))return;
    const stations=new Float64Array(points.length),size=this.map.sectorSize;
    const path={road,points,stations};this.paths.set(road.id,path);
    for(let i=1;i<points.length;i++){
      const a=points[i-1]!,b=points[i]!;
      stations[i]=stations[i-1]!+Math.hypot(b.x-a.x,b.z-a.z);
      const segment={path,index:i,query:0};
      for(let x=Math.floor(Math.min(a.x,b.x)/size);x<=Math.floor(Math.max(a.x,b.x)/size);x++)
        for(let z=Math.floor(Math.min(a.z,b.z)/size);z<=Math.floor(Math.max(a.z,b.z)/size);z++){
          const key=x+','+z,bucket=this.buckets.get(key)??[];
          bucket.push(segment);this.buckets.set(key,bucket);
        }
    }
  }
  observePreparation(ms:number):void {
    this.latency[this.latencyAt++%this.latency.length]=Math.max(0,ms);
    this.latencyCount=Math.min(this.latency.length,this.latencyCount+1);
    const sorted=Array.from(this.latency.subarray(0,this.latencyCount)).sort((a,b)=>a-b);
    this.preparationSeconds=Math.min(30,Math.max(2,sorted[Math.ceil(sorted.length*.95)-1]!/1000));
  }
  select(x:number,z:number,yaw:number,speed:number,y?:number) {
    // Standalone authoring APIs retain synchronous preparation. The game
    // registers these paths incrementally as sector plans are built.
    if(!this.paths.size)for(const road of this.map.roads)this.register(road,roadPoints(road));
    const fx=-Math.sin(yaw)*(speed<0?-1:1),fz=-Math.cos(yaw)*(speed<0?-1:1),size=this.map.sectorSize;
    const horizon=Math.min(5000,750+Math.abs(speed)*(Math.max(12,this.preparationSeconds)+12));
    let nearest:Visit|undefined,best=Infinity;
    this.query++;
    for(let bx=Math.floor(x/size)-1;bx<=Math.floor(x/size)+1;bx++)
      for(let bz=Math.floor(z/size)-1;bz<=Math.floor(z/size)+1;bz++)for(const segment of this.buckets.get(bx+','+bz)??[]){
        if(segment.query===this.query)continue;
        segment.query=this.query;
        const path=segment.path,i=segment.index;
        const a=path.points[i-1]!,b=path.points[i]!,dx=b.x-a.x,dz=b.z-a.z,length=path.stations[i]!-path.stations[i-1]!;
        if(length<.01)continue;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(length*length)));
        const height=(a.y??0)+((b.y??0)-(a.y??0))*t,alignment=(dx*fx+dz*fz)/length;
        const score=Math.hypot(a.x+dx*t-x,a.z+dz*t-z)+Math.abs(y===undefined?0:height-y)*5+(1-Math.abs(alignment))*20;
        if(score<best){best=score;nearest={id:path.road.id,direction:alignment>=0?1:-1,station:path.stations[i-1]!+t*length,distance:0};}
      }
    const sectors=new Map<string,number>(),roadIds=new Set<string>();
    if(!nearest)return{sectors,roadIds,horizon,preparationSeconds:this.preparationSeconds};
    const queue:Visit[]=[nearest,{...nearest,direction:-nearest.direction,distance:horizon-Math.max(300,Math.abs(speed)*(this.preparationSeconds+2)*.4)}];
    const visited=new Set<string>();
    let visits=0;
    while(queue.length&&visits++<64){
      queue.sort((a,b)=>a.distance-b.distance);
      const visit=queue.shift()!,path=this.paths.get(visit.id),token=visit.id+':'+visit.direction;
      if(!path||visited.has(token)||visit.distance>horizon)continue;
      visited.add(token);roadIds.add(visit.id);
      const end=visit.direction>0?path.stations.at(-1)!:0;
      const available=Math.min(Math.abs(end-visit.station),horizon-visit.distance);
      const minimum=visit.direction>0?visit.station:visit.station-available,maximum=visit.direction>0?visit.station+available:visit.station;
      let loIndex=1,hiIndex=path.stations.length-1;
      while(loIndex<hiIndex){const mid=(loIndex+hiIndex)>>>1;if(path.stations[mid]!<minimum)loIndex=mid+1;else hiIndex=mid;}
      for(let i=loIndex;i<path.points.length&&path.stations[i-1]!<=maximum;i++){
        const lo=path.stations[i-1]!,hi=path.stations[i]!;
        const from=Math.max(lo,visit.direction>0?visit.station:visit.station-available);
        const to=Math.min(hi,visit.direction>0?visit.station+available:visit.station);
        if(to<from||hi-lo<.01)continue;
        const a=path.points[i-1]!,b=path.points[i]!;
        for(let station=from;station<=to+size/4;station+=size/4){
          const d=Math.min(station,to),t=(d-lo)/(hi-lo),px=a.x+(b.x-a.x)*t,pz=a.z+(b.z-a.z)*t;
          const distance=visit.distance+Math.abs(d-visit.station);
          const edges=roadEdges(path.road),margin=Math.max(-edges.left,edges.right)+12;
          for(let sx=Math.floor((px-margin)/size);sx<=Math.floor((px+margin)/size);sx++)
            for(let sz=Math.floor((pz-margin)/size);sz<=Math.floor((pz+margin)/size);sz++){
              const key=sx+','+sz;sectors.set(key,Math.min(sectors.get(key)??Infinity,distance));
            }
          if(d===to)break;
        }
      }
      if(available+1e-6<Math.abs(end-visit.station))continue;
      for(const target of this.links.get(visit.id+':'+(visit.direction>0?'end':'start'))??[]){
        const next=this.paths.get(target.roadId);if(!next)continue;
        const outgoing=visit.direction>0?path.points.at(-1)!:path.points[0]!,previous=visit.direction>0?path.points.at(-2)!:path.points[1]!;
        const entrance=target.end==='start'?next.points[0]!:next.points.at(-1)!,ahead=target.end==='start'?next.points[1]!:next.points.at(-2)!;
        const ax=outgoing.x-previous.x,az=outgoing.z-previous.z,bx=ahead.x-entrance.x,bz=ahead.z-entrance.z;
        const alignment=(ax*bx+az*bz)/Math.max(.01,Math.hypot(ax,az)*Math.hypot(bx,bz));
        queue.push({id:target.roadId,direction:target.end==='start'?1:-1,station:target.end==='start'?0:next.stations.at(-1)!,distance:visit.distance+available+30+(1-alignment)*150});
      }
    }
    return{sectors,roadIds,horizon,preparationSeconds:this.preparationSeconds};
  }
}
