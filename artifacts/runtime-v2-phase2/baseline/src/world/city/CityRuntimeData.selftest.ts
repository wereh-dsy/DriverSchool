import alpha from './maps/city-alpha.json';
import { compileCityRuntimeData, shareCityRuntimePaths } from './CityRuntimeData';

export function runCityRuntimeSharingSelfTest(){
  const runtime=JSON.parse(JSON.stringify(compileCityRuntimeData(alpha))) as ReturnType<typeof compileCityRuntimeData>;
  const serialized=JSON.stringify(runtime);let assertions=0;
  const check=(v:unknown,message:string)=>{assertions++;if(!v)throw Error('Runtime sharing: '+message);};
  const road=runtime.map.roads.find(r=>r.curve!=='smooth')!,segment=runtime.roadNetwork.segments.find(s=>s.id===road.id)!;
  shareCityRuntimePaths(runtime);check(segment.centerline===road.centerline,'identical immutable paths share storage');
  check(JSON.stringify(runtime)===serialized,'all map/navigation values remain identical');
  const cloned=structuredClone(runtime);check(cloned.map.roads.find(r=>r.id===road.id)!.centerline===cloned.roadNetwork.segments.find(s=>s.id===road.id)!.centerline,'structured clone retains sharing');
  const changed=JSON.parse(serialized) as typeof runtime,other=changed.roadNetwork.segments.find(s=>s.id===road.id)!;other.centerline[0]!.y=(other.centerline[0]!.y??0)+.01;
  shareCityRuntimePaths(changed);check(other.centerline!==changed.map.roads.find(r=>r.id===road.id)!.centerline,'different XYZ cannot alias');
  const extended=JSON.parse(serialized) as typeof runtime,custom=extended.map.roads.find(r=>r.id===road.id)!;
  Object.assign(custom.centerline[0]!,{custom:1});shareCityRuntimePaths(extended);check(custom.centerline!==extended.roadNetwork.segments.find(s=>s.id===road.id)!.centerline,'extended records cannot lose fields');
  return{passed:true,assertions};
}
