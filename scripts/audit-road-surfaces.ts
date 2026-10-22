import fs from 'node:fs';
import {createHash} from 'node:crypto';
import type {CityMapData,CityRoad,CityPoint} from '../src/world/city/CityMapData';
import {CityGround} from '../src/world/city/CityGround';
import {SectorManager} from '../src/world/city/SectorManager';
import {buildCityRoadNetwork} from '../src/world/city/CityRoadNetwork';
import {roadPoints,roadEdges} from '../src/world/city/geometry';
import {roadEdgeChains} from '../src/world/city/RoadEdgeChain';
import {roadFunction} from '../src/world/city/RoadClassification';
import {roadPavementTriangle} from '../src/world/city/RoadPavementSurface';
import {compileJunctionSurface} from '../src/world/city/JunctionSurface';
import {rampProfile} from '../src/editor/RampProfileAudit';
import {bounds,EditorSpatialIndex} from '../src/editor/EditorGeometry';
import {stations} from '../src/editor/MapAnalysis';
import {TAYCAN_4S_DIMENSIONS} from '../src/vehicle/VehicleDimensions';

const sourceIndex=process.argv.indexOf('--source');
const dir='artifacts/interchange-integrated-audit/',source=sourceIndex<0?'src/world/regional/regional-main.json':process.argv[sourceIndex+1]!,phase=process.argv.includes('--after')?'after':'baseline',limitIndex=process.argv.indexOf('--limit'),limit=limitIndex<0?Infinity:Number(process.argv[limitIndex+1]);
const raw=fs.readFileSync(source),sourceHash=createHash('sha256').update(raw).digest('hex'),map:CityMapData=JSON.parse(raw.toString()),paths=new Map(map.roads.map(r=>[r.id,roadPoints(r)])),profiles=new Map(map.roads.map(r=>[r.id,rampProfile(r)]));
const fast=(r:CityRoad)=>roadFunction(r)==='expressway'||r.designProfile==='motorway',targets=map.roads.filter(r=>fast(r)||profiles.get(r.id)!.heightRange<.2&&Math.min(...paths.get(r.id)!.map(p=>p.y??0))>2),byId=new Map(map.roads.map(r=>[r.id,r]));
fs.mkdirSync(dir,{recursive:true});if(phase==='baseline'&&!fs.existsSync(dir+'road-surface-baseline-map.json'))fs.writeFileSync(dir+'road-surface-baseline-map.json',raw);
const checkpoint=dir+'surface-'+phase+'-checkpoints.ndjson',rows:any[]=[];
const refreshIndex=process.argv.indexOf('--refresh-near-road'),refreshRoad=process.argv.includes('--refresh-changed-roads')?'changed-pavements':refreshIndex<0?undefined:process.argv[refreshIndex+1],refreshIds=new Set<string>();
if(refreshRoad){
 const prior=JSON.parse(fs.readFileSync(dir+'road-surface-'+phase+'-sampling.json','utf8')),old:CityMapData=JSON.parse(fs.readFileSync(process.argv.includes('--refresh-reference')?process.argv[process.argv.indexOf('--refresh-reference')+1]!:dir+'surface-replays/candidate-map.json','utf8'));
 if(!prior.complete)throw new Error('Incremental validation requires a complete dense pass');rows.push(...prior.rows);
 const changed=map.roads.filter(r=>refreshRoad==='changed-pavements'?JSON.stringify(r)!==JSON.stringify(old.roads.find(q=>q.id===r.id)):r.id===refreshRoad),changedIds=new Set(changed.map(r=>r.id)),areas=changed.map(r=>bounds([...roadPoints(r),...roadPoints(old.roads.find(q=>q.id===r.id)!)],40)),hit=(b:ReturnType<typeof bounds>)=>areas.some(area=>b.minX<=area.maxX&&b.maxX>=area.minX&&b.minZ<=area.maxZ&&b.maxZ>=area.minZ);
 for(const r of targets)if(hit(bounds(roadPoints(r),20)))refreshIds.add(r.id);
 for(const r of map.roads)if(!changedIds.has(r.id)&&JSON.stringify(r)!==JSON.stringify(old.roads.find(q=>q.id===r.id)))throw new Error('Unexpected pavement change outside incremental repair: '+r.id);
}else if(process.argv.includes('--resume')&&fs.existsSync(checkpoint)){const lines=fs.readFileSync(checkpoint,'utf8').trim().split('\n').map(l=>JSON.parse(l));if(lines[0].sourceHash!==sourceHash)throw new Error('Surface checkpoint belongs to a different map snapshot');rows.push(...lines.slice(1));}
else fs.writeFileSync(checkpoint,JSON.stringify({sourceHash,mapVersion:map.version,phase})+'\n');
const inventory={sourceHash,mapVersion:map.version,roads:map.roads.length,controlledAccessRoads:map.roads.filter(fast).length,raisedFlatAdditional:targets.filter(r=>!fast(r)).length,totalTargetMetres:targets.reduce((v,r)=>v+profiles.get(r.id)!.length,0),rows:targets.map(r=>{const {segments,breaks,...p}=profiles.get(r.id)!;return {...p,roadFunction:roadFunction(r),laneCount:r.laneCount,travelDirection:r.travelDirection,designProfile:r.designProfile??null};})};
fs.writeFileSync(dir+'road-surface-'+phase+'-inventory.json',JSON.stringify(inventory,null,2));
console.log(JSON.stringify({phase,roads:targets.length,kilometres:inventory.totalTargetMetres/1000,resumed:rows.length}));
if(process.argv.includes('--inventory-only'))process.exit(0);

