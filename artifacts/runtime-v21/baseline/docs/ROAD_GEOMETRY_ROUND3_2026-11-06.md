# Road Geometry Round 3 — 性能攻坚

## 范围与结论

保留 Round 2 的同一份局部白名单、最终几何、旧版默认入口、地图、导航和碰撞合同。没有修改正式地图、车辆物理、天气、音频，没有 build/release、提交或推送。本轮起点及既有脏文件散列见 [starting-worktree.json](../artifacts/road-geometry-round3/starting-worktree.json)。

按用户后续要求收敛验证：一次 CPU 热点采样，一次白名单/慢道路精确比对，一轮浏览器固定路线对照；不增加反向轮次、不重跑全量测试。第一次浏览器采样因页面被关闭而中断，其不完整结果不作为最终对照。

**已完成源码优化和专项一致性验证，但浏览器性能推广门槛尚未确认。** 浏览器/窗口工具均在初始化时报告找不到运行文件；用户协助打开后采样两次中断，最终仅保存 3 个优化前场景。停止本轮预览服务，保存 [incomplete-browser.json](../artifacts/road-geometry-round3/incomplete-browser.json)，不把这些数据当成成功对照，也没有追加第三轮浏览器采样。

## 查明的慢任务与优化

- Round 2 约 491 ms 的道路是 `direction-mingyuan-main-section-section-section-section`，不在新版白名单；旧渲染器也有同样长尾。不能将这笔耗时全部归因于连续几何。
- CPU 采样命中中央隔离带查询内反复执行 `map.roadLinks.some(...)`。改为每次生成隔离带时建立一次同义邻接 Set；不增加、删除或推断连接。
- `RoadCarriageways.pavedHeight` 每次遍历整条道路的所有铺面三角形，并为每个候选创建 contains 闭包。增加局部三角形空间桶，保留原三角形顺序、原高度函数、原所有权 mask、原最近高度及平局选择规则；不改变接触面。
- `RoadEdgeChains` 建组反复扫描全部既有连接组、反复创建 endpoint 字符串。改为 endpoint→原组的查找表，保留合并方向、成员顺序和后续走链顺序。它降低的是共同索引冷启动成本，不是通过把工作移到计时区外降低单任务数字。
- 编译阶段使用局部段长数组代替反复计算 Math.hypot；仍按原顺序逐段减去距离，没有用不同舍入顺序的前缀和/二分去改变最终 XYZ。采样缓存只活在本次编译范围，不保留历史 Sector。
- 长道路连续标线的所有权采样每 64 段让出，扇区拆分每 128 三角形让出；原虚线、结构和路口所有权保持。
- Worker 扇区拆分移除普通 number[] 顶点积累、toNonIndexed/clone 的展开副本及最终导出的再复制。按实际分区数量创建 TypedArray chunk，再合并为一次回复拥有的数组；实例模板和几何缓存仍走默认复制，避免 transfer 将共享数组 detach。
- 加入可选的生成阶段诊断、缓存字节/临时 TypedArray 字节、排队时间和跨线程时间点。主线程可分辨排队、Worker 活跃工作、yield/调度开销及返回派发。保留已有过期排队取消、单 in-flight、当前可见区域优先和重复发布防护；没有加入容易丢失尚未交付模板的进行中编译取消。
- Worker 释放时解除消息回调，清空排队时间记录；没有缩小 Round 2 缓存，也没有强制 GC。

慢任务逐路统计、阶段和类型见 [slow-tasks.json](../artifacts/road-geometry-round3/slow-tasks.json)；原 CPU 火焰数据为 [baseline.cpuprofile](../artifacts/road-geometry-round3/baseline.cpuprofile)。几何类型计数与生成阶段耗时分开记录，不把三角形数量当作 CPU 时间。

| 道路（同一 Node 输入） | Round 2 编译 ms | Round 3 编译 ms |
|---|---:|---:|
| direction-mingyuan-main-section-section-section-section | 1412.04 | 217.79 |
| v4-south-logistics-west | 1109.52 | 254.52 |
| direction-mingyuan-main-section-section | 886.99 | 118.19 |
| system-central:N-to-E-semi | 605.87 | 262.06 |
| direction-mingyuan-main-section-2 | 442.10 | 172.85 |
| ring-cw-0-split-split | 329.92 | 154.02 |
| v4-industrial-split-2-split | 312.03 | 191.10 |
| urban-underpass-end-approach | 176.80 | 140.12 |

