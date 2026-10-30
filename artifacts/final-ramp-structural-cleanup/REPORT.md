# City Main v492 结构收尾报告

**PASS：255；remaining P0：0；remaining P1：0；remaining P2：0。**

日期：2026-10-24。以 v491 为唯一基线，复用原 246 PASS；本轮仅验证剩余 9 条、四个修改组及相邻道路，并回归中央立交 8 条。此统计是冻结基线加本轮结果，不是重新执行 45 组全图审计。

## 两条西侧 P0

| 匝道 | 独立铺装长度 m（前 → 后） | 最大共享 ΔY m（前 → 后） | 最大坡度 | 接口 / 全程回放 |
| --- | --- | --- | --- | --- |
| access-ew-west-eb-on | 11.44 → 99.92 | 3.609 → 0.005 | 12.000% | 2/2 + 1/1 PASS |
| access-ew-west-wb-off | 65.49 → 143.37 | 1.307 → 0.005 | 9.041% | 2/2 + 1/1 PASS |

- access-ew-west-eb-on：主线接点 X=-649.851 → -480.000m；原/新主线 road ID、端点与道路内 station 详见 structural-layout.json。
- access-ew-west-wb-off：主线接点 X=-649.859 → -480.000m；原/新主线 road ID、端点与道路内 station 详见 structural-layout.json。

EW 主线主体 XYZ 保持原组合轨迹；移动两条显式接入 link 到既有主线端点。北侧 frontage 局部向北展开 25m，固定两侧接口。竖向转换位于独立铺装内，保留平顺过渡；最大 12% 仅局部出现，无新增 ≥4pp 硬坡折。两处主线接入口补齐合流/导流标线，启用铺装裁剪。

## 六条 loop

| 匝道 | 实测最小半径 m（前 → 后） |
| --- | --- |
| system-south:E-to-S-loop | 21.92 → 35.29 |
| system-south:W-to-N-loop | 18.43 → 35.29 |
| system-west:S-to-W-loop | 14.64 → 36.31 |
| system-west:E-to-S-loop | 15.08 → 36.31 |
| system-west:N-to-E-loop | 14.56 → 36.31 |
| system-west:W-to-N-loop | 14.42 → 36.31 |

移动局部主线分段接点，保留道路及 link ID、方向和导航意图；环匝道扩大到设计半径 36/37m，按既有审查 stencil 的实测最小值如上。相邻已 PASS 匝道的几何保持不变。
南立交北向主线仅在 z=2130–2255m 调整 Y，平台 y=-7.25m，z=2150–2195m 平顺接收匝道，之后恢复原纵断面；相对 v491 最大 Y 变化 1.4321m，XZ 不变。
南立交 N-to-E-semi 的 pierSpacing 经用户明确授权由 45m 改为 46m，避开扩大的 W-to-N-loop 车辆包络。除此一项，该既有 PASS 道路全部字段严格不变。

## 山谷合流与共享铺装

regional:shangu:on:1：共享 ΔY 0.043815m → 0.035335m；仅末端 82m 的 Y 修整，最大变动 0.03779m，XZ、曲率及窗口外纵断面不变。保留接口 2/2 与全程 1/1 PASS。

最终共享扫描延伸到实际分离位置，不再使用旧 48% 道路长度上限；这使 EB-on 的末端 154m 共享区完整纳入检查。验收阈值保持 4cm、12.01% 坡度容差、35m 曲率和 4pp 硬坡折标准。新启用 ribbon 的三条 loop 均有实际 triangle/segment-plane 误差证据。

## 验证与保护范围

- 49 条去重道路静态专项全部通过，包含直接修改主线/辅路；跨越净空、车辆包络、支撑与实际设施标线检查通过。
- 66 个端接口回放与 9 个整条目标匝道回放全部通过；其中中央立交 16 个回放及 8 条完整记录冻结检查通过。
- 目标到达、正确目标路面归属均满足；选中支撑拒绝、零候选、全车离地、碰撞、异常机械冲量、安全恢复均为 0。原 120 Hz 物理及 Support Selection 未改动。
- 34 条道路记录变化，30 个直接相关路牌重投影，路牌 ID/文案/语义保持；场景物件未移动。道路/路口/物件/路牌数量仍为 2944/302/7103/3057。
- Map 校验 0 errors、28 warnings。未运行全核心、全系统、全车型或长时间 UI 自动驾驶。主观视觉/驾驶评价由用户完成。

## 构建与发布

两次 Browser 构建均通过：独立 `pnpm run build -BasicValidation` 与 `pnpm run desktop:package` 内部构建；桌面 TypeScript/esbuild 及 Windows 打包退出码均为 0。`dist/` 已更新为 v492，实际 runtime 为 `assets/city-main.runtime-4160008d1348.json`。

外部正式目录已完整替换，73 个 Electron/应用发布文件与内部完整包逐字节一致；21 个应用 payload 文件核对通过（package.json 严格 JSON 内容一致，其余字节一致）。源码、正常编译 runtime、dist 及外部 app.asar 中的地图版本和哈希一致。

正式 `D:\DriverSchoolRelease\DriverSchool-win32-x64\DriverSchool.exe` 基本启动 smoke 通过：开始按钮可用、WebGL canvas 与菜单 3D 展示就绪、desktop 桥及四类用户目录可访问，renderer 未暴露 require/process。保持 sandbox，使用独立临时 Chromium profile；本次测试进程已关闭。

保留 Vite 大 chunk 提示和地图 28 条 warnings；无构建错误。没有运行全核心/全系统验证。

证据：[构建](build-result.json)、[发布](release-result.json)、[一致性](dist-consistency.json)、[正式 EXE 启动](external-release-smoke.json)。

repair-plans.json 保留实验历史，包含已放弃布局；structural-layout.json、scope-guard.json 和最终 runtime hash 描述本轮交付版本。
