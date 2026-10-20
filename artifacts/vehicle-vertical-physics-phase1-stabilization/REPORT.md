# Vehicle Vertical Physics Phase 1 Stabilization

日期：2026-10-20。范围仅为车轮／接触几何和最终状态同步；未实现 Phase 2 角动力学，未调整车型悬架参数。

## 根因

- **穿地**：垂直力计算时得到的轮位偏移被用于积分后的 chassisY；penetration correction 后也没有立即统一刷新轮位。随后负载模型又更新 pitch/roll，而最终 contact sync 未重新处理这一姿态下的 full-bump 侵入。接触及安全修正只用世界 Y，遗漏坡面法向半径。
- **轮／车身分离**：旧代码虽限制 compression，却没有用同一车身姿态的固定 attachment 和悬架轴生成轮心。contact sync 单独覆盖 Y，getSnapshot 再按 yaw 覆盖 X/Z；记录中的 strut length 因而不能约束实际轮心到车架的距离。渲染还存在初始化时重新采地贴轮的另一条路径。
- 新的深坑采样还可能先进入 terrain pitch/roll 拟合，再判断是否超出悬架可达范围，使不可达路面影响车架姿态。

以上为代码链路中确认的不变量问题。本轮没有人工驾驶复现，不能声称已实车消除全部特殊场景。

## 唯一几何状态

`SuspensionSystem.refreshVerticalGeometry` 生成 attachment、单位悬架轴、min/rest/max length、实际 length、compression、轮心、采样平面及剩余 penetration。attachment 使用车身 x/z、chassisY、yaw 和现有 pitch/roll，采用与 Three.js 车身相同的 YXZ 旋转。

最终轮心始终为：

```text
wheelCenterWorld = attachmentWorldPosition + suspensionAxis * suspensionLength
```

`VehicleDynamics` 在积分后、最终 contact sync 和碰撞位移后统一刷新并发布；`WheelPhysicsState.worldPosition` 与 `geometry.wheelCenterWorld` 来自同一最终状态。grounded、compression、length 和离地零 Fz/Fx/Fy 同步发布。getSnapshot 不再另算轮位。

`DrivingGame` 的车身和车轮只读取同一 physics snapshot，不再查询路面决定轮胎高度。出生、重置和切车通过 contact adapter 初始化物理状态。现有负载转移及 pitch/roll 响应保留，其内部负载响应不再单独生成轮心。

## 行程、接触及安全修正

- 保留既有 travel/compression 校准：`Lmin = unloadedRestLength - maximumCompression`，`Lmax = unloadedRestLength - minimumCompression`；rest length 记录加载平衡长度。每次刷新都将实际 length 夹紧到 `[Lmin, Lmax]`，没有修改 spring、damping、ride height、radius、travel 或 mass。
- 沿悬架轴解球／采样平面接触：`requiredLength = (normal·(attachment - surfacePoint) - radius) / (-normal·axis)`，使用归一化 surface normal。
- 地面超出最大可达范围：长度保持 Lmax，grounded=false；轮胎随车架悬挂，最终快照的 Fz/Fx/Fy 为零，不追地。
- full bump 后：长度保持 Lmin；只有仍存在球／平面侵入才修正 chassisY。修正量为各轮 `penetration / normal.y` 的最大值，即满足当前约束所需的最小向上位移；修正后立即重算几何。
- 仅在真实 full-bump 侵入时，将向下 verticalVelocity 衰减为原值的 20%，不每帧强制归零，不恢复 ground-following。正常接触仍由 spring/damper/bump stop 和真实 heave 积分处理。
- 几何刷新不重复积分力或推进压缩速度差分历史。先判断可达性，再使用可接地轮拟合地形姿态。

## Surface selection

复用现有 `setSurfaceReferenceHeight` 和地图的高度／层位过滤，不改地图 sampler。运行时参考高度由旧 `groundHeight` 改为真实 chassisY；缓存失效条件也包含 chassisY。采样 X/Z 使用最终物理轮心，而不是另一套仅 yaw 的轮距点。出生时保留既有 spawn 层位参考。

双层轻量 fixture 验证了车身上移后不会继续使用旧下层参考。真实高架、匝道、隧道及道路重叠场景未进行地图诊断或人工驾驶验证；坡顶、坑洼和路缘按同一 reach/full-bump 规则处理，接触仍是轻量球／局部平面近似。

## 最小验证

- `VerticalDynamics.selftest.ts`：通过，87 条（原 78 条，仅新增 9 条）。覆盖固定 attachment/轴向关系、行程上下限、整个落地过程、0/1/2/3/4 轮支撑、坡面法向接触、最终采样刷新及层位参考。
- 现成 `WheelContact.selftest.ts`：通过，3426 条；没有运行其余地图／车型集成 runner。
- `pnpm run typecheck`：通过，exit code 0。
- 中间静态检查发现的渲染 fallback 遗留变量和测试向量参数类型错误已修复。
- 按本轮明确要求，未执行完整 core、项目 validation、production build 或 `pnpm run build`，未更新 dist。

## 修改文件

- `src/vehicle/physics/SuspensionSystem.ts`
- `src/vehicle/physics/VehicleDynamics.ts`
- `src/vehicle/physics/VehicleContactSystem.ts`
- `src/vehicle/physics/WheelContact.ts`
- `src/vehicle/physics/WheelPhysicsState.ts`
- `src/game/DrivingGame.ts`
- `src/vehicle/physics/VerticalDynamics.selftest.ts`
- `artifacts/vehicle-vertical-physics-phase1-stabilization/REPORT.md`
