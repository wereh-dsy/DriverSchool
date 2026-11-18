# SU7 仪表可读性、材质与字体修正

本报告仅描述本轮仪表反馈后的增量；先前 SU7 动力、空气动力、交互与声音实现继续保留。

## 实现与文件

- `src/vehicle/visual/SU7MaxInstruments.ts`：放大仪表及主读数，精简信息层级；薄边圆角外壳、平滑底座；统一 MiSans Latin 字体。
- `src/vehicle/visual/su7MaxVisualConfig.ts`：仪表抬高到默认视点下不被方向盘遮挡的位置。
- `src/vehicle/visual/SU7MaxCabin.ts`：仪表台截面细化、方向盘深色皮革及曲面细分。
- `src/vehicle/visual/SU7CabinTextures.ts`：降低皮革纹理反差，去除拉伸后的明显划痕。
- `src/vehicle/visual/SU7Typography.ts`、`assets/su7-fonts/`：官方未修改的 MiSans Latin Regular/Medium，约 129 KB；随包保留原始许可与署名。来源：https://hyperos.mi.com/font-download/MiSans_Latin.zip 。字体选择属于游戏视觉标定，不声称复刻了原车专用字库。
- `src/vehicle/visual/SU7CenterDisplay.ts`：中控自有标签同步使用相同字体。
- `src/vehicle/visual/LaneAssistSelectionDisplay.ts`：增加可选字体参数，原有车型默认字体保持不变。
- `src/game/DrivingGame.ts`：已有显示预热阶段等待注册字体加载。
- `src/vehicle/SU7Presentation.selftest.ts`：加入默认 720p 视点下仪表投影与方向盘遮挡检查；`SU7Max.selftest.ts` 更新仪表节点名称。

## 验证与发布

- 基本检查 25 项通过：投影约 267×95 px，方向盘不遮挡中心读数与下排；现有门窗、材质隔离、基本驾驶和声音检查通过。
- 车辆 45,316 三角形、3 张贴图；本轮字体不增加模型或贴图数量。
- 实际浏览器预览两档 MiSans 字体加载通过；最终 EXE 检查确认 400/500 均为 loaded，SU7 进入驾驶、上下车完成、无渲染异常。
- pnpm 11.19.0；最终 `build -BasicValidation` 通过，dist 已更新。初次字体导入与原检查工具不兼容，已改为标准资源 URL 并重新验证、构建；未修改全局测试配置，未运行全量测试。
- 发布到 `D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe`；21 个资源与 dist 哈希一致，含两份字体和许可。最终 app.asar SHA256：`e5edb2d2d5be0ca4061df5d4536fa18bc7e1a16a95ee3f961430aa7f17db9895`。
- 证据：`artifacts/su7-instrument-typography/` 下的 selftest、最终构建日志、release-verification、release-smoke 及截图。

## 已知简化与人工验收

仍为低开销程序化座舱，未加入皮革微表面、屏幕反射或额外灯光。字体资源为拉丁字库；中文路名由系统中文字体回退。人工需检查自己的屏幕分辨率、不同驾驶视角、夜间亮度、动态数字阅读及转向时遮挡。此次未做主观驾驶调校或全场景视觉验收。
