# Vehicle performance benchmark and TCS calibration — 2026-10-15

**最新结论：用户导出的6.218 s已定位为实际选挡入口只切换后轴PRND，前电机有输出但前轮扭矩为0。已修复；实际选挡路径受控复测直接油门4.051 s、有效LC 3.683 s。详见文末“实测JSON闭环”。此前直接以D挡创建车辆的测试遗漏了该入口，不能用其3.8 s证明游戏内选挡正确。**

全车先测后改。测试范围来自当前 VehicleCatalog 的12辆正式车辆；Golf GTI在列，驾校CVT已不是独立catalog条目，不包含临时AWD fixtures。

## 条件与可重复性

- 120 Hz固定步长；平坦干燥柏油，四轮显式asphalt接触，无坡度、风或外加纵向力。
- 20°C环境，轮胎从35°C起步，使用原厂冷胎压力配置及其自然热胀，压力状态NORMAL；不修改峰值抓地来模拟暖胎。
- EV初始SOC80%、电池30°C、电机40°C、逆变器35°C；有足够热余量。ICE使用配置默认燃油，质量包含真实燃油质量，发动机没有独立冷机热降额模型。
- ABS/EBD/ESC按正式能力开启；TCS分别ON/OFF，ESC独立保持开启。默认生产驾驶模式，自动车D挡。
- 普通自动车从怠速、停止、制动释放同时踩满油门。Taycan另用正式LC：SPORT_PLUS，刹车+油门等待READY，再松刹车；后轴必须1挡。
- MT使用同一有界反馈预转速驱动器（朝2400 rpm调节，不强制写RPM；不同发动机实际转速不同），0.65 s渐进离合起步，94%红线发起约0.40 s换挡；换挡拒绝直接使benchmark失败。
- 从踏板/制动释放时刻计时，无rollout，速度越过30/50/100时在相邻120 Hz样本间插值。2 s制动沉降+1 s准备不计入成绩。
- 所有正式24组ON/OFF结果重复一次，after和repeat的summary.json SHA256完全相同。before是修改任何生产物理代码前保存的工作区实测；不是Git HEAD或历史报告数据。
- 遥测20 Hz持久化，指标/计时/TCS累计在120 Hz计算；可设BENCH_TRACE_120HZ=1输出完整120 Hz轨迹。最终数据另记录完整初始压力/温度/挡位/LC状态。

## 修改前：完整横向基线

单位秒；TCS时间指扭矩权威降低超过2%的累计时间。没有可靠精确target的车只使用当前config/catalog性能等级，不虚构误差数字。

| Vehicle | Target / Class | 0–30 | 0–50 | 0–100 | Error / 判断 | TCS累计 | Notes |
|---|---|---:|---:|---:|---|---:|---|
| Haiteng S1 Driving School | 1.6 NA 驾校 5MT；无精确 target | 3.82 | 6.06 | 15.06 | 无精确target；按系统异常调查 | 3.81 | 共享离合器数值振荡、TCS 恢复尾巴；共享修正 |
| GT 3.0 Turbo | 约269 kW 手动 RWD GT；无唯一现实原型 | 2.44 | 3.93 | 7.11 | 无精确target；按系统异常调查 | 5.38 | 共享离合器/TCS；不改动力配置 |
| Mazda CX-4 2.0L 6AT | 2.0 NA 6AT 普通家用车；无精确 target | 2.79 | 4.39 | 10.40 | 无精确target；按系统异常调查 | 0.00 | 未发现持续 TCS/阻力异常；不改专属配置 |
| Volkswagen Sagitar 280TSI DSG | 1.4T / 250 Nm 家用 DCT；无精确 target | 3.91 | 5.53 | 11.42 | 无精确target；按系统异常调查 | 1.10 | DCT 过早接合压低转速；共享起步负载管理 |
| Nissan Sylphy 2.0L CVT | 2.0 NA CVT 家用车；无精确 target | 3.12 | 4.71 | 10.54 | 无精确target；按系统异常调查 | 0.00 | 无明显异常；只跟随公共轮胎/锁止求解 |
| Audi A6L 45 TFSI quattro | 2.0T / 370 Nm 长轴 AWD；无精确 target | 4.06 | 5.27 | 9.80 | 无精确target；按系统异常调查 | 0.00 | DCT 怠速附近起步；共享负载管理 |
| Volkswagen Touareg 3.0 TSI 4MOTION | 450 Nm / 2100 kg AWD SUV；无精确 target | 2.62 | 3.67 | 7.84 | 无精确target；按系统异常调查 | 0.00 | 原配置禁止全油门锁止；允许正常锁止 |
| Ferrari 458 Italia | 现实458 <3.4 s；游戏无正式 LC | 2.01 | 3.07 | 5.34 | 57.20%（无LC可比性有限） | 4.33 | 离合器振荡、通用轮胎牵引上限；4000 rpm普通DCT起步/物理轮胎标定 |
| Tesla Model 3 RWD | 6.1–6.2 s；项目自测5.7–6.6 s | 2.28 | 3.42 | 6.58 | 7.01% | 0.00 | 可接受窗口；无动力/电池/电机专属修改 |
| BMW 530Li | 350 Nm / 1745 kg 2.0T RWD 豪华车；无精确项目target | 2.64 | 3.79 | 8.25 | 无精确target；按系统异常调查 | 1.37 | 原配置禁止WOT锁止；修正后普通起步8.11，另测变矩器预载7.51 |
| Porsche Taycan 4S | LC ~3.7 s；项目自测3.4–4.1 s | 1.28 | 1.85 | 3.80 | 2.79% | 1.47 | 基线已3.80；共享TCS修正，无车重/抓地/功率专属修改 |
| Volkswagen Golf GTI | 175 kW / 350 Nm FWD hot hatch；无精确项目target | 3.27 | 4.81 | 8.38 | 无精确target；按系统异常调查 | 3.75 | DCT接合/数值振荡及TCS恢复；共享修正，无专属动力修改 |

