# City Main pavement/elevation seam 全量复核：v481 → v484

本轮覆盖全部 2401 个初始候选（道路 2261、路口边界 140），合并为 1972 个区域；另复查 18 个修复后新增区域，合计 1990 个区域，最终扫描没有未归类区域。不是只抽查高风险列表，也没有以 warning=0 为目标。

## 结论与修复规模

| 结论 | 区域数 |
|---|---:|
| FIXED | 185 |
| INTENTIONAL_PROFILE | 599 |
| GRADE_SEPARATED | 1192 |
| NON_DRIVABLE_OVERLAP | 5 |
| DEFER_UNCERTAIN | 9 |

- 严格 SAFE_AUTO_FIX 候选/自动应用：0/0；所有修复均为审查后的 Kernel 事务。
- 改动 126 条道路，3167 个原节点仅改 Y，增加 13229 个位于原路径上的纵断面控制点；最大局部 Y 修正 7.7035m（机场匝道错误共用铺装纵断面，非一般厘米级接缝）。
- 全部原 XZ 节点保留，原水平路径长度不变，新增节点均落在原折线上。ID、车道、宽度、信号、路牌、对象、连接及导航拓扑均不变。
- 10 个路口采用局部落地归属；2 个旧的 -24mm 地面 hub datum 与拥有它的端点统一为 0。9 条已证实有弯道支撑平面问题的道路，选用现有可视 edge-chain ribbon 的精确三角形支撑。
- 路口派生 pavement/marking footprint 是本轮明确的结构例外；道路中心线 XZ 与路口连接/信号/XZ 锚点未改变。所有逐路纵坡、坡折、端点和区间见 [changed-region-validation.json](changed-region-validation.json)。

## 修复内容

Inner Ring、G38、S68 的共享铺装/双向分段采用共同参考纵断面，连接端点随所属道路同步。中央、北部及机场等匝道接入处以实际父路连续链为基准，局部恢复正确高度过渡。城市道路的平面路口不再无条件拥有远处下坡引道。物流/工业区、展览路及部分分级弯道修正了胶囊支撑平面与现有可视 ribbon 不一致的问题。

较大修正及全部道路 ID/范围在 [逐路指标](changed-region-validation.json)；每个区域的 segment IDs、坐标范围、normalDot、overlap、grade、拓扑和结论在 [all-clusters.json](all-clusters.json)。

## 撤回不安全候选

中央 W→S、E→S 和南互通 E→S 的部分拟合在实际支撑取样中更差，保留原纵断面。随后对所有改动道路做精确中心线交叉审计，发现机场南侧 E→S、西市场上跨、港区下穿的过长纵断面拟合压缩既有跨路高差，已恢复/缩短。最终 [交叉审计](changed-crossing-audit.json) 新增净空回归为 0。

港区入口短落地方案虽然清除了部分几何提示，但新增实际回放出现约 1.58m 支撑切换，因此撤回入口新归属，保留旧入口；出口的独立修复通过回放并保留。这部分仍明确列为待定，没有把恢复原行为算作新修复。过程 receipts 保留：

- [整批审查预览/语义 diff](continuation-receipt.json)（v481→482）。
- [跨路保护修正](clearance-correction-receipt.json)（v482→483）。
- [保留受约束入口](port-entrance-retained-receipt.json)（v483→484）。

## 最大的已修复区域

下面为共享核心铺装投影高度差；不是车辆每帧跳变。轮迹/实车结果见后表。

