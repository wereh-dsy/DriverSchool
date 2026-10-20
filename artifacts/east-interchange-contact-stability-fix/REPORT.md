# 东侧立交 contact stability 修复

日期：2026-10-21。菜单 City Main 实际地图：`src/world/regional/regional-main.json`，版本 478 → 479。

## 1. 黑匣子证据与 first bad step

输入：Downloads 中的 `vehicle-blackbox-20261021-003406.json` 和 `vehicle-blackbox-20261021-003408.json`。提取结果见 [blackbox-evidence.json](blackbox-evidence.json)。车辆为 Tesla Model 3 RWD；未修改其配置。

003406 的自动触发点是 **4299**（早期 support-A-B-A），首次巨大 mechanical impulse 为 **4382 / 36.5166667 s**，车身位置约 `(2603.1551, 6.9758, -159.6328)`（恢复前）。4381 是最后正常帧；4382 内 frontLeft 的 contact sample 2、3、5 分别跳变 `+0.6496596 / -0.6496596 / +0.6486549 m`。

字典句柄只在该导出中有意义，不能作为运行时道路 ID：

| 句柄 | 实际对象 |
| --- | --- |
| road 133 | `system-east:E-to-S-turbine`，东侧 E→S 南城方向匝道 |
| road 136 | `ew-wb-split-4-split`，东西快速路西行主线 |
| surface 166 / segment 167 | `system-east:E-to-S-turbine:11:road` / `system-east:E-to-S-turbine:11`，零基 segment 11 |
| surface 156 / segment 157 | `ew-wb-split-4-split:3:road` / `ew-wb-split-4-split:3`，零基 segment 3 |

注意：133 是匝道，136 才是主线。4382 中首次切向主线时，主线高度 **7.618284432 m**，原匝道高度 **6.968624846 m**，相差 **0.649659586 m**。

003408 记录事故后续翻滚/离地状态，含 non-finite-frame 事件，不用它替代 003406 的首次失效定位。

## 2. 原因：真实重叠与无记忆采样叠加

分流共用起点为 `(2640, 6.968624846, -158.125)`。主线继续爬升到 8 m，匝道起始曲线却长时间维持 6.968624846 m。道路宽度和路肩尚未分离时，两套实际可接受的支撑面已经出现明显高差；这是 authored elevation profile 冲突，不是三角剖分错误。

旧 CityGround 按高度差、端帽外延距离、路面类型评分；每次都只使用车身参考高度。车辆误捕获较低的匝道后，较低车身参考又继续偏好该匝道。

4382 的预探末端 sample 2 在 `(2601.69595, -158.88180)` 已离开匝道 footprint，只剩较高主线。随后自适应 microstep 回采 sample 3 的 `(2601.92334, -158.87569)` 又进入匝道 footprint，于是重新选低面；sample 5 再次跨出。也就是说，末端预探与回采位置跨越同一 footprint 边界，在同一 outer tick 内形成 A→B→A→B。两面 normal dot 约 0.999912，单靠法线无法区分错误跳层。

原 0.85 m 告警阈值令这些 0.65 m 跳变均为 `heightJump=false`。错误高面随后被当作悬挂 full bump，进入预测机械约束，引发巨大冲量与车身角速度。

## 3. Contact continuity 与拒绝路径

新增 `WheelSupportContinuity`：四个复用状态保存 surface/road/segment 引用、高度、法线、位置、有效性和 tick；不使用道路或车型 ID 特判。

- 用上一支撑局部平面预测新 XZ 的高度。每次仍由真实 CityGround 验证 footprint，旧面失去空间覆盖后不会外推支撑。
- 检查上一支撑在当前 attachment / suspension axis / wheel radius 下的 required length；只有可达、高度和法线连续的旧面才能获得优先级。
- 跨 tick 使用轻量评分迟滞；同 tick 使用更强偏好。同一道路相邻 segment 可正常交接，超出端点的端帽不会被永久保留。
- 新层检测使用实际悬挂可用行程、当前几何长度、车身 attachment 位移、轮半径及水平位移。高度容差为 `max(0.025 m, usableTravel * 0.75) + attachmentMotion + boundedGrade * horizontalDisplacement`。
- 若候选高度向上跳变超过容差且 `requiredLength < minLength - tolerance`，或法线/投影不可信，则拒绝；不会以 0.85 m 固定值判断。
- 记录 3 个 physics steps 内的返回切换与 transient candidate；仅短时降低该候选优先级，无长期 blacklist。
- 拒绝候选明确设置 `supportValid=false`，悬挂全伸、未着地、零接触载荷；下一 tick 重新采样，可立即恢复合法接触。

