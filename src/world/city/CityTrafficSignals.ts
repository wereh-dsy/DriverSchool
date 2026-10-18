import { CylinderGeometry, Group, Mesh } from 'three';
import type { CityIntersection, CityMapData } from './CityMapData';
import { portDirection } from './geometry';
import { runtimeRoadClearance } from './RoadClearance';
import { armControlKind, Subject3TrafficSignals, type Subject3JunctionControlKind, type Subject3SignalArmMetadata, type Subject3TrafficSignalState } from '../subject3/trafficSignals';
import type { Subject3Point2 } from '../subject3/Subject3GroundConfig';
import type { Subject3Materials } from '../subject3/materials';
import type { TrafficSignalColor, TrafficSignalJunctionState, TrafficSignalLaneState, TrafficSignalMovement, TrafficSignalMovementState, TrafficSignalProvider } from '../navigation/TrafficSignalState';
import { CitySignalVisualResources, type CitySignalVisual, type CitySignalPanel } from './CitySignalVisual';

type Axis=Subject3JunctionControlKind;
interface Lane { junction:number; roadId:string; laneId:string; index:number; axis:Axis; movements:TrafficSignalMovement[] }
interface Stage { id:string; axis:Axis; group:'through'|'left'; color:TrafficSignalColor; duration:number }
interface Plan { junction:CityIntersection; lanes:Lane[]; stages:Stage[]; cycle:number }
interface Phase { stage:Stage; elapsed:number; remaining:number; index:number }

/** City-only fixed-time specialization. It shares the existing simulation clock
 * and leaves legacy maps' circular heads/timing unchanged. */
