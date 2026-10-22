# City Main v486 → v487：互通整体审计

## 结论

137 条遗留关联记录全部读取并归属审查，最终聚合为 27 个互通/完整连接走廊；原 30 个空间分量中，陈江折返及两组连续双幅道路合并为所属走廊。21 个 FIXED，0 个 PASS，0 个 INTENTIONAL_STRUCTURE，6 个 DEFER_UNRESOLVED。实际修改 115 条道路、352 条设施记录。

此阶段完成了全部有证据可安全接受的候选实施；仍有 6 个整体方案未解决，详细道路、当前冲突、失败方案和撤回原因见 deferred.json。未将未收敛解释为几何无解，也未以重分类或阈值放宽清空列表。

## 方法与边界

复用上一轮完整清单、14,048 条失败尝试和纵断面结果；按空间冲突、真实互通归属、完整端点连接及交叉道路聚类。各候选联合求解整个路组，保留稳定主线，约束真实铺装三角形交叠边界；必要时采用外扩匝道、辅路/主线分合流节点整体移位、连续双幅道路联立修复或成对转向线形重整。节点移位同时重分相邻道路，保留原道路 ID、车道、宽度、方向和所有导航连接。

交通标牌按真实所属道路站距、高度、车道方向重新投影，并检查支柱/牌面与其他道路及设施的体积冲突；路灯、护栏及桥柱同步检查。自动路灯改用最终道路所属的桥面肩部/人行道安装点，渲染和审计共享同一生成函数，避免桥外悬空。标线与护栏由最终道路和既有 ownership 重新生成。未修改车辆物理、电控、支撑选择和黑匣子。

## 每个互通的结果

| cluster | 互通/走廊 | 唯一归属记录 | 结论 | 修改道路 | 设施调整 |
|---|---|---:|---|---:|---:|
| interchange-03 | regional:v3:airport-distributor | 9 | FIXED | 8 | 33 |
| interchange-06 | regional:v3:chenjiang-east + regional:v3:chenjiang-foldback | 6 | FIXED | 11 | 64 |
| interchange-02 | regional:logistics | 4 | FIXED | 8 | 49 |
| interchange-05 | regional:v3:northeast-chenjiang | 3 | FIXED | 8 | 46 |
| interchange-04 | regional:v3:river-newcity | 2 | FIXED | 9 | 55 |
| interchange-01 | regional:lingang | 2 | FIXED | 4 | 25 |
| interchange-08 | regional:v3:airport-south | 3 | FIXED | 4 | 20 |
| interchange-18 | peripheral-interchange:S-to-E-right | 5 | FIXED | 5 | 6 |
| interchange-09 | system-central | 31 | DEFER_UNRESOLVED | 0 | 0 |
| interchange-19 | system-east | 12 | FIXED | 8 | 29 |
| interchange-12 | system-north | 12 | DEFER_UNRESOLVED | 0 | 0 |
| interchange-15 | system-south | 5 | DEFER_UNRESOLVED | 0 | 0 |
| interchange-24 | v8-port-south-m91 + ring-ccw-1-split-split-split | 4 | DEFER_UNRESOLVED | 0 | 0 |
| interchange-27 | ring-cw-3-split-2-split-split + ring-cw-3-split-2-split-split-split | 4 | FIXED | 4 | 0 |
| interchange-14 | v91-ns-sb-on | 6 | FIXED | 6 | 1 |
| interchange-11 | v91-ew-east-eb-on | 4 | FIXED | 12 | 13 |
| interchange-10 | v91-ew-west-wb-on | 4 | FIXED | 12 | 2 |
| interchange-16 | access-ew-west-eb-on | 4 | DEFER_UNRESOLVED | 0 | 0 |
| interchange-22 | v91-ew-east-wb-on | 3 | FIXED | 6 | 1 |
| interchange-13 | access-ns-north-sb-on | 2 | FIXED | 2 | 0 |
| interchange-17 | urban-underpass-west-link | 3 | DEFER_UNRESOLVED | 0 | 0 |
| interchange-21 | v9-chunhui-east-split-split-split | 2 | FIXED | 1 | 7 |
| interchange-23 | v8-gongren-street-split-split-split-m91 | 1 | FIXED | 1 | 1 |
| interchange-20 | v4-access-5 | 2 | FIXED | 2 | 0 |
| interchange-25 | v8-port-south-split-split-2-m91 | 1 | FIXED | 1 | 0 |
| interchange-26 | v4-west-market-split-split-3-c91 | 1 | FIXED | 1 | 0 |
| interchange-30 | v9-newcity-three-split-split-split-split | 2 | FIXED | 2 | 0 |

