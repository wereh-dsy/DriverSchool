# SU7 Max 空气动力与正式发布记录

日期：2026-10-29。车型：`xiaomi-su7-max-2026`。本记录覆盖首轮 SU7 的固定气动系数和仅视觉尾翼实现；原始标定记录保留在 [SU7 首轮记录](SU7_MAX_2026.md)。

## 模型、符号与唯一施力路径

所有物理量使用 SI，正车速指向车身前方，垂向力正值向上：

```
u = v_vehicle - v_air                 // 车身纵向空气相对速度，m/s
qA = 0.5 * rho * A * u²               // 动压乘参考面积，N
Cd(d) = 0.205 + 0.006 * d
Cl_front = -0.008
Cl_rear(d) = -0.022 - 0.045 * d
F_drag = -0.5 * rho * A * Cd(d) * u * abs(u)
F_front_y = qA * Cl_front
F_rear_y = qA * Cl_rear(d)
d_next = d + (target - d) * (1 - exp(-2.5 * dt))
```

`d` 为 0–1 的物理尾翼展开量；大于 90 km/h 请求展开，小于 70 km/h 请求收回，两者之间保持请求。保留原严格阈值和 2.5 s⁻¹ 响应，现在在固定物理步更新；渲染直接借用同一个 `activeSpoilerDeployment`，不再独立判断速度或重复平滑。

`VehicleAerodynamics` 每物理步仅执行标量计算，不分配临时对象、不查询地形、不增加射线/阴影/粒子。阻力替换原有阻力计算，进入原纵向合力与动力积分；前后垂向力替换原有升力计算，通过原 `ChassisDynamics.integrate` 的一次垂向力与俯仰力矩平衡、原非簧载耦合和悬架/轮胎接触求出四轮轮荷。没有把气动力再次加到轮荷，没有抓地倍率，没有速度/姿态修正。

沿用现有小角度等效轴心力臂：`M_pitch=(L/2+z_cg)*F_front_y-(L/2-z_cg)*F_rear_y`，单位 N·m。前轴下压力产生车头向下力矩，后轴下压力产生车头向上力矩。对称气动力不产生侧倾力矩。阻力等效作用在重心，不额外引入阻力俯仰矩。

## 官方规格与工程估值

