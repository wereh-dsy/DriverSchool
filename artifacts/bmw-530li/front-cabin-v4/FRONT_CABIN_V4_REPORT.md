# BMW 530Li Front Cabin V4

V4 已完成，可玩 `dist` 已更新。本轮沿用 V3 的仪表台和 A 柱结构、正常 DriverEye，以及车辆物理、控制和仪表数据接口；没有修改其他车型或外观主体。

## 实现

方向盘删除两根转向柱拨杆和两块换挡拨片。左右辐条上移，采用少量渐缩截面形成软边；下辐条缩短并收窄。中心气囊由 128 × 119 mm 收到 118 × 105 mm，增加厚度和圆角立体感。外圈管径由 15.5 mm 增至 17.2 mm，左右握持区轻度加厚。继续使用原 CanvasTexture 徽章，直径调整为 39 mm，位于气囊中心表面。转向功能和拨片对应的车辆控制能力保持原状，删除的仅是低质量可见模型。

BMW 仪表增加两种独立的视觉层级。Comfort 使用蓝灰色调，左侧大速度、右侧挡位和较小转速、中央车辆状态图。Sport 使用橙红色背景强调及转速刻度，放大转速、调整挡位位置、突出模式文字。保留 ECO 显示、现有灯光符号、转向箭头、燃油、温度、警告和车道/近距数据消费。模式切换立即刷新，普通遥测继续使用现有节流缓存。

中控增加 Vehicle Status 页面，内容包括 BMW 530Li、Fuel、Tyre Pressure、FL/FR/RL/RR、kPa、Engine Temperature、Transmission Temperature。燃油和发动机温度直接消费当前 InstrumentTelemetry 的已有字段。当前接口没有压力和变速箱温度读数，因此使用前轮 250 kPa、后轮 260 kPa、变速箱 80 °C 的参考值，并显示 `~` 和 `~ Reference values`。这些数值是界面占位参考值，不是车辆物理或传感器模拟。

状态页绘制和缓存键独立放在 `LuxuryVehicleStatusPage.ts`，不依赖 BMW 类、不创建额外数据系统。它可接受任意车型名称及实际四轮压力、温度数据，供后续豪华车型复用；本轮没有给其他车型安装该页面。当前字段布局以燃油车为主，电动车复用时还需按实际能源/温度字段调整文案。

前仪表台软包采用更柔和的石墨色、高 roughness、零金属度。前饰板增加适度清漆反射和低金属度，与软包形成层次。仪表和中控屏使用单层 MeshPhysicalMaterial：同一 CanvasTexture 同时提供图案和 emissiveMap，少量清漆/环境反射表现玻璃感；没有叠加透明玻璃面。日间反射经过收敛，夜间仍由原有亮度输入控制。

前仪表台、前门、中央通道灯带在原有响应结果上提高约 18% 可见度。后排灯带沿用原材质和强度，现有 3 个低位 PointLight 数量及强度不变。灯光关闭仍熄灭灯带，白天很弱，阅读灯保持关闭。

A 柱、前风挡和侧窗框没有重新设计，V3 的前窗闭合采样继续通过。

## 本轮文件

- [BMW530Cabin.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Cabin.ts)：方向盘简化、前舱材质、状态页接入、前排灯带微调。
- [BMW530Instruments.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Instruments.ts)：Comfort / Sport 皮肤及屏幕材质。
- [BMW530LiVisualConfig.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530LiVisualConfig.ts)：仅方向盘管径。
- [LuxuryVehicleStatusPage.ts](D:/dsy/drivergame/src/vehicle/visual/LuxuryVehicleStatusPage.ts)：新增可复用的纯 Canvas 状态页和缓存键。
- [BMW530FrontCabin.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530FrontCabin.selftest.ts)：补充模式层级、状态数据/参考值、页面缓存和材质检查。
- [BMW530Li.selftest.ts](D:/dsy/drivergame/src/vehicle/visual/BMW530Li.selftest.ts)：删除对已移除拨片模型的存在要求，原车辆控制检查保留。
- [bmw-530li-preview.ts](D:/dsy/drivergame/scripts/bmw-530li-preview.ts)：V4 八视图及明确的 Sport 预览样本。
- [bmw-530li-preview-server.mjs](D:/dsy/drivergame/scripts/bmw-530li-preview-server.mjs)：本地保存 V4 截图。
- [preview.html](D:/dsy/drivergame/artifacts/bmw-530li/preview.html)：八视图入口。

另新增本报告、以下 8 张截图；构建发布新的 `dist`。`InstrumentTelemetry` 和游戏数据组装文件本轮没有改动。

## 验证

- `pnpm run typecheck`：通过。
- BMW 前舱 selftest：通过，5529 个断言，包含 170 个前窗闭合采样、驾驶视线无遮挡、几何有效性、徽章和拨杆/拨片删除检查。
- Comfort / Sport 字体层级和调色差异、立即切换、灯光符号、原有缓存和车道/近距数据：通过。
- 状态页实际燃油/发动机温度、默认压力/变速箱温度标记、通用输入、温度和压力缓存失效、无关车速变化不上传页面纹理：通过。
- 前排灯带克制增亮、后排材质独立、灯光关闭熄灭、无新增 PointLight：通过。
- 前舱涉及的 Mesh：V3 的 97 降为 93；顶点从 40900 降为 40054。座舱材料由 17 增为 21，用于前排软包、皮革、饰板和独立灯带；未增加 CanvasTexture 数量。
- 浏览器最终八视图保存成功，没有观察到脚本错误。
- `pnpm run build -BasicValidation`：成功，243 个模块转换，可玩 `dist` 已发布。使用项目既有局部验证选项，没有运行 full core 或物理调校。构建仍有大体积 bundle 提示，本轮未进行加载优化。

## 预览

所有视角使用原 DriverEye；日夜主驾驶保持相同位置、朝向及 65° FOV。Sport 近景使用明确的演示遥测（87 km/h、3500 rpm、D4），游戏中继续显示实际车辆数据。

1. [主驾驶白天](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v4/v4-driver-day.png)
2. [主驾驶夜晚](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v4/v4-driver-night.png)
3. [方向盘近景](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v4/v4-steering.png)
4. [Comfort 仪表](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v4/v4-instruments-comfort.png)
5. [Sport 仪表](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v4/v4-instruments-sport.png)
6. [车辆状态页](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v4/v4-vehicle-status.png)
7. [副驾方向](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v4/v4-passenger.png)
8. [前舱三分之四视角](D:/dsy/drivergame/artifacts/bmw-530li/front-cabin-v4/v4-dashboard-three-quarter.png)

## 剩余问题

轮胎压力和变速箱温度当前是明确标注的参考值；接入真实读数需要后续已有车辆数据提供相应字段。仪表台端部、柱根和饰板仍有低模折面，材质尚无皮革/木纹微纹理。当前结果为简化的现代 BMW 风格，实际驾驶画面的协调程度仍以用户的视觉评价为准。
