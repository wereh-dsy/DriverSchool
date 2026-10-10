# Suspension Kinematics V1 / EV Powertrain V1 / Tesla Model 3 RWD

2026-10-09。实现范围：现有八辆 ICE 的保守悬架运动学、单电机 EV 动力边界、制动回收融合，以及第九辆正式车辆 Tesla Model 3 RWD。参数以当前模拟配置为准。

## A. 悬架（1–7）

1. 新增 `SuspensionTopology`：MACPHERSON、DOUBLE_WISHBONE、MULTI_LINK、TORSION_BEAM；每轴配置静态 camber/toe、压缩增益和 anti-dive / anti-squat 比例。拓扑用于描述结构，标定字段决定实际响应。
2. Camber = staticCamber + camberGainPerMeter × Δcompression。Δcompression 是实际压缩量相对承载静止几何的差，单位 m；角度为 rad。负 camber 表示轮胎上端内倾，左右轮镜像。
3. Toe = staticToe + bumpToeGainPerMeter × Δcompression。正 toe 表示内束；左右轮实际轮向使用相反符号。
4. 每轮 camber thrust 使用 `−signedCamber × camberStiffness × normalLoad/staticNormalLoad`，与原横向轮胎力合成。默认 camber stiffness 为 800 N/rad；合成力仍经过原有横向上限和 Fx/Fy 联合抓地预算。
5. Toe 加到既有前轮转向角，后轮也使用 toe 轮向；车轮坐标速度、侧偏角和轮胎力由实际轮向计算。视觉轮轴显示同一 toe/camber，轮胎自转仍独立。
6. Anti-dive 在制动前轴生效；anti-squat 在加速驱动轴生效。部分纵向载荷经几何支撑传递，减少弹簧压缩和车身俯仰；支撑力仍计入法向载荷，不消除真实的 m·a·h/L 载荷转移。旧配置缺少 kinematics 时保持零运动学增量。
7. 全部正式车辆显式标定如下。元组依次为 `(staticCamber rad, camberGain rad/m, staticToe rad, bumpToeGain rad/m, antiDive, antiSquat)`。

| 车辆 | 前轴拓扑 / 标定 | 后轴拓扑 / 标定 |
|---|---|---|
| Haiteng S1 Driving School | MacPherson / (−.005, −.20, 0, .010, .10, .05) | Torsion beam / (−.008, −.08, .0004, .015, 0, 0) |
| GT 3.0 Turbo | Double wishbone / (−.012, −.40, 0, .006, .15, 0) | Multi-link / (−.014, −.32, .0005, .020, 0, .15) |
| Mazda CX-4 2.0L 6AT | MacPherson / (−.008, −.24, 0, .008, .10, .05) | Multi-link / (−.010, −.28, .0004, .018, 0, 0) |
| Volkswagen Sagitar 280TSI DSG | MacPherson / (−.006, −.20, 0, .010, .10, .05) | Multi-link / (−.010, −.24, .0004, .020, 0, 0) |
| Nissan Sylphy 2.0L CVT | MacPherson / (−.004, −.16, 0, .008, .08, .04) | Torsion beam / (−.006, −.06, .0004, .012, 0, 0) |
| Audi A6L 45 TFSI quattro | Multi-link / (−.008, −.28, 0, .008, .15, .08) | Multi-link / (−.012, −.26, .0005, .018, 0, .15) |
| Volkswagen Touareg 3.0 TSI 4MOTION | Multi-link / (−.006, −.24, 0, .006, .18, .10) | Multi-link / (−.008, −.22, .0005, .015, 0, .18) |
| Ferrari 458 Italia | Double wishbone / (−.018, −.46, 0, .005, .18, 0) | Multi-link / (−.022, −.36, .0006, .020, 0, .18) |
| Tesla Model 3 RWD | Double wishbone / (−.010, −.35, 0, .008, .16, 0) | Multi-link / (−.014, −.30, .0005, .018, 0, .16) |

## B. EV 架构（8–13）

