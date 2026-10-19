# DriverSchool / DriverGame — 车辆竖直物理只读审查

- 审查对象：当前工作区源码（`D:\dsy\game-deepseek-make`），2026-10-19 快照。
- 审查范围：`src/vehicle/physics/`、`src/game/DrivingGame.ts`、`src/vehicle/visual/`、`src/camera/`、`src/world/` 中与车辆竖直姿态、悬挂、轮胎载荷和路面采样相关的代码。
- 审查方式：静态代码阅读、调用链追踪、变量最终消费者追踪。**未运行 build、未运行测试、未修改任何源码、未调参。**
- 本轮唯一新增文件：本报告。

---

## 1. Executive Summary

1. **当前车辆没有独立的 chassis vertical position。** `VehicleDynamics` 的平移状态只有 `centerOfMassX` / `centerOfMassZ`，没有 `y`；对外快照也只有 `x` / `z` / `yaw`，没有 `y`。车身高度是渲染/碰撞层用 `chassisBodyPose()` 从四个路面采样高度算出来的。
2. **当前车辆没有 vertical velocity / vertical acceleration。** 只有纵向 `speed`、侧向 `lateralVelocity`、`yawRate` 和纵向 `acceleration`。代码中不存在 `position.y += velocity.y * dt` 或等价的 Y 轴积分。
3. **gravity 没有作用在 chassis Y 上。** `gravity` 只用于坡度纵向力、静态轴荷、悬挂载荷分配和软地面阻力上限；没有任何“重力 - 悬挂支撑力 = 竖直加速度”的积分。
4. **Wheel contact 不是“检测”，而是“无条件采样”。** `sampleWheelContacts()` 对四个轮位的 x/z 直接调用 `sampleRoadSurface()`，总是返回一个高度；`WheelContact` 没有 `contact/grounded` 布尔量。`syncWheelContacts()` 直接把轮心世界 Y 写成 `contact.height + wheelRadius`。
5. **车身 Y 每帧由路面直接决定。** `chassisBodyPose()` 计算 `y = chassis.groundHeight + staticBodyOffsetY + chassis.rideOffset`；`chassis.groundHeight` 是四个轮位路面高度的平均值。`DrivingGame.updateVehicleVisual()` 每帧把这个 y 直接写入 `vehicleVisual.root.position.y`。
6. **SuspensionSystem 不是“把车身顶起来的悬挂”，而是“四角弹簧/阻尼载荷模型 + 姿态读出器”。** 类注释明确写着 “Four supported corner masses, not a 6-DOF chassis”。弹簧/阻尼力最终变成每个角的 `normalLoad`（轮胎 Fz）和车身 pitch/roll/rideOffset，不进入 chassis 的竖直力积分。
7. **Pitch / roll 不是刚体角动力学。** `terrainPitch/terrainRoll` 由四个路面高度直接拟合；`chassis.pitch/roll` 由四个角的弹簧压缩差直接算出，并夹在约 ±3.7° / ±4.3°。没有 pitch/roll 角速度、角加速度、惯量或力矩积分。
8. **Per-wheel normal load 存在，但它不是“路面接触反力”。** 它由静态轴荷 + 纵向/横向载荷转移 + 气动升/下压力 + 弹簧/阻尼/限位块/防倾杆/几何力组成，再归一化到 supported weight；每个角在归一化前保留 8% 静态载荷下限。最终 Fz 始终为正，不会得到 0。
9. **Road surface 首先是“姿态放置数据源”，其次才是“轮胎载荷/抓地输入”。** 它提供 height/normal/material，不提供接触约束（contact constraint），也不向 chassis 施加法向支撑力。
10. **当前模型最接近 C：水平动力学 + kinematic vertical pose；带有部分 D-like 的四角悬挂载荷计算。** 不是 D（没有 3D 刚体、没有 raycast suspension），也不是 E（没有完整四轮动力学）。

---

## 2. Runtime Call Chain

### 2.1 游戏帧 → 固定步物理

```text
DrivingGame.frame(time)                                  src/game/DrivingGame.ts:598
→ accumulator += frameDt; while (accumulator >= FIXED_STEP)   :632, :652
→ this.contacts.step(FIXED_STEP, controls, this.dynamics)     :705
  → VehicleContactSystem.step(dt, controls, dynamics)         src/vehicle/physics/VehicleContactSystem.ts:63
    → let before = dynamics.getSnapshot()                     :64
    → ground.setSurfaceReferenceHeight(previous groundHeight) :65
    → sampleWheelContacts(ground, before{x,z,yaw}, ...)       :68-70
    → dynamics.syncWheelContacts(contacts)                    :71
      → suspension.synchronizeGroundGeometry(contacts)        src/vehicle/physics/SuspensionSystem.ts:215
      → wheels[id].worldPosition = {
          x: contact.x,
          y: contact.height + wheelRadius,
          z: contact.z
        }                                                     src/vehicle/physics/VehicleDynamics.ts:897-907
    → averageWheelGroundGeometry(contacts)                    :74
    → chassisBodyPose(before.chassis, bodyOffsetY)            :75
    → dynamics.stepFixed(dt, controls, {
          wheelContacts, groundNormal, bounds
        })                                                    :76
      → VehicleDynamics.stepFixed                             src/vehicle/physics/VehicleDynamics.ts:598
      → integrateStep(dt, input, environment)                 :680
        → powertrain / brakes / steering / assists            :692-755
        → calculateTyreContactForces(...)                     :767, :953
          → suspension.update(dt, {
                frontAeroVerticalForce, rearAeroVerticalForce,
                speed, contacts, normal,
                longitudinalAcceleration, lateralAcceleration
              })                                               :963-971
            → SuspensionSystem.update                         src/vehicle/physics/SuspensionSystem.ts:93
            → integrate(...)                                  :100
              → groundGeometry(contacts)                       :141, :221-228
              → targetLoads (static + transfer + aero)         :123-140
              → per-corner spring/damper integration           :143-173
              → corner.load = spring+damper+bumpStop+ARB+geo   :176-182
              → load normalization                             :183-194
              → chassis = { groundHeight, terrainPitch,
                            terrainRoll, rideOffset, pitch,
                            roll, verticalVelocity }           :195-211
          → loads = suspension.wheels[id].normalLoad          :999
          → limits / escLateralLimits from loads              :1002-1006
          → WheelRotationSystem.updateWheel({
                normalLoad: loads[i], ...
              })                                               :1160-1173
          → wheel forces (longitudinal/lateral/brake/rolling) :1186-1226
        → netForce = wheelForce + drag + rolling
                     + gradeForce + externalForce + brake     :781-784
        → acceleration = netForce / mass
                         - lateralVelocity * yawRate          :786-787
        → speed += acceleration * dt                          :789-806
        → integrateLateralDynamics(dt, averageSpeed, ...)     :821, :853-894
          → centerOfMassX/Z += (...) * dt                     :888-891
          → yaw += yawRate * dt                               :892
    → ground.setSurfaceReferenceHeight(after.chassis.groundHeight) :83
    → sampleWheelContacts(ground, after{x,z,yaw}, ...)        :84
    → dynamics.syncWheelContacts(contacts)                    :85
    → chassisBodyPose(after.chassis, bodyOffsetY)             :91
    → collisionSystem.resolve({ previousPose, pose,
                                velocity, dimensions, dt })   :92-101
      → VehicleCollisionSystem.resolve                        src/vehicle/physics/CollisionSystem.ts:322
        → 只做 x/z 平面 OBB 推离；y/pitch/roll 仅用于
          bottom/top 高度过滤                                 :342-349, :412-421
    → if collided: dynamics.applyContactCorrection({
          x, z, velocityX, velocityZ, yawRate: 0
        })                                                    :102-112
    → finalPose / resample / sync                             :113-116
→ this.snapshot = after                                       :705
```

### 2.2 物理快照 → 车身/车轮渲染姿态

```text
DrivingGame.updateVehicleVisual(frameDt)                      src/game/DrivingGame.ts:882
→ cockpitRoot.position = feedback.cockpitOffset (mm)          :883-886
→ chassis = this.snapshot.chassis                             :888
→ roadHeight = contacts === null
    ? ground.getRoadHeightAt(snapshot.x, snapshot.z)
    : chassis.groundHeight                                   :889-890
→ roadPitch = contacts === null
    ? ground.getRoadPitchAt(snapshot.x, snapshot.z, yaw)
    : chassis.terrainPitch                                   :891-895
→ roadRoll = contacts === null ? 0 : chassis.terrainRoll       :898
→ body = chassisBodyPose({
      ...chassis,
      groundHeight: roadHeight,
      terrainPitch: roadPitch,
      terrainRoll: roadRoll
    }, staticBodyOffsetY)                                     :899-900
→ vehicleVisual.setWorldPose(
      snapshot.x, body.y, snapshot.z,
      snapshot.yaw, body.pitch, body.roll
    )                                                         :901-908
→ vehicleVisual.setWheelWorldPositions(
      snapshot.wheels.*.worldPosition
    )                                                         :909-915
```

`chassisBodyPose()` 的定义在 `src/vehicle/physics/WheelPhysicsState.ts:76-81`：

```text
y     = chassis.groundHeight + staticBodyOffsetY + chassis.rideOffset
pitch = chassis.terrainPitch + chassis.pitch
roll  = chassis.terrainRoll  + chassis.roll
```

`setWorldPose()` 直接写入 Three.js root 的位置和 `YXZ` 旋转（`src/vehicle/visual/VehicleVisual.ts:201-219`）。没有 lerp、没有平滑、没有独立视觉弹簧。

### 2.3 相机

```text
DrivingGame.updatePlayerCamera(frameDt)                       src/game/DrivingGame.ts:524
→ playerMode.update(dt)                                        :525
→ if Driving: driverCamera.update(vehicleVisual.root, dt)      :567-568
  → DriverCamera.update(vehicle, deltaSeconds)                 src/camera/DriverCamera.ts:219
    → head-look smoothing (yaw/pitch)                          :255-260
    → vehicle.getWorldPosition / getWorldQuaternion             :222-228
    → worldPosition = driverEyePosition.applyMatrix4(
          vehicle.matrixWorld)                                 :226-228
    → applyWorldTransform(position, quaternion)                :246, :280-298
```

相机没有固定 world Y、没有只跟随 X/Z、没有对车身 Y 做强 smoothing。它刚性跟随 `vehicleVisual.root`。

### 2.4 测试/诊断路径

