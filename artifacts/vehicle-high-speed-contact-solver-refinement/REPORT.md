# Phase 1 高速坡脚接触求解

2026-10-20。使用现有默认车型、120 Hz、平地 → 35% 坡面 fixture；每档初速运行 48 步（0.4 s）。没有寻找 Mountain 原始坡口、修改地图或进入 Phase 2。

## 方案与原因

采用 **自适应 contact-only 子步 + speculative full-bump 速度约束**。原实现先在旧接触位置积分 heave，再横向推进；最终接触查询发现行程已经压到底后，主要由位置安全修正抬车。仅提高弹簧力不能解决这段检测延迟。

现在传动、轮胎及平面运动仍各执行一次，之后沿本步实际起止 X/Z/yaw 插值，仅重算 contact、悬挂支撑及 heave：

1. 端点查询测量轮下高度变化和按当前竖直速度预测的 full-bump 越界。
2. 每段允许变化取 `max(0.01 m, suspensionTravel × 0.25)`，需要时分成 2～4 段，否则 1 段；不是按速度固定升频。
3. 每段只按自身 `dt/count` 积分 spring/damper/bump stop、aero 和 gravity。
4. 用最短悬挂长度下的法向净空求端点不穿透所需的单向速度下界。若自由积分将越过机械限位，施加无回弹的 heave 接触冲量，然后通过 `Y += velocity × substepDt` 积分。四轮约束作用于同一个 heave 自由度，取有效速度下界，不叠加四次冲量。
5. 最终几何与渲染仍共用 attachment + axis × bounded length；保留原 position safety 处理实际残余，未新增“大 correction cap”。

这是有限端点采样与预期接触约束，没有实现精确 TOI 或完整 CCD。匹配轮对的 terrain attitude 修复保留。无场景查询器的直接 `stepFixed(wheelContacts)` 调用保持既有离散接口；实际游戏通过 VehicleContactSystem 使用新路径。

## 开销与接地规则

复用两个轮面查询缓冲区与查询 pose。普通平路仍为一次四轮查询、一次 heave 积分，另有固定四轮净空检查；没有额外地图查询或固定 4x。高风险步骤最多四次 heave 积分，及一次端点探测加最多四次路径查询。

速度约束只阻止本时间段即将越过 full bump 的闭合运动，不下拉车辆、不指定静态车高、不强制接地。已分离且远离机械限位的车轮不受冲量；drop-away 回归验证零路面力与真实重力。没有修改车型参数、悬挂调校、横向模型、驾驶辅助或传动。

## 四档对比

下表为各窗口最大值，格式“修复前 → 修复后”。长度单位 m，速度 m/s，加速度 m/s²。surface ΔY 是逐轮相邻接触采样点高度变化，包含几何姿态引起的采样点偏移，可能略高于简单 `forwardDisplacement × 0.35`。

| 初速 km/h | max surface ΔY | max chassis ΔY | max position correction | max upward velocity | max upward acceleration |
|---|---:|---:|---:|---:|---:|
| 80 | .06420 → .06403 | .06411 → .07014 | .05904 → 0 | 2.917 → 8.418 | 29.51 → 331.58 |
| 100 | .08020 → .08047 | .08039 → .08612 | .07441 → 0 | 3.167 → 10.336 | 25.94 → 531.72 |
| 120 | .09654 → .09711 | .09680 → .10366 | .09241 → 0 | 3.163 → 12.440 | 23.78 → 685.68 |
| 140 | .11311 → .11499 | .11361 → .11918 | .11077 → 0 | 2.414 → 14.302 | 27.62 → 773.35 |

| 初速 km/h | max full-bump penetration，safety 前：前 → 后 (m) | 累计 correction 占向上 ΔY：前 → 后 | 修复后累计速度积分运动 (m) | 最大 contact 子步数 |
|---|---:|---:|---:|---:|
| 80 | .05573 → 0 | 80.07% → 0% | 2.59922 | 2 |
| 100 | .07024 → 0 | 82.46% → 0% | 3.36505 | 3 |
| 120 | .08723 → 0 | 86.09% → 0% | 4.15335 | 3 |
| 140 | .10455 → 0 | 90.40% → 0% | 4.92724 | 4 |

