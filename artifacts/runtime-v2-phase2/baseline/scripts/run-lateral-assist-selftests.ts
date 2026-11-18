import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { runLaneObservationSelfTest } from '../src/world/navigation/LaneObservation.selftest';
import { runLateralAssistControllerSelfTest } from '../src/vehicle/control/LateralAssistController.selftest';
import { runLateralAssistDrivingSelfTest } from '../src/vehicle/control/LateralAssistDriving.selftest';
import { runSteeringReturnSelfTest } from '../src/vehicle/physics/SteeringSystem.selftest';
import { runVehicleInputSystemSelfTest } from '../src/input/VehicleInputSystem.selftest';
import { buildCityRoadNetwork } from '../src/world/city/CityRoadNetwork';
import { LaneObservationTracker } from '../src/world/navigation/LaneObservation';
import type { CityMapData } from '../src/world/city/CityMapData';
import { LocalRoadMap } from '../src/ui/LocalRoadMap';

if(process.argv.includes('--driving')) {
  const result=runLateralAssistDrivingSelfTest();
  mkdirSync('artifacts/lateral-assist',{recursive:true});
  writeFileSync('artifacts/lateral-assist/physical-driving.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));process.exit(0);
}

const map=JSON.parse(readFileSync('src/world/regional/regional-main.json','utf8')) as CityMapData;
const network=buildCityRoadNetwork(map),tracker=new LaneObservationTracker();tracker.configure(network);
const spatial=new LocalRoadMap();spatial.setNetwork(network);
let available=0,unavailable=0;
for(const road of network.segments.filter(r=>r.speedLimit>=80&&r.length>200)) {
  const middle=Math.floor(road.centerline.length/2),a=road.centerline[middle-1]!,b=road.centerline[middle]!;
  const yaw=Math.atan2(a.x-b.x,a.z-b.z),dx=Math.cos(yaw),dz=-Math.sin(yaw);
  const lane=road.lanes.find(l=>l.direction==='forward')!;
  if(!lane)continue;
  const offset=-road.width/2+(lane.index+.5)*lane.width;
  const pose={x:(a.x+b.x)/2+dx*offset,z:(a.z+b.z)/2+dz*offset,y:((a.y??0)+(b.y??0))/2,yaw};
  tracker.reset();const o=tracker.update(pose,30,spatial.nearby(pose.x,pose.z).network);
  if(o.valid)available++;else unavailable++;
}
if(available<10)throw new Error(`Authored regional topology unavailable: ${available} roads`);
const result={laneObservation:runLaneObservationSelfTest(),controllers:runLateralAssistControllerSelfTest(),
  authoredRegionalLaneCoverage:{available,unavailable},steering:runSteeringReturnSelfTest(),input:runVehicleInputSystemSelfTest(),
  physicalDriving:runLateralAssistDrivingSelfTest()};
mkdirSync('artifacts/lateral-assist',{recursive:true});
writeFileSync('artifacts/lateral-assist/test-results.json',JSON.stringify(result,null,2)+'\n');
writeFileSync('artifacts/lateral-assist/physical-driving.json',JSON.stringify(result.physicalDriving,null,2)+'\n');
console.log(JSON.stringify({laneChecks:result.laneObservation.length,controllerChecks:result.controllers.length,
  authoredRegionalLaneCoverage:result.authoredRegionalLaneCoverage,steering:result.steering,input:result.input,
  physicalScenarios:result.physicalDriving.length},null,2));
