# Tesla Model 3 RWD Experience V2

2026-10-10。范围：EV 声音、外部转向灯和中央屏。保留 V1 尺寸、车身比例、悬架、电池、电机、回收与 EV 物理标定。

1. **EV motor sound**：复用 `EngineAudio` 的 AudioContext、主混音、压缩器、恢复与销毁流程。新增两路克制的电机/逆变器正弦层；频率由实际电机 RPM 驱动，增益由实际扭矩/负载驱动。回收功率改变细微谐波比例；高速以既有胎噪/风噪为主。静止无电机怠速，EV 路径关闭燃烧/启动声层。增加只在低速移动时有效的轻量提示嗡声，前进/倒车均可用。
2. **Exterior lighting**：沿用既有 VehicleLighting 主体和实体灯网格，按 Tesla 光学布局调整灯具位置，使其位于封闭前后车身表面之外；前/后独立 amber 转向灯、后侧包角以及左右镜壳重复灯共用输出。尾灯、制动灯、倒车灯与方向灯材质独立，不会因刹车覆盖方向灯。未重建车身。
3. **Click synchronization**：点击声追踪 `VehicleLightingController` 的 leftBlinkOn/rightBlinkOn 状态边沿，没有自己的闪烁计时器。单侧或 hazard 都只有一组 on/off 点击；外灯与屏幕箭头读取同一已解析状态。
4. **Center layout**：保持 CanvasTexture 与现有实体横屏，浅色低饱和风格。固定 338/1024 ≈ 33% 左驾驶区、67% 右地图区；PRND 不改面板边界。速度用普通整数，不补前导零；gear 是真实 selector，绝无 D1/物理挡位。
5. **P/R**：中央小尺寸俯视车辆，显示现有碰撞几何的 360° 距离；R 对后侧弧带加粗，仍保留前方/侧面检测。右侧地图继续显示。
6. **N/D**：复用 A6L 的真实车道边界、虚实线及前方碰撞障碍表示。车辆保持居中，显示附近少量几何，不显示虚构交通或自动驾驶状态。
7. **Proximity design**：八个可复用的前/后/侧区域，仅有实际检测时出现灰、柔和黄橙、红色弧带；只标注最近距离。复用原 rear proximity 的多边形裁剪与表面距离算法，候选对象来自既有 `VehicleCollisionSystem` 空间索引。EV 使用一次通用查询，不叠加原车尾世界扫描；原 ICE 车尾检测保持兼容。
8. **Map source**：消费 DrivingGround 的公开 `roadNetwork`，复用现有 `worldToRoadMap` 北向坐标定义、道路中心线/宽度及路口元数据。显示真实道路和车辆航向标记，无目的地、路线、导航指令或 ETA。未提供 roadNetwork 的场地明确显示 Map unavailable。
9. **Adaptive zoom**：先平滑车速，再结合车辆附近 110 m 的路口分支、道路数量和道路密度。目标层级：停车/极低速 90 m；普通道路 240 m；复杂路口 150 m（高速复杂区域 200 m）；稳定高速且简单路网 500 m。
10. **Smoothing/hysteresis**：车速指数平滑率 1.3/s；复杂度 ≥5 进入、≤3 退出；高速 ≥24 m/s 进入、≤19 m/s 退出。非停车目标切换最短保持 2.5 s，视野跨度以 1.4/s 指数插值，避免缩放来回跳变。
11. **Left telemetry**：真实速度、PRND、电量、估算续航、驱动/回收功率细条、已有驾驶模式（有值才显示）、灯光状态、同相转向箭头、Cruise 与设定速度、已有制动/辅助和低电量/回收受限状态。
12. **Right telemetry**：实际路网、车辆位置与方向、米制比例尺、北向及本地时钟。公共接口没有道路名称或真实气温，安全省略这两项，没有依赖新 City road-name registry。
13. **Rendering/cache**：道路与路口在网络切换时建立通用空间索引；256 m 静态地图分块按需栅格化成 512 px 图块，LRU 最多 24 块。屏幕最多 20 Hz 重绘，闪烁边沿可即时刷新；环境和传感器查询为 10 Hz，选挡变化即时刷新；图块在位置/缩放变化时复用，不在 120 Hz 物理步扫描或重绘全 City 路网。
14. **Files**：完整列表见下方。
15. **City safety**：本任务没有写入 `src/world/city/**`、City Main 数据、道路/路口 presets、标志/道路名称或 City 构建脚本；未修改 ground registry、City loading 或 map creation。原工作区已有 City task 的改动全部保留。DrivingGame 仅加入通用 EV 屏幕和音效接线。
16. **Tests**：用户要求仅做基本验证后，已停止全量核心回归，没有继续追加测试。此前已完成的专项验证：新 Experience 测试 2934 个断言；已有 Lighting 350、Rear Proximity 27、Electric Powertrain 294、Tesla Visual 26，专项合计 3631 个断言通过。覆盖左右/hazard 外灯与点击同步、制动灯独立、音效静止/负载/RPM/回收/高速、八区方向与真实距离、固定布局、PRND 内容、实际遥测、地图缓存、复杂度与平滑/防抖。此前车辆目录检查通过；EV 0–100 保持 5.9917 s、极速 199.2909 km/h。未声称全量核心回归通过。
17. **Typecheck**：类型检查通过；最终基本构建中的类型检查也通过。
18. **Build**：`pnpm run build -BasicValidation` 成功，生产资源已发布到 `dist`，可通过 `start-game.cmd` 启动。构建脚本新增可选基本验证开关，跳过核心自测，保留类型检查、生产打包、源文件一致性检查和完整发布流程；默认构建行为不变。打包有资源体积提示，无构建错误。
19. **Manual inspection**：电机声强弱与回收音色、外灯可见性、点击音量、屏幕可读性、P/R 距离弧带、D/N 车道/障碍、城区/复杂互通/稳定高速的地图缩放，以及 SOC/续航/功率辨识。浏览器已验证科目三真实地图与中央屏且无运行错误；City Main 的界面切换遇到浏览器超时，本轮未确认该地图实景显示，需手动确认。不据此修改 City 源码。

