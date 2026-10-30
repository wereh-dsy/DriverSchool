# 其他互通与高速/快速路匝道口修复

检查 **45 组互通/接入组、255 条主匝道、265 条加减速连接段**。主匝道几何修改 21 条；子段及支撑表示改动详见 before-after-summary.json。

**PASS 246 / remaining P0 2 / remaining P1 7 / remaining P2 0。**

以上按 255 条主匝道统计，每条包含其加减速子段的最严重结果；详细道路级指标覆盖全部 520 条道路。保留项没有计作 PASS。v490 是唯一冻结基线；没有重用旧失败方案或全图拟合。

## 南北快速路主辅路与地下侧墙

- 中心立交附近的 `v91-ns-sb-off`、`v91-ns-nb-on` 原共享高差最高约 1.891m；局部连续 S 形 XZ/Y 修正后，同层共享、独立升降及曲率通过定点检查。
- `ns-tunnel:southbound` 与 `ns-tunnel:northbound-split` 在 z≈633–644m 的侧墙穿过匝道。只为这两个已证实位置添加显式 branchOpenings；可视墙与碰撞体共同消费 enclosureWallSectionSteps，不改变隧道其余侧墙和顶板。
- 墙面/铺装穿插采样：26 / 27 → 0 / 0；车辆墙体/顶板包络接触：2 / 1 → 0 / 0。
- 北侧接入口与上跨 system-north:E-to-S-star 的局部联合候选也纳入最终几何、净空和回放检查。
- 证据：[ns-main-frontage-wall-validation.json](ns-main-frontage-wall-validation.json)、[tunnel-wall-openings.json](tunnel-wall-openings.json)、[joint-north-attempts.json](joint-north-attempts.json)。

## 方法与保护范围

共享铺装同层 → XZ 独立 → 明显升降；合流顺序相反。连接区按完整连续主线子段链、实际铺装边缘和轮迹检查；分离后的合法跨越不计为共享区。

只在检出错层/硬坡折的局部窗口调整 Y，必要时有限调整 XZ；没有全匝道 spline 重拟合或全图平滑。部分残差来自旧 segment-plane 支撑端帽与 RoadEdgeChain 可视铺装不一致：仅对有具体探针证据的道路 opt-in ribbon，主线 XYZ、方向和结构层级不变。

标线在最终几何稳定后生成。对实际浮空导流线启用 gore.clipToPavement，加减速段与直接匝道共用三角面裁剪。路牌保留 ID、内容、车道/道路语义及显式地面基础；按最终 station/heading/base Y 适配。修改路牌 502 个、物件 0 个。

system-central 的 8 条完整道路记录严格相同；四条原主线 XYZ、roadLinks、connectionPorts、交叉口和车辆物理/Support Selection/悬挂/阈值/Black Box 均未改。中心立交回归：8 PASS、16 接口支撑/导航、16 短回放全部通过。

## system-east

主匝道 8 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| system-east:S-to-W-turbine | 0.025→0.025 / 0.003→0.003 | 0→0 | 11.900% | 87.62 | 2/2 | PASS |
| system-east:S-to-E-right | 0.025→0.025 / 0.025→0.025 | 0→0 | 10.941% | 60.43 | 2/2 | PASS |
| system-east:E-to-S-turbine | 0.019→0.019 / 0.025→0.025 | 0→0 | 11.900% | 79.20 | 2/2 | PASS |
| system-east:E-to-N-right | 0.025→0.025 / 0.025→0.025 | 0→0 | 11.900% | 65.56 | 2/2 | PASS |
| system-east:N-to-E-turbine | 0.025→0.025 / 0.025→0.025 | 0→0 | 11.900% | 68.14 | 2/2 | PASS |
| system-east:N-to-W-right | 0.025→0.025 / 0.022→0.022 | 0→0 | 11.193% | 98.05 | 2/2 | PASS |
| system-east:W-to-N-turbine | 0.001→0.001 / 0.025→0.025 | 0→0 | 11.900% | 86.23 | 2/2 | PASS |
| system-east:W-to-S-right | 0.018→0.018 / 0.025→0.025 | 0→0 | 11.900% | 99.84 | 2/2 | PASS |

## system-north

主匝道 8 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| system-north:S-to-W-star | 0.000→0.000 / 0.000→0.000 | 0→0 | 7.636% | 76.60 | 2/2 | PASS |
| system-north:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.120% | 92.41 | 2/2 | PASS |
| system-north:E-to-S-star | 0.000→0.000 / 0.225→0.002 | 13→0 | 11.952% | 62.43 | 2/2 | PASS |
| system-north:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 10.190% | 74.64 | 2/2 | PASS |
| system-north:N-to-E-star | 0.000→0.000 / 0.000→0.000 | 0→0 | 11.488% | 58.30 | 2/2 | PASS |
| system-north:N-to-W-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 8.758% | 70.40 | 2/2 | PASS |
| system-north:W-to-N-star | 0.000→0.000 / 0.000→0.000 | 0→0 | 8.584% | 49.22 | 2/2 | PASS |
| system-north:W-to-S-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.139% | 81.29 | 2/2 | PASS |

## system-south

主匝道 8 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| system-south:S-to-W-semi | 0.017→0.017 / 0.000→0.000 | 0→0 | 6.720% | 44.18 | 2/2 | PASS |
| system-south:S-to-E-right | 0.037→0.037 / 0.000→0.000 | 0→0 | 5.159% | 95.35 | 2/2 | PASS |
| system-south:E-to-S-loop | 1.249→0.012 / 0.009→0.009 | 2→0 | 12.000% | 21.92 | 2/2 | P1 |
| system-south:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.205% | 100.31 | 2/2 | PASS |
| system-south:N-to-E-semi | 0.000→0.000 / 0.001→0.001 | 0→0 | 7.711% | 60.37 | 2/2 | PASS |
| system-south:N-to-W-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.912% | 122.51 | 2/2 | PASS |
| system-south:W-to-N-loop | 0.000→0.000 / 0.060→0.060 | 0→0 | 9.230% | 18.43 | 2/2 | P1 |
| system-south:W-to-S-right | 0.000→0.000 / 0.036→0.036 | 0→0 | 3.798% | 84.48 | 2/2 | PASS |


