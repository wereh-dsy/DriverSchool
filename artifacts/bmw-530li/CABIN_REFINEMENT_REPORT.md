# BMW 530Li-like 座舱收敛改造

本次只处理 530 的座舱结构、玻璃观感、仪表显示、氛围灯和轻量共用显示数据接口。保留原驾驶眼点、车轮锚点、动力与碰撞配置。

## 改动摘要

- 用一体封闭横向截面替代分散仪表台上板、下板和副驾方块；加入滚边、木饰面、自然仪表包裹和屏幕安装底座。
- 压低中控过渡，使用暗色连续中央通道；完整连接前舱、地板和前门三角区域。
- 门板采用连续封闭截面，明确上沿、皮革中段和扶手；A 柱改用六边柔和包覆截面，C 柱沿玻璃边界连续衔接。
- 顶棚、遮阳板和阅读灯区域收敛；玻璃改为弱中性灰色，前风挡透明度 .16，侧窗 .24。
- 前座改为少量平滑软包体；后排改为完整长椅、靠背、连续下腰过渡和三个头枕。
- 灯光指示继续使用绿色示宽/近光/前雾、蓝色远光和琥珀色后雾图形符号。

## 删除与简化

- 移除外露双杯架、大洞及镀铬杯口；改为完整盖板。
- 移除高大挡把及金属肩线，改为短电子选择器。
- 移除旋钮 32 条滚花、多排模式按钮、音响预设阵列、复杂空调旋钮、圆形门板扬声器装饰、木纹细线和重复座椅缝线。
- 方向盘保留基础圆轮缘与三辐结构，缩减金属和按键，拨片变小并采用暗色。
- 移除常亮前后顶灯及大功率车厢补光；中央镜采用暗色静态镜片。
- 几何统计：662 → 448 个网格，333080 → 157582 个顶点，92 → 77 个材质。

## 夜间灯光

- 细暖色饰条贯穿仪表台、门板与通道，脚部柔光上限 .045，中控局部柔光上限 .025。
- `CabinLightResponse` 读取真实外界亮度及灯光状态；白天仅 .004 点缀，随环境变暗平滑增强，上限 .22。
- 示宽/近光/远光开启才允许氛围灯；关灯和断电均平滑熄灭。夜晚本身不伪造灯光开启。
- 屏幕随外界亮度降低显示亮度；顶棚保持暗色，阅读灯不常亮。

## 通用基础整理

- `DrivingEnvironmentView` 成为通用点与障碍物类型的归属；Executive 保留兼容导出，原车型显示行为不变。
- 新增 `DrivingSceneDisplayContext`，在显示周期复用现有车道采样、`LocalRoadMap` 空间索引和 `LocalVehicleProximity` 八区距离服务。以可选视觉配置启用，未使用车辆名称判断功能。
- 530 仪表展示实际道路边界/碰撞物；缺少道路数据时保持空白，不再画假车道。低速/倒车可显示实际近距障碍方位。
- 地图仅保留共用数据服务入口，本次没有加入车机大地图、没有迁移 Tesla UI，也没有加入车道控制功能。

## 本次改动文件

座舱与显示：
- `src/vehicle/visual/BMW530Cabin.ts`
- `src/vehicle/visual/BMW530Geometry.ts`
- `src/vehicle/visual/BMW530Instruments.ts`
- `src/vehicle/visual/BMW530LiVisualConfig.ts`
- `src/vehicle/visual/VehicleVisual.ts`
- `src/vehicle/visual/VehicleVisualConfig.ts`
- `src/vehicle/visual/InstrumentCluster.ts`

共用数据与接入：
- `src/vehicle/visual/CabinLightResponse.ts`（新增）
- `src/vehicle/visual/DrivingSceneDisplayContext.ts`（新增）
- `src/vehicle/visual/DrivingEnvironmentView.ts`
- `src/vehicle/visual/ExecutiveDisplayContext.ts`（仅类型归属及兼容导出）
- `src/game/DrivingGame.ts`（环境亮度、可选显示数据接入及生命周期）

局部验证与预览：
- `src/vehicle/visual/BMW530Li.selftest.ts`
- `src/vehicle/visual/DrivingSceneDisplayContext.selftest.ts`（新增）
- `scripts/run-bmw-530li-selftest.ts`
- `scripts/bmw-530li-preview.ts`
- `artifacts/bmw-530li/CABIN_REFINEMENT_REPORT.md`（本报告）
- `artifacts/bmw-530li/cabin-refinement-validation.json`（验证结果）
- 12 张更新预览图及 3 张改造前对比图。

## 验证与构建

- `pnpm run typecheck`：成功。
- BMW 局部 selftest：成功；实际网格有限数值、车厢边界 10 条射线、驾驶眼点下速度/挡位/模式可读、暗色中央镜、车轮锚点、灯光符号与切换、日/暮/夜/关灯/断电亮度响应。已有 BMW 8AT 集成检查也通过。
- 相关镜面几何和灯光模块 selftest：成功。
- 共用显示适配层：10 项断言通过，验证真实道路/障碍距离、显示频率限制、选择器即时更新、断电清空、无道路数据和配置关闭。
- Three.js 实际预览：驾驶、前后排、通道、A 柱及夜间画面检查；浏览器无 error/warn，保存 12 个既有视角。
- `pnpm run build -BasicValidation`：成功。使用项目现有选项跳过全量 core，生产构建 241 个模块，更新可玩 `dist`。
- 生产入口：`dist/assets/index-DxqQ0V_i.js`。仅有现有体积警告，无构建错误。

## 剩余与建议

仍为程序生成的简化豪华轿车，不是照片级或逐零件复刻。真实皮革/木纹纹理及复杂钣金不在本次范围。中央镜为暗色占位镜片，夜间后排保持自然暗色。若继续细化，优先依据实际游玩视角反馈调整屏幕间距、前舱比例和夜间亮度，再考虑装饰细节。

主驾驶：[改造前](before-driver.png) / [改造后](driver.png)。夜间：[改造前](before-night-front.png) / [改造后](night-front.png)。后排：[改造前](before-rear-cabin.png) / [改造后](rear-cabin.png)。
