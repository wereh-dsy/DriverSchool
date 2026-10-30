# DriverSchool 桌面化与 UI 第一阶段

日期：2026-10-23。范围仅为桌面运行入口、平台边界与玩家 UI；车辆、地图数据、物理、电控和输入语义未重写。

## 入口与交付

- Browser：`pnpm run dev`；原有 `pnpm start`、Web build、preview 与编辑器入口保留。
- Desktop 开发：`pnpm run desktop:dev`。薄壳变更后重启此命令；前端沿用 Vite 热更新。与 Browser 使用不同依赖缓存。
- Desktop 构建：`pnpm run desktop:build`，检查 `desktop/tsconfig.json` 并生成 `.desktop/main.cjs` / `preload.cjs`。
- Desktop 打包：`pnpm run desktop:package`，依次执行本轮授权的 `pnpm run build -BasicValidation`、桌面构建与 Windows x64 目录打包。
- 项目内 `release/` 是中间产物；最终完整发布目录为 `D:\DriverSchoolRelease\DriverSchool-win32-x64`，正式入口为其内 `DriverSchool.exe`，必须保留整个目录。发布采用暂存后的整目录替换，避免旧 runtime/resources 混用。当前未签名，无安装器/自动更新。
- 当前日常交付：相关轻量专项 → `pnpm run build -BasicValidation` → `pnpm run desktop:package` → 核对 dist/外部目录 → 正式 EXE 基本启动 smoke。打包命令自身还会运行一次 Browser 构建；不例行跑全核心/全系统，不修改 ACL 或关闭 Electron sandbox/Defender/SmartScreen。最近正式 EXE 交付见 [2026-10-24 v492 记录](FINAL_RAMP_CLEANUP_2026-10-24.md)，其中记录两次 Browser 构建、外部完整包核对及正式 EXE 启动 smoke。随后 [v493 长高速扩展](HIGHWAY_EXTENSION_STREAMING_2026-10-24.md) 按该轮明确要求只更新 Browser dist，未重新打包，不能把外部 EXE 视为 v493。
- 桌面工具需要 Node >=22.12；Browser 入口保持原有 Node 版本约束。首次安装需要联网下载官方 Electron 运行时。

## 四个核心界面

1. Main Menu：左侧纵向操作，右侧车辆信息；复用当前车辆/地图实时场景。无本次运行中的驾驶 session 时禁用继续。开始驾驶、车辆、地图、教学、设置均接入实际入口。
2. Vehicle Select：单车 3D 展示、前后切换、配置派生的动力/变速箱/驱动/游戏标定功率、描述、车辆设置和选择。沿用 staged loading 与 warmup，未就绪时禁用切换/开始。
3. Driving HUD：Standard 的左下速度/挡位、右下已有小地图/共享导航及可用限速；Realistic 保留临时提示；Training 加踏板、转向和实际 ABS/TCS/ESC 介入；Off 整体关闭。非手动挡不显示虚构离合踏板值。HUD 遥测按 20 Hz、训练信息按 10 Hz 更新现有节点。F1 可关闭并恢复 Standard。
4. Pause Menu：Esc 打开，保留驾驶场景、纯暗覆盖，无额外 blur pass；冻结固定步仿真，取消辅助请求/圈速计时，停止震动，降低总音频增益，提供恢复、设置、控制、车辆设置、重开及主菜单。从暂停进入设置仍冻结；驾驶中直接 F3 保留旧设置的物理与脚刹策略。

菜单支持鼠标、Tab/Shift+Tab、上下方向键、Enter；车辆页支持左右方向键。保持 Xbox 驾驶输入与震动语义。鼠标拖动观察保留，双击画面请求 Pointer Lock；环境拒绝时提示继续拖动。Esc 解除锁定并暂停。

## 文件与边界

| 文件/目录 | 作用 |
| --- | --- |
| `desktop/main.ts`, `preload.ts`, `files.ts`, `tsconfig.json` | 窗口、生命周期、受限 IPC、原生文本对话框、目录、相对键文件读写 |
| `src/platform/Platform.ts`, `browser/`, `electron/`, `index.ts` | 统一 StorageService/Platform 接口及实现；只有 Electron adapter 知道 preload 全局 |
| `src/ui/state/GameUIState.ts` | JSON 友好的屏幕、车辆/地图 ViewModel、HUD profile 与遥测类型 |
| `src/ui/controller/GameUIController.ts` | 开始/继续/暂停/重开、切车/切图、设置、HUD 命令与状态 |
| `src/ui/screens/GameShell.ts` | 可复用稳定 DOM、界面导航与键盘焦点；不接触车辆内部对象 |
| `src/ui/design/system.css`, `src/ui/hud/TrainingHUD.ts` | 色彩/间距/字体/按钮/面板/焦点/状态/减弱动画规则与训练遥测表现 |
| `src/game/GameUIViewModels.ts`, `DrivingGame.ts` | 从目录生成纯数据、连接既有游戏操作、暂停门控与菜单相机 |
| `Hud.ts`, `ControlSettingsPanel.ts`, `EngineAudio.ts`, `main.ts` | 旧 HUD/设置适配、音频衰减与统一样式入口 |
| `scripts/desktop-*.mjs`, `desktop-smoke.cjs`, `ui-selftests.ts`, `run-ui-selftests.mjs` | 开发/构建/打包和专项检查 |
| `vite.config.ts`, `package.json`, lock/workspace 文件、`.gitignore`, `index.html`, `README.md` | 双入口脚本、依赖、当前资源 manifest、生成目录排除、标题和使用说明 |

