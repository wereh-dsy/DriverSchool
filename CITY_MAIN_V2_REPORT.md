# City Main V2 实施报告

总体 Ring、E–W、N–S 走向及五座城市系统互通位置保持不变。地图为 405 段道路、60 处城市交叉口；快速路与城际高速主线无平交，全部道路属于一个连通分量。

## 1–3. 城市立交压缩与匝道尺度

以下为匝道中心线在 XZ 平面的包络，含出入口端点；是可复核的尺度比较，并非实际征地面积。

| 立交 | V1 包络 | V2 包络 | 包络面积变化 | V2 loop / 半定向半径 |
|---|---:|---:|---:|---:|
| Central，完整苜蓿叶 | 1200 × 1200 m | 840 × 840 m | −51.0% | 35 m / — |
| West，紧凑苜蓿叶 | 1200 × 1200 m | 840 × 840 m | −51.0% | 32 m / — |
| East，苜蓿叶 + C-D | 1200 × 1200 m | 840 × 840 m | −51.0% | 40 m / — |
| North，2 loop + 2 半定向 | 1700 × 1200 m | 840 × 1100 m | −54.7% | 35 m / 70 m |
| South，parclo + C-D | 1700 × 1200 m | 840 × 1100 m | −54.7% | 35 m / 70 m |

半径为采样中心线的最小曲率半径。城市 loop 限速 35 km/h，右转与半定向匝道 50 km/h。匝道口缩短，loop 的加减速接续标段为 100 m，右转及半定向为 120 m。North 上层匝道最高 +14 m；South 利用 −8 m 的既有 N–S 下穿，与地面 Ring、最高 +6 m 的跨越匝道分层。共用出口接续段，护栏在合流和车辆高度范围内让开。

## 4–6. 城市出入口、信号终点与 C-D

- 新增 12 条快速路同向直连匝道：6 条 on-ramp、6 条 off-ramp。设置在 West Ring（−1750,725）、North Ring（900,−1400）、South Ring（900,1550），各配双向分离的短段辅路，并接入地面街道。North 段具有地面至 +8 m 的升降，West/South 与所在 Ring 地面段同高接续。
- 保留 2 座 E–W diamond（x = −875、+875），共 8 条匝道、4 处信号化终点。它们服务横向主干路，确实需要处理对向及交叉交通。12 条直连匝道占普通快速路上下匝道的 60%，均无信号化 ramp terminal。
- 保留并接续 East main/aux boulevard 的 6 条主辅转换道路，通过 East/South 地面网络连接快速路 access；补充 West 释放地块街道和 North/South 接续道路。
- East C-D 沿 Ring，South C-D 沿 Ring 的横向轴布置；中心线距相邻主线仅 14 m。双车道 C-D 与三车道主线间的铺装净间隔约 2 m，两端贴合主线收束。

## 7–9. 外围城际高速与两套设计语言

Intercity Expressway 从 East Ring 附近（1750,650）向东、东南延伸至 x = 3550 的地图边界。东行约 1982 m，西行约 1980 m；双向分离、每向 3 车道、限速 110 km/h、车道宽 3.75 m、内侧肩 1.5 m、外侧肩 3 m。中央分隔空间约 13.75 m，大于城市快速路约 3.5 m。主线有长直线和约 1400 m 的缓弯。

只新增这一条城际高速。地图东界由 2450 m 扩至 3550 m，其余边界不变，地形面积增加约 22.4%。城区接续段先下穿既有道路，随后抬升进入外围开阔地。

外围为四个转向完整连通的 T 型互通：2 条 60 m loop、2 条宽松外侧右转匝道。包络约 1335 × 870 m，面积约 1.16 km²，大于所有城市立交；loop 接续段 200 m、外侧匝道 220 m。城市匝道采用 32–40 m loop、70 m 半定向、更短接续段和更近的 C-D；外围高速保留宽分隔带、完整路肩、较大的互通空间与缓弯。

## 10–12. 景观、分区与渲染策略

新增 2630 个景观对象：1344 棵树、1002 段窄绿带/公园地面、129 段隔音墙、31 段植被边坡、6 处硬质养护区、6 盏稀疏外围路灯、14 块导向牌、10 段静态轨道构件、88 个建筑占位体块。保留原有 5 个占位建筑，并移开与外围新匝道冲突的 East 建筑。

| 分区 | 新增建筑体块 |
|---|---|
| Central | 7 个中高层办公体块 |
| West | 21 个低层住宅、9 个中层住宅、4 个厂房；布置略不规则 |
| East | 7 个中层住宅、8 个办公体块；较大间隔 |
| North | 9 个中层住宅，保留（400,−600）附近公园地块 |
| South | 13 个低层工业/仓储体块 |
| Motorway | 10 个物流仓储体块与开阔地 |