8. `ElectricMotor` 是 `DriveTorqueSource`：低速恒扭矩、高速恒功率、最高转速渐退、响应滤波。电机轴速来自真实驱动轮载架平均角速度 × 减速比；转子惯量反映到驱动轮。没有怠速、自由运转发动机或虚假离合器。
9. `BatteryPack` 以可用 kWh 为唯一能量状态，SOC 派生；W·s / 3,600,000 转为 kWh，分别计入充放电损失，功率和储能边界共同限幅。实际交付电机扭矩 × 步内平均轴速决定机械功，经过电机效率后更新电池。
10. `FixedReductionTransmission` 只有一个正减速比。驱动轮扭矩为电机扭矩 × ratio × efficiency；回收反向功率流使用 ratio / efficiency，确保传动损失不创造能量。无换挡、kickdown、D1 或物理倒挡。
11. P 使用既有物理停车约束；R 为电机反向；N 取消推进和松电门回收；D 正常推进/回收。选挡需要制动输入 ≥ .1；P 的纵横合速度上限 .8 m/s，反向锁止阈值 1.5 m/s。
12. `ElectricPowertrain` 通过既有 Powertrain 进入共同车轮、差速器、底盘、制动、辅助与碰撞路径。新增可选 EV telemetry、SOC 初始状态、回收限幅和低速制动请求；公共服务制动路径承担最终停车。
13. 游戏与一般消费者使用运行时通用 snapshot；ICE 遥测为可选，EV 的物理 gear 为 null。车辆目录同时容纳 ICE/EV 配置并保留已知 ICE 的类型接口。燃油、启动、发动机音效和燃烧反馈只在真实 ICE 上运行；八辆原车继续使用 ICEPowertrain。EV 结构支持能力来自实际组件配置，不按车名分支。

## C. 回收（14–18）

14. 松电门请求 `mass × maximumLiftOffDeceleration × wheelRadius × strength × (1−throttle)`，换算为负电机扭矩，经既有差速器进入驱动轮。SOC 的增加来自实际回收机械功，制动灯根据实际可用回收减速度请求。
15. 踏板/巡航制动请求替代松电门请求；实际可交付回收只抵扣驱动轴的共同服务制动预算，摩擦制动补足余额。Auto Hold / EPB 保留独立物理支持，不将回收再作为一套卡钳制动力叠加。
16. SOC 92%–100% 逐步压低充电/回收能力，满电不接收能量；原制动请求由摩擦制动接续。
17. 3 至 .25 m/s 平滑淡出电机回收；1.1 m/s 以下通过共同服务制动渐进完成停车，接入既有 Auto Hold。Tesla 不启用蠕行；P/N 没有电机驻车扭矩。
18. 回收使用同一车轮抓地预算和 ABS 滑移观察器；单电机驱动轴任一 ABS 通道释放时，即时切断整轴电机回收。TCS 对真实驱动电机扭矩限幅。ESC/EBD/ABS 仍在原有制动协调路径内；回收不改写车辆速度、位置或车轮转速。

## D. Tesla（19–29）

