# Phase 2 后边界检查

2026-10-20。按限定范围检查 A/B/C，未可靠复现需要修改运行时逻辑的异常。本轮只增加方向回归测试和可重复诊断记录，**未修改 Phase 2、轮胎、接触选层或 transmission 运行时代码**。用户曾观察到的问题仍保留为待复现项，不宣称已修复。

## A：高速过坡轻飘

运行实际 `VehicleDynamics + VehicleContactSystem`，使用两个定点场景；没有随机找原始山地坡口。road-course 调用生产 `DrivingTestTrack.getRoadHeightAt` 和同样的法向差分（省去无关场景渲染），Mountain 使用实际 `MountainProvingGround` sampler/terrain，关闭装饰物。均为默认 family sedan、N 挡滑行，未强制保持初速或修改姿态。

| 场景 | 初速 / 离地速度 km/h | 离地 vY m/s | 最高高于离地点 m | 腾空时长 s | 单轮 max spring / damper / bump N | 单轮、单微步 max 机械限位冲量 N·s |
|---|---:|---:|---:|---:|---:|---:|
| road-course：x=0，z=-150 向 -Z，5 秒，8 米道路坡顶 | 140 / 128.29 | 2.271 | .348 | .233 | 6366.7 / 1686.3 / 5040.0 | 9.382 |
| Mountain：main ridge.start+360，沿山脊前进，4 秒 | 100 / 未离地 | — | — | 0 | 5063.1 / 809.3 / 0 | 0 |

road-course 坡脚至顶端高差 8m、水平过渡 85m，最大纵坡约 14.1%；不是 synthetic 35% 不连续坡脚。Mountain 主路线采用简单航向跟随输入，最大中心线偏离约 2.05m，未将车辆强制投影到路线。两场景 safety counter 均为 0，road-course 已实际重新接地。腾空按 0 轮接地到再次接触的固定步采样统计，分辨率 1/120s；高度使用 COM heave datum 的差值，不是离地间隙。

**结论：两次代表场景未复现明显飞得过高或长时间滞空，因此不增加 tyre vertical compliance，不调整 gravity、质量、travel 或速度/加速度上限。** 这不是对所有道路/车速/车型的否定性证明，也不是主观驾驶评价。上一轮尖锐 35% fixture 的高机械冲击仍是已知限制，本轮未继续扩展。

## B：重叠路面弹飞

选择现有 City `preset-showcase` 的 diamond interchange 同一上下层交叉处，各运行一次 2 秒、80 km/h：

- 上层：`diamond_interchange:northbound-2`，x=3408.125，z=25 向 -Z，明确从 8 米桥面初始化。
- 下层：x=3375，z=0 向 +X，从 0 米道路初始化。
- 上层轮下采样始终为 8m，下层始终为 0m；相邻固定步高度变化为 0，法向均向上。未观察到 A→B→A 层间跳选。
- 单轮峰值 Fz 约 4314.3N；pitch/roll torque 绝对峰值约 127.3N·m，角速度绝对峰值约 .00429rad/s。机械限位冲量、bump force、safety counter 均为 0，没有腾空或剧烈旋转。

首轮上层检查误用了地图默认地面 spawn reference，实际没有在桥面上运行；该无效记录已由明确桥面初始化后的复测覆盖，不作为上层验证证据。

当前 sampler 使用高度邻近筛选（距 reference 超过 1.75m 的候选拒绝）和候选评分，没有向 wheel contact 暴露稳定 road/surface ID。本轮核对实际层高和法向，**未可靠复现错误 surface switching，也没有证明任意重复/损坏路面安全**。因此未增加 support-surface continuity/recovery，未修改采样器或用 force clamp 掩盖异常，停止扩大地图搜索。用户观察到的穿模/重叠发射现象本轮未处理。

## C：R 挡方向反转

审计结果：

