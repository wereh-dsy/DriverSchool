# Road Geometry Round 5 — 全地图统一生成

## 结果与边界

正式菜单地图的 **3,290 / 3,290 条道路、306 / 306 个路口**均通过统一生成检查。生产路径使用 `RoadGeometry` / `ContinuousRoadGeometry`，不再按白名单选择旧渲染器。`RoadGeometryTrial.ts` 仅保留历史工具的兼容导出，指向同一个实现；历史基线模块只用于开发对照，不进入发布包。

地图文件、道路中心线/高程/连接、导航、车辆物理、天气和音频未修改。沿用现有静态碰撞生成合同。保留了开始时已有的 Round 1–4 未提交工作，没有 commit/push。

**遗留问题没有全部消失：** 7 根既有桥墩仍与建筑相交；地下宽人行道仍受原墙体碰撞位置约束。没有通过删除建筑、隐藏桥墩或移动道路掩盖这些问题。

用户后续授权正式 Release，并在完整核心检查被既有赛道验收阻挡后，明确选择本次按 BasicValidation 发布。发布流程执行类型检查、生产构建、桌面构建与完整运行包打包，再启动正式 EXE 检查。实际结果分别见 [Release 结果](../artifacts/road-geometry-round5/release-result.json)、[本次发布日志](../artifacts/road-geometry-round5/release-basic.log)、[正式 EXE smoke](../artifacts/road-geometry-round5/release-smoke.json)。不能将 BasicValidation 当成完整核心检查通过；本次没有删除或弱化原检查脚本。

## Round 4 遗留项处理

| 项目 | 处理结果 | 仍有限制 |
|---|---|---|
| 地下通道 | 人行道/路缘与实体围护统一生成，外缘限制在既有墙体内侧；闭合顶板、侧墙、洞口继续使用同一 EdgeChain | `urban-rail-underpass:underpass` 原 1.8 m 人行道只能提供约 0.23 m 的内侧预留；没有预留的下沉段无法恢复可通行的宽人行道。未移动墙体碰撞边界 |
| 桥梁 | 桥底、边缘、护栏及实例立柱使用统一生成；检查全图 6,774 根桥墩，没有发现与其他道路/路口的空间冲突 | 7 处桥墩与建筑的真实相交仍保留，详见下表和原始记录 |
| 非平面交通岛 | 使用既有岛体碰撞盒的高度区间裁剪铺面，避免把整个不同高度的路面挖空；岛体位置、大小及高度不变 | 复杂非平面用例为局部功能检查，不代表对每个岛体做了实车验收 |
| 凹形、多进口及异宽路口 | 凹轮廓分为耳切区域，对原权威 fan 做不重复裁剪，保留原高度平面；轮廓外中心点用例面积仍为 20 m²；异宽汇入按每个标线实际包围盒选择最终铺面，依赖多时每批最多 12 条 | 任意高度自交 fan 的物理歧义未修改；现有地图归一化轮廓和导航保持原状 |
| 地形 | 复用区域土方采样；不重复索引已被区域开挖处理的开放道路。城市负高程道路、隧道和路口按最终三角平面裁剪，保留顶板上覆土 | 没有逐建筑、逐山体进行全图视觉精修 |
| 生产阴影 | Worker 数据和 Sector 批次同时保留 `castShadow` / `receiveShadow`，相同材质但阴影合同不同的几何分批；实例也保留各自标志 | 阴影提交量相应增加；没有增加新的阴影 pass、反射或 SSR |

原建筑与桥墩冲突汇总（7 根桥墩、4 个道路 ID）：

| 道路 ID | 相交对象 | 根数 |
|---|---|---:|
| `regional:v3:S36-extension54:out:21` | `regional:warehouse:3480:4500`、`regional:warehouse:3640:4340` | 3 |
| `regional:v3:S36-extension54:in:6` | `regional:wuliuyuan:building:-1` | 1 |
| `regional:v3:S36-extension54:in:8` | `regional:warehouse:3640:4340` | 2 |
| `regional:v3:S36-extension54:in:9` | `regional:warehouse:3480:4500` | 1 |

圆柱中心确实位于建筑包络内，不是方形包络的角部误报。彻底消除这些冲突需要重新设计桥墩布局及对应静态障碍，超出本轮保持碰撞原状的边界。[位置、高度与建筑尺寸](../artifacts/road-geometry-round5/pier-conflicts.json) 已保留。