- 生产路径只有 `VehicleContactSystem.step()`；`DrivingGame.ts:705` 是唯一调用点（grep `contacts.step` 只命中这一处）。
- 大量 selftest 直接调用 `VehicleDynamics.stepFixed()` 并手工构造 `WheelContactSet`，因此它们可以绕过 `VehicleContactSystem` 的采样/碰撞层，但仍然使用同一套 `VehicleDynamics` + `SuspensionSystem`。
- 所有车型（ICE/EV）共享 `VehicleDynamics<Powertrain>`；`DrivingGame` 在 `:281` 和切车时的 `:1426` 都 `new VehicleDynamics<Powertrain>`，没有第二套竖直物理。车型差异只在 `VehiclePhysicsConfig.suspension` 的弹簧/阻尼/行程/rideHeight 等标定。

---

## 3. Chassis Vertical State

### 3.1 逐项存在性

| 量 | 是否存在真正独立状态 | 证据 | 实际含义 |
| --- | --- | --- | --- |
| chassis vertical position (`y`) | **否** | `VehicleDynamics` 仅有 `centerOfMassX/Z`，`x/z/yaw` getter/setter，见 `VehicleDynamics.ts:282-301`；`VehicleInitialState` 无 `y`（`:92-111`）；`VehicleSnapshot` 无 `y`（`:137-192`） | 车身 Y 由渲染/碰撞层从 `chassis.groundHeight + staticBodyOffsetY + rideOffset` 算出 |
| vertical velocity (`vY`) | **否（真实状态）** | `ChassisPhysicsState.verticalVelocity` 存在（`WheelPhysicsState.ts:72`），但它在 `SuspensionSystem.ts:209` 只是 `(rideOffset - previousRideOffset) / dt` 的有限差分 | 是 `rideOffset` 的导数读数，不是被积分的速度状态；运行时无消费者 |
| vertical acceleration (`aY`) | **否** | `VehicleDynamics.acceleration` 是纵向加速度（`VehicleDynamics.ts:294`, `:786-787`）；没有 `verticalAcceleration` 字段 | 只有悬挂 `corner` 内部的压缩加速度（`SuspensionSystem.ts:162`），不是车身 |
| suspension compression | **是（per corner）** | `CornerState.compression`（`SuspensionSystem.ts:41-50`），初始化 `:87-90`，积分 `:164-169` | 每个角的弹簧压缩量（从自由长度起的弹簧挠度），不是“车轮相对车身的行程状态” |
| suspension velocity | **是（per corner）** | `CornerState.velocity`，积分 `:164`，输出 `compressionVelocity` `:240` | 弹簧压缩速率，只用于阻尼力和读数 |
| per-wheel contact state | **否** | `WheelContact` 无 `contact/grounded`（`WheelContact.ts:14-24`）；`WheelPhysicsState` 无（`WheelPhysicsState.ts:5-59`）；`SuspensionWheelState` 无（`SuspensionSystem.ts:7-19`） | 没有“接地/离地”状态；每个轮子每步都被采样 |
| per-wheel normal load (`Fz`) | **是（计算量）** | `SuspensionWheelState.normalLoad`（`SuspensionSystem.ts:11`），`WheelPhysicsState.normalLoad`（`WheelPhysicsState.ts:19`），赋值 `VehicleDynamics.ts:999`, `:1212` | 四角载荷分配模型的输出，不是路面接触反力；归一化前有 8% 静态载荷下限，最终不会为 0 |

### 3.2 真正的积分状态是什么

`VehicleDynamics` 的平移/旋转状态是：

```text
centerOfMassX, centerOfMassZ     // 平面位置
yaw                              // 绕 Y
speed                            // 车身纵向速度
lateralVelocity                  // 车身侧向速度
yawRate                          // 横摆角速度
```

见 `VehicleDynamics.ts:282-301`。积分只发生在：

```text
speed += acceleration * dt                                   :789-806
centerOfMassX += (-sin(midYaw)*avgSpeed + cos(midYaw)*latVel)*dt   :888-889
centerOfMassZ += (-cos(midYaw)*avgSpeed - sin(midYaw)*latVel)*dt   :890-891
yaw += yawRate * dt                                          :892
```

没有 Y 分量。`this.acceleration` 是 `netForce / mass - lateralVelocity * yawRate`（`:786-787`），其中 `netForce` 是纵向力之和，不含法向力。

### 3.3 gravity 用在哪里

`gravity` 出现在这些地方：

- `gradeForce = -mass * gravity * sin(grade)`，进入**纵向**力（`VehicleDynamics.ts:764-765`）。
- `SuspensionSystem.staticLoad()`：`mass * gravity * axleShare * 0.5`（`SuspensionSystem.ts:252-255`）。
- `SuspensionSystem.integrate()`：`weight = mass * gravity * clamp(normalY, .3, 1)`（`:125`）；`cornerMass = staticLoad / gravity`（`:160`）。
- `tyreReferenceLoad = mass * gravity * .25`（`VehicleDynamics.ts:1002`）。
- 软地面阻力上限 `loads[i] / gravity * velocity / dt * .5`（`VehicleDynamics.ts:1088`）。

没有一处把 `gravity` 作为 chassis 的竖直加速度。也就是说：**重力只参与“载荷分配”和“坡度纵向分力”，不参与“车身掉落/被顶起”的积分。**

### 3.4 车身 Y 到底由谁决定

在 `DrivingGame.updateVehicleVisual()` 中：

```text
body.y = chassis.groundHeight + staticBodyOffsetY + chassis.rideOffset
```

- `chassis.groundHeight` = `SuspensionSystem.groundGeometry()` 对四个 `contact.height` 的平均值（`SuspensionSystem.ts:221-228`）。
- `staticBodyOffsetY` = `suspension.rideHeight - body.groundClearance`（`VehicleVisualConfig.ts:443-449`），是车型静态标定。
- `chassis.rideOffset` = `rideHeightOffset - (frontDisplacement + rearDisplacement) * 0.5`（`SuspensionSystem.ts:200`），是弹簧平均压缩相对静态压缩的偏移 + 空气悬架高度偏移。

所以：

```text
车身 Y = 四个轮位路面高度的平均值
       + 车型静态车身偏移
       + 弹簧平均压缩偏移（含空气悬架高度）
```

路面高度是主项；`rideOffset` 是厘米级的小量；没有“上一帧 Y 速度”被保留。

### 3.5 初始状态也没有 Y

`DrivingGame` 构造 `VehicleDynamics` 时只传 `x`、`z`、`yaw`、`gear`、`engineRunning`、SOC 等（`DrivingGame.ts:281-289`；切车 `:1426-1437`）。`VehicleInitialState` 没有 `y` 字段（`VehicleDynamics.ts:92-111`）。`reset()` 也只设置 `yaw/x/z/speed`（`:375-431`）。因此车辆从生成开始就没有竖直状态可继承。

---

## 4. Wheel Contact

### 4.1 是否存在真正的 contact = true/false

**不存在。** 代码中没有 `grounded`、`isGrounded`、`onGround`、`hasContact`、`contactState` 之类的车辆物理状态。

- `WheelContact` 只有 `x/z/height/normal/surfaceType/material`（`WheelContact.ts:14-24`）。
- `WheelPhysicsState` 只有 `worldPosition/surfaceType/groundNormal/normalLoad/...`，没有接触布尔量（`WheelPhysicsState.ts:5-59`）。
- `SuspensionWheelState` 没有接触布尔量（`SuspensionSystem.ts:7-19`）。

唯一名字像“接触”的 `WheelRotationState.staticContact` 是**近静止制动时的静摩擦约束标志**（`WheelRotationSystem.ts:142-166`），不是车轮接地状态。它只在“车速/轮速接近 0 且制动力足够”时成立，和“轮胎是否离地”无关。

### 4.2 什么条件判定 wheel grounded

没有判定。`sampleWheelContacts()` 对每个轮位：

```text
x = pose.x + localX*cos(yaw) + localZ*sin(yaw)
z = pose.z - localX*sin(yaw) + localZ*cos(yaw)
surface = ground.sampleRoadSurface(x, z)
wheel.height = surface.height
wheel.normal = surface.normal
wheel.surfaceType = surface.surfaceType
...
```

见 `WheelContact.ts:49-82`。没有任何 `if (height > reach)`、`if (distance > maxExtension)`、`if (!hit)` 分支。

### 4.3 轮胎是否可能完全离地

**在当前实现中不可能。** 原因有三层：

1. **采样层**：`sampleRoadSurface()` 对任意 x/z 都返回一个高度。`CityGround` 在没命中道路面时回退到 terrain sampler 或 0（`CityGround.ts:151-166`）；其他 ground 实现同理。不存在“没有地面”的返回值。
2. **同步层**：`VehicleDynamics.syncWheelContacts()` 每步把轮心 Y 写成 `contact.height + wheelRadius`（`VehicleDynamics.ts:897-907`）。轮子被直接放到路面上。
3. **载荷层**：即使某角完全卸载，`SuspensionSystem` 仍把 `corner.load` 下限设为 `staticLoad * 0.08`（`SuspensionSystem.ts:180-181`），轮胎仍有 Fz。

所以没有“离地”这个状态，也没有“离地后”的行为。

### 4.4 suspension 到 max extension 后会发生什么

`SuspensionSystem.travelLimits()`（`:265-272`）：

```text
restCompression = staticLoad / springRate
halfTravel      = max(0.001, suspensionTravel) * 0.5
minimumCompression = max(0, restCompression - halfTravel)
maximumCompression = min((restLength + rideHeightOffset) * 0.94,
                         restCompression + halfTravel)
```

- 没有独立的 `maxExtension` 字段；`minimumCompression` 是压缩量的下限，语义上是“回弹到某一点”，不是“车轮下垂到地面之外”。
- 压缩量被 `clamp` 到 `[minimumCompression, maximumCompression]`，越界时 `corner.velocity = 0`（`:166-169`）。
- 由于轮心 Y 始终等于路面高度 + 半径，压缩量不会因为“车轮掉下去”而减小；它只会因为目标载荷/气动升力/载荷转移而减小。
- 到达下限后，`corner.load` 在归一化前仍被 8% 静态载荷托底，轮胎力不会归零。

### 4.5 road surface 不在 wheel reach 内时会怎样

**没有 “wheel reach” 这个概念。** 代码不会计算“轮心到路面的距离是否超过悬挂最大伸长”。它只做两件事：

