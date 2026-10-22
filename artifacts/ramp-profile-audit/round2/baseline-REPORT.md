# City Main v484 → v485 匝道与高差连接专项审计

全图 2944 条道路完成纵坡计算；A→B→C→D 清单 2373 条，其中匝道 528 条。采用地图数据、CLI、铺装轮廓和短时四轮回放；未使用 computer-use，未修改车辆物理、控制、信号或导航拓扑。

**这不是“全部问题已修好”的报告。** 实际修改 200 条道路；275 条仍列为 DEFER_COMPLEX，部分已有局部改进。清单保留未解决的共享铺装、坡折、净空与弯坡组合，未以 warning 数量代替判断。

| 顺序 | 检查 | 已解决修复 | PASS | 结构意图 | DEFER | 实际修改道路 | 修改高度节点 | 最大Y改动(m) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A 高速 | 1895 | 91 | 1547 | 139 | 118 | 129 | 18789 | 1.369 |
| B 城市快速路 | 334 | 10 | 184 | 43 | 97 | 25 | 2393 | 6.856 |
| C 城区道路与快速路连接 | 33 | 6 | 8 | 1 | 18 | 7 | 695 | 7.990 |
| D 其他高差分叉 | 111 | 18 | 46 | 5 | 42 | 39 | 2872 | 1.937 |

“已解决修复/PASS/结构意图/DEFER”互斥；“实际修改道路”含仍有其他问题的局部修复。节点数含插入且改变高度的节点。

## 各类纵坡、净空与支撑面指标

| 类别 | 最大坡度前→后 | 最大坡折前→后 | 近层铺装差峰值前→后(m) | 净空改善区 | 净空降低区 |
|---|---|---|---|---:|---:|
| A | 0.120 → 0.120 | 0.159 → 0.159 | 2.880 → 2.880 | 20 | 0 |
| B | 0.120 → 0.120 | 0.230 → 0.230 | 3.962 → 3.962 | 20 | 0 |
| C | 0.121 → 0.121 | 0.078 → 0.030 | 3.081 → 3.081 | 5 | 0 |
| D | 0.118 → 0.121 | 0.127 → 0.127 | 1.630 → 1.630 | 10 | 0 |

坡度与坡折单位 m/m；最大值包含保留的复杂问题，因此不会因局部修复而全部下降。近层差统计 minGap<0.5m、maxGap<4m 的核心铺装重叠，包含同一道路相邻段；不把合法跨层高差记作路面台阶。跨区会在各分类重复归属，总数见 crossing-clearance-audit.json。

## 实现与审查边界

- 局部一维纵坡拟合保留原始 XZ 节点、端点 XYZ 和结构/路口约束；共享区随父道路高度，跨线区保留高度或采用已通过净空复核的局部调整。
- 仅在已捕获自身重叠错面的道路使用现有 ribbon 数据模式，让物理支撑与已有铺装三角形一致。没有修改支撑选择算法。
- 剔除冗余纵向采样，最大插值误差 0.5mm；全部原始平面拐点保留。
- 逐区检查完整核心铺装轮廓及边缘净空；既有恒定 6m 等结构层高按明确结构关系保留。5.5m 只是复核提示，不以自动抬高所有桥梁消除提示。
- 短匝道/多层连接的部分拟合因坡度、坡折或共享区冲突被拒绝；候选失败不等于证明所有局部方案都不可行，具体证据和剩余指标保存在 deferred.json。
- 物流支路 v4-south-logistics-east-split 的候选使切换 2→8、拒绝 0→4，已完整撤回；原始试验保存在 runtime-proposed-map-results.json。

## 四轮运行对比

最终 200 条实际修改道路均做成对短回放，每条约 14m，含四轮支撑面、连续性、层分类、拒绝、接地、冲量和 aY。纵向速度预设、转向与垂向动力学实际积分，排除实体护栏碰撞；不替代整段高速驾驶或主观体验评估。RMS 为各路段 RMS 的等权合成。

| 指标 | 前 | 后 |
|---|---:|---:|
| rmsAY | 0.531 | 0.133 |
| peakAY | 10.324 | 3.330 |
| pitchRate | 0.512 | 0.130 |
| rollRate | 0.093 | 0.090 |
| fullBump | 0.000 | 0.000 |
| bumpStopEntries | 32.000 | 0.000 |
| groundedTransitions | 18.000 | 16.000 |
| supportRejections | 42.000 | 16.000 |
| mechanicalImpulse | 0.000 | 0.000 |
| safety | 0.000 | 0.000 |

