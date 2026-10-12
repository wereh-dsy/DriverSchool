# Tyre Pressure & Thermal V1 / Shared TPMS

## 实现

每轮独立的 lumped thermal state，统一存储摄氏温度。120 Hz 累计每轮能量，20 Hz 积分：

`heatPower = heatingEfficiency × (abs(Frolling × vLong) + abs(Fx × (ωr − vLong)) + abs(Fy × vLat))`。

滚阻直接复用现有模型，Fx/Fy 来自实际接触轮胎力；驱动、制动、弯道和载荷差异通过力与滑移功进入热量，没有额外乘一次载荷，也没有按车速直接升温。

冷却功率为 `(temperatureC − ambientC) × (baseCoolingRate + speedCoolingGain × hypot(vLong, vLat))`，使用平均输入的解析一阶积分，避免时间步长造成过冲。热容量单位 J/K，冷却系数 W/K。升降温为分钟尺度；停车不立即回到环境温度，高速仍有滚动损失热源。

新实例从环境温度加可选预调温偏移初始化；环境接口可更新 ambientTemperatureC，目前世界没有温度字段时使用车辆配置 ambientTemperature（缺省 20°C）。完整 reset 重置冷胎；setPose/碰撞修正保留温度。暂停不积分，切车创建新实例，不长期保存胎压。

压力关系为 `Pabs = (coldGaugeKPa × 1000 + 101325) × (temperatureC + 273.15) / (referenceTemperatureC + 273.15)`。
内部绝对压力为 Pa；表压 `max(0, (Pabs − 101325) / 1000)` 以 kPa 提供遥测。使用固定标准大气压，封闭空气质量与体积近似，不直接对摄氏温度或表压做气体比例运算。

物理压力范围只约束修正因子，不隐藏传感器读数。压力比相对各轴目标冷态表压：低压平滑增加滚阻，高压轻微减小滚阻，滚阻因子限制在 0.94–1.40；纵横向刚度因子限制在 0.85–1.08。默认 80–120% 压力范围内，刚度变化约 ±2–2.4%。纵向修正现有 slip curve 的斜率/峰值滑移位置，横向修正现有 cornering stiffness。峰值 μ、载荷敏感性与 combined-slip budget 保留，没有新增温度最优抓地曲线。油耗和电耗通过现有道路阻力/动力请求链路自然受影响。

## 共享数据与显示

`TyreStatus` 提供 position、valid、pressureKPa、temperatureC、targetColdPressureKPa、pressureState；`TPMSState` 提供 available、四轮命名状态和统一 warning。NORMAL / LOW / CRITICAL_LOW / HIGH 在物理层判定，默认阈值 0.80 / 0.65 / 1.45。V1 仅暴露胎温数值，不新增胎温报警。

物理状态 → TPMSSensor → VehicleSnapshot.tpmsState → InstrumentTelemetry / SharedVehicleData → 车型皮肤。TPMS capability 已存在并复用，物理系统始终存在。传感器 2 Hz 采样，以 1.5 秒时间常数过滤，显示量化到 1 kPa；胎压显示数据最多 2 Hz 更新，页面沿用自身缓存/刷新节奏。警告取未过滤的物理状态，避免读数平滑掩盖低压。新增热模型没有每物理 tick 分配对象或格式化 UI 字符串。

BMW 既有 Tyre Pressure 页删除固定胎压回退；Taycan 四轮状态页接入同一数据，既有仪表警告区域增加 TPMS 标识；Tesla 停车状态增加紧凑胎压读数并使用统一警告；A6L/Touareg 的 capability 和共享数据已可用，未新增状态页。旧 pressure/valid/warning 入口保留为兼容适配，实际游戏使用规范 TPMSState。

## 初始标定（模拟值，参考温度均 20°C）

| 车型 | 前/后冷态表压 kPa | 前/后热容量 J/K | 吸热比例 |
| --- | --- | --- | --- |
| BMW 530Li | 250 / 270 | 32000 / 33000 | 0.65 |
| Audi A6L | 250 / 260 | 32000 / 32000 | 0.65 |
| Touareg | 260 / 280 | 40000 / 42000 | 0.70 |
| Model 3 RWD | 290 / 290 | 30000 / 31000 | 0.55 |
| Taycan 4S | 260 / 280 | 33000 / 35000 | 0.80 |