- `sampleRoadSurface(x, z)` 在轮位 x/z 上取高度；
- `groundResidual = clamp(heights[id] - groundHeight + wheel.z*forwardSlope - wheel.x*rightSlope, -0.05, 0.05)`（`SuspensionSystem.ts:148`）。

也就是说，即使某个轮位的路面高度与拟合平面相差很大，进入弹簧的残差最多 ±5 cm；但 `chassis.groundHeight`（四轮平均）和 `terrainPitch/terrainRoll`（四轮坡度）仍然会直接反映这个高度差，车身姿态会跳，轮子会被放到那个高度。不会出现“轮子悬空”。

### 4.6 normal force 是否可能为 0

**不可能。** 两处下限：

- `targetLoads[id] = Math.max(this.staticLoad(id) * 0.08, targetLoads[id])`（`SuspensionSystem.ts:139`）。
- `corner.load = Math.max(this.staticLoad(id) * 0.08, ...)`（`:180-181`）。

`staticLoad` 由 `mass * gravity * axleShare * 0.5` 得到（`:252-255`），恒为正。因此每角 Fz 在归一化前 ≥ 8% 静态载荷；归一化后仍为正，不会为 0。

### 4.7 wheel 离地后 longitudinal/lateral tire force 是否归零

没有“离地后”分支。轮胎力由 `WheelRotationSystem` 用 `normalLoad` 计算：

```text
effectiveLoad = load * loadFactor(load, staticNormalLoad)
limit = longitudinalGrip * effectiveLoad * surfaceLongitudinalGrip
lateralLimit = lateralGrip * effectiveLoad * surfaceLateralGrip * ...
```

见 `WheelRotationSystem.ts:126-131`。如果 `normalLoad` 真的为 0，limit 为 0，轮胎力会归零；但当前载荷层永远不会给 0。因此在实际车辆状态中，纵向/横向轮胎力始终有可用预算。

### 4.8 wheel 是否会被强制投影回 road surface

**是，等价于每步强制投影。** 严格说没有名为 `snapToGround` 的函数，但：

- `VehicleContactSystem.step()` 每步 `dynamics.syncWheelContacts(contacts)`（`:71`, `:85`）；
- `syncWheelContacts()` 直接写 `worldPosition.y = contacts[id].height + wheelRadius`（`VehicleDynamics.ts:902`）；
- 渲染 `updateVehicleVisual()` 用 `snapshot.wheels.*.worldPosition` 调 `setWheelWorldPositions()`（`DrivingGame.ts:909-915`），后者把世界点反变换到车身局部（`VehicleVisual.ts:323-329`）。

所以轮心每帧都精确落在“当前轮位 x/z 对应的路面高度 + 半径”上。没有投影容差、没有 snap 距离、没有“太远就不投影”的判断。

### 4.9 ground contact 是否有 hysteresis / snap / tolerance

- **没有接触 hysteresis**，因为没有接触状态。
- **没有 snap 距离/容差**；只有 `groundResidual` 的 ±5 cm 夹取（`SuspensionSystem.ts:148`）和 `SurfaceInteraction` 的 12 ms 材质响应滤波（`SurfaceInteraction.ts:28-41`）。后者只影响 grip/rolling/depth，不影响接触有无。
- `CityGround.sampleRoadSurface()` 有一个**多层级支撑面选择**的 1.75 m 容差：`if (delta > 1.75) continue;`（`CityGround.ts:157`），并用 `referenceHeight` 选择附近支撑面。这是“桥/地下道路/高架”的支撑层选择，不是悬挂 reach。
- `VehicleContactSystem` 每步重采样，并在碰撞后重采样（`:68-73`, `:84-86`, `:113-116`），行为上等价于每步 snap。
- `setSurfaceReferenceHeight()` 用上一帧 `chassis.groundHeight` 作为下一帧支撑层参考（`:65`, `:83`），这是一种“支撑层连续性”机制，不是竖直动力学 hysteresis。

### 4.10 不存在“force grounded = true”的稳定化

全文搜索没有：

```text
if no contact: use nearest surface anyway
if wheel too high: snap wheel to ground
force grounded = true
```

真正导致“总是接地”的不是某个 `if`，而是**数据结构里根本没有接触布尔量**，以及采样函数永远返回高度。

---

## 5. Suspension

### 5.1 每个轮子是否有独立 suspension compression

**有。** `SuspensionSystem.corners` 是 `Record<WheelId, CornerState>`，每个角有独立的 `compression`、`velocity`、`load`、`spring`、`damper`、`bumpStop`、`antiRoll`、`geometryForce`（`SuspensionSystem.ts:41-50`, `:70`）。`integrate()` 对 `WHEEL_IDS` 逐角更新（`:143-173`）。

### 5.2 restLength / maxCompression / maxExtension

- **restLength**：有，`config.suspension.restLength`（`VehiclePhysicsConfig.ts:402-403`），在 `travelLimits()` 里作为最大压缩上限的一部分（`SuspensionSystem.ts:270`），也在 `getSnapshot().restLength` 输出（`:249`）。
- **maxCompression**：有，但是计算出来的 `maximumCompression = min((restLength + rideHeightOffset) * 0.94, restCompression + halfTravel)`（`:270`）。
- **maxExtension**：**没有独立字段**。只有 `minimumCompression = max(0, restCompression - halfTravel)`（`:269`），它是压缩量下限，不是“轮子最大下垂距离”。
- **suspensionTravel**：有，`config.suspension.suspensionTravel`，用于计算 `halfTravel`（`:267`）。

> **注意 `restLength` 的语义在当前代码里并不完全一致。** `VehiclePhysicsConfig.ts:402-403` 的注释写的是“Unloaded spring strut length; compression is measured from this length”，但 `CornerState.compression` 在 `reset()` 中被初始化为 `staticLoad / springRate`（`SuspensionSystem.ts:89`），在 `integrate()` 中也是作为弹簧挠度积分（`:164-170`），并不是 `restLength - currentLength`。`restLength` 实际只在 `travelLimits()` 里作为一个较宽松的上限项（`:270`）和快照输出（`:249`）。因此当前 `restLength`/`compression` 的语义更接近“弹簧自由长度参考 + 弹簧挠度”，而不是严格的“支柱长度”。

### 5.3 是否计算 compression velocity / spring rate / damper rate

- **compression velocity**：有，`corner.velocity`，积分 `corner.velocity += acceleration * safeDt`（`:164`）。
- **spring rate**：有，`springRateFront/Rear`（`VehiclePhysicsConfig.ts:404-405`），`springRate(id)` 取对应轴（`SuspensionSystem.ts:291-293`）。
- **damper rate**：有，压缩/回弹分别配置（`VehiclePhysicsConfig.ts:406-409`），按 `corner.velocity >= 0` 选择（`SuspensionSystem.ts:156-158`），并乘 `dampingMultiplier`（自适应阻尼，`:159`）。
- **bump stop**：有，`bumpStopStiffness` + `bumpStopStartRatio`，`bumpStopForce()` 计算（`:274-281`）。
- **anti-roll**：有，`antiRollStiffnessFront/Rear`，`antiRollForces()` 用左右压缩差计算（`:283-289`）。
- **anti-dive / anti-squat**：有，但只是轴级线性标定，进入 `corner.geometryForce`（`:150-155`），不是连杆求解。

### 5.4 spring/damper 最终产生的是什么

这是关键。逐消费者追踪：

1. **`corner.spring` / `corner.damper` / `corner.bumpStop` / `corner.antiRoll` / `corner.geometryForce` 汇总成 `corner.load`：**

   ```text
   corner.load = max(staticLoad*0.08,
                     spring + damper + bumpStop + antiRoll + geometryForce)
   ```

   见 `SuspensionSystem.ts:180-181`。

2. **`corner.load` 归一化到 supported weight**（`:183-194`），然后作为 `suspension.wheels[id].normalLoad` 输出。

3. **`normalLoad` 在 `VehicleDynamics.calculateTyreContactForces()` 中被取为 `loads`**（`VehicleDynamics.ts:999`），用于：
   - `limits`（纵向抓地上限，`:1003-1004`）；
   - `escLateralLimits`（横向稳定上限，`:1005-1006`）；
   - `driverAssists.updateStability()`（`:1007-1008`）；
   - `rollingMagnitudes`（滚阻，`:1065-1067`）；
   - `softSurfaceResistance()`（软地面阻力，`:1084-1085`）；
   - `WheelRotationSystem.updateWheel({ normalLoad: loads[i], ... })`（`:1160-1173`），进而决定 `longitudinalForce/lateralForce`。

4. **`chassis.pitch/roll/rideOffset`** 由压缩量算出（`:195-209`），再被 `chassisBodyPose()` 用于视觉姿态和碰撞高度包络。

5. **没有第 5 个消费者把 spring/damper 力累加成 chassis 的竖直力。** `VehicleDynamics.netForce` 不包含 `normalLoad`，也不包含 `spring/damper`；它只包含 `wheelForce`（驱动/惯性/侧向 scrub）、drag、rolling、grade、external、brake（`:781-784`）。

因此：

> **Spring/damper 最终产生的是：轮胎 Fz（载荷预算）+ 车身视觉 pitch/roll/rideOffset + 碰撞高度包络。它没有作为“支撑力”进入 chassis 的质量/竖直加速度积分。**

### 5.5 悬挂力是否真正进入车辆质量和加速度积分

- **竖直方向：没有。** 没有 `verticalForce`、没有 `vY`、没有 `aY`。
- **水平方向：间接有。** Fz 通过 `limits` 限制轮胎纵向/横向力，轮胎力进入 `wheelForce`，再进入 `netForce` 和 `acceleration`。所以悬挂载荷会影响“车能产生多大水平力”，但不会“把车身顶起来”。
- **质量：** `effectiveVehicleMass` 用于 `acceleration = netForce / mass`（`:786`）和载荷转移（`SuspensionSystem.ts:130-132`）；`cornerMass = staticLoad/gravity` 用于压缩 ODE（`:160`）。质量参与的是载荷分配和水平加速度，不是竖直加速度。

### 5.6 空气悬架 / 自适应阻尼

