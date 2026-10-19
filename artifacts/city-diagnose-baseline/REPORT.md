# City Main 全图 diagnose baseline

Map: src/world/regional/regional-main.json  
Version: 266  
SHA: 41c433895b210548093e116b4455d62cbefd02be02be2963d4f097a0ee262184（复用 mapctl 回执，无额外 SHA 计算）

Road coverage: **2943 / 2943（100%）**  
Intersection coverage: **308 / 308（100%）**

Issue totals: error **17** / warning **414** / info **4821** / total **5252**。  
P0: **12**；P1: **132**；P2: **299**；P3: **4809**。

P0 中 **3 条为数据层面确认的无节点同层交叉**，其余 **9 条需人工确认**，不能把全部 P0 称为已证实的驾驶故障。5 条 crossing 具有共端点 link 连接链，已从 P0 移出。未进行实车碰撞验证。

## 完整性与复现

- 现有 mapctl diagnose 使用 full:true，不设置 bbox、roadId、code 或 severity 过滤。
- full 直接选中全部 2943 条道路和 308 个路口，绕过局部 600-road 限制；没有前 2000 条截断。
- retainAllIssues:true；原始文件 truncated:false，issues.length = counts.total = 5252。limit:20 只控制终端分页，明细先完整写入 diagnosis-full.json。
- 当前全部道路的求值点数均未超过自交检测点数预算；路口覆盖非零且为 100%。
- 源文件长度及最后修改时间前后一致。没有修改地图、Editor、diagnose、runtime 或车辆代码；没有 repair、apply、smooth、build 或测试套件。
- 命令与请求见 reproduction.json / request.json；CM266-00001 对应原始 issues[0]，所有 ID 固定于此回执。

## Issue 总览

| severity | count | affectedRoads | affectedIntersections |
|---|---:|---:|---:|
| error | 17 | 23 | 0 |
| warning | 414 | 507 | 111 |
| info | 4821 | 2451 | 0 |

affectedRoads 包括主道路、配对道路、路口连接道路；affectedIntersections 包括直接和明确配对路口。各行 distinct 数量不能相加。

| code | error | warning | info | count | affectedRoads | affectedIntersections |
|---|---:|---:|---:|---:|---:|---:|
| geometry.awkwardS | 0 | 2 | 0 | 2 | 2 | 0 |
| geometry.redundantControlPoints | 0 | 0 | 2288 | 2288 | 2288 | 0 |
| geometry.sharpBend | 9 | 2 | 0 | 11 | 11 | 0 |
| geometry.shortSegments | 0 | 8 | 22 | 30 | 30 | 0 |
| intersection.acuteApproach | 0 | 55 | 0 | 55 | 190 | 55 |
| intersection.approachKink | 0 | 38 | 0 | 38 | 132 | 38 |
| intersection.shortApproach | 0 | 14 | 0 | 14 | 45 | 14 |
| intersection.stalePortAngle | 0 | 59 | 0 | 59 | 226 | 59 |
| marking.crosswalkOverlap | 0 | 10 | 0 | 10 | 35 | 10 |
| marking.stopLineDisplaced | 0 | 44 | 0 | 44 | 143 | 44 |
| topology.deadEnd | 0 | 55 | 45 | 100 | 100 | 0 |
| topology.expresswayCrossing | 8 | 0 | 0 | 8 | 16 | 0 |
| topology.lowClearance | 0 | 4 | 0 | 4 | 7 | 0 |
| topology.shortConnector | 0 | 0 | 37 | 37 | 37 | 0 |
| topology.tinyFragment | 0 | 9 | 0 | 9 | 9 | 0 |
| vertical.abruptGradeChange | 0 | 77 | 0 | 77 | 77 | 0 |
| vertical.elevationPointOscillation | 0 | 17 | 0 | 17 | 17 | 0 |
| vertical.gradeReversals | 0 | 0 | 16 | 16 | 16 | 0 |
| vertical.rampReversal | 0 | 16 | 46 | 62 | 62 | 0 |
| vertical.redundantElevationPoints | 0 | 0 | 2367 | 2367 | 2367 | 0 |
| vertical.wave | 0 | 4 | 0 | 4 | 4 | 0 |

