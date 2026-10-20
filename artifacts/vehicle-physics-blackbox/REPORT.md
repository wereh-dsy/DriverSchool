# Vehicle Physics Black Box / Incident Recorder

日期：2026-10-21。范围仅为只读事故记录；保留工作区已有的车辆、地图及物理修改。

## 使用与 UI

在设置 → 实验 → Vehicle Physics Black Box / 车辆物理黑匣子中启用，默认 OFF，不持久化开启状态。
正常驾驶时按 **F11**，或点击“保存当前黑匣子”；继续记录 1.5 秒模拟时间，冻结后在下一浏览器任务下载 JSON。
**原有 F9 车道调试及 F10 区域地图功能保留**，F11 加入游戏保留键。

状态为 OFF、ARMED、CAPTURING POST-EVENT、保存中、SAVED；异常失败可见 ERROR。
成功发起下载后自动继续缓存，SAVED 提示保留到下一次触发。自动检测有 5 秒冷却，手动触发不受冷却限制。
导出异常会保留冻结记录并允许按钮重试；采样异常停止记录，不中断物理，可关闭再开启。
切换地图/车辆或重置时建立新上下文；若正在采集事故，先冻结并导出旧记录，incident.interrupted 说明提前结束原因，不混入新地图的帧。

## 架构与环形缓冲

- VehiclePhysicsBlackBox 接收 ContactSystem 已经生成的 snapshot，不调用额外 getSnapshot。
- 每步数据为预分配 SoA：Float64Array 保存 step/time 和绝对世界 XYZ，Float32Array 保存其他连续量，Int32Array 保存标记与 handle。
- 120 Hz；物理帧容量 960。ARMED 保留最近 600 步及当前步；触发步后再记录 180 步，完整事故为 781 帧（5 秒前史 + 触发帧 + 1.5 秒后史）。启动不足 5 秒则输出已有历史。
- 帧存储固定 **633,600 bytes（618.75 KiB）**。独立事件 ring 容量 **1024**，每步事件上限 24；溢出可由 metadata.droppedEvents 发现。
- 字典容量 16,384（含 unknown handle 0），新 ID 仅在首次遇到时登记，溢出计数显式导出。每步不构造 ID 字符串。
- OFF 时不实例化 recorder，接触采样和安全恢复的记录器钩子断开，无采样、事件、自动触发和候选诊断。地图的稳定 surface identity 在初始化时建立，接触缓冲仅借用引用。
- 普通 ARMED 步不创建 frame object/array/string/JSON；对象分配限首次字典登记、稀疏事件、触发及短暂高详细度窗口。
- Recorder 和所有诊断回调只读取物理状态；异常有局部捕获。原有积分、力、接触选择、限位求解、安全修复及 dt 均不改变。

## 每步字段

完整字段顺序在 [BlackBoxSchema.ts](../../src/vehicle/diagnostics/BlackBoxSchema.ts)。

| 数据组 | 字段 |
| --- | --- |
| 位置与运动 | step/time、worldPositionX/Y/Z、velocity XYZ、平面速度幅值、signedSpeed、chassisY、verticalVelocity/Acceleration、yaw/pitch/roll、yaw/pitch/roll rate |
| 底盘 | totalVerticalForce、pitchTorque、rollTorque、groundedMask、microstepCount、safetyInterventions、nonFiniteRecovery |
| 输入与动力 | 最终油门/制动、送入物理的 steering、clutchPedal、selector handle、物理 gear（R=-1/N=0）、ICE engineRPM（EV 为 null）、planarForward X/Z、纵向 drive force（各轮已有 driveForce 投影求和） |
| 四轮几何 | grounded、wheel center XYZ、attachment XYZ、suspension length、compression/velocity、原求解已计算的 requiredLength、penetration、surface height/normal |
| 四轮力和旋转 | spring/damper/bump stop/ARB force、整步 mechanical limit impulse（N·s）、Fz/Fx/Fy、angularVelocity、slipRatio/slipAngle |
| 道路定位 | selected surface/road/segment 的 integer handle、surfaceType handle |

坐标为 +X right、+Y up、-Z forward，SI；yaw/pitch/roll 遵循 YXZ。世界 Y 使用已有绝对 chassis heave datum，不是相对位移。
缺失道路引用使用 0，不根据路面材质捏造 road ID。平面碰撞求解器不提供接触点 Y，导出 null；normal Y 为实际平面法线的 0。

## 稀疏事件与候选道路

