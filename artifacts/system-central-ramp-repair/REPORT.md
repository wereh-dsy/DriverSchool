# system-central 中心立交匝道修复

**PASS：8 / remaining P0：0 / remaining P1：0。**

修复 7 条问题匝道；`system-central:S-to-E-right` 整条道路记录未改动，只作回归。源地图版本 489 → 490。四条主线、roadLinks、connectionPorts、交叉口、其他互通与车辆/支撑/悬挂代码均保持原样。已有审计目录作为 before，没有重跑基线审计。

## 逐条指标 before → after

shared ΔY 是同一父主线完整 split 链的连接区采样高差，起点/终点分别列出；范围单位 m，从对应接口向匝道内部量取。before 复用原 2m 采样，after 使用 1m、含 pavement 边缘的更密采样。坡折阈值沿用原审计 ≥4pp。

| ramp | max shared ΔY start/end (m) | conflict range start/end (m) | grade break count | max grade break (pp) | max grade after | barrier/object ticks start/end | rejection start/end | full-air start/end | target ownership start/end |
|---|---|---|---|---|---|---|---|---|---|

| S-to-W-semi | 0.001→0.001 / 0.000→0.000 | 无→无 / 无→无 | 1→0 | 6.665→3.832 | 8.69% | 0→0 / 0→0 | 0→0 / 0→0 | 0→0 / 0→0 | true→true / true→true |

| S-to-E-right | 0.001→0.001 / 0.000→0.000 | 无→无 / 无→无 | 0→0 | 0.638→0.638 | 10.45% | 0→0 / 0→0 | 0→0 / 0→0 | 0→0 / 0→0 | true→true / true→true |

| E-to-S-semi | 5.991→0.000 / 0.570→0.001 | 8–116→无 / 16–138→无 | 12→0 | 14.495→2.939 | 10.56% | 203→0 / 0→0 | 0→0 / 0→0 | 0→0 / 0→0 | false→true / true→true |

| E-to-N-right | 3.538→0.000 / 0.000→0.000 | 4–78→无 / 无→无 | 1→0 | 4.636→1.880 | 12.00% | 365→0 / 0→0 | 0→0 / 0→0 | 0→0 / 0→0 | false→true / true→true |

| N-to-E-semi | 0.772→0.007 / 0.000→0.000 | 36–82→无 / 无→无 | 5→0 | 8.593→3.790 | 11.08% | 0→0 / 0→0 | 408→0 / 0→0 | 61→0 / 0→0 | false→true / true→true |

| N-to-W-right | 0.000→0.000 / 6.263→0.000 | 无→无 / 4–72→无 | 2→0 | 6.278→1.586 | 12.00% | 0→0 / 0→0 | 0→0 / 0→0 | 0→0 / 0→0 | true→true / true→true |

| W-to-N-semi | 0.000→0.021 / 1.010→0.003 | 无→无 / 8–138→无 | 8→0 | 8.770→2.563 | 11.50% | 0→0 / 0→0 | 0→0 / 0→0 | 0→0 / 0→0 | true→true / true→true |

| W-to-S-right | 4.929→0.000 / 0.125→0.001 | 12–84→无 / 18–92→无 | 4→0 | 7.269→1.927 | 12.00% | 389→0 / 0→0 | 0→0 / 0→0 | 0→0 / 0→0 | false→true / true→true |

## system-central:S-to-W-semi

- **before**：BAD_GRADE_TRANSITION / P1；两端连接和短回放通过；主体存在 6.665 个百分点硬坡折。
- **root cause**：相邻线性高程段纵坡未连续；并非缺少 roadLink 或端点错位。
- **geometry change**：局部窗口 [915.814, 963.814]m；XZ 不变。 最大 Y 修正 0.312m，保持两端 XYZ。
- **support/pavement change**：共享区贴合父主线层级，真正平面独立后才过渡升降；编辑匝道采用 ribbon，与可视铺装共用 RoadEdgeChain 三角面。。没有指定 surface ID，也没有放宽支撑或机械阈值。
- **barrier/marking/facility change**：相关主线/匝道护栏、围护、piers、gore、车道边缘和 merge divider 经现有生成器按最终几何重新生成并检查；重投影 5 个道路路牌。该道路 opt-in 开启导流线实际铺装裁剪，剔除浮空的折角三角面。 0 个道路生成灯位、8 个桥墩按最终几何重算。

- **replay after / start**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.247m/s²，pitchRate=0.182rad/s，rollRate=0.020rad/s，最大跟踪误差=0.087m。

- **replay after / end**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.025rad/s，最大跟踪误差=0.119m。

- **final status：PASS**。

## system-central:S-to-E-right

