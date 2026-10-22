# City Main v485 → v486：第二轮匝道专项审计

复用第一轮全部清单、候选和 v485 纵断面/交叉基线，逐一复核 275/275 条遗留关联记录。完成局部纵断面、共享铺装和必要的水平线形修改 110 条；未修改车辆物理、电控、道路 ID、车道/宽度、路口、导航拓扑、物体或信号。新增导航途经点为用户随后单独授权的功能，不改变地图拓扑。

**仍有 137 条关联记录未解决，本轮没有把它们标成通过。** 这包含同一物理冲突关联的主线、辅路及多个匝道，不能解释为同等数量的独立匝道。完整位置、约束、所有尝试索引与失败证据见 deferred.json 和 round2/attempts.json。

| 顺序 | 遗留记录审查 | FIXED | PASS | INTENTIONAL_STRUCTURE | DEFER_UNRESOLVED | 实际改路 |
|---|---:|---:|---:|---:|---:|---:|
| A | 118 | 80 | 1 | 6 | 31 | 61 |
| B | 97 | 17 | 2 | 6 | 72 | 17 |
| C | 18 | 2 | 0 | 1 | 15 | 4 |
| D | 42 | 21 | 0 | 2 | 19 | 28 |

## 修复与边界

- 主线为基准，连续共享区跟随主线；用跨线最低高差不等式替代上一轮的整段 Y 锁死。保留端点 XYZ、坡度和真实结构层，不压平正常长坡。
- 修正“跟随主线”与“锁住旧共享高度”互相冲突的约束；保留既有 ribbon 铺装模式，支撑选择算法冻结。
- 水平修正采用有界局部平滑偏移，严格保留两端至少 7m；针对短 Y 采样使用连续切向，避免法线跳变造成短碎段。首次候选中的端点/法线缺陷被验证拦截并撤回，详见 round2/withdrawn-geometry.json；最终地图重新通过完整端点、短段和修改区检查。
- 对北、南、中央、东互通各尝试 14 组联合局部平面方案；会新增错面、压缩净空、超出曲率/纵坡包络或侵入灯杆/建筑的方案拒绝。没有移动建筑或降低阈值来放行。
- 5.5m 净空提示、0.04m/m 坡折提示和第一轮恒定结构层标准未变。明确的 6m 桥隧模板按完整铺装足迹至少 6m 的实际层差审查；0.65m 桥面厚度后净空为 5.35m，提示仍保留并解释，未把真实的不足 6m 层差隐藏成结构意图。

## 每条修改道路的前后指标

最大 Y 与 XZ 位移相对冻结 v485 道路投影计算；水平位移为双向路径距离。逐节点纵坡、坡折、曲率、极值、修改区 kernel 结果见 changed-region-validation.json；每个实际重叠区的前后高差/净空见 crossing-clearance-audit.json。

