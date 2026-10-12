# 自动换挡与手柄油门修改报告

## 根因与原有输入

原 AT/DCT 共用控制器已经对油门换挡表做线性插值，并不是一个在 30–60% 油门直接跳到 5500 rpm 的开关。问题是标定节点过少、中段偏高，运动模式还会通过既有驾驶模式油门曲线提高实际需求；控制器没有下一挡扭矩/功率余量判断。升挡又同时受最低车速、下一挡必须超过同一负荷下降挡门槛、最低挡位停留时间约束，实际发动机转速可能超过表中目标。

原决策使用实际驾驶油门命令、发动机 RPM、驱动轮转速、道路车速、挡位/齿比、制动、横向速度、模式替换后的换挡表、kickdown 阈值和手动选择状态。发动机扭矩仅供物理执行机构使用，没有进入换挡决策；没有独立功率需求判断。120 Hz 下用每帧油门差值 > 0.08 判断深踩，也不适合逐渐踩下的扳机。

原升挡取轮速折算转速与曲轴转速的较大值，打滑可以引发提前升挡；kickdown 优先于普通升挡，且只看轮速侧低转速，离合器/变矩器滑差下可能在实际曲轴转速很高时再次降挡。手柄 RT 原指数 1.1，低行程接近线性。

## 共用 TCU

- 继续使用原 AT/DCT 执行机构；新数据只参与决策，不改变发动机扭矩、阻力或车辆运动状态。
- 采用实际驾驶油门命令，加上小幅、快速衰减的油门变化率需求；车型换挡表增加至 0、20%、45%、70%、90%、100% 六个连续插值节点。
- 升挡预测同时检查 `engineRPM * nextRatio/currentRatio`、轮速与道路速度的耦合转速。曲轴实际转速决定升挡时机，打滑轮速不会单独触发升挡。
- ICEPowertrain 提供既有发动机满负荷扭矩包络查询；结合当前实际可用扭矩与油门请求，比较下一挡轮端扭矩余量。同一车速下轮端扭矩比较也对应功率需求比较；稳定中低需求且余量充足时允许较早升挡。
- 升挡后的有效最低 RPM 与降挡门槛分离；降挡门槛根据上一挡升挡后的 RPM 留出滞回，避免稳定油门撤销刚完成的升挡。
- 普通换挡保留最短停留时间；突然深踩可在安全条件下提前 kickdown，选择接近车型目标转速的挡位。预测降挡同时检查曲轴齿比换算、轮速与道路转速，防止滑差下不合理降挡。
- AUTO 有独立有效转速上限保护，优先于普通停留、松油保挡和 kickdown。Sport/Race 松油短时保挡、制动/横向运动保挡仍不能压过上限保护。

## 车型标定

BMW ECO 利用低中转扭矩；NORMAL（日常 Comfort/Normal 标定）稍迟升挡；SPORT 有更高目标和 1.4 秒松油保挡。AUTO 保护上限为 6400 rpm，动态 WOT 工况最高约 6506 rpm，未出现 7000+ 常态运行。

下表为第三挡、稳定驾驶输入、排除起步滑差的控制器升挡边界检查。油门是输入系统输出，随后通过既有车辆驾驶模式曲线；单位 rpm。

| 车型/模式 | 15% 油门 | 40% 油门 | 75% 油门 | WOT |
| --- | ---: | ---: | ---: | ---: |
| BMW ECO | 1480 | 1840 | 3320 | 6220 |
| BMW NORMAL | 1840 | 2480 | 4430 | 6400 |
| BMW SPORT | 2850 | 3960 | 5680 | 6400 |
| Ferrari SPORT AUTO | 2850 | 4230 | 7030 | 8860 |
| Ferrari RACE AUTO | 3470 | 4860 | 7920 | 8860 |

Ferrari SPORT 的轻中油门积极升挡，RACE 在强需求下明显延后。MANUAL 继续优先处理拨片、拒绝不安全降挡、低转保护、原有红线自动升挡选项和 12 秒稳定驾驶超时；本次 AUTO 表不会在手动保挡期间强制套用。MANUAL RACE 的既有行为没有改成永久保挡。

Mazda 6AT 使用较高的 NA 日常目标；Jetta 1.4T DCT、A6L 2.0T DCT 和 Touareg 3.0T AT 使用更低的中段目标并提高 kickdown 门槛。A6L/Touareg 的 Eco、Normal、Sport 都同步标定；车型功能由配置决定。

