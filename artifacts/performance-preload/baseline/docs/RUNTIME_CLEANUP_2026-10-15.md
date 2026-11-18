# 2026-10-15 一致性、流式性能与生成物整理

开始于 2026-10-15，完成于 2026-10-16。

本轮由用户授权修补一致性问题、进一步优化卡顿、清理冗余内容、适量验证并正常完整构建。保留车辆/地图 ID、存储键、物理标定、120 Hz 步长、镜面质量及逻辑道路/碰撞资源；没有新增依赖或提交代码。

## 实际改动

- `LaneAssistState` 统一运行时模式。Y 的 OFF/LDW 不再允许转向，LKA 允许边界纠偏，LCC 实际请求居中；G/F3 使用同一模式。车型能力与 F3 持久允许偏好限制可选项，设置页明确显示允许偏好、运行模式和控制器状态。打开设置取消居中并回到允许的 LKA，否则 OFF；复位/主动断电清除运行请求。初次加载支持且允许 LKA 的车型默认待命。保持原车道观测、速度与驾驶员接管门控。
- 区域扇区分帧构造、异步 `compileAsync` 后才可见；编译失败进入可见错误路径。取消或切图时保留异步借用的资源，完成后再释放，包括地图材料与 prefab。Node/编辑器保留同步路径。
- 路牌绘制和 GPU 上传分成不同推进步骤；支架所有共享单位盒体按几何/材质合批，不再每根梁重复 draw。牌面文字、全部支架实例、世界位置、包围边界、标牌 ID 和阴影属性保留。
- 环境按视觉根节点增删登记湿路材质与灯位，取消每次发布后全图重扫。重复登记/卸载不会累加湿路颜色或提前重置共享材质。原天气、夜灯与六盏局部点光保持。
- 静态扇区缓存包围球，按主相机和实际离轴镜面相机的视锥并集判断可见性；雾距离使用各相机空间深度，不用径向距离，以保留宽视角边缘。近处 400 m 内的包围边界保留阴影/泊车内容，非雾材质与调试相机保留可见；逻辑道路、路面和碰撞体始终存在。
- 区域选择签名包含真实扇区 ID，避免跨边界时被 100 m 桶缓存漏掉；Worker 已排队的近景道路可提优先级，同一在途请求不会重复入队。
- `VehicleContactSystem` 常规无碰撞步从五次完整快照减为三次，碰撞输入只复制需要的位姿；碰撞后仍重新采样/同步，正常物理公式与积分顺序不变。
- `selftest:systems` 从 18 扩至 24 组，新增 Golf、TCS/牵引性能、路面、加速计时/被动诊断与轨迹预测；运行入口不改历史 artifacts。核心加入 Worker 调度、扇区预热、跨边界和延迟释放回归。

主要文件为 `src/game/DrivingGame.ts`、`src/vehicle/control/{LaneAssistState,LateralAssistController}.ts`、`src/ui/ControlSettingsPanel.ts`、`src/vehicle/physics/VehicleContactSystem.ts`、`src/world/{DrivingGround,city/CityGround,city/SectorManager,city/VisualStreamingWorker,city/RoadSignRenderer,environment/EnvironmentVisual}.ts`，及相关 selftest/runner。

## 清理边界

原 `publicDir: src/world/city/maps` 会把地图 recipe、自测 TypeScript 和多份无需公开的 JSON 一起复制进 `dist`。现在只额外发布编辑器 Reload 所需 `city-alpha.json`；内置地图仍由正常源码导入。BMW/Taycan 开发预览读取显式源码 JSON 路径，保持可用。

新增 `scripts/clean-generated.mjs`：默认仅预览；`pnpm run clean:generated` 执行。清理范围是根目录临时 bundle/log、旧暂存构建、过期发布资源及此前误复制的地图源码。先解析当前与 `last-good-index.html` 的依赖闭包，包含动态编辑器、CSS 与 Worker，保留这些资源及最近两份暂存构建。所有递归路径在删除前核对真实绝对路径和链接，Git 跟踪文件、作者地图、历史基线、生成器源码、附件与 JSON 证据均保留。

清理旧发布资源后，长期打开的旧游戏标签页需要刷新。构建本身仍保留旧资源并原子发布，清理是独立的显式命令。

## 验证与性能

