# Taycan Instrument & Infotainment V1

本轮仅细化 Taycan 显示与局部安装几何。依据用户授权安装项目现有 LKA/LCC 配置；没有修改控制器算法或 EV 动力学。

用户反馈后的仪表修正：中心由 0.973 m 降至 0.905 m，整体缩放为 84%，调整短安装座。修正曲面映射：弧形外轮廓仅裁切纹理，不能压缩整张 UI；屏幕水平/垂直像素对应相同物理长度，左右静态圆环与动态功率弧保持相同映射。相关测试现为 48 项断言，包括圆环映射、等比例物理像素、驾驶位前方 12 m 道路视线不被仪表覆盖。10 张车舱截图已更新为修正版。

1. **仪表风格**：薄弧形独立仪表，黑色玻璃、细白线开放圆环、克制青蓝色状态。玻璃反射与发光分开控制，没有 PointLight。
2. **三区域**：左侧 SOC、电池、功率/回收、可用放电功率与续航；中央数字速度，支持 Driving、Assistance、Navigation；右侧 Trip/Vehicle 信息、纵向 PRND、右下驾驶模式。Launch Ready 和明显动力限制采用短提示。
3. **Assistance**：借用 SharedVehicleData 的 LaneEnvironment 和现有 LateralAssistController 状态。LCC ACTIVE 使用青蓝色车道，LKA 修正侧高亮；无有效车道时灰色/隐藏。Taycan 已按授权复用 createLateralAssistConfig。
4. **导航**：PCM 默认 Navigation，复用 LocalRoadMap、共享当前位置/路网/当前道路/限速及 AdaptiveMapZoom。缓存地图以深色 Porsche skin 显示；仪表只提供轻量路线示意，没有路线时保持干净驾驶信息，不编造转向指令。
5. **Energy**：直接读取 EV provider 的 SOC、estimatedRangeKm、batteryPowerKw、regenPowerKw、averageConsumptionKWhPer100km、tripEnergyConsumedKWh、tripEnergyRecoveredKWh。UI 不重算续航或能耗。
6. **Parking**：复用共享 360 proximity 和 rear parking zones；左侧俯视车/距离分区，右侧明确为合成后方距离示意。R 自动进入，退出 R 后 1.2 秒返回先前页，P 可手动进入。没有新增障碍查询或照片级摄像头。
7. **下屏**：独立倾斜玻璃屏，双区温度、风量、AUTO、Defog、Home。温度/风量/除雾为可操作 cockpit UI state，没有新增 HVAC 热舒适模拟。
8. **Sport Chrono**：局部圆形表壳、真实时间指针、缓存刻度、轻微夜间发光；安装座连接 dashboard。
9. **渲染拆分**：共享 VehicleAssetRegistry 缓存静态背景/圆环/图标 atlas。每块屏使用局部动态纹理；仪表中央圆环为单独静态层，仅 Driving 可见。脏键变化才绘制/上传。启动与页面过渡只调整既有图层透明度；不可见 PCM 页面停止内容更新。
10. **更新上限**：仪表速度/功率/车道 30 Hz；PCM Energy 30 Hz；地图/停车/Assist/Drive/chrome 10 Hz；TPMS/Status 2 Hz；下屏 5 Hz；时钟 1 Hz。数据不变时这些周期不会导致重复绘制。亮度按环境/灯光平滑变化，仪表优先可读，下屏更暗。
11. **本轮文件**：
    - 显示：`src/vehicle/visual/PremiumEVInstruments.ts`、`TaycanDisplaySurface.ts`、`TaycanSymbols.ts`、`TaycanCenterDisplay.ts`、`TaycanAuxDisplays.ts`、`TaycanCabinDisplays.ts`。
    - 集成：`src/vehicle/visual/InstrumentCluster.ts`、`Cockpit.ts`、`taycan4SVisualConfig.ts`、`src/game/DrivingGame.ts`、`src/vehicle/VehicleCatalog.ts`。
    - 授权配置：`src/vehicle/config/taycan4SPhysicsConfig.ts`，仅接入已有 lateralAssist 配置。
    - 验证/预览：`src/vehicle/visual/TaycanDisplays.selftest.ts`、`scripts/run-taycan-hmi-selftests.ts`、`scripts/taycan-hmi-preview.ts`、`scripts/taycan-hmi-preview-server.mjs`、`taycan-hmi-preview.html`。
    - 交付：本目录 10 张 PNG、gallery.html、test-results.json、REPORT.md，以及最终构建更新的 dist。
12. **Targeted tests**：45 项断言全部通过；涵盖真实 LCC ACTIVE / LKA 修正、无车道回退、地图缓存/无隐藏更新、共享 EV 数据、TPMS 有效/无效读数、R 自动停车/延迟恢复、气候点击、Chrono 1 Hz、日夜亮度、静态缓存、Tesla EV UI dirty regression、真实 cockpit 几何与中控无饰板遮挡。测试中地图只栅格化一次，UI 新增车辆环境查询为零。typecheck 通过。没有运行 full core、ICE、BMW/Audi 视觉或全地图验证。
13. **Build**：`pnpm run build -BasicValidation` 成功，typecheck + Vite production build 完成，Checkpoint published，playable dist 已更新。按请求跳过 core selftests。Vite 仍提示应用主 chunk 较大，本轮没有扩展到无关 bundle 重构。
14. **剩余视觉边界**：完整 dashboard、方向盘、车门与车身仍为已有简化模型，本轮没有重建。地图标签取决于共享地图数据，缺失路名使用 Current road。无媒体源显示空态；无 TPMS/门传感数据显示 --。停车不是摄像头视频。未做完整稳态帧时间对照 benchmark，性能验证以缓存/脏更新/频率计数为准。

截图使用实际 VehicleVisual cockpit、GPU 材质与透视相机渲染，并接入真实 EV provider、shared map、现有 lateral controller 与共享停车感知；预览周边场景为轻量验证场景。包含日/夜驾驶位、Driving/Assistance/Navigation 仪表、Navigation/Energy/Parking 中控、下屏及总体 dashboard。不是单独 Canvas 截图。

交互：点击仪表底部 DRIVE/ASSIST/NAV 切中央页，点击右侧圆区切信息；PCM 左侧图标切页面，Vehicle 顶部切 Drive/Assist/Energy/Status。Drive 页底部也可选仪表页。下屏温度箭头、风量、AUTO、Defog、Home 可操作。驾驶模式/辅助控制继续使用项目原有控制入口；状态行没有伪装可点击开关。
