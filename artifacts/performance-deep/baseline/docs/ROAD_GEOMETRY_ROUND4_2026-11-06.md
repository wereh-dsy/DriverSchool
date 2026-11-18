# Road Geometry Round 4 — 复杂结构补齐

本轮在 Round 3 未提交源码上继续实现。正式地图、中心线、高程、连接、导航、碰撞及车辆代码未改；旧渲染器仍是默认实现。开发入口继续使用 Round 2 的同一份显式白名单，不扩大地图启用范围。

## 实际完成

| 结构 / 实际对象 | 本轮实现 | 边界 |
|---|---|---|
| 地下通道 `urban-rail-underpass:underpass` | 连续实体侧墙、带内侧法线的闭合顶板及洞口截面；沿既有 barrier EdgeChain；保留顶板上方覆土 | 原 1.8 m 人行道超出现有墙体支撑合同，路面和人行道保留旧版，仅升级围护壳体；净空仍取原 6 m |
| 下沉进口 `urban-underpass-end-approach` | 挡墙沿真实纵坡生成，沿用既有支路开口；仅在单一、等宽、XYZ 相容的连续段之间取消内部封盖 | 异宽、分叉、不同结构类型处保留端盖，不臆造连接；原路面及人行道保留 |
| 交通岛路口 `urban-junction-80` | 允许平坦、已有铺面轮廓的交通岛路口使用新铺面；复用 JunctionSurface 多边形裁剪，将既有岛体脚印从路口及相连道路铺面排除 | 此对象的两个 2×2 m 岛体位于权威铺面 fan 外侧，不能宣称修复了它本不存在的“岛体与 fan 重叠”；孔洞裁剪另用一个小型几何夹具检查 |
| 六进口分离路口 `urban-junction` | 沿用同一份权威 fan、铺面所有权和进口标线投影，随本轮截图保留现场 | 没有重建路口拓扑，也没有以新的大平面覆盖；静态几何数量不变 |
| 异宽减速汇入 `regional:qingling:S-to-E-right:deceleration` | 取消对所有 highwayTransition 的笼统拒绝；标线投影到显式主路、决策路及相关延续段的最终铺面；正确处理有局部旋转/平移的箭头 | 按实际标线世界包围盒筛选，同层容差 0.51 m，最多 12 个相交依赖；超限或缺失依赖时保留原所有权标线。此实际对象 38 个标线网格已投影，无 merge-paint 回退 |
| 高架 `ew-wb-split` 及上述汇入匝道 | 桥底/侧边从最终裁剪铺面实体化，去除重复顶面；只在安全连续边界移除内部端盖；保留既有护栏、实例化立柱及桥墩 | 没有移动桥墩或改上下层道路高度；邻近未选中的旧高架仍可见原有条纹/接缝 |
| 地形适配 `v4-south-logistics-west` | 将现有 RegionalTerrainClearance 体积裁剪接入城市地面与区域地形，消除负高程路面及人行道被草地覆盖 | 只裁剪所选结构的干涉体积，保留外围地形、建筑、物件；不改地形采样和物理接触面 |

地形裁剪按左右 EdgeChain 的原三角形对角线建立斜平面，避免以中心线平均高度处理横坡和纵坡。已低于路面偏移 0.02 m 的地形直接保留，路面偏移仍为 0.024 m，不对隐藏地面做无效细分。隧道只裁剪路面到顶板外表面之间的体积，保留顶板以上地形。

## 新旧截图与入口