## Heap 与传输

独立 Node Worker 对照使用同一完整地图及相同输入对象、独立 isolate，各执行一次，不调用 GC。它用于定位编译内存来源，**不是浏览器 Worker Heap 的替代读数**。

| 指标 | Round 2 | Round 3 |
|---|---:|---:|
| Node Worker Heap 峰值 | 1468.92 MiB | 1276.14 MiB |
| Node Worker ArrayBuffer 峰值 | 23.46 MiB | 19.33 MiB |
| CPU 连续几何缓存目标 | 32 项 / 8 MiB | 32 项 / 8 MiB（未缩小） |

这批 Worker Heap 采样还包含完整运行时编译、共享查询索引以及比对所需碰撞对象，不应与加载预编译运行时资源的浏览器 Heap 直接比较。原始逐任务 before/after、ArrayBuffer/external、缓存和阶段见 [targeted-worker-comparison.json](../artifacts/road-geometry-round3/targeted-worker-comparison.json)。两个 Worker 都退出 isolate。

CPU 数据所有权：回复数组由结果持有，transfer 后发送方不再拥有；模板和 pavement cache 的不可变数组有独立副本。主线程 Sector CPU plan、活动 GPU 几何数组是不同的必要阶段，卸载 GPU 不代表所有正在使用的 CPU plan 必须立刻消失。缓存淘汰机制及目标沿用 Round 2，不借缩小缓存制造低谷。

**主线程 Heap、浏览器 Worker Heap、活动 GPU Buffer、FPS、真实 Sector 重载后的残留引用：本轮未完成前后对照。** Round 2 的 1041/837 MiB 是历史结果，不冒充本轮结果。新增浏览器采样入口已经包含这些观测字段；需要恢复可操作的浏览器后补齐。

Node 采样中的 `roadStructureColliders` 校验还会准备碰撞查询索引，影响 Heap 和 GC 时点。因而 1469→1276 MiB 只能视为这批相同审计工作的峰值收窄，**不能据此断言生产浏览器 Worker Heap 已降低相同比例**。传输/缓存所有权检查独立验证了可复用模板未 detach，缓存重载后的数据逐位相同。

GPU Buffer 使用本地预览对 ARRAY_BUFFER/ELEMENT_ARRAY_BUFFER 的实际 bufferData/deleteBuffer 计数，同时保留活动数组估算。实际已分配 Buffer 不等于总 VRAM；不含贴图、render target 或驱动开销。每组静态采样峰值与整页累计峰值分别标注，不能把累计计数误当成独立分组峰值。

## 浏览器对照条件与结果

保存的 Round 2 源码先独立固化为 baseline 主线程和 Worker 模块，Round 3 使用当前源码；两者均开启相同的原局部白名单。使用相同 3,290 条道路、306 个路口、7,153 个场景对象、3,399 个标志、车辆、7 条路线、相机、1200×650、pixelRatio 1、2048 阴影及画质。保留 50/120 km/h 初速、120 Hz 真实滑行、夜间样本。只补一个原隧道内存场景和两次往返，省略已覆盖的其他三个静态扩展场景。

| 独立 Node Worker，31 条同输入道路 | Round 2 | Round 3 |
|---|---:|---:|
| 编译 P50 / P95 / 最大 ms | 33.41 / 1109.52 / 1412.04 | 31.37 / 254.52 / 262.06 |
| 单步骤 P50 / P95 / 最大 ms | 17.12 / 413.70 / 932.63 | 9.23 / 116.13 / 158.38 |
| 连续几何 CPU 缓存峰值 | 0.372 MiB | 0.372 MiB |

浏览器的 Worker P95 是否恢复到历史旧版 48.9 ms、最大任务是否低于历史约 491 ms、主线程 Heap 是否收窄、几何缓冲是否仍为约 142.55 MiB、Draw Calls/FPS 和实际往返释放：**均不宣称本轮通过**。31 条 Node 样本包含冷启动索引及诊断，不能拿其绝对耗时直接与历史浏览器数值比较。

