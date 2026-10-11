# BMW 530Li G38 LCI 实现报告

1. **车辆配置**：正式注册 `bmw-530li-g38` / BMW 530Li；沿用现有 ICE、AT、驾驶辅助和输入链路。
2. **尺寸与质量**：共享基准 5.106 × 1.868 × 1.500 m、轴距 3.105 m、轮距 1.6175 m；基础质量 1745 kg，燃油质量由现有系统增加。物理轮心、视觉轮轴、碰撞基准使用同一尺寸。
3. **动力与传动**：2.0T INLINE4、峰值曲线约 180 kW / 350 Nm、8 个实体挡位、终传 2.929、纯 RWD。P/R/N/D、拨片手动选挡和返回自动已验证。ECO/NORMAL/SPORT 使用配置化油门、换挡和转向；NORMAL 显示 COMFORT。
4. **底盘**：前重 51%、重心 0.50 m、偏航惯量 3820；前 DOUBLE_WISHBONE / 后 MULTI_LINK。使用现有弹簧、阻尼、防倾、轮胎、ABS/EBD/TCS/ESC；配置 EPB、Auto Hold、巡航。没有新增 ADAS 或魔法抓地系数。
5. **外观构造**：纵向断面车身、真实开放轮拱、拱唇、隆起机盖、前后保险杠、双肾厚框及竖条、进气格栅、四门缝与把手、后备厢、排气饰框、18 英寸双辐轮圈和刹车盘。
6. **车窗与立柱**：分离前/后侧窗及后角窗，Hofmeister 式尾窗转折；曲面前后玻璃、黑边与密封；完整外车顶、A/B/C 内外饰面。A 柱内饰使用有厚度的断面，避免与玻璃黑边相交产生条纹。
7. **外部灯光**：双 L 灯导、主灯模组、透明灯罩、前后与镜壳琥珀色转向、尾灯、制动、倒车、高位制动和后雾灯。绑定现有 LightingController 状态及闪烁相位。仪表示宽/近光/远光/前雾/后雾均绘制符号，使用绿/蓝/琥珀色；转向使用箭头，删除 LIGHT/HIGH/FOG 文字。现有组合雾灯信号可驱动前后雾灯符号，独立状态优先。
8. **前排驾驶与乘客区**：连续仪表台、独立数字仪表和独立中控屏、实体空调/音响键、通风口、手套箱、完整前门内饰、脚坑、三踏板（含休息踏板）、转向柱、三辐方向盘、拨片和拨杆。仪表实时显示速度、转速、挡位、模式、燃油、温度及辅助状态。
9. **中央控制台**：高式电子挡把及 PRND/M±、iDrive 旋钮/快捷键、驾驶模式、EPB/Auto Hold、储物、两个真实开口杯架及前扶手。控制面板沿中央结构斜面安装，避免按钮被结构遮住。
10. **后排**：三座坐垫/靠背/头枕、收起的中央扶手、后门板、外侧安全带、后排出风/空调面板、贯通通道、置物架和后舱边界。
11. **顶部**：曲面顶棚、前后横梁、遮阳板、顶部控制区、前阅读灯和后排顶灯。
12. **夜间**：仪表/屏幕/按钮照明、克制琥珀色饰条、前后舱及左右脚坑共 4 个真实点光源。亮度平滑变化，熄火后渐灭；夜间前后排轮廓可见。
13. **后视镜**：外镜保留真实平面反射；可选中央镜复用现有 MirrorMath，反射真实后排、头枕、后窗、置物架和外部世界。支架位于镜面背后，镜体位于风挡内侧。
14. **变更文件**：新增 `src/vehicle/config/bmw530LiPhysicsConfig.ts`；新增 `src/vehicle/visual/BMW530{Exterior,Cabin,Geometry,Instruments,Wheels}.ts`、`BMW530LiVisualConfig.ts`、`BMW530Li.selftest.ts`；新增 `src/camera/InteriorMirror.ts`；更新 VehicleCatalog/Dimensions、Cockpit/Layout、InstrumentCluster、LuxuryVisualProfile、VehicleLighting/Visual/VisualConfig，以及 DrivingGame 的可选中央镜生命周期。更新 Catalog/Structure 验证；新增 BMW 验证入口与本地预览脚本。本任务未改其他车型配置；工作区已有地图改动保留。
15. **相关验证**：BMW 配置/平台、目录、轮心和包围盒、几何有限性、舱体封闭射线、真实镜面数学、灯光相位、灯光符号形状/颜色/方向/状态刷新、熄火渐灭、8AT 和 120 Hz 动力链均通过。镜面、灯光、车辆结构、目录和原有仪表专项验证通过；未运行 full core。结果见 [validation.json](D:/dsy/drivergame/artifacts/bmw-530li/validation.json)。视觉共 662 个 Mesh、333080 个顶点、92 个共享/独立材质；未进行性能基准。
16. **Typecheck**：通过 `tsc -b`，最终生产构建也执行并通过类型检查。
17. **构建**：`pnpm run build -BasicValidation` 成功；该项目已有 BasicValidation 开关按任务要求跳过 full core，仍执行生产打包并原子更新 playable `dist`。最终入口使用 `index-CNczCkVn.js`。Vite 提示主包较大，未为本任务进行额外拆包。
18. **剩余问题**：模型仍为程序化近似；保险杠/车肩/灯壳曲率、玻璃反射和座椅纹理尚未达到参考照片的精细度。主灯模组及辅助告警图形有简化。单次静态全油门 0–100 测得约 8.17 s，尚未达到约 7 s 目标；未做长时间极速或驾驶体验调校。外饰/轮胎细节使测量包围盒约 1.879 × 1.502 × 5.131 m，分别比名义尺寸多约 11 / 2 / 25 mm。封闭射线和 12 张预览通过当前检查，不能代替用户所有角度的主观验收。