- **before**：PASS；本轮定点检查未发现 P0/P1。两端短回放均完成并达到正确支撑归属；主体最大纵坡变化低于 4 个百分点阈值。
- **root cause**：不适用。
- **geometry change**：geometry 完全不变。
- **support/pavement change**：保留原 ribbon 与共享区。没有指定 surface ID，也没有放宽支撑或机械阈值。
- **barrier/marking/facility change**：相关主线/匝道护栏、围护、piers、gore、车道边缘和 merge divider 经现有生成器按最终几何重新生成并检查；重投影 4 个道路路牌。保留原导流标线规则。 0 个道路生成灯位、4 个桥墩按最终几何重算。

- **replay after / start**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.273m/s²，pitchRate=0.183rad/s，rollRate=0.021rad/s，最大跟踪误差=0.098m。

- **replay after / end**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.024rad/s，最大跟踪误差=0.113m。

- **final status：PASS**。

## system-central:E-to-S-semi

- **before**：COMPLEX / P0；端点相同，但匝道下坡时仍与 +8m 主线铺装重叠。车辆留在上层主线并撞主线护栏；未进入匝道支撑。
- **root cause**：高程下降先于平面分离，共享区域出现多个相差数米的铺装；现有支撑延续和护栏开口因此对应上层主线。
- **geometry change**：局部窗口 [0.000, 379.174]m、[597.707, 677.820]m、[944.724, 1004.652]m、[1013.655, 1313.655]m；XZ 不变。 最大 Y 修正 6.022m，保持两端 XYZ。
- **support/pavement change**：共享区贴合父主线层级，真正平面独立后才过渡升降；编辑匝道采用 ribbon，与可视铺装共用 RoadEdgeChain 三角面。start 同层保护延伸至约 130.000m；end 同层保护延伸至约 155.000m。没有指定 surface ID，也没有放宽支撑或机械阈值。
- **barrier/marking/facility change**：相关主线/匝道护栏、围护、piers、gore、车道边缘和 merge divider 经现有生成器按最终几何重新生成并检查；重投影 5 个道路路牌。保留原导流标线规则。 0 个道路生成灯位、9 个桥墩按最终几何重算。

- **replay after / start**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.021rad/s，最大跟踪误差=0.089m。

- **replay after / end**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.225m/s²，pitchRate=0.182rad/s，rollRate=0.023rad/s，最大跟踪误差=0.112m。

- **final status：PASS**。

## system-central:E-to-N-right

- **before**：COMPLEX / P0；先短暂上拱再下降；尚未脱离主线 footprint 就形成米级高差。回放车辆仍在主线上，被主线外侧护栏阻挡。
- **root cause**：分流平面重叠长度与纵向下降位置不匹配；s=19.336m 另有 4.636 个百分点坡折。
- **geometry change**：局部窗口 [0.000, 300.000]m；喉部局部横移最大约 8m。 最大 Y 修正 0.937m，保持两端 XYZ。
- **support/pavement change**：共享区贴合父主线层级，真正平面独立后才过渡升降；编辑匝道采用 ribbon，与可视铺装共用 RoadEdgeChain 三角面。start 同层保护延伸至约 48.000m。没有指定 surface ID，也没有放宽支撑或机械阈值。
- **barrier/marking/facility change**：相关主线/匝道护栏、围护、piers、gore、车道边缘和 merge divider 经现有生成器按最终几何重新生成并检查；重投影 5 个道路路牌。该道路 opt-in 开启导流线实际铺装裁剪，剔除浮空的折角三角面。 0 个道路生成灯位、2 个桥墩按最终几何重算。另将实际挡路的 v6-lamps-806 移至该匝道有支撑的路肩；未删除设施。

- **replay after / start**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.797m/s²，pitchRate=0.182rad/s，rollRate=0.027rad/s，最大跟踪误差=0.106m。

- **replay after / end**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.025rad/s，最大跟踪误差=0.121m。

- **final status：PASS**。

## system-central:N-to-E-semi

- **before**：COMPLEX / P0；一侧轮迹转入匝道、另一侧继续沿南向主线，随后面对约 0.726m 上跳被 unreachable-layer-switch 拒绝，最终全轮失去接地。
- **root cause**：匝道与继续下降的主线在共享区域纵断面分离，轮间所有权不一致。拒绝是已有机械可达性检查的结果，不能通过放宽 Support Selection 修复。
- **geometry change**：局部窗口 [0.000, 200.000]m、[297.155, 345.155]m、[630.392, 678.392]m、[856.190, 934.926]m、[1113.154, 1161.154]m；XZ 不变。 最大 Y 修正 0.862m，保持两端 XYZ。
- **support/pavement change**：共享区贴合父主线层级，真正平面独立后才过渡升降；编辑匝道采用 ribbon，与可视铺装共用 RoadEdgeChain 三角面。start 同层保护延伸至约 95.000m。没有指定 surface ID，也没有放宽支撑或机械阈值。
- **barrier/marking/facility change**：相关主线/匝道护栏、围护、piers、gore、车道边缘和 merge divider 经现有生成器按最终几何重新生成并检查；重投影 5 个道路路牌。该道路 opt-in 开启导流线实际铺装裁剪，剔除浮空的折角三角面。 0 个道路生成灯位、11 个桥墩按最终几何重算。

