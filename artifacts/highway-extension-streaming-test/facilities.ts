import fs from 'node:fs';
import {context,pavement,roadPoints,roadEdges,sampleAt,polylineLength,project} from './common';
import {RoadBuilder} from '../../src/world/city/RoadBuilder';
import {RoadClearance} from '../../src/world/city/RoadClearance';
import {roadStructureColliders} from '../../src/world/city/RoadInfrastructure';
import {roadSignColliders} from '../../src/world/city/RoadSignTemplates';
import {createSubject3Materials} from '../../src/world/subject3/materials';
import {PrefabRegistry} from '../../src/world/city/PrefabRegistry';
import {VehicleCollisionSystem} from '../../src/vehicle/physics/CollisionSystem';
import {createRoadSUVPhysicsConfig} from '../../src/vehicle/config/roadSUVPhysicsConfig';
import {loadCityMap} from '../../src/world/city/CityMapLoader';
const dir='artifacts/highway-extension-streaming-test/',map=loadCityMap(JSON.parse(fs.readFileSync(dir+'candidate-map.json','utf8'))),plan=JSON.parse(fs.readFileSync(dir+'highway-plan.json','utf8')),roads=new Map(map.roads.map(r=>[r.id,r])),materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),results:any[]=[];
for(const node of plan.nodes){const seeds=node.roadIds.map((id:string)=>roads.get(id)!),local=context(map,seeds),pv=pavement(local),clearance=new RoadClearance(local),builder=new RoadBuilder(materials,local),nearObjects=map.objects.filter(o=>o.id.startsWith('regional:long:')&&Math.hypot(o.position.x-node.center.x,o.position.z-node.center.z)<1400),nearSigns=map.signs!.filter(s=>node.roadIds.includes(s.roadId)),collision=new VehicleCollisionSystem([...local.roads.flatMap(r=>roadStructureColliders(r,local,clearance)),...nearObjects.flatMap(o=>{const c=prefabs.collider(o);return c?[c]:[];}),...nearSigns.flatMap(roadSignColliders)]),car=createRoadSUVPhysicsConfig(),badPaint:any[]=[],goreIntrusions:any[]=[],contacts:any[]=[],counts:any[]=[];
 for(const r of seeds){const root=builder.build(r);let triangles=0;root.traverse((o:any)=>{if(!o.isMesh||o.isInstancedMesh)return;if(o.userData.markingSource||/road paint|merge divider|gore triangle/.test(o.name)){const p=o.geometry.getAttribute('position'),ix=o.geometry.index;for(let i=0;i<(ix?.count??p.count);i+=3){triangles++;const indices=[0,1,2].map(j=>ix?ix.getX(i+j):i+j),q={x:indices.reduce((s,j)=>s+p.getX(j),0)/3,y:indices.reduce((s,j)=>s+p.getY(j),0)/3,z:indices.reduce((s,j)=>s+p.getZ(j),0)/3};if(!pv.hit(q).some(h=>Math.abs(h.surface.heightAt(q.x,q.z)-q.y)<.2)&&badPaint.length<100)badPaint.push({roadId:r.id,name:o.name,point:q});if(o.name.includes('gore triangle hatch')&&clearance.roadAt(q,0,q.y-.2,q.y+.2,undefined,undefined,true)&&goreIntrusions.length<100)goreIntrusions.push({roadId:r.id,point:q});}}o.geometry.dispose();});counts.push({roadId:r.id,paintTriangles:triangles});
  if(r.roadClass==='ramp'){const path=roadPoints(r),L=polylineLength(path);for(let s=2;s<L-2;s+=3){const f=sampleAt(path,s),pose={x:f.point.x,y:f.point.y,z:f.point.z,yaw:Math.atan2(-f.tangent.x,-f.tangent.z)},hit=collision.resolve({previousPose:pose,pose,velocity:{x:0,z:0},dimensions:car,dt:1/120});for(const c of hit.contacts)if(!contacts.some(q=>q.roadId===r.id&&q.id===c.colliderId))contacts.push({roadId:r.id,station:s,id:c.colliderId});}}
 }
 results.push({id:node.id,passed:!badPaint.length&&!goreIntrusions.length&&!contacts.length,badPaint,goreIntrusions,contacts,signCount:nearSigns.length,objectCount:nearObjects.length,generated:counts});
}
prefabs.dispose();for(const m of Object.values(materials))m.dispose();const output={passed:results.every(r=>r.passed),results};fs.writeFileSync(dir+'facility-marking-validation.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output.results.map(({generated,...r})=>r)));
