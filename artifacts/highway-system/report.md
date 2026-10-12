# Regional Highway System Upgrade V1 — 完成报告

现有城市、七条既有高速及原互通骨架保留。新增五条区域路线，统一高速数据、龙门架路牌、出入口辅助车道和加载统计。生产构建仅在最终验证后执行一次，并已发布可玩版本。

## 1. 高速列表

| 新增路线 | 规划中心线长度 | 连接与主要内容 |
| --- | ---: | --- |
| G42 晨江高速 | 5.59 km | 接 G17 东临走廊，经既有路网到东原枢纽；东西向长直线、晨江东出口、晨江服务区，接 S31 |
| G65 云岭高速 | 5.71 km | 接 G38，山区曲线、云岭隧道、云岭谷桥、云岭出口，接 S31 |
| S18 机场高速 | 7.87 km | 经既有绕城连接城市与机场；机场出口、航站楼接入道路、机场服务区 |
| S36 城际连接高速 | 8.32 km | 接绕城，通往邻近新城；新城出口、跨越 G4516 的城际山海跨线桥 |
| S31 沿江高速 | 16.97 km | 外围北东连接，连通云岭与晨江，设置沿江出口 |

保留 G17、G38、G4516、S26、S37、S68、S89 的内部 ID。按用户确认，S37 显示为 S27 西川高速，S89 显示为 S12 城市绕城高速；S26、S68 保留。G4516 标记为联络线。S26 和 G4516 的既有终端增设延长段，为真实 2 km 预告提供足够行驶距离。

最终：12 条路线，1490 个共享道路图中的道路段；可驾驶边界约 22 × 16.5 km。

## 2. 节点与统一数据

- 新增 5 个出口：晨江东、云岭、机场、新城、沿江；总计 12 个出口。
- 新增晨江服务区、机场服务区；总计 4 个服务/停车区。
- 新增 6 个高速接续节点：晨江接续、云岭接续、机场、城际、云江接续、晨江东。数据明确区分 `continuation` 与既有六个 `interchange`，不把直接接续描述成新建多向立交。
- 新增云岭桥隧、城际山海跨线桥和机场航站楼接入道路。
- `RegionalData.highways` 保存 route / exit / junction / service 数据，包括显示编号、双向目的地、出口编号、设施、位置和真实道路引用；附带数据校验，供路牌及未来导航/地图/AI 共用。

## 3. 路牌

高速牌统一绿底白字；机场地方接入道路使用蓝底方向牌。新增双支柱跨车道龙门架、桁架、独立编号盾牌、出口编号、目的地、距离和左右分流箭头，支柱位于铺装肩带内，桥上支柱落在桥面内。

所有区域出口双向均有 2 km、1 km、500 m 预告及分流牌，保留 200 m 补充提示。牌子沿真实单向连接向上游布置，跨越道路分段；记录实际预告距离，验证与标称距离差不超过 30 m。枢纽牌显示当前及目标高速和去向，入口/匝道后补方向确认。

牌面由注册数据绘制到纹理，模板几何及材质复用，完整牌面只在近景 sector 创建。最终全图 889 个路牌定义；启动时不会一次创建全部纹理。

## 4. 标线和可驾驶辅助车道

新增 115 段加速/减速辅助车道，作为普通道路接入既有道路图，使用原路面接触、护栏和碰撞查询。主线保持连续，辅助车道渐变打开或收回，匝道口重接并保持切线连续。

标线包含减速渐变实线、加速虚线合流、三角导流轮廓及白色斜纹，以及主线直行/出口箭头；删除辅助车道覆盖范围内重复的主线边界线，避免两套线重叠。导流区通过常规禁止驶入标线提示，不改变车辆物理或控制。

## 5. 加载优化和统计

- 玩家所在 sector 优先加载；近景保持完整道路、设施和牌面，中景保留简化道路/建筑/林地，远景采用粗地形和道路轮廓。
- 全区域远景地形从构造时一次创建改为限量分批创建；每次更新限制新增 sector 数量和构建时间。
- 灯杆、灯头、桥墩、隧道灯、反光柱、标志支架使用共享几何；已有护栏面继续按材质合批。
- 运行时共用道路空间索引；路口净空查询增加区域空间索引，仍使用相同精确判定。自测逐点对照原判定结果。
- 地形三角形共享角点高度采样，远景道路投影缓存重复采样。
- 平直且同高度的区域护栏碰撞盒合并，曲线、坡度变化和开口保持原采样形状。
- `CityGround.loadStatistics` / `SectorManager.loadStatistics` 记录 sector、道路、路牌、实际护栏段、远景进度、构造耗时、首次可见和首次近中景加载完成耗时；无逐帧日志。

