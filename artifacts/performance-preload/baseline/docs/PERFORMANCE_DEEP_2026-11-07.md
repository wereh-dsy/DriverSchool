# 驾驶性能与正常构建修复 — 2026-11-07

本轮基于 `e42346815360428daf9d90f4e805f527d6b739f1` 的既有未提交 Round 1–6 / remediation 成果继续实施。开始时的文件指纹与独立副本位于 `artifacts/performance-deep/starting-worktree.json`、`baseline/`。未回滚旧工作，未 commit/push。

## 实际性能结果

以下为相同完整地图、车辆、路线、视口、DPR、画质的正常可见 Electron 窗口对照。每次实际采样约90秒：前60秒同原路线（白天及雨夜），随后在对向车道受控重置朝向并返回30秒。它验证返回及跨 Sector，不等于人工完成一次掉头。物理维持120 Hz；地图视距、道路、建筑、树木、阴影和镜面分辨率未降低。

| 指标 | 本轮修改前 | 最终版本 |
| --- | ---: | ---: |
| P50 帧间隔 | 7.6 ms | 7.0 ms |
| P95 | 17.2 ms | 16.2 ms |
| P99 | 28.1 ms | 26.5 ms |
| 最大帧间隔 | 146.3 ms | 72.7 ms |
| >33 ms | 76 | 68 |
| >50 ms | 43 | 19 |
| >100 ms | 10 | 0 |
| 浏览器 performance.memory 峰值 | 696.55 MiB | 673.38 MiB |
| CDP 主页面 used Heap 峰值 | 413.46 MiB | 391.53 MiB |
| CDP 主页面 backing storage 峰值 | 223.82 MiB | 198.14 MiB |
| CDP Worker used Heap 峰值 | 305.87 MiB | 356.86 MiB |
| CDP Worker backing storage 峰值 | 104.58 MiB | 102.54 MiB |
| 实际 WebGL Buffer 分配峰值 | 58.15 MiB | 93.77 MiB |
| GPU 单次 render pass P95 / P99 | 6.761 / 11.636 ms | 6.569 / 11.701 ms |
| 完成的 Worker 任务 | 713 | 723 |
| 主线程 Long Tasks（驾驶采样区间） | 4 | 0 |
| dispose 后 GL Buffer / 数量 | 0 / 0 | 0 / 0 |

原始记录：`runtime-native-before.json`、`runtime-native-final.json`、`heap-native-*.json`、`release-native-*.json`；逐慢帧与分阶段统计见 `artifacts/performance-deep/final-comparison.json`。Heap 每10秒观察一次，未强制 GC；各独立 Heap 峰值不应相加当作同一时刻总占用。GL Buffer 统计不包含纹理和所有驱动显存，因此不是完整显存计数。GPU query 是单次 render pass，而非完整帧。

需要完整保留的限制：Worker used Heap 峰值没有改善；浏览器总观察值尚未回到600 MiB。预上传将真实 Buffer 峰值增加约35.62 MiB，但低于此前约142.55 MiB的量级。观察到开始可驾驶时间6.84→12.86秒，冷缓存状态未严格控制，不能宣称加载更快。最终前60秒 P95/P99 为17.8/25.9 ms，基线为17.5/25.3 ms，小幅退步；总对照的改善主要也包含返回阶段。不能宣称所有场景零卡顿。

此前160秒离屏诊断还覆盖复杂城区首次进入：>50ms 从10次降到1次，最大224→60.8ms。但离屏窗口涉及帧复制，且该次尚未包含最后的路径共享与镜面调度改动，不能替代最终正常窗口对照。中间正常窗口版本 P99 曾退步到37.7ms，原始数据 `runtime-native-after.json` 及 `native-comparison.json` 也保留，未只展示最佳样本。原始 `conditions.durationMs` 沿用160000，正常窗口实际时长以最后一行 elapsed≈90000为准。

## 已定位的根因与实施