| 类别 | 道路 / corridor 成员 | 结果 | 最大Y(m) | 最大XZ(m) | 最大坡度 前→后 | 最大坡折 前→后 |
|---|---|---|---:|---:|---|---|
| A | regional:qingling:S-to-E-right | FIXED | 0.4370 | 0.0000 | 0.0600 → 0.0398 | 0.0600 → 0.0031 |
| A | regional:lingang:E-to-S-star | DEFER_UNRESOLVED | 1.6540 | 0.0000 | 0.0600 → 0.0736 | 0.0600 → 0.0042 |
| A | regional:lingang:N-to-E-star | FIXED | 1.3974 | 0.0000 | 0.0721 → 0.0815 | 0.0336 → 0.0031 |
| A | regional:logistics:E-to-S-star | DEFER_UNRESOLVED | 0.8382 | 0.0000 | 0.0390 → 0.0373 | 0.0124 → 0.0020 |
| A | regional:logistics:W-to-N-star | DEFER_UNRESOLVED | 0.8382 | 0.0000 | 0.0390 → 0.0373 | 0.0124 → 0.0020 |
| A | regional:dongnan:E-to-S-semi | FIXED | 0.2876 | 0.0000 | 0.0475 → 0.0498 | 0.0174 → 0.0045 |
| A | regional:dongnan:N-to-E-semi | FIXED | 0.6612 | 0.0000 | 0.0600 → 0.0682 | 0.0600 → 0.0096 |
| A | regional:dongnan:W-to-N-semi | FIXED | 0.2875 | 0.0000 | 0.0475 → 0.0498 | 0.0174 → 0.0045 |
| A | regional:binhe:on:-1 | FIXED | 0.2877 | 0.0000 | 0.0302 → 0.0414 | 0.0000 → 0.0113 |
| A | regional:yunling-exit:off:-1 | FIXED | 0.0518 | 0.0000 | 0.0079 → 0.0081 | 0.0029 → 0.0027 |
| A | regional:airport-exit:off:-1 | FIXED | 0.0445 | 0.0000 | 0.0025 → 0.0026 | 0.0007 → 0.0004 |
| A | regional:yanjiang-exit:on:1 | FIXED | 0.0634 | 0.0000 | 0.0050 → 0.0068 | 0.0014 → 0.0032 |
| A | regional:yanjiang-exit:off:-1 | FIXED | 0.0535 | 0.0000 | 0.0069 → 0.0087 | 0.0025 → 0.0052 |
| A | regional:v2:airport-north:S-to-E-right | FIXED | 1.4269 | 0.0000 | 0.0438 → 0.0477 | 0.0113 → 0.0082 |
| A | regional:v2:airport-north:E-to-N-right | FIXED | 1.7477 | 0.0000 | 0.0150 → 0.0592 | 0.0139 → 0.0096 |
| A | regional:v2:airport-north:W-to-N-loop | FIXED | 0.4749 | 0.0000 | 0.0600 → 0.0539 | 0.0584 → 0.0071 |
| A | regional:v2:airport-north:W-to-S-right | FIXED | 1.7286 | 0.0000 | 0.0118 → 0.0555 | 0.0138 → 0.0095 |
| A | regional:v2:northwest:S-to-W-loop | FIXED | 1.4182 | 0.0000 | 0.0344 → 0.0703 | 0.0344 → 0.0106 |
| A | regional:v2:northwest:S-to-E-right | FIXED | 1.0615 | 0.0000 | 0.0052 → 0.0321 | 0.0052 → 0.0058 |
| A | regional:v2:northwest:E-to-S-loop | FIXED | 1.4710 | 0.0000 | 0.0356 → 0.0714 | 0.0025 → 0.0112 |
| A | regional:v2:northwest:N-to-W-right | FIXED | 0.5327 | 0.0000 | 0.0614 → 0.0755 | 0.0567 → 0.0137 |
| A | regional:v2:northwest:W-to-S-right | FIXED | 1.0255 | 0.0000 | 0.0049 → 0.0308 | 0.0049 → 0.0060 |
| A | regional:v3:north-river:E-to-N-right | FIXED | 0.4211 | 0.0000 | 0.0600 → 0.0481 | 0.0490 → 0.0054 |
| A | regional:v3:north-river:N-to-E-turbine | FIXED | 1.2638 | 0.0000 | 0.0254 → 0.0402 | 0.0233 → 0.0115 |
| A | regional:v3:north-river:N-to-W-right | FIXED | 0.4421 | 0.0000 | 0.0602 → 0.0645 | 0.0493 → 0.0101 |
| A | regional:v3:north-river:W-to-N-turbine | FIXED | 1.2878 | 0.0000 | 0.0242 → 0.0440 | 0.0040 → 0.0098 |
| A | regional:v3:north-river:W-to-S-right | FIXED | 0.5049 | 0.0000 | 0.0599 → 0.0616 | 0.0496 → 0.0111 |
| A | regional:v3:chenjiang-east:S-to-W-turbine | DEFER_UNRESOLVED | 0.6466 | 0.0000 | 0.0600 → 0.0672 | 0.0600 → 0.0066 |
| A | regional:v3:chenjiang-east:E-to-S-turbine | FIXED | 1.7139 | 0.0000 | 0.0614 → 0.0597 | 0.0464 → 0.0023 |
| A | regional:v3:chenjiang-east:E-to-N-right | FIXED | 0.8936 | 0.0000 | 0.0306 → 0.0327 | 0.0200 → 0.0072 |
| A | regional:v3:chenjiang-east:N-to-E-turbine | DEFER_UNRESOLVED | 0.4457 | 0.0000 | 0.0608 → 0.0689 | 0.0429 → 0.0061 |
| A | regional:v3:chenjiang-east:N-to-W-right | FIXED | 1.3677 | 0.0000 | 0.0421 → 0.0518 | 0.0262 → 0.0107 |
| A | regional:v3:chenjiang-east:W-to-N-turbine | FIXED | 1.9848 | 0.0000 | 0.0610 → 0.0508 | 0.0425 → 0.0018 |
| A | regional:v3:northeast-west:S-to-W-loop | FIXED | 1.1912 | 0.0000 | 0.0319 → 0.0620 | 0.0319 → 0.0121 |
| A | regional:v3:northeast-west:W-to-S-right | FIXED | 1.0554 | 0.0000 | 0.0130 → 0.0397 | 0.0130 → 0.0085 |
| A | regional:v3:northeast-river:S-to-W-turbine | FIXED | 0.4547 | 0.0000 | 0.0600 → 0.0326 | 0.0600 → 0.0044 |
| A | regional:v3:northeast-river:S-to-E-right | FIXED | 0.3546 | 0.0000 | 0.0486 → 0.0471 | 0.0486 → 0.0031 |
| A | regional:v3:northeast-river:N-to-E-turbine | FIXED | 0.4962 | 0.0000 | 0.0600 → 0.0326 | 0.0600 → 0.0054 |
| A | regional:v3:northeast-river:N-to-W-right | FIXED | 0.3431 | 0.0000 | 0.0485 → 0.0469 | 0.0485 → 0.0029 |
| A | regional:v3:northeast-north:N-to-E-turbine | FIXED | 0.4960 | 0.0000 | 0.0600 → 0.0359 | 0.0600 → 0.0061 |
| A | regional:v3:northeast-north:W-to-S-right | FIXED | 0.5322 | 0.0000 | 0.0598 → 0.0575 | 0.0598 → 0.0089 |
| A | regional:v3:northeast-chenjiang:S-to-W-turbine | DEFER_UNRESOLVED | 1.1531 | 6.0000 | 0.0600 → 0.0407 | 0.0600 → 0.0012 |
| A | regional:v3:northeast-chenjiang:N-to-E-turbine | FIXED | 1.5397 | 0.0000 | 0.0680 → 0.0491 | 0.0600 → 0.0027 |
| A | regional:v3:northeast-chenjiang:N-to-W-right | FIXED | 0.4328 | 0.0000 | 0.0600 → 0.0536 | 0.0531 → 0.0048 |
| A | regional:v3:northeast-donglin:S-to-E-right | FIXED | 0.5212 | 0.0000 | 0.0610 → 0.0689 | 0.0603 → 0.0101 |
| A | regional:v3:northeast-donglin:N-to-E-turbine | FIXED | 0.4721 | 0.0000 | 0.0600 → 0.0520 | 0.0587 → 0.0056 |
| A | regional:v3:northeast-donglin:W-to-N-turbine | FIXED | 0.8220 | 0.0000 | 0.0453 → 0.0464 | 0.0222 → 0.0072 |
| A | regional:v3:northeast-newcity:W-to-N-turbine | FIXED | 0.5399 | 0.0000 | 0.0600 → 0.0444 | 0.0600 → 0.0076 |
| A | regional:v3:northeast-newcity:W-to-S-right | FIXED | 0.4755 | 0.0000 | 0.0723 → 0.0741 | 0.0600 → 0.0082 |
| A | regional:v3:river-newcity:S-to-W-turbine | FIXED | 0.4365 | 0.0000 | 0.0597 → 0.0550 | 0.0496 → 0.0074 |
| A | regional:v3:river-newcity:E-to-S-turbine | FIXED | 0.4249 | 0.0000 | 0.0610 → 0.0702 | 0.0503 → 0.0085 |
| A | regional:v3:river-newcity:E-to-N-right | FIXED | 1.1178 | 0.0000 | 0.0512 → 0.0538 | 0.0414 → 0.0204 |
| A | regional:v3:river-newcity:N-to-E-turbine | DEFER_UNRESOLVED | 0.0000 | 10.0000 | 0.0531 → 0.0531 | 0.0055 → 0.0055 |
| A | regional:v3:river-newcity:W-to-N-turbine | FIXED | 1.7535 | 0.0000 | 0.0611 → 0.0608 | 0.0490 → 0.0026 |
| A | regional:v3:river-newcity:W-to-S-right | FIXED | 0.9664 | 0.0000 | 0.0464 → 0.0486 | 0.0357 → 0.0199 |
| A | regional:v3:airport-south:E-to-S-turbine | FIXED | 5.9593 | 0.0000 | 0.0795 → 0.0975 | 0.0483 → 0.0045 |
| A | regional:v3:airport-south:N-to-E-turbine | FIXED | 4.3272 | 0.0000 | 0.1160 → 0.1192 | 0.0686 → 0.0066 |
| A | regional:v3:airport-distributor:E-to-S-turbine | FIXED | 5.1808 | 0.0000 | 0.1196 → 0.1106 | 0.1590 → 0.0050 |
| A | regional:v3:airport-distributor:N-to-E-turbine | DEFER_UNRESOLVED | 0.0000 | 14.0000 | 0.0989 → 0.0989 | 0.1590 → 0.1572 |
| B | ns-sb-split-3-split-split-split | DEFER_UNRESOLVED | 0.9145 | 0.0000 | 0.0628 → 0.0776 | 0.0468 → 0.0084 |
| D | urban-underpass-west-link | DEFER_UNRESOLVED | 2.4924 | 0.0000 | 0.1000 → 0.0275 | 0.0200 → 0.0065 |
| B | system-north:S-to-W-star | FIXED | 10.1536 | 0.0000 | 0.1195 → 0.0764 | 0.1825 → 0.0028 |
| B | system-north:S-to-E-right | FIXED | 0.1983 | 0.0000 | 0.0420 → 0.0412 | 0.0071 → 0.0062 |
| B | system-north:E-to-N-right | FIXED | 1.1376 | 5.9830 | 0.0930 → 0.1019 | 0.0152 → 0.0124 |
| B | system-north:N-to-E-star | FIXED | 1.8349 | 0.0000 | 0.1058 → 0.1149 | 0.0835 → 0.0082 |
| B | system-north:N-to-W-right | FIXED | 0.4146 | 0.0000 | 0.0905 → 0.0876 | 0.0216 → 0.0124 |
| B | system-north:W-to-N-star | DEFER_UNRESOLVED | 1.4228 | 0.0000 | 0.0925 → 0.0858 | 0.0257 → 0.0070 |
| B | system-west:S-to-E-right | FIXED | 0.5487 | 0.0000 | 0.0475 → 0.0477 | 0.0327 → 0.0053 |
| B | system-west:E-to-N-right | FIXED | 0.4022 | 0.0000 | 0.0800 → 0.0466 | 0.0605 → 0.0064 |
| B | system-south:S-to-W-semi | FIXED | 1.7086 | 0.0000 | 0.1122 → 0.0672 | 0.0663 → 0.0048 |
| B | system-south:S-to-E-right | FIXED | 0.9780 | 0.0000 | 0.0384 → 0.0516 | 0.0138 → 0.0088 |
| B | system-south:N-to-E-semi | FIXED | 2.2036 | 15.3827 | 0.0957 → 0.0771 | 0.0895 → 0.0040 |
| D | v4-south-logistics-west | FIXED | 0.7069 | 0.0000 | 0.1038 → 0.1111 | 0.1269 → 0.0067 |
| D | v4-south-logistics-east | FIXED | 3.1629 | 0.0000 | 0.1046 → 0.0663 | 0.1000 → 0.0040 |
| D | v4-south-split-2-split | FIXED | 0.7062 | 0.0000 | 0.1000 → 0.0527 | 0.0715 → 0.0132 |
| D | v4-south-split-2-split-split-2 | FIXED | 0.7409 | 0.0000 | 0.1000 → 0.0006 | 0.1000 → 0.0003 |
| D | v4-south-logistics-east-split | FIXED | 0.6505 | 0.0000 | 0.1000 → 0.0924 | 0.1000 → 0.0057 |
| B | system-central:S-to-W-semi | DEFER_UNRESOLVED | 0.0066 | 18.0000 | 0.0871 → 0.0869 | 0.0661 → 0.0667 |
| B | system-central:S-to-E-right | DEFER_UNRESOLVED | 1.2219 | 0.0000 | 0.1031 → 0.1045 | 0.0638 → 0.0064 |
| B | system-central:E-to-S-semi | DEFER_UNRESOLVED | 0.0000 | 6.0000 | 0.1000 → 0.0999 | 0.1450 → 0.1450 |
| B | system-central:N-to-E-semi | DEFER_UNRESOLVED | 0.0017 | 10.0000 | 0.1107 → 0.1108 | 0.0859 → 0.0859 |
| B | system-central:W-to-S-right | DEFER_UNRESOLVED | 0.0031 | 10.0000 | 0.0989 → 0.0989 | 0.0727 → 0.0727 |
| A | peripheral-interchange:S-to-E-right | DEFER_UNRESOLVED | 0.0835 | 10.0000 | 0.0444 → 0.0444 | 0.0024 → 0.0010 |
| A | peripheral-interchange:E-to-N-right | FIXED | 0.4972 | 0.0000 | 0.0545 → 0.0545 | 0.0023 → 0.0034 |
| D | v8-nancheng-ring | FIXED | 4.2303 | 0.0000 | 0.1000 → 0.0566 | 0.1000 → 0.0044 |
| D | regional:v8:airport-city-road | FIXED | 4.2714 | 0.0000 | 0.1000 → 0.0787 | 0.1000 → 0.0061 |
| D | v61-exhibition-road-split-split-split-split | FIXED | 0.2887 | 0.0000 | 0.0970 → 0.0888 | 0.0615 → 0.0104 |
| D | v9-chunhui-east-split-split | FIXED | 3.1853 | 0.0000 | 0.1000 → 0.1000 | 0.0800 → 0.0044 |
| D | v9-chunhui-east-split-split-split | DEFER_UNRESOLVED | 2.4215 | 0.0000 | 0.0327 → 0.0312 | 0.0133 → 0.0012 |
| D | v9-newcity-nine-south-split-split | FIXED | 0.4222 | 0.0000 | 0.1000 → 0.1000 | 0.0641 → 0.0185 |
| D | v9-newcity-eight-split-split-split-split | DEFER_UNRESOLVED | 1.5668 | 0.0000 | 0.1000 → 0.1000 | 0.1000 → 0.0059 |
| D | v9-newcity-three-split-split-split-split-split | FIXED | 0.7504 | 0.0000 | 0.1040 → 0.1000 | 0.1087 → 0.0272 |
| D | v9-newcity-ten-split | FIXED | 4.4074 | 0.0000 | 0.1000 → 0.1044 | 0.1000 → 0.0050 |
| D | v9-newcity-seven-split-split-split-split-split | DEFER_UNRESOLVED | 0.0192 | 0.0000 | 0.0048 → 0.0046 | 0.0012 → 0.0003 |
| D | v9-newcity-eight-split-split-split-split-split | DEFER_UNRESOLVED | 3.0435 | 0.0000 | 0.1000 → 0.1000 | 0.0122 → 0.0034 |
| D | v8-campus-avenue-v91 | FIXED | 1.4686 | 0.0000 | 0.0422 → 0.0212 | 0.0026 → 0.0009 |
| D | v91-ns-0-b-1 | FIXED | 0.8023 | 0.0000 | 0.0681 → 0.0823 | 0.0652 → 0.0044 |
| D | v91-ns-0-b-3 | DEFER_UNRESOLVED | 0.4350 | 0.0000 | 0.0517 → 0.0503 | 0.0500 → 0.0503 |
| D | v91-ring-west-underpass | FIXED | 0.7333 | 0.0000 | 0.0952 → 0.1038 | 0.0955 → 0.0181 |
| D | urban-underpass-start-approach-c91 | FIXED | 0.4973 | 0.0000 | 0.0255 → 0.0370 | 0.0044 → 0.0038 |
| D | v6-logistics-yard-c91 | FIXED | 0.3406 | 0.0000 | 0.0103 → 0.0188 | 0.0000 → 0.0031 |
| D | v4-industrial-split-c91 | FIXED | 0.7574 | 0.0000 | 0.0095 → 0.0240 | 0.0032 → 0.0067 |
| D | v8-port-works-split-split-c91 | FIXED | 0.3230 | 0.0000 | 0.1067 → 0.1162 | 0.1067 → 0.0375 |
| C | v91-ring-south-outer-off | FIXED | 0.3993 | 0.0000 | 0.1071 → 0.0999 | 0.0065 → 0.0060 |
| D | direction-north-west | DEFER_UNRESOLVED | 1.3723 | 0.0000 | 0.0747 → 0.0401 | 0.0223 → 0.0017 |
| C | access-ns-north-sb-on | DEFER_UNRESOLVED | 2.5898 | 3.0000 | 0.0177 → 0.0698 | 0.0011 → 0.0062 |
| C | access-ns-north-nb-off | FIXED | 2.7059 | 2.9966 | 0.0204 → 0.0621 | 0.0057 → 0.0203 |
| D | v91-ns-0-a-4-section-4 | FIXED | 0.3317 | 0.0000 | 0.0462 → 0.0578 | 0.0462 → 0.0089 |
| D | v91-ns-0-b-4-section-4 | FIXED | 0.3084 | 0.0000 | 0.0462 → 0.0476 | 0.0462 → 0.0029 |
| C | v91-ew-east-turn | FIXED | 0.3225 | 0.0000 | 0.0000 → 0.0043 | 0.0000 → 0.0005 |

