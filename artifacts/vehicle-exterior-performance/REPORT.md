# 外观贴图与加载性能优化

2026-10-28。基线为上一轮全车型精修后的源码；覆盖实际 13 辆目录车辆。

## 实现

- 8 款分段车壳共用每车型一张 1024×512 图集：格栅细条/网格、灯内反光结构、风口和牌照底板使用贴图；门缝与油口/充电口线直接绘制到侧壳 UV，删除管状线条。无需外部图片下载，也没有逐帧重绘。
- 车身轮廓、轮拱、玻璃曲率、镜壳与凸起把手保持几何；灯面仅保留贴合曲面所需的网格，细分由固定 10 改为按实际范围取 2–6。
- 奔驰格栅条使用现有图集；6 组尾灯星形和环改为共享 64×64 光学遮罩，继续由原有尾灯通道驱动。BMW/奔驰每车 12 个胎纹圆环改为 1×256 纹理，保持原始滚动半径。
- 轮胎、轮圈桶、制动盘/圈唇和左右轮辐几何按尺寸复用；端部前后悬校准跳过固定轴距区域，仅复制真正受影响的网格，并保留仍被其他对象使用的源几何。
- 灯光控制器释放时恢复自带灯面的实例材质，不再移除/释放注册表借出的灯组网格；共享几何和贴图只由注册表最终释放。避免切车后的重复 GPU 上传，同时修复被替换的实例材质遗漏清理。
- Golf 内饰底纹保留同一确定性采样和 2×2 像素图案，改用 ImageData 一次提交，取代每张底纹 262144 次 Canvas 状态设置及绘制；法线/ORM 写入也取消逐像素 Vector3 和临时数组。
- 物理、输入、地图、车型身份和加载策略未修改；现有按选车准备、邻居预热与缓存淘汰仍有效。图集随缓存所有者复用，没有常驻全部 13 辆的新增预加载。

## 同规则渲染比较

隐藏 Chromium、相同相机和 position 灯状态；每车五视图。calls/三角形来自最后一个后 3/4 视图，含座舱、灯具、地面，不是单纯外壳面数。

车型 | draw calls 前→后 | 可见三角形 前→后 | GPU 几何资源 前→后 | 未缓存视觉创建 ms 前→后
---|---:|---:|---:|---:
family-sedan | 221→215 | 55530→49968 | 205→182 | 90.9→80.9
sport-coupe | 207→203 | 53694→48280 | 191→170 | 82.4→70.2
test-6at-sedan | 212→206 | 54854→49384 | 196→173 | 39.6→32.6
test-7dct-sedan | 215→205 | 56390→48876 | 200→173 | 64.3→40.2
cvt-family-sedan | 223→216 | 55686→50156 | 207→183 | 45.6→13.9
executive-lwb-2t | 284→284 | 14490→14490 | 253→253 | 108.4→48.5
road-suv-v6-8at | 212→202 | 56218→48740 | 195→168 | 58.4→29.0
ferrari-458-italia | 207→203 | 54319→51369 | 190→173 | 56.6→27.0
tesla-model-3-rwd | 227→227 | 44192→44192 | 193→191 | 41.7→31.7
bmw-530li-g38 | 350→338 | 144144→138000 | 316→304 | 94.7→54.6
porsche-taycan-4s | 219→213 | 57212→49830 | 203→184 | 47.5→42.1
volkswagen-golf-gti | 161→161 | 31502→31502 | 127→127 | 1310.0→182.4
mercedes-e300l-v214 | 394→370 | 158722→150010 | 384→350 | 92.4→73.2

13 车分别测量的 draw calls 汇总：3132→3043，减少 2.8%。这不是 13 辆同时出场的负载。

13 车分别测量的 可见三角形 汇总：836953→774797，减少 7.4%。这不是 13 辆同时出场的负载。

13 车分别测量的 GPU 几何资源 汇总：2860→2631，减少 8.0%。这不是 13 辆同时出场的负载。

创建耗时仅为本机单轮未缓存 VehicleVisual + VehicleLighting 的 CPU 测量，不含首帧贴图上传、shader 编译、地图或完整启动时间；部分车型会受 JIT/GC 噪声影响而升高。不能由此宣称统一加载加速比例或 FPS 提升。

## 贴图代价与验证

每张新增共享图集为 1024×512 RGBA8，基础约 2MiB，含 mipmap 约 2.67MiB；不会为每个细节/实例创建一张。新增胎纹约 1KiB/尺寸，尾灯遮罩含 mipmap 约 21KiB。GPU 几何资源减少不等于总显存必然减少：这里用少量有界贴图换取更少顶点、对象和绘制调用。

