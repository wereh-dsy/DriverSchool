# Tsukuba Circuit TC2000

2026-10-14。独立地图 ID：`tsukuba-tc2000`，当前布局 revision 2（增加起伏与弯道倾角）。
从开始菜单或 F3 场地选择 **Tsukuba Circuit TC2000 · 筑波赛道**；F4 仍按既有目录循环切图。

## 资料与复刻精度

- [筑波官方平面图、弯道说明及纵断面图](https://www.tsukuba-circuit.jp/guide/course-spec.html)。
- [官方平面图原图](https://www.tsukuba-circuit.jp/guide/img/course-spec_01.png)：描摹中心线、弯道相对位置和顺序。
- [官方设施图](https://www.tsukuba-circuit.jp/guide/guidemap.html)，[设施图原图](https://www.tsukuba-circuit.jp/guide/img/guidemap2000.jpg)：主直道内侧维修道、维修区及一号弯后汇回关系。
- [JAF 赛道资料](https://motorsports.jaf.or.jp/course/circuit/tsukuba)：2,045 m、顺时针、10–15 m 路宽。
- [官方纵断面图](https://www.tsukuba-circuit.jp/guide/img/course-spec_02.png)：确定一号弯前上坡、弯后下降及其余低幅起伏的顺序和相对形状。原图没有纵轴米数或逐点实测高程。
- [Gran Turismo 官方公开赛道列表](https://www.gran-turismo.com/tw/products/gtsport/tracklist/)公布的筑波高差 5.3 m 用作本次中心线高差的幅度参考，**不作为赛道运营方测绘数据**。

采用四轮 80R 路线，不含摩托车专用 MC 弯。中心线按官方平面图描摹为连续三次曲线与直线，整体等比校准至 2,045 m；没有为提高车速而扩大布局。保留收紧的一号右弯、S 弯、第一左发夹、Dunlop 右弯、80R 左弯、第二右发夹和高速末段右弯。

这是公开示意图驱动的近似复刻，**不是测绘、激光扫描或逐米道路边界复原**。官方主直道 282 m、后直道 437 m；当前平面几何约 275.5 m、418.4 m。局部路宽在公开的 10–15 m 范围内平滑过渡，具体宽度分布、曲率、维修道和安全设施距离为按图估计。revision 2 已补充近似纵断面与内倾，具体高程、坡度和倾角仍是重建标定值。建筑采用简化体量，不代表全部实际设施。

参考图片保存在 `artifacts/tsukuba-tc2000/reference-*`，仅用于本次制作参考；版权属于原网站，游戏运行不加载这些图片。

## 实现与接入

- `src/world/tsukuba/TsukubaLayout.ts`：描摹控制点、可变宽度、维修道、路肩、缓冲区和均匀采样。
- `TsukubaElevation.ts`：根据官方纵断面按区段重建相对高程，以保形 C1 插值连接坡顶与坡底，起终点周期连续；高度/横坡按 0.5 m 预计算，固定步查询只做表格插值。
- `TsukubaSurface.ts`：静态分格索引，主赛道、维修道、服务停靠区、路肩和碎石床共享物理路面查询。主赛道使用已有标准 asphalt 响应；草地、curb、loose-gravel 使用 `SURFACE_MATERIALS`。没有车辆或地图 ID 抓地分支。
- `TsukubaGround.ts`：既有 `DrivingGround`、赛道条带几何和材质、静态碰撞、出生姿态、顺序计时门。6 个方向箭头、白边线、起终点线、发车格、弯道及方向牌、100/50 m 制动牌、PIT ENTRY/EXIT、Dunlop 桥轮廓。
- 主直道内侧维修道可从末弯驶入并经一号弯内侧到弯后汇出；带简单维修棚、服务停靠区及控制塔。维修道未实现维修操作或限速处罚。
- 护栏、围网横丝/立柱、轮胎墙、树木、维修棚构件、停靠区、方向箭头和发车格采用实例化。无动态装饰物、观众、赛车 AI 或新依赖。
- `DrivingGroundCatalog` 增加独立入口；保留其他地图和所有车辆的既有配置。
- `RoadNetworkData` 增加可选 `mapAnnotations`。HUD `Minimap` 与车辆的 `LocalRoadMap` 共用 `drawRoadMapAnnotations` 绘制起终点、六处主要弯位、pit 入口/出口及行驶方向，车辆位置与朝向继续来自既有数据。车辆地图保持原有局部缩放，HUD 显示完整轮廓。没有第二套传感器、地图状态或逐车型地图实现。
- `roadType: circuit` 作为显示分类，让共享车辆地图采用较深的赛道铺装色，避免发光中控材质冲淡道路；既有城市/高速地图维持原配色。
- `DrivingGame.ts` 在既有自适应后视镜道路分类边界，将 `circuit` 映射到原有 `unknown` 策略；没有更改后视镜性能策略或车辆参数。
- 赛道不声明道路逻辑车道，因此不会把赛道方向箭头误当作公路 LKA/LCC 车道。

## 验证

专项入口：`scripts/run-tsukuba-selftests.ts`；同时并入正常 `pnpm run build` 的核心测试。

检查闭环与切线、2,045 m 长度、10–15 m 宽度、全线连续铺装、大型车辆包络在中心/两侧的碰撞净空、贯通 pit 净空、路肩接触高度与可见网格一致、草地/碎石响应、共享地图标记和 12 辆车辆的出生接触。该检查不代替驾驶者的主观驾驶与视觉评价。

初版 revision 1 的实际记录（保留历史，以下并不代表高度更新后的构建结果）：

- TC2000 专项：36,936 项断言通过，12 辆车辆出生接触通过，67 个网格对象 / 14 个实例化批次 / 1,450 个静态碰撞体。结果见 `artifacts/tsukuba-tc2000/selftest.json`。
- 地图目录检查：108 项断言，10 张地图的创建、重载和既有接触生命周期通过。
- `pnpm run selftest:systems` 通过，完整日志为 `artifacts/tsukuba-tc2000/systems.log`。
- 浏览器中从实际菜单进入场景，检查驾驶视角、HUD 完整轮廓/位置/朝向/标记，并确认 Golf GTI 中控的局部地图道路、S/F 与玩家朝向可见；观察时浏览器无错误日志。截图：`artifacts/tsukuba-tc2000/in-game.png`。
- 正常 `pnpm run build` 首次被既有 Golf GTI 姿态检查阻断：`visible underfloor Infinity matches loaded rideHeight 0.135`，构建脚本保留原 `dist`。已用仅导入 `SuspensionStance.selftest.ts` 的独立入口复现，入口不依赖任何地图代码；`GolfGTIExterior.ts` 已有车底网格缺少该测试查询的 `vehicleBodyPart: main-shell` 元数据。
- 当时的候选补丁：`artifacts/tsukuba-tc2000/proposed-build-unblock.patch`。仅在临时 bundle 中应用元数据补充，原有姿态测试全部 312 项断言通过。历史构建日志：`artifacts/tsukuba-tc2000/build.log`，独立复现日志：`preexisting-blocker.log`。本次高度更新不修改 Golf 文件。

## 高度更新：revision 2

采用相对高度零点，中心线高差约 5.3 m；零点不是海拔。还原一号弯前的主要上坡、弯内坡顶、出弯后的下降，以及 S 弯、两发夹弯、80R 和末弯附近的较小起伏。2,045 m 平面路线及弯道空间关系保持不变；坡面实际行驶距离会略长于平面投影。

官方资料只定性说明了弯道倾角，尤其是第一发夹的强内倾和第二发夹的明显内倾，没有提供逐点角度。本次采用平滑渐入/渐出的保守估算峰值：第一发夹 5°、第二发夹 4°、一号弯 2.5°、Dunlop 2°、80R 与末弯 1.5°，内侧较低。它们属于可继续校准的复刻参数，不是实测认证值。

主赛道、维修道出入段与服务停靠区共享连续高度场。背景地形在加载时烘焙，避免把高处缓冲区突然接回平地；接触查询保留已有静态分格索引，未引入全图逐轮扫描。路肩隆起叠加于当前坡面，草地/碎石保持既有材质响应，没有改变抓地规则。

可见道路、边线、路肩、pit 路面及边线、起终点、发车格和方向箭头跟随支撑高度；维修棚、路牌、围栏、轮胎墙和树木同步抬升，碰撞体使用对应高度范围。出生点、计时门和共享道路数据的 Y 值同步更新，圈速 revision 升为 2，旧布局记录不会与新布局混用。车辆底盘、轮胎、传动和镜面策略没有因高度更新而修改。

高度更新验证：

- 类型检查通过。
- 专项 183,415 项断言通过：中心线约 0.0002–5.3002 m，最大纵坡约 5.07%，pit 最大纵坡约 6.03%。包含起终点高度/坡度接缝、路面/路肩/地形网格对应、pit 梯度、内倾方向、抬升护栏碰撞，以及 12 辆车辆在出生点、下坡和两个倾斜发夹上的轮胎/底盘支撑高度。
- 地图目录验证通过：108 项断言，10 张地图创建/重载。
- 专项结果：`artifacts/tsukuba-tc2000/elevation-selftest.json`；目录日志：`elevation-grounds.log`。
- 浏览器检查一号弯前上坡、弯后下坡和第一发夹内倾，观察时无错误日志；截图 `elevation-uphill.png`、`elevation-hairpin.png` 位于同一 artifact 目录。主观驾驶和视觉评价由用户进行。
- 可查看 `artifacts/tsukuba-tc2000/elevation-profile.png` 对照中心线高度与内倾曲线；对应采样数据为 `elevation-profile.json`，均为当前重建模型的输出。
- 已运行正常 `pnpm run build`：类型检查通过，但核心测试被既有 `Vehicle structure: volkswagen-golf-gti: column exists` 阻断，尚未进入 Vite 发布阶段，原 `dist` 保留。遵照用户“不需要处理 Golf”的明确要求，本次未修改 Golf 文件、未跳过断言，也未采用精简构建。日志：`artifacts/tsukuba-tc2000/elevation-build.log`。

## 后续完整构建修复

用户随后追加要求“修复构建的问题，进行完整构建”。因此修复范围补充到构建阻断处：`GolfGTICabin.ts` 增加已有配置锚点之间的转向柱；`GolfGTI.selftest.ts` 增加独立座舱结构检查，并由 `VehicleStructure.selftest.ts` 接入核心回归。检查包含转向柱连接、平底方向盘、120 条转向净空射线、座舱封闭、仪表与镜面，没有调整车辆物理或赛道参数。

本次 Golf 专项、全部 12 辆车的结构检查、`selftest:vehicles`、`selftest:systems` 与类型检查均通过。对应日志为 `artifacts/tsukuba-tc2000/build-fix-*`；正常完整构建日志为 `artifacts/tsukuba-tc2000/full-build.log`。历史失败记录保留，以区分各次验证结果。

最终正常 `pnpm run build` **退出码 0**：类型检查、完整核心测试（包含 TC2000 高度专项的 183,415 项断言）、Vite 293 modules 打包、源指纹一致性校验和 `dist/index.html` 原子发布全部完成。当前可玩入口为 `assets/index-h8CfG4mO.js`，已核对 `dist/index.html` 引用及资源文件存在。可通过 `start-game.cmd` 启动。本次没有使用 `-BasicValidation`。构建仅保留已有大 chunk 提示（主包约 15.99 MB / gzip 3.97 MB），没有剩余构建错误。