- [七组截图画廊](../artifacts/road-geometry-round4/comparison.html)：14 张真实 WebGL 静态截图，Round 3 冻结源码与 Round 4 使用相同对象、相机、材质和光照设置。
- [原始截图与静态几何统计](../artifacts/road-geometry-round4/static-captures.json)：14 个条目，截图错误为 0。
- [本地开发预览](http://127.0.0.1:5195/scripts/road-geometry-round4.html)：可切换场景及前后实现。重新启动命令为 `node scripts/road-geometry-round4-server.mjs`。

截图从完整正式地图运行时选择相机附近道路、实际建筑/物件和完整相关地形扇区，不另造测试道路、不删除遮挡物。它是局部静态结构预览，不是完整游戏驾驶、Sector 连续重载或帧率验收。旧源码冻结于本轮开始前的 `.tmp-road-geometry-round3/`，不是 Git HEAD 中更早的代码。

静态预览直接渲染 Builder 的 Mesh 阴影标志；生产 Worker 按材质合批仍沿用原阴影合同。因此截图中的围护结构明暗变化不能作为生产分块阴影已经同步的证明，本轮没有增加生产阴影 pass。

## 开销估算

以下是上述静态场景中实际创建的几何与唯一属性/索引数组字节数，不是 GPU 实际提交量、总显存、Draw Calls、JS Heap 或 FPS 测量。场景包含周边旧版道路、物件和地形，不能将差额全部算作单条道路成本。

| 静态场景 | Mesh 数：前 / 后 | 三角形：前 / 后 | 唯一几何数组差额 KiB | 材质数：前 / 后 |
|---|---:|---:|---:|---:|
| 地下通道 | 695 / 695 | 50,609 / 55,458 | +255.7 | 15 / 15 |
| 下沉进口 | 476 / 476 | 45,865 / 50,714 | +255.7 | 15 / 15 |
| 交通岛路口 | 348 / 348 | 12,989 / 13,027 | +16.0 | 12 / 12 |
| 六进口分离路口 | 823 / 823 | 38,658 / 38,658 | 0 | 13 / 13 |
| 异宽汇入 | 298 / 298 | 58,826 / 61,136 | +113.9 | 9 / 9 |
| 多层高架 | 1,133 / 1,133 | 180,236 / 180,232 | +4.0 | 13 / 13 |
| 地形干涉路段 | 701 / 701 | 62,877 / 65,581 | +269.2 | 12 / 12 |

同材质、同 Mesh 数没有新增材质分组，预计不会因本轮机制明显增加正常 pass 的批次数；这不是实际 Draw Calls 验收。增加的顶点上传、裁剪和法线计算仍有 CPU/GPU 成本，尤其地下通道及下沉进口这组场景增加约 4,849 个三角形，尚未取得新的加载耗时证明。

- 继续复用原 32 项 / 8 MiB 编译缓存，没有缩小或扩大缓存来制造数据变化；几何算法修订号更新为 `continuous-v4`。
- 新汇入投影索引也计入原有 LRU，不永久持有全部相邻道路；临时铺面创建后释放，重复护栏立柱沿用 InstancedMesh。
- 地形裁剪索引按 100 m 空间桶查询，只包含原洞口体积与当前显式选择，生命周期跟随地图/Manager/Worker；不收集已卸载 Sector 几何。
- 主线程和 Worker 各自构造一次索引，同一个 Manager 内城市及区域地形共用它。主/Worker 存在各自的少量索引内存，不冒称零成本。
- 地面 near/far 及 Worker 编译均接入同一裁剪参数；没有每帧几何生成、全图遍历、新的动态碰撞体、额外 SSR 或反射 pass。
- 既有 Sector 几何发布、按材质批处理和卸载释放路径保留。本轮只核对接线与资源所有权，没有重新运行 Round 2–3 的生命周期基准。

## 检查记录

读取并沿用 [Round 1](ROAD_GEOMETRY_TRIAL_2026-11-06.md)、[Round 2](ROAD_GEOMETRY_ROUND2_2026-11-06.md)、[Round 3](ROAD_GEOMETRY_ROUND3_2026-11-06.md) 的对象、性能瓶颈和未通过项；不把历史结果冒充本轮测量。

- 新增结构的局部检查通过：[local-checks.json](../artifacts/road-geometry-round4/local-checks.json)，492 项，多数为五条实际道路生成 Mesh 的有限坐标检查；另查顶板朝内法线、岛体脚印面积、真实地形干涉点与保留覆土。没有重做几何散列或碰撞包络断言。
- 后续将地形高度细化为原三角平面并跳过已低于铺面的地形；最终代码完成七组静态截图，错误记录为空，没有再次重跑上述整组检查。
- 汇入的单次元数据复核：[merge-ownership.json](../artifacts/road-geometry-round4/merge-ownership.json)，实际 38 个网格采用新投影，组件回退为空。
- 相关类型检查 `tsc --noEmit -p scripts/road-geometry-round4.tsconfig.json`：修复预览统计代码的类型错误后通过。之后的局部地形细化由 Vite 编译并实际渲染，未追加类型检查轮次。
- 最后运行差异空白检查及正式地图文件完整性检查，结果见 [ending-worktree.json](../artifacts/road-geometry-round4/ending-worktree.json)。文件完整性检查用于保护地图，不是几何散列对照测试。
- 未运行完整测试、build/release、驾驶采样、Node Worker 基准、性能 A/B、强制 GC；没有 commit/push。

## 修改文件

运行时代码（与本轮开始前源码相比，共 11 个）：

- `src/world/city/ContinuousRoadGeometry.ts`：可选端盖、桥底实体化选项。
- `src/world/city/JunctionSurface.ts`：复用铺面排除裁剪入口。
- `src/world/city/RoadGeometryTrial.ts`：围护组件独立升级、岛体排除、汇入标线依赖和桥底边界。
- `src/world/city/RoadGeometryTrialCache.ts`：算法版本号。
- `src/world/city/RoadBuilder.ts`：围护组件接入，路面回退独立保留。
- `src/world/city/CityGroundGeometry.ts`、`src/world/city/CityGround.ts`：城市地面视觉裁剪。
- `src/world/city/SectorManager.ts`、`src/world/city/VisualStreaming.worker.ts`：复用同一份裁剪参数，保留现有分块生成/卸载。
- `src/world/regional/RegionalTerrainClearance.ts`、`src/world/regional/RegionalTerrain.ts`：既有洞口裁剪扩展为所选道路体积裁剪。

新增开发工具：`scripts/road-geometry-round4-data.ts`、`road-geometry-round4-server.mjs`、`road-geometry-round4.html`、`road-geometry-round4.ts`、`road-geometry-round4.tsconfig.json`、`inspect-road-geometry-round4.mjs`、`check-road-geometry-round4.mjs`；报告及截图位于本文件和 `artifacts/road-geometry-round4/`。

`IntersectionBuilder.ts` 以及 Round 1–3 的其他既有未提交修改没有被本轮覆写。开始/结束边界记录只列本轮实际差额，不能用整个 `git diff` 将此前工作算作 Round 4。

## 回退、未验证项与下一步白名单

**继续旧版：** 无显式铺面边界的 gore、缺失依赖或依赖超限的汇入标线、非平坦或无轮廓的交通岛、超出现有墙体支撑的路面/人行道、无物理支撑的抬高路缘和路口收口。复杂分叉、异宽结构衔接不取消封盖，不通过猜测邻接移动几何。

**仍有问题：** 地下通道的原人行道与墙体位置合同不一致；本轮仅补齐壳体。桥墩与其他建筑/地面道路的全面冲突分析、未选中高架旧接缝、任意复杂自交/凹多边形 fan 重建、生产分块阴影、最终代码的真实驾驶及 Sector 重载表现均未新验收。没有移动碰撞体或隐藏道路来绕过这些问题。

**建议下一步逐对象扩大：** 优先选择已有正确轮廓的平坦交通岛路口、单一等宽连续且净空明确的隧道围护、显式主路/决策路齐全且重叠依赖不超过 12 个的匝道。本轮仅使原白名单中的这些组件可用；其他对象仍需要逐个审查。非平面交通岛、复杂分叉洞口、需要移动桥墩或增加真实路缘碰撞的对象继续保留旧版。

Round 3 尚未确认的浏览器性能推广门槛依旧存在；本轮按要求不重复采样，因此这些结构改进不能单独作为全图推广许可。
