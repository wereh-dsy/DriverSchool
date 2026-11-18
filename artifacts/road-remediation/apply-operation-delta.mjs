import{readFile,writeFile,rename}from'node:fs/promises';import{createHash}from'node:crypto';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
const[receiptFile,candidateFile,label]=process.argv.slice(2),source='src/world/regional/regional-main.json',raw=await readFile(source),receipt=JSON.parse(await readFile(receiptFile,'utf8'));if(!receipt.summary.valid||receipt.mapDigest!==createHash('sha256').update(raw).digest('hex'))throw Error('Invalid/stale mapctl receipt');const lib=await import(pathToFileURL(resolve('artifacts/road-remediation/map-lib.mjs'))),authored=JSON.parse(raw),normalized=new lib.CityEditingKernel(lib.loadCityMap(structuredClone(authored))).data,candidate=JSON.parse(await readFile(candidateFile,'utf8'));
// Three-way operation delta: exclude unrelated loader normalization while using
// the exact result of the existing editor/mapctl transaction and its validation.
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),merge=(original,before,after)=>{
 if(equal(before,after))return original;
 if(Array.isArray(before)&&Array.isArray(after)&&before.every(v=>v&&typeof v==='object'&&typeof v.id==='string')&&after.every(v=>v&&typeof v==='object'&&typeof v.id==='string')){
  const old=new Map(before.map(v=>[v.id,v])),next=new Map(after.map(v=>[v.id,v])),current=new Map((original??[]).map(v=>[v.id,v])),result=[];
  for(const v of original??[]){if(old.has(v.id)&&!next.has(v.id))continue;result.push(next.has(v.id)?merge(v,old.get(v.id),next.get(v.id)):v);}for(const v of after)if(!current.has(v.id)&&!old.has(v.id))result.push(v);return result;
 }
 if(before&&after&&!Array.isArray(before)&&!Array.isArray(after)&&typeof before==='object'&&typeof after==='object'){
  const result={...original};for(const key of new Set([...Object.keys(before),...Object.keys(after)])){if(equal(before[key],after[key]))continue;if(!(key in after))delete result[key];else result[key]=merge(original?.[key],before[key],after[key]);}return result;
 }return structuredClone(after);
};const result=merge(authored,normalized,candidate),changes={};for(const key of['roads','intersections','objects','roadLinks','signs']){const old=new Map((authored[key]??[]).map(o=>[o.id,o]));changes[key]=(result[key]??[]).filter(o=>!equal(old.get(o.id),o)).map(o=>o.id);}if(!(await readFile(source)).equals(raw))throw Error('Concurrent source edit');await writeFile(source+'.remediation-next',JSON.stringify(result,null,2)+'\n');await rename(source+'.remediation-next',source);await writeFile('artifacts/road-remediation/'+label+'-changes.json',JSON.stringify({version:result.version,changes,normalizationUnrelatedChangesExcluded:true},null,2));console.log(JSON.stringify({label,version:result.version,counts:Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,v.length]))}));
