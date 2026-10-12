# 可直接交给 Chat 的项目指示文本

以下正文可整体复制到新 Chat。若对方能读取仓库，附上 AGENTS.md、README.md、CURRENT_CODE_CONTEXT.md 和 CODE_REVIEW_2026-10-12.md；若不能读取，应明确说明它只掌握这份 2026-10-12 快照。新增需求写在正文末尾。

---

你现在为 DriverGame 提供后续设计与代码指导。请先建立下面的项目事实，不要用旧版本的认知建议重复造轮子，也不要把当前简化仿真说成原厂精确模型。

项目位于 `D:\dsy\drivergame`，是 TypeScript strict + Three.js + Vite + pnpm 的浏览器第一人称 3D 驾驶模拟。没有后端/前端框架/多人服务。物理固定 120 Hz，SI 单位，坐标 +X 右、+Y 上、-Z 前；显示车速和地图限速 km/h，内部角度/JSON 旋转弧度，CLI rotation 为度。源码优先于 README 和历史报告。这里的信息是 2026-10-12 的快照，后续状态需核对源码。

当前有 11 辆正式车：Haiteng S1（family-sedan，5MT FWD）、GT（sport-coupe，7MT RWD）、Mazda CX-4（test-6at-sedan，6AT FWD）、Sagitar（test-7dct-sedan，7DCT FWD）、Sylphy（cvt-family-sedan，CVT FWD）、A6L（executive-lwb-2t，7DCT 适时 AWD）、Touareg（road-suv-v6-8at，8AT 适时 AWD）、Ferrari 458（ferrari-458-italia，7DCT 中置 RWD）、Tesla Model 3（tesla-model-3-rwd，单后电机固定减速）、BMW 530Li（bmw-530li-g38，8AT RWD）、Taycan 4S（porsche-taycan-4s，双电机 AWD，前单速后两速）。Tesla 为游戏标定 60 kWh 可用电池；Taycan 105/97 kWh、常规峰值 380 kW、Launch Control 440 kW。现实车型只是参考原型。

9 个场地 ID 是 road-course、subject-2-training-ground、subject-3-shared-city-map、simple-circuit、mountain-proving-ground、city-alpha、city-main、preset-showcase、city-editor-map。默认海腾 S1 + 综合道路测试场。科目二/三、山地、赛道各自手工构造，城市/区域使用 CityMap JSON。注意：游戏菜单 city-main 加载 `src/world/regional/regional-main.json`（version 11，2555 道路）；CLI 别名 city-main 加载 `src/world/city/maps/city-main.json`（version 7，623 道路）。它们 id 相同但文件不同，修改菜单地图必须传显式区域 JSON 路径。

架构主链：KeyboardInput/GamepadInput → VehicleInputSystem/VehicleInputState → DrivingGame → Cruise/横向控制仲裁 → VehicleContactSystem → VehicleDynamics → Powertrain/制动/轮胎/悬架 → RuntimeSnapshot → 可视/HUD/相机/声音/震动。车辆在 VehicleCatalog 注册，能力由 VehicleCapabilities 从真实配置/拓扑解析；subsystem config 拥有标定，显示风格不能决定动力拓扑。DriverGame 负责编排和生命周期，不应继续塞入燃油或电驱算法。

Powertrain 已有 ICEPowertrain 与 ElectricPowertrain。ICE 拥有发动机/燃油/离合/传动与点火、自动启停。EV 拥有 BatteryPack、前/后 ElectricDriveUnit、电机、逆变器、EVPowerCoordinator、热状态和配置化 Launch Control。双电机共享一个电池端口预算，计算效率和辅助负载，不能每轴拿全电池功率。功率 W，能量 kWh。EV 不需要 Engine/FuelSystem/Clutch，generic snapshot 中 ICE telemetry 可缺失。PRND 与机械挡位/传动比不同，自动挡驾驶员选挡要脚刹联锁。AT 蠕行来自变矩器，DCT 来自离合，EV 行为由配置决定。

已实现四轮持续轮速/旋转、联合滑移与载荷敏感性、开放差速器/LSD/eDiff、AWD、ABS/EBD/TCS/ESC、EPB/Auto Hold、燃油 Start-Stop、空气悬架/自适应阻尼、轴级 camber/toe 与 anti-dive/anti-squat 标定。所有服务制动请求经 BrakeTorqueCoordinator，ABS 最终调制；EV 回收是电机真实扭矩，受同一步 ABS 限制并与液压融合。空气动力进前后轴法向载荷，不能直接乘抓地。空气悬架平滑改 rest geometry，物理轮位/外观/碰撞需一致。它仍是平面底盘+轻量四角悬架，不是完整六自由度/连杆求解器。

胎温胎压已经存在：120 Hz 积累滚动/滑移做功、20 Hz 热积分、理想气体推导表压，压力影响滚阻/刚度；TPMS 2 Hz 采样和滤波、kPa 表压、告警读真实物理状态。没有胎温峰值抓地曲线、漏气/损伤/磨损/水滑。不能再建议从零添加 EV、LKA 或胎压，也不能给仪表塞固定假数字。

Cruise 已有 SET/CANCEL 和正常油门/制动闭环，非 ACC。A6L/Touareg/BMW/Tesla/Taycan 已装 LKA/LCC，基于逻辑地图车道而非视觉感知，局部空间查询 5 Hz、车道几何 30 Hz、控制 120 Hz；有速度/置信度/路口/歧义/驾驶员接管门控，输出有限转向请求，不能直接改 pose/speed。LCC 另有运行请求、换道接管、重新捕获。

