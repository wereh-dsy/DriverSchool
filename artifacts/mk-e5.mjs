import fs from 'node:fs';
const req=JSON.parse(fs.readFileSync('artifacts/ops-E2.json','utf8').replace(/^\uFEFF/,''));
req.label='E5: smooth sharp bends and repair exhibition grade';
req.operations.push({op:'repairElevation',id:'v61-exhibition-road-split-split-split',start:590,end:670,strength:1,maxGrade:0.1,preserveEndpoints:true});
fs.writeFileSync('artifacts/ops-E5.json',JSON.stringify(req,null,2));
console.log(req.operations.length);
