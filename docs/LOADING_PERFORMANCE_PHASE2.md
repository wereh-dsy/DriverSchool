# DriverSchool 加载与启动优化（2026-10-23）

本轮延续 [Desktop / UI Phase 1](DESKTOP_UI_PHASE1.md)，保留现有 UI 设计、平台抽象和 Controller / plain ViewModel 数据方向。没有修改车辆物理参数、120 Hz 步进、电控、道路拓扑、碰撞规则或输入映射，也没有增加依赖。

## 原因与调整

原启动路径在 `main.ts` 静态引入 DrivingGame，主菜单可用前已准备当前完整地图、车辆物理与座舱、导航、调试视图、镜面和 GPU warmup。菜单展示一辆车因此也承担驾驶世界的成本。City / Regional Main 还有大型 JSON parse、地表几何、sector 计划、全部物理 collider 和空间索引的同步初始化。

一次原路径 CPU 定位样本：runtime JSON 为 35,371,995 字节；parse 275 ms、地表几何 1,504 ms、SectorManager 1,489 ms、577,550 个 collider 创建 8,110 ms、surface index 350 ms、collider index 192 ms。这些是单次工具样本，不能相加当作实际驾驶进入时间，也不是持续 benchmark。音频是已有合成音频，没有发现全部车型音频同步 decode 的路径，因此没有为形式改写音频。

现在的路径：

1. HTML / CSS 显示静态启动底色与标题；Electron 在 DOM 就绪后显示窗口。
2. `StartupApplication` 建立原 GameUIController / GameShell，利用构建时导出的车辆、地图 plain metadata 立即允许菜单操作。
3. 下一次绘制后动态加载轻量 MenuScene：地面、灯光、相机和当前车辆外观。没有地图、物理、座舱、镜面、导航或音频实例。
4. 当前车辆优先准备；延后只预热前后相邻车辆，不遍历所有车辆或地图。菜单按变化绘制，不维持无意义的持续渲染。
5. 点击开始后先绘制原 GameShell 内的加载状态，再动态引入 DrivingGame。车辆准备与地图资源准备可并行。
6. 地图分批构建、当前场景纹理与 shader warmup 完成后才进入驾驶。返回菜单再进入相同地图复用现有 game / world / renderer，不重建世界。

编辑器入口保留独立动态 import。座舱、镜面、导航及驾驶专用调试依赖随 DrivingGame 推迟，首次菜单不加载它们。设置面板也按需导入；没有驾驶 session 时仍可设置偏好与按键，实时驾驶操作则不可用。Vite 开发依赖扫描改为预处理已知 Three.js 入口，避免等待整个异步驾驶模块图的扫描才返回启动模块。

## 地图、Worker 与主线程

- 地图菜单只读取既有目录 metadata，不请求 35 MB runtime。稳定 ID、存储 schema 和地图数据格式不变。
- Regional Main 首次驾驶在现有 VisualStreaming Worker 中 fetch / parse；只保留一个 runtime 和一个在途请求。Worker 保留 map，随后同一个 Worker 转为可视流式生成，不把完整 map 再发送回 Worker。
- `CityGround`、`SectorManager` 与 ground geometry 提供分批 iterator，约 8 ms 活跃工作后让出绘制机会；原同步 API 消费完全相同的 iterator，供工具与原有测试继续使用。
- 没有删除远处的逻辑道路、路面或物理碰撞物。既有可视流式策略保持，物理资源仍在驾驶可用前完成。单个生成器步骤和索引构造仍可能超过 8 ms；这是批次目标，不是绝对上限。
- Worker 不可用环境保留原主线程 fallback。正常 Browser / Electron Worker 路径不增加失败后重复 fetch / parse。

## 车辆与 GPU 资源

`VehicleStaticAssets` 提取原有外观与轮胎构造，菜单和实际车辆复用相同生成器；轮位、尺寸、座舱和碰撞标定保持。菜单与驾驶转移同一个 renderer 和 VehicleAssetRegistry，避免为两个阶段建立重复 GL context 和外观几何。

