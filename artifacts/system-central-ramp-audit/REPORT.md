# 中心立交逐匝道连接审计

### 中心立交总匝道数量：8

### PASS 数量：1

### P0 数量：4

### P1 数量：3

### P2 数量：0

计数按每条匝道最高严重度互斥统计（4+3+1=8）。P2=0 表示没有“仅 P2”的匝道，不表示设施全部正常。设施关联问题见后文和 facility-followup.json。

本轮只新增此目录的诊断脚本及证据，未修改游戏源码、地图、车辆物理、Support Selection 或悬挂阈值。源地图：`src/world/regional/regional-main.json`，版本 489，SHA-256 `94a9be105430175c0b95c416ec4ab9824da2c4b8a8851ef017478e39ade5ecdb`。菜单 City Main 使用此 regional 数据；未使用同名旧城市 CLI 别名。

## P0：逐条问题

状态中的 BROKEN_Y_CONNECTION 指共享连接区高度分离；所有端点本身都对齐，不能误读为端点有数米 ΔY。WRONG_LAYER_CONNECTION 指应同层连续处的运行拒绝，不要求强连合法上下层。

### system-central:E-to-S-semi — COMPLEX / P0

- 问题位置：分流后 s≈18–110m；另有主体坡折。
- 具体问题：端点相同，但匝道下坡时仍与 +8m 主线铺装重叠。车辆留在上层主线并撞主线护栏；未进入匝道支撑。
- 分类：BAD_PAVEMENT_JOIN + BROKEN_Y_CONNECTION + WRONG_SUPPORT_OWNERSHIP + BAD_GRADE_TRANSITION。
- 根因：高程下降先于平面分离，共享区域出现多个相差数米的铺装；现有支撑延续和护栏开口因此对应上层主线。
- 建议修复方向：局部联合复核分流喉部 XZ、Y 和共享铺装边界，在真正分离之前保持同一支撑层；随后重生成护栏开口。不要只补端点或调整支撑阈值。
- 主体：长度 1313.655m，最大纵坡 9.993%，5m 弦长口径最小半径 79.024m；≥4 个百分点坡折 12 处。短段 0 处；不将短段数量直接视为急弯。
- 主体坡折位置：s=18.160m（Δgrade=6.656pp）；s=94.212m（Δgrade=4.718pp）；s=99.249m（Δgrade=9.622pp）；s=152.103m（Δgrade=14.495pp）；s=322.076m（Δgrade=5.328pp）；s=355.174m（Δgrade=5.284pp）；s=621.707m（Δgrade=6.754pp）；s=635.321m（Δgrade=5.741pp）；s=649.169m（Δgrade=6.806pp）；s=653.820m（Δgrade=4.070pp）；s=968.724m（Δgrade=5.358pp）；s=980.652m（Δgrade=4.530pp）。

- 出口/分流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.524°；扩展共享区最大高差=5.991m。30km/h 目标速度回放 23.99s：路径完成=false，目标归属=false，最少接地轮=2，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 203 ticks；|aY|max=1.723m/s²，pitchRate=0.182rad/s，rollRate=0.697rad/s，机械冲量=0.000N·s，requiredLength=[0.22633324414269987, 0.4163276912139542]m，最大 XZ 跟踪偏差=1.364m。

- 入口/合流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.644°；扩展共享区最大高差=0.570m。30km/h 目标速度回放 11.40s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.023rad/s，机械冲量=0.000N·s，requiredLength=[0.26166645272510747, 0.37094886084857676]m，最大 XZ 跟踪偏差=0.112m。

- 直接证据：碰撞 collider：`ew-wb-split-3-split-split-split-split-split:barrier:92:1`、`ew-wb-split-3-split-split-split-split-split:barrier:93:1`、`ew-wb-split-3-split-split-split-split-split:barrier:94:1`、`ew-wb-split-3-split-split-split-split-split:barrier:95:1`、`ew-wb-split-3-split-split-split-split-split:barrier:96:1`、`ew-wb-split-2:barrier:55:1`。

### system-central:E-to-N-right — COMPLEX / P0

- 问题位置：出口 s≈19–110m。
- 具体问题：先短暂上拱再下降；尚未脱离主线 footprint 就形成米级高差。回放车辆仍在主线上，被主线外侧护栏阻挡。
- 分类：BAD_PAVEMENT_JOIN + BROKEN_Y_CONNECTION + WRONG_SUPPORT_OWNERSHIP + BAD_GRADE_TRANSITION。
- 根因：分流平面重叠长度与纵向下降位置不匹配；s=19.336m 另有 4.636 个百分点坡折。
- 建议修复方向：对单一出口喉部联合校核平面分离与纵断面，在共享区域给出一致高程，再处理 gore/护栏。
- 主体：长度 505.361m，最大纵坡 11.263%，5m 弦长口径最小半径 128.089m；≥4 个百分点坡折 1 处。短段 0 处；不将短段数量直接视为急弯。
- 主体坡折位置：s=19.336m（Δgrade=4.636pp）。

- 出口/分流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.804°；扩展共享区最大高差=3.538m。30km/h 目标速度回放 23.99s：路径完成=false，目标归属=false，最少接地轮=2，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 365 ticks；|aY|max=2.248m/s²，pitchRate=0.182rad/s，rollRate=0.717rad/s，机械冲量=0.000N·s，requiredLength=[0.22196058092115484, 0.43741237314068254]m，最大 XZ 跟踪偏差=1.726m。

- 入口/合流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.304°；扩展共享区最大高差=0.000m。30km/h 目标速度回放 11.40s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.025rad/s，机械冲量=0.000N·s，requiredLength=[0.26022248333994125, 0.37242724351943757]m，最大 XZ 跟踪偏差=0.121m。

- 直接证据：碰撞 collider：`ew-wb-split-2-split-split-2:barrier:86:1`、`ew-wb-split-2-split-split-2:barrier:87:1`、`ew-wb-split-2-split-split-2:barrier:88:1`、`ew-wb-split-2-split-split-2:barrier:89:1`、`ew-wb-split-2-split-split-2:barrier:90:1`。

