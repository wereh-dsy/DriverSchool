# City Main v488 完整恢复与 G17 Support Continuity 修复

## A. v488 restoration

先恢复、确认一致，再开始G17。恢复阶段没有重新设计互通、枚举几何方案、重做983km路面分析或重新推理137条遗留记录。

依据 rollback 的 restoration-manifest.json、before-rollback/、retired-v487-v488-code/，恢复 **67个文件**：9个已有文件的原v488字节，加58个撤下的新文件（含RoadCarriageway和全部原有专项脚本）。具体路径和每文件hash见 v488-restoration-consistency.json；原v488候选源也与独立原构建记录交叉验证。

完整恢复190条道路最终差异、19个object、501块sign（共520个唯一设施）及3个connectionPort差异。XZ/Y/control points、profile/ramp/split/merge、shared pavement、ribbon support、全部metadata及设施/导航引用都恢复原始数据；roadLinks/junctions保持其原状态。

RoadCarriageway、median/barrier、MarkingOwnership priority、双黄/白线、内侧边线、路灯/护栏/设施投影及FastRoadSignPlacement全部按原文件恢复。**RoadSignRenderer的MeshLambertMaterial、正常tone mapping、牌面/背板/支架均完整恢复**，包含此前效果不理想的版本；吊挂门架、脚基修复及原最终sign实例也恢复。没有保留v486材质或重做任何v488设施。

| 原v488基线比较 | 恢复结果 |
|---|---|
| 地图完整字节SHA256 | `ea12542fd1f3b4df3c67ee3bf6280c19e7a4f9be97a8b437d3d031d396e13db7`，恢复后完全相同 |
| 生产编译地图SHA256 | `b0fb53b4186e24ee05b059452d66bcaa39e6d7037f311f437d37b88ed8984d0c`，与原v488实际发布记录完全相同 |
| roads / intersections | 2944 / 302，完整定义一致 |
| objects / signs | 7103 / 3057，完整定义一致 |
| roadLinks / connectionPorts | 2579 / 71，完整定义一致 |
| 全部地图顶层结构/支撑metadata | 逐字段结构hash一致 |
| 生成及渲染源码 | 全部恢复文件逐字节一致 |
| 恢复阶段有意/未知差异 | 0 / 0 |

一致性记录完成后才修改Support Continuity。最终发布 **v489**，地图相对原v488**仅version 488→489**，其余内容仍深度相等；新源SHA256为 `94a9be105430175c0b95c416ec4ab9824da2c4b8a8851ef017478e39ade5ecdb`。地图版本替换没有重新序列化其他数据，详见 map-version-only-diff.json。

G17阶段运行时只改 src/vehicle/physics/WheelSupportContinuity.ts，另扩充其selftest并新增定向验证脚本。66个恢复后的非地图文件仍与原v488完全相同；741个保护文件中仅上述continuity及其selftest两文件变化，其他739个文件hash不变。没有修改CityGround、支撑面生成、地图几何、路牌/标线/隔离、车辆标定、悬架或mechanical eligibility。所有有意代码差异及hash见 final-source-consistency.json；未知差异0。

## B. G17 fix

### 精确根因

用户两份Black Box记录对应原v488运行时 b0fb53b4186e。先在恢复的原v488复现两例，再抓取qualification内部标量：首个错误拒绝时 requiredLength=0.287197213m，悬架范围0.198876977～0.428876977m，height=0、normal=(0,1,0)、同一逻辑路的17→18、layerClass=SAME_LAYER，但 latchCount=16。因此不是路面台阶，也不是实际不可达。

旧顺序：

1. CityGround遍历每个包含轮位的候选，调用evaluate进行资格判断。
2. 被拒绝但没有选中的上层/远层候选也写入同一轮的same-tick latch。
3. 候选排序选出正常18段后，其他候选的副作用可能已填满16槽。
4. 最终重新判断选中面时，changed surface + latchCount>=16触发unreachable-layer-switch，即使几何连续且悬架可达。记录因此同时出现SAME_LAYER与same-tick-rejection-latch。

新顺序：

1. 候选资格/排序阶段不提交rejection latch，也不清除最终拒绝状态。
2. 在同一次已有footprint查询中记录真实旧候选的有效铺装height/normal；不增加地图查询。
3. 对最终选中样本重新检查finite、normal、suspension projection和requiredLength；真实已锁定的同一surface仍拒绝。
4. 仅same logical road、严格相邻runtime index、旧/新铺装都实际覆盖查询点、当前高度及法线连续、预测平面连续且现有悬架reach成立，建立 **SAME_LAYER_CONTINUATION**。layerClass保持SAME_LAYER，confirmation=not-required，不进入层切换容量/hysteresis/confirmation。
5. 其他情形走原层级保护；真正选中的坏层仍写latch并保持到下一outer tick。

没有使用same-road→always valid；非相邻foldback、缺少旧footprint或异常高度/法线都不能获得continuation fast path。有限几何、projection、requiredLength和独立mechanical gate保留。latch容量仍16，阈值没有放宽，没有impulse clamp；每轮只增加少量标量状态，热循环无新增对象分配或地图查询。

### 原两个fixture

Touareg road-suv-v6-8at，保留真实附近colliders及原始地图支撑，120Hz；36m短脚本只规定纵向速度，垂向/pitch/roll自由积分，横向位置/航向来自用户两份记录。没有覆盖支撑采样或强制接地。

