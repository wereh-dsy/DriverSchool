import fs from 'node:fs';
import type {CityMapData} from '../src/world/city/CityMapData';
import {roadPoints,roadEdges,polylineLength,sampleAt} from '../src/world/city/geometry';
import {roadEdgeChains} from '../src/world/city/RoadEdgeChain';
import {roadCarriageways,hasCentralBarrier} from '../src/world/city/RoadCarriageway';
import {roadFunction} from '../src/world/city/RoadClassification';
import {rampProfile} from '../src/editor/RampProfileAudit';
const dir='artifacts/interchange-integrated-audit/',map:CityMapData=JSON.parse(fs.readFileSync(dir+'road-surface-baseline-map.json','utf8')),audit=JSON.parse(fs.readFileSync(dir+'road-surface-baseline-sampling.json','utf8')),chain=roadEdgeChains(map),carriageways=roadCarriageways(map);
const folds:any[]=[],grade:any[]=[],inventory:any[]=[];
for(const r of map.roads){
 const row=audit.rows.find((a:any)=>a.roadId===r.id),path=roadPoints(r),edges=roadEdges(r);
 if(row?.downwardTriangles){const left=chain.edge(r,edges.left),right=chain.edge(r,edges.right);let station=0;
  for(let i=1;i<left.length;i++){
   const dl=Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z);
   for(const [k,[a,b,c]]of [[left[i-1]!,right[i-1]!,left[i]!],[right[i-1]!,right[i]!,left[i]!]].entries()){
    const area=((b!.x-a!.x)*(c!.z-a!.z)-(b!.z-a!.z)*(c!.x-a!.x))/2;
    if(area>1e-8)folds.push({roadId:r.id,segment:i-1,triangle:k,station,centreSegmentLength:dl,area,roadWidth:edges.width,centre:path.slice(Math.max(0,i-2),i+2),vertices:[a,b,c]});
   }station+=dl;
  }
 }
 if(row?.maxGradeBreak>.04)grade.push({roadId:r.id,profile:rampProfile(r)});
 const kind=roadFunction(r);if(kind!=='expressway'&&kind!=='arterial'&&r.designProfile!=='motorway')continue;
 const length=polylineLength(path),runs:any[]=[];let previous:string|undefined;
 for(let d=0;d<=length;d=Math.min(length,d+(d<50||length-d<50?2:10))){
  const f=sampleAt(path,d),pair=carriageways.opposing(r,f.point,f.tangent),classification=r.travelDirection==='two-way'?hasCentralBarrier(r)?'SHARED_SOLID_CENTRE':'SHARED_PAINTED_CENTRE':pair?pair.laneGap<.6?'INSUFFICIENT_MEDIAN_RESERVE':pair.sharedPavement?'PAIRED_SHARED_SHOULDERS':'SEPARATED_CARRIAGEWAYS':'ONE_WAY_UNPAIRED',key=classification+':'+(pair?.road.id??'');
  if(key!==previous){runs.push({start:d,end:d,classification,oppositeRoadId:pair?.road.id,laneGap:pair?.laneGap,pavementGap:pair?.pavementGap});previous=key;}else runs.at(-1)!.end=d;
  if(d===length)break;
 }
 inventory.push({roadId:r.id,roadFunction:kind,length,laneCount:r.laneCount,travelDirection:r.travelDirection,medianIntent:r.structure?.medianBarrierStyle??null,barrierEnabled:r.structure?.barrierEnabled??null,runs});
}
const transitions=map.roadLinks?.filter(l=>{const a=map.roads.find(r=>r.id===l.from.roadId)!,b=map.roads.find(r=>r.id===l.to.roadId)!;return (a.travelDirection==='two-way')!==(b.travelDirection==='two-way')&&(roadFunction(a)==='expressway'||roadFunction(b)==='expressway'||roadFunction(a)==='arterial'||roadFunction(b)==='arterial');});
fs.writeFileSync(dir+'surface-root-cause-diagnostics.json',JSON.stringify({folds,grade,inventory,transitions},null,2));
console.log(JSON.stringify({folds:folds.map(f=>({id:f.roadId,i:f.segment,length:f.centreSegmentLength,area:f.area})),grade:grade.map(g=>({id:g.roadId,breaks:g.profile.breaks.filter((b:any)=>b.gradeBreak>.04)})),inventory:inventory.length,transitions:transitions?.length,classes:inventory.flatMap(r=>r.runs).reduce((a:any,r:any)=>(a[r.classification]=(a[r.classification]??0)+1,a),{})}));
