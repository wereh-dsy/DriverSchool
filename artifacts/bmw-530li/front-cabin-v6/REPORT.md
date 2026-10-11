# BMW 530Li 仪表 V6

车速、挡位和转速采用 Segoe UI Light 细字重数字。COMFORT 车速字号由 140 缩小至 104，转速由 40 缩小至 34；SPORT 车速由 104 缩小至 88，转速由 108 缩小至 68，保留运动模式的信息主次。

P/R 保留俯视车辆状态图。N/D 使用后上方行驶视图，车辆、已有车道、障碍及近距提示共用透视投影。挡位切换立即更新视图；停车俯视图不再叠加行驶透视车道。

参考了 A6L、途锐和 Tesla 的场景显示思路，复用现有道路与近距数据，没有修改这些车型、地图源数据或车辆物理。

## 改动文件

- `src/vehicle/visual/BMW530Instruments.ts`：数字字体、尺寸及按挡位切换的中央视图。
- `src/vehicle/visual/BMW530FrontCabin.selftest.ts`：字体层级、挡位切换和透视一致性验证。
- `scripts/bmw-530li-preview.ts`：挡位对照预览及位于真实车道中心的预览姿态。
- `scripts/bmw-530li-preview-server.mjs`：V6 图片输出。
- `artifacts/bmw-530li/preview.html`：挡位选择与 V6 预览入口。
- 本目录：八张预览及本报告。

## 验证

- typecheck：通过。
- BMW 前舱 selftest 与相关驾驶场景局部检查：通过。
- `pnpm run build -BasicValidation`：成功，已更新可玩 `dist`；未运行全量 core/platform 验证。
- 浏览器完成八个视角截图，未出现控制台错误或警告。

## 预览

- [主驾驶白天](v6-driver-day.png)
- [主驾驶夜晚](v6-driver-night.png)
- [D 挡仪表白天](v6-instruments-day.png)
- [D 挡仪表夜晚](v6-instruments-night.png)
- [SPORT](v6-instruments-sport.png)
- [P 挡](v6-instruments-p.png)
- [R 挡](v6-instruments-r.png)
- [N 挡](v6-instruments-n.png)

中央车辆是仪表内的简化绘制示意；本轮未新增三维感知或导航系统。
