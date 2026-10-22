# Wheel support selection v2

范围：支撑候选筛选、连续性/层分类、同 tick latch、跨 tick 确认、机械约束资格及黑匣子。未修改 City Main、车型参数、轮胎/簧下模型、camera 或 3D chassis collision。

## 1. 根因

旧 CityGround 先按高度/extension 分数选出唯一 surface，车辆侧随后才拒绝：有效旧支撑可能先被丢掉。微采样同时改写 accepted reference/height，threshold 和几何轻微变化即可让本 tick 已拒绝 surface 重新进入物理。ChassisDynamics 仅依赖 supportValid，未独立拒绝失效射线、负 requiredLength 和米级 gap。旧单 tick 事件合并仍每 tick 分配四条 rejection 事件，后续淹没根因。

## 2. Hard eligibility 与排名

City 的现有 footprint 查询内，先检查有限值/normal、suspension axis 投影和向下方向、几何 requiredLength、min/max travel 范围，再判结构关系、检查本 outer tick latch、确认连续性/层切换；只有 eligible 候选参与 score。没有新增公共地图查询。失效候选仅可作为诊断返回，supportValid=false，不参与物理。
eligible 排名使用 predicted-height error、旧支撑/相邻段连续性、单跳 topology、normal、原有 end-cap extension 和 pavement 成本。只有两个 SAME_LAYER 候选的误差/normal/topology 等价且最终分数相同时，才用较高 Y 作最后 tie-break。没有最高层或最低层规则。

## 3. Layer class

- SAME_LAYER：原 surface 或预测高度差约 2.5–5.5 cm 内、normalDot>0.95 的几何连续候选；road/adjacent segment、显式 links、split/merge、junction ownership 提供结构关系和优先级。
- POSSIBLE_LAYER_SWITCH：几何可达、预测误差适中的不同 surface，以及真实支撑丢失后在可达范围内重新遇到的结构面。需要跨两个 outer tick 的稳定确认。
- GRADE_SEPARATED：超过约 max(9 cm, 0.6×travel) 的不可解释预测残差，或没有 link 的明确 ground/elevated/enclosed 结构冲突。不能仅因 XZ overlap 被接受。custom/缺失结构元数据保留几何推断，不假定完美 layer ID。
CityGround 在初始化时从现有 routing connections、junction connections、elevationMode/enclosure 构造单跳 Set 和共享 surface reference；120 Hz 不遍历路网。

## 4. Predicted height

每轮冻结 outer-tick anchor：最后接受的 surface/reference/height/normal、XZ、attachment 和 wheel bottom、support-loss 状态。预测为上一 plane 按 XZ 位移及 grade 的平移，加 0.15×(wheel-bottom 位移－grade 位移＋(chassis vY＋axisY×unsprungVelocity)×dt)，修正上限 ±15 mm。wheel-bottom 位移自然包含 attachment、悬挂轴姿态、簧下行程和有效半径变化。真正失去旧层且旧 plane 已不可达时，改以当前 wheel bottom 作为落地预测。
anchor reference 和 loss 状态也冻结，避免 endpoint preview 接受 terrain 后，后续真实 microstep 又拿旧桥面高度评估新 reference。

## 5. 同 tick latch

unreachable-layer-switch、transient-layer-return、invalid-suspension-projection、impossible-height-discontinuity/heightfield discontinuity 按 wheel+surface 锁定；几何/threshold 之后变好也不能在该 outer tick 再接受。每轮固定 16 槽；满时对未知新面 fail-closed。下一 tick 清空。
VehicleContactSystem 的 epoch 覆盖 cache/weather refresh、所有 adaptive samples 和碰撞后的重采样。运行中刷新不再重置 continuity；显式 spawn/teleport synchronize 仍可重新 seed。

## 6. Layer hysteresis

每轮固定 16 槽按 surface 记录最近 outer tick 与连续确认次数，microstep 不累计；竞争候选不会互相清空确认。资格失败会中断连续确认。同层 segment、linked split/merge 不增加延迟。

## 7. Mechanical 二次资格

