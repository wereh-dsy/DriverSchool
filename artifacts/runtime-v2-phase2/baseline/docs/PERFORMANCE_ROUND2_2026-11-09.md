# DriverSchool 性能优化第二轮

本轮以开工时的工作区作为 A/B 基线，保留 11 月 8 日报告和原始记录。性能预览使用同一台机器的 Electron、完整 v507 地图、同一出生点和车辆、1186×658 视口、DPR 1.5、120 Hz 物理及 60 秒驾驶输入。路线覆盖密集城区出发、跨扇区、减速掉头和返回，两次均完成掉头。11 月 8 日的 16.0/25.6ms 和 671 MiB 是历史样本，表格使用本轮实际测得的起始工作区。 [原始数据目录](../artifacts/performance-round2/) · [机器可读汇总](../artifacts/performance-round2/comparison.json)

## 实现

- 道路缓存版本计算、边链和路口间隙索引、区域地形索引、地形采样、预制件实例及可见性包围体分批准备。由既有生成器和扇区发布路径生成原有几何。加载将渲染器、环境反射、驾驶系统和首屏实际渲染分开计时。主视图、阴影和各镜面经 GPU 完成确认后开放驾驶。
- 正常可见范围由实时视角和雾决定。初始化按静止出生姿态选取驾驶区域。道路预取随后跟随车速和前进方向。近扇区降级有短暂迟滞，旧扇区等对应远景页可用再退场。驾驶期间发布逐帧推进，后台 Worker 和 GPU 预热在慢帧后让出预算，近处优先。
- 远景改为追加不可变空间页，后续地形加入时复用已上传的缓冲。远景候选原始数据软预算 8 MiB，单个超预算部件可独立推进。分页目标 512 KiB，实测最大单页暂存 4.12 MiB。扇区和远景在顶点数允许时使用 16 位索引。实例变换以打包数组传递，静态模板继续共享。
- 道路配方和地形配方共用 42 MiB 淘汰目标。道路空闲缓存另受 128 条与 32 MiB 上限约束。活跃网格借用的地形和待装配的道路受保护，暂时允许越过软目标。本次路线结束配方合计 42.66 MiB，其中借用地形 14.16 MiB、待装配道路约 14.93 MiB。退出后配方、共享模板和 GL 缓冲计数归零。
- Worker 维持一个在途任务。队列去重，过期任务分批取消，取消后的实例模板只在编译成功时登记。道路和地形数据走可转移缓冲。真实加载进度、取消和重试仍使用现有界面与所有权规则。
- 预热按实际屏幕或离屏目标、相机层和材质变体去重。着色器记录实例有色和无色变体，共享材质的纹理只枚举一次，保留真实首屏的镜面及阴影渲染。
- 可见窗口在分批加载中途转入后台时，已申请的动画回调可能被暂停。加载让步最多等待 100ms，随后释放对应回调并继续处理进度或取消。这个边界由首个 EXE 自检发现，修复后单独验证。上面的日间对照在可见窗口完成，使用加此兜底前的同一版优化代码。

## 同路线结果

| 指标 | 开工基线 | 最终 |
|---|---:|---:|
| 点击至驾驶就绪 | 22.26 s | 8.60 s |
| 加载阶段最大帧间隔 | 778.5 ms | 267.2 ms |
| 驾驶 P50 / P95 / P99 | 8.9 / 17.0 / 29.2 ms | 9.1 / 15.8 / 41.8 ms |
| 驾驶最大帧间隔 | 91.5 ms | 61.2 ms |
| 驾驶超过 33 / 50 / 100 ms | 44 / 11 / 0 | 93 / 15 / 0 |
| 驾驶阶段 `performance.memory` 峰值 | 740.9 MiB | 557.0 MiB |
| CDP 主线程 JS Heap 采样峰值 | 369.7 MiB | 348.8 MiB |
| CDP Worker JS Heap 采样峰值 | 389.8 MiB | 474.9 MiB |
| CDP Worker 外部 backing storage 采样峰值 | 183.0 MiB | 132.5 MiB |
| GL Buffer 峰值 | 151.6 MiB | 100.1 MiB |
| 加载 Buffer 上传量 | 113.0 MiB | 35.8 MiB |
| 加载 `bufferData` 次数 | 8,243 | 5,485 |
| WebGL GPU 执行采样 P95 | 12.35 ms | 11.38 ms |
| 最大扇区更新 CPU 耗时 | 26.1 ms | 16.5 ms |
| Worker 完成任务计数 | 849 | 784 |
| Worker 道路任务 CPU P95 | 110.1 ms | 125.9 ms |