交互有两个必须注意的现存边界：F3 的 LKA/LCC 偏好控制实际辅助，I/F3 请求 LCC；手柄 Y 只循环 LaneAssistState 的 OFF/LDW/LKA/LCC 选择提示，LDW 模式有声音警告，但 Y 的 OFF 不关闭实际转向控制，Y 的 LCC 不请求 LCC。默认 I 还同时绑定点火/车辆电源，存在两条处理路径的冲突。不要把这两套状态当作已经统一。

SharedVehicleData 是地图/车道/接近检测/TPMS 的共享源，各仪表皮肤借用。BMW/Tesla/Taycan 有专用座舱/显示。导航能力目前是地图与道路显示，route 为空，没有导航寻路。八区 proximity、HUD 后方五区提示、后方实景、简化俯视 360 是不同功能；不是自动泊车或四相机拼接。左右镜采用真实眼位反射/物理镜面 aperture/斜裁剪，支持车型的中央内镜可显示后舱。

VehicleAssetRegistry 拥有共享不可变几何/静态纹理，各实例拥有动态材质/显示/状态；VehicleLoadingLifecycle 分帧准备、实例构造、动态初始化、纹理/shader/镜面预热，Ready 前不运行驾驶。切车/切图/复位清理辅助和接触状态。Trip 距离按 abs(speed)*dt，燃油来自 FuelSystem；ODO/Trip A/B/油量/SOC 每约 10 仿真秒及退出/换车保存，localStorage 按 origin 隔离。EV 自己累计能量，不要假设燃油 Trip A/B 已支持独立持久化电耗。F3 不完全暂停物理，车辆可滑行。

CityMap schema 2 使用显式 XYZ endpoint links、路口路面与标线所有权、支持高度区分上下层。区域地图有 highway 元数据、路牌、桥隧围护/照明、地形与按方向/车速预加载；视觉可卸载但 road graph、surface、colliders 保持常驻。编辑器支持预设、API 显式拆路、撤销和浏览器草稿/JSON 导出，Play 不覆盖源码。预设目录 34 项（31 生产、3 兼容街区），已含 Backbone/Compact 互通、隧道/下穿等；showcase 只展出原 V1 的 16 项。旧 build-city-main.mjs 运行 V3 recipe，会覆盖 city-only JSON，不能拿它重建当前区域图。服务区 fuel/charging 仅为元数据，没有交互式补能。仍未实现 AI 交通/行人/考试评分/导航寻路/多人比赛/ACC/BSD/Hybrid/完整刚体或损伤/主动空气动力/专用越野模式。

本次审阅已确认的优先问题：

1. preset-showcase 的环岛道路边链出现空 parts，再访问 parts[0].r，导致地图验证/加载抛错；应修复遍历/已访问道路处理并补最小拓扑回归，不能删除地图或放松验证。
2. 默认 I 同时点火/切电源和请求 LCC；应明确命令所有权与键位，并验证真实两条监听器的集成路径。
3. 车辆目录测试仍要求 10 辆，而现在 11 辆；平台基础测试仍要求 LKA/LCC 均不支持，而配置已安装；车辆平台测试仍要求 29 个能力字段，实际 32。应更新真实契约断言，不能绕过测试。
4. 默认 build/core 没有执行全部 EV V2、胎压、车道、HMI 和加载专项；两份 city-main 文件的别名也容易误改。

本轮实际验证：typecheck 通过；默认 build 在 Ferrari 制动降挡断言失败，未更新 dist。按 core 列表逐组诊断为 64 组中 52 通过、12 失败；另 17 组专项中 16 通过、平台基础失败。其他失败包括 A6L ECO 到达巡航 SET 速度的前置工况、出口道路与护栏碰撞、旧 CityV3 对当前 V5 路牌净空检查、A6L 升挡数值旧断言、SuspensionStance 的 null Canvas 夹具、区域材质分类和 Taycan 座舱通用断言。不能把失败全归为旧测试，也不能把异常文字直接当作实际资源泄漏/浏览器视觉损坏；要逐项确认契约。区域 JSON validate 0 errors、24 warnings，RegionalWorld/HighwaySystem 专项通过。失败组会在首个断言停止，不能宣称后续检查已执行。

验证规则：代码修改先跑相关 selftests，重大车辆系统修改加完整 core/车辆平台验证，最后正常 `pnpm run build`，不能只 typecheck。build 使用 Windows PowerShell，类型检查→core→暂存 Vite→源码指纹校验→原子发布入口；失败保留上次 dist。tsconfig 只检查 src，不覆盖 scripts。部分专项脚本覆盖 artifacts JSON，先读脚本，避免改历史基线。实际验证结果请读本次审阅报告，不能根据历史报告宣称当前全绿。

请根据我接下来提出的目标给建议：先说明它属于哪一层、现有实现能复用什么，区分已确认缺陷、实现限制和新功能；提出少量按依赖排序的任务，每项注明相关文件、配置字段/接口、兼容风险和验收命令。涉及未核实源码的内容明确标为假设并索取相关片段。不要推荐整体重写、新增依赖或扩大功能，不按车型名写物理分支，不直接改姿态/速度或制造抓地倍率；保留车辆/地图 ID、输入、配置、存储及物理/视觉分层。当前审阅只改文档，问题没有被顺手修复。不要把建议视为已获实现授权，不 commit/push/reset/discard。

我接下来希望讨论/实现的目标：

【在这里填写本次具体需求】
