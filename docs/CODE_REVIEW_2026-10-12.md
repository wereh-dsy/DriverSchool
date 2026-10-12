# DriverGame 整体代码审阅记录 · 2026-10-12

## 结论与范围

现有工程已经是同时覆盖 ICE/EV、车辆辅助、专用座舱和城市/区域高速地图的驾驶模拟项目。主要分层仍清晰，已有接口、配置和自测可复用；接下来的首要工作应是恢复真实集成契约和回归基线。当前代码**不能视为全套验证通过或正常发布成功**。

本次按用户要求进行全项目盘点：`src/` 和 `scripts/` 中 437 个 `.ts/.mjs/.ps1/.css` 文件（其中 src 自测 84 个），读取文件结构、TS/JS 导入/导出和语法信息，沿入口检查跨系统调用、配置、持久化、资源生命周期与验证入口，并核对四份地图 JSON、项目配置与启动脚本。深入人工检查集中在公共契约、主链路和新增系统；这不是对每个几何生成/绘制函数逐行证明，也不构成“所有代码没有其他缺陷”的保证。

未对生成目录、第三方 node_modules、临时文件或历史 artifacts 全部做逐行审计；未做浏览器 WebGL 实景、实体手柄、主观驾驶、长时压力/性能基准或原厂参数核验。本次只修改文档，不修复游戏逻辑、不更新地图数据、不重写测试断言、不新增依赖、不提交代码。起始 Git 工作区干净，以下运行/测试失败均发生在未修改游戏代码的状态下。

## 已确认问题（按影响优先）

### 1. P1：道路设施体验场环岛边链构造崩溃

证据：[`RoadEdgeChain.ts`](../src/world/city/RoadEdgeChain.ts) 第 41、44、56 行。向外端回溯仅使用局部 `searched`，随后正向遍历却受全局 `seen` 限制；回溯终点已处理时，正向循环不执行，`parts=[]`，仍访问 `parts[0]!.r.id`。非空断言没有运行时保护。

直接运行 `pnpm map validate preset-showcase` 和 `pnpm run selftest:grounds` 均抛出 `TypeError: Cannot read properties of undefined (reading 'r')`。忽略目录中的诊断打包仅插入空链记录，定位到 `seed=roundabout:ring-3`，回溯终点 `roundabout:ring-2:start` 已处理。生产源码未插入诊断。

影响：preset-showcase 的 validate→loadCityMap→CityGround 正常加载路径失败；保存该场地后重开也会触发启动失败。依赖此拓扑的生产预设检查可能一起失败。不能通过删除环岛、跳过生产几何检查或忽略 exceptions 解决。

建议单独修复邻接/回溯与全局访问状态的契约，补闭环、分叉、非对称 continuation 及重复到达已处理链的最小回归，确保所有 road 的 frames/continuations 仍完整。验收至少包含预设目录、showcase 验证、场地 reload 和正常 build。

### 2. P1：默认 I 同时控制车辆电源与 LCC

证据：[`KeyboardBindings.ts`](../src/input/KeyboardBindings.ts) 第 114 行将 engineStart 设为 KeyI；[`KeyboardInput.ts`](../src/input/KeyboardInput.ts) 第 95/293 行监听同一个 window keydown 并设置起动命令；[`DrivingGame.ts`](../src/game/DrivingGame.ts) 第 1444 行又在正常游戏态把 KeyI 转成 toggleLCC。第 1169 行起的 processAccessoryCommands 消费 engineStart 并 requestEngineToggle。

同一次按键可先改变 LCC request，再于固定步改变点火/EV operational；`preventDefault()` 不会阻止同一目标的其他事件监听器。运行中的自动挡在 D 仍可被人工熄火，因而请求辅助会顺带失去推进。此结论由实际监听器与消费路径的静态交叉检查得出，未执行 WebGL 端到端按键测试。

建议确定一个命令入口和互不冲突的默认键位，同时覆盖输入适配器与游戏全局监听器的集成；保持改键与手柄 Start/F3 LCC 按钮可用。当前 README 已说明临时操作入口，但代码冲突未修复。

### 3. P1：正常构建在 Ferrari 制动降挡回归失败

实际 `pnpm run build`：typecheck 通过，核心自测报 `458: automatic braking downshift`，随后停止，未进入可玩版本发布。

证据：[`Ferrari458.selftest.ts`](../src/vehicle/physics/Ferrari458.selftest.ts) 第 50—54 行要求四挡 3000 rpm、15% 油门、60% 制动在 60 步内降三挡；[`AutomaticShiftController.ts`](../src/vehicle/transmission/automatic/AutomaticShiftController.ts) 第 163—166 行将 braking 条件仍与较低油门的 upshift ceiling 比较。当前 4→3 对应转速约 3793 rpm，高于该低油门升挡阈值，所以虽满足制动降挡门槛，仍被条件阻止。

