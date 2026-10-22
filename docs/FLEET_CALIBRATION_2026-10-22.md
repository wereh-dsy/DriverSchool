# 六车整车标定记录（2026-10-22）

本轮覆盖 Touareg、A6L 45 quattro、E300L、530Li、Model 3 RWD、Taycan 4S；已更新可玩 dist。
这是现有模型上的工程标定，不是厂家实测标定或认证。质量、尺寸、动力版本、齿比沿用仓库现有设定；弹簧、阻尼、惯量、电控阈值和踏板映射属于工程估计。没有新增依赖，没有车型名称判断，没有更改地图、UI、模型或音效。

## 按车交付

| 车辆 | 主要调整 | 定位与保留的动力链 | 已知限制 |
| --- | --- | --- | --- |
| Touareg | 部分负荷指数 .88→.65；踏板指数 1.04→.96；前/后弹簧 47/44→43/40 kN/m，行程 .21→.23 m；压缩/回弹阻尼随簧下质量重新匹配；新增前58/后60 kg 每轮簧下质量和260 kN/m轮胎径向刚度；稳定导向 ABS/EBD/TCS/ESC 与有速率限制的 AWD | 3.0 TSI V6、450 Nm、液力8AT、现有适时 AWD；较大的车身动作、较长行程，低中速厚重 | 无新增车型失败；共通落地断言、固定AWD专项见下 |
| A6L | 部分负荷指数 .85→.65、踏板指数1.04→.93；DCT接合速率1.25→1.4、完全接合速度4.8→4.5 m/s；修正轮胎预设覆盖顺序；缓冲块220 kN/m；独立ABS/EBD标定 | 370 Nm、7DCT、前驱偏置适时 AWD；正常后轴基准25%，加速目标40%，上限50%，保持高速稳定 | 无新增车型失败；共通落地断言、固定AWD专项见下 |
| E300L | 部分负荷指数 .82→.78、踏板指数1.10→1.02，保留较慢执行器和45 ms请求平滑；修复轮胎预设覆盖后，1.78 kg·m²轮胎转动惯量与专属抓地/滑移参数实际生效；缓冲块200 kN/m；较柔和ABS恢复与EBD | M254风格400 Nm、17 kW/48 V ISG、液力9AT、RWD；保留起动、低转扭矩填补、回收、SOC和功率限制；舒适、柔和 | 无新增车型失败；共通落地断言见下 |
| 530Li | 部分负荷指数1→.65、踏板指数1.035→.90，Normal执行器3.4→3.7 s⁻¹；轮胎预设先应用后逐轴标定，99/105 kN/rad刚度与原有1.02/1.03抓地实际生效；缓冲块210 kN/m；Sport允许更多偏航/侧偏 | B48风格350 Nm、液力8AT、FR；保留Comfort/Normal与Sport换挡表和锁止，响应较积极、后轴参与适度 | 无新增车型失败；共通落地断言见下 |
| Model 3 | 更易控制的1.04踏板指数；最大机械制动力19.8 kN、基础前偏64%、制动指数1.16；明确启用EBD；统一31.5°路轮极限和方向盘几何；高速衰减/回正独立标定；前/后侧偏刚度88/96 kN/rad、防倾杆21/16 kN/m、行程155 mm | 保持单后电机、9.03固定减速、60 kWh可用电池、210 kW电机、无蠕行；保留强回收及电压/电流/SOC/温度限制，低重心、直接可控 | 既有电池能量专项断言未通过；共通落地断言见下 |
| Taycan | Normal/Sport/Sport Plus转向响应4.4/4.9/5.2 s⁻¹；性能模式踏板指数改为.90/.84，保留响应速度差异；制动力27.5 kN、前偏64%、指数1.16；轮胎刚度110/125 kN/rad、峰值滑移.10/峰值侧偏.12 rad；行程150 mm、缓冲块280 kN/m；快速ABS及分模式ESC/TCS，避免Sport继承燃油车180 ms牵引确认延迟 | 保持双PSM、前单速/后两速、前轴断开/同步接合、97 kWh可用电池、380 kW常规/440 kW Launch、热降额；轻松电门回收，与Model 3有明显区别 | 既有前轴ABS专项断言未通过；共通落地断言见下 |

六车发动机/电机峰值曲线、最高转速、传动拓扑、各挡齿比、终传比、空气阻力、轮距/轴距/轮胎尺寸均已核对并沿用。ICE的扭矩曲线和涡轮仍共同约束输出，未添加人为扭矩尖峰。悬挂保留真实 chassis Y、簧下运动、轮胎接触及Fz路径。

## 基础与静态核对

`mass` 是项目定义的“不含燃油基础质量”，ICE实际静态重量还包含默认燃油，不能把两者混为一谈。下列载荷为左右对称时的**整轴合计**；每个轮胎承担该轴一半。