| 道路/路口 | 坐标 x,z | 修复前最大差 m | 修复后 m |
|---|---|---:|---:|
| `regional:v3:G17-extension185:out:1` ↔ `regional:v3:chenjiang-foldback` | 14617.2, 2617.3 | 11.9584 | 0.0000 |
| `ew-eb-split-3` ↔ `system-central:W-to-N-semi` | -462.0, -126.6 | 7.3129 | 0.0065 |
| `regional:v3:S36-extension54:in:21:revision411` ↔ `regional:v3:airport-distributor:W-to-N-turbine` | -8112.6, -1057.9 | 7.2143 | 0.0010 |
| `regional:v3:S36-extension54:out:8:revision415:lane4522-split` ↔ `regional:v3:airport-distributor:N-to-E-turbine` | -8149.2, -1047.0 | 7.0448 | 0.0291 |
| `regional:v3:S89-extension2:out:10-split-2` ↔ `regional:v3:airport-south:N-to-E-turbine` | -5912.1, -796.3 | 6.6766 | 0.0000 |
| `ring-ccw-2-split-split-split-split-split` ↔ `system-north:E-to-S-star` | 393.5, -1857.2 | 6.3094 | 0.0000 |
| `regional:v3:S36-extension54:in:20:revision391:lane4494-split` ↔ `regional:v3:airport-distributor:S-to-W-turbine` | -7443.4, -122.2 | 6.0844 | 0.0024 |
| `regional:v3:S36-extension54:out:9:revision435` ↔ `regional:v3:airport-distributor:E-to-S-turbine` | -7478.3, -114.3 | 6.1607 | 0.0865 |
| `ew-eb-split` ↔ `system-central:N-to-E-semi` | 529.6, -135.0 | 6.0634 | 0.0000 |
| `ew-eb-split-2-split-split-split` ↔ `system-central:N-to-E-semi` | 525.0, -136.4 | 6.0085 | 0.0000 |
| `ew-eb-split-4-split-split-split` ↔ `system-central:W-to-N-semi` | -479.6, -125.6 | 5.9834 | 0.0000 |
| `ring-ccw-3-split-3-split-3` ↔ `system-north:S-to-W-star` | -342.0, -1878.2 | 5.4613 | 0.0000 |
| `junction:urban-junction-235` ↔ `v8-port-works-c91` | 890.9, 2375.5 | 5.4086 | 0.0000 |
| `junction:urban-junction-235` ↔ `v8-port-south-m91` | 893.7, 2374.6 | 5.3873 | 0.0000 |
| `ring-ccw-2-split` ↔ `system-east:S-to-W-turbine` | 2350.6, 103.9 | 4.7861 | 0.0000 |

## 扫描和验证

| 指标 | v481 | v484 |
|---|---:|---:|
| 道路候选（2cm） | 2261 | 2077 |
| LIKELY_FIX | 236 | 225 |
| MANUAL_REVIEW | 864 | 715 |
| 自动判定分层 | 1161 | 1137 |
| 路口边界候选 | 140 | 125 |
| 扫描聚合区域 | 1972 | 1831 |
| 局部 validate 错误 | 0 | 0 |
| 局部 validate 提示 | 145 | 149 |
| 拓扑连通分量/最大分量 | 1/2944 | 1/2944 |

扫描最高投影高差仍为 12.7381m，已按结构和拓扑归类；高差本身不是错误。最终保留的复杂候选是“仍需看语义/结构”，不能用最终 raw warning 数直接代表未审查数。新增纵断面节点会触发 shortSegments/redundantControlPoints 提示；本轮保留这些可解释的提示，未改诊断阈值。定向 diagnose 覆盖 8 条代表道路，无新增 error，详见 [before/after](continuation-targeted-diagnose.json)。拓扑 ID/连接完整相同且仍为一个覆盖 2944 条道路的分量，无 dangling 引用。未运行完整 navigation/UI 套件。

## 实际接触短回放

使用现有 VehicleDynamics、VehicleContactSystem 和黑匣子。固定纵向速度、正常转向跟踪；排除实体护栏来单独验证铺装支撑。裁剪 fixture 直接使用完整地图已编译的路口 footprint，避免重新归一化裁剪图改变边界。

| 区域 | 最大切换残差 m（前→后） | height-jump 事件（前→后） | 离地转换（前→后） |
|---|---:|---:|---:|
| shared-ground-junction | 0.379135 → 0.000000 | 1 → 0 | 4 → 0 |
| airport-ramp-terminal | 0.007545 → 0.000064 | 0 → 0 | 0 → 0 |
| depressed-junction-landing | 0.497209 → 0.000983 | 4 → 0 | 4 → 0 |
| depressed-crossing-approach | 0.000000 → 0.000000 | 0 → 0 | 0 → 0 |
| graded-ribbon-bend | 0.007335 → 0.001854 | 0 → 0 | 0 → 0 |

修复后五段均保持四轮 grounded、0 rejected samples、0 mechanical impulse、0 safety events；港区入口保持原行为，不据此宣称其名义轮迹问题已解决。原 (2216,2140) 事故另做东西双向 16m/20kmh 回放，均 0 height-jump、0 离地，原修复未复发。证据：[五段回放](continuation-contact-regression.json)、[原事故回归](fixture-regression.json)。这些短回放不代表全地图长时间驾驶验证。

## 剩余 9 个复杂区域

