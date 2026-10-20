import fs from 'node:fs';
const dir='artifacts/east-interchange-overlap-launch-fix', summaries=[];
for(const speed of [80,120,140]){
  const rows=JSON.parse(fs.readFileSync(`${dir}/before-${speed}.json`,'utf8'));
  const roadCounts={}, switches=[];
  let conflictQueries=0,maxCandidateGap=0,firstRampQuery=null,maxPenetration=0,minBumpMargin=Infinity,maxFz=0;
  const previous={};
  for(const row of rows){
    for(const [id,w] of Object.entries(row.wheels)){
      maxPenetration=Math.max(maxPenetration,w.geometry.penetration);
      minBumpMargin=Math.min(minBumpMargin,w.suspensionLength-w.geometry.minSuspensionLength);
      maxFz=Math.max(maxFz,w.normalLoad);
    }
    for(const q of row.queries){
      const chosen=q.candidates.find(c=>c.id===q.chosen);
      if(chosen){roadCounts[chosen.roadId]=(roadCounts[chosen.roadId]??0)+1;
        if(!firstRampQuery&&chosen.roadId==='system-east:E-to-S-turbine'){
          const old=row.step>0?rows[row.step-1].wheels[q.wheel]:undefined,w=row.wheels[q.wheel];
          firstRampQuery={step:row.step,wheel:q.wheel,x:q.x,z:q.z,referenceHeight:q.referenceHeight,candidate:q.chosen,
            candidates:q.candidates,previousHeight:old?.geometry.surfaceHeight,height:w.geometry.surfaceHeight,
            previousNormal:old?.geometry.surfaceNormal,normal:w.geometry.surfaceNormal,
            previousRequiredLength:old?.requiredLength,requiredLength:w.requiredLength,minLength:w.geometry.minSuspensionLength,
            impulses:row.micro.map(m=>m.impulses),aY:row.chassis.verticalAcceleration,pitchRate:row.chassis.pitchAngularVelocity,
            rollRate:row.chassis.rollAngularVelocity};
        }
      }
      const main=q.candidates.filter(c=>c.roadId==='ew-wb-split-4-split'&&c.distance===0&&c.accepted),
        ramp=q.candidates.filter(c=>c.roadId==='system-east:E-to-S-turbine'&&c.distance===0&&c.accepted);
      if(main.length&&ramp.length){conflictQueries++;for(const a of main)for(const b of ramp)maxCandidateGap=Math.max(maxCandidateGap,Math.abs(a.height-b.height));}
    }
    for(const q of row.queries.slice(-4)){
      const road=q.candidates.find(c=>c.id===q.chosen)?.roadId;
      if(previous[q.wheel]&&previous[q.wheel]!==road)switches.push({step:row.step,wheel:q.wheel,from:previous[q.wheel],to:road,x:q.x});
      previous[q.wheel]=road;
    }
  }
  summaries.push({speed,steps:rows.length,roadCounts,conflictQueries,maxCandidateGap,firstRampQuery,switches,
    maxPenetration,minBumpMargin,maxFz,maxImpulse:Math.max(...rows.flatMap(r=>Object.values(r.wheels).map(w=>w.mechanicalImpulse))),
    maxAY:Math.max(...rows.map(r=>Math.abs(r.chassis.verticalAcceleration))),
    maxPitchRate:Math.max(...rows.map(r=>Math.abs(r.chassis.pitchAngularVelocity))),
    maxRollRate:Math.max(...rows.map(r=>Math.abs(r.chassis.rollAngularVelocity)))});
}
fs.writeFileSync(`${dir}/candidate-summary.json`,JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries.map(({firstRampQuery,switches,roadCounts,...s})=>({...s,firstRampQuery,switches})),null,2));