## 上一轮大幅改高程复核

- system-central:S-to-W-semi：Retain necessary v485 shared-mouth recovery; this does not certify the rest of the central multi-level corridor. Current residual conflicts and tried local/joint alternatives remain explicitly unresolved.
- v8-ring-north:off--1：Retain v485 elevation recovery: the old on/off branch changed grade while its pavement still overlapped the 8m mainline. Current full mouth footprints, grades and clearances rechecked; do not roll back necessary elevation recovery.
- v8-ring-north:on--1：Retain v485 elevation recovery: the old on/off branch changed grade while its pavement still overlapped the 8m mainline. Current full mouth footprints, grades and clearances rechecked; do not roll back necessary elevation recovery.

三条道路的 v484/v485/v486 完整指标、共享口足迹和剩余区索引见 large-elevation-review.json；两条北环口保留必要的约 8m 主线恢复，中央 S-to-W 的口部修复保留，但中央互通其余冲突继续列为未解决。

## 短回放

30 个代表性成对短回放，覆盖高速、城市互通、共享铺装、水平修正及三条大幅高程修改复核；预设纵向速度，实际积分转向、四轮接触和垂向动力学，排除实体护栏碰撞。不是全 corridor 或全速驾驶认证。

| 指标 | v485 | 最终候选 |
|---|---:|---:|
| rmsAY | 0.6246 | 0.3800 |
| peakAY | 7.3954 | 6.6912 |
| pitchRate | 0.6975 | 0.6881 |
| rollRate | 0.0184 | 0.0284 |
| fullBump | 0.0000 | 0.0000 |
| groundedTransitions | 6.0000 | 5.0000 |
| supportSwitches | 0.0000 | 0.0000 |
| supportRejections | 0.0000 | 0.0000 |
| mechanicalImpulse | 0.0000 | 0.0000 |
| safety | 0.0000 | 0.0000 |

