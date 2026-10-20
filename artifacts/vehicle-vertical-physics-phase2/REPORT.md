# Vehicle Vertical Physics Phase 2

2026-10-20。共享 heave/pitch/roll 已切换为四轮反力驱动；保留现有平面、yaw、传动和驾驶辅助模型。没有修改车型标定、地图或引入物理库。用户最终驾驶评价尚未进行。

## 状态、力和几何

- `ChassisDynamics` 保存 Y/vY、绝对 pitch/roll、对应角速度；输出加速度、力矩、惯量、接触微步数和异常恢复计数。`chassisY` 现在表示 **世界 COM 高度减 authored COM 高度的 heave datum**，不再直接等于旋转后的模型原点 Y。共享 `chassisBodyPose` 根据 COM 和 YXZ 姿态还原模型原点，接触与渲染使用同一变换。
- pitch 惯量采用 `mass*(length²+height²)/12`，roll 惯量采用 `mass*(width²+height²)/12`。质量使用运行时有效质量；硬点/弹簧预压的 authored 几何基准不随燃油质量移动。没有所有车型共用固定惯量。
- 真实轮胎接触点为 `wheelCenter-normal*radius`。normal reaction 与现有轮胎纵横向力投影到接触平面，经 `r×F` 投影到 YXZ pitch/roll 轴；力的 Y 分量同时参与 heave。yaw 仍由原模型积分，未重复计算。已有前后轴 aero 同样参与 heave/pitch。
- terrain 配对坡度拟合保留为查询/诊断和 spawn/reset 初始姿态参考，正常运行不覆盖动态角度。旧持久化/独立测试快照保留兼容字段；实际生产快照始终声明动态姿态。
- 删除 acceleration→直接四角载荷转移、corner normalization、8% load floor、kinematic dive/squat/roll，以及旧 heave-only full-bump 速度约束。保留质量、COM、轴距轮距、预压、弹簧/阻尼/ARB 参数。旧 antiDive/antiSquat 标量捷径退役，未实现详细连杆几何替代，配置字段保留兼容。
- 每轮 Fz 来自 `spring + damper + progressive bump stop + ARB` 的法向反力，加机械限位冲量按 **整个 outer tick** 平均的反力；非负且受实际接地状态约束。统一供已有轮胎/辅助路径使用，不按 mg 每帧归一化。轮胎力采用既有逐步求值，避免增加代数迭代或重复控制器更新。
- 同轴 ARB 由左右实际压缩差形成等大反向力，参与真实 roll moment。两轮均接地时工作；无 unsprung mass 的当前模型不通过悬空轮制造地面支撑。
- 悬挂阻尼速度来自 chassis 线速度、角速度的 `ω×r` 和表面法向/悬挂轴投影；不再将上个整步压缩差除以 microDt。未增加强角阻尼、普通驾驶角度 clamp 或加速度/力上限。
- 最终 wheel center 始终为 attachment + axis × bounded length；full bump 和 extension 使用同一 authority。离地 Fz/Fx/Fy 和路面支撑为零，角速度持续积分，heave 保留重力。落地由实际先接触的角产生支撑和力矩，不对齐 terrain 或清零角速度。

## 接触稳定性和成本

仅对 contact、悬挂、heave/pitch/roll 自适应 1～4 微步。端点高度变化、预测 full-bump 越界及角运动引起的硬点位移超过 `max(.01m, travel*.25)` 时增加细分；沿本步实际起止 X/Z/yaw 插值查询。平面、传动、转向、轮胎和辅助控制仍各执行一次。普通平路保持 120 Hz 一次求解，另有固定四轮风险/限位检查；不固定 4x，不扫描地图，不分配逐轮临时几何对象。

机械限位采用 heave/pitch/roll 联合质量/Jacobian 的无回弹单向冲量约束（12 次四角投影迭代），随后用更新后的速度积分位置。替代“最先越界轮抬起整个质量”的单自由度响应。最终重新同步几何，position safety 只处理残余；外部大幅 pose 跳变仍保留恢复路径。非有限值或极端速度触发显式计数恢复；普通测试均未触发。

## 1619 m/s² 来源与 ramp 数据

本轮修改前实际捕获的 140 km/h step 2：总 aY **1619.115 m/s²**，其中旧 heave-only 机械限位冲量贡献 **1601.947 m/s²**；其余净弹簧/阻尼/bump/aero/gravity 贡献 **17.168 m/s²**。主因不是弹簧突然变成巨大常数。原 progressive bump 公式连续，保留；不能仅 clamp damper 来解释或消除该冲击。原始分解见 [baseline-ramp.json](baseline-ramp.json)。

同一平地→35% 尖锐坡面、120 Hz、48 步窗口，新模型结果如下。反力峰值包含 **outer-tick 平均机械限位反力**，不是刚性冲量的瞬时峰值。

| 初速 km/h | max aY m/s² | max 四轮反力 N | max vY m/s | 累计速度积分 ΔY m | max position correction m | correction 占比 | 最大微步 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 80 | 418.323 | 319032 | 8.333 | 2.72663 | 0 | 0% | 2 |
| 100 | 760.669 | 556629 | 10.322 | 3.48685 | 0 | 0% | 3 |
| 120 | 906.822 | 669978 | 12.347 | 4.26338 | 0 | 0% | 3 |
| 140 | 922.024 | 686690 | 14.297 | 5.03282 | 0 | 0% | 4 |