Registry 共享几何、模板与安全的静态纹理；实际车辆使用独立可变材质、显示 CanvasTexture、导航与反射资源。相邻预热缓存按近期使用淘汰，目标上限为三个车型 owner，活跃借用者和 registry 自有共享纹理除外；原始 canvas 记录上限为八个。释放实例后才允许销毁 registry，不把动态显示写回共享模板。

菜单按外观、车轮和四张纹理一批分阶段准备，并仅为当前展示调用 `compileAsync`。驾驶继续使用已有 VehicleLoadingLifecycle 的纹理 / shader / 后视镜 warmup，没有启动时编译所有场景。车辆预览预热失败不会阻止尝试进入驾驶，并会释放尚未发布的实例资源；重试沿用同一 renderer / registry。

## 加载状态与测量

GameUIState 增加 plain loading phase，仍由 Controller 发起命令、Game 回报状态、GameShell 显示。阶段包括 loadingWorld、loadingVehicle、warmingRenderer、ready、error；沿用原设计，没有伪造百分比。错误提示允许返回主菜单重试。VehicleLoadingLifecycle 重试增加 generation 失效处理，旧异步任务完成或失败不会污染新一轮状态。

`performance` marks 包括 `loading:bootstrap`、`uiInteractive`、`vehicleReady`、`menuSceneReady`、`drivePreload`、`worldReady`、`driveReady`。其中 vehicleReady 可在菜单展示及驾驶车辆实例完成时分别出现；driveReady 位于实际 warmup 完成后。开发模式输出阶段日志，生产模式不刷阶段日志。`loading:batched` measure 记录活跃工作时长、最大批次和批次数；异步构建的总墙钟时间包含让出绘制的等待，不能直接与同步 CPU 样本比较。

一次同机、同默认车辆 / road-course 的启动观察（毫秒）：

| 指标 | 原打包路径 | 优化后最终包 |
| --- | ---: | ---: |
| Electron 测量入口到菜单可交互 | 6,434 | 449 |
| Electron 测量入口到车辆菜单场景就绪 | 未分离记录 | 1,190 |
| renderer bootstrap mark | 未记录 | 107 |
| renderer UI interactive mark | 原整体就绪 6,274 | 173 |
| renderer 当前车辆 / menu scene ready mark | 未分离记录 | 1,019 |

以上由 Electron 测量脚本包裹实际 `app.asar` 主入口采样；不包含 Windows 创建测量进程之前的时间。菜单可交互由每 100 ms 观察启用的开始按钮判定，因此包含轮询误差。单次样本受磁盘 / OS cache / GPU 状态影响，不代表稳定冷启动承诺。收尾错误恢复修复前的包样本为 469 / 885 ms，另一次 dist 生产 origin 样本为 648 / 1,086 ms。没有记录可靠的驾驶首次进入前后时间对照，不能声称总地图 CPU 或驾驶加载耗时降低了某个百分比。

生产 origin 观察到菜单的 HTML、CSS、入口和四个场景共享模块各请求一次；没有 DrivingGame 或地图 runtime 请求。最终入口 JS 约 28.58 kB，DrivingGame 约 1.69 MB 延后加载；Three.js 等共享 chunk 仍存在，已知大 chunk warning 未强行消除。

可复用测量入口：`scripts/measure-startup.cjs`（通过 Electron 运行，无点击或驾驶动作）。默认观察 `.desktop/main.cjs`，可用 `DRIVERSCHOOL_SMOKE_MAIN` 指向包内 `resources/app.asar/.desktop/main.cjs`；`DRIVERSCHOOL_TIMING_OUT` 指定 JSON 输出。默认结果和本轮临时采样保留为根目录 `.tmp-startup-*.json`，不进入版本控制。

## 本轮验证

