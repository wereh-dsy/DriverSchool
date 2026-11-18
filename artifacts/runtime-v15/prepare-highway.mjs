import { readFileSync, writeFileSync } from 'node:fs';
const runtime=JSON.parse(readFileSync('artifacts/performance-preload/runtime-fixture.json'));
const path=runtime.map.regional.routes.find(route=>route.id==='G17').centerline;
const sample=station=>{
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(station<=length){const t=station/length;return{point:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},tangent:{x:(b.x-a.x)/length,z:(b.z-a.z)/length}};}
    station-=length;
  }
  throw Error('Highway station outside route');
};
const startStation=500,offset=8.125,s=sample(startStation);
const spawn={id:'preload-profile',position:{x:s.point.x-s.tangent.z*offset,y:s.point.y,z:s.point.z+s.tangent.x*offset},rotation:Math.atan2(-s.tangent.x,-s.tangent.z)};
runtime.map.environment.spawnPoints.unshift(spawn);
const fixture={spawnId:spawn.id,spawn,path,startStation,offset,junctions:[{distance:3100}],roadIds:runtime.map.regional.routes.find(route=>route.id==='G17').roadIds};
writeFileSync(new URL('highway-route.json',import.meta.url),JSON.stringify(fixture));
writeFileSync(new URL('highway.runtime.json',import.meta.url),JSON.stringify(runtime));
console.log({mapVersion:runtime.map.version,route:'G17',startStation,turnStation:3100,spawn});