### system-central:N-to-E-semi — COMPLEX / P0

- 问题位置：分流后 s≈0–100m，约 s=75m 触发拒绝。
- 具体问题：一侧轮迹转入匝道、另一侧继续沿南向主线，随后面对约 0.726m 上跳被 unreachable-layer-switch 拒绝，最终全轮失去接地。
- 分类：BAD_PAVEMENT_JOIN + BROKEN_Y_CONNECTION + WRONG_SUPPORT_OWNERSHIP + WRONG_LAYER_CONNECTION + BAD_GRADE_TRANSITION。
- 根因：匝道与继续下降的主线在共享区域纵断面分离，轮间所有权不一致。拒绝是已有机械可达性检查的结果，不能通过放宽 Support Selection 修复。
- 建议修复方向：先解决出口共享 footprint 的同层高程和分离时序，消除左右轮跨层，再局部修纵坡；保留合法主线下穿关系。
- 主体：长度 1292.146m，最大纵坡 11.080%，5m 弦长口径最小半径 40.989m；≥4 个百分点坡折 5 处。短段 7 处；不将短段数量直接视为急弯。
- 主体坡折位置：s=321.155m（Δgrade=5.739pp）；s=654.392m（Δgrade=8.119pp）；s=880.190m（Δgrade=5.554pp）；s=910.926m（Δgrade=6.084pp）；s=1137.154m（Δgrade=8.593pp）。

- 出口/分流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.740°；扩展共享区最大高差=0.772m。30km/h 目标速度回放 16.92s：路径完成=false，目标归属=false，最少接地轮=0，全轮离地 61 ticks，candidateCount=0 0 次，支撑拒绝 408 次，护栏/障碍接触 0 ticks；|aY|max=44.714m/s²，pitchRate=0.650rad/s，rollRate=3.632rad/s，机械冲量=766.322N·s，requiredLength=[-14.092536102587053, Infinity]m，最大 XZ 跟踪偏差=0.102m。

- 入口/合流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.584°；扩展共享区最大高差=0.000m。30km/h 目标速度回放 11.40s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.024rad/s，机械冲量=0.000N·s，requiredLength=[0.26166645272511124, 0.370948860848573]m，最大 XZ 跟踪偏差=0.116m。

- 直接证据：拒绝原因：{"unreachable-layer-switch":127,"outside-suspension-reach":37,"invalid-suspension-projection":244}。

### system-central:W-to-S-right — COMPLEX / P0

- 问题位置：出口 s≈18–110m。
- 具体问题：前 60m 初始统计仅显示较小重叠高差，但扩大到后续主线子段后，车辆仍被上层主线支撑并撞外侧护栏，未正常转入下降匝道。
- 分类：BAD_PAVEMENT_JOIN + BROKEN_Y_CONNECTION + WRONG_SUPPORT_OWNERSHIP + BAD_GRADE_TRANSITION。
- 根因：只看直连父段会漏掉后续 split 子段。匝道下降与主线延续铺装冲突，s=17.942/62.944/68.476m 还有硬坡折。
- 建议修复方向：按完整 split 子段链联合复核该出口共享区；先解决下降与平面分离，再随道路重生成设施。
- 主体：长度 553.278m，最大纵坡 9.887%，5m 弦长口径最小半径 72.667m；≥4 个百分点坡折 4 处。短段 0 处；不将短段数量直接视为急弯。
- 主体坡折位置：s=17.942m（Δgrade=7.269pp）；s=62.944m（Δgrade=5.918pp）；s=68.476m（Δgrade=7.247pp）；s=223.627m（Δgrade=4.062pp）。

- 出口/分流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=1.151°；扩展共享区最大高差=4.929m。30km/h 目标速度回放 23.99s：路径完成=false，目标归属=false，最少接地轮=2，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 389 ticks；|aY|max=2.519m/s²，pitchRate=0.182rad/s，rollRate=0.743rad/s，机械冲量=0.000N·s，requiredLength=[0.22049758981875706, 0.4433682721069627]m，最大 XZ 跟踪偏差=1.722m。

- 入口/合流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.303°；扩展共享区最大高差=0.125m。30km/h 目标速度回放 11.40s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.024rad/s，机械冲量=0.000N·s，requiredLength=[0.26140707217794334, 0.3712166455799001]m，最大 XZ 跟踪偏差=0.115m。

- 直接证据：碰撞 collider：`ew-eb-split-3-split-split-2:barrier:43:1`、`ew-eb-split-3-split-split-2:barrier:44:1`、`ew-eb-split-3-split-split-2:barrier:45:1`、`ew-eb-split-3-split-split-2:barrier:46:1`。

## P1：逐条问题

### system-central:S-to-W-semi — BAD_GRADE_TRANSITION / P1

- 问题位置：主体 s=939.814m。
- 具体问题：两端连接和短回放通过；主体存在 6.665 个百分点硬坡折。
- 分类：BAD_GRADE_TRANSITION。
- 根因：相邻线性高程段纵坡未连续；并非缺少 roadLink 或端点错位。
- 建议修复方向：仅对该局部坡折设计纵向过渡，同时保持附近交叉净空；先保留端点。
- 主体：长度 1272.011m，最大纵坡 8.688%，5m 弦长口径最小半径 41.802m；≥4 个百分点坡折 1 处。短段 5 处；不将短段数量直接视为急弯。
- 主体坡折位置：s=939.814m（Δgrade=6.665pp）。

- 出口/分流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.395°；扩展共享区最大高差=0.001m。30km/h 目标速度回放 20.10s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.247m/s²，pitchRate=0.182rad/s，rollRate=0.020rad/s，机械冲量=0.000N·s，requiredLength=[0.2594266009618459, 0.37322077857824354]m，最大 XZ 跟踪偏差=0.087m。

- 入口/合流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.931°；扩展共享区最大高差=0.000m。30km/h 目标速度回放 10.50s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.025rad/s，机械冲量=0.000N·s，requiredLength=[0.2616664527251062, 0.3709488608485776]m，最大 XZ 跟踪偏差=0.119m。