基线否定了“每辆车都长期大削扭”：Mazda、Sylphy、A6L、Touareg、Model3在干地基线均无TCS。GT ON/OFF为7.11/6.16，Golf为8.38/7.81，Ferrari为5.35/5.16；TCS有问题，但DCT/离合器也必须检查。Taycan有效LC原本就是3.80，不是6秒。

## 最终成绩与归因

After列就是TCS ON结果；OFF仍保留ESC。TCS为累计介入时间；根因/修改不以车辆名称控制运行逻辑。

| Vehicle | Target / Class | Before 100 | After / ON 100 | OFF 100 | Error | TCS累计 | Root cause / Changes |
|---|---|---:|---:|---:|---|---:|---|
| Haiteng S1 Driving School | 1.6 NA 驾校 5MT；无精确 target | 15.06 | 14.54 | 14.28 | — | 0.90 | 共享离合器数值振荡、TCS 恢复尾巴；共享修正 |
| GT 3.0 Turbo | 约269 kW 手动 RWD GT；无唯一现实原型 | 7.11 | 6.26 | 6.15 | — | 2.81 | 共享离合器/TCS；不改动力配置 |
| Mazda CX-4 2.0L 6AT | 2.0 NA 6AT 普通家用车；无精确 target | 10.40 | 10.40 | 10.40 | — | 0.00 | 未发现持续 TCS/阻力异常；不改专属配置 |
| Volkswagen Sagitar 280TSI DSG | 1.4T / 250 Nm 家用 DCT；无精确 target | 11.42 | 10.20 | 10.00 | — | 1.10 | DCT 过早接合压低转速；共享起步负载管理 |
| Nissan Sylphy 2.0L CVT | 2.0 NA CVT 家用车；无精确 target | 10.54 | 10.55 | 10.55 | — | 0.00 | 无明显异常；只跟随公共轮胎/锁止求解 |
| Audi A6L 45 TFSI quattro | 2.0T / 370 Nm 长轴 AWD；无精确 target | 9.80 | 8.20 | 8.20 | — | 0.00 | DCT 怠速附近起步；共享负载管理 |
| Volkswagen Touareg 3.0 TSI 4MOTION | 450 Nm / 2100 kg AWD SUV；无精确 target | 7.84 | 7.80 | 7.80 | — | 0.00 | 原配置禁止全油门锁止；允许正常锁止 |
| Ferrari 458 Italia | 现实458 <3.4 s；游戏无正式 LC | 5.34 | 3.99 | 4.09 | +17.21% 对3.4参考 | 2.90 | 离合器振荡、通用轮胎牵引上限；4000 rpm普通DCT起步/物理轮胎标定 |
| Tesla Model 3 RWD | 6.1–6.2 s；项目自测5.7–6.6 s | 6.58 | 6.58 | 6.58 | +7.01% 对6.15 | 0.00 | 可接受窗口；无动力/电池/电机专属修改 |
| BMW 530Li | 350 Nm / 1745 kg 2.0T RWD 豪华车；无精确项目target | 8.25 | 8.11 | 8.08 | — | 0.50 | 原配置禁止WOT锁止；修正后普通起步8.11，另测变矩器预载7.51 |
| Porsche Taycan 4S | LC ~3.7 s；项目自测3.4–4.1 s | 3.80 | 3.80 | 3.87 | +2.65% | 1.16 | 基线已3.80；共享TCS修正，无车重/抓地/功率专属修改 |
| Volkswagen Golf GTI | 175 kW / 350 Nm FWD hot hatch；无精确项目target | 8.38 | 7.02 | 7.11 | — | 3.80 | DCT接合/数值振荡及TCS恢复；共享修正，无专属动力修改 |

