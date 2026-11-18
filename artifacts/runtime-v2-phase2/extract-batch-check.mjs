import fs from 'node:fs';
const file='src/world/city/CityMain.selftest.ts';let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('  const materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),objectRoot=prefabs.buildInstances(map.objects);');
const end=source.indexOf('  assert(new Set(map.intersections',start);
if(start<0||end<0)throw Error('Batch-check boundaries changed');
const checks=source.slice(start,end);
source=source.slice(0,start)+'  const {objectBatches}=runCityPrefabBatchSelfTest(map);\n'+source.slice(end);
source+='\n/** Spatial renderer contract, also runnable without repeating map/physics diagnostics. */\nexport function runCityPrefabBatchSelfTest(map:CityMapData) {\n'+checks+'  return {objectBatches,cells:cells.size,treeBatches:treeBatches.length,trees:trees.length};\n}\n';
fs.writeFileSync(file,source);