### system-central:N-to-W-right — COMPLEX / P1

- 问题位置：合流前约 72m 至端点；主体 s=290.247/470.530m。
- 具体问题：合流端点对齐，但接近区仍有最高 6.263m 的上下铺装重叠，形成逐渐插入桥面式几何。此次从合流前 40m 开始的短回放可通过，不能据重叠高度直接声称断路。主体另有 4.818/6.278 个百分点坡折。
- 分类：BAD_PAVEMENT_JOIN + BAD_GRADE_TRANSITION。
- 根因：抬升阶段与主线平面重叠；端点同高掩盖了连接区几何问题。
- 建议修复方向：在单条合流喉部复核抬升位置、平面分离及桥面净空，局部处理坡折。保持当前能通过的端点。
- 主体：长度 488.227m，最大纵坡 11.500%，5m 弦长口径最小半径 167.657m；≥4 个百分点坡折 2 处。短段 0 处；不将短段数量直接视为急弯。
- 主体坡折位置：s=290.247m（Δgrade=4.818pp）；s=470.530m（Δgrade=6.278pp）。

- 出口/分流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.321°；扩展共享区最大高差=0.000m。30km/h 目标速度回放 19.90s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.020rad/s，机械冲量=0.000N·s，requiredLength=[0.25941452741760895, 0.37327058593039314]m，最大 XZ 跟踪偏差=0.089m。

- 入口/合流：端点 XZ gap=0.000000000m，ΔY=-0.000000000m，切线夹角=0.350°；扩展共享区最大高差=6.263m。30km/h 目标速度回放 12.40s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=1.711m/s²，pitchRate=0.204rad/s，rollRate=0.023rad/s，机械冲量=0.000N·s，requiredLength=[0.26044046357148537, 0.37502405300955194]m，最大 XZ 跟踪偏差=0.108m。

### system-central:W-to-N-semi — COMPLEX / P1

- 问题位置：合流前约 20–70m；主体 s≈215.799–843.566m。
- 具体问题：接近合流时匝道与北向主线同 XZ 区域高程不同；两端短回放可通过。主体存在 8 处 ≥4 个百分点坡折，最大 8.770 个百分点；短采样段需与真实曲率分开解释。
- 分类：BAD_PAVEMENT_JOIN + BAD_GRADE_TRANSITION。
- 根因：主线下降/匝道局部高程平台与大量线性高程控制段叠加；不是 connectionPort 缺失。
- 建议修复方向：单独评估合流前共享高程及主体局部坡折，保留主线和所有合法跨越净空；不全匝道重拟合。
- 主体：长度 1236.592m，最大纵坡 11.500%，5m 弦长口径最小半径 87.952m；≥4 个百分点坡折 8 处。短段 82 处；不将短段数量直接视为急弯。
- 主体坡折位置：s=215.799m（Δgrade=4.468pp）；s=255.000m（Δgrade=5.505pp）；s=303.786m（Δgrade=4.167pp）；s=375.000m（Δgrade=8.770pp）；s=570.000m（Δgrade=6.375pp）；s=585.000m（Δgrade=5.446pp）；s=600.000m（Δgrade=6.699pp）；s=843.566m（Δgrade=4.181pp）。

- 出口/分流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.591°；扩展共享区最大高差=0.000m。30km/h 目标速度回放 19.70s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.032rad/s，机械冲量=0.000N·s，requiredLength=[0.2567764947109223, 0.3759654782804263]m，最大 XZ 跟踪偏差=0.096m。

- 入口/合流：端点 XZ gap=0.000000000m，ΔY=-0.000000000m，切线夹角=0.332°；扩展共享区最大高差=1.010m。30km/h 目标速度回放 11.30s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.684m/s²，pitchRate=0.182rad/s，rollRate=0.026rad/s，机械冲量=0.000N·s，requiredLength=[0.2616664527251102, 0.3709488608485739]m，最大 XZ 跟踪偏差=0.122m。

## PASS：逐条结果

### system-central:S-to-E-right — PASS

- 问题位置：分流、主体、合流。
- 具体问题：本轮定点检查未发现 P0/P1。两端短回放均完成并达到正确支撑归属；主体最大纵坡变化低于 4 个百分点阈值。
- 分类：PASS。
- 根因：不适用。
- 建议修复方向：不修改。
- 主体：长度 517.614m，最大纵坡 10.451%，5m 弦长口径最小半径 131.402m；≥4 个百分点坡折 0 处。短段 11 处；不将短段数量直接视为急弯。
- 主体坡折位置：无 ≥4pp 坡折。

- 出口/分流：端点 XZ gap=0.000000000m，ΔY=0.000000000m，切线夹角=0.303°；扩展共享区最大高差=0.001m。30km/h 目标速度回放 20.00s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.273m/s²，pitchRate=0.183rad/s，rollRate=0.021rad/s，机械冲量=0.000N·s，requiredLength=[0.25937286650501384, 0.37338343982435035]m，最大 XZ 跟踪偏差=0.098m。

- 入口/合流：端点 XZ gap=0.000000000m，ΔY=-0.000000000m，切线夹角=0.804°；扩展共享区最大高差=0.000m。30km/h 目标速度回放 11.40s：路径完成=true，目标归属=true，最少接地轮=4，全轮离地 0 ticks，candidateCount=0 0 次，支撑拒绝 0 次，护栏/障碍接触 0 ticks；|aY|max=0.241m/s²，pitchRate=0.182rad/s，rollRate=0.024rad/s，机械冲量=0.000N·s，requiredLength=[0.2598776236211667, 0.37277631793095645]m，最大 XZ 跟踪偏差=0.113m。

## 完整结构与接口清单

命名匝道共 8 条：4 semi-direct + 4 right-turn；每条均同时有出口和入口两个接口。不是把 16 个接口重复计为 16 条匝道。追踪 4 条定向主线的 62 个作用域内派生道路，另保留边界/邻近道路作为查询上下文；不对其他互通发布诊断结论。