## 最终分段成绩与介入强度

强介入定义为聚合engineTorqueFactor <0.70；AWD同时保留独立轴factor，所以“聚合无强介入”不等于单轴从未短暂降低30%。累计灯/介入时间使用任一驱动轴低于0.98，最长连续时间与累计时间分开记录。

| Vehicle | ON 30 / 50 / 100 | OFF 30 / 50 / 100 | TCS最长连续 | 聚合强削扭累计 | 平均聚合削扭 | 平均最大驱动轮slip |
|---|---|---|---:|---:|---:|---:|
| Haiteng S1 Driving School | 3.34 / 5.69 / 14.54 | 3.08 / 5.42 / 14.28 | 0.90 | 0.29 | 1.27% | 0.041 |
| GT 3.0 Turbo | 1.96 / 2.96 / 6.26 | 2.20 / 3.29 / 6.15 | 1.28 | 0.70 | 9.20% | 0.152 |
| Mazda CX-4 2.0L 6AT | 2.79 / 4.39 / 10.40 | 2.79 / 4.39 / 10.40 | 0.00 | 0.00 | 0.00% | 0.040 |
| Volkswagen Sagitar 280TSI DSG | 2.81 / 4.34 / 10.20 | 2.72 / 4.15 / 10.00 | 1.10 | 0.35 | 2.19% | 0.055 |
| Nissan Sylphy 2.0L CVT | 3.13 / 4.71 / 10.55 | 3.13 / 4.71 / 10.55 | 0.00 | 0.00 | 0.00% | 0.047 |
| Audi A6L 45 TFSI quattro | 2.49 / 3.70 / 8.20 | 2.49 / 3.70 / 8.20 | 0.00 | 0.00 | 0.00% | 0.032 |
| Volkswagen Touareg 3.0 TSI 4MOTION | 2.62 / 3.65 / 7.80 | 2.62 / 3.65 / 7.80 | 0.00 | 0.00 | 0.00% | 0.034 |
| Ferrari 458 Italia | 1.43 / 2.15 / 3.99 | 1.46 / 2.22 / 4.09 | 2.90 | 1.42 | 18.96% | 0.203 |
| Tesla Model 3 RWD | 2.28 / 3.42 / 6.58 | 2.28 / 3.42 / 6.58 | 0.00 | 0.00 | 0.00% | 0.075 |
| BMW 530Li | 2.64 / 3.75 / 8.11 | 2.64 / 3.74 / 8.08 | 0.27 | 0.00 | 0.31% | 0.056 |
| Porsche Taycan 4S | 1.27 / 1.85 / 3.80 | 1.30 / 1.92 / 3.87 | 0.44 | 0.00 | 1.81% | 0.097 |
| Volkswagen Golf GTI | 2.40 / 3.54 / 7.02 | 2.46 / 3.70 / 7.11 | 2.93 | 0.92 | 11.63% | 0.123 |

## 共享问题与实现