| 车辆 | 基础/含默认燃油质量 kg | 前轴比例 | CG高度 m | yaw惯量 kg·m² | 静态前/后Fz N | 前/后弹簧压缩 mm | 总行程 mm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Touareg | 2100 / 2146.9 | .54 | .70 | 4400 | 11373 / 9688 | 119 / 106 | 230 |
| A6L | 1840 / 1878.0 | .56 | .50 | 3950 | 10317 / 8106 | 120 / 101 | 170 |
| E300L | 1950 / 1984.3 | .52 | .52 | 4380 | 10122 / 9344 | 124 / 117 | 165 |
| 530Li | 1745 / 1780.5 | .51 | .50 | 3820 | 8908 / 8559 | 104 / 102 | 160 |
| Model 3 | 1765 / 1765 | .49 | .43 | 2950 | 8484 / 8830 | 98 / 94 | 155 |
| Taycan | 2250 / 2250 | .49 | .41 | 3850 | 10816 / 11257 | 94 / 90 | 150 |

六车静态剩余压缩/回弹行程均大于35 mm；静态Fz总和与实际含燃油质量重力误差低于0.5%；静止Y偏差小于4 mm，垂向速度小于1e-5 m/s，无接触反复切换。实际每轮余量、轮胎径向压缩、载荷与Y/vY/aY/俯仰/侧倾响应保存在结果JSON。

pitch/roll惯量继续由现有 `ChassisDynamics` 按簧上质量和车身尺寸推导；没有用人工姿态倍率替代惯量或真实轮荷。尺寸、离地高度、物理轮位和外观几何保持原有统一数据源。

## 测量结果

相同的120 Hz程序化短场景。0–100为普通D挡全踏板、默认SOC/燃油、平路干沥青，**未开启Launch**；制动为100 km/h开始全踏板至0.1 m/s，含制动压力建立时间。它们是本模型结果，不是厂家成绩或长时间热稳态测试。

| 车辆 | 0–100 s | 100–0制动 m | 普通转向场景峰值侧倾 ° | 小减速带恢复 s | 单侧轮起伏恢复 s |
| --- | --- | --- | --- | --- | --- |
| Touareg | 7.66 | 43.66 | 1.64 | .58 | .24 |
| A6L | 8.13 | 44.33 | 1.06 | .57 | .24 |
| E300L | 7.53 | 43.24 | 1.43 | .61 | .25 |
| 530Li | 7.88 | 40.78 | 1.15 | .59 | .25 |
| Model 3 | 6.17 | 42.12 | .86 | .56 | .24 |
| Taycan | 3.94 | 37.70 | .77 | .63 | .28 |

滚动踏板场景从36 km/h开始，记录第1–3秒净加速度均值（包含自动换挡，不是固定转速台架）：

| 车辆 | 20%踏板：修改前→后 m/s² | 50%踏板：修改前→后 m/s² | 5%踏板从静止4秒后的速度 km/h |
| --- | --- | --- | --- |
| Touareg | -.12→.10 | .56→.95 | 4.96 |
| A6L | -.01→.16 | .39→.56 | 7.76 |
| E300L | .16→.26 | .97→1.11 | 4.98 |
| 530Li | -.13→.24 | .44→.85 | 5.51 |
| Model 3 | .88→.82 | 2.36→2.29 | 2.04 |
| Taycan | 1.23→1.14 | 3.23→3.14 | 2.92 |

5%、10%、20%、50%、100%均已采样。滚动状态很小踏板仍可能减速，这是发动机拖曳、滚阻和风阻下的净结果；小踏板起步确实产生推进。Model 3完全松电门场景约-2.18 m/s²，Taycan约-.22 m/s²，保留强回收与偏滑行的差别。

## 共享修改

- **calibration接口没有新增字段。** 使用现有 `controlCalibration` 的 abs/ebd/tcs/esc/throttle/drivetrain/modes；六个目标预设分别标定，其他预设未改。
- 轮胎问题在车型工厂中修复应用顺序：先通用预设，再车型参数。没有更改共享轮胎力公式，没有胎宽抓地倍率。
- 共享运行逻辑只修复 `ElectricPowertrain` 的小踏板回收/推进交界：原来在2%推进阈值前仍请求约98%的松电门回收，越过阈值立即切正扭矩；现在回收在既有阈值前渐退到零，正扭矩在2%–4%范围渐入。没有改变峰值动力、共用电池预算、制动融合或同一步ABS的最终权限。
- 新增双EV拓扑交界回归，0.0198–0.0202请求逐点检查轮端扭矩单调、无突跳。
- 六车catalog标定版本递增，稳定vehicle ID未改。

## 实际验证及保留问题

没有运行 `pnpm run selftest`、full/core tests、`selftest:systems` 或全项目回归。没有GUI自动驾驶。

