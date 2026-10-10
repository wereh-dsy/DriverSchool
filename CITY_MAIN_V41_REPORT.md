# City Main V4.1 — Junction Geometry Cleanup + Compact Urban Access

## 1. Junction overlap 根因

真实流程是 `loadCityMap → syncConnections → RoadBuilder / IntersectionBuilder → SectorManager`，物理路面由 CityGround 编译，地图由 CityRoadNetwork 的逻辑数据交给 LocalRoadMap / Minimap。

V4 的 84 个路口中，37 个旧路口没有 pavementFootprint，仍画固定矩形，同时接入道路没有被裁切。已有多边形只处理旧 mouth 的凸包，锐角处道路在边界之外仍有重叠；路缘、人行道也没有统一裁切。地图来自逻辑数据，但道路圆形端帽和旧矩形路口仍叠画。并非每个 junction 都重复调用 preset，主要问题是旧、新两条边界处理路径并存。

## 2. Authoritative junction footprint

加载、编辑重建时从实际道路口边缘及接入曲线的相交区推导一个有高度的凸多边形。锐角口补出完整的 approach 横截面和终端标线空间；短连接按相邻路口之间的空间限制展开。84 个路口全部使用这一个边界。

RoadBuilder 对接入道路三角形做平面裁切，保留 UV 和插值高度；路缘、人行道还避开相邻道路路面。IntersectionBuilder 每个逻辑路口只生成一个 pavement mesh。物理支撑也使用同一边界，运行时用预编译标量 mask，保留不同高度的道路。未增加 pavement / marking 的 Y 偏移。

## 3. Different-width junction

读取每条接入道路实际 laneCount × laneWidth、左右独立 shoulders、端点切线和高度，不用多个宽度 preset 补面。双向分离的主辅路以各自 carriageway 数据参与处理；人行道作为路缘外的独立带裁切，不计入可行驶路面。6×2、6×4、4×2、非对称肩宽和实际主辅路 junction 均在定向验证范围。

## 4. Angled / T junction

斜交口把旧 mouth 之外的实际接入重叠纳入统一边界，并把横道、停止线的纵向位置移到该边界。箭头沿真实道路曲线定位。T 口只使用现有三条接入道路形成一个面；终止道路在这个面中裁切，不用穿过对侧的道路面补洞。五向不规则口使用同一流程，没有增加控制系统。

## 5. Logical map 与 visual helpers

CityRoadNetwork 仍只发布逻辑道路中心线、宽度、方向连接和世界坐标 junction polygon。新增共有 LogicalRoadMapGeometry，由 LocalRoadMap 和 Minimap 调用：道路使用平端帽，裁去自己连接的 junction footprint，每个 logical junction 只 fill 一次。不相关的上层跨线道路不被裁掉。seam patch、桥裙、围墙帽、辅助 mesh、debug geometry 没有进入地图数据。没有改 Tesla vehicle code。

## 6. 压缩的 ordinary urban accesses

| 区域 | V4 匝道中心线范围 | V4.1 匝道中心线范围 |
|---|---:|---:|
| diamond-west | 550 × 480 m | 220 × 120 m |
| diamond-east | 550 × 480 m | 220 × 120 m |
| direct-west | 76.25 × 600 m | 76.25 × 320 m |
| direct-north | 600 × 76.25 m | 320 × 76.25 m |
| direct-south | 600 × 76.25 m | 320 × 76.25 m |

上表不包含伸出区域的既有城市道路、辅路外端和邻近普通桥梁，实体路宽会增加实际外缘。三处直连的单匝道纵向跨度从 300 m 降到 160 m，曲线半径 30 m，gore/taper 60–80 m。菱形匝道半径约 36–44 m，taper 80 m；保留 8 m 的主线高差，最大纵坡约 11.75%，限速 35 km/h，值得用户重点人工驾驶检查。

只移动既有普通接入的主线分段接缝，连续主线的世界坐标走向和原始高度曲线不变，连接 IDs 不变。500 个道路段、84 个 junction 没有增加。六座 system interchange 的 52 个所属道路段逐项保持原始数据一致；现有城市主轴和普通支路没有重建。景观数据保持 V4 原样，斜交预览中仍能看到少量既有绿化带投影伸入路面。

## 7. Direct / diamond / half-diamond 类型

保留并压缩 6 条 direct on-ramp、6 条 direct off-ramp，接入既有同向 frontage road，全部无 signal terminal。保留两个 compact diamond、8 条匝道和4个 signalized terminal；其城市横向道路仍需在端口处处理转向及横穿交通流。没有新增 half-diamond / folded diamond，也没有新增 ordinary cloverleaf。

另外将20个近乎平行的已有 merge junction 去掉错误的信号/横道模板，保留原连接关系；全图 signalized junction 由84降为64，该数字包含普通城市街道路口，不代表匝道 terminal 数。

## 8. 本轮修改文件

- `src/world/city/JunctionSurface.ts`
- `src/world/city/CityMapLoader.ts`
- `src/world/city/CityMapData.ts`
- `src/world/city/CityGround.ts`
- `src/world/city/RoadBuilder.ts`
- `src/world/city/IntersectionBuilder.ts`
- `src/world/city/MarkingOwnership.ts`
- `src/ui/LogicalRoadMapGeometry.ts`（新增）
- `src/ui/LocalRoadMap.ts`
- `src/ui/Minimap.ts`
- `src/world/city/maps/CityMainV41Recipe.ts`（新增，局部 authoring recipe）
- `src/world/city/maps/city-main.json`
- `src/world/city/CityMainV41.selftest.ts`（新增）
- `src/world/city/CityMain.selftest.ts`（仅 V4.1 ordinary access 的纵坡分类）
- `scripts/build-city-main-v41.mjs`（新增）
- `scripts/test-city-main-v41.mjs`（新增）
- 本报告及 `artifacts/city-main-v4.1/`：V4 基线、candidate、验证结果、指标、构建记录、六张截图和预览页面。

之前 V4 的其它未提交修改完整保留；没有修改车辆、添加依赖或提交代码。

## 9. Targeted validation

`node scripts/test-city-main-v41.mjs` 通过。覆盖 6×2、6×4、4×2、斜交、T、五向不规则口、direct on/off、compact diamond、共有逻辑地图；fixture 网格检查道路之间和道路/路口之间的可见 pavement ownership。实际地图84个 junction、173,237个接入道路/路缘/人行道三角形通过裁切检查。

52个 system 所属道路段原样保留；5,785条车道连接原样保留。变化的30个主线分段保留原走向和支撑高度。主線 crossing/grade-separation 检查通过；2,220次匝道路面支撑检查、220次 SUV 尺寸的结构净空检查通过。既有 marking ownership 回归通过（24,960个 paint vertices、4条停止线、8个 metadata arrows）。地图逻辑层每道路 stroke 一次，每junction fill一次；无视觉helper输入。

`pnpm run typecheck` 通过。按任务要求未运行全量 core / vehicle validation。六项实际预览保存在 `artifacts/city-main-v4.1/index.html`，其中逻辑图使用游戏的共有地图层，并非 Tesla 座舱截图。

## 10. Build

`pnpm run build -BasicValidation` 成功。构建入口运行了 typecheck 和 production build，通过 BasicValidation 明确跳过全量 core。Playable `dist/index.html` 和地图资源已发布，当前主资源为 `assets/index-Cq8X8P2m.js`。源地图、candidate 与 `dist/city-main.json` 的 SHA-256 一致。只出现已有的 production chunk 大于500 kB提示，无构建错误。

本轮完成后停止扩建。