1. **首次资源真正使用未准备。** 原 shader compile 没有覆盖属性 Buffer、VAO、纹理及实际 shadow depth 变体。测到标牌上传25.4ms、bufferData约10.5ms及首次渲染长等待。`StreamingShaderWarmup` 在 publication 前分帧准备真实资源：独立纹理上传、实际主视图/镜面目标上的不写入微绘制、精确 depth shader 和首绘。每批至多16对象，约2 MiB或2ms后让出；单个驱动上传调用不能中途抢占。所有目标、viewport/scissor、材质写入、阴影更新、drawRange、实例数及层次状态都恢复。
2. **远景准备存在遗漏。** Sector 背景及之后追加的远景材质通过同一异步准备队列，发布前完成首用准备；借用资源期间延后释放，取消或 dispose 不再发布。
3. **高刷新屏镜面重复负担。** 中性驾驶的可见镜面按60 Hz错开更新；注视、转向、转向灯、辅助、变道、路口/匝道、倒车/停车及设置预览仍按显示帧刷新。新可见镜面立即刷新，60 Hz屏保持每帧刷新，镜面不关闭，投影仍逐帧跟随。
4. **CPU backing storage 常驻缺少字节预算。** Terrain 从仅96条记录限制改为48 MiB与条数共同约束，激活/发布借用中的数据固定，优先淘汰闲置。最终约29.3 MiB、133次淘汰；101个条目含活跃固定项，故不应误解为严格96总上限。卸载/销毁后账目归零。
5. **地图/导航 JSON 重复点对象。** Worker 解析后，只有逐点XYZ与字段完全相同的折线路径才恢复只读共享；smooth、扩展字段及差异坐标不共享。structured clone 保留共享身份；不改变数据值、导航或物理结果。
6. **雨滴首次使用。** 在加载队列准备既有雨滴/挡风玻璃资源，避免雨夜切换时才首次上传，不改变天气或雨刷行为。

最终19次>50ms帧的游戏回调约10.7–22.9ms，未观测到>50ms主线程 Long Task。73.1ms LoAF 对应的 frame 脚本约17ms、blockingDuration=0；不能把剩余差额归为 GC。返回窗口 trace 确认 GPU进程 `GpuChannel::ExecuteDeferredRequest → WebGL → CommandBuffer::Flush` 仍有约50.7ms任务，实际主线程同步 MajorGC 最大约16.8ms（基线同窗口约34.5ms）。增量/后台标记的数百毫秒跨度不等于同步停顿。剩余呈现延迟包含 GPU/合成器/系统调度，尚未定位到可安全进一步修改的单一驱动内部原因。

两版都在受控返回后的前10秒开启同样的底层trace；最终14/19次>50ms恰在此窗口内。追踪本身可能增加开销，绝对数不能直接等同无诊断的正式游戏。前60秒未开该trace的驾驶仍观测5次>50ms、0次>100ms；未为取得更好数字追加一轮不同条件基准。

两版均跨过4个同样的 Sector，Worker 完成量相近，不能把10个新增任务解释为大量重复编译。最终队列/资源释放正常，重复回复0，CPU缓存与 GL Buffer 全归零，无强制 GC。短时间采样不证明数小时无泄漏。

Worker全程记录另见 `worker-summary.json`：active编译时间P95为60.9→51.7ms，P99为184.5→144.5ms，但最大任务仍617.7→609.2ms，均是 `background:0,4`，不是道路标线。次要慢对象为 `regional:v8:airport-city-road`（最终347.6ms active、474ms含让出时间）和 `regional:v3:airport-distributor:E-to-S-turbine`（326.9ms active）。本轮未改这些几何算法，不能把统计变化宣称为几何编译机制的全面提速。Sector update最大19.9→23.9ms，也未改善。主线程观测改善主要来自首用准备与镜面调度。

预上传存在明确加载代价：包含初始化的任务queueWait P95为2.19→6.51秒、最大7.88→12.35秒；结果交付receiveWait最大243ms→2.69秒，发生在加载阶段。它们不是CPU编译耗时，也不能用较低active P95掩盖。正常驾驶结束队列为0。最长Worker活动步骤仍85ms，Worker Heap峰值和启动等待是剩余优化项。

