# City Main V5 地面道路高程回归修复

1. **悬空根因。** 普通道路数据被写入覆盖大片城区的桥梁高度场，最高达到 14.5 m；随后 `custom` 模式、路面和桥墩正常读取这些错误的设计高程。RoadEdgeChains 只跟随道路，没有反向抬高道路；RoadBuilder 的既有路面偏移只有 0.024 m，不是米级悬空的来源。

2. **造成回归的最近改动。** 上轮 V5 的 `add()` 复制了 V4 的区域桥梁高度公式，为新增城市街道设置 `elevationMode: custom`，并默认允许桥墩。它扩展了原有部分大道的同类错误。本次给已完成的 V5 连接图增加高程归位步骤，区域构造高度不再成为最终物理高程；发布修复直接使用 V5 当前地图，没有重新生成路网、路牌或景观。

3. **最终高程规则。** 复用 `elevationMode`、`elevation` 和 centerline Y，没有另建道路类型体系。

   - GROUND：使用现有平面地面基准 −0.04 m。道路接触基底高于地面 0.016 m，加上既有路面渲染偏移 0.024 m，可见路面高于地面 0.04 m；旧地图未指定地面基底时仍兼容原来的零基准。
   - ELEVATED：保留明确的绝对桥面高程和既有设计 profile。
   - DEPRESSED：既有负高程和 enclosure 保持不变，仍由 `custom` profile 表达，不做 ground clamp。
   - RAMP / TRANSITION：既有匝道逐点保留。普通街道只在实际无逻辑连接的跨线点形成局部桥面，沿道路生成连续过渡；修复产生的局部过渡坡度上限为 10%。高于地面的快速路允许普通街道从下面穿过，不共享路口面。
   - Junction：普通路口使用各进口共用的地面 landing；高度修复后的统一 footprint 在加载重建时不会重新继承邻近桥梁过渡的 Y。

4. **普通城市道路修复数量。** 处理 240 个普通城市道路段，238 段实际修改了 Y；198 段成为明确的 GROUND，42 段保留局部跨线或接入过渡。全部 623 道路段、155 路口、roadId、道路 X/Z、车道宽度和连接关系保持。没有新增道路或路口。

5. **高架快速路。** 383 个受保护道路段的完整定义与修复前一致，包含 Ring、东西/南北快速路、外围城际高速和六座系统互通。定向案例 `ew-eb-split` 的桥面仍为 8 m。

6. **匝道、下穿。** 既有系统匝道、紧凑城市上下匝道、隧道和下穿逐点保持。`direct-north:off-1` 仍为 0→8 m，逐米采样最大高度变化约 0.0681 m；`urban-rail-underpass:underpass` 仍为 −7.5 m。没有把它们压回地面。

7. **Targeted validation。** 覆盖中央大道普通段、西城支路、东城主干路、普通地面路口、高架快速路、匝道过渡及下穿共 7 个案例。64 个确定性随机地面道路采样的可见路面高度差均为 0.04 m；检查了实际路面与路口 mesh、道路边线 Y、路口口部接缝和 89 处无逻辑连接的跨线。额外小型接触夹具确认地面车和桥面车分别使用自己的支撑面，不因二维交叉连接。数据校验通过；路牌、景观、名称注册表、拓扑和出生点保持原样。按要求未跑全量 core。

8. **Build。** `pnpm run build -BasicValidation` 完成类型检查、生产构建和 playable dist 发布。最终地图一致性及构建资产记录见 [build-result.json](D:/dsy/drivergame/artifacts/city-ground-elevation-fix/build-result.json)，日志见 [build.log](D:/dsy/drivergame/artifacts/city-ground-elevation-fix/build.log)。

修改文件：

- [CityMainGroundElevation.ts](D:/dsy/drivergame/src/world/city/maps/CityMainGroundElevation.ts)、[CityMainV5Recipe.ts](D:/dsy/drivergame/src/world/city/maps/CityMainV5Recipe.ts)、[city-main.json](D:/dsy/drivergame/src/world/city/maps/city-main.json)：普通道路归位和局部跨线 profile。
- [CityGroundGeometry.ts](D:/dsy/drivergame/src/world/city/CityGroundGeometry.ts)、[CityMapData.ts](D:/dsy/drivergame/src/world/city/CityMapData.ts)、[geometry.ts](D:/dsy/drivergame/src/world/city/geometry.ts)、[CityMapLoader.ts](D:/dsy/drivergame/src/world/city/CityMapLoader.ts)：共用地面高度基准及既有 ground/elevation 字段语义。
- [JunctionSurface.ts](D:/dsy/drivergame/src/world/city/JunctionSurface.ts)：共用 landing 高度在加载时保持一致。
- [CityGroundElevation.selftest.ts](D:/dsy/drivergame/src/world/city/CityGroundElevation.selftest.ts)、[fix-city-ground-elevation.mjs](D:/dsy/drivergame/scripts/fix-city-ground-elevation.mjs)、[test-city-ground-elevation.mjs](D:/dsy/drivergame/scripts/test-city-ground-elevation.mjs)：本轮定向修复与验证。

验证详细结果：[test-results.json](D:/dsy/drivergame/artifacts/city-ground-elevation-fix/test-results.json)。路牌高度和景观数据按本轮冻结要求未同步调整，仍保留修复前数据；本轮不处理这些对象。
