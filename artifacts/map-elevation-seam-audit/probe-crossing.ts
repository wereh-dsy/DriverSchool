import fs from 'node:fs';
import {crossings,project} from '../../src/editor/EditorGeometry';
import {roadPoints} from '../../src/world/city/geometry';
const dir='artifacts/map-elevation-seam-audit';
for(const file of [dir+'/continuation-before-map.json','src/world/regional/regional-main.json']){
 const m=JSON.parse(fs.readFileSync(file,'utf8')),a=m.roads.find((r:any)=>r.id==='v8-port-works-c91'),b=m.roads.find((r:any)=>r.id==='v91-ring-south-inner-cd');
 console.log(JSON.stringify({file,a:{id:a.id,links:m.roadLinks.filter((l:any)=>[l.from.roadId,l.to.roadId].includes(a.id)),junctions:m.intersections.filter((j:any)=>j.connections.some((c:any)=>c.roadId===a.id)).map((j:any)=>({id:j.id,connections:j.connections,position:j.position}))},b:{id:b.id,structure:b.structure},hits:crossings(roadPoints(a),roadPoints(b)).map(h=>({...h,station:project(roadPoints(a),h.point).along}))},null,2));
}