## v494 冻结门禁

原 `RegionalReleaseBaseline.selftest.ts` 被 core、systems、RegionalWorld、HighwaySystem 共用，却始终要求正式地图逐字段等于 v494。现在合法性校验与显式版本批准分开：

- 当前 `approved-baseline.json` 与哈希批准账本必须一致；完整字段清单、逐字段 SHA、派生导航 SHA 均检查。
- `v494-regression-baseline.json` 原样保留；新增 v505、v506、v507 只追加档案。v505 是本轮开始已有成果；v506/v507 是用户追加授权的路牌修复及里程数字补正，当前批准为v507。
- `preview` 生成源 SHA 和审阅记录；`approve` 必须明确新版本、相同源 SHA、审阅文件和原因；构建不会自动批准。
- 正常 build 验证当前地图及全部历史档案，发布前源码指纹还包括批准账本和历史档案。
- 12项专项断言证明坐标、路口、结构、连接、标牌、版本、字段及派生导航的未批准改动仍被拒绝；Git中原 v494 地图通过原历史指纹核对。

批准方法见 `docs/REGIONAL_BASELINE_APPROVAL.md`。未删除或静默跳过旧断言，未回滚地图。

## 用户追加的全图路牌修复

检查3,399块路牌，修复12个对象：4对阅读区冲突、5处门架支柱侵入其他道路、1块导向牌侵入支路、3处安全牌底座高度（对象有交集）。5处门架复用既有单侧悬臂模板，支柱位于本路铺装路肩内；提示距离随沿路移动更新。

`mapctl` preview/apply 在独立候选文件验证。其加载规范化会改变其他结构字段，因此只把审查过的12块路牌传回原源文件，明确断言正式源变化仅 `version`、`signs`，避免动到道路、路口或 editing 数据。派生导航 SHA 仍为 `87fc13a0791bad4384d6e745d7ecec52ead9690d9a7722f8040e152d6e6feaaa`。

修复后受检路牌阅读冲突0、schema错误0、侵入行车空间0、安全牌物理高度/朝向合同差异0；路牌专项12,303项断言通过（含新增里程迁移回归）。8块中分带替代安装有既有生成器支持且真实支柱合法，保留；地下导向牌实际顶部-3.06m，地面路口0m，粗略5.5m包络误报不移动；2处近路口提示的实际偏置支柱合法，保留。具体对象与前后记录：`signs-full-audit.json`（v506摆放复核）、`signs-fix-review.json`、`signs-applied.json`、`signs-final-diff.json`、`signs-mapctl-preview.json`、`signs-contract-check.json`。这些检查不等于全图人工视角遮挡验收。

现有移动工具仅对带advanceMetres的预告牌更新距离，遗漏了无该字段的里程牌。已修复统一移动规则：所有里程目的地按实际沿路移动量更新，拒绝移到目的地之后，不修改原输入。S29里程牌下移30m，距离900→870m；正反向、上移和超过目的地的回归断言保留。为这项最终补正中止了尚未发布的v506构建，之后对v507重新执行正常完整构建。

编辑工具改用另一模板时残留原 `gantryPosts/postOffset/mountHeight` 会导致非法组合，已在 `CityEditingKernel` 的显式模板转换中清理不适用字段，并验证撤销精确恢复，编辑专项73项通过。

## 另一既有构建阻塞

完整诊断另发现坦克500的发卡弯自动驾驶检查失败。原比例前视方向驾驶员产生5.4726m最大横向偏差；补充路径横向位置/速度反馈、提前0.5秒观察曲率并抑制偏航误差，所有17款车使用同一控制方式。坦克500最大误差1.0914m，全部车型最大误差≤1.4452m。原85km/h目标、最低75km/h断言、车身安全余量、全轮沥青抓地和无碰撞断言全部保留；车辆物理、配置、实际驾驶代码和赛道未改。这只修复测试驾驶员，不改善或掩盖实际车辆物理。