只有一轮，存在顺序、GC、系统负载波动；不以单个最好样本证明统计性不退化。Worker 活跃耗时是生成器 next() 内的墙钟时间，包含该步骤内发生的 GC/系统抢占；经过时间还含 yield 等待。发送/返回差值包含消息序列化、派发及接收线程排队，不能声称已单独测出纯 IPC 时间。

## 正确性与资源生命周期

- 对全部 27 个原白名单 roadIds 加 4 条旧版慢道路，比较最终各 Sector、材质、三角形、位置/法线/UV/实例矩阵及包围体的散列；31 条道路逐位一致。
- 同批道路的静态碰撞包络及 ID 散列一致；4 个原路口的几何和标线所有权元数据散列一致。共 **66 条精确比对断言通过**。这比重复截图和面积近似更直接地约束本轮的数据排列优化。
- 沿用 Round 2 的实际值缓存失效机制，没有改动修订键、白名单回退规则、地图拓扑或物理模型；没有把历史专项结果伪报为本轮重跑。

- 新增真实 structuredClone transfer 检查：**7 条断言通过**。36 个传输 Buffer 无重复，发送方正确 detach，接收方持有数据，共享模板保持有效，缓存重载逐位相同，模板不重复发送。
- 现有流式异步生命周期 **10 条断言通过**；最终相关 TypeScript 检查通过。没有重跑 Round 2 的大批专项、全量测试或构建。
- 浏览器真实加载/卸载循环本轮没有跑完；十条生命周期断言是协议/异步释放检查，不能代替真实城市往返测试。

## 文件与复现

实现修改：`src/world/city/RoadCompileSampling.ts`（新）、`RoadBuilder.ts`、`MarkingOwnership.ts`、`RoadInfrastructure.ts`、`RoadCarriageway.ts`、`RoadEdgeChain.ts`、`RoadVisualCompiler.ts`、`VisualStreamingData.ts`、`VisualStreaming.worker.ts`、`VisualStreamingWorker.ts`；`SectorManager.ts` 仅接通可选诊断参数。

本轮开发入口和原始数据：`scripts/prepare-road-geometry-round3.mjs`、`profile-road-geometry-round3.mjs`、`run-road-geometry-round3.mjs`、`road-geometry-round3-node-worker.mjs`、`check-road-geometry-round3.mjs`、`road-geometry-round3-server.mjs`、`road-geometry-round3.ts`、`road-geometry-round3.html`、`road-geometry-round3.tsconfig.json`、`summarize-road-geometry-round3.mjs`；`artifacts/road-geometry-round3/`。既有 Round 2 文档、报告及预览文件保持独立。

baseline 已固化，prepare 脚本拒绝覆盖它。重新运行相关专项可用 `node scripts/run-road-geometry-round3.mjs`；开发预览服务为 `node scripts/road-geometry-round3-server.mjs`，入口端口 5194。普通预览不自动采样；只有 `?run=1` 或采样按钮启动。不要同时打开多个自动采样页。汇总脚本为 `node scripts/summarize-road-geometry-round3.mjs`。

## 剩余瓶颈与推广限制

当前残余长步骤包括旧路大型 pavement clipping、路缘裁剪以及路灯/摆放查询。这些不是新三维结构独有，不能为了指标删结构、减少标线、移除物件或改碰撞。本轮没有扩大相邻任务范围去重写这些系统。

进行中的单个旧铺面编译仍可能超过 Worker 8 ms 调度预算；分批只能在已有让出点发生，8 ms 不是严格最大步骤保证。标准浏览器 Worker Heap 若不可读，应报告不可用，不能拿 Node 或主线程值充数。单轮驾驶、两次往返也不能证明低配设备或无限行驶无泄漏。

是否达到本轮目标以实际汇总表为准。即便性能改善，也不自动授权全图开启；Round 2 地形冲突、复杂岛/异宽所有权及旧支撑面回退等推广前置问题仍保留。