export class CityTrafficSignals extends Subject3TrafficSignals implements TrafficSignalProvider {
  private readonly plans=new Map<number,Plan>();
  private readonly lanes=new Map<string,Lane>();
  private readonly indices=new Map<string,number>();
  private readonly advancedHeads:{index:number;visual:CitySignalVisual}[]=[];
  private resources?:CitySignalVisualResources;
  private lastTick=-1;
  constructor(private readonly map:CityMapData) {
    super(map.intersections.length,map.intersections.map(j=>j.signals?.offsetSeconds??0),{greenSeconds:25,amberSeconds:3,allRedSeconds:2});
    for(const [index,j] of map.intersections.entries()) {
      this.indices.set(j.id,index);if(!j.signalized)continue;
      const lanes:Lane[]=[];
      for(const c of j.connections) {
        const r=map.roads.find(r=>r.id===c.roadId)!;
        if(r.travelDirection!=='two-way'&&(r.travelDirection==='forward')!==(c.end==='end'))continue;
        const count=r.travelDirection==='two-way'?r.laneCount/2:r.laneCount;
        for(let lane=0;lane<count;lane++) {
          const movement=j.approaches?.[c.port]?.lanes[lane]??(count===1?'straight':lane===0?'straight-left':lane===count-1?'straight-right':'straight');
          const logical=r.travelDirection==='two-way'?(c.end==='end'?count+lane:count-1-lane):r.travelDirection==='reverse'?count-1-lane:lane;
          const data:Lane={junction:index,roadId:r.id,laneId:`${r.id}:lane:${logical}`,index:lane,axis:armControlKind(portDirection(j,c.port)),movements:movement.split('-') as TrafficSignalMovement[]};
          lanes.push(data);this.lanes.set(data.laneId,data);
        }
      }
      const stages:Stage[]=[];
      if(j.signals?.profile==='lane-countdown')for(const axis of ['north-south','east-west'] as const)for(const group of ['through','left'] as const) {
        if(!lanes.some(l=>l.axis===axis&&l.movements.some(m=>m!=='right'&&(m==='left')===(group==='left'))))continue;
        for(const color of ['green','amber','red'] as const)stages.push({id:`${axis}-${group}-${color==='red'?'clear':color}`,axis,group,color,duration:color==='green'?(group==='left'?j.signals.leftGreenSeconds??8:j.signals.throughGreenSeconds??22):color==='amber'?j.signals.amberSeconds??3:j.signals.allRedSeconds??2});
      }
      this.plans.set(index,{junction:j,lanes,stages,cycle:stages.reduce((n,s)=>n+s.duration,0)});
    }
  }
  private phase(plan:Plan):Phase {
    let local=((this.clockSeconds+(plan.junction.signals?.offsetSeconds??0))%plan.cycle+plan.cycle)%plan.cycle;
    for(let i=0;i<plan.stages.length;i++){const stage=plan.stages[i]!;if(local<stage.duration)return {stage,elapsed:local,remaining:stage.duration-local,index:i};local-=stage.duration;}
    throw new Error('Empty City signal plan '+plan.junction.id);
  }
  private movementState(lane:Lane,movement:TrafficSignalMovement,phase?:Phase):TrafficSignalMovementState {
    if(movement==='right')return {movement,signalControlled:false,color:'green',permitted:true,secondsToGreen:0,secondsToChange:0};
    const plan=this.plans.get(lane.junction)!;
    if(!plan.stages.length) {
      const state=super.getStateForJunction(lane.junction),color=super.getColorForApproach(lane.junction,lane.axis);
      // Legacy two-stage cycle: red ends at the next green of this approach.
      const local=((this.clockSeconds+(plan.junction.signals?.offsetSeconds??0))%60+60)%60,start=lane.axis==='north-south'?0:30;
      const until=color==='green'?0:(start-local+60)%60;
      return {movement,color,permitted:color==='green',secondsToGreen:until,secondsToChange:color==='red'?until:state.secondsRemaining};
    }
    const current=phase??this.phase(plan),matches=(stage:Stage)=>stage.axis===lane.axis&&(stage.group==='left')===(movement==='left');
    const color=matches(current.stage)?current.stage.color:'red';let until=0;
    if(color!=='green') {
      until=current.remaining;
      for(let n=1;n<=plan.stages.length;n++){const stage=plan.stages[(current.index+n)%plan.stages.length]!;if(matches(stage)&&stage.color==='green')break;until+=stage.duration;}
    }
    return {movement,color,permitted:color==='green',secondsToGreen:until,secondsToChange:color==='red'?until:current.remaining};
  }
  getLaneSignal(laneId:string):TrafficSignalLaneState|undefined {
    const lane=this.lanes.get(laneId);if(!lane)return undefined;
    return {junctionId:this.map.intersections[lane.junction]!.id,roadId:lane.roadId,laneId,approachLaneIndex:lane.index,movements:lane.movements.map(m=>this.movementState(lane,m))};
  }
  getJunctionSignal(junctionId:string):TrafficSignalJunctionState|undefined {
    const index=this.indices.get(junctionId),plan=index===undefined?undefined:this.plans.get(index);if(!plan)return undefined;
    const legacy=super.getStateForJunction(index!),advanced=plan.stages.length?this.phase(plan):undefined;
    return {junctionId,profile:advanced?'lane-countdown':'standard',phaseId:advanced?.stage.id??legacy.phase,secondsInPhase:advanced?.elapsed??legacy.secondsInPhase,secondsRemaining:advanced?.remaining??legacy.secondsRemaining,cycleSeconds:advanced?plan.cycle:super.getCycleSeconds(),lanes:plan.lanes.map(l=>this.getLaneSignal(l.laneId)!)};
  }
  override getStateForJunction(index:number):Subject3TrafficSignalState {
    const plan=this.plans?.get(index);if(!plan?.stages.length)return super.getStateForJunction(index);
    const p=this.phase(plan),color=p.stage.color,axis=p.stage.axis;
    return {phase:color==='red'?'all-red':`${axis}-${color}`,quadrant:color==='red'?'none':axis,color,secondsInPhase:p.elapsed,secondsRemaining:p.remaining};
  }
  /** Ground-founded poles are rejected if they cut ANY carriageway below them. */
  placePole(index:number,outward:Subject3Point2,right:Subject3Point2,h:number,width:number,height:number,origin?:Subject3Point2):Subject3Point2 {
    const j=this.map.intersections[index]!,clearance=runtimeRoadClearance(this.map),base=Math.min(0,j.position.y??0);
    // Compact/skewed blocks can have another junction immediately beyond the
    // far crossing. A near-side mast uses the same approach-facing signal head.
    for(const side of [-1,1])for(const extra of [1,4,8,14])for(let lateral=width/2+1;lateral<=width/2+24;lateral+=1) {
      const p={x:(origin??j.position).x+side*outward.x*(h+extra)+right.x*lateral,y:base,z:(origin??j.position).z+side*outward.z*(h+extra)+right.z*lateral};
      if(!clearance.roadAt(p,.55,base-.2,(j.position.y??0)+height+.5,undefined,undefined,true)&&!clearance.junctionAt(p,.55,base-.2,(j.position.y??0)+height+.5))return p;
    }
    throw new Error('No signal pole clear of traffic at '+j.id);
  }
  override addHead(index:number,arm:Subject3SignalArmMetadata,center:Subject3Point2,yaw:number,materials:Subject3Materials,shadows:boolean,height:number):void {
    const plan=this.plans.get(index);
    if(!plan?.junction.signals?.profile){
      super.addHead(index,arm,center,yaw,materials,shadows,height);
      const drop=plan?.junction.signals?.profile?Math.max(0,plan.junction.position.y??0):0;
      if(drop){const extension=new Mesh(new CylinderGeometry(.11,.15,drop,8),materials.darkMetal);extension.position.y=-drop/2;this.root.children.at(-1)!.add(extension);}
      return;
    }
    const c=plan.junction.connections.find(c=>c.roadId===arm.segmentId)!,r=this.map.roads.find(r=>r.id===arm.segmentId)!,mouth=r.centerline[c.end==='start'?0:r.centerline.length-1]!;
    const lanes=plan.lanes.filter(l=>l.roadId===arm.segmentId),lateral=(center.x-mouth.x)*arm.right.x+(center.z-mouth.z)*arm.right.z;
    const road=this.map.roads.find(r=>r.id===arm.segmentId)!,twoWay=road.travelDirection==='two-way',panels:CitySignalPanel[]=[];
    if(!lanes.length)return;
    height=Math.max(7.2,height);
    for(const lane of lanes) {
      const offset=twoWay?(lane.index+.5)*arm.approachLaneWidth:-arm.roadWidth/2+(lane.index+.5)*arm.approachLaneWidth;
      // Unprotected right turns have no arrow head or countdown. Shared lanes
      // retain the head governing their straight / protected-left movement.
      const controlled=lane.movements.filter(m=>m!=='right');
      const groups=plan.stages.length?[controlled.filter(m=>m==='left'),controlled.filter(m=>m==='straight')].filter(g=>g.length):controlled.length?[controlled]:[];
      groups.forEach((movements,i)=>panels.push({laneId:lane.laneId,movement:movements[0]!,movements,circular:!plan.stages.length,x:lateral-offset+((groups.length-1)/2-i)*1.12}));
    }
    if(!panels.length)return;
    this.resources??=new CitySignalVisualResources();
    const visual=this.resources.build(index,panels,height,Math.max(0,plan.junction.position.y??0),materials);visual.root.position.set(center.x,0,center.z);visual.root.rotation.y=yaw;
    visual.root.userData.approachRoadId=road.id;visual.root.userData.signalFacing={...arm.outward};
    this.advancedHeads.push({index,visual});this.root.add(visual.root);this.updateVisual(index,visual);
  }
  private updateVisual(index:number,visual:CitySignalVisual):void {
    const plan=this.plans.get(index)!,phase=plan.stages.length?this.phase(plan):undefined;
    this.resources!.update(visual,visual.panels.map(p=>{const state=this.movementState(this.lanes.get(p.laneId)!,p.movement,phase);return {color:state.color,seconds:state.secondsToChange};}));
  }
  override update(dt:number):void {
    super.update(dt);if(!this.advancedHeads)return;
    const tick=Math.floor(this.clockSeconds*10);if(tick===this.lastTick)return;this.lastTick=tick;
    for(const head of this.advancedHeads)this.updateVisual(head.index,head.visual);
  }
  override getHeadCount():number {return super.getHeadCount()+(this.advancedHeads?.length??0);}
  override removeHeadsForJunction(index:number,owner?:Group):void {
    super.removeHeadsForJunction(index,owner);
    for(let i=this.advancedHeads.length-1;i>=0;i--){const head=this.advancedHeads[i]!;if(head.index===index&&(!owner||head.visual.root.parent===owner)){this.resources!.release(head.visual);this.advancedHeads.splice(i,1);}}
  }
  override dispose():void {for(const head of this.advancedHeads)this.resources!.release(head.visual);this.advancedHeads.length=0;super.dispose();this.resources?.dispose();}
}
