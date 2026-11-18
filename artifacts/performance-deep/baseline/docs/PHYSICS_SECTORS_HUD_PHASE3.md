# Physics sectors / HUD（2026-10-23）

本轮只调整大地图物理资源生命周期和菜单 / HUD 表现，保留上一轮 Startup / MenuScene、120 Hz、车辆参数、接触规则与地图拓扑。

## 物理加载

原 CityGround 在进入驾驶前生成所有道路的护栏、桥墩、墙体等 collider，再建立全图碰撞索引。现在 Regional Main 的异步游玩入口借用 SectorManager 的 sector key、road membership 和 sectorSize；优先完成出生区域，远处道路仅保留轻量规划信息。

- Active 目标半径为 `0.6 × sectorSize`，Preload 为 `1.6 × sectorSize`。当前 500 m sector 对应 300 / 800 m，并覆盖相交的完整 sector。只有全部所需道路准备好的 sector 计入 active，未完成的目标优先补齐。
- 预加载沿速度方向前伸 12 秒距离，上限四个 sector；倒车与侧向移动也走同一路径。5 Hz 或跨 sector 时重选，后台每帧约 3 ms、出生准备每批约 5 ms 后让出绘制；不引入新调度框架。
- 每个物理步及重置同步前检查车身与下一步移动范围。缺失时同步完成该局部区域涉及的道路，随后按 revision 更新碰撞索引；没有隐形墙、速度钳制或姿态改写。更新索引保留原碰撞接触时钟。
- 全局 road surface / height / 支撑层选择保持可用，不依赖可视 sector，因此不会因流式加载把桥面变成无支撑区域。物体、路牌和路口小型 collider 仍常驻；昂贵道路 collider 按道路原语完整缓存，不裁剪或合并 primitive，避免边界裂缝和护栏语义变化。
- Warm cache 与激活集合分开：预加载完成不会重建当前 contact index。缓存离开预加载区外两圈后释放；退出地图销毁，当前 session 返回菜单则保留。沿用已有 runtime fetch / parse Worker 和 VisualStreaming，未新增物理 Worker 或第二套世界划分。

轻量观测：`loading:spawnPhysicsReady`、`physics:spawnReady`（含统计）、既有 `loading:driveReady`、`physics:contactIndex`；CityGround 的 `physicsStatistics` / `loadStatistics.physics` 提供 active / requested / ready sectors、缓存道路、激活 collider、活跃构建时间、最大批次和同步兜底次数。

## 单次 CPU 样本

本轮 Regional Main 样本：出生所需 **4 / 4 sectors，68 / 2,944 道路**；初始总 collider **18,535**（其中道路 4,932），未等待原来的全图 577,550 个 collider。出生道路 collider 活跃工作约 **272 ms**，常驻 collider 阶段约 **61 ms**；上一轮全图 collider 样本约 **8,110 ms**。这些是不同次运行的阶段样本，不能当作完整驾驶进入时间的严格对照。

该 CPU 样本从 CityGround 创建到出生物理就绪约 **4.77 s**，不含 Worker fetch、车辆和 GPU warmup。完整地表几何约 3.11 s、surface index 约 573 ms 仍在进入路径；单个不可拆的道路准备步骤使最大批次达到约 **132 ms**。因此本轮减少全图物理等待，尚未保证所有加载和边界兜底都无长任务；很长的单条道路仍以完整道路为缓存单元。未反复跑 benchmark 或改碰撞表示。

## UI

删除主菜单 slogan、Vehicle Select 副标题 / 长说明、平台标语 / 重复就绪提示及设置页重复解释；保留控制方法和选挡等必要操作提示。减少面板背景、边框和分隔线。

Standard：左下大车速、小挡位、细转速条；右下深色半透明小地图，导航仅箭头与距离。Training：THR / BRK / CLT / STR 细条，ABS / TCS / ESC 仅介入时高亮。Realistic 隐藏常驻屏幕信息，Off 隐藏整层 HUD。继续通过 plain telemetry，维持原 20 Hz / Training 10 Hz，未增加高频 DOM 重建。小地图背景仅在屏幕 HUD 指定，座舱共享地图的默认配色保持。

## 验证与交付

直接专项 `pnpm run selftest:physics-streaming` 通过：出生就绪、相邻 sector 接触、紧急补齐与索引刷新、上下层支撑、warm cache 不触发索引重建、滞回释放及 road-course 兼容。Browser 正式构建确认 Regional Main、四种 HUD、暂停 / 恢复和同地图再次进入；未驾驶做主观判断。Electron 正式包完成基本启动 smoke。没有运行全核心 / 全系统、全地图或全 collider 对比。

`pnpm run build -BasicValidation` 与 `pnpm run desktop:package` 通过；最新产物为 `dist/` 与 `release/DriverSchool-win32-x64/DriverSchool.exe`。最终打包曾因联网获取校验清单长时间等待而中断；打包脚本改用已安装官方 Electron 包的 checksum 验证缓存运行时后重试，未关闭校验或修改桌面安全设置。已知大 chunk 提示保持，不属于本轮优化目标。

主要改动：`CityPhysicsSectors.ts`、`CityGround.ts`、`SectorManager.ts`、`RoadInfrastructure.ts`、`DrivingGround.ts`、`VehicleContactSystem.ts`、`CollisionSystem.ts`；UI 的 `GameShell.ts`、`ControlSettingsPanel.ts`、`TrainingHUD.ts`、`system.css`、`Minimap.ts`、`LocalRoadMap.ts`、`NavigationMapPanel.ts`；专项脚本、`desktop-package.mjs` 与 package script。
