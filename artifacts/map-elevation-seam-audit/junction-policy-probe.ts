import fs from 'node:fs';import {loadCityMap} from '../../src/world/city/CityMapLoader';import {diagnoseJunctionElevationSeams} from '../../src/editor/ElevationSeamClusters';
const raw=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8'));raw.environment.metadata.groundElevationVersion='2';
const map=loadCityMap(raw),scan=diagnoseJunctionElevationSeams(map);fs.writeFileSync('artifacts/map-elevation-seam-audit/junction-policy-preview.json',JSON.stringify(scan,null,2));
console.log(JSON.stringify(scan.issues.filter(s=>s.topologyRelation==='junction-boundary-connected').map(s=>({road:s.roadIds[0],j:s.roadIds[1],max:s.maxHeightDelta,min:s.minHeightDelta,normal:s.normalDot})),null,2));
