# 本轮验证 — 2026-11-05

- TypeScript：通过；首次只读坐标类型错误修复后重新运行通过。
- UI 专项：通过，包含现有控制器/存储/音频/输入检查和 Tank 车型展示字段。
- Golf 专项：964 项通过（Golf 366、门窗/上下车 26、共享交互 157、显示 12、灯光 403）。保留原资源预算断言。
- 生产 VehicleVisual 离屏渲染：9 个视角完成，包含固定 DriverEye、仪表、前舱全景、斜视、中控、前后外观、开门半降窗和夜间；详见 render-results.json。
- 真实 StartupApplication：17 个车辆选项，Tank 名称/规格/选择状态正确；菜单和驾驶中均验证到 Tank 专用实体模型，Hi4-T 面板出现，加载 ready，控制台错误列表为空。当前结果见 selection-smoke.json。
- 初次开发预览因临时 Electron 目录 Cookies 的 EBUSY 文件监听错误退出，修正 Vite 忽略目录后复测成功。selection-smoke-error.json 保留此次失败记录，不代表最新结果。
- 正常 `pnpm run build`：退出码 0；类型检查、完整核心套件和生产构建通过，日志显示 `Checkpoint published`，已更新 dist。未使用 BasicValidation。
- 发布核对：暂存目录 `stage-852272628c7b4bdb87904878feef8674` 的 22 个文件逐个 SHA-256 与 dist 一致；入口为 `/assets/index-B0l1mCLh.js`，确认含 Tank 车型与新增选择框。详见 [发布记录](published.json)。
- Vite 保留体积较大分块的提示，不阻断构建；未为消除此提示引入无关拆包修改。

本轮未重新运行整个 systems 独立套件；前轮已记录其地图基线失败 `City changed: roads/ring-cw-0`，不将该套件记为通过，也未修改地图。