- executive：PASS。
- lighting：PASS。
- dimensions：PASS。
- pose：PASS。
- tesla：PASS。
- ferrari：PASS。
- exterior：PASS。
- cachedExteriors：PASS。
- envelopeOwnership：PASS。
- stance：FAIL（Error: Suspension stance: executive-lwb-2t: static load is supported without bump stops）。前一轮外观精修前已复现同一 A6L 静态悬挂断言；未修改物理以消除它。
- 13 辆实际几何尺寸/轮心对齐：通过；1856 条加载/压缩/转向采样，0 个间隙命中。
- 前后各 13 张五视图，浏览器错误 0/0，控制台捕获自检 通过。
- 共享资源检查逐一验证所有缓存外观几何/静态贴图：实例与灯光清理不释放借用对象，注册表最终各释放一次；两实例灯光独立。Golf 结构检查 171 条断言通过。
- 最终构建：PASS。typecheck 与 Vite 成功，Checkpoint published；已核对 dist/index.html 及入口资源。core 按已指定范围跳过；保留原有大 chunk 提示。
- 未运行 full core、地图/编辑器全量、长时间驾驶或桌面打包。

## 文件与复验

- [ExteriorDetailAtlas.ts](../../src/vehicle/visual/ExteriorDetailAtlas.ts)
- [TyreDetailTexture.ts](../../src/vehicle/visual/TyreDetailTexture.ts)
- [RefinedVehicleExterior.ts](../../src/vehicle/visual/RefinedVehicleExterior.ts)
- [ExteriorEnvelope.ts](../../src/vehicle/visual/ExteriorEnvelope.ts)
- [VehicleLighting.ts](../../src/vehicle/visual/VehicleLighting.ts)
- [BMW530Wheels.ts](../../src/vehicle/visual/BMW530Wheels.ts)
- [MercedesE300LWheels.ts](../../src/vehicle/visual/MercedesE300LWheels.ts)
- [MercedesE300LExterior.ts](../../src/vehicle/visual/MercedesE300LExterior.ts)
- [MercedesE300LExteriorDetails.ts](../../src/vehicle/visual/MercedesE300LExteriorDetails.ts)
- [GolfGTICockpitMaterials.ts](../../src/vehicle/visual/GolfGTICockpitMaterials.ts)
- [VehicleExterior.selftest.ts](../../src/vehicle/visual/VehicleExterior.selftest.ts)
- [check-vehicle-exterior-integration.ts](../../scripts/check-vehicle-exterior-integration.ts)
- [vehicle-exterior-preview.ts](../../scripts/vehicle-exterior-preview.ts)
- [render-vehicle-exteriors.cjs](../../scripts/render-vehicle-exteriors.cjs)
- [write-vehicle-exterior-report.mjs](../../scripts/write-vehicle-exterior-report.mjs)
- [write-vehicle-exterior-performance-report.mjs](../../scripts/write-vehicle-exterior-performance-report.mjs)

[量化数据](comparison.json) · [尺寸结果](dimensions-after.json) · [集成结果](integration-results.json) · [全车型参考资料与外观报告](../vehicle-exterior-refinement/REPORT.md)

- family-sedan：[优化前五视图](before/family-sedan.png) / [优化后五视图](after/family-sedan.png)
- sport-coupe：[优化前五视图](before/sport-coupe.png) / [优化后五视图](after/sport-coupe.png)
- test-6at-sedan：[优化前五视图](before/test-6at-sedan.png) / [优化后五视图](after/test-6at-sedan.png)
- test-7dct-sedan：[优化前五视图](before/test-7dct-sedan.png) / [优化后五视图](after/test-7dct-sedan.png)
- cvt-family-sedan：[优化前五视图](before/cvt-family-sedan.png) / [优化后五视图](after/cvt-family-sedan.png)
- executive-lwb-2t：[优化前五视图](before/executive-lwb-2t.png) / [优化后五视图](after/executive-lwb-2t.png)
- road-suv-v6-8at：[优化前五视图](before/road-suv-v6-8at.png) / [优化后五视图](after/road-suv-v6-8at.png)
- ferrari-458-italia：[优化前五视图](before/ferrari-458-italia.png) / [优化后五视图](after/ferrari-458-italia.png)
- tesla-model-3-rwd：[优化前五视图](before/tesla-model-3-rwd.png) / [优化后五视图](after/tesla-model-3-rwd.png)
- bmw-530li-g38：[优化前五视图](before/bmw-530li-g38.png) / [优化后五视图](after/bmw-530li-g38.png)
- porsche-taycan-4s：[优化前五视图](before/porsche-taycan-4s.png) / [优化后五视图](after/porsche-taycan-4s.png)
- volkswagen-golf-gti：[优化前五视图](before/volkswagen-golf-gti.png) / [优化后五视图](after/volkswagen-golf-gti.png)
- mercedes-e300l-v214：[优化前五视图](before/mercedes-e300l-v214.png) / [优化后五视图](after/mercedes-e300l-v214.png)

```powershell
pnpm exec esbuild scripts/check-vehicle-exterior-integration.ts --bundle --platform=node --format=esm --outfile=.tmp-check-exterior-integration.mjs
node .tmp-check-exterior-integration.mjs
pnpm exec esbuild scripts/check-vehicle-exteriors.ts --bundle --platform=node --format=esm --outfile=.tmp-check-vehicle-exteriors.mjs
node .tmp-check-vehicle-exteriors.mjs
pnpm exec electron scripts/render-vehicle-exteriors.cjs --output-dir=artifacts/vehicle-exterior-performance/after
node scripts/write-vehicle-exterior-performance-report.mjs
```
