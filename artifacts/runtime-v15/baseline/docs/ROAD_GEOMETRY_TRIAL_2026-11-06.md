# 道路三维几何与模块化资产局部试验

日期：2026-11-06。来源：菜单实际使用的 `src/world/regional/regional-main.json`，v494。试验默认关闭，未推广全图。未提交或推送本轮修改。

## 1. 架构审查与问题边界

- `RoadSurfaceDetail` 是共享材质上的程序化微表面纹理与着色法线，不创建独立贴图平面，也不位移顶点。共享材质本身不是道路穿模根因；本轮保留其外观和资源所有权。
- `RoadBuilder` 已使用 `RoadEdgeChains` 生成连续路面，不是所有道路都由短平面随意拼装。该边链还统一了显式 roadLinks 的端部切线；必须保留。
- 薄片问题集中在人行道/路缘的独立水平 ribbon，以及金属护栏、挡墙、桥裙的双面零厚度墙。它们缺少真实截面和厚度，露边、洞口和低视角容易显出结构错误。
- `IntersectionBuilder` 对有 `pavementFootprint` 的路口已经生成单一高度感知铺面；无 outline 才使用方形 Plane。`JunctionSurface` 已裁掉道路进入路口的重叠部分，并区分上下层高度。因此本轮沿用该权威铺面，未另造路口覆盖层，也没有声称现有路口全都没有归属机制。
- 既有隧道已经有正反向顶板和真正洞口的厚度封边，并非全部缺顶。薄侧墙、未闭合的纵向屋顶边和分离的结构采样仍可改善。
- `sampleRibbonPolyline` 的偏移/miter 建立在 XZ 上，`roadPoints` 的 smooth 是水平曲线加单调分段 Y。新机制使用 XYZ 切线和法线，但不重新平滑或改变现有道路 Y，以免造成物理接触、路口和导航不一致。
- `SectorManager` 已按三角形质心分配扇区、按 Material 合批，并共享实例模板；Worker 编译道路后传递 TypedArray。保留这些实现。路口标线仍有独立 Mesh，初始化和路口 Draw Calls 的原有成本并未全部解决。

## 2. 本轮实现

`ContinuousRoadGeometry` 提供连续边界 ribbon、沿路径闭合截面扫掠、最终表面实体化和标线三角面投影。`RoadGeometryTrialSelection` 以 roadIds/intersectionIds 显式 opt-in，参数可通过 CityGround/SectorManager 传递到真实 Worker；默认参数缺省时仍使用原实现。

- 路面：沿用原中心线、共享边链及最终铺面裁剪，顶点 XYZ 与旧版逐值一致，保留物理支撑面。kernel 接受逐站左右 XYZ 边界，专项覆盖横坡和渐变宽度；没有新增地图字段，也没有为现有道路强加横坡。
- 路缘/人行道：先按最终路口和邻接道路裁剪上表面，再对外边界封侧面和底面；路缘和步道横向区域相邻，不再铺两个重叠顶面。
- 隔离带：使用既有 centralBarrierSectionSteps 的合法区间，扫掠带斜面的混凝土闭合截面，仍位于原双线预留带。
- 护栏：连续波形金属截面加共享 BoxGeometry 的 InstancedMesh 立柱；实例的基向量包含真实纵坡，未为每个采样点创建 Mesh/Material。
- 桥梁：有底面与侧边的连续桥板，保留原道路桥墩布局和实例模板，沿用 roadPierSteps 的下层道路避让。
- 隧道：闭合厚侧墙及厚顶板，顶板内面使用真实朝下法线，不依靠 DoubleSide 掩盖背面剔除。洞口厚度由实体边界封闭；原照明继续存在。
- 下沉道路：有厚度的连续挡墙；墙顶使用既有 retainingWallHeight/lowestDeckHeight，保留支路开口和真实高程。
- 路口：保留同一实际进口宽度/偏移定义的单一铺面 fan；新路缘在真实道路进口处断开，同一路口所有收口合为一个 Mesh。
- 标线：保留既有 MarkingOwnership 和原标线对象，将薄几何与其最终铺面三角形精确求交；按相同平面插值高度后抬高 8 mm。路口标线只接受本路口和自身进口的铺面，不借用其他道路或上层桥面。

结构采样间距上限 4 m、立柱间距约 4 m，保留原弯点。资产共享现有 Material，连续结构由批量 BufferGeometry 提交；扇区最终仍按原材质合批。新机制只在编译/加载时工作，无每帧全图遍历或每帧重建；没有增加任何碰撞体。

