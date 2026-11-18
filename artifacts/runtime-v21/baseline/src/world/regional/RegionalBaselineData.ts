import{createHash}from'node:crypto';
import type{CityMapData,CityRoad}from'../city/CityMapData';
import{loadCityMap}from'../city/CityMapLoader';
import{buildCityRoadNetwork}from'../city/CityRoadNetwork';
import{validateMap}from'../city/CityMapValidation';
import{roadFunction}from'../city/RoadClassification';

export interface RegionalBaseline {
  revision:number;
  fields:Record<string,string>;
  gradeExceptions:Record<string,number>;
  navigationSHA256?:string;
  approval?:{reason:string;sourceSHA256:string;previousRevision:number};
}
export const baselineHash=(value:unknown):string=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function regionalGrade(road:CityRoad):number{
  let maximum=0;
  for(let i=1;i<road.centerline.length;i++){const a=road.centerline[i-1]!,b=road.centerline[i]!,span=Math.hypot(b.x-a.x,b.z-a.z),rise=Math.abs((b.y??0)-(a.y??0));if(span<1e-8){if(rise>1e-8)return Infinity;continue;}maximum=Math.max(maximum,rise/span);}
  return maximum;
}
export function regionalNavigationHash(map:CityMapData):string{return baselineHash(buildCityRoadNetwork(loadCityMap(map)));}
export function createRegionalBaseline(map:CityMapData,approval:NonNullable<RegionalBaseline['approval']>):RegionalBaseline{
  const report=validateMap(map);if(!report.valid)throw Error('Cannot approve an invalid map: '+report.errors.map(e=>e.code+' '+e.path).join(', '));
  const normalized=loadCityMap(map),gradeExceptions:Record<string,number>={};
  const regionalGrades=new Set(normalized.regional?.routes.flatMap(r=>r.roadIds)??[]);
  for(const structure of normalized.regional?.structures??[])for(const id of structure.roadIds){const r=normalized.roads.find(r=>r.id===id);if(structure.kind==='bridge'||structure.kind==='tunnel'||structure.kind==='interchange'&&r?.type==='ramp_1'&&!r.highwayTransition)regionalGrades.add(id);}
  for(const road of normalized.roads){const grade=regionalGrade(road);if(regionalGrades.has(road.id)&&grade>.12001)throw Error('Approval cannot exceed the existing regional 12% hard grade contract: '+road.id);if(grade>(roadFunction(road)==='ramp'?.06:.05))gradeExceptions[road.id]=grade;}
  return{revision:map.version,fields:Object.fromEntries(Object.entries(map).map(([key,value])=>[key,baselineHash(value)])),gradeExceptions,navigationSHA256:baselineHash(buildCityRoadNetwork(normalized)),approval};
}
/** Exact field inventory is separate from current-schema legality. Historical
 * snapshots can be checked explicitly; normal builds select the active approval. */
export function assertRegionalBaselineData(map:CityMapData,baseline:RegionalBaseline):void{
  const fields=map as unknown as Record<string,unknown>;
  if(map.version!==baseline.revision)throw Error(`Regional map v${map.version} has no active approval (expected v${baseline.revision}); preview and approve its versioned baseline.`);
  if(JSON.stringify(Object.keys(fields).sort())!==JSON.stringify(Object.keys(baseline.fields).sort()))throw Error('Regional release field inventory changed');
  for(const [key,expected]of Object.entries(baseline.fields))if(baselineHash(fields[key])!==expected)throw Error(`Regional v${baseline.revision} unapproved field change: ${key}`);
  if(baseline.navigationSHA256&&regionalNavigationHash(map)!==baseline.navigationSHA256)throw Error(`Regional v${baseline.revision} derived navigation changed without approval`);
}
