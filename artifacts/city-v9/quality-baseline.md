# City Main V9 Quality Baseline — 2026-10-19

**状态：受现有 CLI 截断限制的部分基线，不能作为“全图已查清”的验收结论。** 本轮只诊断，没有修改地图、代码或 Editor，没有 repair、preview、apply、测试或 build。

## 来源、范围与可信边界

- 地图：`src/world/regional/regional-main.json`；内部 id=`city-main`、version=22；2,857 条道路、250 个路口。
- 地图 SHA-256：`458c295a647576207900425964011c2258ee96438952784cad9c97aca6d15beb`；诊断前后相同。
- 使用当前工作区现有 `mapctl`，保留其原有未提交改动。仅执行 **1 次**全图 diagnose：

  ```text
  pnpm mapctl diagnose regional-main --request @artifacts/city-v9/quality-request.json --out artifacts/city-v9/quality-diagnosis.json
  ```

  请求为 `{"full":true,"limit":2000}`，退出码 0。原始输出：[quality-diagnosis.json](quality-diagnosis.json)。
- 当前 [RoadDiagnostics.ts](../../src/editor/RoadDiagnostics.ts) 的 `chooseScope` 对 full 仍限制 2,000 条道路；结果 limit 又被硬限制为 1,000。原始 `counts.total` 是截断明细之前、但道路范围已经截断之后的数量。
- 道路自身几何、端点检查覆盖源文件顺序前 **2,000/2,857（70.0%）**，其余 857 条没有接受这些检查；交叉检查可能涉及范围外的对侧道路，不能据此认为其自身几何也已检查。源文件顺序第 2,000 条为 `ew-wb-split-split-split-split-3-split`。
- 按路口连接道路筛选后，本次 diagnose 的路口检查覆盖 **0/250**。因此没有 intersection/marking 告警，不能解释成路口与标线没有问题。
- 诊断使用 loader 归一化后的内存地图；没有写回源文件。`mapctl` 能加载地图，表示其内置结构校验通过；这不等于道路质量通过。
- 未重复全图 diagnose，也没有用自写分析算法补扫。局部确认限于 6 个 error 对象的 inspect、3 个风险区域 inspect、4 条代表道路 query，共 13 次只读 CLI 调用。另从现有结果和源数据核对对象名称、端点、已有 roadLinks 与覆盖范围；不进行视觉或驾驶验收。

## Issue counts 与人工分级

| 口径 | 数量 |
|---|---:|
| 本次 full 请求报告的总数（不是完整地图总数） | 3,996 |
| 原生 error / warning / info | 6 / 95 / 3,895 |
| 已返回明细 / 因输出上限未返回明细 | 1,000 / 2,996 |
| P0 correctness / drivability 候选 | 2 |
| P1 obvious road quality 候选 | 28 |
| P2 polish / 次级核对候选 | 4 |
| P3 低价值或 likely false positive，暂不进入修复队列 | 957 |
| 已返回但优先级待定的内部开放端点 | 9 |
| 合计未分级（2,996 未返回 + 9 待定） | 3,005 |

**计数单位是诊断记录，不是独立缺陷或待修改对象。** 已分级 991 条；2+28+4+957+3,005=3,996。不能将未返回的 2,996 条 info 自动填进 P3。P0 是局部证据支持的风险候选；P1 的 28 条记录合并为 **21 条道路**，其中 7 条同时有坡度突变和高程点振荡，两项应一起处理。

| 已返回 code | 条数 | 人工处理 |
|---|---:|---|
| topology.expresswayCrossing | 6 | 2 P0；4 共端点汇流 likely false positive → P3 |
| vertical.abruptGradeChange | 21 | P1，坡度变化 7.2–15.9 个百分点 |
| vertical.elevationPointOscillation | 7 | P1，与上项 7 条道路重合 |
| topology.deadEnd | 41 | 32 外延/成对终点暂 P3；9 内部终点待定 |
| topology.lowClearance | 2 | P2 待核对；5.15 m 是中心线高差，不是桥底净空 |
| geometry.shortSegments | 1 | P2；东郊出口有 30 段短于 1.5 m |
| topology.tinyFragment | 7 | 0.1 m 的 1 条 P2，其余 6 条 P3；全部两端已有连接 |
| vertical.rampReversal | 16 | 单凭累计升降量不能判坏路；暂 P3 / likely false positive |
| geometry.redundantControlPoints | 899 | P3；不因点密就认定驾驶几何差 |