- 官方来源：[新一代 SU7 参数配置](https://www.xiaomiev.com/xiaomi/car-config)、[新一代 SU7 产品介绍](https://www.xiaomiev.com/su7)。4997 × 1963 × 1445 mm、3000 mm 轴距与 Max 电动尾翼为公开规格依据。
- 保留 Cd=0.205、A=2.36 m²、Cl_front=-0.008、Cl_rear=-0.022。它们在首轮已明确为工程估值，**不是经官方确认的 2026 Max 风洞系数**。A 约为车宽×车高的 83%，是合理形状填充率估计；rho=1.225 kg/m³ 为标准参考空气密度。
- 新增 ΔCd=+0.006、ΔCl_rear=-0.045 也是工程估值。200 km/h 全展开额外后轴下压力约 200.8 N（约 20.5 kgf），额外阻力 26.8 N；265 km/h 分别约 352.5 N（约 35.9 kgf）和 47.0 N。没有套用 SU7 Ultra/原型赛车的巨大下压力数据。
- 对 ΔCl=-0.030/-0.045/-0.060 做了同速系数敏感性试验：200 km/h 后轴总气动力约 -232.0/-298.9/-365.8 N。选取中间估值，增益有限；该范围表示建模不确定性，不代表风洞测量误差区间。
- 质量、动力、电池、减速比、轮胎、电控和速度安全上限均未改动；除 aero 外整车配置 SHA-256 在前后试验中一致。

## 同条件前后试验

固定步长 120 Hz，初始 SOC=80%，默认 20°C 环境。零百为 SPORT、静止到首个达到 100 km/h 的步，无 rollout；极速为 65 m/s 初速全电门 40 s，最后一秒车速增量不足 0.001 km/h。没有为了成绩调整非气动标定。

| 指标 | 改动前 | 改动后 |
| --- | ---: | ---: |
| 0–100 km/h | 3.075 s | 3.075 s |
| 极速平衡检查 | 266.164 km/h | 265.916 km/h |
| 极速轴端机械功率 | 141.689 kW | 145.227 kW |
| 极速电池端功率 | 158.811 kW | 162.721 kW |
| 200 km/h 松电门 5 s 后 | 183.670 km/h | 183.492 km/h |
| 200 km/h 全制动 3 s 后 | 84.708 km/h | 84.345 km/h |
| 10 km/h 阻力 | 2.286 N | 2.286 N |
| 200 km/h 阻力 | 914.589 N | 941.358 N |
| 265 km/h 阻力 | 1605.676 N | 1652.672 N |
| 200 km/h 前/后轴气动力 | -35.691 / -98.151 N | -35.691 / -298.914 N |
| 200 km/h 前/后轴真实轮荷 | 11095.994 / 11404.678 N | 11096.209 / 11605.237 N |
| 265 km/h 前/后轴真实轮荷 | 11123.066 / 11478.741 N | 11123.453 / 11830.862 N |

轮荷试验使用纵向台架执行力维持约定速度，正常积分车身和四轮，不直接设置速度/轮荷。高速车高降低沿用原系统。各速度总轮荷与 `mg - F_front_y - F_rear_y` 的平衡差小于 1 N，验证没有重复添加气动载荷。200 km/h 尾翼引起额外车身下沉约 1.13 mm，俯仰变化约 0.000744 rad；265 km/h 分别约 1.99 mm、0.001305 rad。

180 km/h 初速的固定步驾驶场景：

| 场景 | 最大侧倾（前→后） | 最大侧偏角（前→后） | 最小单轮轮荷（前→后） |
| --- | --- | --- | --- |
| 高速转向 | 0.009319→0.009030 rad | 0.014241→0.013593 rad | 4815.5→4832.7 N |
| 连续变线 | 0.005823→0.005789 rad | 0.010008→0.009814 rad | 5045.0→5047.5 N |

两个场景均无无效状态恢复、无车身安全兜底；全油门、松电门与制动同样保持有限状态。上述是客观测试条件下的稳定性结果，人工驾驶手感仍需验收。

## 专项与最小回归

- 气动专项 29 项：相对流速平方、顺/逆风、倒车与力方向、正升力符号、严格阈值/滞回、固定压力下展开/收回连续性、60/120 Hz 一致性、重生复位，以及解析垂向力/俯仰矩单次施加。
- 对比检查 21 项：非气动配置哈希、加速/极速/收放电门/制动、低速保持、真实轮荷平衡与高速稳定性。
- 原 SU7 专项 5818 项、车身动力学 9 项、非簧载质量专项 2824 项通过。大量断言是逐步状态检查，不等于独立驾驶场景数量。
- Model 3、Taycan、驾校基础轿车的 5 s 滑行、气动力、俯仰、侧倾及四轮轮荷与真实改动前基线逐项完全一致。
- `pnpm@11.19.0 run typecheck`：通过；正式构建中的类型检查也通过。初次检查指出新增解析测试读取私有轮状态，已改为公开快照；没有更改被测物理行为或放宽断言。
- 未运行无关全核心/全系统套件。原有正式 checkpoint 的 BasicValidation 开关用于遵守本次用户指定的专项验证范围；不把它描述成全量核心通过。

证据：[改动前](../artifacts/su7-aerodynamics/before.json)、[改动后](../artifacts/su7-aerodynamics/after.json)、[专项结果](../artifacts/su7-aerodynamics/selftest-results.json)。

## 修改文件与简化

- `src/vehicle/physics/VehicleAerodynamics.ts`、`VehicleAerodynamics.selftest.ts`：标量气动、物理尾翼执行状态与解析验证。
- `src/vehicle/config/VehiclePhysicsConfig.ts`、`validateVehiclePlatformConfig.ts`：可选气动执行器配置与启动验证；其他车型不安装。
- `src/vehicle/config/su7MaxPhysicsConfig.ts`：只新增尾翼气动标定，保留已有基础系数与整车标定。
- `src/vehicle/physics/VehicleDynamics.ts`：替换原计算位置、复用既有施力流程、发布展开量和纵向空气速度边界。
- `src/game/DrivingGame.ts`、`visual/InstrumentCluster.ts`、`visual/VehicleVisual.ts`、`visual/SU7MaxExterior.ts`：物理展开量的必要显示接线；没有改音频、地图、天气或导航。
- `src/vehicle/SU7Max.selftest.ts`：外观测试改为明确提供物理展开量。
- `scripts/measure-su7-aerodynamics.ts`、`run-su7-aerodynamics-selftests.ts`：基线与最小回归；本记录、首轮历史记录提示和专项 artifacts。

这是准稳态**纵向**空气动力模型：未实现侧风侧力/偏航矩、横向/垂直相对气流、气流分离、地效、CFD 或姿态相关气动。新增空气速度是物理边界，默认静止空气，未扩展天气系统。尾翼以现有后轴等效作用点施力，不模拟尾悬支架载荷或高角度空气制动挡位。Cd/Cl 增益仍须未来风洞/可信测量数据校准。

## 正式构建与 Release

状态：**正式构建、dist 更新、外部桌面 Release 发布及最终 EXE 冒烟均完成**。

1. 精确使用项目指定 `pnpm@11.19.0`；宿主 fallback 为 11.25.0，因此通过 `pnpm dlx pnpm@11.19.0` 运行，子进程 PATH 已核对优先使用同一精确版本。没有修改依赖或发布脚本。
2. 专项全部通过后，仅执行一次 `pnpm dlx pnpm@11.19.0 run build -BasicValidation`。现有 checkpoint 完成 typecheck、暂存 Vite、源码指纹校验和原子发布，退出码 0，`dist/index.html` 已更新。存在 Vite 现有大 chunk 提示，没有构建错误。
3. 桌面类型检查通过后，直接执行现有 `scripts/desktop-package.mjs`，由它构建桌面 main/preload 一次、组装当前 manifest 资源、打包 Electron 45.0.0 并完整目录发布。没有调用会再次运行 Browser 构建的 `desktop:package` 包装命令，也没有重跑正式 build。
4. 正式入口：`D:\DriverSchoolRelease\DriverSchool-win32-x64\DriverSchool.exe`。内部 `release/` 只是中间包。既有外部发布目录经检查不含目录链接，完整运行时发布采用已有暂存/替换机制；未回滚或覆盖源码工作区的无关变更。
5. 从最终 `resources/app.asar` 提取当前 18 个资源，与 dist 逐文件 SHA-256 完全一致；确认 SU7 ID 和物理空气速度/尾翼系数/展开状态代码均在包内。ASAR SHA-256：`d627c0011dd9c4641ce178a448de94609e70786480e4ff7e09925928a69f3f08`。
6. 启动外部正式 EXE，使用独立用户目录，实际完成菜单就绪→选择 `Xiaomi SU7 Max (2026)`→进入驾驶。WebGL、桌面平台桥接与隔离策略正常，渲染器异常为 0。测试进程已关闭，没有自动驾驶或改写用户存档。

发布后第一次资源核对辅助脚本使用 `/` 分隔的嵌套 ASAR 路径，在 Windows 报找不到已存在的文件；只读列目录确认资源存在后，将辅助脚本改为原生路径，18 项全部通过。这不是构建/发布缺失，没有因此重构建或重发布。

证据：[正式构建日志](../artifacts/su7-aerodynamics/formal-build.log)、[Release 日志](../artifacts/su7-aerodynamics/release-package.log)、[资源哈希核对](../artifacts/su7-aerodynamics/release-verification.json)、[最终 EXE 冒烟](../artifacts/su7-aerodynamics/release-smoke.json)、[驾驶截图](../artifacts/su7-aerodynamics/release-smoke.png)。

## 人工驾驶验收

- 从正式 EXE 选择 SU7 Max，确认加载、PRND、EPB/Auto Hold 与基本驾驶正常。
- 在安全直路观察 90 km/h 展开、70 km/h 收回，以及阈值附近反复增减速，确认尾翼连续且不抖动。
- 体验 180–260 km/h 高速直线、松电门和制动，确认没有突然俯仰、跳车或制动突变。
- 高速缓弯、连续变线与过弯制动，确认后轴支撑有限且自然，车身仍有真实侧倾与载荷转移。
- 比较舒适/运动模式和空气悬架高速降低，确认尾翼联动没有破坏已有悬架特征。
- 切换 Model 3/Taycan 等其他车，确认外观、气动表现与选择/保存流程正常。