其他现有车辆有通用 fallback 前 240 / 后 250 kPa；没有车型名称物理分支。这些值并非 OEM 胎压标签认证数据。

## 验证

定向 runner：scripts/run-tyre-thermal-pressure-selftests.ts。包含 thermal/pressure/TPMS、实际轮胎刚度与底盘滚阻接入、BMW/Taycan/Tesla canvas TPMS 接入、wheel rotation、tyre/differential、four-wheel physics。结果见 test-results.json。

61 个新增物理/共享状态断言、12 个显示断言、28 个 wheel rotation、66 个 tyre/differential、20888 个 four-wheel 断言全部通过（共 21055）。覆盖 Kelvin 和绝对/表压换算、冷/热趋势、慢冷却、滚动/牵引/制动/弯道工作热源、四轮独立、前后目标、四档警告、总体警告、2 Hz 过滤、1 kPa 量化和无效读数恢复。

五分钟定向巡航热输入测试从 20°C 升至约 26.93°C。BMW/Model 3/Taycan/A6L 的短程加速、约 100 km/h 巡航、温和转弯和制动，相对关闭胎压影响的同配置基线，最大速度差 0.0002205 m/s，最大 yaw 差 0.0000086 rad。正常热变化对行为影响很小；这是数值回归结果，主观驾驶体验由用户确认。实际 8 秒全油门测试中 Taycan 四轮总温升约 3.824°C，Model 3 约 1.919°C；差异来自质量、实际力/滑移及配置。

构建命令：`pnpm run build -BasicValidation` 成功；最终 typecheck 通过，Vite production build 完成，Checkpoint published，playable dist/index.html 与资源已更新。构建有非阻断 bundle 体积提示。未执行 full core、world/map、完整 cockpit 或 EV platform suite。

待用户试驾微调：车型冷胎目标、thermalCapacity、heatingEfficiency、冷却系数和非常低压下的刚度/滚阻敏感度；当前没有已知未通过的定向检查。

## 本任务修改文件

- src/vehicle/config/TyreThermalPressureConfig.ts（新增配置）
- src/vehicle/config/VehiclePhysicsConfig.ts
- src/vehicle/config/defaultVehiclePhysicsConfig.ts
- src/vehicle/config/validateVehiclePlatformConfig.ts
- src/vehicle/config/bmw530LiPhysicsConfig.ts
- src/vehicle/config/executiveSedanPhysicsConfig.ts
- src/vehicle/config/roadSUVPhysicsConfig.ts
- src/vehicle/config/teslaModel3PhysicsConfig.ts
- src/vehicle/config/taycan4SPhysicsConfig.ts
- src/vehicle/physics/TyreThermalPressureSystem.ts（新增热/压力系统）
- src/vehicle/physics/TyreThermalPressure.selftest.ts（新增定向验证）
- src/vehicle/physics/TyreGripModel.ts
- src/vehicle/physics/WheelRotationSystem.ts
- src/vehicle/physics/WheelPhysicsState.ts
- src/vehicle/physics/VehicleDynamics.ts
- src/vehicle/TPMSState.ts（新增规范接口与传感器）
- src/vehicle/VehicleCatalog.ts
- src/vehicle/SharedVehicleData.ts
- src/game/DrivingGame.ts
- src/vehicle/visual/InstrumentCluster.ts
- src/vehicle/visual/LuxuryVehicleStatusPage.ts
- src/vehicle/visual/BMW530CenterDisplay.ts
- src/vehicle/visual/BMW530FrontCabin.selftest.ts（更新无效胎压期望）
- src/vehicle/visual/TaycanCenterDisplay.ts
- src/vehicle/visual/PremiumEVInstruments.ts
- src/vehicle/visual/ElectricCenterDisplay.ts
- src/vehicle/visual/TPMSDisplays.selftest.ts（新增显示定向验证）
- scripts/run-tyre-thermal-pressure-selftests.ts（新增 runner）
- artifacts/tyre-thermal-pressure-v1/test-results.json
- artifacts/tyre-thermal-pressure-v1/implementation.md
- dist/（最终 build 更新 playable 内容）