已返回的完整 error/warning 集合中，没有 sharpBend、awkwardS、zigzag、selfIntersection、vertical.wave、excessiveGrade、endpointGap 告警；此结论只适用于被检查范围和当前算法阈值。broken reference 没有阻止地图加载。未返回的 info 类别分布未知。

## 最优先的 20 个问题组

站距单位 m，沿 authored start；“Δ坡度”是相邻段坡度差的百分点，不是最大坡度。P1 是静态几何证据，未进行主观驾驶确认。

| # | 档位 / 区域 | 对象与证据 |
|---|---|---|
| 1 | P0 东临城市入口 | `regional:dongjiao:on:1` × `regional:dongyuan:N-to-E-turbine`：同层交叉、无两者显式连接；局部 inspect 仍报交叉，双方不属于同一个共端点汇流。 |
| 2 | P0 东临城市入口 | `regional:dongjiao:off:-1` × `regional:dongyuan:W-to-N-turbine`：同样为独立匝道同层冲突；范围约 x=3,300–3,600、z=-500–-200。 |
| 3 | P1 机场南 | `regional:v3:airport-south:E-to-S-turbine`：s=998.9，Δ坡度 15.9；7 个振荡点，局部振幅 0.33 m。 |
| 4 | P1 机场南 | `regional:v3:airport-south:N-to-E-turbine`：s=743.9，Δ坡度 15.9；3 个振荡点，0.21 m。 |
| 5 | P1 机场分配枢纽 | `regional:v3:airport-distributor:S-to-W-turbine`：s=539.6，Δ坡度 15.9；4 个振荡点，0.42 m。query 可见相隔约 3.2 m 的高度 51.291→51.546→51.800→52.054→51.800 m，形成尖顶而非圆顺竖曲线。 |
| 6 | P1 机场分配枢纽 | `regional:v3:airport-distributor:E-to-S-turbine`：s=994.8，Δ坡度 15.9；5 个振荡点，0.25 m。 |
| 7 | P1 机场分配枢纽 | `regional:v3:airport-distributor:N-to-E-turbine`：s=814.6，Δ坡度 15.9；5 个振荡点，0.42 m。 |
| 8 | P1 机场分配枢纽 | `regional:v3:airport-distributor:W-to-N-turbine`：s=790.9，Δ坡度 15.9；4 个振荡点，0.25 m。 |
| 9 | P1 晨江外围接续 | `regional:v3:chenjiang-foldback`：s=4356.7，Δ坡度 10.6；6 个振荡点、0.90 m。query 确认是独立 custom/polyline 接续道路，不能仅用“涡轮跨层”解释。 |
| 10 | P1 机场南 | `regional:v3:airport-south:S-to-E-right`：s=21.7，Δ坡度 7.9。 |
| 11 | P1 机场南 | `regional:v3:airport-south:E-to-N-right`：s=266.4，Δ坡度 7.9。 |
| 12 | P1 机场分配枢纽 | `regional:v3:airport-distributor:N-to-W-right`：s=24.2，Δ坡度 7.9。 |
| 13 | P1 机场分配枢纽 | `regional:v3:airport-distributor:S-to-E-right`：s=24.3，Δ坡度 7.9。 |
| 14 | P1 机场分配枢纽 | `regional:v3:airport-distributor:E-to-N-right`：s=427.2，Δ坡度 8.0。 |
| 15 | P1 机场分配枢纽 | `regional:v3:airport-distributor:W-to-S-right`：s=429.0，Δ坡度 8.0。 |
| 16 | P1 西北局部互通 | `regional:v2:northwest:{S-to-W-loop,N-to-E-loop,W-to-N-loop,E-to-S-loop}`：4 条道路，s=31.4/48.7/388.5/425.0，Δ坡度 7.2/7.2/7.3/7.2。问题是局部坡折，不是 loop 方向变化本身。 |
| 17 | P1 西北局部互通 | `regional:v2:northwest:W-to-S-right`：s=845.4，Δ坡度 7.6。 |
| 18 | P1 北岭 / 北麓 | `regional:beilu:on:1`：s=21.4，Δ坡度 7.6。query 可见约 3 m 间距节点 4.432→4.483→4.300→4.251 m 的局部反坡。 |
| 19 | P1 东临 / 滨河 | `regional:binhe:on:-1`：s=217.1，Δ坡度 9.4。 |
| 20 | P1 北岭 / 沿江北 | `regional:v3:north-river:N-to-E-turbine`：s=229.8，Δ坡度 7.3；只关注该局部坡折，不要求整条涡轮匝道单调。 |