- **replay after / start**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.751m/s²，pitchRate=0.181rad/s，rollRate=0.023rad/s，最大跟踪误差=0.102m。

- **replay after / end**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.024rad/s，最大跟踪误差=0.116m。

- **final status：PASS**。

## system-central:N-to-W-right

- **before**：COMPLEX / P1；合流端点对齐，但接近区仍有最高 6.263m 的上下铺装重叠，形成逐渐插入桥面式几何。此次从合流前 40m 开始的短回放可通过，不能据重叠高度直接声称断路。主体另有 4.818/6.278 个百分点坡折。
- **root cause**：抬升阶段与主线平面重叠；端点同高掩盖了连接区几何问题。
- **geometry change**：局部窗口 [210.524, 500.524]m；合流喉部 S 形局部偏移，向外最多约 8m、上游反向最多约 18m，以避开原有半直连匝道及辅路跨越。 最大 Y 修正 4.717m，保持两端 XYZ。
- **support/pavement change**：共享区贴合父主线层级，真正平面独立后才过渡升降；编辑匝道采用 ribbon，与可视铺装共用 RoadEdgeChain 三角面。end 同层保护延伸至约 52.000m。没有指定 surface ID，也没有放宽支撑或机械阈值。
- **barrier/marking/facility change**：相关主线/匝道护栏、围护、piers、gore、车道边缘和 merge divider 经现有生成器按最终几何重新生成并检查；重投影 4 个道路路牌。保留原导流标线规则。 0 个道路生成灯位、1 个桥墩按最终几何重算。

- **replay after / start**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.020rad/s，最大跟踪误差=0.089m。

- **replay after / end**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.022rad/s，最大跟踪误差=0.103m。

- **final status：PASS**。

## system-central:W-to-N-semi

- **before**：COMPLEX / P1；接近合流时匝道与北向主线同 XZ 区域高程不同；两端短回放可通过。主体存在 8 处 ≥4 个百分点坡折，最大 8.770 个百分点；短采样段需与真实曲率分开解释。
- **root cause**：主线下降/匝道局部高程平台与大量线性高程控制段叠加；不是 connectionPort 缺失。
- **geometry change**：局部窗口 [191.799, 327.786]m、[351.000, 399.000]m、[546.000, 624.000]m、[819.566, 867.566]m、[951.592, 1236.592]m；XZ 不变。 最大 Y 修正 1.220m，保持两端 XYZ。
- **support/pavement change**：共享区贴合父主线层级，真正平面独立后才过渡升降；编辑匝道采用 ribbon，与可视铺装共用 RoadEdgeChain 三角面。end 同层保护延伸至约 155.000m。没有指定 surface ID，也没有放宽支撑或机械阈值。
- **barrier/marking/facility change**：相关主线/匝道护栏、围护、piers、gore、车道边缘和 merge divider 经现有生成器按最终几何重新生成并检查；重投影 5 个道路路牌。保留原导流标线规则。 0 个道路生成灯位、5 个桥墩按最终几何重算。

- **replay after / start**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.032rad/s，最大跟踪误差=0.096m。

- **replay after / end**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.760m/s²，pitchRate=0.182rad/s，rollRate=0.025rad/s，最大跟踪误差=0.118m。

- **final status：PASS**。

## system-central:W-to-S-right

- **before**：COMPLEX / P0；前 60m 初始统计仅显示较小重叠高差，但扩大到后续主线子段后，车辆仍被上层主线支撑并撞外侧护栏，未正常转入下降匝道。
- **root cause**：只看直连父段会漏掉后续 split 子段。匝道下降与主线延续铺装冲突，s=17.942/62.944/68.476m 还有硬坡折。
- **geometry change**：局部窗口 [0.000, 300.000]m、[371.140, 551.140]m；喉部局部横移最大约 8m。 最大 Y 修正 3.199m，保持两端 XYZ。
- **support/pavement change**：共享区贴合父主线层级，真正平面独立后才过渡升降；编辑匝道采用 ribbon，与可视铺装共用 RoadEdgeChain 三角面。start 同层保护延伸至约 54.000m；end 同层保护延伸至约 104.000m。没有指定 surface ID，也没有放宽支撑或机械阈值。
- **barrier/marking/facility change**：相关主线/匝道护栏、围护、piers、gore、车道边缘和 merge divider 经现有生成器按最终几何重新生成并检查；重投影 4 个道路路牌。该道路 opt-in 开启导流线实际铺装裁剪，剔除浮空的折角三角面。 0 个道路生成灯位、0 个桥墩按最终几何重算。