- **system-south:E-to-S-loop / P1**：Existing compact loop retains a conservative curvature review warning. Local planar fairing candidates did not satisfy shared-pavement/curvature/crossing constraints; failed candidates were not published. A wider loop needs structural space. 共享异常区：无。详见 deferred.json 的 stations 与 attempts。


- **system-south:W-to-N-loop / P1**：Existing compact loop retains a conservative curvature review warning. Local planar fairing candidates did not satisfy shared-pavement/curvature/crossing constraints; failed candidates were not published. A wider loop needs structural space. 共享异常区：end 10–21m，ΔY=0.060m。详见 deferred.json 的 stations 与 attempts。

## system-west

主匝道 8 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| system-west:S-to-W-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 8.643% | 14.64 | 2/2 | P1 |
| system-west:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.770% | 156.65 | 2/2 | PASS |
| system-west:E-to-S-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 10.000% | 15.08 | 2/2 | P1 |
| system-west:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.665% | 160.18 | 2/2 | PASS |
| system-west:N-to-E-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 7.570% | 14.56 | 2/2 | P1 |
| system-west:N-to-W-right | 0.000→0.000 / 0.001→0.001 | 0→0 | 11.571% | 49.59 | 2/2 | PASS |
| system-west:W-to-N-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 10.000% | 14.42 | 2/2 | P1 |
| system-west:W-to-S-right | 0.001→0.001 / 0.000→0.000 | 0→0 | 11.569% | 57.23 | 2/2 | PASS |


- **system-west:S-to-W-loop / P1**：Existing compact loop retains a conservative curvature review warning. Local planar fairing candidates did not satisfy shared-pavement/curvature/crossing constraints; failed candidates were not published. A wider loop needs structural space. 共享异常区：无。详见 deferred.json 的 stations 与 attempts。


- **system-west:E-to-S-loop / P1**：Existing compact loop retains a conservative curvature review warning. Local planar fairing candidates did not satisfy shared-pavement/curvature/crossing constraints; failed candidates were not published. A wider loop needs structural space. 共享异常区：无。详见 deferred.json 的 stations 与 attempts。


- **system-west:N-to-E-loop / P1**：Existing compact loop retains a conservative curvature review warning. Local planar fairing candidates did not satisfy shared-pavement/curvature/crossing constraints; failed candidates were not published. A wider loop needs structural space. 共享异常区：无。详见 deferred.json 的 stations 与 attempts。


- **system-west:W-to-N-loop / P1**：Existing compact loop retains a conservative curvature review warning. Local planar fairing candidates did not satisfy shared-pavement/curvature/crossing constraints; failed candidates were not published. A wider loop needs structural space. 共享异常区：无。详见 deferred.json 的 stations 与 attempts。

## peripheral-interchange

主匝道 2 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| peripheral-interchange:S-to-E-right | 0.005→0.005 / 0.001→0.001 | 0→0 | 4.449% | 59.47 | 2/2 | PASS |
| peripheral-interchange:E-to-N-right | 0.000→0.000 / 0.021→0.021 | 0→0 | 5.453% | 73.66 | 2/2 | PASS |

## regional:airport-exit

主匝道 4 条，加减速连接段 3 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:airport-exit:off:1 | 0.001→0.001 / 0.000→0.000 | 0→0 | 0.185% | 49.63 | 2/2 | PASS |
| regional:airport-exit:on:1 | 0.000→0.000 / 0.020→0.020 | 0→0 | 0.251% | 45.66 | 2/2 | PASS |
| regional:airport-exit:off:-1 | 0.002→0.002 / 0.000→0.000 | 0→0 | 0.257% | 45.66 | 2/2 | PASS |
| regional:airport-exit:on:-1 | 0.000→0.000 / 0.001→0.001 | 0→0 | 0.185% | 45.66 | 2/2 | PASS |

## regional:airport-service

主匝道 4 条，加减速连接段 3 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:airport-service:off:1 | 0.036→0.036 / 0.002→0.002 | 0→0 | 0.664% | 45.95 | 2/2 | PASS |
| regional:airport-service:on:1 | 0.017→0.017 / 0.037→0.037 | 0→0 | 0.459% | 51.81 | 2/2 | PASS |
| regional:airport-service:off:-1 | 0.025→0.025 / 0.002→0.002 | 0→0 | 0.586% | 46.72 | 2/2 | PASS |
| regional:airport-service:on:-1 | 0.002→0.002 / 0.026→0.026 | 0→0 | 0.631% | 49.55 | 2/2 | PASS |

## regional:binhe

主匝道 4 条，加减速连接段 4 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:binhe:off:1 | 0.126→0.035 / 0.039→0.038 | 0→0 | 3.682% | 50.21 | 2/2 | PASS |
| regional:binhe:on:1 | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 55.87 | 2/2 | PASS |
| regional:binhe:off:-1 | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 80.75 | 2/2 | PASS |
| regional:binhe:on:-1 | 0.000→0.000 / 0.132→0.021 | 0→0 | 4.143% | 84.27 | 2/2 | PASS |

## regional:chenjiang-east

主匝道 4 条，加减速连接段 3 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:chenjiang-east:off:1 | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 49.75 | 2/2 | PASS |
| regional:chenjiang-east:on:1 | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 45.66 | 2/2 | PASS |
| regional:chenjiang-east:off:-1 | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 50.22 | 2/2 | PASS |
| regional:chenjiang-east:on:-1 | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 45.66 | 2/2 | PASS |

## regional:dongnan

主匝道 8 条，加减速连接段 13 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:dongnan:S-to-W-semi | 0.000→0.000 / 0.000→0.000 | 0→0 | 6.924% | 140.37 | 2/2 | PASS |
| regional:dongnan:S-to-E-right | 0.000→0.000 / 0.007→0.007 | 0→0 | 5.500% | 68.41 | 2/2 | PASS |
| regional:dongnan:E-to-S-semi | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.980% | 80.68 | 2/2 | PASS |
| regional:dongnan:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 2.884% | 273.39 | 2/2 | PASS |
| regional:dongnan:N-to-E-semi | 0.000→0.000 / 0.000→0.000 | 0→0 | 6.819% | 140.13 | 2/2 | PASS |
| regional:dongnan:N-to-W-right | 0.000→0.000 / 0.007→0.007 | 0→0 | 5.500% | 68.41 | 2/2 | PASS |
| regional:dongnan:W-to-N-semi | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.980% | 80.91 | 2/2 | PASS |
| regional:dongnan:W-to-S-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 2.884% | 273.39 | 2/2 | PASS |