记录 support-surface-changed、grounded-transition、full-bump、large-mechanical-impulse、surface-height/normal-jump、contact-recovery、contact-safety-recovery、non-finite recovery、collision、manual/automatic trigger。
接触恢复和安全回退的原始状态在现有修复之前观察，因此已被恢复的异常数值仍有事件证据。

接触 sampler 复用现有选中 SurfaceArea 的稳定 surface/road/segment 引用。没有新增 nearest-road 全图查询，也没有独立导航传感器。
普通采样不保存全部候选。surface switch、高度/法线异常或大机械冲量时，仅对相同接触 x/z、原 referenceHeight 做本地候选重查，不改变地图的持久 support reference。
候选保存 road/surface/segment handle、segmentIndex、height/normal、distance、referenceHeight、score、accepted 与 reason。
shortlist 最多 32 个，确保实际 chosen 候选在表内；candidateCount/truncated 标记截断情况。

触发后 180 步临时高详细度：每步最多 24 个候选查询，保存实际 microstep 的求解后/安全回退前姿态、速度、逐轮 contact/mechanical 数据，以及 constraint Jacobian、gap 和 impulse。
contactSample 与 microstep 序号保留同一步内的顺序。冻结后立即清除高详细度钩子。

## 自动触发

阈值统一位于 [BlackBoxTriggerThresholds.ts](../../src/vehicle/diagnostics/BlackBoxTriggerThresholds.ts)，只用于记录，不参与物理。

| 异常 | 当前阈值 |
| --- | --- |
| non-finite / 安全回退 | 当前步出现即触发；已有累计安全计数不会在首次采样时误触发 |
| 机械限位冲量 | 单轮整步 > 6000 N·s |
| 紧急几何接触恢复 | correction > 0.5 m |
| vertical velocity 跳变 | 单 fixed step > 5 m/s |
| pitch/roll rate 跳变 | 单 fixed step > 2.5 rad/s |
| support height 跳变 | 相邻实际接触采样 > 0.85 m |
| support normal 跳变 | normal dot < 0.6（约 53°） |
| A→B→A | 18 步内返回且高度变化 > 0.2 m；普通平面接缝仍记 switch 事件，不自动触发 |
| 严重碰撞 + 大姿态 | inwardSpeed > 8 m/s，且 abs(pitch/roll) > 0.45 rad |

手动请求锁存到下一个真实 physics frame；自动异常也在同一步 capture 后标定 triggerStep，保证与导出帧对齐。采集中再次手动触发只增加标记，不移动首次触发步。

## 文件与事故位置

文件名：`vehicle-blackbox-YYYYMMDD-HHMMSS.json`，浏览器下载目录。
顶层为 schemaVersion、metadata、incident、dictionaries、frames、events。

metadata 包含 mapId/mapName/mapVersion，当前 City Main 已有 SHA256 内容版本 runtime URL（其他地图为 null），vehicleId/config version 和一次性 config FNV1a 校验值。
buildVersion 使用 package version + 现有五个主要物理模块的 SHA256 前缀；配置另有版本及 hash，内容含义明确，不声称覆盖所有仓库文件。
另含 physicsHz、blackbox settings/thresholds、内存容量、坐标说明和溢出计数。

incident 包含 triggerStep/Time、reason、first/lastStep、实际 pre/post 步数、interrupted、location。
location 单独保存地图、绝对 XYZ、yaw、planarForward、当前及前一次 road/segment、各轮 grounded/support handles、最近一次 surface switch。没有低成本现成 sector 时为 null。

字典 `dictionaries.strings[handle]` 统一解析道路、surface、segment、selector、collider ID/type；0 为未知。
frames 按 oldest → newest 恢复，events 按 step + sequence 排序并裁剪到帧窗口。
非有限数字在最终 JSON 中写为 NaN/Infinity/-Infinity 字符串，缺失 ICE RPM 单独为 null。
freeze 后的 JSON 构造/stringify/Blob/下载均在后续 setTimeout 浏览器任务，不在 fixed step 执行；无 worker、依赖或实时图表。

碰撞事件包含 collider handle/type、接触点及法线、CG velocity before/after、body-origin planar velocity before/after、signedSpeed before/after、姿态、gear/selector、planarForward、drive force 和世界位置，便于区分惯性改变与动力输出方向。

## 性能测量

可复现入口：`pnpm run selftest:blackbox`；原始结果见 [targeted-results.json](targeted-results.json)。
Node v26.12.0 / Windows x64，预热 10,000 步后，100 批 × 1000 步。复用已有 snapshot/contact，模拟当前 contact + 单 microstep query + 最终 capture 的 recorder 调用，不包含物理求解、渲染或 JSON。

