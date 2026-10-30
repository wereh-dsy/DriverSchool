# Koenigsegg Jesko Attack 实现与专项审核

日期：2026-10-29。入口 ID：`koenigsegg-jesko-attack`，已接入菜单及 F5 车型循环；菜单显示 `9LST / 955 kW / RWD`。本次只运行车型专项、类型检查和独立目录 Vite 构建，未运行正式 `pnpm run build`、全量套件或 release，未更新 `dist`。

## 参数依据与工程估值

公开基准：[Koenigsegg Jesko Attack 官方技术规格](https://www.koenigsegg.com/technical-specifications-jesko-attack)。LST 任意挡位切换的结构依据：[Koenigsegg 官方 LST 说明](https://mb.cision.com/Public/18511/3630153/9cf13c0baa73386a.pdf)。原厂没有提供本项目需要的完整发动机曲线、齿比、轮端刚度、气动平衡及热保护图，以下明确区分参考规格与独立估值。

| 项目 | 本次实现 | 依据/解释 |
| --- | --- | --- |
| 发动机 | 5.0 L、90° V8、双涡轮、8500 rpm 红线 | 官方结构；平面曲轴以均匀点火、高转惯量与声音谐波近似 |
| 汽油输出 | 净 955.003 kW @ 7800 rpm，净 1500 N·m @ 5100 rpm | 按本次需求同时采用两项输出锚点；属于工程曲线，不声称原厂汽油 ECU 曲线 |
| 曲线定义 | 1524 N·m / 1193.18 N·m 燃烧扭矩，始终减去 24 N·m 机械损失 | 对应上述两项净输出；高转扭矩下降，避免 1500 N·m 延伸到红线造成超功率 |
| 涡轮 | 最大绝对压比 2.7；标定稳态表压约 1.53–1.59 bar | 官方 1.7 bar 作为硬件参考；现有压气/进气消耗模型令实际歧管压力低于上限，基础扭矩曲线与之配套 |
| LST | 独立多离合传动后端，直接跨挡、30 ms 名义交接 | 不安装 DCT 奇偶轴或两速后端；120 Hz 下观测交接约 33.3 ms，转速同步仍需物理负载作用 |
| 齿比 / 主减速 | 4.71 / 3.53 / 2.65 / 2.19 / 1.77 / 1.48 / 1.24 / 1.08 / 0.88；2.77 | 独立工程估值，非原厂数据；传动效率 0.94；一挡红线约 88.4 km/h，九挡约 473 km/h，仅是运动学上限 |
| 质量 / 几何 | 初始 1420 kg；轴距 2.700 m、长宽高 4.626 / 2.030 / 1.210 m | 官方外廓；1375.3 kg 基础质量 + 60 L × 0.745 kg/L 燃油，燃油消耗后质量正常下降 |
| 质量布局 | 前轴 43%，CG 高 0.36 m，偏航惯量 1730 kg·m²，后驱 | 独立中置布局估值；后轴 LSD + 原有制动式电子差速功能 |
| 轮胎 | 前 265 mm / 后 325 mm，20/21 英寸轮毂；共同 0.360 m 有效半径 | 宽度/轮毂参照官方；现有求解器共用半径，明确不伪装成完整前后独立自由半径模型 |
| 抓地 | 干地纵向 μ 1.40、横向 μ 1.45，载荷敏感度 0.085 | Cup 类赛道公路胎工程估值；前/后轴侧偏刚度 108/146 kN/rad，未使用胎宽或气动抓地倍率 |
| 悬架 | 前后双叉臂，轮端弹簧 105/140 kN/m，独立压缩/回弹阻尼 | 推杆运动比、气液支撑及 Triplex 的总体效果折算为轮端刚度、阻尼和渐进限位；未实现第三减振器的独立运动学 |
| 制动 | 前/后最大轮端 5800/4200 N·m，初始前偏 0.58 | 410/395 mm 碳陶盘外观参照官方，制动力矩为工程估值；ABS 保留最终调压权 |

发动机惯量 0.19 kg·m²、节气门建立/释放 13/20 s⁻¹；全负荷曲线和动态涡轮共同决定燃烧扭矩。LST 以有限容量 1900 N·m 的等效摩擦耦合传递动力，使用现有隐式双惯量负载计算，不指定发动机 RPM 或车辆加速度。换挡控制共用已有决策器，LST 执行机构独立；可跳过多个挡位，没有奇偶轴预选惩罚。新增可选道路耦合转速条件，仅 Jesko 启用，防止后轮打滑造成连续抢升挡。

ABS/TCS/ESC 均安装且默认启用，仍受既有用户偏好控制。Jesko 使用独立电控配置，TCS 在真实滑移后通过燃烧转矩与制动请求介入，没有常驻马力封顶。20 s 全油门测试热转矩系数保持 1。

## 空气动力流程

`activeAero` 是旧 `activeSpoiler` 的互斥替代。此配置的前后轴系数已经包含前部装置、底板、扩散器与后翼的总效果；旧固定 Cl 设为零，运行时只走一条气动计算路径。

- 相对空气速度决定动压；车速、制动和横向加速度决定执行器请求。60–170 km/h 使用连续 smoothstep 部署曲线，执行器采用 3 s⁻¹ 一阶响应。
- 收起状态仍保留 72% 的参考垂向系数，表示固定底板和扩散器，并非将全部下压力交给尾翼。
- 曲线在 200/250/290/350 km/h 使用部署状态约 440/700/1000/1400 kgf 的工程锚点。100 km/h 完全部署参考值 105 kgf；普通稳态实际部署不足，实测约 84.4 kgf。
- 前轴气动份额由 43% 平滑过渡至 44%；Cd 约 0.42–0.50，制动时平滑增加最多 0.16。总垂向力封顶 1400 kgf，该上限不会直接用于低速。
- 垂向力经原有 ChassisDynamics / SuspensionSystem 进入真实轮荷、压缩与俯仰。没有额外轮胎 μ 或抓地系数乘法。
- 尾翼和前部翻板显示直接借用物理执行器部署值。当前单一部署遥测不单独显示制动增阻角；制动增阻在物理模型中有独立平滑状态。

## 120 Hz 专项实测

可复现入口：[专项脚本](../scripts/run-jesko-attack-selftests.ts)，机器可读记录：[selftest-results.json](../artifacts/jesko-attack/selftest-results.json)。正常平地、初始燃油 60 L、默认开启电控，未以临时关闭电控取得性能结果。引擎功率台架固定 RPM；轴荷台架使用显式外力抵消纵向阻力并稳速，均不当作道路加速成绩。

| 检查 | 实测/结果 |
| --- | --- |
| 专项断言 | 38624 次通过，`errors: []`；多数断言是每固定步的状态健康检查，不代表同等数量的独立场景 |
| 0–100 / 0–200 km/h | 3.625 / 6.683 s，从静止开始，无 rollout |
| 20 s 全油门 | 370.646 km/h；这是测试终点速度，未验证稳态极速 |
| 连续升挡 | 1→2→3→4→5→6→7→8→9，无反向换挡反复；最高实际转速 8648 rpm，未达到 8800 rpm 数值上限 |
| 轻油门 / 倒车 | 16% 油门 8 s 后 11.97 km/h、未熄火；R 挡产生真实负向车速 |
| 后轮牵引 | 前轮驱动转矩始终 0；20–100 km/h 平均最大后轮滑移率约 0.286；20 km/h 以上滑移超过 0.5 累计 0.325 s |
| 200–0 km/h | 3.792 s / 99.846 m；ABS 活跃 419 固定步，自动降挡 5 次 |
| LST / 安全联锁 | 多挡直跳约 33.3 ms；超转降挡、行驶中 P/R 拒绝；轮端转矩与等效齿比、主减速、损耗一致 |
| 高速转向 | 初始 250 km/h，过程中约 216–250 km/h；最大侧偏角 0.0326 rad、侧倾 0.0137 rad，前轴左右轮荷差最大约 2504 N |
| 连续变线 | 初始 250 km/h，过程中约 217–250 km/h；最大侧偏角 0.0299 rad、侧倾 0.0125 rad，前轴左右轮荷差最大约 2307 N |
| 数值健康 | 道路加速、制动、倒车、轴荷及高速转向场景均无 invalid-state recovery，底盘 safetyInterventions 为 0 |
| 热预算 | 40°C 环境、10 m/s 冷却风、600 s 热负荷台架：约 134.69°C / 0.488 转矩系数；随后 20°C 环境无负载冷却至约 31.35°C |
| 外观结构 | 外廓、全展开尾翼高度、轮位、前后胎宽配置、实例材质隔离、双座、正前方视线及中央转速/挡位表可见性通过 |
| 音频 | 7800 rpm 点火频率 520 Hz；涡轮音量随真实增压压力变化，换挡与松油门沿用实际 RPM/负载变化 |

实际轮荷（包括燃油质量随台架怠速的微小变化）：

| 车速 km/h | 下压力 kgf | 前轴法向力 N | 后轴法向力 N |
| --- | ---: | ---: | ---: |
| 0 | 0 | 5990 | 7940 |
| 100 | 84.43 | 6373 | 8385 |
| 200 | 440.00 | 7878 | 10367 |
| 250 | 700.00 | 8979 | 11816 |
| 290 | 999.99 | 10346 | 13391 |
| 350 | 1399.99 | 12077 | 15582 |
| 420（台架） | 1400.00 | 12077 | 15582 |

各轴法向力之和与车重加气动下压力的误差小于 3 N；420 km/h 仅用于上限验证，不是动力测试达到的极速。

开发中专项曾检出新 LST 被旧运行时类型保护拒绝、打滑导致抢升挡/反复、静态外廓和展开尾翼高度超限；均修正后复测，未放宽这些断言。

## 修改文件

新增的车型/专用模块：

- `src/vehicle/config/jeskoAttackPhysicsConfig.ts`
- `src/vehicle/visual/JeskoAttackVisualConfig.ts`
- `src/vehicle/visual/JeskoAttackExterior.ts`
- `src/vehicle/visual/JeskoAttackCabin.ts`
- `src/audio/JeskoAttackAudioProfile.ts`
- `src/vehicle/transmission/LightSpeedTransmission.ts`
- `src/vehicle/powertrain/ICEHeatState.ts`
- `scripts/run-jesko-attack-selftests.ts`
- 本文档与 `artifacts/jesko-attack/` 的结果、日志及图片。

最小接入/可选接口扩展：

- 注册/几何：`src/vehicle/VehicleCatalog.ts`、`src/vehicle/VehicleDimensions.ts`。
- 配置/复制/校验：`src/vehicle/config/VehiclePhysicsConfig.ts`、`defaultVehiclePhysicsConfig.ts`、`validateVehiclePlatformConfig.ts`。
- 物理：`src/vehicle/physics/Engine.ts`、`VehicleAerodynamics.ts`、`VehicleDynamics.ts`。
- 动力边界：`src/vehicle/powertrain/ICEPowertrain.ts`、`Powertrain.ts`。
- 传动：`src/vehicle/transmission/TransmissionSystem.ts`、`createTransmissionSystem.ts`、`automatic/AutomaticShiftController.ts`。
- 显示/几何构建：`src/vehicle/visual/VehicleVisualConfig.ts`、`VehicleStaticAssets.ts`、`VehicleVisual.ts`、`Cockpit.ts`、`CockpitLayout.ts`、`InstrumentBinnacle.ts`。
- 音频：`src/audio/VehicleAudioProfile.ts`、`EngineAudio.ts`。
- 游戏显示适配：`src/game/DrivingGame.ts`、`GameUIViewModels.ts`（9LST 标签、净功率元数据、真实热状态及增压/换挡音频遥测）。

没有更改其他车型参数文件、安装依赖或提交代码。工作区原本已有大量未提交改动，本次在其当前内容上增量接入，保留原改动。

## 验证命令与交付范围

```powershell
pnpm exec esbuild scripts/run-jesko-attack-selftests.ts --bundle --platform=node --format=esm --outfile=.tmp-jesko-selftests.mjs
node .tmp-jesko-selftests.mjs
pnpm run typecheck
pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --strict --noUncheckedIndexedAccess --resolveJsonModule --types node --lib ES2022,DOM scripts/run-jesko-attack-selftests.ts
pnpm exec vite build --outDir .tmp-jesko-review-build --emptyOutDir false
pnpm exec electron scripts/render-vehicle-exteriors.cjs --vehicle=koenigsegg-jesko-attack --output-dir=artifacts/jesko-attack/renders
```

以上检查均通过。独立目录 Vite 构建有大于 500 kB 的 chunk 提示，未改动拆包配置。渲染器控制台错误为空，最终参考视角 230 draw calls / 10336 triangles；不是整场景帧率基准。类型检查包含项目源码及单独的专项脚本，因为 `scripts/` 不在项目 tsconfig 的 include 中。

## 已知简化与人工验收

- 未实现 E85、原厂完整 UPOD 最优功率搜索、七片离合内部惯量与热量、逐级齿轮齿合或离合磨损；本版采用等效多离合交接及现有目标转速选挡策略。
- 热保护为单个冷却液/机油等效热容；没有水油分温、损坏、爆震、燃料品质或气温功率补偿模型。
- 共用有效轮胎半径；Triplex 仅等效阻尼/支撑，没有独立第三减振器或完整气液管路。轮胎沿用已有联合滑移模型，不模拟真实 Cup 2 R 配方与热衰减。
- 气动为一维相对风速及前后轴总力模型，没有地效离地高度图、偏航风洞、独立左右翼面、失速或完整空气制动力矩；没有直接额外施加一个重复的气动俯仰力矩。
- 全油门起步仍有后轮打滑和短时限转超调；成绩不是厂商性能保证。需人工确认键盘/手柄的渐进油门操作感。
- 外观仍为程序化简化模型；座舱和主驾驶门窗已在后续修订中更新，参见 [2026-10-30 补充验收](JESKO_COCKPIT_2026-10-30.md)。本文中的旧视觉成绩只代表原车型版本。
- 合成声不是原车录音，快速换挡的声学瞬态受现有平滑时间影响。

人工验收清单：

1. 开发模式 `pnpm dev`，从菜单或 F5 选择 Jesko；核对 9LST、955 kW、RWD，检查正常 PRND 和手动加减挡操作。
2. 第一人称确认中央挡位/转速、温度与道路视野，检查转向到两端时遮挡、反光、双侧后视镜及桶椅位置。
3. 低速渐进油门与全油门起步，确认后驱牵引反馈、TCS/ESC 灯、升降挡及转速衔接。
4. 可安全试驾的宽阔地图上确认高速稳定性、制动和连续变线；不要将轴荷台架的 420 km/h 当作道路极速结论。
5. 外观绕车检查轮拱、灯组状态、双层尾翼/前翻板、后扩散器及轮毂；检查低速到高速执行器动画。
6. 戴耳机听怠速、中转增压、高转、升降挡和松油门，确认音量、平面 V8 音色及座舱隔音；主观评价留给用户。

[最终多视角图](../artifacts/jesko-attack/renders/koenigsegg-jesko-attack.png)。
