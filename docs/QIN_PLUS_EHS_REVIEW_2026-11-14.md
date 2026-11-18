# 秦 PLUS DM-i 五项复核与发布记录

日期：2026-11-14。承接 [EHS 架构及参数说明](QIN_PLUS_EHS.md)。本轮直接修改现有工作区，没有提交、回滚或清理其他任务的改动。

## 零百差距：先做分解，再修控制

同一 120 Hz 四轮/底盘、相同质量、轮胎、损耗、SOC 和输入条件下，原 HEV/EV/SPORT 均约 8.61 s。诊断数据保留在 [修改前报告](../artifacts/qin-plus-ehs/audit/acceleration-before.json) 和 [修复后报告](../artifacts/qin-plus-ehs/audit/acceleration.json)。诊断用变体只在脚本中修改临时配置，没有进入车型生产标定。

| 检查 | 结果 |
|---|---|
| 起步 P3 | 0.5 s 约 195 Nm，1 s 达到 210 Nm；约 60 km/h 后达 120 kW。原实现有两级响应滤波，但没有少装一台驱动电机或丢失整个峰值扭矩 |
| 电池过早限制 | 原始起步电池上限为 135 kW；增大诊断预算不改善 8.61 s。低速主要是扭矩/减速比约束，中高速是 P3 机械功率上限 |
| 串联→并联 | 原控制按“请求路径”提前撤掉 P1 发电，在直驱离合器尚未接合时让发动机靠摩擦从高转降到道路转速；100 km/h 前几乎没有机械助力 |
| 介入空档 | 原 P3 没有整体断电，但机械助力来得晚；进一步修复了小转速差触发整步机械扭矩撤销，以及 P3 已受限时仍被补偿算法过度减扭的问题 |
| 质量/抓地/损耗 | 实际总质量约 1580 kg，P3 上限、抓地力、轮胎和机械效率未为追数字修改。诊断移除空气/滚阻约减少 0.36–0.45 s，但不代表这些真实阻力应删除 |

修复内容：

1. 并联同步阶段按实际离合器接合份额保留串联发电能力，让 P1 的真实负载参与降转和回收曲轴转动能。
2. 离合器使用隐式摩擦响应，预留曲轴/P1 跟随道路加速所需的惯量扭矩；允许小的瞬时转速差进入连续约束，仍检查非负耗散和同一步能量守恒。
3. P3 只在总扭矩已达到请求时减扭。受功率限制的 P3 保留实际输出，机械助力建立时不被无条件扣掉一份扭矩。

结果：**默认 HEV/SPORT 约 8.12 s；EV 优先约 8.28 s。** 默认 HEV 相对 7.6 s 仍慢约 6.8%。并联助力提前建立，新增全负载防回归断言，要求 90 km/h 前真实出现发动机/P3 同时驱动，并限制单步轮端扭矩下降。P3 仍为 **210 Nm / 120 kW**。

没有继续盲调质量、抓地力、电机额定值或未经核实的减速比。剩余响应/齿比和实车测试条件差异保留为待标定项。此前 8.61 s 的车辆测试明确设置 EV 优先；当前车辆主用例改为默认 HEV，诊断脚本继续单独保留 EV 对比，避免混淆测试条件。

## P1 与机械路径一致性

- P1 继续按曲轴 1:1 等效耦合；转速、转子惯量、机械负载和 DC 功率使用同一关系。1:1 是模型假设，不是原厂齿轮结构确认。
- P1 只加载/启动发动机；不额外向轮端施加驱动扭矩。串联发动机轮端扭矩保持零，发电实际消耗燃油和曲轴功。
- P3 10.8 与直驱 3.25 是两条独立固定路径。每步从相同车轮角速度分别计算转速，离合器只控制机械路径，电机不会借用发动机齿比。
- 增加可配置的直驱耦合刚度 200 N·m·s/rad，将机械刚度与同步许可转速门限分离。
- 母线、电池、P1、P3、摩擦/离合器损失和转子能量继续通过专项检查。P1 峰值、两条齿比及机械细节仍是工程估值，没有因本轮复核升级为“原厂已确认”。

