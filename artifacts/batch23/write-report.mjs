import fs from 'node:fs';
const dir='artifacts/batch23',read=name=>JSON.parse(fs.readFileSync(`${dir}/${name}.json`,'utf8'));
const stats=read('final-statistics'),baseline=read('baseline-current-tools'),engineering=read('final-engineering'),legacyBefore=read('before-legacy'),legacy=read('final-legacy'),validation=read('final-validate'),runtime=read('navigation-and-runtime-review'),diff=read('final-semantic-diff');
const profiles=fs.readdirSync(dir).filter(f=>/^profile-.*-preview.json$/.test(f)).flatMap(f=>JSON.parse(fs.readFileSync(`${dir}/${f}`)).operations.map(o=>o.id));
const build=fs.readFileSync(`${dir}/build-final.txt`,'utf8');
const published=build.includes('Checkpoint published.');
const fmt=n=>Number(n).toFixed(1);
const lines=[
'# City Main 第二、三批工程整治',
'',`目标：src/world/regional/regional-main.json；版本 ${stats.mapVersions.join(' → ')}。`,
'',`原有 ${stats.roads[0]} 个 road ID 全部保留；新增 ${stats.roads[1]-stats.roads[0]} 个道路分段。连通分量 ${diff.topology.before.components} → ${diff.topology.after.components}，新增死端 ${diff.topology.newDeadEnds.length}。`,
'','## 纵坡与道路',
'',`检查全部 ${stats.rampsInspected} 条匝道；平滑 ${profiles.length} 条，保留受约束的 crest/sag。全图匝道 extrema ${stats.profileExtrema.before} → ${stats.profileExtrema.after}。`,
'',...profiles.map(id=>`- ${id}`),
'','## 主辅 access',
'','| Ramp | 原长度 m | 新长度 m | 最大纵坡 |','| --- | ---: | ---: | ---: |',
...stats.access.map(r=>`| ${r.id} | ${fmt(r.before)} | ${fmt(r.after)} | ${fmt(r.grade*100)}% |`),
'','## 明远接入',
'','只处理西南、东北两端约 180 m。局部平面与纵坡平顺，终端 40 km/h、六车道接入；修复路口方向、铺面和标线，西南转向车道消化四车道来路，东北 T 口左右分流；中段保留。',
'','## 物件（唯一 ID）',
'','| 类型 | 移动/旋转/校高 | 支撑或内容调整 | 移除 | 合计 |','| --- | ---: | ---: | ---: | ---: |',
...Object.entries(stats.counts).map(([type,c])=>`| ${type} | ${c.moved} | ${c.supportOrContent} | ${c.removed} | ${c.total} |`),
'','物件按道路/区域使用 Placement Brush 的 REPAIR、anchor、heightMode/heightOffset、orientation、legality、bounded auto-adjust 和 preview；合法对象保留。受道路编辑影响的站位路牌通过 kernel 自动跟随，遗留冲突再局部修复。',
'','## 地下与结构',
'','南北连续地下段补齐 4 个缺失 tunnel 壳体声明；另 5 个无 enclosure 的下沉路段标为 cutting。真正隧道保留侧墙，顶板与墙共用边链，顶板上下表面与洞口封边合为一个网格/共享墙材质。明挖段不加顶。14 个隧道/有顶下穿段均通过驾驶空间向上射线测试，顶板可见。',
'','## 诊断与导航',
'',`同一最终工具版本的 engineering diagnose：${baseline.counts.warning} → ${engineering.counts.warning} warning，${baseline.counts.error} → ${engineering.counts.error} error。`,
'',`Legacy diagnose：${legacyBefore.counts.warning} → ${legacy.counts.warning} warning；error ${legacyBefore.counts.error} → ${legacy.counts.error}，仍为相同 5 个已有 expresswayCrossing。lowClearance 保持 4；未创建平交或为清警告抬路。`,
'',`Full validate：${validation.errorCount} error、${validation.warningCount} warning（基线相同）。无新增 dangling ref、道路删除或死端。`,
'',`${runtime.after.routes.length} 条关键路线全部可达；${runtime.reachability.verifiedPairs} 组原有有向可达关系无丢失。覆盖 EW/NS、16 主辅 access、中央/北/南互通、明远双向、机场和星湖。`,
'',`导航路径测试：${runtime.after.navigation.passed?'通过':'失败'}；显示测试：${runtime.after.displays.passed?'通过':'失败'}。完整 navigation runner 的既有阻塞：${runtime.after.geometry.error}（before 相同）。`,
'',`区域旧快照测试的既有阻塞：${runtime.after.regional.error}（before 相同）。`,
'','## 工具与测试修复',
'','修复有限道路端点延长线误报、prefab 尺寸和地面支撑判定、真实牌柱/牌面包络、普通信号对向合法位置、相邻 crossing 约束生成短节点、局部边界短段、brush repair 高度/朝向与牌柱 base、modifySign station 覆盖显式变换、semantic diff 漏支撑参数；modifyRamp 支持保留 ID 的接入站迁移。',
'','Mapctl 完整自测通过，工程 focused 59 checks、CLI validation 20 checks。用户授权额外修复 ExecutivePolish 旧测试：道路和长道路断言迁到 SharedVehicleData 实际地图所有者，同时验证仪表借用数据，不恢复重复地图；focused 749 assertions 通过。',
'','## Build',
'',published?'完整 pnpm run build 通过，已发布更新 dist。':'完整 pnpm run build 尚未确认发布；以 build-final.txt 最终结果为准。',
'','详细证据：final-statistics.json、final-semantic-diff.json、final-engineering.json、final-legacy.json、final-validate.json、navigation-and-runtime-review.json、mapctl-full-tests.txt、build-final.txt；每个分区保留 preview、semantic diff、local validate 与事务操作。',
];
fs.writeFileSync(`${dir}/REPORT.md`,lines.join('\n')+'\n');
console.log({published,profiles:profiles.length,counts:stats.counts});
