# BMW 530Li — Front Cabin Visual Refinement V3

本轮以正常 DriverEye `[-0.40, 1.225, 0.30]` 为基准，完成前舱结构、仪表界面和前窗连接修正。没有调整驾驶员位置来掩盖遮挡。后排模型、后排门板、后玻璃、外观主体和物理配置沿用本轮开始时的版本。

## 1. Dashboard 大形

仪表台改为有纵深的连续封闭截面：风挡下沿 cowl、上部软包、屏幕凹区、向驾驶员靠近的前缘、副驾后退的饰面和下仪表台具有不同深度。驾驶区有轻度包围，右侧降低并后退；中央通道前端向上接到下仪表台。横向饰面跟随形体转折，前门饰条在仪表台末端回转衔接。

## 2. Instrument / center-screen integration

双屏共用连续黑色背板、浅上眉和下部承托。中控屏移近仪表，统一上沿和边框关系。仪表下移少量、后退并增加倾角；上眉向后收，使速度、挡位、模式文字均处于正常驾驶视线中。中控屏保留原有车辆状态信息，没有新增 iDrive 功能。

## 3. A-pillar / windshield / side-window closure

新增 BMW 前窗几何基准供玻璃、A 柱外结构和内饰使用。A 柱采用有端盖的封闭截面，覆盖风挡侧边与前侧窗前缘之间的楔形区域。前风挡上角跟随车顶横向曲率，顶部内框与下沿 cowl 均为封闭结构。前侧窗增加上、下内框，接到柱根、门板上沿和现有后视镜三角区。保留单层浅色玻璃及原有黑边路径。

局部射线检查覆盖两侧 A 柱、柱根、前侧窗上下沿、镜前三角区以及风挡上下沿，共 170 个采样；不依靠透明玻璃或远处车身作为封口。

## 4. Steering wheel

轮圈管径由 18 mm 收到 15.5 mm，握持截面轻度椭圆，底部仅小幅收平。左右辐条改为渐缩面，下辐条保留简洁三辐识别；缩小气囊中心和拨片。使用一个 256 × 256 CanvasTexture 小徽章平面，替代多个几何体和独立字牌拼出的中心车标。保持原有转向轴、转动组和功能连接。

## 5. BMW instrument UI

重绘 1440 × 540 暗色仪表：速度最大、挡位次之，其次是转速、模式、油量和温度。左右采用薄型开放折线，刻度按弧线长度分布，减少两端文字挤压。中央车辆图改为有发动机舱、玻璃、车顶和尾部比例的轿车轮廓。

灯光继续使用向量符号：绿色示宽/近光/前雾灯、蓝色远光、黄色后雾灯；不显示 LIGHT / HIGH / FOG 文字。保留转向箭头和实际车辆状态。纹理维持独立 BMW 皮肤，设置抗锯齿与各向异性过滤；无变化时不重复上传，普通数据按最多约 20 Hz 更新，挡位、点火、灯光和关键指示立即刷新。

## 6. Shared lane / proximity hooks

继续消费已有 `drivingScene` 数据，不新增数据层或豪华车系统抽象。实际车道数据存在时显示相应车道线和标线类型；缺少数据时仅显示车辆状态图，没有虚构道路。保留已有八区近距状态的简洁可选显示。地图能力接口维持原状，没有制作 BMW 地图界面或改动 Tesla/A6L。

## 7. Ambient light

前仪表台灯带跟随新饰面，前门灯带回转连接仪表台。中央通道灯带、现有脚部微光、外界亮度与灯光模式联动逻辑继续沿用。整体强度保持原校准：白天 0.004、夜间上限 0.22。没有新增 PointLight，没有持续顶灯/阅读灯。未改变后排灯带布局及其亮度校准。

## 8. Deleted / simplified

- 删除前部装饰出风口及独立危险灯文字、手套箱描边。
- 删除独立仪表围壳、中控安装台块和仪表下托零件，合并为连续背板、上眉和承托。
- 删除中控旋钮及其顶盖、装饰性驻车/Auto Hold 字牌；杯架继续藏在盖板下。
- 删除方向盘按键字牌、多件中心徽章和较粗的旧辐条，保留两块简洁黑色控制区。
- 中央后视镜继续使用暗色普通镜片，不增加实时反射。

## 9. Modified files

本轮代码文件：