数据方向为 UI → GameUIController → 游戏命令适配；游戏 → plain ViewModel/HUD state → UI。新增 UI 不持有 physics/Three.js/Electron 对象；Electron 不读取或修改游戏状态。菜单相机仅在既有渲染编排内消费车辆表现。

Desktop 使用 contextIsolation、sandbox、关闭 Node integration，preload 只暴露列举方法，IPC 验证主窗口与主 frame；拦截外部导航与新窗口。发行资源通过固定 `driverschool://game` origin 提供，支持 fetch、ES modules 与 Worker。路径限制在程序资源/用户配置根目录内；平台存储只接受 `config|saves|logs|mods/文件名`，拒绝目录穿越，检查符号链接目录实际位置。参考 [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)、[contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)、[protocol](https://www.electronjs.org/docs/latest/api/protocol)。

用户数据根目录来自 Electron `app.getPath('userData')`，默认 Windows 为 `%APPDATA%/DriverSchool`，内含 config/saves/logs/mods。新 HUD 偏好保存为 `config/ui.json`；Browser 为同源可选 localStorage，并有会话内回退。旧设置、行程、编辑器草稿仍使用原键和 schema，通过 Chromium 同源存储保留；本轮未迁移所有历史存档。

## 保留范围与限制

- 沿用旧设置页、调试工具、传感、共享导航和车载显示；未增加第二套路由/感知、菜单手柄导航或新驾驶教学评分。
- HUD 小地图仍遵守已有地图数据与用户小地图开关；没有数据时不捏造导航或限速。
- Electron 目录和文本对话框接口已经提供；尚未实现 Mod 加载/管理，也未替换现有文件导出工具。
- 未新增核心 Three.js 依赖，未尝试迁移历史核心数学类型或重写 renderer。
- Vite 保留大主包体积提示；未为消除警告扩大本轮架构范围。

## 专项验证

- `pnpm run selftest:ui`：UI 加载/暂停/恢复/设置回程、HUD 偏好与可序列化模型、存储边界、音频总增益衰减/恢复通过；HUD 加载 5 项断言，既有统一 Xbox 输入 159 项断言、震动 13 项断言通过。
- `pnpm run desktop:build`：桌面 TypeScript 与 esbuild 通过。
- Browser UI：在 1920×1080 中确认主菜单、实际切车、进入场景、P/速度 HUD、Esc 暂停、恢复、Training 遥测、F1 整体关闭与恢复、控制页入口。
- Electron dev smoke：真实场景加载就绪、canvas、preload/IPC 配置读写、路径拒绝、四类目录、renderer 无 require/process 通过。
- 发现并修复：依赖重装后的旧 Vite/esbuild 进程失效；测试 profile 锁文件被 Vite 监听；打包器 v20 改用命名导出；manifest 不含 Worker 的资源收集遗漏。
- 按用户本轮要求只执行专项检查及 BasicValidation，未运行全核心/全系统测试，也未自动驾驶或做主观驾驶/视觉调校。
- 内嵌自动化浏览器拒绝 Pointer Lock，回退提示已确认；真实桌面鼠标锁定、实体 Xbox 与声音听感仍需人工确认。

最终构建/产物与补充检查结果见下方记录。

### 最终结果

- 最终命令 `pnpm run desktop:package`：退出码 0。其内部 `pnpm run build -BasicValidation`、桌面 tsc/esbuild 和 packager 均成功，最新 `dist/index.html` 已原子发布。
- Windows x64 目录包已生成；`resources/app.asar` 约 38.9 MB，包含当前 index/CSS/编辑器、区域 runtime JSON 与 VisualStreaming Worker，未复制 dist 保留的旧版本资源。
- 从包内 `app.asar/.desktop/main.cjs` 加载生产 origin 的冒烟检查通过：页面就绪、canvas、IPC 往返、四类目录、越界路径拒绝、renderer 无 Node globals。
- 960×600 小窗口中暂停菜单所有按钮均在可视窗口内；设置关闭回暂停、方向键聚焦与 Enter 操作、Realistic 模式与 Esc 恢复已检查。
- `git diff --check` 通过。构建仅有原有大 chunk 提示，无构建错误。
- 未提交或推送代码。
