import {readFile,writeFile} from 'node:fs/promises';
import {compileCityRuntimeData} from '../.tmp-road-round3-runtime.mjs';
const {map}=compileCityRuntimeData(JSON.parse(await readFile('src/world/regional/regional-main.json','utf8')));
const ids=['urban-rail-underpass:underpass','urban-underpass-end-approach','regional:qingling:S-to-E-right:deceleration','ew-wb-split','v4-south-logistics-west'];
const roads=map.roads.filter(r=>ids.includes(r.id));const junctions=map.intersections.filter(j=>['urban-junction-80','urban-junction'].includes(j.id));
await writeFile('artifacts/road-geometry-round4/selected-objects.json',JSON.stringify({roads,junctions},null,2)+'\n');
const islandCandidates=map.intersections.filter(j=>j.channelized&&j.pavementFootprint).flatMap(j=>{const h=Math.max(7+Math.max(21,...j.connections.map(c=>{const r=map.roads.find(r=>r.id===c.roadId);return r?r.laneCount*r.laneWidth:0;}))/2,...Object.values(j.approachOffsets??{}).map(p=>Math.max(Math.abs(p.x),Math.abs(p.z))));const contains=(x,z)=>{const signs=j.pavementFootprint.map((p,i,a)=>{const q=a[(i+1)%a.length];return(q.x-p.x)*(z-p.z)-(q.z-p.z)*(x-p.x);});return signs.every(s=>s>=0)||signs.every(s=>s<=0);};return [-1,1].some(s=>contains(s*(h-2.5),s*(h-2.5)))?[{id:j.id,connections:j.connections.length}]:[];});
console.log(JSON.stringify({roads:roads.map(({centerline,...r})=>({...r,first:centerline[0],last:centerline.at(-1)})),junctions:junctions.map(({pavementFootprint,...j})=>({...j,outlinePoints:pavementFootprint?.length})),islandCandidates}));
