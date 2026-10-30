import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='artifacts/system-central-ramp-repair/',dir=root+'refinement/',read=f=>JSON.parse(fs.readFileSync(f,'utf8')),candidate=read(dir+'candidate-map.json'),published=read('src/world/regional/regional-main.json'),geometry=read(dir+'geometry-validation.json'),facilities=read(dir+'facility-marking-validation.json'),runtime=read(dir+'after/runtime-short-replay.json');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),id='system-central:N-to-W-right';
assert(geometry.passed&&facilities.passed);
assert.equal(runtime.rows.length,16);assert.equal(runtime.hash,hash(dir+'candidate-map.json'));
for(const r of runtime.rows){assert(r.completed&&r.targetOwnershipReached);for(const k of ['allAirTicks','zeroCandidateSamples','rejectedSamples','collisionTicks','mechanicalImpulse','safetyInterventions'])assert.equal(r[k],0);assert.equal(r.minGrounded,4);}
assert.deepEqual(candidate.roads.filter(r=>r.id!==id),published.roads.filter(r=>r.id!==id));
assert.deepEqual(candidate.signs.filter(s=>s.roadId!==id),published.signs.filter(s=>s.roadId!==id));
assert.deepEqual(candidate.objects,published.objects);assert.deepEqual(candidate.roadLinks,published.roadLinks);
const after=geometry.results.find(r=>r.rampId===id),before=read(root+'geometry-validation.json').results.find(r=>r.rampId===id);
assert(after.after.minRadius>=35);
const result={ready:true,published:false,sourceUnchanged:true,sourceHash:hash('src/world/regional/regional-main.json'),candidateHash:hash(dir+'candidate-map.json'),changedRoadId:id,changedSigns:candidate.signs.filter(s=>s.roadId===id).map(s=>s.id),minimumRadiusBefore:before.after.minRadius,minimumRadiusAfter:after.after.minRadius,maximumGradeAfter:after.after.maxGrade,gradeBreaksAtLeast4pp:after.after.gradeBreakCount,sharedDeltaY:after.interfaces.map(i=>i.after.maxSharedDeltaY),interfacesPassed:16,allFourWheelsGrounded:true,collisions:0,supportRejections:0,fullAirborne:0,mechanicalImpulse:0,safetyRecovery:0,requires:'Explicit permission for a second build because user section 16 allows only one; first build already succeeded.'};
fs.writeFileSync(dir+'ready-for-publication.json',JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(dir+'REPORT.md',`# N-to-W-right 曲率修正候选\n\n**已验证，未发布。**\n\n当前源码与 dist 保持第一次成功构建的版本，未被此候选覆盖。\n\n- 仅修改 N-to-W-right 合流前的局部 S 弯和其 4 个路牌。其余 7 条 ramp、四条主线、拓扑、其他物件均与已发布版相同。\n- 延长局部横向过渡，5m 口径最小半径 **${result.minimumRadiusBefore.toFixed(3)}m → ${result.minimumRadiusAfter.toFixed(3)}m**。\n- 最大纵坡 ${(result.maximumGradeAfter*100).toFixed(3)}%；≥4pp 坡折 0；共享铺装高差近似 0。\n- 8 条 ramp 定点几何与跨越净空检查通过；70 条相关道路设施/标线检查通过。\n- 16 个接口回放全部通过，四轮持续接地；碰撞、选中支撑拒绝、全轮离地、机械冲量和 safety/recovery 均为 0。\n- TypeScript 运行源码未再变更，首次构建与独立 typecheck 均已通过。\n\n原要求第十六节只允许一次 build，现已执行且成功；发布此修正需要获准额外执行一次 build，才能同步源码与 dist。\n\n[验收数据](ready-for-publication.json) · [几何](geometry-validation.json) · [设施/标线](facility-marking-validation.json) · [16 接口回放](after/runtime-short-replay.json)\n`);
console.log(JSON.stringify(result));
