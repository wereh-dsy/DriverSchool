# City 道路模型与启动路径（2026-10-18）

## 数据职责

- `roadClass` 是交通功能：`expressway / arterial / collector / local / frontage / ramp / connector`。导航段通过 `roadFunction` 暴露此语义；标志决策、受控道路判断和路口标线读取同一个分类边界。
- `crossSection` 是轻量几何默认模板：`street / boulevard / shouldered`。`applyRoadCrossSection` 只修改车道尺寸、人行道、路肩及路缘；实际 `laneCount/laneWidth/shoulders/sidewalk` 仍是渲染、拓扑和物理共同使用的权威值。单向/双向仍由 `travelDirection` 表达。标线、gore 和既有中央/侧护栏参数继续显式配置，没有新增第二套分隔带系统。
- `elevationMode/elevation/centerline.y/structure.enclosure/piersEnabled` 继续表达高架、桥、隧道、下穿、下沉等空间布置。几何模板不会推断速度、道路等级或结构形式。
- `type` 是兼容旧地图/工具的断面标签，新格式可以省略。旧 `urban_* / highway / ramp_1` 和 `avenue/alley/industrial` 只在 `RoadClassification.ts` 的兼容边界解释。显式 `roadClass` 优先；两车道匝道与地面高速均受回归检查。
- 既有 Road Styles 保持完整的作者快捷预设，并显式写入功能与断面。编辑器只补充相应字段，未重做编辑流程。新道路 API 可组合功能、几何模板和独立高度参数。

已迁移两份当前来源：城市图 `city-main.json` version 11（623 道路）；菜单区域图 `regional-main.json` version 22（2857 道路）。旧 `type` 保留，历史地图不批量迁移。`scripts/migrate-city-road-model.mjs` 默认预览，`--apply` 才写入；不会改变道路几何/拓扑/尺寸。

## 启动边界与生命周期

Vite 在构建及开发服务器启动时调用 `compileCityRuntimeData`，完成现有完整校验、规范化、路口元数据和全局道路/车道连接图生成。结果输出为内容哈希命名的 `assets/city-main.runtime-*.json`。编辑器导入和其他地图仍走原验证入口。没有自定义 binary、额外依赖或复杂资源管线。

游戏先 `prepareDrivingGround`，只在选择 City Main 时 fetch/parse 该资源，然后通过原同步 `createDrivingGround` 构造实例。小地图 API 保持同步；离线调用者可向 prepare 提供相同编译结果。不可变编译数据在本页面生命周期内复用；切图仍创建、释放各自的视觉实例。资源失败可见且可重试，过期切图请求不替换当前地图。

CityGround 复用原地图对象构建所有地面区域，不再为了替换 bounds 而反复复制整张地图、使 RoadEdgeChains 的 WeakMap 缓存失效。路网生成改用道路/端点索引，保留显式 XYZ 链接与原连接规则。

全局逻辑拓扑、精细物理路面和碰撞体仍常驻；视觉继续复用原 SectorManager/Worker/近中远景机制。本次没有将路面、碰撞或信号 runtime 改成区域激活。车辆预热期间也推进出生点视觉准备。playable 仍要求车辆预热完成且当前近景已预热发布，不等远处完整城市。

## 性能测量

同一机器、各阶段单次数量级测量；不是统计基准。Node 使用浏览器的延迟视觉分支，只测 CPU 初始化，不将 Worker 替身当成可玩验证。

| CPU 阶段 | 原始来源运行时 | 优化后的编译资源路径 |
| --- | ---: | ---: |
| loadCityMap 校验/规范化 | 2085 ms | <1 ms（构建期完成） |
| road network | 695 ms | <1 ms（构建期完成） |
| 城市地面几何 | 3634 ms | 1106 ms |
| SectorManager 构造 | 1660 ms | 1015 ms |
| 全图静态碰撞体 | 2496 ms | 3174 ms |
| 路面索引 | 125 ms | 80 ms |
| 同步地图初始化合计 | 约 10.7 s | 约 5.4 s |

编译资源约 31.0 MB，Node JSON parse 约 180 ms；离线 compile 约 2.25 s。碰撞体仍为 517500 个，独立碰撞空间索引约 162 ms。不同阶段的 GC/分配波动不代表碰撞体获得优化。精细路面索引不占主导，因此未为它增加流式复杂度。

`node scripts/profile-city-startup.mjs` 可复现 CPU 测量，同时检查编译 JSON 往返、出生点、12 个自定义高程路段的 asphalt 支撑及道路模型回归。浏览器 `?city=main&cityProfile=1` 在 playable 时输出一次 `City startup`，包含初始化阶段、资源、Worker CPU、主线程发布耗时和加载里程碑。Performance 条目 `city:*` 区分资源下载、parse、Worker ready、扇区 shader/资源准备、firstRender 与 playable；JS/module 下载可直接读取 Resource Timing。

