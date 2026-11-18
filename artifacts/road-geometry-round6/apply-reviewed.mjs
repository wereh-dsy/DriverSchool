import{readFile,writeFile,rename}from'node:fs/promises';import{createHash}from'node:crypto';
// mapctl's normalized export includes historical unrelated changes. Only copy
// reviewed layout fields back to the authored file, with its receipt binding.
const [receiptFile,candidateFile,label]=process.argv.slice(2),source='src/world/regional/regional-main.json',raw=await readFile(source),receipt=JSON.parse(await readFile(receiptFile,'utf8')),candidate=JSON.parse(await readFile(candidateFile,'utf8')),map=JSON.parse(raw);
if(!receipt.summary.valid||createHash('sha256').update(raw).digest('hex')!==receipt.mapDigest)throw Error('Invalid or stale mapctl preview');
const changes=[];
for(const op of receipt.operations){
 if(op.op==='brushObjects'){if(op.brush.mode!=='REPAIR'||!op.brush.objectIds?.length)throw Error('Only scoped repair brush is allowed');for(const id of op.brush.objectIds){const object=map.objects.find(o=>o.id===id),next=candidate.objects.find(o=>o.id===id);if(!object||!next)throw Error('Brush must preserve identities');if(JSON.stringify(object.position)===JSON.stringify(next.position)&&object.rotation===next.rotation)continue;const before={position:object.position,rotation:object.rotation};object.position=next.position;object.rotation=next.rotation;changes.push({id,before,after:{position:object.position,rotation:object.rotation}});}continue;}
 if(op.op==='modifyRoad'){if(Object.keys(op.properties).some(k=>k!=='structure')||op.properties.structure.enclosure?.wallOffset===undefined)throw Error('Unreviewed road edit');const r=map.roads.find(r=>r.id===op.id),next=candidate.roads.find(r=>r.id===op.id);const before=structuredClone(r.structure);r.structure.enclosure.wallOffset=next.structure.enclosure.wallOffset;changes.push({id:r.id,before,after:r.structure});}
 else if(['moveObject','reanchorObject','rotateObject'].includes(op.op)){
  const object=map.objects.find(o=>o.id===op.id),sign=map.signs?.find(s=>s.id===op.id);
  if(object){const next=candidate.objects.find(o=>o.id===op.id),before={position:object.position,rotation:object.rotation};object.position=next.position;object.rotation=next.rotation;changes.push({id:op.id,before,after:{position:object.position,rotation:object.rotation}});}
  else if(sign){const next=candidate.signs.find(s=>s.id===op.id),before=structuredClone(sign);for(const key of ['position','heading','postBaseY','postOffset','gantryPosts','stationMetres'])if(key in next)sign[key]=next[key];changes.push({id:op.id,before,after:sign});}
  else if(op.id.startsWith('signal:')){const junctionId=op.id.slice(7,op.id.lastIndexOf(':')),port=op.id.slice(op.id.lastIndexOf(':')+1),j=map.intersections.find(j=>j.id===junctionId),next=candidate.intersections.find(j=>j.id===junctionId),placement=next.signals?.placements?.[port];if(!placement)throw Error('Missing reviewed signal placement');const before=j.signals?.placements?.[port]??null;j.signals??={};j.signals.placements??={};j.signals.placements[port]=placement;changes.push({id:op.id,before,after:placement});}
  else throw Error('Unknown editable object '+op.id);
 }else throw Error('Unsupported layout command '+op.op);
}
map.version++;
const baseline=JSON.parse(await readFile('artifacts/road-geometry-round6/baseline/regional-main.json','utf8'));
for(const r of map.roads){const old=baseline.roads.find(q=>q.id===r.id);for(const key of ['centerline','laneCount','laneWidth','shoulders','travelDirection','elevation','elevationMode','pavementSurface'])if(JSON.stringify(old[key])!==JSON.stringify(r[key]))throw Error('Changed road contact/topology '+r.id+':'+key);}
for(const key of ['roadLinks','connectionPorts'])if(JSON.stringify(map[key])!==JSON.stringify(baseline[key]))throw Error('Changed '+key);
for(const j of map.intersections){const old=baseline.intersections.find(q=>q.id===j.id);for(const key of ['position','connections','pavementFootprint','pavementProfile','rotation'])if(JSON.stringify(old[key])!==JSON.stringify(j[key]))throw Error('Changed junction support '+j.id);}
if(!(await readFile(source)).equals(raw))throw Error('Concurrent map edit');
await writeFile(source+'.round6-next',JSON.stringify(map,null,2)+'\n');await rename(source+'.round6-next',source);
await writeFile('artifacts/road-geometry-round6/'+label+'-source-changes.json',JSON.stringify({sourceDigest:receipt.mapDigest,version:map.version,changes,normalizerChangesExcluded:true},null,2));console.log(JSON.stringify({label,modified:changes.length,version:map.version}));
