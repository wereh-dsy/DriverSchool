# Vehicle Layout Dynamics V1 与 Ferrari 458 Italia

本次保留工作区原有未提交修改，没有提交、推送或重置。实施顺序：检查现有系统 → 布局一致性接入 → 旧车标定 → 旧车回归 → 458 动力学 → 458 视觉 → 最终验证构建。

## 动力学接入

旧模型并非所有车 50:50：已经有 `frontWeightBias`、独立 `yawInertia`、重心高度、四角悬架和纵向载荷转移。缺口是没有独立发动机位置描述，以及 `centerOfMassLongitudinalOffset` 额外改变轮胎/ESC 力臂，却不改变悬架静载，造成两套纵向质量分布。原轮胎载荷敏感性以各轮自身静载为参考，因此静态配重变化本身不能体现次线性抓地力。

现在使用 `frontWeightBias = f` 作为唯一纵向质量分布真值，移除重复偏移参数。轴距为 L、原点在前后轴中间、+Z 向后：`CG.z = L*(0.5-f)`，前轴到 CG 距离 `L*(1-f)`，后轴到 CG 距离 `L*f`。悬架初始化使用 `Fz_front=m*g*f`、`Fz_rear=m*g*(1-f)`，各轮取半轴荷。运行时质量包含实际燃油质量。

现有悬架载荷转移继续使用 `ΔFz=m*a_long*h/L`：加速从前轴转到后轴，制动相反。保留加速度平滑、四角弹簧/阻尼、限位和总支撑载荷守恒；气动力继续按前后轴分别进入悬架及轮胎正常载荷。

轮胎及 ESC 使用同一配重推导的力臂。偏航角加速度继续由实际四轮力矩除以每车 `yawInertia`，保留已有耗散阻尼、响应标定和数值边界。没有新增假偏航力矩或按布局放大转向。轮胎使用共同名义轮载参考值与已有 `loadSensitivity`，因此静态重载和动态转移均产生次线性摩擦力。轮胎宽度仅控制尺寸，后轴特性通过已有角刚度标定表达。

`enginePlacement` 独立表达 FRONT / FRONT_MID / MID / REAR，`drivetrainType` 独立表达 FWD / RWD / AWD。布置只参与配置描述与启动验证；没有任何 layout-specific grip/traction/steering multiplier。异常布置/配重组合可通过明确说明字段校验，RR 仅作为自测 fixture，不注册新车。

俯仰仍由现有四角弹簧、阻尼和角质量响应计算；项目没有独立刚体俯仰惯量积分，本轮未新增无效的 pitch inertia 元数据或第二套悬架。

## 正式车型审查

惯量单位 kg·m²，重心高度单位 m；全部为游戏第一版校准，非 OEM 测量值。

| 车型 | 发动机位置 | 驱动 | 前/后静态配重 | 偏航惯量 | CG 高度 |
| --- | --- | --- | --- | ---: | ---: |
| School | FRONT | FWD | 62 / 38% | 2500 | 0.54 |
| Mazda 2.0 6AT | FRONT | FWD | 60 / 40% | 2490 | 0.49 |
| Sagitar 1.4T 7DCT | FRONT | FWD | 61.5 / 38.5% | 2770 | 0.515 |
| Sylphy 2.0 CVT | FRONT | FWD | 59.5 / 40.5% | 2680 | 0.54 |
| Audi A6L | FRONT | AWD | 56 / 44% | 3950 | 0.50 |
| Touareg | FRONT | AWD | 54 / 46% | 4400 | 0.70 |
| GT | FRONT_MID | RWD | 51 / 49% | 2300 | 0.46 |
| Ferrari 458 Italia | MID | RWD | 42 / 58% | 1850 | 0.40 |

旧车原标定已合理，因此除 GT 外保留既有配重、惯量、动力总成与底盘角色。GT 由 52:48 调为 51:49，惯量由 2360 调为 2300，删除额外 -0.03 m 力臂偏移。其 3.0T、功率、7MT、胎类、外观与整体 GT 定位不变。

## 458 配置

- 4.499 L、90° V8、自然吸气，540 Nm @ 6000 rpm，扭矩曲线峰值功率约 419.4 kW @ 9000 rpm；2000 rpm 为 300 Nm。有限转动惯量 0.24 kg·m²，直接油门响应，无涡轮和转速瞬移。
- 1435 kg 基础质量 + 默认 60 L 燃油约 44.7 kg = 1479.7 kg。尺寸 4.527 × 1.937 × 1.213 m，轴距 2.65 m。
- 复用双离合系统：独立 7 挡齿比和换挡策略，SPORT 换挡约 0.11 s，RACE 0.08 s，WET 0.15 s；非预选换挡另有短延迟。支持 D + 原有 LB/RB 手动覆盖、超转保护及正常自动驾驶；降挡补油通过发动机油门和离合负载同步，不赋值 RPM。自动制动降挡受道路速度超转校验。
- 后轴 LSD：预载 45 Nm、锁止强度 0.16、扭矩偏置比 3；eDiff 沿已有轮滑差和服务制动路径工作，最大请求 350 Nm。
- ABS/EBD/TCS/ESC 默认开启。WET 提早干预，RACE 延后干预且仍保持保护。模式不改变最大功率或用户辅助开关偏好。ABS 保留 BrakeTorqueCoordinator 的最终调制权限。
- PERFORMANCE 公路胎，前 235 / 后 295 mm，前后角刚度 90000 / 116000 N/rad，载荷敏感性 0.07。低重心、道路运动悬架，前后弹簧 42000 / 56000 N/m，保留有限行程与可用阻尼，少量高速前后下压力。
- 默认 SPORT，通过现有 T / 手柄 B 循环 WET / SPORT / RACE。未实现 CT OFF、CST OFF、复杂 manettino 或专有 E-Diff 软件。