WheelMechanicalEligibility 在 ChassisDynamics 生成约束时独立检查 supportValid、同 tick latch、pending confirmation、axis/normal projection、向下分量、有限几何、requiredLength 和 gap。明显负 requiredLength（<−1 cm）、远超 droop、超悬挂解释范围及过深 penetration 均禁止约束。可解释的小 bump/预测落地仍走原耦合硬限位求解；未 clamp impulse。
投影或 axis 向下分量低于 0.25、normal.y<0.1 时不可生成轮悬挂约束。penetration envelope 按 travel 和一步预测位移限制，最多 18 cm；米级 gap 不进入 solver。最终资格/reason 写入 corner 和 Black Box。异常姿态交给既有 airborne、chassis collision/safety 边界，本轮不新增车身碰撞模型。

## 8. 五个 fixture 前后

下面是提供事实数值的归一化运行时回放：使用冻结旧源码与相同车/几何驱动现有 selector、suspension 和 chassis。它复现故障机制，不声称精确重放 10 份日志的全部初始状态；摘要的 79,665 N·s / 4514.6 m/s² 与回放数值不同。没有重新读取原始 blackbox JSON。

| fixture | 旧行为 | 新行为 | 单轮 peak impulse N·s | solver vY m/s | solver aY m/s² |
|---|---|---|---:|---:|---:|
| A-parallel-15cm | 15.161 cm 低层被接受 | 拒绝错误候选 | 0.0 → 0.0 | -0.082 → -0.082 | -9.8 → -9.8 |
| B-same-tick-boundary | 同 tick reject→accept | 拒绝错误候选 | 17147.3 → 0.0 | 29.723 → -0.082 | 3566.8 → -9.8 |
| C-road-access-79cm | 79.224 cm 下层被接受 | 拒绝错误候选 | 0.0 → 0.0 | -0.082 → -0.082 | -9.8 → -9.8 |
| D-bridge-terrain | 20 m 下 terrain 标为有效 support | 支撑丢失；落近才接地 | 0.0 → 0.0 | -0.082 → -0.082 | -9.8 → -9.8 |
| E-rollover | 侧躺米级 gap 进入 solver | invalid projection 禁止约束 | 662302.4 → 0.0 | 577.551 → -0.082 | 69306.1 → -9.8 |

B 精确复现两次比较边界：0.25755 > 0.25716 被拒绝，随后 0.24969 < 0.26732；旧函数重新接受，新函数保持拒绝。进一步把几何改到真正可达，latch 仍生效；独立测试确认下一 tick 可重新评估。E 表中的速度/加速度取 safety 之前，避免被事后清零掩盖。

D 还做了完整 20 m 下落积分（不是靠瞬移通过验收）：首次有效接地约 2.017 s，max |vY| 19.783 m/s，最终 chassisY -0.005 m，safety=0。真实落地 peak impulse 11211.7 N·s、peak aY 2374.0 m/s²，与旧路径相同；这是原硬限位模型承接真实重落地，本轮不把它伪装为零冲击。查询数前后均 1712。

另从当前 v484 原道路数据提取三处局部 runtime（保留 road profiles/局部 links；剔除无关 objects、regional terrain、editing 元数据；不是完整地图长路线回放）。结果：

| 局部点 | peak impulse N·s 前→后 | raw peak abs(vY) m/s 前→后 | peak outer aY m/s² 前→后 | 新 unsafe road switch |
|---|---:|---:|---:|---:|
| (-44.38, -1287.04) | 0.0 → 0.0 | 0.002 → 0.002 | 0.040 → 0.040 | 0 |
| (3.34, -1159.1) | 0.0 → 0.0 | 0.009 → 0.009 | 0.161 → 0.161 | 0 |
| (-674, -150) | 2098767.4 → 0.0 | 258.894 → 2.943 | 160.201 → 11.484 | 0 |

A/B 局部静态无接触切换；C 位于铺装边缘，新路径有一次支撑丢失而没有反复 chatter。其约 2.94 m/s 下落不能解读为道路已修好。实际候选原始高度/extension 保存在 before.json / after.json；C 的摘要坐标在当前局部查询中不一定同时覆盖主路与 access，79 cm 故障另由事实回放覆盖。

