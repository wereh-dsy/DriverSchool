import fs from 'node:fs';
for(const f of ['src/world/regional/regional-main.json','artifacts/tmp-SW.json']){
 const m=JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
 const r=m.roads.find(r=>r.id==='system-east:S-to-W-turbine');
 console.log(f, r.centerline.length, r.centerline[20].y, r.centerline[65].y, r.centerline[70].y, r.curve);
}
