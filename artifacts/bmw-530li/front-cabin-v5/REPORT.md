# BMW 530Li 双屏精修 V5

本轮只调整 BMW 显示与少量屏幕材质。没有修改地图工程、其他车型、物理参数、座椅、方向盘或 A 柱。

仪表采用左右展开的棱角刻度、带厚度的渐变饰面、细密纹理、底部局部反光和中央蓝色柔光。COMFORT 优先车速，SPORT 用克制的橙色强调转速与挡位。速度、转速、挡位、燃油、冷却液温度与灯光均沿用车辆数据。灯光继续使用标准形状符号，缩小尺寸；驻车制动、ABS、稳定控制、发动机提醒改成小型仪表灯。没有加入仪表地图，也没有制造不存在的故障。

中控默认地图页。直接消费现有 LocalRoadMap 的索引与缓存道路瓦片，通过 Canvas 显示滤镜形成 BMW 深色皮肤；复用 AdaptiveMapZoom，扩大中控的上下文范围。车辆位置和朝向来自现有 DrivingSceneDisplayContext 的 10 Hz 采样。车道及近距障碍继续使用同一个场景接口，在仪表显示。

中控车辆状态页采用燃油与温度分区、车辆示意及四轮胎压布局。燃油在游戏中连接已有燃油快照，冷却液温度沿用现有读数；未提供的胎压为前轮约 250 kPa、后轮约 260 kPa，变速箱温度约 80 °C，以 `~` 标明参考值。可通过现有 LuxuryVehicleStatusData 合约及可选 InstrumentTelemetry.vehicleStatus 输入替换真实读数；没有增加物理层胎压模拟。车外温度无读数时显示 `— °C`，预览的 19 °C 是明确的画面样例。

游戏中点击 MAP / VEHICLE STATUS 页签，或按 U 切换。点击内容区域继续支持原有视角拖动。仪表包边、中控包边和连续后背板统一材质，保留现有凹槽与下沿承托；前舱模型数量与顶点数量保持 93 / 40054。未增加低价值按钮或模型。

## 修改文件

| 文件 | 本轮修改 |
|---|---|
| [BMW530Instruments.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Instruments.ts) | BMW 刻度与光效、主题、符号、共用车辆示意 |
| [BMW530CenterDisplay.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530CenterDisplay.ts) | 新增 BMW 地图/状态两页显示，复用缓存与状态合约 |
| [BMW530Cabin.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Cabin.ts) | 中控显示接入、页签命中、统一屏幕包边材质 |
| [Cockpit.ts](D:/dsy/drivergame/src/vehicle/visual/Cockpit.ts) | BMW 页签点击与页面切换入口 |
| [InstrumentCluster.ts](D:/dsy/drivergame/src/vehicle/visual/InstrumentCluster.ts) | 可选车辆状态读数接口 |
| [DrivingSceneDisplayContext.ts](D:/dsy/drivergame/src/vehicle/visual/DrivingSceneDisplayContext.ts) | 同步显示层地图位置和朝向 |
| [DrivingGame.ts](D:/dsy/drivergame/src/game/DrivingGame.ts) | 页签点击/U 键接入，BMW 燃油快照桥接 |
| [BMW530FrontCabin.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530FrontCabin.selftest.ts) | 页签实际命中、默认地图、缓存、真实胎压接入等局部检查 |
| [DrivingSceneDisplayContext.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/DrivingSceneDisplayContext.selftest.ts) | 地图位置/朝向检查 |
| [run-bmw-530li-front-cabin-selftest.ts](D:/dsy/drivergame/scripts/run-bmw-530li-front-cabin-selftest.ts) | 仅运行前舱与相关场景显示检查 |
| [bmw-530li-preview.ts](D:/dsy/drivergame/scripts/bmw-530li-preview.ts) | 八个视角，使用现有 City Main 道路数据作地图样例 |
| [bmw-530li-preview-server.mjs](D:/dsy/drivergame/scripts/bmw-530li-preview-server.mjs) | 保存本轮八张预览 |

## 局部验证

- `pnpm run typecheck`：通过。
- BMW front-cabin selftest：通过，包含 170 个闭合样本、驾驶视线可读性、灯光符号、主题层级、页签真实射线命中、状态读数与缓存行为。
- DrivingSceneDisplay selftest：通过，11 个检查，空间查询仍按现有显示节奏执行。
- 浏览器预览：八张画面保存成功，无浏览器错误/警告；覆盖要求的七个视角并额外输出 SPORT。
- `pnpm run build -BasicValidation`：成功，执行类型检查及生产构建，按要求跳过全量 core。可玩 dist 已发布，入口资源 `index-D_Z-F7FN.js`。
- 构建仍有应用整体包体超过 500 kB 的提示，不影响成功发布，本轮未做范围外拆包。

## 预览

全部画面为主驾驶实际眼点；近景通过缩小视场角获得。中控地图使用现有 City Main 的真实道路网络与路口，速度/挡位/温度为明确预览样例，游戏使用运行时读数。

1. [主驾驶白天总览](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v5/v5-driver-day.png)
2. [主驾驶夜晚总览](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v5/v5-driver-night.png)
3. [仪表近景白天](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v5/v5-instruments-day.png)
4. [仪表近景夜晚](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v5/v5-instruments-night.png)
5. [中控地图页](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v5/v5-center-map.png)
6. [中控车辆状态页](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v5/v5-vehicle-status.png)
7. [左前视角与双屏承托](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v5/v5-left-front.png)
8. [SPORT 仪表对照](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v5/v5-instruments-sport.png)

## 剩余问题

胎压、变速箱温度还没有物理系统真实数据；车外温度还没有运行时环境读数。地图目前提供道路、位置、朝向和自适应范围，不提供路径规划或道路名称检索。软包与整体座舱仍有程序低模特征，后续主观视觉调整可依据这组预览选择，本轮没有扩大到座舱大形重构。
