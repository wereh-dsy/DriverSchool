# 启动预加载与驾驶交接 — 2026-11-08

基于既有未提交的 Round 1–6 / 性能修复成果继续实施。开始前保存了 1,089 个源码、脚本和文档副本及指纹，位于 `artifacts/performance-preload/starting-worktree.json`、`baseline/`。本轮没有 commit/push，没有改正式地图、拓扑、道路生成结果、车辆动力学、天气、雨刷或音频规则。

## 实现

1. 进入驾驶拆为基础初始化、车辆与基础系统、出生区域 CPU 准备、GPU 准备、实际首屏与交接五阶段。车辆和地图仍并行准备；区域阶段额外等候现有空间预取范围的静态碰撞任务，但不改变已注册碰撞体、顺序或支撑面。玩家可见范围和正常行驶方向的 near/mid 区域先就绪，1800m 内关键背景先准备，远端继续后台处理。没有全图预加载。
2. `LoadingProgress` 使用实际任务回执、加权阶段、显式交接驱动进度。动态发现任务仍显示真实总数，百分比不倒退；只有所有阶段关闭才允许100%。失败、取消和重试分代处理，过期完成不能开启驾驶。界面显示阶段、资源类型、数量、百分比和耗时，计时器不推动进度。进入驾驶后移除面板和计时器。支持按钮、Tab/Enter 和 Escape 返回。
3. 资源准备由 FIFO 改为动态优先级队列；出生点、附近区域优先于 mid 和远景。每次绘制准备最多16项、约2MiB或2ms后让出；单个纹理或驱动调用本身不可中途抢占。准备实际主画面、镜面和 packed-depth 阴影程序，并执行真实 Buffer/VAO/纹理准备。WebGL2 fence 以 `clientWaitSync(...,0,0)` 非阻塞轮询，确认 GPU 完成后才发布。
4. 实际首屏分别准备主视图与阴影、左右/内部镜面、完整画面及 GPU 完成回执。HUD/小地图在遮罩覆盖期间完成首次显示准备。物理仍为120Hz；第一驾驶帧重新建立时钟，加载末尾的绘制和界面交接不再成为补算债务。
5. 远景合批不再修改正在渲染的 Buffer。至多一个未发布替换批次先准备后交换，旧几何在交换后释放；不增加永久 Mesh 数量。原始追加队列约8MiB上限，区域卸载或取消时丢弃过期工作，异步借用结束后再释放。背景 Worker 每任务一个地块，前台工作优先。
6. 初始行驶方向 near 资源有短暂、空间有界的保留，避免刚开车就因静止选择而降级重建；达到750m或60秒后回到正常流式选择。道路和地形沿用原有预算与淘汰机制。
7. 地形遮挡索引按原顺序分批构建；同步编辑/检查入口继续同步完成。城市使用共享分块小地图时不再提前绘制无用的旧版全图底图；旧地图回退按需绘制一次。局部检查确认地形裁剪输出和计数不变。

## 已定位的遗留首用问题

- 原出生就绪门槛只覆盖较小区域，正常 near/mid/前向区域仍在开车后集中完成；碰撞的 wanted 任务在加载界面期间原先没有继续推进。
- FIFO 准备会让可见区域等远景，远景 Buffer 追加也会把上传推迟至真实驾驶绘制。
- 中间版本仍在掉头附近出现约215–372ms长帧。具体对象为 `office instances`。程序键证明，同一个立面材质只具有带 `instanceColor` 的 instancing 程序（位掩码39），实际无颜色实例需要另一个程序（35），首次真实绘制耗时约205–314ms。现在明确准备、等待并微绘制两种实际实例用法，所有临时状态同步恢复。多材质几何也逐组准备，避免只触及第一组。
- 只在界面切换回调中更新时间还不足以排除其后的布局开销；最终在第一个实际驾驶帧重建时间基准。没有减少固定物理步频或修改车辆状态。

## 相同路线的实际记录

完整 v507 地图、`test-6at-sedan`、同一真实道路、120Hz物理、原画质、正常可见 Electron 窗口。窗口1200×720，DPR1.5；没有关闭镜面、阴影、天气，没有减少建筑、树木或视距。仅验证资源提供一处位于既有 `v8-tonggang-avenue-m91-section` 的出生点，未写回地图；沿既有路驶至 `urban-junction-50`，以真实转向和踏板完成低速掉头，然后返回，跨过 `4,2`、`5,2`、`6,2`。没有逐帧传送车辆。

首60秒严格从驾驶就绪后统计，不含加载。最终候选只针对明确修改的冷启动/掉头路径复核一次，没有再完整重复三组对照。