## 3. 真实测试区域与截图

截图均为同一个 WebGLRenderer、同一相机/灯光/共享材质的左右对比：左旧、右新。保留周边真实道路观察上下层关系；不加载建筑和正式地形，统一基板位于该片段最低道路下方，没有用遮罩隐藏道路。

| 区域 | 实际对象（包含被选择的进口道路） | 整体截图 | 状态 |
| --- | --- | --- | --- |
| 城市主干道 · 连续路缘 | `v4-south-logistics-west` | [arterial.png](../artifacts/road-geometry-trial/arterial.png) | 已完成 |
| 快速路 · 中央隔离带 | `direction-mingyuan-main-section-section` | [median.png](../artifacts/road-geometry-trial/median.png) | 已完成 |
| 普通平交 · 铺面与标线 | `v4-inner-1-m91-section`, `v5-finance-road-m91`, `v4-inner-1-split-2-m91`, `access-finance-north-section-section`, `urban-junction-83` | [junction.png](../artifacts/road-geometry-trial/junction.png) | 已完成 |
| 分离式六臂路口 | `v4-inner-0-v91-m91`, `v4-inner-0-split-2-v91-m91`, `v91-ew-0-a-3`, `v91-ew-0-a-4`, `v91-ew-0-b-3`, `v91-ew-0-b-4`, `urban-junction` | [divided.png](../artifacts/road-geometry-trial/divided.png) | 已完成 |
| 高架 · 护栏与桥墩 | `ew-wb-split` | [bridge.png](../artifacts/road-geometry-trial/bridge.png) | 已完成 |
| 地下通道与下沉挡墙 | `urban-rail-underpass:underpass`, `urban-underpass-end-approach` | [underground.png](../artifacts/road-geometry-trial/underground.png) | 已完成 |
| 附加验证 · 斜交五臂 | `urban-diagonal-split-split-split-split-3`, `v5-east-garden-split`, `urban-east-arterial-split-split-3-split-2-split`, `v5-east-garden-c91`, `urban-east-arterial-split-split-3-split`, `urban-junction-97` | [skew.png](../artifacts/road-geometry-trial/skew.png) | 已完成 |

近景：[城市路缘](../artifacts/road-geometry-trial/arterial-detail.png)、[快速路护栏/中央隔离带](../artifacts/road-geometry-trial/median-detail.png)、[平交路缘收口](../artifacts/road-geometry-trial/junction-detail.png)、[高架结构](../artifacts/road-geometry-trial/bridge-detail.png)、[通道内部](../artifacts/road-geometry-trial/underground-interior.png)。共 12 张 PNG，约 1.94 MiB。

![快速路近景：左旧右新](../artifacts/road-geometry-trial/median-detail.png)

![普通路口近景：左旧右新](../artifacts/road-geometry-trial/junction-detail.png)

## 4. 几何质量与穿模验证

- 20 个道路样本逐顶点核对，新旧路面 XYZ 不变。曲线与纵坡没有靠移动道路来修复。
- kernel 的 138 项断言涵盖 XYZ frame 正交性、横坡/变宽、连续扫掠闭合性、屋顶六面完整性、内部 FrontSide 射线以及上下层标线隔离。
- 真实样本共 22304 次结构采样（包括护栏立柱八角点和路口收口）；按 1 mm 边界数值带检查自身车道与其他可行驶层，未发现新增侵入。桥墩沿用的 13 处合法位置亦核对下层道路避让。
- 道路标线顶点均在最终自己的铺面三角形内；实测最大高度偏移误差约 0.0142 mm，验收上限 0.5 mm。三种路口所有原标线对象均保留且非空，投影只落在本路口/自身进口。
- 隧道在入口附近、1/4、1/2、3/4、出口附近共 5 处车内向上射线全部命中顶板；实际浏览器内部视图无缺顶/错误背剔除。
- 各片段扇区卸载后道路渲染三角形归零；重新加载的 Draw/triangle/buffer 统计一致。真实 Worker 的桥梁样本路面顶点和批次/实例数量与主线程一致。既有异步资源准备/延迟释放生命周期专项 10 项断言通过。
- 这是局部结构和采样检查，不是全图网格布尔求交或完整车辆净空认证。未用删除路面、标线、照明或遮挡其他道路的办法通过验证。

## 5. 性能对比