| fixture | km/h | rejection 前→后 | 四轮airborne tick 前→后 | 接地切换 前→后 | 冲量峰值 前→后 | RMS aY 前→后 | peak aY 前→后 |
|---|---:|---|---|---|---|---|---|
| 1 | 145.82 | 62→0 | 45→0 | 4→0 | 651.870117→0.000000 | 10.180796→0.140728 | 71.741765→0.301487 |
| 2 | 148.99 | 58→0 | 44→0 | 4→0 | 564.078540→0.000000 | 9.877596→0.142086 | 60.867802→0.304134 |

两例修复后四轮连续接地，safety/recovery均0。前后原始四轮样本和Black Box位于 before/、after/、g17/；精确内部错误判断见 root-cause.json 和 before/*qualification-debug.json。

### speed / lateral sweep

60/90/120/150km/h × lane center及±0.4m、±0.8m，共20例，每轮实际覆盖16→17→18→19。加两个原fixture共 **22例全部通过**：rejection=0、airborne tick=0、grounded chatter=0、mechanical impulse=0、safety/recovery=0。逐例速度、坐标、段号、四轮支撑、轮荷和aY见 g17-regression.json 及 g17/ 下各例数据。

### 全图轻量adjacent-boundary audit

覆盖全部2542条高速/快速路/主干道，164726个连续runtime segment/triangle边界，每车道一个真实边界采样，总298720个采样；使用原v488实际铺装高度/normal/contains接口及全局CityGround资格/排序逻辑。仅省略GPU发布和实体collider构造，因为该项是分类验证而非驾驶。原两个动态fixture/扫描另保留实体colliders。没有进行全图驾驶或重新审计纵断面。

| 边界结果 | 修复前 | 修复后 |
|---|---:|---:|
| 几何连续且实际footprint成立的采样 | 297936 | 297936 |
| 错误unreachable-layer-switch | 95 | 0 |
| 其他资格拒绝 | 0 | 0 |
| candidate未找到 | 0 | 0 |
| 原有非连续几何采样（单独记录） | 26 | 26 |
| 原有footprint开口/路口遮罩采样（单独记录） | 758 | 758 |

最后两类没有归为正常连续面，也没有改地图来清空。全部298720行的几何字段前后hash相同（`8da89b03031b046bab431681e2e4be2ce6eb74cd9f16b660a64f25fdec928ba2`），证明改的是共享资格逻辑。每个道路/段/车道的heightDelta、normalDot、footprint、layerClass及rejection见 adjacent-boundaries-before/after.ndjson，汇总见 adjacent-boundary-audit-before/after.json。已有26个几何不连续采样和758个开口采样不构成本轮地图修复或全图平顺认证。

### 保护回归

- Support Continuity targeted：1132断言通过；含32个未选坏候选不能污染正常支撑、无真实共享footprint/非相邻段不能使用fast path、相邻伪装坏层及同surface latch不能绕过。
- +25cm及+65cm真实选中坏层：每例24个拒绝采样，随后同tick返回可达高度仍拒绝，机械冲量=0、safety=0；下一outer tick才允许重获。
- bridge→terrain：真实2m桥面离开后road-support-lost，四轮airborne 74tick；到第74tick悬架真正可达后重获terrain，机械冲量峰值0、safety=0。
- rollover：invalid suspension projection保持拒绝，四轮不接地，机械冲量=0。
- 东侧A-B-A：实际源完整关联道路，623tick，事故处73.1488km/h；invalidABA=0、rejection=0、冲量=0、safety=0、recovery=0，合法匝道进入保留且无错误返回主线。沿用该支撑回归原协议排除实体护栏碰撞。详见 east-aba/ramp-summary.json。
- 多途经点导航targeted：35断言通过；F10/导航UI代码hash未改。
- typecheck：最终通过。期间新增测试的只读快照赋值曾触发类型错误，已改为构造独立低高度fixture并重跑targeted/typecheck；没有改运行时几何或放宽断言。

## 最终发布

本轮仅执行一次 `pnpm run build -BasicValidation`，exit 0，typecheck和生产构建成功，dist原子更新。最终地图 **City Main v489**。

当前入口：`assets/index-BZtxB-BY.js`。实际地图：`dist/assets/city-main.runtime-75a531acbd55.json`。运行时SHA256：`75a531acbd5502ad5197015f02f82fa0cfb8c2c48d9ccaf713c58190de5ddbc6`，与文件名及最终源的完整生产编译结果一致。把发布数据中的map.version恢复为488后，整个map+roadNetwork运行时hash精确回到原v488的 `b0fb53b4186e24ee05b059452d66bcaa39e6d7037f311f437d37b88ed8984d0c`，证明没有隐藏地图/设施/导航差异。

入口包含新的SAME_LAYER_CONTINUATION路径，不引用旧v486或未修复v488地图；全部恢复生成源码及其余保护文件在构建后再次核对hash。详情见 build-verification.json。已有游戏标签页需刷新/重新打开以使用新入口。仅有Vite大包体积提示，未运行full core、全车型、editor全量或computer-use。

原v488遗留互通/隔离等设计问题按原版本完整保留，本轮没有重新设计或宣称这些历史未解决项已修复；详见原 artifacts/interchange-integrated-audit/deferred.json。