140 峰值由本轮实测基线 1619.115 降到 922.024 m/s²。80/100/120 的本轮修改前分解未另采样，不能把历史 revision 当成同一基线；历史四档数据位于 [Phase 1 报告](../vehicle-high-speed-contact-solver-refinement/REPORT.md)，与本轮基线的测试/姿态实现不同。新四档完整逐步数据见 [phase2-ramp.json](phase2-ramp.json)，含力分量、接触状态、时间权重、ΔY 与速度积分核对。

140 km/h 固定细分收敛对照：

| 微步 | 最终 Y m | 最终 vY m/s | 最终 pitch rate rad/s | max aY m/s² | max 平均反力 N |
|---|---:|---:|---:|---:|---:|
| 2 | 5.069504 | 12.939691 | -.035283 | 920.713 | 678304 |
| 4 | 5.025754 | 12.887855 | -.036346 | 754.023 | 563590 |

2→4 的 ΔY 差 .04375 m、ΔvY 差 .05184 m/s、角速度差 .00106 rad/s；峰值反力下降约 17%，没有随细分翻倍。两档 correction 都为零，主要位移均由速度积分解释，没有靠位置抬升/锁平掩盖冲击。

**仍然存在很高的尖锐坡脚机械限位冲击。** 这是有限、具有力/冲量来源且宏观响应收敛的结果，不能描述为柔和或所有高速驾驶问题已解决。当前刚性轮胎、无 unsprung mass 模型不能给出可信的瞬时冲击峰值或完整乘坐舒适性；未用硬限幅掩盖这一限制。

## Targeted 验证与运行时

结果见 [targeted-results.json](targeted-results.json)。仅运行相关入口，没有完整 core、地图/editor、无关视觉或全车型驾驶套件。

| 检查 | 结果 |
|---|---|
| VerticalDynamics | 102 assertions，通过；内含新增 Phase 2 9 项 |
| WheelContact | 3426，通过 |
| SuspensionMechanics | 126，通过 |
| SuspensionKinematics | 36，通过；仅检查既有 13 配置，不是全车型调校 |
| FourWheelPhysics | 既有 FWD/RWD targeted 20888 assertions，通过 |
| physics/render pose consistency | 2，通过；最大误差 5.62e-15 m |
| TypeScript | 通过；最终构建再次检查 |

静止 ΣFz=13793.596 N，收敛到有效 mg；制动 pitch=-.01043 rad，真实前后载荷重新分配；侧向力 roll=.01948 rad，无 ARB 时 .03189 rad。另覆盖相反纵向力 squat、离地角速度保持、单侧/前轴先落地、几何/接触/无 NaN/安全计数与微步收敛。旧依赖人工载荷归一化/kinematic pose 的断言改为物理平衡和共享几何断言，没有删除或跳过失败检查。

实际浏览器 family-sedan/road-course 240 个固定步短测：平地、抬升 .6m 并赋予小角速度、腾空、落地。检测到 airborne 和重新接地，safety=0，最大 mesh/physics 轮心误差 2.85e-14 m。见 [runtime-sanity.json](runtime-sanity.json)。这不是原 Mountain 坡口复现，也不是主观驾驶评价；未随机找坡或持续人工驾驶。

第一人称座椅 mount 使用轻量临界阻尼过滤高频 Y/pitch/roll，保留低频真实姿态、即时 yaw/head；60/120 Hz 收敛检查通过。复用现有调试视图显示分量/角状态，临时浏览器采集按钮和 console hook 已移除。未增加新的 haptics 映射。

## Build

最终仅执行一次 `pnpm run build -BasicValidation`，**退出码 0**。TypeScript 通过，Vite 转换 385 个模块并完成 staged publish；完整 core 按用户要求跳过。确认更新后的 `dist/index.html` 引用 `assets/index-Dz_gSVE-.js` 与 `assets/index-B0ZJqX26.css`，文件均存在。原有 chunk size 提示为非阻塞警告，未修改构建流程或为此重构。

## 本轮修改文件

- 新增 `src/vehicle/physics/ChassisDynamics.ts`、`ChassisDynamics.selftest.ts`。
- `src/vehicle/physics/VehicleDynamics.ts`、`SuspensionSystem.ts`、`WheelPhysicsState.ts`。
- `src/camera/DriverCamera.ts`、`src/game/ContactDebugView.ts`。
- 相关测试：`VerticalDynamics.selftest.ts`、`SuspensionMechanics.selftest.ts`、`SuspensionKinematics.selftest.ts`、`FourWheelPhysics.selftest.ts`、`src/vehicle/visual/VehicleVisualDimensions.selftest.ts`、`SuspensionStance.selftest.ts`。
- 本目录报告及 JSON 结果；最终构建生成 dist。此前已有的其他 workspace 改动保留，不计为本轮实现。未修改 DrivingGame、WheelContact、VehicleContactSystem、车型配置、传动或驾驶辅助实现。

## 明确限制

没有 unsprung mass、wheel-hop、轮胎形变、完整 chassis 3D collision/翻滚碰撞或通用惯性张量/陀螺耦合；yaw/XZ 仍为现有专用模型。没有新增 aero pitch/roll 阻尼或复杂空气角动力学。详细 anti-dive/squat 连杆路由未实现；新模型以轮胎地面力矩和真实弹簧反力响应。ABS/TCS/ESC/AWD 算法未重写，沿用接触/Fz 接口并通过相关 FWD/RWD 回归；没有声称完成所有控制器/车型组合的实车验证。各车型标定和最终驾驶体验由后续完成，不再扩展基础架构。
