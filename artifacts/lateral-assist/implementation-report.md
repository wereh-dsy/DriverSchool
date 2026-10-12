# DriverGame LKA / LCC V1

## 实现与使用

- 支持 BMW 530Li、Audi A6L 45 TFSI quattro、Tesla Model 3 RWD、Touareg。能力从车辆的 `lateralAssist` 配置派生，未按车型名称分支。每车拥有独立配置副本。
- F3 现有驾驶辅助设置中提供 LKA / LCC 持久偏好开关。LKA 默认 ON。LCC 的 ON 仅允许使用，运行时必须主动按 **I** 或点击 **LCC SET**；再次按 I / CANCEL 取消。切车、换图、重置、进入设置或页面隐藏会取消当前 LCC 请求。
- BMW、Audi、Tesla 已有车道显示消费统一状态：可用为绿色，LCC 正在控制为蓝色，LKA 对应纠偏边界为黄色。未重做仪表皮肤。
- 开发模式 **F9** 显示当前车道 ID、偏移、航向误差、曲率、前视点与目标切线、状态和转向辅助量。生产构建不创建该视图。

## 车道观察与跟踪

扩展现有 `RoadNetworkData` 和 `SharedVehicleData` 环境查询。直接使用 city / regional 的 `lanes`、中心线、laneConnections、标线可用声明及 highwayTransition 元数据。缺少逻辑车道的数据源不可用；不读取标线 mesh，不凭道路宽度创造辅助车道。

复用 `LocalRoadMap` 的空间索引取得局部道路，每 0.2 秒刷新候选道路，每 1/30 秒更新几何观察。120 Hz 控制使用同一份可变 LaneObservation 和预分配上下文。索引、车道引用及连接关系仅在网络变化时建立。

偏移和航向误差均以车道行驶方向的右侧为正；正转向命令向右，Three.js 的正 yaw 向左。观察包括车道宽度、左右边界类型和车辆中心至边界的距离、当前位置误差、前视误差、曲率、路口/合流/分流/歧义和置信度。前视距离为连续的速度函数，约 9–55 m。中心线短距离前后采样平滑折线切线，再由前视切线变化估计曲率，不改变道路几何。

当前 lane ID 具有粘性：车辆中心超过边界约 0.20 m 后才能切至同向相邻车道。路段末端只比较拓扑连接的后继车道，以切线连续性和车道端点匹配选择延续。合流/出口分流不因几何中心线靠近而随意换分支；存在明显竞争后继或重叠道路歧义时退出辅助。打灯并主动转向时允许进入已连接的出口或 transition 车道，仍由玩家完成变道。

## 控制与仲裁

LKA 以边界距离、沿边界方向的速度、航向和前视预测形成连续风险。中央区不追车道中心；预测接近边界时逐渐纠偏，已明显向内回正时衰减。默认边界介入裕量 0.62 m、明显介入 0.35 m，50–60 km/h 渐入，最大归一化转向权限 0.09。边界纠偏、航向和横摆阻尼均可配置。

LCC 使用中心容差、横向/航向/前视反馈，加曲率前馈和横摆速率阻尼。默认中心容差 ±0.08 m，最大权限 0.20；高速扩大前视并降低反馈增益与转向变化率。它通过现有转向 rack、轮胎和四轮物理工作，不直接设置车辆位置、yaw 或速度。

对应方向转向灯只抑制该侧 LKA 出界纠偏，另一侧仍有保护。LCC 的打灯 + 对应转向意图进入 LANE_CHANGE_OVERRIDE。所有控制均随驾驶员转向幅度连续降低权限：默认从 0.08 开始退让，达到 0.38 完全退让；强输入即刻通过最终仲裁压过残余辅助。

驾驶员接管后，输入回中须等待约 0.7 秒。新车道必须 ID 稳定约 0.65 秒、车辆中心进入边界以内至少 0.30 m、航向误差合理，再经过约 1 秒恢复。首次主动 SET 使用较短的 0.15 秒稳定确认。LCC 被请求期间独占辅助通道，包括临时接管与重新捕获阶段，不叠加完整 LKA 纠偏。

统一输出经 `arbitrateLateralSteering` 与驾驶员命令合成后进入原有 `VehicleContactSystem / VehicleDynamics / SteeringSystem`。输出限幅、平滑和变化率限制；无效车道/路口/低速/非前进挡不生成新的纠偏，已有需求退出至零。NaN 无法形成有效转向输出。未修改发动机、变速箱、制动、轮胎抓地、悬架、ESC 或地图几何。

## 验证及实驾限制

相关自测包含车道符号、曲线前视、跨线滞回、连接延续、分支稳定、重叠歧义、反向编排车道、无标线和缺少逻辑车道、重置；LKA 中央区、预测出界、左右纠偏、分方向转向灯、接管、低速、路口、失效渐退；LCC 前馈、权限减让、接管延时、打灯变道、稳定捕获与重置。

