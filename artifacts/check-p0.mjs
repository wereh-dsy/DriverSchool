import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8').replace(/^\uFEFF/,''));
for(const id of ['north-roundabout:ring-6','north-roundabout:entry-3','north-roundabout:exit-3']) console.log(id, m.roads.some(r=>r.id===id)?'PRESENT':'REMOVED');