加载上轮最长的扇区同步初始化为 570.9ms。分批后，剩余最长的已归属段是首个实际主视图与阴影调用，CPU 墙钟耗时 264.2ms。道路 Worker P95 上升，Worker Heap 峰值也上升。CDP 每 10 秒采样，`performance.memory` 与各线程 Heap 样本来自不同口径。GL Buffer 为观测到的 WebGL 缓冲分配，不含纹理、驱动缓存或显存总量。

驾驶期最大已测 CPU 回调由 87.0ms 降到 50.7ms。最终样本在驾驶首帧后记录的较长 CPU 回调以渲染段为主，仍有帧间隔明显长于同期脚本执行的记录。稀疏 GPU 查询只覆盖 WebGL 命令执行，没有单独的 Electron 合成或系统调度归因。现有数据不能确认剩余尖峰来自哪一种等待，也没有将其归因于 GC。去程 P95 为 13.6ms，整体 P99、超过 50ms 的次数及加载最长停顿未达目标。远景页面由 10 个批次变为 57 个较小页面，保留了更多细粒度剔除机会，也可能增加特定视角的绘制调用。记录含第一次实施样本，未从多个运行中只取最佳帧时间。

## 验证与改动清单

- 加载专项通过，覆盖进度、取消、重试、过期发布、缓冲所有权、GPU 完成门禁、实例材质变体和碰撞预加载。Electron 同路线实跑完成并退出，退出时两边的 GL 缓冲和配方均归零。 [加载专项](../artifacts/performance-round2/focused-check.json) · [GPU 检查](../artifacts/performance-round2/gpu-check.json) · [Worker 取消回归](../artifacts/performance-round2/worker-check.json) · [窗口可见性回归](../artifacts/performance-round2/loading-visibility-check.json) · [最终退出记录](../artifacts/performance-round2/final-day-release.json)
- 已核对开工快照中 1,095 个文件的指纹，正式地图哈希、Git HEAD、四个既有 Release 归档哈希均保持一致。 [25 个修改文件及保全记录](../artifacts/performance-round2/preservation.json)
- 最终源码完成正常 `pnpm run build`，包含完整类型检查、v507 基线验证、核心自测和生产发布，退出码为 0。桌面构建、标准 Windows 打包、22 个生产资源一致性核对和实际 EXE 启动均通过。正式 EXE 在独立目录 `D:/DriverSchoolRelease/DriverSchool-Performance-Round2-20261109-final/DriverSchool-win32-x64`。可见窗口从菜单进入清江市，加载进度单调递增，卸载进度层后通过真实鼠标转头操作。记录无脚本异常或资源请求失败。 [构建日志](../artifacts/performance-round2/build.log) · [包内容验证](../artifacts/performance-round2/package-content-check.json) · [EXE 验证](../artifacts/performance-round2/release-smoke.json) · [正式版加载截图](../artifacts/performance-round2/release-loading.png) · [正式版后视镜截图](../artifacts/performance-round2/release-mirror.png)
- 实跑截图和逐帧记录位于本轮 artifacts。冷启动对照已覆盖日间城区和掉头，雨夜、缓存重进和更长时间的反复跨扇区留给人工验收。可在正式版进城后沿主干道进入下一个扇区，再掉头返回，观察后视镜、阴影和远景接替。雨夜可走同一路线核对视觉及尖峰。

[加载截图](../artifacts/performance-round2/final-shot-cold-day.png) · [驾驶截图](../artifacts/performance-round2/final-drive-cold-day.png) · [最终逐帧原始数据](../artifacts/performance-round2/final-cold-day.json)
