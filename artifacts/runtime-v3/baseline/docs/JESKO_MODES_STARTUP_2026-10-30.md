# Jesko 四模式、启动与运动座舱 — 2026-10-30

官方规格公开的是 KES 四档 Comfort、Wet/Snow、Sport、Track：
https://www.koenigsegg.com/technical-specifications-jesko-attack

本项目用现有 NORMAL/WET/SPORT/RACE 标识映射上述名称。官方未公开完整油门、换挡及控制阈值；这些联动值属于独立工程标定，不宣称 OEM 数据。未找到可靠的原厂完整启动动画参考，约 0.7 秒的标识/细线环形自检是原创效果。

## 行为

Comfort 渐进油门、较早升挡、短收油留挡及较柔阻尼；Wet/Snow 的踏板与扭矩恢复更渐进，后驱 TCS/ESC 更早保护；Sport 保留原 Jesko 核心标定；Track 踏板更直接、保持高转速、较低踢降阈值、2.2 s 收油留挡、更高阻尼，电控保持开启。

四模式不改变质量、轮胎峰值抓地或发动机峰值功率/转矩曲线。气动仍按实际速度与驾驶状态计算。LST 基本 30 ms 交接不为舒适模式故意变慢。

运动照明仅布置在排挡导光、门把手定位、中央风口定位和脚窝，采用低亮度黄绿色与暖白光。白天降低亮度，供电关闭后平滑渐灭。启动画面仅在停车且无告警时短暂显示；行驶中或有真实告警立即显示数据。

## 实际验证

scripts/run-jesko-mode-selftests.ts：120 Hz、初始 80 km/h、4 挡、40% 同一驾驶油门、6 s：

| 模式 | 踏板映射 | 末速度 km/h | 末挡位 | 阻尼倍率 | 30% 油门换挡 rpm |
| --- | ---: | ---: | ---: | ---: | ---: |
| Comfort | .3181 | 94.90 | 6 | .88 | 3000 |
| Wet/Snow | .2577 | 88.74 | 5 | .96 | 3400 |
| Sport | .3856 | 119.35 | 6 | 1.00 | 3600 |
| Track | .4149 | 135.26 | 5 | 1.18 | 4800 |

这是部分踏板响应对比，不是全油门成绩或厂商数据。四模式均无 invalid-state recovery，ABS/TCS/ESC 均启用，发动机扭矩曲线不变。

Jesko 完整专项：38624 项断言，错误 0；结果见 artifacts/jesko-attack/selftest-results.json。夜间亮度与断电渐灭检查通过；主屏 585 个视线点无遮挡。实渲见 artifacts/jesko-cockpit/after/startup.png 和 consoleNight.png。

同时修复了复位次序问题：悬架 reset 曾丢失当前模式，现在复位后恢复实际选择的悬架模式，避免 Sport 状态与阻尼不一致。

## 修改文件与操作

- src/vehicle/config/jeskoAttackPhysicsConfig.ts：四模式、LST 换挡表、控制阈值和阻尼。
- src/vehicle/physics/VehicleDynamics.ts：复位后恢复悬架模式。
- src/vehicle/visual/JeskoAttackCabin.ts、JeskoAttackInstruments.ts、JeskoAttackVisualConfig.ts：定位灯、开机效果、模式标识、门灯归属。
- src/input/KeyboardBindings.ts：模式切换标签；默认按 T。
- scripts/run-jesko-mode-selftests.ts、run-jesko-cockpit-selftests.ts、jesko-cockpit-preview.ts、render-jesko-cockpit.cjs：验证与实渲。

最终专项、轻量构建与 release 状态见 JESKO_CANOPY_RELEASE_2026-10-30.md。用户要求缩减验证后，未再重复全量核心套件；已知旧检查失败在该文档单独列出。