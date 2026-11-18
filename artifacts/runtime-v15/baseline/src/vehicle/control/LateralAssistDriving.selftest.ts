import { Group, Vector2, Vector3 } from 'three';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { VehicleContactSystem } from '../physics/VehicleContactSystem';
import type { Powertrain } from '../powertrain/Powertrain';
import { createVehiclePhysicsConfig, getVehicleDescriptor, type VehicleId } from '../VehicleCatalog';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import type { DrivingGround } from '../../world/DrivingGround';
import { buildCityRoadNetwork } from '../../world/city/CityRoadNetwork';
import { lateralCurveRoad, lateralTestMap, lateralTestRoad } from '../../world/navigation/LaneObservation.selftest';
import { LaneObservationTracker } from '../../world/navigation/LaneObservation';
import { LateralAssistController, arbitrateLateralSteering, type LateralAssistContext } from './LateralAssistController';
import { CruiseControlController } from './CruiseControlController';

export type Scenario = 'straight80' | 'straight100' | 'straight120' | 'straightSmall' | 'curve90' | 'curve100' | 'curve120' |
  'signalChange' | 'unsignaledChange' | 'merge' | 'diverge' | 'lkaLeft' | 'lkaRight' | 'lkaEarly120' | 'override120';
export function runLateralAssistDrivingSelfTest(options: { scenarios?: readonly Scenario[]; diagnosticsOnly?: boolean; recordSamples?: boolean } = {}) {
  const results: { vehicle: string; scenario: Scenario; finalOffset: number; maxOffset: number; laneChanges: number;
    huntingCrossings: number; maxAssist: number; maxAssistStep: number; finalState: string; speedKmh: number;
    settledRms: number; firstCorrectionSeconds: number | null; firstCorrectionClearance: number | null; minimumClearance: number; samples?: unknown[] }[] = [];
  const vehicles: VehicleId[] = ['bmw-530li-g38','tesla-model-3-rwd','executive-lwb-2t'];
  const scenarios = options.scenarios ?? ['straight80','straight120','straightSmall','curve90','signalChange','unsignaledChange','merge','diverge','lkaLeft','lkaRight'];
  for (const vehicle of vehicles) for (const scenario of scenarios) {
    const curve = scenario.startsWith('curve'), laneChange = scenario === 'signalChange' || scenario === 'unsignaledChange';
    const lka = scenario.startsWith('lka');
    const speed = (scenario.endsWith('120') || scenario === 'straightSmall' ? 120 : scenario.endsWith('100') ? 100 : curve ? 90 : 80) / 3.6;
    const main = lateralTestRoad('main',0,0,scenario==='merge'||scenario==='diverge'?-200:-2000);
    const next = lateralTestRoad('next',0,-200,-2000), branch = lateralTestRoad('branch',0,-200,-2000);
    branch.centerline=[{x:0,z:-200},{x:100,z:-400},{x:800,z:-2000}];
    const curveRoad = lateralCurveRoad(600);
    curveRoad.centerline.forEach(p=>p.z-=200); curveRoad.centerline.unshift({x:0,z:0});
    const map = curve ? lateralTestMap([curveRoad]) : scenario==='merge'||scenario==='diverge'
      ? lateralTestMap([main,next,branch],[{id:'continuation',from:{roadId:'main',end:'end'},to:{roadId:'next',end:'start'}},
        scenario==='diverge'?{id:'branch',from:{roadId:'main',end:'end'},to:{roadId:'branch',end:'start'}}:
          {id:'branch',from:{roadId:'branch',end:'start'},to:{roadId:'main',end:'end'}}]) : lateralTestMap([main]);
    const network = buildCityRoadNetwork(map);
    const ground: DrivingGround = { root:new Group(), spawnPose:{position:new Vector3(0,0,0),yawRadians:0},
      metadata:{id:'lateral-flat-test',version:1,displayName:'Lateral physics test',description:'Authored lane fixture, ordinary dry asphalt'},
      worldBounds:map.bounds,roadNetwork:network,colliders:[],
      sampleRoadSurface:()=>({...SURFACE_MATERIALS.asphalt,height:0,gradient:new Vector2(),normal:new Vector3(0,1,0),grade:0,
        gripMultiplier:1,rollingResistanceMultiplier:1}),getRoadHeightAt:()=>0,getRoadPitchAt:()=>0,dispose:()=>{} };
    const config=createVehiclePhysicsConfig(vehicle), dimensions=getVehicleDescriptor(vehicle).visualConfig.dimensions;
    const initialOffset=scenario==='lkaEarly120'?.55:lka?(scenario==='lkaLeft'?-1.2:1.2):curve?0:scenario==='straightSmall'?.15:.65;
    const dynamics=new VehicleDynamics<Powertrain>(config,{speed,x:initialOffset,
      z:-100,yaw:scenario==='lkaEarly120'?-.012:lka?(scenario==='lkaLeft'?.025:-.025):0,
      driveSelector:'D',gear:6,engineRunning:true,engineRPM:2200,clutchEngagement:1,vehicleOperational:true});
    const contacts=new VehicleContactSystem(ground,dimensions);
    const tracker=new LaneObservationTracker();tracker.configure(network);
    const lateral=new LateralAssistController();lateral.configure(config.lateralAssist,config.steering,config.wheelBase);
    if(!lka)lateral.toggleLCC();
    const cruise=new CruiseControlController();cruise.configure(config.cruiseControl);
    const input=createNeutralVehicleInputState();input.clutchPedal=0;
    const context:LateralAssistContext={speed,lateralVelocity:0,yawRate:0,driverSteering:0,operational:true,forwardGear:true,
      suspended:false,leftSignal:false,rightSignal:false};
    let maxOffset=0,maxAssist=0,maxAssistStep=0,previousAssist=0,huntingCrossings=0,lastSign=0,laneChanges=0,previousLane:string|undefined;
    let observation=tracker.observation;
    let sumSquared=0, settledSamples=0, firstCorrectionSeconds:number|null=null, firstCorrectionClearance:number|null=null, minimumClearance=Infinity;
    const samples: unknown[] = [];
    for(let tick=0;tick<1200;tick++) {
      const t=tick/120,s=dynamics.getSnapshot();
      input.cruiseToggle=tick===60;
      input.steering=0;
      if(scenario==='override120' && t>=2 && t<2.2) input.steering=.6;
      if(laneChange && t>=2 && t<8) {
        // Scripted human steering: initiation, then hold the adjacent lane using normal input.
        input.steering=t<2.15?(scenario==='unsignaledChange'?.4:.14):Math.max(-.5,Math.min(.5,.035*(3.5-s.x)+.9*s.yaw+s.yawRate));
      }
      context.rightSignal=scenario==='signalChange'&&t>=2&&t<7;
      context.driverSteering=input.steering;context.speed=s.speed;context.lateralVelocity=s.lateralVelocity;
      context.yawRate=s.yawRate;
      context.forwardGear=s.transmission.selectedMode==='D';context.operational=s.vehicleOperational;
      if(tick%4===0)observation=tracker.update({x:s.x,z:s.z,yaw:s.yaw,y:s.chassis.groundHeight},s.speed,network,lateral.laneChangeOverride);
      const out=lateral.update(1/120,observation,context);
      if(firstCorrectionSeconds===null&&Math.abs(out.steeringAssist)>.005) {
        firstCorrectionSeconds=t;firstCorrectionClearance=Math.min(observation.distanceToLeftBoundary,observation.distanceToRightBoundary);
      }
      minimumClearance=Math.min(minimumClearance,observation.distanceToLeftBoundary,observation.distanceToRightBoundary);
      if(t>=7){sumSquared+=observation.lateralOffset**2;settledSamples++;}
      if((curve||options.recordSamples)&&tick%60===0)samples.push({t,offset:observation.lateralOffset,heading:observation.headingError,
        curvature:observation.curvature,assist:out.steeringAssist,speed:s.speed,yawRate:s.yawRate,lateralSpeed:s.lateralVelocity,roadAngle:s.steeringAngle});
      const controls=cruise.update(1/120,input,{available:true,speedMetersPerSecond:s.speed,engineRunning:s.driveAvailable,
        gear:s.gear??'N',driveSelector:s.transmission.selectedMode??undefined,currentThrottle:s.throttle});
      controls.steering=arbitrateLateralSteering(input.steering,out);input.cruiseToggle=false;
      if(scenario==='override120' && input.steering===.6 && controls.steering!==.6) throw new Error('strong driver override fought the driver');
      contacts.step(1/120,controls,dynamics);
      maxOffset=Math.max(maxOffset,Math.abs(observation.lateralOffset));maxAssist=Math.max(maxAssist,Math.abs(out.steeringAssist));
      maxAssistStep=Math.max(maxAssistStep,Math.abs(out.steeringAssist-previousAssist));previousAssist=out.steeringAssist;
      if(previousLane&&observation.laneId!==previousLane)laneChanges++;
      previousLane=observation.laneId;
      if(t>3&&Math.abs(observation.lateralOffset)>.2){const sign=Math.sign(observation.lateralOffset);if(lastSign&&sign!==lastSign)huntingCrossings++;lastSign=sign;}
      if(!Number.isFinite(dynamics.x)||!Number.isFinite(dynamics.yaw))throw new Error(`${vehicle} ${scenario}: invalid physical pose`);
    }
    const result={vehicle,scenario,finalOffset:+observation.lateralOffset.toFixed(3),maxOffset:+maxOffset.toFixed(3),laneChanges,
      huntingCrossings,maxAssist:+maxAssist.toFixed(4),maxAssistStep:+maxAssistStep.toFixed(5),finalState:lateral.output.state,speedKmh:+(dynamics.speed*3.6).toFixed(1),
      settledRms:+Math.sqrt(sumSquared/settledSamples).toFixed(3),firstCorrectionSeconds:firstCorrectionSeconds===null?null:+firstCorrectionSeconds.toFixed(3),
      firstCorrectionClearance:firstCorrectionClearance===null?null:+firstCorrectionClearance.toFixed(3),minimumClearance:+minimumClearance.toFixed(3)};
    results.push(options.recordSamples ? {...result,samples} : result);
    if(options.diagnosticsOnly)continue;
    const slew = lka ? config.lateralAssist!.lka.rateLimit : Math.max(config.lateralAssist!.lcc.rateLimit,config.lateralAssist!.lcc.highSpeedRateLimit);
    if(maxAssist>(lka?config.lateralAssist!.lka.maxAuthority:config.lateralAssist!.lcc.maxAuthority)+.00001||maxAssistStep>slew/120+.00001)
      throw new Error(`${vehicle} ${scenario}: authority / slew limit ${JSON.stringify(result)}`);
    if(!lka&&!laneChange&&scenario!=='override120'&&(Math.abs(result.finalOffset)>.8||huntingCrossings>2||!observation.valid||curve&&laneChanges!==0))
      throw new Error(`${vehicle} ${scenario}: physical centering stability ${JSON.stringify(result)} ${JSON.stringify(samples)}`);
    if(laneChange&&(observation.laneId!=='main:lane:2'||lateral.display.lccState!=='ACTIVE'))
      throw new Error(`${vehicle} ${scenario}: lane change / reacquisition ${JSON.stringify(result)}`);
    if(lka&&maxAssist<.01)throw new Error(`${vehicle} ${scenario}: no physical boundary assistance`);
    if(lka&&laneChanges!==0)throw new Error(`${vehicle} ${scenario}: LKA caused lane hopping ${JSON.stringify(result)}`);
    if((scenario==='straight100'||scenario==='straight120'||scenario==='straightSmall') && (result.settledRms>.08||huntingCrossings!==0))
      throw new Error(`${vehicle} ${scenario}: high-speed straight tracking regression ${JSON.stringify(result)}`);
    if((scenario==='curve100'||scenario==='curve120') && (result.settledRms>.65||huntingCrossings!==0||
      firstCorrectionSeconds===null||firstCorrectionSeconds>=100/speed-.2))
      throw new Error(`${vehicle} ${scenario}: predictive curve tracking regression ${JSON.stringify(result)}`);
    if(scenario==='lkaEarly120' && (minimumClearance<.65||huntingCrossings!==0||firstCorrectionSeconds===null||
      firstCorrectionSeconds>.35||firstCorrectionClearance===null||firstCorrectionClearance<1))
      throw new Error(`${vehicle} ${scenario}: timely departure protection regression ${JSON.stringify(result)}`);
  }
  return results;
}
