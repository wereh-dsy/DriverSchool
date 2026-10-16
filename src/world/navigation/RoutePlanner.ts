import type { RoadNetworkData, RoadPoint, RoadSegmentData, RoadRoutingConnection } from './RoadNetwork';

export interface RouteLocation {
  readonly roadId: string; readonly along: number; readonly point: RoadPoint;
  readonly label: string; readonly direction?: 'forward' | 'reverse';
  /** Authored junction access from a vehicle inside pavement to a legal outgoing road. */
  readonly access?: readonly RoadPoint[];
}
export interface NavigationPose { x: number; y: number; z: number; yaw: number }
export interface RouteSection {
  readonly road: RoadSegmentData; readonly forward: boolean;
  readonly from: number; readonly to: number; readonly startDistance: number;
  readonly distance: number; readonly seconds: number; readonly points: readonly RoadPoint[];
  readonly connector?: readonly RoadPoint[];
}
export interface RouteManeuver { readonly distance: number; readonly text: string; readonly symbol: string; readonly roadName: string }
export interface PlannedRoute {
  readonly start: RouteLocation; readonly destination: RouteLocation;
  readonly sections: readonly RouteSection[]; readonly points: readonly RoadPoint[];
  readonly distance: number; readonly seconds: number; readonly maneuvers: readonly RouteManeuver[];
}
interface Arc { id: string; road: RoadSegmentData; forward: boolean; length: number; next: { arc: Arc; via?: RoadPoint }[] }
export interface RoadMatch { location: RouteLocation; distance: number; heightDifference: number; heading: number; score: number }
const length = (a: RoadPoint, b: RoadPoint) => Math.hypot(b.x-a.x, b.z-a.z);
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
export const roadLabel = (road: RoadSegmentData): string => [road.routeNumber, road.name].filter(Boolean).join(' · ') || (road.roadType === 'ramp' ? '连接匝道' : '未命名道路');
export const navigationDistance = (metres: number): string => metres >= 1000 ? `${(metres/1000).toFixed(1)} km` : `${Math.max(0, Math.round(metres/10)*10)} m`;
export const navigationTime = (seconds: number): string => `${Math.max(1, Math.ceil(seconds/60))} 分钟`;

