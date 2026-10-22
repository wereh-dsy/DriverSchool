import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {CityMapData} from '../src/world/city/CityMapData';
import {roadPoints,roadEdges,refreshPortPoses} from '../src/world/city/geometry';
import {bounds,overlaps,project} from '../src/editor/EditorGeometry';
import {rampProfile} from '../src/editor/RampProfileAudit';
import {designInterchange,localMap} from './InterchangeDesign';
import {adaptInterchangeAssets} from './InterchangeAssets';

const dir='artifacts/interchange-integrated-audit/',prior='artifacts/ramp-profile-audit/',source='src/world/regional/regional-main.json';
fs.mkdirSync(dir,{recursive:true});
const read=(name:string)=>JSON.parse(fs.readFileSync(name,'utf8')),save=(name:string,data:unknown)=>fs.writeFileSync(dir+name,JSON.stringify(data,null,2)+'\n');
const saveDesign=(name:string,data:unknown)=>{if(fs.existsSync(dir+name)){const old=fs.readFileSync(dir+name);fs.mkdirSync(dir+'design-history',{recursive:true});fs.writeFileSync(dir+'design-history/'+name.replace('.json','-'+createHash('sha256').update(old).digest('hex').slice(0,10)+'.json'),old);}save(name,data);};
const command=process.argv[2]??'inventory';
if(command==='replay-plan'){
  const before:CityMapData=read(dir+'baseline-map.json'),after:CityMapData=read(dir+'candidate-map.json'),changes=read(dir+'geometry-changes.json').rows,decisions=read(dir+'design-decisions.json'),inventory=read(dir+'interchange-inventory.json'),plans:any[]=[];
  for(const c of inventory.rows){const decision=decisions.find((d:any)=>d.clusterId===c.id);if(!decision?.geometryApplied)continue;const candidates=changes.filter((r:any)=>r.clusterId===c.id).sort((a:any,b:any)=>+(before.roads.find(r=>r.id===b.roadId)?.roadClass==='ramp')-+(before.roads.find(r=>r.id===a.roadId)?.roadClass==='ramp')||b.before.maxGradeBreak-a.before.maxGradeBreak);
    const selected=c.primaryGroup?candidates.slice(0,2):candidates.slice(0,1);for(const row of selected){const road=before.roads.find(r=>r.id===row.roadId)!,profile=rampProfile(road),worst=profile.breaks.reduce((a,b)=>a.gradeBreak>b.gradeBreak?a:b,{station:profile.length/2,gradeBreak:0});plans.push({clusterId:c.id,roadId:road.id,category:c.category,before:profile,focusFraction:Math.max(.08,Math.min(.92,worst.station/profile.length)),laneOffset:road.travelDirection==='two-way'?road.laneWidth/2:0,speedKph:Math.min(50,Math.max(20,Math.sqrt(Math.max(15,profile.minRadius??200)*1.3)*3.6))});}
  }fs.copyFileSync(dir+'baseline-map.json',dir+'before-map.json');save('replay-plans.json',plans);console.log(JSON.stringify({cases:plans.length,version:after.version,clusters:new Set(plans.map(p=>p.clusterId)).size}));
}
if(command==='merge-context'){
  const inventory=read(dir+'interchange-inventory.json');inventory.mergedClusters??=[];
  for(const [keep,remove]of [['interchange-06','interchange-07'],['interchange-27','interchange-28'],['interchange-24','interchange-29']]){
    const a=inventory.rows.find((r:any)=>r.id===keep),b=inventory.rows.find((r:any)=>r.id===remove);if(!a||!b)continue;
    for(const field of ['seedRoadIds','roadIds','problemRoadIds','ownedProblemRoadIds','regionIndices','objectIds','signIds'])a[field]=[...new Set([...a[field],...b[field]])];
    a.name+=' + '+b.name;a.relatedClusters=[...new Set([...a.relatedClusters,...b.relatedClusters])].filter(id=>id!==keep&&id!==remove);for(const c of inventory.rows)c.relatedClusters=c.relatedClusters.map(id=>id===remove?keep:id).filter(id=>id!==c.id);
    for(const field of ['boundary','conflictBounds'])a[field]={minX:Math.min(a[field].minX,b[field].minX),maxX:Math.max(a[field].maxX,b[field].maxX),minZ:Math.min(a[field].minZ,b[field].minZ),maxZ:Math.max(a[field].maxZ,b[field].maxZ)};
    inventory.rows=inventory.rows.filter((r:any)=>r.id!==remove);inventory.mergedClusters.push({id:remove,owner:keep,reason:'Connected approach/foldback or paired carriageway segments belong to one physical corridor; retained as context, not an independent defect'});
  }inventory.clusters=inventory.rows.length;assert.equal(new Set(inventory.rows.flatMap((c:any)=>c.ownedProblemRoadIds)).size,137);save('interchange-inventory.json',inventory);console.log(JSON.stringify({clusters:inventory.clusters,records:137,merged:inventory.mergedClusters}));
}
if(command==='assemble'){
  const before:CityMapData=read(dir+'baseline-map.json'),inventory=read(dir+'interchange-inventory.json'),applied:any[]=[],assets:any[]=[],decisions:any[]=[];let after=structuredClone(before);
  const selected=process.argv.slice(3).filter(s=>s.startsWith('interchange-'));
  for(const c of inventory.rows){
    if(selected.length&&!selected.includes(c.id))continue;
    const alternatives=['coupled','access-extended','outboard','structural','junction-realignment','frontage-shift'].map(p=>dir+c.id+'-'+p+'.json').filter(p=>fs.existsSync(p)).map(p=>({file:p,...read(p)})),choice=alternatives.find(r=>r.accepted);
    if(!choice){decisions.push({clusterId:c.id,status:'DEFER_UNRESOLVED',attempts:alternatives.map(({roads,overlapConstraints,validation,...r})=>({...r,badFootprints:validation?.filter((v:any)=>!v.valid)}))});continue;}
    const conflicting=choice.roads.filter((r:any)=>applied.some(a=>a.roadId===r.id)&&JSON.stringify(after.roads.find(a=>a.id===r.id))!==JSON.stringify(r));
    if(conflicting.length){decisions.push({clusterId:c.id,status:'DEFER_UNRESOLVED',reason:'Related cluster already changed this corridor; combined final validation/reconciliation is required',roadIds:conflicting.map((r:any)=>r.id)});continue;}
    const checkpoint=structuredClone(after);
    for(const road of choice.roads){after.roads[after.roads.findIndex(r=>r.id===road.id)]=road;const change=choice.changes.find((p:any)=>p.roadId===road.id);applied.push({...change,clusterId:c.id,plan:choice.plan});}
    for(const port of after.connectionPorts??[])if(choice.roadIds.includes(port.endpoint.roadId)){const p=roadPoints(after.roads.find(r=>r.id===port.endpoint.roadId)!);if(port.position)port.position=port.endpoint.end==='start'?p[0]!:p.at(-1)!;}
    const assetIds=[...new Set<string>([...c.roadIds,...before.signs!.filter(s=>c.signIds.includes(s.id)).map(s=>s.roadId)])];
    const asset=adaptInterchangeAssets(localMap(before,assetIds),localMap(after,assetIds),{...c,roadIds:assetIds},new Set<string>(choice.roadIds));assets.push(asset);
    const unsafe=asset.newRoadBuildingConflicts.length||asset.checks.some(c=>c.beforeSafe&&!c.afterSafe);
    if(unsafe){after=checkpoint;for(let i=applied.length-1;i>=0;i--)if(applied[i].clusterId===c.id)applied.splice(i,1);(asset as any).proposalWithdrawn=true;}
    decisions.push({clusterId:c.id,status:unsafe||asset.unresolved.length||asset.pierConflicts.length||asset.roadBuildingConflicts.length?'DEFER_UNRESOLVED':'FIXED',plan:choice.plan,geometryApplied:!unsafe,roadIds:choice.roadIds,endpointMoves:choice.endpointMoves??[],assetUnresolved:asset.unresolved.map((x:any)=>x.id),pierConflicts:asset.pierConflicts,roadBuildingConflicts:asset.roadBuildingConflicts,withdrawnForNewAssetConflict:!!unsafe});
    console.log(JSON.stringify({id:c.id,geometry:choice.roads.length,applied:!unsafe,adjustedAssets:asset.adjustments.length,unresolvedAssets:asset.unresolved.length,pierConflicts:asset.pierConflicts.length,roadBuildingConflicts:asset.roadBuildingConflicts.length}));
  }
  refreshPortPoses({...after,connectionPorts:after.connectionPorts?.filter(p=>applied.some(a=>a.roadId===p.endpoint.roadId))});
  after.version=487;save('candidate-map.json',after);save('geometry-changes.json',{baselineVersion:486,candidateVersion:487,rows:applied});save('asset-adjustments.json',{clusters:assets});save('design-decisions.json',decisions);
}
if(command==='design-all'){
  const map:CityMapData=read(dir+'baseline-map.json'),inventory=read(dir+'interchange-inventory.json');
  for(const cluster of inventory.rows){
    const file=cluster.id+'-coupled.json';if(process.argv.includes('--resume')&&fs.existsSync(dir+file))continue;
    const result=designInterchange(map,cluster,'coupled');saveDesign(file,result);
    console.log(JSON.stringify({id:cluster.id,name:cluster.name,accepted:result.accepted,roads:result.roadIds.length,residual:result.residual,worst:result.worst?.[0]}));
  }
}
if(command==='design-selected'){
  const map:CityMapData=read(dir+'baseline-map.json'),inventory=read(dir+'interchange-inventory.json'),selected=process.argv.slice(3).filter(a=>a.startsWith('interchange-')),plan=process.argv.includes('--outboard')?'outboard':process.argv.includes('--extend')?'access-extended':process.argv.includes('--structural')?'structural':process.argv.includes('--junction')?'junction-realignment':process.argv.includes('--frontage')?'frontage-shift':'coupled';
  for(const id of selected){const c=inventory.rows.find((c:any)=>c.id===id);assert(c);const result=designInterchange(map,c,plan);saveDesign(id+'-'+plan+'.json',result);console.log(JSON.stringify({id,accepted:result.accepted,roads:result.roadIds.length,residual:result.residual,bad:result.validation?.filter(v=>!v.valid).length,impossible:result.impossible?.length}));}
}
if(command==='design'){
  const map:CityMapData=read(dir+'baseline-map.json'),inventory=read(dir+'interchange-inventory.json');
  const cluster=inventory.rows.find((c:any)=>c.id===process.argv[3]);assert(cluster,'Unknown cluster');
  const result=designInterchange(map,cluster,process.argv[4]==='outboard'?'outboard':'coupled');
  save(cluster.id+'-'+(process.argv[4]??'coupled')+'.json',result);
  const {roads,changes,overlapConstraints,...summary}=result;console.log(JSON.stringify({...summary,changes:changes?.map((c:any)=>({id:c.roadId,grade:[c.before.maxGrade,c.after.maxGrade],break:[c.before.maxGradeBreak,c.after.maxGradeBreak],maxY:c.maxYChange,maxXZ:c.maxXZChange}))},null,2));
}
if(command==='inventory'){
  const map:CityMapData=read(source),deferred=read(prior+'deferred.json').rows,crossing=read(prior+'crossing-clearance-audit.json'),attempts=read(prior+'round2/attempts.json'),large=read(prior+'large-elevation-review.json'),validation=read(prior+'changed-region-validation.json'),runtime=read(prior+'runtime-regression.json'),report=fs.readFileSync(prior+'REPORT.md','utf8');
  assert.equal(map.version,486);assert.equal(deferred.length,137);
  if(!fs.existsSync(dir+'baseline-map.json'))fs.copyFileSync(source,dir+'baseline-map.json');
  const byId=new Map(map.roads.map(r=>[r.id,r])),regions=crossing.regions.filter((r:any)=>r.classification==='DEFER_UNRESOLVED'),problemIds=new Set<string>(deferred.map((r:any)=>r.roadId)),nodes:Map<string,any>=new Map();
  // First connect actual conflict regions spatially. A long shared mainline ID
  // alone must not collapse distant interchanges into one city-wide component.
  const seeds=regions.map((r:any)=>({point:r.point,roadIds:new Set<string>(r.roadIds),regions:[r.index]}));
  for(const row of deferred){if(regions.some((r:any)=>r.roadIds.includes(row.roadId)))continue;const p=rampProfile(byId.get(row.roadId)!),worst=p.breaks.reduce((a,b)=>a.gradeBreak>b.gradeBreak?a:b);const path=roadPoints(byId.get(row.roadId)!);let at=0,point=path[0]!;for(let i=1;i<path.length;i++){at+=Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z);if(at>=worst.station){point=path[i]!;break;}}seeds.push({point,roadIds:new Set([row.roadId]),regions:[]});}
  const parent=seeds.map((_:any,i:number)=>i),find=(i:number):number=>parent[i]===i?i:parent[i]=find(parent[i]!);
  for(let i=0;i<seeds.length;i++)for(let j=0;j<i;j++){const a=seeds[i]!,b=seeds[j]!,distance=Math.hypot(a.point.x-b.point.x,a.point.z-b.point.z),ga=[...a.roadIds].map(id=>byId.get(id)?.groupId).filter(id=>id&&/system-|regional:/.test(id)),sameGroup=[...b.roadIds].some(id=>ga.includes(byId.get(id)?.groupId)),shared=[...a.roadIds].some(id=>b.roadIds.has(id));if(distance<180||distance<650&&shared||sameGroup&&distance<1800)parent[find(i)]=find(j);}
  for(const [i,seed]of seeds.entries()){const key=String(find(i)),n=nodes.get(key)??{seedRoadIds:new Set<string>(),regions:[],points:[]};for(const id of seed.roadIds)n.seedRoadIds.add(id);n.regions.push(...seed.regions);n.points.push(seed.point);nodes.set(key,n);}
  const roadBounds=new Map(map.roads.map(r=>[r.id,bounds(roadPoints(r))])),category=new Map(deferred.map((r:any)=>[r.roadId,r.category]));
  const clusters=[...nodes.values()].map((n:any,index:number)=>{
    const groupNames=[...new Set([...n.seedRoadIds].map((id:any)=>byId.get(id)?.groupId).filter((s:any)=>s&&(/system-|regional:/.test(s))))] as string[],primary=groupNames.sort((a,b)=>[...n.seedRoadIds].filter((id:any)=>byId.get(id)?.groupId===b).length-[...n.seedRoadIds].filter((id:any)=>byId.get(id)?.groupId===a).length)[0];
    const ids=new Set<string>(n.seedRoadIds);for(const r of map.roads)if(primary&&r.groupId===primary)ids.add(r.id);
    for(const s of [...(map.regional?.structures??[]),...(map.regional?.highways?.junctions??[])])if(s.kind==='interchange'&&s.roadIds.some(id=>ids.has(id)))for(const id of s.roadIds)ids.add(id);
    const core=bounds([...ids].flatMap(id=>roadPoints(byId.get(id)!)),80);
    // Complete connected approaches and short lane-change fragments. Full road
    // profiles are retained; boundaries lie outside the conflict footprints.
    for(let depth=0;depth<3;depth++){const next=new Set(ids);for(const l of map.roadLinks??[])if(ids.has(l.from.roadId)||ids.has(l.to.roadId))for(const e of [l.from,l.to])if(overlaps(roadBounds.get(e.roadId)!,core))next.add(e.roadId);for(const id of next)ids.add(id);}
    for(const r of map.roads)if(overlaps(roadBounds.get(r.id)!,core))ids.add(r.id);
    const box=bounds(n.points,120),objectIds=map.objects.filter(o=>o.position.x>=core.minX&&o.position.x<=core.maxX&&o.position.z>=core.minZ&&o.position.z<=core.maxZ).map(o=>o.id),signIds=(map.signs??[]).filter(s=>ids.has(s.roadId)||s.decisionIds?.some(id=>ids.has(id))).map(s=>s.id),categories=[...n.seedRoadIds].map((id:any)=>category.get(id)).filter(Boolean).sort(),cat=categories[0]??'D',name=primary??[...n.seedRoadIds].find((id:any)=>byId.get(id)?.roadClass==='ramp')??[...n.seedRoadIds][0];
    return {id:'interchange-'+String(index+1).padStart(2,'0'),name,category:cat,priority:n.regions.length*3+[...ids].filter(id=>byId.get(id)?.roadClass==='ramp').length,primaryGroup:primary??null,seedRoadIds:[...n.seedRoadIds],roadIds:[...ids],problemRoadIds:[...ids].filter(id=>problemIds.has(id)),regionIndices:[...new Set(n.regions)],conflictBounds:box,boundary:core,objectIds,signIds,relatedClusters:[] as string[],status:'BASELINED',rootCauses:[]};
  }).sort((a,b)=>a.category.localeCompare(b.category)||b.priority-a.priority);
  // A shared context road is explicitly related rather than claimed twice as
  // two independent failures. Each physical issue has one cluster owner.
  for(const a of clusters)for(const b of clusters)if(a!==b&&(a.roadIds.some(id=>b.seedRoadIds.includes(id))||overlaps(a.conflictBounds,b.conflictBounds)))a.relatedClusters.push(b.id);
  for(const c of clusters)(c as any).ownedProblemRoadIds=[];
  for(const row of deferred){const road=byId.get(row.roadId)!,candidates=clusters.filter(c=>c.problemRoadIds.includes(row.roadId)).sort((a,b)=>+(b.primaryGroup===road.groupId)-+(a.primaryGroup===road.groupId)||+b.seedRoadIds.includes(row.roadId)-+a.seedRoadIds.includes(row.roadId)||a.roadIds.length-b.roadIds.length);(candidates[0]as any).ownedProblemRoadIds.push(row.roadId);}
  for(const c of clusters)if(!c.primaryGroup&&c.category==='B'&&c.seedRoadIds.some(id=>byId.get(id)?.roadClass==='ramp'))c.category='C';
  clusters.sort((a,b)=>a.category.localeCompare(b.category)||b.priority-a.priority);
  const covered=new Set(clusters.flatMap(c=>c.problemRoadIds));assert(deferred.every((r:any)=>covered.has(r.roadId)),'Every original record has a physical cluster');
  save('interchange-inventory.json',{baselineVersion:486,records:137,clusters:clusters.length,method:'Spatial conflict components plus interchange ownership, explicit endpoint context, full overlap partners and approach roads. Shared context is cross-referenced; physical issue regions have a single owner.',rows:clusters});
  save('baseline-evidence.json',{mapVersion:map.version,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),previousReportRead:report.length,previousAttempts:attempts.length,reusedLargeReviewKeys:Object.keys(large),previousValidation:{valid:validation.valid,changedRoads:validation.changedRoads},previousRuntime:runtime.summary,sourceFiles:['REPORT.md','deferred.json','round2/attempts.json','large-elevation-review.json','changed-region-validation.json','crossing-clearance-audit.json','runtime-regression.json'],physicsFrozen:Object.fromEntries(['src/vehicle/physics/VehicleContactSystem.ts','src/vehicle/physics/WheelSupportContinuity.ts','src/vehicle/diagnostics/VehiclePhysicsBlackBox.ts','src/world/city/CityGround.ts'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))});
  console.log(JSON.stringify({clusters:clusters.length,rows:clusters.map(c=>({id:c.id,name:c.name,category:c.category,records:c.problemRoadIds.length,issues:c.regionIndices.length,roads:c.roadIds.length,objects:c.objectIds.length,signs:c.signIds.length}))},null,2));
}
