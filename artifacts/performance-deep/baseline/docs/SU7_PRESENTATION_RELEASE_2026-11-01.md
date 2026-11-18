# SU7 Max 前排、外形、门窗与声音优化交付

完成日期：2026-11-01（任务于 10 月 31 日开始，因此证据目录沿用该日期）。范围仅为当前 `Xiaomi SU7 Max (2026)` 的表现、交互与必要公共接线；未调整车辆动力、轮胎、悬架或空气动力标定，未修改地图、天气和导航算法。

## 实现

- **前排构造**：用连续截面曲面替换两块简单仪表台方块；修正紧凑仪表、完整比例的 16.1 英寸参照中控屏、方向盘、门板、A 柱、踏板与脚窝封闭面。中控按 1024:620 画布比例绘制现有共享导航和实际 SOC/功率/模式，显示材质独立，不再使用小地图面板填在大黑框内。
- **贴图与开销**：一张原创 1024×512 图集提供皮纹、座椅缝线、扬声器孔阵、方向盘按键、窗键、踏板和徽标；同一图集在本车内复用，没有用大量小零件模拟纹理。屏幕约 10/15 Hz 更新；没有新增物理传感器、反射相机或常驻音频上下文。
- **外型**：保留 4997×1963×1445 mm、3000 mm 轴距和物理轮位；调整车头/前翼子板高度、机盖中部曲面，采用不越过尺寸包络的单调 Hermite 插值，使车身与车顶轮廓连续。补充门把手凹槽、内轮罩封闭面，改为专属五瓣宽辐轮面及卡布里蓝近似色。仍是轻量程序化模型，不是原厂 CAD 或扫描资产。
- **主驾门窗与上下车**：左侧车身与玻璃真实分段，主驾外门皮、内门板、拉手、按键、灯带和内外镜面随同一门铰链运动；固定车身不再留有覆盖整扇门的实体皮。车窗独立升降，门腰线裁切面按实例隔离并随门运动；沿用现有停车限制、步行上下车和末段吸合机制。
- **独立声音**：新增 SU7 配置，不复制 Model 3/Taycan 的完整音色。前轴感应电机与后轴永磁电机以实际各轴转速分别驱动已有两个合成节点；独立基频、扫频、波形、负载增益与回收声调。补充 SU7 专属启动/模式提示、转向滴答、低速车外提示、门锁/吸合/升窗音色。开窗开门连续改变本车风噪、路噪和电驱隔音。