## regional:dongyuan

主匝道 8 条，加减速连接段 16 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:dongyuan:S-to-W-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.620% | 119.64 | 2/2 | PASS |
| regional:dongyuan:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.853% | 170.80 | 2/2 | PASS |
| regional:dongyuan:E-to-S-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.756% | 119.21 | 2/2 | PASS |
| regional:dongyuan:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.853% | 170.80 | 2/2 | PASS |
| regional:dongyuan:N-to-E-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.620% | 119.64 | 2/2 | PASS |
| regional:dongyuan:N-to-W-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.853% | 170.80 | 2/2 | PASS |
| regional:dongyuan:W-to-N-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.756% | 119.21 | 2/2 | PASS |
| regional:dongyuan:W-to-S-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.853% | 170.80 | 2/2 | PASS |

## regional:hewan

主匝道 4 条，加减速连接段 1 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:hewan:off:1 | 0.028→0.028 / 0.005→0.005 | 0→0 | 0.531% | 78.31 | 2/2 | PASS |
| regional:hewan:on:1 | 0.002→0.002 / 0.001→0.001 | 0→0 | 0.443% | 83.32 | 2/2 | PASS |
| regional:hewan:off:-1 | 0.001→0.001 / 0.002→0.002 | 0→0 | 0.422% | 43.75 | 2/2 | PASS |
| regional:hewan:on:-1 | 0.006→0.006 / 0.027→0.027 | 0→0 | 0.568% | 70.37 | 2/2 | PASS |

## regional:lingang

主匝道 4 条，加减速连接段 7 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:lingang:S-to-E-right | 0.021→0.021 / 0.022→0.022 | 0→0 | 6.707% | 48.05 | 2/2 | PASS |
| regional:lingang:E-to-S-star | 0.014→0.014 / 0.025→0.025 | 0→0 | 7.374% | 129.71 | 2/2 | PASS |
| regional:lingang:E-to-N-right | 0.022→0.022 / 0.021→0.021 | 0→0 | 6.711% | 47.97 | 2/2 | PASS |
| regional:lingang:N-to-E-star | 0.025→0.025 / 0.025→0.025 | 0→0 | 8.427% | 129.67 | 2/2 | PASS |

## regional:logistics

主匝道 8 条，加减速连接段 16 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:logistics:S-to-W-star | 0.025→0.025 / 0.025→0.025 | 0→0 | 4.945% | 129.67 | 2/2 | PASS |
| regional:logistics:S-to-E-right | 0.025→0.025 / 0.025→0.025 | 0→0 | 3.931% | 170.80 | 2/2 | PASS |
| regional:logistics:E-to-S-star | 0.011→0.011 / 0.025→0.025 | 0→0 | 3.744% | 129.71 | 2/2 | PASS |
| regional:logistics:E-to-N-right | 0.025→0.025 / 0.025→0.025 | 0→0 | 3.941% | 170.80 | 2/2 | PASS |
| regional:logistics:N-to-E-star | 0.000→0.000 / 0.025→0.025 | 0→0 | 4.946% | 129.67 | 2/2 | PASS |
| regional:logistics:N-to-W-right | 0.025→0.025 / 0.025→0.025 | 0→0 | 3.933% | 166.29 | 2/2 | PASS |
| regional:logistics:W-to-N-star | 0.011→0.011 / 0.025→0.025 | 0→0 | 3.744% | 129.71 | 2/2 | PASS |
| regional:logistics:W-to-S-right | 0.025→0.025 / 0.025→0.025 | 0→0 | 3.940% | 170.80 | 2/2 | PASS |

## regional:newcity-exit

主匝道 4 条，加减速连接段 4 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:newcity-exit:off:1 | 0.040→0.026 / 0.001→0.001 | 0→0 | 2.295% | 58.50 | 2/2 | PASS |
| regional:newcity-exit:on:1 | 0.001→0.001 / 0.016→0.016 | 0→0 | 0.185% | 39.47 | 2/2 | PASS |
| regional:newcity-exit:off:-1 | 0.006→0.006 / 0.001→0.001 | 0→0 | 0.241% | 62.44 | 2/2 | PASS |
| regional:newcity-exit:on:-1 | 0.001→0.001 / 0.042→0.035 | 0→0 | 2.421% | 56.63 | 4/4 | PASS |

## regional:qingling

主匝道 4 条，加减速连接段 8 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:qingling:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.979% | 151.87 | 2/2 | PASS |
| regional:qingling:E-to-S-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.590% | 119.21 | 2/2 | PASS |
| regional:qingling:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.886% | 161.04 | 2/2 | PASS |
| regional:qingling:N-to-E-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.702% | 119.40 | 2/2 | PASS |

## regional:shangu

主匝道 4 条，加减速连接段 1 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:shangu:off:1 | 0.048→0.024 / 0.068→0.000 | 0→0 | 6.306% | 43.41 | 2/2 | PASS |
| regional:shangu:on:1 | 0.054→0.000 / 0.129→0.044 | 0→0 | 6.294% | 79.14 | 2/2 | P1 |
| regional:shangu:off:-1 | 0.159→0.035 / 0.045→0.000 | 0→0 | 5.247% | 81.72 | 2/2 | PASS |
| regional:shangu:on:-1 | 0.037→0.000 / 0.032→0.032 | 0→0 | 4.699% | 83.29 | 2/2 | PASS |


- **regional:shangu:on:1 / P1**：Residual targeted geometry or fixture issue remains. Exact station probes and local candidate failures are retained; no unsafe candidate was published. 共享异常区：end 36–58m，ΔY=0.044m。详见 deferred.json 的 stations 与 attempts。

## regional:v2:airport-north