- **空气悬架**：`rideHeightTarget`（`SuspensionSystem.ts:63-68`）和 `rideHeightOffset`（`:104-119`）。`rideHeightOffset` 以 `adjustmentRate` 限速变化，并把增量加到所有 `corner.compression`（`:118`）。最终 `rideOffset = rideHeightOffset - averageDisplacement`（`:200`），所以车身会相对轮子升高/降低最多 `air.maximumOffset`（通常约 2 cm 量级；示例测试见 `VehicleExperience.selftest.ts:71-76`，SPORT 约 -0.02 m）。这是**kinematic 高度偏移**，不是竖直动力学。
- **自适应阻尼**：`dampingMultiplier` 按 `adaptive.modeMultipliers[mode]` 以 `responseRate` 平滑（`:101-103`），只改变阻尼力，不改变自由度。

### 5.7 悬挂压缩是否驱动车轮视觉行程

**没有直接驱动。** `WheelPhysicsState` 里有 `suspensionCompression`、`springForce`、`damperForce`（`WheelPhysicsState.ts:37-41`），但 `DrivingGame.updateVehicleVisual()` 没有用它们来摆放车轮；它用 `snapshot.wheels.*.worldPosition`（`DrivingGame.ts:909-915`），而该世界坐标的 Y 是 `contact.height + wheelRadius`。`VehicleVisual.setWheelSuspensionOffsets()` 存在（`VehicleVisual.ts:292-298`），但运行时**没有任何调用者**（grep 只命中定义本身）。

因此视觉上的“悬挂行程”主要来自：

```text
轮心世界 Y 固定为路面 + 半径
车身 root Y/pitch/roll 由 road plane + rideOffset + pitch/roll 决定
setWheelWorldPositions() 把轮心反变换到车身局部
```

也就是说，是“车身相对轮子动”，不是“轮子相对车身按 compression 动”。

### 5.8 稳定化 / clamp 清单（与竖直自由度相关）

| 位置 | 机制 | 作用 | 分类 |
| --- | --- | --- | --- |
| `SuspensionSystem.ts:148` | `groundResidual` clamp ±0.05 m | 大路面高差只有 5 cm 进入弹簧 | 削弱竖直响应 |
| `SuspensionSystem.ts:166-169` | 压缩量 clamp + `velocity=0` | 机械行程限位 | 正常机械/数值稳定 |
| `SuspensionSystem.ts:139` | `targetLoads` 最低 8% 静态 | 防止目标载荷为 0 | 支撑“永不卸载” |
| `SuspensionSystem.ts:180-181` | `corner.load` 最低 8% 静态 | 防止 Fz=0 | 支撑“永不卸载” |
| `SuspensionSystem.ts:183-194` | 载荷归一化到 supported weight | 总 Fz 被钉住 | 支撑“永不卸载” |
| `SuspensionSystem.ts:206-208` | pitch ±0.065 rad、roll ±0.075 rad | 限制视觉姿态 | 视觉/姿态稳定 |
| `SuspensionSystem.ts:120-122` | 加速度 10 Hz 低通 + ±12 m/s² clamp | 载荷转移平滑 | 正常数值稳定 |
| `SuspensionSystem.ts:125` | `normalY` clamp 0.3–1 | 坡度法向投影 | 正常载荷投影 |
| `SuspensionSystem.ts:104-119` | 空气悬架高度限速 | 高度渐变 | 正常作动器限速 |
| `VehicleDynamics.ts:876-880` | 低速 yaw/lateral 指数阻尼 | 平面静止稳定 | 平面数值稳定，不影响 Y |
| `VehicleDynamics.ts:859-884` | `contactSlipRecovery` 0.12 s hold | 碰撞切向速度保持 | 平面碰撞稳定，不影响 Y |
| `SurfaceInteraction.ts:28-41` | 12 ms 材质响应滤波 | 材质过渡 | 只影响 grip/rolling，不影响接触 |
| `CityGround.ts:155-160` | 1.75 m 支撑面参考高度容差 | 多层道路支撑选择 | 不是悬挂 reach |
| `VehicleContactSystem.ts:68-73, 84-86, 113-116` | 每步/碰撞后重采样 + sync | 轮心贴地 | **直接消灭竖直自由度** |
| `DrivingGame.ts:889-908` | 每帧 `body.y = groundHeight + offset + rideOffset` | 车身贴地 | **Primary：直接覆盖 Y** |
| `DrivingGame.ts:748-750` | `latestRoadRoughness` lerp | 音频粗糙度 | 无关 |
| `DriverCamera.ts:255-260` | head-look 旋转平滑 | 头部转动 | 无关（不是车身 Y） |

---

## 6. Tire Load

### 6.1 四轮是否各自有 Fz

**有。** `SuspensionSystem` 为每个 `WheelId` 输出 `normalLoad`（`SuspensionSystem.ts:233-246`），`VehicleDynamics` 把它放进 `wheels[id].normalLoad`（`VehicleDynamics.ts:1212`）。

### 6.2 Fz 是怎么算出来的

在 `SuspensionSystem.integrate()` 中（`SuspensionSystem.ts:123-194`）：

```text
weight = mass * gravity * clamp(avgNormalY, 0.3, 1)                 :123-125

frontLoad = max(0.08 * weight * frontShare,
                weight * frontShare - frontAeroVerticalForce)       :127
rearLoad  = max(0.08 * weight * (1 - frontShare),
                weight * (1 - frontShare) - rearAeroVerticalForce)  :128
supportedWeight = frontLoad + rearLoad                             :129

longitudinalTransfer = mass * aLongFiltered * hCG / wheelBase      :130
frontLatTransfer = mass * frontShare * aLatFiltered * hCG / frontTrack   :131
rearLatTransfer  = mass * (1-frontShare) * aLatFiltered * hCG / rearTrack :132

targetLoads.FL = frontLoad*0.5 - longitudinalTransfer*0.5 + frontLatTransfer
targetLoads.FR = frontLoad*0.5 - longitudinalTransfer*0.5 - frontLatTransfer
targetLoads.RL = rearLoad*0.5  + longitudinalTransfer*0.5 + rearLatTransfer
targetLoads.RR = rearLoad*0.5  + longitudinalTransfer*0.5 - rearLatTransfer
                                                                    :133-138
targetLoads[id] = max(staticLoad[id]*0.08, targetLoads[id])        :139
targetTotal = sum(targetLoads)                                     :140
targetLoad[id] = targetLoads[id] * supportedWeight / targetTotal   :149

groundResidual = clamp(heights[id] - groundHeight
                       + wheel.z*forwardSlope - wheel.x*rightSlope,
                       -0.05, 0.05)                                :148

corner.acceleration = (targetLoad - geometryForce
                       + springRate*groundResidual
                       - springRate*compression
                       - damping*velocity
                       - bumpStop - antiRoll) / cornerMass         :162-163
corner.velocity += acceleration * dt                               :164
corner.compression += velocity * dt                                :165
... clamp compression / zero velocity ...                          :166-169
corner.spring = springRate * compression                           :170
corner.damper = damping * velocity                                 :171
corner.bumpStop = bumpStopForce(...)                               :172

corner.load = max(staticLoad[id]*0.08,
                  spring + damper + bumpStop + antiRoll + geometryForce) :180-181
... normalize total to supportedWeight (or axle targets with aero) ...   :183-194
```

要点：

- **静态轴荷**：`staticLoad = mass * gravity * axleShare * 0.5`（`:252-255`）。
- **纵向/横向载荷转移**：由 filtered `aLong/aLat`、CG 高度、轴距/轮距计算（`:130-132`）。
- **气动升/下压力**：`frontAeroVerticalForce/rearAeroVerticalForce` 从 `VehicleDynamics.calculateTyreContactForces()` 传入（`VehicleDynamics.ts:960-962`, `:963-971`），按前后轴独立扣减（`SuspensionSystem.ts:127-128`, `:184-194`）。
- **弹簧/阻尼/限位块/防倾杆/几何力**：进入 `corner.load`（`:180-181`）。
- **归一化**：总 Fz 被缩放到 `supportedWeight`（`:194`）；有气动时按前后轴目标分别归一化（`:184-194`）。
- **8% 下限（归一化前）**：`targetLoads` 和 `corner.load` 都有（`:139`, `:180-181`）。

> 注意执行顺序：8% 下限在归一化**之前**，随后 `corner.load *= supportedWeight / actualTotal`（`:194`）可能把所有角整体缩放。因此最终 Fz 不保证严格 ≥ 8% 静态，但仍是正数、不会为 0；“永不卸载”的结论不变。

### 6.3 Fz 是否受 road height / suspension compression 影响

**分布受影响，总量不受影响。**

- `groundResidual` 来自四个轮位路面高度与拟合平面的偏差（`:148`），进入弹簧加速度，影响 `compression`，进而影响 `corner.load`。
- `compression` 直接进入 `spring = springRate * compression`（`:170`），影响 `corner.load`。
- 但 `corner.load` 随后归一化到 `supportedWeight`（`:183-194`），所以**总 Fz 始终等于 supported weight**（有气动时按轴分配），不会因为路面高低而整车“变重/变轻”。
- `normalY` 的坡度投影会让 `weight` 降低（`:125`），但这是载荷投影，不是竖直动力学。

### 6.4 Fz → tire force → grip 的完整链路

```text
suspension.wheels[id].normalLoad
→ loads[i]                                         VehicleDynamics.ts:999
→ limits[i] = tires.longitudinalGrip * loads[i]
              * gripModel.loadFactor(loads[i], tyreReferenceLoad)
              * gripLong[i]                        :1003-1004
→ escLateralLimits[i] = tires.lateralGrip * loads[i]
                        * loadFactor(loads[i], ref)
                        * gripLat[i]               :1005-1006
→ WheelRotationSystem.updateWheel({
      normalLoad: loads[i],
      staticNormalLoad: tyreReferenceLoad,
      surfaceLongitudinalGrip: gripLong[i],
      surfaceLateralGrip: gripLat[i],
      ...
  })                                               :1160-1173
→ effectiveLoad = load * loadFactor(load, staticNormalLoad)   WheelRotationSystem.ts:126-127
→ longitudinalLimit = longitudinalGrip * effectiveLoad * surfaceLongitudinalGrip   :128-129
→ lateralLimit = lateralGrip * effectiveLoad * surfaceLateralGrip * availability   :130-131
→ longitudinalForce / lateralForce / combinedScale  :132-231
→ wheel longitudinal/lateral forces → wheelForce / lateral force
→ netForce → acceleration / lateralAcceleration
```

`loadFactor` 在 `TyreGripModel.ts:15-18`，是 0.92–1.08 的弱载荷敏感修正，不是“载荷越大抓地无限大”。

