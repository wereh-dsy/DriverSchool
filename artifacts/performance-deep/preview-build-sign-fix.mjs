import {build} from 'esbuild';import fs from 'node:fs';
const b=await build({stdin:{contents:"export {RoadSignPlacement,auditFastRoadSigns,signReadingConflict,isFastRoad,isSafetySign} from './src/world/regional/FastRoadSignPlacement';export {validateMap} from './src/world/city/CityMapValidation';export {validateRoadSignData} from './src/world/city/RoadSignValidation';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));const map=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json'));const ctx=new api.RoadSignPlacement(map),changes=[];
for(const id of ['highway:S29:in:mileage:48213','regional:v2:airport-north:E-to-S-loop:sign:200','regional:v2:westlink:E-to-S-loop:sign:200','regional:v3:river-newcity:W-to-N-turbine:sign:500']){
 const index=map.signs.findIndex(s=>s.id===id),sign=map.signs[index];let placed;
 for(let d=5;d<=250&&!placed;d+=5)for(const move of [-d,d]){
  const candidate=ctx.move(sign,move);if(!candidate||!ctx.safe(candidate))continue;
  if(candidate.advanceMetres!==undefined&&(candidate.actualAdvanceMetres??candidate.advanceMetres)<100)continue;
  const conflicts=map.signs.filter(s=>s.id!==id&&api.isFastRoad(ctx.roads.get(s.roadId))&&!api.isSafetySign(s)).some(s=>api.signReadingConflict(s,candidate,Math.max(45,Math.min(120,Math.max(ctx.roads.get(s.roadId).speedLimit,ctx.roads.get(candidate.roadId).speedLimit)*.9))));
  if(!conflicts){placed=candidate;changes.push({id,move,before:sign,after:candidate});break;}
 }
 if(!placed)throw Error('No safe local candidate: '+id);map.signs[index]=placed;
}
const audit=api.auditFastRoadSigns(map),validation=api.validateMap(map),schema=api.validateRoadSignData(map);if(audit.conflicts.length||!validation.valid||schema.length)throw Error('Candidate failed legality');
fs.writeFileSync('artifacts/performance-deep/sign-fix-preview.json',JSON.stringify({applied:false,changes,readingConflicts:audit.conflicts.length,mapValid:validation.valid,schemaIssues:schema},null,2));
console.log(changes.map(c=>({id:c.id,move:c.move})));console.log({applied:false,conflicts:audit.conflicts.length,mapValid:validation.valid});
}catch(e){console.error(e.message);process.exitCode=1;}
