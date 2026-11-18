# 正式区域地图的版本批准

当前地图的合法性检查与发布一致性检查分开：`validateMap` / `loadCityMap` 检查当前结构规则；`RegionalReleaseBaseline.selftest.ts` 依据显式批准记录检查数据是否被意外修改。升级地图版本本身不会自动获得批准。

正式记录位于 `artifacts/regional-world/`：

- `approved-baseline.json`：当前批准版本的完整字段指纹、派生导航指纹及既有逐路坡度标定。
- `baseline-approvals.json`：当前版本指针与各批准记录的哈希。
- `vN-regression-baseline.json`：只追加的历史记录。原 v494 文件保持原样。

正常 build、系统检查及区域检查统一读取当前批准记录，不再硬编码要求正式地图回到 v494。正常 build 还核对所有已批准历史档案，并把批准记录计入发布前的源码一致性检查。不会在测试或构建时自动重新生成基线。

地图演进的批准流程：

1. 在地图已经修复、审查及验证后执行：
   `node scripts/approve-regional-baseline.mjs preview --out artifacts/map-baseline-review.json`
2. 审查输出中的版本、原始文件 SHA、变化字段、对象数量、派生导航指纹与逐路坡度。预览不会批准或修改地图。
3. 获得该地图版本的明确批准后，执行：
   `node scripts/approve-regional-baseline.mjs approve --review artifacts/map-baseline-review.json --approve-revision N --source-sha256 REVIEW_SHA --reason "具体批准依据"`
4. 执行 `node scripts/approve-regional-baseline.mjs verify`，再运行正常 build。

源文件在预览后改变、版本未增加、缺少原因、SHA不符、记录已有同名历史文件或地图不合法时，批准操作会拒绝。区域主线、桥隧和互通匝道原有12%硬坡度约束保留；其他城市道路仍执行当前地图验证器的原规则。全字段冻结、连接引用和派生导航检查继续拦截未经批准的更改。

v505 的首次迁移依据是用户于2026-11-07明确要求接受已完成的 Round 5–6 与道路整治成果。此次只批准现有文件，没有回滚或修改地图。

随后用户追加授权全图路牌检查与修复。v506/v507仅演进路牌和版本号，当前批准为v507；道路、路口、连接和派生导航指纹保持一致。中间批准档案也保留，构建不会覆写历史批准。