## P0：先人工确认

3 条确认交叉位于春晖东北旧 north-roundabout 节点，**与新世纪广场无关**。交点高差约 0 m，均不在已有路口铺装范围内。其余 P0 为城区附近 S68/S26 开放端及两个贴近其他道路的未接支路，修复前必须排除有意终止。

| issue ID | 区域 | severity / code | roadId | 判定 | 原因 |
|---|---|---|---|---|---|
| CM266-00014 | 春晖 | error / topology.expresswayCrossing | north-roundabout:ring-6 | confirmed data-level unjunctioned crossing | 同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000000 m。 |
| CM266-00015 | 春晖 | error / topology.expresswayCrossing | north-roundabout:entry-3 | confirmed data-level unjunctioned crossing | 同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000377 m。 |
| CM266-00016 | 春晖 | error / topology.expresswayCrossing | north-roundabout:exit-3 | confirmed data-level unjunctioned crossing | 同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000000 m。 |
| CM266-00250 | 北岭外围 | warning / topology.deadEnd | regional:S68:out | manual confirmation required / possible navigation cutoff | 城区附近快速路开放端；最近同层道路 regional:S68:in:split16:split22，水平距 16.250 m、高差 0.000 m。 |
| CM266-00251 | 通港 | warning / topology.deadEnd | regional:S68:in | manual confirmation required / possible navigation cutoff | 城区附近快速路开放端；最近同层道路 regional:S68:out:split12:split30:split36:split88:split94，水平距 16.250 m、高差 0.000 m。 |
| CM266-00252 | 南城 | warning / topology.deadEnd | regional:S26:out:split154 | manual confirmation required / possible navigation cutoff | 城区附近快速路开放端；最近同层道路 regional:logistics:N-to-E-star，水平距 7.500 m、高差 0.000 m。 |
| CM266-00280 | 南城 | warning / topology.deadEnd | regional:S26:in:split82:split96:split130:split136:split150:split168 | manual confirmation required / possible navigation cutoff | 城区附近快速路开放端；最近同层道路 regional:logistics:W-to-N-star:acceleration，水平距 7.500 m、高差 0.000 m。 |
| CM266-00284 | 南城 | warning / topology.deadEnd | regional:S26:out:split370:lane188 | manual confirmation required / possible navigation cutoff | 城区附近快速路开放端；最近同层道路 regional:logistics:N-to-E-star:deceleration，水平距 7.500 m、高差 0.000 m。 |
| CM266-00285 | 北岭外围 | warning / topology.deadEnd | regional:S68:in:split16:split22 | manual confirmation required / possible navigation cutoff | 城区附近快速路开放端；最近同层道路 regional:S68:out，水平距 16.250 m、高差 0.000 m。 |
| CM266-00286 | 通港 | warning / topology.deadEnd | regional:S68:out:split12:split30:split36:split88:split94 | manual confirmation required / possible navigation cutoff | 城区附近快速路开放端；最近同层道路 regional:S68:in，水平距 16.250 m、高差 0.000 m。 |
| CM266-02774 | 星湖 / 北城 / 大学片区 | info / topology.deadEnd | v4-diagonal-split-split-m91 | manual confirmation required / possible navigation cutoff | 支路端点接近其他道路但没有显式连接；最近同层道路 v4-north-split-2-m91，水平距 0.615 m、高差 0.000 m。 |
| CM266-02783 | 春晖 | info / topology.deadEnd | v9-newcity-seven-split-split-split-split-split | manual confirmation required / possible navigation cutoff | 支路端点接近其他道路但没有显式连接；最近同层道路 v9-chunhui-east-split-split-split，水平距 0.214 m、高差 0.369 m。 |

