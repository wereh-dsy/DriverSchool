import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync('artifacts/abrupt-crossing-dist.json','utf8'));
const pick=new Set([
 'v4-industrial-split-2-split','system-south:S-to-E-right','system-south:W-to-S-right',
 'system-south:S-to-W-semi','system-central:W-to-S-right','v61-exhibition-road-split-split-split',
 'v61-exhibition-road-split-split','system-west:W-to-N-loop','system-south:W-to-N-loop','system-west:S-to-W-loop',
 'system-central:S-to-W-semi','system-central:N-to-E-semi','system-central:E-to-S-semi',
 'system-west:E-to-N-right','system-west:N-to-E-loop','urban-underpass-west-link','v9-chunhui-east-split-split'
]);
const operations=[];
for(const r of rows){ if(!pick.has(r.road)) continue; const a=Math.max(0,r.station-30), b=r.station+30; operations.push({op:'repairElevation',id:r.road,start:Math.round((a+0.1)*10)/10,end:Math.round((b-0.1)*10)/10,strength:1,maxGrade:0.08,preserveEndpoints:true}); }
fs.writeFileSync('artifacts/ops-abrupt.json',JSON.stringify({label:'D: local vertical-curve repair at free grade breaks',operations},null,2));
console.log(operations.length,'operations');

