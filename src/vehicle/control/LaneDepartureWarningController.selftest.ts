import { createLaneObservation } from '../../world/navigation/LaneObservation';
import { LaneAssistMode } from './LaneAssistState';
import { LaneDepartureWarningController } from './LaneDepartureWarningController';
import type { LateralAssistContext } from './LateralAssistController';

export function runLaneDepartureWarningSelfTest(): string[] {
  const checks: string[]=[];
  const check=(value:boolean,name:string)=>{if(!value)throw new Error(name);checks.push(name);};
  const warning=new LaneDepartureWarningController();
  const lane={...createLaneObservation(),valid:true,laneId:'lane1',laneWidth:3.5,confidence:1,
    distanceToLeftBoundary:1.75,distanceToRightBoundary:1.75,leftBoundaryType:'dashed' as const,rightBoundaryType:'dashed' as const};
  const context:LateralAssistContext={speed:120/3.6,lateralVelocity:0,yawRate:0,driverSteering:0,
    operational:true,forwardGear:true,suspended:false,leftSignal:false,rightSignal:false};
  const step=()=>warning.update(1/120,lane,context,LaneAssistMode.WARNING_ONLY,true);
  check(step()===null,'LDW silent in central safe zone');
  lane.distanceToRightBoundary=.85;lane.headingError=.015;
  check(step()==='right','LDW predicts right departure before line contact');
  let repeated=false;for(let i=0;i<600;i++)repeated ||= step()!==null;
  check(!repeated,'sustained departure does not spam sound');
  lane.distanceToRightBoundary=lane.distanceToLeftBoundary=1.75;lane.headingError=0;
  for(let i=0;i<70;i++)step();
  lane.distanceToLeftBoundary=.85;lane.headingError=-.015;
  check(step()==='left','settled centre rearms the next departure');
  warning.reset();context.leftSignal=true;
  check(step()===null,'left signal suppresses intentional left departure');
  lane.distanceToRightBoundary=.85;lane.distanceToLeftBoundary=2.65;lane.headingError=.015;
  check(step()==='right','left signal retains opposite-side warning');
  warning.reset();context.leftSignal=false;context.rightSignal=true;
  check(step()===null,'right signal suppresses intentional right departure');
  context.rightSignal=false;context.driverSteering=.8;
  check(step()===null,'strong driver steering suppresses warning');
  context.driverSteering=0;context.speed=10;
  check(step()===null,'low-speed warning unavailable');context.speed=120/3.6;
  lane.isIntersection=true;check(step()===null,'intersection warning unavailable');lane.isIntersection=false;
  lane.valid=false;check(step()===null,'invalid lane is silent');lane.valid=true;
  lane.confidence=.2;check(step()===null,'uncertain lane is silent');lane.confidence=1;
  lane.headingError=NaN;check(step()===null,'NaN cannot produce an alert');lane.headingError=.015;
  context.forwardGear=false;check(step()===null,'reverse/park warning unavailable');context.forwardGear=true;
  context.suspended=true;check(step()===null,'menus/hidden window warning unavailable');context.suspended=false;
  for(const mode of [LaneAssistMode.OFF,LaneAssistMode.KEEP_ASSIST,LaneAssistMode.CENTERING_ASSIST])
    check(warning.update(1/120,lane,context,mode,true)===null,`${mode} cannot issue a warning-only mode sound`);
  check(warning.update(1/120,lane,context,LaneAssistMode.WARNING_ONLY,false)===null,'unsupported vehicle is silent');
  return checks;
}