## 本任务文件

- [EngineAudio.ts](D:/dsy/drivergame/src/audio/EngineAudio.ts)
- [ElectricAudioMix.ts](D:/dsy/drivergame/src/audio/ElectricAudioMix.ts)（新增）
- [LocalRoadMap.ts](D:/dsy/drivergame/src/ui/LocalRoadMap.ts)（新增）
- [RearParkingProximity.ts](D:/dsy/drivergame/src/vehicle/control/RearParkingProximity.ts)
- [LocalVehicleProximity.ts](D:/dsy/drivergame/src/vehicle/control/LocalVehicleProximity.ts)（新增）
- [DrivingEnvironmentView.ts](D:/dsy/drivergame/src/vehicle/visual/DrivingEnvironmentView.ts)（从既有 A6L 逻辑提取）
- [ExecutiveDisplayContext.ts](D:/dsy/drivergame/src/vehicle/visual/ExecutiveDisplayContext.ts)
- [ElectricDisplayContext.ts](D:/dsy/drivergame/src/vehicle/visual/ElectricDisplayContext.ts)（新增）
- [ElectricCenterDisplay.ts](D:/dsy/drivergame/src/vehicle/visual/ElectricCenterDisplay.ts)（新增）
- [InstrumentCluster.ts](D:/dsy/drivergame/src/vehicle/visual/InstrumentCluster.ts)
- [VehicleLighting.ts](D:/dsy/drivergame/src/vehicle/visual/VehicleLighting.ts)
- [VehicleVisualConfig.ts](D:/dsy/drivergame/src/vehicle/visual/VehicleVisualConfig.ts)
- [teslaModel3VisualConfig.ts](D:/dsy/drivergame/src/vehicle/visual/teslaModel3VisualConfig.ts)
- [DrivingGame.ts](D:/dsy/drivergame/src/game/DrivingGame.ts)
- [TeslaExperience.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/TeslaExperience.selftest.ts)（新增）
- [run-tesla-experience-selftests.ts](D:/dsy/drivergame/scripts/run-tesla-experience-selftests.ts)（新增）
- [run-core-selftests.ts](D:/dsy/drivergame/scripts/run-core-selftests.ts)
- [build-checkpoint.ps1](D:/dsy/drivergame/scripts/build-checkpoint.ps1)（可选基本验证开关）
- 本报告。

没有新增依赖、UI framework、导航、自动驾驶、AI traffic、摄像头或新的 Tesla 物理功能。