东西双向高架：EW-EB / EW-WB，约 +8m。南北双向主线：NS-NB / NS-SB，约 −8～−5m，是合法下穿层，不能因 XZ 近而连到高架。4 条主线均为单向 3 车道。

作用域内没有 authored highwayTransition acceleration/deceleration 道路；未发现漏枚举的同组第九条匝道，未发现从中心组直接连接地面/辅路的 roadLink。空间邻近辅路另列 ramp-inventory.json.nearbySurfaceRoads。没有 transition 元数据不等于设计合理：本轮记录“中心线分叉、无显式独立加减速段”，不虚构不存在的派生道路。

所有 16 个匝道接口 navigation edge 存在，laneConnections 也存在；没有相关 connectionPort。connectionPort 是 authoring 暴露端口，不是导航 edge 的必要条件，因此不把其缺省报成断路。

| ramp/corridor | from | to | parent mainline | child segments | entry/exit | topology connected | geometry connected | status |
|---|---|---|---|---|---|---|---|---|

| system-central:S-to-W-semi | ns-nb-split-3-split-split-split-split-split-section | ew-wb-split-split-split-split-4 | ns-nb → ew-wb | ns-nb-split-3-split-split-split-split-split-section<br>ns-nb-split-3-split-split-split-split-split-split<br>ew-wb-split-split-split<br>ew-wb-split-split-split-split-4 | start split / end merge | YES | endpoints PASS; body grade break | P1 BAD_GRADE_TRANSITION |

| system-central:S-to-E-right | ns-nb-split-2-split-2 | ew-eb-split-2-split-split-split-2 | ns-nb → ew-eb | ns-nb-split-2-split-2<br>ns-nb-split-2-split-2-split-2<br>ew-eb-split-2-split-split<br>ew-eb-split-2-split-split-split-2 | start split / end merge | YES | PASS |  PASS |

| system-central:E-to-S-semi | ew-wb-split-3-split-split-split-split | ns-sb-split-split-split-split | ew-wb → ns-sb | ew-wb-split-3-split-split-split-split<br>ew-wb-split-3-split-split-split-split-split<br>ns-sb-split-split-split-section<br>ns-sb-split-split-split-split | start split / end merge | YES | endpoint aligned; shared pavement conflict | P0 COMPLEX |

| system-central:E-to-N-right | ew-wb-split-2-split | ns-nb-split-split-2-split-2 | ew-wb → ns-nb | ew-wb-split-2-split<br>ew-wb-split-2-split-split-2<br>ns-nb-split-split-2<br>ns-nb-split-split-2-split-2 | start split / end merge | YES | endpoint aligned; shared pavement conflict | P0 COMPLEX |

| system-central:N-to-E-semi | ns-sb-split-3-split-split-split-section | ew-eb-split-split-5 | ns-sb → ew-eb | ns-sb-split-3-split-split-split-section<br>ns-sb-split-3-split-split-split-split<br>ew-eb-split<br>ew-eb-split-split-5 | start split / end merge | YES | endpoint aligned; shared pavement conflict | P0 COMPLEX |

| system-central:N-to-W-right | ns-sb-split-2-split | ew-wb-split-split-split-3-split | ns-sb → ew-wb | ns-sb-split-2-split<br>ns-sb-split-2-split-split-2<br>ew-wb-split-split-split-3<br>ew-wb-split-split-split-3-split | start split / end merge | YES | endpoint aligned; shared pavement conflict | P1 COMPLEX |

| system-central:W-to-N-semi | ew-eb-split-4-split-split-section | ns-nb-split-split-split | ew-eb → ns-nb | ew-eb-split-4-split-split-section<br>ew-eb-split-4-split-split-split<br>ns-nb-split-split<br>ns-nb-split-split-split | start split / end merge | YES | endpoint aligned; shared pavement conflict | P1 COMPLEX |

| system-central:W-to-S-right | ew-eb-split-3-split | ns-sb-split-split-split-3-split | ew-eb → ns-sb | ew-eb-split-3-split<br>ew-eb-split-3-split-split-4<br>ns-sb-split-split-split-3<br>ns-sb-split-split-split-3-split | start split / end merge | YES | endpoint aligned; shared pavement conflict | P0 COMPLEX |

| ew-eb | ew-eb 上游边界 | ew-eb 下游边界 | ew-eb | ew-eb-split<br>ew-eb-split-2<br>ew-eb-split-2-split<br>ew-eb-split-3<br>ew-eb-split-2-split-split<br>ew-eb-split-2-split-split-split<br>ew-eb-split-3-split<br>ew-eb-split-3-split-split<br>ew-eb-split-2-split-split-split-2<br>ew-eb-split-split-5<br>ew-eb-split-4-split-split-split<br>ew-eb-split-3-split-split-2<br>ew-eb-split-3-split-split-3<br>ew-eb-split-3-split-split-4<br>ew-eb-split-4-split-split-section<br>ew-eb-split-4-split-split-section-2 | through / split / merge | YES（显式子段链接） | 子段 link XYZ 已核验；共享区见逐匝道结论 | MAINLINE CONTEXT |

| ew-wb | ew-wb 上游边界 | ew-wb 下游边界 | ew-wb | ew-wb-split<br>ew-wb-split-split<br>ew-wb-split-2<br>ew-wb-split-split-split<br>ew-wb-split-3-split-split-split-split<br>ew-wb-split-split-split-2<br>ew-wb-split-2-split<br>ew-wb-split-2-split-split<br>ew-wb-split-split-split-3<br>ew-wb-split-split-split-2-v6<br>ew-wb-split-split-split-split-4<br>ew-wb-split-3-split-split-split-split-split<br>ew-wb-split-2-split-split-2<br>ew-wb-split-split-split-3-split<br>ew-wb-split-split-split-split-4-section | through / split / merge | YES（显式子段链接） | 子段 link XYZ 已核验；共享区见逐匝道结论 | MAINLINE CONTEXT |