### 6.5 wheel 离地时是否还能得到非零 Fz

- 当前没有“离地”状态，所以问题不成立。
- 即使把 `contacts` 全部移除（`environment.wheelContacts === undefined`），`SuspensionSystem.groundGeometry(undefined)` 仍返回 `heights = 0`（`SuspensionSystem.ts:222`），`corner.load` 仍由静态载荷/转移/弹簧状态计算，并在归一化前保留 8% 下限。因此仍会得到非零 Fz。
- 只有在 `WheelRotationSystem` 收到 `normalLoad = 0` 时，limit 才会是 0；但当前载荷层不会输出 0。

### 6.6 质量

- `effectiveVehicleMass = config.mass + powertrain.variableMassKg`（`VehicleDynamics.ts:250`, `:257-259`）。
- 该质量用于 `acceleration = netForce / mass`（`:786`）、载荷转移（`SuspensionSystem.ts:130-132`）、`tyreReferenceLoad`（`:1002`）。
- 悬挂 `staticLoad` 使用同一个 `config.mass`（`SuspensionSystem` 持有 `runtimeConfig` 引用，构造于 `VehicleDynamics.ts:355`；`synchronizePowertrainMass()` 修改 `runtimeConfig.mass`，见 `:257-259`）。
- 质量不参与任何竖直加速度，因为没有竖直加速度状态。

---

## 7. Pitch / Roll / Heave

### 7.1 分类

| 姿态 | 当前来源 | 分类 |
| --- | --- | --- |
| `terrainPitch` | `atan(forwardSlope)`，`forwardSlope = ((FL+FR)-(RL+RR))*0.5 / wheelBase` | **B. 直接姿态拟合（四轮路面高度）** |
| `terrainRoll` | `atan(rightSlope)`，`rightSlope = ((FR+RR)-(FL+RL))*0.5 / avgTrack` | **B. 直接姿态拟合（四轮路面高度）** |
| `chassis.pitch` | `atan2(rearDisplacement - frontDisplacement, wheelBase)`，clamp ±0.065 | **半动态：由四角弹簧压缩差读出；没有 pitch 角速度/惯量/力矩积分** |
| `chassis.roll` | `atan2(leftDisplacement - rightDisplacement, avgTrack)`，clamp ±0.075 | **半动态：由四角弹簧压缩差读出；没有 roll 角速度/惯量/力矩积分** |
| `rideOffset` | `rideHeightOffset - (frontDisp + rearDisp)*0.5` | **半动态：弹簧平均压缩 + 空气悬架高度偏移；不是独立 heave 状态** |
| `verticalVelocity` | `(rideOffset - previousRideOffset)/dt` | **诊断读数，不是积分状态，运行时无消费者** |
| 刹车点头 / 加速抬头 / 转弯侧倾 | `chassis.pitch/roll` 随载荷转移/压缩变化 | **存在，但属于压缩状态的姿态读出，不是独立动画** |
| 驾驶舱 mm 级抖动 | `feedback.state.cockpitOffset` 加到 `cockpitRoot.position` | **C. 纯视觉** |
| 空气悬架升降 | `rideHeightOffset` / `rideOffset` | **C. 纯运动学高度偏移** |

### 7.2 最终 body pose

`chassisBodyPose()`（`WheelPhysicsState.ts:76-81`）：

```text
finalY     = groundHeight + staticBodyOffsetY + rideOffset
finalPitch = terrainPitch + chassis.pitch
finalRoll  = terrainRoll  + chassis.roll
```

`DrivingGame.updateVehicleVisual()` 把它写入 `VehicleVisual.root`（`DrivingGame.ts:899-908`），后者直接设置 Three.js 的 `position.y` 和 `rotation.x/z`（`VehicleVisual.ts:201-207`）。

### 7.3 刹车点头 / 加速抬头 / 转弯侧倾会不会反过来改变四轮 normal load

**结论：会“同时变化”，但不是“视觉角度反过来产生载荷”。**

准确链路是：

```text
上一帧 netForce / lateralAcceleration
→ SuspensionSystem 的 filtered aLong / aLat
→ targetLoads 中的 longitudinalTransfer / lateralTransfer
→ 四角 compression 变化
→ corner.load 变化（Fz）
→ 同时 displacement 差 → chassis.pitch/roll
```

- **Fz 的直接来源**是 `corner.spring + damper + bumpStop + antiRoll + geometryForce`（`SuspensionSystem.ts:180-181`），以及前面的 `targetLoads` 载荷转移（`:130-139`）。
- **`chassis.pitch/roll` 是压缩差的读出**（`:195-208`），不是 Fz 公式的输入。
- 因此：
  - 刹车时前轴 Fz 增加，是因为 `longitudinalTransfer`（`:130`, `:133-138`）和压缩变化，不是因为“车头视觉上低下去”；
  - 加速时后轴 Fz 增加，同理；
  - 转弯时外侧 Fz 增加，是因为 `front/rearLateralTransfer`（`:131-132`）和压缩变化；
  - 把 `chassis.pitch/roll` 的 clamp 改大/改小，不会直接改变 Fz；把载荷转移去掉，Fz 变化和点头/侧倾会一起消失。
- 由于 `corner.load` 还被归一化到 `supportedWeight`（`:183-194`）并在归一化前保留 8% 下限，姿态变化不会让总 Fz 变化，只会改变四角分配。

一句话：**它们是“同一个四角载荷/压缩模型”的两个输出（Fz 分配 + 车身姿态），不是“视觉姿态反向驱动 Fz”的闭环。**

### 7.4 Heave

- 唯一的“车身上下”量是 `rideOffset`（`SuspensionSystem.ts:200`），它由弹簧平均压缩和空气悬架高度偏移组成。
- `rideOffset` 直接加到 `body.y`（`WheelPhysicsState.ts:78`），所以车身确实会相对路面有小幅上下运动。
- 但它不是独立状态：没有 `heaveVelocity` 被积分，`verticalVelocity` 只是有限差分；没有“车身质量 × 竖直加速度”的方程。
- 在平坦路面稳态，`front/rearDisplacement ≈ 0`，`rideOffset ≈ rideHeightOffset`；普通钢簧车约等于 0，空气悬架车等于设定的高度偏移。因此“竖直自由运动”几乎不存在，只剩路面高度变化和厘米级弹簧压缩变化。

### 7.5 Camera 是否掩盖竖直运动

逐项检查：

| 问题 | 结论 | 证据 |
| --- | --- | --- |
| first-person camera 是否锁定固定 world Y | 否 | `DriverCamera.update()` 用 `vehicle.getWorldPosition()` + `driverEyePosition.applyMatrix4(vehicle.matrixWorld)`（`DriverCamera.ts:222-228`） |
| camera 是否对 chassis Y 做强 smoothing | 否 | 只有 head-look 的 yaw/pitch 平滑（`:255-260`），位置没有任何 lerp/damp |
| camera 是否只跟随 X/Z | 否 | 使用完整 `matrixWorld`，包含 Y 和 pitch/roll |
| camera 是否过滤 suspension/body heave | 否 | 直接继承 `vehicleVisual.root` 的 Y/pitch/roll |
| cabin mesh 和 physics body 是否不同步 | 极小 mm 级差异 | `cockpitRoot.position` 加了 `feedback.state.cockpitOffset`（`DrivingGame.ts:883-886`），相机用的是 `root` 而不是 `cockpitRoot`；这是视觉抖动，不是物理不同步 |
| 渲染是否插值 | 否 | `updateVehicleVisual()` 直接用最近一次固定步的 `snapshot`；没有 render interpolation |

**结论：相机不是“黏地感”的主要原因。** 它不会隐藏竖直运动；如果车身真的有独立 heave，相机会如实继承。当前看到的是“车身跟随路面”，不是“相机把运动过滤掉了”。

---

## 8. Road Surface Coupling

### 8.1 Road/terrain sampling API 实际提供什么

`DrivingGround` 合同（`src/world/DrivingGround.ts:31-67`）提供：

- `sampleRoadSurface(x, z, travelDirection?)` → `RoadSurfaceSample`
- `getRoadHeightAt(x, z)`
- `getRoadPitchAt(x, z, yawRadians)`
- `worldBounds`
- `colliders`（独立的静态碰撞体，不在 `sampleRoadSurface` 里）
- `spawnPose`
- `roadNetwork`、`trafficSignals`、`lapCourse`（导航/计时，不是物理）
- `setSurfaceReferenceHeight?(height)`（多层道路支撑层选择）
- 视觉 streaming/可见性 hooks（不影响逻辑物理）
- `update?`（地图环境动画）

`RoadSurfaceSample`（`src/world/SurfaceMaterial.ts:24-35`）提供：

- `height`
- `gradient`（dh/dx, dh/dz）
- `normal`
- `grade`（沿请求方向的坡度）
- `surfaceType`
- `longitudinalGrip` / `lateralGrip`
- `rollingResistance`
- `roughness`
- `wetness`
- `profile` / `depth`（软地面）
- `gripMultiplier` / `rollingResistanceMultiplier` 兼容别名

**不提供**：contact 布尔量、接触点距离、悬挂 reach、法向支撑力、碰撞查询（碰撞是 `ground.colliders` 独立系统）。

### 8.2 vehicle physics 是 contact query 还是 pose placement

**两者都有，但主导是 pose placement。**

#### A. 用于“载荷/抓地输入”的部分（physics-ish）

- `SuspensionSystem` 的 `groundGeometry()` 用四个 `contact.height` 计算 `groundHeight/forwardSlope/rightSlope`（`SuspensionSystem.ts:221-228`）。
- `groundResidual` 用轮位高度与拟合平面的差，进入弹簧压缩（`:148`）。
- `SuspensionSystem` 用平均 `normal.y` 缩放 `weight`（`:123-125`）。
- `VehicleDynamics.getContactGrade()` 用四个 `normal` 计算纵向坡度，进入 `gradeForce`（`VehicleDynamics.ts:764-765`, `:926-946`）。
- `sampleWheelContacts()` 把 `surface.longitudinalGrip/lateralGrip/rollingResistance/depth/roughness/wetness` 写进 `WheelContact`（`WheelContact.ts:68-79`），后续用于 `SurfaceInteraction`、`gripLong/gripLat`、滚阻、软地面阻力。
- `VehicleDynamics.calculateTyreContactForces()` 用这些材质值计算每轮抓地预算和滚阻（`:991-998`, `:1065-1092`）。

