# City Main 匝道修复与 Windows 发布记录

日期：2026-10-23。菜单 `city-main` 使用 `src/world/regional/regional-main.json`，本轮从冻结 v490 更新到 v491。城市基础图及中央立交 8 条完整道路记录不在本轮修改范围内。

## 修复与检查范围

检查 45 组互通/主辅路接入组、255 条主匝道及 265 条加减速连接段，共 520 条道路、1040 个端接口。局部修改 21 条主匝道、4 条连接段的几何；另外按实际可视/物理探针证据修正局部支撑表示，适配 502 个相关路牌，未移动场景物件。

- 修正南北快速路中央立交附近 `v91-ns-sb-off`、`v91-ns-nb-on` 的共享铺装高度及独立升降区，原共享高差最高约 1.891m。
- 对 `ns-tunnel:southbound`、`ns-tunnel:northbound-split` 的已确认支路开口，增加显式 `structure.enclosure.branchOpenings`；可视侧墙与碰撞侧墙使用同一生成逻辑。z≈633–644m 两处墙面/铺装穿插采样由 26/27 降到 0/0，车辆包络接触由 2/1 降到 0/0。
- 按局部约束修正其他已确认的接口错层、硬坡折；保留合法多层跨越、主线 XYZ、方向、显式路网及原车辆物理。
- 加减速段的导流线复用既有按铺装三角面裁剪，仅对显式启用 `gore.clipToPavement` 的接口生效。

## 实际验收结果

按主匝道及其子段最严重结果统计：**246 PASS，剩余 P0 2 条、P1 7 条、P2 0 条**。短回放共 524 个端接口记录，其中 2 个路口所有端点列 N/A，522 个实际回放中 520 个通过；中央立交另 16 个回归回放全部通过。设施/标线及导航专项通过，未新增跨越净空冲突。

回放使用原 120 Hz 车辆物理、实际地形、路牌/物件/结构碰撞体；仅设置一次初始速度，不持续修正姿态或速度。普通回放上限 36 秒；一个 199m 长共享区接口为走完独立段使用 40 秒上限，原 36 秒记录仅未走完，没有碰撞或支撑异常。

Map 校验 0 errors、28 warnings，其中 4 个新增推荐坡度提示是约 12% 的数值余量；没有放宽断言或物理阈值。typecheck 通过。按用户要求未运行全核心、全系统、全车型、editor 全量或长时间自动驾驶；这些结果不代表人工视觉和主观驾驶验收。

仍需后续结构调整的 P0：

| 匝道 | 保留问题与限制 |
| --- | --- |
| `access-ew-west-eb-on` | 共享区高差约 3.06–3.61m，进入回放被碰撞阻挡。短走廊几乎没有独立升降长度；有限 XZ/Y 候选无法同时满足共享层、纵坡、曲率和净空。 |
| `access-ew-west-wb-off` | 入口共享高差约 1.31m，回放出现支撑拒绝和离地。现有独立段约 65m，8m 升降在 12% 下仅直坡就需 66.7m，尚未计入竖曲线；需要更长引道或移动主线接入点。 |

P1 包括西/南立交原紧凑环匝道的曲率保留项，以及两处较小共享高差；精确道路、station、尝试方案与失败原因见 [逐条保留记录](../artifacts/remaining-interchange-ramp-repair/deferred.json)。失败候选没有发布。

## 构建与正式发布

当前发布流程：

```powershell
# 在 D:\dsy\drivergame 内，先执行与修改直接相关的轻量专项检查
pnpm run build -BasicValidation
pnpm run desktop:package
```

`desktop:package` 本身还会执行一次 `build -BasicValidation`，随后进行 desktop TypeScript/esbuild 和 Windows x64 完整目录打包。因此按用户最后指定的以上顺序，会发生两次 Browser 构建，均跳过全核心自测；不要把它记录成一次。

项目内 `release/` 仅为中间产物。正式包完整替换到项目外的 `D:\DriverSchoolRelease\DriverSchool-win32-x64`，正式入口为 `D:\DriverSchoolRelease\DriverSchool-win32-x64\DriverSchool.exe`。必须保留整个目录，不能只复制 EXE。沿用既有暂存/整目录切换及回滚流程，不混用旧 Electron runtime/resources，不修改 ACL 或关闭 Electron sandbox、Defender、SmartScreen。

最终结果：独立 `pnpm run build -BasicValidation` 及 `pnpm run desktop:package` 均退出 0；本轮两次 Browser 构建均成功原子更新 dist。外部完整包已经替换发布，21 个应用文件核对通过（manifest 严格 JSON 内容一致，其余文件字节一致），内部/外部 app.asar 哈希相同。正式包与 dist 使用同一 v491 runtime map：`assets/city-main.runtime-772032b0ecb9.json`。

外部正式 EXE 基本启动 smoke 通过：菜单按钮可用、WebGL canvas 与菜单 3D 展示就绪、desktop 桥可用且 renderer 中 require/process 不暴露。保持 sandbox，使用临时 Chromium profile；测试进程已关闭，没有自动驾驶。详见 [发布记录](../artifacts/remaining-interchange-ramp-repair/release-result.json)、[dist 一致性](../artifacts/remaining-interchange-ramp-repair/dist-consistency.json)、[正式 EXE 启动 smoke](../artifacts/remaining-interchange-ramp-repair/external-release-smoke.json)。

构建保留 Vite 大 chunk 提示。校验工具最初的 Windows ASAR 路径、manifest 空白格式比较及关闭等待问题已修正并重验，未触发额外产品构建。

完整证据见 [专项报告](../artifacts/remaining-interchange-ramp-repair/REPORT.md)、[验证汇总](../artifacts/remaining-interchange-ramp-repair/validation.json)。报告中的历史基线、失败尝试与现版本验收结果分别保留。