主匝道 8 条，加减速连接段 9 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v2:airport-north:S-to-W-loop | 0.001→0.001 / 0.001→0.001 | 0→0 | 5.212% | 66.53 | 2/2 | PASS |
| regional:v2:airport-north:S-to-E-right | 0.001→0.001 / 0.002→0.002 | 0→0 | 4.768% | 170.22 | 2/2 | PASS |
| regional:v2:airport-north:E-to-S-loop | 0.003→0.003 / 0.001→0.001 | 0→0 | 5.703% | 62.43 | 2/2 | PASS |
| regional:v2:airport-north:E-to-N-right | 0.002→0.002 / 0.000→0.000 | 0→0 | 5.921% | 129.23 | 2/2 | PASS |
| regional:v2:airport-north:N-to-E-loop | 0.003→0.003 / 0.002→0.002 | 0→0 | 5.199% | 66.56 | 2/2 | PASS |
| regional:v2:airport-north:N-to-W-right | 0.001→0.001 / 0.004→0.004 | 0→0 | 5.893% | 170.22 | 2/2 | PASS |
| regional:v2:airport-north:W-to-N-loop | 0.002→0.002 / 0.003→0.003 | 0→0 | 5.389% | 75.33 | 2/2 | PASS |
| regional:v2:airport-north:W-to-S-right | 0.003→0.003 / 0.001→0.001 | 0→0 | 5.545% | 129.23 | 2/2 | PASS |

## regional:v2:northwest

主匝道 8 条，加减速连接段 10 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v2:northwest:S-to-W-loop | 0.040→0.040 / 0.000→0.000 | 0→0 | 7.028% | 57.71 | 4/4 | PASS |
| regional:v2:northwest:S-to-E-right | 0.028→0.028 / 0.000→0.000 | 0→0 | 3.207% | 179.01 | 2/2 | PASS |
| regional:v2:northwest:E-to-S-loop | 0.000→0.000 / 0.041→0.033 | 0→0 | 6.763% | 49.30 | 4/4 | PASS |
| regional:v2:northwest:E-to-N-right | 0.000→0.000 / 0.002→0.002 | 0→0 | 7.208% | 173.94 | 2/2 | PASS |
| regional:v2:northwest:N-to-E-loop | 0.076→0.017 / 0.000→0.000 | 0→0 | 5.258% | 65.53 | 2/2 | PASS |
| regional:v2:northwest:N-to-W-right | 0.002→0.002 / 0.000→0.000 | 0→0 | 7.552% | 221.76 | 2/2 | PASS |
| regional:v2:northwest:W-to-N-loop | 0.000→0.000 / 0.058→0.018 | 0→0 | 4.525% | 66.29 | 2/2 | PASS |
| regional:v2:northwest:W-to-S-right | 0.000→0.000 / 0.029→0.029 | 0→0 | 3.080% | 130.55 | 2/2 | PASS |

## regional:v2:westgate

主匝道 8 条，加减速连接段 12 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v2:westgate:S-to-W-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.644% | 64.21 | 2/2 | PASS |
| regional:v2:westgate:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 1.413% | 196.07 | 2/2 | PASS |
| regional:v2:westgate:E-to-S-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.661% | 65.04 | 2/2 | PASS |
| regional:v2:westgate:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 1.413% | 196.07 | 2/2 | PASS |
| regional:v2:westgate:N-to-E-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.661% | 65.04 | 2/2 | PASS |
| regional:v2:westgate:N-to-W-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 1.413% | 196.07 | 2/2 | PASS |
| regional:v2:westgate:W-to-N-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.797% | 78.50 | 2/2 | PASS |
| regional:v2:westgate:W-to-S-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 1.413% | 196.07 | 2/2 | PASS |

## regional:v2:westlink

主匝道 8 条，加减速连接段 11 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v2:westlink:S-to-W-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.372% | 65.04 | 2/2 | PASS |
| regional:v2:westlink:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 1.745% | 196.07 | 2/2 | PASS |
| regional:v2:westlink:E-to-S-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.395% | 65.04 | 2/2 | PASS |
| regional:v2:westlink:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 1.745% | 195.25 | 2/2 | PASS |
| regional:v2:westlink:N-to-E-loop | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.395% | 65.04 | 2/2 | PASS |
| regional:v2:westlink:N-to-W-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 1.696% | 221.55 | 2/2 | PASS |
| regional:v2:westlink:W-to-N-loop | 0.009→0.009 / 0.000→0.000 | 0→0 | 4.391% | 64.62 | 2/2 | PASS |
| regional:v2:westlink:W-to-S-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 1.696% | 195.47 | 2/2 | PASS |

## regional:v3:airport-distributor

主匝道 8 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:airport-distributor:S-to-W-turbine | 0.045→0.029 / 0.021→0.021 | 0→0 | 12.000% | 165.49 | 2/2 | PASS |
| regional:v3:airport-distributor:S-to-E-right | 0.031→0.031 / 0.024→0.024 | 0→0 | 11.932% | 72.04 | 2/2 | PASS |
| regional:v3:airport-distributor:E-to-S-turbine | 0.000→0.000 / 0.048→0.026 | 0→0 | 11.949% | 85.76 | 2/2 | PASS |
| regional:v3:airport-distributor:E-to-N-right | 0.017→0.017 / 0.030→0.030 | 0→0 | 11.907% | 104.13 | 2/2 | PASS |
| regional:v3:airport-distributor:N-to-E-turbine | 0.041→0.028 / 0.001→0.001 | 0→0 | 11.977% | 65.84 | 2/2 | PASS |
| regional:v3:airport-distributor:N-to-W-right | 0.025→0.025 / 0.019→0.019 | 0→0 | 12.001% | 66.99 | 2/2 | PASS |
| regional:v3:airport-distributor:W-to-N-turbine | 0.016→0.016 / 0.038→0.038 | 0→0 | 11.906% | 93.43 | 2/2 | PASS |
| regional:v3:airport-distributor:W-to-S-right | 0.001→0.001 / 0.030→0.030 | 0→0 | 11.906% | 106.58 | 2/2 | PASS |

## regional:v3:airport-south

主匝道 4 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:airport-south:S-to-E-right | 0.025→0.025 / 0.023→0.023 | 0→0 | 11.905% | 207.48 | 2/2 | PASS |
| regional:v3:airport-south:E-to-S-turbine | 0.020→0.020 / 0.025→0.025 | 0→0 | 11.914% | 128.02 | 2/2 | PASS |
| regional:v3:airport-south:E-to-N-right | 0.032→0.032 / 0.030→0.030 | 0→0 | 11.947% | 79.80 | 2/2 | PASS |
| regional:v3:airport-south:N-to-E-turbine | 0.025→0.025 / 0.021→0.021 | 0→0 | 11.895% | 38.34 | 2/2 | PASS |