| 道路/路口 | 坐标 x,z | 轮迹残差 m（前→后） | 待定原因 |
|---|---|---:|---|
| `direction-inner-sw-section-section` ↔ `v8-gongren-street-split-split-split-m91` | -992.8, 732.0 | 0.4973 → 0.0027 | 剩余是名义车道轮迹进入既有 concrete/grass 归属区；当前 asphalt 切换残差低于 2cm。修复涉及铺装边界/横向几何，不能仅靠抬压 Y 保证正确。 |
| `junction:urban-junction-119` ↔ `v4-west-market-split-split-3-c91` | -1580.8, 740.8 | 1.2683 → 0.8587 | 距地面路口约 55.8m 就必须保住跨路约 5.95m 高差；16m 平台方案会把高差降到 4.13m，已撤回。保留桥坡，路口接缝仍需结构方案。 |
| `junction:urban-junction-234` ↔ `v8-port-works-c91` | 785.8, 2131.2 | 0.4950 → 0.4950 | 入口急角路口、下穿纵坡、原有 6m 跨路高差同时约束；短落地方案在新增入口回放中产生跳动，已撤回该入口方案。保留其旧铺装归属，出口修复独立保留。 |
| `ring-ccw-2-split-split-2` ↔ `system-east:S-to-E-right` | 2350.6, -51.9 | 0.0014 → 0.0014 | 剩余是名义车道轮迹进入既有 concrete/grass 归属区；当前 asphalt 切换残差低于 2cm。修复涉及铺装边界/横向几何，不能仅靠抬压 Y 保证正确。 |
| `ring-cw-1-split-split-2` ↔ `system-east:N-to-W-right` | 2322.7, -249.8 | 0.0015 → 0.0015 | 剩余是名义车道轮迹进入既有 concrete/grass 归属区；当前 asphalt 切换残差低于 2cm。修复涉及铺装边界/横向几何，不能仅靠抬压 Y 保证正确。 |
| `ring-cw-2-split-split` ↔ `system-south:E-to-S-loop` | -75.1, 2110.5 | 0.2297 → 0.2297 | 既有环线/南互通连接处仍有约 23cm 支撑残差；候选拟合把残差增至约 41cm，已恢复原纵断面。 |
| `v4-access-5` ↔ `v4-access-5` | 892.4, 2512.1 | 0.2471 → 0.2012 | 纵坡弯道自身铺装重叠，局部平台和共享 ribbon 后仍约 20cm 支撑残差；继续压平会影响桥段及过渡纵坡，保留待定。 |
| `v4-industrial-split-2-split-split-c91` ↔ `v8-port-south-split-split-2-m91` | 1241.0, 2833.9 | 1.0482 → 0.0120 | 剩余是名义车道轮迹进入既有 concrete/grass 归属区；当前 asphalt 切换残差低于 2cm。修复涉及铺装边界/横向几何，不能仅靠抬压 Y 保证正确。 |
| `v6-logistics-one-split-3-split-2-m91` ↔ `v8-port-works-c91` | 799.2, 2149.9 | 0.4966 → 0.4966 | 入口急角路口、下穿纵坡、原有 6m 跨路高差同时约束；短落地方案在新增入口回放中产生跳动，已撤回该入口方案。保留其旧铺装归属，出口修复独立保留。 |

上述区域支撑残差均未比修复前增加，草地/混凝土转换也未增加；不把车道边界疑点硬归入“已修复”。细节与轮迹坐标见 [deferred.json](deferred.json)。

## CLI / Kernel / runtime 与构建

复用 mapctl、Editing Kernel、segment grid 和原路面函数；增加 2cm 阈值/路口边界扫描/跨类别区域聚合，修正仅凭大高差忽略候选的问题。审查后的 Y 操作支持原路径纵断面插点、过期值检查、精确端点约束；局部落地开关可撤回。runtime 仅为 9 条明确标记道路启用与现有可视网格一致的三角形支撑，普通道路行为保留。没有修改车辆物理。

44 项轻量 CLI/Kernel 自测通过。按本轮指令仅执行一次 `pnpm run build -BasicValidation`，typecheck + production build 成功并更新 dist；未运行 full core、全车型、editor 全量、长驾驶。可玩资源 `city-main.runtime-c68a3384aaff.json` 已核对为 v484，2944 条道路、运行时导航网络齐全。构建 loader 正常归一化带来的最大数值差仅 2.10e-13，结构/非数值字段一致。日志：[build](continuation-build.log)、[发布核对](continuation-dist-proof.json)。构建保留既有大包体积提示，没有为消提示额外重构。

旧 v481 报告/统计已保存为 v481-REPORT.md / v481-summary.json；本目录根 summary、before、after、safe-fixes 和 manual-review 现与本轮一致。