支撑切换统计 roadId 改变；接地切换、拒绝原因、逐轮支撑高度、冲量、采样轨迹及任何未改善的指标均保存在 runtime-regression.json。东侧事故匝道单独短回归结果见 round2/east-regression-summary.json。

## 最终未解决的全部记录

- A / regional:lingang:E-to-S-star：Unresolved full-footprint region indices: 200；已关联 116 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:S68:out:split12:split30:split36:split88:split94：Unresolved full-footprint region indices: 200；已关联 116 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:logistics:E-to-S-star：Unresolved full-footprint region indices: 315；已关联 36 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:S89:in:split142:split148：Unresolved full-footprint region indices: 315；已关联 36 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:logistics:W-to-N-star：Unresolved full-footprint region indices: 364；已关联 36 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:S89:out:split114:split166:split172：Unresolved full-footprint region indices: 364；已关联 36 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:S36-extension54:out:9：Unresolved full-footprint region indices: 1320,1322,1325,1326,1327；已关联 1079 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:S31-extension130:out:19：Unresolved full-footprint region indices: 1385；已关联 96 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:S29:out:32：Unresolved full-footprint region indices: 1491；已关联 187 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:S29:in:15：Unresolved full-footprint region indices: 1526；已关联 187 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:chenjiang-east:S-to-W-turbine：Unresolved full-footprint region indices: 1648；已关联 278 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:S31-extension130:in:9:revision493：Unresolved full-footprint region indices: 1659；已关联 47 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:chenjiang-east:S-to-E-right：Unresolved full-footprint region indices: 1659；已关联 47 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:chenjiang-east:N-to-E-turbine：Unresolved full-footprint region indices: 1702；已关联 246 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:northeast-chenjiang:S-to-W-turbine：Unresolved full-footprint region indices: 1491,1526；已关联 187 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:river-newcity:N-to-E-turbine：Unresolved full-footprint region indices: 1385；已关联 96 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:S31-extension130:out:16:revision871：Unresolved full-footprint region indices: 2269；已关联 171 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:chenjiang-foldback：Unresolved full-footprint region indices: 1648,1702,2269; Grade break 0.120000 m/m exceeds unchanged 0.04 cue；已关联 353 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-south:S-to-E-right：Unresolved full-footprint region indices: 2438; Grade break 0.079500 m/m exceeds unchanged 0.04 cue；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:S89-extension2:in:2-split：Unresolved full-footprint region indices: 2438,2444；已关联 390 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-south:E-to-N-right：Unresolved full-footprint region indices: 2444; Grade break 0.079500 m/m exceeds unchanged 0.04 cue；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-distributor:S-to-W-turbine：Unresolved full-footprint region indices: 1322,2456,2461,2463; Grade break 0.159000 m/m exceeds unchanged 0.04 cue；已关联 689 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-distributor:S-to-E-right：Unresolved full-footprint region indices: 2467; Grade break 0.079500 m/m exceeds unchanged 0.04 cue；已关联 134 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:S36-extension54:in:21-split：Unresolved full-footprint region indices: 2463,2467,2472,2473,2477；已关联 1018 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-distributor:E-to-N-right：Unresolved full-footprint region indices: 2477; Grade break 0.079500 m/m exceeds unchanged 0.04 cue；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-distributor:N-to-E-turbine：Unresolved full-footprint region indices: 1325,2456,2473,2498; Grade break 0.157169 m/m exceeds unchanged 0.04 cue；已关联 689 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-distributor:N-to-W-right：Unresolved full-footprint region indices: 1320; Grade break 0.079500 m/m exceeds unchanged 0.04 cue；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-distributor:W-to-N-turbine：Unresolved full-footprint region indices: 1326,2461,2472,2498; Grade break 0.159000 m/m exceeds unchanged 0.04 cue；已关联 689 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / regional:v3:airport-distributor:W-to-S-right：Unresolved full-footprint region indices: 1327; Grade break 0.079500 m/m exceeds unchanged 0.04 cue；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split：Unresolved full-footprint region indices: 2535,2538,2539；已关联 1050 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-2：Unresolved full-footprint region indices: 2553；已关联 495 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-split：Unresolved full-footprint region indices: 2554,2555；已关联 583 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-eb-split-2：Unresolved full-footprint region indices: 2560,2562；已关联 1050 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-split-split：Unresolved full-footprint region indices: 2579；已关联 495 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-split-split-split-2：Unresolved full-footprint region indices: 2598；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-eb-split-split-3：Unresolved full-footprint region indices: 2667；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-split-split-split-split-split-2：Unresolved full-footprint region indices: 2694,2695；已关联 275 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-3-split-split-split：Unresolved full-footprint region indices: 2700；已关联 198 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-split-split-split-split：Unresolved full-footprint region indices: 2708；已关联 206 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-3-split-split-split-2：Unresolved full-footprint region indices: 2734；已关联 223 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-eb-split-4-split-split：Unresolved full-footprint region indices: 2742；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-tunnel:southbound：Unresolved full-footprint region indices: 2746；已关联 243 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-3-split-split-split-split-split：Unresolved full-footprint region indices: 2749；已关联 291 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-cw-3-split-2-split-split：Grade break 0.046068 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-cw-3-split-2-split-split-split：Grade break 0.045545 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-ccw-0-split-split-split-3：Grade break 0.042539 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-cw-2-split-3：Grade break 0.049859 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-ccw-1-split-split-split：Grade break 0.041894 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / urban-underpass-west-link：Unresolved full-footprint region indices: 2782,2783；已关联 81 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / intercity-wb：Unresolved full-footprint region indices: 2784,2786；已关联 37 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-split-split-2：Unresolved full-footprint region indices: 2808；已关联 495 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-split-split-3：Unresolved full-footprint region indices: 2815；已关联 271 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-split-2-split：Unresolved full-footprint region indices: 2820；已关联 583 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-split-split-3：Unresolved full-footprint region indices: 2823；已关联 367 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-ccw-2-split-split-2：Unresolved full-footprint region indices: 2828,2830,2833,2835；已关联 1288 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-4-split-split：Unresolved full-footprint region indices: 2842；已关联 439 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-cw-1-split-split-2：Unresolved full-footprint region indices: 2851,2853,2856,2858；已关联 1288 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-eb-split-split-3-split-split：Unresolved full-footprint region indices: 2867；已关联 439 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-north:E-to-S-star：Unresolved full-footprint region indices: 2899,2902,2905,2906,2907,2908,2911; Grade break 0.229537 m/m exceeds unchanged 0.04 cue；已关联 805 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-north:W-to-N-star：Unresolved full-footprint region indices: 2933；已关联 151 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-north:W-to-S-right：Unresolved full-footprint region indices: 2908；已关联 514 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-ccw-3-split-4：Unresolved full-footprint region indices: 2899；已关联 319 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-cw-0-split-split-split-2-split-split：Unresolved full-footprint region indices: 2902,2933；已关联 442 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-3-split-split-split-3：Unresolved full-footprint region indices: 2911；已关联 319 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-south:E-to-S-loop：Unresolved full-footprint region indices: 3009; Grade break 0.119500 m/m exceeds unchanged 0.04 cue；已关联 223 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-south:W-to-N-loop：Unresolved full-footprint region indices: 2734,3033；已关联 223 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-3-split-split-split-3-split：Unresolved full-footprint region indices: 3033；已关联 223 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-cw-2-split-split：Unresolved full-footprint region indices: 3009；已关联 223 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v4-access-5：Unresolved full-footprint region indices: 3055; Grade break 0.100000 m/m exceeds unchanged 0.04 cue；已关联 54 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-split-2-split-v6：Unresolved full-footprint region indices: 3058；已关联 583 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-central:S-to-W-semi：Unresolved full-footprint region indices: 3067,3074; Grade break 0.066650 m/m exceeds unchanged 0.04 cue；已关联 199 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-central:S-to-E-right：Unresolved full-footprint region indices: 3080,3081；已关联 530 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-central:E-to-S-semi：Unresolved full-footprint region indices: 2535,2553,2562,2579,2808,3082,3083,3094; Grade break 0.144953 m/m exceeds unchanged 0.04 cue；已关联 495 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-3-split-split-split-split-split：Unresolved full-footprint region indices: 3082；已关联 495 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-central:E-to-N-right：Unresolved full-footprint region indices: 3097,3098; Grade break 0.046358 m/m exceeds unchanged 0.04 cue；已关联 247 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-2-split-split-2：Unresolved full-footprint region indices: 3097；已关联 247 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-central:N-to-E-semi：Unresolved full-footprint region indices: 3080,3102,3104,3106; Grade break 0.085932 m/m exceeds unchanged 0.04 cue；已关联 1085 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-3-split-split-split-split：Unresolved full-footprint region indices: 3102；已关联 279 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-central:N-to-W-right：Unresolved full-footprint region indices: 2815,3115; Grade break 0.062783 m/m exceeds unchanged 0.04 cue；已关联 271 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-central:W-to-N-semi：Unresolved full-footprint region indices: 2538,2539,2554,2555,2560,2820,3058,3106,3124,3125,3126,3129; Grade break 0.087703 m/m exceeds unchanged 0.04 cue；已关联 834 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-central:W-to-S-right：Unresolved full-footprint region indices: 2823,3133,3134,3135; Grade break 0.072694 m/m exceeds unchanged 0.04 cue；已关联 367 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-eb-split-3-split-split-2：Unresolved full-footprint region indices: 3135；已关联 367 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-east:S-to-W-turbine：Unresolved full-footprint region indices: 2833,2842,2853,3140,3141,3143,3144,3148; Grade break 0.099234 m/m exceeds unchanged 0.04 cue；已关联 1627 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-east:S-to-E-right：Unresolved full-footprint region indices: 2828,3143; Grade break 0.077856 m/m exceeds unchanged 0.04 cue；已关联 682 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-east:E-to-S-turbine：Unresolved full-footprint region indices: 3148,3156,3157,3160; Grade break 0.180077 m/m exceeds unchanged 0.04 cue；已关联 1384 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-east:E-to-N-right：Unresolved full-footprint region indices: 2835; Grade break 0.078048 m/m exceeds unchanged 0.04 cue；已关联 223 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-east:N-to-E-turbine：Unresolved full-footprint region indices: 2830,2856,2867,3140,3141,3160,3169,3173; Grade break 0.096583 m/m exceeds unchanged 0.04 cue；已关联 1627 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-east:N-to-W-right：Unresolved full-footprint region indices: 2851,3169; Grade break 0.078516 m/m exceeds unchanged 0.04 cue；已关联 682 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-east:W-to-N-turbine：Unresolved full-footprint region indices: 3144,3156,3157,3173; Grade break 0.178331 m/m exceeds unchanged 0.04 cue；已关联 1384 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / system-east:W-to-S-right：Unresolved full-footprint region indices: 2858; Grade break 0.078245 m/m exceeds unchanged 0.04 cue；已关联 223 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-eb-split-3-split-split-3：Unresolved full-footprint region indices: 3134；已关联 367 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- A / peripheral-interchange:S-to-E-right：Unresolved full-footprint region indices: 3188；已关联 118 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v61-exhibition-road-split-split-split：Unresolved full-footprint region indices: 2784; Grade break 0.100000 m/m exceeds unchanged 0.04 cue；已关联 10 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-eb-split-3-split-split-4：Unresolved full-footprint region indices: 3133；已关联 367 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v9-chunhui-east-split-split-split：Unresolved full-footprint region indices: 3216；已关联 54 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v9-newcity-three-split-split-split-split：Grade break 0.095739 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v9-newcity-eight-split-split-split-split：Unresolved full-footprint region indices: 3188；已关联 118 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v9-newcity-ten：Grade break 0.099324 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v9-newcity-seven-split-split-split-split-split：Unresolved full-footprint region indices: 3216；已关联 54 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v9-newcity-eight-split-split-split-split-split：Unresolved full-footprint region indices: 2786；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-tunnel:northbound-split：Unresolved full-footprint region indices: 3220；已关联 291 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-3-split-split-split-2：Unresolved full-footprint region indices: 3221；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-split-split-split-split-split-3：Unresolved full-footprint region indices: 3222；已关联 206 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-3-split-split-split-split：Unresolved full-footprint region indices: 3223；已关联 243 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v91-ns-0-a-3：Unresolved full-footprint region indices: 3233; Grade break 0.050032 m/m exceeds unchanged 0.04 cue；已关联 318 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v91-ns-0-b-3：Unresolved full-footprint region indices: 3235,3236; Grade break 0.050325 m/m exceeds unchanged 0.04 cue；已关联 302 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ew-east-eb-off：Unresolved full-footprint region indices: 3246；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ew-east-wb-on：Unresolved full-footprint region indices: 3221；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-split-split-section：Unresolved full-footprint region indices: 3094；已关联 495 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ns-sb-on：Unresolved full-footprint region indices: 2708,3222,3254；已关联 206 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ns-nb-off：Unresolved full-footprint region indices: 3223,3258；已关联 243 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ring-ccw-0-split-split-section：Grade break 0.041903 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v4-west-m91：Unresolved full-footprint region indices: 2783；已关联 54 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v8-port-south-m91：Unresolved full-footprint region indices: 3290；已关联 54 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v4-access-4-c91：Unresolved full-footprint region indices: 3055；已关联 54 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v4-west-market-split-split-3-c91：Unresolved full-footprint region indices: 3298；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v4-industrial-split-2-split-split-c91：Unresolved full-footprint region indices: 3291；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / v8-port-works-c91：Unresolved full-footprint region indices: 3290,3294,3303；已关联 54 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ew-west-eb-off：Unresolved full-footprint region indices: 3309,3336；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ew-west-wb-on：Unresolved full-footprint region indices: 2598,3310；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / direction-north-west：Unresolved full-footprint region indices: 2782；已关联 54 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- D / direction-inner-sw-section-section：Unresolved full-footprint region indices: 3287,3288; Grade break 0.050003 m/m exceeds unchanged 0.04 cue；已关联 27 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / access-ew-west-eb-on：Unresolved full-footprint region indices: 2742,3347；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / access-ew-west-wb-off：Unresolved full-footprint region indices: 3351；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / access-ns-north-sb-off：Unresolved full-footprint region indices: 2905,2906,3233,3354；已关联 637 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / access-ns-north-nb-on：Unresolved full-footprint region indices: 2694,2695,3235,3236；已关联 302 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / access-ns-north-sb-on：Unresolved full-footprint region indices: 2700；已关联 198 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ew-east-eb-on：Unresolved full-footprint region indices: 2667,3247；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ns-sb-off：Unresolved full-footprint region indices: 2746,3253,3364,3365；已关联 243 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ns-nb-on：Unresolved full-footprint region indices: 2749,3220,3261,3367,3368；已关联 291 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- C / v91-ew-east-wb-off：Unresolved full-footprint region indices: 3248,3371；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-eb-split-5-split-split-section-section：Unresolved full-footprint region indices: 3336；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-split-split-split-4-section-section：Unresolved full-footprint region indices: 3351；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ew-wb-split-3-split-split-2-section-section：Unresolved full-footprint region indices: 3371；已关联 195 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-3-split-split-section-section：Unresolved full-footprint region indices: 2907,3354；已关联 610 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-nb-split-3-split-split-split-section：Unresolved full-footprint region indices: 3258；已关联 243 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。
- B / ns-sb-split-split-split-split-section-section：Unresolved full-footprint region indices: 3365；已关联 243 次局部/关联 corridor 尝试，具体约束及失败位置见 deferred.json 的同 ID。

