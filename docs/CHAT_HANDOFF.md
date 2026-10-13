# 可直接交给 Chat 的项目指示文本

以下正文可整体复制到新 Chat。若对方能读取仓库，附上 AGENTS.md、README.md、CURRENT_CODE_CONTEXT.md 和 FIXES_2026-10-13.md；若不能读取，应明确说明它只掌握这份 2026-10-13 快照。新增需求写在正文末尾。

---

你现在为 DriverGame 提供后续设计与代码指导。请先建立下面的项目事实，不要用旧版本的认知建议重复造轮子，也不要把当前简化仿真说成原厂精确模型。

项目位于 `D:\dsy\drivergame`，是 TypeScript strict + Three.js + Vite + pnpm 的浏览器第一人称 3D 驾驶模拟。没有后端/前端框架/多人服务。物理固定 120 Hz，SI 单位，坐标 +X 右、+Y 上、-Z 前；显示车速和地图限速 km/h，内部角度/JSON 旋转弧度，CLI rotation 为度。源码优先于 README 和历史报告。这里的信息是 2026-10-13 的快照，后续状态需核对源码。

当前有 11 辆正式车：Haiteng S1（family-sedan，5MT FWD）、GT（sport-coupe，7MT RWD）、Mazda CX-4（test-6at-sedan，6AT FWD）、Sagitar（test-7dct-sedan，7DCT FWD）、Sylphy（cvt-family-sedan，CVT FWD）、A6L（executive-lwb-2t，7DCT 适时 AWD）、Touareg（road-suv-v6-8at，8AT 适时 AWD）、Ferrari 458（ferrari-458-italia，7DCT 中置 RWD）、Tesla Model 3（tesla-model-3-rwd，单后电机固定减速）、BMW 530Li（bmw-530li-g38，8AT RWD）、Taycan 4S（porsche-taycan-4s，双电机 AWD，前单速后两速）。Tesla 为游戏标定 60 kWh 可用电池；Taycan 105/97 kWh、常规峰值 380 kW、Launch Control 440 kW。现实车型只是参考原型。

9 个场地 ID 是 road-course、subject-2-training-ground、subject-3-shared-city-map、simple-circuit、mountain-proving-ground、city-alpha、city-main、preset-showcase、city-editor-map。默认海腾 S1 + 综合道路测试场。科目二/三、山地、赛道各自手工构造，城市/区域使用 CityMap JSON。菜单 city-main 加载 `src/world/regional/regional-main.json`（version 12，2555 道路），CLI 可用 regional-main；城市基础图是 `src/world/city/maps/city-main.json`（version 8，623 道路），CLI 可用 city-main-city。兼容别名 city-main 仍指向城市基础图并打印提示，两份文件 id 相同但不能混用。

架构主链：KeyboardInput/GamepadInput → VehicleInputSystem/VehicleInputState → DrivingGame → Cruise/横向控制仲裁 → VehicleContactSystem → VehicleDynamics → Powertrain/制动/轮胎/悬架 → RuntimeSnapshot → 可视/HUD/相机/声音/震动。车辆在 VehicleCatalog 注册，能力由 VehicleCapabilities 从真实配置/拓扑解析；subsystem config 拥有标定，显示风格不能决定动力拓扑。DriverGame 负责编排和生命周期，不应继续塞入燃油或电驱算法。

Powertrain 已有 ICEPowertrain 与 ElectricPowertrain。ICE 拥有发动机/燃油/离合/传动与点火、自动启停。EV 拥有 BatteryPack、前/后 ElectricDriveUnit、电机、逆变器、EVPowerCoordinator、热状态和配置化 Launch Control。双电机共享一个电池端口预算，计算效率和辅助负载，不能每轴拿全电池功率。功率 W，能量 kWh。EV 不需要 Engine/FuelSystem/Clutch，generic snapshot 中 ICE telemetry 可缺失。PRND 与机械挡位/传动比不同，自动挡驾驶员选挡要脚刹联锁。AT 蠕行来自变矩器，DCT 来自离合，EV 行为由配置决定。