1. **离合器反馈的数值振荡先于TCS。** 原MT/DCT把上一物理步轮速与当前发动机转速之差乘以很硬的耦合刚度，再显式推进低惯量车轮。基线轨迹出现驱动轮正、负大扭矩交替，例如驾校车约+1882/-1225 Nm、Ferrari约+5206/-5206 Nm。TCS看到的是这条物理链产生的轮速/滑移振荡，单纯加强削扭会把发动机闷住。新增共享的隐式摩擦耦合需求解，使用发动机惯量、实际轮系等效惯量、上一拍接触/制动反扭矩、速比和效率；仍经过原离合器容量、DCT重叠接合、变矩器锁止与源轴积分。没有直接写轮速、车速或车辆位置。120 Hz回归同时检查冲量守恒、无源时能量耗散及Ferrari正常牵引阶段没有大扭矩正负翻转。
2. **原TCS不是固定40%开关，但也没有闭环积分保持可用扭矩。** 原实现用`1-clamp(excess/0.5)`作为绝对目标，必须维持明显超额slip才保留削扭，恢复率又较低；数值振荡会延长削扭尾巴。现在每轴维护滤波误差、有限积分扭矩余量及连续比例纠正。积分误差限幅并将余量限制在允许削扭范围内；±0.012迟滞、0.006死区，误差40 s^-1低通；攻击/恢复沿用车辆response/recoveryResponse，最终变化限制为每秒降低最多6、恢复最多2.5。低于目标后快速恢复，无用的长期欠功率减少。
3. **低速slip没有“除以零”根因。** 原算法已经使用2 m/s及轮缘速度共同正则化，不能把本次问题归咎于裸除车速。现把地速参考改为平滑的`hypot(2, groundSpeed)`，分母再与轮缘速度绝对值取大值；轮胎求解和控制器消费同一个物理slip，避免2 m/s边界参考突然换斜率。正反向对称、静止有限，0–2、2–5、5–10 km/h均持续有控制权，未设置低速关闭TCS的分支。
4. **目标为有效牵引滑移。** 继续复用Surface Interaction的`contactUsefulSlip`，基础为当前轮胎peakSlipRatio、当前surface的slipRatioScale与已有压力刚度处理，再乘车辆/模式的slipThresholdMultiplier。配置中的Golf、GT及Ferrari SPORT/RACE窗口继续生效。Gravel、Snow、Sand、Mud使用共享路面数据给出更宽的有效窗口，没有在TCS添加路面名称分支。
5. **AWD按轴保留牵引。** EV前/后轴已有独立输出权威，继续独立使用；ICE全局请求从“最差轴”改为配置分配加权的权威，AWD分配器在安装的后轴分配上限内优先利用另一轴。TCS指示读取任一驱动轴，避免加权平均掩盖单轴介入。ESC算法未改；ABS保留最终制动/回收调制权威。旧AWD测试中的大削扭检查移到真正打滑的rearTorqueFactor，额外检查front=1及聚合权威高于受限轴，验证新合同而非削弱后轴检测。
6. **DCT普通大油门起步。** 原逻辑主要按地速/油门增加接合，很容易把发动机压在怠速附近，尤其涡轮车。现在只在超过65%踏板、输入转速尚未进入工作带、无换挡且非制动保持时平滑限制离合器负载，使发动机通过正常燃烧升到工作转速。默认目标idle+1500 rpm；Ferrari可配置4000 rpm。65%以下保留原日常/蠕行路径。该功能不给额外功率，也不把普通车型标记成Launch Control。

## 车辆专属处理与剩余偏差