- system-central:S-to-W-semi: Accepted bounded physical grade response; preserve measured increase.
- v9-newcity-eight-split-split-split-split: Accepted bounded physical grade response; preserve measured increase.

## 验证

- ramp/profile CLI targeted selftests: 见 targeted-selftests.json。
- Editing Kernel changed-region preview: PASS；98 条 warning，0 error；保留原始结果。
- 跨线最低净空降低区 0；新增跨道路近层错面 0。
- 四轮短回放：完整结果与差异见 runtime-regression.json；另补充两条 80km/h 高速代表段和 City 东侧匝道 80km/h 回归，均无拒绝/冲量/安全介入，东侧无 A-B-A。
- full-bump 采用黑匣子同一 1mm 几何阈值；本冻结物理基线中为 0→0。缓冲块开始受力次数另计为 bumpStopEntries，32→0。
- targeted selftests：12 项通过；typecheck 通过。
- 本轮只执行一次 `pnpm run build -BasicValidation`，通过并发布 dist；按请求未运行 full core/全车型/editor 全量。
- dist 入口：`/assets/index-DIxMkkWj.js`；运行地图包：`dist/assets/city-main.runtime-913d439cad17.json`，实际版本 485。
- Vite 仅有既有体积提示；本轮未扩大到打包拆分。

## 全部实际修改道路（A→B→C→D）

