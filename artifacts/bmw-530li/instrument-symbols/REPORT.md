# BMW 530Li 仪表符号调整

- 巡航：去掉 CRUISE 标签，显示绿色速度表与定速箭头符号，保留实时设定速度和 km/h 单位。
- 示宽灯：重画两侧对称灯体与三条短光线，避免旧图形光线穿插和不自然散射。
- 燃油：油泵符号搭配实时百分比与原有油量条；低油量时符号沿用琥珀色。
- 水温：温度计与水波符号，保留实时温度和 °C 单位。

改动文件：

- `src/vehicle/visual/BMW530Instruments.ts`
- `src/vehicle/visual/BMW530FrontCabin.selftest.ts`
- `scripts/bmw-530li-preview.ts`（增加可选巡航预览样本 `?cruise=1`）
- `artifacts/bmw-530li/front-cabin-v6/v6-instruments-day.png`、`v6-instruments-night.png`（更新预览）
- 本目录报告与昼夜预览。

验证：BMW 前舱及相关驾驶场景局部 selftest 通过；typecheck 通过；`pnpm run build -BasicValidation` 成功并发布可玩 dist。浏览器检查了昼夜图标效果。巡航启用、目标速度更新和退出仍使用现有接口。

本轮未发现新的显示问题。

[白天预览](instruments-day.png) · [夜间预览](instruments-night.png)