已实现四轮持续轮速/旋转、联合滑移与载荷敏感性、开放差速器/LSD/eDiff、AWD、ABS/EBD/TCS/ESC、EPB/Auto Hold、燃油 Start-Stop、空气悬架/自适应阻尼、轴级 camber/toe 与 anti-dive/anti-squat 标定。所有服务制动请求经 BrakeTorqueCoordinator，ABS 最终调制；EV 回收是电机真实扭矩，受同一步 ABS 限制并与液压融合。空气动力进前后轴法向载荷，不能直接乘抓地。空气悬架平滑改 rest geometry，物理轮位/外观/碰撞需一致。它仍是平面底盘+轻量四角悬架，不是完整六自由度/连杆求解器。

胎温胎压已经存在：120 Hz 积累滚动/滑移做功、20 Hz 热积分、理想气体推导表压，压力影响滚阻/刚度；TPMS 2 Hz 采样和滤波、kPa 表压、告警读真实物理状态。没有胎温峰值抓地曲线、漏气/损伤/磨损/水滑。不能再建议从零添加 EV、LKA 或胎压，也不能给仪表塞固定假数字。

Cruise 已有 SET/CANCEL 和正常油门/制动闭环，非 ACC。A6L/Touareg/BMW/Tesla/Taycan 已装 LKA/LCC，基于逻辑地图车道而非视觉感知，局部空间查询 5 Hz、车道几何 30 Hz、控制 120 Hz；有速度/置信度/路口/歧义/驾驶员接管门控，输出有限转向请求，不能直接改 pose/speed。LCC 另有运行请求、换道接管、重新捕获。

交互边界：F3 的 LKA/LCC 偏好控制实际辅助，独立可改键的 G/F3 请求 LCC，I 只点火，已移除 I 的额外全局 LCC 监听。按当前项目契约，手柄 Y 仍只循环 LaneAssistState 的 OFF/LDW/LKA/LCC 选择提示，LDW 模式有声音警告；Y 的 OFF 不关闭实际转向控制，Y 的 LCC 不请求 LCC。不要把这两套状态当作已经统一，进一步改变该契约需明确任务授权。

SharedVehicleData 是地图/车道/接近检测/TPMS 的共享源，各仪表皮肤借用。BMW/Tesla/Taycan 有专用座舱/显示。导航能力目前是地图与道路显示，route 为空，没有导航寻路。八区 proximity、HUD 后方五区提示、后方实景、简化俯视 360 是不同功能；不是自动泊车或四相机拼接。左右镜采用真实眼位反射/物理镜面 aperture/斜裁剪，支持车型的中央内镜可显示后舱。

VehicleAssetRegistry 拥有共享不可变几何/静态纹理，各实例拥有动态材质/显示/状态；VehicleLoadingLifecycle 分帧准备、实例构造、动态初始化、纹理/shader/镜面预热，Ready 前不运行驾驶。切车/切图/复位清理辅助和接触状态。Trip 距离按 abs(speed)*dt，燃油来自 FuelSystem；ODO/Trip A/B/油量/SOC 每约 10 仿真秒及退出/换车保存，localStorage 按 origin 隔离。EV 自己累计能量，不要假设燃油 Trip A/B 已支持独立持久化电耗。F3 不完全暂停物理，车辆可滑行。

CityMap schema 2 使用显式 XYZ endpoint links、路口路面与标线所有权、支持高度区分上下层。区域地图有 highway 元数据、路牌、桥隧围护/照明、地形与按方向/车速预加载；视觉可卸载但 road graph、surface、colliders 保持常驻。编辑器支持预设、API 显式拆路、撤销和浏览器草稿/JSON 导出，Play 不覆盖源码。预设目录 34 项（31 生产、3 兼容街区），已含 Backbone/Compact 互通、隧道/下穿等；showcase 只展出原 V1 的 16 项。旧 build-city-main.mjs 运行 V3 recipe，现在要求 --out 独立文件或明确 --revision-v3 才可覆盖 city-only JSON，不能拿它重建当前区域图。服务区 fuel/charging 仅为元数据，没有交互式补能。仍未实现 AI 交通/行人/考试评分/导航寻路/多人比赛/ACC/BSD/Hybrid/完整刚体或损伤/主动空气动力/专用越野模式。