## 9. 错误 switch 与正常行为回归

指定回放/局部 runtime 未发现新错误抢层或同 tick reaccept；不代表已证明整个 City 无地图问题。987 个 support/mechanical 定向断言覆盖同层、linked split/merge、桥/隧道结构区分、2-tick 确认、竞争候选、cache refresh latch、+0.65 m 旧夹具、机械资格及 typed export。
既有东侧正常匝道 80 km/h：rampSeen=true、mainlineAfterRamp=0、invalidABA=0、impulse/recovery/safety=0。Mountain rough/smooth 短段所有 aY/角速度指标与冻结基线一致，切换/rejection/impulse/recovery/safety 全 0；每段 2164 查询 / 541 次刷新。

## 10. Black Box 与事件

逐轮增加 predictedSurfaceHeight、candidateLayerClass、previousLayerClass、supportSelectionReason、rejectedThisOuterTick、layerSwitchConfirmationState、mechanicalConstraintEligible、mechanicalConstraintRejectReason；枚举使用 typed int/dictionary 存储，导出为可读字符串。
road-support-lost 是独立语义，不当作错误高度跳层自动触发录制；terrain-support-acquired 单独记录，正常真实落地冲击仍可触发录制。连续拒绝按 wheel / previous+candidate surface / reason 合并 episode，保存 first/last step/time、count、peak |heightDelta|、impulse、|vY| 与 angular rate（含 safety 之前）。
3000 tick×4 samples：droppedEvents 10977 → 0；根因 first occurrence 从丢失变为保留；每轮一个 episode，count 12001。跨录制保存会清理 episode 指针，避免引用已清空事件。

## 11. 性能与验证

- 既有 XZ bucket/candidate 列表内资格筛选；normal 模式不分配候选列表或 decision 对象。每轮 O(1) 预测，16 槽 bounded latch/confirmation，仅使用单跳 topology Set。
- 没有新增公共地图查询；terrain fallback 法线复用，避免重复 terrain heightAt。episode 也减少重复 diagnostics 查询。typed frame 固定 879360 bytes，仍低于 1 MiB。未做长时间 benchmark。
- WheelContact 3426；SupportContinuity / mechanical 987；VerticalDynamics 107；五 fixture/局部 runtime/真实落地 11。全部通过。
- 原 heightfield normal 单测的 wheel/query 原本不在同一位置；现将测试 mount 放到实际可达的陡平面上，保留原断言，并继续检查 +0.65 m 跳面拒绝。
- typecheck 通过；唯一一次 pnpm run build -BasicValidation 通过，dist 已发布，入口 assets/index-Ch8EHwsW.js 已核对新字段。Vite 仅保留 chunk 体积提示。未执行 full core、full map/editor 或 computer-use。
- City Main SHA-256 前后一致：C86B9DFEB9B9FE381BC8C4C51FD0DC9E2A009E5285FE7297905A9F487202E596。

## 12. 剩余边界与改动文件

结构分类仍是 road/segment/link、junction、enclosure 和几何的局部推断，不能替代精确的地图 ownership / gore / barrier 语义。真实 15/25/79 cm profile/footprint 错误未修图；旧支撑 footprint 消失且新面不合格时允许 airborne，不外推旧铺装，也不强行吸附新层。极端真实落地仍可能产生大的物理冲击；完整车身碰撞不在本轮范围。
主要改动：VehicleContactSystem.ts、WheelSupportContinuity.ts、WheelMechanicalEligibility.ts、ChassisDynamics.ts、SuspensionSystem.ts、WheelContact.ts、WheelPhysicsState.ts；SurfaceMaterial.ts 与 CityGround.ts 的候选协议/静态元数据；BlackBoxSchema.ts / VehiclePhysicsBlackBox.ts；SupportContinuity targeted、VerticalDynamics fixture 和 run-wheel-support-v2 脚本。
数据：before.json、after.json、validation-summary.json、before/after-bridge-blackbox.json、baseline 源码快照。