第 3–8 项分别包含两条原始记录，第 9 项也包含两条，第 16 项含四条；上表恰好覆盖 2 条 P0 与全部 28 条 P1。

## Corridor / 区域归类

| 主要系统 | 这次证据与覆盖状态 |
|---|---|
| 东西快速路 / 承景路、辅路与匝道 | 东西主线 roadNameId 覆盖 28/89；承景路 0/46。城市辅路、匝道未形成完整覆盖；不能得出无问题结论。 |
| 南北快速路 / 望川路、下沉覆盖与匝道 | 南北主线 30/90；望川路 0/28。下沉/覆盖段不能据此次输出验收。 |
| 中央快速路互通 | 无可靠的完整检查证据；没有据此虚构修复对象。 |
| 东临高速及城市入口 | G17 命名道路 191/201；P0 两处集中东郊/东原，P1 在滨河入口及晨江外围接续；东郊 off:1 有短段密集 P2。 |
| 北岭高速 | G38 命名道路 192/200；P1 分布在北麓、沿江北，以及与 G42 相接的 northwest 互通；两条 error 是汇流误报候选。 |
| 高速服务区 / 停车区接入 | 可见完整 warning/error 集合没有单独指向服务区接入的高优先项；没有足够覆盖证据作全面合格结论。 |
| 内环大道 | 0/29，未覆盖自身几何。 |
| 中心城区主干路 | 例如中山大道 0/22；路口与标线专项没有覆盖。 |
| 春晖 | 春晖路 0/5；不能将附近东临入口告警泛化为春晖城区结论。 |
| 星湖 / 环湖路 | 当前 `v9-lake-loop` 0/5；天然弯曲没有被确认成缺陷，也未获得完整诊断。 |
| 机场接入 | 最集中的可修候选：airport-south 4 条、airport-distributor 8 条道路，共 18 条 P1 记录；不要求合法跨层匝道全程单调。 |
| 其它外围道路 | northwest 5 条道路、chenjiang-foldback 1 条；S68/S26 内部开放端点待定；东北晨江 2 条低净空候选 P2。 |

以上分母按当前源数据 roadNameId 统计，包含该命名下的主线/匝道等道路对象，不是车道数或整个 corridor 的覆盖率。

## 误报与待定项

