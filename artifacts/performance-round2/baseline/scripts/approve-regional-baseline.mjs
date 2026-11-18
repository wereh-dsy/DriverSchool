import{readFile,writeFile,rename}from'node:fs/promises';import{resolve}from'node:path';import{createHash}from'node:crypto';import{build}from'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exitCode=1;});
const [action,...args]=process.argv.slice(2),flags=new Map();for(let i=0;i<args.length;i+=2)flags.set(args[i],args[i+1]);
if(!['preview','approve','verify'].includes(action))throw Error('Usage: node scripts/approve-regional-baseline.mjs preview --out review.json | approve --review review.json --approve-revision N --source-sha256 HASH --reason TEXT | verify');
const directory=resolve('artifacts/regional-world'),source=resolve('src/world/regional/regional-main.json'),raw=await readFile(source),map=JSON.parse(raw),sourceSHA256=createHash('sha256').update(raw).digest('hex'),ledger=JSON.parse(await readFile(directory+'/baseline-approvals.json','utf8'));
const bundle=await build({stdin:{contents:"export * from './src/world/regional/RegionalBaselineData';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const current=JSON.parse(await readFile(directory+'/approved-baseline.json','utf8'));
if(api.baselineHash(current)!==ledger.approved[current.revision]||current.revision!==ledger.currentRevision)throw Error('Existing approval registry is inconsistent');
if(action==='verify'){for(const[revision,hash]of Object.entries(ledger.approved)){const archived=JSON.parse(await readFile(directory+`/v${revision}-regression-baseline.json`,'utf8'));if(api.baselineHash(archived)!==hash)throw Error(`Approved history v${revision} changed`);}api.assertRegionalBaselineData(map,current);console.log(JSON.stringify({verified:true,revision:current.revision,navigationSHA256:current.navigationSHA256}));}
else if(action==='preview'){
  if(!flags.get('--out'))throw Error('Preview requires --out review.json');
  const candidate=api.createRegionalBaseline(map,{reason:'Pending explicit approval',sourceSHA256,previousRevision:ledger.currentRevision});
  const changedFields=Object.keys(candidate.fields).filter(k=>candidate.fields[k]!==current.fields[k]);
  const review={schemaVersion:1,sourceSHA256,revision:map.version,previousRevision:ledger.currentRevision,changedFields,roads:map.roads.length,intersections:map.intersections.length,navigationSHA256:candidate.navigationSHA256,candidate};
  await writeFile(resolve(flags.get('--out')),JSON.stringify(review,null,2)+'\n');console.log(JSON.stringify({revision:map.version,sourceSHA256,changedFields,review:flags.get('--out')}));
}else{
  const review=JSON.parse(await readFile(resolve(flags.get('--review')??''),'utf8')),revision=Number(flags.get('--approve-revision')),reason=flags.get('--reason');
  if(!reason?.trim()||revision!==map.version||revision!==review.revision||revision<=ledger.currentRevision)throw Error('Explicit reason and a new matching revision are required');
  if(flags.get('--source-sha256')!==sourceSHA256||review.sourceSHA256!==sourceSHA256||review.previousRevision!==ledger.currentRevision)throw Error('Map or approval changed after review; preview again');
  const candidate=api.createRegionalBaseline(map,{reason,sourceSHA256,previousRevision:ledger.currentRevision});
  if(JSON.stringify(candidate.fields)!==JSON.stringify(review.candidate.fields)||candidate.navigationSHA256!==review.navigationSHA256||JSON.stringify(candidate.gradeExceptions)!==JSON.stringify(review.candidate.gradeExceptions))throw Error('Review no longer matches map/derived navigation/grade calibration');
  const archive=directory+`/v${revision}-regression-baseline.json`,text=JSON.stringify(candidate,null,2)+'\n';
  await writeFile(archive,text,{flag:'wx'}); // Approved history is append-only.
  ledger.currentRevision=revision;ledger.approved[revision]=api.baselineHash(candidate);
  await writeFile(directory+'/approved-baseline.json.next',text);await writeFile(directory+'/baseline-approvals.json.next',JSON.stringify(ledger,null,2)+'\n');
  await rename(directory+'/approved-baseline.json.next',directory+'/approved-baseline.json');await rename(directory+'/baseline-approvals.json.next',directory+'/baseline-approvals.json');
  console.log(JSON.stringify({approved:true,revision,archive,sourceUnchanged:true}));
}