#### B. 用于“车身姿态放置”的部分（pose-authoritative）

- `SuspensionSystem.groundGeometry()` 直接算 `groundHeight/terrainPitch/terrainRoll`：
  - `groundHeight = mean(heights)`
  - `forwardSlope = ((FL+FR)-(RL+RR))*0.5 / wheelBase`
  - `rightSlope = ((FR+RR)-(FL+RL))*0.5 / avgTrack`
  - `terrainPitch = atan(forwardSlope)`, `terrainRoll = atan(rightSlope)`
- `chassisBodyPose()` 用 `groundHeight/terrainPitch/terrainRoll` 直接算最终 body y/pitch/roll（`WheelPhysicsState.ts:76-81`）。
- `DrivingGame.updateVehicleVisual()` 每帧把 `body.y/pitch/roll` 写入 `VehicleVisual.root`（`DrivingGame.ts:889-908`）。
- `VehicleContactSystem` 把 `chassisBodyPose(after.chassis)` 传给 `CollisionSystem.resolve()`，作为碰撞体的高度包络（`VehicleContactSystem.ts:91-101`）；碰撞本身只改 x/z（`CollisionSystem.ts:412-421`）。
- `VehicleContactSystem` 用 `before/after.chassis.groundHeight` 设置多层道路的 `surfaceReferenceHeight`（`:65`, `:83`），形成“上一帧支撑高度 → 下一帧支撑层选择”的反馈。
- `DrivingGame` 的 `lateralPose.y`、`parkingPose.y` 也用 `chassis.groundHeight` / `roadHeight`（`DrivingGame.ts:694`, `:939-942`），供车道辅助/导航/显示使用。

#### 结论

> **Road surface 对轮胎的作用是“提供高度/法向/材质，让悬挂载荷模型算出 Fz，并让轮胎模型算出水平力”；它不是“在轮胎下方施加一个法向接触约束/支撑力”。同时，它又直接决定车身应该放在什么 Y/pitch/roll。**
>
> 因此当前是 **pose placement first, contact/load input second**。不存在“路面把车顶起来”的竖直力闭环。

### 8.3 多层道路 / reference height

`CityGround.sampleRoadSurface()`（`CityGround.ts:151-166`）在多个支撑面中按 `referenceHeight` 选择：

```text
delta = |areaHeight - referenceHeight|
if (delta > 1.75) continue;
score = delta + extension*10 + (pavement ? 0.2 : 0)
```

`VehicleContactSystem` 用上一帧 `chassis.groundHeight` 作为下一帧 `referenceHeight`（`:65`, `:83`），所以车辆会“贴着当前支撑层”走，不会因为桥下/桥上投影相交而跳层。这是**支撑层选择**，不是悬挂 reach，也不是竖直动力学。

### 8.4 没有碰撞/没有法向支撑

- `colliders` 是 `DrivingGround` 的独立字段（`DrivingGround.ts:43`），由 `VehicleCollisionSystem` 处理（`VehicleContactSystem.ts:40`）。
- `CollisionSystem.resolve()` 只做 x/z 平面 OBB 推离（`CollisionSystem.ts:269-273`, `:322-421`）；`y/pitch/roll` 只用于 `bottom/top` 高度过滤（`:342-349`）。
- 没有“地面法向冲量”“悬挂撞击地面”“车身落地”等逻辑。

---

## 9. Ground-Stick Root Cause

### 9.1 Primary causes（最主要根因）

1. **`VehicleDynamics` 根本没有竖直自由度。**
   - 状态只有 `centerOfMassX/Z`、`yaw`、`speed`、`lateralVelocity`、`yawRate`（`VehicleDynamics.ts:282-301`）。
   - 没有 `y`、`vY`、`aY`；`VehicleInitialState` 和 `VehicleSnapshot` 也都没有 `y`（`:92-111`, `:137-192`）。
   - 结果：物理层没有任何“车身可以向上/向下运动”的状态可供积分。

2. **每帧把车身 Y 直接赋值为路面高度 + 静态偏移 + rideOffset。**
   - `chassisBodyPose()`：`y = groundHeight + staticBodyOffsetY + rideOffset`（`WheelPhysicsState.ts:76-81`）。
   - `DrivingGame.updateVehicleVisual()` 每帧调用 `setWorldPose()` 写入 `root.position.y`（`DrivingGame.ts:889-908`）。
   - 结果：路面高度是车身 Y 的**直接输入**，不是通过力/加速度间接影响。

3. **Wheel contact 无条件为真。**
   - `sampleWheelContacts()` 对四个轮位总是采样到一个高度（`WheelContact.ts:49-82`）。
   - `syncWheelContacts()` 直接把轮心 Y 写成 `contact.height + wheelRadius`（`VehicleDynamics.ts:897-907`）。
   - 没有 `contact` 布尔量、没有 reach、没有 raycast、没有“轮子太高/太低”的分支。
   - 结果：轮子永远贴地，车身自然也被“地面高度”锚住。

4. **Suspension 力没有进入 chassis 的竖直力积分。**
   - `SuspensionSystem` 的 spring/damper 最终变成 `corner.load`（Fz）和 `chassis.pitch/roll/rideOffset`（`SuspensionSystem.ts:176-209`）。
   - `VehicleDynamics.netForce` 不包含 `normalLoad` / spring / damper（`VehicleDynamics.ts:781-784`）。
   - 类注释明确说 “Four supported corner masses, not a 6-DOF chassis”（`SuspensionSystem.ts:52-56`）。
   - 结果：悬挂只能“分配载荷/摆姿态”，不能“把车身顶起来或让车身掉下去”。

5. **Fz 有 8% 静态下限 + 总量归一化，轮胎永远不会真正卸载。**
   - `targetLoads` 和 `corner.load` 都有 `staticLoad * 0.08` 下限（`SuspensionSystem.ts:139`, `:180-181`）。
   - 总载荷被归一化到 `supportedWeight`（`:183-194`）。
   - 结果：即使某个轮子理论上应该离地/卸载，它仍然有正 Fz 和抓地力。

6. **`chassis.verticalVelocity` 不是速度状态，只是 `rideOffset` 的有限差分。**
   - `SuspensionSystem.ts:209`：`(rideOffset - previousRideOffset) / safeDt`。
   - 运行时没有消费者（grep 只命中定义、快照和调试显示）。
   - 结果：名字容易让人误以为有竖直速度，但实际没有可积分的 `vY`。

7. **Collision 是纯平面系统，不会产生竖直响应。**
   - `CollisionSystem` 注释和实现都只做 x/z OBB（`CollisionSystem.ts:269-273`, `:322-421`）。
   - `y/pitch/roll` 仅用于高度过滤（`:342-349`）。
   - 结果：即使车辆“飞起来”，碰撞系统也不会把它拉回地面；反过来说，它也不会阻止车辆贴地。

### 9.2 Secondary causes（加剧“贴地感”的机制）

1. **四轮高度平面拟合直接决定 terrain pitch/roll。**
   - `groundGeometry()` 用 `forwardSlope/rightSlope` 算 `terrainPitch/terrainRoll`（`SuspensionSystem.ts:221-228`）。
   - 过 crest/dip 时，车身会立刻跟随拟合平面改变俯仰/侧倾，而不是先保留竖直速度再落地。视觉上就是“车身被路吸住”。

2. **`groundResidual` 被夹在 ±5 cm。**
   - 大高差只有 5 cm 进入弹簧（`SuspensionSystem.ts:148`）；剩余高度差直接体现在 `groundHeight/terrainPitch/terrainRoll` 和轮心 Y 上。悬挂对路面冲击的“吸收”很有限。

3. **压缩行程限位 + bump stop + pitch/roll clamp。**
   - 压缩量 `clamp` 到 `[rest-halfTravel, rest+halfTravel]`，越界 `velocity=0`（`:166-169`）。
   - pitch/roll 夹在 ±0.065/±0.075（`:206-208`）。
   - 这些是正常的机械/数值稳定，但也把唯一可能的“车身晃动”限制在厘米/几度级别。

4. **载荷转移用 10 Hz 低通 + ±12 m/s² clamp。**
   - `SuspensionSystem.ts:120-122`。载荷转移不会产生快速冲击，车身姿态变化更“黏”。

5. **`rideOffset` 是前后平均压缩，稳态趋于 0。**
   - `SuspensionSystem.ts:195-200`。普通钢簧车在平路上 `rideOffset ≈ 0`；空气悬架只是固定高度偏移。没有持续的 heave 激励。

6. **`VehicleContactSystem` 每步重采样/碰撞后重采样。**
   - `:68-73`, `:84-86`, `:113-116`。这等价于每步把轮子“放回”当前路面；即使有瞬时竖直速度，也会被下一帧的 contact 高度覆盖。

7. **多层道路用上一帧 `groundHeight` 选支撑层。**
   - `:65`, `:83` + `CityGround.ts:155-160`。车辆会持续贴着当前支撑面，不会“掉到下一层”。

8. **渲染无插值。**
   - `updateVehicleVisual()` 直接用最近固定步的 `snapshot`（`DrivingGame.ts:882-908`）。路面高度变化是阶跃式写入，不是连续的竖直运动。

### 9.3 Not a cause（看起来相关，但不是根因）

| 模块 | 为什么不是根因 |
| --- | --- |
| **Camera** | 没有固定 world Y、没有 Y smoothing、没有只跟随 X/Z；它刚性跟随 `root`（`DriverCamera.ts:219-248`）。如果车身有 heave，相机会显示；当前看到的是“没有 heave”。 |
| **CollisionSystem** | 纯平面 x/z，没有 floor snap / anti-fall / 竖直冲量（`CollisionSystem.ts:269-273`, `:342-349`, `:412-421`）。 |
| **SurfaceInteraction / weather** | 只影响 grip/rolling/depth/roughness（`SurfaceInteraction.ts:28-56`），不影响 Y 或接触有无。 |
| **Tire load transfer 本身** | 它是 Fz 分配模型，影响水平抓地力，不产生 chassis 竖直力；它也不会把车“按”在地上。 |
| **`chassis.verticalVelocity`** | 只是 `rideOffset` 的导数读数，没有被积分，也没有消费者（`SuspensionSystem.ts:209`）。 |
| **`WheelRotationState.staticContact`** | 是近静止制动的静摩擦约束标志（`WheelRotationSystem.ts:142-166`），不是车轮接地状态。 |
| **`feedback.cockpitOffset`** | 毫米级驾驶舱视觉抖动（`DrivingGame.ts:883-886`，`VehicleFeedbackSystem.ts:269-279`），不参与物理。 |
| **`latestRoadRoughness` lerp** | 只给音频粗糙度（`DrivingGame.ts:744-750`），不影响物理。 |
| **弹簧/阻尼/防倾杆标定本身** | 改这些会改变载荷分配和姿态幅度，但不会创造竖直自由度；即使把弹簧调得很软，车身 Y 仍由 `groundHeight + offset + rideOffset` 决定。 |
| **空气悬架** | 只是 `rideHeightOffset` 的 kinematic 高度偏移（`SuspensionSystem.ts:104-119`, `:200`），最多厘米级，不能产生自由竖直运动。 |
| **`maxSubstep` / 子步进** | 只是数值积分细分（`VehicleDynamics.ts:585-593`, `SuspensionSystem.ts:93-98`），不改变自由度。 |