| 类别 | 道路/corridor成员 | 结果 | 最大Y(m) |
|---|---|---|---:|
| A | regional:qingling:S-to-E-right | DEFER_COMPLEX | 0.475 |
| A | regional:qingling:E-to-S-turbine | FIXED_PROFILE | 0.626 |
| A | regional:qingling:E-to-N-right | FIXED_PROFILE | 0.487 |
| A | regional:qingling:N-to-E-turbine | FIXED_PROFILE | 0.671 |
| A | regional:dongyuan:S-to-W-turbine | FIXED_PROFILE | 0.648 |
| A | regional:dongyuan:S-to-E-right | FIXED_PROFILE | 0.410 |
| A | regional:dongyuan:E-to-S-turbine | FIXED_PROFILE | 0.614 |
| A | regional:dongyuan:E-to-N-right | FIXED_PROFILE | 0.410 |
| A | regional:dongyuan:N-to-E-turbine | FIXED_PROFILE | 0.648 |
| A | regional:dongyuan:N-to-W-right | FIXED_PROFILE | 0.410 |
| A | regional:dongyuan:W-to-N-turbine | FIXED_PROFILE | 0.614 |
| A | regional:dongyuan:W-to-S-right | FIXED_PROFILE | 0.410 |
| A | regional:lingang:S-to-E-right | FIXED_PROFILE | 0.412 |
| A | regional:lingang:E-to-N-right | FIXED_PROFILE | 0.411 |
| A | regional:lingang:N-to-E-star | DEFER_COMPLEX | 0.480 |
| A | regional:xichuan:S-to-E-right | FIXED_PROFILE | 0.466 |
| A | regional:xichuan:E-to-S-turbine | FIXED_PROFILE | 0.671 |
| A | regional:xichuan:E-to-N-right | FIXED_PROFILE | 0.479 |
| A | regional:xichuan:N-to-E-turbine | FIXED_PROFILE | 0.626 |
| A | regional:logistics:S-to-W-star | FIXED_PROFILE | 0.659 |
| A | regional:logistics:S-to-E-right | FIXED_PROFILE | 0.404 |
| A | regional:logistics:E-to-S-star | DEFER_COMPLEX | 0.640 |
| A | regional:logistics:E-to-N-right | FIXED_PROFILE | 0.415 |
| A | regional:logistics:N-to-E-star | FIXED_PROFILE | 0.659 |
| A | regional:logistics:N-to-W-right | FIXED_PROFILE | 0.417 |
| A | regional:logistics:W-to-N-star | DEFER_COMPLEX | 0.640 |
| A | regional:logistics:W-to-S-right | FIXED_PROFILE | 0.404 |
| A | regional:dongnan:S-to-W-semi | FIXED_PROFILE | 0.470 |
| A | regional:dongnan:S-to-E-right | FIXED_PROFILE | 0.568 |
| A | regional:dongnan:E-to-S-semi | DEFER_COMPLEX | 0.665 |
| A | regional:dongnan:E-to-N-right | FIXED_PROFILE | 0.206 |
| A | regional:dongnan:N-to-W-right | FIXED_PROFILE | 0.568 |
| A | regional:dongnan:W-to-N-semi | DEFER_COMPLEX | 0.665 |
| A | regional:dongnan:W-to-S-right | FIXED_PROFILE | 0.206 |
| A | regional:shangu:off:1 | FIXED_PROFILE | 0.246 |
| A | regional:shangu:on:1 | FIXED_SHARED_PAVEMENT | 0.276 |
| A | regional:shangu:off:-1 | FIXED_SHARED_PAVEMENT | 0.258 |
| A | regional:shangu:on:-1 | FIXED_PROFILE | 0.387 |
| A | regional:hewan:off:-1 | FIXED_PROFILE | 0.093 |
| A | regional:G17:in:split270:split428 | FIXED_PROFILE | 0.169 |
| A | regional:newcity-exit:off:1 | FIXED_PROFILE | 0.409 |
| A | regional:newcity-exit:on:-1 | FIXED_PROFILE | 0.273 |
| C | regional:airport-terminal-access | FIXED_PROFILE | 0.514 |
| A | regional:G17:out:split48:split452:lane340 | FIXED_PROFILE | 0.169 |
| A | regional:v2:westgate:S-to-W-loop | FIXED_PROFILE | 0.535 |
| A | regional:v2:westgate:E-to-S-loop | FIXED_PROFILE | 0.545 |
| A | regional:v2:westgate:N-to-E-loop | FIXED_PROFILE | 0.545 |
| A | regional:v2:airport-north:S-to-W-loop | FIXED_PROFILE | 0.586 |
| A | regional:v2:airport-north:S-to-E-right | DEFER_COMPLEX | 1.276 |
| A | regional:v2:airport-north:E-to-S-loop | FIXED_PROFILE | 0.496 |
| A | regional:v2:airport-north:N-to-E-loop | FIXED_PROFILE | 0.545 |
| A | regional:v2:airport-north:N-to-W-right | FIXED_SHARED_PAVEMENT | 0.694 |
| A | regional:v2:airport-north:W-to-N-loop | DEFER_COMPLEX | 0.249 |
| A | regional:v2:northwest:E-to-S-loop | DEFER_COMPLEX | 0.172 |
| A | regional:v2:northwest:E-to-N-right | FIXED_PROFILE | 0.431 |
| A | regional:v2:northwest:N-to-W-right | DEFER_COMPLEX | 0.208 |
| A | regional:v2:northwest:W-to-N-loop | FIXED_PROFILE | 0.305 |
| A | regional:v2:westlink:S-to-W-loop | FIXED_PROFILE | 0.563 |
| A | regional:v2:westlink:S-to-E-right | FIXED_PROFILE | 0.074 |
| A | regional:v2:westlink:E-to-S-loop | FIXED_PROFILE | 0.561 |
| A | regional:v2:westlink:E-to-N-right | FIXED_PROFILE | 0.074 |
| A | regional:v2:westlink:N-to-E-loop | FIXED_PROFILE | 0.561 |
| A | regional:v2:westlink:W-to-N-loop | FIXED_PROFILE | 0.649 |
| A | regional:v3:north-river:S-to-W-turbine | FIXED_PROFILE | 0.385 |
| A | regional:v3:north-river:S-to-E-right | FIXED_PROFILE | 0.474 |
| A | regional:v3:north-river:E-to-S-turbine | FIXED_PROFILE | 0.421 |
| A | regional:v3:north-river:E-to-N-right | DEFER_COMPLEX | 0.332 |
| A | regional:v3:north-river:N-to-W-right | DEFER_COMPLEX | 0.155 |
| A | regional:v3:north-river:W-to-N-turbine | DEFER_COMPLEX | 0.122 |
| A | regional:v3:north-river:W-to-S-right | DEFER_COMPLEX | 0.289 |
| A | regional:v3:chenjiang-east:S-to-E-right | DEFER_COMPLEX | 0.242 |
| A | regional:v3:chenjiang-east:E-to-S-turbine | DEFER_COMPLEX | 0.453 |
| A | regional:v3:chenjiang-east:E-to-N-right | DEFER_COMPLEX | 0.179 |
| A | regional:v3:chenjiang-east:N-to-E-turbine | DEFER_COMPLEX | 0.619 |
| A | regional:v3:chenjiang-east:W-to-N-turbine | DEFER_COMPLEX | 0.454 |
| A | regional:v3:chenjiang-east:W-to-S-right | FIXED_SHARED_PAVEMENT | 0.985 |
| A | regional:v3:northeast-west:S-to-E-right | FIXED_PROFILE | 0.549 |
| A | regional:v3:northeast-west:E-to-S-loop | FIXED_PROFILE | 0.695 |
| A | regional:v3:northeast-west:E-to-N-right | FIXED_PROFILE | 0.609 |
| A | regional:v3:northeast-west:N-to-E-loop | FIXED_PROFILE | 0.528 |
| A | regional:v3:northeast-west:N-to-W-right | FIXED_PROFILE | 0.545 |
| A | regional:v3:northeast-west:W-to-N-loop | FIXED_SHARED_PAVEMENT | 0.907 |
| A | regional:v3:northeast-river:S-to-W-turbine | DEFER_COMPLEX | 0.614 |
| A | regional:v3:northeast-river:S-to-E-right | DEFER_COMPLEX | 0.260 |
| A | regional:v3:northeast-river:E-to-S-turbine | FIXED_PROFILE | 0.597 |
| A | regional:v3:northeast-river:E-to-N-right | FIXED_PROFILE | 0.258 |
| A | regional:v3:northeast-river:N-to-E-turbine | DEFER_COMPLEX | 0.646 |
| A | regional:v3:northeast-river:N-to-W-right | DEFER_COMPLEX | 0.262 |
| A | regional:v3:northeast-river:W-to-N-turbine | FIXED_PROFILE | 0.633 |
| A | regional:v3:northeast-river:W-to-S-right | FIXED_PROFILE | 0.259 |
| A | regional:v3:northeast-north:S-to-W-turbine | FIXED_PROFILE | 0.626 |
| A | regional:v3:northeast-north:S-to-E-right | FIXED_PROFILE | 0.314 |
| A | regional:v3:northeast-north:E-to-N-right | FIXED_PROFILE | 0.415 |
| A | regional:v3:northeast-north:N-to-E-turbine | DEFER_COMPLEX | 0.253 |
| A | regional:v3:northeast-north:N-to-W-right | FIXED_PROFILE | 0.313 |
| A | regional:v3:northeast-north:W-to-N-turbine | FIXED_PROFILE | 0.647 |
| A | regional:v3:northeast-north:W-to-S-right | DEFER_COMPLEX | 0.436 |
| A | regional:v3:northeast-chenjiang:S-to-W-turbine | DEFER_COMPLEX | 0.540 |
| A | regional:v3:northeast-chenjiang:S-to-E-right | FIXED_PROFILE | 0.299 |
| A | regional:v3:northeast-chenjiang:E-to-S-turbine | FIXED_PROFILE | 0.490 |
| A | regional:v3:northeast-chenjiang:E-to-N-right | FIXED_PROFILE | 0.415 |
| A | regional:v3:northeast-chenjiang:N-to-E-turbine | DEFER_COMPLEX | 0.291 |
| A | regional:v3:northeast-chenjiang:N-to-W-right | DEFER_COMPLEX | 0.297 |
| A | regional:v3:northeast-chenjiang:W-to-N-turbine | FIXED_SHARED_PAVEMENT | 1.259 |
| A | regional:v3:northeast-chenjiang:W-to-S-right | FIXED_PROFILE | 0.303 |
| A | regional:v3:northeast-donglin:S-to-W-turbine | FIXED_PROFILE | 0.197 |
| A | regional:v3:northeast-donglin:S-to-E-right | DEFER_COMPLEX | 0.339 |
| A | regional:v3:northeast-donglin:E-to-S-turbine | FIXED_PROFILE | 0.581 |
| A | regional:v3:northeast-donglin:E-to-N-right | FIXED_PROFILE | 0.399 |
| A | regional:v3:northeast-donglin:N-to-E-turbine | DEFER_COMPLEX | 0.599 |
| A | regional:v3:northeast-donglin:N-to-W-right | FIXED_PROFILE | 0.467 |
| A | regional:v3:northeast-donglin:W-to-N-turbine | DEFER_COMPLEX | 0.136 |
| A | regional:v3:northeast-donglin:W-to-S-right | FIXED_PROFILE | 0.447 |
| A | regional:v3:northeast-newcity:S-to-W-turbine | FIXED_PROFILE | 0.554 |
| A | regional:v3:northeast-newcity:S-to-E-right | FIXED_PROFILE | 0.191 |
| A | regional:v3:northeast-newcity:E-to-S-turbine | FIXED_PROFILE | 0.688 |
| A | regional:v3:northeast-newcity:E-to-N-right | FIXED_PROFILE | 0.368 |
| A | regional:v3:northeast-newcity:N-to-E-turbine | FIXED_PROFILE | 0.585 |
| A | regional:v3:northeast-newcity:N-to-W-right | FIXED_PROFILE | 0.193 |
| A | regional:v3:northeast-newcity:W-to-N-turbine | DEFER_COMPLEX | 0.313 |
| A | regional:v3:northeast-newcity:W-to-S-right | DEFER_COMPLEX | 0.489 |
| A | regional:v3:river-newcity:S-to-W-turbine | DEFER_COMPLEX | 0.273 |
| A | regional:v3:river-newcity:S-to-E-right | FIXED_SHARED_PAVEMENT | 1.369 |
| A | regional:v3:river-newcity:E-to-S-turbine | DEFER_COMPLEX | 0.699 |
| A | regional:v3:river-newcity:N-to-E-turbine | DEFER_COMPLEX | 0.568 |
| A | regional:v3:river-newcity:N-to-W-right | FIXED_PROFILE | 0.177 |
| A | regional:v3:river-newcity:W-to-N-turbine | DEFER_COMPLEX | 0.413 |
| A | regional:v3:chenjiang-east:S-to-W-turbine:deceleration | FIXED_SHARED_PAVEMENT | 0.407 |
| B | ring-cw-0-split-split | FIXED_PROFILE | 0.027 |
| B | ns-sb-split-3-split-split-split | DEFER_COMPLEX | 0.073 |
| B | ring-cw-3-split-2-split | DEFER_COMPLEX | 0.022 |
| D | urban-underpass-west-link | DEFER_COMPLEX | 0.934 |
| B | ring-cw-2-split-4-split | DEFER_COMPLEX | 0.006 |
| B | system-north:S-to-E-right | DEFER_COMPLEX | 0.336 |
| B | system-north:E-to-N-right | DEFER_COMPLEX | 0.208 |
| B | system-north:N-to-W-right | DEFER_COMPLEX | 0.357 |
| B | system-north:W-to-N-star | DEFER_COMPLEX | 1.121 |
| B | system-north:W-to-S-right | DEFER_COMPLEX | 0.329 |
| B | system-west:S-to-W-loop | FIXED_PROFILE | 0.540 |
| B | system-west:S-to-E-right | DEFER_COMPLEX | 0.764 |
| B | system-west:E-to-N-right | DEFER_COMPLEX | 0.989 |
| B | system-west:N-to-E-loop | FIXED_PROFILE | 0.742 |
| B | system-west:N-to-W-right | FIXED_PROFILE | 0.548 |
| B | system-west:W-to-S-right | FIXED_PROFILE | 0.549 |
| B | system-south:S-to-E-right | DEFER_COMPLEX | 0.186 |
| B | system-south:E-to-N-right | FIXED_SHARED_PAVEMENT | 0.784 |
| B | system-south:N-to-W-right | FIXED_PROFILE | 0.568 |
| B | system-south:W-to-S-right | FIXED_SHARED_PAVEMENT | 0.382 |
| D | v4-south-logistics-west | DEFER_COMPLEX | 0.637 |
| D | v4-south-logistics-east | DEFER_COMPLEX | 0.595 |
| D | v4-south-split-2-split | DEFER_COMPLEX | 0.570 |
| B | system-central:S-to-W-semi | DEFER_COMPLEX | 6.856 |
| B | ns-nb-split-split-split | FIXED_PROFILE | 0.247 |
| B | system-east:W-to-N-turbine | DEFER_COMPLEX | 1.353 |
| A | intercity-eb-split-split | FIXED_SUPPORT_OWNERSHIP | 0.000 |
| A | peripheral-interchange:E-to-N-right | DEFER_COMPLEX | 0.054 |
| D | v61-exhibition-road-split-split | FIXED_PROFILE | 0.625 |
| D | v4-industrial-split-2-split | FIXED_PROFILE | 1.937 |
| D | v4-industrial-split-2-split-2 | FIXED_PROFILE | 0.650 |
| D | v8-industrial-west-split | FIXED_PROFILE | 0.794 |
| C | v8-ring-north:off--1 | FIXED_SHARED_PAVEMENT | 7.785 |
| C | v8-ring-north:on--1 | FIXED_SHARED_PAVEMENT | 7.990 |
| D | v8-beijing-road-split-split-split-split | FIXED_PROFILE | 0.697 |
| D | v61-exhibition-road-split-split-split-split | DEFER_COMPLEX | 0.633 |
| D | v9-chunhui-east-split | FIXED_PROFILE | 0.678 |
| D | v9-chunhui-east-split-split | DEFER_COMPLEX | 0.546 |
| D | v9-newcity-eight-split-split-split | DEFER_COMPLEX | 1.283 |
| D | v9-newcity-nine-south-split-split | DEFER_COMPLEX | 1.350 |
| D | v9-newcity-eight-split-split-split-split | DEFER_COMPLEX | 0.756 |
| D | v9-newcity-three-split-split-split-split-split | DEFER_COMPLEX | 0.655 |
| D | v9-newcity-ten-split-split-split | FIXED_PROFILE | 0.270 |
| D | v9-newcity-eight-split-split-split-split-split | DEFER_COMPLEX | 0.295 |
| D | diamond-east:west-local-split-v91 | FIXED_PROFILE | 0.634 |
| D | v8-campus-avenue-v91 | DEFER_COMPLEX | 0.244 |
| D | v91-ns-0-a-1 | FIXED_PROFILE | 0.413 |
| D | v91-ns-0-a-2 | FIXED_PROFILE | 0.395 |
| D | v91-ns-0-a-3 | DEFER_COMPLEX | 0.297 |
| D | v91-ns-0-b-1 | DEFER_COMPLEX | 0.113 |
| D | v91-ns-0-b-2 | FIXED_PROFILE | 0.395 |
| D | v91-ns-0-b-3 | DEFER_COMPLEX | 0.322 |
| D | v91-ring-west-underpass | DEFER_COMPLEX | 0.558 |
| B | ring-ccw-0-split-split-split-3-split-section | DEFER_COMPLEX | 0.065 |
| D | v6-logistics-one-split-m91 | FIXED_PROFILE | 0.253 |
| D | v8-port-south-m91 | DEFER_COMPLEX | 0.707 |
| D | urban-underpass-start-approach-c91 | DEFER_COMPLEX | 0.192 |
| D | v5-south-logistics-c91 | FIXED_PROFILE | 0.318 |
| D | v4-west-market-split-split-3-c91 | DEFER_COMPLEX | 0.257 |
| D | v4-access-3-split-c91 | FIXED_PROFILE | 0.354 |
| D | v5-south-logistics-split-c91 | FIXED_PROFILE | 0.190 |
| D | v8-port-works-split-split-c91 | DEFER_COMPLEX | 0.175 |
| D | v91-ring-south-cross | FIXED_PROFILE | 0.361 |
| C | v91-ring-north-outer-off | FIXED_PROFILE | 0.649 |
| C | v91-ring-north-outer-on | FIXED_PROFILE | 0.691 |
| C | v91-ring-south-outer-off | DEFER_COMPLEX | 0.677 |
| C | direction-mingyuan-main | FIXED_PROFILE | 0.085 |
| D | direction-inner-sw-section-section | DEFER_COMPLEX | 0.096 |
| D | v91-ns-0-a-4-section-3 | FIXED_PROFILE | 0.293 |
| B | ns-sb-split-3-split-split-split-section | FIXED_PROFILE | 0.242 |
| D | v91-ns-0-b-4-section-3 | FIXED_PROFILE | 0.293 |
| B | ns-nb-split-split-split-split-section | DEFER_COMPLEX | 0.002 |

完整逐路段起终点、坡度/曲率、父道路、连接、重叠区、分类及残留问题见 inventory.json 与四个分类文件；所有未完成修复都列在 deferred.json。
