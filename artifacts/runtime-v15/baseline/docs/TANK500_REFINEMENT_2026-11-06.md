# Tank 500 Hi4-T 精修 — 2026-11-06

本轮在既有单电机 P2 / 9HAT 车型上精修动力、外形、前排座舱和驾驶门交互。保留地图、天气、其他车型标定、全局音频及原有未提交工作。未新增依赖。原动力架构、完整参数和机械四驱简化见 [P2 / Hi4-T 基准说明](TANK500_HI4T.md)；该文的 11 月 2 日结果是历史结果，以下为本次标定。

## 动力变化

踏板先请求纵向加速度，再按车重、轮胎半径、实际 HAT / 主减速 / 分动速比及效率换算公共输入轴扭矩，最后受发动机、电机、电池和系统实际能力约束。没有直接改速度，也没有另加一条轮端辅助扭矩。NORMAL / ECO / SPORT 的全踏板请求分别为 6.0 / 4.2 / 6.4 m/s²；这只是驾驶需求，实际加速度会因功率、附着、质量与损耗降低。

- 松刹车后电动蠕行：目标上限 1.45 m/s，请求加速度随车速减小；脚刹、驻车、Auto Hold 抑制驱动请求。
- 4L 采用踏板的 1.5 次方与独立请求上限，保留细腻初段和大负荷爬坡能力；四驱和轮胎接触物理不变。
- Hybrid 轻负载优先纯电；46 kW / 27 m/s / 电机能力不足或持续大踏板可请求发动机。大踏板阈值 82%，普通请求需持续 0.28 s；短脉冲不会频繁点火。低 SOC / Sport 响应不等待该延时。
- 停机阈值 18 kW，最低运行 14 s、停机 3 s，并增加低需求持续 3 s 条件。SOC 的 15% / 22% 滞回保留。
- 正常松油门沿 K0 开离合执行器释放，K0 完全打开后进入按车重标定的 0.48 m/s² 松油门回收；脚刹仍可立即释放 K0，保留同一步 ABS 最终权限与液压融合。
- 修复 P/N 踩刹车或驻车时的发动机发电路径：车轮断开，制动不再禁止自由输入轴发电；仍从燃油、发动机实际输出、逆变/电机/电池损耗计算储能。D/R 制动仍禁止发动机发电请求。

