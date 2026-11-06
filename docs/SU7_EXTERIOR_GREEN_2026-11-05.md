# SU7 车体、绿色车漆与车尾修正 — 2026-11-05

## 实际修改

- 前盖改为独立盖板与两侧翼子板，重新建立冠形、压线、板缝及风挡下方雨槽；徽标贴合前盖曲面。
- A 柱改为闭合截面的曲面柱体，B 柱使用独立亮黑饰面，修正内饰 A 柱外露过多的问题。前挡风玻璃增加横向包角，柱体与玻璃边界共用基准。
- 水滴灯腔、四个投射器、Mi 徽标和格栅纹理独立绘制。车灯亮灭仍由原控制器管理，投射器使用现有贴图遮罩接口。
- 车漆改为低饱和金属绿，保留现有物理材质，调整金属度、粗糙度和清漆响应。左右及后部曲面的外向绕序、薄车壳的阴影面也做了修正。
- 按后续反馈检查车尾：重做后风挡与尾厢、C 柱和后翼子板的连接；尾灯沿后翼子板包角，补充灯腔，后保险杠及扩散区改为曲面。
- 最终 EXE 正后方检查额外发现：尾厢盖有弧顶，而保险杠上沿是水平边，中央出现漏缝。已让保险杠上沿遵循尾厢盖后沿曲线，并增加专项检查。
- 侧后方复查发现浅色后门内饰板的矩形下沿伸进轮拱开口。已改成沿轮罩弧线收边的曲面，左右两侧均保留至少约 16 mm 的采样间隙，不再从轮拱露出浅色大块内饰。

造型参考[官方侧面图](https://s1.xiaomiev.com/activity-outer-assets/0328/images/su7_20260319/pc/3-1.png)、[官方尾部图](https://s1.xiaomiev.com/activity-outer-assets/0328/images/su7_20260319/pc/3-2.png)及[官方前灯细节](https://s1.xiaomiev.com/activity-outer-assets/0328/images/su7_20260319/pc/4-1.png)。绿色方向参考新一代 SU7 绿色公开照片；颜色与材质参数是游戏视觉标定，不是原厂漆料数据或 CAD 尺寸。

车漆基色 `#406858`，金属度 0.52、粗糙度 0.255、清漆强度 0.92、清漆粗糙度 0.15。前挡包角工程值约 32 mm。所有参数仅用于 SU7 外观。

## 开销与范围

| 静态车辆资源 | 修改前 | 修改后 |
|---|---:|---:|
| 三角形 | 59,296 | 55,180 |
| 独立纹理引用 | 6 | 7 |
| 本次新增细节图集 | — | 1 张 1024×512 |

三角形减少约 6.9%。新增图集由徽标、格栅、灯腔及发光遮罩共用，并由现有资源注册表持有；车辆实例保留独立可变材质。没有增加反射、阴影通道、粒子或逐帧曲面生成。

物理尺寸、轮心、轴距和动力学未修改。视觉长度约 4.997 m；含轮拱边唇的视觉宽度约 1.970 m，名义物理宽度仍为 1.963 m。修正了 SU7 镜灯的部件归类，使其不再被车体宽度检查误计为车身。

## 修改文件

- [SU7MaxExterior.ts](../src/vehicle/visual/SU7MaxExterior.ts)：前盖、柱体、玻璃、灯具、车尾及材质。
- [SU7ExteriorDetails.ts](../src/vehicle/visual/SU7ExteriorDetails.ts)：单张静态细节图集。
- [su7MaxVisualConfig.ts](../src/vehicle/visual/su7MaxVisualConfig.ts)：专属绿色和玻璃标定。
- [SU7MaxCabin.ts](../src/vehicle/visual/SU7MaxCabin.ts)：内侧 A 柱与外壳对齐、后门内饰沿轮罩收边。
- [SU7Exterior.selftest.ts](../src/vehicle/visual/SU7Exterior.selftest.ts)、[专项入口](../scripts/run-su7-exterior-selftest.ts)：本次相关验证。
- [SU7Presentation.selftest.ts](../src/vehicle/SU7Presentation.selftest.ts)：计入新增的单张图集，保留原有 60,000 三角形上限。

原有其他车型、地图、天气、导航、音频和未提交工作均保留。

## 验证与发布

- 外观专项 30 项通过：尺寸、轮心、材质隔离、单图集共享、玻璃曲率、门窗行程、投射器遮罩、尾灯/制动灯/倒车灯接入、车尾三处接缝及左右后门内饰/轮罩间隙（包括三角形边中点）。
- 后风挡/尾厢、保险杠/后翼子板、尾厢盖后沿/保险杠上沿的对应采样点最大间隙均为 0。
- 使用 pnpm 11.19.0 和现有 `build -BasicValidation`。首次调用在类型检查阶段发现只读坐标的赋值问题，已修正，当时未运行 Vite 或覆盖 dist。
- 轻量构建记录保留在本次产物目录。第二次用于补入最终 EXE 画面检查发现的车尾漏缝修复，第三次用于补入侧后方复查发现的轮拱内饰穿插修复。未跑 coretest 或无关全量测试，未使用独立 Vite 命令代替正常构建。
- 最终日志为 `light-build-wheelhouse.log` 和 `release-wheelhouse.log`。之前版本的检查记录保存在 `before-deck-closure/`、`before-wheelhouse-trim/`，不代表最终版本。
- 最终 dist 与发布包内 21 个当前文件逐一哈希一致；包含绿色车漆、细节图集和车尾修正。
- 发布位置：`D:\DriverSchoolRelease\DriverSchool-win32-x64\DriverSchool.exe`。
- 最终 app.asar SHA-256 及各文件校验值见[发布校验记录](../artifacts/su7-exterior-green-2026-11-05/release-verification.json)。

记录与图片：[专项结果](../artifacts/su7-exterior-green-2026-11-05/selftest.json)、[四视角](../artifacts/su7-exterior-green-2026-11-05/exterior-views.png)、[前后近景](../artifacts/su7-exterior-green-2026-11-05/exterior-close.png)、[最终 EXE 检查记录](../artifacts/su7-exterior-green-2026-11-05/release-smoke.json)。

最终发布版的正后方及侧后方截图使用现有 F7/F8 观察功能，因此带有调试线框；几何对照图使用现有游戏环境参数，不是实车照片。

## 人工验收与简化

- 从正后方、左右后方观察尾厢后沿、后风挡、C 柱和尾灯回转处，检查漏缝与穿插。
- 检查尾翼展开/收回、尾灯、制动灯、转向灯及倒车灯；门窗关闭后检查玻璃与柱体边界。
- 在日照、阴影和夜间比较绿色与反射，确认风挡不影响驾驶视野。

模型仍是轻量曲面；玻璃使用原有透明材质近似，灯腔和徽标以贴图表现细节，近距离仍可能看见局部曲面分段。没有进行帧率基准或完整驾驶调校。
