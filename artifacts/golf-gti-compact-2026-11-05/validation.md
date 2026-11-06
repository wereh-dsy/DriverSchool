# Golf 紧凑轮廓验证

- `pnpm run typecheck`：通过。
- Golf 专项：970 项通过（Golf 372、门窗及上下车 26、共享交互 157、显示 12、灯光 403）。保留原车身尺寸、轮位、资源预算、灯组贴合及驾驶视角可见性检查。
- 渲染：11 个视角完成，错误列表为空；包含固定 DriverEye、仪表近景、座舱、中控、前后外观、开门半降窗、夜间、正侧面与正前方。
- 正常 `pnpm run build`：退出码 0，类型检查、完整核心套件和生产构建通过，日志确认 `Checkpoint published`，dist 已更新；没有使用 BasicValidation。
- 发布核对：暂存目录 `stage-daa8e617aee14b5b9f007b923883a2c2` 的 22 个文件逐个 SHA-256 与 dist 一致，详见 [发布记录](published.json)。
- Vite 提示部分分块大于 500 kB，这是体积提示，不是构建失败。本轮没有增加依赖或进行无关拆包。

本轮未重跑整个独立 systems 套件。前轮记录的地图基线问题 `City changed: roads/ring-cw-0` 未在本轮处理，不将该套件记为通过。