后续方法：先确认道路职责和终止场景，再 manual topology edit；旧环形节点优先查重复 approach，必要时去掉重复线或组织一个合理路口。不得直接批量 smooth。

## 共端点 crossing：倾向误报

| issue ID | road pair | 交点距共端点 | 显式 link 链 |
|---|---|---:|---|
| CM266-00010 | regional:S37:in:split108:split126 / regional:xichuan:N-to-E-turbine:acceleration | 2.32 m | regional:S37:in:split108:split126:end → regional:S37:in:split108:split126:lane152:start → regional:xichuan:N-to-E-turbine:acceleration:end |
| CM266-00011 | regional:G38:out:split10:split24:split284:split354 / regional:shangu:on:1 | 27.41 m | regional:G38:out:split10:split24:split284:split354:end → regional:G38:out:split10:split24:split284:split354:split356:start → regional:shangu:on:1:end |
| CM266-00012 | regional:S37:in:split108:split126:split302:split394 / regional:hewan:on:-1 | 33.21 m | regional:S37:in:split108:split126:split302:split394:end → regional:S37:in:split108:split126:split302:split394:split396:start → regional:hewan:on:-1:end |
| CM266-00013 | ring-cw-1-split-3-split-split / v8-ring-north:off--1 | 4.75 m | ring-cw-1-split-3-split-split:start → ring-cw-1-split-3-split:end → v8-ring-north:off--1:start |
| CM266-00017 | ring-ccw-1-split-3 / system-south:S-to-E-right | 6.58 m | ring-ccw-1-split-3:end → ring-ccw-1-split-2:start → system-south:S-to-E-right:end |

这 5 条 XYZ 共端点误差均为 0，且存在经第三段主线连接的明确拓扑。离共端点 27–33 m 的两条仍需顺带看并入几何，但不因此创建平交。

## Low clearance：全部 4 条

| issue ID | road pair | 中心线 yA / yB (m) | 实际中心线高差 | 判断 |
|---|---|---:|---:|---|
| CM266-00305 | regional:v3:S29:out:32 / regional:v3:northeast-chenjiang:S-to-W-turbine | 39.333 / 44.480 | 5.147 m | borderline / 临界 |
| CM266-00306 | regional:v3:S29:in:15 / regional:v3:northeast-chenjiang:S-to-W-turbine | 39.328 / 44.480 | 5.153 m | borderline / 临界 |
| CM266-00307 | system-north:S-to-E-right / system-north:S-to-W-star | 2.503 / 7.353 | 4.850 m | critical / 临界 |
| CM266-00308 | ring-cw-0-split-split-split-2-split-split / system-north:E-to-S-star | 8.000 / 13.447 | 5.447 m | possibly reasonable / 可能合理 |

4.850 m 优先核对；5.147 / 5.153 m 临界；5.447 m 可能合理但接近工具 5.5 m 阈值。当前均不能仅凭中心线高差断言结构明显非法。后续须核对桥面厚度、桥底、护栏和车辆通行包络，不自动抬升。

## P1 工程判断

- 北互通 E-to-S-star / S-to-W-star 同时出现 23 / 22 个百分点的局部坡度变化、高频高程点及 wave，另有 4.85 / 5.45 m 交叉高差，优先联合复核。
- 东互通 S-to-W-turbine / N-to-E-turbine 各有 8 个高频高程点、12 次坡向反转，wave 残差过零 13 次，应标 suspicious vertical oscillation。其余 east turbine 也有局部坡度折点。
- 中央互通四条 semi 匝道均有高频高程点；S-to-W-semi 局部坡度变化约 16 个百分点。这针对匝道，不要求重构广场。
- 机场 / 晨江外围也有短尺度高程告警，按区域队列处理。
- 单独 rampReversal 若只有少量长尺度升降、无 wave/高频点，标 likely intentional，放 P3。不能给 turbine / loop 批量设置 monotonic。
- 没有 excessiveGrade / steepGrade 记录，不代表纵坡折点已经平顺。