### 9.4 模型归类

```text
main model = C（水平动力学 + kinematic vertical pose）
with partial D-like suspension load calculation
```

解释：

- **不是 A（纯 kinematic ground-following）**：车辆有真实的水平动力学（纵向/侧向速度、yawRate、轮胎滑移、差速器、制动/驱动扭矩、碰撞）。
- **不是 B（ground-following + visual suspension）**：悬挂不是纯视觉，它确实有每角弹簧/阻尼压缩、载荷转移、Fz、轮胎抓地预算。
- **是 C**：竖直位置/姿态由道路采样 + 运动学姿态直接决定；没有竖直刚体状态。
- **有部分 D-like**：四角弹簧/阻尼/限位块/防倾杆的压缩 ODE 和 Fz 分配，类似于 raycast suspension 的“载荷计算”部分；但没有 raycast、没有 contact 布尔量、没有竖直刚体/悬挂支撑力积分。
- **不是 E**：没有完整四轮动力学/6-DOF/角动量/悬挂几何求解。

`docs/CURRENT_CODE_CONTEXT.md:134` 也明确列出“完整六自由度”尚未实现；代码证据与此一致。

### 9.5 完成标准逐条回答

1. **车辆 Y 到底是谁决定的？**
   - 由 `chassis.groundHeight`（四个轮位路面高度平均）+ `staticBodyOffsetY` + `chassis.rideOffset` 决定；最终在 `chassisBodyPose()` 计算，`DrivingGame.updateVehicleVisual()` 写入渲染 root。不是由 `VehicleDynamics` 的 Y 状态决定。

2. **gravity 是否真正作用于 chassis Y？**
   - 没有。`gravity` 只进入坡度纵向力、静态载荷、载荷分配、软地面阻力上限；没有 `vY` 积分。

3. **wheel 是否真的可能离地？**
   - 当前不可能。没有 contact 布尔量；每个轮位无条件采样路面高度；轮心 Y 被强制设为 `height + wheelRadius`；Fz 在归一化前有 8% 下限。

4. **suspension force 是否真的推动车身？**
   - 不推动“车身竖直运动”。它推动的是 `corner.load`（Fz）和 `chassis.pitch/roll/rideOffset`（视觉/碰撞姿态）。水平方向上，Fz 通过轮胎力间接影响加速度。

5. **pitch / roll 是物理还是视觉？**
   - 混合：
     - `terrainPitch/terrainRoll` 是**道路四轮高度拟合**（pose-authoritative，不是力）；
     - `chassis.pitch/roll` 是**弹簧压缩差的运动学读出**（有半动态来源，但没有角动力学）；
     - 最终 body pitch/roll 是两者相加，属于**视觉/碰撞姿态**，不是刚体角动力学。
   - 刹车点头/加速抬头/侧倾存在，但它们是压缩/载荷转移的结果，不是独立动画，也不会作为角度反过来产生额外 Fz。

6. **tire normal load 是怎么来的？**
   - 静态轴荷 + 纵向/横向载荷转移 + 气动升/下压力 + 弹簧/阻尼/限位块/防倾杆/几何力，再归一化到 supported weight，并在归一化前保留 8% 静态下限。不是路面接触反力。

7. **哪段逻辑导致“车辆黏在地上”？**
   - 主要是：
     1. `VehicleDynamics` 没有 Y 状态/积分；
     2. `sampleWheelContacts()` 无条件返回高度，`syncWheelContacts()` 强制轮心贴地；
     3. `chassisBodyPose()` + `DrivingGame.updateVehicleVisual()` 每帧直接把 body Y 设为 `groundHeight + offset + rideOffset`；
     4. `SuspensionSystem` 的 spring/damper 不进入 chassis 竖直力；
     5. Fz 的 8% 下限（归一化前）+ 总量归一化让轮胎永不卸载。

8. **最小改造应该切在哪个边界？**
   - 切在 `VehicleDynamics` 的“状态边界” + `VehicleContactSystem` 的“接触查询边界” + `SuspensionSystem` 的“力输出边界”：
     - 增加 chassis Y / vY / aY；
     - 把 contact 从“无条件高度”改成“可失败的距离/reach 查询”；
     - 把 spring/damper 输出从“Fz 分配”改成“可累加的竖直力”；
     - 停止 `chassisBodyPose()`/`updateVehicleVisual()` 直接用 `groundHeight` 覆盖 Y。
   - 不需要新刚体库；现有模型可以扩展出 1D heave + per-wheel contact。

---

## 10. Minimum Future Refactor Boundary

> 以下只是架构级边界，不是本轮实现；不写代码、不调参、不引入新依赖。

### 10.1 最低改造路径

1. **State boundary：给 `VehicleDynamics` 增加独立竖直状态。**
   - `chassisY`、`verticalVelocity`、`verticalAcceleration`（至少 1D heave）。
   - 保留现有 `x/z/yaw/speed/lateralVelocity/yawRate` 平面模型；不要重写水平动力学。
   - `VehicleInitialState`/`VehicleSnapshot` 增加 `y`（或明确的 `chassisY`），并让 spawn/reset 设置它。

2. **Contact boundary：把 wheel contact 从“无条件采样”改成“可失败的查询”。**
   - 用轮心世界 Y（由 `chassisY` + 悬挂几何得到）与 `sampleRoadSurface()` 的高度比较，计算 suspension extension/compression。
   - 增加 `contact: boolean`、`distance`/`penetration`、`maxExtension` 语义；当车轮超出最大伸长时 `contact=false`。
   - `syncWheelContacts()` 不应再把 `worldPosition.y` 直接写成 `height + wheelRadius`；它应保留轮心由悬挂几何决定的位置，contact 只提供地面高度/法向/材质。

3. **Suspension boundary：从“载荷分配器”变成“力发生器”。**
   - 每角 spring/damper/bumpStop/ARB 力沿接触法向（或竖直方向）累加，得到 `verticalForce` 和（未来）pitch/roll 力矩。
   - 把 `verticalForce` 与 `gravity` 一起积分 `verticalVelocity`/`chassisY`；`mass` 参与竖直加速度。
   - 保留现有 Fz 作为“轮胎法向载荷”，但它应由 `contact ? max(0, suspensionForce) : 0` 得到，而不是无条件归一化。

4. **Pose boundary：停止用道路高度直接覆盖 body Y。**
   - `chassisBodyPose()` 使用 `chassisY`（动态）+ `staticBodyOffsetY`，不再 `groundHeight + rideOffset`。
   - `DrivingGame.updateVehicleVisual()` 不再每帧把 `body.y` 设为 `roadHeight + ...`；它应使用物理 `chassisY`。
   - `terrainPitch/terrainRoll` 可以继续用于“路面坡度参考”，但不应是唯一的 body pitch/roll 来源；至少要允许悬挂力产生的 pitch/roll 覆盖/叠加。

5. **Tire boundary：允许 Fz = 0。**
   - 去掉（或条件化）`targetLoads` 和 `corner.load` 的 8% 静态下限（归一化前）。
   - 去掉“总量必须等于 supported weight”的强制归一化；让总 Fz 由接触力和竖直加速度自然决定。
   - `WheelRotationSystem` 已经能在 `normalLoad=0` 时把 limit 设为 0（`WheelRotationSystem.ts:126-131`），所以轮胎层不需要大改。

6. **Visual boundary：车轮视觉行程来自悬挂，不是来自 contact-height snap。**
   - 用 `suspensionCompression`/轮心相对车身的位移来摆放 wheel pivot（现有 `setWheelSuspensionOffsets()` 可作为接口，但目前无调用者）。
   - `setWheelWorldPositions()` 可以保留用于“已知物理轮心”的场景，但不应再由 `syncWheelContacts()` 直接写入地面高度。

7. **Collision boundary（可选，后续）。**
   - 保留现有平面 OBB 碰撞处理墙/护栏。
   - 如果要做“落地/托底”，在 `CollisionSystem` 之外增加地面竖直约束；不要把地面法向力硬塞进现有平面碰撞器。

### 10.2 不要做什么

- 不要引入 `cannon`、`ammo`、`rapier`、`bullet` 或新的刚体库；当前 `package.json` 只有 `three`（`package.json:30-37`），没有物理引擎。现有 `VehicleDynamics` + `SuspensionSystem` 可以扩展出 1D heave + per-wheel contact。
- 不要为了“看起来有悬挂”只加一个 visual spring；那不会改变 Fz、不会让轮子离地，也不会解决“黏地感”。
- 不要重写整个水平动力学；当前纵向/侧向/轮胎/差速器/制动链路是独立且可用的。
- 不要一次性做完整 6-DOF；最小边界是“竖直 heave + per-wheel contact + 悬挂力积分”。Pitch/roll 角动力学可以作为第二阶段。
- 不要按车型硬编码；继续通过 `VehiclePhysicsConfig.suspension` 标定。

### 10.3 改造后的验收边界（架构级）

- 车轮可以在 crest/坡顶/路肩处 `contact=false`，Fz=0，轮胎纵向/横向力=0。
- 车身在重力下落到地面时，`chassisY` 有可见的加速/减速，而不是瞬间贴到 `groundHeight`。
- 悬挂压缩在落地/刹车/转弯时真实变化，并且 spring/damper 力进入 `verticalForce`。
- 车身 pitch/roll 至少部分来自悬挂力差/力矩，而不是只来自四轮高度拟合。
- 平面碰撞、轮胎滑移、差速器、动力总成行为保持现状。

---

## Appendix A — Evidence Index