隔音墙集中在 North 住宅侧和部分 East Ring；快速路桥墩、下穿挡墙和隧道设施复用现有结构实现。高架桥墩按规则间距布置并避让下层路面。城市快速路复用常规路灯，外围路灯稀疏，隧道保留连续灯具。铁路走廊仅补静态构件。导向牌覆盖 Ring、City Center、East、West、North、South、Intercity Expressway。

树、绿带、隔音墙、边坡、建筑、标牌继续由 PrefabRegistry / SectorManager 分区实例化。建筑窗带先合并为一份几何，每类建筑仅主体、屋顶、窗带三批。全地图 prefab 部件测试为 47 个批次，1344 棵树对应两批实例（树干、树冠）；实际渲染按活动 sector 分批，47 不代表运行时总 draw calls。桥墩和灯具继续 InstancedMesh，挡墙按道路几何合并。净空筛选与景观生成发生在编图/加载阶段，不增加 120 Hz 物理循环工作；未进行 FPS 基准测试。

## 13–15. 验证

- City Main 结构自检：Ring 闭环、E–W/N–S 连续、五互通转向、匝道曲率、C-D 贴线、城市/外围 footprint 差异、直连匝道多数、城际高速边界连续、无主线平交、道路交叉净空，全部通过。
- 实际 CityGround / SUV 碰撞与四轮接地：每车道每 10 m 采样，共 39,598 个车身检查点；全部通过。隧道超高车身被物理顶板阻挡。
- `pnpm map validate-presets`：29 个预设、252 个旋转/参数几何案例、57 个驾驶案例、139,113 个车辆采样点、8 项错误拒绝检查，全部通过。
- MapAPI 创建、拆分引用、原子拒绝、保存/加载检查通过；`pnpm map validate city-main` 为 0 errors，仅有 24 个保留外延端口提示，无道路不连通或越界警告。
- `pnpm run selftest:grounds`：9 张地图、9 次重载、99 项断言通过。
- `pnpm run typecheck`：通过。
- 最终 `pnpm run build`：类型检查、全部核心自检、Vite 打包均通过；checkpoint 原子发布成功，`dist/index.html` 与 `dist/city-main.json` 已更新为 V2。打包有单个大 chunk 的提示，不影响构建和发布。

实测最大坡度：主线约 3.75%，匝道约 6.00%，城市下穿引道约 4.68%。

## 16. 人工驾驶重点

| 位置 | 检查内容 |
|---|---|
| Central（0,−150） | 完整紧凑苜蓿叶，35 km/h loop 与短接续 |
| North（0,−1400） | 70 m 半定向跨越、+14 m 上层及合流 |
| North Ring（900,−1400） | 同向辅路 → 升坡 on-ramp、off-ramp → 同向辅路 |
| West Ring（−1750,725） | Old City 街道 → 短辅路 → Ring |
| South Ring（900,1550） | East main/aux / 工业道路 → 同向上下 Ring |
| East（1750,−150）、South（0,1550） | 贴线双车道 C-D、紧凑分层 |
| East Ring（1750,650） | Ring 双向 ↔ 城际高速的四个转向 |
| Motorway（2650,650）至东界 | 宽分隔带、完整路肩、缓弯、外围仓储与树带 |
| N–S z = 450–950；West（−1250,−960） | 隧道、下穿、挡墙及连续接地 |

建筑和景观仍为第一批占位内容；主观驾驶体验、密度和观感留待上述人工检查。本轮未继续扩城。

## 修改文件

道路生成与内容：`src/world/city/maps/CityMainRecipe.ts`、新增 `CityMainLandscape.ts`、`city-main.json`。

预设与数据：`src/world/city/presets/BackbonePresets.ts`、`InfrastructurePresets.ts`、`PresetGeometryValidation.ts`、`catalog.json`、`src/world/city/CityMapData.ts`、`CityMapValidation.ts`。

景观与结构：`src/world/city/PrefabRegistry.ts`、`RoadClearance.ts`、`RoadInfrastructure.ts`。

验证：`src/world/city/CityMain.selftest.ts`、`CityToolchain.selftest.ts`；实景预览页面与截图位于 `artifacts/city-main-preview/`、`artifacts/city-main-v2/`。

V1 包络基准保存在 `artifacts/city-main-v2/v1-footprints.json`。截图直接使用 CityGround 的实际地图渲染，未使用示意图或生成图。

实景截图：`artifacts/city-main-v2/overview.jpg`、`top.jpg`、`central.jpg`、`motorway.jpg`。
