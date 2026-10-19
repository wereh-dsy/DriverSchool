import fs from 'node:fs';
const req=JSON.parse(fs.readFileSync('artifacts/ops-E3.json','utf8').replace(/^\uFEFF/,''));
req.label='E4: smooth sharp bends without second exhibition bend';
req.operations=req.operations.filter(o=>!(o.id==='v61-exhibition-road-split-split-split'&&o.start===605));
fs.writeFileSync('artifacts/ops-E4.json',JSON.stringify(req,null,2));
console.log(req.operations.length);
