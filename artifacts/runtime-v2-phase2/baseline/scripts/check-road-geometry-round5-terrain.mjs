import {build} from 'esbuild';
import {readFile,access,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const shared={bundle:true,platform:'node',format:'esm',logLevel:'warning'};
const entry=resolve('src/world/regional/RegionalTerrainClearance.ts');
await build({...shared,entryPoints:[entry],outfile:'.tmp-road-round5-terrain-before.mjs',plugins:[{name:'frozen-round4',setup(b){b.onLoad({filter:/\.ts$/},async a=>{const backup=resolve('.tmp-road-geometry-round4',a.path.slice(resolve('.').length+1));try{await access(backup);}catch{return;}return {contents:await readFile(backup,'utf8'),loader:'ts',resolveDir:dirname(a.path)};});}}]});
await build({...shared,stdin:{contents:"export {RegionalTerrainClearance} from './src/world/regional/RegionalTerrainClearance';export {cityGroundGeometrySteps} from './src/world/city/CityGroundGeometry';",resolveDir:process.cwd()},outfile:'.tmp-road-round5-terrain-after.mjs'});
const before=await import(pathToFileURL(resolve('.tmp-road-round5-terrain-before.mjs'))),after=await import(pathToFileURL(resolve('.tmp-road-round5-terrain-after.mjs')));
const roads=Array.from({length:4},(_,i)=>({id:'boundary-'+i,type:'urban_2lane',laneCount:2,laneWidth:2,travelDirection:'two-way',speedLimit:30,centerline:[{x:-4,y:-1,z:0},{x:4,y:-1,z:0}]}));
const map={schemaVersion:2,id:'boundary-clipping-only',name:'Boundary clip',version:1,sectorSize:500,bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},roads,intersections:[],objects:[],roadLinks:[],environment:{districts:[],spawnPoints:[]}},selection={roadIds:roads.map(r=>r.id),intersectionIds:[]},triangle=[{x:-6,y:0,z:2},{x:6,y:0,z:2},{x:0,y:0,z:4}];
const area=polygon=>{let sum=0;const a=polygon[0];for(let i=1;i+1<polygon.length;i++){const b=polygon[i],c=polygon[i+1];sum+=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);}return Math.abs(sum)/2;};
const results=[];for(const [variant,lib]of [['before',before],['after',after]]){const pieces=new lib.RegionalTerrainClearance(map,selection).clip(triangle,true);results.push({variant,pieces:pieces.length,zeroAreaPieces:pieces.filter(p=>area(p)<1e-8).length,area:pieces.reduce((sum,p)=>sum+area(p),0)});}
if(results[1].zeroAreaPieces||Math.abs(results[1].area-12)>1e-8)throw new Error('Boundary clipping changed positive-area terrain');
const largeMap={...map,bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000}},clearance=new after.RegionalTerrainClearance(largeMap,selection),task=after.cityGroundGeometrySteps(largeMap,largeMap.bounds,false,20,clearance);let surface;for(;;){const step=task.next();if(step.done){surface=step.value;break;}}
const p=surface.getAttribute('position');let groundArea=0;for(let i=0;i<p.count;i+=3)groundArea+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)))/2;
if(Math.abs(groundArea-3999968)>1e-4||p.count>80000)throw new Error('Unstreamed ground excavation is unbounded or changes area');surface.dispose();
await writeFile('artifacts/road-geometry-round5/terrain-boundary-fix.json',JSON.stringify({functionalReproductionOnly:true,results,unstreamed:{worldArea:4000000,pavedExclusionArea:32,remainingArea:groundArea,vertices:p.count,boundedCellSize:20}},null,2)+'\n');console.log(JSON.stringify({results,unstreamedArea:groundArea,vertices:p.count}));