原厂 EHS 技术只能用于核对架构：[比亚迪官方 Super DM 技术说明](https://prod2.byd.com/uk/technology/byd-super-dm-plug-in-hybrid-technology)描述双电机、油冷和该市场平台转速能力；它不是本款中国秦 PLUS 的 P1/齿比资料，不能把它的参数直接移植过来。

## 热管理：从定速台架转到实际四轮驾驶

新增 20°C、35°C 两组各 600 s 的闭环驾驶，包含城市起停、100 km/h 公路、50 km/h 行驶，实际推进车轮、轮胎和底盘，SOC 从 30% 开始并请求 HOLD 60%，发动机持续发电超过 597 s。[完整轨迹](../artifacts/qin-plus-ehs/audit/thermal-driving.json)。这属于游戏物理中的实际驾驶工况，不是实车路试。

发现并修复：原 EHS 对冷发动机也持续使用完整散热导热系数，没有节温器，十分钟后冷却液只到约 51.7/66.7°C。新增 **78–94°C 节温器开度及 12 W/K 旁通**，只用于 EHS，未修改 ICE/P2 的热管理路径。温度仍由燃油损失、摩擦、热容量和散热积分产生，没有直接钳成目标温度。

| 环境 | 十分钟后电池 | P1 | P3 | 冷却液 |
|---|---:|---:|---:|---:|
| 20°C | 21.11°C | 43.36°C | 22.14°C | 85.75°C |
| 35°C | 36.11°C | 58.37°C | 37.14°C | 87.14°C |

电池累计热输入约 336 kJ，260 kJ/K 的热容量加上散热，对应约 1.1°C 温升；不能要求电池随发动机温度一起上升。这里没有完整共用冷却液网络、制冷剂模型或原厂热标定，温度变化的实车准确度仍未证明。原 600 s 重负载台架也继续保留，用于功率/热降额稳定性检查，不替代驾驶轨迹。

## 既有车型与共享接口

审查 VehicleDynamics、ICEPowertrain、HybridBattery、Powertrain、VehicleCatalog、DrivingGame、Cockpit 的接入点，复核以下六辆车：训练车、E300L、坦克500、SU7、Model 3、Taycan。

每辆运行 20 s 加速、转向、滑行和服务制动，将 EHS 工厂路径与提取工厂前的直接 ICE/P2/EV 构造分派逐样本比较完整物理快照。**15,000 项断言通过，六车 SHA-256 轨迹完全一致。** [报告](../artifacts/qin-plus-ehs/audit/compatibility.json)。原构造路径在当前源码中执行，因此证明本次接入分派等价，不等价于与历史版本的所有行为逐项比较。

本轮生产修改集中在 EHS 系统/配置、秦 PLUS 外观/座舱及专项测试，没有再次修改上述共享核心，也没有修改坦克500/P2/SU7 等车型实现。HybridBattery 的前轮修改只分离 TypeScript 配置契约，实际积分函数未改；ICEPowertrain 默认未注入变速器时仍走原构造；旧车型不触发 EHS 的音频/座舱分支。

没有运行全项目全部测试。此处是针对共享边界的六车抽样回归，不能宣称所有既有车型、挡位、路面和控制状态均已完整验收。

## 真实 GPU 与声音检查

使用实际 StartupApplication → DrivingGame，在本机 **NVIDIA RTX 5060 Laptop / Direct3D11 WebGL** 上运行，非 Canvas Mock。EV、串联车内/车外、并联、导航页面均完成实际渲染；没有控制台错误。[运行报告](../artifacts/qin-plus-ehs/audit/runtime.json)、[最终视觉复核](../artifacts/qin-plus-ehs/audit/runtime-visual.json)。

实际截图发现并修复了三个问题：平板式车顶内衬穿出弧形外壳；竖直 B 柱内饰越出收窄的侧窗面；仪表下半部被方向盘遮挡。内衬/B 柱改为内缩曲面，仪表抬高并补支座；未移动 DriverEye 或降低方向盘遮挡判定来掩盖问题。当前 138 个 Mesh。

![最终驾驶视角](../artifacts/qin-plus-ehs/audit/cockpit.png)

[外观截图](../artifacts/qin-plus-ehs/audit/exterior.png)、[串联能量屏](../artifacts/qin-plus-ehs/audit/series-cabin.png)、[并联能量屏](../artifacts/qin-plus-ehs/audit/parallel.png)。外观/内饰仍是程序化近似，不宣称达到原厂 CAD 或扫描模型质量。

使用真实 EngineAudio/Web Audio 输出导出 PCM WAV，而非只检查配置值：

- [串联车内声音](../artifacts/qin-plus-ehs/audit/series-cabin.wav)
- [串联车外声音](../artifacts/qin-plus-ehs/audit/series-exterior.wav)
- [并联声音](../artifacts/qin-plus-ehs/audit/parallel.wav)

串联样本约 3368 rpm，对应实际燃烧振荡器约 112 Hz，与四缸四冲程频率一致；发动机和电机频率来自独立曲轴/驱动轴。并联样本的燃烧和电驱层同时有输出。车外样本声压信号明显高于车内，隔音层生效，录音峰值没有超出 PCM 范围。不同样本工况并非完全一致，这些测量不能用作原厂 NVH 对标；**主观音色、混音协调与长期驾驶感受仍由用户验收**。

## 验证、修改清单与发布

通过：16 组 EHS 动力专项、7566 项车辆断言、17 项几何/HMI 断言、六车共享边界轨迹比较、两组十分钟四轮驾驶热工况、实际 GPU/Web Audio 检查。新增检查没有替换或放宽原失败断言。

本轮修改生产文件：

- `src/vehicle/powertrain/EhsHybridSystem.ts`
- `src/vehicle/config/EhsHybridConfig.ts`
- `src/vehicle/config/qinPlusDmiPhysicsConfig.ts`
- `src/vehicle/config/validateEhsHybridConfig.ts`
- `src/vehicle/visual/QinPlusCabin.ts`
- `src/vehicle/visual/QinPlusExterior.ts`
- `src/vehicle/visual/QinPlusVisualConfig.ts`
- `src/vehicle/EhsVehicle.selftest.ts`

新增诊断/运行脚本：`scripts/audit-qin-ehs.ts`、`scripts/validate-qin-release.ts`、`scripts/qin-runtime-audit.html`、`scripts/qin-runtime-audit.ts`、`scripts/qin-runtime-audit.cjs`、`scripts/qin-runtime-server.mjs`。它们不是 Vite 正式入口，不进入 Release。

发布命令按用户明确要求使用轻量模式：

```powershell
pnpm run build -BasicValidation
pnpm run desktop:build
node scripts/desktop-package.mjs
```

最终结果：`pnpm run build -BasicValidation` 成功（包含全项目 typecheck、地图 v507 基线验证和正式 Vite 发布；依用户要求跳过全量核心测试）；`pnpm run desktop:build` 成功；`node scripts/desktop-package.mjs` 成功。Vite 保留现有大 chunk 警告，没有构建错误。

Release：`D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe`。发布后读取 app.asar，页面、VehicleCatalog 和 DrivingGame 均与本次 dist 逐字节一致，并确认秦 PLUS 车型 ID 存在。[发布校验通过](../artifacts/qin-plus-ehs/audit/release-verification.json)。首次校验使用的斜杠路径不适合 Windows ASAR，改用原生路径后完成核对，包内没有缺失这些文件。

本轮需要继续人工确认的事项：7.6 s 标称性能尚未完全对齐；P1/齿比与热管理缺少本款原厂完整数据；程序化外观、音色及混音的主观质量仍需用户验收。构建与发布成功不消除这些标定边界。