数值求解未收敛只记为未能确定，不能证明几何无解。短连接中端点/共享区要求的最小平均纵坡、多层互通互相矛盾的上下界、现有建筑/灯杆阻挡和新错面等具体证据均原样保留。不会因“复杂”直接判定不能修，也不声称已经穷尽所有可能的大范围重设计。

## 验证与发布

- 修改区域：PASS；最终 A/B/C 及遗留/修改 D 复查 2305 条；净空降低区 0，新增支撑错面区 0。
- 匝道专项 19 项检查、导航专项 35 项断言通过；typecheck 通过。
- 最终只执行一次 pnpm run build -BasicValidation，退出码0，构建并发布成功；按请求未运行 core 等全量测试。
- dist 实际地图版本 486，已核对110条修改道路的全部发布节点，最大坐标误差 9.28898690099936e-12m；导航途经点控件和规划逻辑已进入发布脚本。
- dist 入口 /assets/index-B7THxyQj.js；运行地图包 dist/assets/city-main.runtime-1aac2465f77e.json。Vite 仅提示大体积 chunk，未影响发布。
- 未运行 full core、全车型、editor 全量或长时间驾驶；未使用 computer-use。

## 收尾证据与未改善的指标

- v61-exhibition-road-split-split-split 的候选引入三处自身铺装错面，峰值0.20914m；已整体撤回 v485，未发布该候选，仍列未解决。
- v91-ew-east-turn 是首轮清单遗漏的平面关联道路，已保留实际水平曲线的采样形状，局部降低约0.32265m，坡度不超过0.00432，解决两条上方主线的净空记录。它是275条记录以外的关联修复，包含在全部实际改路清单中。
- regional:lingang:E-to-S-star 在结构交叉处补正2mm，消除0.35mm的6m层差欠差；没有放宽阈值。
- 新一轮米级修改也全部补充复核，含 system-north:S-to-W-star 的10.15m局部改动：原线在高层交叉后落至0m，再抬回8m共享口。当前去掉此深谷、保持跨线层级和接收主线；详见 large-elevation-review.json 的 currentRoundLargeChanges。
- access-ns-north-nb-off 的局部回放 RMS aY 0.0205→0.5724、峰值0.0979→1.0730m/s²；保留真实增加与原始 warning。四轮持续接地，无切换、拒绝、冲量或安全介入，接受该局部纵坡响应。
- 机场分配互通 regional:v3:airport-distributor:N-to-E-turbine 仍有短暂离地，接地切换6→5，峰值aY 7.3954→6.6912，明确继续列为未解决。rollRate的总体峰值也有增加，见原始表。
- 两条额外高速80km/h短回放无新增回归。东侧事故匝道起始80km/h，事故位置实测速73.18km/h；无大幅A-B-A、拒绝、冲量或安全恢复，未虚报恒速80km/h。

逐 corridor 归属及结论见 corridors.json；每条未解决记录均有关联尝试证据，数值不收敛仍只视为未能确定。