上述踏板、时序和响应是 **工程标定**。公开基准仍为 180 kW / 380 Nm 发动机、120 kW / 400 Nm 单 P2、37.1 kWh、9HAT 与 300 kW / 750 Nm 系统包络。依据：[长城坦克平台](https://www.gwm.com.cn/tankplatform.html)、[Hi4-T 平台](https://www.gwm.com.cn/hi4-t.html)、[坦克 500 Hi4-T 官方上市资料](https://www.tanksuv.com/news/3402717.html)。官方 6.9 s 零百不等于当前模拟测量值，未为追赶该数字提高峰值或轮胎抓地。

## 外形与座舱

以同一套 `Tank500BodyGeometry` 边界组织侧围、倾斜 A 柱、B/C/D 柱、玻璃、门板、引擎盖、车顶和尾门。引擎盖有横向冠形、翼子板肩部和前沿收边，前后端面按曲面卷入，轮拱增加内衬，尾部补齐保护保险杠。保留既有车长、宽、轴距、轮心、碰撞基准和外挂备胎。

五横条格栅、徽记、灯组内部光学细节、皮革颗粒、座椅缝线及空调/控制台图例使用小型原创程序贴图；没有逐孔或逐针增加网格。灯光继续由 VehicleLighting 调制独立灯组材质。

前排使用曲面台面、驾驶侧仪表凹槽、中央悬浮屏、通风/时钟面板、中央扶手和选择器、门扶手、方向盘及包覆 A/B 柱。12.3 英寸级仪表 / 14.6 英寸级中控的外形尺寸为工程几何，比例参考 [GWM 官方车型页](https://www.gwmhaval.co.nz/nz/models/suv/tank-500/)，不宣称精确复刻实车 UI。后排保留坐垫、靠背、头枕和门板的大体结构。

双屏使用实时遥测：速度、转速、SOC、燃油、发动机状态、能量流、K0、机械四驱、真实胎压和车门/车窗状态。中控有能量 / 越野 / 车况三页，沿用鼠标射线点击与 `U` 翻页。仪表读数平滑、能量流动画、启动淡入、关闭熄屏、关电充电页面和日夜屏幕亮度独立更新；低油量/胎压/电源状态绕过 20 Hz 绘制节流。

仪表台与两前门有渐亮氛围灯，Sport 缓慢变为暖红，前排脚窝和仪表台有短距离无阴影光照，开门触发迎宾照明；点火关闭或关门后对应光效渐灭。控制面板图例有日夜背光。所有可变材质、屏幕和光源均由实例持有，未改全局照明。

整车最终 **165 meshes / 24,991 vertices / 35 materials / 9 textures**。固定驾驶位检查约 **88 draw calls**，外观视角约 **177**；这是隔离检查场景统计，不是地图性能保证。

## 门窗与上下车

复用 VehicleInteractionController / DriverAccessController / PlayerModeController：

- `0`：主驾驶门开关，约 0.82 / 0.78 s；门外皮、窗框、门板、扶手、氛围灯和后视镜随同一铰链移动。
- 按住 `9` 降窗、`8` 升窗，松键即停；全程 2.4 s，玻璃沿门平面下降，腰线以下用实例独立裁切平面隐藏。
- `Tab`：停车下车；在驾驶门旁再次按键上车并自动关门。驾驶门外有独立出入锚点，继续使用原步行和相机过渡。
- 行驶中拒绝开门和上下车。仅主驾驶门/窗可交互，后排和乘客侧为静态结构；未增加四门碰撞扫掠、夹手或车门损伤模型。

## 必要专项检查

入口：`scripts/run-tank500-refinement-selftests.ts`；打包后执行 Node，结果写入 [selftest-results.json](../artifacts/tank500-refinement-2026-11-06/selftest-results.json)。共 **9,075 条断言**：既有 P2 9,018、驾驶响应 11、HMI 7、Tank 形体/驾驶门/实例隔离 39。未运行全量 core、systems 或全车型套件，按本轮明确要求采用轻量检查。

| 工况 | 模型结果 |
| --- | --- |
| D 挡松刹车 10 s | 3.48 km/h；发动机未起动 |
| 20% 踏板 10 s | 27.37 km/h，峰值加速度 0.847 m/s²；燃油 0 |
| Sport 混动满踏板 | 起动完成约 0.45 s；零百约 7.90 s（NORMAL 底盘驾驶设置） |
| EV 从 54 km/h 松油 3 s | 47.43 km/h，实际储能增加 0.01158 kWh |
| P 挡踩刹车 + 驻车，发电 20 s | 储能增加 0.11698 kWh，耗油 0.05329 L，轮端输出 0 |
| N 挡发电 60 s | +0.37503 kWh，耗油 0.16712 L |
| 外接 AC / DC 600 s | 分别恢复 0.993995 / 7.716656 kWh，包含充电器与电池损失 |
| 稳态电驱 / 回收能量账 | 电池端口、辅助、轮端及损耗残差均 0 W（该固定工况） |
| 换挡协调 | 288 个换挡采样，最大相邻轮端扭矩步差 103.69 Nm |
| 14% SOC、4L、约 9.17° 上坡 15 s | 末速 6.50 m/s，发动机运行；未更改坡度/附着 |
| 600 s 既有定轴速负载检查 | SOC 2.93%，电池 23.09°C、电机 24.90°C；助力自然受储备限制 |
| E300L / Model 3 / Taycan / SU7 Max | 各 5 s 起步抽样通过，保留原 ICE/EV 拓扑 |
| 几何/交互 | 门窗时间、玻璃裁切、镜面随门、固定后门、独立材质、射线点屏、夜间渐变、实际眼位至仪表五点无遮挡均通过 |

八视角实际 WebGL 渲染：[数据](../artifacts/tank500-refinement-2026-11-06/render-results.json)、[外观](../artifacts/tank500-refinement-2026-11-06/front.png)、[前排](../artifacts/tank500-refinement-2026-11-06/cabin.png)、[驾驶位](../artifacts/tank500-refinement-2026-11-06/driver.png)、[夜间](../artifacts/tank500-refinement-2026-11-06/driver-night.png)、[开门半降窗](../artifacts/tank500-refinement-2026-11-06/front-door-open.png)。

生产桌面入口检查通过：从 `driverschool://game` 加载最终 `dist`，通过实际车型选择页进入 Tank，发送真实输入链消费的开门/关门、降窗、下车、上车按键，检查开门/关门及完成上下车消息、混动面板，页面错误列表为空。见 [结果](../artifacts/tank500-refinement-2026-11-06/startup-results.json) 与 [实际驾驶截图](../artifacts/tank500-refinement-2026-11-06/actual-driving.png)。升降窗完整行程/松键停止由上述专项验证；启动检查仅发送降窗命令，不将其表述为像素测量。最初开发 HTTP 连接超时，隐藏生产窗口又导致动画/初始化不稳定；最终改为直接检查生产入口，并在可见窗口等待实际过渡完成。终止 Electron 后曾出现 GPU command-buffer 退出提示，最终页面控制台未报错。

类型检查与 `pnpm run build -BasicValidation` 通过，正式 `dist` 已更新；未运行全量验证。构建仍提示既有 500 kB 以上大分块，不阻断发布。`pnpm run desktop:build` 与 `node scripts/desktop-package.mjs` 通过，完整桌面包已发布至 `D:\DriverSchoolRelease\DriverSchool-win32-x64\DriverSchool.exe`，内部包和发布包 `app.asar` 的 SHA-256 一致。生产入口检查使用相同构建资源及桌面入口，不将其误记为对 EXE 的完整安装/兼容性测试。

## 修改文件

- 动力：`src/vehicle/config/{P2HybridConfig,tank500Hi4TPhysicsConfig,validateP2HybridConfig}.ts`，`src/vehicle/powertrain/{P2HybridPowertrain,HybridEnergyManagement}.ts`。
- 形体/材质/座舱：`src/vehicle/visual/Tank500{BodyGeometry,BodyExterior,Textures,Exterior,VisualConfig,Cabin,CabinLighting,Displays}.ts`。
- 接入：`src/vehicle/visual/Cockpit.ts`（Tank 中控点击/翻页）、`LuxuryVisualProfile.ts`（Tank 徽记类型）。
- 检查：`src/vehicle/{P2Hybrid,Tank500Driveability}.selftest.ts`，`src/vehicle/visual/Tank500{Displays,Refinement}.selftest.ts`，`scripts/run-tank500-refinement-selftests.ts`、`render-tank500.cjs`、`run-tank500-startup-smoke.cjs` 及本次 artifacts 检查页。

未重做轮毂精细结构、原厂 UI、真实录音或全部内饰按钮功能。九挡齿比/2.64 低挡仍是既有工程估值；中央耦合仍为等效模型、完整桥锁/刚性后桥未模拟。本轮主观驾驶和外观最终验收由用户完成。

## 人工验收

- [ ] 平路 EV 轻踩、蠕行和松油门，确认自然衔接；脚刹保持时不顶车。
- [ ] Hybrid 中负载 / 大踏板与 Sport 起步，检查发动机起动、同步与换挡连续性。
- [ ] 4L 低速坡道和低 SOC，检查细腻踏板及持续动力；不要求低电时持续峰值。
- [ ] P 挡 Charge 与外接 AC/DC，检查油耗、能量方向和 SOC；发电不推动轮子。
- [ ] 白天/夜间双屏、迎宾灯、氛围灯、模式变色；关电充电显示与真实胎压。
- [ ] 正常驾驶眼位和外观前后 3/4：A/B 柱、引擎盖肩部、格栅/灯组、轮拱和尾门。
- [ ] `0` 门开关、`8/9` 半途停窗、镜面随门；`Tab` 下车/门旁上车及移动联锁。