同一 Edge headless / SwiftShader、1280×720、本地 HTTP 环境，各测一次冷启动：原 dist（地图 version 21）18.39 s 可进入；新 dist（version 22）从 navigation start 到 playable 为 14.22 s，缩短约 22.7%，首次正常场景渲染为 14.59 s。主 JS 从 17.95 MB 降到 2.59 MB。City Main 额外请求 31.04 MB 编译 JSON（构建 gzip 估计 6.82 MB），本次资源加载含读文本约 1.13 s、parse 142 ms。这是 CPU/主包解析与单次地图资源体积之间的明确取舍。

打包版地图 CPU 阶段：groundGeometry 738 ms、SectorManager 701 ms、colliders 2435 ms、surfaceIndex 77 ms、collision index 182 ms。首次 playable 时仅发布 1 个近景扇区，而全局索引为 4988 个扇区；当前视觉含 28 条道路、10 块标牌，Worker 已编译 46 条道路。Worker 初始化 CPU 963 ms、道路编译累计 1007 ms、主线程分阶段发布 70 ms，首个扇区 shader/资源预热 19 ms。Worker ready 的主线程墙钟时间还包含构造期间主线程阻塞，不能当作 Worker CPU 耗时。

打包浏览器检查通过：冷启动/正常场景渲染、默认地图不请求 City Main JSON、模拟资源请求失败时保留当前地图、取消拦截后重试成功、切回地图复用资源且不重复 fetch；无 pageerror。已检查出生点道路可见的实际渲染截图。没有进行长路线驾驶或主观体验调校。

正常 `pnpm run build` 通过：typecheck + 72 组核心检查 + Vite staged publish，已原子更新可玩的 dist。核心包含道路模型 9 项、视觉流式生命周期 10 项、11 地图目录/重载 117 项；没有额外运行全车辆/全系统套件。保留既有大 chunk 提示。测量和检查记录：[results.json](../artifacts/city-loading-2026-10-18/results.json)。

## 验证与已有标牌修复

迁移前后结构化比较确认：分类迁移没有改变两份来源的几何、连接、物件或标牌。冻结道路检查补充了新增元数据的明确期望值，保持原几何检查。

正常 build 随后暴露 HEAD 中已有的标牌失败；用户分别明确授权以下四个标牌修复：

- `regional:logistics:N-to-E-star:sign:2000`：沿显式相连道路上游移动 60 m，实际提前距离由 82.64 m 改为 142.64 m。
- `topology-sign:endpoint:ns-nb-split-3-split-split:end|ns-nb-split-3-split-split|end:EXPRESSWAY_ADVANCE`：上游移动 60 m，实际提前距离 125 m。
- `road-safety:regional:lingang:S-to-E-right:false:guide:55`：箭头 left → right。
- `road-safety:regional:v3:airport-distributor:S-to-W-turbine:false:guide:130`：箭头 right → left。

移动使用现有道路采样、标牌基础净空和阅读间距检查；跨越的都是实际 endpoint links，包括城市/区域命名边界。保留全部标牌 ID、数量、其余标牌和道路数据。原 HEAD 地图配原检查代码复现了两对阅读冲突；HEAD 路径采样也复现了两块反向箭头。

直接相关的导航检查通过：routing 223 项断言、3 条区域路线；几何一致性 12915 项断言，覆盖 250 个路口、939 个接入口、2579 条链接和 1694 次连续边检查，最大边缘间隙为 0。

额外运行的 `pnpm run selftest:navigation` 组合入口在 Mercedes `mercedes-e300l-v214` 双屏导航显示断言失败，后续 geometry 项因此没有在该组合调用中执行。上述 routing/geometry 结果来自对原检查函数的独立调用；没有把组合入口报告为通过。该显示检查使用固定两道路 fixture，只依赖未修改的车辆/显示/导航实现，不使用本次 City 数据，未扩大范围修复。

确定仍值得后续处理的主要 CPU 成本是全图碰撞体生成；本次不继续扩展碰撞流式或数据格式。

## 主要文件

- 模型和作者入口：[CityMapData](../src/world/city/CityMapData.ts)、[RoadClassification](../src/world/city/RoadClassification.ts)、[RoadCrossSection](../src/world/city/RoadCrossSection.ts)、RoadStyles / MapAPI / 相关 presets、CityMapEditor 的对应属性。
- 逻辑消费者：[CityRoadNetwork](../src/world/city/CityRoadNetwork.ts)、MarkingOwnership、SignPlacementGenerator、区域 HighwaySigns / HighwayLaneRenderer / FastRoadSignPlacement / PresetGeometryValidation。
- 加载和构建：[CityRuntimeData](../src/world/city/CityRuntimeData.ts)、[CityMainResource](../src/world/city/CityMainResource.ts)、[vite.config](../vite.config.ts)、DrivingGroundCatalog、DrivingGame 的初始/切图资源边界、CityGround / CityGroundGeometry。
- 测量和检查：SectorManager / VisualStreamingWorker 的轻量阶段计时、[模型回归](../src/world/city/CityRoadModel.selftest.ts)、[CPU 检查脚本](../scripts/profile-city-startup.mjs)、正常 core/ground runner 的编译数据准备。
- 来源迁移：[城市图](../src/world/city/maps/city-main.json)、[菜单区域图](../src/world/regional/regional-main.json)、[迁移脚本](../scripts/migrate-city-road-model.mjs)。