- `pnpm run selftest:loading`：通过。同步 / 分批 City Alpha 的全部 collider 与顺序、spawn、112 次路面采样、ground geometry hash 一致；异步构建期间定时器持续执行。包含共享 geometry / 私有 material / 淘汰、既有轮位一致性（2 断言）、导航私有显示（21 断言）、异步 UI 成功 / 错误和单次 runtime / Worker 交接。
- `pnpm run selftest:ui`：通过。Controller / storage / ViewModel、菜单音频、HUD loading（5 断言）、Xbox 输入（159 断言）、haptics（13 断言）。错误路径 fixture 的预期 console.error 不代表失败。
- 额外 loading reset fixture：通过；旧异步 rejection 不污染重试状态。
- Browser dev：确认主菜单、车辆页与切车、独立设置、road-course 和 Regional Main 进入、阶段加载、HUD、Esc 暂停、返回主菜单后再次进入相同地图。未自动驾驶。
- Electron dev：菜单 / canvas 就绪与 preload storage smoke 通过。
- Electron production `app.asar`：菜单 / canvas、storage 往返、越界路径拒绝、无 renderer require / process、四个隔离目录均通过。越界负向测试产生的 Invalid storage key 日志是预期结果。
- 生产 origin Worker 专项：从 `driverschool://game` 加载实际打包 Worker 和 runtime，得到 2,944 条道路；同 Worker 无 map 重传 init 后成功编译 `regional:G17:out`，返回四组 surface。最终包单次 Worker fetch / read 357 ms、parse 269 ms；这些不等于整个世界加载时间。测试退出时曾出现 Electron GPU 关闭诊断，测试已成功返回，无运行阶段 Worker 错误。
- `pnpm run build -BasicValidation`：通过，已发布最新 dist。
- `pnpm run desktop:package`：通过，包含轻量验证构建、desktop build 与 Windows x64 打包。

遵照本轮要求，没有 routine 运行全核心 / 全系统测试，没有调驾驶手感或自动驾驶。Pointer Lock 的既有输入路径未改，真实鼠标锁定、Xbox 硬件、音频与主观视觉体验仍由人工体验确认。

## 文件范围与产物

| 范围 | 本轮主要文件 |
| --- | --- |
| 启动与薄调度 | `src/main.ts`、`src/loading/Loading.ts`、`src/game/startup/StartupApplication.ts`、`MenuScene.ts`、`src/game/createGameRenderer.ts`、`src/game/DrivingGame.ts` |
| UI 接入 | `src/ui/state/GameUIState.ts`、`controller/GameUIController.ts`、`screens/GameShell.ts`、`design/system.css`、`ControlSettingsPanel.ts`、`Hud.ts` |
| 车辆资源 | `src/vehicle/VehicleCatalog.ts`、`VehicleLoadingLifecycle.ts`、`visual/VehicleStaticAssets.ts`、`VehicleAssetRegistry.ts`、`VehicleVisual.ts` |
| 地图与 Worker | `src/world/DrivingGroundCatalog.ts`、`city/CityGround.ts`、`CityGroundGeometry.ts`、`SectorManager.ts`、`CityMainResource.ts`、`VisualStreaming.worker.ts`、`VisualStreamingData.ts`、`VisualStreamingWorker.ts` |
| 构建与验证 | `index.html`、`vite.config.ts`、`src/vite-env.d.ts`、`desktop/main.ts`、`package.json`、`scripts/loading-selftests.ts`、`run-loading-selftests.mjs`、`measure-startup.cjs`、`desktop-smoke.cjs` |
| 文档 | 本报告与 `README.md` 的启动说明 |

本轮保留原工作区的 Phase 1 未提交修改，未提交或推送。

- 可玩 Browser 构建：`D:\dsy\drivergame\dist\index.html`，通过现有启动器 / HTTP 服务运行。
- Windows x64：`D:\dsy\drivergame\release\DriverSchool-win32-x64\DriverSchool.exe`，保留同目录资源一起使用。

剩余主要成本是首次大地图的完整物理资源与少数不可拆小步骤；本轮改善启动依赖与 UI 响应，未重写物理世界架构。批次等待可能延长总墙钟时间，不能把更流畅等同于所有 CPU 工作消失。未做贴图 atlas、WebGPU / WASM 或大型资源框架迁移。