// Use the actual CityGround query and all authored road/junction pavements.
// Only visual terrain/streaming extents and solid furniture are reduced for
// this offline surface-only pass. No game source or selection rule is changed.
const first=paths.get(targets[0]!.id)![0]!,area=bounds([first],8),auditMap:CityMapData={...map,sectorSize:32,bounds:area,regional:{...map.regional!,cityBounds:area,cityExtensions:[],terrainBounds:area,routes:[],structures:[]},objects:map.objects.filter(o=>o.prefabId==='parking'),signs:[],roads:map.roads,environment:{...map.environment,spawnPoints:[{id:'surface-audit',position:first,rotation:0}]}};
// This surface-only CLI never publishes visual sectors. Editor mode would
// eagerly construct the entire city's visuals, unrelated to these queries.
SectorManager.prototype.updatePosition=function(){return false;};
const ground=new CityGround(auditMap,{runtime:{map:auditMap,roadNetwork:buildCityRoadNetwork(auditMap)}}),chains=roadEdgeChains(map);
console.log(JSON.stringify({surfaceIndexReady:true,initializationMs:ground.initializationMs}));
type Plane=ReturnType<typeof roadPavementTriangle>;
const render=new Map<string,{planes:(Plane|undefined)[];floatPlanes:(Plane|undefined)[];downward:number;degenerate:number}>(),meshIndex=new EditorSpatialIndex(32),meshEntries:{roadId:string;plane:Plane;floatPlane:Plane}[]=[];
for(const r of map.roads){const e=roadEdges(r),left=chains.edge(r,e.left),right=chains.edge(r,e.right),planes:(Plane|undefined)[]=[],floatPlanes:(Plane|undefined)[]=[];let downward=0,degenerate=0;
  const masks=map.intersections.filter(j=>j.pavementFootprint&&j.connections.some(c=>c.roadId===r.id)).map(compileJunctionSurface);
  for(let i=1;i<left.length;i++)for(const [k,points]of [[left[i-1]!,right[i-1]!,left[i]!],[right[i-1]!,right[i]!,left[i]!]].entries()){
    const [a,b,c]=points as [CityPoint,CityPoint,CityPoint],den=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(den)<1e-8){degenerate++;continue;}if(den>0)downward++;
    const plane=roadPavementTriangle(a,b,c,1,masks),f=points.map(p=>({x:Math.fround(p.x),z:Math.fround(p.z),y:Math.fround((p.y??0)+.024)-.024})),floatPlane=roadPavementTriangle(f[0]!,f[1]!,f[2]!,1),index=(i-1)*2+k;planes[index]=plane;floatPlanes[index]=floatPlane;meshIndex.set(String(meshEntries.length),bounds(points,.02));meshEntries.push({roadId:r.id,plane,floatPlane});
  }render.set(r.id,{planes,floatPlanes,downward,degenerate});
}
const junctions=map.intersections.filter(j=>j.pavementFootprint).map(j=>({id:j.id,surface:compileJunctionSurface(j)})),junctionIndex=new EditorSpatialIndex(64);junctions.forEach((j,i)=>{const original=map.intersections.find(r=>r.id===j.id)!;junctionIndex.set(String(i),bounds(original.pavementFootprint!.map(p=>{const c=Math.cos(original.rotation),s=Math.sin(original.rotation);return {x:original.position.x+p.x*c+p.z*s,z:original.position.z-p.x*s+p.z*c};})));});
const meshAt=(id:string,x:number,z:number,near:number,height:number)=>{
  const entries=render.get(id)!;let best:Plane|undefined,float:Plane|undefined,error=Infinity;
  for(let k=Math.max(0,near*2-24);k<Math.min(entries.planes.length,near*2+26);k++){const p=entries.planes[k];if(!p||!p.contains(.00001)(x,z))continue;const e=Math.abs(p.heightAt(x,z)-height);if(e<error){best=p;float=entries.floatPlanes[k];error=e;}}
  if(best)return {height:best.heightAt(x,z),floatHeight:float!.heightAt(x,z),normalY:1/Math.hypot(best.gx,1,best.gz)};
  for(const key of junctionIndex.query({minX:x,maxX:x,minZ:z,maxZ:z})){const p=junctions[+key]!.surface;if(p.contains(x,z)){const y=p.heightAt(x,z);if(Math.abs(y-height)<1.75)return {height:y,floatHeight:y,normalY:1};}}
  for(const key of meshIndex.query({minX:x,maxX:x,minZ:z,maxZ:z})){const e=meshEntries[+key]!;if(!e.plane.contains(0)(x,z))continue;const d=Math.abs(e.plane.heightAt(x,z)-height);if(d<error){best=e.plane;float=e.floatPlane;error=d;}}
  return best?{height:best.heightAt(x,z),floatHeight:float!.heightAt(x,z),normalY:1/Math.hypot(best.gx,1,best.gz)}:undefined;
};
try{
  const work=Array.from({length:Math.min(targets.length,limit)},(_,i)=>i).filter(i=>refreshRoad?refreshIds.has(targets[i]!.id):i>=rows.length);
  for(const ri of work){
    const r=targets[ri]!,path=paths.get(r.id)!,s=stations(path),profile=profiles.get(r.id)!,step=profile.maxGrade<.005||profile.heightRange<.1?.25:.5,L=s.at(-1)!,laneOffsets=Array.from({length:r.laneCount},(_,i)=>(i+.5-r.laneCount/2)*r.laneWidth),flat=profile.maxGrade<.005||profile.heightRange<.1;
    let segment=0,count=0,missingMesh=0,missingRoad=0,maxError=0,maxFloatError=0,sumError2=0,roadSwitches=0,surfaceSwitches=0,maxUnexpectedStep=0,maxMeshGradeBreak=0,maxContactGradeBreak=0;
    let meshBreakWitness:any;const previous=new Map<string,{road?:string;surface?:string;mesh:number;height:number;station:number;meshGrade?:number;contactGrade?:number}>(),worst:any[]=[];
    const probe=(x:number,z:number,expected:number,station:number,lane:number,wheel:string)=>{
      const mesh=meshAt(r.id,x,z,segment,expected);if(!mesh){missingMesh++;return;}const surface=ground.sampleRoadSurface(x,z,undefined,mesh.height),trace=lane+':'+wheel,prior=previous.get(trace);count++;
      if(surface.reference?.kind==='terrain'){missingRoad++;return;}const error=Math.abs(surface.height-mesh.height);sumError2+=error*error;maxError=Math.max(maxError,error);maxFloatError=Math.max(maxFloatError,Math.abs(surface.height-mesh.floatHeight));
      if(prior){if(surface.reference?.roadId!==prior.road)roadSwitches++;if(surface.reference?.surfaceId!==prior.surface)surfaceSwitches++;const ds=station-prior.station,mg=(mesh.height-prior.mesh)/ds,cg=(surface.height-prior.height)/ds;maxUnexpectedStep=Math.max(maxUnexpectedStep,Math.abs((surface.height-prior.height)-(mesh.height-prior.mesh)));if(prior.meshGrade!==undefined&&Math.abs(mg-prior.meshGrade)>maxMeshGradeBreak){maxMeshGradeBreak=Math.abs(mg-prior.meshGrade);meshBreakWitness={station,lane,wheel,x,z,previousMeshGrade:prior.meshGrade,meshGrade:mg,height:mesh.height,supportRoad:surface.reference?.roadId};}if(prior.contactGrade!==undefined)maxContactGradeBreak=Math.max(maxContactGradeBreak,Math.abs(cg-prior.contactGrade));previous.set(trace,{road:surface.reference?.roadId,surface:surface.reference?.surfaceId,mesh:mesh.height,height:surface.height,station,meshGrade:mg,contactGrade:cg});}
      else previous.set(trace,{road:surface.reference?.roadId,surface:surface.reference?.surfaceId,mesh:mesh.height,height:surface.height,station});
      if(error>.003&&(worst.length<8||error>worst.at(-1)!.error)){worst.push({station,lane,wheel,x,z,meshHeight:mesh.height,contactHeight:surface.height,error,chosenRoad:surface.reference?.roadId,chosenSegment:surface.reference?.segmentIndex,surface:surface.reference?.surfaceId});worst.sort((a,b)=>b.error-a.error);worst.splice(8);}
    };
    // Centreline plus a real four-wheel footprint in every logical lane.
    // Coordinates use the audited vehicle's authoritative dimensions.
    for(let station=2;station<L-2;station+=step){while(segment<s.length-2&&station>s[segment+1]!)segment++;const a=path[segment]!,b=path[segment+1]!,length=s[segment+1]!-s[segment]!,t=(station-s[segment]!)/length,tx=(b.x-a.x)/length,tz=(b.z-a.z)/length,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=(a.y??0)+((b.y??0)-(a.y??0))*t;
      probe(x,z,y,station,-1,'centre');
      for(let lane=0;lane<laneOffsets.length;lane++)for(const front of [true,false])for(const left of [true,false]){const along=TAYCAN_4S_DIMENSIONS.wheelBase*(front?.5:-.5),lateral=laneOffsets[lane]!+(front?TAYCAN_4S_DIMENSIONS.frontTrackWidth:TAYCAN_4S_DIMENSIONS.rearTrackWidth)*(left?-.5:.5);probe(x+tx*along-tz*lateral,z+tz*along+tx*lateral,y,station,lane,(front?'front':'rear')+(left?'Left':'Right'));}
    }
    const shape=render.get(r.id)!,categories=[...(maxError>.003?[r.pavementSurface==='ribbon'?'OVERLAPPING_SUPPORT_OR_JUNCTION':'MESH_CONTACT_SOURCE_MISMATCH']:[]),...(profile.maxGradeBreak>.04?['PROFILE_GRADE_BREAK']:[]),...(maxMeshGradeBreak>.04?['WHEELTRACE_GRADE_BREAK']:[]),...(shape.downward?['MESH_FOLD']:[]),...(missingRoad?['WHEELTRACE_WITHOUT_ROAD_SUPPORT']:[]),...(maxUnexpectedStep>.02?['CONTACT_STEP_EXCEEDS_RENDERED_STEP']:[])],row={roadId:r.id,mapVersion:map.version,roadFunction:roadFunction(r),laneCount:r.laneCount,travelDirection:r.travelDirection,length:L,step,flatCandidate:flat,queries:count,missingMesh,missingRoad,maxMeshContactError:maxError,rmsMeshContactError:Math.sqrt(sumError2/Math.max(1,count-missingRoad)),maxFloat32MeshContactError:maxFloatError,maxUnexpectedStep,maxMeshGradeBreak,meshBreakWitness,maxContactGradeBreak,roadSwitches,surfaceSwitches,downwardTriangles:shape.downward,degenerateTriangles:shape.degenerate,maxGrade:profile.maxGrade,maxGradeBreak:profile.maxGradeBreak,heightRange:profile.heightRange,pavementSurface:r.pavementSurface??'segment-plane',categories:categories.length?categories:['PASS'],score:maxError*100+maxUnexpectedStep*100+(flat&&maxError>.003?100:0)+profile.maxGradeBreak*10+shape.downward*10,worst};
    if(refreshRoad)rows[ri]=row;else {rows.push(row);fs.appendFileSync(checkpoint,JSON.stringify(row)+'\n');}if(ri%50===0||ri===targets.length-1)console.log(JSON.stringify({done:ri+1,total:targets.length,queries:rows.reduce((v,r)=>v+r.queries,0),suspect:rows.filter(r=>r.categories[0]!=='PASS').length}));
  }
}finally{ground.dispose();}
const report={phase,sourceHash,mapVersion:map.version,complete:rows.length===targets.length,roads:targets.length,queries:rows.reduce((v,r)=>v+r.queries,0),protocol:{flatStepMetres:.25,otherStepMetres:.5,tracks:'Road centre plus four authoritative Taycan wheel centres in every logical lane, excluding only the first/last 2m where cross-road continuation is validated separately.',surfaceQuery:'Actual CityGround.sampleRoadSurface with rendered-floor height reference; topology and layer selection unchanged. Grounded/rejection/impulse data come from the separate dynamic replays.',render:'Existing RoadEdgeChain ribbon triangles and junction surfaces; excludes the intentional 24mm visual paint lift. Float32 render-vertex comparison recorded separately.',headless:'All authored road/junction pavements retained. Only furniture and visual terrain extents reduced; terrain-return queries are flagged as missing pavement and excluded from the height-error statistic.'},rows,ranked:rows.filter(r=>r.categories[0]!=='PASS').sort((a,b)=>b.score-a.score).map(r=>r.roadId)};
fs.writeFileSync(dir+'road-surface-'+phase+'-sampling.json',JSON.stringify({...report,incremental:refreshRoad?{road:refreshRoad,resampledRoadIds:[...refreshIds],reusedUnchangedRoads:targets.length-refreshIds.size,unchangedPavementVerified:true}:null},null,2));console.log(JSON.stringify({complete:report.complete,roads:rows.length,queries:report.queries,suspect:report.ranked.length,top:report.ranked.slice(0,12)}));
