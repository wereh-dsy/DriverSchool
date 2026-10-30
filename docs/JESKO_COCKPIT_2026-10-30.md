# Jesko 座舱、外形和上下车补充验收 — 2026-10-30

## 本次交付

按用户提供的内饰照片及行驶视频截图调整。主屏改为上挡位、下车速、细转速刻度，取消大标志和多层数字；方向盘两侧按钮贴图按用户要求删除。保持实际遥测、断电熄屏、昼夜亮度和中心内容反向旋转。

驾驶眼点由 (-.37,.94,.10) 调整为 (-.37,.975,.14)，方向盘中心 Y=.635，圈中心半径 .172 m、握把半径 .016 m。主屏采用 124×74.4 mm 的 5:3 比例，比官方 108×64.8 mm 约放大 15%，是默认游戏视角的可读性适配。屏幕装在方向盘局部 (0,.108,.040)，碳纤维支座连接到转向柱。配置静态位置与实际安装位置自动换算一致。

修复旧仪表台与风挡基座重叠、曲面端盖三角化错误、出风口埋入蒙皮、标识贴图串区及悬空。金属边框自然遮挡风口边缘仍保留。副驾缝线贴图投射到蒙皮曲面，微观织纹、蜂窝网、文字继续使用纹理。

复用 VehicleInteractionController、DriverAccessController、PlayerModeController 和既有输入。主驾驶门皮从车身截面中拆出，内饰和玻璃随门移动；配置复合向上/向外旋转，车窗沿倾斜导轨下降，沿门腰平面裁切。普通车门默认仍只绕 Y 轴开启。

外形调整包括较低的中央前盖、轮拱截面细分、轮廓化分流器、进气网/灯腔/散热口纹理及空心轮胎截面和胎纹；没有改动力、底盘、轮荷或其他车型标定。

参考：[官方 Jesko 页面](https://www.koenigsegg.com/model/jesko-attack)、[官方内饰及车门说明](https://mb.cision.com/Public/18511/3630153/9e2feb2f599a205c.pdf)；布局主要依据用户提供图片。

## 修改文件

- src/vehicle/visual/JeskoAttackCabin.ts、JeskoAttackInstruments.ts、JeskoCabinGeometry.ts、JeskoCabinTextures.ts：座舱几何、动态屏幕及静态纹理。
- src/vehicle/visual/JeskoAttackVisualConfig.ts、JeskoAttackExterior.ts：驾驶位置、主驾驶门窗、外形与轮胎。
- src/vehicle/visual/Cockpit.ts、InstrumentCluster.ts、InstrumentBinnacle.ts：Jesko 座舱/显示接入。
- src/vehicle/visual/VehicleVisualConfig.ts、VehicleVisual.ts：可选复合门铰链姿态；不提供该配置的车型保留原行为。
- scripts/jesko-cockpit-preview.ts、render-jesko-cockpit.cjs、jesko-cockpit-checks.ts、run-jesko-cockpit-selftests.ts：渲染及专项验证。
- scripts/run-jesko-attack-selftests.ts：仪表对象名称适配。本轮没有重跑动力专项，其历史结果仍属于原车型版本。

## 实测结果

- 座舱与交互专项通过：主屏每个位置 117 个采样点，0、±0.5、±1.5 rad 共 585 条视线，无不透明遮挡，全部位于默认 62°、4:3 前视画面内；16:9 另有实渲图。
- 上下车停车联锁、上车距离限制、车门连续开启/中途反向、内饰归属、升降玻璃裁切、门窗同时操作、关闭外廓及普通 A6L 车门兼容断言通过。
- 源码 typecheck 与专项脚本独立严格类型检查通过。
- 12 个实际 WebGL 视图成功，控制台错误为空，包括昼夜、近景、转向、告警、断电、外观、开门及开窗。
- 独立目录 Vite 轻量构建通过，439 个模块；有大 chunk 提示。遵守用户限定，未运行全量测试，未发布正式 build/release。
- 最终预览：日间 140 draw calls / 10102 triangles；外观 238 / 15744。仅为专项场景，不能当作整张地图帧率。
- 自动审批服务曾容量不足或超时，后续实际渲染、构建已成功，不存在遗留审批阻断。

结果：[几何检查](../artifacts/jesko-cockpit/visibility-results.json)、[实渲结果](../artifacts/jesko-cockpit/after/render-results.json)、[仪表近景](../artifacts/jesko-cockpit/after/detail.png)、[开门](../artifacts/jesko-cockpit/after/doorOpen.png)。

## 已知简化与人工验收

- 仍是程序化简化模型，并非扫描或完整原厂 CAD；车灯、尾翼、座椅、车门厚度等轮廓仍有简化。
- 门铰链是复合位移/欧拉旋转近似，不模拟真实螺旋连杆机构和门碰撞。只开放已有系统支持的主驾驶门窗；副驾驶仍为固定模型。
- 不新增车窗隔音算法，声音仍使用现有车型音频配置。
- 主屏检查覆盖常用 ±86° 转向；更大转向角时屏幕随方向盘移动，可能需要低头。中控底部和副驾风口不在默认前视范围内，需转头查看。
- 中控是实时遥测显示，无虚构可点击菜单；没有真实来源的机油压力等数据不编造。

人工操作：开发版选 Jesko；停车按 Tab 上下车、0 开关主驾驶门，按住 8 升窗、9 降窗（若用户改键，以设置为准）。检查门开到一半反向、开门时玻璃升降、重新上车归位，以及昼夜仪表、不同窗口比例和大角度转向。外形与材质的主观验收留给用户。