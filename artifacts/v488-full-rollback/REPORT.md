# City Main v488 完整回退：恢复精确 v486 基线

## 结论

v487/v488 地图、道路/铺装、设施、隔离、标线和路牌生成/渲染改动已完整撤回，实际地图恢复 **v486**。源JSON与保存的v486快照及Git基线逐字节一致；没有保留任何“看起来成功”的v488地图修改，也没有只改版本号。

**G17 17→18 在纯v486上仍复现，未达到连续接地验收。** 两份用户v488黑匣子对应的车辆、速度和位置用于独立短脚本；恢复后依旧出现同一路段、零高差、近竖直法线的 unreachable-layer-switch，前轴先失去支撑、后轴随后失去支撑，出现四轮离地。按用户要求，本轮不继续修地图、车辆或支撑算法，保留原始证据独立报告。

## 基线与撤回范围

基线commit：`28c42e2fd54b8b6eb768d43a7e2e80f0082768d1`（28c42e2）；Git内地图版本为486。v487/v488没有单独commit，都是相对此提交的工作区改动。独立保存的 artifacts/interchange-integrated-audit/baseline-map.json 与Git地图blob完全一致。

恢复9个已有文件：

- src/world/regional/regional-main.json（恢复Git原始字节）
- src/world/city/MarkingOwnership.ts（恢复Git原始字节）
- src/world/city/RoadBuilder.ts（恢复Git原始字节）
- src/world/city/RoadInfrastructure.ts（恢复Git原始字节）
- src/world/city/RoadSignRenderer.ts（恢复Git原始字节）
- src/world/city/RoadsidePlacement.ts（恢复Git原始字节）
- src/world/regional/FastRoadSignPlacement.ts（恢复Git原始字节）
- scripts/run-east-interchange-contact-selftest.ts（恢复Git原始字节）
- scripts/run-ramp-profile-runtime.ts（恢复Git原始字节）

从活动src/scripts撤下58个v487/v488新增文件，包含 RoadCarriageway.ts 及互通设计、carriageway/median、标线/平整度改造、设施重投影和相关审计脚本。它们保存在 retired-v487-v488-code/，不参与构建。完整路径和前后hash见 restoration-manifest.json。原v488报告保留为历史记录，游戏不会加载其中的候选地图。

实际撤回190条道路差异、19个object、501块sign，共520个唯一设施实例，以及3个connectionPort差异。道路XZ/Y/control points、曲率、profile、ramp、共享铺装、ribbon support批量启用、相关metadata和设施引用全部恢复；intersections/roadLinks原来没有差异，逐结构确认保持基线。没有做手工反向道路修改。

## 路牌完整回退

RoadSignRenderer.ts 已恢复v486 Git原始字节：牌面、背板、支架重新使用v486的 MeshBasicMaterial；牌面恢复 toneMapped:false；撤回上一轮 MeshLambertMaterial 修改。模板、尺寸、门架/立柱、碰撞模板、SignData、placement和所有实例均按v486恢复或确认原本未改。门架改吊挂、脚基修正、标牌/路灯移动、路灯肩部生成及新的median规则全部撤回；没有保留视觉优化。

## 地图与生成逻辑一致性

| 内容 | v486基线 | 恢复后 |
|---|---|---|
| 地图版本 | 486 | 486 |
| roads | 2944 | 2944，完整数据相同 |
| intersections | 302 | 302，完整数据相同 |
| objects | 7103 | 7103，完整数据相同 |
| signs | 3057 | 3057，完整数据相同 |
| roadLinks | 2579 | 2579，完整数据相同 |
| connectionPorts | 71 | 71，完整数据相同 |
| 其余全部顶层数据 | 基线 | 所有字段相同 |

基线SHA256 → 恢复源SHA256：

`ad647d198bae65ac1e334cb40a56e0028f7fad453a27f8852d39fb57dbec6e76`

→ `ad647d198bae65ac1e334cb40a56e0028f7fad453a27f8852d39fb57dbec6e76`

**有意地图/设施差异：0。未恢复差异：0。** 全部顶层字段、道路支撑metadata、junction、环境、导航拓扑及设施分别记录结构hash；见 baseline-consistency.json 和 restoration-manifest.json。相关生成/渲染已有文件也逐字节恢复；CityGround、RoadPavementSurface、RoadEdgeChain、SectorManager及sign模板等未改文件验证保持原样，新增carriageway实现已撤下。

## 明确保留的功能