## regional:v3:chenjiang-east

主匝道 8 条，加减速连接段 15 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:chenjiang-east:S-to-W-turbine | 0.039→0.039 / 0.025→0.025 | 0→0 | 6.712% | 225.95 | 2/2 | PASS |
| regional:v3:chenjiang-east:S-to-E-right | 0.025→0.025 / 0.023→0.023 | 0→0 | 4.197% | 166.99 | 2/2 | PASS |
| regional:v3:chenjiang-east:E-to-S-turbine | 0.012→0.012 / 0.022→0.022 | 0→0 | 5.960% | 144.81 | 2/2 | PASS |
| regional:v3:chenjiang-east:E-to-N-right | 0.015→0.015 / 0.037→0.037 | 0→0 | 3.085% | 307.71 | 2/2 | PASS |
| regional:v3:chenjiang-east:N-to-E-turbine | 0.102→0.032 / 0.025→0.025 | 0→0 | 6.431% | 218.73 | 4/4 | PASS |
| regional:v3:chenjiang-east:N-to-W-right | 0.027→0.027 / 0.024→0.024 | 0→0 | 4.389% | 150.82 | 4/4 | PASS |
| regional:v3:chenjiang-east:W-to-N-turbine | 0.012→0.012 / 0.074→0.024 | 0→0 | 5.072% | 153.97 | 4/4 | PASS |
| regional:v3:chenjiang-east:W-to-S-right | 0.025→0.025 / 0.034→0.034 | 0→0 | 6.050% | 131.80 | 2/2 | PASS |

## regional:v3:chenjiang-foldback

主匝道 1 条，加减速连接段 1 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:chenjiang-foldback | 0.025→0.025 / 0.025→0.025 | 0→0 | 10.181% | 88.04 | 2/2 | PASS |

## regional:v3:north-river

主匝道 8 条，加减速连接段 11 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:north-river:S-to-W-turbine | 0.003→0.003 / 0.004→0.004 | 0→0 | 6.790% | 104.87 | 2/2 | PASS |
| regional:v3:north-river:S-to-E-right | 0.004→0.004 / 0.005→0.005 | 0→0 | 5.511% | 378.82 | 2/2 | PASS |
| regional:v3:north-river:E-to-S-turbine | 0.043→0.002 / 0.003→0.003 | 0→0 | 7.056% | 203.88 | 2/2 | PASS |
| regional:v3:north-river:E-to-N-right | 0.001→0.001 / 0.004→0.004 | 0→0 | 4.808% | 122.93 | 2/2 | PASS |
| regional:v3:north-river:N-to-E-turbine | 0.003→0.003 / 0.002→0.002 | 0→0 | 4.018% | 133.92 | 2/2 | PASS |
| regional:v3:north-river:N-to-W-right | 0.007→0.007 / 0.000→0.000 | 0→0 | 6.445% | 117.92 | 2/2 | PASS |
| regional:v3:north-river:W-to-N-turbine | 0.005→0.005 / 0.004→0.004 | 0→0 | 4.402% | 125.93 | 2/2 | PASS |
| regional:v3:north-river:W-to-S-right | 0.000→0.000 / 0.007→0.007 | 0→0 | 6.163% | 154.42 | 2/2 | PASS |

## regional:v3:northeast-chenjiang

主匝道 8 条，加减速连接段 14 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:northeast-chenjiang:S-to-W-turbine | 0.005→0.005 / 0.021→0.021 | 0→0 | 4.070% | 92.12 | 2/2 | PASS |
| regional:v3:northeast-chenjiang:S-to-E-right | 0.018→0.018 / 0.024→0.024 | 0→0 | 5.196% | 212.25 | 2/2 | PASS |
| regional:v3:northeast-chenjiang:E-to-S-turbine | 0.025→0.025 / 0.022→0.022 | 0→0 | 3.505% | 158.26 | 2/2 | PASS |
| regional:v3:northeast-chenjiang:E-to-N-right | 0.025→0.025 / 0.025→0.025 | 0→0 | 5.091% | 236.29 | 2/2 | PASS |
| regional:v3:northeast-chenjiang:N-to-E-turbine | 0.041→0.033 / 0.022→0.022 | 0→0 | 4.862% | 209.36 | 2/2 | PASS |
| regional:v3:northeast-chenjiang:N-to-W-right | 0.033→0.033 / 0.024→0.024 | 0→0 | 5.369% | 193.56 | 2/2 | PASS |
| regional:v3:northeast-chenjiang:W-to-N-turbine | 0.025→0.025 / 0.042→0.032 | 0→0 | 3.601% | 128.59 | 2/2 | PASS |
| regional:v3:northeast-chenjiang:W-to-S-right | 0.024→0.024 / 0.019→0.019 | 0→0 | 5.200% | 213.50 | 2/2 | PASS |

## regional:v3:northeast-donglin

主匝道 8 条，加减速连接段 14 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:northeast-donglin:S-to-W-turbine | 0.002→0.002 / 0.000→0.000 | 0→0 | 5.164% | 106.18 | 2/2 | PASS |
| regional:v3:northeast-donglin:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 6.894% | 209.89 | 2/2 | PASS |
| regional:v3:northeast-donglin:E-to-S-turbine | 0.000→0.000 / 0.002→0.002 | 0→0 | 4.534% | 200.56 | 2/2 | PASS |
| regional:v3:northeast-donglin:E-to-N-right | 0.000→0.000 / 0.001→0.001 | 0→0 | 7.095% | 208.41 | 2/2 | PASS |
| regional:v3:northeast-donglin:N-to-E-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 5.200% | 200.81 | 2/2 | PASS |
| regional:v3:northeast-donglin:N-to-W-right | 0.001→0.001 / 0.000→0.000 | 0→0 | 7.013% | 208.27 | 2/2 | PASS |
| regional:v3:northeast-donglin:W-to-N-turbine | 0.000→0.000 / 0.001→0.001 | 0→0 | 4.643% | 140.03 | 2/2 | PASS |
| regional:v3:northeast-donglin:W-to-S-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 7.064% | 208.41 | 2/2 | PASS |

