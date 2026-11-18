import { createServer } from 'vite';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),output=resolve(root,'artifacts/road-geometry-round3');
await mkdir(output,{recursive:true});
const bundle=resolve(root,'.tmp-road-round3-runtime.mjs');
await build({stdin:{contents:"export {compileCityRuntimeData} from './src/world/city/CityRuntimeData';export {roadGeometryRevision} from './src/world/city/RoadGeometryTrialCache';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:bundle,define:{'import.meta.env.DEV':'false'},logLevel:'warning'});
console.log('Preparing the same normalized runtime resource as the game; no map writes.');
const {compileCityRuntimeData,roadGeometryRevision}=await import(pathToFileURL(bundle).href);
const raw=await readFile(resolve(root,'src/world/regional/regional-main.json'));
const runtime=compileCityRuntimeData(JSON.parse(raw.toString('utf8')));
const sourceSHA256=createHash('sha256').update(raw).digest('hex');
const geometryRevision=roadGeometryRevision(runtime.map);
const payload=JSON.stringify({runtime,sourceSHA256,geometryRevision});
console.log('Runtime ready:',runtime.map.roads.length,'roads;',runtime.map.objects.length,'scene objects.');
const server=await createServer({configFile:false,root,publicDir:false,cacheDir:'.vite/road-geometry-round3',
 optimizeDeps:{noDiscovery:true,include:['three','three/addons/utils/BufferGeometryUtils.js','three/addons/controls/OrbitControls.js']},
 server:{host:'127.0.0.1',port:5194,strictPort:true,watch:{ignored:['**/artifacts/**','**/.tmp-*/**','**/.checkpoint-builds/**','**/.desktop/**','**/release/**']}},
 plugins:[{name:'road-round3-local-review',configureServer(s){
  s.middlewares.use('/__road_r3_runtime',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(payload);});
  s.middlewares.use('/__road_r3_save',async(req,res)=>{
   if(req.method!=='POST'||req.headers.origin!=='http://127.0.0.1:5194'){res.statusCode=403;res.end();return;}
   try{const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>40_000_000)throw new Error('Artifact too large');chunks.push(c);}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(data.kind==='image'&&/^(round2|round3)_[a-z0-9_-]+$/.test(data.name)&&typeof data.image==='string'&&data.image.startsWith('data:image/jpeg;base64,'))await writeFile(resolve(output,data.name+'.jpg'),Buffer.from(data.image.slice(23),'base64'));
    else if(data.kind==='report'&&/^[a-z0-9_-]+$/.test(data.name))await writeFile(resolve(output,data.name+'.json'),JSON.stringify(data.report,null,2)+'\n');
    else throw new Error('Invalid artifact name/type');res.end('saved');
   }catch(error){res.statusCode=400;res.end(String(error));}
  });
 }}]});
await server.listen();console.log('Real environment review: http://127.0.0.1:5194/scripts/road-geometry-round3.html');

