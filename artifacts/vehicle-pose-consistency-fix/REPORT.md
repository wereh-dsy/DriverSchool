# Vehicle pose consistency

2026-10-20。仅 Phase 1 坐标/姿态兼容修复；未扩展 contact substep/sweep，未修改 penetration solver、车型参数或地图。

## 判断

**本轮证据更接近 B 中的 chassis/attachment pose 问题，不支持 A（wheel renderer 世界/局部坐标写错）或 C。** 物理 wheel center 的行程/attachment 不变量始终正确，实际渲染轮心也始终重合；捕获的是 terrain attitude 阶跃，以及车身模型原点偏移的坐标不一致。

原截图中明显脱轮的程度未在当前源码完整复现，不能据此认定这两项解释了原截图全部异常。截图本身没有对应 physics/render 数值，也无法确认其运行版本。没有仅凭长度 invariant 推断视觉正确。

## 实际运行与测量

浏览器启动当前 Vite 源码，Mountain / `mountain-proving-ground`、Haiteng S1 / `family-sedan`。临时面板设置初始姿态和 140 km/h 初速，此后由真实 DrivingGame 帧循环、120 Hz 物理及 Three.js 渲染推进，空挡直行；不是人工油门/转向驾驶。修复前后每条路径均 600 physics steps。

- **coast**：沿用 steep-climb 附近起点 X=-725.051001、Z=-411.486572、yaw=-1.461627。直行随后越出弯曲道路进入坡肩。
- **bank**：`side-slope` 支路 s=15 m，沿该处切线直行，覆盖 4/3/2/1/0 支撑、侧坡与自然 airborne。
- **tilt stress**：coast 同起点，人为设置 terrain pitch=.72 rad（41.25°）、roll=.68 rad（38.96°）、抬高 1.5 m，再交还物理。此项是明确标注的受控大倾角压力场景，不是自然产生该角度的复现；覆盖 0→1 支撑。

每个 physics step 记录 mask、terrain/chassis pitch-roll、yaw 与角度差。每个实际 render update 完成后，对四轮同时记录 attachment、world axis、length/min/max、physics center、snapshot worldPosition、pivot/tyre mesh local position、实际 parent 和 `tyreMesh.getWorldPosition()`。同步记录 root Euler/order，与当前同一 snapshot 比较。渲染帧数因帧率不同而不同，不把未渲染的中间 fixed step 当成渲染验证。

临时标记：红橙 attachment、绿 physics center、紫 render center、黄连接线。绿色/紫色中心重合；原有道路接触/镜面调试标记仍是其他含义。

## 定位与最小修复

### 1. World/local 与 rotation

没有发现当前 live hierarchy 把 world center 直接写入 child local position：`VehicleVisual.setWheelWorldPositions` 已先更新根矩阵，再执行 `root.worldToLocal`。当前 wheel parent 是 exterior/cached wheel section，其额外变换为 identity，根变换的逆转换有效；轮胎 mesh 原点与 pivot 中心一致。没有额外 double rotation。

物理 attachment 使用 YXZ；render root 也明确使用 YXZ。root pitch/roll 为 `terrain + chassis`，没有叠加 visual pitch；cockpit vibration 只移动座舱。运行中 snapshot worldPosition 与 geometry center 的最大差为 0，root Euler 与 snapshot 姿态差小于 5.6e-17 rad。

### 2. 确认的 body/attachment 坐标不一致

原 `chassisBodyPose` 把 authored `staticBodyOffsetY` 直接加到 **world Y**；物理 mount 按车体局部坐标随 yaw/pitch/roll 旋转。平地看不出来，大倾角时车身模型与 mount 的固定局部关系被破坏：tilt stress 最大偏差 **0.051821 m**，bank 为 **0.025759 m**。

修复将模型原点偏移按相同 YXZ 旋转成世界向量，再叠加 chassis translation。DrivingGame 和 collision body pose 都使用同一 helper；碰撞位置返回 physics datum 前减去该 offset，避免增加新的原点偏差。没有修改 wheel center authority 或任何车型偏移参数。

### 3. 确认的 terrain attitude 阶跃

coast step **144**，实际 **135.38 km/h**、X=-679.447462 / Z=-416.485213，两前轮支撑：terrain roll 单步增加 **4.0793°**。bank step **192**，实际 **133.35 km/h**、X=-829.757611 / Z=-162.697878，支撑组合为 FR/RL/RR：pitch 增加 **2.7560°**、roll 减少 **2.6658°**。匹配轮对修复虽避免轴间污染，仍没有时间连续性限制。