## regional:v3:northeast-newcity

主匝道 8 条，加减速连接段 15 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:northeast-newcity:S-to-W-turbine | 0.003→0.003 / 0.000→0.000 | 0→0 | 3.937% | 76.03 | 2/2 | PASS |
| regional:v3:northeast-newcity:S-to-E-right | 0.008→0.008 / 0.011→0.011 | 0→0 | 4.161% | 453.24 | 2/2 | PASS |
| regional:v3:northeast-newcity:E-to-S-turbine | 0.000→0.000 / 0.003→0.003 | 0→0 | 4.446% | 201.27 | 2/2 | PASS |
| regional:v3:northeast-newcity:E-to-N-right | 0.000→0.000 / 0.003→0.003 | 0→0 | 6.757% | 111.48 | 2/2 | PASS |
| regional:v3:northeast-newcity:N-to-E-turbine | 0.006→0.006 / 0.000→0.000 | 0→0 | 3.938% | 66.98 | 2/2 | PASS |
| regional:v3:northeast-newcity:N-to-W-right | 0.011→0.011 / 0.010→0.010 | 0→0 | 4.204% | 358.74 | 2/2 | PASS |
| regional:v3:northeast-newcity:W-to-N-turbine | 0.000→0.000 / 0.006→0.006 | 0→0 | 4.439% | 190.56 | 2/2 | PASS |
| regional:v3:northeast-newcity:W-to-S-right | 0.000→0.000 / 0.001→0.001 | 0→0 | 7.407% | 93.32 | 2/2 | PASS |

## regional:v3:northeast-north

主匝道 8 条，加减速连接段 14 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:northeast-north:S-to-W-turbine | 0.000→0.000 / 0.003→0.003 | 0→0 | 3.677% | 146.42 | 2/2 | PASS |
| regional:v3:northeast-north:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 5.254% | 264.51 | 2/2 | PASS |
| regional:v3:northeast-north:E-to-S-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.621% | 159.08 | 2/2 | PASS |
| regional:v3:northeast-north:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 6.198% | 154.08 | 2/2 | PASS |
| regional:v3:northeast-north:N-to-E-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.589% | 159.62 | 2/2 | PASS |
| regional:v3:northeast-north:N-to-W-right | 0.000→0.000 / 0.001→0.001 | 0→0 | 5.272% | 273.92 | 2/2 | PASS |
| regional:v3:northeast-north:W-to-N-turbine | 0.004→0.004 / 0.000→0.000 | 0→0 | 5.141% | 214.17 | 2/2 | PASS |
| regional:v3:northeast-north:W-to-S-right | 0.001→0.001 / 0.000→0.000 | 0→0 | 5.753% | 173.36 | 2/2 | PASS |

## regional:v3:northeast-river

主匝道 8 条，加减速连接段 14 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:northeast-river:S-to-W-turbine | 0.001→0.001 / 0.000→0.000 | 0→0 | 3.262% | 206.06 | 2/2 | PASS |
| regional:v3:northeast-river:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.706% | 143.10 | 2/2 | PASS |
| regional:v3:northeast-river:E-to-S-turbine | 0.000→0.000 / 0.001→0.001 | 0→0 | 3.622% | 188.72 | 2/2 | PASS |
| regional:v3:northeast-river:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.417% | 161.84 | 2/2 | PASS |
| regional:v3:northeast-river:N-to-E-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.261% | 204.59 | 2/2 | PASS |
| regional:v3:northeast-river:N-to-W-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.691% | 200.02 | 2/2 | PASS |
| regional:v3:northeast-river:W-to-N-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.622% | 189.10 | 2/2 | PASS |
| regional:v3:northeast-river:W-to-S-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.427% | 226.77 | 2/2 | PASS |

## regional:v3:northeast-west

主匝道 8 条，加减速连接段 11 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:northeast-west:S-to-W-loop | 0.000→0.000 / 0.003→0.003 | 0→0 | 6.196% | 92.01 | 2/2 | PASS |
| regional:v3:northeast-west:S-to-E-right | 0.027→0.027 / 0.005→0.005 | 0→0 | 4.117% | 386.27 | 2/2 | PASS |
| regional:v3:northeast-west:E-to-S-loop | 0.004→0.004 / 0.030→0.030 | 0→0 | 6.288% | 69.94 | 2/2 | PASS |
| regional:v3:northeast-west:E-to-N-right | 0.006→0.006 / 0.000→0.000 | 0→0 | 4.252% | 345.31 | 2/2 | PASS |
| regional:v3:northeast-west:N-to-E-loop | 0.000→0.000 / 0.003→0.003 | 0→0 | 4.211% | 93.22 | 2/2 | PASS |
| regional:v3:northeast-west:N-to-W-right | 0.027→0.027 / 0.001→0.001 | 0→0 | 2.847% | 383.81 | 2/2 | PASS |
| regional:v3:northeast-west:W-to-N-loop | 0.005→0.005 / 0.000→0.000 | 0→0 | 7.490% | 80.06 | 2/2 | PASS |
| regional:v3:northeast-west:W-to-S-right | 0.001→0.001 / 0.000→0.000 | 0→0 | 3.967% | 178.06 | 2/2 | PASS |

## regional:v3:river-newcity

主匝道 8 条，加减速连接段 15 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:v3:river-newcity:S-to-W-turbine | 0.062→0.038 / 0.023→0.023 | 0→0 | 4.613% | 98.91 | 2/2 | PASS |
| regional:v3:river-newcity:S-to-E-right | 0.025→0.025 / 0.025→0.025 | 0→0 | 4.147% | 247.84 | 2/2 | PASS |
| regional:v3:river-newcity:E-to-S-turbine | 0.025→0.025 / 0.051→0.037 | 0→0 | 6.268% | 148.33 | 2/2 | PASS |
| regional:v3:river-newcity:E-to-N-right | 0.025→0.025 / 0.027→0.027 | 0→0 | 5.432% | 99.63 | 4/4 | PASS |
| regional:v3:river-newcity:N-to-E-turbine | 0.031→0.031 / 0.025→0.025 | 0→0 | 7.955% | 97.36 | 2/2 | PASS |
| regional:v3:river-newcity:N-to-W-right | 0.032→0.032 / 0.024→0.024 | 0→0 | 2.935% | 388.43 | 2/2 | PASS |
| regional:v3:river-newcity:W-to-N-turbine | 0.010→0.010 / 0.037→0.037 | 0→0 | 6.083% | 202.04 | 2/2 | PASS |
| regional:v3:river-newcity:W-to-S-right | 0.025→0.025 / 0.033→0.033 | 0→0 | 4.947% | 120.09 | 2/2 | PASS |

