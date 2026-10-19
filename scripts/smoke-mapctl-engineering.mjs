import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const path='src/world/regional/regional-main.json',before=readFileSync(path),data=JSON.parse(before.toString('utf8'));
const ramp=data.roads.find(r=>r.roadClass==='ramp'||r.type==='ramp_1'),junction=data.intersections.find(j=>j.signalized),object=data.objects.find(o=>o.prefabId==='tree');
if(!ramp||!junction||!object)throw new Error('Smoke requires a ramp, signalized junction and tree in current City Main');
const runs=[];
const invoke=(command,request)=>{const result=spawnSync(process.execPath,['scripts/mapctl.mjs',command,'regional-main','--request',JSON.stringify(request)],{encoding:'utf8',maxBuffer:20_000_000});let response;try{response=JSON.parse(result.stdout);}catch{throw new Error((result.stderr||result.stdout).slice(0,500));}if(result.status!==0)throw new Error(JSON.stringify(response));runs.push({command,kind:request.kind??request.domain,passed:true});return response;};
try {
  const profile=invoke('inspect',{kind:'profile',roadId:ramp.id,step:10});
  const objects=invoke('query',{kind:'objects',intersectionId:junction.id,radius:50,limit:10});
  const structure=invoke('inspect',{kind:'structure',roadId:ramp.id});
  invoke('inspect',{kind:'region',center:junction.position,radius:80,limit:10});
  const diagnostic=invoke('diagnose',{domain:'objects',intersectionId:junction.id,radius:50,limit:10});
  const review=invoke('review',{operations:[{op:'moveObject',id:object.id,delta:{x:0,y:0,z:0}}]});
  if(!readFileSync(path).equals(before))throw new Error('Read-only smoke changed source bytes');
  console.log(JSON.stringify({passed:true,contentUnchanged:true,comparison:'byte equality; no standalone SHA check',map:{roads:data.roads.length,objects:data.objects.length},profile:{roadId:ramp.id,samples:profile.samples.length,constraints:profile.constraints.length},junction:junction.id,objectsReturned:objects.objects.length,structureType:structure.type,diagnosticIssues:diagnostic.counts.total,reviewRoadChanges:review.diff.roads.modified.length,runs},null,2));
}finally{if(!readFileSync(path).equals(before))throw new Error('City Main source changed during read-only smoke');}