| ns-nb | ns-nb 上游边界 | ns-nb 下游边界 | ns-nb | ns-nb-split<br>ns-nb-split-2<br>ns-nb-split-split<br>ns-nb-split-2-split<br>ns-nb-split-2-split-2<br>ns-nb-split-2-split-2-split<br>ns-nb-split-split-2<br>ns-nb-split-split-2-split<br>ns-nb-split-split-2-split-v6<br>ns-nb-split-3-split-split-split-split-split-split<br>ns-nb-split-2-split-2-split-2<br>ns-nb-split-split-2-split-2<br>ns-nb-split-split-split<br>ns-nb-split-3-split-split-split-split-split-split-section<br>ns-nb-split-3-split-split-split-split-split-section<br>ns-nb-split-3-split-split-split-split-split-section-2 | through / split / merge | YES（显式子段链接） | 子段 link XYZ 已核验；共享区见逐匝道结论 | MAINLINE CONTEXT |

| ns-sb | ns-sb 上游边界 | ns-sb 下游边界 | ns-sb | ns-sb-split<br>ns-sb-split-split<br>ns-sb-split-2<br>ns-sb-split-split-split<br>ns-sb-split-split-split-2<br>ns-sb-split-2-split<br>ns-sb-split-2-split-split<br>ns-sb-split-split-split-3<br>ns-sb-split-split-split-split<br>ns-sb-split-3-split-split-split-split<br>ns-sb-split-2-split-split-2<br>ns-sb-split-split-split-3-split<br>ns-sb-split-split-split-section<br>ns-sb-split-3-split-split-split-section<br>ns-sb-split-split-split-split-section | through / split / merge | YES（显式子段链接） | 子段 link XYZ 已核验；共享区见逐匝道结论 | MAINLINE CONTEXT |

### 派生道路逐段清单

本表覆盖所有 62 个主线子段。parent 为审计归类，不是额外的物理道路父子对象。机器文件保留每段全部直接 roadLinks。

| road id | parent | authored role | linked neighbours |
|---|---|---|---|

| ns-nb-split | ns-nb | mainline split/merge child | ns-nb-split-2-split<br>ns-nb-split-split-2 |

| ew-wb-split | ew-wb | mainline split/merge child | ew-wb-split-2-split-split<br>ew-wb-split-split |

| ns-nb-split-2 | ns-nb | mainline split/merge child | ns-nb-split-3-split-split-split-split-split-split-section<br>ns-nb-split-2-split-2 |

| ew-eb-split | ew-eb | mainline split/merge child | ew-eb-split-2-split-split-split<br>ew-eb-split-split-5 |

| ew-wb-split-split | ew-wb | mainline split/merge child | ew-wb-split<br>ew-wb-split-split-split-3 |

| ns-sb-split | ns-sb | mainline split/merge child | ns-sb-split-2-split-split<br>ns-sb-split-split |

| ew-wb-split-2 | ew-wb | mainline split/merge child | ew-wb-split-3-split-split-split-split-split<br>ew-wb-split-2-split |

| ns-nb-split-split | ns-nb | mainline split/merge child | ns-nb-split-split-2-split-v6<br>ns-nb-split-split-split |

| ns-sb-split-split | ns-sb | mainline split/merge child | ns-sb-split<br>ns-sb-split-split-split-3 |

| ew-eb-split-2 | ew-eb | mainline split/merge child | ew-eb-split-3-split-split<br>ew-eb-split-2-split |

| ns-sb-split-2 | ns-sb | mainline split/merge child | ns-sb-split-3-split-split-split-split<br>ns-sb-split-2-split |

| ew-wb-split-split-split | ew-wb | mainline split/merge child | ew-wb-split-split-split-2-v6<br>ew-wb-split-split-split-split-4 |

| ew-eb-split-2-split | ew-eb | mainline split/merge child | ew-eb-split-2<br>ew-eb-split-2-split-split |

| ns-nb-split-2-split | ns-nb | mainline split/merge child | ns-nb-split<br>ns-nb-split-2-split-2-split |

| ew-eb-split-3 | ew-eb | mainline split/merge child | ew-eb-split-4-split-split-split<br>ew-eb-split-3-split |

| ns-sb-split-split-split | ns-sb | mainline split/merge child | ns-sb-split-split-split-2<br>ns-sb-split-split-split-section |

| ew-wb-split-3-split-split-split-split | ew-wb | mainline split/merge child | ew-wb-split-3-split-split-split-split-2<br>ew-wb-split-3-split-split-split-split-split<br>system-central:E-to-S-semi |

| ns-nb-split-2-split-2 | ns-nb | mainline split/merge child | ns-nb-split-2<br>ns-nb-split-2-split-2-split-2<br>system-central:S-to-E-right |

| ew-wb-split-split-split-2 | ew-wb | mainline split/merge child | ew-wb-split-split-split-3-split<br>ew-wb-split-split-split-2-v6 |

| ns-nb-split-2-split-2-split | ns-nb | mainline split/merge child | ns-nb-split-2-split<br>ns-nb-split-2-split-2-split-2 |

| ew-eb-split-2-split-split | ew-eb | mainline split/merge child | ew-eb-split-2-split<br>ew-eb-split-2-split-split-split-2 |

| ew-wb-split-2-split | ew-wb | mainline split/merge child | ew-wb-split-2<br>ew-wb-split-2-split-split-2<br>system-central:E-to-N-right |

| ns-sb-split-split-split-2 | ns-sb | mainline split/merge child | ns-sb-split-split-split<br>ns-sb-split-split-split-3-split |

| ew-wb-split-2-split-split | ew-wb | mainline split/merge child | ew-wb-split<br>ew-wb-split-2-split-split-2 |

| ns-nb-split-split-2 | ns-nb | mainline split/merge child | ns-nb-split<br>ns-nb-split-split-2-split-2 |

| ns-sb-split-2-split | ns-sb | mainline split/merge child | ns-sb-split-2<br>ns-sb-split-2-split-split-2<br>system-central:N-to-W-right |

