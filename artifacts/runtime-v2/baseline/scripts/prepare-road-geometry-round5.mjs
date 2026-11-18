import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve('.'),dir=resolve('artifacts/road-geometry-round5'),snapshot=resolve('.tmp-road-geometry-round4');
await mkdir(dir,{recursive:true});
try{await readFile(resolve(dir,'starting-worktree.json'));throw new Error('Round 5 baseline already exists; do not overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
const shared={bundle:true,format:'esm',logLevel:'warning',define:{'import.meta.env.DEV':'false'}};
const exports="export {RoadVisualCompiler} from './src/world/city/RoadVisualCompiler';export {RoadBuilder} from './src/world/city/RoadBuilder';export {IntersectionBuilder} from './src/world/city/IntersectionBuilder';export {CityGround} from './src/world/city/CityGround';export {compileCityRuntimeData} from './src/world/city/CityRuntimeData';export {createSubject3Materials} from './src/world/subject3/materials';export {roadGeometryRevision,registerImmutableRoadGeometry,registerImmutableRoadGeometryView} from './src/world/city/RoadGeometryTrialCache';export {round2Selection} from './scripts/road-geometry-round2-data';";
const result=await build({...shared,platform:'node',external:['three','three/*'],stdin:{contents:exports,resolveDir:root},outfile:resolve(dir,'round4-baseline.node.mjs'),metafile:true});
const files=[];
for(const path of Object.keys(result.metafile.inputs).filter(p=>p.startsWith('src/')||p.startsWith('scripts/'))){const target=resolve(snapshot,path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(path),target);files.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});}
await build({...shared,platform:'browser',entryPoints:['src/world/city/VisualStreaming.worker.ts'],outfile:resolve(dir,'round4-baseline.worker.mjs')});
await build({...shared,platform:'browser',external:['three','three/*'],stdin:{contents:exports,resolveDir:root},outfile:resolve(dir,'round4-baseline.browser.mjs'),plugins:[{name:'preserved-worker',setup(b){b.onLoad({filter:/VisualStreamingWorker\.ts$/},async a=>({contents:(await readFile(a.path,'utf8')).replace("new URL('./VisualStreaming.worker.ts', import.meta.url)","new URL('/artifacts/road-geometry-round5/round4-baseline.worker.mjs', location.origin)"),loader:'ts',resolveDir:dirname(a.path)}));}}]});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
await writeFile(resolve(dir,'starting-worktree.json'),JSON.stringify({head:git('rev-parse','HEAD'),status:git('status','--short').split('\n'),mapSHA256:createHash('sha256').update(await readFile('src/world/regional/regional-main.json')).digest('hex'),files},null,2)+'\n');
console.log(`Round 4 production baseline preserved; ${files.length} relevant dependency files copied, no map writes.`);
