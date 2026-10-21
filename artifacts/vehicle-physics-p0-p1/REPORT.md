# P0/P1：五车型垂向动力链与脚本标定

已完成每轮一维簧下自由度、五车型标定及指定回归。全部数据来自短脚本和运行时 telemetry；没有使用 computer-use。

## 模型与传力

- road → tyre radial Kelvin–Voigt → hub mass → suspension spring/damper → chassis。每轮保存沿下向悬挂轴的长度、相对速度、相对加速度和质量。
- 簧下质量从整车质量中划分；车身使用剩余簧载质量，整车配置质量不增加。悬挂在轮毂和车身间施加等大反向力，轮胎法向力只进入轮毂，Fz 保持单一来源。
- 轮胎法向力非负、离地/被拒绝支撑时为零；悬挂内部阻尼可以拉伸。径向行程仍为 55 mm，径向压实和 strut bump/droop 分别受限；两者完全压实时保留原 Phase 2 的机械接触保护。
- 对轮毂标量方程做 backward Euler 消元，再直接解固定 3×3 车身系统；最多两次有界接触状态修正。工作数组在构造时分配，不增加每步对象或地图查询，仍由现有 adaptive microstep 调度。
- 静态轮胎自由半径以原有加载半径和静态预压标定；燃油质量变化进入实际载荷，不伪造额外预压。对称工况动量残差最大 6.98e-13 N·s。
- 未修改 WheelSupportContinuity、地图、车重、配置 COM、动力、传动、抓地、转向、辅助系统、悬挂行程或 ARB。未配置簧下质量的其余车型保持原无质量轮胎路径。

## 最终参数

每个前/后值均为单轮或该轴原有配置值。K、ARB、Kt 单位 kN/m；悬挂阻尼和 Ct 单位 N·s/m；簧下质量单位 kg。

| 车型 | μ 前/后 | 弹簧 K 前/后 | 压缩阻尼 前/后 | 回弹阻尼 前/后 | ARB 前/后 | Kt / Ct |
|---|---:|---:|---:|---:|---:|---:|
| BMW 530Li | 44/46 | 38.5/37.5 | 2250/2175 | 3337.5/3262.5 | 14.5/12.5 | 220 / 2400 |
| Audi A6L 45TFSI quattro | 48/46 | 39/35.5 | 2592.5/2380 | 3910/3612.5 | 14.5/11.5 | 240 / 2400 |
| Mercedes E300L | 47/49 | 37.2/35.8 | 2312/2244 | 3468/3383 | 14.8/11.8 | 200 / 2400 |
| Tesla Model 3 RWD | 43/46 | 39/42 | 2380/2465 | 3655/3825 | 10.5/7.5 | 240 / 2400 |
| Porsche Taycan 4S | 55/58 | 52/56 | 2310/2450 | 3500/3710 | 31/27 | 240 / 2400 |

保留车型原有弹簧和 ARB 差异；BMW/Mercedes 保持舒适取向，Audi 阻尼支撑更强，Model 3 较直接，Taycan 依靠原有弹簧/ARB 提供更强车身支撑。初始方案直接增加簧下质量曾使 Mountain 更差，已淘汰。粗筛阻尼倍率、轮胎刚度/阻尼后，围绕候选做有限细化；所有候选结果保存在 sweep/refine JSON 中。

## 自动工况与主要指标

A 静态平路 4 s；B 真实油门 0.65；C 真实制动 0.65；D 15 m/s、step steer 0.16；E 60 km/h、三组 1–4 mm 正弦短波；F 25 mm/1.5 m 单凸起；G 80 m 长、升高 1.2 m 的缓坡；H 整车抬高 0.18 m 后释放。B/C/D 走正常动力、制动、转向路径，E/F/G 仅规定平面速度/路径，垂向状态全部正常积分。每工况 4–8 s，无长时间驾驶。

E 粗糙路：箭头左侧为冻结的上一轮 massless radial 基线；aY 单位 m/s²，角速度单位 rad/s。

| 车型 | RMS aY | peak aY | peak pitchRate | peak rollRate |
|---|---:|---:|---:|---:|
| BMW 530Li | 0.799 → 0.693 | 1.505 → 1.326 | 0.014 → 0.013 | 0.006 → 0.005 |
| Audi A6L 45TFSI quattro | 0.830 → 0.800 | 1.691 → 1.655 | 0.011 → 0.011 | 0.007 → 0.008 |
| Mercedes E300L | 0.665 → 0.617 | 1.289 → 1.188 | 0.012 → 0.012 | 0.006 → 0.005 |
| Tesla Model 3 RWD | 0.979 → 0.945 | 2.106 → 2.007 | 0.008 → 0.007 | 0.010 → 0.008 |
| Porsche Taycan 4S | 0.842 → 0.729 | 1.771 → 1.499 | 0.008 → 0.007 | 0.010 → 0.010 |

五车型 E 工况 full-bump、接触切换、support rejection、机械冲量、recovery、safety 均为 0。每次刷新仍为四次地图查询。

