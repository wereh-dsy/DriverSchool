import fs from 'node:fs';
import assert from 'node:assert/strict';
import {roadPoints,sampleAt,polylineLength,roadEdges} from '../../src/world/city/geometry';
import {project,bounds,EditorSpatialIndex} from '../../src/editor/EditorGeometry';
import {roadLampAnchors,roadPiers,roadStructureColliders} from '../../src/world/city/RoadInfrastructure';
import {RoadClearance} from '../../src/world/city/RoadClearance';
import {RoadBuilder} from '../../src/world/city/RoadBuilder';
import {createSubject3Materials} from '../../src/world/subject3/materials';
import {makePavementSegments} from '../../src/editor/ElevationSeams';
import {PrefabRegistry} from '../../src/world/city/PrefabRegistry';
import {VehicleCollisionSystem} from '../../src/vehicle/physics/CollisionSystem';
import {createRoadSUVPhysicsConfig} from '../../src/vehicle/config/roadSUVPhysicsConfig';
const dirArg=process.argv.indexOf('--dir'),dir=dirArg<0?'artifacts/system-central-ramp-repair/':process.argv[dirArg+1]!,read=(f:string)=>JSON.parse(fs.readFileSync(f,'utf8')),map=read(dir+'candidate-map.json'),baseline=read(dir+'baseline.json'),inventory=read('artifacts/system-central-ramp-audit/ramp-inventory.json'),geometry=read(dir+'geometry-validation.json');
assert(geometry.passed,'Stabilize geometry before moving facilities');
const roads=new Map<string,any>(map.roads.map((r:any)=>[r.id,r])),updates:any[]=[];
for(const id of ['system-central:S-to-W-semi','system-central:E-to-N-right','system-central:N-to-E-semi','system-central:W-to-S-right'])roads.get(id).gore.clipToPavement=true;
for(const s of baseline.signs){const r=roads.get(s.roadId),old=baseline.roads.find((r:any)=>r.id===s.roadId),oldPath=roadPoints(old),path=roadPoints(r),projection=project(oldPath,s.position),offset=-(s.position.x-projection.point.x)*projection.tangent.z+(s.position.z-projection.point.z)*projection.tangent.x,station=projection.along/polylineLength(oldPath)*polylineLength(path),frame=sampleAt(path,station),oldYaw=Math.atan2(-projection.tangent.x,-projection.tangent.z),newYaw=Math.atan2(-frame.tangent.x,-frame.tangent.z),next=map.signs.find((q:any)=>q.id===s.id);
 next.position={x:frame.point.x-frame.tangent.z*offset,y:frame.point.y,z:frame.point.z+frame.tangent.x*offset};next.heading=s.heading+Math.atan2(Math.sin(newYaw-oldYaw),Math.cos(newYaw-oldYaw));if(s.stationMetres!==undefined)next.stationMetres=station;
 updates.push({id:s.id,roadId:r.id,before:{position:s.position,heading:s.heading,stationMetres:s.stationMetres},after:{position:next.position,heading:next.heading,stationMetres:next.stationMetres},lateralOffset:offset,foundation:next.postBaseY??null});
}
const area=inventory.area,scope=new Set<string>([...inventory.ramps.map((r:any)=>r.id),...inventory.derivedRoads.map((r:any)=>r.id)]),contextIds=new Set<string>(map.roads.filter((r:any)=>{const b=bounds(roadPoints(r),20);return b.minX<=area.maxX&&b.maxX>=area.minX&&b.minZ<=area.maxZ&&b.maxZ>=area.minZ;}).map((r:any)=>r.id));for(const l of map.roadLinks)if(contextIds.has(l.from.roadId)||contextIds.has(l.to.roadId)){contextIds.add(l.from.roadId);contextIds.add(l.to.roadId);}
const local={...map,roads:map.roads.filter((r:any)=>contextIds.has(r.id)),roadLinks:map.roadLinks.filter((l:any)=>contextIds.has(l.from.roadId)&&contextIds.has(l.to.roadId)),intersections:map.intersections.filter((j:any)=>j.connections.every((e:any)=>contextIds.has(e.roadId)))};
const materials=createSubject3Materials(),builder=new RoadBuilder(materials,local),clearance=new RoadClearance(local),planes=makePavementSegments(local),index=new EditorSpatialIndex(24);planes.forEach((p,i)=>index.set(String(i),p.box));
const prefabs=new PrefabRegistry(materials),vehicle=createRoadSUVPhysicsConfig();
const objectOriginals:any[]=fs.existsSync(dir+'facility-object-originals.json')?read(dir+'facility-object-originals.json'):[];
for(const o of objectOriginals)map.objects[map.objects.findIndex((q:any)=>q.id===o.id)]=structuredClone(o);
const candidateObjects=map.objects.filter((o:any)=>o.position.x>area.minX-10&&o.position.x<area.maxX+10&&o.position.z>area.minZ-10&&o.position.z<area.maxZ+10),objectColliders=candidateObjects.flatMap((o:any)=>{const c=prefabs.collider(o);return c?[c]:[];}),collisions=new VehicleCollisionSystem(objectColliders),objectHits=new Map<string,any>();
for(const entry of inventory.ramps){const r=roads.get(entry.id),path=roadPoints(r),length=polylineLength(path);for(let s=0;s<=length;s+=2){const f=sampleAt(path,s),pose={x:f.point.x,z:f.point.z,y:f.point.y,yaw:Math.atan2(-f.tangent.x,-f.tangent.z)},hit=collisions.resolve({previousPose:pose,pose,velocity:{x:0,z:0},dimensions:vehicle,dt:1/120});for(const c of hit.contacts)if(!objectHits.has(c.colliderId))objectHits.set(c.colliderId,{roadId:r.id,station:s});}}
const objectUpdates:any[]=[],unresolvedObjects:any[]=[];
for(const [id,hit]of objectHits){const o=map.objects.find((q:any)=>q.id===id),r=roads.get(hit.roadId),path=roadPoints(r),len=polylineLength(path);if(!/streetlight|traffic_sign|tree|bollard/.test(o.prefabId)){unresolvedObjects.push({id,...hit});continue;}if(!objectOriginals.some(q=>q.id===id))objectOriginals.push(structuredClone(o));const before=objectOriginals.find(q=>q.id===id),origin=project(path,o.position);let placed=false;
 for(const delta of [0,5,-5,10,-10,20,-20]){const station=Math.max(5,Math.min(len-5,origin.along+delta)),f=sampleAt(path,station);for(const offset of [roadEdges(r).right-.45,roadEdges(r).left+.45]){const p={x:f.point.x-f.tangent.z*offset,y:f.point.y!,z:f.point.z+f.tangent.x*offset};if(clearance.roadAt(p,.5,p.y-1,p.y+10,undefined,undefined,true)||clearance.junctionAt(p,.5,p.y-1,p.y+10))continue;if(map.objects.some((q:any)=>q.id!==id&&Math.hypot(q.position.x-p.x,q.position.z-p.z)<2))continue;o.position=p;o.rotation=Math.atan2(-f.tangent.x,-f.tangent.z);placed=true;break;}if(placed)break;}
 if(!placed)unresolvedObjects.push({id,...hit});else objectUpdates.push({id,prefabId:o.prefabId,roadId:r.id,before,after:structuredClone(o),reason:'Actual SUV collision-envelope intrusion after ramp geometry repair; moved onto a supported shoulder outside every traffic lane.'});
}
fs.writeFileSync(dir+'facility-object-originals.json',JSON.stringify(objectOriginals,null,2)+'\n');
const onPavement=(p:any)=>index.query({minX:p.x-.05,maxX:p.x+.05,minZ:p.z-.05,maxZ:p.z+.05}).map(i=>planes[Number(i)]).some(s=>s.surface.contains(.02)(p.x,p.z)&&Math.abs(s.surface.heightAt(p.x,p.z)-p.y)<.2);
const visualRows:any[]=[],goreIntrusions:any[]=[],unsupportedPaint:any[]=[];
for(const id of scope){const r=roads.get(id),root=builder.build(r);root.updateMatrixWorld(true);const meshes:any[]=[];root.traverse((o:any)=>{if(o.isMesh&&!o.isInstancedMesh)meshes.push(o);});const names:Record<string,number>={},markings:any[]=[];
 for(const mesh of meshes){names[mesh.name]=(names[mesh.name]??0)+1;if(!mesh.userData.markingSource&&!/road paint|merge divider|gore triangle/.test(mesh.name))continue;
  const pos=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index,triangles=(indices?.count??pos.count)/3;let probes=0,unsupported=0,insideLane=0;
  for(let k=0;k<triangles;k++){const ids=[0,1,2].map(i=>indices?indices.getX(k*3+i):k*3+i),p={x:ids.reduce((s,i)=>s+pos.getX(i),0)/3,y:ids.reduce((s,i)=>s+pos.getY(i),0)/3,z:ids.reduce((s,i)=>s+pos.getZ(i),0)/3};if(p.x<area.minX||p.x>area.maxX||p.z<area.minZ||p.z>area.maxZ)continue;probes++;if(!onPavement(p)){unsupported++;if(unsupportedPaint.length<50)unsupportedPaint.push({roadId:id,name:mesh.name,point:p});}if(mesh.name.includes('gore triangle hatch')&&clearance.roadAt(p,0,p.y-.2,p.y+.2,undefined,undefined,true)){insideLane++;goreIntrusions.push({roadId:id,name:mesh.name,point:p});}}
  markings.push({name:mesh.name,owner:mesh.userData.markingOwner,triangles,probes,unsupported,insideLane});
 }
 visualRows.push({roadId:id,meshNames:names,markings,generatedColliderCount:roadStructureColliders(r,local,clearance).length,lamps:roadLampAnchors(r,local,clearance),piers:roadPiers(r,local,clearance)});
 for(const mesh of meshes)mesh.geometry.dispose();
}
prefabs.dispose();for(const m of Object.values(materials))if((m as any)?.dispose)(m as any).dispose();
const signOutliers=map.signs.filter((s:any)=>baseline.signs.some((b:any)=>b.id===s.id)).flatMap((s:any)=>{const hit=project(roadPoints(roads.get(s.roadId)),s.position),dy=(s.position.y??0)-(hit.point.y??0);return Math.abs(dy)>.02?[{id:s.id,dy}]:[];});
const otherSignsBefore=read('src/world/regional/regional-main.json').signs.filter((s:any)=>!baseline.signs.some((b:any)=>b.id===s.id)),otherSignsAfter=map.signs.filter((s:any)=>!baseline.signs.some((b:any)=>b.id===s.id));assert.deepEqual(otherSignsAfter,otherSignsBefore,'Other signs changed');
fs.writeFileSync(dir+'candidate-map.json',JSON.stringify(map,null,2)+'\n');fs.writeFileSync(dir+'facility-marking-validation.json',JSON.stringify({passed:!signOutliers.length&&!goreIntrusions.length&&!unsupportedPaint.length&&!unresolvedObjects.length,scopeRoads:scope.size,signsReprojected:updates.length,signOutliers,goreIntrusions,unsupportedPaint,updates,objectUpdates,unresolvedObjects,generated:visualRows,objectsChanged:objectUpdates.length>0,note:'Existing RoadBuilder/RoadInfrastructure/MarkingOwnership regenerated central ramp and associated mainline primitives. Opt-in gore clipping is enabled only on four affected central ramps. Original explicit sign ground foundations remain when authored.'},null,2)+'\n');
console.log(JSON.stringify({scopeRoads:scope.size,signsReprojected:updates.length,signOutliers:signOutliers.length,goreIntrusions:goreIntrusions.length,unsupportedPaint:unsupportedPaint.length,generatedRoads:visualRows.length,objectsMoved:objectUpdates.map(o=>o.id),unresolvedObjects}));
if(signOutliers.length||goreIntrusions.length||unsupportedPaint.length||unresolvedObjects.length)process.exitCode=1;
