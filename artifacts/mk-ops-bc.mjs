import fs from 'node:fs';
const ranges=JSON.parse(fs.readFileSync('artifacts/vert-ranges.json','utf8'));
const operations=[];
for(const [id,list] of Object.entries(ranges)) for(const r of list) operations.push({op:'repairElevation',id,start:r.start,end:r.end,strength:1,maxGrade:0.08,preserveEndpoints:true});
fs.writeFileSync('artifacts/ops-BC-local.json',JSON.stringify({label:'BC: local elevation smoothing on oscillating ranges',operations},null,2));
console.log(operations.length,'operations');