| 首60秒指标 | 修改前冷启动 | 最终候选冷启动 |
| --- | ---: | ---: |
| P50 | 15.6ms | 10.1ms |
| P95 | 34.8ms | 16.0ms |
| P99 | 60.7ms | 25.6ms |
| 最大帧间隔 | 560.3ms | 68.2ms |
| >33ms | 185 | 38 |
| >50ms | 61 | 5 |
| >100ms | 8 | 0 |
| 主线程 Long Tasks | 12 | 1（交接首帧56ms） |
| 新 shader 调用 | 20 | 4 |
| 新 Buffer 分配调用 | 12,156 | 6,855 |
| `performance.memory` 峰值 | 608.72MiB | 671.35MiB |
| 含加载的累计 GL Buffer 峰值 | 113.31MiB | 151.60MiB |
| 第60秒激活 GL Buffer | 59.82MiB | 79.85MiB |

最终5次>50ms分别约58.9、50.4、68.2、52.4、52.6ms，后四次没有>50ms主线程 Long Task；相关 GL 包装调用未发现>2ms单次事件。没有足够证据将呈现差额归为 GC 或某一种 GPU/驱动等待。最终仍存在4次新 shader 调用及后台资源上传，不能宣称所有首次资源使用都已完全消失；这次未再导致>100ms驾驶帧。

三组主要对照（中间版本，尚未补齐最终实例颜色和交接修复）的原始记录也全部保留：

| 场景 | 点击到可驾驶：前→后 | P95：前→后 | P99：前→后 | >50ms：前→后 | >100ms：前→后 |
| --- | --- | --- | --- | --- | --- |
| 冷会话城区 | 22.63→22.87s | 34.8→16.6 | 60.7→27.4 | 61→13 | 8→2 |
| 同会话再次进入 | 0.05→11.01s | 32.4→17.9 | 54.7→26.5 | 43→5 | 0→0 |
| 雨夜冷会话 | 11.66→19.52s | 36.0→16.8 | 60.9→27.2 | 52→7 | 1→0 |

最终候选冷会话加载19.28s，加载帧间隔P95约14.8ms，最大714.6ms。开发服务模块、浏览器外驱动缓存和系统调度未重置，因此不能把19.28s对22.63s解释成冷机器加载提速。再次进入和雨夜的数据明确体现了等待时间增加。加载期仍有一次性初始化停顿，不能宣称加载界面全程无卡顿；新增队列均分帧，后续可继续拆解剩余同步初始化。未为追求数字清理缓存或强制GC。

## 内存和生命周期

- 首60秒 Heap 代价约+62.63MiB，累计 GL Buffer 峰值约+38.29MiB；预取的 CPU/GPU 数据先驻留是明确代价，尚未达到降低所有内存峰值的目标。GL计数不包括纹理、驱动及全部显存，`performance.memory`也不等于主线程和 Worker Heap 之和。
- CDP每10秒观察、未强制GC。最终观察窗口主页面 used Heap峰值约362.53MiB、backing storage约281.57MiB；Worker used Heap约378.81MiB、backing storage约176.62MiB。不同峰值不同步，不应相加当作同时总占用。原始 `heaps-*.json` 保留采样时刻。
- 沿用道路闲置缓存128路/32MiB、地形闲置缓存96条/48MiB；激活或发布借用中的数组不会为凑预算而释放，因此实际总数可能超过闲置预算。总驻留由当前空间选择、初始短暂保留和有界背景队列约束，并非严格32/48MiB全部总量上限。
- 新增准备记录最多512个程序键、32个depth模板；原始背景追加约8MiB，单个未发布替换批次，实测最大18MiB，随空间组卸载。没有历史 Sector 永久缓存或逐帧全图生成。
- Worker几何结果缓存继续限制为8MiB/32项；最终采样结束约1.86MiB、32项、875次淘汰。驾驶结束仍有13个预测区域任务及1个在途任务，并非宣称所有远端已加载完；销毁时取消并终止Worker。浏览器总Heap观测从开车初始约536.69MiB降至末尾约524.26MiB，中途峰值671.35MiB，未强制GC。
- 分散上传没有降低所有上传总成本：同一前60秒 `bufferData` API累计CPU时间约72.4→105.2ms；最终队列单次资源准备最大约29.9ms。GL API调用CPU时间不是实际GPU执行耗时。本轮未再添加GPU timer/底层trace来制造额外采样负担；首用长帧改善不等于GPU所有工作量减少。
- 冷启动、再次进入、雨夜和最终候选退出后均 `resourcesReleased=true`，道路/地形缓存字节、GL Buffer字节和数量归零。取消准备后返回菜单并重试成功，旧 game 脱离、旧资源释放，无运行错误。短时验证不等于数小时泄漏证明。
- 真实驾驶包含连续跨Sector和掉头返回；最终 Worker队列与资源释放记录见 `candidate-day-release.json`。没有反复运行 Node Worker几何基准。

## 验证、构建和发布