CVT 继续使用连续变速器，增加平滑油门瞬态需求，目标 RPM 曲线调整为 1100/1450/2300/3350/4500/5700（对应六个需求节点）。保留目标 RPM 滤波和实际变速比速率限制，没有模拟换挡。40% 油门动态工况最高约 2720 rpm，WOT 目标约 5700 rpm。

## 手柄 RT

只将 RT 默认指数改为 1.5，保留 3% 死区及重新归一化：`((raw - .03) / .97)^1.5`，死区内输出 0，完整行程输出 1。raw 0.2/0.4/0.5/0.7 对应约 0.073/0.236/0.337/0.574。LT、摇杆及键盘语义保持原样。

TCU 接收硬件曲线处理后的驾驶命令及既有模式标定，发动机自身的节气门滤波/增压物理仍独立运行。

## 验证与构建

定向脚本通过：98 个动态工况、52 个稳定换挡边界检查，以及轮速打滑、离合器滑差、扭矩余量、安全降挡、松油保挡、BMW 上限和 Ferrari 手动保护检查。新增检查 3147 次，原 transmission backend/vehicle/shift/selector、CVT 和 input 检查 105517 次，共 108664 次断言通过。

动态工况覆盖七类车型和十四组模式：稳定轻油门、稳定中油门、75% 油门、WOT、突然 kickdown、松油、巡航。轻油门从滚动低挡开始，其他加速工况从静止开始；部分车型 15% 油门从静止只会蠕行，因此不以蠕行是否升挡判断策略。记录包含挡位、RPM、车速、油门、实际驾驶需求和换挡事件。

未检出中等油门高转长期滞留或八秒内重复挡位往返；所有静止 WOT 工况换挡方向持续向上。Ferrari SPORT/RACE 动态 WOT 最大 RPM 约 8972/8948；CVT 保持连续比率变化。

运行方式：

```powershell
& .\node_modules\.bin\esbuild.CMD scripts/run-transmission-demand-selftests.ts --bundle --platform=node --format=esm --outfile=.tmp-transmission-demand-selftests.mjs
node .tmp-transmission-demand-selftests.mjs
pnpm run build -BasicValidation
```

最终构建成功，typecheck 通过，生产产物已发布到 playable `dist`。按本次要求跳过 full core，没有运行地图、视觉、cockpit/world 测试。Vite 有大 chunk 提示，未阻止构建。

完整记录：[results.json](D:/dsy/drivergame/artifacts/transmission-demand/results.json)。

## 修改文件

- [GamepadInput.ts](D:/dsy/drivergame/src/input/GamepadInput.ts)
- [VehicleInputSystem.selftest.ts](D:/dsy/drivergame/src/input/VehicleInputSystem.selftest.ts)
- [VehiclePhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/VehiclePhysicsConfig.ts)
- [bmw530LiPhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/bmw530LiPhysicsConfig.ts)
- [ferrari458PhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/ferrari458PhysicsConfig.ts)
- [transmissionTestVehicleConfigs.ts](D:/dsy/drivergame/src/vehicle/config/transmissionTestVehicleConfigs.ts)
- [executiveSedanPhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/executiveSedanPhysicsConfig.ts)
- [roadSUVPhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/roadSUVPhysicsConfig.ts)
- [cvtSedanPhysicsConfig.ts](D:/dsy/drivergame/src/vehicle/config/cvtSedanPhysicsConfig.ts)
- [ICEPowertrain.ts](D:/dsy/drivergame/src/vehicle/powertrain/ICEPowertrain.ts)
- [TransmissionSystem.ts](D:/dsy/drivergame/src/vehicle/transmission/TransmissionSystem.ts)
- [AutomaticShiftController.ts](D:/dsy/drivergame/src/vehicle/transmission/automatic/AutomaticShiftController.ts)
- [CVTTransmissionSystem.ts](D:/dsy/drivergame/src/vehicle/transmission/cvt/CVTTransmissionSystem.ts)
- [run-transmission-demand-selftests.ts](D:/dsy/drivergame/scripts/run-transmission-demand-selftests.ts)
- [results.json](D:/dsy/drivergame/artifacts/transmission-demand/results.json)
- [report.md](D:/dsy/drivergame/artifacts/transmission-demand/report.md)

## 仍需实际驾驶判断

自动化检查没有发现剩余失败。换挡平顺度、坡道/连续弯道的挡位选择、松油保挡时长和真实手柄低行程控制仍需用户驾驶评价。扭矩预测使用现有满负荷包络和当前可用扭矩，并不是未来增压状态的完整预测。本次完成基础标定后停止调参。
