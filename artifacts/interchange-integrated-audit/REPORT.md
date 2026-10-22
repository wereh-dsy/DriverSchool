# City Main v488：互通重整、全图路面与隔离标线交付

最终地图源为 v488。互通任务先完成，再执行新增全图专项；唯一最终构建状态见文末和 build-verification.json。

## 覆盖和结果

137 条遗留关联记录全部审查，归并为 27 个互通/走廊：21 FIXED，6 DEFER_UNRESOLVED，0 PASS，0 INTENTIONAL_STRUCTURE。第一阶段115条道路和352条设施调整记录均保留；两阶段最终实际差异为 **190 条道路、520 个唯一设施实例**，避免重复累计同一实例。全量清单及完整前后定义分别见 geometry-changes.json、asset-adjustments.json。

全图2188条高速/快速路、约983km，中心线及每条车道四个真实轮位密集查询：基线30,940,249次，最终30,940,166次；平路0.25m、其他0.5m。全图2542条高速/快速路/主干道完成结构、中央隔离和标线审计，2886块相关标牌完成包络和实际渲染几何检查。

## 全部互通结果

| cluster | 走廊 | 审查记录 | 结论 | 最终关联修改道路 |
|---|---|---:|---|---:|
| interchange-03 | regional:v3:airport-distributor | 9 | FIXED | 8 |
| interchange-06 | regional:v3:chenjiang-east + regional:v3:chenjiang-foldback | 6 | FIXED | 11 |
| interchange-02 | regional:logistics | 4 | FIXED | 8 |
| interchange-05 | regional:v3:northeast-chenjiang | 3 | FIXED | 8 |
| interchange-04 | regional:v3:river-newcity | 2 | FIXED | 10 |
| interchange-01 | regional:lingang | 2 | FIXED | 4 |
| interchange-08 | regional:v3:airport-south | 3 | FIXED | 6 |
| interchange-18 | peripheral-interchange:S-to-E-right | 5 | FIXED | 8 |
| interchange-09 | system-central | 31 | DEFER_UNRESOLVED | 4 |
| interchange-19 | system-east | 12 | FIXED | 20 |
| interchange-12 | system-north | 12 | DEFER_UNRESOLVED | 5 |
| interchange-15 | system-south | 5 | DEFER_UNRESOLVED | 21 |
| interchange-24 | v8-port-south-m91 + ring-ccw-1-split-split-split | 4 | DEFER_UNRESOLVED | 5 |
| interchange-27 | ring-cw-3-split-2-split-split + ring-cw-3-split-2-split-split-split | 4 | FIXED | 6 |
| interchange-14 | v91-ns-sb-on | 6 | FIXED | 7 |
| interchange-11 | v91-ew-east-eb-on | 4 | FIXED | 14 |
| interchange-10 | v91-ew-west-wb-on | 4 | FIXED | 12 |
| interchange-16 | access-ew-west-eb-on | 4 | DEFER_UNRESOLVED | 0 |
| interchange-22 | v91-ew-east-wb-on | 3 | FIXED | 8 |
| interchange-13 | access-ns-north-sb-on | 2 | FIXED | 2 |
| interchange-17 | urban-underpass-west-link | 3 | DEFER_UNRESOLVED | 2 |
| interchange-21 | v9-chunhui-east-split-split-split | 2 | FIXED | 7 |
| interchange-23 | v8-gongren-street-split-split-split-m91 | 1 | FIXED | 1 |
| interchange-20 | v4-access-5 | 2 | FIXED | 2 |
| interchange-25 | v8-port-south-split-split-2-m91 | 1 | FIXED | 1 |
| interchange-26 | v4-west-market-split-split-3-c91 | 1 | FIXED | 1 |
| interchange-30 | v9-newcity-three-split-split-split-split | 2 | FIXED | 2 |

每个互通的全部道路、设施归属和最终修改ID见 interchange-inventory.json；根因、整体方案、失败尝试、共享铺装高差和交叉坐标见 design-decisions.json、interchange-phase-REPORT.md、geometry-changes.json、clearance-validation.json 和 deferred.json。阶段一记录保留各cluster设施适配检查，阶段二直接关联的设施以最终实例差异为准。

## 路面真实根因与修复

Legacy segment-plane contact did not match rendered mitered ribbon on curved graded roads. Fifteen short inverted strips and one outer wheeltrace twisted corner additionally required bounded C1 XZ repair. Existing ribbon contact data was enabled; vehicle physics and support selection were not changed.

疑似异常道路55→2，修复53条候选上的真实问题；另有关联支撑面和道路一并修改。15条倒置/折叠铺装条带全部消除。intercity-wb 的外侧轮迹坡折即使中心线检查正常仍被捕获，最终采用160m上游C1过渡，最小水平半径9.113→139.823m，并保留交叉净空。58条关联道路采用项目既有 ribbon 支撑表示，使接触与实际渲染三角面同源。最大 mesh/接触高度差 **25.640→2.793mm**；没有缺失路面查询。剩余2处纵断面坡折未压平，20/35m方案会伤及共享铺装或净空，逐处证据见 deferred.json。采样首尾2m由导航接缝专项和四轮短回放补充，未以稀疏节点Y值相同判定平整。

## 中央隔离、标线和配套设施

实际车流方向、相向道路关系、活车道间距、铺装肩部及明确隔离意图共同决定分类。共享路肩仅由一个owner生成真实铺装上的中央护栏；反向存储道路按实际方向计算内侧；跨层道路不会配对。共用无实体隔离道路保留连续双黄线，有实体隔离采用各自白色内侧边缘线，黄色中心标线拥有正确语义优先级。共28条道路中央隔离改善、24条道路标线改善；这些是有实际长度/颜色差异的道路数量，不等于独立互通数量。