## 覆盖与生成数量

以下为全地图逐对象生成统计，不表示全图几何同时驻留，也不是物理“桥梁座数”。

| 对象/组件 | 数量 |
|---|---:|
| 道路生成任务 / 路口生成任务 | 3,290 / 306 |
| 路口交通岛实体 | 18（9 个 channelized 路口，保留原碰撞盒） |
| 桥底/桥面组件 | 2,226 |
| 桥墩实例 | 6,774 |
| 混凝土护栏连续组件 / 金属护栏连续组件 | 2,619 / 2,514 |
| 护栏立柱实例 | 281,579 |
| 隧道/地下墙体组件 / 顶板组件 | 28 / 14 |
| 下沉挡墙组件 | 399 |
| 人行道组件 / 路缘组件 | 1,288 / 1,284 |
| 中央隔离带连续组件 | 3 |
| 道路标线源网格 | 175,729 |

桥底仍沿用原系统的高程分类，因此组件数包含部分高位道路，不等于独立高架桥数量。全图非实例道路铺面/结构/标线为 15,699,171 个三角形；计入道路实例提交倍数后的估计为 20,115,843 个，不包含全部建筑、路口信号和环境。原始逐路/逐路口结果见 [coverage.json](../artifacts/road-geometry-round5/coverage.json)。

## 性能控制与实际对照

精确索引仅合并 **Float32 XYZ、法线、UV 全部相同**的顶点，不改变三角形顺序、硬边或标线面积。索引生成在 Worker 内有界让出，Sector 合并时正确偏移索引。全图逐路累计表面与实例矩阵输出由 1,529,827,040 降至 **810,723,680 字节**（约 47%）；这两个值都不是活动显存。

直线结构只移除精确共线站点，保留弯折、坡度变化和开口端点。没有增加 Geometry/Material 注册体系或新碰撞体系统。编译缓存继续为 32 项 / 8 MiB；Sector CPU 缓存继续为 128 条 / 32 MiB 的淘汰目标，正在使用的道路受保护；没有通过缩小缓存或强制 GC 得出低内存结果。

地形索引保留约 16,811 个必要平面，跳过 70,667 个已低于路面的平面，并复用原区域土方对 230,489 个平面的处理。索引随地图生命周期，不保存历史 Sector 几何。

最终对照使用独立 Electron 进程、相同完整地图、同一条路线的出发/移动约 1.5 km/返回三个站点、相同车辆物理输入、1200×650、相同材质光照和 2048 阴影。每个版本只有一轮最终有效对照。硬件为 RTX 5060 Laptop / ANGLE D3D11，离屏目标 60 Hz。三个站点分别执行约 12 m 中立挡物理滑行，位姿有效、位移相同。

| 指标 | Round 4 原生产默认 | Round 5 全图统一 |
|---|---:|---:|
| 构造主线程耗时 | 530 ms | 534 ms |
| 准备至首次完整近/中景加载 | 5.83 s | 6.58 s |
| 正常 Draw Calls（三站点中位数） | 330 | 335 |
| 阴影 Draw Calls（三站点中位数） | 36 | 50 |
| 总提交三角形（三站点中位数） | 341,054 | 423,981 |
| 站点几何数组最大观测 | 48.24 MiB | 65.93 MiB |
| 追踪到的 GPU Buffer 峰值 | 33.88 MiB | 45.27 MiB |
| 主线程 Heap 站点最大观测 | 469.86 MiB | 478.09 MiB |
| Sector update 最大单次 | 23.4 ms | 20.5 ms |
| 路线 Worker 活跃编译 P95 | 105.0 ms | 126.6 ms |
| 路线 Worker 活跃编译最大值 | 234.9 ms | 276.9 ms |
| 离屏帧间隔中位数 | 16.7 ms | 16.7 ms |

Worker 道路请求分别为 121 / 92 次，缓存重载和淘汰行为不同；上述路线编译统计不是完全相同任务集合的微基准。主线程构造耗时与 Sector update 分开记录，不能将 20.5 ms 写成全程最大阻塞。Heap 是站点观测，不是全部分配峰值；Worker Heap 未取得独立读数。GPU Buffer 统计不包含贴图、render target 或驱动总显存。离屏帧节奏不等于实际显示器游戏 FPS。

