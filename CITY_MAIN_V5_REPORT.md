# City Main V5 实施报告

V5 已完成。普通城市路网、拓扑导向牌与道路附属几何已更新；Ring、东西/南北快速路、城际高速、六座系统互通、已有紧凑上下匝道以及隧道/下穿主结构保持冻结。验证比较了 V4.1 基线内 383 个冻结道路段的完整定义。

1. **参考图与内部路网。** 保留中央大道东西轴、斜向新城大道、东/西城大道、南/北城大道及各城区相对位置。在已有道路间补齐 19 条有稳定身份的城市街道，形成中央街区、西部错位小街、东部较大街坊、北部公园曲线道路和南部物流大街坊。新增街道连接既有道路；跨越冻结快速路时保持立体分离。

2. **数量变化。** 道路段 500 → 623，仍在 450–650 范围内；路口 84 → 155。19 条街道拆分为 71 个新增街道段，其余数量变化来自既有普通道路在新增路口处的必要拆分。没有增加快速路或系统互通。

3. **各区道路等级。** 中央大道和市府大道以 3+3 为主，金融路、市府北/南路采用 2+2，公园西路、市府街、城中路采用 1+1。西城以 1+1、局部 2+2 的错位/T 口街道形成较密街区；东城保留 3+3 主干及主辅路，补入 2+2 科创路和新区花园路；北城保留 2+2 大道并补入 1+1 弯曲公园/学院集散路；南城、仓储和物流道路以 2+2 大街坊为主。新城大道普通城区部分采用 2+2 → 核心 3+3 → 2+2 过渡，冻结接入口保持原宽度。

4. **Inner Boulevard。** 以西、西北、北、东、东南、西南六个城市道路区段组织，既有长弧段加入较直的中段和局部折向，保留路口接入切线和高度。它仍是有信号路口及地面接入的普通大道，2+2 为主、南部局部 3+3；长度约 5.59 km，现有包络约 2.03 × 1.45 km，没有缩成新的快速路环线。

5. **Decision Node 判定。** 读取逻辑路口、道路端点连接和行驶方向，排除原路回转及明显逆向返回。相关快速路/匝道或城市主干路进口存在至少两个有效前向出口时生成方向选择需求。普通主要十字路口合并为一个道路名称牌需求，避免每个进口都放大型牌。本图识别 316 个需求进口，其中快速路/匝道 92 个，城市道路 224 个。

6. **自动牌位。** 共 408 个牌位：92 个快速路/匝道需求各有预告牌与分流牌，共 184 个；城市方向/道路名称需求对应 224 个。识别出的相关需求没有缺牌。沿道路里程定位，空间受限时压缩预告距离并搜索上游连续段，快速路两阶段牌至少分开 28 m。

7. **自动有牌的分叉类型。** 快速路分流、匝道分叉、Y/fork、主干分支、主要 T 口和保留环岛的主要方向选择均使用同一逻辑。正常主要十字口至少生成道路名称牌；较小普通街道没有机械铺满大型导向牌。快速路优先肩部支撑的悬臂牌架，城市道路使用路边牌。

8. **文字来源。** 牌面由 RoadNameRegistry、出口道路 roadNameId、道路图追踪和方向元数据共同解析。无名称连接段沿图寻找有名称道路，必要时使用登记的城区目的地。中文没有写死进 mesh；稳定 ID、道路几何与名称注册表分离。城际高速名称同时保留既有 ID 兼容项。

9. **护栏断续根因。** 原先每个道路段独立生成并在相接端点裁去约 12 m，正常段落接缝因此出现大缺口；独立端点切线还造成转弯处的边缘错位。部分下穿入口的 barrierOffset 相差 0.25 m，造成可见缝隙。粗粒度中点判断路口开口也会误删或留下护栏段。

10. **新的共享边线。** RoadEdgeChains 使用逻辑 roadLinks 把相容且顺接的道路组织成连续走廊，接缝共享切线与左右边线。护栏偏移变化在接缝附近渐变；路面、路缘、人行道和桥底使用同一边线框架。护栏开口按统一 junction footprint、合流/分流与同高度道路检测切分，并细化开口边界；可见结构与物理碰撞使用相同区段。重复对象沿走廊里程布局，继续复用现有实例化和批处理。

