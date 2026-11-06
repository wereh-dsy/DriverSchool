# SU7 Max 前排连接与装饰优化 — 2026-11-02

本次只调整 SU7 前排表现及相关基本检查，保留工作区原有未提交修改。

## 实际改动

- 仪表台上层、前饰板、下层改为共享边界的连续曲面，并封闭两端；仪表罩使用相同上层包覆材质，驾驶员侧有平缓隆起承接仪表。
- 中控屏中心降低 31 mm、向前移动 10 mm，收窄外框，用贴合仪表台的低支座承接；导航地图背景改为低亮度灰色，复用原地图绘制接口。
- 方向盘改用保留 17.5 mm 握圈半径的 D 形管截面，修正原先压平底部导致握圈变薄的问题。调整下辐条、按键支撑、按钮饰圈、拨杆深度，并补上转向柱外罩。
- 氛围灯沿仪表台与门板接缝连接，增加隐蔽灯槽，去掉门板多余的下层灯带，降低日夜亮度和局部溢光。
- 皮革改用每个饰件连续的投影坐标，微纹理只调制粗糙度，避免亚像素凹凸采样产生不稳定的三角形明暗块。保留粗糙度、掠射光泽和独立材质。

外观配色与布局继续参考[小米 SU7 官方资料](https://www.xiaomiev.com/su7)。以上场景尺寸、支座、灯带亮度和材质响应属于游戏工程适配，不是官方 CAD 或实测光学参数。

## 修改文件

- [SU7MaxCabin.ts](../src/vehicle/visual/SU7MaxCabin.ts)：仪表台、屏幕承接、方向盘及门板灯带。
- [SU7CabinSurfaces.ts](../src/vehicle/visual/SU7CabinSurfaces.ts)：连续曲面及局部隆起。
- [SU7CabinTextures.ts](../src/vehicle/visual/SU7CabinTextures.ts)：连续纹理坐标及粗糙度细纹。
- [SU7CenterDisplay.ts](../src/vehicle/visual/SU7CenterDisplay.ts)：地图背景明度。
- [su7MaxVisualConfig.ts](../src/vehicle/visual/su7MaxVisualConfig.ts)：SU7 专属氛围灯标定。
- [SU7Presentation.selftest.ts](../src/vehicle/SU7Presentation.selftest.ts)：接缝、握圈截面、转向间隙及材质检查。

## 轻量验证

结果文件位于 [artifacts/su7-cabin-integration-2026-11-02](../artifacts/su7-cabin-integration-2026-11-02/)。

- 基本专项检查 40 项通过；三段仪表台共享边界最大位置间隙为 0。
- 转向一周每 45° 抽样，握圈与固定拨杆的最小前后间隙为 55.7 mm；握圈不遮挡仪表主要读数和底行。
- 默认 720p 仪表投影约 267 × 78 px，主读数高度超过 35 px。
- 整车静态几何计数 59,296 三角形、6 个独立纹理引用；前一轮为 59,418 三角形、6 个纹理。没有增加阴影通道或逐帧场景扫描。
- 门板真实随铰链运动，玻璃完成全行程并回到关闭位置；既有 120 Hz 一秒基本行驶检查通过。
- 最终 EXE 实际启动，选中 SU7，完成下车、重新上车、车窗按键循环、D 挡起步及日夜显示截图；两档 MiSans 字体加载成功，渲染异常为 0。车窗完整行程由专项检查验证，EXE 检查只确认操作流程。
- 实际启动测试只在测试进程内屏蔽实体手柄输入，使用正常键盘控制；速度和仪表数据来自游戏。该流程不是加速性能测量。

## 构建与发布

- 使用指定 pnpm 11.19.0，执行现有 `build -BasicValidation`：类型检查和正式 Vite 构建通过；按用户要求没有运行全量测试。
- 首次调用在类型检查阶段发现本次转向柱可选配置错误，已修正，当时未生成新 dist。随后一次完整构建发布成功；实际画面检查发现材质问题后修正并补构建、补发一次。本轮共两次成功 Vite 构建，没有将它们描述为一次。
- 最终构建日志为 `light-build-final.log`，发布日志为 `release-final.log`。最初发布的检查记录保存在 `before-material-fix/`，不代表最终版本。
- `dist/index.html` 已更新；21 个当前产物文件与发布包逐一哈希一致。产物包含 SU7、既有空气动力和本次座舱节点。
- 最终可执行文件：`D:\DriverSchoolRelease\DriverSchool-win32-x64\DriverSchool.exe`。
- 最终 `app.asar` SHA-256：`af20ac38b2c8d90b71189fefc6171262ecb9344c761660289cfcbf037433c8cb`。
- 构建仍提示大体积代码块警告，未扩展到拆包优化。

## 已知简化与人工验收

座舱仍使用低面数曲面、静态近似反射和表面灯带，近看仍可能看出曲面分段；未实现真实光传输或原厂车机的完整界面。

- 默认驾驶视角下查看仪表台到仪表罩、门板两端的衔接。
- 左右打满方向，观察握圈、下辐条、按钮、拨杆是否有可见穿插，仪表是否持续可读。
- 白天、夜间及不同朝向查看中控屏亮度、支座和饰板光泽，确认灯带不过曝且沿接缝连续。
- 停车后上下车、开关窗，检查门板饰件与灯带随车门运动，玻璃收回位置正确。

最终程序实际画面：[白天](../artifacts/su7-cabin-integration-2026-11-02/release-smoke.png)、[夜间](../artifacts/su7-cabin-integration-2026-11-02/release-night.png)、[前排局部](../artifacts/su7-cabin-integration-2026-11-02/release-instrument-day.png)。