| ew-eb-split-2-split-split-split | ew-eb | mainline split/merge child | ew-eb-split<br>ew-eb-split-2-split-split-split-2 |

| ns-sb-split-2-split-split | ns-sb | mainline split/merge child | ns-sb-split<br>ns-sb-split-2-split-split-2 |

| ew-wb-split-split-split-3 | ew-wb | mainline split/merge child | ew-wb-split-split<br>ew-wb-split-split-split-3-split |

| ew-eb-split-3-split | ew-eb | mainline split/merge child | ew-eb-split-3<br>ew-eb-split-3-split-split-4<br>system-central:W-to-S-right |

| ns-nb-split-split-2-split | ns-nb | mainline split/merge child | ns-nb-split-split-2-split-2<br>ns-nb-split-split-2-split-v6 |

| ew-eb-split-3-split-split | ew-eb | mainline split/merge child | ew-eb-split-2<br>ew-eb-split-3-split-split-2 |

| ns-sb-split-split-split-3 | ns-sb | mainline split/merge child | ns-sb-split-split<br>ns-sb-split-split-split-3-split |

| ns-nb-split-split-2-split-v6 | ns-nb | mainline split/merge child | ns-nb-split-split<br>ns-nb-split-split-2-split |

| ew-wb-split-split-split-2-v6 | ew-wb | mainline split/merge child | ew-wb-split-split-split<br>ew-wb-split-split-split-2 |

| ns-nb-split-3-split-split-split-split-split-split | ns-nb | mainline split/merge child | ns-nb-split-3-split-split-split-split-split-section<br>ns-nb-split-3-split-split-split-split-split-split-section |

| ew-wb-split-split-split-split-4 | ew-wb | mainline split/merge child | ew-wb-split-split-split<br>system-central:S-to-W-semi<br>ew-wb-split-split-split-split-4-section |

| ns-nb-split-2-split-2-split-2 | ns-nb | mainline split/merge child | ns-nb-split-2-split-2-split<br>ns-nb-split-2-split-2 |

| ew-eb-split-2-split-split-split-2 | ew-eb | mainline split/merge child | ew-eb-split-2-split-split-split<br>ew-eb-split-2-split-split<br>system-central:S-to-E-right |

| ew-wb-split-3-split-split-split-split-split | ew-wb | mainline split/merge child | ew-wb-split-2<br>ew-wb-split-3-split-split-split-split |

| ns-sb-split-split-split-split | ns-sb | mainline split/merge child | ns-sb-split-split-split-section<br>system-central:E-to-S-semi<br>ns-sb-split-split-split-split-section |

| ew-wb-split-2-split-split-2 | ew-wb | mainline split/merge child | ew-wb-split-2-split-split<br>ew-wb-split-2-split |

| ns-nb-split-split-2-split-2 | ns-nb | mainline split/merge child | ns-nb-split-split-2-split<br>ns-nb-split-split-2<br>system-central:E-to-N-right |

| ns-sb-split-3-split-split-split-split | ns-sb | mainline split/merge child | ns-sb-split-2<br>ns-sb-split-3-split-split-split-section |

| ew-eb-split-split-5 | ew-eb | mainline split/merge child | ew-eb-split-split-4<br>ew-eb-split<br>system-central:N-to-E-semi |

| ns-sb-split-2-split-split-2 | ns-sb | mainline split/merge child | ns-sb-split-2-split-split<br>ns-sb-split-2-split |

| ew-wb-split-split-split-3-split | ew-wb | mainline split/merge child | ew-wb-split-split-split-2<br>ew-wb-split-split-split-3<br>system-central:N-to-W-right |

| ew-eb-split-4-split-split-split | ew-eb | mainline split/merge child | ew-eb-split-3<br>ew-eb-split-4-split-split-section |

| ns-nb-split-split-split | ns-nb | mainline split/merge child | ns-nb-split-split<br>system-central:W-to-N-semi<br>system-north:feeder-1 |

| ew-eb-split-3-split-split-2 | ew-eb | mainline split/merge child | ew-eb-split-3-split-split<br>ew-eb-split-3-split-split-3 |

| ns-sb-split-split-split-3-split | ns-sb | mainline split/merge child | ns-sb-split-split-split-2<br>ns-sb-split-split-split-3<br>system-central:W-to-S-right |

| ew-eb-split-3-split-split-3 | ew-eb | mainline split/merge child | ew-eb-split-3-split-split-2<br>ew-eb-split-3-split-split-4 |

| ew-eb-split-3-split-split-4 | ew-eb | mainline split/merge child | ew-eb-split-3-split-split-3<br>ew-eb-split-3-split |

| ns-sb-split-split-split-section | ns-sb | mainline split/merge child | ns-sb-split-split-split-split<br>ns-sb-split-split-split |

| ns-nb-split-3-split-split-split-split-split-split-section | ns-nb | mainline split/merge child | ns-nb-split-2<br>ns-nb-split-3-split-split-split-split-split-split |

| ew-eb-split-4-split-split-section | ew-eb | mainline split/merge child | ew-eb-split-4-split-split-split<br>system-central:W-to-N-semi<br>ew-eb-split-4-split-split-section-2 |

| ew-wb-split-split-split-split-4-section | ew-wb | mainline split/merge child | ew-wb-split-split-split-split-4<br>ew-wb-split-split-split-split-4-section-section<br>access-ew-west-wb-off |

| ns-sb-split-3-split-split-split-section | ns-sb | mainline split/merge child | ns-sb-split-3-split-split-split-split<br>system-central:N-to-E-semi<br>ns-sb-split-3-split-split-split-section-2 |

| ns-sb-split-split-split-split-section | ns-sb | mainline split/merge child | ns-sb-split-split-split-split<br>ns-sb-split-split-split-split-section-section<br>v91-ns-sb-off |

| ns-nb-split-3-split-split-split-split-split-section | ns-nb | mainline split/merge child | ns-nb-split-3-split-split-split-split-split-split<br>system-central:S-to-W-semi<br>ns-nb-split-3-split-split-split-split-split-section-2 |