这是确定可重现的策略/测试契约不一致；本次不判定应调整策略还是旧测试，因为这需要确认制动降挡与防 hunting 的预期。应以制动请求、低负载升挡、高转保护的真实关系设计修复，不能仅放宽断言。

### 4. P2：巡航体验回归在 A6L ECO 的 SET 前加速失败

`pnpm run selftest:experience` 报 `Cruise vehicle experience: executive-lwb-2t/ECO: driver reaches SET speed through real torque path`。入口为 [`VehicleExperience.selftest.ts`](../src/vehicle/physics/VehicleExperience.selftest.ts) 的 runCruiseVehicleExperienceSelfTest。

失败发生于测试驾驶员经正常扭矩路径到达 SET 速度的前置阶段，不应直接解释成巡航 PI 控制器本身已经错误。需要针对该场景核对发动机初态、选挡、ECO 油门、离合/制动保持及测试速度目标；本次只记录失败，没有调驾驶手感或修改标定。

### 5. P2：车辆目录与平台基础断言落后于安装配置

- [`VehicleCatalog.selftest.ts`](../src/vehicle/VehicleCatalog.selftest.ts) 第 301 行要求 `VEHICLE_CATALOG.length === 10`；当前目录实际有 11 辆（加入 Taycan），因此 `selftest:vehicles` 失败。
- [`VehiclePlatformFoundation.selftest.ts`](../src/vehicle/VehiclePlatformFoundation.selftest.ts) 第 24 行要求 BMW/A6L/Tesla 的 lka/lcc 全部 false；现有配置已安装 lateralAssist，并从拓扑解析为 true，基础检查因此提前失败，后续资源所有权检查并未全部执行。
- [`VehiclePlatform.selftest.ts`](../src/vehicle/physics/VehiclePlatform.selftest.ts) 第 20 行要求能力字段总数为 29；加入 multiMotor/evMultiSpeed/launchControl 后已是 32，检查在第一辆车即失败。

建议把硬编码历史快照改成有意义的当前注册/结构契约检查，保留对真实预期车单和派生能力的覆盖。不能因其他专项通过就宣称该平台 suite 已通过。

逐组诊断还确认 A6L 的 ExecutiveSedan 自测要求 NORMAL 低负载升挡表值 1900 rpm，而当前配置为 1800 rpm；该断言报“目录被修改”不能单凭错误文字解释成对象克隆泄漏。应比对测试前后不可变配置，并验证当前数值契约。

### 6. P2：游戏、CLI 和历史生成器对 City Main 指向不同版本

[`DrivingGroundCatalog.ts`](../src/world/DrivingGroundCatalog.ts) 导入 `regional/regional-main.json`，而 [`scripts/map-cli.ts`](../scripts/map-cli.ts) 第 21 行把 city-main 指向 `city/maps/city-main.json`。两份文件 id 相同，但版本/道路分别为 11/2555 和 7/623；CLI 修改旧图不会自动影响菜单区域图。

此外 [`scripts/build-city-main.ts`](../scripts/build-city-main.ts) 使用 `buildCityMainV3` 和 artifacts 的 v2-base，写回 city-only JSON。照旧文档运行“重建当前地图”会用 V3 覆盖更高版本城市数据。没有把生成命令当验证运行。

文档已修正实际路径和旧生成器用途。若之后统一别名/工具入口，应保持旧作者流程兼容，并让实际目标文件清晰可见；不能在本次文档任务中静默切换 CLI 行为。

### 7. P2：还有道路几何和视觉/测试夹具回归需要处理

以下失败均在新的 Node 进程单独调用相同自测函数再次出现，已排除仅由前一组测试共享状态引起的失败：

- 生产预设行驶通道检查：`fixture:northbound-exit / 60.0m` 与 `fixture:northbound-2:barrier:29:1` 碰撞。这是实际 sedan corridor/collider 检查失败，需检查出口接入处护栏断开/道路清空契约，不能仅改断言。
- CityMainV3 检查读取当前 V5 city-only JSON，报 `v5-sign-13` 支柱位于铺装范围。既有版本混用也有几何冲突检测结果；应先确认当前标牌/路面净空和该历史 runner 的适用范围。
- SuspensionStance 的 Node document 夹具返回 null Canvas context，新显示绘制访问 imageSmoothingEnabled 时抛错。它首先是测试环境适配不足，不足以证明真实浏览器悬架绘制损坏。
- Environment 在区域 City Main 报标线材质照明断言失败。测试以 `material.polygonOffset` 识别所有标线，区域代码又对其他材质使用 polygon offset；需精确核对匹配的材质类别，不能直接推断所有路面自发光。
- VehicleStructure 把 Taycan ev-premium 座舱按传统 contoured visor 对象名称验收，而 Taycan 专用显示检查通过。需按实际结构配置核对断言的适用范围，不能仅为满足名字检查重建座舱。

