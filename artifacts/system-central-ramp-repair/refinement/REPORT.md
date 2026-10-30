# N-to-W-right 曲率修正候选

**已验证并发布，源码与 dist 一致。**

用户明确回复“允许额外构建一次，完成修正”后，已将本修正同步至源码并成功追加构建。

- 仅修改 N-to-W-right 合流前的局部 S 弯和其 4 个路牌。其余 7 条 ramp、四条主线、拓扑、其他物件均与已发布版相同。
- 延长局部横向过渡，5m 口径最小半径 **15.927m → 37.847m**。
- 最大纵坡 12.000%；≥4pp 坡折 0；共享铺装高差近似 0。
- 8 条 ramp 定点几何与跨越净空检查通过；70 条相关道路设施/标线检查通过。
- 16 个接口回放全部通过，四轮持续接地；碰撞、选中支撑拒绝、全轮离地、机械冲量和 safety/recovery 均为 0。
- TypeScript 运行源码未再变更，首次构建与独立 typecheck 均已通过。

两次 `pnpm run build -BasicValidation` 均成功；第二次已获用户明确授权。最终发布验证见 [主报告](../REPORT.md) 和 [dist 一致性](../dist-consistency.json)。

[验收数据](ready-for-publication.json) · [几何](geometry-validation.json) · [设施/标线](facility-marking-validation.json) · [16 接口回放](after/runtime-short-replay.json)