## 高价值区域核查

- **新世纪广场**：两个六臂共享节点 v911-plaza-axis-north/south 均参与；未触发其 mouth、stop line、crosswalk、height、duplicate 或 crossing 告警。south-nb-tail 的 56 个短段是曲线密集采样，按实测转角列 P3。中央互通的 P1 匝道另列。
- **承景路 / 望川路**：主线、frontage、主辅 ramp 及相连路口均参与。不能由未报错推断全部车道路线可达；沿线标线和 approach 问题见区域队列。
- **明远快速路**：主线各段均检查，无主线 P0/P1 纵坡/净空记录；两个中部地面节点有 13.6 / 14.0 m 停止线偏移（P2）。复核 mouth 与标线，保留地面节点和间歇立体化职责。
- **内环北段 / 北部径向道路**：shifu / finance / central north 与共享路口均检查，没有 duplicate junction / endpointGap 报告。逐节点查标线与方向，不为消告警改成平行梳子。
- **环城门户**：北门户重点为低净空和星形匝道纵向起伏；西/南门户检查紧凑匝道与连接簇。merge 共端点误报已单独处理。
- **基础连通与引用**：2943 条道路在 roadLinks / intersections 无向引用图上构成 1 个分量；引用详情见 reference-and-topology-review.json。这不是单向车道路径证明。
- **近城服务区**：东郊、北麓及已删除晨江服务区/北岭停车区的活动 road/object/sign 引用命中 0 项。

## 主辅可达性与 frontage 定向复核

仅追加本轮高价值走廊的只读核查，不运行全图导航回归。

- 现有 16 条主辅 ramp：16/16 有正确方向的 incoming/outgoing 路由连接；on 为辅路 → ramp → 主线，off 为主线 → ramp → 辅路。最大逐段坡度 10.802%。
- 每个主要方位的双向 on/off 共 8 对。主线端纵向轴距：西侧东西向约 1030 m、东侧约 770 m、北侧南北向约 815 m、南侧约 1060 m。这里只报告现状距离，不作为工程规范合格声明。
- ramp 地面端到其连接 frontage 最近路口中心的最小距离为 73 m；该距离不是路口铺装边界净距。
- 四条仅允许 frontage 与 plaza roads 的 RoutePlanner 路线全部可达：承景路 EB/WB、望川路 SB/NB。路由中均没有快速路主线，不靠普通城市街网绕行。
- 两个广场节点均为 6 臂 divided_cross、signalized=true；连接道路不包含东西/南北快速路主线。
- 完整 ramp ID、相邻道路、连接方向、坐标、坡度、间距和路线 roadIds 见 high-value-access-review.json。RoutePlanner 的逻辑连接路径不代表已完成驾驶舒适性或标线视觉验收。

P1 共 132 条记录涉及 82 条道路；同一条匝道可同时有 abruptGradeChange、wave、oscillation，不能把记录数量视为独立工程缺陷数量。

## 区域 repair queue

| 区域 | P0 | P1 | P2 | P3 | 状态 |
|---|---:|---:|---:|---:|---|
| 新世纪广场 / 中央互通 | 0 | 18 | 7 | 44 | P0/P1 review queued |
| 承景路东西快速路走廊 | 0 | 20 | 14 | 190 | P0/P1 review queued |
| 望川路南北快速路走廊 | 0 | 0 | 18 | 136 | no P0/P1 issue found |
| 明远快速路 | 0 | 0 | 2 | 13 | no P0/P1 issue found |
| 内环大道 | 0 | 0 | 14 | 16 | no P0/P1 issue found |
| 星湖 / 北城 / 大学片区 | 1 | 0 | 13 | 92 | P0/P1 review queued |
| 西兴 | 0 | 2 | 48 | 72 | P0/P1 review queued |
| 清和 | 0 | 0 | 5 | 5 | no P0/P1 issue found |
| 锦城 | 0 | 0 | 5 | 5 | no P0/P1 issue found |
| 春晖 | 4 | 9 | 107 | 231 | P0/P1 review queued |
| 通港 | 2 | 3 | 28 | 186 | P0/P1 review queued |
| 南城 | 3 | 7 | 18 | 303 | P0/P1 review queued |
| 西环门户 | 0 | 8 | 3 | 76 | P0/P1 review queued |
| 北环门户 | 0 | 13 | 3 | 84 | P0/P1 review queued |
| 南环门户 | 0 | 8 | 6 | 90 | P0/P1 review queued |
| 东部外围 / G17 | 0 | 1 | 0 | 265 | P0/P1 review queued |
| 机场方向 | 0 | 31 | 1 | 534 | P0/P1 review queued |
| 晨江外围 | 0 | 7 | 0 | 684 | P0/P1 review queued |
| 北岭外围 | 2 | 5 | 2 | 508 | P0/P1 review queued |
| 其他外围干线 | 0 | 0 | 5 | 1275 | no P0/P1 issue found |

