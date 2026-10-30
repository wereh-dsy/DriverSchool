import fs from 'node:fs';
import assert from 'node:assert/strict';
import {dir,source,read,write,hash,ramp,central,roadPoints} from './common';
import {validateMap} from '../../src/world/city/CityMapValidation';
import {compileCityRuntimeData} from '../../src/world/city/CityRuntimeData';
const map=read(dir+'candidate-map.json'),base=read(dir+'baseline-map.json'),baseline=read(dir+'baseline.json');
assert.equal(hash(fs.readFileSync(source,'utf8')),baseline.sourceHash,'Source map changed outside this task');
for(const r of map.roads)if(r.highwayTransition&&r.gore?.clipToPavement&&!base.roads.find((q:any)=>q.id===r.id)?.gore?.clipToPavement)delete r.gore.clipToPavement;
map.version=base.version+1;
assert.equal(hash(map.roads.filter(central)),baseline.centralHash);
assert.deepEqual([map.roadLinks,map.connectionPorts,map.intersections],[base.roadLinks,base.connectionPorts,base.intersections]);
for(const r of map.roads.filter((r:any)=>!ramp(r))){const old=base.roads.find((q:any)=>q.id===r.id);assert.deepEqual([r.centerline,r.elevationMode,r.elevation,r.laneCount,r.laneWidth,r.travelDirection],[old.centerline,old.elevationMode,old.elevation,old.laneCount,old.laneWidth,old.travelDirection],'Mainline geometry changed: '+r.id);}
for(const [file,fingerprint]of Object.entries(baseline.physics))assert.equal(hash(fs.readFileSync(file,'utf8')),fingerprint,'Physics changed: '+file);
const validation=validateMap(map),beforeValidation=validateMap(base);assert(validation.valid,JSON.stringify(validation.errors));
const runtime=compileCityRuntimeData(map),normalization:any[]=[];
for(const r of map.roads.filter((r:any)=>hash(r)!==hash(base.roads.find((q:any)=>q.id===r.id)))){const normalized=runtime.map.roads.find((q:any)=>q.id===r.id)!;assert.equal(r.centerline.length,normalized.centerline.length);const max=Math.max(0,...r.centerline.map((p:any,i:number)=>Math.hypot(p.x-normalized.centerline[i]!.x,(p.y??0)-(normalized.centerline[i]!.y??0),p.z-normalized.centerline[i]!.z)));assert(max<1e-8,'Material compiler normalization requires replay on normalized geometry: '+r.id);normalization.push({roadId:r.id,maximumXYZDelta:max});}
const runtimeText=JSON.stringify(runtime),runtimeHash=hash(runtimeText),baseWarnings=new Set(beforeValidation.warnings.map(w=>JSON.stringify(w)));
write('candidate-map.json',map);write('map-validation.json',{valid:validation.valid,errors:validation.errors,warningCount:validation.warningCount,newWarnings:validation.warnings.filter(w=>!baseWarnings.has(JSON.stringify(w))),baselineWarningCount:beforeValidation.warningCount,warnings:validation.warnings,normalization});
write('scope-guard.json',{passed:true,sourceHash:baseline.sourceHash,candidateHash:hash(fs.readFileSync(dir+'candidate-map.json','utf8')),version:map.version,centralEntireRoadRecordsUnchanged:true,mainlineXYZAndDirectionsUnchanged:true,topologyUnchanged:true,physicsFingerprintsUnchanged:true,compiledRuntimeHash:runtimeHash,expectedRuntimeAsset:'assets/city-main.runtime-'+runtimeHash.slice(0,12)+'.json',changedRoadIds:map.roads.filter((r:any)=>hash(r)!==hash(base.roads.find((q:any)=>q.id===r.id))).map((r:any)=>r.id)});
console.log(JSON.stringify({valid:validation.valid,warnings:validation.warningCount,newWarnings:validation.warnings.filter(w=>!baseWarnings.has(JSON.stringify(w))).length,version:map.version,runtimeHash}));
