import type { RoadNetworkData } from './RoadNetwork';
import { RoutePlanner, navigationDistance, navigationTime, type NavigationPose, type PlannedRoute, type RouteLocation } from './RoutePlanner';

export interface NavigationState {
  version:number; status:'idle'|'preview'|'navigating'|'rerouting'|'arrived'|'unreachable';
  route:PlannedRoute|null; remainingDistance:number; remainingSeconds:number;
  maneuverDistance:number; instruction:string; symbol:string; nextRoad:string;
}
/** Game-owned route session. Displays borrow state; vehicle switches do not own it. */
export class NavigationController {
  public planner:RoutePlanner|undefined;
  public readonly state:NavigationState={version:0,status:'idle',route:null,remainingDistance:0,remainingSeconds:0,maneuverDistance:0,instruction:'请选择目的地',symbol:'↑',nextRoad:''};
  public pose:NavigationPose={x:0,y:0,z:0,yaw:0};
  private elapsed=0;
  private offRoute=0;
  private progress=0;
  private network:RoadNetworkData|undefined;
  private retry=0;
  public configure(network:RoadNetworkData|undefined):void {
    if(this.network===network)return;this.network=network;this.planner=network?.routing?new RoutePlanner(network):undefined;this.clear();
  }
  public clear():void {
    Object.assign(this.state,{status:'idle',route:null,remainingDistance:0,remainingSeconds:0,maneuverDistance:0,instruction:'请选择目的地',symbol:'↑',nextRoad:''});
    this.progress=this.offRoute=this.elapsed=this.retry=0;this.state.version++;
  }
  public currentLocation():RouteLocation|null{return this.planner?.locate(this.pose)??null;}
  public preview(start:RouteLocation,destination:RouteLocation):boolean {
    const route=this.planner?.plan(start,destination)??null;
    Object.assign(this.state,{route,status:route?'preview':'unreachable',instruction:route?'路线预览':'暂无可达路线',remainingDistance:route?.distance??0,remainingSeconds:route?.seconds??0,nextRoad:destination.label,symbol:'↑'});
    this.progress=this.offRoute=0;this.state.version++;return !!route;
  }
  public start(destination:RouteLocation):boolean {
    const start=this.currentLocation();if(!start){this.state.status='unreachable';this.state.route=null;this.state.instruction='当前位置不在可导航道路上';this.state.version++;return false;}
    if(!this.preview(start,destination))return false;
    this.state.status='navigating';this.elapsed=Infinity;this.update(0,this.pose,0);return true;
  }
  public update(dt:number,pose:NavigationPose,speed:number):void {
    this.pose.x=pose.x;this.pose.y=pose.y;this.pose.z=pose.z;this.pose.yaw=pose.yaw;
    if(!this.planner||!this.state.route||!['navigating','rerouting'].includes(this.state.status))return;
    this.elapsed+=dt;this.retry=Math.max(0,this.retry-dt);if(this.elapsed<.2)return;
    const elapsed=this.elapsed===Infinity?.2:this.elapsed;this.elapsed=0;
    const route=this.state.route;
    const candidates=this.planner.matches(pose.x,pose.z,50,pose);
    let best:{distance:number;score:number;remaining:number}|undefined;
    const nearest=candidates.find(m=>m.heightDifference<2.5);
    for(const m of candidates) {
      if(m.heightDifference>2.5||m.distance>Math.max(8,this.planner.road(m.location.roadId)!.width/2+4))continue;
      for(const s of route.sections) {
        if(s.road.id!==m.location.roadId||s.forward!==(m.location.direction==='forward'))continue;
        const lo=Math.min(s.from,s.to),hi=Math.max(s.from,s.to);
        if(m.location.along<lo-12||m.location.along>hi+12)continue;
        const distance=s.startDistance+Math.max(0,Math.min(s.distance,s.forward?m.location.along-s.from:s.from-m.location.along));
        const score=m.score+(distance<this.progress-30?20:0)+Math.abs(distance-this.progress)*.0005;
        const remaining=s.seconds*(1-Math.max(0,Math.min(1,(distance-s.startDistance)/(s.distance||1))))+route.sections.slice(route.sections.indexOf(s)+1).reduce((sum,r)=>sum+r.seconds,0);
        if(!best||score<best.score)best={distance,score,remaining};
      }
    }
    for(const s of route.sections) {
      const line=s.connector;if(!line||line.length<2)continue;
      const total=line.reduce((sum,p,i)=>sum+(i?Math.hypot(p.x-line[i-1]!.x,p.z-line[i-1]!.z):0),0);let along=0;
      for(let i=1;i<line.length;i++) {
        const a=line[i-1]!,b=line[i]!,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.01)continue;
        const t=Math.max(0,Math.min(1,((pose.x-a.x)*dx+(pose.z-a.z)*dz)/(len*len))),height=(a.y??0)+((b.y??0)-(a.y??0))*t;
        const lateral=Math.hypot(pose.x-a.x-dx*t,pose.z-a.z-dz*t),difference=Math.abs(Math.atan2(Math.sin(pose.yaw-Math.atan2(-dx,-dz)),Math.cos(pose.yaw-Math.atan2(-dx,-dz))));
        if(lateral<8&&Math.abs(pose.y-height)<2.5&&difference<1.2) {
          const distance=s.startDistance-total+along+len*t,score=lateral+Math.abs(pose.y-height)*12+difference*8+(distance<this.progress-30?20:0);
          if(!best||score<best.score)best={distance,score,remaining:route.seconds*Math.max(0,1-distance/(route.distance||1))};
        }
        along+=len;
      }
    }
    // A closer parallel/upper road wins over a nearby route line. Hold briefly at junction gaps.
    const valid=best&&(!nearest||best.score<=nearest.score+5);
    if(!valid) {
      this.offRoute+=elapsed;
      if(this.offRoute>=1.4&&this.retry===0) {
        this.state.status='rerouting';this.state.instruction='正在重新规划';this.state.version++;
        const start=this.currentLocation(),next=start?this.planner.plan(start,route.destination):null;
        this.retry=3;
        if(next){this.state.route=next;this.progress=0;this.offRoute=0;this.state.status='navigating';}
        else this.state.instruction=start?'暂无可达路线，等待重新规划':'请返回可行驶道路';
      }
      return;
    }
    this.offRoute=0;this.state.status='navigating';this.progress=best!.distance;
    this.state.remainingDistance=Math.max(0,route.distance-this.progress);this.state.remainingSeconds=Math.max(0,best!.remaining);
    const destination=route.destination.point;
    if(this.state.remainingDistance<18&&Math.hypot(pose.x-destination.x,pose.z-destination.z)<22&&Math.abs(pose.y-(destination.y??0))<2.5&&Math.abs(speed)<8) {
      this.state.status='arrived';this.state.instruction='已到达目的地';this.state.symbol='●';this.state.remainingDistance=this.state.remainingSeconds=0;
    } else {
      const maneuver=route.maneuvers.find(m=>m.distance>this.progress+5)??route.maneuvers.at(-1)!;
      this.state.maneuverDistance=Math.max(0,maneuver.distance-this.progress);this.state.instruction=maneuver.text;
      this.state.symbol=maneuver.symbol;this.state.nextRoad=maneuver.roadName;
    }
    this.state.version++;
  }
}

export function navigationSummary(state:NavigationState):string {
  return `${navigationDistance(state.remainingDistance)} · 预计 ${navigationTime(state.remainingSeconds)}`;
}