## 修改文件

运行时：`src/game/StreamingShaderWarmup.ts`、`DrivingGame.ts`；`src/camera/AdaptiveMirrorRendering.ts`及selftest；`src/world/environment/EnvironmentVisual.ts`；`src/world/city/SectorManager.ts`、`CityRuntimeData.ts`及新增selftest、`CityMainResource.ts`、`VisualStreaming.worker.ts`；`src/world/regional/RegionalTerrain.ts`。

构建/批准：`src/world/regional/RegionalBaselineData.ts`、`RegionalReleaseBaseline.selftest.ts`；`scripts/approve-regional-baseline.mjs`、`build-checkpoint.ps1`、`run-core-selftests.ts`；`artifacts/regional-world`的当前/历史批准记录；本报告及批准流程文档。

追加路牌/既有构建阻塞：`src/editor/CityEditingKernel.ts`及selftest、`src/world/regional/FastRoadSignPlacement.ts`及selftest、`src/world/regional/regional-main.json`（仅路牌与版本）、`src/world/circuit/CircuitGround.selftest.ts`。

采样入口复用原工具：`scripts/performance-deep.{html,ts}`、`performance-deep-instrument.ts`、`performance-deep-electron.cjs`及原 `road-remediation-server.mjs` 的可选输出/端口配置。诊断、原始结果和静态检查脚本存于 `artifacts/performance-deep/`。

## 验证与发布

- 类型检查、资源准备/状态恢复、只读路径共享、34项镜面调度、实际主视图/镜面/阴影截图检查已通过。
- 核心诊断保留原断言，确认其余核心检查及流式加载生命周期通过；路牌与发卡弯阻塞已分别修复。
- 正常完整 `pnpm run build`：成功，退出码0；类型检查、当前/历史批准校验、全部原core自测及分阶段Vite发布完成。`build-complete.stdout.log` / `build-complete.stderr.log` 保留完整结果；没有使用 BasicValidation。非阻塞提示仅包含既有大chunk提示及Node测试环境localStorage实验提示。
- 全core中实际记录：当前基线12、路径共享5、镜面调度34、流式加载生命周期10、赛道8,547、路牌12,303项断言通过；其余core结果见完整日志，不将这些数字冒充所有独立测试套件。
- 桌面 `pnpm run desktop:build` 与 `node scripts/desktop-package.mjs` 成功，未再重复运行整轮core。新正式EXE：`D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe`。
- 发布包22个前端文件逐字节匹配本次dist；运行时地图v507、3,292道路、306路口。asar为42,604,617字节，SHA256 `1df8c00d5dd629b226d6816b834ad6978448437b0b6d5dde537fd35f52221e7d`，详见 `package-content-check.json`。
- 正式EXE以独立临时用户档案启动，菜单、桌面隔离边界、完整城市进入驾驶和真实鼠标转头无脚本异常/失败请求。记录17.22秒含进入后2秒观察，不与采样页不同车辆/视口的加载数据直接比较。截图 `release-game.png`、`release-mirror.png`，结果 `release-smoke.json`；程序已自动关闭。
- 镜面资源和更新规则通过检查，但右镜HUD截图主要为天空/车身区域，类似基线；这不足以证明取景角度适合驾驶，镜面取景质量仍需要人工体验，不把截图生成成功等同视觉全面通过。本轮未改车辆镜面几何。
- 本轮之前的正式版已完整保存至 `D:/DriverSchoolRelease/DriverSchool-before-PerformanceDeep-20261107`；Round5基线目录保留。
- `preservation-check.json`确认原工作区文件无丢失、HEAD不变，修改范围符合本轮及追加授权；道路/路口/连接/editing数据不变，两份旧版asar哈希均与开始时一致。预览服务已停止；未commit/push。

人工体验建议：首次进入密集城区、连续跨区后真实掉头、雨夜、120/144Hz下快速看镜及打灯、长时间驾驶后的内存与帧间隔。当前数据证明明显长帧下降，不证明所有硬件、路线或所有>50ms间隔已消失。