全图6个不足间距走廊整体尝试，南环/南系统关联走廊13条道路联立调整成功；其余5个保留，50/50、80/20、20/80方案的净空、曲率和剩余重叠证据均可追溯。部分道路已有改善仍保留剩余不足区间，不用FIXED状态掩盖残留。详见 median-and-carriageway-audit.json。

设施随最终道路重投影和重新生成。5处原门架改用已有吊挂模板，逐一证明真实顶板/上层桥底安装；16个真实穿桥的标牌脚基修正，4盏已有地基路灯按真实地形落脚。新增隔离无设施冲突，中央隔离脚点无悬空；2886块标牌17996个实际渲染部件无道路/顶板穿模。路牌额外修复了无光照材质及绕过色调映射：牌面、背板和支架统一使用无自发光的受光材质，保留贴图、颜色、透明轮廓及内容缓存。

## 验证与短时回放

两阶段687+82个完整铺装交叉区域连续验证，无新增净空回归；第二阶段76条修改道路/29条几何道路逐条验证，schema错误0，车辆/支撑选择/黑匣子文件冻结哈希一致。导航101路由、21显示、14614几何断言通过，2579条显式连接、1729个连续边缘检查，maxEndpointGap=0.021314m，maxEdgeGap=0。互通专项11项、隔离/标线/灯牌专项17项通过；typecheck通过。

代表性回放按原21个已修cluster共29例、全图路面8例、成对隔离走廊3例、WB外轮迹1例分别记录。后续修改影响的局部案例重新回放，未影响案例复用，不混用基线统计。

| 互通29例汇总 | v486 | 最终 |
|---|---:|---:|
| RMS aY(m/s²，按时长) | 2.6688 | 0.3855 |
| peak aY(m/s²) | 96.3488 | 1.9539 |
| pitchRate(rad/s) | 0.8586 | 0.1901 |
| rollRate(rad/s) | 1.3511 | 0.5026 |
| full-bump | 3 | 0 |
| grounded切换 | 93 | 0 |
| rejection | 348 | 0 |
| mechanical impulse峰值 | 1419.1426 | 0.0000 |
| safety | 0 | 0 |

全图代表性平高架wuliuyuan:on:-1：RMS .153905→.025967，peak .791748→.079263，最大轮荷步变3905.9→102.1N；机场连接RMS .170004→.029099。东南匝道准确接触后RMS .132935→.187147，未改善的数值照实保留；无接地/拒绝/冲量/安全回归。WB有效30km/h同轨比较RMS .307276→.263553、roll .096026→.013168；最终80km/h轨迹误差.765m、四轮连续接地、无拒绝/机械冲量/安全介入；原80km/h轨迹偏离4.154m，不能拿它证明同轨加速度改善。旧60km/h局部方案不确定结果保留，未放宽追踪阈值。

东侧A-B-A最终完整源地图623tick：事故处73.1488km/h，invalidABA=0、rejection=0、冲量=0、safety=0、recovery=0，合法匝道进入保留。所有回放的速度、四轮支撑、轮荷步变、接地切换、pitch/roll和逐点样本见 runtime-regression.json；短回放不构成全速度/整走廊认证。

## 最终保留的问题与大幅高程复核

- interchange-09 system-central：The complete multi-level ramp group still has an incompatible shared pavement/clearance envelope under the recorded bounded geometric proposals.
- interchange-12 system-north：The complete multi-level ramp group still has an incompatible shared pavement/clearance envelope under the recorded bounded geometric proposals.
- interchange-15 system-south：The complete multi-level ramp group still has an incompatible shared pavement/clearance envelope under the recorded bounded geometric proposals.
- interchange-24 v8-port-south-m91 + ring-ccw-1-split-split-split：The shared junction landing and the nearby frontage underpass need more transition length. Coupled profiles, outward branch relocation and a 35m frontage crossing shift still failed full-footprint/grade constraints.
- interchange-16 access-ew-west-eb-on：The frontage underpass shares an extended approach with the rising ramp; moving both fork/merge nodes along the existing corridors still leaves incompatible support heights.
- interchange-17 urban-underpass-west-link：Road geometry passed, but the integrated proposal created new conflicts with existing ground-founded rail/lamp assets; it was withdrawn as a whole.

另有5个全图中央预留不足走廊、2条坡折道路，可能与上述cluster空间关联，不能相加称为13个独立立交。每项具体道路、现状区间、净空坐标和已尝试整体/局部方案见 deferred.json，未将失败数值搜索当成几何无解。system-central:S-to-W-semi、v8-ring-north:off--1、v8-ring-north:on--1 的原大幅高程修改复核保留，未盲目回滚；本轮≥2m调整的前后坡度与共享铺装/净空证据见 large-elevation-review.json。中央系统整体仍未通过，不因保留旧高程而认证通过。

## 最终构建

唯一一次 `pnpm run build -BasicValidation` 成功（exit 0），typecheck 和生产构建通过，dist 已原子更新。当前入口 `assets/index-Dnrt8L7J.js` 实际引用 `dist/assets/city-main.runtime-b0fb53b4186e.json`，发布地图 **v488 / 2944 条道路**。运行时文件内容哈希与文件名一致；逐字节校验其完整编译结果与最终源一致，覆盖全部道路、设施、路口和导航连接。未运行 full core、全车型或 editor 全量验证。仅有常见的大包体积提示。核验记录见 build-verification.json。
