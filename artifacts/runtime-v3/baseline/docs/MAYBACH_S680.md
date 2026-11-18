# Mercedes-Maybach S 680 4MATIC V12

2026-10-30。稳定 ID：`mercedes-maybach-s680-z223`。Z223 V12 原型，独立车型配置、外形、前排、仪表、车机及声音，注册到原有选车/F5、驾驶模式、导航、驾驶辅助与加载流程。后排依最后指示保留四座及双屏轮廓，删去不可见的脚托、杯架、控制面板等细节。

## 参数依据与工程标定

原型数据参考 [Mercedes-Benz 2025 V12 资料](https://media.mercedes-benz.com/article/9cd9e1c9-7505-48e4-af52-3d37abae5e88) 的 5980 cc、450 kW/612 PS、900 N·m、5469×1921×1510 mm、3396 mm 轴距及 4.5 s 加速；[MBUSA Z223 V12 资料](https://media.mbusa.com/news/2022-mercedes-maybach-s-class-sedan-quick-reference-guide) 提供九速、31:69 四驱、Maybach 二挡起步及 4.5° 后轮转向参考。市场功率表述和不同配置质量不可混用。本车按请求采用约 2.575 t 配置目标，并非复现某一认证称重版本。

| 项目 | 本车实现 |
| --- | --- |
| 发动机 | 60° V12、5.980 L、双涡轮等效轴，无 ISG/电驱；650 rpm 怠速，6200 rpm 限制 |
| 净输出 | 2000–4000 rpm 900 N·m；5250–5500 rpm 约 450 kW；净曲线补回内部摩擦后再走正常摩擦扣除，避免重复扣损 |
| 惯量/增压 | 曲轴参考惯量 0.65 kg·m²；涡轮等效惯量 0.10，最大绝对压比 2.15；均为工程估值 |
| 9G-TRONIC | 5.354 / 3.243 / 2.252 / 1.631 / 1.211 / 1 / 0.865 / 0.717 / 0.601；倒挡 −4.13，主减速 2.82，效率 0.91 |
| 换挡/变矩器 | 0.42 s 有限换比过渡；换挡节气门保留 0.84、传递能力保留 0.92；液压充油 3 s⁻¹，最大泵/锁止能力 1250 N·m |
| 四驱 | 常态及加速均前 31% / 后 69%，前后开放差速器，沿现有轮胎/TCS 路径施力 |
| 质量/布局 | 基础质量 2524 kg + 默认 68.4 L 燃油约 51 kg；前轴静载 53%；重心高 0.56 m，偏航惯量 6550 kg·m²（估值） |
| 悬架 | 前后多连杆轴级运动学；每角前 34 / 后 32 kN/m 弹簧；总行程 210 mm |
| 阻尼 | 压缩前/后 2450/2300、回弹 3900/3700 N·s/m；Comfort×1、Sport×1.25、Maybach×0.88，平滑切换（工程估值） |
| 防倾杆 | 前 19.5 / 后 14.5 kN/m；防俯冲 20%，后轴抗抬头 20%（工程估值） |
| 空气悬架 | 真实弹簧 rest geometry 调节；Comfort 145 / Sport 133 / Maybach 153 mm；调节 6 mm/s；120 km/h 持续 8 s 后降至 130 mm，90 km/h 以下恢复 |
| 转向 | 前轮上限 34°、16.8:1；后轮上限 4.5°，低速反相、高速同相，8–22 m/s 平滑过渡；进入真实轮胎力及可视轮角 |
| 车轮 | 20 英寸五孔锻造式碟面、真实镂空及内凹结构，前 255/45、后 285/40；共同有效半径 0.369 m，冷胎表压 260/280 kPa |
| 热保护 | 发动机 115–135°C、ATF 125–155°C 渐进降额，最小能力 50%；ATF 按泵/涡轮滑差和齿轮损失计热、按车速散热（估值） |

未获得原厂减振器曲线、重心、转动惯量、涡轮图谱或声学传递函数；上述相关值均是明确的工程估值。空气悬架沿既有真实垂向支撑模型，未实现空气容积/阀路、路面预瞄或 E-ACTIVE BODY CONTROL。

## 模式与加速精修

| 模式 | 踏板指数 / 响应 s⁻¹ | 轻负载 20% 踏板升挡参考 | 起步 | 同条件 0–100 km/h |
| --- | --- | --- | --- | --- |
| Comfort（NORMAL） | 1.24 / 3.2 | 1700 rpm | 一挡 | 4.583 s |
| Sport | 1.04 / 4.2 | 2500 rpm | 一挡 | 4.458 s |
| Maybach | 1.30 / 1.8 | 1500 rpm | 二挡；深踩允许正常 kickdown | 4.908 s |

120 Hz、平路、默认燃油、静止直接踩全油门、无 rollout。旧标定 5.583 s 的主要问题是 2000 rpm 增压建立过迟、参考惯量偏大、换挡节气门削减过深，以及净曲线重复扣摩擦。修正这些边界后，台架式稳态净扭矩为 899.997 N·m（2000/4000 rpm），5500 rpm 780.998 N·m、约 450 kW。未增加峰值功率、降低车重、提高轮胎抓地或直接改写速度。

同一渐进 48% 踏板 16 s 后车速：Comfort 56.3、Sport 86.1、Maybach 43.4 km/h；峰值逐步加速度变化率约 9.09 / 15.23 / 7.36 m/s³。它们是该固定输入工况的游戏结果，不能当成整车乘坐舒适性认证。

## 声音、前排与外观

- 独立 V12 谐波、真实十二缸四冲程点火频率、物理增压声源；低负载克制，重负载逐渐加厚，不加排气爆裂。
- 单一原有 AudioContext。车内外分别设增益与发动机/进气滤波，车内路噪/风噪总线低通 1350 Hz；外部保持 V12 音色，不把整车音量统一调低。音量与滤波为工程目标，未做实车频谱/声压测量。
- 独立连续侧围、机盖、顶盖和前后端面，黑银双拼、直瀑格栅、立标、独立五孔锻造轮圈。轮胎为空心截面，轮毂不会被轮胎实心端盖遮住。
- 深色多投射灯腔、受控制器驱动的遮罩发光面、三枚导光标识及细灯带；暗红透镜、分层尾灯和独立制动/转向/倒车输出。关闭时发光强度为零，避免整片白色发光材质。
- 前排使用连续仪表台/木饰板/门板返回曲面、真正的深色出风口。仪表前移并由背后底座承托，OLED 竖屏背壳连续连接中央通道；修正陷入、悬空、重叠表面及反白。
- 独立 Maybach Classic 仪表，1600×750 画布细刻度、金属渐变环、平滑真实指针、清晰字体、车辆图示和真实状态灯；独立 768×1024 竖屏及后屏，借用已有导航/TPMS/轮荷高度数据。导航暗色底图仅在本皮肤传参，不改共享地图。
- 屏幕、仪表与内饰玻璃分别持有材质；车辆实例之间也不共享可变屏幕。缝线、木纹、扬声器、按键和轮毂机加工细节主要用贴图。
- 紫晶上层和暖金下层间接氛围灯，模式颜色平滑变化。点火约 2 s 双 M/金色细光迎宾及约 2.4 s 氛围渐亮为本项目设计，非已核实的原厂动画；始终保留真实速度/挡位。

## 验证与发布

- 动力精修后的车型专项 50 项通过；E300L 定向回归、AT/DCT 后端与换挡专项通过，记录在 [动力验证](../artifacts/maybach-s680/physics-validation.json)。该记录在最后一轮纯视觉修正之前生成，未把它冒充最终视觉版本的重新全测。
- 最后前排/车灯/轮毂修正使用原生 WebGL 画面检查：[驾驶位](../artifacts/maybach-s680/driver.png)、[车外](../artifacts/maybach-s680/exterior.png)、[夜间](../artifacts/maybach-s680/night.png)；无渲染错误。当前整车 279 Mesh、170734 顶点，含真实镂空轮毂，见 [画面记录](../artifacts/maybach-s680/render-validation.json)。镜面截图仅为材质画面，本地预览未配置实时镜面反射；游戏仍接原有平面镜系统。
- typecheck 已通过；早期隔离 Vite 轻量构建通过。按最后指示不再扩大验证范围或重跑未改动的动力测试，不运行全量 core/systems。
- 最终 `pnpm run desktop:package` 通过：`build -BasicValidation`（最终 typecheck + Vite，无 core 全测）、Browser dist 原子发布、桌面编译与完整目录发布均成功。正式入口 `D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe`，发布后的 app.asar 与本次打包一致。仅保留已有大 chunk 体积提示，未运行正式包自动驾驶或扩大测试范围。

## 2026-10-31：车门、车窗、声音与大灯

参考 [Z223 原始车型资料](https://media.mercedes-benz.com/en/article/3ac7e072-f683-494d-81ac-9e2b88a6fb2f) 的隔音玻璃、三 LED 光源及 DIGITAL LIGHT 光学布局。本项目仍对应前期 Z223，不混用 2026 改款双星灯或 MB.OS 界面。原厂提及的电动舒适门属于后门装备；本次主驾的缓慢吸合是工程动画近似，不宣称复现后门电动开闭系统。

- 主驾驶侧围按同一曲面拆出真实门洞及双拼门皮；门边返回、胶条、门内饰、木饰板、扬声器、氛围灯、门控面板和左右视镜中的左镜随真实铰链移动。开启 66° / 0.72 s，关闭 1.05 s，最后 8% 行程用 0.28 s 缓慢吸合。
- 主驾隔音玻璃 2.7 s 全行程，沿门框倾斜下降 535 mm，可停在任意位置、反向升降；实例独立的门沿裁切面随门运动，避免玻璃穿进扶手。共享资源实例也独立重建裁切面。
- 接入现有停稳联锁、上下车镜头、步行和靠近车门上车。上车结束自动关门；门灯在熄火开门时仍可亮。仪表显示真实未关门提示，车机车辆页显示真实门窗位置。
- V12 底音改为严格半阶缸列音、整数高阶谐波，减少通用发动机拍频和怠速调制；补充负载音色层次、保持克制的物理增压气流。开窗同时释放发动机增益与高频；开门声场覆盖窗贡献，避免双重放大。其他车型仍使用原来的混合规则。
- 独立合成迎宾三音、短确认、巡航、低燃油、车门警告和泊车音色/节奏；转向提示更柔和。新增锁扣、关门低频、电吸尾段和升降窗电机声。车外不播放本车仪表/转向提示；泊车提示距离越近间隔越短。均为项目合成近似，未取得原厂音源或声学测量，不称为原厂录音。
- 大灯从普通圆锥配光改为 256×256 角强度纹理投射：近光左侧截止、右侧路肩抬升；远光集中热点并保留近光近场。照射真实道路/墙面，不铺贴地发光平面。暖中性白、暗灯腔、透镜纹理与渐变发光核心分离；增加 DIGITAL LIGHT 微刻与随门转向后视镜灯。
- 操作默认：`0` 开关主驾门，按住 `9` 降窗 / `8` 升窗，`Tab` 上下车；下车后方向键/原有步行控制绕车，靠近主驾门再 `Tab` 上车。请在挂 P 并驻车后下车。

专项结果：[43 项本车检查、157 项现有交互、403 项现有灯光检查](../artifacts/maybach-s680/access-validation.json) 均通过，typecheck 通过。未重跑动力标定、全量 core 或 systems。原生 WebGL 检查 6 个视图、无错误，当前 295 Mesh / 172993 顶点；见 [开门](../artifacts/maybach-s680/access-open.png)、[半开窗](../artifacts/maybach-s680/window-half.png)、[近光](../artifacts/maybach-s680/low-beam.png)、[远光](../artifacts/maybach-s680/high-beam.png) 和 [渲染记录](../artifacts/maybach-s680/access-render-validation.json)。[8 秒声音预览](../artifacts/maybach-s680/v12-audio-preview.wav)：0–2 s 关窗怠速，2–3 s 关窗负载，3–5 s 开窗，5–8 s 车外负载；为离线合成检查，非实车录音或主观听评。

本次 `pnpm run desktop:package` 已成功：最终 typecheck、`build -BasicValidation`、Browser dist、桌面编译与完整正式包发布均通过，保留原有大 chunk 提示。正式入口为 `D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe`。随后使用独立临时用户目录打开正式 EXE，主菜单和画布正常、无运行时异常，检查窗口已关闭，见 [启动记录](../artifacts/maybach-s680/release-smoke.json)；未进行自动驾驶。

本轮修改：`MaybachS680{VisualConfig,Exterior,Cabin,Displays,Textures}.ts`、`MaybachS680AudioProfile.ts`；`VehicleVisual{,Config}.ts`、`InstrumentCluster.ts`、`LuxuryVisualProfile.ts`、`VehicleLighting.ts`、新增 `HeadlampBeamTexture.ts`；`interaction/{DriverAccessController,VehicleInteractionController,VehicleInteractionDefinition}.ts`；`EngineAudio.ts`、`VehicleAudioProfile.ts`、`VehicleCabinAcoustics.ts`、`DrivingGame.ts`；新增 `MaybachS680Access.selftest.ts`、`run-maybach-s680-access-selftests.ts`、本报告与定向 artifacts。

简化边界：现有共享交互仅支持主驾门/窗，其他门窗保持静态；无真实障碍物防夹、电动后门、行人肢体动画。投射配光是工程估值，未实现 130 万微镜、感知式防眩遮蔽/道路符号投影或动态自动调平；沿现有无投射阴影的车灯路径，复杂遮挡可能漏光。

本轮人工验收：挂 P 驻车后测试门开关及软吸合；半开窗时再开门确认玻璃/门卡/镜子同步；Tab 下车绕车后回门边上车；比较关窗/开窗/开门/车外的怠速与深踩声；听迎宾、模式、转向、泊车节奏；夜间对墙观察近光截止线、右侧路肩和远光热点，再到道路检查可见距离及颠簸时的光束。

## 2026-10-31：氛围灯接缝修复与主动照明

按 [Maybach Z223 原厂介绍](https://media.mbusa.com/news/the-new-mercedes-maybach-s-class) 的玫瑰金白、紫晶流光主题，以及 [S-Class 同代主动式氛围照明资料](https://media.mbusa.com/news/meet-the-s-class-digital-luxury-well-being) 的多层光带设计细化。本车配色、亮度和灯槽尺寸是视觉工程近似，未取得原厂灯具 CAD 或光度数据；不通过堆叠约 250 个独立 LED Mesh 模拟原灯。

- 修复根因：旧门板灯线向前进入仪表台、旧中控末端进入扶手、空间样条转角外偏及门板末端陷入饰板。现在改为沿饰板采样的平面光学灯槽；主灯带与门板以圆角相接，闭门中心线接缝约 0.636 mm。门板曲面加窄返回面承托灯槽，照明跟随门体，开门后自然分离。
- 中控灯线沿屏幕外侧及瀑布肩部下落，末端 z=0.216 m，留在 z=0.250 m 的扶手起点之前；不横穿屏幕、金属框或皮革扶手。
- 主动灯带、直接照明、间接照明、重点照明四个区域独立开关；上层光带、下层暖光、前排脚窝、扶手下、顶控区和柔和饰板反射分层。日夜自动调整亮度，点火即可启用，不依赖车外大灯；熄火平滑淡出。吸合门灯仍按实际开门单独工作。
- 贴图扩散光芯替代硬管霓虹，保留深度遮挡；迎宾与模式变化沿统一光带路径做短时色彩渐变，日常保持稳定。只有短动画在 20 Hz 更新顶点色，稳态不上传光带动画贴图。
- 车机第三页改为“氛围”：两套 Maybach 专属主题近似、64 色、总亮度与四区开关都改变实际灯光。颜色缓慢过渡，不影响仪表/导航独立材质。设置随当前车型实例保留，不新增存储规则；切车重建会恢复默认。
- 本轮只新增 13 个 Mesh、396 顶点，整车目前 308 Mesh / 173389 顶点。没有新增依赖或更改其他车型灯光。

验证限于本次视觉与交互：7 个原生 WebGL 视图无错误；核对仪表台/门接缝、扶手前收尾、开门分离与通过真实屏幕射线切换主题，见 [氛围灯记录](../artifacts/maybach-s680/ambient-render-validation.json)。[前排夜景](../artifacts/maybach-s680/ambient-front.png)、[右门](../artifacts/maybach-s680/ambient-right.png)、[开门](../artifacts/maybach-s680/ambient-door-open.png)、[氛围控制页](../artifacts/maybach-s680/ambient-settings.png)、[玫瑰金白](../artifacts/maybach-s680/ambient-rose.png)。未重跑动力专项、core 或 systems。

本轮修改：新增 `visual/MaybachS680AmbientLighting.ts`；修改 `MaybachS680Cabin.ts`、`MaybachS680Displays.ts`、`MaybachS680VisualConfig.ts`，以及本报告和氛围灯画面记录。最终 `desktop:package` 已通过（typecheck、BasicValidation、Vite 与完整桌面发布）；正式包与本次内部包哈希一致。正式 EXE 启动菜单正常，无运行时异常，检查窗口已关闭；未重跑动力专项或全量测试。

人工验收：夜间左右转头检查灯带与屏幕、门板、扶手；开关主驾门确认灯槽与饰板同动；车机“氛围”页切换两主题及任意色，分别关闭四区并点击亮度条；熄火确认平滑淡出。无新增 BSD/ACC/空调联动或模拟安全告警，未声称移植原厂完整主动灯光系统。

## 2026-10-31：消除电机感与修正仪表车辆透视

本轮只处理发动机音色和仪表中心车辆图示，不改变动力、变速箱或底盘标定。

- 旧音色以半阶正弦底音、随转速升高的机械纯音为主，排气波形又经过过强的低通，听感容易接近电机。新标定减少底音到原相对层增益的 0.58、高阶层到 0.48、机械纯音到 0.18；排气使用较完整的燃烧谐波，缸列底音也采用柔和谐波波形，保留十二缸的平稳点火节奏。
- 加入由现有真实点火振荡器调制的宽频燃烧气流层，随负载、车内外隔音和收油衰减变化；仅 Maybach 通过可选参数启用，继续复用同一个 AudioContext、压缩器、排气滤波和音频生命周期。未增加排气爆裂、随机失火或赛车式粗糙怠速。
- 中央车辆图示改为同一台固定透视相机投影的 Z223 比例车身，后窗、双拼、轮胎、圆角车尾、尾灯与开门轮廓共享坐标；使用两张启动时准备的 320×320 画布，无新增车内 Mesh 或持续的离屏 3D 渲染。
- 原车道线在车辆后绘制并覆盖车身，且使用另一套线性缩放。现在车道线与车辆使用相同透视，先画道路、再画车辆；仪表泊车图层也不再叠加第二个平面车辆框。
- [声音与图示记录](../artifacts/maybach-s680/sound-icon-validation.json)：原生 Web Audio 生成同工况新旧 8 秒对比，无运行时错误、无削波；旧/新峰值约 0.118 / 0.093。合成峰值只用于电平检查，不代表实车声压或主观听感认证。[新声音](../artifacts/maybach-s680/v12-refined-tone.wav)、[旧声音对照](../artifacts/maybach-s680/v12-before-tone.wav)、[仪表画面](../artifacts/maybach-s680/instrument-perspective.png)、[开门图示](../artifacts/maybach-s680/icon-door-open.png)。声音片段依次为关窗怠速、关窗负载、开窗负载、车外负载。

本轮文件：`audio/{EngineAudio,VehicleAudioProfile,MaybachS680AudioProfile}.ts`、`visual/MaybachS680Displays.ts`、新增 `visual/MaybachS680InstrumentCar.ts`，以及报告与声音/画面记录。原厂录音和原厂 HMI 车辆资产未取得，仍为本项目合成及程序绘制近似。没有运行全量测试或重新测量加速。

最终 typecheck、BasicValidation 与 Vite 发布通过。第一次桌面替换因运行中的正式游戏占用目录而报 EBUSY；正常关闭游戏窗口后，复用已通过产物，仅重试 `desktop-package.mjs`，完整桌面发布成功。正式包与内部包哈希一致，随后正式 EXE 启动菜单正常、无运行时异常，独立检查窗口已关闭。仍保留原有大 chunk 体积提示。

人工验收：车内/车外分别听怠速、缓加速和深踩，确认燃烧质感与静谧性；观察仪表车辆与道路的前后遮挡，开关主驾门确认图示状态。

## 2026-11-01：仪表灯光符号与固定排布

核对 [2022 Z223 原厂车主手册](https://static.oneweb.mercedes-benz.com/css-oom-assets/en-iq/pdf/mercedes-maybach-s-class-saloon-2022-march-z223-mbux-owners-manual-01.pdf) 印刷页 8–11 的标准/带驾驶员摄像头仪表示意，以及印刷页 164–165 的灯光指示替换规则。本车采用标准显示屏布局，按本项目 1280×600 设计空间适配，不混用两种硬件布局。

- 移除 `LOW`、`HIGH` 文字与 Unicode 三角形，重绘近光、远光、示宽灯、前/后雾灯和转向箭头的矢量路径。近光绿色斜向光线，远光蓝色平行光线，后雾灯琥珀色、朝向相反，前雾灯绿色。
- 左下固定主灯位置依示宽→近光→远光优先级替换显示；后雾灯独立位于其上。前雾灯为项目现有独立开关的状态，另预留固定位置，不声称原厂 Z223 装有独立前雾灯。没有显示未实现的自适应远光 A 标记。
- 左右转向箭头分别置于对应表盘正上方；双闪只跟随控制器的实际共同闪烁相位。驻车制动改为下方中央红色括号圆 P，HOLD 保留左表盘下方独立位置。
- 电瓶、发动机、ABS、胎压与防滑警告改为固定图形位置，不随亮灯数量重新挤排。品牌标题上移，里程移至底部，避开告警和驻车符号；只显示已有遥测报告的状态。
- 灯光状态变化绕过平常的画面节流；短促闪灯、转向亮灭立即更新。未修改共享灯光控制器、实际远近光配光或其他车型仪表。

本轮仅修改 `visual/MaybachS680Displays.ts`，新增 `visual/MaybachS680TellTales.ts`，以及报告和定向画面。十组实际控制器状态到仪表的原生画布检查通过、无渲染错误，见 [检查记录](../artifacts/maybach-s680/telltales-validation.json)、[近光](../artifacts/maybach-s680/telltales-low.png)、[远光](../artifacts/maybach-s680/telltales-high.png)、[雾灯](../artifacts/maybach-s680/telltales-fogs.png)、[双闪](../artifacts/maybach-s680/telltales-hazards.png)、[告警组合](../artifacts/maybach-s680/telltales-warnings.png)。没有重跑声音、动力、全量 core 或 systems。

本轮 typecheck、`desktop:package` 轻量构建与发布已通过，正式包与内部包哈希一致。[正式 EXE 启动检查](../artifacts/maybach-s680/telltales-release-smoke.json) 显示主菜单及画布正常、无运行时异常，独立检查窗口已关闭；仍保留已有大 chunk 提示。人工验收：依次切换示宽/近光/远光和闪灯，确认左下同一位置替换；测试左右转向及双闪、前后雾灯；驻车和 HOLD 分别核对位置，确认其他告警不会挤动灯光符号。

## 已知简化与人工验收

这是程序化原型复刻，不是原厂 CAD 或 MBUX 全功能移植。只有项目支持的导航、车辆状态和驾驶功能；无 ACC/BSD、按摩、真实空调/娱乐后端。后排按最后指示简化。多连杆是轴级线性运动学，后轮同轴平行转向，不求解后轮 Ackermann；双涡轮用一个等效轴；热预算为集中参数模型。未做主观驾驶评价或真实 NVH 声学测量。

人工验收：

1. 冷启动与迎宾后检查仪表下沿、支座、转向轮遮挡和车机背壳；切换白天/夜间确认文字、反射和氛围层次。
2. 比较三模式轻踩起步、堵车停车/再起步、深踩 kickdown、100–140 km/h 超车与九挡巡航。
3. Comfort/Maybach 低速过减速带，检查回弹、点头/抬头、轮荷和车轮是否穿模；低速掉头与高速小转向检查后轮转向。
4. 在车内外比较怠速、轻负载与重负载声音；核对 V12 细腻度和路/风噪隔绝。
5. 近看五孔轮圈深度、车身接缝、灯腔；依次关闭、近光、远光、转向、制动、倒车，确认没有常亮假白。

## 修改文件

新增：`src/vehicle/config/maybachS680PhysicsConfig.ts`、`src/audio/MaybachS680AudioProfile.ts`、`src/vehicle/visual/MaybachS680{VisualConfig,Exterior,Cabin,Displays,Textures}.ts`、`src/vehicle/MaybachS680.selftest.ts`、`scripts/run-maybach-s680-selftests.ts`、本说明与车型 artifacts。

接入：`VehicleCatalog.ts`、`VehicleCatalog.selftest.ts`、`VehicleDimensions.ts`；`VehiclePhysicsConfig.ts`、`defaultVehiclePhysicsConfig.ts`；`Engine.ts`、`SteeringSystem.ts`、`VehicleDynamics.ts`；`TransmissionSystem.ts`、`automatic/{AutomaticShiftController,AutomaticTransmissionSystem,TorqueConverter}.ts`；`VehicleAudioProfile.ts`、`EngineAudio.ts`；`visual/{Cockpit,CockpitLayout,InstrumentCluster,VehicleStaticAssets,VehicleVisual,VehicleVisualConfig}.ts`；`game/DrivingGame.ts`。新动力/传动/音频边界均为可选配置，不覆盖 A6L、E300L、530Li 标定。
