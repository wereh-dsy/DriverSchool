import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8').replace(/^\uFEFF/,''));
console.log('version',m.version,'roads',m.roads.length,'intersections',m.intersections.length);
const r=m.roads.find(r=>r.id==='v4-industrial-split-2-split');
console.log('v4-industrial sample y',r.centerline.slice(70,75).map(p=>p.y));
const s=m.roads.find(r=>r.id==='system-west:S-to-W-loop'); console.log('SWloop y',s.centerline.slice(25,30).map(p=>p.y));