发现并修复一个必要入口：原 mechanical solver 对未 grounded 车轮也建立预测限位约束。因此仅设置 airborne 不足以隔离坏面。现在拒绝标记传到 `SuspensionVerticalCorner`，该候选不启用预测约束。**ChassisDynamics 仅增加这个有效性入口检查；质量、惯量、力到力矩、heave/pitch/roll 积分和约束解法均未改动。**

未增加 maxFz/maxImpulse/maxAY/maxRollRate 等力或速度 clamp。已有 safety recovery 保留。

Black Box 使用每轮动态容差，并记录 `support-candidate-rejected`；拒绝候选不会被记作已经建立的物理支撑。无几何信息的外部 contact 使用 0.12 m fallback。黑匣子功能及开关保留。

## 4. 局部地图修改

仅修改 `system-east:E-to-S-turbine` 的 **28 个 Y 节点**，X/Z、道路宽度、端点、roadLinks、路肩和其他地图字段不变；版本递增。见 [map-changes.json](map-changes.json) 和 [map-scope-check.json](map-scope-check.json)。

尚有 footprint 共用的分流段随主线高程变化；两道路铺面已充分分离后，从 X≈2561.64 到 X≈2502.57 平滑接回原匝道 profile。所有修改均在该匝道起始局部，没有重建立交。

共面分流铺面的 XZ 共用属于合法分流连接；已清理的是同一支撑区两层相互穿插的真实高度冲突。用真实 sampler 在 X=2630…2550、Z=-153…-171 的 0.5 m 网格检查：1,283 组共享候选，最大高差 **0.007703 m**；旧地图最后有效 FL 位置的零外延候选高差 **0.645643 m**。局部最大纵坡 **3.3763%**。没有用全地图 diagnose。

## 5. 回归基准与方法

[original-local-map.json](original-local-map.json) 保留原始三条相关道路：上游主线、事故主线、匝道起始段。使用真实 CityGround、VehicleContactSystem、Tesla 配置及原垂向求解器。

主线从 X=2675、Z=-159.625 通过事故区到 X<2540。fixture 每 tick 指定纵向速度边界，使事故处实际速度分别为 **79.991 / 119.988 / 139.986 km/h**；垂向、俯仰、侧倾及全部 contact force 自由积分。此定向 fixture 不是完整历史输入重放，也不是新增运行时速度修正。

为单独检验 road support，fixture 不参与实体护栏碰撞；实际游戏碰撞代码和护栏没有关闭或修改。匝道验证用正常转向输入，从同一上游路线驶入，80 km/h 初速、自然滑行，通过分流到 X<2570；事故附近约 73.16 km/h。这一项要求是合法进入匝道，不是第三方 autopilot 长距离驾驶验证。

## 6. 修复前后量化

用户黑匣子 003406：

| 指标 | 修复前记录 |
| --- | ---: |
| FL mechanical limit impulse | 322,007.878 N·s |
| FL Fz | 38,655,144 N |
| 最大帧 aY | 998.1024 m/s² |
| 最大帧 rollRate | 10.9809 rad/s |
| safety 前 vY / abs(rollRate) | 117.5563 m/s / 112.4888 rad/s |
| 首坏步 safety interventions | 2 |

同一最小 fixture、旧地图且关闭新增 continuity，三档均重现错误（达到首次 safety 即停止）：

| 速度 km/h | max impulse N·s | max Fz N | 大高差 A-B-A 计数 | safety |
| --- | ---: | ---: | ---: | ---: |
| 80 | 161,926.12 | 19,444,704.74 | 18 | 1 |
| 120 | 483,316.50 | 58,011,964.70 | 22 | 3 |
| 140 | 491,886.16 | 59,040,526.24 | 38 | 3 |

不将旧 fixture safety 清零后的帧角速度误当作未失控证据；原黑匣子提供了 safety 前状态。

最终修复地图与 contact：

