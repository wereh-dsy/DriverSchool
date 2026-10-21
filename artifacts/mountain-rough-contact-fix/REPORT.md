# Mountain 小幅粗糙路面接触与轮胎径向柔顺修复

2026-10-21。未修改 Mountain 地形、车型质量、重力、悬挂弹簧、ARB、行程、传动或相机。

## Mountain rejection 是否误伤

审计两份用户导出，结果见 [input-audit.json](input-audit.json)：

- `153050`：33 条 full-bump、20 次帧间 grounded 切换，**无 support rejection**。step 4997 的 aY=281.787、pitchRate=1.415、rollRate=-4.140 发生在此前一段四轮腾空后的单轮落地；该峰值不是拒绝逻辑造成的 contact chatter。记录包含草地、较大侧倾及米级车身高度变化，不能把这个落地峰当作普通厘米级搓板路的响应。
- `153057`：保留 986 条 rejection，元数据累计丢弃 2,194 条事件。用对应最终帧的真实 pitch/roll、悬挂轴及接触法线重建投影，**974 条符合悬挂轴投影无效/翻转**，12 条无法由最终帧准确归因到该步某个 microstep。最早保留下来的拒绝在 step 6060，roll 已约 4.680 rad。它们主要是翻滚后的几何失效；由于事件丢失，不能断言此前从未误拒绝。

原逻辑确实没有区分单值 heightfield 与多层道路。现在修正这一边界，但记录不支持“它是此次普通路面高频抖动的主要原因”。

## Contact 修了什么

- 只对具有多层支撑查询/道路身份的地面使用严格法线跳变、道路层切换、A-B-A 及短时坏候选规则；City 原保护保留。
- 连续 heightfield 的正常法线变化不再触发离散 layer rejection。无效法线、翻转悬挂轴仍会拒绝。
- heightfield 仍保留几何异常保护：用前后法线估计沿途高度变化，只有高度残差显著超过悬挂行程/动态容差、且新面远在 full bump 以上，才判 `unreachable-heightfield-discontinuity`。无标签的平法线 +0.65 m 坏跳变也不能进入轮胎/限位路径。
- Black Box 增加 `rejectionReason`。同 wheel 同 tick 只保留一条 rejection event，附 `count`、首末采样编号和末次原因；重复观察不再逐条挤占 event ring。

拒绝原因区分 `invalid-normal`、`invalid-suspension-projection`、`non-finite-surface`、`normal-discontinuity`、`unreachable-layer-switch`、`transient-layer-return`、`unreachable-heightfield-discontinuity`。

## 是否需要 tyre compliance，模型是什么

先只修 contact，使用同一真实 Mountain 厘米级 wash 路段复测：前后 aY RMS、峰值、pitch/roll rate **完全相同**，拒绝与接触切换均为 0。因此继续实现每轮一维径向柔顺，没有增加其他机制。

模型为无 unsprung mass 的 Kelvin–Voigt 轮胎径向弹簧/阻尼，与现有悬挂串联：

`surface → radial compression → suspension → chassis`

- 状态仅为每轮压缩 q、压缩速度，以及由它导出的有效半径；无 wheel-hop DOF。
- 新的通用 TireConfig 参数：K=400,000 N/m、C=1,200 N·s/m、最大总径向压缩 0.055 m。没有按 mapId/vehicleId 分支，没有改任何车型原有悬挂/轮胎抓地标定。
- 用串联系统的解析一阶松弛更新 q；无额外迭代、地图查询或每步状态对象分配。
- 静载预压 q0=静载/K；配置中的 wheelRadius 继续作为静载半径，`effectiveRadius = wheelRadius + q0 - q`。静态车高与 rigid 对照差小于 2 mm 的断言通过。
- 悬挂按有效半径重建长度、轮心与接触几何。Fz 仍仅由同一悬挂反力路径输出一次，不把轮胎反力再叠加到 Fz；保持非负法向反力，airborne 时为 0。
- 机械限位及力矩接触点使用一致的有效半径；大坡/落地仍由原悬挂和 chassis 求解。轮胎压缩有有限几何范围，+0.65 m 错层在这之前被 rejection 拦截。
- 明确传送/重置时径向状态恢复预压，避免携带旧路面的压缩历史。
- Black Box 每轮新增 `tyreCompression`、`tyreCompressionVelocity`、`effectiveRadius`。

开发期间径向实现曾未通过原有 2/4 microstep 收敛断言；最终解析更新和保守的通用径向刚度已通过原断言。未放宽收敛阈值。几何测试改用实际有效半径，保留原位置/穿透容差。

## 修复前后关键指标

测试入口：`node scripts/run-mountain-contact-selftest.mjs before|contact-only|after`。

只选一段真实 Mountain rough 和一段 smooth，Taycan 4S，60 km/h。每段 75 m、约 4.5 s，前 10 m 为进入段，统计其后 468 个 fixed steps。fixture 只指定纵向路径和航向，实际 terrain sampler、接触、悬挂及 chassis heave/pitch/roll 自由求解，不重放整段驾驶。

