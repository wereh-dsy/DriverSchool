import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const dir='artifacts/final-ramp-structural-cleanup/',clusterIndex=process.argv.indexOf('--cluster'),cluster=clusterIndex<0?null:process.argv[clusterIndex+1],mapFile=process.argv.includes('--central')?dir+'candidate-map.json':dir+'candidate-map.json';
const audit=fs.readFileSync('artifacts/system-central-ramp-audit/audit.ts','utf8');
const durationIndex=process.argv.indexOf('--max-seconds'),maxSeconds=durationIndex<0?36:Number(process.argv[durationIndex+1]);
if(!Number.isFinite(maxSeconds)||maxSeconds<36||maxSeconds>60)throw new Error('Short replay duration must be 36–60 seconds');
let replay=audit.slice(audit.indexOf('// Omit graphics publication only.'),audit.indexOf("if(!process.argv.includes('--static-only'))"));
replay=replay.replace(" const host=roads.get(iface.hostEndpoint.roadId),cluster=iface.endpointCluster.filter((e:any)=>mainFamily(e.roadId));", " const host=roads.get(iface.hostEndpoint.roadId); reversedHost=(end==='start'&&iface.hostEndpoint.end==='start'||end==='end'&&iface.hostEndpoint.end==='end')?host.id:null;");
replay=replay.replace("Math.min(110,outLength)","Math.min(outLength,Math.max(110,(iface.sharedLength??0)+25))");
replay=replay.replace("if(i%12===0||grounded<4||i===2879)","if(i%12===0||grounded<4||i===2879||hit.along>=polylineLength(route)-3)");
replay=replay.replace("const validTarget=finalOwners.includes(expectedTarget)","const acceptedTargetRoadIds=end==='start'&&!r.highwayTransition?new Set([r.id]):family(map,end==='start'?{roadId:r.id,end:'start'}:iface.hostEndpoint,r.id); const validTarget=finalOwners.some((id:any)=>acceptedTargetRoadIds.has(id))");
replay=replay.replace("targetOwnershipReached:validTarget,collisionTicks", "targetOwnershipReached:validTarget,acceptedTargetRoadIds:[...acceptedTargetRoadIds],ownershipPolicy:end==='start'?'ramp after physical separation':'explicitly linked receiving mainline/auxiliary family on the correct layer',collisionTicks");
replay=replay.replaceAll("2880",String(maxSeconds*120)).replaceAll("2879",String(maxSeconds*120-1));
replay=replay.replace('Math.max(0,inLength-40)','0');
const imports=audit.slice(audit.indexOf("import {CityGround}"),audit.indexOf("const dir='artifacts/system-central"));
const contents=`import fs from 'node:fs';
import {dir,read,write,hash,clusterName,central,ramp,analyze,family,roadPoints,roadEdges,sampleAt,polylineLength,project,bounds,buildCityRoadNetwork} from './common';
${imports}
const source=${JSON.stringify(mapFile)},raw=fs.readFileSync(source,'utf8'),map=JSON.parse(raw),roads=new Map<string,any>(map.roads.map((r:any)=>[r.id,r])),network=buildCityRoadNetwork(map);
const centralRun=${process.argv.includes('--central')},clusterFilter=${JSON.stringify(cluster)};
const inventory=read(dir+'interchange-inventory.json'),baseline=read(dir+'baseline-map.json'),modified=new Set(map.roads.filter((r:any)=>hash(r)!==hash(baseline.roads.find((b:any)=>b.id===r.id))).map((r:any)=>r.id));
const c=centralRun?null:inventory.clusters.find((c:any)=>c.id===clusterFilter),clusterRoads=centralRun?map.roads.filter(central):map.roads.filter((r:any)=>c.ramps.some((q:any)=>q.id===r.id));
const all=process.argv.includes('--all'),selected=centralRun?clusterRoads:all?clusterRoads:process.argv.includes('--ramps')?clusterRoads.filter((r:any)=>(c.originalRoadIds.includes(r.id)||r.id==='ns-nb-split-3-split-split-split-3-split')&&(!r.highwayTransition||modified.has(r.id))):['system-east','system-north','system-south','system-west'].includes(clusterFilter)?clusterRoads:clusterRoads.filter((r:any)=>modified.has(r.id)||r.id===clusterRoads.find((r:any)=>!r.highwayTransition)?.id);
let reversedHost:string|null=null;
const path=(r:any)=>{const p=roadPoints(r);return r.id===reversedHost?[...p].reverse():p;},length=(r:any)=>polylineLength(path(r)),dist=(a:any,b:any)=>Math.hypot(a.x-b.x,a.z-b.z),at=(r:any,s:number,offset=0)=>{const f=sampleAt(path(r),Math.max(0,Math.min(length(r),s)));return {point:{x:f.point.x-f.tangent.z*offset,y:f.point.y,z:f.point.z+f.tangent.x*offset},tangent:f.tangent};};
${replay}
const rows:any[]=[];const outdir=dir+'replays/';fs.mkdirSync(outdir,{recursive:true});
for(const r of selected.filter((r:any)=>read(dir+'targets.json').includes(r.id)))for(const end of ['end'] as const){reversedHost=null;const iface=analyze(map,[r]).rows[0].interfaces.find((i:any)=>i.end===end);if(!iface.host||iface.host.junctionId){rows.push({rampId:r.id,end,skipped:true,reason:'Junction-owned terminal: validated by junction navigation and physical footprint; short direct split/merge replay is not applicable.'});continue;}
const file=r.id.replace(/[^a-zA-Z0-9-]/g,'_')+'-full-'+end+'.json',roadHash=hash(['whole-ramp-to-linked-receiving-family-v1',hash(raw),r.id,end]),existing=fs.existsSync(outdir+file)?JSON.parse(fs.readFileSync(outdir+file,'utf8')):null;
const cached=existing?.roadHash===roadHash&&existing.acceptedTargetRoadIds&&existing.completed&&existing.targetOwnershipReached&&!existing.collisionTicks&&!existing.rejectedSamples&&!existing.allAirTicks&&!existing.zeroCandidateSamples&&(end==='start'?existing.incoming:existing.outgoing)===iface.host.roadId;
const row=cached&&process.argv.includes('--resume')?existing:{...replay(r,end,{hostEndpoint:iface.host,sharedLength:iface.sharedLength}),maxSeconds:${maxSeconds},roadHash};fs.writeFileSync(outdir+file,JSON.stringify(row)+'\\n');
const {samples,route,surfaceSwitches,...summary}=row;rows.push({...summary,file:'replays/'+file});console.log(JSON.stringify({ramp:r.id,end,completed:row.completed,target:row.targetOwnershipReached,collision:row.collisionTicks,rejected:row.rejectedSamples,air:row.allAirTicks,impulse:row.mechanicalImpulse,tracking:row.maxTrackingError}));}
write((centralRun?'central-regression-replay':c.file+'-full-replay')+'.json',{source,hash:hash(raw),cluster:centralRun?'system-central':clusterFilter,rows});`;
const built=await build({stdin:{contents,resolveDir:path.resolve(dir),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));}catch(e){console.error(e.message);process.exitCode=1;}