完整关联道路、设施数量和关联 cluster 见 interchange-inventory.json；每条道路的前后完整控制点、端点、纵坡、坡折、半径及变化量见 geometry-changes.json；每条设施的前后位置、朝向和归属证据见 asset-adjustments.json。所有失败候选均保留对应设计文件，未纳入最终 candidate-map.json。

## 定向静态验证

115 条修改道路逐条检查纵断面，180 条直接受影响连接检查 XYZ，74 个实际导航途经路段请求保持可达；全图方向连接集合保持一致。687 个修改道路关联完整铺装交叠区域通过最终复核；未新增台阶、支撑错层或跨路净空压缩。基本数据校验错误 0。

已有 6m 结构层基准按原明确结构保留；其余修复交叉采用原最低净空与 6.15m 路面间距中的较大值。净空数值在 clearance-validation.json 中按每个区域保留前后值和世界坐标，桥板厚度口径另列于原诊断字段。未把中心线净空当成整幅净空。

## 短时回放

29 组 14m 对照，覆盖 21 个已修改 cluster；包含实体护栏、桥柱、标牌和附近既有物体，纵向速度作为脚本边界，转向、四轮接触和车身垂向自由积分。无回归告警。

| 指标 | 修复前 | 修复后 |
|---|---:|---:|
| 按时长汇总 RMS aY (m/s²) | 2.6688 | 0.3855 |
| peak aY (m/s²) | 96.3488 | 1.9539 |
| pitchRate (rad/s) | 0.8586 | 0.1901 |
| rollRate (rad/s) | 1.3511 | 0.5026 |
| peak Fz (N) | 127340.5779 | 9423.1508 |
| full-bump | 3 | 0 |
| grounded 切换 | 93 | 0 |
| support rejection | 348 | 0 |
| mechanical impulse 峰值 | 1419.1426 | 0.0000 |
| safety | 0 | 0 |

这是所选短路段的结果，不代表所有车速下的整座互通驾驶认证。逐例路段、速度、轨迹、四轮支撑和指标见 runtime-regression.json。

东侧 A-B-A 使用实际候选地图完整道路上下文，未裁切匝道：实际事故处 73.1488 km/h，623 tick；无 A-B-A、拒绝、冲量、安全介入、恢复或回到主线；合法匝道进入保留。该测试专门验证支撑选择，实体碰撞由上述回放和静态设施检查另行覆盖。

## 大幅高程复核与未解决项

继承并读取 v486 大幅修改证据；未修改的 system-central:S-to-W-semi、v8-ring-north:off--1、v8-ring-north:on--1 没有盲目回滚。中央互通仍保留明确未解决结论。本轮所有 ≥2m 高程变化都有完整前后纵断面和最终净空验证，汇总见 large-elevation-review.json。

- interchange-09 system-central：The complete multi-level ramp group still has an incompatible shared pavement/clearance envelope under the recorded bounded geometric proposals.
- interchange-12 system-north：The complete multi-level ramp group still has an incompatible shared pavement/clearance envelope under the recorded bounded geometric proposals.
- interchange-15 system-south：The complete multi-level ramp group still has an incompatible shared pavement/clearance envelope under the recorded bounded geometric proposals.
- interchange-24 v8-port-south-m91 + ring-ccw-1-split-split-split：The shared junction landing and the nearby frontage underpass need more transition length. Coupled profiles, outward branch relocation and a 35m frontage crossing shift still failed full-footprint/grade constraints.
- interchange-16 access-ew-west-eb-on：The frontage underpass shares an extended approach with the rising ramp; moving both fork/merge nodes along the existing corridors still leaves incompatible support heights.
- interchange-17 urban-underpass-west-link：Road geometry passed, but the integrated proposal created new conflicts with existing ground-founded rail/lamp assets; it was withdrawn as a whole.

## 测试与发布状态

安装点与实际渲染一致性专项 11 项通过；候选地图静态/拓扑/净空检查通过；东侧事故回归通过。导航专项已运行，路由 101、显示 21、几何 14,613 断言通过；该套件当时读取 v486 源，候选 v487 的 74 条导航检查另见 topology-validation.json。源代码 typecheck 已通过。

按用户顺序，接下来处理新增的全图平整度、中央隔离和标线专项；最终统一执行唯一一次 pnpm run build -BasicValidation。此阶段尚未构建，dist 仍是原 v486。最终构建结果和发布地图版本将在两个阶段全部结束后补充。
