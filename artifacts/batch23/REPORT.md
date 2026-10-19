# City Main 第二、三批工程整治

目标：src/world/regional/regional-main.json；版本 271 → 478。

原有 2922 个 road ID 全部保留；新增 22 个道路分段。连通分量 1 → 1，新增死端 0。

## 纵坡与道路

检查全部 528 条匝道；平滑 36 条，保留受约束的 crest/sag。全图匝道 extrema 229 → 178。

- system-east:S-to-W-turbine
- system-north:S-to-W-star
- regional:binhe:on:-1
- regional:airport-service:on:1
- regional:yanjiang-exit:on:1
- regional:v2:airport-north:S-to-E-right
- regional:v2:airport-north:E-to-N-right
- regional:v2:airport-north:N-to-W-right
- regional:v2:airport-north:W-to-S-right
- regional:v2:northwest:S-to-W-loop
- regional:v2:northwest:S-to-E-right
- regional:v2:northwest:E-to-S-loop
- regional:v2:northwest:N-to-E-loop
- regional:v2:northwest:W-to-N-loop
- regional:v2:northwest:W-to-S-right
- regional:v2:airport-north:S-to-W-loop:acceleration
- regional:v3:north-river:N-to-E-turbine
- regional:v3:north-river:W-to-N-turbine
- regional:v3:chenjiang-east:S-to-E-right
- regional:v3:chenjiang-east:E-to-N-right
- regional:v3:chenjiang-east:N-to-W-right
- regional:v3:chenjiang-east:W-to-S-right
- regional:v3:northeast-west:S-to-W-loop
- regional:v3:northeast-west:E-to-S-loop
- regional:v3:northeast-west:W-to-N-loop
- regional:v3:northeast-west:W-to-S-right
- regional:v3:northeast-chenjiang:W-to-N-turbine
- regional:v3:northeast-donglin:W-to-N-turbine
- regional:v3:river-newcity:S-to-E-right
- regional:v3:river-newcity:E-to-N-right
- regional:v3:river-newcity:N-to-W-right
- regional:v3:river-newcity:W-to-S-right
- regional:v3:chenjiang-foldback
- regional:v3:chenjiang-east:S-to-W-turbine:deceleration
- system-west:N-to-W-right
- system-west:W-to-S-right

## 主辅 access

| Ramp | 原长度 m | 新长度 m | 最大纵坡 |
| --- | ---: | ---: | ---: |
| v91-ew-east-eb-off | 303.9 | 171.2 | 7.6% |
| v91-ew-east-wb-on | 302.9 | 169.7 | 7.7% |
| v91-ns-sb-on | 205.6 | 156.6 | 8.3% |
| v91-ns-nb-off | 205.6 | 156.6 | 8.3% |
| v91-ew-west-eb-off | 132.8 | 113.1 | 11.3% |
| v91-ew-west-wb-on | 133.0 | 113.6 | 11.2% |
| access-ew-west-eb-on | 152.2 | 112.4 | 11.7% |
| access-ew-west-wb-off | 161.7 | 126.5 | 9.7% |
| access-ns-north-sb-off | 185.8 | 147.5 | 6.6% |
| access-ns-north-nb-on | 185.3 | 146.6 | 6.6% |
| access-ns-north-sb-on | 243.7 | 181.3 | 1.8% |
| access-ns-north-nb-off | 236.4 | 172.2 | 1.8% |
| v91-ew-east-eb-on | 156.8 | 114.5 | 11.0% |
| v91-ns-sb-off | 156.6 | 137.6 | 9.4% |
| v91-ns-nb-on | 156.6 | 137.6 | 9.4% |
| v91-ew-east-wb-off | 155.1 | 112.2 | 11.4% |

## 明远接入

只处理西南、东北两端约 180 m。局部平面与纵坡平顺，终端 40 km/h、六车道接入；修复路口方向、铺面和标线，西南转向车道消化四车道来路，东北 T 口左右分流；中段保留。

## 物件（唯一 ID）

| 类型 | 移动/旋转/校高 | 支撑或内容调整 | 移除 | 合计 |
| --- | ---: | ---: | ---: | ---: |
| roadSign | 389 | 4 | 2 | 395 |
| roadsideProps | 50 | 0 | 46 | 96 |
| building | 52 | 0 | 6 | 58 |
| vegetation | 103 | 0 | 3 | 106 |
| streetlight | 293 | 0 | 91 | 384 |
| tree | 284 | 0 | 19 | 303 |
| trafficLight | 125 | 0 | 0 | 125 |

物件按道路/区域使用 Placement Brush 的 REPAIR、anchor、heightMode/heightOffset、orientation、legality、bounded auto-adjust 和 preview；合法对象保留。受道路编辑影响的站位路牌通过 kernel 自动跟随，遗留冲突再局部修复。

## 地下与结构

南北连续地下段补齐 4 个缺失 tunnel 壳体声明；另 5 个无 enclosure 的下沉路段标为 cutting。真正隧道保留侧墙，顶板与墙共用边链，顶板上下表面与洞口封边合为一个网格/共享墙材质。明挖段不加顶。14 个隧道/有顶下穿段均通过驾驶空间向上射线测试，顶板可见。

## 诊断与导航

同一最终工具版本的 engineering diagnose：4200 → 2671 warning，0 → 0 error。

Legacy diagnose：421 → 382 warning；error 5 → 5，仍为相同 5 个已有 expresswayCrossing。lowClearance 保持 4；未创建平交或为清警告抬路。

Full validate：0 error、19 warning（基线相同）。无新增 dangling ref、道路删除或死端。

48 条关键路线全部可达；9898960 组原有有向可达关系无丢失。覆盖 EW/NS、16 主辅 access、中央/北/南互通、明远双向、机场和星湖。

导航路径测试：通过；显示测试：通过。完整 navigation runner 的既有阻塞：Error: Map geometry consistency: physical approach/junction height agrees: v91-shared-inner-ew/v91-ew-1-a-3-section-2（before 相同）。

区域旧快照测试的既有阻塞：Error: City changed: roads/ring-cw-0（before 相同）。

## 工具与测试修复

修复有限道路端点延长线误报、prefab 尺寸和地面支撑判定、真实牌柱/牌面包络、普通信号对向合法位置、相邻 crossing 约束生成短节点、局部边界短段、brush repair 高度/朝向与牌柱 base、modifySign station 覆盖显式变换、semantic diff 漏支撑参数；modifyRamp 支持保留 ID 的接入站迁移。

Mapctl 完整自测通过，工程 focused 59 checks、CLI validation 20 checks。用户授权额外修复 ExecutivePolish 旧测试：道路和长道路断言迁到 SharedVehicleData 实际地图所有者，同时验证仪表借用数据，不恢复重复地图；focused 749 assertions 通过。

## Build

完整 pnpm run build 通过，已发布更新 dist。

详细证据：final-statistics.json、final-semantic-diff.json、final-engineering.json、final-legacy.json、final-validate.json、navigation-and-runtime-review.json、mapctl-full-tests.txt、build-final.txt；每个分区保留 preview、semantic diff、local validate 与事务操作。