### Q1 — 春晖

P0 4 / P1 9 / P2 107 / P3 231。P0/P1 review queued。

- CM266-00014 · P0 · error · topology.expresswayCrossing · north-roundabout:ring-6：同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000000 m。 误报判断：unlikely。后续方法：manual topology edit after visual confirmation; remove redundant approach or create one intentional junction。
- CM266-00015 · P0 · error · topology.expresswayCrossing · north-roundabout:entry-3：同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000377 m。 误报判断：unlikely。后续方法：manual topology edit after visual confirmation; remove redundant approach or create one intentional junction。
- CM266-00016 · P0 · error · topology.expresswayCrossing · north-roundabout:exit-3：同层中心线交叉，无共用端点、直接 link、共同路口，交点也不在已有路口铺装范围内。高差 0.000000 m。 误报判断：unlikely。后续方法：manual topology edit after visual confirmation; remove redundant approach or create one intentional junction。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q1。

### Q2 — 南城

P0 3 / P1 7 / P2 18 / P3 303。P0/P1 review queued。

- CM266-00252 · P0 · warning · topology.deadEnd · regional:S26:out:split154：城区附近快速路开放端；最近同层道路 regional:logistics:N-to-E-star，水平距 7.500 m、高差 0.000 m。 误报判断：possible intentional terminus。后续方法：manual topology edit or confirm intentional signed/closed terminus。
- CM266-00280 · P0 · warning · topology.deadEnd · regional:S26:in:split82:split96:split130:split136:split150:split168：城区附近快速路开放端；最近同层道路 regional:logistics:W-to-N-star:acceleration，水平距 7.500 m、高差 0.000 m。 误报判断：possible intentional terminus。后续方法：manual topology edit or confirm intentional signed/closed terminus。
- CM266-00284 · P0 · warning · topology.deadEnd · regional:S26:out:split370:lane188：城区附近快速路开放端；最近同层道路 regional:logistics:N-to-E-star:deceleration，水平距 7.500 m、高差 0.000 m。 误报判断：possible intentional terminus。后续方法：manual topology edit or confirm intentional signed/closed terminus。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q2。

### Q3 — 北岭外围

P0 2 / P1 5 / P2 2 / P3 508。P0/P1 review queued。

- CM266-00250 · P0 · warning · topology.deadEnd · regional:S68:out：城区附近快速路开放端；最近同层道路 regional:S68:in:split16:split22，水平距 16.250 m、高差 0.000 m。 误报判断：possible intentional terminus。后续方法：manual topology edit or confirm intentional signed/closed terminus。
- CM266-00285 · P0 · warning · topology.deadEnd · regional:S68:in:split16:split22：城区附近快速路开放端；最近同层道路 regional:S68:out，水平距 16.250 m、高差 0.000 m。 误报判断：possible intentional terminus。后续方法：manual topology edit or confirm intentional signed/closed terminus。
- CM266-00328 · P1 · warning · vertical.abruptGradeChange · regional:v2:northwest:S-to-W-loop：短区间坡度变化 7.2 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q3。