## regional:wuliuyuan

主匝道 4 条，加减速连接段 4 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:wuliuyuan:off:1 | 0.032→0.032 / 0.002→0.002 | 0→0 | 0.155% | 82.82 | 2/2 | PASS |
| regional:wuliuyuan:on:1 | 0.003→0.003 / 0.006→0.006 | 0→0 | 0.270% | 85.69 | 2/2 | PASS |
| regional:wuliuyuan:off:-1 | 0.013→0.013 / 0.003→0.003 | 0→0 | 0.271% | 79.66 | 2/2 | PASS |
| regional:wuliuyuan:on:-1 | 0.002→0.002 / 0.032→0.032 | 0→0 | 0.155% | 79.15 | 2/2 | PASS |

## regional:xichuan

主匝道 4 条，加减速连接段 8 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:xichuan:S-to-E-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.888% | 162.31 | 2/2 | PASS |
| regional:xichuan:E-to-S-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.702% | 119.40 | 2/2 | PASS |
| regional:xichuan:E-to-N-right | 0.000→0.000 / 0.000→0.000 | 0→0 | 3.880% | 153.87 | 2/2 | PASS |
| regional:xichuan:N-to-E-turbine | 0.000→0.000 / 0.000→0.000 | 0→0 | 4.768% | 119.21 | 2/2 | PASS |

## regional:yanjiang-exit

主匝道 4 条，加减速连接段 4 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:yanjiang-exit:off:1 | 0.043→0.015 / 0.001→0.001 | 0→0 | 0.306% | 43.10 | 2/2 | PASS |
| regional:yanjiang-exit:on:1 | 0.001→0.001 / 0.023→0.023 | 0→0 | 0.678% | 46.16 | 2/2 | PASS |
| regional:yanjiang-exit:off:-1 | 0.025→0.025 / 0.001→0.001 | 0→0 | 0.873% | 55.45 | 2/2 | PASS |
| regional:yanjiang-exit:on:-1 | 0.001→0.001 / 0.028→0.028 | 0→0 | 0.341% | 57.82 | 2/2 | PASS |

## regional:yunling-exit

主匝道 4 条，加减速连接段 4 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| regional:yunling-exit:off:1 | 0.013→0.013 / 0.003→0.003 | 0→0 | 0.617% | 66.47 | 2/2 | PASS |
| regional:yunling-exit:on:1 | 0.004→0.004 / 0.041→0.021 | 0→0 | 0.851% | 52.79 | 2/2 | PASS |
| regional:yunling-exit:off:-1 | 0.030→0.030 / 0.000→0.000 | 0→0 | 0.805% | 44.09 | 2/2 | PASS |
| regional:yunling-exit:on:-1 | 0.003→0.003 / 0.015→0.015 | 0→0 | 0.594% | 50.01 | 2/2 | PASS |

## v8-ring-north

主匝道 2 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| v8-ring-north:off--1 | 0.000→0.000 / 0.000→0.000 | 0→0 | 11.363% | 82.46 | 1/1 | PASS |
| v8-ring-north:on--1 | 0.000→0.000 / 0.000→0.000 | 0→0 | 11.386% | 327.74 | 1/1 | PASS |

## v91-ew-east

主匝道 4 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| v91-ew-east-eb-off | 0.025→0.025 / 0.025→0.025 | 0→0 | 10.968% | 353.47 | 2/2 | PASS |
| v91-ew-east-wb-on | 0.025→0.025 / 0.025→0.025 | 0→0 | 11.900% | 383.20 | 2/2 | PASS |
| v91-ew-east-eb-on | 0.025→0.025 / 0.025→0.025 | 0→0 | 11.905% | 212.74 | 2/2 | PASS |
| v91-ew-east-wb-off | 0.036→0.012 / 0.033→0.033 | 0→0 | 12.000% | 257.03 | 2/2 | PASS |

## v91-ew-west

主匝道 4 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| v91-ew-west-eb-off | 0.025→0.025 / 0.025→0.025 | 0→0 | 11.900% | 335.99 | 2/2 | PASS |
| v91-ew-west-wb-on | 0.025→0.025 / 0.025→0.025 | 0→0 | 11.900% | 313.22 | 2/2 | PASS |
| access-ew-west-eb-on | 3.059→3.059 / 3.609→3.609 | 0→0 | 11.722% | 150.10 | 1/2 | P0 |
| access-ew-west-wb-off | 1.305→1.307 / 0.000→0.000 | 0→0 | 11.788% | 49.50 | 1/2 | P0 |


- **access-ew-west-eb-on / P0**：The frozen mainline/frontage footprints leave about 11.44m independent pavement, while the 8m height transition alone needs at least 66.67m at 12%, before vertical easements. Tested local XZ/Y candidates did not satisfy shared-layer, curvature and clearance constraints; a longer approach or relocated mainline attachment is needed. 共享异常区：start 6–48m，ΔY=3.059m；end 6–53m，ΔY=3.609m。详见 deferred.json 的 stations 与 attempts。


- **access-ew-west-wb-off / P0**：The frozen mainline/frontage footprints leave about 65.49m independent pavement, while the 8m height transition alone needs at least 66.67m at 12%, before vertical easements. Tested local XZ/Y candidates did not satisfy shared-layer, curvature and clearance constraints; a longer approach or relocated mainline attachment is needed. 共享异常区：start 6–33m，ΔY=1.307m。详见 deferred.json 的 stations 与 attempts。

## v91-ns

主匝道 4 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| v91-ns-sb-on | 0.025→0.025 / 0.025→0.025 | 0→0 | 11.900% | 327.21 | 2/2 | PASS |
| v91-ns-nb-off | 0.025→0.025 / 0.025→0.025 | 0→0 | 11.900% | 327.21 | 2/2 | PASS |
| v91-ns-sb-off | 1.891→0.012 / 1.366→0.012 | 0→0 | 12.000% | 48.76 | 2/2 | PASS |
| v91-ns-nb-on | 1.366→0.012 / 1.891→0.012 | 0→0 | 12.000% | 48.77 | 2/2 | PASS |