公开外观与前排布局参考：[新一代 SU7 官网](https://www.xiaomiev.com/su7)、[参数配置](https://www.xiaomiev.com/xiaomi/car-config)。官网照片只用于观察，未作为游戏贴图打包。全部声音为原创合成近似标定，没有原厂授权录音或实测频谱，因此不能宣称录音级复刻。

## 操作

按默认键位：`Tab` 上下车，`0` 开关主驾门，按住 `9` 降窗、`8` 升窗。自定义键位仍以游戏控制设置为准。行驶中上下车/开门请求保持现有停车门控。

## 本次轻量验证

- 新增 SU7 表现基本检查：**21 项通过**，覆盖车门/车窗返回闭合姿态、门板/镜面跟随、窗裁切材质隔离、上下车区域与移动限制、导航材质隔离、有限几何/纹理数量、独立音色、开窗声学变化、电驱静止/断电静音，以及 1 秒基础固定步驾驶。
- 基本检查中的整车几何为 **43736 三角形、3 张本车纹理**。最终四视图预览为 210 draw calls、48634 rendered triangles、4 张纹理（包含预览环境）；不是全场景 FPS 承诺。
- 最终单车型隐藏渲染通过，无控制台错误；没有运行车队、气动、地图或全核心/全系统套件，也没有做驾驶性能调参。
- 轻量正式 build 内的 `typecheck` 通过。轮毂细化时曾被类型检查/预览发现局部变量遮蔽导致构建对象初始化失败，已改名修正；最终源码与正式 EXE 均通过检查。

证据：[基本自测](../artifacts/su7-presentation-2026-10-31/basic-selftest.json)、[预览统计](../artifacts/su7-presentation-2026-10-31/render-results.json)、[前排/外形/开门预览](../artifacts/su7-presentation-2026-10-31/refinement-preview.png)。

## 构建与发布

- 使用项目指定 **pnpm 11.19.0** 执行一次 `run build -BasicValidation`；按本次明确要求只做轻量验证，跳过全核心，现有 checkpoint 更新 `dist` 成功。Vite 有已有的大 chunk 提示，没有构建错误。
- 桌面入口类型检查通过，随后执行既有 `scripts/desktop-package.mjs` 完整目录发布，没有通过 `desktop:package` 再做一次网页构建。保留工作区既有未提交修改。
- 正式入口：`D:\DriverSchoolRelease\DriverSchool-win32-x64\DriverSchool.exe`。
- 当前 manifest 对应的 **18 个包内资源与 dist 的 SHA-256 全部相同**，确认 SU7、已有物理气动、本次门窗/图集及独立声音代码已入包。ASAR SHA-256：`0c019150e7da0a4a73d67444acdd93376daf5e160a490f0bc34a451f6197962e`。
- 正式 EXE 使用隔离用户目录实际完成 SU7 选车、进入驾驶、按键升降窗、Tab 下车并重新上车；渲染器异常为 0。测试进程已关闭，未改用户存档。窗键发送和上下车冒烟属于基本功能验证，不代替主观听感/视觉验收。
- 发布校验辅助脚本首次错误地要求内饰和音色标记位于同一 chunk；改为在全部当前 chunk 中分别核对后通过，所有资源哈希检查保留。产物没有因此重构建或重发布。

证据：[轻量 build 日志](../artifacts/su7-presentation-2026-10-31/light-build.log)、[Release 日志](../artifacts/su7-presentation-2026-10-31/release-package.log)、[包内哈希](../artifacts/su7-presentation-2026-10-31/release-verification.json)、[正式 EXE 基本冒烟](../artifacts/su7-presentation-2026-10-31/release-smoke.json)、[驾驶画面](../artifacts/su7-presentation-2026-10-31/release-smoke.png)、[下车画面](../artifacts/su7-presentation-2026-10-31/release-on-foot.png)。

## 修改文件

新增：

- `src/vehicle/visual/SU7CabinTextures.ts`
- `src/vehicle/visual/SU7CenterDisplay.ts`
- `src/audio/SU7MaxAudioProfile.ts`
- `src/vehicle/SU7Presentation.selftest.ts`
- `scripts/run-su7-presentation-selftest.ts`
- 本文及 `artifacts/su7-presentation-2026-10-31/`

修改：

- `src/vehicle/visual/SU7MaxCabin.ts`、`SU7MaxInstruments.ts`：前排曲面、细节图集、仪表与中控比例。
- `src/vehicle/visual/SU7MaxExterior.ts`、`su7MaxVisualConfig.ts`：轮廓、轮毂、活动门窗与交互锚点。
- `src/vehicle/visual/VehicleExterior.ts`：SU7 镜面挂点使用本车门皮尺寸。
- `src/audio/ElectricAudioMix.ts`、`VehicleAudioProfile.ts`、`EngineAudio.ts`：可选独立 EV 音色、门窗声学与瞬态参数；未安装新音色的旧 EV 保留原计算分支。
- `src/vehicle/VehicleCatalog.ts`、`src/game/DrivingGame.ts`：绑定本车音色，传递真实前轴转速和现有门窗/座舱声学状态。

## 已知简化与人工验收

目前实现主驾门和主驾车窗；没有扩展乘客门、门铰链碰撞或全车玻璃物理。贴图按键、气候面板和中间后视镜为表现细节，不新增真实空调控制或额外反射。贴图和几何没有使用原厂 CAD，声学未由实车录音校准。

建议人工检查默认前排视野、仪表可读性、夜间屏幕和氛围灯、门窗中途反向与上下车连续动作；再比较闭窗/半窗/全开窗下的电驱、回收、风噪，以及启动、门锁和吸合的主观听感。未发现剩余的基本功能阻断。
