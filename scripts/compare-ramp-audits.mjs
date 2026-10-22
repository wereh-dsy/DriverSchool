import fs from 'node:fs';
const dir='artifacts/ramp-profile-audit/',a=JSON.parse(fs.readFileSync(dir+'before-diagnosis.json')),b=JSON.parse(fs.readFileSync(dir+'candidate-diagnosis.json'));
const pairs=new Map();for(const p of a.overlaps){const k=p.roadIds.join('|'),r=pairs.get(k)??[];r.push(p);pairs.set(k,r);}
const same=(o,p)=>o.stationRanges.every((r,k)=>r[0]<=p.stationRanges[k][1]+3&&r[1]>=p.stationRanges[k][0]-3);
const added=[],worse=[],improved=[];
for(const o of b.overlaps.filter(o=>o.roadIds[0]!==o.roadIds[1])){
  const old=(pairs.get(o.roadIds.join('|'))??[]).filter(p=>same(o,p));const max=Math.max(0,...old.map(p=>p.maxGap)),min=Math.min(...old.map(p=>p.minGap));
  if(o.maxGap>.05&&o.minGap<2.5&&o.maxGap>max+.025)added.push({ids:o.roadIds,old:max,new:o.maxGap,range:o.stationRanges});
  if(o.minGap>2.5&&Number.isFinite(min)&&o.minGap<min-.005)worse.push({ids:o.roadIds,old:min,new:o.minGap,range:o.stationRanges});
  if(o.minGap<2.5&&max>o.maxGap+.025)improved.push({ids:o.roadIds,before:max,after:o.maxGap});
}
fs.writeFileSync(dir+'candidate-new-mismatches.json',JSON.stringify(added,null,2));fs.writeFileSync(dir+'candidate-clearance-worse.json',JSON.stringify(worse,null,2));
console.log(JSON.stringify({added:added.length,worse:worse.length,improved:improved.length,addedRows:added.slice(0,12),worseRows:worse.slice(0,12)},null,2));