| 车型 | A 最终车高偏差 mm | A 前/后轴 Fz kN | B/C peak pitch ° | D peak roll ° | G 最终 heave m |
|---|---:|---:|---:|---:|---:|
| BMW 530Li | -2.684 | 8.906/8.557 | 0.694/1.428 | 1.163 | 1.197 |
| Audi A6L 45TFSI quattro | -2.909 | 10.315/8.105 | 0.454/1.995 | 1.057 | 1.197 |
| Mercedes E300L | -2.724 | 10.121/9.342 | 0.940/1.642 | 1.411 | 1.197 |
| Tesla Model 3 RWD | -0.000 | 8.484/8.830 | 0.635/1.038 | 1.118 | 1.200 |
| Porsche Taycan 4S | -0.000 | 10.816/11.257 | 0.851/1.230 | 0.708 | 1.200 |

ICE 静态轴荷包含运行时燃油质量。与原基线相比静态车高差均小于 1 mm，静止无持续 wheel-hop。G 的最大 pitch 约 0.023 rad，最终 heave 接近 1.2 m，长坡没有被滤掉。加速减轻前轴载荷、制动增加前轴载荷、转向产生两轴左右载荷转移均由断言检查。

## Wheel-hop 与落地

旧模型没有独立簧下自由度，其 unsprung velocity=0 不能作为 wheel-hop 改善的比较值。以下给出新模型实际响应；settling 使用车身速度/角速度与轮毂速度共同阈值。落地法向冲量为首次触地后 0.3 s 的四轮总法向力积分，包含承重分量。

| 车型 | E 轮毂相对速度 RMS m/s | F 收敛 s | H peak aY 前→后 | H 收敛 s | H 法向冲量 N·s |
|---|---:|---:|---:|---:|---:|
| BMW 530Li | 0.123 | 0.585 | 11.592 → 11.100 | 0.983 | 8316.6 |
| Audi A6L 45TFSI quattro | 0.122 | 0.568 | 10.139 → 10.428 | 0.983 | 8625.9 |
| Mercedes E300L | 0.116 | 0.610 | 12.658 → 11.981 | 1.117 | 8930.2 |
| Tesla Model 3 RWD | 0.123 | 0.560 | 15.554 → 12.596 | 0.892 | 8462.4 |
| Porsche Taycan 4S | 0.120 | 0.627 | 15.763 → 13.900 | 1.517 | 11101.9 |

H 每车均只有四轮各一次离地和一次落地（8 次切换），无 full-bump、机械限位冲量、recovery 或 safety。2/4 microstep 定向落地测试 peak aY 为 15.425/16.690 m/s²，最终高度差 0.103 mm。

## Mountain 与 City

Mountain 同一路段 75 m、60 km/h，排除前 10 m 初始化；每段 468 个测量 tick。

| 路段 | RMS aY 前→后 | peak aY 前→后 | pitchRate 前→后 | rollRate 前→后 |
|---|---:|---:|---:|---:|
| rough | 3.251 → 2.847 | 8.185 → 7.082 | 0.206964 → 0.189391 | 0.010541 → 0.010206 |
| smooth | 0.020 → 0.017 | 0.039 → 0.035 | 0.000417 → 0.000489 | 0.000000 → 0.000000 |

两段 full-bump、grounded/airborne 切换、support rejection、机械冲量、recovery、safety 全为 0。2164 次查询 / 541 次刷新，与基线完全一致。未改变连续 heightfield 或 City layer-switch 规则。

City：修复地图 80/120/140 km/h、原冲突地图受保护 140 km/h、正常匝道 80 km/h 全部完成；各路线 invalid A-B-A、机械冲量、recovery、safety 都为 0。正常匝道可进入且不跳回主线。+0.65 m 坏层夹具共拒绝 32 个样本，机械冲量与 safety 为 0；rejectionReason 与同轮同 tick 合并事件断言通过。

## 验证、文件与边界

- Unsprung targeted：2824 assertions；覆盖五车静态承重、燃油质量、成对力动量守恒、airborne 零 Fz、真实几何径向限位、拒绝层隔离、2/4 microstep、Black Box 字段。
- Calibration harness：130 assertions。WheelContact：3426；VerticalDynamics：107；SuspensionMechanics：126；City：39。
- 新 Black Box 字段：unsprungPosition / unsprungVelocity / unsprungAcceleration / unsprungMass / tyreNormalForce；保留 tyreCompression / tyreCompressionVelocity / effectiveRadius。
- 主要改动：UnsprungWheelDynamics、SuspensionSystem、ChassisDynamics、WheelPhysicsState；配置类型/验证与五车型配置；BlackBoxSchema/VehiclePhysicsBlackBox；calibration、unsprung、Mountain 定向脚本。此前 City/heightfield 修复保留。
- JSON 保存车辆 ID、完整悬挂/轮胎参数、A–H 指标和 baselineMetrics；baseline-configs.json 与 baseline 源码快照保留修复前依据。
- 边界：一维轴向模型使用固定尺寸车身惯量近似；不包含完整 3D 轮组或多连杆。极端轮胎/悬挂同时压实仍交给原机械接触保护，本轮只验证指定短工况。
- 指标并非全部下降：E 的四轮平均 Fz CV 从约 9–11% 增至约 12–16%；Audi 的 rollRate、Mercedes 的 pitchRate、Taycan 的 rollRate 有小幅增加，Audi 落地峰值约 +2.8%。本轮目标中的车身粗糙路 RMS/peak 与接触连续性已通过，Fz 波动与更广工况仍是后续边界。
- Typecheck：通过。唯一一次 pnpm run build -BasicValidation：通过，dist 已发布并检查入口 assets/index-OI2yZCUy.js 包含新字段；按要求跳过 full core/map/editor。Vite 仅保留体积提示，无构建错误。