- **4 条 error：likely false positive。** `regional:S37:in:split108:split126` 与 xichuan acceleration 共用 END，均接 `regional:S37:in:split108:split126:lane152` 的 START；G38 `...split348` 与 beilu acceleration 共用 END 并接 `...split348:lane308`；G38 `...split354` 与 shangu:on:1 共用 END 并接 `...split354:split356`；S37 `...split394` 与 hewan:on:-1 共用 END 并接 `...split394:split396`。现有算法只寻找被比较的两条道路之间的直接 link，没有识别经同一后续道路端点形成的汇流。故不按非法平交修复。
- **16 条 rampReversal：likely false positive / 待设计语义确认。** 涉及 lingang、logistics、north-river 及 northeast 系列涡轮/星形匝道。指标只有“累计升降量/净高差”，不足以证明反坡不合理，不进入强制单调化队列。
- **32 个外延或成对终点**暂归 P3 / likely false positive，包括外延高速边界、机场方向和 G65 成对终端；不是已确认全部合法。**另外 9 个内部端点保留未分级**：S68 四个端点（`out:start`、`in:start`、`in:split16:split22:end`、`out:split12:split30:split36:split88:split94:end`）；S26 三个（`out:split154:start`、`in:split82:split96:split130:split136:split150:split168:end`、`out:split370:lane188:end`）；S26-extension 两个（`in:0:start`、`out:5:end`）。S26 物流枢纽与 S68 青岭侧局部 inspect 确认端点确实开放，但不能确认是设计终点、旧片段残留还是主线断连。未把开放端点直接算成断路，也未一律抹成误报。
- **7 个 tinyFragment**全部 connectedEnds=2；0.1–约 5 m 的短段不等于断路。只将 `regional:v3:S31-extension130:in:5`（0.1 m）列 P2，其余暂 P3。
- **2 条 lowClearance**在 `regional:v3:S29:out:32`、`regional:v3:S29:in:15` 与 `regional:v3:northeast-chenjiang:S-to-W-turbine` 交叉处，均为 5.15 m 中心线高差。缺少桥面厚度、车道净空等局部证据，暂 P2 / possible false positive，不能直接判为不可驾驶。
- **899 条 redundantControlPoints**主要是精简候选，不能以此推断 sharp bend 或高频摆动。诊断没有逐个视觉复核；本轮不作简化。

## 后续建议 repair batches（仅建议，未执行）

下列 6 批覆盖当前可见的 2 条 P0、28 条 P1；P2 是否确实需要修改，应在对应局部阶段确认。对象数量按当前证据，不为凑 5–15 个对象而扩大范围。受截断影响，这不是全图修复工作的完整排期。

| Batch | 连续 corridor / 局部区域 | 已知对象规模与范围 |
|---|---|---|
| Q1 东临城市入口—滨河 | G17 东郊/东原至滨河入口 | P0 两对共 4 条道路 + binhe:on:-1 共 5 条风险对象；可顺带局部核对 dongjiao:off:1 的 P2，最多 6 条。 |
| Q2 机场南枢纽 | `regional:v3:airport-south` | 4 条 P1 道路（上表 #3、4、10、11）；合并坡折与振荡处理，保持合法跨层起伏。 |
| Q3 机场分配枢纽 | `regional:v3:airport-distributor` | 8 条 P1 道路（#5–8、12–15），是最紧凑的主修复批次。 |
| Q4 西北互通 | `regional:v2:northwest` | 4 条 loop + 1 条 right，共 5 条 P1 道路（#16–17）。 |
| Q5 北岭主走廊局部匝道 | 北麓与沿江北两处，沿 G38 串联 | 当前仅 2 条 P1 道路（#18、20）；分两个局部落点处理，不扩展整条高速。 |
| Q6 晨江外围接续 | `regional:v3:chenjiang-foldback` | 当前仅 1 条 P1 道路（#9），集中处理已报站距与振荡；不因对象少而牵连其它互通。 |

暂不为东西快速路/承景路、南北快速路/望川路、中央互通、内环、春晖、星湖编造修复批次。9 个内部端点及其它 P2 保留独立待定清单，不预先承诺修改。Q2/Q5/Q6 少于 5 个对象，是可见证据与覆盖不足导致的真实规模。

## 本轮交付与验证

- 已生成原始诊断 JSON 和本摘要；请求文件保留用于追溯。原始 JSON 保持 CLI 输出，不补写、删改告警。
- 检查结果口径、逐类计数、P1 对象去重、文件引用与地图前后 SHA-256；诊断与局部只读命令均正常结束。
- 地图和代码未修改；原有工作区改动保留。没有新增分析脚本、生成道路、repair/preview/apply、车辆测试、core selftest、systems tests 或任何 build。
- **剩余限制：未能建立覆盖全图的完整 V9 Quality Baseline。** 2,000 道路上限、1,000 明细上限以及 0/250 路口覆盖，使用户要求的“一次性找全真正值得修的问题”无法由当前工具输出证明。本轮遵守一次扫描限制，不重扫、不修改工具；后续可复用此原始结果与已定位对象，但不能把缺失范围视为已诊断合格。