19. 模拟尺寸：4.720 × 1.850 × 1.440 m，轴距 2.875 m，前/后轮距 1.584 m，轮胎半径 .335 m、宽 .235 m；质量 1765 kg。尺寸、车轮接触点、视觉轮位、碰撞与镜面锚点使用同一几何配置。
20. 选择 60 kWh **可用容量模拟标定**，默认 SOC 80%；355 V 元数据；230 kW 放电、85 kW 充电上限，电池放电/充电效率 .98/.96，SOC 0%–8% 逐步限驱动扭矩。
21. 单后轴永磁电机模拟标定：360 Nm / 210 kW / 14500 rpm；转子惯量 .025 kg·m²、响应率 10/s；驱动效率 .94，回收 180 Nm / 75 kW、效率 .88。
22. 单级 9.03:1，效率 .97；倒车速度按电机扭矩渐退至 8 m/s。
23. 前轴质量份额 .49，CG 高 .43 m，yaw inertia 2950 kg·m²，后轮驱动、开放式后差速器。质量包含电池，无燃油可变质量。
24. 前双叉臂、后多连杆，完整运动学见 A 表。前/后弹簧 39/42 kN/m；压缩阻尼 2800/2900、回弹 4300/4500 N·s/m，ride height .138 m。
25. 公路舒适胎：纵/横 mu .98/.97、滚阻 .010、前/后侧偏刚度 82/87 kN/rad；前/后最大制动扭矩 3600/2100 Nm，前制动偏置 .63。前轮最大转向 31.5°、方向盘总锁角 720°、比率 11.4286，response 4 / damping 12。Cd .219、迎风面积 2.25 m²，沿用真实气动力与车轴法向载荷路径。
26. 干燥平地、默认 SOC、120 Hz 全油门自测：0–100 km/h **5.9917 s**，通过 5.7–6.6 s 宽窗口。
27. 同环境最高车速测试 **199.2909 km/h**；由电机转速、功率和阻力形成，远低于通用安全限速，没有速度钳制加速或隐藏抓地增益。
28. 显示瞬时电池功率、实际消耗/回收 kWh、SOC、剩余能量。距离累加 abs(speed) × dt，≥1 km 后显示实际净 kWh/100 km；允许净回收时为负值。续航使用有效正能耗历史，历史不足或净能耗 ≤1 时使用 15 kWh/100 km 参考值，避免下坡无限/负续航。默认 48 kWh 对应 320 km，随后随实际能量和历史变化。SOC 通过既有低频/生命周期保存机制按车辆持久化；普通车辆复位保留 SOC，训练设置可显式调整。
29. 独立电动溜背车身、封闭前脸、横向极简仪表台、中央横屏、开放中控。方向盘后无仪表罩/转速表，座舱无燃油表或机械挡杆。横屏显示速度、PRND、SOC、续航、剩余 kWh、驱动/回收功率、READY/动力不可用和警告；HUD/F2/设置按真实动力种类显示相应内容。

