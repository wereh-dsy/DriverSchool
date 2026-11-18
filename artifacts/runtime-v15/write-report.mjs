import fs from 'node:fs';
const output=new URL('./',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL(name+'.json',output))),s=read('final-summary'),before=s.before,after=s.accepted,high=s.highway,rain=s.rain;
const fixed=n=>Number(n).toFixed(1),mib=n=>fixed(n/1048576),settle=read('accepted-cache-settle').samples;
const row=(name,a,b)=>`| ${name} | ${a} | ${b} |`;
const buildExit=fs.existsSync(new URL('build.exit.txt',output))?fs.readFileSync(new URL('build.exit.txt',output),'utf8').trim():'not run';
const report=`# Runtime V2 Phase 1.5 — 高速流式与时间连续性

日期：2026-11-14。基于本轮开始时保存的真实脏工作区实施；保留全部车辆、地图和发布成果。没有修改车辆动力学、120Hz 单步 dt、道路拓扑、高程、导航、碰撞、天气、雨刷或音频。

## 已实施

原中景路径只有路面，标线、护栏、路牌等依赖近景；近景还与建筑、植被等装饰一起装配和准备。现在将道路基础、道路配套、环境装饰分别安排：Tier 0 可以先发布，Tier 1 不再等待 Tier 2。清单按真实道路批次、进口信号、路牌和实际 prefab 生成，不为不存在的设施设虚假依赖。首次进入场景仍严格等待真实出生区、首屏发现的配套和 GPU fence；没有提前伪造就绪。

沿用 RuntimeCoordinator 一套调度。新增 upcoming、decoration 优先级，当前可见道路优先于前进走廊，再是 GPU、远景、装饰、维护。道路生成、接收、装配、GPU 准备和发布仍沿用现有 Worker / Sector 路径及共享材质、实例化。Worker 任务会在掉头时重排、合并、取消；前景请求可协作取消正在生成的远景。

RoadStreamCorridor 使用现有 EdgeChain 采样生成空间索引；选择仅查询附近桶及明确 roadLinks/路口连接，不推断平面交叉。按支撑高度选路，直行分支优先，同时保留短返程走廊。预取长度是 min(5000m,750m+abs(speed)*(max(12s,实测准备P95)+12s))；最多访问64个方向节点。实际准备时延采用固定32项窗口。初值24s，随后在2–30s内更新。近处/中景圆形范围沿用750/1800m，额外范围沿道路连接延伸，不扩大整个圆形近景。

对视野（含真实左右后视镜）中的中景道路，复用中景地形及路面，仅补齐最终标线、结构、信号及安全物件。使用实际道路包围盒识别需求，避免只因巨大地形包围球可见而升级整块环境。近景降到中景时直接转移已准备的安全资源，保持同一 Geometry/实例/材质，不销毁后重新等候。整体离开保留范围时仍释放；没有永久驻留所有访问过的配套。

缓存清理、路牌纹理活跃集、地形回收、远景页释放与场景对象销毁改为可继续的增量任务。每次维护共享帧预算，维护自身目标0.6ms；地形每次最多8项，对象释放每次最多24个节点，道路逐块解除引用。释放队列大于8或配方超过42MiB时提升回收优先级，仍低于当前道路任务。CPU 道路/地形配方共享42MiB目标；已借用/正在装配的不可驱逐资源允许短时越界，不通过强制 GC 清空活跃数据。原道路/地形分项预算保留。

修复 Coordinator 的任务替换身份判断：旧帧中保存的同 ID 任务不能取消刚替换的新任务。性能记录复用每槽 TypedArray 视图，唯一可见对象统计采用 WeakMap 帧标记，减少每帧 Set 清空和重新散列。

## 时间债务策略

FixedStepClock 仍严格使用1/120秒，单帧最多6步，物理 CPU 预算仍为5ms。活动帧达到50ms时，仅接纳平滑后的正常帧间隔，其余墙钟时间记为 surrendered；上一帧因步数/CPU限制没有消费的整步时间在下一帧过期，仅保留不足1步的相位余量。恢复帧不会额外偿还过去的整步债务。暂停、切后台、恢复和既有重生/换车入口仍重置时钟。

这意味着严重停顿会短暂损失模拟与墙钟的同步性，不能解释为保持全部现实时间。没有增大 dt、设置车辆速度或修改加速度。正常实时帧仍按原120Hz固定步推进。

独立注入一次150ms渲染停顿，放在正式60秒采样后：基线最多${before.artificialStall.maxSteps}步、单次位置差最大${fixed(before.artificialStall.maxPoseStep)}m；最终最多${after.artificialStall.maxSteps}步、余债不超过${fixed(after.artificialStall.maxDebtMs)}ms、位置差最大${fixed(after.artificialStall.maxPoseStep)}m。最终记录舍弃${fixed(after.artificialStall.surrenderedMs)}ms；其中含该恢复窗口的其他停顿，不能宣称全部恰好来自150ms注入。相邻采样速度变化最大${after.artificialStall.maxConsecutiveSpeedChange.toFixed(4)}m/s。单元回归还覆盖 CPU 限制后未消费整步过期。

## 同路线性能对照

基线 before 是本轮保存的 Phase 1 源码，包含当时已经存在的所有车辆改动；不是历史不同车辆版本。最终 accepted 为全部修正后代码。完整v507地图、相同出生点/路线、test-6at-sedan、1186×658、DPR1.5、原画质/镜面/阴影、60秒实际输入驾驶；城市路线约89km/h，均完成同一掉头及返程。没有测量中传送。真实坐标随模拟舍弃时间略有差异。人工注入、采样结束后的原始 JSON 序列化和停留回收窗口单列，不算正式驾驶指标。

| 指标 | Phase 1 基线 | Phase 1.5 最终 |
|---|---:|---:|
${row('进入驾驶等待 ms',fixed(before.loadingMs),fixed(after.loadingMs))}
${row('驾驶 P50 / P95 / P99 ms',[before.driving.p50,before.driving.p95,before.driving.p99].map(fixed).join(' / '),[after.driving.p50,after.driving.p95,after.driving.p99].map(fixed).join(' / '))}
${row('最大帧间隔 ms',fixed(before.driving.max),fixed(after.driving.max))}
${row('>33 / >50 / >100ms 帧数',[before.driving.over33,before.driving.over50,before.driving.over100].join(' / '),[after.driving.over33,after.driving.over50,after.driving.over100].join(' / '))}
${row('performance.memory 峰值 MiB',fixed(before.mainPerformanceMemoryMiB.max),fixed(after.mainPerformanceMemoryMiB.max))}
${row('CDP 主线程已用 Heap 峰值 MiB',fixed(before.cdpHeaps.page.usedMiB.max),fixed(after.cdpHeaps.page.usedMiB.max))}
${row('CDP Worker 已用 Heap 峰值 MiB',fixed(before.cdpHeaps.worker.usedMiB.max),fixed(after.cdpHeaps.worker.usedMiB.max))}
${row('GL Buffer 分配峰值 MiB',fixed(before.gpuBufferPeakMiB),fixed(after.gpuBufferPeakMiB))}
${row('实测 GPU P95 / P99 ms',[before.gpuExecutionMs.p95,before.gpuExecutionMs.p99].map(fixed).join(' / '),[after.gpuExecutionMs.p95,after.gpuExecutionMs.p99].map(fixed).join(' / '))}
${row('主视图+镜面+阴影 Draw Calls P95',before.draws.p95,after.draws.p95)}
${row('其中阴影提交 P95',before.shadowDraws.p95,after.shadowDraws.p95)}
${row('实际提交三角形 P95',before.triangles.p95,after.triangles.p95)}
${row('Worker 完成 / 排队取消 / 在途取消',before.worker.completed+' / '+before.worker.cancelledQueued+' / '+before.worker.cancelledInFlight,after.worker.completed+' / '+after.worker.cancelledQueued+' / '+after.worker.cancelledInFlight)}
${row('装配单步 P95 / 最大 ms（包含加载）',fixed(before.publication.p95)+' / '+fixed(before.publication.max),fixed(after.publication.p95)+' / '+fixed(after.publication.max))}

结论：最终P99、最大慢帧、>50ms数量、主/Worker Heap和GL Buffer改善；P95从${fixed(before.driving.p95)}增至${fixed(after.driving.p95)}ms，Draw Calls P95增加${fixed((after.draws.p95/before.draws.p95-1)*100)}%，提交三角形也增加。补齐原先缺失的中景安全配套产生实际开销，不能称作所有性能指标均提升；下一阶段需要空间合批，不能通过再次移除配套刷指标。最终城市仍有${after.driving.over50}次>50ms，未宣称周期性卡顿彻底消失。

CPU Render 调用是主线程墙钟提交耗时，不等于 GPU 时间。GPU 为 EXT_disjoint_timer_query_webgl2 稀疏有效样本；完整显示器呈现与Electron合成CPU仍不可可靠获得。主线程 Heap、Worker Heap、ArrayBuffer backing storage、GL Buffer分别列出，不能将各自不同时刻的峰值相加冒充整体峰值。没有强制GC。

中间 final 候选出现456.9和190.4ms的RAF间隔，同段游戏回调约15ms、没有对应脚本长任务，且RAF空缺期间100ms兜底定时器仍在运行。其具体合成/调度原因未确认，不能归因于GC或GPU。保留该轮原始记录，没有删除异常。最终 accepted 未再次出现>100ms；它只能证明这一轮未复现，不能保证任何机器永久为零。最终最慢主线程回调约49.6ms，其中渲染提交约44.2ms，仍是后续静态世界渲染优化对象。

## 加载完整性、回收与真实场景

- 城市：当前驾驶扇区的1秒采样没有记录到Tier 1可见缺失；完成掉头返程。周边7,1、7,2、7,3等扇区仍记录451.8–801.4ms配套等待，不能声称整个近域零延迟。所有1秒走廊采样的 ready/total 加权比例为100%。驾驶结束后最终快照是${after.completeness.forwardReady}/${after.completeness.forwardTotal}，追加的1个任务不能静默算作完成；可见未完成列表为空。
- 快速路：G17真实地图开发出生点（临时fixture，未改正式地图），100秒，最高${fixed(high.route.maxKph)}km/h，跨6个Sector。走廊采样加权比例约99.5%；可见配套完成的最大延迟315.3ms，最终${high.completeness.forwardReady}/${high.completeness.forwardTotal}、未完成列表为空。P95/P99 ${fixed(high.driving.p95)}/${fixed(high.driving.p99)}ms，最大${fixed(high.driving.max)}ms，>50ms ${high.driving.over50}次，>100ms 0。此轮在安全资源转移修正之前执行，后续转移机制通过真实城市返程和对象身份回归；不能冒充最终版本高速全路线复测。
- 高速路线自动驾驶未完成隔离快速路掉头，最终停在 turn 状态；没有改地图或碰撞来让控制器通过。高速立交及掉头返回仍需要人工在合法连接路线验收。城市返程与55m/s方向反转调度分别有实跑和专项覆盖。
- 雨夜：15秒，P95/P99 ${fixed(rain.driving.p95)}/${fixed(rain.driving.p99)}ms，最大${fixed(rain.driving.max)}ms，>50/>100ms均0。双后视镜有效、阴影贴图有效、雨量0.5/NIGHT、暂停/窗口隐藏/恢复位姿稳定，无脚本错误。此轮在最后的缓存压力提权之前执行；核心渲染及时间策略一致。
- 仍存在远处侧后方道路的配套等待：最终记录最长9617.7ms，对应4,0；其距整条驾驶路线最近约815m。其他长等待扇区3,0、3,-1、3,5、7,-1等均在750m驾驶近域之外。它们保留现有中景路面代理，但完整配套并非立即就绪；这部分未完全达到“所有可见道路马上完整”的目标，应继续优化侧后方Tier 1预备，不能将最终列表为空解释为全程零缺失。
- 最终配方在驾驶/尾部任务期间会暂时超过42MiB。停留回收记录从${mib(settle[0].road+settle[0].terrain)}MiB降至${mib(settle.at(-1).road+settle.at(-1).terrain)}MiB，约10秒回到预算内，排队/在途归零、释放队列归零，并稳定到12秒末。没有持续增长或扩大预算。最终重复结果/过期地形回复均为0；Coordinator失败任务0。保留的4096帧运行窗口中维护单帧最大约0.3ms；GPU准备等不可中断原子操作仍可能超出某帧剩余预算，完整记录保留167次overBudgetAtoms（包含加载），不能声称所有原子操作严格可抢占。
- 四组退出都 resourcesReleased=true、GL Buffer=0、道路/地形CPU配方=0；Worker已dispose。不能据此替代小时级内存测试。

## 验证及构建

Runtime专项：Coordinator/固定步进24项，流式16项，均通过。包含真实编译标线、道路设施先于被人为挂起的装饰、可见中景安全补齐、降级保留同一资源、最终释放。

完整类型检查通过；GPU准备/优先级/非阻塞fence/取消/材质恢复专项通过。check-preload的进度14项、取消/重试/迟到完成、远景页延迟释放及生命周期10项通过。真实雨夜窗口生命周期检查通过。

pnpm run selftest:loading 失败于既有“秦PLUS真实导航到物理显示屏”断言；本轮开始保存的源码单独重跑得到相同失败，见 loading-baseline.log。没有修改该车辆或屏幕，也没有削弱/跳过断言。其前面的异步地图、碰撞/物理面一致性、共享几何和轮位检查通过。控制器取消/重试等由独立 check-preload 覆盖，不能声称该失败套件后面的内容都执行过。

正常完整构建：${buildExit==='0'?'成功；通过正常类型检查、v507批准验证、完整核心回归和staged Vite发布，更新dist。':'失败（退出码'+buildExit+'）：类型检查及v507批准验证通过，完整核心回归被既有秦PLUS底盘可见性断言阻塞：visible underfloor Infinity / rideHeight 0.145。本轮开始保存的源码单独重跑同一检查得到完全相同失败，见stance-baseline.log；车辆文件哈希未变。未进入Vite发布，dist未更新，未修改车辆或弱化断言。'}未使用BasicValidation。首次构建在最终缓存压力复核时主动取消，未发布；日志另存build-interrupted.log。未执行桌面Release、commit或push。

## 修改文件

生产：src/game/DrivingGame.ts、src/game/StreamingShaderWarmup.ts、src/game/runtime/FixedStepClock.ts、RuntimeCoordinator.ts、RuntimePerformance.ts；src/world/city/CityGround.ts、SectorManager.ts、FogVisibility.ts、RoadSignRenderer.ts、VisualStreamingWorker.ts、RoadVisualCompleteness.ts（新增）；src/world/regional/RegionalStreaming.ts、RegionalBackgroundBatches.ts、RoadStreamCorridor.ts（新增）。

专项/记录：src/game/runtime/RuntimeCoordinator.selftest.ts、RuntimeStreaming.selftest.ts（新增）；scripts/run-runtime-selftests.mjs、check-preload.mjs、performance-preload.ts；artifacts/runtime-v15/与本文。完整变更及保全记录见worktree-verification.json。本轮没有修改src/vehicle的任何文件，未处理并行任务内容。

## 原始记录及人工验收

[汇总原始指标](../artifacts/runtime-v15/final-summary.json) · [最终逐帧](../artifacts/runtime-v15/accepted-cold-day.json) · [运行时慢帧上下文](../artifacts/runtime-v15/accepted-cold-day-runtime.json) · [完整性](../artifacts/runtime-v15/accepted-cold-day-completeness.json) · [回收过程](../artifacts/runtime-v15/accepted-cache-settle.json) · [停顿恢复](../artifacts/runtime-v15/accepted-stall-recovery.json) · [改动前逐帧](../artifacts/runtime-v15/before-cold-day.json) · [高速](../artifacts/runtime-v15/highway-cold-day.json) · [雨夜/镜面/阴影/恢复](../artifacts/runtime-v15/rain-runtime-regression.json) · [构建日志](../artifacts/runtime-v15/build.log) · [保全证明](../artifacts/runtime-v15/worktree-verification.json)

![最终城市返程](../artifacts/runtime-v15/accepted-drive-cold-day.png)

![雨夜](../artifacts/runtime-v15/rain-drive-rain-night.png)

人工重点：通港大道南部物流区向东、路口合法掉头返回；东原G17快速路往跨江方向高速连续跨区，经真实匝道/互通返回；雨夜打开车灯并观察镜面与阴影；快速转头/大角度掉头检查815–1700m侧后方配套等待；持续20–30分钟检查Heap/缓存是否稳定。未保证任意速度或任意硬件零延迟，预取及资源预算均有明确上限。
`;
fs.writeFileSync('docs/RUNTIME_V2_PHASE15_2026-11-14.md',report);
console.log('Updated Phase 1.5 report; build status:',buildExit);