**加载仍增加约 0.75 秒，Worker CPU 仍有成本增长。** GPU Buffer 峰值增加约 11.4 MiB，几何数组峰值增加约 17.7 MiB，Heap 最大站点观测增加约 8.2 MiB；基本负载下没有持续帧节奏下降。缓冲峰值包含后台远景批次的容量预留和加载进度，不能把所有差额都归因于单条道路的主体几何。完整车辆外观、UI 与正常加载流程另由实际游戏入口确认；本轮没有做全图每条路线的驾驶性能认证，也不宣称所有性能指标均已达到原系统水平。

原始记录：[旧版独立进程](../artifacts/road-geometry-round5/browser-comparison-round4.json)、[新版独立进程](../artifacts/road-geometry-round5/browser-comparison-round5.json)、[汇总](../artifacts/road-geometry-round5/delivery.json)、[六对象单次 CPU 记录](../artifacts/road-geometry-round5/basic-cpu.json)。没有重复 Round 1–4 的全部专项、几何散列或碰撞包络基准。

## 本轮发现并修复的稳定性问题

全图启用后，新版在第二个站点的地形分块生成中发生渲染进程崩溃。微型复现确认：4 条边界相贴道路得到 271 个片段，其中 268 个零面积片段会继续被后续边界切分，产生失控增长。过滤退化片段后为 3 个有效片段，真实面积仍为 12 m²；此前失败的相同独立进程路线随后完成全部三个站点和释放。

- [边界复现及修复记录](../artifacts/road-geometry-round5/terrain-boundary-fix.json)。
- [修复前新版失败记录](../artifacts/road-geometry-round5/browser-round5-before-terrain-fix.json)、[崩溃记录](../artifacts/road-geometry-round5/renderer-failure-round5-before-terrain-fix.json) 均保留，没有计为通过。
- 验证启动器曾向已关闭的输出管道写日志，触发用户看到的 `EPIPE` 弹窗；已改为文件日志并处理输出流错误。另修复了开发页面的相对资源路径；普通隐藏窗口的 1 Hz 调度数据未用于性能结论。
- 初次组合进程对照在前版临时对象尚未回收的条件下失败，保留原始记录；最终两版各在独立进程运行，未强制 GC。
- 正式核心检查另暴露非分块地面的大三角形裁剪成本。增加逐片段包围盒筛选，仅在确实需要开挖时以 20 m 网格生成地面。4,000,000 m² 功能用例保留 3,999,968 m²（排除原 32 m² 道路足迹），生成 60,075 个顶点，没有改变地形高程。修复后复核新版三站点记录。

## 用户追加授权的发布修复

正常 Release 核心检查发现坦克 500 Hi4-T 的既有轮拱饰条在满压缩时侵入轮胎顶部。相关车辆源码此前与 HEAD 一致；没有将它归因于道路系统。临时编译副本把 22 mm 饰条的中心上移 11 mm 后，442 项姿态检查通过。用户随后明确授权应用该外观修复并正常发布。

实际只修改 `src/vehicle/visual/Tank500BodyExterior.ts` 的饰条顶点高度；不改物理配置、轮胎位置、悬架行程或碰撞参数。原失败日志及候选检查分别见 `release-blocked-tank-clearance.log`、[候选检查](../artifacts/road-geometry-round5/release-clearance-proposal.json)。修复后再次执行了完整检查流程，没有降低该姿态检查的断言。

应用后，正常聚合检查通过该姿态检查并继续到赛道验收，随后因既有 `Circuit hairpin tank-500-hi4-t: body has lateral margin` 停止。隔离原断言得到横向偏差 5.4726 m，要求小于 4.383 m。赛道、物理、碰撞尺寸及目录配置均与 HEAD 一致，这项验收不使用城市道路生成器或车辆外观。原始结果见 [赛道失败日志](../artifacts/road-geometry-round5/release-blocked-existing-hairpin.log)、[隔离重现](../artifacts/road-geometry-round5/existing-hairpin-probe.json)。截至该次失败，旧正式包没有被替换，不能声称完整核心检查通过。

用户随后明确授权本次采用推荐的 BasicValidation Release。本次发布跳过聚合核心自测，保留上述失败及原断言；没有修改赛道驾驶员、车辆物理或全局验证入口。此授权只用于本次发布结果，不将完整核心检查标记为通过。