新增 **2 rad/s 的 Phase 1 kinematic rate limit**：每个 fixed step 开始保存 reference attitude，所有悬挂更新、contact 子步、final refresh 与碰撞刷新共用同一预算，不能按查询次数累加。120 Hz 下每轴最大变化约 **0.95493°**。spawn/reset 初始化允许直接设定初始支持姿态。没有新增角速度、力矩或惯量。

支撑信息处理保持：

| grounded | terrain attitude 处理 |
|---|---|
| 4 | 匹配同侧前后对估纵坡、同轴左右对估横坡，两轴限速 |
| 3 | 同上，仅有效配对提供各轴目标，两轴限速 |
| 2 同轴 | 仅更新 roll，pitch 保持 |
| 2 同侧 | 仅更新 pitch，roll 保持 |
| 2 对角 | 两轴保持 |
| 1 | 不从单点拟合，两轴保持 |
| 0 | 不追踪脚下地面，terrain 及原 spring chassis pitch/roll 保持离地姿态 |

这只是现有姿态机制的兼容措施；一轮支撑时仍可能维持很大的已有倾角，不包含 Phase 2 的重力翻转/角平衡恢复。

## 前后实测

| 场景 | max physics↔mesh error：前 → 后 (m) | max body↔mount error：前 → 后 (m) | max 单步 pitch / roll：前 → 后 |
|---|---:|---:|---|
| coast | 3.46e-13 → 3.47e-13 | .010288 → 1.28e-13 | .672° / 4.079° → .672° / .955° |
| bank | 3.62e-13 → 4.02e-13 | .025759 → 1.31e-13 | 2.756° / 2.666° → .955° / .955° |
| tilt stress | 3.39e-13 → 3.15e-13 | .051821 → 1.28e-13 | 0° / 0° → 0° / 0° |

所有窗口的 `abs(distance(center,attachment)-length)` 最大约 **5e-14 m**。修复后最大 physics↔mesh error **4.02e-13 m**；观察到大 pitch/roll、partial airborne、四轮 airborne 时，标记与轮胎中心仍重合。

逐步/逐渲染帧数据为本目录 `before-*.json` / `after-*.json`，汇总见 [comparison.json](comparison.json)。截图：[侧坡 airborne](after-bank.png)、[大倾角压力场景](after-tilt.png)。

## Targeted 验证

- VerticalDynamics：**94 assertions，通过**，净增 2。覆盖 0/1/2（同轴/同侧/对角）/3/4 mask、多次查询共用限速预算，以及大 pitch/roll 下的 attachment/travel 与 airborne 不追地。
- 新增独立 `runVehiclePoseConsistencySelfTest`：**2 assertions，通过**；只执行该入口，没有运行整个视觉尺寸 suite。实际 VehicleVisual 的普通/缓存两条构建路径，验证模型原点 YXZ 变换与轮心 local/world roundtrip。最大 render error=6.2e-15 m，mount error=4.1e-15 m。
- WheelContact：**3426 assertions，通过**。
- `pnpm run typecheck`：**退出码 0**。

初始化、respawn、vehicle switch 的代码都经 contacts.synchronize 后进入同一个 updateVehicleVisual / setWheelWorldPositions 路径；没有 grounded/airborne/full-bump 分支另算 wheel Y。普通与缓存 constructor 路径已由上面的 targeted 检查覆盖，没有做全车型切换巡检。

原 80/100/120/140 的 35% ramp budget 回归仍通过，correction=0。限速改变姿态建立时序，尖锐 fixture 的瞬时加速度仍很高（140 峰值约 1619 m/s²）；本轮没有为降低它改 contact solver 或调悬挂。驾驶手感仍需用户验证。

## 修改文件

- `src/vehicle/physics/SuspensionSystem.ts`：每 tick terrain continuity budget、airborne 保持原 load-model 姿态。
- `src/vehicle/physics/VehicleDynamics.ts`：开启 tick budget，spawn 初始化清除限速约束；除此之外未改 vertical/contact solver。
- `src/vehicle/physics/WheelPhysicsState.ts`：统一局部模型原点偏移的世界变换。
- `src/game/DrivingGame.ts`：应用同一 body origin vector。
- `src/vehicle/physics/VehicleContactSystem.ts`：collider 同步该原点，转换碰撞返回坐标。
- `src/vehicle/physics/VerticalDynamics.selftest.ts`、`src/vehicle/visual/VehicleVisualDimensions.selftest.ts`：少量 targeted regression。
- 本目录报告、遥测和截图。

VehicleVisual 的轮位置转换未修改。临时 main.ts hook / debug 面板 / markers 已撤除，不保留永久 UI。未跑完整 core、map/editor validation、全车型测试或完整 build，未更新 dist。
