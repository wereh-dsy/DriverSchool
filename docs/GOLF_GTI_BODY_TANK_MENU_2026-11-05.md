# Golf 外形曲面与 Tank 车辆选择修复 — 2026-11-05

## 本轮范围

在已有 Golf 上修改外观大曲面和门窗配合，不重做仪表，不调整物理、传动、车辆尺寸或 DriverEye。Tank 修复车辆选择入口并核验实际加载，不在本轮重做 Tank 外形。

## Golf

- 新建 `GolfGTIBodyShape.ts`，统一机盖、侧围、风挡、车顶、后窗及前后保险杠的截面参照。纵向宽度在轮轴附近展开，前后角收窄；上车肩滚入玻璃腰线，门下部内收。
- 原四角侧窗改为沿曲面采样的玻璃，窗框使用圆角轮廓。车顶增加横向拱度并延伸至新的尾门上缘，后窗改为更陡的两厢尾门；顶棚内衬同步此曲面。
- 调整机盖收边、圆弧前脸、前灯端点、尾灯高度及尾门肩部衔接；下进气口加入圆角收束。共享格栅贴图继续使用，不逐孔增加几何。
- 底板前后端按保险杠平面轮廓收边，消除方形底板从圆角保险杠外露的问题。
- 驾驶门回边、门槛与门板跟随新侧围。修复玻璃裁切高度误用车身坐标、又被门节点平移一次的问题；现在使用门节点局部高度，玻璃可见且仍沿原轨迹升降。

完整 Golf：**149 meshes / 52 materials / 45 textures / 34,184 vertices**。上轮为 149 / 52 / 45 / 30,040：网格、材质、贴图数量不变，曲面细分增加 4,144 顶点。固定检查场景 DriverEye 为 78 render calls（上轮 79）；这不是实际地图性能基准。

## Tank 500

- 源码目录和原已发布目录均包含 Tank；旧选择页主要靠上一辆/下一辆切换，Tank 位于第 17 项。本轮增加从同一车辆目录生成的“全部车辆”原生选择框，可直接定位所有车辆，不添加另一份车型名单。
- 选择、车型名称、P2 插混/9HAT/AWD 信息、预览模型和驾驶加载均走现有通道；键盘焦点在选择框内时保留原生选项操作。
- 使用真实 `StartupApplication` 验证 17 个选项、Tank 卡片、带外挂备胎的 Tank 专用预览模型、实际驾驶中的 Tank 专用模型及 Hi4-T 面板，错误列表为空。测试在实际绘制后再截图，避免把上一帧或加载画面误记为结果。
- 修复复查中复现的开发服务异常：临时 Electron 用户目录的 Cookies 被文件监视器打开会产生 EBUSY 并使服务退出。Vite 忽略生成的 `.tmp-*` 及 `.checkpoint-builds` 目录；这不是车型白名单修改。

## 修改文件

- 形状：`src/vehicle/visual/GolfGTIBodyShape.ts`、`GolfGTIExterior.ts`、`GolfGTICabin.ts`、`golfGTIVisualConfig.ts`。
- 门窗回归：`src/vehicle/visual/GolfGTIAccess.selftest.ts`。
- 选择入口：`src/ui/screens/GameShell.ts`、`src/ui/design/system.css`、`scripts/ui-selftests.ts`。
- 开发预览：`vite.config.ts`。
- 检查工具：`scripts/render-golf-gti.cjs`（支持输出目录）、`scripts/run-vehicle-selection-smoke.cjs`，以及本轮 artifacts 中的检查页。

工作区其余已有改动保留，未在本轮重写。

## 检查与画面

[验证记录](../artifacts/golf-gti-2026-11-05/validation.md) · [Golf 检查结果](../artifacts/golf-gti-2026-11-05/golf-checks.json) · [渲染数据](../artifacts/golf-gti-2026-11-05/render-results.json) · [Tank 实际启动结果](../artifacts/golf-gti-2026-11-05/selection-smoke.json) · [完整构建日志](../artifacts/golf-gti-2026-11-05/build.log)

前外观：[修改前](../artifacts/golf-gti-2026-11-05/before-front.png) / [修改后](../artifacts/golf-gti-2026-11-05/front.png)。后外观：[修改前](../artifacts/golf-gti-2026-11-05/before-rear.png) / [修改后](../artifacts/golf-gti-2026-11-05/rear.png)。[开门半降窗](../artifacts/golf-gti-2026-11-05/front-door-open.png) · [固定 DriverEye](../artifacts/golf-gti-2026-11-05/normal.png) · [Tank 选择界面](../artifacts/golf-gti-2026-11-05/tank-selection.png) · [Tank 实际驾驶](../artifacts/golf-gti-2026-11-05/tank-driving.png)

Golf 曲面仍是程序生成的游戏模型，未将其记为扫描级资产。Tank 本轮验证可选择并实际加载，其既有外观/内饰仍较粗略。
