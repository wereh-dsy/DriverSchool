import type { CityPoint } from '../world/city/CityMapData';
import { roadFunction } from '../world/city/RoadClassification';
import { sampleAt, polylineLength } from '../world/city/geometry';
import { distance, project, crossings } from './EditorGeometry';
import { angleDelta, issue, MapAnalysisContext, stations, structureType, type MapIssue } from './MapAnalysis';
import { repairElevation, type ElevationOptions } from './RoadRepair';

export function inspectProfile(context:MapAnalysisContext,id:string,step=10){
  if(!Number.isFinite(step)||step<=0)throw new Error('Profile step must be positive');
  const road=context.road(id),path=context.path(id),table=stations(path),length=polylineLength(path),constraints=context.hardConstraints(id);
  if(length/step>10000)throw new Error('Profile exceeds 10000 samples; increase step');
  const positions=new Set(table);for(let s=0;s<length;s+=step)positions.add(s);positions.add(length);
  const ordered=[...positions].sort((a,b)=>a-b).filter((value,i,array)=>i===0||value-array[i-1]!>1e-6),samples=ordered.map(station=>({station,xyz:sampleAt(path,station).point,elevation:sampleAt(path,station).point.y??0,grade:0,gradeDelta:0}));
  for(let i=1;i<samples.length;i++){samples[i]!.grade=(samples[i]!.elevation-samples[i-1]!.elevation)/Math.max(1e-8,samples[i]!.station-samples[i-1]!.station);samples[i]!.gradeDelta=samples[i]!.grade-(i>1?samples[i-1]!.grade:samples[i]!.grade);}
  const extrema:{station:number;elevation:number;kind:'crest'|'sag';amplitude:number;wavelength:number;constraintDriven:boolean;nearestHardConstraintDistance:number|null}[]=[];
  let previousGrade=0,previousSegment=1;
  for(let i=1;i<path.length;i++){
    const after=((path[i]!.y??0)-(path[i-1]!.y??0))/Math.max(.001,table[i]!-table[i-1]!);
    if(Math.abs(after)<.001)continue;
    const before=previousGrade,prior=previousSegment;previousGrade=after;previousSegment=i;
    if(before*after>=0||before===0)continue;
    const a=path[prior-1]!,p=path[i-1]!,b=path[i]!;
    const station=table[i-1]!,span=table[i]!-table[prior-1]!,baseline=(a.y??0)+((b.y??0)-(a.y??0))*(station-table[prior-1]!)/Math.max(.001,span);
    const hard=constraints.filter(c=>c.kind!=='endpoint'),nearest=hard.length?Math.min(...hard.map(c=>Math.abs(c.station-station))):Infinity;
    extrema.push({station,elevation:p.y??0,kind:before>0?'crest':'sag',amplitude:Math.abs((p.y??0)-baseline),wavelength:span,constraintDriven:nearest<=context.limits.constraintDistance,nearestHardConstraintDistance:Number.isFinite(nearest)?nearest:null});
  }
  const spacings=extrema.slice(1).map((p,i)=>p.station-extrema[i]!.station);
  return {roadId:id,length,isRamp:roadFunction(road)==='ramp',structureType:structureType(road),units:{station:'m',grade:'m/m',gradeDelta:'m/m'},samples,verticalControlPoints:road.centerline.map(xyz=>({station:project(path,xyz).along,xyz,authored:true})),endpointElevation:{start:path[0]!.y??0,end:path.at(-1)!.y??0},constraints,crossings:context.crossings(id),nearbyOverUnderRoads:context.overUnderRoads(id),extrema,
    metrics:{extremaCount:extrema.length,shortExtremaCount:extrema.filter(e=>e.wavelength<=context.limits.localExtremumLength).length,maxGrade:Math.max(0,...samples.map(s=>Math.abs(s.grade))),maxGradeDelta:Math.max(0,...samples.map(s=>Math.abs(s.gradeDelta))),minimumExtremaSpacing:spacings.length?Math.min(...spacings):null,waveAmplitude:Math.max(0,...extrema.map(e=>e.amplitude)),waveLength:extrema.length?Math.max(...extrema.map(e=>e.wavelength)):0,nearestHardConstraintDistance:extrema.some(e=>e.nearestHardConstraintDistance!==null)?Math.min(...extrema.flatMap(e=>e.nearestHardConstraintDistance===null?[]:[e.nearestHardConstraintDistance])):null}};
}
export function profileIssues(context:MapAnalysisContext,id:string):MapIssue[]{
  const p=inspectProfile(context,id),result:MapIssue[]=[];
  for(const e of p.extrema)if(e.wavelength<=context.limits.localExtremumLength&&e.amplitude>=context.limits.localExtremumAmplitude){
    result.push(issue(e.constraintDriven?'vertical.constraintDrivenExtremum':'vertical.localExtremum',{roadId:id,station:e.station},e.constraintDriven?'Extremum supports a hard crossing/structure constraint':'Short local crest/sag is a repair candidate',{amplitude:e.amplitude,wavelength:e.wavelength,nearestHardConstraintDistance:e.nearestHardConstraintDistance},{constraintDriven:e.constraintDriven,severity:e.constraintDriven?'info':'warning',...(e.constraintDriven?{}:{repair:{op:'repairElevation',id,start:Math.max(0,e.station-e.wavelength/2),end:Math.min(p.length,e.station+e.wavelength/2),strategy:'smoothLocalExtremum'}})}));
  }
  return result;
}
export function inspectHorizontal(context:MapAnalysisContext,id:string){
  const road=context.road(id),path=context.path(id),table=stations(path);
  const segments=path.slice(1).map((p,i)=>({station:table[i]!,length:distance(path[i]!,p),heading:Math.atan2(p.x-path[i]!.x,-(p.z-path[i]!.z))}));
  const turns=segments.slice(1).map((s,i)=>({station:s.station,headingDelta:angleDelta(s.heading,segments[i]!.heading),curvature:angleDelta(s.heading,segments[i]!.heading)/Math.max(.001,(s.length+segments[i]!.length)/2)}));
  const selfCrossings:CityPoint[]=[];for(let i=1;i<path.length;i++)for(let k=i+2;k<path.length;k++)for(const c of crossings([path[i-1]!,path[i]!],[path[k-1]!,path[k]!]))selfCrossings.push(c.point);
  return {roadId:id,controlPoints:road.centerline,segments,turns,maxHeadingDelta:Math.max(0,...turns.map(t=>Math.abs(t.headingDelta))),selfCrossings,crossings:context.crossings(id),nearbyConflicts:context.roadCandidates(context.envelope(id).bbox).filter(r=>r.id!==id).map(r=>({roadId:r.id,distance:Math.min(...context.path(r.id).map(p=>project(path,p).distance)),approximate:true})),extrema:turns.filter((t,i)=>i>0&&t.headingDelta*turns[i-1]!.headingDelta<0)};
}
export type ProfileStrategy='smoothLocalExtremum'|'smoothWave'|'smoothGradeBreak'|'fitBetweenConstraints';
export interface ProfileRepairOptions extends ElevationOptions { strategy?:ProfileStrategy; anchors?:{station:number;elevation?:number}[] }
/** Pin existing hard constraints and split the requested interval at each anchor. */
export function repairConstrainedProfile(context:MapAnalysisContext,id:string,options:ProfileRepairOptions){
  const source=context.path(id),length=polylineLength(source),sourceStations=stations(source);
  const snap=(station:number)=>sourceStations.find(s=>Math.abs(s-station)<.05)??station;
  const start=snap(Math.max(0,options.start??0)),end=snap(Math.min(length,options.end??length));
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||start>length||end<0)throw new Error('Invalid profile repair interval');
  const constraints=context.hardConstraints(id),anchors=[...(options.anchors??[])];
  for(const anchor of anchors){
    if(!Number.isFinite(anchor.station)||anchor.station<start||anchor.station>end)throw new Error('Anchor lies outside repair interval');
    const existing=sampleAt(source,anchor.station).point.y??0;
    if(anchor.elevation!==undefined&&Math.abs(anchor.elevation-existing)>1e-6)throw new Error('Hard anchors must preserve source elevation; use an explicit elevation edit for redesign');
  }
  const table=stations(source);
  // Preserve the source segment containing each hard anchor. Inserting several
  // almost-coincident crossing stations creates sub-5cm nodes and can project
  // back onto the wrong branch of a looping ramp.
  const protectedStations=(station:number)=>{
    const i=table.findIndex(s=>s>=station-1e-8);
    if(i<0)return [length];
    if(Math.abs(table[i]!-station)<1e-8)return [table[i]!];
    return [table[Math.max(0,i-1)]!,table[i]!];
  };
  const cuts=[...new Set([start,end,...[...constraints,...anchors].flatMap(c=>protectedStations(c.station)).filter(s=>s>start&&s<end)])].sort((a,b)=>a-b);
  const result:CityPoint[]=[];
  for(let i=0;i<source.length;i++)if(table[i]!<start)result.push({...source[i]!});
  for(let i=1;i<cuts.length;i++){
    const a=cuts[i-1]!,b=cuts[i]!;
    const part=[sampleAt(source,a).point,...source.filter((_,k)=>table[k]!>a&&table[k]!<b),sampleAt(source,b).point];
    let repaired:CityPoint[];
    if(options.strategy==='fitBetweenConstraints'){const partTable=stations(part);repaired=part.map((p,k)=>({...p,y:(part[0]!.y??0)+((part.at(-1)!.y??0)-(part[0]!.y??0))*(partTable[k]!/Math.max(.001,b-a))}));}
    else repaired=repairElevation(part,{...options,start:undefined,end:undefined,preserveEndpoints:true,strength:options.strategy==='smoothGradeBreak'?.7:options.strength,monotonic:options.monotonic??options.strategy==='smoothLocalExtremum'}).points;
    // Vertical repairs never move XZ, so source stations and hard anchors stay exact.
    const repairedTable=stations(repaired),partTable=stations(part);
    repaired=part.map((p,k)=>({...p,y:sampleAt(repaired,Math.min(repairedTable.at(-1)!,partTable[k]!)).point.y??0}));
    repaired[0]={...part[0]!};repaired[repaired.length-1]={...part.at(-1)!};
    result.push(...(i===1?repaired:repaired.slice(1)).map(p=>({...p})));
  }
  result.push(...source.filter((_,i)=>table[i]!>end).map(p=>({...p})));
  const afterMap={...context.map,roads:context.map.roads.map(r=>r.id===id?{...r,centerline:result,curve:'polyline' as const,elevationMode:'custom' as const}:r)},after=new MapAnalysisContext(afterMap);
  const beforeProfile=inspectProfile(context,id),afterProfile=inspectProfile(after,id);
  for(const c of constraints)if(c.station>=start&&c.station<=end&&Math.abs((sampleAt(result,c.station).point.y??0)-c.elevation)>1e-6)throw new Error('Profile repair violates '+c.kind+' anchor');
  return {points:result,metrics:{before:beforeProfile.metrics,after:afterProfile.metrics,affectedStart:start,affectedEnd:end,preservedConstraints:constraints.length,strategy:options.strategy??'smoothWave'}};
}
