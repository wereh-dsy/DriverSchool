import fs from 'node:fs';
import assert from 'node:assert/strict';
import {dir,read,write,hash,central,analyze,ramp,roadPoints,polylineLength} from './common';
import {refreshPortPoses} from '../../src/world/city/geometry';
import {validateMap} from '../../src/world/city/CityMapValidation';
import {compileCityRuntimeData} from '../../src/world/city/CityRuntimeData';
const map=read(dir+'candidate-map.json'),base=read(dir+'baseline-map.json'),baseline=read(dir+'baseline.json'),targets=new Set(read(dir+'targets.json'));
assert.equal(hash(fs.readFileSync('src/world/regional/regional-main.json','utf8')),baseline.sourceHash);
assert.equal(hash(map.roads.filter(central)),baseline.centralHash);
const frozen=base.roads.filter((r:any)=>ramp(r)&&!targets.has(r.id));for(const r of frozen){const expected=structuredClone(r);if(r.id==='system-south:N-to-E-semi'){const approval=read(dir+'authorized-pier-adjustment.json');assert.equal(approval.before,r.structure.pierSpacing);assert.equal(approval.after,46);expected.structure.pierSpacing=approval.after;}assert.deepEqual(map.roads.find((q:any)=>q.id===r.id),expected,'Existing PASS ramp changed outside explicit pier-spacing authorization: '+r.id);}
for(const [file,fingerprint]of Object.entries(baseline.physics))assert.equal(hash(fs.readFileSync(file,'utf8')),fingerprint);
assert.deepEqual(map.intersections,base.intersections);const movedPorts=map.connectionPorts.filter((p:any)=>targets.has(p.endpoint.roadId));refreshPortPoses({...map,connectionPorts:movedPorts});for(const p of map.connectionPorts)if(!targets.has(p.endpoint.roadId))assert.deepEqual(p,base.connectionPorts.find((q:any)=>q.id===p.id));assert.deepEqual(map.objects,base.objects);
for(const link of map.roadLinks)if(!['link-349','link-379'].includes(link.id))assert.deepEqual(link,base.roadLinks.find((l:any)=>l.id===link.id));
assert.equal(map.roads.length,base.roads.length);assert.equal(map.roadLinks.length,base.roadLinks.length);
map.version=492;const validation=validateMap(map);assert(validation.valid,JSON.stringify(validation.errors));
const runtime=compileCityRuntimeData(map),normalization:any[]=[];
for(const r of map.roads){const q=runtime.map.roads.find((q:any)=>q.id===r.id)!;const max=r.centerline.length===q.centerline.length?Math.max(...r.centerline.map((p:any,i:number)=>Math.hypot(p.x-q.centerline[i].x,(p.y??0)-(q.centerline[i].y??0),p.z-q.centerline[i].z))):Infinity;assert(max<1e-8,'Runtime geometry differs: '+r.id);if(hash(r)!==hash(base.roads.find((q:any)=>q.id===r.id)))normalization.push({roadId:r.id,maximumXYZDelta:max});}
const targeted=analyze(map,map.roads.filter((r:any)=>targets.has(r.id))).rows;assert(targeted.every((r:any)=>r.severity==='PASS'),JSON.stringify(targeted.filter((r:any)=>r.severity!=='PASS').map((r:any)=>({id:r.id,severity:r.severity}))));
write('candidate-map.json',map);const candidateHash=hash(fs.readFileSync(dir+'candidate-map.json','utf8')),runtimeHash=hash(JSON.stringify(runtime));
write('map-validation.json',{valid:true,errorCount:0,warningCount:validation.warningCount,warnings:validation.warnings,normalization});
write('scope-guard.json',{passed:true,baselineVersion:491,version:492,sourceHash:baseline.sourceHash,candidateHash,compiledRuntimeHash:runtimeHash,expectedRuntimeAsset:'assets/city-main.runtime-'+runtimeHash.slice(0,12)+'.json',frozenRampRecordsUnchanged:frozen.length-1,frozenRampGeometryUnchanged:frozen.length,authorizedPierSpacingOnly:read(dir+'authorized-pier-adjustment.json'),centralRoadsAndObjectsUnchanged:true,physicsUnchanged:true,roadIDsUnchanged:true,roadLinkIDsUnchanged:true,onlyMovedAccessLinks:['link-349','link-379'],changedRoadIds:normalization.map(r=>r.roadId)});
console.log(JSON.stringify({version:492,targets:targeted.map((r:any)=>({id:r.id,status:r.severity,radius:r.profile.minRadius,maxGrade:r.profile.maxGrade,independentLength:r.length-r.interfaces.reduce((s:number,i:any)=>s+i.sharedLength,0),dy:r.interfaces.map((i:any)=>i.maxSharedDeltaY)})),changedRoads:normalization.length,warnings:validation.warningCount,runtimeAsset:'assets/city-main.runtime-'+runtimeHash.slice(0,12)+'.json'}));