- 平面前向始终为 `planarForward(yaw)=(-sin(yaw),0,-cos(yaw))`，右向为 `(cos(yaw),0,-sin(yaw))`。
- `VehicleDynamics` 的 X/Z 平面推进和轮胎 longitudinal speed 使用 yaw、signed speed、侧向速度及 steering；没有使用 fully rotated visual forward。
- `applyContactCorrection` 使用 `speed=-sin(yaw)*velocityX-cos(yaw)*velocityZ` 投影碰撞速度，保留 selector。collision normal 只影响碰撞线速度，不重新定义 drivetrain forward。
- `VehicleContactSystem` 向碰撞系统传递 body-origin 平面点速度；接触后传回线速度并将 yawRate 设为 0，不用 pitch/roll 反转挡位或改写 yaw。

新增 `PlanarDirection.selftest.ts`，**13 个断言通过**：

- yaw=.7，pitch/roll 分别为 0/0、120°/100°、150°/140°，AT 的 D/R 实际输出轴驱动力保持符号。D 投影为 +158.806N，R 为 -142.696N，各姿态一致。
- 为隔离道路/车顶碰撞，驱动力测试在离地状态读取实际 axle drive force；这是自由轮驱动需求，不冒充 airborne road force。向量按经源码审计的 planar basis 映射。
- 给定含侧向分量的碰撞速度后，signedSpeed 始终为 -3m/s；下一次真实 fixed step 的平面前向位移均约 -.025m，验证实际 X/Z 推进没有随着视觉姿态翻号。
- 使用实际 `VehicleCollisionSystem`，120°/100° 姿态扫向单个 building collider：发生碰撞，响应速度为 (x=.03,z=0)，导入后 signedSpeed=0，R 和 yaw 保持。

**未复现用户描述的 R→实际前进现象；targeted 极端姿态下 drivetrain sign 保持正确，因此未修改 transmission。** 不同于“挡位决定当前速度”：撞击/惯性可以使车辆暂时沿与所选挡位相反的方向移动；本轮没有用挡位强制翻转实际速度。

## 验证与修改文件

| 最小检查 | 实际结果 |
|---|---|
| PlanarDirection | 13 assertions，通过 |
| VerticalDynamics（含既有 Phase 2 项） | 102，通过 |
| WheelContact | 3426，通过 |
| SuspensionMechanics | 126，通过 |
| `pnpm run typecheck` | 退出码 0 |

完整结果：[targeted-results.json](targeted-results.json)；A/B 统计：[measurements.json](measurements.json)。逐步数据：[road-course](road-course-crest.json)、[Mountain](mountain-ridge.json)、[上层](interchange-upper.json)、[下层](interchange-lower.json)。这些是执行真实物理/查询路径的 Node 诊断，不是浏览器人工驾驶或截图验证。

本轮文件：

- 新增 `src/vehicle/physics/PlanarDirection.selftest.ts`。
- 本目录 `probe.ts`（定点诊断）、`targeted.ts`（仅上述入口）、报告和 JSON 数据。
- 此前 workspace 的已有改动保留，未归入本轮，也未提交或重置。

重跑诊断：使用项目本地 esbuild 将 `probe.ts` 或 `targeted.ts` bundle 为临时 Node ESM 后执行。`probe.ts --interchange` 只重跑同一互通上下层，复用已有 A 数据；默认运行全部上述定点场景。

## Build 与主动跳过项

**没有运行 build，dist 未更新**：本轮未修改运行时代码，只增加回归测试与报告，按本轮“仅运行时代码修改后最后一次 BasicValidation”的条件停止于 targeted/typecheck。现有可玩 dist 保留上一轮 Phase 2 构建。

没有完整 core/full validation、地图 diagnose、editor、全车型 suite 或反复 build；没有新轮胎顺应性、接触 manifold、force clamp、重力/质量调参、变速箱重写或 Phase 3 架构。没有继续搜索原始神秘坡口、损坏路面或撞楼地点。A/B/C 的原始用户现象都不能据本次有限场景宣称已修复；如以后有明确可重复输入，再针对第一个异常边界处理。