| ew-eb-split-4-split-split-section-2 | ew-eb | mainline split/merge child | ew-eb-split-4-split-split-section<br>ew-eb-split-4-split-split<br>access-ew-west-eb-on |

| ns-nb-split-3-split-split-split-split-split-section-2 | ns-nb | mainline split/merge child | ns-nb-split-3-split-split-split-split-split-section<br>ns-nb-split-3-split-split-split-split-split<br>v91-ns-nb-on |

### 跨主线子段的共享区域

范围为距离匝道接口的米数，按 2m 采样；阈值为高差 >4cm。它是冲突 footprint 范围，不是已确认可安全共用的铺装范围。

| ramp | end | 冲突距离范围 m | 采样最大高差 m | 左右轮迹冲突采样数 |
|---|---|---|---|---|

| S-to-W-semi | start | 无 | 0.001 | 0 |

| S-to-W-semi | end | 无 | 0.000 | 0 |

| S-to-E-right | start | 无 | 0.001 | 0 |

| S-to-E-right | end | 无 | 0.000 | 0 |

| E-to-S-semi | start | 8–116 | 5.991 | 93 |

| E-to-S-semi | end | 16–138 | 0.570 | 103 |

| E-to-N-right | start | 4–78 | 3.538 | 66 |

| E-to-N-right | end | 无 | 0.000 | 0 |

| N-to-E-semi | start | 36–82 | 0.772 | 38 |

| N-to-E-semi | end | 无 | 0.000 | 0 |

| N-to-W-right | start | 无 | 0.000 | 0 |

| N-to-W-right | end | 4–72 | 6.263 | 62 |

| W-to-N-semi | start | 无 | 0.000 | 0 |

| W-to-N-semi | end | 8–138 | 1.010 | 111 |

| W-to-S-right | start | 12–84 | 4.929 | 63 |

| W-to-S-right | end | 18–92 | 0.125 | 66 |

## 接口测量：XZ、边缘、Y 和纵坡

边缘 gap 是匝道端横断面边缘到主线端横断面线段的距离，不能代替整个共享区检查；本轮也检查实际运行 footprint 和渲染三角面。纵坡均沿行驶方向，以百分数表示；pp 为百分点。表中 5/10/20/40m 是从该接口向道路内部量取的平均纵坡。

| ramp | end | XZ gap m | ΔY m | tangent ° | lane-edge / pavement-edge gap m | ramp grade % 5/10/20/40 | main grade % 5/10/20/40 | instantaneous grade break pp |
|---|---|---|---|---|---|---|---|---|

| S-to-W-semi | start | 0.000000000 | 0.000000000 | 0.395 | 0.000000000 / 0.000000000 | 0.268/0.272/0.285/0.312 | 0.248/0.242/0.229/0.201 | 0.020 |

| S-to-W-semi | end | 0.000000000 | 0.000000000 | 0.931 | 0.000000000 / 0.000000000 | 0.000/-0.000/-0.000/0.000 | 0.000/0.000/0.000/0.000 | 0.000 |

| S-to-E-right | start | 0.000000000 | 0.000000000 | 0.303 | 0.000000000 / 0.000000000 | 0.248/0.238/0.227/0.201 | 0.266/0.272/0.285/0.311 | 0.018 |

| S-to-E-right | end | 0.000000000 | -0.000000000 | 0.804 | 0.000000000 / 0.000000000 | -0.000/-0.000/-0.000/-0.000 | 0.000/0.000/0.000/0.000 | 0.000 |

| E-to-S-semi | start | 0.000000000 | 0.000000000 | 0.524 | 0.000000000 / 0.000000000 | -0.512/-0.520/-1.141/-4.347 | 0.000/0.000/0.000/0.000 | 0.512 |

| E-to-S-semi | end | 0.000000000 | 0.000000000 | 0.644 | 0.000000000 / 0.000000000 | 0.000/0.000/0.000/0.000 | -0.248/-0.242/-0.229/-0.201 | 0.248 |

| E-to-N-right | start | 0.000000000 | 0.000000000 | 0.804 | 0.000000000 / 0.000000000 | 1.612/1.647/1.827/-1.052 | 0.000/0.000/0.000/0.000 | 1.612 |

| E-to-N-right | end | 0.000000000 | 0.000000000 | 0.304 | 0.000000000 / 0.000000000 | 0.000/0.000/0.000/0.000 | 0.000/0.000/0.000/0.000 | 0.000 |

| N-to-E-semi | start | 0.000000000 | 0.000000000 | 0.740 | 0.000000000 / 0.000000000 | -1.120/-1.120/-1.119/-0.625 | 1.269/1.269/1.310/1.472 | 2.389 |

| N-to-E-semi | end | 0.000000000 | 0.000000000 | 0.584 | 0.000000000 / 0.000000000 | 0.000/0.000/-0.000/-0.000 | 0.000/0.000/0.000/0.000 | 0.000 |

| N-to-W-right | start | 0.000000000 | 0.000000000 | 0.321 | 0.000000000 / 0.000000000 | 0.000/0.000/0.000/0.000 | 0.000/0.000/0.000/0.000 | 0.000 |

| N-to-W-right | end | 0.000000000 | -0.000000000 | 0.350 | 0.000000000 / 0.000000000 | 1.072/1.126/2.405/6.459 | 0.000/0.000/0.000/0.000 | 1.072 |

| W-to-N-semi | start | 0.000000000 | 0.000000000 | 0.591 | 0.000000000 / 0.000000000 | 0.000/0.000/0.000/0.000 | 0.000/0.000/0.000/0.000 | 0.000 |

| W-to-N-semi | end | 0.000000000 | -0.000000000 | 0.332 | 0.000000000 / 0.000000000 | 0.786/0.268/0.007/-0.000 | -1.264/-1.274/-1.312/-1.474 | 2.383 |

| W-to-S-right | start | 0.000000000 | 0.000000000 | 1.151 | 0.000000000 / 0.000000000 | -0.441/-0.383/-1.245/-4.861 | 0.000/0.000/0.000/0.000 | 0.459 |

