# City Main V9 — 完整 diagnose 基线（2026-10-19）

本轮仅修复诊断覆盖与结果检索基础设施。此文件记录完整机器诊断的覆盖、计数和检索一致性，不重新评定道路优先级，不执行修复。

## 地图与一次性诊断

- 输入：`src/world/regional/regional-main.json`，内部 id=`city-main`、version=22。
- 诊断前后 SHA-256 均为 `458c295a647576207900425964011c2258ee96438952784cad9c97aca6d15beb`。
- 请求：[quality-full-request.json](quality-full-request.json)，内容 `{"full":true,"limit":30}`。
- 本轮仅运行 **1 次** regional-main full diagnose，退出码 0：

  ```text
  pnpm --silent mapctl diagnose regional-main --request @artifacts/city-v9/quality-full-request.json --out artifacts/city-v9/quality-diagnosis-full.json
  ```

- 完整原始结果：[quality-diagnosis-full.json](quality-diagnosis-full.json)。上一轮截断的 [quality-diagnosis.json](quality-diagnosis.json) 与 [quality-baseline.md](quality-baseline.md) 保留为历史记录；本文件提供修复工具后的完整覆盖统计。

## Coverage 与 counts

| 指标 | 结果 |
|---|---:|
| roadsChecked / roadsTotal | **2,857 / 2,857** |
| intersectionsChecked / intersectionsTotal | **250 / 250** |
| error | 28 |
| warning | 534 |
| info | 5,577 |
| total | **6,139** |
| 完整文件 issues.length | **6,139** |
| 完整文件 truncated | **false** |
| 本次 stdout 返回明细 | 30 |
| 从完整文件分页取回 | **7 页、6,139 条，逐条及顺序一致** |
| error/warning 筛选取回 | **562 条，全部取得** |

以下是现有规则的原始 code 统计，不代表每条都是需要修复的道路缺陷；规则、阈值及去重方式均未改变。

| Code | 数量 |
|---|---:|
| geometry.sharpBend | 35 |
| geometry.awkwardS | 2 |
| geometry.shortSegments | 29 |
| geometry.redundantControlPoints | 2,667 |
| intersection.acuteApproach | 49 |
| intersection.approachKink | 34 |
| intersection.shortApproach | 7 |
| intersection.stalePortAngle | 46 |
| marking.crosswalkOverlap | 7 |
| marking.stopLineDisplaced | 38 |
| topology.expresswayCrossing | 9 |
| topology.deadEnd | 95 |
| topology.lowClearance | 4 |
| topology.tinyFragment | 7 |
| topology.shortConnector | 31 |
| vertical.abruptGradeChange | 209 |
| vertical.elevationPointOscillation | 19 |
| vertical.rampReversal | 62 |
| vertical.wave | 13 |
| vertical.gradeReversals | 18 |
| vertical.redundantElevationPoints | 2,758 |
| **合计** | **6,139** |

## 修复的基础设施问题

1. **Road truncation 根因**：`chooseScope` 在显式 full 后仍应用 2,000-road cap。现在 full 直接选取 `map.roads` 和 `map.intersections`，不依赖地图 bounds、局部索引选择或局部 cap。普通局部 diagnose 的 600-road cap 保留。
2. **Intersection 0/250 根因**：旧逻辑在道路被截断后，按保留下来的 road IDs 再过滤路口；这批道路没有任何城市路口连接，250 个路口全被排除。full 现在绕过该局部过滤，全部执行原有 `junctionMarkingIssues` 检查链，包括已有 approach、角度、邻近路口与标线检查。
3. **Detail truncation 根因**：旧结果以 `slice(0, min(limit,1000))` 同时作为输出和唯一保存结果。现在 CLI 内部保留完整 issue 集合，`--out` 保存所有匹配 scope/code/severity 的明细；stdout 单独分页。full CLI 要求 `--out`，避免计算后丢失明细。
4. 新增 `coverage` 与 `counts.bySeverity`、`counts.byCode`；保留原来的平铺 severity counts。局部 API 的默认明细上限仍为 100，CLI 页面最多 1,000 条。没有修改地图几何、Editor UI 或任何道路质量 heuristic。

## 查询完整明细，无需再次扫描地图

使用现有 `mapctl query`，将目标参数指向完整诊断文件：

```text
pnpm mapctl query artifacts/city-v9/quality-diagnosis-full.json --request @page.json
```

`page.json` 请求示例：

```json
{"kind":"diagnosis","offset":0,"limit":1000}
```

按返回的 `pagination.nextOffset` 继续，直到 null。本次无筛选分页 offset 为 0、1000、2000、3000、4000、5000、6000，实际取得 6,139 条。

仅查看所有 error/warning：

```json
{"kind":"diagnosis","minSeverity":"warning","limit":1000}
```

按 code 查询大量 info：

```json
{"kind":"diagnosis","codes":["geometry.redundantControlPoints"],"offset":1000,"limit":1000}
```

`counts` 始终是完整已保存诊断的计数；`pagination.total` 是本次筛选匹配的明细数量。查询只读取诊断 JSON，不加载地图，不重算 diagnose，不写文件。截断的旧报告会被明确拒绝分页，不能伪装成完整快照。

## 最小验证结果

- `node scripts/validate-diagnose-coverage.mjs`：最终通过。合成 fixture 使用 2,001 条简单道路和 2 个路口，验证 full 越过旧上限、覆盖后部及空连接路口，并执行已有 intersection/marking 检查；局部 600-road cap 与默认 100 条明细不变。
- fixture 验证 4,003 条 info 的完整计数、全部记录分页重建、code/severity 筛选、拒绝不完整快照和负 offset。首轮曾将一个已归路口所有的端点误计入预期开放端点数，修正该 fixture 计数期望后通过；没有改动诊断规则。
- 小地图 CLI 验证完整文件与紧凑 stdout 分离；移走临时 fixture 源文件后，仍能从已保存诊断分页取回所有明细，证明查询不依赖地图。
- 本轮唯一一次 regional-main full diagnose 后，仅对其保存文件做分页与计数核对：全部 7 页与原始 issues 数组逐条、顺序一致；各 severity/code 计数与明细一致；562 条 error/warning 全部可取得。
- 没有修改 `regional-main.json`、其它地图、Editor UI 或 City road geometry；没有 repair、apply、道路生成、车辆测试、core 全量测试、systems tests 或任何 build。既有工作区改动保持原样。
