import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import type {CityMapData,CityRoad} from '../../src/world/city/CityMapData';
import {CityEditingKernel} from '../../src/editor/CityEditingKernel';
import type {EditorCommand} from '../../src/editor/EditorCommands';
import {roadPoints,polylineLength,sampleAt} from '../../src/world/city/geometry';
import {stations} from '../../src/editor/MapAnalysis';
import {project} from '../../src/editor/EditorGeometry';
import {makeReceipt} from '../../scripts/mapctl-support';

const dir='artifacts/map-elevation-seam-audit',path='src/world/regional/regional-main.json',raw=fs.readFileSync(path,'utf8'),before:CityMapData=JSON.parse(raw),baseline:CityMapData=JSON.parse(fs.readFileSync(dir+'/continuation-before-map.json','utf8')),proposed:CityMapData=JSON.parse(fs.readFileSync(dir+'/continuation-converged-map.json','utf8'));
assert.equal(JSON.stringify(before),JSON.stringify(baseline),'source changed since complete review');
const kernel=new CityEditingKernel(before),operations:EditorCommand[]=[],changed=proposed.roads.filter(r=>JSON.stringify(r)!==JSON.stringify(before.roads.find(b=>b.id===r.id)));
for(const j of proposed.intersections){const old=before.intersections.find(b=>b.id===j.id)!;if(Math.abs((j.position.y??0)-(old.position.y??0))>1e-8)operations.push({op:'setJunctionHeightDatum',id:j.id,before:old.position.y??0,height:j.position.y??0});}
for(const j of proposed.intersections)if(j.pavementProfile==='local-landing'&&before.intersections.find(b=>b.id===j.id)?.pavementProfile!==j.pavementProfile)operations.push({op:'setJunctionLanding',id:j.id});
let changedOriginalNodes=0,addedKnots=0,maxY=0;
const regionMetrics:any[]=[];
for(const road of changed){
  const old=before.roads.find(r=>r.id===road.id)!,oldPath=roadPoints(old),next=roadPoints(road),table=stations(next),L=polylineLength(oldPath);
  const strip=(r:CityRoad)=>{const {centerline,curve,elevationMode,pavementSurface,...rest}=r;void centerline;void curve;void elevationMode;void pavementSurface;return JSON.stringify(rest);};assert.equal(strip(old),strip(road),'non-profile road fields changed');
  assert(Math.abs(L-polylineLength(next))<1e-6);assert(next.every(p=>project(oldPath,p).distance<1e-7),'new vertical stations must remain on the original XZ path');assert(oldPath.every(p=>next.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<1e-8)),'every original XZ node is retained');
  const profile=next.map((p,i)=>{const station=table[i]!,prior=sampleAt(oldPath,station).point.y??0;return {station,before:prior,after:p.y??0};});
  const datumIds=new Set<string>(),datums:{id:string;height:number}[]=[];let linkedEndpoints=false;
  for(const [end,p]of [['start',profile[0]!],['end',profile.at(-1)!]] as const)if(Math.abs(p.before-p.after)>1e-8){const j=proposed.intersections.find(j=>j.connections.some(c=>c.roadId===road.id&&c.end===end));if(j){if(!datumIds.has(j.id)){datums.push({id:j.id,height:p.after});datumIds.add(j.id);}}else linkedEndpoints=true;}
  if(profile.some(p=>Math.abs(p.after-p.before)>1e-8)||road.elevationMode!==old.elevationMode)operations.push({op:'repairPavementProfile',id:road.id,profile,maxYChange:8,...(linkedEndpoints?{linkedEndpoints:true}:{}),...(datums.length?{junctionDatums:datums}:{})});
  if(road.pavementSurface==='ribbon'&&old.pavementSurface!=='ribbon')operations.push({op:'setPavementSurface',id:road.id,surface:'ribbon'});
  const originalChanges=oldPath.filter(p=>Math.abs((p.y??0)-(project(next,p).point.y??0))>1e-7).length,newKnots=next.length-oldPath.length,delta=Math.max(0,...profile.map(p=>Math.abs(p.after-p.before)));
  changedOriginalNodes+=originalChanges;addedKnots+=newKnots;maxY=Math.max(maxY,delta);
  const metrics=(p:typeof next)=>{const s=stations(p),g=p.slice(1).map((v,i)=>((v.y??0)-(p[i]!.y??0))/(s[i+1]!-s[i]!));return {maxGrade:Math.max(0,...g.map(Math.abs)),maxGradeBreak:Math.max(0,...g.slice(1).map((v,i)=>Math.abs(v-g[i]!)))};};
  regionMetrics.push({id:road.id,originalNodesChanged:originalChanges,addedVerticalKnots:newKnots,maxYChange:delta,before:metrics(oldPath),after:metrics(next),horizontalDisplacement:0,allOriginalXZRetained:true,stationRange:[profile.find(p=>Math.abs(p.after-p.before)>1e-7)?.station??0,profile.findLast(p=>Math.abs(p.after-p.before)>1e-7)?.station??0],pavementSurface:road.pavementSurface??'capsule'});
}
const summary=kernel.preview(operations,'Complete pavement seam and junction landing review'),after=kernel.previewSnapshot(summary.id);
fs.writeFileSync(dir+'/continuation-preview-map.json',JSON.stringify(after));
fs.writeFileSync(dir+'/continuation-preview-summary.json',JSON.stringify(summary,null,2));if(!summary.valid)throw new Error('Changed-region validation failed: '+JSON.stringify(summary.warnings.filter(w=>w.severity==='error')));
assert.equal(JSON.stringify(before.roadLinks),JSON.stringify(after.roadLinks));assert.equal(JSON.stringify(before.connectionPorts),JSON.stringify(after.connectionPorts));assert.equal(JSON.stringify(before.objects),JSON.stringify(after.objects));assert.equal(JSON.stringify(before.signs),JSON.stringify(after.signs));assert.equal(JSON.stringify(before.editing),JSON.stringify(after.editing));
assert.equal(before.roads.length,after.roads.length);for(const j of after.intersections){const old=before.intersections.find(b=>b.id===j.id)!;const {pavementProfile,pavementHeights,pavementFootprint,markingFootprint,...rest}=j,oldRest={...old};delete oldRest.pavementProfile;delete oldRest.pavementHeights;delete oldRest.pavementFootprint;delete oldRest.markingFootprint;void pavementProfile;void pavementHeights;void pavementFootprint;void markingFootprint;assert.equal(j.position.x,old.position.x);assert.equal(j.position.z,old.position.z);rest.position={...rest.position,y:0};oldRest.position={...oldRest.position,y:0};assert.equal(JSON.stringify(rest),JSON.stringify(oldRest),'junction connections/signals/XZ/approaches are unchanged');}
const receipt=makeReceipt(kernel,summary,operations,createHash('sha256').update(raw).digest('hex'));
assert(!receipt.diff.topology.changed&&receipt.diff.maxRoadDisplacement<1e-6);
const errors=summary.warnings.filter(w=>w.severity==='error');assert.equal(errors.length,0);
const metrics={modifiedRoads:changed.length,changedOriginalNodes,addedVerticalKnots:addedKnots,maxYChange:maxY,localValidation:{errors:errors.length,warnings:summary.warnings.filter(w=>w.severity==='warning').length},invariants:{roadIdsLanesWidthsSignalsSignsLinksConnectionSemanticsObjectsUnchanged:true,horizontalCenterlinesUnchanged:true,allOriginalXZNodesRetained:true,linkedEndpointsExact:true},regions:regionMetrics};
fs.writeFileSync(dir+'/changed-region-validation.json',JSON.stringify(metrics,null,2));fs.writeFileSync(dir+'/continuation-operations.json',JSON.stringify({operations},null,2));fs.writeFileSync(dir+'/continuation-receipt.json',JSON.stringify(receipt,null,2));fs.writeFileSync(dir+'/continuation-semantic-diff.json',JSON.stringify(receipt.diff,null,2));
const targetIds=['ring-cw-2-split-4-split','v4-access-5','v8-port-works-c91','system-central:S-to-E-right','regional:v3:airport-distributor:S-to-W-turbine','regional:S68:in:split84:split102:split240:split550:split558:split566'];
const targeted=targetIds.map(id=>{const a=kernel.diagnose({roadId:id,limit:100000},{retainAllIssues:true}),b=new CityEditingKernel(after).diagnose({roadId:id,limit:100000},{retainAllIssues:true});return {id,before:a.counts,after:b.counts};});
fs.writeFileSync(dir+'/continuation-targeted-diagnose.json',JSON.stringify(targeted,null,2));
if(process.argv.includes('--apply')){assert.equal(fs.readFileSync(path,'utf8'),raw);kernel.commit(summary.id);const temporary=path+'.review-tmp';fs.writeFileSync(temporary,JSON.stringify(kernel.data)+'\n');fs.renameSync(temporary,path);}
console.log(JSON.stringify({valid:true,applied:process.argv.includes('--apply'),version:after.version,...metrics,regions:undefined,targeted},null,2));