BMW / Tesla / A6L 分别执行 10 秒的 80 / 120 km/h 初速直道、小偏移、90 km/h 初速长弯、打灯/不打灯手动变道、合流、分流、左右 LKA 边界场景。测试使用真实配置和四轮接触/碰撞/轮胎/转向物理，未覆盖主观驾驶感觉。短场景中速度存在下降；它们不能替代用户维持恒定 80 / 120 km/h 的实驾验证。数值及最终速度见 `test-results.json`。

regional 主图按高速路段中部抽样逻辑车道可用性，不代表整张地图的连续可用覆盖。交叉口、未标线、连接歧义或缺少可靠拓扑的区域允许 unavailable。

复现命令：

```powershell
.\node_modules\.bin\esbuild.cmd scripts/run-lateral-assist-selftests.ts --bundle --platform=node --format=esm --outfile=.tmp-lateral-assist-selftests.mjs
node .tmp-lateral-assist-selftests.mjs
pnpm run typecheck
pnpm run build -BasicValidation
```

最终验证通过：13 项车道观察检查、26 项控制器检查、137 项现有输入断言、现有转向检查，以及三款车辆共 30 个物理短场景。regional 抽样 1068 个高速路段可用、229 个保守 unavailable。长弯场景最大中心偏差分别约 BMW 0.177 m、Tesla 0.070 m、A6L 0.338 m，未发生车道跳变或反复左右 hunting。

`pnpm run build -BasicValidation` 成功，typecheck 通过、生产包已发布至 playable dist。没有运行 full core、车辆视觉、地图全套或无关动力总成测试。Vite 仅报告大 bundle 体积告警；未扩展到冷加载优化。

## 建议用户测试

1. BMW / Tesla / A6L 选择清晰高速车道，F3 开启 LKA、保持 LCC 未 SET，稳定在 80–100 km/h。
2. 轻微向左压线，随后回正；重复右侧。观察轻推、渐入和渐退，中央区应允许自行选择偏左/偏右的位置。
3. 对应方向打灯手动变道，确认该侧 LKA 不阻止变道；不打灯主动加大转向，确认系统退让。
4. 在直道按 I 启用 LCC，测试小偏移居中；保持 120 km/h，观察是否反复左右修正。
5. 从直道进入 80–100 km/h 长弯，观察提前转向和稳定偏差。
6. LCC 下打灯手动变道，进入新车道并回中，检查稳定确认和渐进接回；再测试不打灯的明确主动变道。
7. 在出口鼻端、合流和 Y 分支附近保持主线行驶，检查延续稳定；打灯驶向出口时确认可以离开主线。歧义区域允许辅助退出。
8. 检查低速、倒车、P/N、路口、重置、换车和无可靠 lane data 时 unavailable。开发模式可按 F9 查看状态。

需用户驾驶调校：LKA 边界裕量、预测时域、纠偏/阻尼增益、最大权限及退出速度；LCC 中心容差、前馈/反馈/横摆阻尼增益、高速变化率、首次确认/接管释放/新车道稳定/渐入时间。先评价自然感和稳定性，不追求零误差。

## 本任务文件列表

- `src/world/navigation/RoadNetwork.ts`
- `src/world/navigation/LaneObservation.ts`
- `src/world/navigation/LaneObservation.selftest.ts`
- `src/world/city/CityRoadNetwork.ts`
- `src/vehicle/SharedVehicleData.ts`
- `src/vehicle/VehicleCapabilities.ts`
- `src/vehicle/control/LateralAssistController.ts`
- `src/vehicle/control/LateralAssistController.selftest.ts`
- `src/vehicle/control/LateralAssistDriving.selftest.ts`
- `src/vehicle/control/VehicleLightingController.ts`
- `src/vehicle/config/VehiclePhysicsConfig.ts`
- `src/vehicle/config/defaultVehiclePhysicsConfig.ts`
- `src/vehicle/config/bmw530LiPhysicsConfig.ts`
- `src/vehicle/config/executiveSedanPhysicsConfig.ts`
- `src/vehicle/config/teslaModel3PhysicsConfig.ts`
- `src/vehicle/config/roadSUVPhysicsConfig.ts`
- `src/vehicle/visual/DrivingEnvironmentView.ts`
- `src/vehicle/visual/DrivingSceneDisplayContext.ts`
- `src/vehicle/visual/ExecutiveDisplayContext.ts`
- `src/vehicle/visual/ElectricDisplayContext.ts`
- `src/vehicle/visual/LateralAssistDisplay.ts`
- `src/vehicle/visual/BMW530Instruments.ts`
- `src/vehicle/visual/ElectricCenterDisplay.ts`
- `src/vehicle/visual/InstrumentCluster.ts`
- `src/game/DrivingGame.ts`
- `src/game/LateralAssistDebugView.ts`
- `src/input/KeyboardBindings.ts`
- `src/ui/ControlSettingsPanel.ts`
- `scripts/run-lateral-assist-selftests.ts`
- `artifacts/lateral-assist/implementation-report.md`
- `artifacts/lateral-assist/test-results.json`
- `artifacts/lateral-assist/physical-driving.json`

保留工作区原有未提交改动。未提交或推送。
