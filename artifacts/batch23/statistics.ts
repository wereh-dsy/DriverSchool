import {readFileSync,writeFileSync} from 'node:fs';
import {analysisContext} from '../../src/editor/MapAnalysis';
import {editableObjects,isBuilding} from '../../src/editor/ObjectAnalysis';
import {roadFunction} from '../../src/world/city/RoadClassification';
import {polylineLength,roadPoints} from '../../src/world/city/geometry';
import {inspectProfile} from '../../src/editor/RoadProfileAnalysis';
import type {CityMapData} from '../../src/world/city/CityMapData';
const before=JSON.parse(readFileSync('artifacts/batch23/before.json','utf8')) as CityMapData,after=JSON.parse(readFileSync('src/world/regional/regional-main.json','utf8')) as CityMapData;
const a=analysisContext(before),b=analysisContext(after),old=editableObjects(a),next=editableObjects(b),nextIds=new Map(next.map(o=>[o.id,o]));
const group=(o:typeof old[number])=>o.kind==='trafficLight'?'trafficLight':o.kind==='sign'||['traffic_sign','guide_sign'].includes(o.type)?'roadSign':o.type.startsWith('streetlight')?'streetlight':o.type==='tree'?'tree':isBuilding(o.type)?'building':['green_strip','embankment'].includes(o.type)?'vegetation':'roadsideProps';
const counts:Record<string,{moved:number;supportOrContent:number;removed:number;total:number}>={};
for(const o of old){
  const n=nextIds.get(o.id),changed=!!n&&JSON.stringify([o.position,o.rotation,o.size])!==JSON.stringify([n.position,n.rotation,n.size]);
  const signChanged=o.kind==='sign'&&!!n&&JSON.stringify(before.signs!.find(s=>s.id===o.id))!==JSON.stringify(after.signs!.find(s=>s.id===o.id));
  if(n&&!changed&&!signChanged)continue;
  const key=group(o),c=counts[key]??{moved:0,supportOrContent:0,removed:0,total:0};if(!n)c.removed++;else if(changed)c.moved++;else c.supportOrContent++;c.total++;counts[key]=c;
}
const profiles=JSON.parse(readFileSync('artifacts/batch23/all-ramp-profile-audit.json','utf8'));
const ramps=after.roads.filter(r=>roadFunction(r)==='ramp'),afterProfiles=ramps.map(r=>({id:r.id,...inspectProfile(b,r.id).metrics}));
const access=before.editing!.ramps.filter(r=>/^(v91-ew|v91-ns|access-ew|access-ns)/.test(r.roadId)).map(m=>({id:m.roadId,before:polylineLength(a.path(m.roadId)),after:polylineLength(b.path(m.roadId)),grade:inspectProfile(b,m.roadId).metrics.maxGrade}));
const profileChanged=before.roads.filter(r=>roadFunction(r)==='ramp'&&JSON.stringify(roadPoints(r))!==JSON.stringify(b.path(r.id))).map(r=>r.id);
const structureChanged=before.roads.filter(r=>JSON.stringify(r.structure)!==JSON.stringify(after.roads.find(s=>s.id===r.id)?.structure)).map(r=>({id:r.id,before:r.structure,after:after.roads.find(s=>s.id===r.id)!.structure}));
const report={mapVersions:[before.version,after.version],roads:[before.roads.length,after.roads.length],originalRoadsRemoved:before.roads.filter(r=>!after.roads.some(s=>s.id===r.id)).map(r=>r.id),counts,access,rampsInspected:profiles.length,profileExtrema:{before:profiles.reduce((n:number,p:any)=>n+p.metrics.extremaCount,0),after:afterProfiles.reduce((n,p)=>n+p.extremaCount,0)},profileChanged,structureChanged};
writeFileSync('artifacts/batch23/final-statistics.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