| 路线 | max impulse N·s | max Fz N | max abs(aY) m/s² | max abs(rollRate) rad/s | safety / recovery |
| --- | ---: | ---: | ---: | ---: | --- |
| 主线 80 | 0 | 6,748.86 | 5.1744 | 0.02047 | 0 / 0 |
| 主线 120 | 0 | 9,244.20 | 10.9218 | 0.03224 | 0 / 0 |
| 主线 140 | 0 | 11,346.04 | 15.4431 | 0.03379 | 0 / 0 |
| 旧地图＋新保护 140 | 0 | 11,346.04 | 15.4431 | 约 0 | 0 / 0 |
| 驶入右侧匝道 | 0 | 6,747.12 | 5.1694 | 0.09987 | 0 / 0 |

所有最终路线：无大高差 A-B-A，无巨大冲量，无弹飞；safety intervention 和 penetration recovery 均为 0。正常入匝道时四轮均转为匝道支撑，之后没有切回主线。包含原地图保护验证，证明物理结果并非仅依赖地图修正。

另行强制注入 +0.65 m 坏层及同 tick 高低交替候选：32 次拒绝，四轮 limit impulse 均为 0，无 safety；坏层期间允许 airborne，下一 tick 恢复正常接触。见 [bad-candidate-blackbox.json](bad-candidate-blackbox.json)。

各路线导出见同目录 `after-*-blackbox.json`、`original-map-protected-140-blackbox.json`、`ramp-80-blackbox.json`；精确指标见 [validation.json](validation.json)。

## 7. Targeted tests 与构建

运行：`node scripts/run-east-interchange-contact-selftest.mjs`。

- overlap / 合法分流 / 坏候选 / 短暂 airborne / 原地图保护 / 几何与速度检查：37 assertions，通过。
- WheelContact：3,426 assertions，通过。
- VerticalDynamics：102 assertions，通过（包括其已有 ChassisDynamics targeted 检查）。
- SuspensionMechanics：126 assertions，通过。
- 局部 CityMain validateMap：0 errors / 0 warnings。
- 独立 typecheck：通过；最终构建也会执行 typecheck。
- 未运行 full core、全车型、editor 全量或 full map diagnose。

开发中曾捕获“airborne 仍进入预测机械约束”的真实失败，已补齐有效性门控并重跑通过。用于验证入匝道的初版转向脚本曾在更远处驶出路肩，不能用来证明完整匝道驾驶；最终用覆盖分流并完成四轮切换的短路线，验证范围止于 X≈2570。几何断言的取样点改为黑匣子最后有效轮位置，首次坏点本身已在匝道 footprint 外；没有降低高差断言。

构建：**唯一一次** `pnpm run build -BasicValidation` 成功，exit code 0，已发布到 `dist`；typecheck 通过，按用户要求未运行 core selftests。日志见 [build.log](build.log)，发布核对见 [build-result.json](build-result.json)。新入口 `assets/index-wWpbNWe9.js` 引用新资源；实际发布的 `assets/city-main.runtime-643410a02c1e.json` 为版本 479，匝道 centerline 与修复源文件一致。Vite 提示部分 chunk 超过 500 kB，此为体积提示，未阻止构建；本任务不进行无关拆包。

## 8. 改动文件与边界

- `src/vehicle/physics/WheelSupportContinuity.ts`：每轮连续性、可达性与短时异常候选状态。
- `src/vehicle/physics/WheelContact.ts`、`VehicleContactSystem.ts`：生产采样路径接入。
- `src/vehicle/physics/SuspensionSystem.ts`、`ChassisDynamics.ts`：拒绝 contact 不参与力和预测机械限位。
- `src/world/SurfaceMaterial.ts`、`DrivingGround.ts`、`city/CityGround.ts`：可选支撑 hint 与真实 footprint 重验证。
- `src/vehicle/diagnostics/BlackBoxTriggerThresholds.ts`、`VehiclePhysicsBlackBox.ts`：动态阈值与拒绝事件。
- `src/world/regional/regional-main.json`：上述 28 个匝道 Y 节点与版本。
- `scripts/run-east-interchange-contact-selftest.{ts,mjs}`：定向 regression 入口。
- 本目录：原始局部 fixture、证据提取、地图审计、各路线黑匣子和验证报告。

未修改 mass、gravity、悬挂/轮胎 calibration、传动系统、ABS/TCS/ESC/AWD、相机或其他地图区域；保留工作区已有改动，未提交、推送或丢弃文件。

已知边界：这是限定区域的自动 contact/垂向回归，不等同完整玩家驾驶或视觉评估；未验证整条匝道远端和全地图。主观驾驶与视觉仍由用户评估。当前定向验证无未解决失败。