### Q4 — 通港

P0 2 / P1 3 / P2 28 / P3 186。P0/P1 review queued。

- CM266-00251 · P0 · warning · topology.deadEnd · regional:S68:in：城区附近快速路开放端；最近同层道路 regional:S68:out:split12:split30:split36:split88:split94，水平距 16.250 m、高差 0.000 m。 误报判断：possible intentional terminus。后续方法：manual topology edit or confirm intentional signed/closed terminus。
- CM266-00286 · P0 · warning · topology.deadEnd · regional:S68:out:split12:split30:split36:split88:split94：城区附近快速路开放端；最近同层道路 regional:S68:in，水平距 16.250 m、高差 0.000 m。 误报判断：possible intentional terminus。后续方法：manual topology edit or confirm intentional signed/closed terminus。
- CM266-00336 · P1 · warning · vertical.abruptGradeChange · v4-access-5：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairElevation; preserve junction/deck elevations。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q4。

### Q5 — 星湖 / 北城 / 大学片区

P0 1 / P1 0 / P2 13 / P3 92。P0/P1 review queued。

- CM266-02774 · P0 · info · topology.deadEnd · v4-diagonal-split-split-m91：支路端点接近其他道路但没有显式连接；最近同层道路 v4-north-split-2-m91，水平距 0.615 m、高差 0.000 m。 误报判断：possible intentional terminus。后续方法：manual topology edit or confirm intentional signed/closed terminus。
- CM266-00006 · P2 · error · geometry.sharpBend · v61-university-north-split-split：98° bend over 8 m 误报判断：possible intentional low-speed turn。后续方法：smoothRoad; preserve meaningful regional direction。
- CM266-00055 · P2 · warning · intersection.acuteApproach · urban-junction-179：Arms north and south meet at 0° 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q5。

### Q6 — 北环门户

P0 0 / P1 13 / P2 3 / P3 84。P0/P1 review queued。

- CM266-00307 · P1 · warning · topology.lowClearance · system-north:S-to-E-right：中心线高差 4.85 m；不是桥底结构净空，须核对结构厚度与车辆通行包络。 误报判断：possible; centerline separation is not underside clearance。后续方法：manual clearance adjustment after structural envelope review。
- CM266-00308 · P1 · warning · topology.lowClearance · ring-cw-0-split-split-split-2-split-split：中心线高差 5.45 m；不是桥底结构净空，须核对结构厚度与车辆通行包络。 误报判断：possible; centerline separation is not underside clearance。后续方法：manual clearance adjustment after structural envelope review。
- CM266-00322 · P1 · warning · vertical.abruptGradeChange · v8-ring-north:off--1：短区间坡度变化 7.7 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q6。

### Q7 — 承景路东西快速路走廊

P0 0 / P1 20 / P2 14 / P3 190。P0/P1 review queued。

- CM266-00324 · P1 · warning · vertical.abruptGradeChange · system-east:N-to-W-right：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00325 · P1 · warning · vertical.abruptGradeChange · system-east:S-to-E-right：短区间坡度变化 7.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00348 · P1 · warning · vertical.abruptGradeChange · system-east:E-to-N-right：短区间坡度变化 7.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q7。

### Q8 — 新世纪广场 / 中央互通

P0 0 / P1 18 / P2 7 / P3 44。P0/P1 review queued。

- CM266-00333 · P1 · warning · vertical.abruptGradeChange · system-central:W-to-S-right：短区间坡度变化 13.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00373 · P1 · warning · vertical.abruptGradeChange · system-central:S-to-E-right：短区间坡度变化 7.6 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00383 · P1 · warning · vertical.abruptGradeChange · system-central:W-to-N-semi：短区间坡度变化 12.2 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q8。

### Q9 — 机场方向

P0 0 / P1 31 / P2 1 / P3 534。P0/P1 review queued。