本轮没有主观视觉确认，因此视觉类失败应作为明确回归待查项，区分测试夹具/旧拓扑假设与实际渲染问题。

## 需要保留的集成边界

| 边界 | 本次核对结果 | 后续风险 |
| --- | --- | --- |
| Powertrain 与底盘 | ICE/EV 实现共用接口，EV 轴级输出和缺失 ICE telemetry 有真实路径 | 新通用调用若继续强制 Engine/FuelSystem 会破坏 EV |
| 制动与回收 | 服务制动统一协调，EV 提供最终回收限幅接口 | 新辅助不能绕过 ABS 或重复叠加回收/液压 |
| 共享观测与显示 | SharedVehicleData/TPMS 由共享源发布，显示借用 | 按皮肤再做感知会重复查询并造成状态不一致 |
| Y 选择与实际横向控制 | Y 只改选择提示；LDW 有接入，LKA/LCC 控制另走偏好/request | 用户看到 OFF 仍可能有实际 LKA；是需明确产品决策的状态分离，不在本轮自行改行为 |
| 静态资源与实例 | registry/instance 所有权已分离，分阶段加载/预热存在 | 基础 suite 提前失败，不能把专项显示通过当作完整资源生命周期验收 |
| 城市逻辑与视觉 | graph/surface/collider 常驻，区域视觉按扇区分层 | 不能因卸载视觉删除物理或让辅助看到不连续路网 |
| Trip/能量与存储 | 速度积分、Fuel 增量、10 秒/生命周期保存；EV 能量另累计 | 不要把 fuel Trip A/B 和 EV energy 视为同一持久化实现 |
| 验证覆盖 | core runner 只执行它列出的自测，不是全部 84 个源自测 | EV V2、TPMS、横向、加载、新 HMI 等独立专项不能只靠 core 保证 |

120 Hz 路径仍有多次 snapshot 对象构造、轮子复制和短数组分配；仪表/DrivingGame/VehicleDynamics 为较大模块。这里记录为维护/性能观察，不断言已经造成瓶颈，也未做基准或未经授权抽象拆分。只有相关功能出现实际性能证据时再按热点处理。

## 验证记录

环境：Windows PowerShell，Node v24.19.0，已安装项目依赖。没有安装新依赖或联网查询。下述结果来自本轮运行，而不是历史报告。

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 全量 TS/JS AST 语法盘点 | 通过 | 语法解析无诊断；不替代类型检查或运行语义 |
| build 内 `pnpm run typecheck` | 通过 | tsc -b，仅覆盖 tsconfig 中 src |
| `pnpm run selftest:vehicles` | 失败 | 仍要求 10 辆车 |
| `pnpm run selftest:grounds` | 失败 | preset-showcase RoadEdgeChains 空链 |
| `pnpm run selftest:experience` | 失败 | A6L ECO 到达巡航 SET 速度的前置断言 |
| `pnpm map validate preset-showcase` | 失败 | 同一空链 TypeError |
| `pnpm map validate src/world/regional/regional-main.json` | 通过，含警告 | 0 errors、24 warnings；警告保留，不等于没有问题 |
| 专项函数检查 17 组 | 16 通过、1 失败 | 平台基础旧能力断言失败；见下表 |
| 全部 core 列表逐组诊断 | 52 通过、12 失败（共 64 组） | 保留原有函数/断言；捕获每组首个错误后继续，非发布成功 |
| `pnpm run build` | 失败，未发布 | core 在 Ferrari 制动降挡失败；旧 dist 入口保留 |

专项函数直接从现有 selftest 导出，通过忽略目录临时 runner 打包调用，避免覆盖 artifacts 的旧 JSON 基线：