- **replay after / start**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.967m/s²，pitchRate=0.182rad/s，rollRate=0.030rad/s，最大跟踪误差=0.121m。

- **replay after / end**：path completed=true，target ownership=true，min grounded=4/4，full airborne=0，support rejection=0，collision=0，mechanical impulse=0N·s，safety/recovery=0；|aY|max=0.227m/s²，pitchRate=0.182rad/s，rollRate=0.024rad/s，最大跟踪误差=0.115m。

- **final status：PASS**。

## 设施、标线和兼容性

- 37 个中心匝道路牌保持 ID、内容和横向附着语义，按原 station 比例重新投影并更新 base Y/heading；原 4 个 base-Y outlier 已消除。显式地面支架基础保持其原语义。
- 只移动 1 个实际侵入车辆包络的物件：`v6-lamps-806`；前后位姿见 facility-marking-validation.json.objectUpdates。其他物件未修改。
- 70 条中心匝道/关联主线道路生成实际渲染设施进行定点检查：unsupported paint=0、gore hatch in live lane=0。37 个路牌 base-Y outlier=0。道路自带灯位/桥墩和碰撞体均重算，没有新增人工虚构设施。
- 可选 `gore.clipToPavement` 只在 4 条出现浮空导流线的中心匝道上设为 true；非 opt-in 道路仍走原生成分支，其他互通 JSON 未变。
- NS 下穿与 EW 高架仍保留。新旧精确铺装 polygon 跨越检查确认没有新增近层交叉、没有损失合法结构所需的净空：正常跨越保留至少约 6.15m surface gap（约 5.5m 扣除桥板后的空间）；原低于该名义值的结构保持其既有最小边界。并非承诺每个原有大净空数值完全不减。

## 验证与构建

- 8 ramp geometry、16 接口共享铺装/轮迹/边缘、定点导航、跨越净空：PASS。
- 原 16 接口短回放（120Hz、roadSUV、原控制路径、原地形和完整碰撞体）：16/16 PASS；全轮离地、candidateCount=0、选中支撑拒绝、设施碰撞、机械冲量、safety/recovery 均为 0。
- S-to-E-right：道路记录严格相同，两端回放维持 PASS。
- typecheck：`pnpm run typecheck`，退出码 0。
- build：`pnpm run build -BasicValidation`，退出码 0。已更新 playable dist。
- 构建次数共 2 次：首次成功；用户明确回复“允许额外构建一次，完成修正”后，追加构建成功。首次报告与构建记录保存在 first-publication/。最终 N-to-W-right 最小半径由首次修复版 15.927m 提升至 37.847m，重新通过全部定点验收。
- 源码与 dist 的道路、拓扑、路牌和物件逐项一致，见 dist-consistency.json。
- 没有运行 full core、全车型、editor 全量、其他互通/全图 ramp、全图设施或长时间 UI 驾驶。

“support rejection=0”统计选中轮胎支撑，不把候选集合中被正确排除的合法上下层表面算作错误。改动仅在地图数据/标线生成；车辆物理、Support Selection、悬挂、阈值和 Black Box 未改。

范围限制：本轮按约定执行 16 个接口短回放，未作整条匝道全速度连续驾驶或主观视觉/驾驶调校；已解决本轮审计阈值下的 P0/P1，最终主观评价仍由用户进行。

## 交付文件

- 源码：[regional-main.json](../../src/world/regional/regional-main.json)、[CityMapData.ts](../../src/world/city/CityMapData.ts)、[CityMapValidation.ts](../../src/world/city/CityMapValidation.ts)、[HighwayLaneRenderer.ts](../../src/world/regional/HighwayLaneRenderer.ts)。
- [dist-consistency.json](dist-consistency.json)、[second-build-result.json](second-build-result.json)、[second-build.log](second-build.log)：最终发布一致性与已获授权的追加构建。
- [acceptance-summary.json](acceptance-summary.json)：8 条逐项验收和 before/after 指标。
- [geometry-validation.json](geometry-validation.json)、[shared-pavement-after.json](shared-pavement-after.json)：精确铺装、轮迹、纵坡与跨越检查。
- [facility-marking-validation.json](facility-marking-validation.json)：实际标线三角面、设施生成、路牌和路灯适配。
- [after/runtime-short-replay.json](after/runtime-short-replay.json)：16 接口逐轮回放。
- [after/connection-audit.json](after/connection-audit.json)、[after/elevation-audit.json](after/elevation-audit.json)、[after/pavement-support-audit.json](after/pavement-support-audit.json)：修复后的同口径定点证据。
- [repair-plans.json](repair-plans.json)、[baseline.json](baseline.json)、[publication.json](publication.json)、[validation.json](validation.json)：可复现局部窗口、原始道路数据、范围保护与实际验证记录。
