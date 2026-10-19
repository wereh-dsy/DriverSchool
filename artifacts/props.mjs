import fs from 'node:fs';
const map=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8').replace(/^\uFEFF/,'')); 
for(const id of ['urban-north-arterial-split-m91','urban-north-arterial-split-split-m91-approach','v4-north-split-split-m91-approach','north-roundabout:ring-6','north-roundabout:entry-3','north-roundabout:exit-3']){
 const r=map.roads.find(r=>r.id===id); const {centerline,...rest}=r; console.log(id, JSON.stringify(rest)); }
