import fs from 'node:fs';import {CityGround} from '../../src/world/city/CityGround';
const m=JSON.parse(fs.readFileSync('artifacts/map-elevation-seam-audit/original-local-map.json','utf8')),g=new CityGround(m,{editor:true});
for(let x=2201;x<=2226;x++)console.log(x,g.debugSurfaceCandidates(x,2140,.6).candidates.map(c=>({road:c.roadId?.slice(0,8),h:c.height,d:c.distance})));
g.dispose();
