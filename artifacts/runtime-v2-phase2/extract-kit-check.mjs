import fs from 'node:fs';
const file='src/world/city/CityMainV62.selftest.ts';let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('  const materials=createSubject3Materials(),registry=new PrefabRegistry(materials),trees='),end=source.indexOf('  const defaults=expandPreset',start);
if(start<0||end<0)throw Error('Static kit check boundaries changed');
const checks=source.slice(start,end);
source=source.slice(0,start)+'  const {batches,lampBatches,treeBatches,landmarks,landmarkBatches}=runCityStaticKitSelfTest(map);\n'+source.slice(end);
source+='\n/** Static model contract, runnable without repeating road/physics diagnostics. */\nexport function runCityStaticKitSelfTest(map:CityMapData) {\n'+checks+'  return {batches,lampBatches,treeBatches,landmarks,landmarkBatches};\n}\n';
fs.writeFileSync(file,source);