以下均为旧 → 新。Draw Calls 和提交三角形来自实际浏览器同相机整体视图的 `renderer.info.render`，包括实际阴影渲染提交；几何缓冲是已激活扇区的 position/normal/UV/index/instanceMatrix 字节估算，包含上下文道路，不是总显存或 JS heap。生成耗时是 Node 中同片段、交错顺序各 3 次生成的中位数，包含扇区合批及首次加载，不是正式 build 时间，也不是每帧耗时。

| 区域 | 实际 Draw Calls | 实际提交三角形 | 几何缓冲 MiB | 局部生成 ms |
| --- | ---: | ---: | ---: | ---: |
| 城市主干道 · 连续路缘 | 23 → 23 | 55,227 → 67,552 | 5.43 → 6.56 | 712.4 → 778.1 |
| 快速路 · 中央隔离带 | 88 → 92 | 43,376 → 57,502 | 3.50 → 4.24 | 169.4 → 192.1 |
| 普通平交 · 铺面与标线 | 109 → 111 | 26,155 → 32,437 | 2.41 → 2.93 | 97.4 → 167.6 |
| 分离式六臂路口 | 289 → 291 | 55,506 → 60,317 | 3.91 → 4.07 | 137.4 → 159.5 |
| 高架 · 护栏与桥墩 | 149 → 153 | 176,866 → 178,822 | 16.62 → 16.74 | 1401.6 → 1259.1 |
| 地下通道与下沉挡墙 | 44 → 44 | 44,420 → 50,211 | 3.96 → 4.49 | 183.0 → 169.9 |
| 附加验证 · 斜交五臂 | 191 → 193 | 26,399 → 32,197 | 2.27 → 2.67 | 75.4 → 108.0 |

实际整体视图新增 0–4 Draw Calls。激活几何三角形增幅约 0.8%–25.7%，几何缓冲约 0.7%–21.9%；带阴影实际提交三角形最大增幅约 32.6%。新增实体有合理但非零成本。桥梁/下沉片段生成时间本次较低属于运行波动，不能解释为新机制已经普遍更快。

本轮硬预算（代码中有断言）：按最多 9 个加载扇区、每扇区额外 4 次提交的额度限制片段新增绘制总数；激活三角形和缓冲不超过基线 2.5 倍；局部生成增量不超过 150 ms 且不超过基线 2 倍。所有样本通过。该上限是试验保护线，不能作为全图长期性能目标。

GPU 实际上传资源在连续 3 次释放/重建后均为 199 个 geometry、5 个 texture，未出现数量增长；无 WebGL 错误/上下文丢失。主/子视图共用材质，未为模块新建贴图。

原始数据：[local-checks.json](../artifacts/road-geometry-trial/local-checks.json)、[browser-checks.json](../artifacts/road-geometry-trial/browser-checks.json)。

## 6. 运行与验证命令

```text
node scripts/road-geometry-trial-server.mjs
# http://127.0.0.1:5192/scripts/road-geometry-trial.html
# 点击“采集全部样本与 Worker 检查”，或使用 ?capture=1
node scripts/run-road-geometry-trial.mjs
pnpm exec tsc -p scripts/road-geometry-trial.tsconfig.json --incremental false
```

本次最终结果：上述局部 runner 成功；核心源码 `pnpm exec tsc --noEmit --incremental false` 成功；开发入口和局部 runner 严格类型检查成功；`git diff --check` 成功。开发调试时的 Float32 边界查询误判和脚本类型错误已修复并重跑通过。没有执行全量测试、完整 build、release 或正式发布。

原始地图 SHA-256：`eed5910f30ff82e3c629b54a4bc19d935e6179b2e6595314fa6b681f016b32f9`。与 Git HEAD 比较的 blob SHA 均为 `369988526b720ecb91433008fb52e4ae8574bc26`，地图字节未改。没有修改道路中心线、连接、导航、车辆物理、天气或音频。

## 7. 修改文件清单