11. **悬空与穿模。** 护栏、桥边和挡墙跟随实际道路高度，不按地形单独投影。路缘在 authoritative junction footprint 处结束。路灯、路牌和既有景观采用道路、路口、分流鼻端、桥墩及牌位排除。清理了 127 个冲突的既有对象，包括用旋转 footprint 检查出的侵路绿化带，没有重做景观。预览发现的路牌立柱遮挡已修正：支撑放到牌面背后；高架外侧路边牌的支撑延长至现有平面地面，桥上悬臂牌架留在桥面肩部，碰撞体与可见支撑一致。

12. **修改文件。**

    - 地图与道路数据：[CityMainV5Recipe.ts](D:/dsy/drivergame/src/world/city/maps/CityMainV5Recipe.ts)、[city-main.json](D:/dsy/drivergame/src/world/city/maps/city-main.json)、[CityMapData.ts](D:/dsy/drivergame/src/world/city/CityMapData.ts)。
    - 路牌：[SignPlacementGenerator.ts](D:/dsy/drivergame/src/world/city/SignPlacementGenerator.ts)、[RoadSignData.ts](D:/dsy/drivergame/src/world/city/RoadSignData.ts)、[RoadSignValidation.ts](D:/dsy/drivergame/src/world/city/RoadSignValidation.ts)、[RoadSignTemplates.ts](D:/dsy/drivergame/src/world/city/RoadSignTemplates.ts)、[RoadSignRenderer.ts](D:/dsy/drivergame/src/world/city/RoadSignRenderer.ts)。
    - 道路附属几何：[RoadEdgeChain.ts](D:/dsy/drivergame/src/world/city/RoadEdgeChain.ts)、[RoadsidePlacement.ts](D:/dsy/drivergame/src/world/city/RoadsidePlacement.ts)、[RoadInfrastructure.ts](D:/dsy/drivergame/src/world/city/RoadInfrastructure.ts)、[RoadBuilder.ts](D:/dsy/drivergame/src/world/city/RoadBuilder.ts)、[RoadClearance.ts](D:/dsy/drivergame/src/world/city/RoadClearance.ts)。
    - 定向检查与生成脚本：[CityMainV5.selftest.ts](D:/dsy/drivergame/src/world/city/CityMainV5.selftest.ts)、[build-city-main-v5.mjs](D:/dsy/drivergame/scripts/build-city-main-v5.mjs)、[test-city-main-v5.mjs](D:/dsy/drivergame/scripts/test-city-main-v5.mjs)、[inspect-city-main-v5.mjs](D:/dsy/drivergame/scripts/inspect-city-main-v5.mjs)。
    - 报告、8 张预览和结果：本报告与 [V5 预览目录](D:/dsy/drivergame/artifacts/city-main-v5/index.html)。

13. **Targeted validation。** 新路可达、端点连接、跨线立体分离、新路口统一 footprint 和口部高度、标线 ownership、牌位覆盖/朝向/高度/支撑排除、护栏/路缘实际接缝、道路边缘高度锚定及路口开口均通过。383 个冻结道路定义与 V4.1 一致。验证了 920 对实际护栏/路缘端点、66,390 个高度采样和 37,782 个新增道路/路口相关三角形。`pnpm run typecheck` 通过。按本轮要求，没有跑全量 core selftests；结果保存在 [test-results.json](D:/dsy/drivergame/artifacts/city-main-v5/test-results.json)。

14. **Build。** `pnpm run build -BasicValidation` 通过；该选项仅跳过本轮禁止的全量 core 检查，仍完成类型检查、生产构建与 playable dist 发布。地图源文件、候选地图和 dist 地图的一致性记录在 [build-result.json](D:/dsy/drivergame/artifacts/city-main-v5/build-result.json)，完整构建日志在 [build.log](D:/dsy/drivergame/artifacts/city-main-v5/build.log)。构建只有已有的大包体提示。

8 张实际预览：[预览目录](D:/dsy/drivergame/artifacts/city-main-v5/index.html)。未进行主观驾驶调校，人工体验可重点检查西城 → 中央大道 → 新城大道 → 东城，以及中央大道 → 上匝道 → 东西快速路 → Ring → 城际高速。