| 主题 | 文件:行 | 说明 |
| --- | --- | --- |
| 平面状态 | `src/vehicle/physics/VehicleDynamics.ts:282-301` | 只有 x/z/yaw/speed/lateral/yawRate |
| 初始状态无 y | `src/vehicle/physics/VehicleDynamics.ts:92-111` | `VehicleInitialState` |
| 快照无 y | `src/vehicle/physics/VehicleDynamics.ts:137-192` | `VehicleSnapshot` |
| 纵向积分 | `src/vehicle/physics/VehicleDynamics.ts:786-806` | `speed += acceleration*dt` |
| 平面位置积分 | `src/vehicle/physics/VehicleDynamics.ts:853-894` | x/z/yaw only |
| 悬挂更新调用 | `src/vehicle/physics/VehicleDynamics.ts:959-971` | `suspension.update(...)` |
| Fz 取用 | `src/vehicle/physics/VehicleDynamics.ts:999` | `loads = suspension.wheels[id].normalLoad` |
| 轮胎载荷输入 | `src/vehicle/physics/VehicleDynamics.ts:1160-1173` | `updateWheel({normalLoad})` |
| 轮心贴地 | `src/vehicle/physics/VehicleDynamics.ts:897-907` | `y = contact.height + wheelRadius` |
| 轮位 x/z 同步 | `src/vehicle/physics/VehicleDynamics.ts:909-923` | 保留 Y，只改 x/z |
| 坡度力 | `src/vehicle/physics/VehicleDynamics.ts:764-765`, `:926-946` | 纵向 only |
| 悬挂类注释 | `src/vehicle/physics/SuspensionSystem.ts:52-56` | “not a 6-DOF chassis” |
| 四角压缩积分 | `src/vehicle/physics/SuspensionSystem.ts:143-173` | spring/damper/bump/ARB |
| 载荷转移 | `src/vehicle/physics/SuspensionSystem.ts:123-140` | static + transfer + aero |
| groundResidual clamp | `src/vehicle/physics/SuspensionSystem.ts:148` | ±0.05 m |
| 压缩限位 | `src/vehicle/physics/SuspensionSystem.ts:166-169` | clamp + velocity=0 |
| Fz 下限/归一化 | `src/vehicle/physics/SuspensionSystem.ts:180-194` | 8% static + weight normalization |
| 四轮平面拟合 | `src/vehicle/physics/SuspensionSystem.ts:221-228` | mean height + slopes |
| pitch/roll/rideOffset | `src/vehicle/physics/SuspensionSystem.ts:195-211` | kinematic readout |
| verticalVelocity | `src/vehicle/physics/SuspensionSystem.ts:209` | finite difference |
| 接触采样 | `src/vehicle/physics/WheelContact.ts:49-82` | unconditional height |
| contact 字段缺失 | `src/vehicle/physics/WheelContact.ts:14-24` | no grounded bool |
| 接触适配器 | `src/vehicle/physics/VehicleContactSystem.ts:63-121` | sample → step → resample |
| 碰撞平面 | `src/vehicle/physics/CollisionSystem.ts:269-273`, `:342-349`, `:412-421` | x/z only |
| 车身姿态公式 | `src/vehicle/physics/WheelPhysicsState.ts:76-81` | y = groundHeight + offset + rideOffset |
| 渲染姿态 | `src/game/DrivingGame.ts:882-925` | direct root position/rotation |
| 相机 | `src/camera/DriverCamera.ts:219-260` | rigid follow, head smoothing only |
| 视觉车轮 | `src/vehicle/visual/VehicleVisual.ts:305-329` | world→local wheel pivot |
| 未使用的悬挂视觉接口 | `src/vehicle/visual/VehicleVisual.ts:292-298` | `setWheelSuspensionOffsets` no callers |
| 静态车身偏移 | `src/vehicle/visual/VehicleVisualConfig.ts:443-454` | rideHeight - groundClearance |
| 路面 API | `src/world/DrivingGround.ts:31-67` | sample/height/pitch/colliders |
| 路面字段 | `src/world/SurfaceMaterial.ts:24-35` | height/normal/grip/material |
| 多层支撑 | `src/world/city/CityGround.ts:151-166` | 1.75 m reference tolerance |
| 仅 three 依赖 | `package.json:30-37` | no physics engine |
| 6-DOF 未实现 | `docs/CURRENT_CODE_CONTEXT.md:134` | project-level statement |

---

## Appendix B — Search Checklist / “No Such Code”

本轮全文检查（`src/vehicle/**`, `src/game/**`, `src/world/**`, `src/camera/**`）未发现：

- `vehicle.position.y =` / `chassis.position.y =` / `body.position.y =` / `transform.y =` 作为物理状态的赋值（除了视觉 root 和 UI 元素）；
- `rideHeight + groundHeight` / `roadHeight + surfaceHeight` 形式的“物理 Y 目标”；
- `snapToGround` / `alignToGround` / `followSurface` / `projectToRoad` 等函数；
- `if (!contact)` / `grounded = false` / `airborne` 的车辆物理分支；
- `position.y += velocity.y * dt` 或任何 Y 轴积分；
- `verticalForce` / `verticalAcceleration` / `heaveVelocity` 等 chassis 竖直状态；
- raycast suspension / wheel ray / suspension ray（`Raycaster` 只出现在视觉点击、灯光、截图 selftest，不在车辆物理）；
- Cannon/Ammo/Rapier/Bullet 等刚体库依赖。

找到但**不是**车辆物理接触状态的同名/近似项：

- `WheelRotationState.staticContact`：近静止制动静摩擦（`WheelRotationSystem.ts:142-166`）。
- `ChassisPhysicsState.verticalVelocity`：`rideOffset` 的有限差分（`SuspensionSystem.ts:209`）。
- `SuspensionSnapshot.rideHeightTarget`：空气悬架目标高度（`SuspensionSystem.ts:63-68`）。
- DOM/UI 元素和 `Object3D.position.y`：视觉/编辑器/环境物体，不是车辆物理。

---

## Appendix C — Observed Anomalies (Recorded, Not Fixed)

以下只是审查记录，不是本轮修改项：

1. **`VehicleVisual.setWheelSuspensionOffsets()` 是死代码。** 定义在 `VehicleVisual.ts:292-298`，运行时无调用者；车轮视觉使用的是 `setWheelWorldPositions()` + contact-height。
2. **`ChassisPhysicsState.verticalVelocity` 命名有误导性。** 它不是被积分的速度，而是 `rideOffset` 的有限差分，且运行时无消费者（`SuspensionSystem.ts:209`）。
3. **`WheelPhysicsState.normalLoad` 容易被误读为接触反力。** 它实际是悬挂载荷分配模型的输出；在 8% 下限/归一化下不会为 0。
4. **`staticContact` 命名与“车轮接地”冲突。** 它只表示近静止制动的静摩擦约束（`WheelRotationSystem.ts:142-166`）。
5. **`VehicleSnapshot` 没有车身 Y。** 外部消费者只能用 `chassis.groundHeight` 近似；`DrivingGame` 的 `lateralPose.y`、`parkingPose.y` 都用 `groundHeight`/`roadHeight`，而不是 `chassisBodyPose().y`（`DrivingGame.ts:694`, `:939-942`）。这在 `rideOffset` 非零时会有厘米级偏差。
6. **`VehicleContactSystem` 的 contact 采样有一步滞后。** `before` 快照的 contact 用于 `stepFixed`，`after` 快照的 contact 用于渲染/下一帧（`:64-86`）。这不是“锁地”根因，但会让 contact 高度和当前 body pose 有一帧差异。
7. **`SuspensionSystem.synchronizeGroundGeometry()` 只更新 groundHeight/terrainPitch/terrainRoll，不更新 compression/rideOffset/pitch/roll。** 碰撞后调用（`VehicleContactSystem.ts:115`）可能造成一帧姿态不一致。
8. **`chassisBodyPose()` 的 `rideOffset` 同时进入渲染和碰撞高度包络。** 也就是说，视觉 heave 会影响 `CollisionSystem` 的 `bottom/top` 过滤（`VehicleContactSystem.ts:91-101`, `CollisionSystem.ts:342-349`），虽然碰撞本身不产生竖直响应。
9. **渲染没有固定步插值。** `updateVehicleVisual()` 直接使用最近固定步 `snapshot`（`DrivingGame.ts:882-908`），路面高度阶跃会表现为阶跃式车身位移。
10. **`VehicleDynamics.getSnapshot()` 会调用 `synchronizeWheelPositions()`，后者修改 `wheels` 的 x/z 并保留 y。** 这是一个有副作用的 getter；不影响结论，但会让“快照”不是纯只读。
11. **`restLength` 的配置注释与代码语义不一致。** 注释说 compression 从 restLength 量起（`VehiclePhysicsConfig.ts:402-403`），但 `compression` 实际是 `staticLoad/springRate` 的弹簧挠度（`SuspensionSystem.ts:89`, `:164-170`），`restLength` 只作为 `travelLimits()` 的上界项（`:270`）。这不直接导致“黏地”，但会让后续改造误解行程/长度边界。

---

## Appendix D — Limitations

- 本报告是静态代码审查，没有运行时 instrumentation、没有遥测录制、没有 build/test；因此不能给出“实际 heave 幅度/频率”的数值测量，只能给出结构性结论。
- 行号基于当前工作区文件（2026-10-19 快照）；后续代码变动可能使行号偏移。
- 没有对每个车型的 `suspension` 参数逐一做数值仿真；结论是“所有车型共享同一套竖直模型”，不是“每辆车的具体弹簧刚度最优/最差”。
- 没有评估主观驾驶感受、画面抖动、音频/相机舒适性；这些需要运行时驾驶验证。
- 本轮没有修改任何代码，因此报告中的“最小改造边界”只是建议，不是已实现方案。

---

**审查结论一句话：**

> 当前车辆的“黏地感”不是悬挂调校问题，而是**模型自由度问题**：`VehicleDynamics` 没有 Y/vY/aY；`WheelContact` 没有 contact 布尔量；`syncWheelContacts()` 每步把轮心贴到路面；`chassisBodyPose()` 每帧用四轮路面高度平均值直接决定车身 Y；`SuspensionSystem` 的 spring/damper 只生成 Fz 和视觉姿态，不生成 chassis 竖直力。要改变这一点，必须切在“竖直状态 + 可失败接触 + 悬挂力积分 + 停止直接覆盖 Y”这四个边界上，而不是继续调弹簧/阻尼。
