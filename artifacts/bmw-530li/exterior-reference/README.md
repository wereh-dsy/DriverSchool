# 530Li 外观参考图优化

按本次提供的五张照片调整外观，沿用现有 `bmw-530li-g38` 的物理尺寸、轴距、轮胎和座舱。

- 调整双肾格栅、上挑前灯、发动机盖筋线、前包围和两侧进气口。
- 调整车身腰部曲面、轮拱翻边、下侧裙、银色 B 柱与后窗折角饰板。
- 调整细长尾灯、尾部包围、后风挡和 C 柱；后排头枕包含在外壳内。
- 新增一张 1024×1024 静态图集，表现格栅条、进气网、灯腔、隐藏式把手、门缝、后备厢缝与轮辐。轮辐采用透明裁剪，保留实际刹车盘和轮胎几何。
- 图集随车辆资源缓存共享，材质保持实例独立；没有逐帧重绘或新增物理循环工作。

## 资源对比

同一 BMW 整车自检统计，含座舱与后视镜；这些是模型资源数量，不是帧率测试。

| 项目 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 网格对象 | 438 | 324 |
| 顶点 | 145,263 | 118,946 |
| 材质 | 75 | 63 |

## 修改文件

- [BMW530Exterior.ts](../../../src/vehicle/visual/BMW530Exterior.ts)：外壳、灯组、包围、后风挡和轮拱。
- [BMW530ExteriorDetails.ts](../../../src/vehicle/visual/BMW530ExteriorDetails.ts)：静态图集与 UV。
- [BMW530Wheels.ts](../../../src/vehicle/visual/BMW530Wheels.ts)：共享图集轮辐。
- [BMW530LiVisualConfig.ts](../../../src/vehicle/visual/BMW530LiVisualConfig.ts)：黑色车漆、玻璃及轮拱配置；实际间隙仍受原悬架行程下限约束。
- [VehicleVisual.ts](../../../src/vehicle/visual/VehicleVisual.ts)：将车身共享图集传给轮组。
- [BMW530Li.selftest.ts](../../../src/vehicle/visual/BMW530Li.selftest.ts)：UV、图集共享与释放、后排头枕包络、轮罩遮挡检查。
- [bmw-530li-preview.ts](../../../scripts/bmw-530li-preview.ts)：五个外观预览视角。
- [bmw-530li-preview-server.mjs](../../../scripts/bmw-530li-preview-server.mjs)：外观 PNG 保存。

## 验证

- BMW 整车、后视镜、灯光、共享显示数据专项：通过。
- BMW 前舱专项：通过。
- `pnpm run selftest:vehicles`：通过。
- `pnpm run selftest:systems`：通过；最后的后风挡与轮罩修正另经 BMW 专项复验。
- 浏览器预览：无控制台错误或警告。
- `pnpm run build`：通过（TypeScript、完整核心自检、Vite 构建及可玩版发布）；`dist` 已更新。Vite 提示部分产物超过 500 kB，此提示不阻止构建。

## 预览

- [前侧](exterior-front-quarter.png)
- [侧面](exterior-side.png)
- [后侧](exterior-rear-quarter.png)

当前仍为程序化轻量模型，保留原有 G38 物理尺寸与车型标识。相似度和驾驶中的主观观感由用户评估。
