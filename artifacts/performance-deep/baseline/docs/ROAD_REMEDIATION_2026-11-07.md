# 全局道路质量与性能整治（2026-11-07）

本轮基线是工作区已有的 Round 6 成果（地图 v498），不是 Git HEAD。未提交、推送或覆盖既有车辆、地图和道路几何成果。最终地图为 v505。正式包及入口检查结果见文末发布记录。

## 性能根因与实际改动

**主要原因一：分块发布的着色器准备与实时渲染互相干扰。** Three 的 `compileAsync` 在返回 Promise 前仍同步遍历对象、灯光并准备程序；原流程对共享材质和不同镜面重复执行。其等待逻辑还依赖可被实时主视图/后视镜改写的 `material.currentProgram`，可能在真正需要的程序尚未就绪时发布分块。基线最大慢帧中，461ms 帧有约431ms发生在渲染调用内；另有镜面渲染占约200ms的帧。

新增 `StreamingShaderWarmup`：按静态几何属性、实例属性、材质版本、灯光及主/镜面视图准备变体，每批最多12个代表对象；捕获确切程序句柄等待；共享环境纹理；最多保留512条签名，不持有历史几何。扇区失效或游戏退出会取消等待和后续准备。动态/蒙皮/变形对象不参与静态去重。

**主要原因二：远景后台任务持续构建整张地图。** 基线60秒内车辆只跨越4个 Sector，Worker 却完成3010项任务。原远景队列会不断处理全图8880个地形 Sector，带来编译、传输、发布、缓冲上传及临时内存负载。

远景改为按雾距、宽视角及非对称后视镜投影计算覆盖范围，加上预取和滞回；优先近处任务，取消过期排队任务，丢弃过期返回结果，释放离开的空间批次。无限视距检查仍支持完整地图。未降低雾内道路、建筑、树木或地形细节。原有逻辑道路、碰撞、导航始终保留。

**次要原因：** 对同一静态城市在多个渲染 pass 重复递归更新世界矩阵，以及选择结构包时重复线性搜索。城市运行时显式冻结已发布的静态矩阵，动态车辆、环境根节点每帧更新一次，信号灯根节点独立更新；编辑器和可视调试仍使用通常的矩阵更新。结构和道路使用已有 ID 索引。没有改变120Hz物理、天气、雨滴、雨刷、音频或导航行为。

CPU采样显示 Three 的程序参数/材质切换开销明显，GC自耗时约占基线采样的不到1%，不足以单独解释全部卡顿。没有证据把碰撞、导航或雨刷认定为主因，未为追求指标改动这些系统。

## 同条件实际驾驶对照

原始数据：`artifacts/road-remediation/runtime-baseline-light.json`、`runtime-optimized-light.json`；汇总 `performance-final.json`。使用完整游戏、真实车辆物理，`test-6at-sedan`，实际道路 `regional:v8:airport-city-road`，60秒，40秒白天晴天、20秒雨夜，1200×720、像素比1，同一画质，约1.43km、4个Sector。最终配对关闭CPU Profiler，仅每30帧采集GPU计时，避免测量造成额外慢帧。

| 指标 | 基线 | 优化后 |
|---|---:|---:|
| 帧耗时中位数 | 16.9ms | 16.6ms |
| P95 | 23.3ms | 20.8ms |
| P99 | 53.2ms | 37.1ms |
| 最大帧 | 461.1ms | 178.0ms |
| 超过50ms帧数 | 35 | 26 |
| 白天稳定段P99（10秒后） | 25.9ms | 21.9ms |
| 雨夜P99 | 42.4ms | 33.5ms |
| Worker完成任务 | 3010 | 508 |
| 主视图提交Calls中位数 | 468 | 465 |
| 主视图提交三角形中位数 | 477961 | 432620 |
| GPU单次渲染pass P95 | 11.20ms | 10.25ms |
| GPU单次渲染pass P99 | 18.15ms | 12.37ms |
| 观测到的JS Heap峰值 | 600.2MiB | 631.0MiB |

必须保留的限制：

- 卡顿有所改善，**没有全部消除**。优化后最大178ms仍不可忽略，其中早期帧渲染调用约107ms；部分长帧的JS回调仅14–24ms，其余时间可能涉及GPU/驱动/系统调度，现有数据不能进一步确定归因。
- **最终配对的Heap峰值未改善（约+5.1%）**。早先重采样条件下曾观察640→535MiB，但不能拿那组数字替代最终配对。未使用强制GC。
- `performance.memory` 是浏览器观测值，不能据此精确分离主线程与Worker；Worker Heap接口返回null。没有取得可靠的独立显存占用读数。
- GPU计时是单次render pass，不是整帧；主视图Calls不是全部镜面与阴影pass总和。不能把这些数值解释成显示器上的最终FPS或全帧GPU耗时。
- CPU道路缓存硬上限128条/32MiB；实测退出后道路缓存为0、资源释放完成、Worker disposed。远景历史批次有界淘汰。未证明所有硬件、长时间高分辨率驾驶均无残留卡顿。
- 最终性能配对在地图修复前的同一v498地图上进行，隔离运行时优化。最终v505正式包另外做真实城市入口检查；没有再重复整套性能采样。

## 地图修复与范围

覆盖检查：原3290道路、306路口；最终3292道路、306路口。新增2段只是主路接入位置的必要分割，原匝道ID保留。相对本轮开始，7条道路记录、58个路口、8条道路链接、12块语义路牌变化，普通场景物件变化0。完整ID列表见 `final-map-check.json`。