- **Ferrari**：通用PERFORMANCE轮胎的纵向摩擦系数1.06，在后轴静载比例0.58、h=0.40 m、轴距约2.65 m时，理想牵引上限约为`a/g = μ*rearBias/(1-μ*h/L)`，还未扣滚阻、载荷敏感及起步/换挡损失，已只有约0.73 g。TCS OFF基线5.16 s与此一致，不能靠TCS或加发动机功率得到3.4 s。将该车安装轮胎的**物理纵向系数**显式标定为1.28（仍使用同一载荷、路面及combined-slip模型），普通大踏板DCT目标4000 rpm；未改变车重、发动机曲线、车轮半径、横向轮胎参数或增加launch-only抓地/推力。这是模拟轮胎标定，不是测得的OEM轮胎数据。最终3.99 s回到约4秒级中置跑车，但仍比Ferrari厂家宣称的<3.4 s慢约17%；当前catalog未安装该车正式LC，不声称完全复现工厂起步成绩。[Ferrari官方性能参考](https://www.ferrari.com/en-GQ/history/moments/2009/benchmark-car/more)
- **BMW / Touareg**：原8AT的lockupMaximumThrottle分别为0.65/0.60，全踏板永不锁止；允许1.0踏板在既有车速、速比、滑差、安全条件满足时正常锁止，并对锁止摩擦使用同一隐式求解。没有改日常换挡表为永远高转。普通怠速起步BMW 8.11 s、Touareg 7.80 s。BMW另做真实变矩器制动预载诊断：关闭Auto Hold，在制动上以正常发动机/变矩器物理预载1 s，松刹车计时得到7.51 s；不把此成绩替换统一普通起步成绩，也不将它称作额外boost。
- **Taycan / Model3 / Mazda / Sylphy / 驾校 / GT / Sagitar / A6L / Golf**：没有专属功率、质量、效率或轮胎配置改动。适用的车自然受共享离合器、TCS、轮胎slip参考及变矩器求解修正影响。Model3约6.58 s，相对6.15约+7%，在用户给出的5–8%接受原则以及既有5.7–6.6 s窗口内。
- 没有设置可靠精确target的车型不报告伪造的百分比。BMW的当前配置本身是350 Nm模拟标定，不把某个未确认版本的工厂数据强制当成唯一目标。若要求所有现实车型精确复现OEM LC成绩，仍需要另行定义对应版本和正式起步功能，本次没有扩展这些系统。

## Taycan专项结果

- 修改前有效LC就为3.80 s，修改后**1.272 / 1.850 / 3.798 s**（30/50/100）。本次标准环境没有复现“原来6s+”，所以不能声称已找到该具体用户运行状态的根因。
- 初始状态确认为READY、SPORT_PLUS、D、后轴1挡15.5；起步进入LAUNCHING，系统功率上限440 kW，pack可放电510 kW。
- 前电机最高约310 Nm、后电机约400 Nm，两轴均有实际机械输出；未见热降额，峰值电池端功率约490 kW，前/后电机与逆变器功率上限正常。逐帧记录共享pack预算、温度、请求/交付、挡位及前后因子。
- 100 km/h前TCS累计1.16 s，最长连续约0.44 s；聚合平均削扭约1.8%。前轴权威一直为1，后轴短暂最低约0.68，未把另一轴一并削掉。OFF成绩3.87 s，ON没有大幅性能损失。没有更改Taycan的电池、电机、质量、轮胎或LC功率配置。
- 独立模式诊断：NORMAL无LC **4.29 s**、SPORT_PLUS无LC **4.08 s**、RANGE无LC **5.14 s**。Range保持后轴较高挡位及较低系统功率，确实比有效LC慢，但这仍不足以单独证明用户那次6秒运行的原因。诊断轨迹保存在对应diagnostic目录。

## 阻力、地面与介入解释

全车最终干地直线测试均未触发ESC，0.5 s后任何单轮残余服务制动均低于约0.30 Nm，EV全油门轨迹无回收扭矩，无EPB/AutoHold持续拖滞。滚阻、风阻、软地面阻力和坡度分别记录；干柏油没有软地面阻力或坡度。Ferrari/Golf仍可能累计数秒TCS：这时存在真实的高功率两驱牵引限制，ON分别比OFF快约0.10/0.09 s，不能将介入灯时间等同于异常砍功率。GT的ON-OFF时间差由约0.95 s降为约0.11 s；驾校由约0.87降为约0.26 s。基线从未介入的Mazda/Model3不制造TCS“优化收益”。

## 可复现命令

在项目根目录PowerShell：

```powershell
.\node_modules\.bin\esbuild.cmd scripts/run-performance-benchmark.ts --bundle --platform=node --format=esm --outfile=.tmp-performance-benchmark.mjs
node .tmp-performance-benchmark.mjs artifacts/performance-tcs/new-run
.\node_modules\.bin\esbuild.cmd scripts/run-performance-targeted-selftests.ts --bundle --platform=node --format=esm --outfile=.tmp-performance-targeted.mjs
node .tmp-performance-targeted.mjs
pnpm run typecheck
pnpm run build -BasicValidation
```

第二位置参数可筛选catalog id。可选诊断环境变量：BENCH_LAUNCH=0、BENCH_MODE=RANGE/NORMAL/SPORT_PLUS、BENCH_PRELOAD=1（变矩器预载诊断）、BENCH_TRACE_120HZ=1。正式after/repeat均不使用诊断覆盖。

## Changed files

- Benchmark/定向runner：[run-performance-benchmark.ts](../scripts/run-performance-benchmark.ts)、[run-performance-targeted-selftests.ts](../scripts/run-performance-targeted-selftests.ts)。
- TCS/slip：[TractionController.ts](../src/vehicle/physics/TractionController.ts)、[LongitudinalSlip.ts](../src/vehicle/physics/LongitudinalSlip.ts)、[DriverAssistSystem.ts](../src/vehicle/physics/DriverAssistSystem.ts)、[WheelRotationSystem.ts](../src/vehicle/physics/WheelRotationSystem.ts)、[AWDTorqueDistribution.ts](../src/vehicle/physics/AWDTorqueDistribution.ts)。
- 物理反作用接口/求解：[VehicleDynamics.ts](../src/vehicle/physics/VehicleDynamics.ts)、[Clutch.ts](../src/vehicle/physics/Clutch.ts)、[Powertrain.ts](../src/vehicle/powertrain/Powertrain.ts)、[ICEPowertrain.ts](../src/vehicle/powertrain/ICEPowertrain.ts)、[TransmissionSystem.ts](../src/vehicle/transmission/TransmissionSystem.ts)、[implicitClutchDemand.ts](../src/vehicle/transmission/implicitClutchDemand.ts)。
- 变速箱接入：[ManualTransmissionSystem.ts](../src/vehicle/transmission/manual/ManualTransmissionSystem.ts)、[DualClutchTransmissionSystem.ts](../src/vehicle/transmission/dct/DualClutchTransmissionSystem.ts)、[AutomaticTransmissionSystem.ts](../src/vehicle/transmission/automatic/AutomaticTransmissionSystem.ts)、[TorqueConverter.ts](../src/vehicle/transmission/automatic/TorqueConverter.ts)、[CVTTransmissionSystem.ts](../src/vehicle/transmission/cvt/CVTTransmissionSystem.ts)。
- 配置：[VehiclePhysicsConfig.ts](../src/vehicle/config/VehiclePhysicsConfig.ts)、[ferrari458PhysicsConfig.ts](../src/vehicle/config/ferrari458PhysicsConfig.ts)、[bmw530LiPhysicsConfig.ts](../src/vehicle/config/bmw530LiPhysicsConfig.ts)、[roadSUVPhysicsConfig.ts](../src/vehicle/config/roadSUVPhysicsConfig.ts)。
- 回归：[TractionPerformance.selftest.ts](../src/vehicle/physics/TractionPerformance.selftest.ts)、[ESCAWD.selftest.ts](../src/vehicle/physics/ESCAWD.selftest.ts)。
- 本报告、artifacts/performance-tcs内结果；最终dist由正常staged发布更新。上述若干文件原本有未提交改动，保留其余内容；未commit/push。

## 验证

定向runner最终15项全部PASS：新TCS/低速/能量与冲量回归（2404断言）、DriverAssist、ESC/AWD、WheelRotation、SurfaceInteraction、FourWheelPhysics、VehicleDynamics、VehiclePlatform（含AutoHold坡道释放）、Ferrari、TransmissionBackend/Vehicle/Shift、CVT、ElectricPowertrain、EVPlatformV2。没有运行full core或selftest:systems。

开发中发现并修复了：新增迟滞外的微小比例削扭、DCT中等踏板坡道起步受新目标误约束、两处类型错误；最终未通过修改/跳过旧断言掩盖这些问题。AWD旧全局削扭断言更新为单轴检测及另一轴保留权威的更具体合同检查。

- 全车benchmark/repeat：24组完全可重复。
- [最终定向结果JSON](../artifacts/performance-tcs/targeted-results.json)。
- [修改前summary](../artifacts/performance-tcs/before/summary.json)、[修改后summary](../artifacts/performance-tcs/after/summary.json)、[重复summary](../artifacts/performance-tcs/repeat/summary.json)；before/after各车ON/OFF JSON含完整测试遥测。
- Typecheck：PASS（最终build内tsc -b）。最终 pnpm run build -BasicValidation：PASS，明确跳过core selftests，Vite构建并成功Checkpoint published；dist入口已更新，主资源为 assets/index-BjmXN4gY.js。Vite仍报告现有大chunk体积警告（主JS约16 MB），不影响本次发布，未扩展到打包体积优化。

## 用户截图后的实际游戏路径复核（2026-10-15）

用户提供的截图确认为Taycan 4S、0–100 **6.217 s**、峰值纵向加速度**6.12 m/s²**、净用电**526.56 Wh**；用户进一步确认是**SPORT_PLUS直接油门起步，没有LC预备**。这些是实际游戏结果；前述独立benchmark及有效LC结果不能排除这条实际运行路径仍存在问题。不能用“没有LC”解释全部约两秒差距，也不能将此前修改视为已修复该次6.217 s。

本次将真实`VehicleContactSystem`、`CityGround`的regional-main源、截图附近高架公路（约x=-925、z=-1392、道路高度8 m、朝+X）和游戏原有`AccelerationTest`计时器接在同一个定向runner中，明确保持SPORT_PLUS、无LC、SOC83%、晴天干地，无驾驶辅助/热状态人工降额：

| 运行 | 0–100 | 峰值纵向加速度 | 净用电 | 接触 |
|---|---:|---:|---:|---|
| 用户截图 | 6.217 s | 6.12 m/s² | 526.56 Wh | 截图无法还原逐轮物理状态 |
| 同地图接触入口＋瞬时全踏板 | 3.739 s | 9.64 m/s² | 329.69 Wh | 四轮asphalt、无ESC/制动拖滞/热降额 |
| 同入口＋现有键盘0.88/s油门上升 | 4.138 s | 9.63 m/s² | 329.15 Wh | 同上；未到95%踏板约1.025 s |

在当时仅有截图的阶段，这两次受控入口测试仍不是截图工况的成功复现，具体根因尚未确定；后续用户JSON已将问题定位并修复，见下节。截图能耗约为受控结果1.6倍、峰值加速度更低，必须获取该次运行的输入、损耗、牵引和制动数据再归因。并未据此假设天气、手柄操作、旧构建或车型配置一定有错。本机5173服务器在本轮检查时已停止，不能从当前服务恢复截图时的浏览器运行状态。

为补上此前未覆盖的证据链，本次新增**实际游戏加速测试的被动诊断记录**，不改车辆物理、计时规则、输入映射或任何动力标定：

- 只有可选加速测试开启/待测后才记录；120 Hz累计，20 Hz采样，最多1800个样本，结束后冻结。
- 每轮记录车辆/地图版本、诊断器版本、天气/湿度、驾驶模式、LC状态、初始及全过程电池/电机/逆变器状态。
- 记录实际输入来源、油门/制动/转向/驻车请求、手柄RT原始值/归一化值/最终命令、仲裁后的控制请求。
- 记录前后轴请求/交付扭矩与功率上限、pack预算、挡位/速比、TCS前后轴因子、ESC、制动力和滚阻/风阻/坡度等实际力。
- 记录四轮表面、湿度、抓地系数、接触高度/法线、载荷、轮速、slip、驱动/制动扭矩、胎温/胎压。
- 面板新增**导出诊断**按钮，可下载本轮JSON；完成时另尝试保存到当前浏览器origin的`drivergame.acceleration-diagnostic.v1`，存储失败不影响游戏。没有上传、传输或在常规HUD常驻显示这些原始遥测。

新增/本轮修改文件：[诊断记录器](../src/experimental/acceleration/AccelerationRunDiagnostics.ts)、[诊断回归](../src/experimental/acceleration/AccelerationRunDiagnostics.selftest.ts)、[游戏接入](../src/game/DrivingGame.ts)、[导出按钮](../src/experimental/acceleration/AccelerationTestView.ts)、[加速测试runner](../scripts/run-acceleration-test-selftests.ts)、[同地图定向runner](../scripts/run-taycan-runtime-diagnostic.ts)。[实际入口复核数据](../artifacts/performance-tcs/runtime/summary.json)及同目录JSON保留全过程遥测。

验证：原加速计时15组行为检查PASS；新增记录器908个断言PASS，验证观测前后车速/电量逐步完全一致、待测不计入、完成仅存储一次、结束后数据冻结、存储异常不影响导出。真实regional入口两组PASS。最终 pnpm run build -BasicValidation：PASS（typecheck PASS、309模块Vite构建、Checkpoint published），dist已更新为 assets/index-DxiIRWZo.js，未运行full core；仍有现有大chunk体积警告。

## 实测JSON闭环：多电机PRND入口遗漏（2026-10-15）

用户随后提供的[原始诊断JSON](../artifacts/performance-tcs/user-runtime-6.218.json)确认：SPORT_PLUS、LC IDLE、晴天干燥asphalt、SOC82.74%、温度正常、无热降额、ESC零介入。0–100为6.218358 s、91.175 m、峰值6.116229 m/s²、526.663609 Wh。除了首个120 Hz采样，油门一直不低于95%；实际液压制动仅在起步释放阶段存在约0.317 s，不是持续制动拖滞。

决定性证据：前电机全程输出至约310 Nm、消耗真实电池预算，但两个前轮的driveTorque始终为0。以2.008 s样本为例，前电机310 Nm而两个前轮均为0；后电机286.76 Nm、后轮各2146.85 Nm。车辆事实上只有后轴推进，前电机的功率仍被统计/扣除。后轮承担全部牵引，TCS累计2.558 s，是单轴驱动异常下的真实滑移反应；关闭TCS并不能找回丢失的前轴。

源码根因：DrivingGame的F3设置和普通shift按钮调用VehicleDynamics.requestDriveSelector，该方法原来直接调用primary transmission.requestSelector；Taycan的primary是后轴两速变速箱。ElectricPowertrain.prepare中虽然已有同步另一轴的逻辑，却只覆盖input.driveSelector入口。用户通过设置/shift从P/N选择D时，前轴仍留在P/N。此前所有性能脚本直接以D初始化两个轴，掩盖了这处真实生命周期缺陷。原始v1遥测没有每轴PRND字段，因此不能从上传文件区分前轴当时是P还是N，但两种状态都会断开该轴，受控N->D已复现相同的前轮零扭矩。

处理：在Powertrain边界增加统一requestDriveSelector；ICE仍委托其既有变速箱安全校验；EV先执行primary的原有制动/速度/方向安全校验，只有接受后同步另一轴。设置、shift和显式input入口全部复用它，拒绝请求不改变任何轴；不推进时间、重置热状态、增加功率或修改质量/抓地。每轴遥测新增selectorMode和wheelTorque，诊断器版本更新为v2，能直接观察此类脱节。

新增[实际选挡benchmark](../scripts/run-taycan-selector-benchmark.ts)，使用用户JSON中的实际位置（x=-1742.614、z=-166.516、地面0 m）、朝向、SOC及动力部件温度，同一CityGround/VehicleContactSystem/AccelerationTest，保持SPORT_PLUS。N起始隔离此前EPB历史，0.5刹车停车并捕获Auto Hold，比较F3直接请求、shift按钮、显式input以及初始D四条路径；各跑TCS ON/OFF、普通全油门/有效READY LC共16组。

| 路径/工况 | 修复前0–100 | 修复后0–30 | 修复后0–50 | 修复后0–100 | 修复后TCS OFF 0–100 | TCS ON累计：前→后 | 前轴轮端扭矩：前→后 |
|---|---:|---:|---:|---:|---:|---|---|
| F3直接选D / 普通油门 | 6.301 | 1.355 | 1.933 | 4.051 | 4.119 | 2.558→1.142 s | 0→最高2425.63 Nm |
| shift选D / 普通油门 | 6.301 | 1.355 | 1.933 | 4.051 | 4.119 | 2.558→1.142 s | 同上 |
| F3 / 有效LC | 5.853 | 1.156 | 1.734 | 3.683 | 3.752 | 2.558→1.142 s | 同上 |
| shift / 有效LC | 5.853 | 1.156 | 1.734 | 3.683 | 3.752 | 2.558→1.142 s | 同上 |
| input直接选D / 普通油门 | 4.051 | 1.355 | 1.933 | 4.051 | 4.119 | 1.142→1.142 s | 正常→正常 |
| 初始D / 普通油门 | 4.051 | 1.355 | 1.933 | 4.051 | 4.119 | 同上 | 正常→正常 |

修复前普通油门峰值6.116332 m/s²、526.720955 Wh，与用户6.116229 m/s²、526.663609 Wh分别相差不到0.01%和0.02%。绝对时间仍有0.082 s差异（停车/踏板初始历史未完整记录），不声称逐帧完全重放；主要性能与能耗异常均被复现。修复后峰值9.638792 m/s²、329.440715 Wh；普通TCS ON相对OFF快0.068 s，有效LC快0.070 s。没有进一步调整TCS或车型性能配置。

[修复前16组数据](../artifacts/performance-tcs/selector-before/summary.json)、[修复后16组数据](../artifacts/performance-tcs/selector-after/summary.json)保留各组完整轨迹。正式全车benchmark也已改为N->实际选挡入口D，并检查所有EV轴确实进入D；[全车最终24组](../artifacts/performance-tcs/selector-catalog-after/summary.json)的0–30/50/100与原after逐项完全一致，完整横向表仍适用（其Taycan是暖态标准LC 3.798 s，不能混成上述用户温度的3.683 s）。

本轮变更文件：
- src/vehicle/powertrain/Powertrain.ts：明确整车选挡边界。
- src/vehicle/powertrain/ICEPowertrain.ts：既有单传动系安全入口适配。
- src/vehicle/powertrain/ElectricPowertrain.ts：所有轴同步选挡并复用原安全校验。
- src/vehicle/physics/VehicleDynamics.ts：F3/shift请求经Powertrain边界。
- src/vehicle/powertrain/ElectricDriveUnit.ts、src/experimental/acceleration/AccelerationRunDiagnostics.ts：记录每轴PRND/轮端扭矩和v2版本。
- src/vehicle/powertrain/EVPlatformV2.selftest.ts：实际三入口、两轴motor->wheel扭矩守恒、P/R移动拒绝、缺少制动拒绝、停车P/R/N/D同步、N/P无驱动、双轴倒车。
- src/vehicle/powertrain/Powertrain.selftest.ts：不可用测试provider适配新边界。
- scripts/run-performance-benchmark.ts、scripts/run-performance-targeted-selftests.ts：真实选挡路径和Powertrain边界回归。
- scripts/run-taycan-selector-benchmark.ts、本报告及新增实测/复现结果。

本轮最终验证：16个定向套件全部PASS（含Powertrain边界133个断言、EV V2共2220个断言）；加速计时15组行为与被动诊断908个断言PASS；实际选挡16组均完成且前后轴均D、前轴轮端总扭矩最高2425.626 Nm；正式catalog 24组30/50/100与上一轮逐项一致；报告本地链接检查PASS。最终 `pnpm run build -BasicValidation` PASS：typecheck通过，按要求跳过full core，309模块构建完成并Checkpoint published，playable dist主资源为 `assets/index-B86OmAG6.js`。现有大chunk警告仍在，无构建错误。用户浏览器内修复后的实跑仍由用户验证；此处after均明确为经游戏接触/计时/真实选挡入口的确定性受控复测。