专项：真实任务进度14项；既有流式资源生命周期10项；取消/重试/过期完成、GPU非阻塞完成与优先级、多材质组、实例颜色两种变体及状态恢复、局部碰撞预备所有权、分批地形裁剪等价、小地图按需回退均通过。既有 `pnpm run selftest:loading` 通过，含预期的错误场景日志。完整类型检查通过。

另实测“已有小地图会话→切换城市→创建途中取消→再次进入”：取消信号已传到新城市准备、过期城市释放、旧会话脱离，没有迟到发布或运行错误；见 `cancel-switch-cancel-switch.json`。为补齐这项最终生命周期修复，主动中止了尚未发布的第一次完整构建，原始日志保留于 `build-interrupted-for-cancellation-fix.log`，之后以最终源码重新完整执行正常构建，没有绕过核心检查。

正常完整 `pnpm run build` 已成功，退出码0，包含完整类型检查、v507批准/历史档案门禁、core自测和Vite暂存发布，`dist`已更新。随后 `pnpm run desktop:build`、标准 `desktop-package.mjs` 均成功。未使用 BasicValidation，未删改失败断言。Vite仍提示既有大型分块；PowerShell日志中的空stderr包装行不代表断言失败。

最终目录为 `D:/DriverSchoolRelease/DriverSchool-Preload-20261108/DriverSchool-win32-x64/`。新 `app.asar` SHA256：`9f8fe0d05d56b13654d8e083c6abf93d8e96ce717caf0bd71c2754b9fd7f958a`。22个安装包资源逐文件与本次dist一致，正式runtime仍为v507、3292路/306路口，未包含验证出生点或开发源码。实际EXE通过菜单→加载进度→驾驶→真实鼠标转头/镜面检查，进度不回退、驾驶后面板移除，脚本错误0、失败请求0；桌面隔离和无Node暴露边界检查通过。验证窗口已自动关闭，未覆盖旧正式或回退目录。

完整构建还遇到过一次前台进程结束但没有退出码/断言结果的情况，日志保留于 `build-process-ended-without-status.log`，未算通过。最后改用独立后台进程完整执行并取得退出码0及实际发布标记；最终记录是 `build.log`、`build.exit.txt`。桌面记录为 `desktop-build.log`、`package.log`、`package-content-check.json`、`release-smoke.json`、`release-smoke.exit.txt`。EXE入口记录的loadMs包含就绪后2秒观察等待，不用于上面的性能对照。

原始数据：`artifacts/performance-preload/` 下 `before-*`、`after-*`、`final-*`、`candidate-*`、`heaps-*`、`comparison.json`。`after`和`final`的未达标数据保留；`diagnostic-*`、`targeted-*`、`variant-*`是定位用计时，不能冒充无诊断开销的最终指标。最初的底层Profiler启动未返回有效采样，之后改用既有窗口和轻量调用归属，没有引用无效CPU profile。

界面截图：`after-shot-cold-day.png`、`candidate-shot-cold-day.png`；实际驾驶截图 `candidate-drive-cold-day.png`。正式发布截图在 `release-loading.png`、`release-game.png`、`release-mirror.png`。

## 文件与保护范围

运行时：`src/loading/LoadingProgress.ts`、`Loading.ts`；`src/game/DrivingGame.ts`、`StreamingShaderWarmup.ts`、`startup/StartupApplication.ts`；UI `GameUIState.ts`、`GameUIController.ts`、`GameShell.ts`、`system.css`、`Hud.ts`、`Minimap.ts`；世界入口 `DrivingGround.ts`、`DrivingGroundCatalog.ts`；城市 `CityGround.ts`、`CityPhysicsSectors.ts`、`SectorManager.ts`、`VisualStreamingWorker.ts`；区域 `RegionalBackgroundBatches.ts`、`RegionalTerrainClearance.ts`（仅准备顺序分批）。

专项入口：`src/loading/LoadingProgress.selftest.ts`、`scripts/run-core-selftests.ts`、`scripts/check-preload.mjs`、`scripts/performance-preload.{html,ts}`；其余一次性检查、冻结服务、记录和摘要位于 artifacts，未引入依赖。

`preservation.json`核对开始前1,089文件和HEAD，只有本轮列出的19个既有文件变化；正式地图SHA256仍为 `8bb57f70c146b41d3264829190b00c100d36e521757cc6816374179c84e0ab7a`。v507批准账本和历史档案由正常构建继续验证。旧正式Release、PerformanceDeep备份和Round5回退的asar指纹保持不变。

人工建议：分别冷启动密集城区和雨夜，确认百分比/取消可用；等待结束后正常起步、快速跨区域和掉头返回；观察左右/内部镜面、阴影、HUD及雨刷；长时间驾驶查看内存是否回落。正式地图既有出生点布局未在本轮调整；性能路线使用的是明确落在既有道路上的局部验证出生点，不能代替全地图出生点和布局验收。