- [BMW530Cabin.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Cabin.ts)：前仪表台、双屏连接、前门饰条、前窗内框、方向盘。
- [BMW530Exterior.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Exterior.ts)：仅前风挡、前侧窗共同基准及 A 柱外结构。
- [BMW530FrontFrame.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530FrontFrame.ts)：新增 BMW 前窗几何基准。
- [BMW530Geometry.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Geometry.ts)：新增封闭截面生成和方向盘单平面徽章；旧工具保留。
- [BMW530LiVisualConfig.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530LiVisualConfig.ts)：仪表安装位置、倾角和轮圈管径。
- [BMW530Instruments.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Instruments.ts)：BMW 仪表皮肤与刷新缓存。
- [InstrumentCluster.ts](D:/dsy/drivergame/src/vehicle/visual/InstrumentCluster.ts)：将已有帧间隔传给 BMW 仪表；其他仪表分支保留。
- [BMW530FrontCabin.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530FrontCabin.selftest.ts)：新增前舱局部验证。
- [BMW530Li.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Li.selftest.ts)：同步被删零件名称、温度文字和读数位置；本轮未运行其物理/完整整车部分。
- [run-bmw-530li-front-cabin-selftest.ts](D:/dsy/drivergame/scripts/run-bmw-530li-front-cabin-selftest.ts)：新增局部验证入口。
- [bmw-530li-preview.ts](D:/dsy/drivergame/scripts/bmw-530li-preview.ts)：仅 7 个 DriverEye 前舱视角、简单初次创建/首帧记录。
- [bmw-530li-preview-server.mjs](D:/dsy/drivergame/scripts/bmw-530li-preview-server.mjs)：本地保存这 7 张前舱图片。
- [preview.html](D:/dsy/drivergame/artifacts/bmw-530li/preview.html)：前舱预览入口。

另新增本报告及下列 7 张 PNG；构建更新 `dist`。已有地图、区域世界以及此前 BMW 改动保持在工作区，本轮没有修改它们。

## 10. Targeted validation

- 前舱局部 selftest：通过，共 4074 个断言；包括 Canvas 调用参数有效性、97 个涉及前舱的 Mesh / 40900 个顶点有效性、170 个框架闭合采样、速度/挡位/模式无遮挡。
- 仪表纹理创建、真实数据更新、缓存跳过、灯光立即切换、点火关闭：通过。
- 现有车道/八区近距数据消费、无车道数据不绘制道路：通过。
- 徽章单平面纹理、少量低位微光、灯光关闭熄灭灯带、阅读灯保持不发光：通过。
- `pnpm run typecheck`：通过。
- 浏览器预览：7 张均已保存，未观察到浏览器脚本错误。日夜主驾驶使用相同位置、方向和 65° FOV。
- 未运行 full core、其他车辆套件、后排验证或加速调校。

7 张预览（均从同一正常 DriverEye 拍摄）：

1. [Driver daytime](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v3/v3-driver-day.png)
2. [Driver night](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v3/v3-driver-night.png)
3. [Left A-pillar](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v3/v3-left-a-pillar.png)
4. [Right A-pillar / passenger dashboard](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v3/v3-right-a-pillar.png)
5. [Steering wheel](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v3/v3-steering.png)
6. [Instrument](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v3/v3-instruments.png)
7. [Dashboard three-quarter](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v3/v3-dashboard-three-quarter.png)

## 11. Build result

`pnpm run build -BasicValidation` 成功。采用项目现有选项，跳过用户明确排除的全量 core；类型检查及生产构建完成，242 个模块转换，新的可玩 `dist` 已发布。可继续使用 [start-game.cmd](D:/dsy/drivergame/start-game.cmd)。存在原有大体积 bundle 提示，本轮没有扩大到加载或打包优化。

## 12. Remaining front-cabin issues

仪表台两端、副驾上软包和 A 柱根部仍能看到低模折面，材质没有真实皮革/木纹微细节；当前方向盘及双屏为简化风格，仍由用户判断实际驾驶画面的协调程度。中控保留简洁车辆状态信息，不含 iDrive 交互或正式地图。

简单初次加载记录：本地预览第一次创建 BMW 约 146 ms，第一次执行帧（含两侧镜面）约 373 ms；同步首次工作有约十分之一秒/数十分之一秒的开销。这是单次观察，未计资源下载，也不是完整游戏冷启动基准。本轮未新增 profiler 或进行加载优化，后续 Cold Load Optimization 可据此继续分析。
