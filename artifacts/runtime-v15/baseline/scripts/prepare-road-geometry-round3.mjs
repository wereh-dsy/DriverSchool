import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir='artifacts/road-geometry-round3';await mkdir(dir,{recursive:true});
const shared={bundle:true,format:'esm',logLevel:'warning',define:{'import.meta.env.DEV':'false'}};
const exports="export {RoadVisualCompiler} from './src/world/city/RoadVisualCompiler';export {RoadBuilder} from './src/world/city/RoadBuilder';export {IntersectionBuilder} from './src/world/city/IntersectionBuilder';export {compileCityRuntimeData} from './src/world/city/CityRuntimeData';export {createSubject3Materials} from './src/world/subject3/materials';export {roadGeometryRevision,registerImmutableRoadGeometry} from './src/world/city/RoadGeometryTrialCache';export {round2Selection,ROUND2_CASES,ROUND2_BOUNDARIES} from './scripts/road-geometry-round2-data';export {roadStructureColliders} from './src/world/city/RoadInfrastructure';export {MeshBasicMaterial} from 'three';";
const baseline=resolve(dir,'round2-baseline.mjs');
try{await readFile(baseline);throw new Error('Do not overwrite preserved baseline');}catch(error){if(error.code!=='ENOENT')throw error;}
await build({...shared,platform:'node',stdin:{contents:exports,resolveDir:resolve('.')},outfile:baseline});
await writeFile(`${dir}/baseline-exports.txt`,exports);
// Browser baseline keeps Three shared with the preview, but freezes all city
// implementation modules. Its Worker has its own standalone immutable bundle.
const workerEntry=resolve('src/world/city/VisualStreaming.worker.ts');
await build({...shared,platform:'browser',entryPoints:[workerEntry],outfile:resolve(dir,'round2-baseline.worker.mjs')});
await build({...shared,platform:'browser',external:['three','three/*'],stdin:{contents:"export {CityGround} from './src/world/city/CityGround';export {registerImmutableRoadGeometry,registerImmutableRoadGeometryView} from './src/world/city/RoadGeometryTrialCache';",resolveDir:resolve('.')},outfile:resolve(dir,'round2-baseline.browser.mjs'),plugins:[{name:'baseline-worker-url',setup(b){b.onLoad({filter:/VisualStreamingWorker\.ts$/},async a=>({contents:(await readFile(a.path,'utf8')).replace("new URL('./VisualStreaming.worker.ts', import.meta.url)","new URL('/artifacts/road-geometry-round3/round2-baseline.worker.mjs', location.origin)"),loader:'ts',resolveDir:resolve('src/world/city')}));}}]});
console.log('Preserved Round 2 Node/browser/Worker baseline without changing source.');
