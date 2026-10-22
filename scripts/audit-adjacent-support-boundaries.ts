import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CityGround} from '../src/world/city/CityGround';
import {SectorManager} from '../src/world/city/SectorManager';
import {compileCityRuntimeData} from '../src/world/city/CityRuntimeData';
import {roadFunction} from '../src/world/city/RoadClassification';
import {roadEdges} from '../src/world/city/geometry';
import {roadEdgeChains} from '../src/world/city/RoadEdgeChain';
import {roadPavementSurface,roadPavementTriangle} from '../src/world/city/RoadPavementSurface';
import {compileJunctionSurface} from '../src/world/city/JunctionSurface';
import {WheelSupportContinuity} from '../src/vehicle/physics/WheelSupportContinuity';
import {createWheelContactBuffer,WHEEL_IDS} from '../src/vehicle/physics/WheelContact';
import {VehicleDynamics} from '../src/vehicle/physics/VehicleDynamics';
import {createRoadSUVPhysicsConfig} from '../src/vehicle/config/roadSUVPhysicsConfig';
import type {CityPoint} from '../src/world/city/CityMapData';
import type {SurfaceReference} from '../src/world/SurfaceMaterial';
const dir='artifacts/v488-reapply-and-g17-fix/',phase=process.argv.includes('--baseline')?'before':'after',raw=fs.readFileSync('src/world/regional/regional-main.json','utf8'),runtime=compileCityRuntimeData(JSON.parse(raw)),map=runtime.map;
const first=map.roads[0]!.centerline[0]!,area={minX:first.x-8,maxX:first.x+8,minZ:first.z-8,maxZ:first.z+8};
const auditMap={...map,sectorSize:32,bounds:area,regional:map.regional?{...map.regional,cityBounds:area,cityExtensions:[],terrainBounds:area,routes:[],structures:[]}:undefined,objects:map.objects.filter(o=>o.prefabId==='parking'),signs:[],environment:{...map.environment,spawnPoints:[{id:'boundary',position:first,rotation:0}]}};
// Keep every authored road/junction and the actual support query. This static
// classifier audit omits solid colliders and GPU publication, not pavements.
SectorManager.prototype.updatePosition=()=>false;
const ground=new CityGround(auditMap,{runtime:{map:auditMap,roadNetwork:runtime.roadNetwork}}),chains=roadEdgeChains(auditMap),config=createRoadSUVPhysicsConfig(),car=new VehicleDynamics(config,{driveSelector:'N'}),geometry=car.suspension.getVerticalSnapshot(),contacts=createWheelContactBuffer() as any;
const targetRoads=map.roads.filter(r=>r.designProfile==='motorway'||['expressway','arterial'].includes(roadFunction(r))),networkRoads=new Map(runtime.roadNetwork.segments.map(r=>[r.id,r])),file=dir+'adjacent-boundaries-'+phase+'.ndjson';fs.writeFileSync(file,'');
const totals={roads:0,boundaries:0,laneProbes:0,continuous:0,geometricDiscontinuities:0,footprintOpenings:0,missingCandidates:0,unreachableLayerSwitches:0,otherRejections:0,continuations:0},rows:any[]=[],unexpected:any[]=[];
const normalize=(p:{gx:number;gz:number})=>{const length=Math.hypot(p.gx,1,p.gz);return {x:-p.gx/length,y:1/length,z:-p.gz/length};};
try{
 for(const [ri,road]of targetRoads.entries()){
  const path=networkRoads.get(road.id)!.centerline,edges=roadEdges(road),masks=map.intersections.filter(j=>j.pavementFootprint&&j.connections.some(c=>c.roadId===road.id)).map(compileJunctionSurface),planes:any[]=[],boundaries:{index:number;a:CityPoint;b:CityPoint;dx:number;dz:number}[]=[];
  if(road.pavementSurface==='ribbon'){
   const left=chains.edge(road,edges.left),right=chains.edge(road,edges.right);
   for(let i=1;i<left.length;i++){
    planes.push(roadPavementTriangle(left[i-1]!,right[i-1]!,left[i]!,1,masks),roadPavementTriangle(right[i-1]!,right[i]!,left[i]!,1,masks));
    // Actual consecutive runtime triangle indices, including diagonal seams.
    boundaries.push({index:(i-1)*2,a:right[i-1]!,b:left[i]!,dx:right[i]!.x-left[i-1]!.x,dz:right[i]!.z-left[i-1]!.z});
    if(i+1<left.length)boundaries.push({index:(i-1)*2+1,a:left[i]!,b:right[i]!,dx:(left[i+1]!.x+right[i+1]!.x-left[i-1]!.x-right[i-1]!.x),dz:(left[i+1]!.z+right[i+1]!.z-left[i-1]!.z-right[i-1]!.z)});
   }
  }else{
   for(let i=1;i<path.length;i++)planes.push(roadPavementSurface(path[i-1]!,path[i]!,edges,i===1&&!!networkRoads.get(road.id)!.startIntersectionId,i===path.length-1&&!!networkRoads.get(road.id)!.endIntersectionId,masks));
   for(let i=1;i<path.length-1;i++){
    const dx=path[i+1]!.x-path[i-1]!.x,dz=path[i+1]!.z-path[i-1]!.z,length=Math.hypot(dx,dz),p=path[i]!,half=road.laneCount*road.laneWidth/2;
    boundaries.push({index:i-1,a:{x:p.x+dz/length*half,y:p.y,z:p.z-dx/length*half},b:{x:p.x-dz/length*half,y:p.y,z:p.z+dx/length*half},dx,dz});
   }
  }
  const refs:SurfaceReference[]=planes.map((_,index)=>({roadId:road.id,segmentIndex:index,segmentId:road.id+':'+index,surfaceId:road.id+':'+index+':road',kind:'road',structureKind:road.structure?.enclosure?.kind??road.elevationMode??'ground'}));
  const continuity=new WheelSupportContinuity(),internal=continuity as any,originalEvaluate=internal.evaluate.bind(continuity);let wanted=-1,capture:any;
  internal.evaluate=(y:number,nx:number,ny:number,nz:number,ref:SurfaceReference|undefined,selected?:boolean)=>{const d=originalEvaluate(y,nx,ny,nz,ref,selected);if(ref?.roadId===road.id&&ref.segmentIndex===wanted)capture={eligible:d.eligible,layerClass:d.layerClass,reason:d.reason??null};return d;};
  const stats={roadId:road.id,runtimeRepresentation:road.pavementSurface??'segment-plane',boundaries:boundaries.length,laneProbes:0,continuous:0,geometricDiscontinuities:0,footprintOpenings:0,missingCandidates:0,unreachableLayerSwitches:0,otherRejections:0,maxHeightDelta:0,minNormalDot:1},lines:string[]=[];
  for(const boundary of boundaries){
   const old=planes[boundary.index]!,next=planes[boundary.index+1]!,n0=normalize(old),n1=normalize(next),dot=n0.x*n1.x+n0.y*n1.y+n0.z*n1.z,dl=Math.hypot(boundary.dx,boundary.dz);
   for(let lane=0;lane<road.laneCount;lane++){
    const t=(lane+.5)/road.laneCount,px=boundary.a.x+(boundary.b.x-boundary.a.x)*t,pz=boundary.a.z+(boundary.b.z-boundary.a.z)*t,fromHeight=old.heightAt(px,pz),toHeight=next.heightAt(px,pz),delta=Math.abs(fromHeight-toHeight),footprint=old.contains(0)(px,pz)&&next.contains(0)(px,pz),row:any={roadId:road.id,from:boundary.index,to:boundary.index+1,lane,x:px,z:pz,heightDelta:delta,normalDot:dot,footprintContinuous:footprint};
    totals.laneProbes++;stats.laneProbes++;if(Number.isFinite(delta))stats.maxHeightDelta=Math.max(stats.maxHeightDelta,delta);if(Number.isFinite(dot))stats.minNormalDot=Math.min(stats.minNormalDot,dot);
    const g=geometry.wheels.frontLeft,travel=g.maxSuspensionLength-g.minSuspensionLength,envelope=Math.max(.025,Math.min(.055,travel*.28));
    if(!footprint){totals.footprintOpenings++;stats.footprintOpenings++;row.status='FOOTPRINT_OPENING';lines.push(JSON.stringify(row));continue;}
    if(!Number.isFinite(delta+dot)||delta>envelope||dot<=.95||n0.y<.25||n1.y<.25){totals.geometricDiscontinuities++;stats.geometricDiscontinuities++;row.status='GEOMETRIC_DISCONTINUITY';lines.push(JSON.stringify(row));continue;}
    // A 2cm movement across the seam. Thin/masked triangles are probed on the
    // shared edge itself; no sparse-road height assumption is used.
    let x=px+boundary.dx/Math.max(1e-9,dl)*.02,z=pz+boundary.dz/Math.max(1e-9,dl)*.02;
    if(!next.contains(0)(x,z)){x=px;z=pz;}
    const h=old.heightAt(x,z),radius=g.effectiveRadius??config.wheelRadius;
    for(const id of WHEEL_IDS){const c=contacts[id];c.reference=refs[boundary.index];c.height=fromHeight;c.x=px;c.z=pz;c.normal.x=n0.x;c.normal.y=n0.y;c.normal.z=n0.z;c.supportValid=true;}
    g.attachmentWorldPosition.x=x;g.attachmentWorldPosition.y=h+radius/n0.y+(g.minSuspensionLength+g.maxSuspensionLength)/2;g.attachmentWorldPosition.z=z;
    g.wheelCenterWorld.x=x;g.wheelCenterWorld.y=h+radius;g.wheelCenterWorld.z=z;
    continuity.seed(contacts);continuity.prepare(geometry,config.wheelRadius);continuity.beginStep(1/120);wanted=boundary.index+1;capture=undefined;
    continuity.sample(ground,'frontLeft',x,z);
    row.query={x,z};row.candidate=capture??null;row.chosenValid=continuity.valid('frontLeft');row.chosenReason=continuity.diagnostics('frontLeft').supportSelectionReason;
    if(!capture){totals.missingCandidates++;stats.missingCandidates++;row.status='CANDIDATE_NOT_QUERIED';}
    else{totals.continuous++;stats.continuous++;if(!capture.eligible){if(capture.reason==='unreachable-layer-switch'){totals.unreachableLayerSwitches++;stats.unreachableLayerSwitches++;}else{totals.otherRejections++;stats.otherRejections++;}if(unexpected.length<100)unexpected.push(row);}if(row.chosenReason==='SAME_LAYER_CONTINUATION')totals.continuations++;row.status=capture.eligible?'PASS':'REJECTED';}
    if(!continuity.valid('frontLeft'))continuity.reset();lines.push(JSON.stringify(row));
   }
  }
  fs.appendFileSync(file,lines.join('\n')+'\n');totals.roads++;totals.boundaries+=boundaries.length;rows.push(stats);
  if(ri%250===0)console.log(JSON.stringify({phase,roads:ri+1,total:targetRoads.length,probes:totals.laneProbes,unreachable:totals.unreachableLayerSwitches}));
 }
}finally{ground.dispose();}
const report={complete:true,phase,mapVersion:map.version,mapSourceHash:createHash('sha256').update(raw).digest('hex'),passed:totals.unreachableLayerSwitches===0&&totals.otherRejections===0&&totals.missingCandidates===0,scope:'Every motorway, expressway and arterial; each consecutive runtime segment/triangle boundary at every lane. Exact v488 support footprint/height/normal factories and actual global CityGround qualification/ranking; upright physically reachable SUV suspension fixture, no whole-map driving.',exclusions:'Existing footprint openings (including junction masks) and non-continuous geometry are retained individually in NDJSON; not relabelled as normal continuity. This audit does not certify ramp profiles or modify them.',totals,rows,unexpected,evidence:file};fs.writeFileSync(dir+'adjacent-boundary-audit-'+phase+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:true,phase,passed:report.passed,...totals,examples:unexpected.slice(0,3)}));if(phase==='after'&&!report.passed)process.exitCode=1;