逐步指标为 `abs(correction) / max(abs(ΔY), 1e-9)`；事件累计比例采用 `sum(abs(correction)) / sum(max(ΔY,0))`。140 修复前累计 correction=4.46520 m、速度积分运动=0.47404 m；修复后分别为 0 与 4.92724 m。主要 Y 响应已经转为速度积分。

140 修复后 step 2：前进 .32396 m，surface ΔY=.10595 m，竖直速度 .12153 → 6.56607 m/s，整步 Y 增加 .03092 m，correction=0；该步 spring/damper/bump stop 支撑冲量 465.14 N·s，机械限位接触冲量 8709.62 N·s。后续获得更高向上速度，峰值 14.302 m/s；不再是 Y 增加约 .11 m 而速度几乎不变。

修复后最大悬挂支撑力约 61.6/67.1/66.9/69.0 kN，最大四轮 bump stop 力和约 19.0/17.1/19.0/17.6 kN。预测子步端点（尚未应用冲量/积分）仍可看到约 .025～.032 m 的 full-bump 越界，这是速度约束输入，不是发布状态中的残余穿透。最终 safety 前/发布几何残余在浮点误差范围，本 fixture 没有调用出非零位置修正；其他不连续或外部 pose 修正仍保留原 safety。

尖锐 35% 坡脚的接触冲量产生很高瞬时加速度（140 为约 773 m/s²），其来源明确且纳入速度平衡；本轮没有把冲坡调成柔和响应，也没有做主观驾驶手感验证。0.4 s 上坡窗口没有四轮全部离地，不要求保持接地；独立 drop-away/landing 回归实际覆盖 airborne。

## 最小验证

- VerticalDynamics targeted：**92 assertions，通过**（原 89，净增 3）。四档检查长度/attachment、有限值、最终不穿透、airborne 零 Fz/Fx/Fy；correction 小于每步坡面上升的 15%、累计积分运动的 10%；检查各子步累计时长恰为 dt、力与冲量解释 ΔV、速度积分解释 ΔY。
- 新场景适配器回归：平路查询仅四次 surface sample、heave 仅一次；drop-away 自由落体、车轮保持连接、零路面力，然后着地并收敛。
- WheelContact targeted：**3426 assertions，通过**。
- `pnpm run typecheck`：**退出码 0**。
- 未运行完整 core、地图/editor、全车型 validation 或完整 build；dist 未更新。

逐步数据：[before.json](before.json)、[after.json](after.json)。每步记录位移、地面/车身高度差、前后速度、加速度、支撑与 bump 力、侵入、correction 及占比、最终 grounded/full-bump 轮数；after 另记录预测侵入和支撑/接触冲量。力为子步内峰值，冲量按各自子步时长累计，SI 单位。另在发布后的实际 wheel center 重新查询 fixture 表面核对几何，四档最大法向侵入均约 5.6e-16 m，避免只检查缓存平面造成假通过。

## 本轮修改文件

- `src/vehicle/physics/VehicleDynamics.ts`：场景接触局部求解、单向机械限位冲量、统一最终几何发布。
- `src/vehicle/physics/VehicleContactSystem.ts`：提供可复用路径采样，交换查询缓冲区，保留 surface reference height 和碰撞刷新。
- `src/vehicle/physics/VerticalDynamics.selftest.ts`：四档 fixture、correction budget、积分/冲量平衡、场景平路与 airborne/landing 回归。
- 本目录报告及前后逐步数据。

`SuspensionSystem.ts` 本轮未修改，上一轮的坡度拟合修复原样保留。没有修改 WheelContact、DrivingGame、地图、配置或 Phase 2。实际驾驶验证由用户后续进行。
