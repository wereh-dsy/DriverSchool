# 混动起步修复验证记录（2026-11-13）

- 修复前：新增真实刹车选挡起步检查失败，EV 在 8 s 后只有 0.499268 m/s；旧 P2 专项仍通过，证明旧检查漏掉了刹车压力释放历史。
- 修复后：run-p2-launch-selftests.ts 1,049 条通过，run-p2-hybrid-selftests.ts 9,018 条通过，共 10,067 条专项断言。
- 实际生产桌面入口：EV 踩刹车挂 D、松刹车加速至 30 km/h；刹停后重新加速至 30 km/h，页面 errors=[]。首轮检查脚本的界面等待/匹配问题已修正。
- pnpm run typecheck：通过。
- pnpm run build -BasicValidation：通过，490 modules；最后一轮 8.45 s。含既有 regional baseline 核验通过，未运行全量 core / systems。
- pnpm run desktop:build：通过。
- node scripts/desktop-package.mjs：使用现有完整包发布机制更新 release。内外包校验记录见 release.json。
- 仅修改 P2 回收/驱动选择及新增专项、启动检查脚本与文档；保留其他未提交工作。