1. `node scripts/run-vehicle-physics-calibration.mjs --fleet --baseline`：修改前基线，保留原始记录。
2. `node scripts/run-vehicle-physics-calibration.mjs --fleet`：最终66个垂向短场景与132个驾驶短场景；**516项断言，510通过、6失败，命令退出码1**。覆盖静止、加速、制动、转向、细碎路面、减速带、长坡、腾空落地、单侧轮起伏、3%横坡、坡顶坡底；以及小踏板、低速起步、低附着、分离附着制动、126 km/h微转向、普通与大输入转弯、松电门。
3. `node scripts/run-fleet-calibration-selftests.mjs --baseline`：仅在内存替换任务开始时干净的配置/控制预设/电驱源码，以HEAD版本对照，保留工作区既有接触系统；不checkout、不reset。7个相关既有专项，4通过、3失败。
4. `node scripts/run-fleet-calibration-selftests.mjs`：最终同样4通过、3失败。通过：ElectrifiedPowertrain **49**断言（48V、电气预算、两速、Launch、回收融合和新增交界回归）、DriverAssist **133**、ExecutiveSedan **37**、ExecutivePolish **749**。没有新增失败。
5. 曾直接运行既有 `run-ev-platform-v2-selftests.ts`，在同一个前轴ABS断言失败；随后用上述收集式runner获取其余专项结果。既有断言没有删除、放宽或跳过。
6. `pnpm run typecheck`：通过。
7. `pnpm run build -BasicValidation`：**通过，退出码0**。日志确认core selftests按请求跳过；Vite生产构建成功、checkpoint发布完成，`dist/index.html`引用新的 `assets/index-Ckbko7pd.js`。仅有构建包体大小提示。

未消除的失败：

- 六车 `H-landing: no safety/recovery/rejection`：修改前已有36–56次腾空支撑拒绝，最终也存在。真实腾空时旧“零查询拒绝”断言不成立；保留原断言与非零退出码。实际落地均为每轮一次离地/一次落地，无安全恢复或机械止挡冲量，恢复均小于2 s。此项不能报告为整套垂向测试全绿。
- EV V2：`front ABS cancels front regen`，修改前、后均失败。保留后续核对，不声称整个EV V2通过。
- Model 3：`W seconds converted to kWh with discharge loss`，修改前、后均失败；此断言后面的该suite检查没有执行。Electrified专项另行验证了含内阻损耗的电气预算和融合。
- ESC/AWD：`fixed AWD split and both-axle speed feedback`，修改前、后均失败。未为使旧固定分配fixture全绿而改变共享动态分配算法。

最终驾驶场景中：未出现NaN/Infinity恢复；无普通小油门/微转向/中等转弯TCS或ESC误介入；轮胎联合抓地预算≤1.001；AWD逐步比例变化不超过既有速率上限；各轮ABS通道释放时相应轴电机继续输出负再生扭矩的记录为零；六车全踏板制动均记录到ABS。分离附着时有预期ABS/ESC介入，不能将其计作误介入。上述场景结果不替代仍失败的独立专项。

## 文件与复现入口

- 六车配置：[Touareg](../src/vehicle/config/roadSUVPhysicsConfig.ts)、[A6L](../src/vehicle/config/executiveSedanPhysicsConfig.ts)、[E300L](../src/vehicle/config/mercedesE300LPhysicsConfig.ts)、[530Li](../src/vehicle/config/bmw530LiPhysicsConfig.ts)、[Model 3](../src/vehicle/config/teslaModel3PhysicsConfig.ts)、[Taycan](../src/vehicle/config/taycan4SPhysicsConfig.ts)。
- [控制预设](../src/vehicle/control/VehicleControlPresets.ts)、[EV必要修复](../src/vehicle/powertrain/ElectricPowertrain.ts)、[交界回归](../src/vehicle/powertrain/ElectrifiedPowertrain.selftest.ts)、[标定版本](../src/vehicle/VehicleCatalog.ts)。
- [复用并扩展的场景脚本](../scripts/run-vehicle-physics-calibration.ts)、[专项收集器](../scripts/run-fleet-calibration-selftests.mjs)。
- [最终场景结果](../artifacts/fleet-calibration/calibration-results.json)、[修改前场景结果](../artifacts/fleet-calibration/baseline.json)、[最终专项结果](../artifacts/fleet-calibration/final-selftests.json)、[修改前专项结果](../artifacts/fleet-calibration/baseline-selftests.json)、[构建日志](../artifacts/fleet-calibration/build.log)。

工作区原有地图、导航、接触/垂向等未提交修改没有回退、提交或纳入本轮改写。

## 建议人工体验

城市5%–20%踏板与低速跟车；530Li和E300L在Normal/Sport的响应与平顺差别；Touareg过减速带及连续转弯的二次车身运动；Model 3极小电门交界与回收停车；Taycan Normal/Sport Plus的精确转向、后两速过渡和Launch。极限细节、手柄初段触感和长期热稳态留给后续实际试玩反馈。