- CM266-00321 · P1 · warning · vertical.abruptGradeChange · regional:v3:airport-south:S-to-E-right：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00326 · P1 · warning · vertical.abruptGradeChange · regional:v3:airport-distributor:N-to-W-right：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00327 · P1 · warning · vertical.abruptGradeChange · regional:v3:airport-distributor:S-to-E-right：短区间坡度变化 7.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q9。

### Q10 — 晨江外围

P0 0 / P1 7 / P2 0 / P3 684。P0/P1 review queued。

- CM266-00305 · P1 · warning · topology.lowClearance · regional:v3:S29:out:32：中心线高差 5.15 m；不是桥底结构净空，须核对结构厚度与车辆通行包络。 误报判断：possible; centerline separation is not underside clearance。后续方法：manual clearance adjustment after structural envelope review。
- CM266-00306 · P1 · warning · topology.lowClearance · regional:v3:S29:in:15：中心线高差 5.15 m；不是桥底结构净空，须核对结构厚度与车辆通行包络。 误报判断：possible; centerline separation is not underside clearance。后续方法：manual clearance adjustment after structural envelope review。
- CM266-00353 · P1 · warning · vertical.abruptGradeChange · regional:v3:north-river:N-to-E-turbine：短区间坡度变化 7.3 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q10。

### Q11 — 南环门户

P0 0 / P1 8 / P2 6 / P3 90。P0/P1 review queued。

- CM266-00320 · P1 · warning · vertical.abruptGradeChange · system-south:E-to-S-loop：短区间坡度变化 12 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00332 · P1 · warning · vertical.abruptGradeChange · system-south:S-to-W-semi：短区间坡度变化 13.8 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00334 · P1 · warning · vertical.abruptGradeChange · system-south:S-to-E-right：短区间坡度变化 17.1 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q11。

### Q12 — 西环门户

P0 0 / P1 8 / P2 3 / P3 76。P0/P1 review queued。

- CM266-00318 · P1 · warning · vertical.abruptGradeChange · system-west:E-to-S-loop：短区间坡度变化 11.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00319 · P1 · warning · vertical.abruptGradeChange · system-west:W-to-N-loop：短区间坡度变化 11.9 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。
- CM266-00323 · P1 · warning · vertical.abruptGradeChange · system-west:W-to-S-right：短区间坡度变化 8.5 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q12。

### Q13 — 西兴

P0 0 / P1 2 / P2 48 / P3 72。P0/P1 review queued。

- CM266-00368 · P1 · warning · vertical.abruptGradeChange · v8-beijing-road-split-split-split-split：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairElevation; preserve junction/deck elevations。
- CM266-00376 · P1 · warning · vertical.abruptGradeChange · urban-underpass-west-link：短区间坡度变化 10 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairElevation; preserve junction/deck elevations。
- CM266-00035 · P2 · warning · intersection.acuteApproach · urban-junction-75：Arms south and west meet at 28° 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q13。

### Q14 — 东部外围 / G17

P0 0 / P1 1 / P2 0 / P3 265。P0/P1 review queued。

- CM266-00349 · P1 · warning · vertical.abruptGradeChange · regional:binhe:on:-1：短区间坡度变化 9.4 个百分点；即使最大坡度不超限，也可能有明显纵向折点。 误报判断：possible; inspect authored vertical transition。后续方法：repairRamp; preserve required over/under crossings。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q14。

### Q15 — 望川路南北快速路走廊

P0 0 / P1 0 / P2 18 / P3 136。no P0/P1 issue found。

- CM266-00048 · P2 · warning · intersection.acuteApproach · urban-junction-33：Arms north and east meet at 9° 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00049 · P2 · warning · intersection.acuteApproach · urban-junction-46：Arms north and east meet at 0° 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00051 · P2 · warning · intersection.acuteApproach · urban-junction-49：Arms north and east meet at 22° 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q15。

### Q16 — 内环大道

P0 0 / P1 0 / P2 14 / P3 16。no P0/P1 issue found。