| 模式 | 平均 / step | 最大批次均值 / step |
| --- | ---: | ---: |
| OFF（absent recorder branch + 基准循环） | 0.0122 μs | 0.0609 μs |
| ON / ARMED | 2.3200 μs | 4.4811 μs |
| 增量平均 | 2.3078 μs | — |

普通 ARMED 候选诊断调用数为 **0**。帧内存固定为 633,600 bytes，事件容量固定为 1024。
“最大”是批次均值，不是单步峰值；未进行浏览器整车 profiling、GC 追踪、长时间驾驶或驾驶手感调校。CPU 数值受运行环境影响。

## 验证

- `pnpm run selftest:blackbox`：**通过，240 项断言**。覆盖 frame/event ring wrap/order、前后窗口、字典、手动/自动触发、surface switch 与 A→B→A、碰撞、OFF、EV 缺失 ICE 数据、non-finite recovery、export schema/文件名。
- 小集成：现有 VehicleContactSystem 驱动两个相同车辆 190 步，逐步比较完整 snapshot，ARMED/高详细度结果完全一致；注入诊断异常时也保持一致；实际 microstep constraint 数据进入导出。
- 实际小 CityGround 重叠双层道路验证 identity/candidates，确认诊断查询不改变原 support reference。
- `pnpm run typecheck`：**通过**。
- `pnpm run build -BasicValidation`：**通过，exit 0，本轮仅执行一次**；typecheck + Vite production build，已收到 `Checkpoint published`，更新可玩 `dist/index.html`。按用户明确要求未运行完整 core/full validation。
- 发布主资源为 `dist/assets/index-CqL2-fzY.js`；Vite 构建 389 modules、耗时 11.16 秒，仅有超过 500 kB 的 chunk-size 非阻断提示。
- `git diff --check`：通过（存在既有 LF/CRLF 提示，无 whitespace error）。
- [sample-incident.json](sample-incident.json) 为短集成生成的完整导出示例，可直接离线分析。

## 本轮变更文件

新增：

- `src/vehicle/diagnostics/BlackBoxSchema.ts`
- `src/vehicle/diagnostics/BlackBoxTriggerThresholds.ts`
- `src/vehicle/diagnostics/VehiclePhysicsBlackBox.ts`
- `src/vehicle/diagnostics/VehiclePhysicsBlackBox.selftest.ts`
- `scripts/run-vehicle-blackbox-selftests.ts`
- `scripts/run-vehicle-blackbox-selftests.mjs`
- `artifacts/vehicle-physics-blackbox/REPORT.md`
- `artifacts/vehicle-physics-blackbox/targeted-results.json`
- `artifacts/vehicle-physics-blackbox/sample-incident.json`

接入修改：

- `src/vehicle/physics/VehicleContactSystem.ts`：采样、碰撞及诊断钩子生命周期。
- `src/vehicle/physics/VehicleDynamics.ts`：现有恢复之前的只读通知。
- `src/vehicle/physics/ChassisDynamics.ts`：短窗口 microstep 和安全回退观察。
- `src/vehicle/physics/SuspensionSystem.ts`：公开已有 requiredLength 诊断值。
- `src/vehicle/physics/WheelContact.ts`：借用选中 surface identity/referenceHeight。
- `src/world/SurfaceMaterial.ts`、`src/world/DrivingGround.ts`：可选身份及本地诊断契约。
- `src/world/city/CityGround.ts`：稳定身份、按需候选查询与拒绝原因；不改变选面计算。
- `src/game/DrivingGame.ts`：启停、F11、上下文切换、异步导出及状态。
- `src/ui/ControlSettingsPanel.ts`：开关、保存按钮与轻量状态。
- `src/input/KeyboardBindings.ts`：保留 F11。
- `vite.config.ts`：build/version 标识。
- `package.json`：targeted 测试入口。

## 已知边界

非 CityGround 地图若没有原生道路身份，road/segment handle 为 0；仍有绝对位置、地图版本和完整车辆数据，不额外全图查找。
碰撞 Y、sector 等源系统未提供的数据明确为 null。候选/事件/字典有硬上限并报告截断或溢出。
切换地图/车辆/重置会显式提前结束正在采集的后窗；关闭开关会停止并放弃未导出的当前记录。
浏览器下载权限和用户驾驶/视觉体验未做人工验证；SAVED 表示已成功发起浏览器下载，网页无法验证文件最终落盘。