- `selftest:systems`：本轮 24 组通过，结果见 [systems.json](../artifacts/runtime-cleanup-2026-10-15/systems.json)。
- 镜面/streaming 专项：31 / 65 项断言，异步生命周期 10 项断言通过；覆盖全部几何/实例保留、支架合批边界、雾深度/宽视角/镜面可见性、Worker 优先级/在途去重、未预热不可发布、跨扇区更新及异步借用结束后释放，见 [rendering.json](../artifacts/runtime-cleanup-2026-10-15/rendering.json)。
- 车道模式新增集成断言验证真实控制器输出：LKA 能纠偏、OFF 立即清零、LDW 不转向、G/F3 请求同源、菜单取消、禁用模式跳过、复位不复活请求。环境核心增加共享湿材质增删回归。
- 第一次正常完整构建被环境旧断言拦下：旧检查对所有路面要求湿地抓地系数大于 0.45，与新增雪/冰/沙/泥标定冲突。普通路面保留原阈值，低附着路面增加正值、低附着范围及相互顺序检查；未跳过测试或降低普通路面标准。随后检查发现混合路面地图缺少湿路/标线材质登记标签，已补齐。环境专项共 373 项断言、11 张地图、12 辆车通过，见 [environment.json](../artifacts/runtime-cleanup-2026-10-15/environment.json)。

- 最终 `pnpm run build` 正常执行 typecheck、全部 70 组核心测试和 Vite 生产构建，退出码 0；310 个模块完成构建并原子发布，入口更新为 `assets/index-CJbAYFhO.js`。结果见 [build.json](../artifacts/runtime-cleanup-2026-10-15/build.json)、[core.json](../artifacts/runtime-cleanup-2026-10-15/core.json)。没有使用 `-BasicValidation` 或跳过失败项。构建仍有主 chunk 超过 500 kB 的提示；当前主包约 16.05 MB（gzip 约 3.99 MB），包含内置地图数据，此轮未另行改造地图打包架构。
- 完整发布后运行 `node scripts/clean-generated.mjs --apply`，删除 596 项生成物，共 2,660,744,689 字节（约 2.48 GiB）。保留当前/last-good 依赖资源 7 个和最近两份暂存构建；`dist` 根目录仅 `index.html`、`city-alpha.json`、`assets/`。见 [cleanup.json](../artifacts/runtime-cleanup-2026-10-15/cleanup.json) 与 [清理后核对](../artifacts/runtime-cleanup-2026-10-15/cleanup-verification.json)。本轮临时诊断 TypeScript 和中间性能副本也已删除。
- 清理后的生产包浏览器检查：区域地图正常进入；不支持车型的 LKA/LCC 设置不可用；切换 BMW 后能力、允许偏好与 LKA 模式正确显示；SET 显示 LCC，重新打开设置取消请求并回到 LKA。游戏和动态编辑器均未记录控制台错误；编辑器 Reload 成功读取生产 JSON，City Alpha 显示 0 errors / 7 warnings（现有地图提示）。见 [smoke.json](../artifacts/runtime-cleanup-2026-10-15/smoke.json) 和 [生产界面截图](../artifacts/runtime-cleanup-2026-10-15/production.png)。

性能夹具沿用既有 BMW/区域地图、高速直线和复杂互通，分别冷移动与预加载后移动，每场 10 秒、前 3 秒作为稳定期；视窗均为 1042 × 871，页面可见。测的是浏览器 rAF 间隔和游戏回调 CPU，不是 GPU trace 或全硬件保证；车速、视窗、逻辑资源稳定性和各阶段开销随 JSON 记录。夹具重置车辆速度属于受控性能场景，不是产品驾驶辅助行为。参考 [before.json](../artifacts/runtime-cleanup-2026-10-15/before.json)、[after.json](../artifacts/runtime-cleanup-2026-10-15/after.json) 和 [复现夹具](../artifacts/runtime-cleanup-2026-10-15/probe.mjs)。

| 场景 | P99 帧间隔：前 → 后 (ms) | 超过 50 ms：前 → 后 | 流式更新最大 CPU：前 → 后 (ms) |
| --- | --- | --- | --- |
| 高速直线冷移动 | 103.1 → 16.9 | 24 → 0 | 22.8 → 6.2 |
| 高速直线预加载 | 84.9 → 16.9 | 10 → 1 | 4.3 → 2.5 |
| 复杂互通冷移动 | 48.6 → 16.9 | 4 → 0 | 17.2 → 5.4 |
| 复杂互通预加载 | 36.4 → 16.9 | 3 → 0 | 10.3 → 4.4 |

四组平均游戏回调 CPU 从 9.3–15.7 ms 降至 5.4–9.1 ms，采样平均车速均约 133 km/h，道路网络与碰撞资源对象保持不变。优化后仍记录一次 149.8 ms 的 rAF 间隔，该帧游戏回调 CPU 为 12.1 ms、流式更新 0.2 ms；当前采样不足以定位这次间隔的来源，不能归因或宣称完全消除卡顿。其余三组最大间隔分别为 33.3、16.9、17.0 ms。

尚不能仅凭几次短场景承诺所有设备与所有地点绝对无卡顿；单张大纹理上传、驱动/GPU 等待、垃圾回收和系统调度仍可能产生长帧。最终是否达成体验要求以本轮实际结果及用户游玩为准，不修改物理步长、不删逻辑道路或降低镜面刷新率掩盖问题。
