# City Main v493 长距离高速与分块加载验证

日期：2026-10-24。菜单 City Main 的区域地图已更新为 v493；浏览器可玩版已构建。本轮按要求没有发布正式 EXE，外部 Windows 包仍为 v492。

| 新增长走廊 | 长度 | 覆盖 sector（500m） |
| --- | --- | --- |
| G17 滨海延伸 | 32.34km | 71 |
| G42 内陆延伸 | 30.40km | 75 |
| S32 东岭滨海联络高速 | 11.64km | 25 |

从既有 G17/G42 东侧终点延伸，利用旧区域边界外的空地。两个完整高速枢纽、两个菱形出口，共 24 条新匝道；原 v492 的道路、连接、路口、物件、路牌记录保持不变。现地图为 3288 条道路、306 个路口、7153 个物件、3137 个路牌。

海岸使用低频控制点与平顺地形过渡。海面由 sector tile 和共享灰蓝材质构成，开阔海面每块仅 2 个三角形，无反射/折射/FFT；沿线约 8.2km 的采样路段具有无遮挡海景。旧河水外观保留，近中景水面随 sector 驻留，廉价远景合批作为 fallback。

80/120/160km/h × 三条走廊，以及滨海反向加载焦点，共 10 组全部通过；到达时道路/地形未 ready 为 0，物理碰撞体同步补建为 0。峰值 active 62 / 全图 9792 sectors，行程中正常卸载。370 处道路 sector seam 和超过 954868 次实际地形共享边比较通过；五条长距离导航确认可达，跨走廊路径确实经过 S32；9 个代表性物理接口回放通过。

测试使用实际浏览器 Worker、SectorManager 与 CityPhysicsSectors，按速度分配准备时间并跳过空闲等待；它不代替人工驾驶或 GPU 帧率测试。最大 sector 发布延迟约 4.147s，含首次冷准备的主线程最大单步约 218.9ms；F10 全图绘制约 29.1–89.3ms。保留 CPU 编译计划/廉价远景缓存，堆采样存在增长与 GC 回落，尚未证明长期内存平坦。仅将不可中断的远景 Worker 批量从 8 缩至 2，以便前景请求更快获得优先执行。

本轮唯一一次 `pnpm run build -BasicValidation` 成功，dist 使用 `assets/city-main.runtime-b8ec666445f0.json`。Map 校验 0 errors、36 warnings，包含 8 个明确预留的外围端口；未运行全核心、全系统或全车型测试。

详细布局、速度矩阵和限制见 [完整报告](../artifacts/highway-extension-streaming-test/REPORT.md)、[专项汇总](../artifacts/highway-extension-streaming-test/validation.json)、[加载数据](../artifacts/highway-extension-streaming-test/streaming-stress.json)、[构建记录](../artifacts/highway-extension-streaming-test/build-result.json)。先前匝道结构收尾证据仍见 [v492 记录](FINAL_RAMP_CLEANUP_2026-10-24.md)。