1. `access-ew-west-eb-on` 与 `system-central:W-to-N-semi`、`access-ew-west-wb-off` 与 `system-central:S-to-W-semi` 原来同高相交且不连接。通过已有mapctl的匝道接入操作重新安排主路接入次序；同步分割、链接和导航元数据。两条匝道最大坡度分别9.32%、8.26%，原主路层高不变。所有显式链接最大XYZ间隙0.0214m，候选事务的有向车道路线检查通过。
2. `v8-nancheng-ring-split-split` 局部780–880m锐角平滑，保持端点和其他路段；预览转角52.77°→24.45°，最大横向变化约3.85m，最大高度变化约0.01m。
3. 57个路口校正实际进口方向，显式保持原XYZ进口偏移与铺面高度，**操作没有改变任何道路XYZ**；局部锐角操作还同步了一个相邻路口，最终路口变更总数58。过期进口方向告警57→0。
4. 9块路牌的真实支架车道冲突经局部重新选站修复，保持服务道路和标志内容，检查其他道路、桥面、建筑和方向后preview/apply。另有3块随匝道接入更新，故最终变更路牌共12块。9处修复后的实际支架检查均通过。6处未找到安全候选的多层路牌保留并记录在 `objects-review.json`；没有为了减少告警把支架移到悬空或建筑内。

批量方案审查中发现两类回归，均未进入最终地图：

- 98个路口的通用repair会裁切部分进口并过度扩大铺面，截图发现后撤回该事务，完整保留Round6及其他独立事务；最终改用上述不移动端点的方向校正。`junctions-withdrawn.json`记录原因。
- 八条复杂匝道的smoothWave预览虽然通过基本合法性检查，但使局部坡度变化更差，因此没有应用。既有立交高程和净空约束保留。

最终全图结构校验：0错误、36警告（主要是既有12%坡度浮点阈值）。道路质量诊断仍有7个error级“快速路未连接”候选：已核对它们有共同后继/前驱和相近合分流端点，不作为无连接平交路口盲目连接；仍列入人工合流铺面验收。其余尚有10处斑马线重叠、41处停止线偏远、32处进口折向、6处低净空及其他候选告警，**未宣称这些视觉问题已全部解决**。水面、绿化和停车场包络告警没有盲目批量迁移。

## 验证、截图与文件

- 正式地图validate：`map-validation-final.json`，通过。
- 修复对象、连接间隙、匝道与9处支架检查：`final-map-check.json`，通过。
- 现有VisualStreaming专项：86项，通过；`visual-streaming-check.json`。
- 准确程序等待/缓存/取消检查、可见范围/远景历史释放检查：通过；`warmup-check.json`、`background-check.json`。
- 真实游戏退出后资源释放：`release-optimized-light.json`，通过。
- 类型检查通过；生产构建与桌面构建记录见 `build-targeted.*`、`desktop-build.*`。
- 五组实际地图、相同视角的前后截图：`before_/after_urban-junction-25.jpg`、`urban-junction-169.jpg`、`ring-bend.jpg`、`central-west-ramps.jpg`、`gantry-support.jpg`；汇总 `static-captures.json`。这是局部加载场景；截图边界处未加载远处物件不代表正式地图删减。
- 原始CPU采样、迭代数据与被拒绝预览全部保留，没有只挑最优单帧报告。

本轮运行时修改文件：

- `src/game/DrivingGame.ts`
- `src/game/StreamingShaderWarmup.ts`（新增）
- `src/world/city/CityGround.ts`
- `src/world/city/SectorManager.ts`
- `src/world/city/VisualStreamingWorker.ts`
- `src/world/regional/RegionalStreaming.ts`
- `src/world/regional/RegionalBackgroundBatches.ts`
- `src/world/regional/regional-main.json`

辅助入口为 `scripts/road-remediation*`、`scripts/smoke-road-remediation-release.mjs`；报告与原始数据位于 `artifacts/road-remediation/`。Git原有其他dirty文件保持原状，未commit/push。

## 发布记录和人工驾驶

正常build已实际执行，但在既有v494逐字段地图冻结检查处失败（此前Round6已为v498）；没有修改快照或弱化断言。沿用用户此前取消旧验收门禁的授权，本轮以专项验证、类型检查和`build-checkpoint.ps1 -BasicValidation`完成生产dist构建，再执行桌面编译、正常打包和正式EXE入口检查。**不能称完整core selftests通过。** 本次core在地图快照处停止，没有执行到历史Tank500发卡弯问题。

新包：`D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe`。
Round5完整回退：`D:/DriverSchoolRelease/DriverSchool-Round5-baseline-20261107/DriverSchool.exe`；复制后已校验EXE、asar和关键运行文件哈希。
正式包入口最终结果以 `artifacts/road-remediation/release-smoke.json` 为准，包含包/dist一致性、平台隔离、真实城市进入结果和截图。

最终发布检查已完成：生产构建、桌面构建、打包退出码均0；正式EXE约13.6秒进入完整城市驾驶，异常0、失败请求0，包内index与dist一致。`release-game.png`为正式包截图。`comparison.html`可浏览五组前后对照。249个既有文件的起始快照检查确认，除本轮列出的7个既有源文件外没有修改其他已快照文件；另新增1个运行时源文件。

人工驾驶建议按以下顺序：机场进城路持续行驶跨4个Sector→中央西侧两条修复匝道（双方向）→南城环路锐角段→`urban-junction-25`、`urban-junction-169`近景→雨夜返回同路线。重点看匝道合流隔离带、标线连续性、首次进入的偶发慢帧、镜面和桥底阴影。仍需后续处理首次GPU上传/阴影变体长帧、稳定Heap、复杂路口标线以及6处保留的多层路牌支架冲突。