- CM266-00032 · P2 · warning · intersection.acuteApproach · urban-junction-25：Arms north and west meet at 3° 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00056 · P2 · warning · intersection.acuteApproach · urban-junction-181：Arms south and west meet at 3° 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00088 · P2 · warning · intersection.approachKink · urban-junction-25：Approach north runs along the junction edge; smooth it before rebuilding markings 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q16。

### Q17 — 锦城

P0 0 / P1 0 / P2 5 / P3 5。no P0/P1 issue found。

- CM266-00044 · P2 · warning · intersection.acuteApproach · urban-junction-169：Arms north and east meet at 9° 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00094 · P2 · warning · intersection.approachKink · urban-junction-169：Approach north runs along the junction edge; smooth it before rebuilding markings 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00271 · P2 · warning · topology.deadEnd · v6-civic-north-link-v91：城市道路开放端，最近同层道路距 20.04 m；可能有意不贯通，先核查再决定重接。 误报判断：possible。后续方法：manual endpoint and navigation review。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q17。

### Q18 — 清和

P0 0 / P1 0 / P2 5 / P3 5。no P0/P1 issue found。

- CM266-00124 · P2 · warning · intersection.shortApproach · urban-junction-36：Approach v4-central-split-3-split-2-m91 is only 2.9 m long 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00126 · P2 · warning · intersection.shortApproach · urban-junction-120：Approach v4-central-split-3-split-2-m91 is only 2.9 m long 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00217 · P2 · warning · marking.stopLineDisplaced · urban-junction-89：Stop line on south is 12.8 m from the mouth because the approach is tangential 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q18。

### Q19 — 其他外围干线

P0 0 / P1 0 / P2 5 / P3 1275。no P0/P1 issue found。

- CM266-00310 · P2 · warning · topology.tinyFragment · regional:S18:out:3：Road fragment is only 4.2 m long 误报判断：possible。后续方法：manual topology edit。
- CM266-00311 · P2 · warning · topology.tinyFragment · regional:S18:in:11：Road fragment is only 0.8 m long 误报判断：possible。后续方法：manual topology edit。
- CM266-00313 · P2 · warning · topology.tinyFragment · regional:v3:S89-extension2:out:10：Road fragment is only 2.5 m long 误报判断：possible。后续方法：manual topology edit。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q19。

### Q20 — 明远快速路

P0 0 / P1 0 / P2 2 / P3 13。no P0/P1 issue found。

- CM266-00248 · P2 · warning · marking.stopLineDisplaced · access-mingyuan-inner-signal：Stop line on north is 13.6 m from the mouth because the approach is tangential 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。
- CM266-00249 · P2 · warning · marking.stopLineDisplaced · access-mingyuan-zhongshan-signal：Stop line on north is 14 m from the mouth because the approach is tangential 误报判断：possible, especially shared/divided approaches。后续方法：repairIntersection after confirming tangents and pavement ownership。

完整 issue ID、对象、原因、误报判断和方法见 repair-queue.json 的 Q20。

## 限制与交付文件

现有 diagnose 每对道路只保留首个交叉，并按 code/road/intersection/station 去重；数量代表去重后的诊断记录，不等于所有物理缺陷出现次数。水平 loop 自交豁免仍存在。全对象覆盖不等于全部碰撞/导航场景穷尽证明。本轮未发现对象覆盖截断 bug，未修改诊断逻辑。

完整原始记录：diagnosis-full.json；error/warning 审阅：issues-error-warning.json；info 聚合：issues-info-summary.json；全部分区建议：repair-queue.json / repair-queue-detail.md；覆盖：coverage.json；交叉/端点证据：review-evidence.json；引用核查：reference-and-topology-review.json。

下一轮先确认 P0，再按北环门户 → 承景路东侧互通 → 中央互通 → 机场/晨江分批处理 P1；P2 在对应区域核对，P3 冗余数据不必统一修复。**本轮未修改地图、未 repair、未 build。**