| 专项 | 结果 |
| --- | --- |
| EVPlatformV2 | 通过，1467 assertions |
| TyreThermalPressure / TPMSDisplays | 通过，61 / 12 assertions |
| TaycanDisplays | 通过，48 assertions |
| BMW530Li / BMW530FrontCabin | 通过，150724 / 9861 assertions |
| DrivingSceneDisplay / HudVehicleLoading | 通过，12 / 5 assertions |
| LaneObservation / LateralAssistController | 通过 |
| LaneDepartureWarning / WarningSound | 通过 |
| LaneAssistState / LaneAssistSelectionDisplay | 通过，17 / 52 assertions |
| RegionalWorld / HighwaySystem | 通过，76 / 17 checks |
| VehiclePlatformFoundation | 失败，旧 lka/lcc false 断言；suite 未完成 |

build 默认核心 runner 在首个失败处中止。为审阅其余已有核心检查，另用临时 runner 保持原各检查输入/断言，逐组捕获结果；这只是诊断汇总，不改变 build 的成功条件。12 个失败组如下，7 个新增/可能受状态影响的组又在独立 Node 进程复核；全部重复失败。

| Core 组名 | 本轮首个失败 | 归类/下一步 |
| --- | --- | --- |
| ferrari458 | automatic braking downshift | 策略与测试契约，见问题 3 |
| cruiseVehicleExperience | A6L/ECO reaches SET speed | 起步/传动前置工况，见问题 4 |
| vehiclePlatform | complete support flags | 29→32 字段旧断言 |
| cityPresets | northbound-exit 60m 与 barrier 相撞 | 出口护栏/接入几何检查 |
| cityMap | 空链读取 r | RoadEdgeChains，问题 1 |
| cityV3 | v5-sign-13 support on pavement | 版本适用范围与标牌净空 |
| executiveSedan | switching modes never mutates catalog | 1900→1800 标定旧断言，不能据此认定克隆泄漏 |
| suspensionStance | null.imageSmoothingEnabled | Canvas 测试夹具 |
| environment | city-main road paint lighting | 材质分类/区域照明检查 |
| vehicleStructure | Taycan contoured visor | 专用 EV 座舱与通用结构断言 |
| vehicleCatalog | ten official player vehicles | 10→11 目录旧断言 |
| groundCatalog | 空链读取 r | 与问题 1 相同根因 |

每个失败函数会在该组首个断言停止，所以 12 个失败组不是 12 个独立根因，也不代表该组后续断言已执行。通过组包含燃油/电驱基础、输入、MT/AT/DCT/CVT、轮胎/制动/碰撞、镜面/仪表基础、山地/赛道/科目二三等已有检查；覆盖的意义以各自函数为准。

本次新结果保留在 Git 忽略的 `.tmp-code-audit-*.json/.log`；文档链接/锚点检查 8 文件、36 个本地链接通过，`git diff --check` 通过。仅报告这些实际检查，没有浏览器或实体设备验收。

## 本轮文档变更

- 根 AGENTS.md：补 ICE/EV、车道/TPMS、资源/共享源、地图真实路径、测试覆盖与发布契约，保留原工作规则。
- 根 README.md：更正 11 车/9 场地、EV/BMW/Taycan、横向辅助/胎热/胎压、手柄灯光/模式交互、镜面/区域地图及当前故障。
- City README/AGENT_GUIDE/PRESET_CATALOG：区别 city-only 与 regional 文件，补高程/不规则路口/围护/新版预设，说明 34 项目录与 16 样本的差别、旧生成脚本风险。
- 新增 CURRENT_CODE_CONTEXT.md：当前架构、数据流、目录、真实边界和验证入口。
- 新增 CHAT_HANDOFF.md：可复制到不具备仓库上下文的新 Chat 的指示文本。

没有修改运行时 `.ts/.css`、地图 `.json`、package/依赖或已有测试；忽略目录中的诊断 bundle/log 不是产品代码。正常 build 未通过，不宣称已经生成新可玩版本。

## 后续建议任务顺序

1. 单独修复道路边链崩溃并恢复生产预设/场地加载验证。
2. 核对 Ferrari 制动降挡、A6L ECO 的真实传动/起步契约和预设护栏净空；更新过时目录/能力/标定/座舱断言及 Canvas 夹具，核对路牌和区域材质分类。修复后跑正常 build。
3. 处理 I 输入冲突，并明确 Y 选择提示与实际 LKA/LCC 的产品关系，补事件/命令集成验证。
4. 在相应授权任务中统一或显式命名 City Main 工具路径，整理新增专项的验证入口；保留旧数据作者流程与历史基线。

以上是审阅建议，不表示已经获授权实施这些代码修改。讨论新功能时先使用 [当前代码说明](CURRENT_CODE_CONTEXT.md) 和 [Chat 交接文本](CHAT_HANDOFF.md)，确认复用现有模块及实际验证状态，再确定任务范围。