## v91-ns-north

主匝道 4 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| access-ns-north-sb-off | 1.402→0.012 / 0.985→0.012 | 0→0 | 12.000% | 106.25 | 2/2 | PASS |
| access-ns-north-nb-on | 1.093→0.012 / 1.524→0.012 | 0→0 | 12.000% | 65.55 | 2/2 | PASS |
| access-ns-north-sb-on | 0.025→0.025 / 0.025→0.025 | 0→0 | 6.877% | 96.54 | 2/2 | PASS |
| access-ns-north-nb-off | 0.043→0.032 / 0.034→0.033 | 0→0 | 8.154% | 57.60 | 2/2 | PASS |

## v91-ring-north

主匝道 2 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| v91-ring-north-outer-off | 0.000→0.000 / 0.000→0.000 | 0→0 | 6.340% | 162.58 | 2/2 | PASS |
| v91-ring-north-outer-on | 0.000→0.000 / 0.000→0.000 | 0→0 | 9.773% | 147.43 | 2/2 | PASS |

## v91-ring-south

主匝道 4 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| v91-ring-south-inner-off | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 89.48 | 2/2 | PASS |
| v91-ring-south-inner-on | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 89.48 | 2/2 | PASS |
| v91-ring-south-outer-off | 0.000→0.000 / 0.000→0.000 | 0→0 | 9.986% | 90.31 | 2/2 | PASS |
| v91-ring-south-outer-on | 0.000→0.000 / 0.000→0.000 | 0→0 | 10.000% | 90.31 | 2/2 | PASS |

## v91-ring-west

主匝道 4 条，加减速连接段 0 条。主线/派生段/辅路清单见 interchange-inventory.json。设施检查：PASS。

| ramp | shared ΔY start/end before→after (m) | ≥4pp 坡折 before→after | max grade after | min radius after (m) | replay passed/applicable | status |
|---|---|---|---|---|---|---|
| v91-ring-west-inner-off | 0.002→0.002 / 0.001→0.001 | 0→0 | 0.012% | 76.52 | 2/2 | PASS |
| v91-ring-west-inner-on | 0.003→0.003 / 0.002→0.002 | 0→0 | 0.010% | 108.91 | 2/2 | PASS |
| v91-ring-west-outer-off | 0.001→0.001 / 0.000→0.000 | 0→0 | 0.000% | 127.85 | 2/2 | PASS |
| v91-ring-west-outer-on | 0.000→0.000 / 0.000→0.000 | 0→0 | 0.000% | 82.96 | 2/2 | PASS |

## 验证与发布

- 全部 520 条道路、1040 个端接口的拓扑、方向、端点/切线、共享铺装、主体纵坡/曲率、轮迹与铺装边界检查已输出；残余问题按上表和 deferred.json 保留。
- 最终短回放 522 次，满足完整合同 520 次；不通过的接口没有计为 PASS。路口所有的非直接 split/merge 端点 2 个，通过路口拓扑/铺装检查列为 N/A，不伪造直连。
- 车辆保持原物理和完整碰撞体，只有初始速度设置一次。正常悬挂卸载允许，未把 minGrounded 必须恒为 4 当作要求。
- typecheck 成功；初次新增的两处类型错误已修正并重跑。
- Map 校验 0 errors；新增 4 个推荐坡度提示为约 12% 的求解数值余量，原断言和物理阈值未放宽，实际数值见 map-validation.json。
- Build：`pnpm run build -BasicValidation`，退出码 0，独立 Browser 命令启动 1 次（desktop:package 另外内含一次，合计 2 次），已更新 dist 并核对 runtime map。
- 没有运行 full core、全车型、editor 全量、长时间 UI 驾驶或全地图连续物理回放。

[before-after-summary.json](before-after-summary.json) · [geometry-validation.json](geometry-validation.json) · [shared-pavement-validation.json](shared-pavement-validation.json) · [runtime-short-replay.json](runtime-short-replay.json) · [facility-marking-validation.json](facility-marking-validation.json) · [navigation-validation.json](navigation-validation.json) · [deferred.json](deferred.json) · [scope-guard.json](scope-guard.json) · [validation.json](validation.json)

## Windows 正式发布

命令：`pnpm run desktop:package`。退出码 0；按用户最后指定的 build → desktop:package 流程，本轮共两次 Browser 构建。完整包发布至 D:/DriverSchoolRelease/DriverSchool-win32-x64，正式入口 D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe。

全部 21 个应用文件与打包 payload 核对通过（package.json 按严格 JSON 内容比较，其余逐字节比较）；内外 app.asar 哈希相同。正式包 runtime map 与当前 dist/正常编译器哈希一致，版本 v491。正式 EXE 基本启动 smoke：PASS，菜单可用、WebGL 展示就绪、桌面桥隔离正常；保留 Electron sandbox，没有自动驾驶。

验证工具初次的 Windows ASAR 路径、manifest 格式比较和关闭等待问题已修正，结果保留在 release-result.json；无需修改或重构建产品。

[release-result.json](release-result.json) · [dist-consistency.json](dist-consistency.json) · [external-release-smoke.json](external-release-smoke.json)

## 修改文件

- src/world/regional/regional-main.json：局部匝道、支撑表示、标线开关及相关路牌/设施数据。
- src/world/regional/HighwayLaneRenderer.ts：加减速段复用按需导流线三角面裁剪。
- src/world/city/CityMapData.ts、CityMapValidation.ts：显式隧道支路开口字段及引用校验。
- src/world/city/RoadInfrastructure.ts、RoadBuilder.ts：侧墙可视与碰撞共同生成开口。
- README.md、docs/CURRENT_CODE_CONTEXT.md、docs/CHAT_HANDOFF.md、docs/DESKTOP_UI_PHASE1.md、docs/INTERCHANGE_REPAIR_2026-10-23.md：现地图、发布流程、实际验证和保留问题。
- 本目录：冻结基线、逐组候选/失败证据、定点验收与报告。