- Rough：`broken-dirt.start + 390…465 m`，包含现有约 4 cm、波长约 4.1/3.3 m 的 wash。
- Smooth：Mountain 主路弧长 150…225 m 的铺装段。

| Rough 指标 | 修复前 | 仅 contact 修正 | 最终 | 变化 |
| --- | ---: | ---: | ---: | ---: |
| RMS aY (m/s²) | 3.63038 | 3.63038 | 3.25073 | -10.46% |
| peak abs(aY) (m/s²) | 9.68148 | 9.68148 | 8.18545 | -15.45% |
| peak abs(pitchRate) (rad/s) | 0.24207 | 0.24207 | 0.20696 | -14.50% |
| peak abs(rollRate) (rad/s) | 0.015145 | 0.015145 | 0.010541 | -30.40% |
| full-bump 进入次数 | 0 | 0 | 0 | 无新增 |
| grounded/airborne 切换次数 | 0 | 0 | 0 | 无新增 |
| support rejection 次数 | 0 | 0 | 0 | 无新增 |
| max / total mechanical impulse (N·s) | 0 / 0 | 0 / 0 | 0 / 0 | 无新增 |
| safety / recovery 次数 | 0 / 0 | 0 / 0 | 0 / 0 | 无新增 |

| Smooth 指标 | 修复前 | 最终 |
| --- | ---: | ---: |
| RMS / peak abs(aY) (m/s²) | 0.04333 / 0.08186 | 0.02028 / 0.03946 |
| peak abs(pitchRate) (rad/s) | 0.000387 | 0.000417 |
| peak abs(rollRate) (rad/s) | 约 0 | 约 0 |
| full-bump / contact 切换 / rejection | 0 / 0 / 0 | 0 / 0 / 0 |
| mechanical impulse / safety / recovery | 0 / 0 / 0 | 0 / 0 / 0 |

最终每段 541 次 contact refresh、2,164 次地图 surface query，严格保持每次 refresh 四次查询。轮胎压缩、速度、半径均有限，Fz 非负。解析松弛没有引入新的振荡自由度；路面本身的空间波长和地形没有修改。

数据：[before-summary.json](before-summary.json)、[contact-only-summary.json](contact-only-summary.json)、[after-summary.json](after-summary.json)。逐步样本及各段 Black Box 同目录保存。

以上普通粗糙路改善不等于把原记录的米级腾空落地变成平路；未用 force clamp、camera smoothing 或改悬挂标定消除那种真实冲击。

## City 跳层保护与 targeted 验证

City 东侧立交完整原 targeted regression 通过，结果写入本报告的 [city/validation.json](city/validation.json)，历史报告和导出保留：

- 80/120/140 km/h 主线、旧冲突地图＋新保护 140 km/h、合法驶入匝道：均无大高差 A-B-A、机械冲量、安全介入或 penetration recovery。
- +0.65 m 坏层/交替坏候选仍在轮胎前被拒绝，四轮 impulse 为 0，允许短暂 airborne 并恢复接触。
- rejection reason 正确，事件按 wheel/tick 合并，计数保留，fixture 导出 `droppedEvents=0`。
- City regression 39 assertions；局部 map 0 errors / 0 warnings。
- WheelContact：3,426 assertions，通过。
- VerticalDynamics：107 assertions，通过，包含原 ChassisDynamics/2→4 microstep 收敛断言、静态车高、正常法线变化、无标签坏跳变和 airborne 单向反力检查。
- SuspensionMechanics：126 assertions，通过。
- 独立 typecheck：通过。日志见 [targeted-tests.log](targeted-tests.log)、[typecheck.log](typecheck.log)。

未运行 full core、全车型、editor 全量、full map diagnose，也未做长距离驾驶。

构建：本轮**唯一一次** `pnpm run build -BasicValidation` 成功，exit code 0；typecheck 通过，按用户要求跳过 full core，已更新可玩 `dist`。已核对发布入口 `assets/index-DnB9FD7M.js` 含径向遥测和 heightfield 保护代码。见 [build.log](build.log)、[build-result.json](build-result.json)。仅有 Vite chunk 大于 500 kB 的体积提示。

## 改动文件

Contact：`WheelSupportContinuity.ts`、`WheelContact.ts`。

径向模型及几何：`SuspensionSystem.ts`、`WheelPhysicsState.ts`、`ChassisDynamics.ts`、`VehicleDynamics.ts`；新参数及独立复制：`VehiclePhysicsConfig.ts`、`defaultVehiclePhysicsConfig.ts`。

诊断：`BlackBoxSchema.ts`、`VehiclePhysicsBlackBox.ts`。

定向验证：`VerticalDynamics.selftest.ts`、`ChassisDynamics.selftest.ts`（仅失败消息补充差值）、`scripts/run-mountain-contact-selftest.{ts,mjs}`、`scripts/run-east-interchange-contact-selftest.ts`（保留旧 fixture，允许独立输出目录）。

当前上述定向验证无未解决失败；完整玩家驾驶舒适度、整个 Mountain 和其他车型未作主观评价。
