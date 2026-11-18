import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {MeshBasicMaterial} from 'three';
await build({stdin:{contents:"export {RoadVisualCompiler} from './src/world/city/RoadVisualCompiler';export {createSubject3Materials} from './src/world/subject3/materials';export {registerImmutableRoadGeometry} from './src/world/city/RoadGeometryTrialCache';export {RegionalTerrainClearance} from './src/world/regional/RegionalTerrainClearance';",resolveDir:process.cwd()},bundle:true,external:['three','three/*'],platform:'node',format:'esm',outfile:'.tmp-road-round5-cpu.mjs',logLevel:'warning'});
const before=await import('../artifacts/road-geometry-round5/round4-baseline.node.mjs'),after=await import('../.tmp-road-round5-cpu.mjs');
const map=before.compileCityRuntimeData(JSON.parse(await readFile('src/world/regional/regional-main.json','utf8'))).map;
const ids=['v4-south-logistics-west','urban-rail-underpass:underpass','ew-wb-split','regional:qingling:S-to-E-right:deceleration','regional:v3:chenjiang-foldback','regional:v8:airport-city-road'];
const results=[];
for(const [variant,lib]of [['round4',before],['round5',after]]){
 lib.registerImmutableRoadGeometry(map,'round5-basic-cpu');const started=performance.now(),compiler=new lib.RoadVisualCompiler(map,{...lib.createSubject3Materials(),tunnelLight:new MeshBasicMaterial()});const constructorMs=performance.now()-started;
 for(const id of ids){const started=performance.now(),data=compiler.compile(id);const bytes=data.surfaces.reduce((s,p)=>s+p.geometry.position.byteLength+p.geometry.normal.byteLength+(p.geometry.uv?.byteLength??0)+(p.geometry.index?.byteLength??0),0),triangles=data.surfaces.reduce((s,p)=>s+(p.geometry.index?.length??p.geometry.position.length/3)/3,0);results.push({variant,id,cpuMs:performance.now()-started,constructorMs,bytes,triangles,types:compiler.lastMetrics?.geometryTypes});}
}
const started=performance.now(),terrain=new after.RegionalTerrainClearance(map);await writeFile('artifacts/road-geometry-round5/basic-cpu.json',JSON.stringify({singleSamplePerObject:true,results,terrainIndex:{...terrain.statistics,constructorMs:performance.now()-started}},null,2)+'\n');console.log(JSON.stringify({results:results.map(({types,...r})=>r),terrainIndex:terrain.statistics}));
