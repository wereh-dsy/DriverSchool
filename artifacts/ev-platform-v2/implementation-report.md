# EV Platform V2 + Porsche Taycan 4S 实施报告

任务已完成；原有工作区修改保留，未提交或推送。

1. **EV Platform V2 architecture**：保留公共 Powertrain 边界。BatteryPack → EVPowerCoordinator → 独立 ElectricDriveUnit → 既有前/后 differential → 轮胎接触求解。共用电池预算在电机响应平滑之后再次约束实际扭矩，两个电机不会各自获得整包功率。
2. **Drive Unit**：包含 motor、inverter、EV transmission、axle association、独立 RPM/温度/扭矩/功率/回收限制。运行数据复用状态对象；扭矩按 120 Hz 更新，热量累计后约 20 Hz 积分。
3. **Battery V2**：gross/usable energy、SOC、nominal voltage、放电与充电能力。低 SOC、高 SOC、低温和高温分别连续限制放电与回收。保持已有 usableCapacityKWh 字段兼容。
4. **Motor / Inverter thermal**：独立轻量 lumped thermal model。热源来自实际机电损耗、逆变器损耗及低速铜损；冷却由环境温度、速度气流和模式决定。热积分使用解析指数更新，停车不会立即降至环境温度。
5. **Power limiting**：低速扭矩区、中高速恒功率区、高速 roll-off；零 RPM 有限。每电机有 peak/continuous capability，热衰减连续收敛到 continuous envelope；电池和逆变器仍可进一步限功率。
6. **Brake blending**：分离 lift-off 和 pedal regen。按前后轴实际回收扣除摩擦制动需求；高 SOC、低速和热限制下由公共制动路径补足。ABS 可以同一步分别取消对应轴回收，包括锁死轴零 RPM；TCS 分别削减对应轴正扭矩。既有 ESC 继续控制液压制动，向 EV coordinator 提供有限纵向/轴间支持信息。
7. **Model 3 migration**：1765 kg、60 kWh 可用 simulation pack、single rear motor、fixed 9.03 reduction、RWD、强松电门回收、既有低速停车/Auto Hold。Tesla center display、地图和停车可视化保留；没有添加前电机、空气悬架、Porsche 模式或 Launch Control。
8. **Taycan motors**：2250 kg、105/97 kWh、800 V nominal class。前后使用不同 PSM 近似标定：前 310 Nm / 160 kW peak / 110 kW continuous；后 400 Nm / 280 kW peak / 200 kW continuous。电机具体 map 属于游戏标定，并非 Porsche 专有数据。
9. **Taycan transmission**：前轴固定 8.05；后轴 15.5 / 8.05 两速。支持真实轴 RPM、升降挡迟滞、驻留时间、短暂扭矩退出、平滑 ratio transition 和扭矩恢复；不改变 ICE AT/DCT 语义。
10. **AWD coordination**：小需求后轴效率优先，中等需求前轴逐步加入，大需求双方输出，Launch 使用可用双轴能力。20 m/s 测试中前轴份额随轻/中/重需求为 0% / 32.4% / 43.8%，并非固定比例。
11. **Launch Control**：IDLE / ARMED / READY / LAUNCHING / COOLDOWN / UNAVAILABLE。Sport Plus、近静止、重踩制动与电门、SOC 和组件温度许可后准备；后轴预选一挡，放刹车启动。约 440 kW overboost 由 8 s 时间预算、430 kJ 额外能量预算和实际热/电池能力共同限制，最后平滑回落至 380 kW；冷却等待 30 s。
12. **Drive modes**：Range / Normal / Sport / Sport Plus 影响油门曲线及响应、前轴参与、后轴换挡策略、冷却强度、功率储备、回收强度和悬架标定。Sport Plus 本身不永久提供 440 kW。
13. **Air suspension / PASM**：复用 SuspensionSystem。真实 rest geometry、body ride offset 和阻尼平滑变化；Sport / Sport Plus 降低 15 / 22 mm，高速降低策略带迟滞和延时。Model 3 保持固定悬架。未添加 Active Ride 或后轮转向。
14. **Energy / range**：依据实际 motor work、RPM/torque efficiency、inverter efficiency、battery loss、auxiliary load 和净回收结算。提供即时功率/电耗、trip used/recovered/average、组件温度、功率能力与动态续航。续航使用近期净电耗、距离平滑及初始 nominal consumption；低速不足样本保持稳定。
15. **Calibration differences**：Model 3 350 Nm / 210 kW peak / 110 kW continuous、450 W auxiliary、日常效率导向热管理、强 lift-off。Taycan 双电机、更大电池、700 W auxiliary、更强冷却和持续能力、coasting、踏板主导回收、两速及四模式；没有车辆名称物理分支或临时增加轮胎抓地力。
16. **Performance measurements**：默认干燥路面、80% SOC、固定 120 Hz。Model 3 0–100 6.108 s，极速 197.82 km/h；Taycan Launch 0–100 3.508 s，极速 250.66 km/h。Taycan 比 3.7 s 参考略快 0.19 s，未反复自动调参追求精确时间。
17. **Thermal / regen validation**：控制 SOC 的约 12 min 热台架：Model 3 后电机 24→113.7°C，可用功率 210→156 kW；Taycan 后电机 25→97.4°C，可用功率 280→243.9 kW，系统仍有 380 kW 输出能力。约 200 s 冷却后两车电机恢复峰值；另测临界温度下 Taycan 整体实际推进功率降低。高 SOC 制动回收近零时，摩擦制动从约 34 Nm 增至 1878 Nm 补足；前/后 ABS、独立 TCS、热回收限制及低温/低 SOC 检查通过。
18. **Changed files**：见下方完整清单。本报告仅列本轮实际编辑文件，不将工作区其它已有修改计入。
19. **Validation / build**：针对性 EV V2 1467、Model 3 regression 294、ABS/TCS/brake 133、直接受影响 ESC/AWD compatibility 48，共 1942 项断言通过。pnpm run typecheck 成功。pnpm run build -BasicValidation 成功，checkpoint 已发布至 dist。没有运行 full core、city/map validation、车辆视觉全套或其它车型性能 benchmark。
20. **Remaining tuning items**：Taycan Launch 比参考稍快；基础 premium EV exterior/cockpit/instrument 已接入，Porsche 专属细节与主观驾驶评价留待后续。热容量、冷却和效率 map 是轻量 simulation calibration，不是电磁/电芯级 OEM 模型。未发现阻塞性功能问题。