| 文件 | 用途 |
| --- | --- |
| [src/world/city/ContinuousRoadGeometry.ts](../src/world/city/ContinuousRoadGeometry.ts) | 连续 ribbon、XYZ 截面、闭合实体、最终三角面标线投影 |
| [src/world/city/RoadGeometryTrial.ts](../src/world/city/RoadGeometryTrial.ts) | 地图边链适配与实体道路资产、路口路缘收口 |
| [src/world/city/ContinuousRoadGeometry.selftest.ts](../src/world/city/ContinuousRoadGeometry.selftest.ts) | 曲率、纵坡、横坡、变宽、闭合性与背面剔除专项 |
| [src/world/city/RoadBuilder.ts](../src/world/city/RoadBuilder.ts) | 仅对显式选择的道路切换生成机制 |
| [src/world/city/IntersectionBuilder.ts](../src/world/city/IntersectionBuilder.ts) | 仅对显式选择的路口切换铺面/标线/收口 |
| [src/world/city/SectorManager.ts](../src/world/city/SectorManager.ts) | 传递可选试验选择，沿用现有合批和资源生命周期 |
| [src/world/city/RoadVisualCompiler.ts](../src/world/city/RoadVisualCompiler.ts) | 将试验选择传入既有 CPU 编译器 |
| [src/world/city/VisualStreamingData.ts](../src/world/city/VisualStreamingData.ts) | 可序列化的可选 init 参数 |
| [src/world/city/VisualStreamingWorker.ts](../src/world/city/VisualStreamingWorker.ts) | 向 Worker 转发试验选择 |
| [src/world/city/VisualStreaming.worker.ts](../src/world/city/VisualStreaming.worker.ts) | Worker 使用同一试验几何生成器 |
| [scripts/road-geometry-trial-data.ts](../scripts/road-geometry-trial-data.ts) | 六类真实区域及额外斜交样本，构造只读开发片段 |
| [scripts/road-geometry-trial.ts](../scripts/road-geometry-trial.ts) | 同相机双视图、截图、实际渲染指标与 Worker 检查 |
| [scripts/road-geometry-trial.html](../scripts/road-geometry-trial.html) | 开发预览界面 |
| [scripts/road-geometry-trial-server.mjs](../scripts/road-geometry-trial-server.mjs) | 仅本机的 Vite 开发入口及有界截图保存接口 |
| [scripts/road-geometry-trial.tsconfig.json](../scripts/road-geometry-trial.tsconfig.json) | 开发入口和局部验证脚本的严格类型检查 |
| [scripts/run-road-geometry-trial.ts](../scripts/run-road-geometry-trial.ts) | 真实样本几何、净空、标线、分块和性能预算验证 |
| [scripts/run-road-geometry-trial.mjs](../scripts/run-road-geometry-trial.mjs) | 局部验证运行入口 |
| [docs/ROAD_GEOMETRY_TRIAL_2026-11-06.md](../docs/ROAD_GEOMETRY_TRIAL_2026-11-06.md) | 本报告 |

交付产物另有 `artifacts/road-geometry-trial/` 下 12 张截图和两份小型 JSON，未产生或重新提交超限报告。

## 8. 尚存问题与全图推广风险

1. **目前只证明局部机制可运行。** 大地图的实际完整地形、所有路口、支路洞口、相邻结构体交叠及长途流式加载未全量验证，不能声称全图穿模已经消失。
2. **初始化成本上升。** 普通路口本次约 97 → 168 ms，新增约 70 ms（约 72%）。标线逐三角形裁剪带来一次性 CPU 成本；全图之前需要继续控制缓存/生成调度和 Worker 编译预算。
3. **道路接触合同保持原样。** 本轮没有改变“仅水平平滑 + 单调 Y”的作者曲线或物理支撑面。新 kernel 的横坡/变宽能力只做 API/几何专项验证，没有把 CityRoad 扩展成新的超高/车道渐变设计系统。
4. **作者数据仍约束结果。** 复杂分离式路口沿用原 convex footprint 与中心 fan，不是任意凹多边形/交通岛的 CAD 求解器；隧道、步道、挡墙的原始边界配置如本来冲突，仍需单独核对，不能通过视觉重排破坏碰撞边界。
5. **边界与碰撞仍需扩大覆盖。** 侧向厚度总体向车道外布置、中央隔离带保留原预留带，但所有模块外表面并非逐面等同旧碰撞盒；特殊护栏、墙厚、连续隧道内部封边和异宽 road-ID 接缝需在推广前专项验证。没有改变任何碰撞代码。
6. **局部地图片段的限制。** 开发片段使用原对象和邻接上下文，没有改写或截断中心线；未纳入片段的远处结构不能参与该片段的所有净空查询。真实 Worker 顶点对比目前选择高架样本，异步发布/回收覆盖由既有 lifecycle 专项补充，尚不是全 regional 旅行验证。

因此保留默认旧渲染器与显式局部开关，不自动开启整个城市。后续应先评审近景效果、初始化增量和上述边界覆盖，再决定是否扩大范围。
