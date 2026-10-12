# Vehicle Platform Foundation V1

完成日期：2026-10-11。

## 架构与迁移

- 扩展 VehicleCapabilities：navigation、laneDisplay、parkingRadar、parking360、tpms、acc、lka、lcc、bsd、mirrorSystem。原有结构能力仍从安装配置派生；未安装 ACC/LKA/LCC/BSD 控制器，保持 false。parking360 表示八区距离显示，surroundView 仍表示环视摄像头，两者独立。
- BMW 530Li、Audi A6L、Tesla Model 3 的目录声明已迁移。未迁移其他车型的环境数据入口。
- SharedVehicleData 是车辆实例拥有的统一环境数据服务；提供当前/左右车道、边界、曲率、横向偏移、道路方向、当前道路与限速、附近路口、地图索引、八区距离和四轮 TyreStatus。
- 地图、车道、雷达按 10 Hz 查询；选挡、电源状态、停车速度阈值、地图切换立即刷新。地图名称和导航路径在原数据不存在时为 null。车道数据来自现有道路几何，雷达来自现有碰撞索引；未修改道路系统。
- BMW/Tesla 显示适配器借用相同数据对象；Audi 仪表借用环境数据，保留其页面、动画、行程与巡航显示。未新增驾驶辅助控制器。
- TPMS 压力以 kPa 表示，默认 pressure=null、warning=false、valid=false；无真实胎压模拟。BMW 原来的参考值与标记保留，提供有效读数时通过同一接口显示。其他皮肤可直接使用该数据及通用状态页。

## 缓存与所有权

- VehicleAssetRegistry 由一个 DrivingGame 拥有，按配置对象身份和资源段缓存，未使用进程级全局缓存。
- 三辆验证车型复用车身、车轮模板和静态几何/纹理；每个实例复制场景节点与可变材质。转向、车轮旋转、灯光、氛围灯、屏幕内容相互独立。
- BMW 座舱多数完成的静态几何、固定文字和徽标纹理复用；具有后续顶点编辑的 loft 和方向盘轮缘仍使用实例几何，避免重复修改共享顶点。
- BMW 仪表背景、装饰、刻度按模式缓存；Audi 使用缓存刻度底图；Tesla 缓存固定车机页眉，并将地图绘制与动态读数分开。BMW/Tesla 保留原有约 20 Hz 动态刷新及状态立即刷新；BMW 地图与 Tesla 地图最高 10 Hz；Audi 保留现有动画刷新。
- 几何、模板材质和静态纹理由 registry 释放；动态材质、动态 CanvasTexture 与镜子目标由实例释放。活跃实例存在时禁止销毁 registry，车辆重复 dispose 安全。

## 初始化与镜子

- 生命周期：Static asset prepare → Instance creation → Dynamic state init → Visual warmup → Ready；错误进入 Failed 并显示加载失败。
- 车型切换分帧准备静态资源、创建实例和初始化状态。预热期间暂停物理推进，避免累计加载时间产生物理追帧。
- 纹理每批最多四张上传；随后异步编译车辆着色器；左右镜子分别在不同帧首次渲染；中央镜子单独预热；最终准备主视图后允许驾驶。
- 首次启动保留现有同步场景/实例构建，GPU 预热分帧进行；并非将全部首次 CPU 建模工作异步化。
- MirrorSystem 统一拥有左右与可选中央镜子。配置可分别关闭左右动态反射、使中央镜面保持静态；禁用的中央镜子不创建 render target。原有镜面几何、分辨率、相机数学和三辆车型的默认反射策略保留。

## 修改文件

新增：
- src/vehicle/SharedVehicleData.ts
- src/vehicle/VehicleLoadingLifecycle.ts
- src/vehicle/visual/VehicleAssetRegistry.ts
- src/vehicle/VehiclePlatformFoundation.selftest.ts
- scripts/run-vehicle-platform-foundation-selftests.ts

接入与显示：
- src/vehicle/VehicleCapabilities.ts
- src/vehicle/VehicleCatalog.ts
- src/game/DrivingGame.ts
- src/camera/MirrorSystem.ts
- src/ui/Hud.ts
- src/vehicle/visual/VehicleVisualConfig.ts
- src/vehicle/visual/VehicleVisual.ts
- src/vehicle/visual/Cockpit.ts
- src/vehicle/visual/BMW530Cabin.ts
- src/vehicle/visual/BMW530Instruments.ts
- src/vehicle/visual/BMW530CenterDisplay.ts
- src/vehicle/visual/InstrumentCluster.ts
- src/vehicle/visual/ElectricCenterDisplay.ts
- src/vehicle/visual/ElectricDisplayContext.ts
- src/vehicle/visual/ExecutiveDisplayContext.ts
- src/vehicle/visual/DrivingSceneDisplayContext.ts
- src/vehicle/visual/DrivingEnvironmentView.ts
- src/vehicle/visual/LuxuryVehicleStatusPage.ts

验证适配：
- src/vehicle/physics/VehiclePlatform.selftest.ts：扩展能力字段断言。
- src/vehicle/visual/BMW530Li.selftest.ts：读取当前已有燃油/巡航图标旁的数字。
- src/vehicle/visual/TeslaExperience.selftest.ts：Canvas 测试替身支持缓存文字层的合成。

本轮没有修改车辆物理参数、驾驶控制、外观构造参数、地图、AI 交通或考试系统；工作区原有修改保留。

## 验证与剩余限制

- pnpm run typecheck：通过。
- 12 组针对性检查全部通过：foundation、platform、catalog、BMW、BMW cabin、Tesla、scene data、instruments、mirrors、dimensions、lighting、Audi。
- Foundation 新增 37 条边界断言；三车缓存前后网格数量、顶点数量、车身边界一致，验证几何共享、材质与车轮状态隔离、资源释放、地图失效、TPMS、异步初始化顺序。
- 复用现有车辆平台、三车物理/显示及镜子检查，没有运行全地图或无关系统测试。结果保存在 validation-results.json。
- pnpm run build -BasicValidation：通过，生产构建已原子发布到 dist。使用项目现有 BasicValidation 参数避免构建脚本再启动包含全地图检查的 core 汇总。
- 构建产物主 JS 约 15.74 MB，Vite 提示大 chunk。这仍可能影响首次下载/解析，未扩展范围修改地图数据打包。
- 代码检查发现 BMW 首次复杂几何生成、多纹理上传和多个镜子首次渲染是集中工作来源。已分离 GPU 阶段并复用后续实例资源；首次建模部分 CPU 工作和运行中的多个镜子场景渲染仍保留。
- 未进行实机 GPU 性能基准、主观驾驶或视觉调校；上述测试主要使用确定性检查和 Canvas/WebGL 替身，不等同于真实浏览器画面验收。
