# Tank 500 Hi4-T 精修验证

日期：2026-11-06。本轮用户明确要求轻量检查与发布 release。

- `pnpm run typecheck`：最终通过。
- `scripts/run-tank500-refinement-selftests.ts`：9,075 条断言通过；结果见 selftest-results.json。只包含 P2、Tank 驾驶响应、HMI、几何/驾驶门及四车短时抽样，不是全量验证。
- `pnpm exec electron scripts/render-tank500.cjs`：8 视角完成，页面 errors=[]；165 meshes / 24,991 vertices / 35 materials / 9 textures。最终驾驶位 88 draw calls。
- `pnpm exec electron scripts/run-tank500-startup-smoke.cjs`：使用生产桌面入口、最终 dist 和原桌面协议；实际车型选择、混动面板、开关门、降窗输入、下车、上车通过，页面 errors=[]。不将该检查记为直接 EXE 安装兼容性测试。
- `pnpm run build -BasicValidation`：通过；更新 dist，未执行 core / systems / 全车型套件。最后 Vite 构建 481 modules，7.93 s；保留既有大分块提示。
- `pnpm run desktop:build`：通过。
- `node scripts/desktop-package.mjs`：完整桌面包发布到 D:/DriverSchoolRelease/DriverSchool-win32-x64。

开发 HTTP 版启动检查最初超时；隐藏生产窗口检查也不稳定。最终修正检查窗口的后台节流、使用可见生产入口并等待过渡完成后通过。Electron 退出后出现过 GPU command-buffer 提示，页面错误列表为空。Windows computer-use 应用启动审批曾超时，未把该尝试记为成功；后续由隔离的本地生产入口脚本完成检查。

E300L、Model 3、Taycan、SU7 Max 的短时起步结果与本轮修改前 JSON 中对应结果一致。没有执行全量测试或扩展性能基准。