741个非本次撤回文件在操作前后逐文件SHA256一致，包括车辆物理、电控、垂向动力学、unsprung mass/tyre radial compliance、Wheel Support Selection v2、same-tick rejection latch、structural-layer classification、mechanical eligibility、Black Box，以及导航、v486多途经点、F10大地图和导航UI。没有恢复更老提交、没有git reset、没有覆盖这些功能。工作区原有4个无关未跟踪源文件也保持不变，路径/hash列于一致性记录。

## 指定轻量验证

只运行短回放、Support Continuity、waypoint targeted和typecheck；未运行全图审计、full core、全车型、editor全量或computer-use。

- Support Continuity：987断言通过，988次查询，Black Box root episodes=4，droppedEvents=0。
- Navigation waypoint targeted：35断言通过，包含多个途经点顺序、距离、途经点完成、偏航重规划保留未访问途经点、不可达层级及禁止虚构掉头。v486多途经点代码前后hash一致。未跑全图导航几何扫描。
- typecheck：通过。

| 短回放 | km/h | rejection采样数 | 四轮airborne tick | mechanical impulse峰值 | safety/recovery | 结果 |
|---|---:|---:|---:|---:|---|---|
| G17-17-18-1 | 145.82 | 62 | 45 | 651.870 | 0/0 | FAIL：v486仍复现 |
| G17-17-18-2 | 148.99 | 58 | 44 | 564.079 | 0/0 | FAIL：v486仍复现 |
| highway-flat | 100.00 | 0 | 0 | 0.000 | 0/0 | PASS |
| expressway-elevated-flat | 90.00 | 0 | 0 | 0.000 | 0/0 | PASS |

G17两组均实际跨过四个轮位的segment17→18；边界x≈3429.75，heightDelta=0、normal=(0,1,0)。使用Touareg road-suv-v6-8at，145.82/148.99km/h，按用户两份记录的横向位置/航向，36m短回放，120Hz；静置1秒建立实际悬架状态，然后只规定纵向速度，车身heave/pitch/roll自由积分、真实collider保留、没有替换支撑选择。两组机械冲量峰值651.870/564.079，safety/recovery均0。G17道路定义本身在v486和v488完全一致；本次结果证明纯回退不能消除这个事故，尚未在此任务推定更细根因。逐tick四轮记录和新黑匣子见 G17-17-18-1/2.json、对应-blackbox.json；输入文件及hash见 input-blackbox-evidence.json。

高速平路：regional:G17:out，100km/h，28m，四轮连续接地，rejection/impulse/safety/recovery均0，RMS aY=0.117600、peak=0.259611m/s²。快速路高架：regional:S68:out，90km/h，32m桥面高程，28m回放，同样四轮连续接地且上述异常均0，RMS aY=0.109228、peak=0.256274m/s²。

东侧A-B-A：采用已有事故回放的正确进场/spawn及完整关联道路，615tick，实际事故处73.4206km/h；invalidABA=0、rejection=0、机械冲量=0、safety=0、recovery=0，合法匝道进入=true、进入匝道后错误返回主线=0，**通过**。该既有支撑回归按原协议排除实体护栏碰撞，保留真实支撑面和算法；静态接地没有被脚本强制。最初另写的零世界Y静置脚本未正确建立高架进场、采到了桥下平面，判为无效测试设置而非回归结论，完整保留在 initial-solid-east-replay/；最终采用已有协议，不通过改地图或放宽阈值使其通过。

## Build与dist

本轮仅执行一次 `pnpm run build -BasicValidation`，exit 0；typecheck和生产构建成功，dist已原子发布。当前入口 `assets/index-Ckbko7pd.js`，实际引用 `dist/assets/city-main.runtime-1aac2465f77e.json`，地图 **v486**。

运行时SHA256：`1aac2465f77ee752af969a0d900ef91b1dd01cee8d35a4296b0fd5c3df1b4ef6`，与文件名hash一致；完整运行时JSON与最终源的生产编译结果逐字节哈希一致，覆盖道路、junction、设施及导航网络。所有恢复文件和741个保护文件在构建后再次验证hash一致。当前入口及其可达JS依赖不引用旧v488的 b0fb53b4186e 地图或 index-Dnrt8L7J.js。旧散列文件按发布机制可能留存以服务旧标签页，但当前入口不会请求它们；已打开的游戏需刷新/重新打开以采用新入口。未控制浏览器或清理其私有缓存。

仅存在Vite大包体积提示；没有运行full core/全车型/editor全量。G17回归失败按用户政策单独记录，构建成功不表示该事故已修复。完整记录见 build-verification.json。