本机 Node 自测（G42 出生点）：初始仅加载 1 个 sector、4 段道路、2 个牌面、8 个远景地形块；近中景填充后为 56 / 1776 个 sector、19 段道路、16 个牌面。首次可见约 2.25 s，近中景加载完成约 2.46 s。该结果是本机测试记录，不代表浏览器帧率；实际远距可读性和驾驶视觉由游戏内验收。

## 6. 修改文件

新增统一数据、增量扩展与标线/路牌模块：

- `src/world/regional/HighwayData.ts`
- `src/world/regional/HighwayExpansionRecipe.ts`
- `src/world/regional/HighwayMarkings.ts`
- `src/world/regional/HighwayLaneRenderer.ts`
- `src/world/regional/HighwaySigns.ts`
- `src/world/regional/HighwayValidation.ts`
- `src/world/regional/HighwaySystem.selftest.ts`

区域地图与集成：

- `src/world/regional/regional-main.json`
- `src/world/regional/RegionalData.ts`
- `src/world/regional/RegionalSigns.ts`
- `src/world/regional/RegionalTerrain.ts`
- `src/world/regional/RegionalWorld.selftest.ts`
- `src/world/DrivingGroundCatalog.ts`

共享道路/路牌/streaming 接口及资源优化：

- `src/world/city/CityGround.ts`
- `src/world/city/CityMapData.ts`
- `src/world/city/CityMapValidation.ts`
- `src/world/city/RoadBuilder.ts`
- `src/world/city/RoadClearance.ts`
- `src/world/city/RoadInfrastructure.ts`
- `src/world/city/RoadSignData.ts`
- `src/world/city/RoadSignRenderer.ts`
- `src/world/city/RoadSignTemplates.ts`
- `src/world/city/RoadSignValidation.ts`
- `src/world/city/RoadsidePlacement.ts`
- `src/world/city/SectorManager.ts`
- `src/world/city/presets/PresetGeometryValidation.ts`

生成和验证脚本：

- `scripts/upgrade-regional-highways.mjs`：从保留的当前区域基线增量扩展，不重建城市。
- `scripts/test-highway-system.mjs`
- `scripts/inspect-regional-geometry.mjs`
- `scripts/check-legacy-ground-baseline.mjs`：只读对比修改前后的既有体验场错误。
- `artifacts/highway-system/`：基线、节点摘要、自测结果、既有错误证据和本报告。
- `artifacts/regional-world/test-results.json`、`interchange-geometry.json`：更新验证结果。

车辆、物理、驾驶控制、车辆模型、座舱和 Tesla/A6L/BMW UI 文件未修改。保留城市道路及交叉口、对象数据，自测按原数据逐项核对。

## 7. 验证结果

| 验证 | 结果 |
| --- | --- |
| Highway System selftest | 12 项通过 |
| Regional World / 地图 / streaming selftest | 34 项通过 |
| 六个既有互通及新增外围几何 | 全部通过；包含转向、净空、坡度、支撑、相交与分流连接检查 |
| TypeScript 类型检查 | 通过，包括最终构建内的检查 |
| 修改范围与差异空白检查 | 通过 |
| 地图目录 selftest | 既有 `preset-showcase` 失败；修改前校验代码复现同一错误 |

地图目录失败原因：既有“道路设施体验场”的 `RoadEdgeChains` 构造产生空 corridor，读取 `parts[0].r` 报错。已通过只读加载 HEAD 中的修改前校验器复现，证据在 `legacy-ground-baseline.json`。按“只修本次修改导致的问题”的范围要求保留该逻辑。

未运行车辆完整测试、座舱测试或整套 core 测试。

## 8. 最终构建

`pnpm run build -BasicValidation` 成功，先通过类型检查，再完成 Vite 生产构建，并发布可玩的 `dist` checkpoint。使用 BasicValidation 是为了遵守本次只运行地图相关测试、跳过整套 core/车辆测试的要求。生产构建共执行一次。

Vite 仍提示主包体积较大；构建完成且可玩版本已更新。机场航站楼及服务设施沿用共享 prefab，属于 V1 表现；100–200 m 实机可读性和驾驶视觉留给用户验收。
