# Ground streaming / UI refinement（2026-10-23）

本轮沿用 StartupApplication、MenuScene、GameUIController、四种 HUD、物理 sector、runtime/visual Worker 和外部发布目录。没有修改车辆标定、接触语义、地图内容或驾驶环境效果。

## 地表与构建粒度

原 CityGround 在准备驾驶前遍历完整 cityBounds / cityExtensions，生成带开挖口的整片地表。现在 Regional 地图的非编辑器入口使用同一 SectorManager key、sectorSize 和 VisualStreaming 选择结果；附近地表的数据在现有 Worker 中按 sector 准备，随道路/地形加入同一个 publication，完成 shader 准备后一起显示。出生缓冲沿用物理 active 的 `0.6 × sectorSize`，相关 near sector 就绪才允许 visualReady；随后沿已有周边/前向选择继续加载。取消、卸载、同地图复用和有限数据缓存沿用现有流程，没有第四套空间划分或调度器。

开挖轮廓仍使用原道路边链与裁剪算法，只对不可变 runtime 缓存开口索引；编辑器完整地表入口不使用该缓存。小地图入口保持原实现。

远景城市底面也交给已有后台批次，保留开挖裁剪和高度轮廓，使用 sectorSize / 8 的远景网格；near / mid 的详细地表仍为原 20m 网格。远景与详细 sector 共享原地形遮罩，避免详细地表卸载后城市露空或重叠闪烁；不在 Drive Ready 前等待远景全图生成。

道路 collider 首个 primitive 之前原本会完整计算护栏采样、中央分隔和桥墩。现在这些阶段均可 yield；全局对向车道索引也分批准备后才发布。视觉道路 builder 增加 buildSteps，标线、墙体、支撑等步骤及 Worker 三角形整理可让出；主线程数据接收和材质几何合并共享原约 3 ms publication 预算。原同步 API 用 drain 保持兼容，没有改变 collider 类型、ID 或道路语义。Worker 复用批处理帮助函数时增加了无 document 环境判断。

surface index 保留全局可用和原排序/高度/支撑选择，仅增加长道路内部的 yield。未改为依赖可视驻留的局部索引，避免影响高架与多层道路。

## 轻量记录

`loadStatistics.ground` / `groundStatistics` 包含 activeSectors、spawnReadyMs、buildActiveMs 和 maxSingleBuildStepMs；新增 `loading:spawnGroundReady` / `ground:spawnReady`，继续保留 driveReady 和 surfaceIndex。地表 build 时间来自 Worker，转换/发布仍由主线程处理；物理统计增加 maxSingleBuildStepMs。

修复后的单次 Regional Main CPU 样本：出生物理就绪 **3.29 s**，附近四个地表 sector **44.5 ms**，地表最大 generator step **4.23 ms**；道路 collider 最大单步 **1.92 ms**、最大批次 **6.14 ms**，仍只准备 68 / 2944 条道路、4932 个道路 collider。完整样本见 `.tmp-physics-sector-sample.json`。

上一轮 CPU 样本出生物理就绪约 4.77 s、最大道路批次约 132 ms。不同次运行仅作阶段参考；本轮不是完整 EXE→Drive Ready benchmark，也不声称所有 long task 消失。地表旧阶段计时混入 SectorManager 构造，本轮单独记录 sectorSetup，不能直接用旧 3.11 s 对比新 groundGeometry。

剩余主要成本：sectorSetup 约 **1.21 s**（全局地形/边链等准备）、SectorManager 初始化约 **527 ms**、全局 surface index 约 **455 ms**，以及尚未单独量化的 shader/GPU warmup 和复杂路口发布。没有为漂亮数字反复 benchmark。

## UI 视觉预算

GameShell 在状态变化时写入 menu / loading / driving / paused 阶段；从驾驶直接打开且未暂停的设置仍使用 driving 预算。仅暂停层启用 5px blur；菜单与暂停设置使用轻量阴影/面板质感。Loading 无重 blur 或循环视觉动画。

选车使用约 240ms、3.5% 幅度的短相机 settle，结束即停止；进入加载会取消动画和邻车预热定时器。展示场景增加柔和补光与静态接触阴影纹理，不新增阴影渲染 pass，也不修改驾驶 renderer。

菜单精修焦点、留白和车辆参数层级；设置缩短重复说明。驾驶 HUD 保留左下速度、小挡位、细 RPM 条，增加轻微换挡颜色反馈；右下 minimap 使用小圆角、静态渐暗边缘和轻微阴影，导航仍只显示箭头/距离。Training 辅助状态降低常态存在感。继续使用 plain telemetry、20 Hz HUD / 10 Hz Training，没有增加逐帧 DOM 重建或削弱环境效果。

## 专项验证

物理流式专项通过：出生、相邻跨区、同步保护、上下层支撑、缓存滞回及 road-course；补充地表开挖射线、局部 bounds 和长道路准备 yield 检查。生产 Browser 已实际进入 Regional Main，检查主菜单、选车、四种 HUD、暂停/恢复、设置和同地图继续；1920×1080 与 1024×680 做基本布局核对。驾驶 HUD 无 blur，暂停层为 5px。没有自动驾驶、全地图或全核心测试。

`pnpm run build -BasicValidation` 和最终 `pnpm run desktop:package` 均通过，dist 已更新，正式包已完整替换到 `D:\DriverSchoolRelease\DriverSchool-win32-x64`。最终外部 EXE 创建 DriverSchool 窗口并持续运行 8 秒，smoke 通过；未修改 ACL 或安全设置。

主要文件：CityGround / CityGroundGeometry、SectorManager、VisualStreaming.worker / VisualStreamingData、RoadInfrastructure / RoadCarriageway、RoadBuilder / RoadVisualCompiler、CityPhysicsSectors、Loading、MenuScene、GameShell、system.css、Hud、ControlSettingsPanel、physics-sector-selftests。