## 实机预览

十二张图来自实际 Three.js 页面渲染，不是生成式示意图。

| 外观 | 驾驶与车内 | 镜面与夜间 |
| --- | --- | --- |
| [正前](D:/dsy/drivergame/artifacts/bmw-530li/front.png) | [驾驶席](D:/dsy/drivergame/artifacts/bmw-530li/driver.png) | [中央镜](D:/dsy/drivergame/artifacts/bmw-530li/mirror.png) |
| [前 3/4](D:/dsy/drivergame/artifacts/bmw-530li/front-three-quarter.png) | [乘客侧](D:/dsy/drivergame/artifacts/bmw-530li/passenger.png) | [夜间前排](D:/dsy/drivergame/artifacts/bmw-530li/night-front.png) |
| [侧面](D:/dsy/drivergame/artifacts/bmw-530li/side.png) | [中央控制台](D:/dsy/drivergame/artifacts/bmw-530li/console.png) | [夜间后排](D:/dsy/drivergame/artifacts/bmw-530li/night-rear.png) |
| [后 3/4](D:/dsy/drivergame/artifacts/bmw-530li/rear-three-quarter.png) | [后排](D:/dsy/drivergame/artifacts/bmw-530li/rear-cabin.png) | [风挡/A 柱](D:/dsy/drivergame/artifacts/bmw-530li/windshield-pillar.png) |

预览：运行 `node scripts/bmw-530li-preview-server.mjs`，打开 [本地预览](http://127.0.0.1:5188/artifacts/bmw-530li/preview.html)。可切换 12 个视角、昼夜、灯光和双闪；截图保存到本目录。正常游戏通过 `start-game.cmd` 启动，在现有车辆选择中选 BMW 530Li。

## 参考

车型代际与轴距依据 [BMW 中国长轴版 2020 发布资料](https://www.press.bmwgroup.com/global/article/detail/T0316926EN/new-bmw-5-series-for-the-chinese-market-celebrates-its-premiere-at-the-auto-china-2020-in-beijing)；LCI 外部特征参考 [BMW 5 Series 官方发布资料](https://www.press.bmwgroup.com/global/article/detail/T0308529EN/the-new-bmw-5-series)。用户图 8/9 用于 G38 仪表与舱体参考，其余新一代内饰图仅作材质/照明参考。