/** Indexed authored roads and directed endpoint transitions. No DOM or simulation dependencies. */
export class RoutePlanner {
  private readonly roads = new Map<string, RoadSegmentData>();
  private readonly distances = new Map<string, number[]>();
  private readonly arcs = new Map<string, Arc>();
  private readonly cells = new Map<string, Set<RoadSegmentData>>();
  private maximumSpeed = 1;
  public constructor(public readonly network: RoadNetworkData) {
    for (const road of network.segments) {
      this.roads.set(road.id, road);
      const distances = [0];
      for (let i=1;i<road.centerline.length;i++) {
        const a=road.centerline[i-1]!, b=road.centerline[i]!;
        distances.push(distances.at(-1)!+length(a,b));
        for (let x=Math.floor(Math.min(a.x,b.x)/256);x<=Math.floor(Math.max(a.x,b.x)/256);x++)
          for(let z=Math.floor(Math.min(a.z,b.z)/256);z<=Math.floor(Math.max(a.z,b.z)/256);z++) {
            const key=`${x},${z}`, cell=this.cells.get(key)??new Set<RoadSegmentData>(); cell.add(road);this.cells.set(key,cell);
          }
      }
      this.distances.set(road.id, distances);
      const total=distances.at(-1)!; if(total<.01)continue;
      for(const forward of [true,false]) if(road.travelDirection==='two-way'||(road.travelDirection==='forward')===forward) {
        const id=this.arcId(road.id,forward);this.arcs.set(id,{id,road,forward,length:total,next:[]});
      }
      this.maximumSpeed=Math.max(this.maximumSpeed,this.speed(road));
    }
    for(const c of network.routing?.connections??[])this.connect(c);
  }
  private arcId(id:string,forward:boolean):string{return `${id}|${forward?'f':'r'}`;}
  private speed(road:RoadSegmentData):number {return Math.max(5,(road.speedLimit??40)*.8)/3.6;}
  private connect(c:RoadRoutingConnection):void {
    const from=this.arcs.get(this.arcId(c.fromRoadId,c.fromEnd==='end')), to=this.arcs.get(this.arcId(c.toRoadId,c.toEnd==='start'));
    if(from&&to&&from.road.id!==to.road.id&&!from.next.some(n=>n.arc===to))from.next.push({arc:to,via:c.via});
  }
  public pointAt(roadId:string,along:number):RoadPoint {
    const road=this.roads.get(roadId)!, ds=this.distances.get(roadId)!;
    const s=Math.max(0,Math.min(ds.at(-1)!,along));
    for(let i=1;i<ds.length;i++)if(s<=ds[i]!) {
      const a=road.centerline[i-1]!,b=road.centerline[i]!,t=(s-ds[i-1]!)/(ds[i]!-ds[i-1]!||1);
      return {x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t};
    }
    return road.centerline.at(-1)!;
  }
  public road(id:string):RoadSegmentData|undefined{return this.roads.get(id);}
  public matches(x:number,z:number,radius=35,pose?:NavigationPose):RoadMatch[] {
    const roads=new Set<RoadSegmentData>();
    for(let cx=Math.floor((x-radius)/256);cx<=Math.floor((x+radius)/256);cx++)for(let cz=Math.floor((z-radius)/256);cz<=Math.floor((z+radius)/256);cz++)this.cells.get(`${cx},${cz}`)?.forEach(r=>roads.add(r));
    const result:RoadMatch[]=[];
    for(const road of roads) {
      let best:RoadMatch|undefined;
      const ds=this.distances.get(road.id)!;
      for(let i=1;i<road.centerline.length;i++) {
        const a=road.centerline[i-1]!,b=road.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z, len=length(a,b);if(len<.001)continue;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(len*len)));
        const point={x:a.x+dx*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+dz*t},distance=Math.hypot(x-point.x,z-point.z);
        if(distance>radius)continue;
        const heading=Math.atan2(-dx,-dz), heightDifference=pose?Math.abs(pose.y-point.y):0;
        let forward=true;
        if(road.travelDirection==='reverse')forward=false;
        else if(road.travelDirection==='two-way'&&pose)forward=Math.abs(angleDifference(pose.yaw,heading))<=Math.PI/2;
        const difference=pose?Math.abs(angleDifference(pose.yaw,heading+(forward?0:Math.PI))):0;
        const score=Math.max(0,distance-road.width/2)+heightDifference*12+difference*8;
        const match:RoadMatch={location:{roadId:road.id,along:ds[i-1]!+len*t,point,label:roadLabel(road),direction:pose?(forward?'forward':'reverse'):undefined},distance,heightDifference,heading:heading+(forward?0:Math.PI),score};
        if(!best||match.score<best.score)best=match;
      }
      if(best)result.push(best);
    }
    return result.sort((a,b)=>a.score-b.score);
  }
  public locate(pose:NavigationPose):RouteLocation|null {
    const match=this.matches(pose.x,pose.z,45,pose).find(m=>m.heightDifference<2.5);
    if(match&&match.distance<=Math.max(12,this.roads.get(match.location.roadId)!.width/2+5))return match.location;
    const junction=this.network.intersections.find(j=>Math.abs(pose.x-j.center.x)<=j.halfExtentX&&Math.abs(pose.z-j.center.z)<=j.halfExtentZ&&Math.abs(pose.y-(j.center.y??0))<2.5&&(!j.pavementFootprint||insidePolygon(pose,j.pavementFootprint)));
    if(!junction)return null;
    const connections=this.network.routing!.connections.filter(c=>c.via&&length(c.via,junction.center)<.1&&Math.abs((c.via.y??0)-(junction.center.y??0))<.1);
    let selected:{location:RouteLocation;score:number}|undefined;
    for(const connection of connections) {
      const arc=this.arcs.get(this.arcId(connection.toRoadId,connection.toEnd==='start'));if(!arc)continue;
      const along=arc.forward?0:arc.length,point=this.pointAt(arc.road.id,along),next=this.pointAt(arc.road.id,along+(arc.forward?1:-1));
      const difference=Math.abs(angleDifference(pose.yaw,Math.atan2(-(next.x-point.x),-(next.z-point.z))));
      const score=difference*20+length(pose,point)*.05;
      if(!selected||score<selected.score)selected={score,location:{roadId:arc.road.id,along,point,label:roadLabel(arc.road),direction:arc.forward?'forward':'reverse',access:[{x:pose.x,y:pose.y,z:pose.z},junction.center,point]}};
    }
    return selected?.location??null;
  }
  private slice(arc:Arc,from:number,to:number):RoadPoint[] {
    const ds=this.distances.get(arc.road.id)!,points=[this.pointAt(arc.road.id,from)];
    if(arc.forward){for(let i=1;i<ds.length-1;i++)if(ds[i]!>from&&ds[i]!<to)points.push(arc.road.centerline[i]!);}
    else {for(let i=ds.length-2;i>0;i--)if(ds[i]!<from&&ds[i]!>to)points.push(arc.road.centerline[i]!);}
    points.push(this.pointAt(arc.road.id,to));return points;
  }
  public plan(start:RouteLocation,destination:RouteLocation):PlannedRoute|null {
    if(!this.roads.has(start.roadId)||!this.roads.has(destination.roadId))return null;
    type Entry={arc:Arc;g:number;f:number;previous?:Entry;via?:RoadPoint;from:number;to:number};
    const heap:Entry[]=[],costs=new Map<string,number>();
    const push=(v:Entry)=>{heap.push(v);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p]!.f<=v.f)break;heap[i]=heap[p]!;i=p;}heap[i]=v;};
    const pop=():Entry=>{const top=heap[0]!,tail=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1]!.f<heap[c]!.f)c++;if(heap[c]!.f>=tail.f)break;heap[i]=heap[c]!;i=c;}heap[i]=tail;}return top;};
    const heuristic=(arc:Arc)=>length(this.pointAt(arc.road.id,arc.forward?arc.length:0),destination.point)/this.maximumSpeed;
    let goal:Entry|undefined,goalCost=Infinity;
    const accessDistance=start.access?.reduce((sum,p,i,line)=>sum+(i?length(line[i-1]!,p):0),0)??0;
    for(const forward of [true,false]) {
      const arc=this.arcs.get(this.arcId(start.roadId,forward));if(!arc||start.direction&&(start.direction==='forward')!==forward)continue;
      if(start.roadId===destination.roadId&&(!destination.direction||(destination.direction==='forward')===forward)&&(forward?destination.along>=start.along:destination.along<=start.along)) {
        const g=(accessDistance+Math.abs(destination.along-start.along))/this.speed(arc.road);if(g<goalCost){goal={arc,g,f:g,from:start.along,to:destination.along};goalCost=g;}
      }
      const to=forward?arc.length:0,g=(accessDistance+Math.abs(to-start.along))/this.speed(arc.road),entry={arc,g,f:g+heuristic(arc),from:start.along,to};costs.set(arc.id,g);push(entry);
    }
    while(heap.length) {
      const current=pop();if(current.f>=goalCost)break;if(current.g!==costs.get(current.arc.id))continue;
      for(const next of current.arc.next) {
        const arc=next.arc,from=arc.forward?0:arc.length,to=arc.forward?arc.length:0;
        const a=this.pointAt(current.arc.road.id,current.to),b=this.pointAt(arc.road.id,from);
        const connector=next.via?length(a,next.via)+length(next.via,b):length(a,b);
        const penalty=arc.road.roadType==='ramp'?3:arc.road.nameId&&arc.road.nameId===current.arc.road.nameId?0:2;
        const g=current.g+connector/Math.min(this.speed(arc.road),this.speed(current.arc.road))+penalty;
        if(arc.road.id===destination.roadId&&(!destination.direction||(destination.direction==='forward')===arc.forward)) {
          const endCost=g+Math.abs(destination.along-from)/this.speed(arc.road);
          if(endCost<goalCost){goalCost=endCost;goal={arc,g:endCost,f:endCost,previous:current,via:next.via,from,to:destination.along};}
        }
        const total=g+arc.length/this.speed(arc.road);
        if(total<(costs.get(arc.id)??Infinity)){costs.set(arc.id,total);push({arc,g:total,f:total+heuristic(arc),previous:current,via:next.via,from,to});}
      }
    }
    if(!goal)return null;
    const entries:Entry[]=[];for(let e:Entry|undefined=goal;e;e=e.previous)entries.push(e);entries.reverse();
    const sections:RouteSection[]=[],points:RoadPoint[]=[],maneuvers:RouteManeuver[]=[];let distance=0;
    for(const e of entries) {
      const line=this.slice(e.arc,e.from,e.to);
      const connector:RoadPoint[]=points.length?[points.at(-1)!,...(e.via?[e.via]:[]),line[0]!]:[...(start.access??[])];
      if(points.length){if(e.via){distance+=length(points.at(-1)!,e.via);points.push(e.via);}distance+=length(points.at(-1)!,line[0]!);}
      else if(start.access){points.push(...start.access);distance+=accessDistance;}
      const section:RouteSection={road:e.arc.road,forward:e.arc.forward,from:e.from,to:e.to,startDistance:distance,distance:Math.abs(e.to-e.from),seconds:Math.abs(e.to-e.from)/this.speed(e.arc.road),points:line,connector};
      const previous=sections.at(-1);
      if(previous) {
        const a=previous.points.at(-2)!,b=previous.points.at(-1)!,c=line[0]!,d=line[1]!;
        const turn=Math.atan2((b.x-a.x)*(d.z-c.z)-(b.z-a.z)*(d.x-c.x),(b.x-a.x)*(d.x-c.x)+(b.z-a.z)*(d.z-c.z));
        const ramp=e.arc.road.roadType==='ramp'&&previous.road.roadType!=='ramp',merge=previous.road.roadType==='ramp'&&e.arc.road.roadType==='highway';
        const fromName=previous.road.nameId??previous.road.name,toName=e.arc.road.nameId??e.arc.road.name;
        const renamed=fromName!==toName,sameNamed=!!fromName&&fromName===toName;
        if(ramp||merge||renamed||Math.abs(turn)>.48&&(!sameNamed||e.previous!.arc.next.length>1)) {
          const right=turn>=0,symbol=merge?'↑':ramp?(right?'↗':'↖'):Math.abs(turn)>.48?(right?'↱':'↰'):'↑';
          const text=merge?'汇入':ramp?(right?'靠右驶出，进入':'靠左驶出，进入'):Math.abs(turn)>2.5?'沿连接道路掉头，进入':Math.abs(turn)>.48?(right?'右转进入':'左转进入'):'继续驶入';
          maneuvers.push({distance,text,symbol,roadName:roadLabel(e.arc.road)});
        }
      }
      sections.push(section);points.push(...line);distance+=section.distance;
    }
    maneuvers.push({distance,text:'到达目的地',symbol:'●',roadName:destination.label});
    return {start,destination,sections,points,distance,seconds:goalCost,maneuvers};
  }
}

function insidePolygon(point:RoadPoint,polygon:readonly RoadPoint[]):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {const a=polygon[i]!,b=polygon[j]!;if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}
  return inside;
}
