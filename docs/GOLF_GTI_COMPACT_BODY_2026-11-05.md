# Golf 紧凑轮廓与前后端弧面 — 2026-11-05

## 修改

针对上轮模型车顶过长、侧窗矩形、前后端像竖直切面的反馈，继续修改已有 Golf 曲面。物理、传动、车辆尺寸、轮位、碰撞边界和 DriverEye 保持不变；Tank 和其他车型未在本轮修改。

- 车顶纵向长度由约 2.05 m 收至约 1.65 m，前端后移，尾段逐渐下落；最高点仍位于原车辆高度包络内。同步顶棚、窗框、后窗及尾翼，不整体缩放车辆。
- 风挡上缘后移，纵向跨度由约 .43 m 调整为 .72 m；抬高风挡底部并收窄侧窗下部，后门玻璃上沿和后侧窗随车顶下降，改变原先近矩形的乘员舱轮廓。
- 车肩在更宽的竖向区间内滚入腰线。驾驶门玻璃裁切高度、门回边、内门板上沿和前围收边同步，保留既有门窗移动轨迹与上下车功能。
- 前保险杠以高度截面塑形：中部向前，机盖前缘和下护板回收；后端采用向前滚入尾窗的尾门上部、后保险杠肩部以及向底部收回的下护板。前后端不再只沿横向圆角、竖向仍是一整块平面。
- 后窗底边按尾门平面曲率收束，消除后角悬出；排气出口随新的后下部位置贴合。
- 降低下进气格栅高度，保留灯组与进气口之间的车身色横带；前牌照使用原有 nose atlas 绘制。前后 VW 徽标仍各一个贴片网格，改为随曲面弯曲，避免被弧面遮掉。
- 玻璃颜色及透明度适度调整，细节继续使用已有共享贴图。没有增加材质或贴图数量，也没有新增小装饰网格。

## 代码文件

- `src/vehicle/visual/GolfGTIBodyShape.ts`
- `src/vehicle/visual/GolfGTIExterior.ts`
- `src/vehicle/visual/GolfGTICabin.ts`
- `src/vehicle/visual/GolfGTIExteriorDetails.ts`
- `src/vehicle/visual/golfGTIVisualConfig.ts`
- `src/vehicle/visual/GolfGTI.selftest.ts`：增加短车顶、倾斜风挡、后部下落，以及前后端高度截面检查。
- `src/vehicle/visual/GolfGTIAccess.selftest.ts`：玻璃裁切高度同步新腰线。
- `scripts/render-golf-gti.cjs`：可选 `--silhouettes`，本轮检查页增加正侧面和正前方视角。

完整车辆 **149 meshes / 52 materials / 45 textures / 34,430 vertices**；上轮为 149 / 52 / 45 / 34,184。仅增加窗框拐点及曲面徽标采样顶点。资源预算断言维持原要求。

## 参考

[大众原厂设计说明](https://www.volkswagen-newsroom.com/en/the-new-golf-gti-6025/design-of-the-new-golf-gti-6032)：低视觉重心、低位横向灯组、单体下进气口、向前倾的 C 柱及尾翼。

[大众原厂照片 DB2020AU01260](https://www.volkswagen-newsroom.com/en/images/detail/volkswagen-golf-gti-34110)：核对风挡倾角、后部收束及灯组/进气口层次。参考原件保存在 [references/vw-mk8-gti.jpg](../artifacts/golf-gti-compact-2026-11-05/references/vw-mk8-gti.jpg)，仅作为建模参考，未裁剪到模型上。

## 验证与画面

[验证记录](../artifacts/golf-gti-compact-2026-11-05/validation.md) · [Golf 数据](../artifacts/golf-gti-compact-2026-11-05/golf-checks.json) · [11 视角渲染数据](../artifacts/golf-gti-compact-2026-11-05/render-results.json) · [完整构建日志](../artifacts/golf-gti-compact-2026-11-05/build.log)

[正侧面](../artifacts/golf-gti-compact-2026-11-05/side.png) · [正前方](../artifacts/golf-gti-compact-2026-11-05/frontElevation.png) · [前外观](../artifacts/golf-gti-compact-2026-11-05/front.png) · [后外观](../artifacts/golf-gti-compact-2026-11-05/rear.png) · [驾驶视角](../artifacts/golf-gti-compact-2026-11-05/normal.png)

[上版前外观](../artifacts/golf-gti-compact-2026-11-05/before-front.png) · [上版后外观](../artifacts/golf-gti-compact-2026-11-05/before-rear.png)

模型仍为程序生成的游戏资产，外观还原度以实际游戏画面评估。未将自动检查通过视为外形已达到照片级还原。