| W-to-S-right | end | 0.000000000 | 0.000000000 | 0.303 | 0.000000000 / 0.000000000 | 0.000/0.000/0.000/0.000 | -0.266/-0.272/-0.285/-0.311 | 0.266 |

### 铺装和支撑判读

- 每个接口采样 center、左右轮迹（±0.835m）、车道左右边缘和 pavement 左右边缘；完整数据在 pavement-support-audit.json。进一步沿接口 140m、跨所有主线 split 子段追踪，见 join-extended-support.json。
- 主体每 2m 对中心、左右轮迹和车道边缘作精确 footprint 查询，见 ramp-body-geometry.json。端点附近少量“匝道自身无 candidate”都由同高主线铺装接管；未发现整片 candidateCount=0 的断路，不能把 ownSupport=0 直接当成路面缺失。
- 未发现 endpoint XZ 缺口、反向接入或大切线角；最大接口切线约 1.152°。真实问题集中在共享区域 Y 分离、支撑归属及主体坡折。
- 平面相交且无 roadLink 的跨越只作为空间上下文；没有新增 graph edge，也不根据 XZ 强连上下层。主体 samples 中的 unlinked 重叠是待解释的空间候选，未全部提升为连接缺陷。
- ribbon 道路的物理支撑和可视铺装使用同一 RoadEdgeChain 三角面；非 ribbon 的物理支撑使用 capsule/segment-plane，可视铺装使用 mitered ribbon。零端点缝隙不能证明共享区的两个面等高。
- BAD_GRADE_TRANSITION 使用现有 seam 审计 0.04（4pp）阈值记录主体硬坡折。它是可复查的几何诊断，不是未跑的高速整段驾驶体验结论。

## P2 与设施后续

没有批量移动任何设施。3 条出口的主线护栏封堵已并入 P0，而非降级成美化问题。

| ramp | road-owned signs | base Y outliers >0.25m | generated lamps | generated piers | confirmed blocking collider count |
|---|---|---|---|---|---|

| S-to-W-semi | 5 | 1 | 0 | 8 | 0 |

| S-to-E-right | 4 | 1 | 0 | 4 | 0 |

| E-to-S-semi | 5 | 0 | 0 | 9 | 6 |

| E-to-N-right | 5 | 0 | 0 | 2 | 5 |

| N-to-E-semi | 5 | 0 | 0 | 11 | 0 |

| N-to-W-right | 4 | 0 | 0 | 1 | 0 |

| W-to-N-semi | 5 | 2 | 0 | 5 | 0 |

| W-to-S-right | 4 | 0 | 0 | 0 | 4 |

标牌位置、投影 station、基座相对道路高差、主线标牌及相关物件 ID 均在 facility-followup.json。基座高差是位置关联异常提示，未做完整支架/门架净空视觉验收，不能把所有 outlier 自动当成已确认 P2。gore、merge divider 和裁剪护栏依赖共享面高度；道路修复后需统一重投影/重生成。没有发现可由本轮短回放证实的路灯/门架直接碰撞；这不等于全设施通过。

## 验证与范围

- targeted geometry：8 条主体、16 个接口、62 个主线子段；完成。几何问题如实保留，未把“诊断执行完成”记为“地图通过”。
- targeted navigation：16 个接口、58 个主线子段显式 link；PASS，见 navigation-targeted.json。
- targeted short replay：16/16 执行完成；12 条接口路径完成，4 条失败。PASS 还要求实际接地和正确层/归属，不能只看 completed 或 targetOwnershipReached。
- typecheck：pnpm run typecheck，退出码 0（见 validation.json）。
- 未运行全图 ramp/smoothness/median/设施、full core、全车型、editor 全量或长时间 UI 驾驶。未修改游戏代码/地图，按本轮要求未运行 build，dist 未重建。

回放采用现有 roadSUV，固定 120Hz；各接口从上游约 40m 开始（短父段只能从其起点开始，真实 joinStation 已记录），分流后最多 110m/合流后最多 45m，30km/h 是速度控制目标。原区域地形、路面查询、支撑选择、悬挂和碰撞逻辑均保留；只关闭图形扇区发布。起始一次设置速度和高程初值，之后仅转向/油门/制动，未强制设置 pose/Y 或吸附路面。出现持续全轮离地时提前停止。

限制：未做整条匝道连续物理驾驶；主体以几何/坡折采样检查。失败回放是一条明确控制路径的可复现实证，不声称已穷尽所有可能驾驶路径。P1 的高速舒适性与设施视觉效果由后续人工评估。本轮先记录问题，未顺手修改结构性问题。

## 产物

- [ramp-inventory.json](ramp-inventory.json)：完整匝道/主线/派生段与邻近辅路。
- [connection-audit.json](connection-audit.json)：roadLinks、端点簇、导航、接口 XZ/边缘/切线。
- [elevation-audit.json](elevation-audit.json)：高差、5/10/20/40m 纵坡及完整主体 profile。
- [pavement-support-audit.json](pavement-support-audit.json)：逐接口多轮迹/边缘与精确重叠 polygon。
- [join-extended-support.json](join-extended-support.json)：跨 split 子段的共享区延伸测量。
- [ramp-body-geometry.json](ramp-body-geometry.json)：主体 2m 采样和控制点坡折。
- [runtime-short-replay.json](runtime-short-replay.json)：16 条短回放、逐轮支撑/拒绝/悬挂/动力学记录。
- [facility-followup.json](facility-followup.json)：护栏证据和道路修复后的设施清单。
- [navigation-targeted.json](navigation-targeted.json)：定点导航与主线子段链接校验。
- [conclusions.json](conclusions.json)：逐条结论与互斥严重度统计。
- [validation.json](validation.json)：实际执行结果与未执行范围。

复现：从仓库根执行 `node artifacts/system-central-ramp-audit/run.mjs`，随后 `node artifacts/system-central-ramp-audit/finalize.mjs`。脚本不写源地图，所有输出限定此目录。