尺寸与悬架结构参考：[Tesla 官方尺寸说明](https://www.tesla.com/ownersmanual/model3/en_gb/GUID-56562137-FC31-4110-A13C-9A9FC6657BF0.html)、[Tesla 官方悬架说明](https://www.tesla.com/ownersmanual/model3/en_au/GUID-E414862C-CFA1-4A0B-9548-BE21C32CAA58.html)。电池、电机、性能与底盘数值是上述游戏标定，不代表特定量产年款认证数据。

## E. 验证与交付（30–34）

30. 本次变更文件见下方完整列表；保留此前刚体参考点一致性和仓库清理的未提交改动。
31. 专项测试通过：Suspension Kinematics 36、Electric Powertrain 294、Tesla Visual 26，共 **356 个断言**。覆盖能量守恒、满/空电、PRND、倒车、无蠕行、回收/摩擦预算、ABS/TCS、联合抓地、低速停车/坡道 Hold、轮轴速同步、净回收能耗与性能窗口。车辆目录九辆全通过，现有 ICE 体验回归通过；全量核心 60 个套件覆盖悬架、轮胎、动力、制动协调、辅助、平台与地图。
32. `pnpm run typecheck` 通过，最终 build 再执行同一检查。
33. `pnpm run build` **通过（exit 0）**：typecheck、60 个全量核心套件及 Vite 生产构建全部完成，原子发布新 `dist/index.html` 与资源。入口 SHA256 从 `24796689EDD1DC482786C013ADE88F5471344969A1FF832B42DF20FDDFB8DAB7` 更新为 `8CBBFD66D737DC23D9C10D661EDE36BF8312A6ADDBAD752CE176DC3461A3333C`。实际生产预览已选入 Tesla 并进入练习场，无浏览器运行错误。可双击 `D:\dsy\drivergame\start-game.cmd`。Vite 仅有非阻断的 bundle 大小提示。
34. 用户手动确认：已有车辆的细微转向/姿态差异；Model 3 的松电门回收力度、低速停车过渡、湿地转弯制动、坡道起步与续航体验；座舱比例、后视镜视角及中控屏读数清晰度。自动检查未发现数值异常或集成错误，主观驾驶/视觉调校留给用户。

新增的运动学、电机、电池和回收状态更新为标量运算，复用持久对象；未引入额外积分器、分配框架、查表框架或依赖。没有实现双电机、充电、热管理、刹车热衰减、Autopilot 或转向助力硬件模型。

### 本次变更文件

**新配置 / EV 动力**

- [src/vehicle/config/ElectricVehiclePhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/ElectricVehiclePhysicsConfig.ts)
- [src/vehicle/config/teslaModel3PhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/teslaModel3PhysicsConfig.ts)
- [src/vehicle/powertrain/BatteryPack.ts](D:/dsy/drivergame/src/vehicle/powertrain/BatteryPack.ts)
- [src/vehicle/powertrain/ElectricMotor.ts](D:/dsy/drivergame/src/vehicle/powertrain/ElectricMotor.ts)
- [src/vehicle/powertrain/ElectricPowertrain.ts](D:/dsy/drivergame/src/vehicle/powertrain/ElectricPowertrain.ts)
- [src/vehicle/transmission/FixedReductionTransmission.ts](D:/dsy/drivergame/src/vehicle/transmission/FixedReductionTransmission.ts)

**悬架 / 轮胎 / 底盘 / 制动**

- [src/vehicle/config/VehiclePhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/VehiclePhysicsConfig.ts)
- [src/vehicle/config/TyreCalibration.ts](D:/dsy/drivergame/src/vehicle/config/TyreCalibration.ts)
- [src/vehicle/config/defaultVehiclePhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/defaultVehiclePhysicsConfig.ts)
- [src/vehicle/config/sportsCoupePhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/sportsCoupePhysicsConfig.ts)
- [src/vehicle/config/transmissionTestVehicleConfigs.ts](D:/dsy/drivergame/src/vehicle/config/transmissionTestVehicleConfigs.ts)
- [src/vehicle/config/cvtSedanPhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/cvtSedanPhysicsConfig.ts)
- [src/vehicle/config/executiveSedanPhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/executiveSedanPhysicsConfig.ts)
- [src/vehicle/config/roadSUVPhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/roadSUVPhysicsConfig.ts)
- [src/vehicle/config/ferrari458PhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/ferrari458PhysicsConfig.ts)
- [src/vehicle/config/index.ts](D:/dsy/drivergame/src/vehicle/config/index.ts)
- [src/vehicle/physics/SuspensionSystem.ts](D:/dsy/drivergame/src/vehicle/physics/SuspensionSystem.ts)
- [src/vehicle/physics/WheelRotationSystem.ts](D:/dsy/drivergame/src/vehicle/physics/WheelRotationSystem.ts)
- [src/vehicle/physics/WheelPhysicsState.ts](D:/dsy/drivergame/src/vehicle/physics/WheelPhysicsState.ts)
- [src/vehicle/physics/VehicleDynamics.ts](D:/dsy/drivergame/src/vehicle/physics/VehicleDynamics.ts)
- [src/vehicle/physics/DriverAssistSystem.ts](D:/dsy/drivergame/src/vehicle/physics/DriverAssistSystem.ts)
- [src/vehicle/physics/BrakeSystem.ts](D:/dsy/drivergame/src/vehicle/physics/BrakeSystem.ts)
- [src/vehicle/physics/VehicleContactSystem.ts](D:/dsy/drivergame/src/vehicle/physics/VehicleContactSystem.ts)
- [src/vehicle/physics/index.ts](D:/dsy/drivergame/src/vehicle/physics/index.ts)

**目录 / 公共接口 / 游戏 UI**

- [src/vehicle/VehicleCatalog.ts](D:/dsy/drivergame/src/vehicle/VehicleCatalog.ts)
- [src/vehicle/VehicleDimensions.ts](D:/dsy/drivergame/src/vehicle/VehicleDimensions.ts)
- [src/vehicle/powertrain/Powertrain.ts](D:/dsy/drivergame/src/vehicle/powertrain/Powertrain.ts)
- [src/game/DrivingGame.ts](D:/dsy/drivergame/src/game/DrivingGame.ts)
- [src/game/ContactDebugView.ts](D:/dsy/drivergame/src/game/ContactDebugView.ts)
- [src/ui/Hud.ts](D:/dsy/drivergame/src/ui/Hud.ts)
- [src/ui/ControlSettingsPanel.ts](D:/dsy/drivergame/src/ui/ControlSettingsPanel.ts)
- [src/styles.css](D:/dsy/drivergame/src/styles.css)
- [src/vehicle/control/VehicleLightingController.ts](D:/dsy/drivergame/src/vehicle/control/VehicleLightingController.ts)
- [src/vehicle/feedback/VehicleFeedbackSystem.ts](D:/dsy/drivergame/src/vehicle/feedback/VehicleFeedbackSystem.ts)

**视觉**

- [src/vehicle/visual/teslaModel3VisualConfig.ts](D:/dsy/drivergame/src/vehicle/visual/teslaModel3VisualConfig.ts)
- [src/vehicle/visual/VehicleVisualConfig.ts](D:/dsy/drivergame/src/vehicle/visual/VehicleVisualConfig.ts)
- [src/vehicle/visual/VehicleExterior.ts](D:/dsy/drivergame/src/vehicle/visual/VehicleExterior.ts)
- [src/vehicle/visual/Cockpit.ts](D:/dsy/drivergame/src/vehicle/visual/Cockpit.ts)
- [src/vehicle/visual/CockpitLayout.ts](D:/dsy/drivergame/src/vehicle/visual/CockpitLayout.ts)
- [src/vehicle/visual/InstrumentCluster.ts](D:/dsy/drivergame/src/vehicle/visual/InstrumentCluster.ts)
- [src/vehicle/visual/VehicleVisual.ts](D:/dsy/drivergame/src/vehicle/visual/VehicleVisual.ts)

**测试 / 回归**

- [scripts/run-electric-selftests.ts](D:/dsy/drivergame/scripts/run-electric-selftests.ts)
- [scripts/run-core-selftests.ts](D:/dsy/drivergame/scripts/run-core-selftests.ts)
- [src/vehicle/physics/SuspensionKinematics.selftest.ts](D:/dsy/drivergame/src/vehicle/physics/SuspensionKinematics.selftest.ts)
- [src/vehicle/powertrain/ElectricPowertrain.selftest.ts](D:/dsy/drivergame/src/vehicle/powertrain/ElectricPowertrain.selftest.ts)
- [src/vehicle/visual/TeslaModel3Visual.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/TeslaModel3Visual.selftest.ts)
- [src/vehicle/visual/VehicleStructure.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/VehicleStructure.selftest.ts)
- [src/vehicle/VehicleCatalog.selftest.ts](D:/dsy/drivergame/src/vehicle/VehicleCatalog.selftest.ts)
- [src/vehicle/PowertrainLayout.selftest.ts](D:/dsy/drivergame/src/vehicle/PowertrainLayout.selftest.ts)
- [src/vehicle/powertrain/Powertrain.selftest.ts](D:/dsy/drivergame/src/vehicle/powertrain/Powertrain.selftest.ts)
- [src/vehicle/physics/FourWheelPhysics.selftest.ts](D:/dsy/drivergame/src/vehicle/physics/FourWheelPhysics.selftest.ts)
- [src/vehicle/physics/FuelSystem.selftest.ts](D:/dsy/drivergame/src/vehicle/physics/FuelSystem.selftest.ts)
- [src/vehicle/physics/VehicleContactSystem.selftest.ts](D:/dsy/drivergame/src/vehicle/physics/VehicleContactSystem.selftest.ts)
- [src/vehicle/physics/VehicleExperience.selftest.ts](D:/dsy/drivergame/src/vehicle/physics/VehicleExperience.selftest.ts)
- [src/vehicle/physics/VehicleLayout.selftest.ts](D:/dsy/drivergame/src/vehicle/physics/VehicleLayout.selftest.ts)
- [src/world/circuit/CircuitGround.selftest.ts](D:/dsy/drivergame/src/world/circuit/CircuitGround.selftest.ts)
- [src/world/mountain/MountainProvingGround.selftest.ts](D:/dsy/drivergame/src/world/mountain/MountainProvingGround.selftest.ts)

