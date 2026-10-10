# City Main — Expressway Backbone V1

1. **地图尺寸**：4.90 × 4.35 km，500 m 扇区；323 段道路、51 个普通路口、21 个占位/基础设施对象。
2. **Ring 实际长度**：基准中心线 12,093.1 m；顺时针车行线 12,042.0 m，逆时针 12,144.1 m。完整闭环，四角半径分别 480 / 430 / 510 / 460 m。
3. **贯通快速路**：E–W 4,800 m；N–S 4,350 m，均延伸至地图边缘。
4. **车道和速度**：三条均为物理分离的 3+3 车道，车道宽 3.75 m。Ring 100 km/h，E–W / N–S 90 km/h；隧道和互通短接续段局部 80 km/h。快速路最大坡度 3.7484%。
5. **五座系统互通**：Central 全苜蓿叶；West 全苜蓿叶；East 全苜蓿叶 + C-D；North 两环形左转 + 两半定向左转；South 两环形左转 + 两外侧跨越左转 + C-D。每座均有四右转、四左转，八个转向显式接回主线。
6. **Central 几何**：N–S 标高 0 m，E–W 8 m；四条拉长的 270° 环形左转，弯曲段半径 60 m、150 m 接入段；同向合流到后续分流相隔 250 m。匝道宽 3.9 m，环形 45 km/h，外侧右转 55 km/h；匝道全图最大坡度 5.9997%。
7. **East / South C-D**：East 沿 Ring，South 沿 Ring 横向；双向各一条单向双车道集散道，700 m 平行段 + 两端各 100 m 渐变接入。环形匝道交织放在 C-D 内部，主线通过显式分叉继续贯通。
8. **North 半定向匝道**：两条相对布置的长左转，120 m 圆弧，上跨层 16 m，60 km/h；纵向爬升和横向跨越错开。South 跨越层 8 m，同样通过高度错开相对匝道。
9. **普通 diamond**：3 座；E–W 西/东各一座、Ring 西侧一座。复用原有 diamond 配方，新增可配置长度，接回原快速路而不重复铺主线。
10. **N–S 隧道**：双洞各 500 m，洞内坡度 0%，地板 −8 m、净高 6 m，连续独立三车道、实体侧墙/顶板、常亮顶灯；接坡包含在 N–S 连续纵断面内。
11. **城区下穿**：封闭段 110 m，地板 −7.5 m、净高 6 m；两侧渐变接坡最大 4.6840%。上方为静态基础设施预留廊道，没有活动铁路。
12. **城区道路等级**：稀疏六车道主干、四车道次干、双车道支路；北部校园、西部老城、CBD、东部新区和南部工业边缘通过普通道路连接。桥跨保持与快速路分层。
13. **斜向大道**：主斜向大道作者中心线 4,356.1 m，连接西南—中心—东北；另有约 1,062.7 m 区域次斜路，避免正交网格占满地图。
14. **主辅路大道**：东区 1,800 m；3+3 主路、每侧一条双车道单向辅路、辅路人行道；每方向三条 200 m 主辅转换连接，辅路连接城市街道。
15. **代表性路口**：19 个 T、31 个四臂（含错位/斜交）、恰好 1 个五岔；其中 5 个渠化路口；另有一个双车道环岛，以及老城单行道路对。路口局部端口角度可配置。
16. **可复用预设**：新增 `system_cloverleaf`、`system_cloverleaf_cd`、`system_cloverstack_lite`、`system_parclo_cd`、`divided_tunnel`、`urban_underpass`、`urban_main_aux`、`signal_cross_channelized_6x6`；扩展 diamond 长度参数。展开结果仍是普通 City 数据，保留 group/preset 元数据。
17. **快速路无平交保证**：快速路不参与城区交叉生成；道路投影相交不自动生成拓扑。互通、隧道、分合流通过 MapAPI 的 split、roadLinks 和端口连接；保存前验证完整拓扑和交叉净空。
18. **结构与接触检查**：双向 Ring 闭环、四条贯通方向、全路网单连通组件、主线不缩车道、40 个系统转向、匝道方向/接续、坡度/半径、所有中心线交叉净空。各车道共 15,864 个位置通过四轮柏油支撑和 2.02 × 5.05 × 1.95 m SUV 包络检查；超高包络会碰撞实体隧道顶板。检查包含在 CityMap 核心自测中。
19. **改动文件**：见下方清单；车辆及其他地图源数据未作本任务修改。City Main 已注册到现有地图目录，可选“City Main · 城市快速路”或使用 `?city=main`。
20. **typecheck**：`pnpm run typecheck` 已通过。
21. **验证/构建**：City Main 自测通过；27 个预设共 216 个几何用例、48 个接触场景/120,909 个采样通过；MapAPI/CLI 14 个用例通过；地图目录 9 张地图/9 次重载、99 个断言通过。最终 `pnpm run build` 成功，内含 typecheck、完整核心/车辆平台/City 自测和 Vite 生产构建；已原子发布可玩的 `dist/index.html`。Vite 提示主包 3.88 MB 超过 500 kB 提示阈值，未阻止构建。
22. **人工驾驶观察**：请检查 Ring 100–120 km/h 连续驾驶、五互通的路线可读性和主线交织、North/South 长跨越视野、隧道明暗、下穿入口、主辅转换与 Old City → CBD → New District 连续驾驶。12 个未使用端口为道路边界/未来延伸预留；建筑保持少量体块。尚未进行主观驾驶或视觉调校。

## 改动文件清单

- `src/world/city/maps/city-main.json`
- `src/world/city/maps/CityMainRecipe.ts`（新增）
- `src/world/city/maps/CityMainUrbanConnections.ts`（新增）
- `src/world/city/presets/BackbonePresets.ts`（新增）
- `src/world/city/presets/InfrastructurePresets.ts`
- `src/world/city/presets/PresetGeometryValidation.ts`
- `src/world/city/presets/catalog.json`
- `src/world/city/CityGroundGeometry.ts`（新增）
- `src/world/city/CityGround.ts`
- `src/world/city/CityMapData.ts`
- `src/world/city/CityMapValidation.ts`
- `src/world/city/CityRoadNetwork.ts`
- `src/world/city/geometry.ts`
- `src/world/city/IntersectionBuilder.ts`
- `src/world/city/RoadBuilder.ts`
- `src/world/city/RoadInfrastructure.ts`
- `src/world/city/RoadClearance.ts`
- `src/world/city/RoadStyles.ts`
- `src/world/city/CityMain.selftest.ts`（新增）
- `src/world/city/CityMap.selftest.ts`
- `src/world/DrivingGroundCatalog.ts`
- `src/world/DrivingGroundCatalog.selftest.ts`
- `scripts/build-city-main.ts`
- `scripts/build-city-main.mjs`
- `scripts/run-city-main-selftests.mjs`（新增）
- `scripts/validate-city-toolchain.mjs`
- `CITY_MAIN_BACKBONE_V1_REPORT.md`（新增）