2026-10-13 已实施的修复：

1. RoadEdgeChains 仅合并双向一致的端点邻居，修复环岛/分叉空链崩溃；增加直路、歧义分叉和闭环回归。长直护栏先细分再裁剪出口，避免端点/中点漏检中间匝道，同时保留精确接缝端点。
2. I 只点火；独立 G 经统一可改键输入系统请求/取消 LCC。F3 使用同一请求方法。手柄 Y 保持独立选择提示契约。
3. 自动挡制动降挡不再被低油门升挡线错误压制，制动时保持挡位以避免刚降又升；保留道路/发动机转速过转保护。巡航 SET 当步保持捕获的执行器油门（仍受配置输出上限约束），后续经变化速率限制收敛，不放大积分上限。
4. 修正城市及区域内对应路牌的道路高度/立柱基础，移开两处道路净空冲突；补 BMW 底部几何基准并调整轮拱净空。道路拓扑、车辆 ID 和地图 ID 保持稳定。
5. 目录/能力/座舱/流式加载测试按实际契约更新；巡航测试显式运行发动机、通过正常满油门达到 SET 速度，不直接修改车辆速度。V3 测试读历史 V3 输入，核心另加当前 V5 检查。新增只读 selftest:systems，覆盖平台、EV、胎压、HMI、加载、车道实际转向与区域高速；新增明确的地图 CLI 别名和历史生成器保护。

初次审阅的 64 组核心中 12 组失败、17 组专项中 1 组失败属于修复前证据，保留在 CODE_REVIEW_2026-10-12.md。2026-10-13 修复后正常 build 通过，包含类型检查、66 组核心、Vite 构建和 dist 原子发布；另 18 组 systems、车辆体验/巡航专项通过。城市/区域图各 0 errors、24 个预留端口 warnings，showcase 0 errors、45 个端口/独立网络 warnings；主包仍有体积提示。详情见 FIXES_2026-10-13.md，不把这次通过当作后续新修改的验证。自动验证不代表已经完成人工驾驶、浏览器画面和真手柄体验评估。

赛道后续修复：simple-circuit 布局 version 3 长约 1,536 m、宽 11.5 m，远端回头弯由 45 m 放缓到 90 m，相邻左弯位置调整以保留直道；没有增加沥青或轮胎抓地倍率。起终点/检查点判定线总宽 25.9 m，包含近侧缓冲区，仍检查顺序、正向和异常瞬移。圈时以可选布局 revision 隔离，旧记录保留。具体通过速度与验证边界见 CIRCUIT_FIXES_2026-10-13.md。

验证规则：代码修改先跑相关 selftests，重大车辆系统修改加 `pnpm run selftest:systems` 和完整 core，最后正常 `pnpm run build`，不能只 typecheck。build 使用 Windows PowerShell，类型检查→core→暂存 Vite→源码指纹校验→原子发布入口；失败保留上次 dist。tsconfig 只检查 src，不覆盖 scripts。systems 不改历史 artifacts；其他专项脚本有的会覆盖 artifacts JSON，先读脚本，避免改历史基线。

请根据我接下来提出的目标给建议：先说明它属于哪一层、现有实现能复用什么，区分已确认缺陷、实现限制和新功能；提出少量按依赖排序的任务，每项注明相关文件、配置字段/接口、兼容风险和验收命令。涉及未核实源码的内容明确标为假设并索取相关片段。不要推荐整体重写、新增依赖或扩大功能，不按车型名写物理分支，不直接改姿态/速度或制造抓地倍率；保留车辆/地图 ID、输入、配置、存储及物理/视觉分层。上面列出的修复已经实现，新增建议是否执行应服从接下来的用户指令，不 commit/push/reset/discard。

我接下来希望讨论/实现的目标：

【在这里填写本次具体需求】
