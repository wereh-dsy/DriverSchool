# City Main v492 剩余匝道结构收尾

日期：2026-10-24。**255 PASS，剩余 P0 / P1 / P2 均为 0。** 统计复用 v491 已通过的 246 条主匝道，仅对剩余 9 条、直接相邻道路和中央立交做专项回归，没有重跑 45 组全图审计。

## 实施结果

| 目标 | v491 → v492 |
| --- | --- |
| access-ew-west-eb-on | 独立铺装 11.44 → 99.92m；最大共享高差 3.609 → 0.005m；最大坡度 12.00% |
| access-ew-west-wb-off | 独立铺装 65.49 → 143.37m；最大共享高差 1.307 → 0.005m；最大坡度 9.04% |
| system-west 四条 loop | 最小半径 14.42–15.08 → 36.31m |
| system-south 两条 loop | 最小半径 18.43 / 21.92 → 35.29m |
| regional:shangu:on:1 | 共享高差 0.043815 → 0.035335m；仅末端 82m 修整 Y，最大变化 0.03779m |

西侧两个主线接点从 X≈-649.85m 移到 -480m，复用既有 EW 主线端点；北侧辅路在固定接口之间向北展开 25m。EW 主线组合 XYZ 轨迹不变，匝道取得独立升降空间及竖向平顺过渡。主线接入口补齐合流/导流标线，按铺装三角面裁剪。

环匝道扩大时移动局部主线分段边界，保留 road/link ID 和方向。南立交北向主线仅在 z=2130–2255m 调整 Y，最大变化 1.4321m，XZ 不变；局部平台解决曲线匝道与斜坡主线的共享横断面残差。经用户明确授权，`system-south:N-to-E-semi` 的桥墩间距由 45m 调至 46m，消除与扩大环匝道的车辆包络冲突；该道路其他字段及几何严格不变。

本轮共修改 34 条道路记录，重投影 30 个直接相关路牌；路牌 ID、文案及语义不变，物件未移动。区域地图仍为 2944 条道路、302 个路口、7103 个物件、3057 个路牌。中央立交 8 条完整记录保持冻结，车辆物理及 Support Selection 未改动。

## 验证

- 四个局部组内 49 条去重道路的几何、共享铺装、支撑、净空、车辆包络、设施及标线专项通过。
- 66 个接口回放、9 个整条目标匝道回放全部通过；中央立交占其中 16 个接口回放。
- 正确完成路径并到达目标路面；选中支撑拒绝、零候选、全车离地、碰撞、异常机械冲量和安全恢复均为 0。
- Map 校验 0 errors、28 warnings。保留现有审查阈值；共享铺装扫描扩展到真实分离点，使较长合流区完整纳入检查。
- 仅执行与本次修改相关的检查。未运行全核心、全系统、全车型或长时间 UI 自动驾驶；人工视觉及主观驾驶评价仍由用户完成。

完整数据和逐条 attachment station 见 [专项报告](../artifacts/final-ramp-structural-cleanup/REPORT.md)、[结构布局](../artifacts/final-ramp-structural-cleanup/structural-layout.json)、[验证汇总](../artifacts/final-ramp-structural-cleanup/validation.json)。v491 的问题和失败候选保留在 [历史报告](INTERCHANGE_REPAIR_2026-10-23.md)。

## 构建与正式发布

执行顺序为 `pnpm run build -BasicValidation`，随后 `pnpm run desktop:package`。桌面打包内部会再次执行 BasicValidation，因此本轮共两次 Browser 构建。

项目内 `release/` 为中间产物；最终完整 Windows 包位于 `D:\DriverSchoolRelease\DriverSchool-win32-x64`，入口为其中的 `DriverSchool.exe`，须保留整个目录。沿用暂存后整目录替换，不混用旧 runtime/resources，不修改 ACL，不关闭 Electron sandbox、Defender 或 SmartScreen。

两次 Browser 构建均通过：独立 `pnpm run build -BasicValidation` 与 `pnpm run desktop:package` 内部构建；桌面 TypeScript/esbuild 及 Windows 打包退出码均为 0。`dist/` 已更新为 v492，实际 runtime 为 `assets/city-main.runtime-4160008d1348.json`。

外部正式目录已完整替换，73 个 Electron/应用发布文件与内部完整包逐字节一致；21 个应用 payload 文件核对通过（package.json 严格 JSON 内容一致，其余字节一致）。源码、正常编译 runtime、dist 及外部 app.asar 中的地图版本和哈希一致。

正式 `D:\DriverSchoolRelease\DriverSchool-win32-x64\DriverSchool.exe` 基本启动 smoke 通过：开始按钮可用、WebGL canvas 与菜单 3D 展示就绪、desktop 桥及四类用户目录可访问，renderer 未暴露 require/process。保持 sandbox，使用独立临时 Chromium profile；本次测试进程已关闭。

保留 Vite 大 chunk 提示和地图 28 条 warnings；无构建错误。没有运行全核心/全系统验证。

证据：[发布记录](../artifacts/final-ramp-structural-cleanup/release-result.json)、[dist 与包内一致性](../artifacts/final-ramp-structural-cleanup/dist-consistency.json)、[正式 EXE 启动](../artifacts/final-ramp-structural-cleanup/external-release-smoke.json)。