相对 GT，458 的低惯量与后轴配重带来更快旋转响应、更强后轮驱动牵引，NA 响应和双离合换挡更直接；GT 保持较从容的前中置巡航性格。此为配置和动力学路径的预期，不是精确圈速或主观驾驶评分。

## 视觉与仪表

独立程序化 mid-supercar 车身断面，低鼻、座舱前移、后轮拱肩部、侧进气、后发动机玻璃罩、圆尾灯和三出排气。复用几何生成工具，不缩放 GT 外壳。

低坐姿、独立仪表罩与紧凑中央控制区，两座及后隔板、固定左右拨片。按照用户提供照片使用黄色中央转速表、表内挡位窗、左状态/燃油/温度信息、右数字屏内速度表；实际 mode、gear、speed、fuel、temperature 和警示状态来自现有遥测。方向盘中央为黄色圆底黑色跃马矢量徽章，随方向盘旋转。第一版采用简化造型，非像素级复刻。

## 本次修改文件

已有修改文件仅记录本次追加部分；不包含用户先前的地图、巡航、停车或行政/SUV 视觉工作。

- 文档/运行器：`README.md`、`scripts/run-core-selftests.ts`。
- 目录/尺寸：`src/vehicle/VehicleCatalog.ts`、`VehicleCatalog.selftest.ts`、`VehicleDimensions.ts`、`PowertrainLayout.selftest.ts`（新增 V8 目录校验）。
- 配置：`src/vehicle/config/VehiclePhysicsConfig.ts`、`validateVehiclePlatformConfig.ts`、`defaultVehiclePhysicsConfig.ts`、`sportsCoupePhysicsConfig.ts`、`transmissionTestVehicleConfigs.ts`、`cvtSedanPhysicsConfig.ts`、`executiveSedanPhysicsConfig.ts`、`roadSUVPhysicsConfig.ts`、`ferrari458PhysicsConfig.ts`、`index.ts`。
- 动力学：`src/vehicle/physics/VehicleDynamics.ts`、`SuspensionSystem.ts`、`ESCController.ts`、`VehicleLayout.selftest.ts`、`Ferrari458.selftest.ts`、`ExecutiveSedan.selftest.ts`（模式类型可选项适配）、`VehicleExperience.selftest.ts`（按各车实际支持的模式检查巡航）。
- 动力总成/变速箱：`src/vehicle/powertrain/ICEPowertrain.ts`、`src/vehicle/transmission/TransmissionSystem.ts`、`automatic/AutomaticShiftController.ts`、`dct/DualClutchTransmissionSystem.ts`。
- 视觉：`src/vehicle/visual/Ferrari458VisualConfig.ts`、`Ferrari458Visual.selftest.ts`、`PrancingHorseBadge.ts`、`Cockpit.ts`、`CockpitLayout.ts`、`InstrumentBinnacle.ts`、`InstrumentCluster.ts`、`VehicleExterior.ts`、`VehicleVisual.ts`、`VehicleVisualConfig.ts`、`index.ts`。
- 报告/验证记录：`artifacts/vehicle-layout-v1-report.md`、`vehicle-layout-v1-core-results.json`、`vehicle-layout-v1-build.log`。

## 验证

旧车回归先行通过：layout、VehicleDynamics、vehicle catalog、vehicle platform、powertrain boundary、transmission backend/driving/shifts，以及当时完整 core 自测。

最终配置的独立 `pnpm run typecheck`、`pnpm run selftest:vehicles` 已通过。458 动力学专项、仪表绘制和尺寸专项、八车座舱结构检查均已通过。最终 `pnpm run build` 成功：再次通过 typecheck、完整 57 组 core 自测及 Vite 构建，已发布 playable `dist`（2026-10-09 14:29）。源文件指纹检查通过。Vite 有单包大于 500 kB 的体积提示，无编译或测试错误。

完整分项测试结果：[vehicle-layout-v1-core-results.json](vehicle-layout-v1-core-results.json)。构建日志：[vehicle-layout-v1-build.log](vehicle-layout-v1-build.log)。

最终 core 覆盖：ferrari458, ferrari458Visual, vehicleLayout, vehicleExperience, cruiseVehicleExperience, powertrainBoundary, vehiclePlatform, powertrainLayout, fuel, cityToolchain, cityPresets, cityMap, executiveSedan, executivePolish, suspensionStance, environment, input, feedback, haptics, steeringReturn, transmissionBackend, transmissionDriving, transmissionShifts, automaticGround, automaticSelectorInput, lighting, physics, mechanicalDetails, engineTorque, engineTurbo, wheelRotation, tyreDifferential, driverAssists, escAWD, cvt, vehicleStructure, suspensionMechanics, wheelContact, staticCollision, contactDynamics, fourWheelPhysics, mapContactAcceptance, vehicleCatalog, cruiseControl, rearParkingProximity, mirrors, instruments, driverView, vehicleExteriors, visualDimensions, roadCourse, groundCatalog, circuit, mountain, lapTimer, subject2, subject3。

需要用户驾驶评估：GT 是否仍像 GT、458 是否过度敏感、后轴牵引是否偏强、SPORT/RACE 的 ESC 介入、DCT 激进程度，以及参考图仪表和低模外形的主观观感。不执行自动主观调教。

现实原型参考：[Ferrari 官方 458 Italia 页面](https://www.ferrari.com/en-PA/history/garage/2009/458-italia)。物理曲线与底盘参数以当前游戏配置为准。