## 固定工况电耗

| 工况 | Model 3 RWD | Taycan 4S |
| --- | ---: | ---: |
| 温和城市循环 | 14.27 | 15.40 |
| 100 km/h | 13.27 | 17.61 |
| 120 km/h | 16.25 | 21.17 |

单位：kWh/100 km。工况用于相对比较，不等同于 WLTP。0–100 高功率加速能量分别为约 0.256 / 0.331 kWh。

完整原始结果：[test-results.json](test-results.json)。

车型参考：[Porsche 2024 Taycan 4S Performance Battery Plus technical data](https://newsroom.porsche.com/dam/jcr%3A581f5508-7a15-41a1-a9a2-82e03fa3ca32/pag-taycan-4s-performance-battery-plus-td-en.pdf)。采用其中 105/97 kWh、380/440 kW、710 Nm 系统级参考和前单速/后两速架构；组件分配由 simulation config 给出。

## 本轮文件清单

- src/vehicle/config/ElectricVehiclePhysicsConfig.ts
- src/vehicle/config/VehiclePhysicsConfig.ts
- src/vehicle/config/defaultVehiclePhysicsConfig.ts
- src/vehicle/config/teslaModel3PhysicsConfig.ts
- src/vehicle/config/taycan4SPhysicsConfig.ts（新增）
- src/vehicle/config/validateEVPlatformConfig.ts（新增）
- src/vehicle/config/validateVehiclePlatformConfig.ts
- src/vehicle/powertrain/BatteryPack.ts
- src/vehicle/powertrain/ElectricMotor.ts
- src/vehicle/powertrain/Inverter.ts（新增）
- src/vehicle/powertrain/EVThermalState.ts（新增）
- src/vehicle/powertrain/ElectricDriveUnit.ts（新增）
- src/vehicle/powertrain/EVPowerCoordinator.ts（新增）
- src/vehicle/powertrain/EVLaunchControl.ts（新增）
- src/vehicle/powertrain/ElectricPowertrain.ts
- src/vehicle/powertrain/Powertrain.ts
- src/vehicle/powertrain/ElectricPowertrain.selftest.ts
- src/vehicle/powertrain/EVPlatformV2.selftest.ts（新增）
- src/vehicle/transmission/EVTransmission.ts（新增）
- src/vehicle/transmission/EVTwoSpeedTransmission.ts（新增）
- src/vehicle/transmission/FixedReductionTransmission.ts
- src/vehicle/physics/VehicleDynamics.ts
- src/vehicle/physics/DriverAssistSystem.ts
- src/vehicle/physics/SuspensionSystem.ts
- src/vehicle/physics/ExecutiveSedan.selftest.ts（可选 EV shiftStrategy 引起的两处类型断言适配）
- src/vehicle/VehicleCapabilities.ts
- src/vehicle/VehicleCatalog.ts
- src/vehicle/VehicleDimensions.ts
- src/vehicle/visual/taycan4SVisualConfig.ts（新增）
- src/vehicle/visual/PremiumEVInstruments.ts（新增）
- src/vehicle/visual/InstrumentCluster.ts
- src/vehicle/visual/Cockpit.ts
- src/audio/ElectricAudioMix.ts
- src/game/DrivingGame.ts（EV 音色 presence 接入）
- src/ui/Hud.ts
- scripts/run-ev-platform-v2-selftests.ts（新增）
- artifacts/ev-platform-v2/test-results.json（新增）
- artifacts/ev-platform-v2/implementation-report.md（新增）
- dist/index.html 及生产 assets（统一构建发布）

## 操作

车型选择 Porsche Taycan 4S，D 挡下用现有驾驶模式按键 T 切到 SPORT PLUS。车辆静止时重踩刹车与电门，仪表显示 LAUNCH READY 后保持电门并放开刹车。SOC、温度或冷却等待不允许时仪表显示相应状态。