### 本次正式包结果

2026-11-07 09:36，BasicValidation 类型检查及生产构建、桌面类型检查及构建、Electron 完整运行包发布均成功。可玩目录为 `D:/DriverSchoolRelease/DriverSchool-win32-x64/`，入口为其中的 `DriverSchool.exe`；应保留整个目录。正式 `app.asar` 为 42,614,375 字节，包内 `dist/index.html` 与当前 dist 完全一致。

实际正式 EXE 经桌面菜单选择 `city-main` / `family-sedan`，已进入驾驶界面，[正式包截图](../artifacts/road-geometry-round5/release-game.png) 已查看。桌面接口存在，页面未暴露 Node `require/process`。自动启动的隐藏窗口首次因后台限速超时；第二次只对检查进程关闭 Chromium 后台限速，没有改生产窗口设置或游戏配置。第二次进入驾驶、截图并恢复偏好后，检查工具在 `Browser.close` 等待已关闭的调试连接，导致退出记录未完成。已修正工具的关闭等待及提前保存；没有再次启动游戏重复检查，也没有把此工具退出码记为自动通过。`release-smoke.json` 明确区分 `entryVerified=true` 与 `automationCompleted=false`，未持久化的最终耗时/错误集不补造。

## 生命周期、运行与验证

新旧两版均完成 Sector 加载、离开及返回。释放后均为：CPU 道路缓存 0、地形条目 0、实例模板 0、Worker 排队 0，Worker 已终止，追踪到的 GPU Buffer 为 0。

实际 `StartupApplication` → `DrivingGame` → `city-main` / `family-sedan` 入口进入 `driving`，完成后续 120 帧，位姿有限、没有加载错误；初始化及运行约 20.5 秒，包含车辆等完整系统，不能与上表道路负载入口的 6.58 秒直接比较。退出释放检查通过。[入口记录](../artifacts/road-geometry-round5/game-entry.json)、[释放记录](../artifacts/road-geometry-round5/game-release.json)。

局部检查覆盖闭合地下结构、墙内侧带边界、阴影标志、精确索引展开、非平面岛体体积排除、凹轮廓及轮廓外中心点。相关类型检查通过。为验证索引布局变更进行第二次全图生成；地形退化修复后使用微型复现和实际 Sector 往返验证，没有再重复全图道路编译。

## 修改文件

- 统一生成：`src/world/city/RoadGeometry.ts`（新增）、`RoadGeometryTrial.ts`（兼容导出）、`RoadBuilder.ts`、`IntersectionBuilder.ts`、`ContinuousRoadGeometry.ts`、`JunctionSurface.ts`。
- 编译与分块：`RoadVisualCompiler.ts`、`VisualStreamingData.ts`、`VisualStreaming.worker.ts`、`VisualStreamingWorker.ts`、`SectorManager.ts`、`RoadGeometryTrialCache.ts`、`MidRoadVisual.ts`、`CityGroundGeometry.ts`。
- 区域资源：`src/world/regional/RegionalTerrainClearance.ts`、`RegionalBackgroundBatches.ts`。后者兼容索引输入，保持三角形展开完整。
- 检查合同：`src/world/city/VisualStreaming.selftest.ts` 按实际索引数量检查全部三角形，并加强索引和阴影传输断言，没有降低几何保留要求。
- 用户追加授权：`src/vehicle/visual/Tank500BodyExterior.ts` 的 11 mm 轮拱饰条高度修复。
- 开发/发布检查：`scripts/*road-geometry-round5*`、本报告及 `artifacts/road-geometry-round5/`。

完整开始/结束文件边界见本轮 worktree 记录。旧的道路/碰撞、车辆、地图等未授权源码不会被重置或回滚。

## 后续建议

下一轮优先处理首次加载的主线程构造与 Worker 长尾、复杂曲线标线的裁剪三角形、阴影几何 LOD。桥墩与建筑的 7 处冲突需要单独确认结构/静态碰撞布局方案；地下宽人行道需要明确实际物理预留。保留原地图和物理合同的同时，不能把这些布局冲突宣称已经彻底修好。

[新旧道路与实际游戏截图](../artifacts/road-geometry-round5/comparison.html)
